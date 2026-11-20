<script setup lang="ts">
import { computed } from 'vue';
import type { DamageRequest, DamageResult } from '@leyline/schema';
import { calculatorFactors, damageNumber } from '../domain/calculator-factors';
import type { CalculatorBuff } from '../domain/calculator-buffs';
const props = defineProps<{ real: DamageResult; damage: DamageRequest; buffs: CalculatorBuff[] }>();
const cards = computed(() => calculatorFactors(props.real, props.damage, props.buffs));
</script>
<template>
  <section v-if="cards.length" aria-label="伤害乘区" class="factor-grid">
    <details v-for="card in cards" :key="card.label" class="factor-card">
      <summary><span>{{ card.label }}</span><strong>{{ card.multiplier && card.value != null ? '× ' : '' }}{{ damageNumber(card.value) }}</strong>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary>
      <dl v-if="card.rows.length"><div v-for="([label,value], i) in card.rows" :key="i"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
      <p v-else>分项待确认</p>
    </details>
  </section>
</template>
<style scoped>
.factor-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:start; gap:10px; }
.factor-card { min-width:0; background:var(--surface); border:1px solid var(--line); border-radius:7px; }
.factor-card[open] { border-color:var(--element-hydro-primary); }
summary { display:grid; grid-template-columns:1fr auto; align-items:center; gap:4px 8px; cursor:pointer; padding:12px; color:var(--ink); font-size:var(--font-body); }
summary::-webkit-details-marker { display:none; }
summary strong { grid-row:2; font-size:var(--font-dialog); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
summary svg { grid-column:2; grid-row:1 / 3; width:18px; height:18px; color:var(--muted); }
details[open] svg { transform:rotate(180deg); }
dl,p { border-top:1px solid var(--line); padding:8px 12px; margin:0; font-size:var(--font-body); }
dl div { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:2px 8px; padding-block:4px; }
dt { color:var(--muted); } dd { margin:0 0 0 auto; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
@media(max-width:850px) { .factor-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:480px) { .factor-card:first-child { grid-column:1/-1; } summary { padding:10px; } }
</style>
