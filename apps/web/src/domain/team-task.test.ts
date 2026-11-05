import { describe, it, expect, vi } from 'vitest';
import { teamSchema, type WorkerResponse } from '@leyline/schema';
import { simulateTeam } from '@leyline/engine';
import example from '../../../../fixtures/scenarios/first-team.json';
import { TeamTask, type WorkerPort } from './team-task';
const input = teamSchema.parse(example);
function fixture() {
  const workers: WorkerPort[] = [];
  const callbacks = { result: vi.fn(), error: vi.fn(), busy: vi.fn() };
  const task = new TeamTask(() => {
    const worker: WorkerPort = { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() };
    workers.push(worker); return worker;
  }, callbacks);
  function send(index: number, data: WorkerResponse) { workers[index].onmessage?.({ data } as MessageEvent<WorkerResponse>); }
  return { task, workers, callbacks, send };
}
describe('team task ownership', () => {
  it('ignores old and mismatched messages after cancellation and restart', () => {
    const f = fixture(); f.task.run(input); f.task.cancel(); f.task.run(input);
    f.send(0, { id: 1, ok: false, error: 'stale' });
    f.send(1, { id: 99, ok: false, error: 'wrong id' });
    expect(f.callbacks.error).not.toHaveBeenCalled();
    const result = simulateTeam(input);
    f.send(1, { id: 3, ok: true, kind: 'team', result });
    expect(f.callbacks.result).toHaveBeenCalledWith(result);
    expect(f.workers[0].terminate).toHaveBeenCalled();
    expect(f.workers[1].terminate).toHaveBeenCalled();
  });
  it('releases failed workers and allows another run', () => {
    const f = fixture(); f.task.run(input); f.workers[0].onerror?.({} as ErrorEvent);
    expect(f.callbacks.error).toHaveBeenCalledWith('计算进程异常，请重新运行。');
    expect(f.workers[0].terminate).toHaveBeenCalled();
    f.task.run(input); expect(f.workers).toHaveLength(2);
    f.workers[1].onmessageerror?.({} as MessageEvent);
    expect(f.callbacks.busy).toHaveBeenLastCalledWith(false);
  });
  it('handles startup and postMessage failures', () => {
    const callbacks = { result: vi.fn(), error: vi.fn(), busy: vi.fn() };
    new TeamTask(() => { throw new Error(); }, callbacks).run(input);
    expect(callbacks.error).toHaveBeenCalledWith('无法启动计算进程，请重新运行。');
    const terminate = vi.fn();
    const worker: WorkerPort = { onmessage: null, onerror: null, onmessageerror: null, postMessage: () => { throw new Error('clone'); }, terminate };
    new TeamTask(() => worker, callbacks).run(input);
    expect(terminate).toHaveBeenCalled(); expect(callbacks.busy).toHaveBeenLastCalledWith(false);
  });
});
