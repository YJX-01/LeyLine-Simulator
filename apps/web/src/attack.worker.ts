/// <reference lib="webworker" />
import { calculateAttack } from '@leyline/engine';
import type { WorkerRequest, WorkerResponse } from '@leyline/schema';
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, input } = event.data;
  let response: WorkerResponse;
  try { response = { id, ok: true, result: calculateAttack(input) }; }
  catch (error) { response = { id, ok: false, error: error instanceof Error ? error.message : '计算失败' }; }
  self.postMessage(response);
};
