import { authoredHit } from '@leyline/schema/hit-bindings';
import { isCalculatorDamageModifier, buffEventSelectors, createTalentRankReader, findBuildHit, isTransformative, partyInfusionFact, putHitFact, subjectFacts, talentParameterAt } from '@leyline/schema';
import { buffEndMs, calculationEffectInstanceId, effectRecipientMatches, grantedBuildEffects, grantedGleamEffects, grantedResonances, hitMatches, instanceActive, projectBuffContext, stackExpiryUncertain } from '@leyline/engine';
import { projectSchema, definitionKey, type Build, type CalculationBundle, type CalculationBinding, type CalculationFact, type CombatConditions, type CombatFrame, type DamageRequest, type DefinitionRef, type EffectDefinition, type FactSubject, type Project, type Value } from '@leyline/schema';
import { addConfirmedBuff, addSkillAction } from './real-project';
import { damageFamilyLabel, realElementLabel, realStatLabels } from './workbench-labels';
import { bindingSubject, calculatorFactPreset, calculatorHitRadiance, calculatorPersonalInfusion, derivedTeamFactKeys, hitPremiseFacts, selectedHitBranchPredicate, setCalculatorCondition, calculatorHitElement, calculatorIntervals, calculatorOnFieldActor, hpChoice, hpMatches, bindingFactFields, selectionFacts, setCalculatorFact, stackChoice, calculatorFactValue, withCurrentConditions, type CalculatorFactField, type CalculatorFactSetting } from './calculator-conditions';

export interface CalculatorBuff {
  id: string;
  ownerId: string;
  effect: DefinitionRef;
  source: string;
  name: string;
  alias?: string;
  code?: string;
  intro?: string;
  relevant?: boolean;
  description: string;
  note?: string;
  target: string;
  modifiers: { id: string; target: string }[];
  icon: { kind: 'characters' | 'weapons' | 'artifacts' | 'skills' | 'constellations'; id: string };
  checked: boolean;
  explicit: boolean;
  toggleFact?: string;
  toggleSubject?: FactSubject;
  guaranteedTrigger?: boolean;
  hasPredicateFact?: boolean;
  hasValueFact?: boolean;
  hitSatisfied?: boolean;
  teammate?: boolean;
  derivedTeamFacts?: Record<string, CalculationFact>;
  requirements: CalculatorFactSetting[];
  derivedFacts?: Record<string, CalculationFact>;
  fields: CalculatorFactField[];
  stacks?: { key: string; max: number; subject?: FactSubject };
  hp?: ReturnType<typeof hpChoice>;
  disabled: boolean;
  triggerSkill?: string;
  confirmTrigger?: boolean;
  unknownExpiry?: boolean;
  triggerTime?: number;
  capturedStats?: { recordId: string; attributes: string[] };
  counterFacts?: string[];
  timing?: { durationMs: number; maxLayers: number; source?: string; remainingMs?: number };
}

