<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AccountArtifact, LocalAccount } from './domain/account';
import { cloneAccount } from './domain/account';
import { applyAccountArtifact } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactForm from './ArtifactForm.vue';
import ArtifactSummary from './ArtifactSummary.vue';
import ArtifactIdentity from './components/ArtifactIdentity.vue';
import EditorActions from './components/EditorActions.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import { useUnsavedChanges } from './composables/use-unsaved-changes';
const props=defineProps<{item:AccountArtifact;account?:LocalAccount}>();
const emit=defineEmits<{close:[]}>();
const store=useAccountStore();
const form=ref<InstanceType<typeof ArtifactForm>>();
const display=ref<AccountArtifact>(JSON.parse(JSON.stringify(props.item)));
const revision=ref(0),dirty=ref(false),busy=ref(false),error=ref('');
const { discardOpen, requestLeave, cancelDiscard, discardChanges }=useUnsavedChanges(dirty);
let baseline=JSON.stringify(props.item);
const inventory=computed(()=>props.account ?? store.account);
const accountId=inventory.value.id;
function restore() { display.value=JSON.parse(JSON.stringify(props.item));baseline=JSON.stringify(props.item);revision.value++;dirty.value=false;error.value=''; }
async function save() {
  if(busy.value)return;
  const item=form.value?.prepare();if(!item)return;
  busy.value=true;error.value='';
  try {
    const current=inventory.value.artifacts.find(entry=>entry.id===item.id);
    if(inventory.value.id!==accountId || JSON.stringify(current)!==baseline)throw new Error('原物品已变化，请还原后重新核对，未覆盖现有资料。');
    const next=cloneAccount(inventory.value);applyAccountArtifact(next,item,item.id);
    if(props.account)props.account.artifacts=next.artifacts;else store.commitEdit(next);
    display.value=item;baseline=JSON.stringify(item);revision.value++;dirty.value=false;
  }catch(cause){error.value=cause instanceof Error?cause.message:'保存失败，原物品保持不变。';}
  finally{busy.value=false;}
}
defineExpose({requestLeave});
</script>
<template>
  <WorkbenchDialog editor class="artifact-detail-dialog" :title="display.name" @close="requestLeave(()=>emit('close'))">
    <template #header-leading><EditorActions :dirty="dirty" :busy="busy" @save="save" @restore="restore" /></template>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="artifact-detail-layout"><aside><h3>当前保存</h3><ArtifactSummary :item="display" :account="inventory" variant="relaxed" /><ArtifactIdentity :item="display" /></aside><ArtifactForm ref="form" :key="revision" details inline :item="display" :target-account="props.account" @dirty-change="dirty=$event" /></div>
  </WorkbenchDialog>
  <ConfirmationDialog v-if="discardOpen" title="放弃未保存的修改？" confirm-label="放弃修改并退出" cancel-label="继续编辑" @cancel="cancelDiscard" @confirm="discardChanges"><p>退出将丢弃未保存的修改。</p></ConfirmationDialog>
</template>
<style scoped>
.artifact-detail-actions { display:flex; gap:6px; }.artifact-detail-layout { display:grid; grid-template-columns:280px minmax(0,1fr); gap:24px; }.artifact-detail-layout > aside { min-width:0; padding:0; background:none; }.artifact-detail-layout h3 { margin:0 0 12px; font-size:var(--font-body); }.artifact-detail-layout details { margin-top:20px; font-size:var(--font-body); overflow-wrap:anywhere; }.artifact-detail-layout details p { font-size:var(--font-body); line-height:1.6; }
@media(max-width:650px) { .artifact-detail-layout { grid-template-columns:1fr; gap:16px; }.artifact-detail-layout > aside { max-width:280px; width:100%; justify-self:center; } }
</style>
