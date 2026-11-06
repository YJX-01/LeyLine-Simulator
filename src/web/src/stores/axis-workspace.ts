import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue';
import { evaluateWorkbench } from '@leyline/engine';
import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { createWorkbenchProject, importWorkbenchProject, type AcceptanceCase } from '../domain/workbench-project';
import { downloadJson } from '../domain/download';
import { getDesktopBridge } from '../platform/desktop';
import { matchesAxisTask, pendingAxisResult, type AxisRequest, type AxisResponse } from '../domain/axis-task';
import { fileSignature } from '../domain/file-signature';

const maxProjectBytes = 8 * 1024 * 1024;
const recoveryKey = 'leyline-axis-recovery-v1';

export const useAxisWorkspaceStore = defineStore('axis-workspace', () => {
  const project = ref(createWorkbenchProject());
  const savedSnapshot = ref<string | null>(fileSignature(project.value));
  const actorId = ref(project.value.candidate.actors[0]?.id ?? '');
  const selectedId = ref(project.value.timeline.find(record => record.kind === 'damage')?.id ?? '');
  const notice = ref('已加载普通伤害样本。修改参数会立即重新计算。');
  const error = ref('');
  const busy = ref(false);
  const workerResult = shallowRef(pendingAxisResult());
  const workerEnabled = typeof Worker !== 'undefined';
  const result = computed(() => workerEnabled ? workerResult.value : evaluateWorkbench(project.value));
  const runState = ref('尚未计算');
  const recoveryAvailable = ref(false);
  const history = ref<string[]>([]);
  const future = ref<string[]>([]);
  const canUndo = computed(() => history.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);
  let observed = JSON.stringify(project.value);
  let suppressHistory = false;
  let session = 0;
  let revision = 0;
  let taskId = 0;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let currentRequest: AxisRequest | undefined;
  try { recoveryAvailable.value = typeof localStorage !== 'undefined' && localStorage.getItem(recoveryKey) !== null; } catch { /* Storage may be disabled. File saving remains available. */ }

  function stopWorker() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    currentRequest = undefined;
    worker?.terminate();
    worker = undefined;
  }

  function run() {
    stopWorker();
    if (!workerEnabled) { runState.value = '计算完成'; return; }
    workerResult.value = pendingAxisResult();
    runState.value = '计算中';
    timer = setTimeout(() => {
      timer = undefined;
      const request: AxisRequest = { taskId: ++taskId, session, revision, project: JSON.parse(JSON.stringify(project.value)) };
      currentRequest = request;
      try {
        const active = new Worker(new URL('../axis.worker.ts', import.meta.url), { type: 'module' });
        worker = active;
        active.onmessage = (event: MessageEvent<AxisResponse>) => {
          if (worker !== active || !currentRequest || !matchesAxisTask(event.data, currentRequest)) return;
          workerResult.value = event.data.result;
          runState.value = '计算完成';
          stopWorker();
        };
        active.onerror = () => {
          if (worker !== active) return;
          stopWorker();
          runState.value = '计算失败';
          error.value = '计算进程未能完成，请重新计算。当前编辑内容已保留。';
        };
        active.postMessage(request);
      } catch {
        stopWorker();
        runState.value = '计算失败';
        error.value = '无法启动计算进程，请重新计算。当前编辑内容已保留。';
      }
    }, 0);
  }

  function cancelRun() {
    stopWorker();
    workerResult.value = pendingAxisResult();
    runState.value = '已取消';
  }

  function persistRecovery() {
    // Invalid editor drafts stay in memory; never overwrite the last recoverable input.
    const parsed = workbenchProjectSchema.safeParse(project.value);
    if (!parsed.success) return;
    const content = JSON.stringify({ schemaVersion: 1, project: parsed.data, savedSnapshot: savedSnapshot.value });
    if (new TextEncoder().encode(content).byteLength > maxProjectBytes) return;
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(recoveryKey, content);
      recoveryAvailable.value = true;
    } catch { error.value = '本地恢复副本写入失败，请保存项目文件以保留修改。'; }
  }

  function repairSelection() {
    if (!project.value.candidate.actors.some(entry => entry.id === actorId.value)) actorId.value = project.value.candidate.actors[0]?.id ?? '';
    if (!project.value.timeline.some(record => record.id === selectedId.value)) selectedId.value = project.value.timeline.find(record => record.kind === 'damage')?.id ?? project.value.timeline[0]?.id ?? '';
  }

  watch(() => JSON.stringify(project.value), next => {
    if (next === observed) return;
    if (!suppressHistory) {
      history.value.push(observed);
      if (history.value.length > 100) history.value.shift();
      future.value = [];
    }
    observed = next;
    revision++;
    run();
    if (!suppressHistory) persistRecovery();
  }, { flush: 'sync' });
  run();
  onScopeDispose(stopWorker);

  /** Groups a multi-field edit into a single reversible command. */
  function command(edit: (draft: WorkbenchProject) => void) {
    const before = JSON.stringify(project.value);
    suppressHistory = true;
    try { edit(project.value); } finally { suppressHistory = false; }
    if (before !== observed) {
      history.value.push(before);
      if (history.value.length > 100) history.value.shift();
      future.value = [];
      persistRecovery();
    }
  }

  function undo() {
    const previous = history.value.pop();
    if (previous === undefined) return;
    future.value.push(observed);
    suppressHistory = true;
    try { project.value = JSON.parse(previous); } finally { suppressHistory = false; }
    repairSelection();
    persistRecovery();
    notice.value = '已撤销上一步编辑。';
  }

  function redo() {
    const next = future.value.pop();
    if (next === undefined) return;
    history.value.push(observed);
    suppressHistory = true;
    try { project.value = JSON.parse(next); } finally { suppressHistory = false; }
    repairSelection();
    persistRecovery();
    notice.value = '已重做编辑。';
  }

  function recover(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const content = localStorage.getItem(recoveryKey);
      if (!content) return false;
      if (new TextEncoder().encode(content).byteLength > maxProjectBytes) throw new Error('恢复副本超过大小限制。');
      const input = JSON.parse(content);
      if (input.schemaVersion !== 1) throw new Error('恢复副本版本无法识别。');
      const next = workbenchProjectSchema.parse(input.project);
      const previousSaved = typeof input.savedSnapshot === 'string' ? fileSignature(JSON.parse(input.savedSnapshot)) : null;
      installProject(next);
      savedSnapshot.value = previousSaved;
      notice.value = '已恢复本地编辑副本，并重新计算；请保存项目文件。';
      return true;
    } catch {
      error.value = '恢复副本无法读取，当前项目保持不变。';
      return false;
    }
  }
  const dirty = computed(() => savedSnapshot.value === null || fileSignature(project.value) !== savedSnapshot.value);
  const actor = computed(() => project.value.candidate.actors.find(entry => entry.id === actorId.value));

  function installProject(next: WorkbenchProject) {
    session++;
    suppressHistory = true;
    try { project.value = next; } finally { suppressHistory = false; }
    history.value = [];
    future.value = [];
    // Equal-content project installs still invalidate any preceding task.
    run();
    if (!next.candidate.actors.some(entry => entry.id === actorId.value)) actorId.value = next.candidate.actors[0]?.id ?? '';
    if (!next.timeline.some(record => record.id === selectedId.value)) selectedId.value = next.timeline.find(record => record.kind === 'damage')?.id ?? next.timeline[0]?.id ?? '';
    savedSnapshot.value = fileSignature(next);
    error.value = '';
  }

  function replaceProject(input: unknown): void {
    const parsed = workbenchProjectSchema.safeParse(input);
    if (!parsed.success) throw new Error(`项目格式无效：${parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；')}。当前项目保持不变。`);
    const evaluated = evaluateWorkbench(parsed.data);
    if (evaluated.status === 'invalid') throw new Error(`项目引用或计算规则无效：${evaluated.diagnostics.slice(0, 3).map(issue => `${issue.path}: ${issue.message}`).join('；')}。当前项目保持不变。`);
    installProject(parsed.data);
    notice.value = '项目已打开，并已按保存的定义和规则版本重新计算。';
  }

  function importContent(content: string): void {
    const next = importWorkbenchProject(content);
    installProject(next);
    notice.value = '项目已打开，并已按保存的定义和规则版本重新计算。';
  }

  function loadSample(variant: AcceptanceCase = 'weapon-a'): void {
    const next = createWorkbenchProject(variant);
    installProject(next);
    actorId.value = next.candidate.actors[0]?.id ?? '';
    selectedId.value = next.timeline.find(record => record.kind === 'damage')?.id ?? '';
    notice.value = '已加载独立验收样本，可以检查参考算式或继续编辑。';
  }

  function createProject(id: string = crypto.randomUUID(), preserveRecovery = false): void {
    const next = workbenchProjectSchema.parse({ schemaVersion: 1, rulesVersion: 'workbench-v1', id, revision: '1',
      definitions: [], candidate: { id: `${id}-candidate`, actors: [] }, conditions: {}, timeline: [], objective: {} });
    installProject(next);
    savedSnapshot.value = null;
    notice.value = '已新建空轴，尚未保存。请先从账号选择队伍，再记录动作与伤害。';
    if (!preserveRecovery) persistRecovery();
  }

  async function saveProject(): Promise<boolean> {
    if (busy.value) return false;
    error.value = '';
    const parsed = workbenchProjectSchema.safeParse(project.value);
    if (!parsed.success || evaluateWorkbench(parsed.data).status === 'invalid') {
      error.value = '请先修正非法数值、引用或计算规则再保存；未知条件可以保留。';
      return false;
    }
    const snapshot = fileSignature(parsed.data);
    const savingSession = session;
    const content = JSON.stringify(parsed.data, null, 2);
    if (new TextEncoder().encode(content).byteLength > maxProjectBytes) {
      error.value = '项目超过 8 MiB，未写入文件。';
      return false;
    }
    busy.value = true;
    try {
      const bridge = getDesktopBridge();
      if (bridge) {
        const saved = await bridge.saveProject(content);
        if (!saved) { notice.value = '已取消轴项目保存，当前编辑保留。'; return false; }
        notice.value = '项目已保存，包含完整轴、定义、候选配装及未知条件。';
      } else {
        downloadJson(parsed.data, `${parsed.data.id}.json`);
        notice.value = '已导出项目文件。再次打开该文件即可重新求值。';
      }
      // Inputs may change while the native dialog is open. Only the written snapshot is saved.
      if (savingSession === session) {
        savedSnapshot.value = snapshot;
        persistRecovery();
      }
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存失败，当前项目保持不变。';
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function openNativeProject(): Promise<boolean> {
    const bridge = getDesktopBridge();
    if (!bridge) return false;
    if (busy.value) return true;
    error.value = '';
    busy.value = true;
    try {
      const content = await bridge.openProject();
      if (content !== null) {
        if (new TextEncoder().encode(content).byteLength > maxProjectBytes) throw new Error('项目超过 8 MiB，当前项目保持不变。');
        importContent(content);
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '打开失败，当前项目保持不变。';
    } finally {
      busy.value = false;
    }
    return true;
  }

  async function inputFile(file: File): Promise<void> {
    if (busy.value) return;
    error.value = '';
    busy.value = true;
    try {
      if (file.size > maxProjectBytes) throw new Error('项目文件超过 8 MiB，当前项目保持不变。');
      importContent(await file.text());
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '文件读取失败，当前项目保持不变。';
    } finally {
      busy.value = false;
    }
  }

  return { project, result, dirty, actorId, actor, selectedId, notice, error, busy,
    replaceProject, importContent, loadSample, createProject, saveProject, openNativeProject, inputFile,
    undo, redo, canUndo, canRedo, recover, recoveryAvailable, cancelRun, runState, run, command };
});
