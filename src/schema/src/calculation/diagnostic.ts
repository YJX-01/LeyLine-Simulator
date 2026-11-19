export type CalculationDiagnosticCode = 'malformed-json' | 'unsupported-version' | 'unsupported-feature'
  | 'missing-dependency' | 'conflicting-definition' | 'unit-mismatch' | 'cycle' | 'missing-fact'
  | 'invalid-range' | 'stale-reference' | 'unreviewed-mechanism' | 'unsupported-semantics'
  | 'arithmetic' | 'budget' | 'trace-truncated' | 'inventory-conflict';

export interface CalculationDiagnostic {
  code: CalculationDiagnosticCode;
  severity: 'error' | 'warning';
  jsonPointer: string;
  nodeId?: string;
  eventId?: string;
  affectedOutputIds: string[];
  message: string;
}

export function calculationJsonPointer(path: readonly PropertyKey[]): string {
  return path.map(part => '/' + String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('');
}
