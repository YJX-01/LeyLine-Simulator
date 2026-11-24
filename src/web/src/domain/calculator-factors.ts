import { definitionKey, type CalculationTraceNode, type DamageRequest, type DamageResult, type EvaluatedValue } from '@leyline/schema';
import { buffDisplayName, buffTargetLabel, type CalculatorBuff } from './calculator-buffs';

export const damageNumber = (value?: number | null) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
/** Current-format files can carry support notes written by earlier catalog revisions. */
export function calculatorSupportText(message: string) {
  return message.replace(/(?:尚|仍)?待(?:核实|核验|确认)/g, '尚无验证结论').replaceAll('需补充条件', '缺少计算所需的输入');
}
export const critNames = { noncritical: '非暴击', critical: '暴击', expected: '期望' };
export const reactionNames = { none: '无反应', vaporize: '蒸发', melt: '融化', aggravate: '超激化', spread: '蔓激化' };
const percent = (value?: number | null) => value == null ? '—' : damageNumber(value * 100) + '%';
const numeric = (entry?: EvaluatedValue | CalculationTraceNode) => entry?.state === 'known' && entry.value?.kind === 'quantity' ? entry.value.value : null;
type Row = [string, string];
export interface FactorItem { id: string; label: string; value: string; source?: string }
interface FactorColumn { title: string; total: string; rows: FactorItem[]; formula?: string }
interface BaseScaling {
  terms: DamageResult['scaling'];
  attributes: FactorItem[];
  multipliers: FactorItem[];
  subtotal: number | null;
  flat: FactorItem[];
  reaction: FactorItem[];
}
export interface CalculatorFactor {
  id: string;
  label: string;
  value: number | null;
  multiplier: boolean;
  rows: FactorItem[];
  scaling?: BaseScaling;
  detail?: { columns: FactorColumn[]; equation: string };
}

function buffRow(source: CalculatorBuff | undefined, modifierId: string, value: number | null, unit?: string): Row | undefined {
  const modifier = source?.modifiers.find(entry => entry.id === modifierId);
  if (!source || !modifier) return;
  const label = buffDisplayName(source);
  const name = (source.source === label ? label : source.source + ' / ' + label) + ' · ' + buffTargetLabel(modifier.target);
  const target = modifier.target.replace(/^attribute\./, '');
  const isMultiplier = target.endsWith('baseMultiplier') || target.endsWith('elevationFactor')
    || target === 'lohenWillGainMultiplier' || target === 'incomingPoiseDamageMultiplier';
  if (target === 'aimChargeInstant' && value === 1) return [name, '本次免蓄力'];
  if (target === 'aimChargeTimeReductionPerEnergy' && value != null) return [name, damageNumber(value / 1000) + ' 秒/点'];
  if (target === 'confirmedSkillCooldownResetMs' && value != null) return [name, damageNumber(value / 1000) + ' 秒（重置后 0 秒）'];
  if (target === 'confirmedSkillChargesRestored' && value != null) return [name, damageNumber(value) + ' 次'];
  if (unit === 'milliseconds' && value != null) return [name, damageNumber(value / 1000) + ' 秒'];
  const formatted = isMultiplier && value != null ? '× ' + damageNumber(value)
    : unit === 'scalar' && !['actorEndureDelta', 'lohenWillLimit'].includes(target) ? percent(value) : damageNumber(value);
  return [name, formatted];
}

export function calculatorBuffReadouts(real: DamageResult | undefined, buffs: readonly CalculatorBuff[]) {
  const sources = new Map(buffs.map(buff => [buff.id, buff]));
  const bySource = new Map<string, Row[]>();
  for (const entry of real?.panel.effectValues ?? []) {
    const row = buffRow(sources.get(entry.instanceId), entry.modifierId, entry.value, entry.unit);
    if (!row) continue;
    const rows = bySource.get(entry.instanceId);
    if (rows) rows.push(row);
    else bySource.set(entry.instanceId, [row]);
  }
  return bySource;
}

