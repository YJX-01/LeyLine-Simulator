import { buildSchema, damageRequestSchema, enemySchema, reactionBonusKeys, talentLevelBonus, talentInputIssues, type DamageRequest, type Enemy, type StatKey, type ReactionBonusKey, type HitDamageKey, type DamageResult, type CalculationIssue } from '@leyline/schema';
import { resolveStaticBuild } from './build';
import { evaluateHitBase } from './hit-base';
import { percentStat, relevantPanelIssues } from './stat-dependencies';
import { evaluateHitReaction } from './hit-reaction';

export type DamageAttributeKey = StatKey | ReactionBonusKey | HitDamageKey;
export type DamageAttributeReader = (stat: DamageAttributeKey) => number | null;
export interface DamageCaptureContext { read: DamageAttributeReader; panel: DamageResult['panel'] }

/** Compose audited hit and reaction components before the common combat multipliers. */
export function calculateDamageProduct(baseDamage: number | null, parts: DamageResult['parts'], reaction?: DamageResult['reaction'], baseDamageBonus: number | null = 0): number | null {
  const multiplier = reaction ? reaction.multiplier : 1;
  const added = reaction ? reaction.addedBaseDamage : 0;
  return baseDamage !== null && parts.bonus !== null && parts.crit !== null && parts.defense !== null && parts.resistance !== null
    && multiplier !== null && added !== null && baseDamageBonus !== null
    ? (baseDamage + baseDamageBonus + added) * parts.bonus * parts.crit * parts.defense * parts.resistance * multiplier : null;
}

