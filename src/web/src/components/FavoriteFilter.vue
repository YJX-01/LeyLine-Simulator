<script setup lang="ts">
import FavoriteMark from './FavoriteMark.vue';
const props=withDefaults(defineProps<{modelValue:string[];label?:string}>(),{label:'收藏等级'});
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
function toggle(level:number){const value=String(level);emit('update:modelValue',props.modelValue.includes(value)?props.modelValue.filter(item=>item!==value):[...props.modelValue,value]);}
</script>
<template><div class="favorite-filter" role="group" :aria-label="label"><button type="button" :aria-pressed="!modelValue.length" @click="emit('update:modelValue',[])">全部</button><button v-for="level in [0,1,2,3]" :key="level" type="button" :aria-label="level?`${level}级收藏`:'未收藏'" :title="level?`${level}级收藏`:'未收藏'" :aria-pressed="modelValue.includes(String(level))" @click="toggle(level)"><FavoriteMark :level="level" /></button></div></template>
<style scoped>.favorite-filter { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }.favorite-filter button { display:flex; align-items:center; justify-content:center; min-width:0; height:40px; min-height:40px; padding:0 6px; font-size:var(--font-control); font-weight:700; }.favorite-filter button[aria-pressed=true] { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }</style>
