/// <reference lib="webworker" />
import { calculateAttack, simulateRotation, simulateCharacter } from '@leyline/engine';
import type { WorkerRequest, WorkerResponse } from '@leyline/schema';
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data;
  let response: WorkerResponse;
  try {
    response = event.data.kind === 'character'
      ? { id, ok: true, kind: 'character', result: simulateCharacter(event.data.input) }
      : event.data.kind === 'rotation'
      ? { id, ok: true, kind: 'rotation', result: simulateRotation(event.data.input) }
      : { id, ok: true, kind: 'attack', result: calculateAttack(event.data.input) };
  }
  catch (error) { response = { id, ok: false, error: error instanceof Error ? error.message : '计算失败' }; }
  self.postMessage(response);
};
