import type { CalculationIssue, DamageResult, Element, HitReaction, ReactionBonusKey, ReactionRules } from '@leyline/schema';

/** A reaction modifies this recorded hit; it never emits another damage event. */
export function evaluateHitReaction(annotation: HitReaction, element: Element, level: number, rules: ReactionRules | undefined,
  read: (key: 'elementalMastery' | ReactionBonusKey) => number | null) {
  const family = annotation.type === 'vaporize' || annotation.type === 'melt' ? 'amplifying' : 'additive';
  const details: NonNullable<DamageResult['reaction']> = { type: annotation.type, family, trigger: annotation.trigger, element,
    elementalMastery: null, bonus: null, coefficient: null, levelMultiplier: null, multiplier: null, addedBaseDamage: null,
    rulesRevision: rules?.revision ?? null, sources: rules ? [rules.sources[family], ...(family === 'additive' ? [rules.sources.levels] : [])] : [] };
  const issues: CalculationIssue[] = [];
  const report = (code: CalculationIssue['code'], message: string) => { issues.push({ code, message }); };
  const compatible = annotation.type === 'vaporize' ? element === 'hydro' || element === 'pyro'
    : annotation.type === 'melt' ? element === 'pyro' || element === 'cryo'
    : annotation.type === 'aggravate' ? element === 'electro' : element === 'dendro';
  if (!compatible) report('invalid-input', '标注反应与本次命中元素不相容。');
  if (annotation.trigger === null) report('unknown', '反应触发归属尚未确认。');
  if (!rules) report('unknown', '配装快照缺少已采用的反应规则；不会读取最新目录补齐。');
  if (issues.length || !rules) return { details, issues };
  const em = read('elementalMastery');
  const bonus = read(`${annotation.type}ReactionBonus`);
  details.elementalMastery = em;
  details.bonus = bonus;
  if (em === null || bonus === null) { report('unknown', '反应所需精通或专属加成尚未完整求值。'); return { details, issues }; }
  if (!Number.isFinite(em) || em < 0 || !Number.isFinite(bonus)) {
    report('invalid-input', '反应精通须为非负有限数值，加成须为有限数值。'); return { details, issues };
  }
  if (annotation.type === 'vaporize' || annotation.type === 'melt') {
    const coefficient = annotation.type === 'vaporize'
      ? element === 'hydro' ? rules.amplifying.vaporize.hydro : rules.amplifying.vaporize.pyro
      : element === 'pyro' ? rules.amplifying.melt.pyro : rules.amplifying.melt.cryo;
    details.coefficient = coefficient;
    details.multiplier = coefficient * (1 + rules.amplifying.emNumerator * em / (rules.amplifying.emDenominator + em) + bonus);
    details.addedBaseDamage = 0;
  } else {
    const levelMultiplier = rules.levelMultipliers[level];
    details.coefficient = rules.additive[annotation.type];
    details.levelMultiplier = levelMultiplier ?? null;
    details.multiplier = 1;
    if (levelMultiplier == null) { report('unknown', '反应规则缺少当前等级系数，不外推或按零计算。'); return { details, issues }; }
    details.addedBaseDamage = details.coefficient * levelMultiplier
      * (1 + rules.additive.emNumerator * em / (rules.additive.emDenominator + em) + bonus);
  }
  if ([details.multiplier, details.addedBaseDamage].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
    report('invalid-input', '反应计算溢出或产生负伤害。');
    details.multiplier = null;
    details.addedBaseDamage = null;
  }
  return { details, issues };
}
