import type { AxisRequest, AxisResponse, EvaluationResult } from '@leyline/schema';
export type { AxisRequest, AxisResponse } from '@leyline/schema';

/** The empty result deliberately carries no values from the preceding revision. */
export function pendingAxisResult(): EvaluationResult {
  return { status: 'partial', points: [], objectiveValue: null, totalValue: null, diagnostics: [], plan: null };
}

export function matchesAxisTask(response: AxisResponse, request: AxisRequest): boolean {
  return response.taskId === request.taskId && response.session === request.session && response.revision === request.revision;
}
