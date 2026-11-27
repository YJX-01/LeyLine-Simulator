import { createCombatStateReader, effectRecipientMatches, grantedBuildEffects, hitMatches, projectCastFact } from '@leyline/engine';
import { authoredHit, effectiveHitElement } from '@leyline/schema/hit-bindings';
import { combatFactDeclaration } from '@leyline/schema/buffs';
import type { findBuildHit } from '@leyline/schema';
import { putHitFact, subjectFacts, definitionKey, partyInfusionFact, partyInfusionOptions, type FactSubject, type CalculationBinding, type CalculationBundle, type CombatConditions, type CombatStateField, type DamageRequest, type PartyInfusionElement, type Project, type RequiredInput, type Value, type ValueType } from '@leyline/schema';
import { nextRecordId } from './workbench-project';
import type { CalculationFact, Talent } from '@leyline/schema';

export const derivedTeamFactKeys = new Set(['fullMoonsign', 'firstMoonsign', 'threeTeamElements']);
const defaultRadianceOptions = ['none', 'stellar-conduct', 'stellar-swirl'] as const;

export function presetCalculatorHitInputs(damage: DamageRequest, inputs: NonNullable<Talent['inputs']>, recorded?: Record<string, CalculationFact>) {
  const event = { kind: 'event' } as const;
  for (const input of inputs) {
    if (input.usage === 'healing' || subjectFacts(damage.facts, event)?.[input.id]?.value != null) continue;
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
      && (input.scope === scope || input.scope.endsWith(':' + scope)
        || (subject.kind === 'actor' && subject.id === actorId && (input.scope === 'owner' || input.scope === 'recipient'))));
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
    if (explicit && explicit.provenance !== 'preset') return explicit.value?.value === true;
    const interval = calculatorIntervals(project, member.id, timeMs, recordId).onField;
    return (interval === undefined ? explicit?.value?.value : interval) === true;
  });
  return active.length === 1 ? active[0] : undefined;
}
export function withCurrentConditions(damage: DamageRequest, intervals: CombatConditions, actorId: string): DamageRequest {
  const copy: DamageRequest = { ...damage, facts: damage.facts?.map(row => ({ ...row, values: { ...row.values } })) ?? [] };
  const own = subjectFacts(copy.facts, { kind: 'actor', id: actorId });
  for (const key of ['hpRatio', 'onField', 'shielded'] as const) if (intervals[key] !== undefined && (!Object.hasOwn(own ?? {}, key) || own?.[key]?.provenance === 'preset')) {
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
        const stack = stackChoice(binding, entity.calculation.bundle, beneficiary);
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

function selectionScopeSubject(scope: Extract<CalculationBinding, { kind: 'fact' }>['scope'], recipient?: string): FactSubject | undefined | null {
  if (scope === 'owner') return undefined;
  if (scope === 'recipient') return recipient ? { kind: 'actor', id: recipient } : null;
  if (scope === 'query') return { kind: 'event' };
  if (scope === 'target') return { kind: 'target', id: 'target' };
  if (scope === 'team') return { kind: 'team' };
  return null;
}

/** Only facts uniquely implied by an explicit choice. Alternatives and open ranges stay editable. */
export function selectionFacts(binding: CalculationBinding | undefined, bundle: CalculationBundle, active = true, recipient?: string): CalculatorFactSetting[] {
  if (!binding) return [];
  if (binding.kind === 'fact' && binding.at !== 'source-event' && binding.type.kind === 'boolean') {
    const subject = selectionScopeSubject(binding.scope, recipient);
    if (subject === null) return [];
    return [{ key: binding.key, ...(subject ? { subject } : {}), value: { kind: 'boolean', value: active } }];
  }
  if (binding.kind !== 'formula') return [];
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!template) return [];
  if (template.id === 'condition-group') {
    const required = active !== template.negate;
    if (template.terms === 1 || required === (template.operator === 'all')) {
      return Object.values(binding.inputs).flatMap(term => selectionFacts(term, bundle, required, recipient));
    }
    return [];
  }
  if (template.id !== 'enum-condition' && template.id !== 'quantity-condition') return [];
  const input = binding.inputs[template.input];
  if (input?.kind !== 'fact' || input.at === 'source-event') return [];
  const subject = selectionScopeSubject(input.scope, recipient);
  if (subject === null) return [];
  if (template.id === 'enum-condition' && input.type.kind === 'enum') {
    const candidates = input.type.values.filter(value => (value === template.equals) === active);
    return candidates.length === 1 ? [{ key: input.key, ...(subject ? { subject } : {}), value: { kind: 'enum', value: candidates[0] } }] : [];
  }
  if (template.id === 'quantity-condition' && template.threshold !== undefined && template.relation === 'eq' && active && input.type.kind === 'quantity') {
    return [{ key: input.key, ...(subject ? { subject } : {}), value: { kind: 'quantity', unit: input.type.unit, value: template.threshold } }];
  }
  return [];
}

export interface HitPremiseOptions {
  active?: boolean;
  constellation?: number;
  ascension?: number;
  hitInputs?: readonly NonNullable<Talent['inputs']>[number][];
}

function staticRankSatisfied(binding: CalculationBinding | undefined, bundle: CalculationBundle, options: HitPremiseOptions): boolean | undefined {
  if (binding?.kind !== 'formula') return undefined;
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!template) return undefined;
  if (template.id === 'condition-group') {
    const results = Object.values(binding.inputs).map(term => staticRankSatisfied(term, bundle, options));
    if (template.terms === 1) return results[0] === undefined ? undefined : results[0] !== template.negate;
    if (template.operator === 'all') {
      const value = results.includes(false) ? false : results.every(v => v === true) ? true : undefined;
      return value === undefined ? undefined : value !== template.negate;
    }
    const value = results.includes(true) ? true : results.every(v => v === false) ? false : undefined;
    return value === undefined ? undefined : value !== template.negate;
  }
  if (template.id !== 'threshold-condition' && template.id !== 'quantity-condition') return undefined;
  const input = binding.inputs[template.input];
  if (input?.kind !== 'actor-state' || template.threshold === undefined) return undefined;
  const rank = input.property === 'constellation' ? options.constellation : options.ascension;
  if (rank === undefined) return undefined;
  switch (template.relation) {
    case 'gt': return rank > template.threshold;
    case 'gte': return rank >= template.threshold;
    case 'lt': return rank < template.threshold;
    case 'lte': return rank <= template.threshold;
    case 'eq': return rank === template.threshold;
  }
}

