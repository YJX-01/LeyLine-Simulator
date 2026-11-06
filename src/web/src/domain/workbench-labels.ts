import type { WorkbenchProject } from '@leyline/schema';

const units: Record<string, string> = { scalar: '倍率', attack: '攻击力', damage: '伤害' };
const operations: Record<string, string> = { constant: '常量', input: '输入属性', add: '相加', multiply: '相乘', divide: '相除', condition: '条件选择', unsupported: '尚未支持', 'game-damage': '真实技能伤害' };
const diagnostics: Record<string, string> = { 'invalid-input': '输入格式有误', 'missing-reference': '引用内容缺失', 'duplicate-id': '标识重复', cycle: '公式存在循环引用', unit: '计算单位不匹配', unknown: '条件尚未确定', unsupported: '当前尚不支持此机制', arithmetic: '数值计算有误' };
const lookup = (labels: Record<string, string>, value: string, fallback: string) => Object.hasOwn(labels, value) ? labels[value] : fallback;
export const unitLabel = (value: string) => lookup(units, value, '未知单位');
export const operationLabel = (value: string) => lookup(operations, value, '未知运算');
export const diagnosticLabel = (value: string) => lookup(diagnostics, value, '计算需要检查');
export const statusLabel = (value: string) => lookup({ complete: '已完整计算', partial: '部分待确认', invalid: '输入需修正' }, value, '状态待确认');
export const capabilityLabel = (value: string) => lookup({ snapshot: '快照', history: '历史累计', probability: '概率' }, value, '未知机制');
export const inputLabel = (value: string) => lookup({ attack: '攻击力', triggered: '触发条件' }, value, value);
export function definitionLabel(project: WorkbenchProject, id: string): string {
  const name = project.definitions.find(entry => entry.id === id)?.name;
  if (name) return name;
  const known: Record<string, string> = { 'synthetic-character': '示例角色定义', 'weapon-a': '武器甲 · 区间加成', 'weapon-b': '武器乙 · 无加成', 'ordinary-hit': '普通伤害公式' };
  const index = project.definitions.findIndex(entry => entry.id === id);
  return index < 0 ? '缺失定义' : lookup(known, id, `定义${index + 1}`);
}
export function actorLabel(project: WorkbenchProject, id: string): string {
  const name = project.candidate.actors.find(entry => entry.id === id)?.name;
  if (name) return name;
  const index = project.candidate.actors.findIndex(entry => entry.id === id);
  return index < 0 ? '缺失角色' : id === 'actor' ? '示例角色' : `角色${index + 1}`;
}
export function recordLabel(project: WorkbenchProject, id: string): string {
  const record = project.timeline.find(entry => entry.id === id);
  if (!record) return '缺失记录';
  if (record.realDamage) {
    const actor = project.candidate.actors.find(entry => entry.id === record.actor);
    const skill = actor?.realBuild?.character.skills.find(entry => entry.id === record.realDamage?.skillId);
    return `${skill?.name ?? '真实技能'} · 第${record.realDamage.hitIndex + 1}段`;
  }
  const index = project.timeline.filter(entry => entry.kind === record.kind).findIndex(entry => entry.id === id);
  return `${record.kind === 'damage' ? '命中' : '动作'}${index + 1}`;
}
export function nodeLabel(project: WorkbenchProject, definitionId: string, id: string | null | undefined): string {
  if (!id) return '未指定公式';
  const nodes = project.definitions.find(entry => entry.id === definitionId)?.nodes ?? [];
  const index = nodes.findIndex(entry => entry.id === id);
  const known: Record<string, string> = { attack: '攻击力', multiplier: '倍率', base: '基础伤害', bonus: '伤害加成' };
  return index < 0 ? '缺失节点' : lookup(known, id, `节点${index + 1}`);
}
export function effectLabel(project: WorkbenchProject, definitionId: string, id: string): string {
  const index = project.definitions.find(entry => entry.id === definitionId)?.effects.findIndex(entry => entry.id === id) ?? -1;
  return index < 0 ? '缺失效果' : id === 'opening-bonus' ? '开场伤害加成' : `效果${index + 1}`;
}
export const projectLabel = (project: WorkbenchProject) => project.id === 'ordinary-example' ? '普通伤害示例轴' : '当前轴项目';
export const errorLabel = (message: string) => message.includes('JSON') ? '项目文件格式无法识别，请检查后重试。' : '操作未完成，请检查项目文件与计算规则。';

export const localDataErrorLabel = (message: string) => /[\u3400-\u9fff]/.test(message) ? message : '资料操作未完成，请检查文件或存储位置后重试。';

export const realStatLabels: Record<string, string> = { hp: '生命值', hpPercent: '生命值加成', attack: '攻击力', attackPercent: '攻击力加成', defense: '防御力', defensePercent: '防御力加成', critRate: '暴击率', critDamage: '暴击伤害', energyRecharge: '元素充能效率', elementalMastery: '元素精通', physicalBonus: '物理伤害加成', anemoBonus: '风元素伤害加成', geoBonus: '岩元素伤害加成', electroBonus: '雷元素伤害加成', hydroBonus: '水元素伤害加成', pyroBonus: '火元素伤害加成', cryoBonus: '冰元素伤害加成', dendroBonus: '草元素伤害加成', healingBonus: '治疗加成' };
export const realStatLabel = (key: string) => lookup(realStatLabels, key, '未识别属性');
export const realElementLabel = (key: string) => lookup({ physical: '物理', anemo: '风', geo: '岩', electro: '雷', hydro: '水', pyro: '火', cryo: '冰', dendro: '草' }, key, '未知元素');
export const realCategoryLabel = (key: string) => lookup({ normal: '普通攻击', skill: '元素战技', burst: '元素爆发' }, key, '未知技能类型');
