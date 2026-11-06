import type { WorkbenchProject } from '@leyline/schema';
import type { WorkbenchResult } from '@leyline/engine';

export interface AxisRequest {
  taskId: number;
  session: number;
  revision: number;
  project: WorkbenchProject;
}
export interface AxisResponse {
  taskId: number;
  session: number;
  revision: number;
  result: WorkbenchResult;
}

/** The empty result deliberately carries no values from the preceding revision. */
export function pendingAxisResult(): WorkbenchResult {
  return { status: 'partial', points: [], objectiveValue: null, totalValue: null, diagnostics: [], plan: null };
}

export function matchesAxisTask(response: AxisResponse, request: AxisRequest): boolean {
  return response.taskId === request.taskId && response.session === request.session && response.revision === request.revision;
}
