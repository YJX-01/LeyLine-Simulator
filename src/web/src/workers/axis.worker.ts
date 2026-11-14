import { evaluateTimeline } from '@leyline/engine';
import type { AxisRequest, AxisResponse } from '../domain/axis-task';
import { evaluateLoadoutComparison } from '../domain/loadout-comparison';
import { pendingAxisResult } from '../domain/axis-task';

self.onmessage = (event: MessageEvent<AxisRequest>) => {
  const { taskId, session, revision, project } = event.data;
  let response: AxisResponse;
  try {
    response = event.data.candidates ? evaluateLoadoutComparison(event.data) : { taskId, session, revision, result: evaluateTimeline(project) };
  } catch (cause) {
    response = { taskId, session, revision, result: { ...pendingAxisResult(), status: 'invalid' }, error: cause instanceof Error ? cause.message : '候选计算输入无效。' };
  }
  self.postMessage(response);
};
