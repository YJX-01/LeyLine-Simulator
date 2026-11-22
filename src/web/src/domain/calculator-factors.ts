import { definitionKey, type CalculationTraceNode, type DamageRequest, type DamageResult, type EvaluatedValue } from '@leyline/schema';
import { realStatLabel } from './workbench-labels';
import type { CalculatorBuff } from './calculator-buffs';

export const damageNumber = (value?: number | null) => value == null || !Number.isFinite(value) ? '待确认' : value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
export const critNames = { noncritical: '非暴击', critical: '暴击', expected: '期望' };
export const reactionNames = { none: '无反应', vaporize: '蒸发', melt: '融化', aggravate: '超激化', spread: '蔓激化' };
const percent = (value?: number | null) => value == null ? '待确认' : damageNumber(value * 100) + '%';
const numeric = (entry?: EvaluatedValue | CalculationTraceNode) => entry?.state === 'known' && entry.value?.kind === 'quantity' ? entry.value.value : null;
type Row = [string, string];
export interface CalculatorFactor { label: string; value: number | null; multiplier: boolean; rows: Row[] }

/** Read the stages and dependencies of this output, including the inputs actually evaluated at the hit or capture. */
export function calculatorFactors(real: DamageResult, damage: DamageRequest, buffs: readonly CalculatorBuff[]): CalculatorFactor[] {
  const result = real.structured, output = result?.outputs.find(entry => entry.outputId === damage.hit.hitId);
  if (!result || !output) return [];
  const trace = new Map(result.trace.map(node => [node.id, node]));
  const stages = new Map(output.stages.map(stage => [stage.id, stage.value]));
  const rootKey = definitionKey(output.computation.definition);
  const rootNodes = new Map(result.trace.filter(node => definitionKey(node.definition) === rootKey).map(node => [node.nodeId, node]));
  const sources = new Map(buffs.map(buff => [buff.id,buff]));
  const branches = new Map<string, CalculationTraceNode[]>();
  function dependencies(start?: string) {
    if (!start) return [];
    const cached = branches.get(start);
    if (cached) return cached;
    const pending = [start], visited = new Set<string>(), nodes: CalculationTraceNode[] = [];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = trace.get(id);
      if (!node) continue;
      nodes.push(node);
      pending.push(...node.dependencies);
    }
    branches.set(start,nodes);
    return nodes;
  }
  function inputs(stage: string, fields: [string, string, boolean?][]): Row[] {
    const values = new Map<string, CalculationTraceNode>();
    for (const node of dependencies(stages.get(stage)?.traceId)) if (!values.has(node.nodeId)) values.set(node.nodeId,node);
    return fields.flatMap(([id,label,ratio]) => values.has(id) ? [[label, (ratio ? percent : damageNumber)(numeric(values.get(id)))] as Row] : []);
  }
  function contributions(traceId?: string): Row[] {
    const rows = new Map<string, Row>();
    for (const node of dependencies(traceId)) {
      const instance = node.context?.effectInstanceId;
      if (node.kind !== 'effect' || !instance || rows.has(instance)) continue;
      const source = sources.get(instance);
      if (!source) continue;
      const value = numeric(node);
      const formatted = node.value?.kind === 'quantity' && node.value.unit === 'scalar'
        ? source.target.endsWith('baseMultiplier') && value != null ? '× ' + damageNumber(value) : percent(value) : damageNumber(value);
      rows.set(instance, [source.source === source.name ? source.name : source.source + ' / ' + source.name, formatted]);
    }
    return [...rows.values()];
  }
  const cards: CalculatorFactor[] = [];
  function add(stage: string, label: string, rows: Row[], multiplier = true) {
    const entry = stages.get(stage);
    if (entry) cards.push({ label, value: numeric(entry), multiplier, rows: [...rows, ...contributions(entry.traceId)] });
  }
  const scaling: Row[] = real.scaling.map(term => [realStatLabel(term.stat) + ' × 倍率',
    damageNumber(term.attribute) + ' × ' + damageNumber(term.multiplier) + (term.count ? ' × ' + damageNumber(term.count.value) : '') + ' = ' + damageNumber(term.contribution)]);
  const stageRow = (key: string, label: string): Row => [label, damageNumber(numeric(stages.get(key)))];
  if (stages.has('skill-base')) {
    cards.push({ label: '数值 × 倍率区', value: numeric(rootNodes.get('base')), multiplier: false,
      rows: [...scaling, stageRow('skill-base','技能基础伤害'), stageRow('base-multiplier','基础伤害倍率'), stageRow('base-flat','附加基础伤害'), stageRow('reaction-base','反应基础加值'), ...contributions(rootNodes.get('base')?.id)] });
  } else {
    add('reaction-base', '反应基础伤害', [...scaling, ...inputs('reaction-base', [['skillBase','技能基础伤害'],['reactionCoefficient','反应系数'],['baseMultiplier','技能基数倍率']])], false);
    add('reaction-base-factor','反应基础倍率区', inputs('reaction-base-factor', [['one','基础倍率'],['reactionBaseBonus','反应基础加成',true]]));
  }
  add('bonus','增伤区', inputs('bonus', [['one','基础倍率'],['elementBonus','元素或物理伤害加成',true],['hitBonus','命中伤害加成',true],['targetReduction','目标减伤',true]]));
  add('reaction-bonus','反应增伤区', [stageRow('reaction-em','精通加成'), ...inputs('reaction-bonus',[['reactionBonus','反应伤害加成',true],['em','元素精通']])]);
  add('reaction-flat','反应固定加值', inputs('reaction-flat',[['flatBaseBonus','附加基础伤害']]), false);
  add('crit','暴击区', [['暴击方式', damage.crit ? critNames[damage.crit] : '待确认'],
    ...inputs('crit', [['critRate','暴击率',true],['critDamage','暴击伤害',true],['one','基础倍率']])]);
  add('defense','防御区', inputs('defense', [['characterLevel','角色等级'],['enemyLevel','目标等级'],['reduction','减防比例',true],['ignore','无视防御',true]]));
  add('resistance','抗性区', inputs('resistance', [['resistance','目标对应抗性',true]]));
  add('amplification','增幅反应区', [['反应', damage.reaction ? reactionNames[damage.reaction === 'none' ? 'none' : damage.reaction.type] : '待确认'],
    ...(real.reaction?.family === 'amplifying' ? [['反应系数',damageNumber(real.reaction.coefficient)],['元素精通',damageNumber(real.reaction.elementalMastery)],['反应加成',percent(real.reaction.bonus)]] as Row[] : [])]);
  add('elevation','反应提升区', inputs('elevation',[['elevation','反应伤害提升',true],['elevationFactor','提升倍率']]));
  return cards;
}
