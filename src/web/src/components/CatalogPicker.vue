<script setup lang="ts">
import { ref } from 'vue';
import GameIcon from './GameIcon.vue';
import CloseButton from './CloseButton.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';
import CatalogBrowser from './CatalogBrowser.vue';
const props=defineProps<{label:string;modelValue:string;options:{id:string;name:string;element?:string;rarity?:number}[];disabled?:boolean;inline?:boolean;hideTrigger?:boolean;imageKind?:'characters'|'weapons'|'artifacts'}>();
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const open=ref(false);
function show(){if(!props.disabled)open.value=true;}
function select(id:string){emit('update:modelValue',id);open.value=false;}
defineExpose({show});
</script>
<template>
  <div class="catalog-picker" :class="{triggerless:hideTrigger}"><span v-if="!hideTrigger">{{ label }}</span><slot v-if="!hideTrigger" name="trigger" :choose="show"><button class="ui-action soft catalog-trigger" :disabled="disabled" :aria-label="`选择${label}`" @click="show"><GameIcon v-if="imageKind && modelValue" :kind="imageKind" :id="modelValue" :size="28" /><span>{{ options.find(entry=>entry.id===modelValue)?.name ?? '点击选择' }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></slot>
    <component :is="inline?'section':WorkbenchDialog" v-if="open" center-title :title="inline?undefined:imageKind==='weapons'?'选择武器':`选择${label}`" class="catalog-choice" @close="open=false"><CloseButton v-if="inline" class="catalog-back" :label="`收起${label}选择`" @click="open=false" /><CatalogBrowser :options="options" :kind="imageKind ?? 'characters'" :label="label" :selected-id="modelValue" :image-size="imageKind==='weapons'?96:64" item-label-prefix="" @select="select" /></component>
  </div>
</template>
<style scoped>.catalog-picker { display:grid; gap:7px; min-width:0; font-size:var(--font-control); font-weight:700; }.catalog-picker.triggerless { display:contents; }.catalog-trigger { justify-content:flex-start; min-width:0; }.catalog-trigger > span { min-width:0; overflow-wrap:anywhere; }.catalog-trigger > svg { margin-left:auto; }.catalog-choice { grid-column:1/-1; }.catalog-back { margin:0 0 12px auto; }</style>
