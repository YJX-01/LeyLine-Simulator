import { formatJson } from '@leyline/schema';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { parseDefinitionLibrary, type DefinitionLibraryFile } from '../domain/definition-library';
import { downloadJson } from '../domain/download';
import { getDesktopBridge } from '../platform/desktop';
import { fileSignature } from '../domain/file-signature';

const storageKey = 'leyline-definition-library-v2';
export const useDefinitionLibraryStore = defineStore('definition-library', () => {
  const library = ref<DefinitionLibraryFile>({ schemaVersion: 2, kind: 'definition-library', id: crypto.randomUUID(), name: '本地内容定义库', definitions: [] });
  const error = ref('');
  const notice = ref('定义库独立保存；复制到轴后保留当时版本。');
  const busy = ref(false);
  const savedSnapshot = ref<string | null>(null);
  const dirty = computed(() => fileSignature(library.value) !== savedSnapshot.value);
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
    if(saved)load(JSON.parse(saved));
  } catch { error.value = '本地定义库恢复失败，未覆盖原有存储；可重新打开文件。'; }
  watch(library, value => {
    try { localStorage.setItem(storageKey, JSON.stringify(parseDefinitionLibrary(value))); }
    catch { error.value = '定义库尚未写入本地存储，请修正内容或另存文件。'; }
  }, { deep: true });
  function load(input:unknown):void {
    library.value = parseDefinitionLibrary(input);
  }
  function importContent(content: string) {
    if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) throw new Error('定义库超过 8 MiB，当前资料保持不变。');
    let input: unknown;
    try { input = JSON.parse(content); } catch { throw new Error('定义库文件无法识别，当前资料保持不变。'); }
    load(input);
    savedSnapshot.value = fileSignature(library.value);
    error.value = '';
    notice.value = '已打开独立内容定义库，当前轴快照保持原版本。';
  }
  async function save(): Promise<boolean> {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    try {
      const parsed = parseDefinitionLibrary(library.value);
      const snapshot = fileSignature(parsed);
      if (new TextEncoder().encode(snapshot).byteLength > 8 * 1024 * 1024) throw new Error('定义库超过 8 MiB，未写入文件。');
      const bridge = getDesktopBridge();
      if (bridge) { if (!await bridge.saveProject(formatJson(parsed))) return false; }
      else downloadJson(parsed, '内容定义库.json');
      savedSnapshot.value = snapshot;
      notice.value = '内容定义库已保存，当前轴快照不受后续修改影响。';
      return true;
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '定义库保存失败，资料保持不变。'; return false; }
    finally { busy.value = false; }
  }
  async function openNative(): Promise<boolean> {
    const bridge = getDesktopBridge();
    if (!bridge) return false;
    if (busy.value) return true;
    busy.value = true;
    try { const content = await bridge.openProject(); if (content !== null) importContent(content); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '定义库打开失败。'; }
    finally { busy.value = false; }
    return true;
  }
  return { library, error, notice, busy, dirty, importContent, save, openNative };
});
