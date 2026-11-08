<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import type { AccountArtifact, LocalAccount } from './domain/account';
import { cloneAccount } from './domain/account';
import { applyAccountArtifact } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactForm from './ArtifactForm.vue';
import ArtifactSummary from './ArtifactSummary.vue';
const props=defineProps<{item:AccountArtifact;account?:LocalAccount}>();
const emit=defineEmits<{close:[]}>();
const store=useAccountStore();
const form=ref<InstanceType<typeof ArtifactForm>>();
const display=ref<AccountArtifact>(JSON.parse(JSON.stringify(props.item)));
const revision=ref(0),dirty=ref(false),busy=ref(false),discardOpen=ref(false),error=ref('');
let baseline=JSON.stringify(props.item);
let leaveAction:(()=>void)|undefined;
const inventory=computed(()=>props.account ?? store.account);
const accountId=inventory.value.id;
function requestLeave(action:()=>void) { if(dirty.value){leaveAction=action;discardOpen.value=true;}else action(); }
function discard() { const action=leaveAction;discardOpen.value=false;leaveAction=undefined;action?.(); }
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
function beforeUnload(event:BeforeUnloadEvent){if(dirty.value){event.preventDefault();event.returnValue='';}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload));
defineExpose({requestLeave});
</script>
<template>
  <WorkbenchDialog class="artifact-detail-dialog" :title="display.name" @close="requestLeave(()=>emit('close'))">
    <template #header-leading><div class="artifact-detail-actions"><button class="ui-action" data-accent="anemo" :disabled="!dirty || busy" @click="save">保存</button><button class="ui-action soft" data-accent="pyro" :disabled="!dirty || busy" @click="restore">还原</button></div></template>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="artifact-detail-layout"><aside><h3>当前保存</h3><ArtifactSummary :item="display" :account="inventory" variant="relaxed" /><details><summary>来源与实物身份</summary><p>{{ display.id }}</p><p>{{ display.real?.source?.key }}</p><p v-if="display.mona">原文件主词条：{{ display.mona.mainValue }}；当前值按强化等级表显示。</p><p v-if="display.mona?.equippedBy">原始穿戴备注：{{ display.mona.equippedBy }}</p></details></aside><ArtifactForm ref="form" :key="revision" details inline :item="display" :target-account="props.account" @dirty-change="dirty=$event" /></div>
  </WorkbenchDialog>
  <WorkbenchDialog v-if="discardOpen" compact title="放弃未保存的修改？" @close="discardOpen=false;leaveAction=undefined"><p>这件圣遗物的修改尚未保存。</p><div class="artifact-detail-actions"><button class="ui-action soft" data-accent="anemo" @click="discardOpen=false;leaveAction=undefined">继续编辑</button><button class="ui-action" data-accent="pyro" @click="discard">放弃修改并退出</button></div></WorkbenchDialog>
</template>
<style scoped>
.artifact-detail-actions { display:flex; gap:6px; }.artifact-detail-layout { display:grid; grid-template-columns:220px minmax(0,1fr); gap:24px; }.artifact-detail-layout > aside { min-width:0; padding:0; background:none; }.artifact-detail-layout h3 { margin:0 0 12px; font-size:14px; }.artifact-detail-layout details { margin-top:20px; font-size:12px; overflow-wrap:anywhere; }.artifact-detail-layout details p { font-size:12px; line-height:1.6; }
.artifact-detail-dialog :deep(header) { display:grid; grid-template-columns:1fr auto 1fr; }.artifact-detail-dialog :deep(header h2) { text-align:center; font-size:18px; }.artifact-detail-dialog :deep(header > button) { justify-self:end; }
@media(max-width:650px) { .artifact-detail-layout { grid-template-columns:1fr; gap:16px; }.artifact-detail-layout > aside { max-width:260px; width:100%; justify-self:center; }.artifact-detail-dialog :deep(header) { grid-template-columns:minmax(0,1fr) 32px; }.artifact-detail-dialog :deep(header h2) { grid-column:1; grid-row:1; }.artifact-detail-dialog :deep(header > button) { grid-column:2; grid-row:1; }.artifact-detail-actions { grid-column:1/-1; grid-row:2; } }
</style>
