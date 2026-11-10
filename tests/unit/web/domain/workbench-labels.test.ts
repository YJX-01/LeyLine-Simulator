import { describe, expect, it } from 'vitest';
import { unitLabel, operationLabel, diagnosticLabel, statusLabel, inputLabel, errorLabel } from '../../../../src/web/src/domain/workbench-labels';

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
});
