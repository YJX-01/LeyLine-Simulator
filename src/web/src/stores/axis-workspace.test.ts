import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { createWorkbenchProject } from '../domain/workbench-project';
import type { DesktopBridge } from '../platform/desktop';
import { useAxisWorkspaceStore } from './axis-workspace';
import { evaluateWorkbench } from '@leyline/engine';
import type { AxisRequest, AxisResponse } from '../domain/axis-task';

const adapters = vi.hoisted(() => ({ bridge: undefined as DesktopBridge | undefined, download: vi.fn() }));
vi.mock('../platform/desktop', () => ({ getDesktopBridge: () => adapters.bridge }));
vi.mock('../domain/download', () => ({ downloadJson: adapters.download }));

let pinia: ReturnType<typeof createPinia>;
function nativeBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return { openProject: vi.fn(async () => null), saveProject: vi.fn(async () => true), ...overrides };
}

describe('shared axis workspace', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    adapters.bridge = undefined;
    adapters.download.mockReset();
  });
  afterEach(() => disposePinia(pinia));

  it('round trips grouped commands and direct edits through undo and redo', () => {
    const store = useAxisWorkspaceStore();
    store.command(project => {
      project.candidate.actors[0].inputs.attack.value = 1100;
      project.objective.damageIds = ['hit-6'];
    });
    expect(store.result.objectiveValue).toBe(2200);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.result.objectiveValue).toBe(4400);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(store.result.objectiveValue).toBe(2200);
    store.project.candidate.actors[0].inputs.attack.value = 1200;
    store.undo();
    expect(store.result.objectiveValue).toBe(2200);
    store.project.candidate.actors[0].inputs.attack.value = 1500;
    expect(store.canRedo).toBe(false);
    store.createProject();
    expect(store.canUndo).toBe(false);
  });

  it('restores only validated project inputs and recomputes the independent result', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    try {
      const store = useAxisWorkspaceStore();
      store.project.candidate.actors[0].inputs.attack.value = 1100;
      expect(store.recoveryAvailable).toBe(true);
      store.loadSample('weapon-b');
      expect(store.recover()).toBe(true);
      expect(store.result.totalValue).toBe(4840);
      expect(store.dirty).toBe(true);
      data.set('leyline-axis-recovery-v1', '{');
      expect(store.recover()).toBe(false);
      expect(store.result.totalValue).toBe(4840);
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not mark a new project saved when a previous project save completes', async () => {
    const store = useAxisWorkspaceStore();
    let finish!: (saved: boolean) => void;
    adapters.bridge = nativeBridge({ saveProject: () => new Promise(resolve => { finish = resolve; }) });
    const pending = store.saveProject();
    store.createProject('next-axis');
    finish(true);
    expect(await pending).toBe(true);
    expect(store.project.id).toBe('next-axis');
    expect(store.dirty).toBe(true);
  });

  it('discards late worker replies after revisions, project switches, and cancellation', () => {
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
        this.onmessage?.({ data: { taskId, session, revision, result: evaluateWorkbench(project) } } as MessageEvent<AxisResponse>);
      }
    }
    vi.useFakeTimers();
    vi.stubGlobal('Worker', TestWorker);
    try {
      const store = useAxisWorkspaceStore();
      expect(store.result.totalValue).toBeNull();
      vi.runOnlyPendingTimers();
      const first = TestWorker.instances.at(-1)!;
      store.project.candidate.actors[0].inputs.attack.value = 1100;
      expect(first.terminated).toBe(true);
      first.reply();
      expect(store.result.totalValue).toBeNull();
      vi.runOnlyPendingTimers();
      const second = TestWorker.instances.at(-1)!;
      second.reply();
      expect(store.result.totalValue).toBe(4840);
      store.loadSample('weapon-b');
      vi.runOnlyPendingTimers();
      const third = TestWorker.instances.at(-1)!;
      store.createProject('new-axis');
      third.reply();
      expect(store.result.totalValue).toBeNull();
      vi.runOnlyPendingTimers();
      const fourth = TestWorker.instances.at(-1)!;
      store.cancelRun();
      fourth.reply();
      expect(store.result.totalValue).toBeNull();
      expect(store.runState).toBe('已取消');
      store.run();
      vi.runOnlyPendingTimers();
      TestWorker.instances.at(-1)!.reply();
      expect(store.result.totalValue).toBe(0);
      expect(store.runState).toBe('计算完成');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('loads independent sample values and resets the editing selection', () => {
    const store = useAxisWorkspaceStore();
    expect(store.result.objectiveValue).toBe(4400);
    expect(store.dirty).toBe(false);
    store.project.candidate.actors[0].inputs.attack.value = 1500;
    store.selectedId = 'hit-6';
    expect(store.dirty).toBe(true);
    store.loadSample('weapon-b');
    expect(store.result.objectiveValue).toBe(4000);
    expect(store.selectedId).toBe('hit-2');
    expect(store.dirty).toBe(false);
    store.loadSample('attack-1100');
    expect(store.result.objectiveValue).toBe(4840);
    store.loadSample('second-hit');
    expect(store.result.objectiveValue).toBe(2000);
    expect(store.result.totalValue).toBe(4400);
  });

  it('rejects bad formats and references before replacing the current project', () => {
    const store = useAxisWorkspaceStore();
    store.project.candidate.actors[0].inputs.attack.value = 1100;
    const before = JSON.stringify(store.project);
    expect(() => store.importContent('{')).toThrow('当前项目保持不变');
    expect(() => store.replaceProject({ schemaVersion: 99 })).toThrow('当前项目保持不变');
    const invalid = createWorkbenchProject();
    invalid.timeline[0].definition = 'missing';
    expect(() => store.replaceProject(invalid)).toThrow('当前项目保持不变');
    expect(JSON.stringify(store.project)).toBe(before);
    expect(store.dirty).toBe(true);
  });

  it('restores a validated snapshot and repairs missing selection references, including an empty axis', () => {
    const store = useAxisWorkspaceStore();
    store.actorId = 'gone';
    store.selectedId = 'gone';
    store.replaceProject(createWorkbenchProject('attack-1100'));
    expect(store.actor?.id).toBe('actor');
    expect(store.selectedId).toBe('hit-2');
    expect(store.result.totalValue).toBe(4840);
    expect(store.dirty).toBe(false);
    const empty = createWorkbenchProject();
    empty.timeline = [];
    empty.candidate.actors = [];
    store.replaceProject(empty);
    expect(store.actor).toBeUndefined();
    expect(store.actorId).toBe('');
    expect(store.selectedId).toBe('');
  });

  it('does not mark cancelled or failed native saves as saved', async () => {
    const store = useAxisWorkspaceStore();
    store.project.candidate.actors[0].inputs.attack.value = 1100;
    adapters.bridge = nativeBridge({ saveProject: vi.fn(async () => false) });
    expect(await store.saveProject()).toBe(false);
    expect(store.dirty).toBe(true);
    expect(store.busy).toBe(false);
    adapters.bridge = nativeBridge({ saveProject: vi.fn(async () => { throw new Error('Disk unavailable'); }) });
    expect(await store.saveProject()).toBe(false);
    expect(store.error).toBe('Disk unavailable');
    expect(store.project.candidate.actors[0].inputs.attack.value).toBe(1100);
    expect(store.dirty).toBe(true);
  });

  it('only marks the snapshot actually written when inputs change while saving', async () => {
    const store = useAxisWorkspaceStore();
    let finish: (saved: boolean) => void = () => { throw new Error('Save not started'); };
    const save = vi.fn((_content: string) => new Promise<boolean>(resolve => { finish = resolve; }));
    adapters.bridge = nativeBridge({ saveProject: save });
    store.project.candidate.actors[0].inputs.attack.value = 1100;
    const pending = store.saveProject();
    expect(store.busy).toBe(true);
    store.project.candidate.actors[0].inputs.attack.value = 1200;
    expect(await store.saveProject()).toBe(false);
    finish(true);
    expect(await pending).toBe(true);
    expect(JSON.parse(save.mock.calls[0][0]).candidate.actors[0].inputs.attack.value).toBe(1100);
    expect(store.result.totalValue).toBe(5280);
    expect(store.dirty).toBe(true);
    expect(store.busy).toBe(false);
  });

  it('allows unknown conditions to be saved and restored without claiming a complete total', async () => {
    const store = useAxisWorkspaceStore();
    const save = vi.fn(async (_content: string) => true);
    adapters.bridge = nativeBridge({ saveProject: save });
    store.project.definitions[1].effects[0].condition = 'triggered';
    store.project.conditions.triggered = null;
    expect(store.result.totalValue).toBeNull();
    expect(await store.saveProject()).toBe(true);
    expect(store.dirty).toBe(false);
    const saved = save.mock.calls[0][0];
    store.loadSample();
    expect(store.result.totalValue).toBe(4400);
    store.importContent(saved);
    expect(store.result.status).toBe('partial');
    expect(store.result.totalValue).toBeNull();
    expect(store.project.conditions.triggered).toBeNull();
  });

  it('blocks invalid writes and keeps the web download path equivalent to the project snapshot', async () => {
    const store = useAxisWorkspaceStore();
    store.project.candidate.actors[0].inputs.attack.value = Infinity;
    expect(await store.saveProject()).toBe(false);
    expect(adapters.download).not.toHaveBeenCalled();
    expect(store.error).toContain('非法');
    store.loadSample('attack-1100');
    store.project.objective.damageIds = ['hit-6'];
    expect(await store.saveProject()).toBe(true);
    expect(adapters.download).toHaveBeenCalledTimes(1);
    expect(adapters.download.mock.calls[0][0]).toEqual(store.project);
    expect(adapters.download.mock.calls[0][1]).toBe(`${store.project.id}.json`);
    expect(store.result.objectiveValue).toBe(2200);
    expect(store.dirty).toBe(false);
  });

  it('uses native open when available, preserving edits on cancellation or invalid input', async () => {
    const store = useAxisWorkspaceStore();
    expect(await store.openNativeProject()).toBe(false);
    store.project.candidate.actors[0].inputs.attack.value = 1100;
    adapters.bridge = nativeBridge();
    expect(await store.openNativeProject()).toBe(true);
    expect(store.dirty).toBe(true);
    adapters.bridge = nativeBridge({ openProject: vi.fn(async () => '{broken') });
    expect(await store.openNativeProject()).toBe(true);
    expect(store.error).toContain('当前项目保持不变');
    expect(store.result.totalValue).toBe(4840);
    adapters.bridge = nativeBridge({ openProject: vi.fn(async () => JSON.stringify(createWorkbenchProject('weapon-b'))) });
    expect(await store.openNativeProject()).toBe(true);
    expect(store.result.totalValue).toBe(4000);
    expect(store.dirty).toBe(false);
    expect(store.busy).toBe(false);
  });

  it('reads browser files with the same validation and refuses oversized files before reading', async () => {
    const store = useAxisWorkspaceStore();
    await store.inputFile(new File([JSON.stringify(createWorkbenchProject('attack-1100'))], 'axis.json'));
    expect(store.result.totalValue).toBe(4840);
    const oversized = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.json');
    const text = vi.spyOn(oversized, 'text');
    await store.inputFile(oversized);
    expect(text).not.toHaveBeenCalled();
    expect(store.error).toContain('8 MiB');
    expect(store.result.totalValue).toBe(4840);
    await store.inputFile(new File(['{'], 'bad.json'));
    expect(store.error).toContain('当前项目保持不变');
    expect(store.result.totalValue).toBe(4840);
  });

  it('creates an unsaved empty axis that can be saved and reopened without actor assumptions', async () => {
    const store = useAxisWorkspaceStore();
    const save = vi.fn(async (_content: string) => true);
    adapters.bridge = nativeBridge({ saveProject: save });
    store.createProject('empty-axis');
    expect(store.project.id).toBe('empty-axis');
    expect(store.project.revision).toBe('1');
    expect(store.project.definitions).toEqual([]);
    expect(store.project.candidate.actors).toEqual([]);
    expect(store.project.timeline).toEqual([]);
    expect(store.actor).toBeUndefined();
    expect(store.actorId).toBe('');
    expect(store.selectedId).toBe('');
    expect(store.result.status).toBe('complete');
    expect(store.result.totalValue).toBe(0);
    expect(store.dirty).toBe(true);
    expect(await store.saveProject()).toBe(true);
    expect(store.dirty).toBe(false);
    const saved = save.mock.calls[0][0];
    store.loadSample();
    store.importContent(saved);
    expect(store.project.id).toBe('empty-axis');
    expect(store.actor).toBeUndefined();
    expect(store.result.totalValue).toBe(0);
    expect(store.dirty).toBe(false);
  });
});
