import { createCombatStateReader } from '@leyline/engine';
import { definitionKey, type CalculationBinding, type CalculationBundle, type CombatConditions, type CombatStateField, type DamageRequest, type Project, type Value, type ValueType } from '@leyline/schema';
import { nextRecordId } from './workbench-project';

export interface CalculatorFactSetting { key: string; value: Value }
export interface CalculatorFactField { key: string; type: ValueType }
export function calculatorIntervals(project: Project, actor: string, timeMs: number, recordId?: string): CombatConditions {
  if (!project.combatStates?.length) return {};
  return createCombatStateReader(project)(actor, { actor, id: recordId ?? nextRecordId(project), timeMs, kind: 'damage' }).conditions;
}
export function withCurrentConditions(damage: DamageRequest, intervals: CombatConditions, actorId: string): DamageRequest {
  const scoped = damage.stateOverrides?.find(entry => entry.actor === actorId);
  return { ...damage, conditions: { ...intervals, ...damage.conditions, ...scoped?.values } };
}
export function ownerFactFields(binding?: CalculationBinding): CalculatorFactField[] {
  if (binding?.kind === 'formula') return Object.values(binding.inputs).flatMap(ownerFactFields);
  return binding?.kind === 'fact' && binding.scope === 'owner' ? [{ key: binding.key, type: binding.type }] : [];
}

/** Only facts uniquely implied by an explicit choice. Alternatives and open ranges stay editable. */
export function selectionFacts(binding: CalculationBinding | undefined, bundle: CalculationBundle, active = true): CalculatorFactSetting[] {
  if (!binding) return [];
  if (binding.kind === 'fact' && binding.scope === 'owner' && binding.type.kind === 'boolean') {
    return [{ key: binding.key, value: { kind: 'boolean', value: active } }];
  }
  if (binding.kind !== 'formula') return [];
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!template) return [];
  if (template.id === 'condition-group') {
    const required = active !== template.negate;
    if (template.terms === 1 || required === (template.operator === 'all')) {
      return Object.values(binding.inputs).flatMap(term => selectionFacts(term, bundle, required));
    }
    return [];
  }
  if (template.id !== 'enum-condition' && template.id !== 'quantity-condition') return [];
  const input = binding.inputs[template.input];
  if (input?.kind !== 'fact' || input.scope !== 'owner') return [];
  if (template.id === 'enum-condition' && input.type.kind === 'enum') {
    const candidates = input.type.values.filter(value => (value === template.equals) === active);
    return candidates.length === 1 ? [{ key: input.key, value: { kind: 'enum', value: candidates[0] } }] : [];
  }
  if (template.id === 'quantity-condition' && template.relation === 'eq' && active && input.type.kind === 'quantity') {
    return [{ key: input.key, value: { kind: 'quantity', unit: input.type.unit, value: template.threshold } }];
  }
  return [];
}

export function stackChoice(binding: CalculationBinding, bundle: CalculationBundle) {
  if (binding.kind !== 'formula') return;
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (template?.id !== 'linear-bonus' || template.inputUnit !== 'count' || !template.maxInput) return;
  const input = binding.inputs[template.input];
  if (input?.kind === 'fact' && input.scope === 'owner') return { key: input.key, max: template.maxInput };
}

/** The displayed HP preset is a trial value. Keep any entered HP that already activates the rule. */
export function hpChoice(binding: CalculationBinding | undefined, bundle: CalculationBundle) {
  if (binding?.kind !== 'formula') return;
  const rule = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!rule || !('input' in rule)) return;
  const input = binding.inputs[rule.input];
  if (input?.kind !== 'fact' || input.scope !== 'owner' || input.key !== 'hpRatio') return;
  if (rule.id === 'conditional-bonus' && (rule.otherwise !== 0 || rule.value === 0)) return;
  if (rule.id !== 'threshold-condition' && rule.id !== 'quantity-condition' && rule.id !== 'conditional-bonus' && rule.id !== 'bounded-stat-bonus') return;
  const relation = rule.id === 'bounded-stat-bonus' ? 'gt' : rule.relation;
  const preset = relation === 'gt' || relation === 'gte' ? 1 : relation === 'lt' ? rule.threshold / 2 : rule.threshold;
  if (preset < 0 || preset > 1 || relation === 'gt' && preset <= rule.threshold || relation === 'lt' && preset >= rule.threshold) return;
  return { relation, threshold: rule.threshold, preset };
}

export function hpMatches(choice: NonNullable<ReturnType<typeof hpChoice>>, value: ReturnType<typeof trialValue>) {
  if (typeof value !== 'number') return false;
  switch (choice.relation) {
    case 'gt': return value > choice.threshold;
    case 'gte': return value >= choice.threshold;
    case 'lt': return value < choice.threshold;
    case 'lte': return value <= choice.threshold;
    case 'eq': return value === choice.threshold;
  }
}

export function trialValue(damage: DamageRequest, key: string) {
  if (damage.facts && Object.hasOwn(damage.facts, key)) return damage.facts[key].value?.value;
  if (key === 'onField' || key === 'shielded' || key === 'hpRatio') return damage.conditions?.[key];
}

export function setTrialCondition(damage: DamageRequest, actorId: string, field: CombatStateField, value: number | boolean | null) {
  const scoped = damage.stateOverrides?.find(entry => entry.actor === actorId && Object.hasOwn(entry.values, field));
  if (scoped) scoped.values = { ...scoped.values, [field]: value };
  else damage.conditions = { ...damage.conditions, [field]: value };
  if (damage.facts) delete damage.facts[field];
}
export function setTrialFact(damage: DamageRequest, { key, value }: CalculatorFactSetting, actorId: string) {
  if ((key === 'onField' || key === 'shielded') && value.kind === 'boolean' || key === 'hpRatio' && value.kind === 'quantity') {
    setTrialCondition(damage, actorId, key, value.value);
  } else {
    damage.facts = { ...damage.facts, [key]: { value, provenance: 'explicit', sourceRefs: [] } };
  }
}
