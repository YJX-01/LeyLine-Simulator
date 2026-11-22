<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AuraObservation } from '@leyline/schema';
import { realElementLabel } from '../domain/workbench-labels';

const props=defineProps<{members:{id:string;name?:string}[];actor:string}>();
const emit=defineEmits<{apply:[actor:string,aura:AuraObservation]}>();
const owner=ref(props.actor),element=ref<AuraObservation['element']>('pyro'),seconds=ref<number|''>('');
const elements=['pyro','hydro','cryo','electro'] as const;
watch(()=>props.actor,id=>{owner.value=id;});
</script>
<template>
  <details><summary>角色元素附着</summary><div class="aura-record">
    <label>受到附着的队员<select v-model="owner"><option v-for="m in members" :key="m.id" :value="m.id">{{ m.name ?? m.id }}</option></select></label>
    <label>附着元素<select v-model="element"><option v-for="e in elements" :key="e" :value="e">{{ realElementLabel(e) }}</option></select></label>
    <label>减时前的剩余时间（秒）<input v-model.number="seconds" type="number" min="0" max="3600" step="0.001" placeholder="0 表示已清除"></label>
    <button class="ui-action" type="button" :disabled="seconds==='' || seconds<0 || seconds>3600" @click="emit('apply',owner,{element,baseDurationMs:Math.round(Number(seconds)*1000)})">记录附着</button>
  </div></details>
</template>
<style scoped>
summary { cursor:pointer; line-height:var(--control-height-md); }
.aura-record { display:flex; align-items:end; flex-wrap:wrap; gap:8px; }
label { display:grid; gap:4px; }
</style>
