<script setup lang="ts">
import { ref } from 'vue';
import { loadRealCatalog, getArtifactMain } from '@leyline/game-data/real';
import { useAccountStore } from './stores/account';
import { previewMonaImport, confirmMonaImport, type MonaImportPreview } from './domain/mona-import';
import { accountSlotLabels } from './domain/account';
import { localDataErrorLabel } from './domain/workbench-labels';
const store = useAccountStore();
const content = ref('');
const preview = ref<MonaImportPreview>();
const error = ref('');
const busy = ref(false);
const allowUpdates = ref(false);
const fileInput = ref<HTMLInputElement>();
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  preview.value = undefined;
  try {
    if (file && file.size > 8 * 1024 * 1024) throw new Error('莫娜文件超过 8 MiB，未读取。');
    if (file) { content.value = await file.text(); error.value = ''; }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '文件读取失败。'; }
  input.value = '';
}
async function inspect() {
  if (busy.value) return;
  busy.value = true; error.value = ''; preview.value = undefined; allowUpdates.value = false;
  try {
    const [catalog, main] = await Promise.all([loadRealCatalog(), getArtifactMain()]);
    const snapshot = content.value, owner = store.account;
    const result = await previewMonaImport(snapshot, owner, catalog.sets, main);
    if (snapshot !== content.value || owner !== store.account) throw new Error('文件或账号已切换，请重新预览。');
    preview.value = result;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '莫娜文件无法识别，库存保持不变。'; }
  finally { busy.value = false; }
}
function confirm() {
  if (!preview.value) return;
  try {
    const added = confirmMonaImport(store.account, preview.value, allowUpdates.value);
    store.notice = `已新增 ${added} 件、明确更新 ${allowUpdates.value ? preview.value.updates.length : 0} 件五星圣遗物；未更改任何角色装备归属，请保存账号文件。`;
    preview.value = undefined; content.value = ''; error.value = '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '导入未完成，库存保持不变。'; }
}
</script>
<template>
  <section class="mona-import" aria-label="莫娜圣遗物导入">
    <h3>导入莫娜圣遗物</h3>
    <p>支持莫娜社区版第一版导出文件。比例直接保留文件中的小数，主词条采用对应等级表。仅导入库存，不改变任何角色装备。</p>
    <div class="import-actions"><button @click="fileInput?.click()">选择莫娜文件</button><button :disabled="busy || !content.trim()" @click="inspect">预览莫娜导入</button></div>
    <input ref="fileInput" type="file" accept=".json,application/json" aria-label="导入莫娜圣遗物文件" hidden @change="readFile">
    <details><summary>或粘贴导出内容</summary><textarea v-model="content" aria-label="莫娜圣遗物 JSON" rows="4" @input="preview = undefined"></textarea></details>
    <p v-if="busy" role="status">正在校验圣遗物文件…</p>
    <div v-if="error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>
    <div v-if="preview" class="import-preview" aria-label="莫娜导入预览">
      <p>新增 {{ preview.additions.length }} 件；已存在 {{ preview.duplicates }} 件；跳过 {{ preview.skipped.length }} 件；冲突 {{ preview.conflicts.length }} 件。</p>
      <p>同属性实物保留各自身份；没有原始标识时，按内容和相同内容的出现次数保持同文件重复导入幂等。此格式不含角色装备归属。</p>
      <ul><li v-for="item in preview.additions" :key="item.id">{{ item.name }} · {{ accountSlotLabels[item.slot] }} · {{ item.real?.level }}级{{ item.mona?.omit ? ' · 原文件标记忽略' : '' }}</li></ul>
      <p v-for="message in [...preview.skipped, ...preview.conflicts]" :key="message">{{ message }}</p>
      <label v-if="preview.updates.length"><input v-model="allowUpdates" type="checkbox" aria-label="允许更新已存在的莫娜实物">明确更新 {{ preview.updates.length }} 件同来源实物（保留名称、实例和角色装备归属）</label><button :disabled="preview.conflicts.length > 0 && (!allowUpdates || preview.updates.length !== preview.conflicts.length)" @click="confirm">{{ allowUpdates ? `确认新增 ${preview.additions.length} 件并更新 ${preview.updates.length} 件五星圣遗物` : `确认导入 ${preview.additions.length} 件五星圣遗物` }}</button><button @click="preview = undefined">取消导入</button>
    </div>
  </section>
</template>
<style scoped>
.mona-import { border-block: 1px solid var(--line, #d8c9a8); padding: 18px 0; margin-bottom: 20px; } p, li { font-size: 12px; line-height: 1.8; } .import-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; } textarea { width: 100%; box-sizing: border-box; margin-top: 10px; } .import-preview { border: 1px solid var(--line, #d8c9a8); padding: 14px; margin-top: 12px; } .import-preview ul { max-height: 200px; overflow: auto; } button { margin-right: 8px; } details { font-size: 12px; overflow-wrap: anywhere; }
</style>
