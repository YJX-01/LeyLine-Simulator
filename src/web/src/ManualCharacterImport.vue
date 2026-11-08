<script setup lang="ts">
import { computed,onMounted,ref } from 'vue';
import { loadAccountGameData } from './domain/account-presentation';
import { useUnsavedChanges } from './composables/use-unsaved-changes';
import CharacterForm from './CharacterForm.vue';
import CatalogBrowser from './components/CatalogBrowser.vue';
import ImportActions from './components/ImportActions.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
const emit=defineEmits<{close:[];saved:[id:string]}>();
const data=ref<Awaited<ReturnType<typeof loadAccountGameData>>>(),selected=ref(''),dirty=ref(false),error=ref(''),busy=ref(false),form=ref<InstanceType<typeof CharacterForm>>();
const guard=useUnsavedChanges(dirty);
onMounted(async()=>{try{data.value=await loadAccountGameData();}catch{error.value='角色目录加载失败，请重新打开。';}});
const choices=computed(()=>data.value?.catalog.characters.filter(entry=>!['aether','lumine'].includes(entry.id)) ?? []);
function back(){guard.requestLeave(()=>{selected.value='';dirty.value=false;});}
async function save(notify=true){if(!form.value?.canSave){error.value='请选择武器后再保存。';return false;}busy.value=true;try{return await form.value.apply(notify);}finally{busy.value=false;}}
</script>
<template><WorkbenchDialog title="手动添加角色" sticky-footer @close="guard.requestLeave(()=>emit('close'))"><template v-if="selected" #header-leading><button class="ui-action soft" data-size="md" aria-label="返回角色列表" @click="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>返回</button></template><p v-if="error" role="alert">{{ error }}</p><CatalogBrowser v-show="!selected" :options="choices" kind="characters" label="游戏角色" :selected-id="selected" @select="selected=$event" /><h3 v-if="selected" class="manual-character-name">{{ data?.catalog.characters.find(entry=>entry.id===selected)?.name }}</h3><CharacterForm v-if="selected" ref="form" :key="selected" :initial-character-id="selected" detached @dirty-change="dirty=$event" @saved="emit('saved',$event);emit('close')" /><template #footer><ImportActions label="保存角色资料" :ready="!!form?.canSave" :show-confirm="!!selected" :busy="busy" @cancel="guard.requestLeave(()=>emit('close'))" @confirm="save()" /></template><UnsavedChangesDialog v-if="guard.discardOpen.value" :busy="busy" @save="guard.saveAndLeave(()=>save(false))" @continue="guard.cancelDiscard" @discard="guard.discardChanges" /></WorkbenchDialog></template>

<style scoped>.manual-character-name { font-size:var(--font-control); margin:0 0 16px; font-weight:700; }</style>
