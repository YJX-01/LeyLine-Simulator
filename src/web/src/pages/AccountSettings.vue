<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAccountStore } from '../stores/account';
import { localDataErrorLabel } from '../domain/workbench-labels';

const store = useAccountStore();
const fileInput = ref<HTMLInputElement>();
const uid = ref(store.account.uid ?? ''), uidError = ref('');
watch(() => [store.account.id, store.account.uid], () => { uid.value = store.account.uid ?? ''; });
function saveUid() {
  const value = uid.value.trim();
  if (value && !/^\d{9,10}$/.test(value)) { uidError.value = '请输入9至10位数字 UID。'; return; }
  try { const next = JSON.parse(JSON.stringify(store.account)); if (value) next.uid = value; else delete next.uid; store.commitEdit(next); uidError.value = ''; }
  catch (cause) { uidError.value = cause instanceof Error ? cause.message : 'UID 保存失败。'; }
}
function resetSelection() {
  store.selectedCharacterId = '';
  store.characterQuery = '';
  store.characterElement = []; store.characterWeapon = []; store.characterRarity = []; store.characterSort = 'release';store.characterSortDirection='desc';
  store.inventoryQuery = '';
  store.inventorySlot = [];
  store.inventoryStat = [];
  store.inventoryOwner = [];store.inventoryFavoriteFilter=[];
  store.inventoryPage = 1;
  store.inventorySet = []; store.inventorySubstat = []; store.inventoryLevel = []; store.inventorySort = 'release';store.inventorySortDirection='desc';
}
async function openAccount() {
  const before = store.account;
  if (!await store.open()) fileInput.value?.click();
  if (store.account !== before) resetSelection();
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const before = store.account;
  if (input.files?.[0]) await store.inputFile(input.files[0]);
  if (store.account !== before) resetSelection();
  input.value = '';
}
function replaceAccount(restore = false) {
  const before = store.account;
  if (restore) store.restorePrevious(); else store.create();
  if (store.account !== before) resetSelection();
}
</script>

<template>
  <section class="account-settings" aria-label="账号管理">
    <header><h2>账号管理</h2><span class="account-save-state">{{ store.dirty ? '账号有未保存修改' : '账号文件已保存' }}</span></header>
    <label>当前账号名称<input v-model="store.account.name" aria-label="账号名称" maxlength="160"></label>
    <label>游戏 UID<input v-model="uid" aria-label="账号游戏 UID" inputmode="numeric" maxlength="10" placeholder="绑定该账号的 UID" @change="saveUid" @keydown.enter.prevent="saveUid"></label>
    <p v-if="uidError" role="alert">{{ uidError }}</p>
    <p class="account-summary">{{ store.account.characters.length }} 位角色 · {{ store.account.artifacts.filter(item=>item.inventoryId!==null).length }} 件圣遗物</p>
    <div class="account-file-actions"><button class="ui-action" data-accent="anemo" :disabled="store.busy" @click="store.save()">保存账号资料</button><button class="ui-action soft" data-accent="anemo" :disabled="store.busy" @click="openAccount">打开 / 切换账号</button><button class="ui-action soft" data-accent="anemo" :disabled="store.busy" @click="replaceAccount()">新建账号</button><button class="ui-action soft" data-accent="anemo" v-if="store.previous" :disabled="store.busy" @click="replaceAccount(true)">恢复替换前账号</button></div>
    <input ref="fileInput" type="file" accept=".json,application/json" aria-label="导入账号资料文件" hidden @change="importFile">
    <p class="account-hint">切换前保留恢复副本，不更改已有轴。角色页可导入 Enka 展柜，圣遗物库存页可导入莫娜 JSON。</p>

    <div v-if="store.error" role="alert">{{ localDataErrorLabel(store.error) }}<details><summary>技术详情</summary>{{ store.error }}</details></div>
  </section>
</template>

<style scoped>
.account-settings { margin:0; }
header { display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:16px; margin-bottom:12px; }
h2 { font-size:var(--font-dialog); margin:0; } p { font-size:var(--font-body); line-height:1.8; margin:10px 0; }
label { display:grid; gap:8px; max-width:400px; margin-bottom:14px; font-size:var(--font-body); } input { width:100%; box-sizing:border-box; }
.account-file-actions { display:flex; gap:12px; flex-wrap:wrap; margin:20px 0; }
.account-save-state { font-size:var(--font-body); color:var(--element-geo-deep); background:var(--element-geo-light); border:1px solid var(--neutral-line); border-radius:6px; padding:8px 12px; }
.account-hint { color:var(--neutral-muted); } [role=alert] { color:var(--element-pyro-deep); }
</style>
