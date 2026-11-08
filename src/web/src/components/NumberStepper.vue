<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: number; bonus?: number; minimum?: number; maximum: number; label: string; inputId?:string; values?: readonly number[] }>(), {bonus:0,minimum:1});
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
function normalized(value:number) { const bounded=Math.max(props.minimum,Math.min(props.maximum,Math.round(value)));return props.values ? props.values.reduce((best,item)=>Math.abs(item-bounded)<Math.abs(best-bounded)?item:best,props.values[0]) : bounded; }
function update(value: number) { if(Number.isFinite(value))emit('update:modelValue',normalized(value)); }
function step(direction:number) { const choices=props.values;if(choices){const index=choices.indexOf(props.modelValue);emit('update:modelValue',choices[Math.max(0,Math.min(choices.length-1,index+direction))]);}else update(props.modelValue+direction); }
function input(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = Number(target.value) - props.bonus;
  const base = Number.isFinite(value) ? normalized(value) : props.modelValue;
  update(base);
  target.value = String(base + props.bonus);
}
function liveInput(event:Event) {
  const raw=(event.target as HTMLInputElement).value;
  const base=Number(raw)-props.bonus;
  // Do not clamp a partial keystroke (e.g. the first "1" in a displayed 12 with +3).
  // Valid complete values update the draft immediately; blur commits normalization.
  if(raw.trim() && Number.isInteger(base) && base>=props.minimum && base<=props.maximum && (!props.values || props.values.includes(base)))emit('update:modelValue',base);
}
</script>
<template>
  <span class="number-stepper ui-control" :title="`基础 ${modelValue}${bonus ? ` + 命座 ${bonus}` : ''}`">
    <button type="button" :aria-label="`降低${label}`" :disabled="modelValue <= minimum" @click="step(-1)">−</button>
    <span class="number-value"><input :id="inputId" type="number" :name="label" autocomplete="off" :aria-label="label" :value="modelValue + bonus" :min="minimum + bonus" :max="maximum + bonus" @input="liveInput" @change="input" @keydown.up.prevent="step(1)" @keydown.down.prevent="step(-1)"><sup data-ui-badge="mini" v-if="bonus">*</sup></span>
    <button type="button" :aria-label="`提高${label}`" :disabled="modelValue >= maximum" @click="step(1)">+</button>
  </span>
</template>
<style scoped>
.number-stepper { display:grid; grid-template-columns:32px minmax(36px,1fr) 32px; align-items:center;  overflow:hidden; }
.number-stepper button { padding:0; min-height:0; height:calc(var(--control-height) - 2px); border:0; border-radius:0; color:var(--ink); background:transparent; font-size:var(--font-title); }
.number-value { position:relative; min-width:0; }.number-value input { box-sizing:border-box; width:100%; min-width:0; height:calc(var(--control-height) - 2px); min-height:0; padding:0 8px; border:0; background:transparent; text-align:center; color:var(--ink); font-size:var(--control-font-size); font-weight:var(--control-font-weight); appearance:textfield; -moz-appearance:textfield; }
input::-webkit-inner-spin-button,input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }sup { position:absolute; top:4px; right:4px; color:var(--element-electro-deep); font-size:var(--font-badge-mini); pointer-events:none; }
</style>
