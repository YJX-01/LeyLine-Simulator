<script setup lang="ts">
import { computed, ref } from 'vue';
import { hitSearchText, type CalculatorHitChoice } from '../domain/calculator-hits';
import { realElementLabel } from '../domain/workbench-labels';
import GameIcon from './GameIcon.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';

const props = defineProps<{ choices: CalculatorHitChoice[]; selected?: string }>();
const emit = defineEmits<{ select: [choice: CalculatorHitChoice]; close: [] }>();
const query = ref('');
const groups = computed(() => {
  const result = new Map<string, CalculatorHitChoice[]>();
  for (const choice of props.choices) {
    if (!hitSearchText(choice).includes(query.value.trim().toLowerCase())) continue;
    const list = result.get(choice.group) ?? [];
    list.push(choice);
    result.set(choice.group, list);
  }
  return result;
});
</script>
<template>
  <WorkbenchDialog title="选择伤害" center-title @close="emit('close')">
    <div class="damage-picker">
      <LibraryToolbar v-model="query" label="搜索伤害" placeholder="搜索伤害、天赋或别名…" search-only />
      <section v-for="([group, rows]) in groups" :key="group" :aria-label="group">
        <h3><GameIcon kind="skills" :id="rows[0].icon" :size="24" />{{ group }} <span>{{ rows[0].skillName }}</span></h3>
        <div class="hit-options">
          <button v-for="row in rows" :key="row.outputId ?? row.hitId" type="button" :disabled="!row.outputId"
            :data-output-id="row.outputId" :data-skill-id="row.skillId" :aria-pressed="!!row.outputId && selected === row.outputId" @click="emit('select',row)">
            <strong>{{ row.alias }}</strong><span>{{ row.name }}</span><small>{{ row.outputId ? realElementLabel(row.element) : '尚未支持' }}</small>
          </button>
        </div>
      </section>
      <p v-if="!groups.size" class="empty">没有符合条件的伤害</p>
    </div>
  </WorkbenchDialog>
</template>
<style scoped>
.damage-picker { display:grid; gap:20px; }
h3 { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:0 0 8px; font-size:var(--font-control); }
h3 span,small { font-size:var(--font-body); color:var(--muted); font-weight:400; }
.hit-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr)); gap:8px; }
.hit-options button { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:10px; text-align:left; min-height:48px; padding:8px 12px; border:1px solid var(--line); border-radius:7px; background:var(--surface-raised); }
.hit-options button[aria-pressed=true] { border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }
.hit-options strong { color:var(--element-anemo-deep); font-size:var(--font-control); }
.hit-options span { overflow-wrap:anywhere; }
.empty { color:var(--muted); }
</style>