/** The same formula consumes either snapshot attributes or the timeline's dependency reader. */
export function evaluateDamage(buildInput: unknown, damageInput: DamageRequest | undefined, enemyInput: Enemy | undefined, extraBonus = 0, reader?: DamageAttributeReader, captureContext?: DamageCaptureContext): DamageResult {
  const damage = damageInput === undefined ? undefined : damageRequestSchema.safeParse(damageInput);
  const panel = resolveStaticBuild(buildInput, damage?.success ? damage.data.conditions : undefined);
  const issues: CalculationIssue[] = [];
  const parts: DamageResult['parts'] = { attack: null, multiplier: null, bonus: null, crit: null, defense: null, resistance: null };
  let baseDamage: number | null = null;
  let baseDamageBonus: number | null = 0;
  let scaling: DamageResult['scaling'] = [];
  let reaction: DamageResult['reaction'];
  let capture: DamageResult['capture'];
  const report = (code: CalculationIssue['code'], message: string) => {
    if (!issues.some(issue => issue.code === code && issue.message === message)) issues.push({ code, message });
  };
  const include = (selected: CalculationIssue[]) => { for (const issue of selected) report(issue.code, issue.message); };
  const finish = (): DamageResult => {
    const product = calculateDamageProduct(baseDamage, parts, reaction, baseDamageBonus);
    if (product !== null && !Number.isFinite(product)) report('invalid-input', '伤害计算溢出。');
    const status = issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : issues.length ? 'partial' : 'complete';
    return { status, value: status === 'complete' && product !== null && Number.isFinite(product) ? product : null,
      panel, parts, baseDamage, baseDamageBonus, scaling, ...(capture ? { capture } : {}), ...(reaction ? { reaction } : {}), diagnostics: issues.map(issue => issue.message), issues };
  };
  // Snapshot/reference errors remain global; stat-specific unknowns are checked on demand below.
  include(panel.issues.filter(issue => !issue.affects));
  const build = buildSchema.safeParse(buildInput);
  if (!build.success) return finish();
  if (!damage) { report('unknown', '尚未选择真实技能和命中条件。'); return finish(); }
  if (!damage.success) { report('invalid-input', '真实命中条件格式无效。'); return finish(); }
  if (damage.data.stateOverrides?.length) { report('invalid-input', '按队员指定的命中覆盖需要项目上下文，请通过时间轴求值。'); return finish(); }
  if (damage.data.effectApplications?.length && !reader) { report('invalid-input', '效果实例适用事实需要项目上下文或完整属性reader。'); return finish(); }
  const skill = build.data.character.talents.find(entry => entry.id === damage.data.skillId);
  if (!skill) { report('invalid-input', '真实技能定义不在当前角色快照中。'); return finish(); }
  const inputIssues = talentInputIssues(skill, damage.data.inputs, build.data.constellation);
  if (inputIssues.length) { for (const message of inputIssues) report('invalid-input', message); return finish(); }
  if (skill.noIndependentDamage) { report('invalid-input', '所选技能没有独立伤害命中；强化或辅助规则不能作为一次攻击求值。'); return finish(); }
  if (!skill.support.supported) report('unsupported', skill.support.reason || '所选技能命中尚未核验。');
  const hit = skill.hits[damage.data.hitIndex];
  if (!hit) {
    if (skill.support.supported || skill.hits.length) report('invalid-input', '所选技能命中参数缺失。');
    return finish();
  }
  const category = hit.category ?? skill.category;
  const element = hit.element ?? skill.element;
  const snapshotAttributes = new Set(hit.snapshot?.attributes ?? []);
  if (hit.snapshot) {
    capture = { recordId: damage.data.capture?.recordId ?? null, phase: damage.data.capture?.phase ?? null,
      attributes: hit.snapshot.attributes, source: hit.snapshot.source };
  } else if (damage.data.capture) report('invalid-input', '此命中未声明属性捕获规则。');
  const cache = new Map<string, number | null>();
  const readAttribute = (stat: DamageAttributeKey, captured: boolean): number | null => {
    const cacheKey = `${captured ? 'source' : 'current'}:${stat}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    if (captured && (!capture?.recordId || !capture.phase || !captureContext)) report('unknown', '命中所需的属性捕获来源或求值上下文尚未完整提供，不回退到当前属性。');
    const reactionBonus = (reactionBonusKeys as readonly string[]).includes(stat);
    const hitQuantity = stat === 'baseDamageBonus';
    const attributePanel = captured ? captureContext?.panel : panel;
    const categories = attributePanel?.categoryModifiers.filter(entry => entry.category === category) ?? [];
    const relevant = attributePanel ? relevantPanelIssues(attributePanel, reactionBonus || hitQuantity ? [] : [stat as StatKey], category) : [];
    include(relevant);
    let value = captured ? capture?.recordId && capture.phase && captureContext ? captureContext.read(stat) : null
      : reader ? reader(stat) : relevant.length ? null : reactionBonus || hitQuantity ? 0 : panel.stats[stat as StatKey];
    if (reader && !captured && !reactionBonus && !hitQuantity && value !== null && Number.isFinite(value)) panel.stats[stat as StatKey] = value;
    if (value !== null) {
      value += categories.filter(entry => entry.stat === stat).reduce((total, entry) => total + entry.value, 0);
      const percent = percentStat(stat);
      if (percent && attributePanel?.baseStats) value += attributePanel.baseStats[stat as keyof typeof attributePanel.baseStats]
        * categories.filter(entry => entry.stat === percent).reduce((total, entry) => total + entry.value, 0);
    }
    if (value !== null && !Number.isFinite(value)) { report('invalid-input', '伤害依赖属性不是有限数值。'); value = null; }
    if (value === null) report('unknown', `伤害依赖属性尚未完整求值：${stat}`);
    cache.set(cacheKey, value);
    return value;
  };
  const read: DamageAttributeReader = stat => readAttribute(stat, snapshotAttributes.has(stat as StatKey));
  const level = build.data.talents[skill.category] + talentLevelBonus(build.data.character, skill.category, build.data.constellation);
  const base = evaluateHitBase(skill, damage.data.hitIndex, level, read, damage.data.inputs, build.data.constellation);
  baseDamage = base.value;
  scaling = base.scaling;
  if (base.invalid) report('invalid-input', '命中缩放参数、天赋等级或基础伤害无效。');
  for (const input of base.unknownInputs) report('unknown', `命中所需的技能输入尚未确认：${input}`);
  baseDamageBonus = readAttribute('baseDamageBonus', false);
  if (baseDamageBonus !== null && baseDamageBonus < 0) report('invalid-input', '附加基础伤害不能为负值。');
  parts.attack = scaling.find(term => term.stat === 'attack')?.attribute ?? null;
  parts.multiplier = scaling[0]?.multiplier ?? null;
  if (!Number.isFinite(extraBonus)) report('invalid-input', '区间伤害加成不是有限数值。');
  const bonus = read(`${element}Bonus` as StatKey);
  parts.bonus = bonus === null ? null : 1 + bonus + extraBonus;
  if (parts.bonus !== null && parts.bonus < 0) report('invalid-input', '真实伤害乘区不能为负值。');
  if (damage.data.crit === null) report('unknown', '暴击条件尚未确认。');
  else if (damage.data.crit === 'noncritical') parts.crit = 1;
  else {
    const critDamage = read('critDamage');
    if (critDamage !== null && critDamage < 0) report('invalid-input', '暴击伤害不能为负值。');
    if (damage.data.crit === 'critical') parts.crit = critDamage === null ? null : 1 + critDamage;
    else {
      const critRate = read('critRate');
      parts.crit = critDamage === null || critRate === null ? null : 1 + Math.max(0, Math.min(1, critRate)) * critDamage;
    }
  }
  if (damage.data.reaction === null) report('unknown', '反应条件尚未确认。');
  else if (damage.data.reaction !== 'none') {
    const evaluated = evaluateHitReaction(damage.data.reaction, element, build.data.level, build.data.reactionRules, stat => readAttribute(stat, false));
    reaction = evaluated.details;
    include(evaluated.issues);
  }
  const enemy = enemyInput === undefined ? undefined : enemySchema.safeParse(enemyInput);
  if (!enemy) report('unknown', '目标等级与抗性尚未设置。');
  else if (!enemy.success) report('invalid-input', '目标等级、防御或抗性条件无效。');
  else {
    const own = build.data.level + 100;
    parts.defense = own / (own + (enemy.data.level + 100) * (1 - enemy.data.defenseReduction) * (1 - enemy.data.defenseIgnore));
    const resistance = enemy.data.resistances[element];
    parts.resistance = resistance < 0 ? 1 - resistance / 2 : resistance < 0.75 ? 1 - resistance : 1 / (1 + 4 * resistance);
  }
  return finish();
}
