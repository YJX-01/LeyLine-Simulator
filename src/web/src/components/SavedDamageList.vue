<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { deleteSavedDamage, listSavedDamage, type SavedDamageSummary } from '../platform/saved-damage';
import { damageNumber } from '../domain/calculator-factors';
import WorkbenchDialog from './WorkbenchDialog.vue';
import ConfirmationDialog from './ConfirmationDialog.vue';

const emit = defineEmits<{ close: []; open: [id: string]; deleted: [id: string] }>();
const rows = shallowRef<SavedDamageSummary[]>();
const removing = shallowRef<SavedDamageSummary>();
const error = ref('');
onMounted(async () => {
  try { rows.value = await listSavedDamage(); }
  catch { error.value = '无法读取本机伤害列表。'; }
});
async function remove() {
  const row = removing.value;
  if (!row) return;
  removing.value = undefined;
  try {
    await deleteSavedDamage(row.id);
    rows.value = rows.value?.filter(entry => entry.id !== row.id);
    emit('deleted', row.id);
  } catch { error.value = '删除失败，请重试。'; }
}
</script>

<template>
  <WorkbenchDialog title="伤害列表" center-title @close="emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!rows" role="status">正在读取…</p>
    <p v-else-if="!rows.length">还没有保存的伤害</p>
    <ul v-if="rows?.length" class="damage-list">
      <li v-for="row in rows" :key="row.id">
        <button type="button" class="damage-entry" data-card-action="detail" @click="emit('open', row.id)">
          <strong>{{ row.name }}</strong>
          <span v-if="row.value != null">{{ row.verification === 'pending' ? '模型估算伤害' : '伤害' }} {{ damageNumber(row.value) }}</span>
          <small>{{ [row.team, new Date(row.savedAt).toLocaleString('zh-CN')].filter(Boolean).join(' / ') }}</small>
        </button>
        <button type="button" class="ui-action soft" data-size="md" data-accent="pyro" :aria-label="'删除 ' + row.name" @click="removing = row">删除</button>
      </li>
    </ul>
    <ConfirmationDialog v-if="removing" title="删除已保存的伤害？" confirm-label="删除" @cancel="removing = undefined" @confirm="remove">
      <p>{{ removing.name }}</p>
    </ConfirmationDialog>
  </WorkbenchDialog>
</template>

<style scoped>
.damage-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
.damage-list li { display:flex; align-items:center; gap:8px; min-width:0; }
.damage-entry { flex:1; display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; min-width:0; padding:12px; text-align:left; }
.damage-entry strong { flex:1 1 auto; overflow-wrap:anywhere; }
.damage-entry small { width:100%; color:var(--muted); font-size:var(--font-body); overflow-wrap:anywhere; }
.damage-entry span { font-variant-numeric:tabular-nums; }
</style>
