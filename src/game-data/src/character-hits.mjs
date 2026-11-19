/** Assemble the common damage inputs once per requested hit. */
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const owner = { role: 'owner' };
const current = { kind: 'current', phase: 'same' };
const scalar = { kind: 'quantity', unit: 'scalar' };
const formula = (id, inputs, output = 'value') => ({ kind: 'formula', formula: ref(id), inputs, output });
const enumeration = (key, values) => ({ kind: 'fact', scope: 'query', key, type: { kind: 'enum', values } });
const enemy = id => ({ kind: 'enemy', key: ref('target.' + id), at: current });
const reactions = { physical: [], anemo: [], geo: [], cryo: ['melt'], pyro: ['melt', 'vaporize'], hydro: ['vaporize'], electro: ['aggravate'], dendro: ['spread'] };

export function assembleHit(hit, skillId) {
  const { scaling, outputs, ...fields } = hit;
  const captured = hit.snapshot?.attributes ?? [];
  const attribute = stat => ({ kind: 'attribute', actor: owner, key: ref('attribute.' + stat),
    at: captured.includes(stat) ? { kind: 'capture', slot: 'panel' } : current });
  const captures = hit.snapshot ? [{ id: 'panel', sourceSkillId: hit.snapshot.sourceSkillId,
    attributes: captured.map(stat => ref('attribute.' + stat)), allowedPhases: ['before', 'after'] }] : [];
  const invocation = (binding, predicate) => ({ formula: binding.formula, bindings: binding.inputs,
    output: binding.output, captures, ...(predicate ? { predicate } : {}) });
  if (!Array.isArray(scaling) || scaling.length < 1 || scaling.length > 2) throw new Error(hit.id + ': unsupported scaling terms');
  const terms = scaling.map(term => {
    if ((term.parameter !== undefined) === (term.ratio !== undefined)) throw new Error(hit.id + ': specify one multiplier');
    const ratio = term.parameter !== undefined ? { kind: 'talent-parameter', actor: owner, skillId, parameterId: term.parameter, type: scalar }
      : { kind: 'constant', value: { ...scalar, value: term.ratio } };
    const inputs = { attribute: attribute(term.stat), ratio };
    if (term.count) inputs.count = { kind: 'fact', scope: 'query', key: term.count, type: { kind: 'quantity', unit: term.countUnit ?? 'count' } };
    return formula(term.formula ?? term.stat + (term.count ? '-counted' : '') + '-damage-base', inputs, 'base');
  });
  const base = terms.length === 1 ? terms[0] : formula('damage-sum-2', { term0: terms[0], term1: terms[1] }, 'base');
  function assembleOutput(output) {
    const { condition, ...identity } = output;
    const critFactor = formula('crit-selected', { mode: enumeration('critMode', ['noncritical', 'critical', 'expected']),
      critRate: attribute('critRate'), critDamage: attribute('critDamage') });
    const resistanceFactor = formula('resistance', { resistance: enemy('resistance.' + hit.element) });
    let result;
    if (output.family === 'ordinary') {
      const reaction = { mode: enumeration('reactionMode', ['none', ...reactions[hit.element]]), em: attribute('elementalMastery'),
        levelMultiplier: formula('reaction-level-multiplier', { level: attribute('level') }),
        amplifyingBonus: attribute('amplifyingReactionBonus'), additiveBonus: attribute('additiveReactionBonus') };
      const reactionId = hit.element + '-ordinary-reaction';
      result = formula('ordinary-hit', { skillBase: base, baseMultiplier: attribute('baseMultiplier'), preReactionFlat: attribute('baseDamageBonus'),
        additiveReactionBase: formula(reactionId, reaction, 'added'), amplificationFactor: formula(reactionId, reaction, 'multiplier'),
        ordinaryBonusMinusReduction: formula('ordinary-bonus', { elementBonus: attribute(hit.element + 'Bonus'), hitBonus: attribute('damageBonus'), targetReduction: enemy('ordinaryDamageReduction') }),
        critFactor, defenseFactor: formula('defense', { characterLevel: attribute('level'), enemyLevel: enemy('level'), reduction: enemy('defenseReduction'), ignore: attribute('defenseIgnore') }), resistanceFactor });
    } else if (output.family === 'stellar-swirl') {
      const special = stat => attribute('reaction.stellar-swirl.' + stat);
      result = formula('vesna.stellar-direct', { scaledBase: base, baseMultiplier: special('baseMultiplier'), reactionBaseBonus: special('baseBonus'),
        em: attribute('elementalMastery'), reactionBonus: special('damageBonus'), flatBaseBonus: special('flatBaseBonus'), critFactor, resistanceFactor,
        elevationFactor: formula('vesna.elevation-factor', { input: special('elevation') }) });
    } else throw new Error(output.id + ': unsupported output family ' + output.family);
    return { ...identity, origin: output.origin ?? 'talent', invocation: invocation(result, condition), coverageRefs: hit.coverageRefs };
  }
  return { ...fields, base: invocation(base), outputs: outputs.map(assembleOutput) };
}
