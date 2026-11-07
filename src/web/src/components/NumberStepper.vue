<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: number; bonus?: number; minimum?: number; maximum: number; label: string; values?: readonly number[] }>(), {bonus:0,minimum:1});
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
</script>
<template>
  <span class="number-stepper" :title="`基础 ${modelValue}${bonus ? ` + 命座 ${bonus}` : ''}`">
    <button :aria-label="`提高${label}`" :disabled="modelValue >= maximum" @click="step(1)">+</button>
    <span class="number-value"><input type="number" :aria-label="label" :value="modelValue + bonus" :min="minimum + bonus" :max="maximum + bonus" @change="input" @keydown.up.prevent="step(1)" @keydown.down.prevent="step(-1)"><sup v-if="bonus">*</sup></span>
    <button :aria-label="`降低${label}`" :disabled="modelValue <= minimum" @click="step(-1)">−</button>
  </span>
</template>
<style scoped>
.number-stepper { display:grid; grid-template-columns:32px minmax(36px,1fr) 32px; align-items:center; border:1px solid var(--line); border-radius:7px; background:var(--surface-raised); overflow:hidden; }
.number-stepper button { padding:0; height:38px; border:0; border-radius:0; color:var(--ink); background:transparent; font-size:21px; }
.number-value { position:relative; min-width:0; }.number-value input { box-sizing:border-box; width:100%; min-width:0; height:38px; padding:0 8px; border:0; background:transparent; text-align:center; color:var(--ink); font-size:18px; appearance:textfield; -moz-appearance:textfield; }
input::-webkit-inner-spin-button,input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }sup { position:absolute; top:4px; right:4px; color:var(--element-electro-deep); font-size:12px; pointer-events:none; }
</style>
