import type { TeamInput, TeamSimulationResult, WorkerResponse, WorkerRequest } from '@leyline/schema';
export interface WorkerPort {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}
export interface TaskCallbacks { result(value: TeamSimulationResult): void; error(message: string): void; busy(value: boolean): void }
/** One owner, one live worker; a cancelled generation can never publish a result. */
export class TeamTask {
  private generation = 0;
  private worker?: WorkerPort;
  constructor(private factory: () => WorkerPort, private callbacks: TaskCallbacks) {}
  cancel() { ++this.generation; this.worker?.terminate(); this.worker = undefined; this.callbacks.busy(false); }
  run(input: TeamInput) {
    this.cancel();
    const id = this.generation;
    const fail = (message: string) => { if (id === this.generation) { this.cancel(); this.callbacks.error(message); } };
    try {
      const worker = this.worker = this.factory();
      worker.onmessage = ({ data }) => {
        if (id !== this.generation || data.id !== id) return;
        if (!data.ok) { fail(data.error); return; }
        if (data.kind !== 'team') { fail('计算响应类型异常，请重新运行。'); return; }
        this.cancel(); this.callbacks.result(data.result);
      };
      worker.onerror = () => fail('计算进程异常，请重新运行。');
      worker.onmessageerror = () => fail('计算结果无法读取，请重新运行。');
      this.callbacks.busy(true);
      worker.postMessage({ id, kind: 'team', input });
    } catch { fail('无法启动计算进程，请重新运行。'); }
  }
}
