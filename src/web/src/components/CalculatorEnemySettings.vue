<script setup lang="ts">
import { computed } from 'vue';
import { elements, type Element, type Enemy } from '@leyline/schema';
import { realElementLabel } from '../domain/workbench-labels';

const props = defineProps<{ enemy: Enemy; element?: Element | null; disabled?: boolean }>();
const emit = defineEmits<{ change: [Enemy] }>();
const remaining = computed(() => elements.filter(element => element !== props.element));
const percent = (ratio: number) => Number((ratio * 100).toPrecision(15));
type EnemyField = Element | 'level' | 'defenseReduction' | 'defenseIgnore';
function edit(key: EnemyField, event: Event) {
  const input = event.target as HTMLInputElement;
  const resistance = elements.find(element => element === key);
  const level = key === 'level';
  if (!Number.isFinite(input.valueAsNumber)) {
    const previous = key === 'level' || key === 'defenseReduction' || key === 'defenseIgnore'
      ? props.enemy[key] : props.enemy.resistances[key];
    input.value = String(level ? previous : percent(previous));
    return;
  }
  const value = Math.min(Number(input.max), Math.max(Number(input.min), level ? Math.round(input.valueAsNumber) : input.valueAsNumber));
  input.value = String(value);
  if (resistance) emit('change', { ...props.enemy, resistances: { ...props.enemy.resistances, [resistance]: value / 100 } });
  else emit('change', { ...props.enemy, [key]: level ? value : value / 100 });
}
</script>
<template>
  <section class="library-section monster" aria-labelledby="calculator-monster-title">
    <h3 id="calculator-monster-title">怪物属性</h3>
    <fieldset :disabled="disabled">
      <div class="stat-fields">
        <label>怪物等级<input name="enemy-level" type="number" min="1" max="200" step="1" :value="enemy.level" @change="edit('level', $event)"></label>
        <label v-if="element" :key="element">{{ realElementLabel(element) }}基础抗性（%）<input :name="'resistance-' + element" type="number" min="-1000" max="1000" step="any"
          :value="percent(enemy.resistances[element])" @change="edit(element, $event)"></label>
      </div>
      <details>
        <summary>全部抗性与防御设置</summary>
        <div class="stat-fields">
          <label v-for="other in remaining" :key="other">{{ realElementLabel(other) }}基础抗性（%）<input :name="'resistance-' + other" type="number" min="-1000" max="1000" step="any"
            :value="percent(enemy.resistances[other])" @change="edit(other, $event)"></label>
          <label>减防（%）<input name="defense-reduction" type="number" min="0" max="100" step="any" :value="percent(enemy.defenseReduction)" @change="edit('defenseReduction', $event)"></label>
          <label>无视防御（%）<input name="defense-ignore" type="number" min="0" max="100" step="any" :value="percent(enemy.defenseIgnore)" @change="edit('defenseIgnore', $event)"></label>
        </div>
      </details>
    </fieldset>
  </section>
</template>
<style scoped>
.monster { display:grid; gap:12px; min-width:0; }
h3 { margin:0; font-size:var(--font-control); }
fieldset { min-width:0; border:0; padding:0; margin:0; }
.stat-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr)); gap:8px 12px; }
label { display:grid; gap:4px; min-width:0; }
input { min-width:0; width:100%; box-sizing:border-box; font-variant-numeric:tabular-nums; }
details { margin-top:10px; }
summary { width:fit-content; cursor:pointer; color:var(--ink); font-weight:700; line-height:var(--control-height-md); }
details[open] > summary { margin-bottom:8px; }
</style>
