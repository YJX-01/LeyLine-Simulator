<script setup lang="ts">
import {buildRollBasis,defaultRollBasis,rollBasisTitle,type EffectiveRollBasis} from './domain/effective-roll-basis';
import { computed, ref, onMounted } from 'vue';
import type { AccountArtifact, AccountSlot } from './domain/account';
import { accountSlots, accountSlotLabels, cloneAccount } from './domain/account';
import type { RealStat } from '@leyline/schema';
import { defaultCombinationName, combinationName, usesAutomaticCombinationName, type ArtifactCombination } from './domain/artifact-combinations';
import { defaultEffectiveStats, effectiveStatGroups } from './domain/character-loadout-name';
import { loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { useArtifactCombinationsStore } from './stores/artifact-combinations';
import { useUnsavedChanges } from './composables/use-unsaved-changes';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import EditorActions from './components/EditorActions.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';
import EffectiveRollSummary from './components/EffectiveRollSummary.vue';
import EffectiveReferencePicker from './components/EffectiveReferencePicker.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
import ComparisonPanel from './components/ComparisonPanel.vue';
import ArtifactDetail from './ArtifactDetail.vue';
import ContextMenu from './components/ContextMenu.vue';
import ArtifactPickerDialog from './components/ArtifactPickerDialog.vue';
const props=defineProps<{combination?:ArtifactCombination;seed?:{items:AccountArtifact[];stats:RealStat[];referenceName:string;name?:string;basis?:EffectiveRollBasis};pendingArtifacts?:AccountArtifact[]}>();
const emit=defineEmits<{close:[];saved:[id:string,duplicate:boolean]}>();
const account=useAccountStore(),combinations=useArtifactCombinationsStore(),loadouts=useCharacterLoadoutsStore();
const owner=account.account.id,inventoryBaseline=JSON.stringify(account.account);
const initial={items:props.combination?.items ?? props.seed?.items ?? [],stats:props.combination?.stats ?? props.seed?.stats ?? [],referenceName:props.combination?.referenceName ?? props.seed?.referenceName ?? '',name:props.combination && !usesAutomaticCombinationName(props.combination)?props.combination.name:props.combination?undefined:props.seed?.name,basis:props.combination?.basis ?? props.seed?.basis ?? defaultRollBasis()};
const draft=ref(JSON.parse(JSON.stringify(initial)) as typeof initial),baseline=JSON.stringify(initial),error=ref('');
const sets=ref<{id:string;name:string}[]>([]),slot=ref<AccountSlot>('flower'),pickerOpen=ref(false);
const detailItem=ref<AccountArtifact>(),equipmentMenu=ref<{slot:AccountSlot;x:number;y:number}>();
function inspect(slot:AccountSlot){const item=draft.value.items.find(item=>item.slot===slot);if(item)detailItem.value=item;}
function equipmentContext(slot:AccountSlot,event:MouseEvent|KeyboardEvent){const bounds=(event.currentTarget as HTMLElement).getBoundingClientRect();equipmentMenu.value={slot,x:'clientX' in event?event.clientX:bounds.left+12,y:'clientY' in event?event.clientY:bounds.top+12};}
function equipmentAction(action:string){const target=equipmentMenu.value?.slot;equipmentMenu.value=undefined;if(!target)return;if(action==='details')inspect(target);else{slot.value=target;pickerOpen.value=true;}}
const importOpen=ref(false);let saveBaseline='',pendingCopy=false;
onMounted(async()=>{try{sets.value=(await loadAccountGameData()).catalog.sets;}catch{error.value='套装目录加载失败，请重新打开。';}});
const comparisonOptions=computed(()=>combinations.combinations.filter(item=>item.accountId===owner && item.id!==props.combination?.id).map(item=>({id:item.id,title:combinationName(item,sets.value),items:item.items,basis:item.basis})));
const automaticName=computed(()=>defaultCombinationName(draft.value,sets.value));
const modified=computed(()=>JSON.stringify(draft.value)!==baseline);
const dirty=computed(()=>modified.value || !props.combination && draft.value.items.length>0);
const canGenerateName=computed(()=>!!draft.value.items.length && !!draft.value.stats.length);
const canSave=computed(()=>!!draft.value.items.length && !!draft.value.stats.length && (!props.combination || modified.value));
const guard=useUnsavedChanges(dirty);
defineExpose({requestLeave:guard.requestLeave});
const inventory=computed(()=>{const next=cloneAccount(account.account);next.artifacts.push(...(props.pendingArtifacts ?? []).filter(item=>!next.artifacts.some(current=>current.id===item.id)));return next;});
const imports=computed(()=>draft.value.items.filter(item=>item.inventoryId!==null && !account.account.artifacts.some(current=>current.id===item.id)));
function close(){guard.requestLeave(()=>emit('close'));}
function restore(){draft.value=JSON.parse(baseline);error.value='';}
function chooseReference(name:string){draft.value.referenceName=name;const character=account.account.characters.find(item=>item.name===name);if(name)draft.value.stats=character?loadouts.effectiveStats(owner,character.id,name):defaultEffectiveStats(name);draft.value.basis=buildRollBasis(character?.realBuild);}
function toggle(stat:RealStat){const group=effectiveStatGroups.find(item=>item.stat===stat)!;draft.value.stats=group.members.some(item=>draft.value.stats.includes(item))?draft.value.stats.filter(item=>!group.members.includes(item)):[...draft.value.stats,...group.members];}
function save(confirmed=false,copy=false){
  try{
    error.value='';
    if(account.account.id!==owner)throw new Error('账号已切换，请重新打开。');
    if(draft.value.name!==undefined && !draft.value.name.trim())throw new Error('请输入组合名称，或使用自动命名。');
    if(confirmed && saveBaseline!==JSON.stringify(draft.value))throw new Error('组合草稿已变化，请重新保存。');
    if(imports.value.length){
      if(JSON.stringify(account.account)!==inventoryBaseline)throw new Error('库存已变化，请重新打开组合草稿。');
      if(imports.value.some(item=>!(props.pendingArtifacts ?? []).some(source=>source.id===item.id && JSON.stringify(source)===JSON.stringify(item))))throw new Error('组合实物已缺失，请重新选择。');
      if(!confirmed){saveBaseline=JSON.stringify(draft.value);pendingCopy=copy;importOpen.value=true;return 'pending' as const;}
    }
    const next=cloneAccount(account.account);next.artifacts.push(...imports.value);
    const result=combinations.save(next,draft.value.items,draft.value.stats,draft.value.referenceName,copy?'':props.combination?.id,imports.value.length?()=>account.commitEdit(next):undefined,draft.value.name,draft.value.basis,copy);
    importOpen.value=false;emit('saved',result.id,result.duplicate);return true;
  }catch(cause){error.value=cause instanceof Error?cause.message:'组合保存失败。';importOpen.value=false;return false;}
}
function confirmImport(){if(save(true,pendingCopy))guard.finishSave();else guard.cancelDiscard();}
function cancelImport(){importOpen.value=false;guard.cancelDiscard();}
function select(item:AccountArtifact){draft.value.items=[...draft.value.items.filter(entry=>entry.slot!==item.slot),JSON.parse(JSON.stringify(item))];pickerOpen.value=false;}
</script>
<template>
  <WorkbenchDialog editor :title="combination?'编辑组合':seed?'保存组合':'新建组合'" @close="close"><template #header-leading><EditorActions :dirty="modified" :can-save="canSave" :allow-save-as="!!combination" :can-save-as="canGenerateName" @save-as="save(false,true)" @save="save()" @restore="restore" /></template>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="combination-name-row"><label>组合名称<input :value="draft.name ?? automaticName" aria-label="组合名称" maxlength="160" @input="draft.name=($event.target as HTMLInputElement).value"></label><button class="ui-action soft" data-size="md" :aria-pressed="draft.name===undefined" :disabled="!canGenerateName" @click="draft.name=undefined">自动命名</button></div>
    <ArtifactEquipmentGrid density="compact" :effective-stats="draft.stats" :entries="accountSlots.map(slot=>({slot,item:draft.items.find(item=>item.slot===slot)}))" :account="inventory" popup context-menu inspect-primary @inspect="inspect" @menu="equipmentContext" @change="slot=$event;pickerOpen=true" />
    <div class="combination-effective"><div class="combination-reference-row"><EffectiveReferencePicker :name="draft.referenceName" @select="chooseReference" /><span v-if="draft.basis.source==='build'" :title="rollBasisTitle(draft.basis)">武器：{{ draft.basis.weaponName }}</span></div><section class="combination-rolls" aria-label="有效词条"><h3>有效词条</h3><EffectiveRollSummary :basis="draft.basis" :items="draft.items" :selected-stats="draft.stats" selectable @toggle="toggle" /></section></div>
    <ComparisonPanel kind="组合" :current="{title:draft.name ?? automaticName,items:draft.items,basis:draft.basis}" :options="comparisonOptions" :stats="draft.stats" :reference-name="draft.referenceName" />
    <ContextMenu v-if="equipmentMenu" :x="equipmentMenu.x" :y="equipmentMenu.y" label="组合圣遗物操作" :options="[{id:'details',label:'查看详情'},{id:'replace',label:'替换'}]" @close="equipmentMenu=undefined" @select="equipmentAction" />
    <ArtifactDetail v-if="detailItem" :item="detailItem" readonly @close="detailItem=undefined" />
    <ArtifactPickerDialog v-if="pickerOpen" :slot="slot" :account="inventory" :current="draft.items.find(item=>item.slot===slot)" @close="pickerOpen=false" @remove="draft.items=draft.items.filter(item=>item.slot!==slot);pickerOpen=false" @select="select" />
    <ConfirmationDialog v-if="importOpen" title="入库并保存组合？" :danger="false" confirm-label="保存组合" @cancel="cancelImport" @confirm="confirmImport"><p>圣遗物新增 {{ imports.length }} 件，随后保存组合。</p><p>已有物品和当前穿戴保持不变。</p></ConfirmationDialog>
    <UnsavedChangesDialog v-if="guard.discardOpen.value" @save="guard.saveAndLeave(()=>save())" @continue="guard.cancelDiscard" @discard="guard.discardChanges" />
  </WorkbenchDialog>
</template>
<style scoped>
.combination-name-row { display:flex; align-items:end; flex-wrap:wrap; gap:12px; margin:0 0 20px; }.combination-name-row label { display:grid; flex:1; min-width:200px; gap:8px; font-size:var(--font-control); font-weight:700; }.combination-name-row input { width:100%; height:40px; box-sizing:border-box; font-size:var(--font-control); font-weight:700; }.combination-effective { display:grid; gap:12px; margin-top:20px; border-top:1px solid var(--line); padding-top:16px; }.combination-rolls { display:grid; gap:8px; border-top:1px solid var(--line); padding-top:16px; }.combination-effective h3 { font-size:var(--font-control); margin:0; }
.combination-reference-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; }.combination-reference-row > span { font-size:var(--font-body); color:var(--muted); }</style>