const effectLabels: Record<string, string> = {
  damageBonus: '伤害加成', baseMultiplier: '基础伤害倍率', baseDamageBonus: '附加基础伤害', 'base-flat': '附加基础伤害',
  normalAttackSpeed: '普通攻击速度', flatAttack: '固定攻击力', flatDefense: '固定防御力', whiteAttack: '基础攻击力', whiteHp: '基础生命值',
  shieldStrength: '护盾强效', additiveReactionBonus: '激化反应伤害加成', amplifyingReactionBonus: '增幅反应伤害加成',
  'target.defenseReduction': '目标防御力降低', 'target.ordinaryDamageReduction': '目标所受直伤减免',
  elevationFactor: '伤害擢升倍率', 'reaction.lunar.elevation': '月反应伤害擢升',
  incomingDamageReduction: '所受伤害减免', fallDamageReduction: '坠落伤害减免', elementalSkillCooldownReduction: '元素战技冷却缩减',
  particleEnergyRecharge: '微粒充能效率加成', 'target.attackReduction': '目标攻击力降低',
  shieldAbsorption: '护盾初始吸收量', shieldAbsorptionCap: '护盾吸收量上限',
  summonInitialHp: '召唤物初始生命值', talentHealingChance: '本次触发治疗概率',
  paleHymnFromMoonsong: '月咏转化的苍色祷歌层数', bondOfLifeFromHealing: '本次治疗转化的生命之契',
  directEnergyRestored: '本次直接恢复的元素能量', directEnergyChange: '本次元素能量变化',
  staminaRestored: '本次额外恢复的水中耐力',
  lohenWillLimit: '争胜上限（点）', lohenWillGainMultiplier: '争胜积攒倍率',
  lohenWillBonusGain: '本次额外积攒的争胜（封顶前）', neferSlitherDewBonus: '蛇行额外提供草露的提升比例',
  kinichDesolationNightsoul: '噩地为基尼奇产生的夜魂值',
  saurianBaseHealing: '受魂附的龙基础回复量', foodPhlogistonRestored: '队伍食物燃素回复量（点）',
  sprintStartStaminaCostAdded: '冲刺起步体力消耗增量（点）', sprintSustainStaminaCostAdded: '持续冲刺体力消耗增量（点/秒）',
  chargedAttackSpeed: '重击攻击速度', effectiveShieldAbsorption: '对所选元素的护盾吸收量',
  aimChargeTimeReductionRatio: '瞄准蓄力时间缩短', aimChargeTimeReductionMs: '瞄准蓄力时间缩短',
  aimChargeInstant: '蓄力要求', aimChargeTimeReductionPerEnergy: '每点计入能量缩短蓄力时间',
  movementSpeed: '移动速度', glideSpeed: '滑翔前进速度', staminaCostReduction: '体力消耗降低',
  chargedAttackStaminaCost: '本次重击体力消耗（点）',
  shieldAbsorptionAdded: '本次新增的护盾吸收量',
  'reaction.electro-charged.rangeBonus': '感电影响范围加成', actorEndureDelta: '抗打断参数增量',
  incomingPoiseDamageMultiplier: '受到削韧倍率',
  attackRangeBonus: '攻击范围加成', impactRangeBonus: '影响范围加成', flameReachBonus: '喷火距离加成',
  defenseIgnore: '无视防御', 'reaction.stellar-swirl.baseMultiplier': '星扩散基础伤害倍率',
  'reaction.stellar-swirl.baseBonus': '星扩散基础伤害加成', 'reaction.stellar-swirl.damageBonus': '星扩散伤害加成', 'reaction.stellar-swirl.elevation': '星扩散伤害提升',
  elementalSkillCooldownReductionMs: '元素战技冷却减少量', elementalBurstCooldownReductionMs: '元素爆发冷却减少量',
  currentCastSkillCooldownReduction: '本次元素战技冷却缩减', currentCastBurstCooldownReduction: '本次元素爆发冷却缩减',
  currentCastSkillCooldownReductionMs: '本次元素战技冷却减少量', northernSpearArrayBaseCooldownOverrideMs: '北国枪阵基础冷却',
  passionOverloadCooldownAfterPassivesMs: '热情过载计入突破天赋后的冷却',
  confirmedSkillCooldownResetMs: '本次清除的元素战技冷却', confirmedSkillChargesRestored: '本次恢复的战技可用次数',
  forwardGrappleCooldownReduction: '无目标钩索摆荡冷却缩减', spiritEnvoyFormCooldownReduction: '灵使化形冷却缩减',
  xenochromaticFontemerAbilityCooldownReduction: '异色原海异种能力冷却缩减', nightsoulTransmissionCooldownReduction: '夜魂传递冷却缩减',
};
export function buffTargetLabel(id: string) {
  const target = id.replace(/^attribute\./, '');
  if (target.startsWith('target.resistance.')) return realElementLabel(target.split('.')[2]) + '抗性';
  const [group, family, stat] = target.split('.');
  if (group === 'auraDurationReduction') return realElementLabel(family) + '元素附着时间缩短';
  const staminaActions: Record<string, string> = { charged: '重击', climb: '攀爬', glide: '滑翔', sprint: '冲刺', swim: '游泳' };
  if (group === 'staminaCostReduction' && staminaActions[family]) return staminaActions[family] + '体力消耗降低';
  const reactionStats: Record<string, string> = { damageBonus: '伤害加成', flatBaseBonus: '固定加值', baseBonus: '基础伤害加成',
    baseDamageBonus: '附加基础伤害', baseMultiplier: '基础伤害倍率', critRate: '暴击率', critDamage: '暴击伤害', elevation: '伤害提升' };
  if (group === 'reaction' && stat && reactionStats[stat]) return (family === 'lunar' ? '月反应' : damageFamilyLabel(family)) + reactionStats[stat];
  return realStatLabels[target] ?? effectLabels[target] ?? target;
}
export function buffDisplayName(item: Pick<CalculatorBuff, 'name' | 'alias'>) {
  return item.alias && item.alias !== item.name ? item.alias + '（' + item.name + '）' : item.name;
}
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
  skillCooldownBeforeResetMs: '重置前正在恢复的战技剩余冷却（毫秒）',
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
  incomingShieldElement: '护盾所受伤害元素',
  'vesna.stance': '薇斯纳战技姿态', 'vesna.disciplineStacks': '律令层数', 'vesna.c6Window': '六命效果窗口',
  'beyondthechrysalis.loyalWind': '蝶变 / 忠忱之风（10秒内）', 'beyondthechrysalis.betrayalWind': '蝶变 / 叛弃之风（10秒内）',
  'scarletproof.stellarWindow': '血红之证四件效果（10秒内）',
  'diona.signatureMixArea': '处于最烈特调的领域',
  'tighnari.vijnanaSuffusionShot': '这发花筥箭属于最近一次战技后的前三发',
  'ganyu.c6FirstFrostflakeArrow': '这发霜华矢是最近一次山泽麟迹后的第一发',
  'kujousara.crowfeatherCoverShot': '这发满蓄力瞄准射击将消耗乌羽护持',
  'faruzan.hurricaneArrow': '这发飓烈箭消耗疾风示现的有效次数（一命每轮至多两发）',
  'chasca.fatalRounds': '本次是附灵转化触发命袭后3秒内第一次重击多重瞄准',
  'yelan.breakthroughBarbShot': '这发破局矢消耗已获得的破局状态',
};
type Entity = Build['character'] | NonNullable<Build['weapon']> | Build['sets'][number];
type BuffFactSource = Pick<CalculatorBuff, 'ownerId' | 'derivedFacts' | 'derivedTeamFacts'>;
type BuffSelection = Pick<CalculatorBuff, 'id' | 'disabled' | 'triggerSkill' | 'confirmTrigger' | 'explicit' | 'checked'
  | 'requirements' | 'stacks' | 'hp' | 'toggleFact' | 'toggleSubject'
  | 'guaranteedTrigger' | 'hasPredicateFact' | 'hasValueFact' | 'hitSatisfied' | 'teammate'> & BuffFactSource;
function buffFactValue(item: BuffFactSource, damage: DamageRequest, key: string, subject?: CalculatorFactSetting['subject']) {
  const explicit = calculatorFactValue(damage, key, item.ownerId, subject);
  if (explicit !== undefined) return explicit;
  if (subject?.kind === 'team') {
    const teamDerived = item.derivedTeamFacts?.[key];
    return teamDerived ? teamDerived.value?.value ?? null : undefined;
  }
  if (subject && (subject.kind !== 'actor' || subject.id !== item.ownerId)) return explicit;
  const derived = item.derivedFacts?.[key];
  return derived ? derived.value?.value ?? null : undefined;
}
export function buffConditionsMet(item: Pick<CalculatorBuff, 'requirements' | 'stacks' | 'hp'> & BuffFactSource, damage: DamageRequest) {
  return item.requirements.every(({ key, value, subject }) => buffFactValue(item, damage, key, subject) === value.value)
    && (!item.hp || hpMatches(item.hp, calculatorFactValue(damage, 'hpRatio', item.ownerId)))
    && (!item.stacks || Number(calculatorFactValue(damage, item.stacks.key, item.ownerId, item.stacks.subject)) > 0);
}
export function calculatorBuffChecked(item: BuffSelection, damage: DamageRequest, selection?: boolean) {
  if (item.hasPredicateFact === undefined && item.hasValueFact === undefined && item.guaranteedTrigger === undefined && item.hitSatisfied === undefined) {
    const enabled = selection ?? (!item.disabled && !item.triggerSkill && !item.confirmTrigger && (!item.explicit || item.checked));
    return enabled && buffConditionsMet(item, damage);
  }
  const enabled = selection ?? (!item.disabled && (item.guaranteedTrigger || (!item.triggerSkill && !item.confirmTrigger && item.checked)));
  return enabled && buffConditionsMet(item, damage);
}

export function calculatorLayerSeconds(timing: NonNullable<CalculatorBuff['timing']>) {
  return (timing.remainingMs ?? timing.durationMs) / 1000;
}

