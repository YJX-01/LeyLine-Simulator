import type { Project } from '../project/project';
import type { EvaluationResult } from './evaluation';

export interface AxisRequest {
  taskId: number;
  session: number;
  revision: number;
  project: Project;
}
export interface AxisResponse {
  taskId: number;
  session: number;
  revision: number;
  result: EvaluationResult;
}
