import { buildSchema, combatConditionsSchema, statKeys, type Build, type CombatConditions, type StatKey } from '@leyline/schema';

import type { CalculationStatus, CalculationIssue, Contribution, AttributePanel } from '@leyline/schema';
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
export function resolveStaticBuild(input: unknown, conditions: CombatConditions = {}): AttributePanel {
  const stats = zeroStats();
  const issues: CalculationIssue[] = [];
  const contributions: Contribution[] = [];
  const categoryModifiers: Contribution[] = [];
  let baseStats: AttributePanel['baseStats'];
  const report = (code: CalculationIssue['code'], message: string, scope?: NonNullable<CalculationIssue['affects']>[number]) => {
    const existing = issues.find(issue => issue.code === code && issue.message === message);
    if (!existing) issues.push({ code, message, ...(scope ? { affects: [scope] } : {}) });
    else if (!scope) delete existing.affects;
    else if (existing.affects && !existing.affects.some(entry => entry.stat === scope.stat && entry.category === scope.category)) existing.affects.push(scope);
  };
  const finish = (): AttributePanel => ({ status: statusOf(issues), stats, contributions, categoryModifiers, ...(baseStats ? { baseStats } : {}), diagnostics: issues.map(issue => issue.message), issues });
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
  baseStats = { hp: baseHp, attack: baseAttack, defense: baseDefense };
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
        if (combat.hpRatio == null) { report('unknown', '生命比例尚未确认，无法判断生命条件效果。', { stat: modifier.stat, category: modifier.category }); continue; }
        if (combat.hpRatio <= modifier.hpAbove) continue;
      }
      const value = modifier.values.length === 1 ? modifier.values[0] : modifier.values[refinement - 1];
      if (value === undefined) { report('invalid-input', '所选精炼等级的效果参数缺失。', { stat: modifier.stat, category: modifier.category }); continue; }
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