export function calculatorEffectControls(effect: EffectDefinition, bundle: CalculationBundle, owner: string, recipient: string, contributor: string) {
  const predicate = effect.predicate;
  const toggleSubject = predicate?.kind === 'fact' && predicate.type.kind === 'boolean' && predicate.at !== 'source-event'
    && !derivedTeamFactKeys.has(predicate.key)
    && (predicate.scope !== 'owner' || !['onField', 'shielded'].includes(predicate.key))
    ? bindingSubject(predicate.scope, owner, recipient, contributor)
    : undefined;
  const toggleFact = predicate?.kind === 'fact' && toggleSubject ? predicate.key : undefined;
  const requirements = selectionFacts(predicate, bundle, true, recipient);
  const fields = [...bindingFactFields(predicate, owner, recipient, contributor), ...bindingFactFields(effect.value, owner, recipient, contributor)];
  const target = effect.target.kind === 'attribute' ? effect.target.attribute.id : effect.target.port;
  if (toggleFact && toggleSubject && !requirements.some(entry => entry.key === toggleFact && JSON.stringify(entry.subject) === JSON.stringify(toggleSubject))) {
    requirements.push({ key: toggleFact, subject: toggleSubject, value: { kind: 'boolean', value: true } });
  }
  if ((target.startsWith('attribute.aimCharge') || effect.buff?.id === 'chasca.c6.fatal-round-crit')
    && predicate?.kind === 'fact' && predicate.type.kind === 'boolean' && (predicate.scope === 'query' || predicate.scope === 'recipient')) {
    const field = fields.find(entry => entry.key === predicate.key);
    if (field?.subject && !requirements.some(entry => entry.key === field.key && JSON.stringify(entry.subject) === JSON.stringify(field.subject))) {
      requirements.push({ key: field.key, subject: field.subject, value: { kind: 'boolean', value: true } });
    }
  }
  if (effect.windowFact) fields.push({ fromTrigger: true, key: effect.windowFact, type: { kind: 'boolean' }, subject: { kind: 'actor', id: owner } });
  return { fields, toggleFact, toggleSubject, requirements, stacks: stackChoice(effect.value, bundle, recipient) ?? stackChoice(predicate, bundle, recipient),
    hp: hpChoice(predicate, bundle) ?? hpChoice(effect.value, bundle) };
}

/** Apply the card's editable defaults before evaluating its activation requirements. */
export function enableCalculatorBuff(item: Pick<CalculatorBuff, 'ownerId' | 'fields' | 'requirements' | 'hp' | 'stacks' | 'derivedFacts' | 'derivedTeamFacts'>,
  damage: DamageRequest, intervals: CombatConditions, actorId: string) {
  const current = withCurrentConditions(damage, intervals, actorId);
  for (const field of item.fields) {
    if (field.fromTrigger || field.inherited) continue;
    const subject = field.subject ?? { kind: 'actor', id: actorId };
    const existing = subjectFacts(damage.facts, subject)?.[field.key];
    if (existing?.value != null && existing.provenance === 'preset') {
      setCalculatorFact(damage, { ...field, value: existing.value }, actorId, 'explicit');
      continue;
    }
    if (buffFactValue(item, current, field.key, field.subject) != null) continue;
    setCalculatorFact(damage, { ...field, value: calculatorFactPreset(field, actorId) }, actorId);
  }
  for (const setting of item.requirements) setCalculatorFact(damage, setting, item.ownerId);
  if (item.hp) {
    const existing = subjectFacts(damage.facts, { kind: 'actor', id: item.ownerId })?.hpRatio;
    if (!hpMatches(item.hp, calculatorFactValue(current, 'hpRatio', item.ownerId))) {
      setCalculatorCondition(damage, item.ownerId, 'hpRatio', item.hp.preset);
    } else if (existing?.provenance === 'preset' && existing.value?.kind === 'quantity') {
      setCalculatorFact(damage, { key: 'hpRatio', value: existing.value }, item.ownerId, 'explicit');
    }
  }
  if (item.stacks && !(Number(calculatorFactValue(damage, item.stacks.key, item.ownerId, item.stacks.subject)) > 0)) {
    setCalculatorFact(damage, { key: item.stacks.key, subject: item.stacks.subject, value: { kind: 'quantity', unit: 'count', value: item.stacks.max } }, item.ownerId);
  }
}

function magnitude(binding: CalculationBinding, build: Build, entity: Entity, rank: ReturnType<typeof createTalentRankReader>) {
  if (binding.kind === 'constant' && binding.value.kind === 'quantity') return binding.value;
  if (binding.kind === 'refinement-parameter') return { value: binding.values[build.refinement - 1], unit: binding.type.unit };
  if (binding.kind === 'talent-parameter' && binding.actor.role === 'owner' && binding.type.kind === 'quantity') {
    const talent = build.character.talents.find(talent => talent.id === binding.skillId);
    const value = talent && talentParameterAt(talent, binding.parameterId, rank(build, talent.category));
    if (value !== undefined) return { value, unit: binding.type.unit };
  }
  if (binding.kind === 'formula') {
    const formula = entity.calculation.bundle.formulas.find(entry => definitionKey(entry.identity) === definitionKey(binding.formula));
    if (formula?.template.id === 'constant-bonus' && formula.template.value.kind === 'quantity') return formula.template.value;
  }
}
function bindingInputs(binding: CalculationBinding, entity: Entity): string[] {
  if (binding.kind === 'attribute') return [buffTargetLabel(binding.key.id)];
  if (binding.kind === 'fact') return [entity.metadata.facts?.[binding.key]?.label ?? buffFactNames[binding.key] ?? binding.key];
  if (binding.kind === 'team-count') {
    if (binding.elements === 'owner') return [(binding.match === 'include' ? '同元素' : '异元素') + '队员人数' + (binding.excludeOwner ? '（除装备者外）' : '（含装备者）')];
    return [(binding.match === 'exclude' ? '非' : '') + binding.elements.map(realElementLabel).join('、') + (binding.distinctElements ? '的元素种数' : '元素队员人数')];
  }
  if (binding.kind === 'team-region') return [(binding.match === 'exclude' ? '非' : '') + binding.region + '队员人数'];
  return binding.kind === 'formula' ? Object.values(binding.inputs).flatMap(input => bindingInputs(input, entity)) : [];
}
function sourceAttributes(binding: CalculationBinding): string[] {
  if (binding.kind === 'attribute' && binding.at.kind === 'source-event') return [binding.key.id];
  return binding.kind === 'formula' ? Object.values(binding.inputs).flatMap(sourceAttributes) : [];
}
function describe(effect: EffectDefinition, build: Build, entity: Entity, rank: ReturnType<typeof createTalentRankReader>) {
  const target = effect.target.kind === 'port' ? effect.target.port : effect.target.attribute.id.replace(/^attribute\./, '');
  const label = buffTargetLabel(target);
  const binding = effect.value, amount = magnitude(binding, build, entity, rank);
  if (binding.kind === 'formula' && binding.inputs.basis && binding.inputs.rate
    && entity.calculation.bundle.formulas.find(f => definitionKey(f.identity) === definitionKey(binding.formula))?.template.id === 'stat-product') {
    const rate = magnitude(binding.inputs.rate, build, entity, rank);
    const basis = binding.inputs.basis;
    if (rate?.unit === 'scalar' && (basis.kind === 'attribute' || basis.kind === 'fact')) {
      return (effect.recipient.role === 'team' ? '队伍' : '') + label + ' +' + bindingInputs(basis, entity)[0]
        + ' × ' + (rate.value * 100).toLocaleString('zh-CN', { maximumFractionDigits: 4 }) + '%';
    }
  }
  if (amount && target === 'aimChargeInstant') return '本次免蓄力';
  if (amount && target === 'confirmedSkillChargesRestored') return label + ' ' + amount.value.toLocaleString('zh-CN') + ' 次';
  if (amount && (target === 'aimChargeTimeReductionPerEnergy' || target === 'aimChargeTimeReductionMs')) {
    return label + ' ' + (amount.value / 1000).toLocaleString('zh-CN') + ' 秒'
      + (target === 'aimChargeTimeReductionPerEnergy' ? '（最多计入20点，蓄力时间最低0.3秒）' : '');
  }
  if (amount?.unit === 'milliseconds' && ['elementalSkillCooldownReductionMs', 'elementalBurstCooldownReductionMs',
    'currentCastSkillCooldownReductionMs', 'northernSpearArrayBaseCooldownOverrideMs', 'passionOverloadCooldownAfterPassivesMs'].includes(target)) {
    return label + ' ' + (amount.value / 1000).toLocaleString('zh-CN') + ' 秒';
  }
  const value = amount ? (target === 'lohenWillGainMultiplier' || target === 'incomingPoiseDamageMultiplier' ? ' ×' + amount.value.toLocaleString('zh-CN') :
    ' +' + (amount.unit === 'scalar' && !['actorEndureDelta', 'lohenWillLimit'].includes(target)
      ? (amount.value * 100).toLocaleString('zh-CN') + '%' : amount.value.toLocaleString('zh-CN'))) : '';
  const inputs = value ? [] : [...new Set(bindingInputs(effect.value, entity))];
  return (effect.recipient.role === 'team' ? '队伍' : '') + label + value
    + (inputs.length ? '，按' + inputs.join('、') + '计算' : '');
}

