import { compareTimelineLoadouts } from '@leyline/engine';
import { loadoutCandidatesSchema, type AxisRequest, type AxisResponse } from '@leyline/schema';
import type { Build } from '@leyline/schema';
import type { EffectiveRollBasis } from './effective-roll-basis';
import type { AccountArtifact, LocalAccount } from './account';

export interface ComparisonSide {title:string;items:AccountArtifact[];build?:Build;account?:LocalAccount;basis?:EffectiveRollBasis}
export interface ComparisonOption extends ComparisonSide {id:string}

/** Used by the calculator and Worker; no store or account writes. */
export function evaluateLoadoutComparison(request: AxisRequest): AxisResponse {
  const comparison = compareTimelineLoadouts(request.project, loadoutCandidatesSchema.parse(request.candidates));
  return { taskId: request.taskId, session: request.session, revision: request.revision, result: comparison.baseline, comparison };
}
