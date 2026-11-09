<script setup lang="ts">
import GameIcon from './GameIcon.vue';
type Value = string | number;
interface ChoiceOption { value:Value; label:string; accessibleLabel?:string; icon?:string }
const props = withDefaults(defineProps<{ modelValue:Value | Value[]; options:ChoiceOption[]; label:string; joined?:boolean; tone?:'anemo'|'hydro'|'electro'; disabled?:boolean; small?:boolean }>(), { tone:'anemo' });
const emit = defineEmits<{ 'update:modelValue': [value:Value | Value[]] }>();
function selected(value:Value) { return Array.isArray(props.modelValue) ? props.modelValue.includes(value) : props.modelValue===value; }
function choose(value:Value) {
  emit('update:modelValue',Array.isArray(props.modelValue) ? selected(value) ? props.modelValue.filter(item=>item!==value) : [...props.modelValue,value] : value);
}
</script>
<template>
  <div class="choice-group" :class="{joined,small}" :data-tone="tone" role="group" :aria-label="label" :style="{'--choice-count':options.length}">
    <button v-for="option in options" :key="option.value" type="button" :aria-label="option.accessibleLabel ?? option.label" :aria-pressed="selected(option.value)" :disabled="disabled" @click="choose(option.value)"><GameIcon v-if="option.icon" kind="stats" :id="option.icon" :size="22" /><span>{{ option.label }}</span></button>
  </div>
</template>
<style scoped>
.choice-group { --choice-ink:var(--element-anemo-deep); --choice-light:var(--element-anemo-light); --choice-border:var(--element-anemo-primary); display:flex; flex-wrap:wrap; gap:8px; }
.choice-group[data-tone=hydro] { --choice-ink:var(--element-hydro-deep); --choice-light:var(--element-hydro-light); --choice-border:var(--element-hydro-primary); }
.choice-group[data-tone=electro] { --choice-ink:var(--element-electro-deep); --choice-light:var(--element-electro-light); --choice-border:var(--element-electro-primary); }
.choice-group > button { display:flex; align-items:center; justify-content:center; gap:6px; box-sizing:border-box; height:var(--control-height-lg); min-height:var(--control-height-lg); padding:0 10px; border:1px solid var(--line); border-radius:var(--control-radius); color:var(--muted); background:var(--surface-raised); font-size:var(--font-control); font-weight:700; }
.choice-group > button[aria-pressed=true] { color:var(--choice-ink); background:var(--choice-light); border-color:var(--choice-border); box-shadow:inset 0 0 0 1px var(--choice-border); }
.choice-group :deep(.stats) { color:inherit; }
.choice-group.joined { display:grid; grid-template-columns:repeat(var(--choice-count),minmax(0,1fr)); gap:0; height:var(--control-height-lg); border:1px solid var(--line); border-radius:var(--control-radius); overflow:hidden; }
.choice-group.joined > button { height:calc(var(--control-height-lg) - 2px); min-height:0; padding:0 8px; border:0; border-right:1px solid var(--line); border-radius:0; font-size:var(--font-control); }
.choice-group.joined > button:last-child { border-right:0; }.choice-group.joined > button[aria-pressed=true] { box-shadow:none; }
.choice-group.small > button { min-height:var(--control-height-md); height:var(--control-height-md); font-size:var(--font-control); padding:5px 8px; }.choice-group.joined.small { height:var(--control-height-md); }.choice-group.joined.small > button { height:calc(var(--control-height-md) - 2px); min-height:0; }
</style>
