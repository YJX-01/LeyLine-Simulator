import { evaluateTimeline } from '@leyline/engine';
import type { AxisRequest, AxisResponse } from '../domain/axis-task';

self.onmessage = (event: MessageEvent<AxisRequest>) => {
  const { taskId, session, revision, project } = event.data;
  const response: AxisResponse = { taskId, session, revision, result: evaluateTimeline(project) };
  self.postMessage(response);
};
