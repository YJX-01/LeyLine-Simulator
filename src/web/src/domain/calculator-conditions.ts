import { createCombatStateReader, effectRecipientMatches, grantedBuildEffects, hitMatches, projectCastFact } from '@leyline/engine';
import { authoredHit, effectiveHitElement } from '@leyline/schema/hit-bindings';
import { combatFactDeclaration } from '@leyline/schema/buffs';
import type { findBuildHit } from '@leyline/schema';
import { putHitFact, subjectFacts, definitionKey, partyInfusionFact, partyInfusionOptions, type FactSubject, type CalculationBinding, type CalculationBundle, type CombatConditions, type CombatStateField, type DamageRequest, type PartyInfusionElement, type Project, type RequiredInput, type Value, type ValueType } from '@leyline/schema';
import { nextRecordId } from './workbench-project';
import type { CalculationFact, Talent } from '@leyline/schema';

export function presetCalculatorHitInputs(damage: DamageRequest, inputs: NonNullable<Talent['inputs']>, recorded?: Record<string, CalculationFact>) {
  const event = { kind: 'event' } as const;
  for (const input of inputs) {
    if (subjectFacts(damage.facts, event)?.[input.id]?.value != null) continue;
    const prior = recorded?.[input.id]?.value;
    const value = prior?.kind === 'quantity' && prior.unit === input.type.unit ? prior.value : input.min;
    putHitFact(damage.facts ??= [], event, input.id, { ...input.type, value });
  }
}

export interface CalculatorFactSetting { key: string; value: Value; subject?: FactSubject }
export interface CalculatorFactField { key: string; type: ValueType; subject?: FactSubject; label?: string; inherited?: Value; fromTrigger?: boolean }
export function calculatorFactPreset(field: CalculatorFactField, actorId: string): Value {
  const { type, key, subject } = field;
  if (type.kind === 'boolean') return { kind: 'boolean', value: key === 'onField' && subject?.kind === 'actor' && subject.id === actorId };
  if (type.kind === 'enum') return { kind: 'enum', value: type.values.includes('none') ? 'none' : type.values[0] };
  const value = ['hpRatio', 'targetHpRatio', 'targetsHit', 'targetsDamaged', 'nearbyEnemies', 'reactionCoefficient'].includes(key) ? 1 : 0;
  return { kind: 'quantity', unit: type.unit, value };
}

/** Fill only editable facts the evaluator actually needs, preserving recorded and inferred values. */
export function missingCalculatorPresets(facts: DamageRequest['facts'], fields: CalculatorFactField[], inputs: RequiredInput[], actorId: string) {
  return fields.flatMap(field => {
    const { subject, key } = field;
    if (!subject || subjectFacts(facts, subject)?.[key]?.value != null) return [];
    const scope = subject.kind === 'event' ? 'query' : subject.kind === 'actor' ? subject.id : subject.kind;
    const missing = inputs.some(input => input.key === key && input.requiredBy.length
      && (input.scope === scope || input.scope.endsWith(':' + scope)));
    return missing ? [{ key, subject, value: calculatorFactPreset(field, actorId) }] : [];
  });
}

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
export function bindingSubject(scope: Extract<CalculationBinding, { kind: 'fact' }>['scope'], owner: string, recipient: string, contributor?: string): FactSubject | undefined {
  if (scope === 'owner' || scope === 'recipient') return { kind: 'actor', id: scope === 'owner' ? owner : recipient };
  if (scope === 'contributor' && contributor) return { kind: 'actor', id: contributor };
  if (scope === 'event-actor') return { kind: 'actor', id: recipient };
  if (scope === 'query') return { kind: 'event' };
  if (scope === 'team') return { kind: 'team' };
  if (scope === 'target') return { kind: 'target', id: 'target' };
}
export function bindingFactFields(binding: CalculationBinding | undefined, owner: string, recipient: string, contributor?: string): CalculatorFactField[] {
  if (binding?.kind === 'formula') return Object.values(binding.inputs).flatMap(term => bindingFactFields(term, owner, recipient, contributor));
  if (binding?.kind !== 'fact' || binding.at === 'source-event') return [];
  const subject = bindingSubject(binding.scope, owner, recipient, contributor);
  return subject ? [{ key: binding.key, type: binding.type, subject }] : [];
}

export function healingBonusFactFields(members: Project['candidate']['actors'], healerId: string, recipientId: string, healingBasis?: 'hp') {
  const fields: (CalculatorFactField & { max?: number })[] = [];
  for (const owner of members) {
    if (!owner.build) continue;
    for (const { entity, effect } of grantedBuildEffects(owner.build)) {
      if (effect.target.kind !== 'attribute' || hitMatches(effect.appliesTo, null) !== true) continue;
      const target = effect.target.attribute.id;
      const isBasis = healingBasis === 'hp' && ['attribute.hpPercent', 'attribute.flatHp'].includes(target);
      if (!isBasis && target !== 'attribute.healingBonus' && target !== 'attribute.incomingHealingBonus') continue;
      const beneficiary = target === 'attribute.incomingHealingBonus' ? recipientId : healerId;
      const identity = members.find(member => member.id === beneficiary)?.build?.character.identity;
      if (effectRecipientMatches(effect.recipient, owner.id, beneficiary, identity) === false) continue;
      for (const binding of [effect.predicate, effect.value]) {
        if (!binding) continue;
        const stack = stackChoice(binding, entity.calculation.bundle);
        for (const field of bindingFactFields(binding, owner.id, beneficiary)) {
          fields.push({ ...field, label: entity.metadata.facts?.[field.key]?.label, ...(stack?.key === field.key && { max: stack.max }) });
        }
      }
    }
  }
  return fields;
}

