<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import NumberStepper from './NumberStepper.vue';
const props = withDefaults(defineProps<{ level: number; ascension: number; label: string; maximum?: number; disabled?: boolean }>(), { maximum:90 });
const emit = defineEmits<{ change: [level:number, ascension:number] }>();
const menu = ref<HTMLDetailsElement>();
function closeOutside(event: PointerEvent) { if(menu.value && !menu.value.contains(event.target as Node)) menu.value.open=false; }
onMounted(() => document.addEventListener('pointerdown',closeOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown',closeOutside));
const boundaries = [20,40,50,60,70,80];
const ascended = computed(() => boundaries.indexOf(props.level) >= 0 && props.ascension === boundaries.indexOf(props.level) + 1);
const allowed = computed(() => Array.from({length:Math.min(props.maximum,90)},(_,index)=>index+1).concat(props.maximum>=95?[95]:[],props.maximum>=100?[100]:[]));
const canAscend = computed(() => boundaries.includes(props.level) && props.level < props.maximum);
const presets = computed(() => [100,95,90,80,70,60].filter(level => level <= props.maximum).flatMap(level => {
  const stage = Math.min(6,boundaries.filter(boundary => boundary < level).length);
  return [...(boundaries.includes(level) && level < props.maximum ? [{level,stage:stage+1,label:`${level}突破`}] : []),{level,stage,label:String(level)}];
}));
function choose(level:number, stage:number) { emit('change',level,stage); if(menu.value)menu.value.open=false; }
function custom(level:number) {
  const stage = Math.min(6,boundaries.filter(boundary => boundary < level).length);
  emit('change',level, boundaries.includes(level) && props.ascension === stage + 1 && level < props.maximum ? stage + 1 : stage);
}
function toggleAscension() { if(canAscend.value)emit('change',props.level,boundaries.indexOf(props.level)+(ascended.value?0:1)); }
</script>
<template>
  <details ref="menu" class="level-picker" @toggle="disabled && menu && (menu.open=false)" @keydown.esc.prevent.stop="menu && (menu.open=false)">
    <summary class="ui-control" :aria-label="label" :aria-disabled="disabled" @click="disabled && $event.preventDefault()"><span class="level-value">{{ level }}{{ ascended ? '突破' : '' }}</span><svg class="level-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary>
    <div class="level-menu"><div class="custom-heading"><span>自定义等级</span><button :aria-label="`${label}突破`" :disabled="!canAscend" :aria-pressed="ascended" @click="toggleAscension">突破</button></div><NumberStepper :model-value="level" :maximum="maximum" :values="allowed" :label="`自定义${label}`" @update:model-value="custom" /><div class="level-presets"><button v-for="item in presets" :key="item.label" :class="{recommended:item.level===90}" :aria-label="`${label} ${item.label}`" :aria-pressed="level===item.level && ascension===item.stage" @click="choose(item.level,item.stage)">{{ item.label }}</button></div></div>
  </details>
</template>
<style scoped>
.level-picker { position:relative; min-width:0; font-size:16px; }summary { position:relative; display:flex; align-items:center; justify-content:center; gap:0; cursor:pointer; padding:0 28px; list-style:none; }summary::-webkit-details-marker { display:none; }summary[aria-disabled=true] { cursor:default; }summary .level-value { color:var(--ink); text-align:center; }summary .level-arrow { display:block; width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; position:absolute; right:10px; top:50%; transform:translateY(-50%); color:var(--muted); line-height:1; }
.level-menu { position:absolute; top:calc(100% + 5px); left:0; width:100%; box-sizing:border-box; padding:8px; z-index:5; border:1px solid var(--line); border-radius:10px; background:var(--surface-raised); box-shadow:0 8px 24px #283a3624; }
.level-presets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; margin-top:10px; }.level-presets button { padding:7px 3px; background:var(--surface); color:var(--ink); border-color:var(--line); font-size:14px; }.level-presets button[aria-pressed=true] { background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }
.custom-heading { display:flex; justify-content:space-between; align-items:center; gap:4px; margin-bottom:7px; font-size:16px; font-weight:700; }.custom-heading button { padding:4px; background:var(--surface); color:var(--muted); font-size:12px; }.custom-heading button[aria-pressed=true] { background:var(--element-hydro-light); color:var(--element-hydro-deep); }.level-presets button.recommended { font-weight:700; color:var(--element-geo-deep); border-color:var(--element-geo-primary); background:var(--element-geo-light); }
.level-menu label { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:10px; font-size:14px; }.level-menu input { width:70px; min-width:0; padding:5px; font-size:16px; }
@media(max-width:600px){.level-menu { left:auto; right:0; }}
</style>
