<script setup lang="ts">
import { computed, ref,inject,nextTick,onMounted } from 'vue';
import type { AccountArtifact, LocalAccount } from './domain/account';
import { cloneAccount,accountSlotLabels } from './domain/account';
import { applyAccountArtifact,loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactForm from './ArtifactForm.vue';
import EditorActions from './components/EditorActions.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
import { useUnsavedChanges } from './composables/use-unsaved-changes';
import {useCharacterLoadoutsStore} from './stores/character-loadouts';
import {useArtifactCombinationsStore} from './stores/artifact-combinations';
import {accountConfigurations} from './domain/account-configurations';
import {combinationName} from './domain/artifact-combinations';
import {characterLoadoutName} from './domain/character-loadout-name';
import {artifactReferences,copyArtifact,type ArtifactReferenceTarget} from './domain/artifact-references';
import {artifactReferenceNavigation} from './composables/artifact-reference-navigation';
import ArtifactPortrait from './components/ArtifactPortrait.vue';
import ArtifactFavorite from './components/ArtifactFavorite.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import {useArtifactRemoval} from './composables/use-artifact-removal';
const props=defineProps<{item:AccountArtifact;account?:LocalAccount;readonly?:boolean}>();
const emit=defineEmits<{close:[]}>();
const store=useAccountStore(),loadouts=useCharacterLoadoutsStore(),combinations=useArtifactCombinationsStore();
const navigate=inject(artifactReferenceNavigation,undefined),sets=ref<{id:string;name:string}[]>([]);
onMounted(async()=>{try{sets.value=(await loadAccountGameData()).catalog.sets;}catch{ /* Keep known item identity visible. */ }});
const deleteArtifact=useArtifactRemoval(),deleting=ref(false);
let deleteBaseline='';
function requestDelete(){requestLeave(()=>{deleteBaseline=JSON.stringify(store.account);deleting.value=true;});}
function remove(){try{if(JSON.stringify(store.account)!==deleteBaseline)throw new Error('库存已变化，请重新确认。');deleteArtifact(display.value.id);deleting.value=false;emit('close');}catch(cause){error.value=cause instanceof Error?cause.message:'未删除，请重试。';deleting.value=false;}}
const form=ref<InstanceType<typeof ArtifactForm>>();
const display=ref<AccountArtifact>(JSON.parse(JSON.stringify(props.item)));
const revision=ref(0),dirty=ref(false),busy=ref(false),error=ref('');
const { discardOpen, requestLeave, cancelDiscard, discardChanges, saveAndLeave }=useUnsavedChanges(dirty);
let baseline=JSON.stringify(props.item);
const inventory=computed(()=>props.account ?? store.account);
const accountId=inventory.value.id;
function restore() { display.value=JSON.parse(JSON.stringify(props.item));baseline=JSON.stringify(props.item);revision.value++;dirty.value=false;error.value=''; }
async function save(asCopy=false) {
  if(busy.value)return false;
  const item=form.value?.prepare();if(!item)return false;
  busy.value=true;error.value='';
  try {
    const current=inventory.value.artifacts.find(entry=>entry.id===item.id);
    if(inventory.value.id!==accountId || JSON.stringify(current)!==baseline)throw new Error('原物品已变化，请还原后重新核对，未覆盖现有资料。');
    const next=cloneAccount(inventory.value),result=asCopy?copyArtifact(item,inventory.value.artifacts):item;applyAccountArtifact(next,result,asCopy?undefined:item.id);
    if(props.account)props.account.artifacts=next.artifacts;else store.commitEdit(next);
    if(asCopy){emit('close');return true;}
    display.value=item;baseline=JSON.stringify(item);revision.value++;dirty.value=false;return true;
  }catch(cause){error.value=cause instanceof Error?cause.message:'保存失败，原物品保持不变。';return false;}
  finally{busy.value=false;}
}
const references=computed(()=>{
  const configurations=accountConfigurations(inventory.value,loadouts.loadouts);
  return artifactReferences(inventory.value,configurations,combinations.combinations,display.value.id).map(reference=>{
    if(reference.target.kind==='combination'){const target=reference.target,item=combinations.combinations.find(item=>item.id===target.id);return {...reference,name:item?combinationName(item,sets.value):reference.name};}
    if(reference.target.kind==='configuration'){const target=reference.target,configuration=configurations.find(item=>item.character.id===target.characterId && item.presetId===target.presetId);if(configuration){const character=configuration.character,stats=loadouts.effectiveStats(inventory.value.id,character.id,character.name);return {...reference,name:`${character.name} · ${configuration.presetId?'备选':'首选'} · ${character.realBuild?character.realBuild.constellation+'命':'培养待补全'} · ${characterLoadoutName(character,configuration.source,stats,sets.value).split(' · ').slice(1).join('|')}`};}}
    return reference;
  });
});
function jump(target:ArtifactReferenceTarget){if(!navigate)return;requestLeave(()=>{emit('close');void nextTick(()=>navigate(target,{accountId,item:JSON.parse(JSON.stringify(display.value)),readonly:props.readonly}));});}
defineExpose({requestLeave});
</script>
<template>
  <WorkbenchDialog editor class="artifact-detail-dialog" :title="display.name" @close="requestLeave(()=>emit('close'))">
    <template #header-leading><div class="artifact-edit-actions"><EditorActions v-if="!readonly" :dirty="dirty" :busy="busy" allow-save-as :can-save-as="!!display.real" @save="save()" @save-as="save(true)" @restore="restore" /><button v-if="!readonly && !account && display.inventoryId!==null" class="ui-action soft" data-size="md" data-accent="pyro" @click="requestDelete">删除</button></div></template>
    <template #header-trailing><ArtifactFavorite v-if="!readonly" :account-id="inventory.id" :item-id="display.id" /></template>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="artifact-detail-body"><ArtifactPortrait class="artifact-portrait" :item="display" main /><fieldset class="artifact-editor-fields" :disabled="readonly"><ArtifactForm ref="form" :key="revision" details inline :item="display" :target-account="props.account" @dirty-change="dirty=$event" /></fieldset></div>
    <section v-if="references.length" class="artifact-references" aria-label="引用关系"><h3>引用关系</h3><div v-for="group in [{kind:'character',title:'角色'},{kind:'configuration',title:'角色配置'},{kind:'combination',title:'圣遗物组合'}]" :key="group.kind" class="reference-row" role="group" :aria-label="group.title"><h4>{{ group.title }}</h4><div><button v-for="reference in references.filter(item=>item.kind===group.kind)" :key="reference.key" :title="reference.name" class="ui-action soft" data-size="md" data-accent="hydro" :disabled="!navigate" @click="jump(reference.target)"><span class="reference-name">{{ reference.name }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></button></div></div></section>
  </WorkbenchDialog>
  <ConfirmationDialog v-if="deleting" title="删除圣遗物？" confirm-label="删除" @cancel="deleting=false" @confirm="remove"><p>仅删除库存身份，保留佩戴和装备内容。</p><p>配置和组合保留装备内容，改为未入库快照。</p></ConfirmationDialog>
  <UnsavedChangesDialog v-if="discardOpen" :busy="busy" @save="saveAndLeave(()=>save())" @continue="cancelDiscard" @discard="discardChanges" />
</template>
<style scoped>
.artifact-edit-actions { display:flex; flex-wrap:wrap; gap:8px; }.artifact-detail-body { width:100%; max-width:640px; margin-inline:auto; }.artifact-portrait { margin:0 auto 20px; }.artifact-editor-fields { min-width:0; margin:0; padding:0; border:0; }.artifact-references { margin-top:24px; padding-top:16px; border-top:1px solid var(--line); }.artifact-references h3 { margin:0 0 12px; font-size:var(--font-control); }.reference-row { display:grid; grid-template-columns:88px minmax(0,1fr); align-items:start; gap:12px; padding:8px 0; }.reference-row h4 { font-size:var(--font-body); font-weight:700; line-height:32px; margin:0; color:var(--muted); }.reference-row > div { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }.artifact-references button { max-width:100%; height:32px; min-height:32px; white-space:nowrap; text-align:left; }.artifact-references .reference-name { min-width:0; overflow:hidden; text-overflow:ellipsis; }.artifact-references button > svg { flex:none; }
</style>
