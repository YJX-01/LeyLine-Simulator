<script setup lang="ts">
import GameIcon from './GameIcon.vue';
defineProps<{
  modelValue:string[];
  label:string;
  allLabel:string;
  kind:'elements'|'artifactSlots'|'characters';
  options?:{value:string;label:string;light?:string;deep?:string}[];
  mobileColumns?:number;
}>();
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
</script>
<template>
  <div class="library-shortcuts" :class="{'mobile-grid':mobileColumns}" role="group" :aria-label="label"
    :data-kind="kind" :style="{'--shortcut-columns':mobileColumns}">
    <button type="button" :aria-pressed="!modelValue.length" @click="emit('update:modelValue',[])">{{ allLabel }}</button>
    <button v-for="option in options" :key="option.value" type="button"
      :aria-label="kind==='elements'?`${option.label}元素`:option.label" :aria-pressed="modelValue.includes(option.value)"
      :style="{'--shortcut-light':option.light,'--shortcut-deep':option.deep}"
      @click="emit('update:modelValue',modelValue.includes(option.value)?modelValue.filter(value=>value!==option.value):[...modelValue,option.value])">
      <GameIcon :kind="kind" :id="option.value" :size="24" /><span>{{ option.label }}</span>
    </button>
    <slot />
  </div>
</template>
<style scoped>
.library-shortcuts { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }
.library-shortcuts > button,.library-shortcuts > :slotted(button) { display:flex; align-items:center; justify-content:center; gap:5px; height:var(--control-height-lg); min-height:var(--control-height-lg); padding:0 8px; font-size:var(--font-control); font-weight:700; white-space:nowrap; }
.library-shortcuts > button[aria-pressed=true],.library-shortcuts > :slotted(button[data-active]) { color:var(--shortcut-deep,var(--element-anemo-deep)); background:var(--shortcut-light,var(--element-anemo-light)); border-color:currentColor; }
.library-shortcuts :deep(.artifactSlots) { color:inherit; }
@media(max-width:600px) {
  .library-shortcuts.mobile-grid { display:grid; grid-template-columns:repeat(var(--shortcut-columns),minmax(0,1fr)); width:100%; }
  .library-shortcuts.mobile-grid > button { min-width:0; padding:0 4px; }
  .library-shortcuts[data-kind=elements] > button { padding-inline:3px; }
}
@media(max-width:383px) { .library-shortcuts[data-kind=elements] { grid-template-columns:repeat(3,minmax(0,1fr)); } }
</style>
