<script setup lang="ts">
import GameIcon from './GameIcon.vue';
defineProps<{modelValue:string[];label:string;allLabel:string;kind:'elements'|'artifactSlots';options:{value:string;label:string;light?:string;deep?:string}[];mobileColumns:number}>();
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
</script>
<template><div class="library-shortcuts" role="group" :aria-label="label" :style="{'--shortcut-columns':mobileColumns}"><button :aria-pressed="!modelValue.length" @click="emit('update:modelValue',[])">{{ allLabel }}</button><button v-for="option in options" :key="option.value" :aria-label="kind==='elements'?`${option.label}元素`:option.label" :aria-pressed="modelValue.includes(option.value)" :style="{'--shortcut-light':option.light,'--shortcut-deep':option.deep}" @click="emit('update:modelValue',modelValue.includes(option.value)?modelValue.filter(value=>value!==option.value):[...modelValue,option.value])"><GameIcon :kind="kind" :id="option.value" :size="24" /><span>{{ option.label }}</span></button></div></template>
<style scoped>
.library-shortcuts { display:flex; flex-wrap:wrap; gap:8px; }.library-shortcuts > button { display:flex; align-items:center; justify-content:center; gap:5px; height:40px; min-height:40px; padding:0 8px; font-size:var(--font-control); font-weight:700; white-space:nowrap; }.library-shortcuts > button[aria-pressed=true] { color:var(--shortcut-deep,var(--element-anemo-deep)); background:var(--shortcut-light,var(--element-anemo-light)); border-color:currentColor; }.library-shortcuts :deep(.artifactSlots) { color:inherit; }
@media(max-width:600px) { .library-shortcuts { display:grid; grid-template-columns:repeat(var(--shortcut-columns),minmax(0,1fr)); width:100%; }.library-shortcuts > button { min-width:0; padding:0 4px; } }
</style>
