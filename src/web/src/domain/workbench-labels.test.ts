import { describe, expect, it } from 'vitest';
import { createWorkbenchProject } from '../../../../tests/helpers/workbench-samples';
import { actorLabel, definitionLabel, recordLabel, unitLabel, operationLabel, diagnosticLabel, statusLabel, inputLabel, errorLabel } from './workbench-labels';

describe('Chinese workbench labels', () => {
  it('translates built-in units, operations, states and diagnostics with Chinese fallbacks', () => {
    expect(unitLabel('attack')).toBe('攻击力');
    expect(unitLabel('unknown')).toBe('未知单位');
    expect(unitLabel('toString')).toBe('未知单位');
    expect(operationLabel('multiply')).toBe('相乘');
    expect(operationLabel('unknown')).toBe('未知运算');
    expect(statusLabel('complete')).toBe('已完整计算');
    expect(statusLabel('future')).toBe('状态待确认');
    expect(diagnosticLabel('missing-reference')).toBe('引用内容缺失');
    expect(diagnosticLabel('future')).toBe('计算需要检查');
    expect(errorLabel('Unexpected JSON token')).toBe('项目文件格式无法识别，请检查后重试。');
    expect(errorLabel('unknown engine error')).toBe('操作未完成，请检查项目文件与计算规则。');
    expect(inputLabel('my-custom-input')).toBe('my-custom-input');
  });
  it('uses readable preset names and stable insertion indices without changing saved identifiers', () => {
    const project = createWorkbenchProject();
    expect(definitionLabel(project, 'weapon-a')).toBe('武器甲 · 区间加成');
    expect(recordLabel(project, 'hit-2')).toBe('命中1');
    project.timeline[0].timeMs = 7000;
    expect(recordLabel(project, 'hit-2')).toBe('命中1');
    project.candidate.actors[0].id = 'custom-id';
    project.definitions[0].id = 'toString';
    const saved = JSON.stringify(project);
    expect(actorLabel(project, 'custom-id')).toBe('角色1');
    expect(definitionLabel(project, 'toString')).toBe('定义1');
    expect(actorLabel(project, 'missing')).toBe('缺失角色');
    expect(project.timeline[0].id).toBe('hit-2');
    expect(JSON.stringify(project)).toBe(saved);
  });
});