function thresholdSatisfaction(relation: 'gt' | 'gte' | 'lt' | 'lte' | 'eq', threshold: number, unit: Extract<Value, { kind: 'quantity' }>['unit'],
  key: string, maxInput?: number, inputSpec?: NonNullable<Talent['inputs']>[number]): number {
  const step = unit === 'count' || inputSpec?.integer ? 1 : key === 'hpRatio' || key === 'targetHpRatio' ? 0.25 : 1;
  let value = relation === 'gte' || relation === 'lte' || relation === 'eq' ? threshold
    : relation === 'gt' ? (key === 'hpRatio' && threshold < 1 ? 1 : threshold + step)
    : Math.max(0, key === 'hpRatio' || key === 'targetHpRatio' ? threshold / 2 : threshold - step);
  if (inputSpec) {
    value = Math.max(inputSpec.min, value);
    const limit = inputSpec.max;
    if (limit !== undefined) value = Math.min(limit, value);
  }
  if (maxInput !== undefined) value = Math.min(maxInput, value);
  return value;
}

/** Resolve fact presets needed so a selected hit's own `when` predicate evaluates active without missing-fact errors. */
export function hitPremiseFacts(binding: CalculationBinding | undefined, bundle: CalculationBundle, options: HitPremiseOptions = {}): CalculatorFactSetting[] {
  const active = options.active ?? true;
  if (!binding) return [];
  if (binding.kind === 'fact' && binding.at !== 'source-event' && binding.type.kind === 'boolean') {
    if (binding.scope === 'team' && derivedTeamFactKeys.has(binding.key)) return [];
    const subject = selectionScopeSubject(binding.scope);
    if (subject === null) return [];
    return [{ key: binding.key, ...(subject ? { subject } : {}), value: { kind: 'boolean', value: active } }];
  }
  if (binding.kind !== 'formula') return [];
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!template) return [];
  if (template.id === 'condition-group') {
    const required = active !== template.negate;
    const terms = Object.values(binding.inputs);
    if (template.terms === 1 || required === (template.operator === 'all')) {
      return terms.flatMap(term => hitPremiseFacts(term, bundle, { ...options, active: required }));
    }
    if (terms.some(term => staticRankSatisfied(term, bundle, options) === required)) return [];
    for (const term of terms) {
      const resolved = hitPremiseFacts(term, bundle, { ...options, active: required });
      if (resolved.length) return resolved;
    }
    return [];
  }
  if (template.id === 'enum-condition') {
    const input = binding.inputs[template.input];
    if (input?.kind !== 'fact' || input.at === 'source-event' || input.type.kind !== 'enum') return [];
    if (input.scope === 'team' && derivedTeamFactKeys.has(input.key)) return [];
    const subject = selectionScopeSubject(input.scope);
    if (subject === null) return [];
    const candidates = input.type.values.filter(value => (value === template.equals) === active);
    if (!candidates.length) return [];
    const chosen = input.key === 'radiance' && !active && candidates.includes('stellar-conduct') ? 'stellar-conduct' : candidates[0];
    return [{ key: input.key, ...(subject ? { subject } : {}), value: { kind: 'enum', value: chosen } }];
  }
  if ((template.id === 'quantity-condition' || template.id === 'threshold-condition') && template.threshold !== undefined) {
    const input = binding.inputs[template.input];
    if (input?.kind !== 'fact' || input.at === 'source-event' || input.type.kind !== 'quantity') return [];
    if (input.scope === 'team' && derivedTeamFactKeys.has(input.key)) return [];
    const subject = selectionScopeSubject(input.scope);
    if (subject === null) return [];
    const inverted = { gt: 'lte', gte: 'lt', lt: 'gte', lte: 'gt', eq: 'gt' } as const;
    const relation = active ? template.relation : inverted[template.relation];
    const inputSpec = options.hitInputs?.find(entry => entry.id === input.key);
    const maxInput = 'maxInput' in template ? template.maxInput : undefined;
    const value = thresholdSatisfaction(relation, template.threshold, input.type.unit, input.key, maxInput, inputSpec);
    return [{ key: input.key, ...(subject ? { subject } : {}), value: { kind: 'quantity', unit: input.type.unit, value } }];
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

export function stackChoice(binding: CalculationBinding | undefined, bundle: CalculationBundle, recipient?: string) {
  if (!binding || binding.kind !== 'formula') return;
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!template) return;
  const isLinearStack = template.id === 'linear-bonus' && template.inputUnit === 'count' && template.maxInput;
  const isCountGate = template.id === 'quantity-condition' && template.unit === 'count' && template.relation === 'gt' && template.threshold === 0 && template.maxInput;
  if (!isLinearStack && !isCountGate) return;
  const input = binding.inputs[template.input];
  if (input?.kind === 'fact' && (input.scope === 'owner' || (input.scope === 'recipient' && Boolean(recipient)))) {
    return {
      key: input.key,
      max: template.maxInput!,
      ...(input.scope === 'recipient' && recipient ? { subject: { kind: 'actor' as const, id: recipient } } : {}),
    };
  }
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
export function setCalculatorFact(damage: DamageRequest, { key, value, subject }: CalculatorFactSetting, actorId: string, provenance: CalculationFact['provenance'] = 'explicit') {
  putHitFact(damage.facts ??= [], subject ?? { kind: 'actor', id: actorId }, key, value, provenance);
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

function bindingUsesFact(binding: CalculationBinding | undefined, key: string): boolean {
  if (!binding) return false;
  if (binding.kind === 'fact') return binding.key === key;
  if (binding.kind === 'formula') return Object.values(binding.inputs).some(input => bindingUsesFact(input, key));
  return false;
}

function radianceBranchMatches(binding: CalculationBinding | undefined, bundle: CalculationBundle, value: string): boolean | undefined {
  if (!binding || binding.kind !== 'formula') return undefined;
  const template = bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula))?.template;
  if (!template) return undefined;
  if (template.id === 'enum-condition') {
    const input = binding.inputs[template.input];
    return input?.kind === 'fact' && input.key === 'radiance' ? value === template.equals : undefined;
  }
  if (template.id !== 'condition-group') return undefined;
  const results = Object.values(binding.inputs).map(term => radianceBranchMatches(term, bundle, value)).filter((v): v is boolean => v !== undefined);
  if (!results.length) return undefined;
  const combined = template.operator === 'all' ? results.every(Boolean) : results.some(Boolean);
  return combined !== template.negate;
}

