import { expression } from '@leyline/schema/buffs';
import { hitBindings, ordinaryHitInvocation } from '@leyline/schema/hit-bindings';

/** Assemble the common damage inputs once per requested hit. */
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const owner = { role: 'owner' };
const current = { kind: 'current', phase: 'same' };
const scalar = { kind: 'quantity', unit: 'scalar' };
const formula = (id, inputs, output = 'value') => ({ kind: 'formula', formula: ref(id), inputs, output });

export function assembleHit(hit, skillId, branches, facts = {}) {
  const { base: scaling, ...fields } = hit;
  const captured = hit.snapshot?.attributes ?? [];
  const attribute = stat => ({ kind: 'attribute', actor: owner, key: ref('attribute.' + stat),
    at: captured.includes(stat) ? { kind: 'capture', slot: 'panel' } : current });
  const captures = hit.snapshot ? [{ id: 'panel', sourceSkillId: hit.snapshot.sourceSkillId,
    attributes: captured.map(stat => ref('attribute.' + stat)), allowedPhases: ['before', 'after'] }] : [];
  const invocation = (binding, predicate) => ({ formula: binding.formula, bindings: binding.inputs,
    output: binding.output, captures, ...(predicate ? { predicate } : {}) });
  if (Array.isArray(scaling) && (scaling.length < 1 || scaling.length > 128)) throw new Error(hit.id + ': unsupported scaling terms');
  const terms = (Array.isArray(scaling) ? scaling : []).map(term => {
    if ((term.parameter !== undefined) === (term.ratio !== undefined)) throw new Error(hit.id + ': specify one multiplier');
    const ratio = term.parameter !== undefined ? { kind: 'talent-parameter', actor: hit.coordinated ? { role: 'contributor' } : owner, skillId: term.skill ?? skillId, parameterId: term.parameter, type: scalar }
      : { kind: 'constant', value: { ...scalar, value: term.ratio } };
    const inputs = { attribute: attribute(term.stat), ratio };
    if (term.count) inputs.count = { kind: 'fact', scope: 'query', key: term.count, type: { kind: 'quantity', unit: term.countUnit ?? 'count' } };
    return formula(term.formula ?? term.stat + (term.count ? '-counted' : '') + '-damage-base', inputs, 'base');
  });
  // Each library sum has at most nine input ports. Group longer ordered bases without dropping terms.
  function sum(values) {
    if (values.length === 1) return values[0];
    if (values.length <= 9) return formula('damage-sum-' + values.length,
      Object.fromEntries(values.map((value, index) => ['term' + index, value])), 'base');
    const groups = [];
    for (let i = 0; i < values.length; i += 9) groups.push(sum(values.slice(i, i + 9)));
    return sum(groups);
  }
  const base = invocation(Array.isArray(scaling) ? sum(terms) : expression({ call: scaling.template, inputs: scaling.inputs, output: scaling.output }, facts));
  function assembleOutput(output) {
    const { condition } = output;
    const hitData = { ...hit, base };
    if (output.family === 'ordinary') return ordinaryHitInvocation(hitData, condition, true);
    const { attr, critFactor, resistanceFactor, skillBase } = hitBindings(hitData);
    if (output.family === 'resistance-only') return invocation(formula('product.damage', { basis: skillBase, rate: resistanceFactor }), condition);
    const stellar = output.family === 'stellar-swirl' || output.family === 'stellar-conduct';
    const special = stat => attr('reaction.' + (stellar ? output.family : 'lunar') + '.' + stat);
    const inputs = { scaledBase: skillBase, em: attribute('elementalMastery'), reactionBaseBonus: special('baseBonus'),
      reactionBonus: special('damageBonus'), flatBaseBonus: special('flatBaseBonus'), critFactor, resistanceFactor };
    let result;
    if (stellar) {
      result = formula(output.family + '-direct', { ...inputs,
        scaledBase: formula('product.damage', { basis: skillBase, rate: special('baseMultiplier') }),
        ...(output.family === 'stellar-conduct' ? { baseMultiplier: attr('baseMultiplier'),
          reactionCoefficient: formula('stellar.attach-coefficient', {
            count: { kind: 'fact', key: 'stellarAttachments', scope: 'query', type: { kind: 'quantity', unit: 'count' } } }) } : {}),
        elevationFactor: formula('stellar-elevation-factor', { input: special('elevation') }) });
    } else {
      result = formula(output.family + '-direct', { ...inputs, elevationFactor: special('elevationFactor') });
    }
    return invocation(result, condition);
  }
  return { ...fields, base, origin: hit.origin ?? 'talent', damage: Object.fromEntries(branches.map(branch => [branch.family, assembleOutput(branch)])) };
}
