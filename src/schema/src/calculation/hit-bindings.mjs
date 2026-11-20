const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const current = { kind: 'current', phase: 'same' };
const reactions = { physical: [], anemo: [], geo: [], cryo: ['melt'], pyro: ['melt', 'vaporize'], hydro: ['vaporize'], electro: ['aggravate'], dendro: ['spread'] };
export const ordinaryTrialId = hitId => hitId + '.ordinary-trial';

export function canTryOrdinaryHit(talent, hit) {
  if (talent.noIndependentDamage || hit.outputs.length) return false;
  const parametersOf = bindings => Object.values(bindings).flatMap(binding => binding.kind === 'talent-parameter'
    ? [binding.parameterId] : binding.kind === 'formula' ? parametersOf(binding.inputs) : []);
  const parameters = new Set([hit.parameter, ...parametersOf(hit.base.bindings)].filter(Boolean));
  return !talent.details.some(detail => /[月星][·・]?(感电|绽放|结晶|扩散|超导)/u.test(detail.label)
    && [...detail.template.matchAll(/\{([^}:]+)(?::[^}]*)?\}/g)].some(match => parameters.has(match[1])));
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
