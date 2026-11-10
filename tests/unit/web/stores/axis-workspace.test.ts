import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { evaluateTimeline } from '@leyline/engine';
import type { Project } from '@leyline/schema';
import { recordedProject } from '../../../helpers/recorded-project';
import type { DesktopBridge } from '../../../../src/web/src/platform/desktop';
import { useAxisWorkspaceStore } from '../../../../src/web/src/stores/axis-workspace';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import type { AxisRequest, AxisResponse } from '../../../../src/web/src/domain/axis-task';

const adapters = vi.hoisted(() => ({ bridge: undefined as DesktopBridge | undefined, download: vi.fn() }));
vi.mock('../../../../src/web/src/platform/desktop', () => ({ getDesktopBridge: () => adapters.bridge }));
vi.mock('../../../../src/web/src/domain/download', () => ({ downloadJson: adapters.download }));
let pinia: ReturnType<typeof createPinia>;
let recorded: Project;
const snapshot = (): Project => JSON.parse(JSON.stringify(recorded));
function nativeBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return { openProject: vi.fn(async () => null), saveProject: vi.fn(async () => true), ...overrides };
}
function workspace() {
  const store = useAxisWorkspaceStore();
  store.replaceProject(snapshot());
  return store;
}

describe('current workspace files and editing', () => {
  beforeAll(async () => { recorded = await recordedProject(); });
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    adapters.bridge = undefined;
    adapters.download.mockReset();
  });
  afterEach(() => {
    disposePinia(pinia);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('recovers saved snapshots despite object ordering and rejects broken recovery', async () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const store = workspace();
    const { name, ...other } = store.project.definitions[0];
    store.project.definitions[0] = { name, ...other };
    adapters.bridge = nativeBridge();
    expect(await store.saveProject()).toBe(true);
    expect(store.dirty).toBe(false);
    store.replaceProject(createEmptyProject());
    expect(store.recover()).toBe(true);
    expect(store.project.candidate.actors[0].build).toEqual(recorded.candidate.actors[0].build);
    expect(store.project.timeline).toEqual([]);
    expect(store.dirty).toBe(false);
    data.set('leyline-axis-recovery-v2', '{');
    expect(store.recover()).toBe(false);
    expect(store.project.id).toBe(recorded.id);
  });

  it('groups undo/redo and discards abandoned edit branches', () => {
    const store = workspace();
    store.command(project => { project.revision = '2'; project.candidate.id = 'renamed-candidate'; });
    store.undo();
    expect(store.project).toEqual(recorded);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(store.project.revision).toBe('2');
    expect(store.project.candidate.id).toBe('renamed-candidate');
    store.project.revision = '3';
    store.undo();
    expect(store.project.revision).toBe('2');
    store.project.revision = '4';
    expect(store.canRedo).toBe(false);
    store.createProject();
    expect(store.canUndo).toBe(false);
  });

  it('preserves edits after cancelled or failed native saves', async () => {
    const store = workspace();
    store.project.revision = '2';
    adapters.bridge = nativeBridge({ saveProject: vi.fn(async () => false) });
    expect(await store.saveProject()).toBe(false);
    expect(store.dirty).toBe(true);
    adapters.bridge = nativeBridge({ saveProject: vi.fn(async () => { throw new Error('Disk unavailable'); }) });
    expect(await store.saveProject()).toBe(false);
    expect(store.error).toBe('Disk unavailable');
    expect(store.project.revision).toBe('2');
    expect(store.busy).toBe(false);
  });

  it('marks only the snapshot saved and never a different project installed during saving', async () => {
    const store = workspace();
    let finish!: (saved: boolean) => void;
    const save = vi.fn((_content: string) => new Promise<boolean>(resolve => { finish = resolve; }));
    adapters.bridge = nativeBridge({ saveProject: save });
    store.project.revision = '2';
    const pending = store.saveProject();
    store.project.revision = '3';
    expect(await store.saveProject()).toBe(false);
    finish(true);
    expect(await pending).toBe(true);
    expect(JSON.parse(save.mock.calls[0][0]).revision).toBe('2');
    expect(store.dirty).toBe(true);
    const previous = store.saveProject();
    store.createProject('next-axis');
    finish(true);
    expect(await previous).toBe(true);
    expect(store.project.id).toBe('next-axis');
    expect(store.dirty).toBe(true);
  });

  it('rejects invalid imports/writes and downloads a validated current snapshot', async () => {
    const store = workspace();
    const before = JSON.stringify(store.project);
    expect(() => store.importContent('{')).toThrow('当前项目保持不变');
    const invalid = snapshot();
    invalid.candidate.actors[0].character = 'missing';
    expect(() => store.replaceProject(invalid)).toThrow('当前项目保持不变');
    expect(JSON.stringify(store.project)).toBe(before);
    store.project.candidate.actors[0].build!.level = Infinity;
    expect(await store.saveProject()).toBe(false);
    expect(adapters.download).not.toHaveBeenCalled();
    expect(store.error).toContain('非法');
    store.replaceProject(snapshot());
    expect(await store.saveProject()).toBe(true);
    expect(adapters.download.mock.calls[0]).toEqual([store.project, `${store.project.id}.json`]);
    expect(store.dirty).toBe(false);
  });

  it('preserves edits on cancelled/invalid native open and accepts current files', async () => {
    const store = workspace();
    expect(await store.openNativeProject()).toBe(false);
    store.project.revision = '2';
    adapters.bridge = nativeBridge();
    expect(await store.openNativeProject()).toBe(true);
    expect(store.project.revision).toBe('2');
    adapters.bridge = nativeBridge({ openProject: vi.fn(async () => '{broken') });
    await store.openNativeProject();
    expect(store.error).toContain('当前项目保持不变');
    expect(store.project.revision).toBe('2');
    adapters.bridge = nativeBridge({ openProject: vi.fn(async () => JSON.stringify(recorded)) });
    await store.openNativeProject();
    expect(store.project).toEqual(recorded);
    expect(store.dirty).toBe(false);
    expect(store.busy).toBe(false);
  });

  it('validates browser files and rejects oversized files before reading', async () => {
    const store = workspace();
    await store.inputFile(new File([JSON.stringify(recorded)], 'axis.json'));
    const oversized = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.json');
    const text = vi.spyOn(oversized, 'text');
    await store.inputFile(oversized);
    expect(text).not.toHaveBeenCalled();
    expect(store.error).toContain('8 MiB');
    await store.inputFile(new File(['{'], 'bad.json'));
    expect(store.error).toContain('当前项目保持不变');
    expect(store.project).toEqual(recorded);
  });

  it('repairs selection and saves/reopens the current empty document', async () => {
    const store = workspace();
    store.actorId = 'missing';
    store.selectedId = 'missing';
    store.replaceProject(snapshot());
    expect(store.actorId).toBe(recorded.candidate.actors[0].id);
    expect(store.selectedId).toBe('');
    store.createProject('empty-axis');
    expect(store.actor).toBeUndefined();
    expect(store.actorId).toBe('');
    expect(store.dirty).toBe(true);
    expect(await store.saveProject()).toBe(true);
    const saved = JSON.stringify(adapters.download.mock.calls[0][0]);
    store.replaceProject(snapshot());
    store.importContent(saved);
    expect(store.project).toEqual(createEmptyProject('empty-axis'));
    expect(store.dirty).toBe(false);
  });

  it('ignores late worker replies after edits, project switches and cancellation', () => {
    class TestWorker {
      static instances: TestWorker[] = [];
      onmessage: ((event: MessageEvent<AxisResponse>) => void) | null = null;
      onerror: (() => void) | null = null;
      request!: AxisRequest;
      terminated = false;
      constructor() { TestWorker.instances.push(this); }
      postMessage(request: AxisRequest) { this.request = request; }
      terminate() { this.terminated = true; }
      reply() {
        const { taskId, session, revision, project } = this.request;
        this.onmessage?.({ data: { taskId, session, revision, result: evaluateTimeline(project) } } as MessageEvent<AxisResponse>);
      }
    }
    vi.useFakeTimers();
    vi.stubGlobal('Worker', TestWorker);
    const store = workspace();
    vi.runOnlyPendingTimers();
    const first = TestWorker.instances.at(-1)!;
    store.project.revision = '2';
    expect(first.terminated).toBe(true);
    first.reply();
    expect(store.runState).toBe('计算中');
    expect(store.result.totalValue).toBeNull();
    vi.runOnlyPendingTimers();
    TestWorker.instances.at(-1)!.reply();
    expect(store.runState).toBe('计算完成');
    store.run();
    vi.runOnlyPendingTimers();
    const previous = TestWorker.instances.at(-1)!;
    store.createProject();
    previous.reply();
    expect(store.runState).toBe('计算中');
    vi.runOnlyPendingTimers();
    const cancelled = TestWorker.instances.at(-1)!;
    store.cancelRun();
    cancelled.reply();
    expect(store.runState).toBe('已取消');
    expect(store.result.totalValue).toBeNull();
  });
});
