<script setup lang="ts">
import MultiSelectPicker from './MultiSelectPicker.vue';
const props=defineProps<{modelValue:string[]}>();
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
const options=Array.from({length:21},(_,index)=>({id:String(index),name:`+${index}`}));
function toggle(value:string){emit('update:modelValue',props.modelValue.includes(value)?props.modelValue.filter(item=>item!==value):[...props.modelValue,value]);}
</script>
<template><div class="artifact-level-filter"><button type="button" :aria-pressed="!modelValue.length" @click="emit('update:modelValue',[])">全部</button><div class="artifact-level-presets" role="group" aria-label="常用强化等级"><button v-for="level in ['16','20']" :key="level" type="button" :aria-pressed="modelValue.includes(level)" @click="toggle(level)">+{{ level }}</button></div><MultiSelectPicker class="all-levels" :model-value="modelValue" label="筛选强化等级" placeholder="更多等级" :options="options" @update:model-value="emit('update:modelValue',$event)" /></div></template>
<style scoped>.artifact-level-filter { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:start; gap:8px; }.artifact-level-presets { display:contents; }.all-levels { grid-column:1/-1; }.artifact-level-filter button { display:flex; align-items:center; justify-content:center; min-width:0; height:40px; min-height:40px; padding:0 6px; font-size:var(--font-control); font-weight:700; }.artifact-level-filter button[aria-pressed=true] { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }</style>
