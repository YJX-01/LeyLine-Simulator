import { talentInputIssues, type DamageResult, type DamageScalingStat, type Talent } from '@leyline/schema';

/** Common base-damage formula; support auditing and combat multipliers belong to the caller. */
export function evaluateHitBase(talent: Talent, hitIndex: number, level: number, read: (stat: DamageScalingStat) => number | null, inputs: Record<string, number | null> = {}, constellation = 0) {
  const hit = talent.hits[hitIndex];
  const scaling: DamageResult['scaling'] = [];
  const unknownInputs: string[] = [];
  if (!hit || !Number.isInteger(level) || level < 1 || level > 15 || talentInputIssues(talent, inputs, constellation).length) return { value: null, scaling, invalid: true, unknownInputs };
  const parameter = (id: string) => {
    const value = talent.parameters.find(entry => entry.id === id)?.values[level - 1];
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
  };
  let invalid = false;
  for (const term of [{ stat: hit.scalingStat ?? 'attack', parameter: hit.parameter, count: undefined }, ...(hit.additionalScaling ?? [])]) {
    const multiplier = parameter(term.parameter);
    const count = term.count ? Object.hasOwn(inputs, term.count) ? inputs[term.count] : null : 1;
    if (term.count && !talent.inputs?.some(input => input.id === term.count)) invalid = true;
    if (term.count && count === null && !unknownInputs.includes(term.count)) unknownInputs.push(term.count);
    // A known zero contribution must not demand attributes from an inactive scaling term.
    const attribute = count === 0 || count === null ? null : read(term.stat);
    if (multiplier === null || (attribute !== null && (!Number.isFinite(attribute) || attribute < 0))) invalid = true;
    const product = multiplier !== null && count === 0 ? 0 : multiplier !== null && attribute !== null && count !== null ? multiplier * attribute * count : null;
    if (product !== null && !Number.isFinite(product)) invalid = true;
    scaling.push({ stat: term.stat, parameter: term.parameter, attribute, multiplier, contribution: product !== null && Number.isFinite(product) ? product : null,
      ...(term.count ? { count: { input: term.count, value: count } } : {}) });
  }
  const value = scaling.every(term => term.contribution !== null)
    ? scaling.reduce((total, term) => total + term.contribution!, 0) : null;
  if (value !== null && !Number.isFinite(value)) invalid = true;
  return { value: invalid ? null : value, scaling, invalid, unknownInputs };
}
