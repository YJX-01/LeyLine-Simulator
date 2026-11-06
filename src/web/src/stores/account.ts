import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { createAccount, parseAccount, type LocalAccount } from '../domain/account';
import { downloadJson } from '../domain/download';
import { getDesktopBridge } from '../platform/desktop';

const storageKey = 'leyline-account-v1';
const maximumBytes = 8 * 1024 * 1024;
export const useAccountStore = defineStore('local-account', () => {
  const account = ref<LocalAccount>(createAccount());
  const saved = ref<string | null>(null);
  const error = ref('');
  const notice = ref('账号资料独立保存，候选方案不会回写实际装备。');
  const busy = ref(false);
  try {
    const content = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
    if (content) { account.value = parseAccount(JSON.parse(content)); notice.value = '已恢复上次本地账号草稿，请另存文件备份。'; }
  } catch { error.value = '本地账号草稿无法读取，未覆盖原始草稿。'; }
  const dirty = computed(() => saved.value !== JSON.stringify(account.value));
  watch(account, value => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(parseAccount(value))); }
    catch { error.value = '账号草稿未能自动保存，请检查输入并另存文件。'; }
  }, { deep: true, flush: 'sync' });
  function create(name?: string) { account.value = createAccount(name); saved.value = null; error.value = ''; notice.value = '已新建独立账号。'; }
  function importContent(content: string) {
    if (new TextEncoder().encode(content).byteLength > maximumBytes) throw new Error('账号文件超过 8 MiB，现有账号保持不变。');
    let input: unknown;
    try { input = JSON.parse(content); } catch { throw new Error('账号文件无法识别，现有账号保持不变。'); }
    const next = parseAccount(input);
    account.value = next; saved.value = JSON.stringify(next); error.value = ''; notice.value = '账号已打开，当前轴保持原有快照。';
  }
  async function save(): Promise<boolean> {
    if (busy.value) return false;
    busy.value = true; error.value = '';
    try {
      const next = parseAccount(account.value);
      const snapshot = JSON.stringify(next);
      if (new TextEncoder().encode(snapshot).byteLength > maximumBytes) throw new Error('账号文件超过 8 MiB。');
      const bridge = getDesktopBridge();
      if (bridge) { if (!await bridge.saveProject(JSON.stringify(next, null, 2))) return false; }
      else downloadJson(next, `${next.name}.account.json`);
      saved.value = snapshot; notice.value = '账号文件已保存，轴项目未被修改。'; return true;
    } catch { error.value = '账号保存失败，请检查角色、数值及装备归属；现有资料保持不变。'; return false; }
    finally { busy.value = false; }
  }
  async function open(): Promise<boolean> {
    const bridge = getDesktopBridge();
    if (!bridge) return false;
    if (busy.value) return true;
    busy.value = true; error.value = '';
    try { const content = await bridge.openProject(); if (content !== null) importContent(content); }
    catch { error.value = '账号打开失败，现有账号保持不变。'; }
    finally { busy.value = false; }
    return true;
  }
  async function inputFile(file: File) {
    if (busy.value) return;
    error.value = '';
    try { if (file.size > maximumBytes) throw new Error('文件过大'); importContent(await file.text()); }
    catch { error.value = '账号文件无效或读取失败，现有账号保持不变。'; }
  }
  return { account, dirty, error, notice, busy, create, save, open, importContent, inputFile };
});
