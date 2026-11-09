<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
import GameIcon from './GameIcon.vue';
const props=defineProps<{modelValue?:string;options:{id:string;name:string;title?:string;icon?:string}[];label:string;allowEmpty?:boolean;imageKind?:'artifactSlots'|'elements'|'stats'|'characters'|'weapons'|'artifacts'}>();
const emit=defineEmits<{'update:modelValue':[value:string];clear:[]}>(),menu=ref<HTMLDetailsElement>();
const selected=computed(()=>props.options.find(item=>item.id===props.modelValue));
function close(){if(menu.value){menu.value.open=false;menu.value.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}}
function select(id:string){emit('update:modelValue',id);close();}
function clear(){emit('clear');close();}
function escape(event:KeyboardEvent){if(menu.value?.open){event.preventDefault();event.stopPropagation();close();}}
function outside(event:PointerEvent){if(menu.value && !menu.value.contains(event.target as Node))menu.value.open=false;}
onMounted(()=>document.addEventListener('pointerdown',outside));onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<template><details ref="menu" class="single-select-picker" :class="{'slot-picker':imageKind==='artifactSlots'}" @keydown.esc="escape"><summary class="picker-trigger ui-control" :aria-label="label" :title="selected?.title ?? selected?.name ?? '未选择'"><slot name="selected-icon" :option="selected"><GameIcon v-if="imageKind && selected" :kind="imageKind" :id="selected.icon ?? selected.id" :size="20" /></slot><span>{{ selected?.name ?? '未选择' }}</span><svg class="picker-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="picker-menu" role="group" :aria-label="label+'选项'"><button v-if="allowEmpty" @click="clear">未选择</button><button v-for="option in options" :key="option.id" :aria-label="option.title ?? option.name" :aria-pressed="option.id===modelValue" @click="select(option.id)"><slot name="option-icon" :option="option"><GameIcon v-if="imageKind" :kind="imageKind" :id="option.icon ?? option.id" :size="20" /></slot>{{ option.title ?? option.name }}</button></div></details></template>
<style scoped>.single-select-picker { position:relative; min-width:0; }.single-select-picker[open] { z-index:12; }.picker-trigger { justify-content:flex-start; padding:0 30px 0 10px; gap:8px; }.picker-trigger > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.picker-menu { display:grid; gap:4px; max-height:240px; overflow:auto; overscroll-behavior:contain; min-width:220px; }.slot-picker .picker-menu { left:auto; right:0; }.picker-menu button { display:flex; align-items:center; gap:8px; height:40px; padding:0 8px; font-size:var(--font-control); font-weight:700; }.picker-menu button[aria-pressed=true] { color:var(--element-hydro-deep); border-color:var(--element-hydro-primary); background:var(--element-hydro-light); }</style>
