import { buildSchema, combatConditionsSchema, damageRequestSchema, enemySchema, statKeys, type Build, type CombatConditions, type DamageRequest, type Enemy, type StatKey } from '@leyline/schema';

import type { CalculationStatus, CalculationIssue, Contribution, AttributePanel, DamageResult } from '@leyline/schema';
const zeroStats = (): Record<StatKey, number> => Object.fromEntries(statKeys.map(key => [key, 0])) as Record<StatKey, number>;
const statusOf = (issues: CalculationIssue[]): CalculationStatus => issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : issues.length ? 'partial' : 'complete';
const maxLevels = [20, 40, 50, 60, 70, 80, 90];
const minLevels = [1, 20, 40, 50, 60, 70, 80];
const maxTalents = [1, 1, 2, 4, 6, 8, 10];
const allowedMain: Record<Build['artifacts'][number]['slot'], readonly StatKey[]> = {
  flower: ['hp'], plume: ['attack'], sands: ['hpPercent', 'attackPercent', 'defensePercent', 'energyRecharge', 'elementalMastery'],
  goblet: ['hpPercent', 'attackPercent', 'defensePercent', 'elementalMastery', 'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus'],
  circlet: ['hpPercent', 'attackPercent', 'defensePercent', 'elementalMastery', 'critRate', 'critDamage', 'healingBonus'],
};
// Loose upper limits cover six maximum five-star rolls. Exact roll-history inference is not attempted.
const subLimits: Partial<Record<StatKey, number>> = { hp: 1793, attack: 117, defense: 139, hpPercent: 0.35, attackPercent: 0.35, defensePercent: 0.44, energyRecharge: 0.4, elementalMastery: 140, critRate: 0.24, critDamage: 0.48 };