export function calculatorBuffChoices(project: Project, sourceId: string, damage: DamageRequest, timeMs: number, recordId?: string,
  intervals = calculatorIntervals(project, sourceId, timeMs, recordId)): CalculatorBuff[] {
  const members = project.candidate.actors;
  const rank = createTalentRankReader(members);
  const builds = new Map(members.map(member => [member.id, member.build]));
  const context = projectBuffContext(project, true);
  if (!context) return [];
  const selected = findBuildHit(builds.get(sourceId), damage.hit);
  const reaction = !damage.hit.hitId ? project.timeline.find(record => record.id === recordId)?.reactionEvent : undefined;
  const skill = selected?.talent, hit = selected?.hit;
  const dealer = hit?.coordinated ? calculatorOnFieldActor(project, damage, timeMs, recordId) : undefined;
  if (hit?.coordinated && !dealer) return [];
  const recipientId = dealer?.id ?? sourceId;
  const current = withCurrentConditions(damage, recipientId === sourceId ? intervals : calculatorIntervals(project, recipientId, timeMs, recordId), recipientId);
  const families = Object.keys(hit?.damage ?? {});
  const family = reaction ? (isTransformative(reaction.family) ? 'transformative' : reaction.family)
    : families.length === 1 ? families[0] : undefined;
  const frame: CombatFrame['hit'] = reaction && family ? { skillId:null, hitId:null, category:null, element:reaction.element, family, origin:'reaction', reactionId:reaction.family }
    : selected && hit && family ? { skillId: skill?.id ?? null, hitId: hit.id, category: hit.category,
    element: dealer?.build?.character.identity.element ?? dealer?.element ?? calculatorHitElement(project, current, selected, sourceId, timeMs, recordId, family),
    family, origin: hit.origin, reactionId: damage.reaction && damage.reaction !== 'none' ? damage.reaction.type : null } : null;
  const hitFactValues = new Map<string, boolean | number | string>();
  if (selected && hit) {
    const ownerBuild = builds.get(sourceId);
    const radiance = calculatorHitRadiance(selected);
    const currentRadiance = radiance ? calculatorFactValue(current, 'radiance', sourceId) : undefined;
    const radianceValue = radiance ? (typeof currentRadiance === 'string' && radiance.validOptions.includes(currentRadiance) ? currentRadiance : radiance.defaultValue) : undefined;
    if (radiance && radianceValue !== undefined) {
      hitFactValues.set(JSON.stringify([{ kind: 'actor', id: sourceId }, 'radiance']), radianceValue);
    }
    const branchPredicate = selectedHitBranchPredicate(selected);
    const premise = branchPredicate ? hitPremiseFacts(branchPredicate, selected.entity.calculation.bundle, {
      constellation: ownerBuild?.constellation ?? 0,
      ascension: ownerBuild?.ascension ?? 6,
      hitInputs: skill?.inputs,
    }) : [];
    for (const setting of premise) {
      if (radiance && setting.key === 'radiance') continue;
      hitFactValues.set(JSON.stringify([setting.subject ?? { kind: 'actor', id: sourceId }, setting.key]), setting.value.value);
    }
    const infusion = calculatorPersonalInfusion(selected, ownerBuild?.constellation ?? 0, sourceId);
    if (infusion) {
      const value = calculatorFactValue(current, infusion.key, sourceId);
      hitFactValues.set(JSON.stringify([{ kind: 'actor', id: sourceId }, infusion.key]), typeof value === 'boolean' ? value : infusion.defaultValue);
    }
    if (hit.elementBy) {
      const value = calculatorFactValue(current, hit.elementBy, sourceId, { kind: 'event' });
      if (value != null) hitFactValues.set(JSON.stringify([{ kind: 'event' }, hit.elementBy]), value);
    }
    const partyInfusion = calculatorFactValue(current, partyInfusionFact, sourceId, { kind: 'event' });
    if (partyInfusion != null) hitFactValues.set(JSON.stringify([{ kind: 'event' }, partyInfusionFact]), partyInfusion);
    for (const input of skill?.inputs ?? []) {
      const value = calculatorFactValue(current, input.id, sourceId, { kind: 'event' });
      if (value != null) hitFactValues.set(JSON.stringify([{ kind: 'event' }, input.id]), value);
    }
  }
  const order = project.timeline.find(record => record.id === recordId)?.order ?? Infinity;
  const hitTargets = new Set<string>();
  function readTargets(binding: CalculationBinding) {
    if (binding.kind === 'attribute' || binding.kind === 'enemy') hitTargets.add(binding.key.id);
    if (binding.kind === 'formula') Object.values(binding.inputs).forEach(readTargets);
  }
  for (const [key, output] of Object.entries(hit?.damage ?? {})) {
    if (!family || key === family) Object.values(output.bindings).forEach(readTargets);
  }
  if (frame?.element) hitTargets.add('target.resistance.' + frame.element);
  if (reaction) {
    hitTargets.add('attribute.elementalMastery');
    const group = reaction.family.startsWith('lunar-') ? 'lunar' : family;
    hitTargets.add('attribute.reaction.' + group + '.damageBonus');
    hitTargets.add('attribute.reaction.' + group + '.flatBaseBonus');
    if (isTransformative(reaction.family)) {
      hitTargets.add('attribute.reaction.' + reaction.family + '.coefficient');
      hitTargets.add('attribute.reaction.transformative.critRate');
      hitTargets.add('attribute.reaction.transformative.critDamage');
    } else {
      hitTargets.add('attribute.critRate');
      hitTargets.add('attribute.critDamage');
      hitTargets.add('attribute.reaction.' + group + '.baseBonus');
      hitTargets.add('attribute.reaction.' + group + '.elevation');
    }
  }
  const disabled = new Set(project.effectRevisions?.filter(entry => entry.disabled).map(entry => entry.instanceId));
  const applications = new Map(damage.effectApplications?.map(entry => [entry.instanceId, entry.active]));
  const choices: CalculatorBuff[] = [];
  const publicBuffs = grantedResonances(members);
  const gleamGrants=grantedGleamEffects(members);
  const event = context.events.find(event => event.id === recordId && event.timeMs === timeMs);
  const derived = event?.derivedStates?.before;
  const inherited = new Map<string, Record<string, CalculationFact>>();
  function mergeFacts(subject: object, facts: Record<string, CalculationFact>) {
    const key = JSON.stringify(subject);
    inherited.set(key, { ...inherited.get(key), ...facts });
  }
  mergeFacts({ kind: 'team' }, context.teamFacts);
  for (const interval of context.factIntervals) {
    if (interval.startMs <= timeMs && timeMs < interval.endMs) mergeFacts(interval.subject, interval.facts);
  }
  for (const [id, facts] of Object.entries(derived ?? {})) mergeFacts({ kind: 'actor', id }, facts);
  for (const frame of context.stateFrames ?? []) {
    if (frame.eventId === recordId && frame.phase === 'before') mergeFacts(frame.subject, frame.facts);
  }
  for (const row of event?.subjectFacts ?? []) mergeFacts(row.subject, row.values);
  if (event) mergeFacts({ kind: 'event' }, event.facts);
  const hasExplicitFact = (factKey: string, defaultOwner: string, subject?: FactSubject) => {
    const targetSubject = subject ?? { kind: 'actor', id: defaultOwner };
    const fact = subjectFacts(current.facts, targetSubject)?.[factKey];
    if (fact) return fact.provenance !== 'preset' && fact.value != null;
    if (targetSubject.kind === 'actor' && ['onField', 'hpRatio', 'shielded'].includes(factKey)) return false;
    const inheritedFact = inherited.get(JSON.stringify(targetSubject))?.[factKey];
    return inheritedFact !== undefined && inheritedFact.provenance !== 'preset' && inheritedFact.value != null;
  };
  for (const { id: ownerId, build } of members) {
    if (!build) continue;
    const { character } = build;
    const portrait = character.derivedFrom?.id ?? character.id;
    for (const { entity, effect, passive, constellation, talent, set, resonance, gleam, scene } of [...grantedBuildEffects(build), ...publicBuffs?.ownerId === ownerId ? publicBuffs.grants : [], ...gleamGrants.get(ownerId) ?? [], ...context.sceneGrants.get(ownerId) ?? []]) {
      const interval = scene && project.sceneEffects?.find(s=>s.definition.id===scene.id && s.startMs<=timeMs && timeMs<s.endMs);
      if (scene && !interval) continue;
      if (hitMatches(effect.appliesTo, frame) === false) continue;
      if (effectRecipientMatches(effect.recipient, ownerId, recipientId, builds.get(recipientId)?.character.identity) === false) continue;
      const target = effect.target.kind === 'attribute' ? effect.target.attribute.id : effect.target.port;
      if (family && target.startsWith('attribute.reaction.stellar-') && !target.startsWith('attribute.reaction.' + family + '.')) continue;
      const source = scene ? '场景效果' : resonance ? '元素共鸣' : character.identity.name;
      const name = scene?.name ?? resonance ?? gleam ?? passive?.name ?? constellation?.name ?? talent?.name
        ?? (entity.kind === 'character-definition' ? source : entity.name + (set ? ' ' + set.pieces + '件套' : ''));
      const card = scene || resonance || gleam ? undefined : entity.metadata.calculator?.buffs?.[effect.buff?.id ?? effect.identity.id];
      if (!isCalculatorDamageModifier(target, card)) continue;
      const relevant = hitTargets.has(target) || hitTargets.has(target.replace(/Percent$/, ''))
        || target === 'base-flat' && !!hit?.damage.ordinary;
      const icon: CalculatorBuff['icon'] = entity.kind === 'weapon-definition' ? { kind: 'weapons', id: entity.id }
        : entity.kind === 'artifact-set-definition' ? { kind: 'artifacts', id: entity.id }
        : constellation ? { kind: 'constellations', id: portrait + '-c' + constellation.rank }
        : passive ? { kind: 'skills', id: portrait + '-passive' + (character.passives.indexOf(passive) + 1) }
        : talent ? { kind: 'skills', id: portrait + '-combat' + ({ normal: 1, skill: 2, burst: 3 }[talent.category]) }
        : { kind: 'characters', id: portrait };
      const description = describe(effect, build, entity, rank);
      const controls = calculatorEffectControls(effect, entity.calculation.bundle, ownerId, recipientId, sourceId);
      const declarations = scene ? interval?.definition.facts : entity.metadata.facts;
      const fields = controls.fields.filter(field => field.key !== scene?.id).map(field => ({ ...field, label: declarations?.[field.key]?.label,
        inherited: inherited.get(JSON.stringify(field.subject))?.[field.key]?.value ?? undefined }));
      const counterFacts = effect.counter && [effect.counter.fact, ...(effect.counter.overflowFact ? [effect.counter.overflowFact] : [])];
      const predicateFields = bindingFactFields(effect.predicate, ownerId, recipientId, sourceId).filter(field => !field.fromTrigger);
      const nonDerivedPredicateFields = predicateFields.filter(field => !(field.subject?.kind === 'team' && derivedTeamFactKeys.has(field.key)));
      const valueFields = bindingFactFields(effect.value, ownerId, recipientId, sourceId)
        .filter(field => !field.fromTrigger && field.key !== 'hpRatio' && field.subject?.kind !== 'event'
          && !(field.subject?.kind === 'team' && derivedTeamFactKeys.has(field.key)));
      const hasPredicateFact = nonDerivedPredicateFields.length > 0 || Boolean(controls.hp);
      const hasValueFact = valueFields.length > 0;
      const teammate = ownerId !== sourceId;
      const common = { ownerId, effect: effect.buff ?? effect.identity, name, alias: card?.alias, code: card?.code, intro: card?.note,
        relevant, source, description, icon, target, derivedFacts: derived?.[ownerId], derivedTeamFacts: context.teamFacts,
        modifiers: [{ id: effect.identity.id, target }], explicit: effect.application === 'explicit', ...controls, fields, counterFacts,
        teammate, hasPredicateFact, hasValueFact };
      const trigger = effect.trigger;
      const timing = effect.lifetime.kind === 'interval' ? { durationMs: effect.lifetime.durationMs, maxLayers: effect.stacking.maxStacks } : undefined;
      const position = { id: recordId ?? '', timeMs, order };
      const sources = (context.instances.get(calculationEffectInstanceId(ownerId, effect.identity, null)) ?? [])
        .filter(instance => (trigger.kind === 'permanent' || instance.source) && (instanceActive(instance, position, 'before') === true
          || stackExpiryUncertain(instance, timeMs)));
      const hitSatisfied = Boolean(
        !teammate && trigger.kind === 'permanent' && nonDerivedPredicateFields.length > 0 && !common.explicit && !controls.hp && !controls.stacks && !hasValueFact
        && controls.requirements.length > 0
        && nonDerivedPredicateFields.every(field => hitFactValues.has(JSON.stringify([field.subject ?? { kind: 'actor', id: ownerId }, field.key])))
        && controls.requirements.every(req => {
          const subject = req.subject ?? { kind: 'actor', id: ownerId };
          return subject.kind === 'team' && derivedTeamFactKeys.has(req.key)
            ? context.teamFacts[req.key]?.value?.value === req.value.value
            : hitFactValues.get(JSON.stringify([subject, req.key])) === req.value.value;
        })
      );
      const hpExplicit = !controls.hp || hasExplicitFact('hpRatio', ownerId);
      const predicateFactsExplicit = (!nonDerivedPredicateFields.length || hitSatisfied
        || nonDerivedPredicateFields.some(field => hasExplicitFact(field.key, ownerId, field.subject))) && hpExplicit;
      const valueFactsActive = !hasValueFact || valueFields.every(field => hasExplicitFact(field.key, ownerId, field.subject));
      const choiceCommon = { ...common, hitSatisfied };
      const nextLayer = timing && sources.length < timing.maxLayers ? { ...timing, maxLayers: timing.maxLayers - sources.length } : undefined;
      const castSelectors = trigger.kind === 'event' ? buffEventSelectors(trigger.selector).filter(branch => branch.kinds.includes('action') && !branch.observation) : [];
      const matchesCast = (talent: NonNullable<typeof skill>) => castSelectors.some(branch => (!branch.skillIds || branch.skillIds.includes(talent.id))
        && (!branch.categories || branch.categories.includes(talent.category)));
      if ((!sources.length || nextLayer) && castSelectors.length) {
        const castSkill = !teammate && skill && matchesCast(skill) ? skill : character.talents.find(matchesCast);
        if (castSkill) {
          const id = calculationEffectInstanceId(ownerId, effect.buff ?? effect.identity, null);
          const guaranteedTrigger = Boolean(
            !sources.length && !teammate && skill && castSkill.id === skill.id && !choiceCommon.explicit
            && !controls.toggleFact && !controls.requirements.length && !controls.hp && !controls.stacks
            && !hasPredicateFact && !hasValueFact && !effect.windowFact
          );
          choices.push({ ...choiceCommon, id, checked: guaranteedTrigger && !disabled.has(id) && buffConditionsMet(choiceCommon, current),
            disabled: disabled.has(id), triggerSkill: castSkill.id, guaranteedTrigger, timing: nextLayer,
            note: '施放' + castSkill.name + '后' + (effect.lifetime.kind === 'interval' ? '持续' + effect.lifetime.durationMs / 1000 + '秒' : '生效') });
        }
      } else if (nextLayer && trigger.kind === 'event' && effect.lifetime.kind === 'interval') {
        choices.push({ ...choiceCommon, id: calculationEffectInstanceId(ownerId, effect.buff ?? effect.identity, null),
          checked: false, disabled: false, confirmTrigger: true, guaranteedTrigger: false, timing: nextLayer,
          note: '确认命中前已触发，持续' + effect.lifetime.durationMs / 1000 + '秒' });
      }
      for (const instance of sources) {
        const event = instance.source;
        const captured = event?.kind === 'action' ? sourceAttributes(effect.value) : [];
        const endMs = Math.min(buffEndMs(effect, event, instance.until), instance.replacedBy?.timeMs ?? Infinity);
        const unknownExpiry = stackExpiryUncertain(instance, timeMs);
        const explicit = choiceCommon.explicit || unknownExpiry;
        const id = calculationEffectInstanceId(ownerId, effect.buff ?? effect.identity, event?.id ?? null);
        choices.push({ ...choiceCommon, id, explicit, unknownExpiry, guaranteedTrigger: false, disabled: disabled.has(id),
          checked: !disabled.has(id) && (explicit ? applications.get(id) === true : predicateFactsExplicit && valueFactsActive)
            && buffConditionsMet(choiceCommon, current),
          triggerTime: event?.timeMs, ...(event?.confirmedBuff && event.timeMs === timeMs && timing ? { timing: { ...timing, maxLayers: 1, source: event.id, remainingMs: endMs - timeMs } } : {}),
          ...(event && captured.length ? { capturedStats: { recordId: event.id, attributes: captured } } : {}),
          note: unknownExpiry ? '缺少本层的刷新记录' : event && timing ? '剩余' + (endMs - timeMs) / 1000 + '秒' : undefined });
      }
    }
  }
  const grouped = new Map<string, CalculatorBuff>();
  for (const choice of choices) {
    const previous = grouped.get(choice.id);
    if (previous) {
      previous.relevant ||= choice.relevant;
      previous.description += '；' + choice.description;
      for (const field of choice.fields) {
        if (!previous.fields.some(existing => existing.key === field.key && JSON.stringify(existing.subject) === JSON.stringify(field.subject))) {
          previous.fields.push(field);
        }
      }
      previous.modifiers.push(...choice.modifiers);
      for (const req of choice.requirements) {
        if (!previous.requirements.some(existing => existing.key === req.key && JSON.stringify(existing.subject) === JSON.stringify(req.subject))) {
          previous.requirements.push(req);
        }
      }
      previous.explicit ||= choice.explicit;
      previous.disabled ||= choice.disabled;
      const hitSatisfied = (!previous.hasPredicateFact || Boolean(previous.hitSatisfied))
        && (!choice.hasPredicateFact || Boolean(choice.hitSatisfied));
      previous.hasPredicateFact = Boolean(previous.hasPredicateFact || choice.hasPredicateFact);
      previous.hasValueFact = Boolean(previous.hasValueFact || choice.hasValueFact);
      previous.hitSatisfied = previous.hasPredicateFact && hitSatisfied;
      previous.teammate = Boolean(previous.teammate || choice.teammate);
      previous.guaranteedTrigger = Boolean((previous.guaranteedTrigger || choice.guaranteedTrigger)
        && (!previous.triggerSkill || previous.guaranteedTrigger) && (!choice.triggerSkill || choice.guaranteedTrigger));
      previous.toggleFact ??= choice.toggleFact;
      previous.toggleSubject ??= choice.toggleSubject;
      previous.hp ??= choice.hp;
      previous.stacks ??= choice.stacks;
      previous.checked &&= choice.checked;
      if (choice.capturedStats) {
        if (previous.capturedStats) {
          for (const attr of choice.capturedStats.attributes) {
            if (!previous.capturedStats.attributes.includes(attr)) previous.capturedStats.attributes.push(attr);
          }
        } else previous.capturedStats = choice.capturedStats;
      }
    } else grouped.set(choice.id, choice);
  }
  return [...grouped.values()];
}

