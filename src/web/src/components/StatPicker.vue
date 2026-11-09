<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue';
import type {RealStat} from '@leyline/schema';
import {accountStatLabels} from '../domain/account-real';
import StatLabel from './StatLabel.vue';
const props=defineProps<{modelValue?:RealStat;options:RealStat[];label:string;allowEmpty?:boolean}>(),emit=defineEmits<{'update:modelValue':[value:RealStat];clear:[]}>(),menu=ref<HTMLDetailsElement>();
function text(stat:RealStat){return accountStatLabels[stat].replace('%','（比例）')+(['hp','attack','defense'].includes(stat)?'（固定）':'');}
function clear(){emit('clear');if(menu.value){menu.value.open=false;menu.value.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}}
function select(stat:RealStat){emit('update:modelValue',stat);if(menu.value){menu.value.open=false;menu.value.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}}
function escape(event:KeyboardEvent){if(menu.value?.open){event.preventDefault();event.stopPropagation();menu.value.open=false;menu.value.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}}
function outside(event:PointerEvent){if(menu.value && !menu.value.contains(event.target as Node))menu.value.open=false;}
onMounted(()=>document.addEventListener('pointerdown',outside));onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<template><details ref="menu" class="stat-picker" @keydown.esc="escape"><summary class="picker-trigger ui-control" :aria-label="label" :title="modelValue?text(modelValue):'未选择'"><StatLabel v-if="modelValue" :stat="modelValue" icon-only :size="20"/><span>{{ modelValue?accountStatLabels[modelValue].replace('%',''):'未选择' }}</span><svg class="picker-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="picker-menu" role="group" :aria-label="label+'选项'"><button v-if="allowEmpty" @click="clear">未选择</button><button v-for="stat in options" :key="stat" :aria-label="text(stat)" :aria-pressed="stat===modelValue" @click="select(stat)"><StatLabel :stat="stat" icon-only :size="20"/>{{ text(stat) }}</button></div></details></template>
<style scoped>.stat-picker { position:relative; min-width:0; }.stat-picker[open] { z-index:12; }.picker-trigger { justify-content:flex-start; padding:0 30px 0 10px; gap:8px; }.picker-trigger > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.stat-picker .picker-menu { display:grid; gap:4px; max-height:240px; overflow:auto; overscroll-behavior:contain; min-width:220px; }.picker-menu button { display:flex; align-items:center; gap:8px; height:40px; padding:0 8px; font-size:var(--font-control); font-weight:700; }.picker-menu button[aria-pressed=true] { color:var(--element-hydro-deep); border-color:var(--element-hydro-primary); background:var(--element-hydro-light); }</style>