export interface CalculatorRadianceSpec {
  key: 'radiance';
  options: readonly string[];
  validOptions: readonly string[];
  defaultValue: string;
}

export function calculatorHitRadiance(selected: ReturnType<typeof findBuildHit>): CalculatorRadianceSpec | undefined {
  if (!selected) return undefined;
  const { entity, hit, talent } = selected;
  const family = entity.kind === 'character-definition' ? authoredHit(entity.metadata, talent?.id, hit.id)?.family : undefined;
  const branchesOnRadiance = (typeof family === 'object' && family.by === 'radiance')
    || Object.values(hit.damage).some(branch => bindingUsesFact(branch.predicate, 'radiance'));
  if (!branchesOnRadiance) return undefined;
  const declaration = combatFactDeclaration(entity.metadata.facts, 'radiance')?.type;
  const options = declaration?.kind === 'enum' ? [...declaration.values] : [...defaultRadianceOptions];
  const validOptions = options.filter(option => {
    const mapped = typeof family === 'object' && family.by === 'radiance' ? hit.damage[family.cases[option]] : undefined;
    const branches = mapped ? [mapped] : Object.values(hit.damage);
    return branches.some(branch => !branch.predicate || radianceBranchMatches(branch.predicate, entity.calculation.bundle, option) !== false);
  });
  const candidates = validOptions.length ? validOptions : options;
  const defaultValue = candidates.includes('none') ? 'none'
    : candidates.includes('stellar-conduct') ? 'stellar-conduct' : candidates[0];
  return { key: 'radiance', options, validOptions: candidates, defaultValue };
}