/** Resolves only the versioned snapshot carried by the build; never consults a live catalog. */
export function resolveBuild(input: unknown, conditions: CombatConditions = {}): AttributePanel {
  const stats = zeroStats();
  const issues: CalculationIssue[] = [];
  const contributions: Contribution[] = [];
  const categoryModifiers: Contribution[] = [];
  const report = (code: CalculationIssue['code'], message: string) => { if (!issues.some(issue => issue.code === code && issue.message === message)) issues.push({ code, message }); };
  const finish = (): AttributePanel => ({ status: statusOf(issues), stats, contributions, categoryModifiers, diagnostics: issues.map(issue => issue.message), issues });
  const parsed = buildSchema.safeParse(input);
  if (!parsed.success) {
    report('invalid-input', '真实配装快照格式或数值无效。');
    return finish();
  }
  const build = parsed.data;
  const context = combatConditionsSchema.safeParse(conditions);
  if (!context.success) { report('invalid-input', '战斗条件格式或数值无效。'); return finish(); }
  const combat = context.data;
  const character = build.character;
  const weapon = build.weapon;
  if (character.attributes.base.hp <= 0 || character.attributes.base.attack < 0 || character.attributes.base.defense < 0 || character.attributes.base.critRate < 0 || character.attributes.base.critDamage < 0 || weapon.baseAttack < 0 || weapon.baseStat < 0) report('invalid-input', '角色或武器基础属性不能为负值，基础生命必须大于零。');
  const validLevel = (level: number, ascension: number) => level >= minLevels[ascension] && level <= maxLevels[ascension];
  if (!(validLevel(build.level, build.ascension) || (build.ascension === 6 && (build.level === 95 || build.level === 100)))) report('invalid-input', '角色等级与突破阶段不匹配。');
  if (!validLevel(build.weaponLevel, build.weaponAscension) || build.weaponAscension >= weapon.promotion.length) report('invalid-input', '武器等级与突破阶段不匹配。');
  if (Object.values(build.talents).some(level => level > maxTalents[build.ascension])) report('invalid-input', '天赋等级超出角色突破阶段上限。');
  if (weapon.weaponType !== character.identity.weaponType) report('invalid-input', '角色与武器类型不匹配。');
  if (!character.capabilities.calculation.supported) report('unsupported', character.capabilities.calculation.reason || '此角色的伤害规则尚未核验。');
  if (!weapon.support.supported) report('unsupported', weapon.support.reason || '此武器的伤害效果尚未核验。');
  if (build.constellation !== 0) report('unsupported', '当前真实伤害仅核验零命，所选命座效果尚未支持。');
  const promotion = character.progression.promotion[build.ascension];
  const weaponPromotion = weapon.promotion[build.weaponAscension];
  if (!promotion || weaponPromotion === undefined) { report('invalid-input', '成长或突破快照缺失。'); return finish(); }
  if (['hp','attack','defense'].some(stat => !Number.isFinite(character.progression.curves[stat as 'hp' | 'attack' | 'defense'][build.level]))) { report('invalid-input', '角色成长快照缺少该等级的数据。'); return finish(); }
  const baseHp = character.attributes.base.hp * character.progression.curves.hp[build.level] + promotion.hp;
  const characterAttack = character.attributes.base.attack * character.progression.curves.attack[build.level] + promotion.attack;
  const baseDefense = character.attributes.base.defense * character.progression.curves.defense[build.level] + promotion.defense;
  const weaponAttack = weapon.baseAttack * weapon.attackCurve[build.weaponLevel] + weaponPromotion;
  const baseAttack = characterAttack + weaponAttack;
  const add = (source: string, stat: StatKey, value: number, category?: Contribution['category']) => {
    if (!Number.isFinite(value)) { report('invalid-input', '配装成长或属性值不是有限数值。'); return; }
    const item = { source, stat, value, ...(category ? { category } : {}) };
    if (category) categoryModifiers.push(item);
    else { stats[stat] += value; contributions.push(item); }
  };
  contributions.push({ source: '角色等级与突破', stat: 'hp', value: baseHp }, { source: '角色等级与突破', stat: 'attack', value: characterAttack },
    { source: '角色等级与突破', stat: 'defense', value: baseDefense }, { source: '武器等级与突破', stat: 'attack', value: weaponAttack });
  add('固有暴击率', 'critRate', character.attributes.base.critRate);
  add('固有暴击伤害', 'critDamage', character.attributes.base.critDamage);
  add('基础元素充能效率', 'energyRecharge', 1);
  add('角色突破属性', character.attributes.specialized, promotion.specialized);
  add('武器副属性', weapon.stat, weapon.baseStat * weapon.statCurve[build.weaponLevel]);
  function modifiers(source: string, entries: Build['character']['attributes']['modifiers'], refinement: number) {
    for (const modifier of entries) {
      if (modifier.minAscension !== undefined && build.ascension < modifier.minAscension) continue;
      if (modifier.hpAbove !== undefined) {
        if (combat.hpRatio == null) { report('unknown', '生命比例尚未确认，无法判断生命条件效果。'); continue; }
        if (combat.hpRatio <= modifier.hpAbove) continue;
      }
      const value = modifier.values.length === 1 ? modifier.values[0] : modifier.values[refinement - 1];
      if (value === undefined) { report('invalid-input', '所选精炼等级的效果参数缺失。'); continue; }
      add(source, modifier.stat, value, modifier.category);
    }
  }
  modifiers('角色静态固有属性', character.attributes.modifiers, 1);
  modifiers('武器静态效果', weapon.modifiers, build.refinement);
  const ids = new Set<string>();
  const slots = new Set<string>();
  const setCounts = new Map<string, number>();
  for (const artifact of build.artifacts) {
    if (ids.has(artifact.id) || slots.has(artifact.slot)) report('invalid-input', '圣遗物实例或装备部位重复。');
    ids.add(artifact.id); slots.add(artifact.slot);
    if (!allowedMain[artifact.slot].includes(artifact.mainStat)) report('invalid-input', '圣遗物主词条与部位不匹配。');
    const main = build.artifactMain[artifact.mainStat]?.[artifact.level];
    if (main === undefined || main < 0) report('invalid-input', '圣遗物主词条成长数据缺失或非法。');
    else add(`圣遗物主词条（${artifact.slot}）`, artifact.mainStat, main);
    const substats = new Set<string>();
    for (const sub of artifact.substats) {
      const limit = subLimits[sub.stat];
      if (substats.has(sub.stat) || sub.stat === artifact.mainStat || limit === undefined || sub.value > limit + 1e-8) report('invalid-input', '圣遗物副词条重复、与主词条冲突或数值超出范围。');
      substats.add(sub.stat);
      add(`圣遗物副词条（${artifact.slot}）`, sub.stat, sub.value);
    }
    setCounts.set(artifact.setId, (setCounts.get(artifact.setId) ?? 0) + 1);
  }
  if (new Set(build.sets.map(set => set.id)).size !== build.sets.length) report('invalid-input', '套装定义快照重复。');
  for (const [id, count] of setCounts) {
    if (id === 'none') continue;
    const set = build.sets.find(entry => entry.id === id);
    if (!set) { report('unsupported', '已装备圣遗物的套装定义快照缺失。'); continue; }
    for (const effect of set.effects) {
      if (count < effect.pieces) continue;
      if (!effect.support.supported) report('unsupported', `${set.name}：${effect.support.reason || '此套装效果尚未核验。'}`);
      else modifiers(`${set.name}（${effect.pieces}件）`, effect.modifiers, 1);
    }
  }
  stats.hp = baseHp * (1 + stats.hpPercent) + stats.hp;
  stats.attack = baseAttack * (1 + stats.attackPercent) + stats.attack;
  stats.defense = baseDefense * (1 + stats.defensePercent) + stats.defense;
  if (Object.values(stats).some(value => !Number.isFinite(value)) || stats.hp <= 0 || stats.attack < 0 || stats.defense < 0) report('invalid-input', '计算后的配装面板不是合法有限值。');
  return finish();
}

