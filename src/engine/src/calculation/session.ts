import { calculationValueSchema, valueMatchesType, type CalculationDiagnostic, type CalculationDiagnosticCode,
  type CalculationTraceNode, type DefinitionRef, type EvaluatedValue, type FormulaEvaluation, type RequiredInput, type Value, type ValueType } from '@leyline/schema';
import { calculationBudgets } from './compile';

export interface TraceOrigin { definition: { identity: DefinitionRef; sources: readonly string[] }; pointer: string }

/** One budget, trace namespace and diagnostic namespace across formulas, attributes and effects. */
export class CalculationSession {
  readonly diagnostics: CalculationDiagnostic[] = [];
  readonly trace: CalculationTraceNode[] = [];
  readonly required = new Map<string, RequiredInput>();
  readonly requiredReasons = new Map<string, string>();
  private readonly diagnosticIndex = new Map<string, number>();
  readonly limits = { visits: calculationBudgets.visits as number, depth: calculationBudgets.depth as number, trace: calculationBudgets.trace as number };
  visits = 0;
  budgetValue?: EvaluatedValue;
  constructor(readonly reference: DefinitionRef) {}
  report(code: CalculationDiagnosticCode, pointer: string, message: string, nodeId?: string, eventId?: string): string {
    const key = JSON.stringify([code, pointer, message, nodeId, eventId]);
    let index = this.diagnosticIndex.get(key);
    if (index === undefined) {
      index = this.diagnostics.length;
      this.diagnosticIndex.set(key, index);
      this.diagnostics.push({ code, severity: code === 'trace-truncated' ? 'warning' : 'error', jsonPointer: pointer, message,
        ...(nodeId ? { nodeId } : {}), ...(eventId ? { eventId } : {}), affectedOutputIds: [] });
    }
    return `diagnostic-${index + 1}`;
  }
  budget(origin: TraceOrigin | undefined, nodeId: string, message: string, truncated = false): EvaluatedValue {
    if (this.budgetValue) return this.budgetValue;
    const reason = this.report('budget', origin?.pointer ?? '', message, nodeId);
    if (truncated) this.report('trace-truncated', origin?.pointer ?? '', '追踪节点达到预算，未静默丢弃诊断。', nodeId);
    const id = `trace-${this.trace.length + 1}`;
    this.trace.push({ id, kind: 'budget', definition: origin?.definition.identity ?? this.reference, nodeId, dependencies: [], value: null, state: 'invalid', sourceRefs: [...origin?.definition.sources ?? []] });
    return this.budgetValue = { state: 'invalid', reasons: [reason], traceId: id };
  }
  enter(origin: TraceOrigin | undefined, nodeId: string, depth: number): EvaluatedValue | undefined {
    if (this.budgetValue) return this.budgetValue;
    if (++this.visits > this.limits.visits || depth > this.limits.depth) return this.budget(origin, nodeId, '计算访问或深度超过预算。');
    return undefined;
  }
  emit(origin: TraceOrigin | undefined, nodeId: string, dependencies: string[], value: Value | null,
    state: EvaluatedValue['state'], reasons: string[] = [], kind: CalculationTraceNode['kind'] = 'node', context?: CalculationTraceNode['context']): EvaluatedValue {
    if (this.budgetValue) return this.budgetValue;
    if (this.trace.length >= this.limits.trace - 1) return this.budget(origin, nodeId, '计算追踪超过预算。', true);
    const id = `trace-${this.trace.length + 1}`;
    this.trace.push({ id, kind, definition: origin?.definition.identity ?? this.reference, nodeId, dependencies: [...new Set(dependencies)], value,
      state, sourceRefs: [...origin?.definition.sources ?? []], ...(context ? { context } : {}) });
    return state === 'known' && value ? { state, value, traceId: id } : { state: state === 'known' ? 'invalid' : state, reasons, traceId: id };
  }
  invalid(origin: TraceOrigin | undefined, nodeId: string, pointer: string, message: string,
    code: CalculationDiagnosticCode = 'arithmetic', dependencies: string[] = []): EvaluatedValue {
    return this.emit(origin, nodeId, dependencies, null, 'invalid', [this.report(code, pointer, message, nodeId)]);
  }
  known(origin: TraceOrigin | undefined, id: string, value: Value, dependencies: string[] = [], type?: ValueType): EvaluatedValue {
    const parsed = calculationValueSchema.safeParse(value);
    return !parsed.success || type && !valueMatchesType(parsed.data, type)
      ? this.invalid(origin, id, origin?.pointer ?? '', '运算结果溢出或不符合数量类型。', 'arithmetic', dependencies)
      : this.emit(origin, id, dependencies, parsed.data, 'known');
  }
  inherit(origin: TraceOrigin | undefined, id: string, values: EvaluatedValue[]): EvaluatedValue | undefined {
    const failed = values.filter(value => value.state === 'invalid'), unknown = values.filter(value => value.state === 'unknown');
    const chosen = failed.length ? failed : unknown;
    return chosen.length ? this.emit(origin, id, values.map(value => value.traceId), null, failed.length ? 'invalid' : 'unknown',
      [...new Set(chosen.flatMap(value => value.state === 'known' ? [] : value.reasons))]) : undefined;
  }
  missing(origin: TraceOrigin | undefined, key: string, type: ValueType, scope: string, pointer: string, min?: number, max?: number): EvaluatedValue {
    const identity = JSON.stringify([scope, key]);
    const reason = this.report('missing-fact', pointer, '计算事实尚未明确：' + key);
    this.required.set(identity, { key, type, scope, requiredBy: [], sourceRefs: [...origin?.definition.sources ?? []],
      ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) });
    this.requiredReasons.set(identity, reason);
    return this.emit(origin, key, [], null, 'unknown', [reason], 'read');
  }
  finish(outputs: Record<string, EvaluatedValue>, stages: FormulaEvaluation['stages'] = []): FormulaEvaluation {
    const associations = new Map<string, string[]>();
    for (const [name, value] of Object.entries(outputs)) if (value.state !== 'known') for (const reason of new Set(value.reasons)) {
      const names = associations.get(reason) ?? []; names.push(name); associations.set(reason, names);
    }
    const affected = (reason: string) => associations.get(reason) ?? [];
    const budgetAffected = [...new Set(this.diagnostics.flatMap((diagnostic, index) => diagnostic.code === 'budget' ? affected(`diagnostic-${index + 1}`) : []))];
    return { execution: this.budgetValue || Object.values(outputs).some(value => value.state === 'invalid') ? 'invalid'
      : Object.values(outputs).some(value => value.state === 'unknown') ? 'partial' : 'complete', outputs, stages, trace: this.trace,
      diagnostics: this.diagnostics.map((diagnostic, index) => ({ ...diagnostic, affectedOutputIds: diagnostic.code === 'trace-truncated' ? budgetAffected : affected(`diagnostic-${index + 1}`) })),
      requiredInputs: [...this.required.entries()].map(([key, input]) => ({ ...input, requiredBy: affected(this.requiredReasons.get(key)!) })),
      work: { visits: this.visits, traceNodes: this.trace.length } };
  }
}