export function calculatorHitFactFields(selected: ReturnType<typeof findBuildHit>, owner: string, dealer = owner, constellation = 6): CalculatorFactField[] {
  if (!selected) return [];
  const { entity, hit, talent } = selected;
  const family = entity.kind === 'character-definition' ? authoredHit(entity.metadata, talent?.id, hit.id)?.family : undefined;
  const bindings = [...Object.values(hit.base.bindings), ...Object.values(hit.damage).flatMap(branch => [...Object.values(branch.bindings), branch.predicate])];
  const infusion = hit.infusion && constellation >= (hit.infusion.minConstellation ?? 0) ? hit.infusion.fact : undefined;
  for (const key of [typeof family === 'object' ? family.by : undefined, infusion, hit.elementBy]) {
    const field = key && combatFactDeclaration(entity.metadata.facts, key);
    if (field && key) bindings.push({ kind: 'fact', key, ...field });
  }
  return bindings.flatMap(binding => bindingFactFields(binding, dealer, dealer, owner))
    .map(field => ({ ...field, label: entity.metadata.facts?.[field.key]?.label }));
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
  if (template.id === 'quantity-condition' && template.threshold !== undefined && template.relation === 'eq' && active && input.type.kind === 'quantity') {
    return [{ key: input.key, value: { kind: 'quantity', unit: input.type.unit, value: template.threshold } }];
  }
  return [];
}

/** Choose a valid value only when a single enum condition excludes one value. */
export function selectionEnumFallback(binding: CalculationBinding | undefined, bundle: CalculationBundle, fields: CalculatorFactField[], facts: DamageRequest['facts'], actorId: string): CalculatorFactSetting[] {
  function singleCondition(term: CalculationBinding | undefined): boolean {
    if (term?.kind !== 'formula') return false;
    const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(term.formula))?.template;
    if (template?.id === 'enum-condition') return true;
    const terms = Object.values(term.inputs);
    return template?.id === 'condition-group' && template.terms === 1 && terms.length === 1 && singleCondition(terms[0]);
  }
  if (!singleCondition(binding)) return [];
  const excluded = selectionFacts(binding, bundle, false);
  if (excluded.length !== 1 || excluded[0].value.kind !== 'enum') return [];
  const setting = excluded[0];
  const field = fields.find(candidate => candidate.key === setting.key && candidate.subject?.kind === 'actor'
    && candidate.subject.id === actorId && candidate.type.kind === 'enum');
  if (!field || field.type.kind !== 'enum') return [];
  const valid = (value: Value | undefined) => value?.kind === 'enum' && field.type.kind === 'enum'
    && field.type.values.includes(value.value) && value.value !== setting.value.value;
  const current = subjectFacts(facts, field.subject!)?.[field.key]?.value ?? undefined;
  if (valid(current)) return [];
  const value = valid(field.inherited) ? field.inherited : field.type.values.find(candidate => candidate !== setting.value.value);
  return value === undefined ? [] : [{ key: field.key, subject: field.subject,
    value: typeof value === 'string' ? { kind: 'enum', value } : value! }];
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
  if (rule.threshold === undefined) return;
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

type SelectedHit = NonNullable<ReturnType<typeof findBuildHit>>;
function personalInfusion(project: Project, damage: DamageRequest, selected: SelectedHit, actor: string, timeMs: number, recordId?: string) {
  const { infusion } = selected.hit;
  if (!infusion) return;
  const build = project.candidate.actors.find(member => member.id === actor)?.build;
  return (build?.constellation ?? 0) >= (infusion.minConstellation ?? 0)
    && calculatorInfusion(project, damage, actor, infusion.fact, timeMs, recordId);
}

export function calculatorPartyInfusionOptions(project: Project, damage: DamageRequest, selected: SelectedHit, actor: string,
  timeMs: number, recordId?: string, own = personalInfusion(project, damage, selected, actor, timeMs, recordId)) {
  if (selected.talent?.category !== 'normal') return new Map<PartyInfusionElement, string[]>();
  const builds = project.candidate.actors.flatMap(member => member.build ? [member.build] : []);
  const weapon = project.candidate.actors.find(member => member.id === actor)?.build?.weapon;
  return partyInfusionOptions(selected.hit, weapon?.weaponType, builds, own);
}

export function calculatorHitElement(project: Project, damage: DamageRequest, selected: SelectedHit, actor: string, timeMs: number, recordId?: string, family = 'ordinary') {
  const { hit } = selected;
  const event = subjectFacts(damage.facts, { kind: 'event' });
  const observations = project.timeline.find(record => record.id === recordId)?.facts;
  const own = personalInfusion(project, damage, selected, actor, timeMs, recordId);
  const infusion = family === 'ordinary' && (event?.[partyInfusionFact] ?? observations?.[partyInfusionFact])?.value;
  const party = infusion && infusion.kind === 'enum' ? [...calculatorPartyInfusionOptions(project, damage, selected, actor, timeMs, recordId, own).keys()]
    .find(element => element === infusion.value) : undefined;
  return effectiveHitElement(hit, hit.elementBy ? (event?.[hit.elementBy] ?? observations?.[hit.elementBy])?.value : undefined,
    project.candidate.actors.map(member => member.build?.character.identity.element ?? member.element), own, party);
}