export function calculatorBuffValues(real: DamageResult, buffs: readonly CalculatorBuff[]): Row[] {
  return [...calculatorBuffReadouts(real, buffs).values()].flat();
}

function traceReader(nodes: CalculationTraceNode[]) {
  const trace = new Map(nodes.map(node => [node.id, node]));
  const branches = new Map<string, CalculationTraceNode[]>();
  const directBranches = new Map<string, CalculationTraceNode[]>();
  return function dependencies(start?: string, stopAtEffects = false) {
    if (!start) return [];
    const cache = stopAtEffects ? directBranches : branches;
    const cached = cache.get(start);
    if (cached) return cached;
    const pending = [start], visited = new Set<string>(), nodes: CalculationTraceNode[] = [];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = trace.get(id);
      if (!node) continue;
      nodes.push(node);
      if (!stopAtEffects || node.kind !== 'effect') pending.push(...node.dependencies);
    }
    cache.set(start,nodes);
    return nodes;
  };
}

/** Read the stages and dependencies of this output, including the inputs actually evaluated at the hit or capture. */
export function calculatorFactors(real: DamageResult, damage: DamageRequest, buffs: readonly CalculatorBuff[],
  expected?: DamageResult, guaranteedCrit = false): CalculatorFactor[] {
  const result = real.structured, output = damage.hit.hitId ? result?.outputs.find(entry => entry.outputId === damage.hit.hitId) : result?.outputs[0];
  if (!result || !output) return [];
  const dependencies = traceReader(result.trace);
  const stages = new Map(output.stages.map(stage => [stage.id, stage.value]));
  const rootKey = definitionKey(output.computation.definition);
  const rootNodes = new Map(result.trace.filter(node => definitionKey(node.definition) === rootKey).map(node => [node.nodeId, node]));
  const sources = new Map(buffs.map(buff => [buff.id,buff]));
  function item(id: string, label: string, value: number | null, format = damageNumber): FactorItem[] {
    return value === 0 ? [] : [{ id, label, value: value == null ? '条件不足' : format(value) }];
  }
  function inputs(stage: string, fields: [string, string, boolean?][], keepZero = false, nodes = dependencies(stages.get(stage)?.traceId)): FactorItem[] {
    const values = new Map<string, CalculationTraceNode>();
    for (const node of nodes) if (!values.has(node.nodeId)) values.set(node.nodeId, node);
    return fields.flatMap(([id, label, ratio]) => {
      if (!values.has(id)) return [];
      const value = numeric(values.get(id)), format = ratio ? percent : damageNumber;
      return keepZero && value === 0 ? [{ id, label, value: format(value) }] : item(id, label, value, format);
    });
  }
  function contributions(traceId?: string, targets?: readonly string[], nodes = dependencies(traceId)): FactorItem[] {
    const rows = new Map<string, FactorItem>();
    for (const node of nodes) {
      const instance = node.context?.effectInstanceId;
      if (node.kind !== 'effect' || !instance) continue;
      const source = sources.get(instance);
      const modifier = source?.modifiers.find(entry => entry.id === node.nodeId);
      if (!source || !modifier || (targets && !targets.includes(modifier.target))) continue;
      const id = JSON.stringify([instance, node.nodeId]);
      const amount = numeric(node);
      if (rows.has(id) || amount === 0) continue;
      const row = buffRow(source, node.nodeId, amount, node.value?.kind === 'quantity' ? node.value.unit : undefined)!;
      rows.set(id, { id, label: buffDisplayName(source), source: source.source + ' / ' + buffTargetLabel(modifier.target),
        value: amount == null ? '条件不足' : row[1] });
    }
    return [...rows.values()];
  }
  // In these input branches an effect is already a contribution. Its own inputs
  // (e.g. a teammate's mastery) must not appear as additional bonuses.
  function statRows(nodes: CalculationTraceNode[], stat: string, format = percent): FactorItem[] {
    const attribute = nodes.find(node => node.kind === 'attribute' && node.nodeId.endsWith('.' + stat));
    const base = attribute && nodes.find(node => definitionKey(node.definition) === definitionKey(attribute.definition)
      && !node.dependencies.length && (node.nodeId === stat || node.nodeId === 'constant' || node.nodeId === attribute.nodeId));
    const rows = contributions(undefined, undefined, nodes);
    if (attribute && base) {
      const label = base.nodeId === attribute.nodeId ? '结算时面板' : attribute.nodeId.startsWith('attribute.reaction.') ? '反应基础值' : '基础面板';
      rows.unshift(...item('base', label, numeric(base), format));
    }
    return rows;
  }
  const cards: CalculatorFactor[] = [];
  function add(stage: string, label: string, rows: FactorItem[], multiplier = true, scaling?: BaseScaling) {
    const entry = stages.get(stage);
    if (entry) cards.push({ id: stage, label, value: numeric(entry), multiplier, scaling, rows: [...rows, ...contributions(entry.traceId)] });
  }
  function stageItems(stage: string, label: string, format = damageNumber) {
    const entry = stages.get(stage);
    return entry ? item(stage, label, numeric(entry), format) : [];
  }
  const terms = real.scaling.filter(term => term.contribution !== 0);
  if (stages.has('skill-base')) {
    const flatStage = stages.get('base-flat');
    const flat = contributions(flatStage?.traceId, ['attribute.baseDamageBonus', 'base-flat']);
    const flatRows = flat.length ? flat : stageItems('base-flat', '附加基础伤害');
    const multiplier = numeric(stages.get('base-multiplier'));
    cards.push({ id: 'base', label: '属性 × 倍率区', value: numeric(rootNodes.get('base')), multiplier: false,
      rows: [], scaling: { terms, subtotal: numeric(rootNodes.get('scaledBase')),
        attributes: contributions(stages.get('skill-base')?.traceId),
        multipliers: [
          ...(multiplier === 1 || !stages.has('base-multiplier') ? [] : [{ id: 'base-multiplier', label: '基础伤害倍率', value: '× ' + damageNumber(multiplier) }]),
          ...contributions(stages.get('base-multiplier')?.traceId),
        ],
        flat: flatRows.map(row => ({ ...row, value: /^\d/.test(row.value) ? '+' + row.value : row.value })),
        reaction: [...stageItems('reaction-base', '反应基础加值'), ...contributions(stages.get('reaction-base')?.traceId)] },
    });
  } else {
    add('reaction-base', '反应基础伤害', inputs('reaction-base', [['skillBase','技能基础伤害'],['reactionCoefficient','反应系数'],['baseMultiplier','技能基数倍率']]), false,
      real.scaling.length ? { terms, attributes: [], multipliers: [], subtotal: numeric(rootNodes.get('scaledSkillBase') ?? rootNodes.get('skillBase')), flat: [], reaction: [] } : undefined);
    add('reaction-base-factor','反应基础倍率区', inputs('reaction-base-factor', [['one','基础倍率'],['reactionBaseBonus','反应基础加成',true]]));
  }
  add('bonus','增伤区', inputs('bonus', [['one','基础倍率'],['elementBonus','元素或物理伤害加成',true],['hitBonus','命中伤害加成',true],['targetReduction','目标减伤',true]]));
  const reactionStage = stages.get('reaction-bonus');
  if (reactionStage) {
    const title = output.family.startsWith('stellar-') ? '星反应' : output.family.startsWith('lunar-') ? '月反应' : '反应';
    const emNodes = dependencies(stages.get('reaction-em')?.traceId, true);
    const em = numeric(emNodes.find(node => node.nodeId === 'em'));
    const emBonus = numeric(stages.get('reaction-em'));
    const numerator = numeric(emNodes.find(node => node.nodeId === 'numerator'));
    const denominator = numeric(emNodes.find(node => node.nodeId === 'denominator'));
    const conversion = numerator != null && denominator != null
      ? `${damageNumber(numerator)} × ${damageNumber(em)} / (${damageNumber(em)} + ${damageNumber(denominator)}) = ${percent(emBonus)}` : undefined;
    const bonusInput = dependencies(reactionStage.traceId, true).find(node => node.nodeId === 'reactionBonus');
    const bonus = numeric(bonusInput);
    const value = numeric(reactionStage);
    cards.push({ id: 'reaction-bonus', label: title + '增伤区', multiplier: true, value, rows: [],
      detail: { columns: [
        { title: '精通加成', total: percent(emBonus), formula: conversion, rows: [
          { id: 'em', label: '本击元素精通', value: damageNumber(em) }, ...statRows(emNodes, 'elementalMastery', damageNumber),
        ] },
        { title: title + '伤害加成', total: percent(bonus), rows: contributions(undefined, undefined, dependencies(bonusInput?.id, true)) },
      ], equation: '1 + ' + percent(emBonus) + ' + ' + percent(bonus) + ' = ' + damageNumber(value) } });
  }
  if (numeric(stages.get('reaction-flat')) !== 0) add('reaction-flat','反应固定加值', inputs('reaction-flat',[['flatBaseBonus','附加基础伤害']]), false);
  const critStage = stages.get('crit');
  if (critStage) {
    // A noncritical hit can short-circuit before it reads either CRIT stat. The
    // expectation trace contains the hit-specific rate, damage and modifiers.
    const evaluation = expected?.structured;
    const expectedStage = evaluation?.outputs.find(entry => entry.outputId === output.outputId)?.stages.find(stage => stage.id === 'crit')?.value;
    const expectedBranch = evaluation && evaluation !== result ? traceReader(evaluation.trace) : dependencies;
    const nodes = expectedBranch(expectedStage?.traceId, true);
    const rateInput = nodes.find(node => node.nodeId === 'critRate');
    const damageInput = nodes.find(node => node.nodeId === 'critDamage');
    const rawRate = numeric(rateInput);
    const rate = guaranteedCrit ? 1 : numeric(nodes.find(node => node.nodeId === 'clampedRate') ?? rateInput);
    const critDamage = numeric(damageInput);
    const value = numeric(expectedStage);
    const fixed = output.family === 'transformative' && !rateInput && !damageInput && value === 1;
    cards.push({ id: 'crit', label: '暴击区', multiplier: true, value, rows: [],
      detail: { columns: fixed ? [] : [
        { title: '暴击率', total: percent(rate), formula: !guaranteedCrit && rawRate != null && rate != null && rate !== rawRate
          ? '合计 ' + percent(rawRate) + '，按 ' + percent(rate) + ' 计算' : undefined,
          rows: guaranteedCrit ? [{ id: 'always', label: '本击必定暴击', value: '100%' }]
          : statRows(expectedBranch(rateInput?.id, true), 'critRate') },
        { title: '暴击伤害', total: percent(critDamage), rows: statRows(expectedBranch(damageInput?.id, true), 'critDamage') },
      ], equation: fixed ? '本次反应无法暴击，期望倍率为 1' : '1 + ' + percent(rate) + ' × ' + percent(critDamage) + ' = ' + damageNumber(value) } });
  }
  add('defense','防御区', inputs('defense', [['characterLevel','角色等级'],['enemyLevel','目标等级'],['reduction','减防比例',true],['ignore','无视防御',true]]));
  add('resistance','抗性区', inputs('resistance', [['resistance','目标对应抗性',true]], true));
  add('amplification','增幅反应区', [{ id: 'reaction', label: '反应', value: damage.reaction ? reactionNames[damage.reaction === 'none' ? 'none' : damage.reaction.type] : '条件不足' },
    ...(real.reaction?.family === 'amplifying' ? [...item('coefficient', '反应系数', real.reaction.coefficient),
      ...item('em', '元素精通', real.reaction.elementalMastery), ...item('reactionBonus', '反应加成', real.reaction.bonus, percent)] : [])]);
  add('elevation','反应提升区', inputs('elevation',[['elevation','反应伤害提升',true],['elevationFactor','提升倍率']]));
  if (numeric(stages.get('ordinary-elevation')) !== 1) add('ordinary-elevation', '擢升区', inputs('ordinary-elevation', [['elevationFactor', '擢升倍率']]));
  return cards;
}
