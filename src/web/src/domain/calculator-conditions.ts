import { createCombatStateReader, projectCastFact } from '@leyline/engine';
import { putHitFact, subjectFacts, definitionKey, type FactSubject, type CalculationBinding, type CalculationBundle, type CombatConditions, type CombatStateField, type DamageRequest, type Project, type Value, type ValueType } from '@leyline/schema';
import { nextRecordId } from './workbench-project';

export interface CalculatorFactSetting { key: string; value: Value; subject?: FactSubject }
export interface CalculatorFactField { key: string; type: ValueType; subject?: FactSubject }
export function calculatorIntervals(project: Project, actor: string, timeMs: number, recordId?: string): CombatConditions {
  if (!project.combatStates?.length && !project.timeline.some(r => r.fieldSwitch)) return {};
  const order = project.timeline.find(r => r.id === recordId)?.order;
  return createCombatStateReader(project)(actor, { actor, id: recordId ?? nextRecordId(project), order, timeMs, kind: 'damage' }).conditions;
}
export function calculatorOnFieldActor(project: Project, damage: DamageRequest, timeMs: number, recordId?: string) {
  const active = project.candidate.actors.filter(member => {
    const explicit = subjectFacts(damage.facts, { kind: 'actor', id: member.id })?.onField;
    return explicit ? explicit.value?.value === true : calculatorIntervals(project, member.id, timeMs, recordId).onField === true;
  });
  return active.length === 1 ? active[0] : undefined;
}
export function withCurrentConditions(damage: DamageRequest, intervals: CombatConditions, actorId: string): DamageRequest {
  const copy: DamageRequest = { ...damage, facts: damage.facts?.map(row => ({ ...row, values: { ...row.values } })) ?? [] };
  const own = subjectFacts(copy.facts, { kind: 'actor', id: actorId });
  for (const key of ['hpRatio', 'onField', 'shielded'] as const) if (intervals[key] !== undefined && !Object.hasOwn(own ?? {}, key)) {
    setCalculatorCondition(copy, actorId, key, intervals[key]!);
  }
  return copy;
}
function bindingSubject(scope: Extract<CalculationBinding, { kind: 'fact' }>['scope'], owner: string, recipient: string): FactSubject | undefined {
  if (scope === 'owner' || scope === 'recipient') return { kind: 'actor', id: scope === 'owner' ? owner : recipient };
  if (scope === 'query') return { kind: 'event' };
  if (scope === 'team') return { kind: 'team' };
  if (scope === 'target') return { kind: 'target', id: 'target' };
}
export function bindingFactFields(binding: CalculationBinding | undefined, owner: string, recipient: string): CalculatorFactField[] {
  if (binding?.kind === 'formula') return Object.values(binding.inputs).flatMap(term => bindingFactFields(term, owner, recipient));
  if (binding?.kind !== 'fact' || binding.at === 'source-event') return [];
  const subject = bindingSubject(binding.scope, owner, recipient);
  return subject ? [{ key: binding.key, type: binding.type, subject }] : [];
}

/** Only facts uniquely implied by an explicit choice. Alternatives and open ranges stay editable. */
export function selectionFacts(binding: CalculationBinding | undefined, bundle: CalculationBundle, active = true): CalculatorFactSetting[] {
  if (!binding) return [];
  if (binding.kind === 'fact' && binding.at !== 'source-event' && binding.scope === 'owner' && binding.type.kind === 'boolean') {
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

/** Keep an entered HP value when it already activates the selected rule. */
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

export function hpMatches(choice: NonNullable<ReturnType<typeof hpChoice>>, value: ReturnType<typeof calculatorFactValue>) {
  if (typeof value !== 'number') return false;
  switch (choice.relation) {
    case 'gt': return value > choice.threshold;
    case 'gte': return value >= choice.threshold;
    case 'lt': return value < choice.threshold;
    case 'lte': return value <= choice.threshold;
    case 'eq': return value === choice.threshold;
  }
}

export function calculatorFactValue(damage: DamageRequest, key: string, actorId: string, subject?: FactSubject) {
  const fact = subjectFacts(damage.facts, subject ?? { kind: 'actor', id: actorId })?.[key];
  return fact ? fact.value?.value ?? null : undefined;
}
export function setCalculatorCondition(damage: DamageRequest, actorId: string, field: CombatStateField, value: number | boolean | null) {
  putHitFact(damage.facts ??= [], { kind: 'actor', id: actorId }, field, value === null ? null : typeof value === 'number'
    ? { kind: 'quantity', unit: 'scalar', value } : { kind: 'boolean', value });
}
export function setCalculatorFact(damage: DamageRequest, { key, value, subject }: CalculatorFactSetting, actorId: string) {
  putHitFact(damage.facts ??= [], subject ?? { kind: 'actor', id: actorId }, key, value);
}
export function calculatorInfusion(project:Project,damage:DamageRequest,actor:string,fact:string,time:number,record?:string) {
  const selected=subjectFacts(damage.facts,{kind:'actor',id:actor})?.[fact];
  return selected ? selected.value?.kind==='boolean' ? selected.value.value : null : projectCastFact(project,actor,fact,time,record);
}
