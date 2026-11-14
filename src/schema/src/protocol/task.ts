import type { Project } from '../project/project';
import type { EvaluationResult } from './evaluation';
import type { LoadoutCandidate, LoadoutComparison } from './loadout-comparison';

export interface AxisRequest {
  taskId: number;
  session: number;
  revision: number;
  project: Project;
  candidates?: LoadoutCandidate[];
}
export interface AxisResponse {
  taskId: number;
  session: number;
  revision: number;
  result: EvaluationResult;
  comparison?: LoadoutComparison;
  error?: string;
}
