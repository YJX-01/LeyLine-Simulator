<script setup lang="ts">
import { computed, ref } from 'vue';
import { hitSearchText, type CalculatorHitChoice } from '../domain/calculator-hits';
import { realElementLabel } from '../domain/workbench-labels';
import { damageFamilyLabel } from '../domain/workbench-labels';
import { transformativeFamilies, transformativeElements, type TransformativeFamily } from '@leyline/schema';
import GameIcon from './GameIcon.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';

const props = defineProps<{ choices: CalculatorHitChoice[]; selected?: string }>();
const emit = defineEmits<{ select: [choice: CalculatorHitChoice]; reaction:[family:TransformativeFamily,element:typeof transformativeElements.swirl[number]]; close: [] }>();
const query = ref('');
const reactions = computed(() => transformativeFamilies.flatMap(family =>
  transformativeElements[family].map(element => ({family,element,label:damageFamilyLabel(family)+(family==='swirl'?' · '+realElementLabel(element):'')})))
  .filter(row => ('剧变反应 '+row.label+' '+row.family).toLowerCase().includes(query.value.trim().toLowerCase())));
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
        <h3><GameIcon :kind="rows[0].iconKind ?? 'skills'" :id="rows[0].icon" :size="24" />{{ group }} <span>{{ rows[0].skillName }}</span></h3>
        <div class="hit-options">
          <button v-for="row in rows" :key="row.hitId" type="button" data-card-action="select" :disabled="!row.available"
            :data-hit-id="row.hitId" :data-skill-id="row.skillId" :aria-pressed="!!row.available && selected === row.hitId" @click="emit('select',row)">
            <strong>{{ row.alias }}</strong><span>{{ row.name }}</span><small>{{ row.available ? realElementLabel(row.element) : '尚未支持' }}</small>
          </button>
        </div>
      </section>
      <section v-if="reactions.length" aria-label="剧变反应"><h3>剧变反应</h3><div class="hit-options">
        <button v-for="r in reactions" :key="r.family+r.element" type="button" :data-reaction="r.family" :data-element="r.element" @click="emit('reaction',r.family,r.element)">{{ r.label }}</button>
      </div></section>
      <p v-if="!groups.size && !reactions.length" class="empty">没有符合条件的伤害</p>
    </div>
  </WorkbenchDialog>
</template>
<style scoped>
.damage-picker { display:grid; gap:20px; }
h3 { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:0 0 8px; font-size:var(--font-control); }
h3 span,small { font-size:var(--font-body); color:var(--muted); font-weight:400; }
.hit-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr)); gap:8px; }
.hit-options button { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:10px; text-align:left; min-height:48px; padding:8px 12px; background:var(--surface-raised); }
.hit-options button[aria-pressed=true] { background:var(--element-hydro-light); }
.hit-options strong { color:var(--element-hydro-deep); font-size:var(--font-control); }
.hit-options span { overflow-wrap:anywhere; }
.empty { color:var(--muted); }
</style>
