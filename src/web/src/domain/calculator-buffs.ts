import { calculationEffectInstanceId, effectUnlocked, eventMatches, hitMatches, projectCalculationEvent } from '@leyline/engine';
import { projectSchema, definitionKey, ordinaryTrialId, type Build, type CalculationBinding, type CombatConditions, type CombatFrame, type DamageRequest, type DefinitionRef, type EffectDefinition, type Project } from '@leyline/schema';
import { addSkillAction } from './real-project';
import { realElementLabel, realStatLabels } from './workbench-labels';
import { calculatorIntervals, hpChoice, hpMatches, ownerFactFields, selectionFacts, setTrialFact, stackChoice, trialValue, withCurrentConditions, type CalculatorFactField, type CalculatorFactSetting } from './calculator-conditions';

export interface CalculatorBuff {
  id: string;
  ownerId: string;
  effect: DefinitionRef;
  source: string;
  name: string;
  description: string;
  target: string;
  icon: { kind: 'characters' | 'weapons' | 'artifacts' | 'skills' | 'constellations'; id: string };
  checked: boolean;
  explicit: boolean;
  toggleFact?: string;
  requirements: CalculatorFactSetting[];
  fields: CalculatorFactField[];
  stacks?: { key: string; max: number };
  hp?: ReturnType<typeof hpChoice>;
  disabled: boolean;
  triggerSkill?: string;
  triggerTime?: number;
}

const effectLabels: Record<string, string> = {
  damageBonus: '伤害加成', baseMultiplier: '基础伤害倍率', baseDamageBonus: '附加基础伤害', 'base-flat': '附加基础伤害',
  defenseIgnore: '无视防御', 'reaction.stellar-swirl.baseMultiplier': '星扩散基础伤害倍率',
  'reaction.stellar-swirl.baseBonus': '星扩散基础伤害加成', 'reaction.stellar-swirl.damageBonus': '星扩散伤害加成', 'reaction.stellar-swirl.elevation': '星扩散伤害提升',
};
const effectNames: Record<string, string> = {
  'beyondthechrysalis.loyalWind': '忠忱之风', 'beyondthechrysalis.betrayalWind': '叛弃之风',
  'yunjin.flying-cloud-base.base': '飞云旗阵', 'xingqiu.static-hydroBonus': '虚实工笔',
};
export const buffFactNames: Record<string, string> = {
  hpRatio: '生命比例', onField: '站场', shielded: '护盾存在', radiance: '星辉状态',
  'vesna.stance': '薇斯纳战技姿态', 'vesna.disciplineStacks': '律令层数', 'vesna.c6Window': '六命效果窗口',
  'beyondthechrysalis.loyalWind': '蝶变 / 忠忱之风（10秒内）', 'beyondthechrysalis.betrayalWind': '蝶变 / 叛弃之风（10秒内）',
  'scarletproof.stellarWindow': '血红之证四件效果（10秒内）',
};
type Entity = Build['character'] | NonNullable<Build['weapon']> | Build['sets'][number];
export function buffConditionsMet(item: Pick<CalculatorBuff, 'requirements' | 'stacks' | 'hp'>, damage: DamageRequest) {
  return item.requirements.every(({ key, value }) => trialValue(damage, key) === value.value)
    && (!item.hp || hpMatches(item.hp, trialValue(damage, 'hpRatio')))
    && (!item.stacks || Number(trialValue(damage, item.stacks.key)) > 0);
}
function magnitude(binding: CalculationBinding, build: Build, entity: Entity) {
  if (binding.kind === 'constant' && binding.value.kind === 'quantity') return binding.value;
  if (binding.kind === 'refinement-parameter') return { value: binding.values[build.refinement - 1], unit: binding.type.unit };
  if (binding.kind === 'formula') {
    const formula = entity.calculation.bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula));
    if (formula?.template.id === 'constant-bonus' && formula.template.value.kind === 'quantity') return formula.template.value;
  }
}
function bindingInputs(binding: CalculationBinding): string[] {
  if (binding.kind === 'attribute') return [realStatLabels[binding.key.id.replace(/^attribute\./,'')] ?? binding.key.id];
  if (binding.kind === 'fact') return [buffFactNames[binding.key] ?? binding.key];
  if (binding.kind === 'team-count') return [(binding.match === 'exclude' ? '非' : '') + binding.elements.map(realElementLabel).join('、') + '元素队员人数'];
  return binding.kind === 'formula' ? Object.values(binding.inputs).flatMap(bindingInputs) : [];
}
function describe(effect: EffectDefinition, build: Build, entity: Entity) {
  const target = effect.target.kind === 'port' ? effect.target.port : effect.target.attribute.id.replace(/^attribute\./, '');
  const label = realStatLabels[target] ?? effectLabels[target] ?? target;
  const amount = magnitude(effect.value, build, entity);
  const value = amount ? (amount.unit === 'scalar' ? (amount.value * 100).toLocaleString('zh-CN') + '%' : amount.value.toLocaleString('zh-CN')) : '';
  const inputs = value ? [] : [...new Set(bindingInputs(effect.value))];
  return (effect.recipient.role === 'team' ? '队伍' : '') + label + (value ? ' +' + value : '')
    + (inputs.length ? '，按' + inputs.join('、') + '计算' : '');
}