/** Direct, non-reacting hit. The caller must explicitly choose the crit and reaction facts. */
export function evaluateDamage(buildInput: unknown, damageInput: DamageRequest | undefined, enemyInput: Enemy | undefined, extraBonus = 0, attackOverride?: number): DamageResult {
  const damage = damageInput === undefined ? undefined : damageRequestSchema.safeParse(damageInput);
  const panel = resolveBuild(buildInput, damage?.success ? damage.data.conditions : undefined);
  const issues = [...panel.issues];
  const parts: DamageResult['parts'] = { attack: panel.status === 'invalid' ? null : attackOverride ?? panel.stats.attack, multiplier: null, bonus: null, crit: null, defense: null, resistance: null };
  const report = (code: CalculationIssue['code'], message: string) => { if (!issues.some(issue => issue.code === code && issue.message === message)) issues.push({ code, message }); };
  const finish = (): DamageResult => {
    const status = statusOf(issues);
    const values = Object.values(parts);
    const product = values.every(value => value !== null) ? values.reduce<number>((total, value) => total * (value ?? 0), 1) : null;
    if (product !== null && !Number.isFinite(product)) report('invalid-input', '伤害计算溢出。');
    return { status: statusOf(issues), value: status === 'complete' && product !== null && Number.isFinite(product) ? product : null, panel, parts, diagnostics: issues.map(issue => issue.message), issues };
  };
  if (attackOverride !== undefined && (!Number.isFinite(attackOverride) || attackOverride < 0)) report('invalid-input', '效果修正后的攻击力必须为非负有限值。');
  const build = buildSchema.safeParse(buildInput);
  if (!build.success) return finish();
  if (!damage) { report('unknown', '尚未选择真实技能和命中条件。'); return finish(); }
  if (!damage.success) { report('invalid-input', '真实命中条件格式无效。'); return finish(); }
  if (damage.data.stateOverrides?.length) { report('invalid-input', '按队员指定的命中覆盖需要项目上下文，请通过时间轴求值。'); return finish(); }
  const skill = build.data.character.talents.find(entry => entry.id === damage.data.skillId);
  if (!skill) { report('invalid-input', '真实技能定义不在当前角色快照中。'); return finish(); }
  if (!skill.support.supported) {
    report('unsupported', skill.support.reason || '所选技能命中尚未核验。');
    return finish();
  }
  const level = build.data.talents[skill.category];
  const multiplier = skill.parameters.find(parameter => parameter.id === skill.hits[damage.data.hitIndex]?.parameter)?.values[level - 1];
  if (multiplier === undefined) report('invalid-input', '所选技能命中或天赋等级的倍率缺失。');
  else if (multiplier < 0) report('invalid-input', '真实技能倍率不能为负值。');
  else parts.multiplier = multiplier;
  if (!Number.isFinite(extraBonus)) report('invalid-input', '区间伤害加成不是有限数值。');
  const elementStat = `${skill.element}Bonus` as StatKey;
  let damageBonus = panel.stats[elementStat] ?? 0;
  let critRate = panel.stats.critRate;
  let critDamage = panel.stats.critDamage;
  for (const modifier of panel.categoryModifiers.filter(entry => entry.category === skill.category)) {
    if (modifier.stat === elementStat) damageBonus += modifier.value;
    else if (modifier.stat === 'critRate') critRate += modifier.value;
    else if (modifier.stat === 'critDamage') critDamage += modifier.value;
    else report('unsupported', '此类别专属属性修正尚未支持。');
  }
  parts.bonus = 1 + damageBonus + extraBonus;
  if (parts.bonus < 0 || critDamage < 0) report('invalid-input', '真实伤害乘区或暴击伤害不能为负值。');
  if (damage.data.crit === null) report('unknown', '暴击条件尚未确认。');
  else parts.crit = damage.data.crit === 'critical' ? 1 + critDamage : damage.data.crit === 'expected' ? 1 + Math.max(0, Math.min(1, critRate)) * critDamage : 1;
  if (damage.data.reaction === null) report('unknown', '反应条件尚未确认。');
  const enemy = enemyInput === undefined ? undefined : enemySchema.safeParse(enemyInput);
  if (!enemy) report('unknown', '目标等级与抗性尚未设置。');
  else if (!enemy.success) report('invalid-input', '目标等级、防御或抗性条件无效。');
  else {
    const own = build.data.level + 100;
    parts.defense = own / (own + (enemy.data.level + 100) * (1 - enemy.data.defenseReduction) * (1 - enemy.data.defenseIgnore));
    const resistance = enemy.data.resistances[skill.element];
    parts.resistance = resistance < 0 ? 1 - resistance / 2 : resistance < 0.75 ? 1 - resistance : 1 / (1 + 4 * resistance);
  }
  return finish();
}
