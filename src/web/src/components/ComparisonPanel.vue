<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {StatKey} from '@leyline/schema';
import type {ComparisonSide,ComparisonOption} from '../domain/loadout-comparison';
import LoadoutComparison from './LoadoutComparison.vue';
const props=defineProps<{current:ComparisonSide;options:ComparisonOption[];stats:StatKey[];referenceName?:string;kind:'配置'|'组合'}>();
const selectedId=ref('');
const selected=computed(()=>props.options.find(option=>option.id===selectedId.value));
watch(()=>props.options,options=>{if(!options.some(option=>option.id===selectedId.value))selectedId.value='';});
</script>
<template>
  <section class="comparison-panel" :aria-label="`${kind}对比`"><div class="comparison-panel-toolbar"><h3>{{ kind }}对比</h3><label>对比对象<select v-model="selectedId" class="ui-control" :aria-label="`选择对比${kind}`"><option value="">{{ options.length?`选择另一份${kind}`:`暂无其他${kind}` }}</option><option v-for="option in options" :key="option.id" :value="option.id">{{ option.title }}</option></select></label><button v-if="selected" class="ui-action soft" data-size="md" @click="selectedId=''">结束对比</button></div><LoadoutComparison v-if="selected" inline :sides="[current,selected]" :stats="stats" :reference-name="referenceName" /></section>
</template>
<style scoped>
.comparison-panel { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); min-width:0; }.comparison-panel-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; }.comparison-panel h3 { margin:0; font-size:var(--font-control); }.comparison-panel label { display:flex; align-items:center; flex:1; min-width:0; gap:8px; font-size:var(--font-body); font-weight:700; }.comparison-panel select { flex:1; width:100%; min-width:0; padding:0 12px; }.comparison-panel-toolbar .ui-action { font-size:var(--font-control); font-weight:700; }
@media(max-width:600px) { .comparison-panel label { flex-basis:100%; } }
</style>
