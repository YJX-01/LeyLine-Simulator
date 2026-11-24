<script setup lang="ts">
import { computed } from 'vue';
import type { DamageRequest, DamageResult } from '@leyline/schema';
import { calculatorFactors, damageNumber, type CalculatorFactor } from '../domain/calculator-factors';
import CalculatorFactorItems from './CalculatorFactorItems.vue';
import { realStatLabel } from '../domain/workbench-labels';
import type { CalculatorBuff } from '../domain/calculator-buffs';

const props = defineProps<{ real?: DamageResult; expected?: DamageResult; guaranteedCrit?: boolean; damage: DamageRequest; buffs: CalculatorBuff[] }>();
const cards = computed(() => props.real ? calculatorFactors(props.real, props.damage, props.buffs, props.expected, props.guaranteedCrit) : []);
function groups(card: CalculatorFactor) {
  const base = card.scaling;
  if (!base) return card.rows.length ? [{ title: '', rows: card.rows }] : [];
  return [
    { title: '', rows: card.rows },
    { title: '附加基础伤害（羽毛）', rows: base.flat },
    { title: '反应基础加值', rows: base.reaction },
  ].filter(group => group.rows.length);
}

// Retain each item's colour when another contribution appears or disappears.
const tones = new Map<string, number>();
function hue(factor: string, item: string) {
  const key = JSON.stringify([factor, item]);
  if (!tones.has(key)) tones.set(key, (190 + tones.size * 137.508) % 360);
  return tones.get(key);
}
</script>
<template>
  <section v-if="cards.length" aria-label="伤害乘区" class="factor-grid">
    <details v-for="card in cards" :key="card.id" class="factor-card" data-card-action="detail">
      <summary class="card-action-trigger">
        <span>{{ card.label }}</span>
        <strong>{{ card.multiplier && card.value != null ? '× ' : '' }}{{ damageNumber(card.value) }}</strong>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </summary>
      <div v-if="card.rows.length || card.scaling || card.detail" class="breakdown">
        <template v-if="card.scaling">
          <div class="scaling-pair">
            <section class="scaling-box stat-box">
              <h4>基础属性</h4>
              <div v-for="(term, index) in card.scaling.terms" :key="index" class="scaling-term">
                <span>{{ realStatLabel(term.stat) }}</span><strong>{{ damageNumber(term.attribute) }}</strong>
              </div>
              <CalculatorFactorItems :rows="card.scaling.attributes" :hue="id => hue(card.id,id)" />
            </section>
            <section class="scaling-box rate-box">
              <h4>倍率</h4>
              <div v-for="(term, index) in card.scaling.terms" :key="index" class="scaling-term">
                <span>{{ realStatLabel(term.stat) }}倍率</span>
                <strong>× {{ term.multiplier == null ? '—' : damageNumber(term.multiplier * 100) + '%' }}<template v-if="term.count"> × {{ damageNumber(term.count.value) }}</template></strong>
              </div>
              <CalculatorFactorItems :rows="card.scaling.multipliers" :hue="id => hue(card.id,id)" />
            </section>
          </div>
          <div class="subtotal"><span>基础伤害小计</span><strong>{{ damageNumber(card.scaling.subtotal) }}</strong></div>
        </template>
        <div v-for="group in groups(card)" :key="group.title">
          <h4 v-if="group.title">{{ group.title }}</h4>
          <CalculatorFactorItems :rows="group.rows" :hue="id => hue(card.id,id)" />
        </div>
        <template v-if="card.detail">
          <div v-if="card.detail.columns.length" :class="{ 'scaling-pair': card.detail.columns.length > 1 }">
            <section v-for="(column, index) in card.detail.columns" :key="column.title" class="scaling-box" :class="index ? 'rate-box' : 'stat-box'">
              <h4 class="column-heading"><span>{{ column.title }}</span><strong>{{ column.total }}</strong></h4>
              <CalculatorFactorItems :rows="column.rows" :hue="id => hue(card.id + column.title,id)" />
              <p v-if="column.formula" class="conversion">{{ column.formula }}</p>
            </section>
          </div>
          <div class="subtotal"><span>{{ card.detail.label ?? (card.id === 'crit' ? '期望暴击倍率' : '增伤倍率') }}</span><strong>{{ card.detail.equation }}</strong></div>
        </template>
      </div>
    </details>
  </section>
</template>
<style scoped>
.factor-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; }
.factor-card { min-width:0; background:var(--surface); }
summary { display:grid; grid-template-columns:minmax(0,1fr) auto 16px; align-items:center; gap:8px; padding:12px; cursor:pointer; color:var(--ink); font-size:var(--font-control); font-weight:700; }
summary::-webkit-details-marker { display:none; }
strong,dd,b { font-variant-numeric:tabular-nums; }
summary strong { text-align:right; font-size:var(--font-dialog); }
summary svg { width:16px; height:16px; color:var(--muted); }
details[open] > summary svg { transform:rotate(180deg); }
.breakdown { display:grid; gap:12px; border-top:1px solid var(--line); padding:12px; font-size:var(--font-body); }
.breakdown h4 { margin:0 0 8px; font-size:var(--font-body); }
.column-heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:4px 8px; }
.column-heading strong { margin-inline-start:auto; }
.conversion { margin:8px 0 0; font-variant-numeric:tabular-nums; color:var(--muted); }
.scaling-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.scaling-box { min-width:0; padding:10px; border:1px solid var(--line); border-radius:7px; background:var(--surface-raised); }
.scaling-term,.subtotal { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:4px 12px; padding-block:4px; }
.stat-box { background:color-mix(in srgb,var(--element-anemo-light) 34%,var(--surface-raised)); }
.rate-box { background:color-mix(in srgb,var(--element-geo-light) 36%,var(--surface-raised)); }
.scaling-box h4 { padding-bottom:6px; border-bottom:1px solid var(--line); }
.scaling-box .chips { margin-top:6px; }
.scaling-term { overflow-wrap:anywhere; }
.scaling-term strong,.subtotal strong { margin-inline-start:auto; }
.subtotal { padding-top:8px; border-top:1px solid var(--line); }
@media(max-width:600px) {
  summary { padding:10px; }
  .scaling-term { display:grid; }
  .scaling-box { padding:8px; }
}
</style>