export function calculatorBuffChoices(project: Project, recipientId: string, damage: DamageRequest, timeMs: number, recordId?: string,
  intervals = calculatorIntervals(project, recipientId, timeMs, recordId)): CalculatorBuff[] {
  const current = withCurrentConditions(damage, intervals, recipientId);
  const members = project.candidate.actors;
  const builds = new Map(members.map(member => [member.id, member.build]));
  const events = project.timeline.map(record => projectCalculationEvent(record, builds.get(record.actor)));
  const skill = builds.get(recipientId)?.character.talents.find(skill => skill.id === damage.skillId);
  const hit = skill?.hits.find(hit => hit.id === damage.hitId);
  const output = hit?.outputs.find(output => output.id === damage.outputId);
  const family = output?.family ?? (hit && damage.outputId === ordinaryTrialId(hit.id) ? 'ordinary' : undefined);
  const frame: CombatFrame['hit'] = hit && family ? { skillId: damage.skillId, hitId: hit.id, category: hit.category, element: hit.element,
    family, origin: output?.origin ?? 'talent', reactionId: damage.reaction && damage.reaction !== 'none' ? damage.reaction.type : null } : null;
  const order = project.timeline.find(record => record.id === recordId)?.order ?? Infinity;
  const disabled = new Set(project.effectRevisions?.filter(entry => entry.disabled).map(entry => entry.instanceId));
  const applications = new Map(damage.effectApplications?.map(entry => [entry.instanceId, entry.active]));
  const choices: CalculatorBuff[] = [];
  for (const { id: ownerId, build } of members) {
    if (!build) continue;
    const { character, weapon } = build;
    const portrait = character.derivedFrom?.id ?? character.id;
    const setCounts: Record<string, number> = {};
    for (const item of build.artifacts) setCounts[item.setId] = (setCounts[item.setId] ?? 0) + 1;
    for (const entity of [character, weapon, ...build.sets]) {
      if (!entity) continue;
      for (const effect of entity.calculation.bundle.effects) {
        if (!effectUnlocked(effect.activation, { ...build, setCounts }) || hitMatches(effect.appliesTo, frame) === false) continue;
        if (effect.recipient.role === 'owner' && ownerId !== recipientId || effect.recipient.role === 'team' && effect.recipient.excludeOwner && ownerId === recipientId) continue;
        const target = effect.target.kind === 'attribute' ? effect.target.attribute.id : '';
        if (family && target.startsWith('attribute.reaction.stellar-') && !target.startsWith('attribute.reaction.' + family + '.')) continue;
        const owns = (refs: typeof entity.calculation.ruleIds) => refs.some(ref => definitionKey(ref) === definitionKey(effect.identity));
        const passive = entity === character ? character.passives.find(item => owns(item.ruleIds) && build.ascension >= (item.unlockAscension ?? 0)) : undefined;
        const constellation = entity === character ? character.constellations.find(item => owns(item.ruleIds) && build.constellation >= item.rank) : undefined;
        const set = entity.kind === 'artifact-set-definition' && entity.effects.find(item => owns(item.ruleIds) && setCounts[entity.id] >= item.pieces);
        if (!owns(entity.calculation.ruleIds) && !passive && !constellation && !set) continue;
        const source = character.identity.name;
        const name = effectNames[effect.identity.id] ?? passive?.name ?? constellation?.name
          ?? (entity.kind === 'character-definition' ? source : entity.name + (set ? ' ' + set.pieces + '件套' : ''));
        const icon: CalculatorBuff['icon'] = entity.kind === 'weapon-definition' ? { kind: 'weapons', id: entity.id }
          : entity.kind === 'artifact-set-definition' ? { kind: 'artifacts', id: entity.id }
          : constellation ? { kind: 'constellations', id: portrait + '-c' + constellation.rank }
          : passive ? { kind: 'skills', id: portrait + '-passive' + (character.passives.indexOf(passive) + 1) }
          : { kind: 'characters', id: portrait };
        const description = describe(effect, build, entity);
        const predicate = effect.predicate;
        const toggleFact = ownerId === recipientId && predicate?.kind === 'fact' && predicate.scope === 'owner' && predicate.type.kind === 'boolean'
          && !['onField','shielded'].includes(predicate.key) ? predicate.key : undefined;
        const requirements = ownerId === recipientId ? selectionFacts(predicate, entity.calculation.bundle) : [];
        const stacks = ownerId === recipientId ? stackChoice(effect.value, entity.calculation.bundle) : undefined;
        const hp = ownerId === recipientId ? hpChoice(predicate, entity.calculation.bundle) ?? hpChoice(effect.value, entity.calculation.bundle) : undefined;
        const fields = ownerId === recipientId ? [...ownerFactFields(predicate), ...ownerFactFields(effect.value)] : [];
        const common = { ownerId, effect: effect.identity, name, source, description, icon, target, explicit: effect.application === 'explicit', toggleFact, requirements, fields, stacks, hp };
        const trigger = effect.trigger;
        const sources = trigger.kind === 'permanent' ? [null] : events.filter(event =>
          eventMatches(trigger.selector, event, ownerId, 'target') === true && event.timeMs <= timeMs
          && (event.timeMs < timeMs || event.order < order || event.order === order && effect.lifetime.kind === 'interval' && effect.lifetime.phase === 'before')
          && (effect.lifetime.kind !== 'interval' || timeMs < event.timeMs + effect.lifetime.durationMs));
        if (!sources.length && trigger.kind === 'event' && trigger.selector.kinds.includes('action')) {
          const skill = character.talents.find(talent => (!trigger.selector.skillIds || trigger.selector.skillIds.includes(talent.id))
            && (!trigger.selector.categories || trigger.selector.categories.includes(talent.category)));
          if (skill) choices.push({ ...common, id: calculationEffectInstanceId(ownerId,effect.identity,null), checked: false, disabled:false, triggerSkill: skill.id,
            description: description + '，施放' + skill.name + '后' + (effect.lifetime.kind === 'interval' ? '持续' + effect.lifetime.durationMs / 1000 + '秒' : '生效') });
        }
        for (const event of sources) {
          const id = calculationEffectInstanceId(ownerId, effect.identity, event?.id ?? null);
          choices.push({ ...common, id, disabled:disabled.has(id), checked: !disabled.has(id) && (!common.explicit || applications.get(id) === true)
              && buffConditionsMet(common, current),
            triggerTime: event?.timeMs, description: description + (event ? '（' + event.timeMs / 1000 + '秒施放）' : '') });
        }
      }
    }
  }
  return choices;
}

