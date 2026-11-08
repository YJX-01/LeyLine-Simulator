<script setup lang="ts">
import { onMounted, shallowRef, ref } from 'vue';
import CatalogBrowser from './CatalogBrowser.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';
import { loadAccountGameData } from '../domain/account-presentation';
defineProps<{name:string}>();
const emit=defineEmits<{select:[name:string]}>();
const characters=shallowRef<{id:string;name:string;element:string}[]>([]),open=ref(false),error=ref('');
onMounted(async()=>{try{characters.value=(await loadAccountGameData()).catalog.characters.filter(entry=>!['aether','lumine'].includes(entry.id));}catch{error.value='角色目录加载失败，请重新打开。';}});
function select(id:string){emit('select',characters.value.find(entry=>entry.id===id)?.name ?? '');open.value=false;}
</script>
<template><div class="effective-reference"><span>参考角色</span><button class="ui-action soft" @click="open=true">{{ name || '选择参考角色' }}</button><WorkbenchDialog v-if="open" title="选择参考角色" @close="open=false"><p v-if="error" role="alert">{{ error }}</p><CatalogBrowser :options="characters" kind="characters" label="参考角色" :selected-id="characters.find(character=>character.name===name)?.id" @select="select" /></WorkbenchDialog></div></template>
<style scoped>.effective-reference { display:flex; flex-wrap:wrap; align-items:center; gap:12px; min-width:0; font-size:var(--font-control); }.effective-reference > span,.effective-reference > button { font-size:var(--font-control); font-weight:700; }</style>
