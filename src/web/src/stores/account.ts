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
  const notice = ref('');
  const busy = ref(false);
  // Navigation context is session UI state, not part of the account file.
  const selectedCharacterId = ref('');
  const characterQuery = ref('');
  const characterElement = ref('');
  const characterWeapon = ref('');
  const characterProfile = ref('');
  const characterEquipment = ref('');
  const characterSort = ref('name');
  const inventoryQuery = ref('');
  const inventorySlot = ref('');
  const inventoryStat = ref('');
  const inventoryOwner = ref('all');
  const inventoryPage = ref(1);
  const inventorySet = ref('');
  const inventorySubstat = ref('');
  const inventoryLevel = ref('');
  const inventorySort = ref('default');
  watch(() => account.value.id, () => {
    selectedCharacterId.value=''; characterQuery.value=''; characterElement.value=''; characterWeapon.value=''; characterProfile.value=''; characterEquipment.value=''; characterSort.value='name';
    inventoryQuery.value=''; inventorySlot.value=''; inventoryStat.value=''; inventoryOwner.value='all'; inventoryPage.value=1; inventorySet.value=''; inventorySubstat.value=''; inventoryLevel.value=''; inventorySort.value='default';
  });
  const previous = ref<LocalAccount>();
  try {
    const content = typeof localStorage === 'undefined' ? null : localStorage.getItem(`${storageKey}-previous`);
    if (content) previous.value = parseAccount(JSON.parse(content));
  } catch { /* Current account remains available even if an older backup cannot be read. */ }
  try {
    const content = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
    if (content) { account.value = parseAccount(JSON.parse(content)); notice.value = '已恢复上次本地账号草稿，请另存文件备份。'; }
  } catch { error.value = '本地账号草稿无法读取，未覆盖原始草稿。'; }
  const dirty = computed(() => saved.value !== JSON.stringify(account.value));
  watch(account, value => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(parseAccount(value))); }
    catch { error.value = '账号草稿未能自动保存，请检查输入并另存文件。'; }
  }, { deep: true, flush: 'sync' });
  function backup() {
    const snapshot = parseAccount(account.value);
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem(`${storageKey}-previous`, JSON.stringify(snapshot));
    previous.value = snapshot;
  }
  function restorePrevious() {
    if (!previous.value) return;
    const next = previous.value;
    try { backup(); account.value = next; saved.value = null; notice.value = '已恢复替换前的账号资料，请保存文件备份。'; error.value = ''; }
    catch { error.value = '无法保留当前账号备份，未执行恢复。请先保存文件。'; }
  }
  function create(name?: string) {
    try { backup(); account.value = createAccount(name); saved.value = null; error.value = ''; notice.value = '已新建独立账号；可恢复替换前资料。'; }
    catch { error.value = '无法保留当前账号备份，未新建账号。请先保存文件。'; }
  }
  function importContent(content: string) {
    if (new TextEncoder().encode(content).byteLength > maximumBytes) throw new Error('账号文件超过 8 MiB，现有账号保持不变。');
    let input: unknown;
    try { input = JSON.parse(content); } catch { throw new Error('账号文件无法识别，现有账号保持不变。'); }
    const next = parseAccount(input);
    backup();
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
      if (bridge) { if (!await bridge.saveProject(JSON.stringify(next, null, 2))) { notice.value = '已取消账号保存，当前编辑保留。'; return false; } }
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
  return { account, dirty, error, notice, busy, create, save, open, importContent, inputFile, previous, restorePrevious,
    selectedCharacterId, characterQuery, characterElement, characterWeapon, characterProfile, characterEquipment, characterSort, inventoryQuery, inventorySlot, inventoryStat, inventoryOwner, inventoryPage, inventorySet, inventorySubstat, inventoryLevel, inventorySort };
});
