<script setup lang="ts">
import { ref } from 'vue';
import GameIcon from './GameIcon.vue';
import CloseButton from './CloseButton.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';
import CatalogBrowser from './CatalogBrowser.vue';
const props=defineProps<{label:string;modelValue:string;options:{id:string;name:string;element?:string;rarity?:number}[];invalid?:boolean;disabled?:boolean;inline?:boolean;hideTrigger?:boolean;imageKind?:'characters'|'weapons'|'artifacts'}>();
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const open=ref(false),trigger=ref<HTMLButtonElement>();
function focus(){trigger.value?.focus({preventScroll:true});}
function show(){if(!props.disabled)open.value=true;}
function select(id:string){emit('update:modelValue',id);open.value=false;}
defineExpose({show,focus});
</script>
<template>
  <div class="catalog-picker" :class="{triggerless:hideTrigger}"><span v-if="!hideTrigger">{{ label }}</span><slot v-if="!hideTrigger" name="trigger" :choose="show"><button ref="trigger" type="button" class="picker-trigger ui-control catalog-trigger" :aria-invalid="invalid || undefined" :disabled="disabled" :aria-label="`选择${label}`" @click="show"><GameIcon v-if="imageKind && modelValue" :kind="imageKind" :id="modelValue" :size="28" :rarity="options.find(entry=>entry.id===modelValue)?.rarity" /><span :title="options.find(entry=>entry.id===modelValue)?.name">{{ options.find(entry=>entry.id===modelValue)?.name ?? '点击选择' }}</span><svg class="picker-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button></slot>
    <component :is="inline?'section':WorkbenchDialog" v-if="open" center-title :title="inline?undefined:imageKind==='weapons'?'选择武器':`选择${label}`" class="catalog-choice" @close="open=false"><CloseButton v-if="inline" class="catalog-back" :label="`收起${label}选择`" @click="open=false" /><CatalogBrowser :options="options" :kind="imageKind ?? 'characters'" :label="label" :selected-id="modelValue" :image-size="imageKind==='weapons'?96:64" item-label-prefix="" @select="select" /></component>
  </div>
</template>
<style scoped>.catalog-picker { display:grid; gap:7px; min-width:0; font-size:var(--font-control); font-weight:700; }.catalog-picker.triggerless { display:contents; }.catalog-trigger { height:40px; font-size:var(--font-control); font-weight:700; justify-content:flex-start; gap:8px; min-width:0; padding:0 30px 0 10px; background:var(--surface-raised); }.catalog-trigger:hover { border-color:var(--element-hydro-primary); }.catalog-trigger[aria-invalid=true] { border-color:var(--element-pyro-primary); background:var(--element-pyro-light); outline:2px solid var(--element-pyro-primary); outline-offset:3px; }.catalog-trigger > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.catalog-trigger > svg { flex:none; margin-left:auto; }.catalog-choice { grid-column:1/-1; }.catalog-back { margin:0 0 12px auto; }</style>
