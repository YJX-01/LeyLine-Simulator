<script setup lang="ts">
import type { RealStat } from '@leyline/schema';
import StatLabel from './StatLabel.vue';
defineProps<{modelValue:string[];label:string;options:{stat:string;label:string}[]}>();
function iconStat(stat:string):RealStat { return ({hp:'hpPercent',attack:'attackPercent',defense:'defensePercent'}[stat] ?? stat) as RealStat; }
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
</script>
<template><div class="stat-filter-choices" role="group" :aria-label="label"><button :aria-pressed="!modelValue.length" @click="emit('update:modelValue',[])">全部</button><button v-for="option in options" :key="option.stat" :aria-label="option.label" :aria-pressed="modelValue.includes(option.stat)" @click="emit('update:modelValue',modelValue.includes(option.stat)?modelValue.filter(value=>value!==option.stat):[...modelValue,option.stat])"><StatLabel :stat="iconStat(option.stat)" icon-only /><span>{{ option.label }}</span></button></div></template>
<style scoped>
.stat-filter-choices { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }.stat-filter-choices button { display:flex; align-items:center; justify-content:center; gap:6px; height:40px; min-height:40px; padding:0 4px; font-size:var(--font-control); font-weight:700; white-space:nowrap; }.stat-filter-choices button[aria-pressed=true] { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }
@media(max-width:420px) { .stat-filter-choices { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
