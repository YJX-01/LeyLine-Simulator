<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RealStat } from '@leyline/schema';
import { loadRealCatalog } from '@leyline/game-data/real';
import type { AccountArtifact } from './domain/account';
import { accountStatLabels, accountSubstats, accountMainStats, ratioStat } from './domain/account-real';
const props = defineProps<{ item: AccountArtifact }>();
const sets = ref<{ id: string; name: string }[]>([]);
const error = ref('');
const available = computed(() => accountMainStats[props.item.slot]);
async function open(event: Event) {
  if (!(event.target as HTMLDetailsElement).open || sets.value.length) return;
  try { sets.value = (await loadRealCatalog()).sets; }
  catch { error.value = '真实套装目录加载失败，请重试。'; }
}
function enable() {
  props.item.real = { id: props.item.id, setId: 'none', slot: props.item.slot, rarity: 5, level: 0, mainStat: available.value[0], substats: [] };
}
function addSubstat() {
  const real = props.item.real;
  if (!real || real.substats.length >= 4) return;
  const stat = accountSubstats.find(stat => stat !== real.mainStat && !real.substats.some(entry => entry.stat === stat));
  if (stat) real.substats.push({ stat, value: ratioStat(stat) ? 0.05 : 20 });
}
function setValue(index: number, event: Event) {
  const sub = props.item.real?.substats[index];
  if (!sub) return;
  const raw = (event.target as HTMLInputElement).value;
  sub.value = raw.trim() ? Number(raw) / (ratioStat(sub.stat) ? 100 : 1) : NaN;
}
function statChange(index: number, event: Event) {
  const sub = props.item.real?.substats[index];
  if (!sub) return;
  sub.stat = (event.target as HTMLSelectElement).value as RealStat;
  sub.value = ratioStat(sub.stat) ? 0.05 : 20;
}
</script>
<template>
  <details class="real-artifact-editor" @toggle="open">
    <summary>真实五星词条</summary>
    <p>旧版攻击增量与真实词条分开保存。真实配装按主词条等级表与下列副词条计算；请按实物填写，比例输入使用百分数。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="!item.real" @click="enable">启用真实词条</button>
    <div v-else class="artifact-fields">
      <label>套装<select v-model="item.real.setId" :aria-label="`真实套装 ${item.name}`"><option value="none">无套装（散件）</option><option v-for="set in sets" :key="set.id" :value="set.id">{{ set.name }}</option></select></label>
      <label>等级<input v-model.number="item.real.level" :aria-label="`真实等级 ${item.name}`" type="number" min="0" max="20" step="1"></label>
      <label>主词条<select v-model="item.real.mainStat" :aria-label="`真实主词条 ${item.name}`"><option v-for="stat in available" :key="stat" :value="stat">{{ accountStatLabels[stat] }}{{ ratioStat(stat) ? '（%）' : '' }}</option></select></label>
      <div v-for="(sub, index) in item.real.substats" :key="index" class="substat-row">
        <label>副词条{{ index + 1 }}<select :value="sub.stat" :aria-label="`${item.name}副词条${index + 1}类型`" @change="statChange(index, $event)"><option v-for="stat in accountSubstats.filter(stat => stat !== item.real?.mainStat)" :key="stat" :value="stat">{{ accountStatLabels[stat] }}</option></select></label>
        <label>数值{{ ratioStat(sub.stat) ? '（%）' : '' }}<input type="number" step="any" :aria-label="`${item.name}副词条${index + 1}数值`" :value="sub.value * (ratioStat(sub.stat) ? 100 : 1)" @input="setValue(index, $event)"></label>
        <button :aria-label="`删除${item.name}副词条${index + 1}`" @click="item.real.substats.splice(index, 1)">删除</button>
      </div>
      <button :disabled="item.real.substats.length >= 4" @click="addSubstat">添加真实副词条</button>
      <p v-if="item.mona">导入主词条原值已保留，实际计算按等级表取值；手动编辑不会自动改变轴内旧快照。</p>
    </div>
  </details>
</template>
<style scoped>
.real-artifact-editor { font-size: 12px; overflow-wrap: anywhere; } p { line-height: 1.7; margin: 10px 0; } .artifact-fields { display: grid; gap: 12px; margin-top: 12px; } label { display: grid; gap: 6px; } input, select { width: 100%; min-width: 0; box-sizing: border-box; } .substat-row { display: grid; gap: 8px; } button { margin-block: 6px; }
</style>