export function selectedHitBranchPredicate(selected: ReturnType<typeof findBuildHit>, radianceValue?: string): CalculationBinding | undefined {
  if (!selected) return undefined;
  const { entity, talent, hit } = selected;
  const entries = Object.entries(hit.damage);
  if (!entries.length) return undefined;
  if (entries.length === 1) return entries[0][1].predicate;
  const family = entity.kind === 'character-definition' ? authoredHit(entity.metadata, talent?.id, hit.id)?.family : undefined;
  const spec = calculatorHitRadiance(selected);
  const mode = radianceValue ?? spec?.defaultValue;
  const key = typeof family === 'object' && mode ? family.cases[mode] : undefined;
  return (key ? hit.damage[key]?.predicate : undefined) ?? entries[0][1].predicate;
}

export function readCalculatorRadiance(damage: DamageRequest, actorId: string): string | undefined {
  const value = subjectFacts(damage.facts, { kind: 'actor', id: actorId })?.radiance?.value;
  return value?.kind === 'enum' ? value.value : undefined;
}

export function writeCalculatorRadiance(damage: DamageRequest, actorId: string, value: string, provenance: CalculationFact['provenance'] = 'explicit') {
  setCalculatorFact(damage, { key: 'radiance', value: { kind: 'enum', value } }, actorId, provenance);
}

export interface CalculatorPersonalInfusionSpec {
  key: string;
  element: string;
  label: string;
  subject?: FactSubject;
  defaultValue: boolean;
}

export function calculatorPersonalInfusion(selected: ReturnType<typeof findBuildHit>, constellation = 0, ownerId?: string): CalculatorPersonalInfusionSpec | undefined {
  if (!selected?.hit.infusion) return undefined;
  const { infusion } = selected.hit;
  if (constellation < (infusion.minConstellation ?? 0)) return undefined;
  const required = Object.values(selected.hit.damage).some(branch =>
    selectionFacts(branch.predicate, selected.entity.calculation.bundle).some(setting => setting.key === infusion.fact && setting.value.value === true));
  return {
    key: infusion.fact,
    element: infusion.element,
    label: selected.entity.metadata.facts?.[infusion.fact]?.label ?? infusion.fact,
    ...(ownerId ? { subject: { kind: 'actor', id: ownerId } } : {}),
    defaultValue: required,
  };
}

export function readCalculatorPersonalInfusion(damage: DamageRequest, actorId: string, key: string): boolean | undefined {
  const value = subjectFacts(damage.facts, { kind: 'actor', id: actorId })?.[key]?.value;
  return value?.kind === 'boolean' ? value.value : undefined;
}

export function writeCalculatorPersonalInfusion(damage: DamageRequest, actorId: string, key: string, value: boolean, provenance: CalculationFact['provenance'] = 'explicit') {
  setCalculatorFact(damage, { key, value: { kind: 'boolean', value } }, actorId, provenance);
}

export function calculatorMainPageFactKeys(selected: ReturnType<typeof findBuildHit>, constellation = 0): Set<string> {
  const keys = new Set<string>(['critMode', 'reactionMode', partyInfusionFact]);
  for (const input of selected?.talent?.inputs ?? []) if (input.usage !== 'healing') keys.add(input.id);
  if (selected?.hit.elementBy === 'absorbedElement') keys.add('absorbedElement');
  if (calculatorHitRadiance(selected)) keys.add('radiance');
  const infusion = calculatorPersonalInfusion(selected, constellation);
  if (infusion) keys.add(infusion.key);
  return keys;
}
