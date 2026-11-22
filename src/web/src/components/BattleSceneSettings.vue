<script setup lang="ts">
import { ref } from 'vue';
import { loadBattleScenes } from '@leyline/game-data';
import { sceneDomain, type SceneDefinition, type SceneSelection } from '@leyline/schema';

const props = defineProps<{ selections?: SceneSelection[] }>();
const emit = defineEmits<{ change: [value: SceneSelection[]] }>();
const choices = ref<SceneDefinition[]>([]), error = ref('');
const groups = [
  { id: 'attack-food', name: '攻击类料理' }, { id: 'defense-food', name: '防御类料理' },
  { id: 'potion', name: '药剂' }, { id: 'field', name: '场地' },
] as const;
async function open(event: Event) {
  if (choices.value.length || !(event.currentTarget as HTMLDetailsElement).open) return;
  try { choices.value = await loadBattleScenes(); } catch (cause) { error.value = String(cause); }
}
function select(group: string, id: string) {
  const other = (props.selections ?? []).filter(entry => entry.definition.group !== group);
  const definition = choices.value.find(item => item.id === id);
  if (definition) {
    const domainEffects = group === 'field' ? choices.value.filter(item => item.group === 'field' && item.id !== id && sceneDomain(item.id) === sceneDomain(id)) : [];
    for (const effect of [definition, ...domainEffects]) other.push({ definition: effect, startMs: 0, endMs: effect.durationMs ?? 3600000 });
  }
  emit('change', other);
}
function setTime(entry: SceneSelection, field: 'startMs' | 'endMs', event: Event) {
  const input = event.target as HTMLInputElement;
  const ms = Math.round(input.valueAsNumber * 1000);
  const next = { ...entry, [field]: ms };
  if (field === 'startMs' && entry.definition.durationMs) next.endMs = Math.min(3600000, ms + entry.definition.durationMs);
  if (!Number.isFinite(ms) || ms < 0 || next.startMs >= next.endMs || next.endMs > 3600000
    || entry.definition.durationMs !== null && next.endMs - next.startMs > entry.definition.durationMs) {
    input.value = String(entry[field] / 1000);
    error.value = '请填写有效的起止时刻。'; return;
  }
  error.value = '';
  emit('change', (props.selections ?? []).map(current => current === entry ? next : current));
}
</script>

<template>
  <details class="battle-scenes" @toggle="open"><summary>场景效果</summary>
    <div class="scene-fields"><label v-for="group in groups" :key="group.id">{{ group.name }}
      <select :value="selections?.find(entry => entry.definition.group === group.id)?.definition.id ?? ''" @change="select(group.id, ($event.target as HTMLSelectElement).value)">
        <option value="">无</option><option v-for="entry in choices.filter(item => item.group === group.id)" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
      </select>
    </label></div>
    <fieldset v-for="entry in selections" :key="entry.definition.id + entry.startMs"><legend>{{ entry.definition.name }}有效区间</legend>
      <div class="scene-fields"><label>开始（秒）<input type="number" min="0" max="3600" step="0.001" :value="entry.startMs / 1000" @change="setTime(entry, 'startMs', $event)"></label>
        <label>结束（秒）<input type="number" min="0" max="3600" step="0.001" :value="entry.endMs / 1000" @change="setTime(entry, 'endMs', $event)"></label></div>
    </fieldset><p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>

<style scoped>
.battle-scenes summary { cursor:pointer; font-weight:700; line-height:var(--control-height-md); }
.scene-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:8px; }
.scene-fields label { display:grid; min-width:0; gap:4px; }
.scene-fields select,.scene-fields input { width:100%; min-width:0; }
</style>
