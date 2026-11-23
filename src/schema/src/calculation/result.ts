import type { CalculationDiagnostic } from './diagnostic';
import type { DefinitionRef, Value, ValueType } from './values';

export type EvaluatedValue = { state: 'known'; value: Value; traceId: string }
  | { state: 'unknown' | 'invalid'; reasons: string[]; traceId: string };
export interface CalculationTraceNode {
  id: string;
  kind: 'read' | 'node' | 'call' | 'budget' | 'aggregate' | 'attribute' | 'effect' | 'capture' | 'coverage' | 'state';
  definition: DefinitionRef;
  nodeId: string;
  dependencies: string[];
  value: Value | null;
  state: EvaluatedValue['state'];
  sourceRefs: string[];
  context?: { eventId: string; phase: 'before' | 'after'; actorId?: string; recipientId?: string; effectInstanceId?: string; captureSlot?: string };
}
export interface RequiredInput {
  key: string;
  type: ValueType;
  scope: string;
  requiredBy: string[];
  min?: number;
  max?: number;
  sourceRefs: string[];
}
export interface FormulaEvaluation {
  execution: 'complete' | 'partial' | 'invalid';
  outputs: Record<string, EvaluatedValue>;
  stages: { id: string; value: EvaluatedValue }[];
  trace: CalculationTraceNode[];
  diagnostics: CalculationDiagnostic[];
  requiredInputs: RequiredInput[];
  work: { visits: number; traceNodes: number };
}

export interface AggregateEvaluation {
  execution: 'complete' | 'partial' | 'invalid';
  value: EvaluatedValue;
  states: { id: string; probability: number; ranking: { contributorId: string; value: number; rankMetric: number; weight: number }[]; value: number | null }[];
  trace: CalculationTraceNode[];
  diagnostics: CalculationDiagnostic[];
  requiredInputs: RequiredInput[];
  work: { visits: number; traceNodes: number };
}

export interface CalculationFeasibility {
  category: 'inventory-allocation';
  status: 'pass' | 'conflict' | 'unknown';
  actorIds: string[];
  itemRefs: { accountId: string; itemId: string; actorIds: string[] }[];
  diagnostics: CalculationDiagnostic[];
}
export interface StructuredDamageOutput {
  id: string;
  eventId: string;
  outputId: string;
  actorId: string | null;
  contributorIds: string[];
  computation: { kind: 'formula' | 'aggregate' | 'bound-aggregate'; definition: DefinitionRef };
  family: string;
  execution: FormulaEvaluation['execution'];
  evidence: 'declared' | 'adopted' | 'independently-checked' | 'observed';
  value: EvaluatedValue;
  /** Formula result before an outstanding content-coverage check. Excluded from certified totals. */
  stages: FormulaEvaluation['stages'];
  diagnosticIds: string[];
  aggregation?: { states: AggregateEvaluation['states'] };
}
export interface StructuredDamageEvaluation {
  execution: FormulaEvaluation['execution'];
  outputs: StructuredDamageOutput[];
  events: { eventId: string; outputIds: string[]; total: EvaluatedValue }[];
  totals: { all: EvaluatedValue; objective: EvaluatedValue };
  feasibility: CalculationFeasibility[];
  trace: CalculationTraceNode[];
  diagnostics: CalculationDiagnostic[];
  requiredInputs: RequiredInput[];
  work: FormulaEvaluation['work'];
}
