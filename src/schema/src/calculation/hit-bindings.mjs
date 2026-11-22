const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const current = { kind: 'current', phase: 'same' };
const reactions = { physical: [], anemo: [], geo: [], cryo: ['melt'], pyro: ['melt', 'vaporize'], hydro: ['vaporize'], electro: ['aggravate'], dendro: ['spread'] };
export function ordinaryReactions(element) { return reactions[element] ?? []; }
export const absorbedElements = ['pyro', 'hydro', 'electro', 'cryo'];
export function partyPriorityElement(elements) {
  const present = [...elements], first = absorbedElements.find(element => present.includes(element));
  return first === 'pyro' || present.every(Boolean) ? first ?? 'anemo' : null;
}
export function resolveHitElement(hit, value, team = [], infused) {
  if (hit.infusion && infused === true) return { element: hit.infusion.element };
  if (hit.elementBy === 'strikingHand' || hit.elementBy === 'partyPriorityElement') {
    if (hit.elementBy === 'strikingHand' && value?.value === 'left') return { element: hit.element };
    const right = partyPriorityElement(team);
    if (hit.elementBy === 'strikingHand' && value?.value !== 'right' && right !== hit.element) {
      return { element: hit.element, missing: 'strikingHand' };
    }
    return right === null ? { element: hit.element, missing: 'partyPriorityElement' } : { element: right };
  }
  return { element: hit.elementBy === 'absorbedElement' && value?.kind === 'enum' && absorbedElements.includes(value.value) ? value.value : hit.element };
}
export function effectiveHitElement(hit, value, team = [], infused) {
  return resolveHitElement(hit, value, team, infused).element;
}
export function authoredHitEntries(metadata, skillId) {
  const i = metadata.talents.findIndex(talent => talent.id === skillId);
  if (i < 0) return [];
  const rows = metadata.talents[i].hits.map((hit, j) => ({ hit, field: '/talents/' + i + '/hits/' + j }));
  for (const [group, state] of [['passives', 'ascension'], ['constellations', 'constellation']]) {
    for (const [index, owner] of metadata[group].entries()) for (const [j, hit] of (owner.hits ?? []).entries()) {
      if (hit.skill !== skillId) continue;
      const rank = state === 'ascension' ? owner.unlockAscension ?? 0 : owner.rank;
      rows.push({ hit, field: '/' + group + '/' + index + '/hits/' + j, unlock: { state, rank } });
    }
  }
  return rows;
}
export function authoredHit(metadata, skillId, hitId) {
  return metadata && skillId && hitId ? authoredHitEntries(metadata, skillId).find(row => row.hit.id === hitId)?.hit : undefined;
}
export function hitInvocations(hit) {
  const all = [hit.base, ...Object.values(hit.damage)];
  if (hit.infusion && hit.damage.ordinary) all.push(ordinaryHitInvocation({ ...hit,element:hit.infusion.element },hit.damage.ordinary.predicate));
  if ((hit.elementBy || hit.coordinated) && hit.damage.ordinary) for (const element of hit.coordinated ? Object.keys(reactions) : absorbedElements) {
    all.push(ordinaryHitInvocation({ ...hit, element }, hit.damage.ordinary.predicate));
  }
  return all;
}
/** Bind declared hit data to fixed formula inputs. */
export function combatDamageBindings(element, captures = []) {
  const attr = stat => {
    const key = ref('attribute.' + stat);
    const capture = captures.find(slot => slot.attributes.some(attribute => attribute.id === key.id));
    return { kind: 'attribute', actor: { role: 'owner' }, key, at: capture ? { kind: 'capture', slot: capture.id } : current };
  };
  const target = stat => ({ kind: 'enemy', key: ref('target.' + stat), at: current });
  const call = (id, inputs, output = 'value') => ({ kind: 'formula', formula: ref(id), inputs, output });
  const mode = (key, values) => ({ kind: 'fact', scope: 'query', key, type: { kind: 'enum', values } });
  const critFactor = call('crit-selected', { mode: mode('critMode', ['noncritical', 'critical', 'expected']),
    critRate: attr('critRate'), critDamage: attr('critDamage') });
  const resistanceFactor = call('resistance', { resistance: target('resistance.' + element) });
  return { attr, call, critFactor, resistanceFactor, target, mode };
}

export function hitBindings({ element, base }) {
  return { ...combatDamageBindings(element, base.captures),
    skillBase: { kind: 'formula', formula: base.formula, inputs: base.bindings, output: base.output } };
}

export function ordinaryHitInvocation(hit, predicate) {
  const { element, base } = hit;
  const { attr, target, call, mode, skillBase, critFactor, resistanceFactor } = hitBindings(hit);
  const reaction = { mode: mode('reactionMode', ['none', ...reactions[element]]), em: attr('elementalMastery'),
    levelMultiplier: call('reaction-level-multiplier', { level: attr('level') }),
    amplifyingBonus: attr('amplifyingReactionBonus'), additiveBonus: attr('additiveReactionBonus') };
  const reactionId = element + '-ordinary-reaction';
  return { formula: ref('ordinary-hit'), output: 'value', captures: base.captures, ...(predicate ? { predicate } : {}),
    bindings: {
      skillBase, baseMultiplier: attr('baseMultiplier'), preReactionFlat: attr('baseDamageBonus'),
      additiveReactionBase: call(reactionId, reaction, 'added'), amplificationFactor: call(reactionId, reaction, 'multiplier'),
      ordinaryBonusMinusReduction: call('ordinary-bonus', { elementBonus: attr(element + 'Bonus'), hitBonus: attr('damageBonus'), targetReduction: target('ordinaryDamageReduction') }),
      critFactor, defenseFactor: call('defense', { characterLevel: attr('level'), enemyLevel: target('level'), reduction: target('defenseReduction'), ignore: attr('defenseIgnore') }), resistanceFactor,
    } };
}
