import { authoredHit, effectiveHitElement } from '@leyline/schema/hit-bindings';
import { findBuildHit, subjectFacts } from '@leyline/schema';
import { buffEndMs, calculationEffectInstanceId, grantedBuildEffects, grantedGleamEffects, grantedResonances, hitMatches, instanceActive, projectBuffContext, stackExpiryUncertain } from '@leyline/engine';
import { projectSchema, definitionKey, type Build, type CalculationBinding, type CombatConditions, type CombatFrame, type DamageRequest, type DefinitionRef, type EffectDefinition, type Project } from '@leyline/schema';
import { addConfirmedBuff, addSkillAction } from './real-project';
import { calculatorInfusion } from './calculator-conditions';
import { realElementLabel, realStatLabels } from './workbench-labels';
import { calculatorIntervals, calculatorOnFieldActor, hpChoice, hpMatches, bindingFactFields, selectionFacts, setCalculatorFact, stackChoice, calculatorFactValue, withCurrentConditions, type CalculatorFactField, type CalculatorFactSetting } from './calculator-conditions';

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
  confirmTrigger?: boolean;
  unknownExpiry?: boolean;
  triggerTime?: number;
  counterFacts?: string[];
  timing?: { durationMs: number; maxLayers: number; source?: string; remainingMs?: number };
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
  targetsHit: '命中敌人数', 'bennett.inField': '受益队员处于鼓舞领域内',
  strikingHand: '出手侧',
  'furina.fanfarePoints': '当前气氛值', 'furina.excessFanfare': '超过上限的气氛值',
  autumnPlatform: '椛染之庭所处区域（火为炎祝，冰为霜祝）',
  'kamisatoayato.extraSlash':'滥觞无底本次追加攻击已触发',
  nearbyEnemies: '附近敌人数', 'deathmatch.enemiesAtUpdate':'决斗之枪上次刷新时的敌人数', threeTeamElements:'队伍至少有三种元素',firstMoonsign:'月兆至少为初辉', enemyDefeated: '击败敌人',
  targetsDamaged: '实际受到伤害的目标数', criticalTargets: '其中受到暴击的目标数', triggerRoll: '触发抽样值',
  weaponTriggeredOffField: '已观察到该武器在后台触发',
  currentEnergy: '当前元素能量', skillCooldownRemaining: '当前战技剩余冷却（毫秒）',
  'manekin.infused':'戒惩轰击的元素转化', 'manekin.zone':'禁限区域存在', 'manekin.contactReady':'与上次踏入命中相隔至少 0.5 秒', 'manekin.zoneExit':'离场时禁限区域爆炸',
  'aura.pyro': '火元素附着', 'aura.electro': '雷元素附着', 'aura.hydro': '水元素附着', 'aura.cryo': '冰元素附着',
  'enemy.slime': '史莱姆', weakPointHit: '命中要害', targetHpRatio: '目标生命比例',
  'lyney.propSurplus': '清除的隐具余数', 'shikanoinheizou.declension': '变格层数', 'mualani.waveMomentum': '浪势充能层数',
  'kamisatoayato.inGarden': '处于清净之园囿内',
  'aura.frozen': '冻结', 'nicole.projectionReady': '本次奥迹造影可触发', 'nicole.unityReady': '本次合一造影可触发',
  'varka.specialAttack': '触发额外攻击的动作', 'mavuika.flamestrider': '驰轮车状态',
  'valeriy.impactPotential': '冲击势能', 'venti.stormeye': '暴风之眼存在', 'venti.hexerei': '魔导秘仪已解锁', 'razor.wolfWithin': '狼魂存在',
  'varka.stance': '狂飙突进', 'wanderer.windfavored': '优风倾姿', 'wriothesley.chillingPenalty': '寒烈的惩裁', 'yoimiya.niwabi': '焰硝庭火舞',
  'prune.hammerWindow': '触发扩散后六秒内', absorbedElement: '转化元素', stellarAttachments: '极星辉域记录的附着次数', frostglow: '消耗的寒辉层数', 'sandrone.overload': '功率过载',
  'sandrone.powerAbove50': '施放时解算功率超过50', 'sandrone.tactics': '清除的改进战术层数', 'qiqi.stellarConduct': '辉映·星超导',
  'mitya.stable': '稳态炉心', 'mitya.overloadedWithBeacon': '过载炉心与递变信标', 'mitya.excessBeacon': '超出上限的信标', 'mitya.beacons': '引爆的递变信标', 'lohen.masterstroke': '奇谋状态', 'lohen.will': '消耗的争胜点数',
  hpRatio: '生命比例', onField: '站场', shielded: '护盾存在', radiance: '星辉状态',
  'vesna.stance': '薇斯纳战技姿态', 'vesna.disciplineStacks': '律令层数', 'vesna.c6Window': '六命效果窗口',
  'beyondthechrysalis.loyalWind': '蝶变 / 忠忱之风（10秒内）', 'beyondthechrysalis.betrayalWind': '蝶变 / 叛弃之风（10秒内）',
  'scarletproof.stellarWindow': '血红之证四件效果（10秒内）',
};
type Entity = Build['character'] | NonNullable<Build['weapon']> | Build['sets'][number];
export function buffConditionsMet(item: Pick<CalculatorBuff, 'requirements' | 'stacks' | 'hp' | 'ownerId'>, damage: DamageRequest) {
  return item.requirements.every(({ key, value, subject }) => calculatorFactValue(damage, key, item.ownerId, subject) === value.value)
    && (!item.hp || hpMatches(item.hp, calculatorFactValue(damage, 'hpRatio', item.ownerId)))
    && (!item.stacks || Number(calculatorFactValue(damage, item.stacks.key, item.ownerId)) > 0);
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
  if (binding.kind === 'team-region') return [binding.region+'队员人数'];
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

export function calculatorBuffChoices(project: Project, sourceId: string, damage: DamageRequest, timeMs: number, recordId?: string,
  intervals = calculatorIntervals(project, sourceId, timeMs, recordId)): CalculatorBuff[] {
  const members = project.candidate.actors;
  const builds = new Map(members.map(member => [member.id, member.build]));
  const context = projectBuffContext(project, true);
  if (!context) return [];
  const selected = findBuildHit(builds.get(sourceId), damage.hit);
  const skill = selected?.talent, hit = selected?.hit;
  const dealer = hit?.coordinated ? calculatorOnFieldActor(project, damage, timeMs, recordId) : undefined;
  if (hit?.coordinated && !dealer) return [];
  const recipientId = dealer?.id ?? sourceId;
  const current = withCurrentConditions(damage, recipientId === sourceId ? intervals : calculatorIntervals(project, recipientId, timeMs, recordId), recipientId);
  const families = Object.keys(hit?.damage ?? {});
  const owner = builds.get(sourceId)?.character;
  const selector = authoredHit(owner?.metadata, skill?.id, hit?.id)?.family;
  const branch = typeof selector === 'object' ? calculatorFactValue(current, selector.by, recipientId) : undefined;
  const family = typeof selector === 'object' && typeof branch === 'string' ? selector.cases[branch] : families.length === 1 ? families[0] : undefined;
  const frame: CombatFrame['hit'] = hit && family ? { skillId: skill?.id ?? null, hitId: hit.id, category: hit.category, element: dealer?.build?.character.identity.element ?? dealer?.element ?? effectiveHitElement(hit, hit.elementBy ? subjectFacts(current.facts, { kind: 'event' })?.[hit.elementBy]?.value : null, members.map(actor => actor.build?.character.identity.element ?? actor.element),hit.infusion ? calculatorInfusion(project,damage,sourceId,hit.infusion.fact,timeMs,recordId) : undefined),
    family, origin: hit.origin, reactionId: damage.reaction && damage.reaction !== 'none' ? damage.reaction.type : null } : null;
  const order = project.timeline.find(record => record.id === recordId)?.order ?? Infinity;
  const disabled = new Set(project.effectRevisions?.filter(entry => entry.disabled).map(entry => entry.instanceId));
  const applications = new Map(damage.effectApplications?.map(entry => [entry.instanceId, entry.active]));
  const choices: CalculatorBuff[] = [];
  const publicBuffs = grantedResonances(members);
  const gleamGrants=grantedGleamEffects(members);
  for (const { id: ownerId, build } of members) {
    if (!build) continue;
    const { character } = build;
    const portrait = character.derivedFrom?.id ?? character.id;
    for (const { entity, effect, passive, constellation, talent, set, resonance, gleam, scene } of [...grantedBuildEffects(build), ...publicBuffs?.ownerId === ownerId ? publicBuffs.grants : [], ...gleamGrants.get(ownerId) ?? [], ...context.sceneGrants.get(ownerId) ?? []]) {
      const interval = scene && project.sceneEffects?.find(s=>s.definition.id===scene.id && s.startMs<=timeMs && timeMs<s.endMs);
      if (scene && !interval) continue;
      if (hitMatches(effect.appliesTo, frame) === false) continue;
      if (effect.recipient.role === 'owner' && ownerId !== recipientId || effect.recipient.role === 'team' && effect.recipient.excludeOwner && ownerId === recipientId) continue;
      const target = effect.target.kind === 'attribute' ? effect.target.attribute.id : '';
      if (family && target.startsWith('attribute.reaction.stellar-') && !target.startsWith('attribute.reaction.' + family + '.')) continue;
      const source = scene ? '场景效果' : resonance ? '元素共鸣' : character.identity.name;
      const name = scene?.name ?? resonance ?? gleam ?? effectNames[effect.identity.id] ?? passive?.name ?? constellation?.name ?? talent?.name
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
      const fields = [...bindingFactFields(predicate, ownerId, recipientId), ...bindingFactFields(effect.value, ownerId, recipientId)].filter(f=>f.key!==scene?.id);
      if (effect.windowFact) fields.push({key:effect.windowFact,type:{kind:'boolean'},subject:{kind:'actor',id:ownerId}});
      const counterFacts = effect.counter && [effect.counter.fact, ...(effect.counter.overflowFact ? [effect.counter.overflowFact] : [])];
      const common = { ownerId, effect: effect.buff ?? effect.identity, name, source, description, icon, target, explicit: effect.application === 'explicit', toggleFact, requirements, fields, stacks, hp, counterFacts };
      const trigger = effect.trigger;
      const timing = effect.lifetime.kind === 'interval' ? { durationMs: effect.lifetime.durationMs, maxLayers: effect.stacking.maxStacks } : undefined;
      const position = {id: recordId ?? '', timeMs, order};
      const sources = (context.instances.get(calculationEffectInstanceId(ownerId,effect.identity,null)) ?? [])
        .filter(instance => (trigger.kind === 'permanent' || instance.source) && (instanceActive(instance, position, 'before') === true
          || stackExpiryUncertain(instance,timeMs)));
      const nextLayer = timing && sources.length < timing.maxLayers ? { ...timing, maxLayers: timing.maxLayers - sources.length } : undefined;
      if ((!sources.length || nextLayer) && trigger.kind === 'event' && trigger.selector.kinds.includes('action')) {
        const skill = character.talents.find(talent => (!trigger.selector.skillIds || trigger.selector.skillIds.includes(talent.id))
          && (!trigger.selector.categories || trigger.selector.categories.includes(talent.category)));
        if (skill) choices.push({ ...common, id: calculationEffectInstanceId(ownerId,effect.buff ?? effect.identity,null), checked: false, disabled:false, triggerSkill: skill.id, timing: nextLayer,
          description: description + '，施放' + skill.name + '后' + (effect.lifetime.kind === 'interval' ? '持续' + effect.lifetime.durationMs / 1000 + '秒' : '生效') });
      } else if (nextLayer && trigger.kind === 'event' && effect.lifetime.kind === 'interval') {
        choices.push({ ...common, id: calculationEffectInstanceId(ownerId,effect.buff ?? effect.identity,null), checked: false, disabled: false, confirmTrigger: true, timing: nextLayer,
          description: description + '，确认命中前已触发，持续' + effect.lifetime.durationMs / 1000 + '秒' });
      }
      for (const instance of sources) {
        const event = instance.source;
        const endMs = Math.min(buffEndMs(effect,event,instance.until), instance.replacedBy?.timeMs ?? Infinity);
        const unknownExpiry = stackExpiryUncertain(instance,timeMs);
        const explicit = common.explicit || unknownExpiry;
        const id = calculationEffectInstanceId(ownerId, effect.buff ?? effect.identity, event?.id ?? null);
        choices.push({ ...common, id, explicit, unknownExpiry, disabled:disabled.has(id), checked: !disabled.has(id) && (!explicit || applications.get(id) === true)
            && buffConditionsMet(common, current),
          triggerTime: event?.timeMs, ...(event?.confirmedBuff && event.timeMs === timeMs && timing ? { timing: { ...timing, maxLayers: 1, source: event.id, remainingMs: endMs-timeMs } } : {}),
          description: description + (unknownExpiry ? '（本层是否已刷新仍待确认）' : event && timing ? '（剩余' + (endMs-timeMs) / 1000 + '秒）' : '') });
      }
    }
  }
  const grouped = new Map<string, CalculatorBuff>();
  for (const choice of choices) {
    const previous = grouped.get(choice.id);
    if (previous) {
      previous.description += '；' + choice.description;
      previous.fields.push(...choice.fields);
    } else grouped.set(choice.id, choice);
  }
  return [...grouped.values()];
}

/** Apply the same defaults to a new calculation and to the picker. Preserve explicit unknowns. */
export function resolveBuffSelection(choices: readonly CalculatorBuff[], damage: DamageRequest, intervals: CombatConditions, actorId: string, changes: ReadonlyMap<string, boolean>) {
  const selected = new Map(changes);
  const current = withCurrentConditions(damage, intervals, actorId);
  for (const item of choices) {
    if (item.unknownExpiry && !selected.has(item.id)) continue;
    const absent = (key: string, subject?: CalculatorFactSetting['subject']) => calculatorFactValue(current, key, item.ownerId, subject) === undefined;
    const enabled = selected.get(item.id) ?? (!item.disabled && (!item.explicit || item.checked));
    if (item.triggerSkill || item.confirmTrigger || item.disabled || enabled && buffConditionsMet(item, current)) continue;
    if (item.explicit && !damage.effectApplications?.some(entry => entry.instanceId === item.id) && !selected.has(item.id)) selected.set(item.id, false);
    if (item.toggleFact && absent(item.toggleFact)) setCalculatorFact(damage, { key: item.toggleFact, value: { kind: 'boolean', value: false } }, item.ownerId);
    if (item.stacks && absent(item.stacks.key)) setCalculatorFact(damage, { key: item.stacks.key, value: { kind: 'quantity', unit: 'count', value: 0 } }, item.ownerId);
    if (!item.explicit && (item.hp && absent('hpRatio') || item.requirements.some(setting => absent(setting.key, setting.subject)))) selected.set(item.id, false);
  }
  return selected;
}

/** Apply the selected effects to the calculator copy with their source records and event order. */
export function applyCalculatorBuffs(input: Project, damage: DamageRequest, choices: CalculatorBuff[], changes: ReadonlyMap<string,boolean>, time: number, recordId?: string,
  durations: ReadonlyMap<string, readonly number[]> = new Map()) {
  if (!changes.size) return { project: input, applications: damage.effectApplications };
  const project = projectSchema.parse(input);
  let applications = [...damage.effectApplications ?? []];
  const addedActions = new Map<string, string>();
  function beforeHit(source: string) {
    const event = project.timeline.find(record => record.id === source)!;
    const hit = project.timeline.find(record => record.id === recordId);
    if (!hit || time !== hit.timeMs) return;
    const insertionOrder = hit.order;
    for (const record of project.timeline) if (record !== event && record.timeMs === time && record.order >= insertionOrder) record.order++;
    event.order = insertionOrder;
  }
  for (const option of choices) {
    const enabled = changes.get(option.id);
    if (enabled === undefined) continue;
    let id = option.id;
    const layers = enabled ? durations.get(id) : undefined;
    if (layers?.length) {
      const timing = option.timing;
      if (!timing || layers.length > timing.maxLayers || layers.some(ms => !Number.isSafeInteger(ms) || ms <= 0 || ms > timing.durationMs)) throw new Error('请按增益的时长和层数范围填写剩余时间。');
      for (const ms of layers) {
        let sourceId = timing.source;
        if (timing.source) {
          const source = project.timeline.find(record => record.id === timing.source);
          if (!source?.confirmedBuff) throw new Error('已确认的增益记录已失效。');
          source.confirmedBuff.remainingMs = ms;
        } else {
          const source = addConfirmedBuff(project, option.ownerId, option.effect, time, ms);
          sourceId = source;
          beforeHit(source);
          id = calculationEffectInstanceId(option.ownerId, option.effect, source);
          if (option.explicit) applications = [...applications.filter(entry => entry.instanceId !== id), { instanceId: id, active: true }];
        }
        for (const key of option.counterFacts ?? []) {
          const counter = subjectFacts(damage.facts, { kind: 'actor', id: option.ownerId })?.[key];
          if (!counter) continue;
          const record = project.timeline.find(row => row.id === sourceId)!;
          (record.facts ??= {})[key] = { ...counter, value: counter.value ? { ...counter.value } : null, sourceRefs: [...counter.sourceRefs] };
        }
      }
    } else if ((option.triggerSkill || option.confirmTrigger) && enabled) {
      const key = JSON.stringify([option.ownerId, option.triggerSkill ?? option.effect]);
      let event = addedActions.get(key);
      if (!event) {
        event = option.triggerSkill ? addSkillAction(project, option.ownerId, option.triggerSkill, time) : addConfirmedBuff(project, option.ownerId, option.effect, time);
        addedActions.set(key, event);
        beforeHit(event);
      }
      id = calculationEffectInstanceId(option.ownerId, option.effect, event);
    }
    if (option.explicit) applications = [...applications.filter(entry => entry.instanceId !== id), { instanceId: id, active: enabled }];
    if (enabled || !option.explicit && (!option.toggleFact || calculatorFactValue(damage, option.toggleFact, option.ownerId) === true)) {
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
