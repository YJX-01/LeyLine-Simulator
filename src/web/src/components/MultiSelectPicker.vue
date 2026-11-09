<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import GameIcon from './GameIcon.vue';
const props=defineProps<{modelValue:string[];label:string;options:{id:string;name:string;icon?:string}[];imageKind?:'characters'|'artifacts'|'stats';searchable?:boolean;placeholder?:string}>();
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
const menu=ref<HTMLDetailsElement>(),search=ref('');
const options=computed(()=>props.options.filter(option=>option.name.includes(search.value.trim())));
const selected=computed(()=>props.options.filter(option=>props.modelValue.includes(option.id)));
async function opened() { if(menu.value?.open){await nextTick();menu.value?.querySelector('.picker-menu')?.scrollIntoView({block:'nearest'});} }
function toggle(id:string) { emit('update:modelValue',props.modelValue.includes(id)?props.modelValue.filter(value=>value!==id):[...props.modelValue,id]); }
function outside(event:MouseEvent) { if(menu.value && !menu.value.contains(event.target as Node))menu.value.open=false; }
function close() { if(menu.value){menu.value.open=false;menu.value.querySelector('summary')?.focus();} }
function escape(event:KeyboardEvent){if(menu.value?.open){event.preventDefault();event.stopPropagation();close();}}
onMounted(()=>document.addEventListener('click',outside));
onBeforeUnmount(()=>document.removeEventListener('click',outside));
</script>
<template>
  <details ref="menu" class="multi-select-picker" @toggle="opened" @keydown.esc="escape">
    <summary class="picker-trigger ui-control" :aria-label="label"><GameIcon v-if="imageKind && selected.length===1" :kind="imageKind" :id="selected[0].icon ?? selected[0].id" :name="selected[0].name" :size="24" /><span>{{ selected.length?selected.length===1?selected[0].name:`已选 ${selected.length} 项`:(placeholder ?? '全部') }}</span><svg class="picker-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary>
    <div class="picker-menu"><input v-if="searchable" v-model="search" :aria-label="`搜索${label}`" placeholder="输入名称…" autocomplete="off"><div class="picker-options" role="group" :aria-label="`${label}选项`"><button v-for="option in options" :key="option.id" :aria-label="option.name" :aria-pressed="modelValue.includes(option.id)" @click="toggle(option.id)"><GameIcon v-if="imageKind && !['free','equipped'].includes(option.id)" :kind="imageKind" :id="option.icon ?? option.id" :name="option.name" :size="24" /><span>{{ option.name }}</span></button><p v-if="!options.length">没有匹配项</p></div><div class="picker-actions"><button class="ui-action soft" data-size="md" @click="emit('update:modelValue',[])">清除</button><button class="ui-action" data-size="md" @click="close">完成选择</button></div></div>
  </details>
</template>
<style scoped>
.multi-select-picker { position:relative; min-width:0; }.multi-select-picker > .picker-menu { position:static; margin-top:5px; scroll-margin-top:88px; scroll-margin-bottom:88px; }.picker-trigger { justify-content:flex-start; gap:8px; padding-left:12px; }.picker-trigger > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.picker-options { display:grid; gap:4px; max-height:220px; overflow:auto; overscroll-behavior:contain; margin-top:8px; }.picker-options button { display:flex; align-items:center; gap:8px; min-height:40px; text-align:left; font-size:var(--font-control); font-weight:700; }.picker-options button[aria-pressed=true] { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.picker-actions { display:flex; justify-content:space-between; gap:8px; padding-top:8px; }.multi-select-picker[open] { z-index:12; }
</style>
