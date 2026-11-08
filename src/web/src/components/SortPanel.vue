<script setup lang="ts">
import ChoiceGroup from './ChoiceGroup.vue';
import FilterActions from './FilterActions.vue';
defineProps<{modelValue:string;direction:'asc'|'desc';options:{value:string;label:string}[]}>();
const emit=defineEmits<{'update:modelValue':[value:string];'update:direction':[value:'asc'|'desc'];reset:[];confirm:[]}>();
</script>
<template><div class="sort-panel"><section><h3>排序依据</h3><ChoiceGroup :model-value="modelValue" :options="options" label="排序依据" @update:model-value="emit('update:modelValue',String($event))" /></section><section><h3>顺序</h3><ChoiceGroup joined :model-value="direction" :options="[{value:'desc',label:'从高到低'},{value:'asc',label:'从低到高'}]" label="排序方向" @update:model-value="emit('update:direction',$event==='asc'?'asc':'desc')" /></section><FilterActions reset-label="重置排序" @reset="emit('reset')" @confirm="emit('confirm')" /></div></template>
<style scoped>.sort-panel { display:grid; gap:20px; }.sort-panel h3 { margin:0 0 10px; font-size:var(--font-control); font-weight:700; }.sort-panel :deep(.choice-group:not(.joined)) { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }.sort-panel :deep(.choice-group > button) { font-size:var(--font-control); font-weight:700; }.sort-panel :deep(.filter-actions) { margin:0; }@media(max-width:500px) { .sort-panel :deep(.choice-group:not(.joined)) { grid-template-columns:repeat(2,minmax(0,1fr)); } }</style>
