import { hitBindings, ordinaryHitInvocation } from '@leyline/schema/hit-bindings';

/** Assemble the common damage inputs once per requested hit. */
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const owner = { role: 'owner' };
const current = { kind: 'current', phase: 'same' };
const scalar = { kind: 'quantity', unit: 'scalar' };
const formula = (id, inputs, output = 'value') => ({ kind: 'formula', formula: ref(id), inputs, output });

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
  const base = invocation(terms.length === 1 ? terms[0] : formula('damage-sum-2', { term0: terms[0], term1: terms[1] }, 'base'));
  function assembleOutput(output) {
    const { condition, ...identity } = output;
    const hitData = { ...hit, base };
    if (output.family === 'ordinary') return { ...identity, origin: output.origin ?? 'talent', invocation: ordinaryHitInvocation(hitData, condition), coverageRefs: hit.coverageRefs };
    const { attr, critFactor, resistanceFactor, skillBase } = hitBindings(hitData);
    const special = stat => attr('reaction.' + (output.family === 'stellar-swirl' ? 'stellar-swirl' : 'lunar') + '.' + stat);
    const inputs = { scaledBase: skillBase, em: attribute('elementalMastery'), reactionBaseBonus: special('baseBonus'),
      reactionBonus: special('damageBonus'), flatBaseBonus: special('flatBaseBonus'), critFactor, resistanceFactor };
    let result;
    if (output.family === 'stellar-swirl') {
      result = formula('vesna.stellar-direct', { ...inputs, baseMultiplier: special('baseMultiplier'),
        elevationFactor: formula('vesna.elevation-factor', { input: special('elevation') }) });
    } else {
      result = formula(output.family + '-direct', { ...inputs, elevationFactor: special('elevationFactor') });
    }
    return { ...identity, origin: output.origin ?? 'talent', invocation: invocation(result, condition), coverageRefs: hit.coverageRefs };
  }
  return { ...fields, base, outputs: outputs.map(assembleOutput) };
}