/** Apply the same selection defaults to a new calculation and to the picker. */
export function resolveBuffSelection(choices: readonly BuffSelection[], damage: DamageRequest, intervals: CombatConditions, actorId: string, changes: ReadonlyMap<string, boolean>) {
  const selected = new Map(changes);
  const current = withCurrentConditions(damage, intervals, actorId);
  for (const item of choices) {
    const absent = (key: string, subject?: CalculatorFactSetting['subject']) => buffFactValue(item, current, key, subject) === undefined;
    const isChecked = selected.has(item.id)
      ? Boolean(selected.get(item.id) && buffConditionsMet(item, current))
      : calculatorBuffChecked(item, current);
    if (isChecked) continue;
    if (item.triggerSkill || item.confirmTrigger || item.disabled) {
      if (item.guaranteedTrigger && selected.get(item.id) === false) selected.set(item.id, false);
      continue;
    }
    if (item.explicit && !damage.effectApplications?.some(entry => entry.instanceId === item.id && entry.active != null) && !selected.has(item.id)) {
      selected.set(item.id, false);
    }
    const provenance = changes.has(item.id) ? 'explicit' : 'preset';
    if (item.toggleFact && absent(item.toggleFact, item.toggleSubject)) {
      setCalculatorFact(damage, { key: item.toggleFact, subject: item.toggleSubject, value: { kind: 'boolean', value: false } }, item.ownerId, provenance);
    }
    if (item.stacks && absent(item.stacks.key, item.stacks.subject)) {
      setCalculatorFact(damage, { key: item.stacks.key, subject: item.stacks.subject, value: { kind: 'quantity', unit: 'count', value: 0 } }, item.ownerId, provenance);
    }
    if (!item.explicit) {
      for (const field of 'fields' in item ? (item as Pick<CalculatorBuff, 'fields'>).fields : []) {
        if (field.fromTrigger || field.inherited || field.key === 'hpRatio' || field.subject?.kind === 'event') continue;
        if (field.subject?.kind === 'team' && derivedTeamFactKeys.has(field.key)) continue;
        if (!absent(field.key, field.subject)) continue;
        setCalculatorFact(damage, { key: field.key, subject: field.subject, value: calculatorFactPreset(field, actorId) }, item.ownerId, provenance);
      }
      const latest = withCurrentConditions(damage, intervals, actorId);
      const toggleHandlesDisable = Boolean(item.toggleFact && buffFactValue(item, latest, item.toggleFact, item.toggleSubject) === false);
      if (!toggleHandlesDisable) selected.set(item.id, false);
    }
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
    } else if (option.guaranteedTrigger && option.triggerSkill && !enabled) {
      const key = JSON.stringify([option.ownerId, option.triggerSkill]);
      let event = addedActions.get(key);
      if (!event) {
        const added = addSkillAction(project, option.ownerId, option.triggerSkill, time);
        const calcId = `calc-cast-${added}`;
        const record = project.timeline.find(entry => entry.id === added)!;
        record.id = calcId;
        event = calcId;
        addedActions.set(key, event);
        beforeHit(event);
      }
      id = calculationEffectInstanceId(option.ownerId, option.effect, event);
    }
    if (option.explicit) applications = [...applications.filter(entry => entry.instanceId !== id), { instanceId: id, active: enabled }];
    const toggleFalse = option.toggleFact && calculatorFactValue(damage, option.toggleFact, option.ownerId, option.toggleSubject) === false;
    const untriggered = (option.triggerSkill || option.confirmTrigger) && !enabled && !option.guaranteedTrigger;
    if (enabled || !option.explicit && !toggleFalse && !untriggered) {
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

type RuntimeBuffContext = NonNullable<ReturnType<typeof projectBuffContext>>;
type RuntimeEffectInstance = RuntimeBuffContext['instances'] extends Map<string, (infer V)[]> ? V : never;

export function effectInstanceInRuntime(instance: RuntimeEffectInstance, context: RuntimeBuffContext): boolean {
  if (instance.definition.trigger.kind !== 'permanent' && !instance.source) return false;
  const window = instance.definition.windowFact;
  if (!instance.source && window) {
    const subject = { kind: 'actor' as const, id: instance.owner.id };
    const observed = instance.owner.facts[window] || context.events.some(event =>
      subjectFacts(event.subjectFacts, subject)?.[window] || event.derivedStates?.before[subject.id]?.[window] || event.derivedStates?.after[subject.id]?.[window])
      || [...context.factIntervals, ...(context.stateFrames ?? [])].some(entry =>
        entry.subject.kind === 'actor' && entry.subject.id === subject.id && entry.facts[window]);
    if (!observed) return false;
  }
  return true;
}

/**
 * Reconcile actor condition defaults and conditional/stacked/explicit effects matching non-primary teammates
 * on the evaluation clone so teammate attribute reads never trigger missing-fact or stale-switch errors.
 */
export function reconcileTeammateCalculatorEffects(
  project: Project,
  damage: DamageRequest,
  primaryRecipientId: string,
  enabledPrimaryIds: ReadonlySet<string>,
  timeMs: number,
  recordId?: string,
): void {
  const context = projectBuffContext(project, true);
  if (!context) return;
  const members = project.candidate.actors;
  const order = project.timeline.find(record => record.id === recordId)?.order ?? Infinity;
  const position = { id: recordId ?? '', timeMs, order };
  const publicBuffs = grantedResonances(members);
  const gleamGrants = grantedGleamEffects(members);

  for (const member of members) {
    if (member.id === primaryRecipientId) continue;
    const teammateIntervals = calculatorIntervals(project, member.id, timeMs, recordId);
    const subject = { kind: 'actor' as const, id: member.id };
    const existing = subjectFacts(damage.facts, subject);
    if (teammateIntervals.onField === undefined && existing?.onField?.value == null) {
      putHitFact(damage.facts ??= [], subject, 'onField', { kind: 'boolean', value: false }, 'preset');
    }
    if (teammateIntervals.hpRatio === undefined && existing?.hpRatio?.value == null) {
      putHitFact(damage.facts ??= [], subject, 'hpRatio', { kind: 'quantity', unit: 'scalar', value: 1 }, 'preset');
    }
    if (teammateIntervals.shielded === undefined && existing?.shielded?.value == null) {
      putHitFact(damage.facts ??= [], subject, 'shielded', { kind: 'boolean', value: false }, 'preset');
    }
  }

  interface TeammateEffectEntry {
    ownerId: string;
    controls: ReturnType<typeof calculatorEffectControls>;
    sceneId?: string;
    hasConditionOrInput: boolean;
    isUnconditionalPermanent: boolean;
  }
  const grouped = new Map<string, TeammateEffectEntry[]>();

  for (const { id: ownerId, build } of members) {
    if (!build) continue;
    for (const { entity, effect, scene } of [
      ...grantedBuildEffects(build),
      ...(publicBuffs?.ownerId === ownerId ? publicBuffs.grants : []),
      ...(gleamGrants.get(ownerId) ?? []),
      ...(context.sceneGrants.get(ownerId) ?? []),
    ]) {
      const interval = scene && project.sceneEffects?.find(s => s.definition.id === scene.id && s.startMs <= timeMs && timeMs < s.endMs);
      if (scene && !interval) continue;
      const instances = (context.instances.get(calculationEffectInstanceId(ownerId, effect.identity, null)) ?? [])
        .filter(instance => effectInstanceInRuntime(instance, context)
          && (instanceActive(instance, position, 'before') !== false || stackExpiryUncertain(instance, timeMs)));
      if (!instances.length) continue;

      for (const member of members) {
        if (member.id === primaryRecipientId) continue;
        if (effectRecipientMatches(effect.recipient, ownerId, member.id, member.build?.character.identity) === false) continue;
        const controls = calculatorEffectControls(effect, entity.calculation.bundle, ownerId, member.id, primaryRecipientId);
        const nonDerivedPredicateFields = bindingFactFields(effect.predicate, ownerId, member.id, primaryRecipientId)
          .filter(field => !field.fromTrigger && field.key !== scene?.id && !(field.subject?.kind === 'team' && derivedTeamFactKeys.has(field.key)));
        const valueFields = bindingFactFields(effect.value, ownerId, member.id, primaryRecipientId)
          .filter(field => !field.fromTrigger && field.key !== 'hpRatio' && field.key !== scene?.id && field.subject?.kind !== 'event'
            && !(field.subject?.kind === 'team' && derivedTeamFactKeys.has(field.key)));
        for (const instance of instances) {
          const hasConditionOrInput = effect.application === 'explicit'
            || Boolean(effect.windowFact)
            || nonDerivedPredicateFields.length > 0
            || Boolean(controls.hp)
            || Boolean(controls.stacks)
            || valueFields.length > 0
            || effect.recipient.role === 'fact-actor'
            || stackExpiryUncertain(instance, timeMs);
          const isUnconditionalPermanent = effect.trigger.kind === 'permanent' && !hasConditionOrInput;
          const list = grouped.get(instance.id) ?? [];
          list.push({ ownerId, controls, sceneId: scene?.id, hasConditionOrInput, isUnconditionalPermanent });
          grouped.set(instance.id, list);
        }
      }
    }
  }

  for (const [instanceId, entries] of grouped) {
    if (!entries.some(entry => entry.hasConditionOrInput)) continue;
    if (!enabledPrimaryIds.has(instanceId) && !entries.some(entry => entry.isUnconditionalPermanent)) {
      const revisions = project.effectRevisions ?? [];
      const existing = revisions.find(entry => entry.instanceId === instanceId);
      if (existing) existing.disabled = true;
      else project.effectRevisions = [...revisions, { instanceId, disabled: true }];
      continue;
    }
    for (const { ownerId, controls, sceneId } of entries) {
      if (controls.toggleFact && controls.toggleFact !== sceneId) {
        const targetSubject = controls.toggleSubject ?? { kind: 'actor' as const, id: ownerId };
        if (subjectFacts(damage.facts, targetSubject)?.[controls.toggleFact]?.value == null) {
          putHitFact(damage.facts ??= [], targetSubject, controls.toggleFact, { kind: 'boolean', value: false }, 'preset');
        }
      }
      if (controls.stacks) {
        const stackSubject = controls.stacks.subject ?? { kind: 'actor' as const, id: ownerId };
        if (subjectFacts(damage.facts, stackSubject)?.[controls.stacks.key]?.value == null) {
          putHitFact(damage.facts ??= [], stackSubject, controls.stacks.key, { kind: 'quantity', unit: 'count', value: 0 }, 'preset');
        }
      }
      for (const field of controls.fields) {
        if (field.fromTrigger || !field.subject || field.key === 'hpRatio' || field.key === sceneId || field.subject.kind === 'event') continue;
        if (field.subject.kind === 'team' && derivedTeamFactKeys.has(field.key)) continue;
        if (subjectFacts(damage.facts, field.subject)?.[field.key]?.value == null) {
          putHitFact(damage.facts ??= [], field.subject, field.key, calculatorFactPreset(field, primaryRecipientId), 'preset');
        }
      }
    }
  }
}
