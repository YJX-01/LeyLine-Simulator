import { describe, expect, it } from 'vitest';
import type { WorkbenchNode, WorkbenchProject } from '@leyline/schema';
import { formatWorkbenchExpression, getDamagePresentation } from './workbench-display';

function customProject(nodes: WorkbenchNode[], root = 'root'): WorkbenchProject {
  return {
    schemaVersion: 1, rulesVersion: 'workbench-v1', id: 'custom-axis', revision: '1',
    definitions: [{ id: 'custom-formula', version: '7', source: { kind: 'user', reference: 'independent-display-example', verified: false }, nodes, effects: [], damage: root }],
    candidate: { id: 'candidate', actors: [{ id: 'invented-actor', character: 'fictional-character', weapon: 'fictional-weapon', inputs: {} }] },
    conditions: {}, timeline: [{ id: 'hit', actor: 'invented-actor', kind: 'damage', definition: 'custom-formula', timeMs: 700, order: 0 }], objective: {},
  };
}

describe('saved workbench expression presentation', () => {
  it('shows arithmetic structure and units without substituting candidate values', () => {
    const project = customProject([
      { id: 'power', op: 'input', key: 'custom-power', unit: 'damage' },
      { id: 'ratio', op: 'constant', quantity: { value: 0.75, unit: 'scalar' } },
      { id: 'product', op: 'multiply', left: 'power', right: 'ratio' },
      { id: 'sum', op: 'add', left: 'product', right: 'power' },
      { id: 'root', op: 'divide', left: 'sum', right: 'ratio' },
    ]);
    project.candidate.actors[0].inputs['custom-power'] = { value: 12345, unit: 'damage' };
    expect(formatWorkbenchExpression(project, 'custom-formula')).toBe('(((custom-power [伤害] × 0.75 [倍率]) + custom-power [伤害]) ÷ 0.75 [倍率])');
    expect(formatWorkbenchExpression(project, 'custom-formula', 'ratio')).toBe('0.75 [倍率]');
  });

  it('preserves explicit conditional and unsupported nodes rather than guessing a result', () => {
    const project = customProject([
      { id: 'yes', op: 'constant', quantity: { value: 80, unit: 'attack' } },
      { id: 'no', op: 'unsupported', capability: 'snapshot' },
      { id: 'root', op: 'condition', key: 'flag', yes: 'yes', no: 'no' },
    ]);
    project.conditions.flag = true;
    expect(formatWorkbenchExpression(project, 'custom-formula')).toBe('(条件 flag ? 80 [攻击力] : 尚未支持(快照))');
  });

  it('reports missing references and cycles without throwing', () => {
    const project = customProject([{ id: 'root', op: 'add', left: 'root', right: 'absent' }]);
    expect(formatWorkbenchExpression(project, 'custom-formula')).toBe('(循环引用 + 缺失节点)');
    expect(formatWorkbenchExpression(project, 'absent-definition')).toBe('缺失定义');
    expect(formatWorkbenchExpression(project, 'custom-formula', 'absent-root')).toBe('缺失节点');
  });

  it('bounds both deep chains and repeated expansion of a small expression graph', () => {
    const nodes: WorkbenchNode[] = [{ id: 'base', op: 'constant', quantity: { value: 1, unit: 'scalar' } }];
    for (let index = 0; index < 40; index++) nodes.push({ id: `node-${index}`, op: 'add', left: index ? `node-${index - 1}` : 'base', right: 'base' });
    expect(formatWorkbenchExpression(customProject(nodes, 'node-39'), 'custom-formula')).toBe('表达式过长');
    const repeated: WorkbenchNode[] = [{ id: 'base', op: 'constant', quantity: { value: 1, unit: 'scalar' } }];
    for (let index = 0; index < 10; index++) repeated.push({ id: `node-${index}`, op: 'add', left: index ? `node-${index - 1}` : 'base', right: index ? `node-${index - 1}` : 'base' });
    expect(formatWorkbenchExpression(customProject(repeated, 'node-9'), 'custom-formula')).toBe('表达式过长');
  });

  it('gets actor, rule version and formula from the selected custom record', () => {
    const project = customProject([{ id: 'root', op: 'constant', quantity: { value: 31, unit: 'damage' } }]);
    expect(getDamagePresentation(project, 'hit')).toEqual({ actorLabel: '角色1', definitionLabel: '定义1 · 版本7', rootLabel: '节点1', expression: '31 [伤害]' });
    project.candidate.actors = [];
    expect(getDamagePresentation(project, 'hit').actorLabel).toBe('缺失角色');
    project.definitions = [];
    expect(getDamagePresentation(project, 'hit').definitionLabel).toBe('缺失定义');
    expect(getDamagePresentation(project, 'absent')).toEqual({ actorLabel: '未选择角色', definitionLabel: '未选择定义', rootLabel: '未指定公式', expression: '未选择记录' });
  });
});
