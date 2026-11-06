import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { evaluateWorkbench } from '@leyline/engine';
import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { createWorkbenchProject, importWorkbenchProject, type AcceptanceCase } from '../domain/workbench-project';
import { downloadJson } from '../domain/download';
import { getDesktopBridge } from '../platform/desktop';

const maxProjectBytes = 8 * 1024 * 1024;

export const useAxisWorkspaceStore = defineStore('axis-workspace', () => {
  const project = ref(createWorkbenchProject());
  const savedSnapshot = ref<string | null>(JSON.stringify(project.value));
  const actorId = ref(project.value.candidate.actors[0]?.id ?? '');
  const selectedId = ref(project.value.timeline.find(record => record.kind === 'damage')?.id ?? '');
  const notice = ref('已加载普通伤害样本。修改参数会立即重新计算。');
  const error = ref('');
  const busy = ref(false);
  const result = computed(() => evaluateWorkbench(project.value));
  const dirty = computed(() => savedSnapshot.value === null || JSON.stringify(project.value) !== savedSnapshot.value);
  const actor = computed(() => project.value.candidate.actors.find(entry => entry.id === actorId.value));

  function installProject(next: WorkbenchProject) {
    project.value = next;
    if (!next.candidate.actors.some(entry => entry.id === actorId.value)) actorId.value = next.candidate.actors[0]?.id ?? '';
    if (!next.timeline.some(record => record.id === selectedId.value)) selectedId.value = next.timeline.find(record => record.kind === 'damage')?.id ?? next.timeline[0]?.id ?? '';
    savedSnapshot.value = JSON.stringify(next);
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

  function createProject(id: string = crypto.randomUUID()): void {
    const next = workbenchProjectSchema.parse({ schemaVersion: 1, rulesVersion: 'workbench-v1', id, revision: '1',
      definitions: [], candidate: { id: `${id}-candidate`, actors: [] }, conditions: {}, timeline: [], objective: {} });
    installProject(next);
    savedSnapshot.value = null;
    notice.value = '已新建空轴，尚未保存。角色与定义可通过项目导入准备。';
  }

  async function saveProject(): Promise<boolean> {
    if (busy.value) return false;
    error.value = '';
    const parsed = workbenchProjectSchema.safeParse(project.value);
    if (!parsed.success || result.value.status === 'invalid') {
      error.value = '请先修正非法数值、引用或计算规则再保存；未知条件可以保留。';
      return false;
    }
    const snapshot = JSON.stringify(parsed.data);
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
        if (!saved) return false;
        notice.value = '项目已保存，包含完整轴、定义、候选配装及未知条件。';
      } else {
        downloadJson(parsed.data, `${parsed.data.id}.json`);
        notice.value = '已导出项目文件。再次打开该文件即可重新求值。';
      }
      // Inputs may change while the native dialog is open. Only the written snapshot is saved.
      savedSnapshot.value = snapshot;
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
    replaceProject, importContent, loadSample, createProject, saveProject, openNativeProject, inputFile };
});