/** The fresh trial and the picker use the same unchecked options. Explicit unknowns remain unknown. */
export function resolveBuffSelection(choices: readonly CalculatorBuff[], damage: DamageRequest, intervals: CombatConditions, actorId: string, changes: ReadonlyMap<string, boolean>) {
  const selected = new Map(changes);
  const current = withCurrentConditions(damage, intervals, actorId);
  const absent = (key: string) => !Object.hasOwn(current.conditions ?? {}, key) && !Object.hasOwn(damage.facts ?? {}, key);
  for (const item of choices) {
    const enabled = selected.get(item.id) ?? (!item.disabled && (!item.explicit || item.checked));
    if (item.triggerSkill || item.disabled || enabled && buffConditionsMet(item, current)) continue;
    if (item.explicit && !damage.effectApplications?.some(entry => entry.instanceId === item.id) && !selected.has(item.id)) selected.set(item.id, false);
    if (item.toggleFact && absent(item.toggleFact)) setTrialFact(damage, { key: item.toggleFact, value: { kind: 'boolean', value: false } }, actorId);
    if (item.stacks && absent(item.stacks.key)) setTrialFact(damage, { key: item.stacks.key, value: { kind: 'quantity', unit: 'count', value: 0 } }, actorId);
    if (!item.explicit && (item.hp && absent('hpRatio') || item.requirements.some(setting => absent(setting.key)))) selected.set(item.id, false);
  }
  return selected;
}

/** Apply explicit trial choices to the calculator copy. Timed effects retain a real source record and event order. */
export function applyCalculatorBuffs(input: Project, damage: DamageRequest, choices: CalculatorBuff[], changes: ReadonlyMap<string,boolean>, time: number, recordId?: string) {
  if (!changes.size) return { project: input, applications: damage.effectApplications };
  const project = projectSchema.parse(input);
  let applications = [...damage.effectApplications ?? []];
  const addedActions = new Map<string, string>();
  for (const option of choices) {
    const enabled = changes.get(option.id);
    if (enabled === undefined) continue;
    let id = option.id;
    if (option.triggerSkill && enabled) {
      const key = JSON.stringify([option.ownerId,option.triggerSkill]);
      let event = addedActions.get(key);
      if (!event) {
        event = addSkillAction(project, option.ownerId, option.triggerSkill, time);
        addedActions.set(key, event);
        const action = project.timeline.find(record => record.id === event)!;
        const hit = project.timeline.find(record => record.id === recordId);
        if (hit && time === hit.timeMs) {
          const insertionOrder = hit.order;
          for (const record of project.timeline) if (record !== action && record.timeMs === time && record.order >= insertionOrder) record.order++;
          action.order = insertionOrder;
        }
      }
      id = calculationEffectInstanceId(option.ownerId, option.effect, event);
    }
    if (option.explicit) applications = [...applications.filter(entry => entry.instanceId !== id), { instanceId: id, active: enabled }];
    if (enabled || !option.explicit && (!option.toggleFact || trialValue(damage, option.toggleFact) === true)) {
      const revisions = project.effectRevisions ?? [];
      const revision = revisions.find(entry => entry.instanceId === id);
      if (revision) {
        revision.disabled = !enabled;
        if (enabled && !revision.value) project.effectRevisions = revisions.filter(entry => entry !== revision);
      } else if (!enabled) { project.effectRevisions = [...revisions, { instanceId: id, disabled: true }]; }
    }
  }
  return { project, applications: applications.length ? applications : undefined };
}
