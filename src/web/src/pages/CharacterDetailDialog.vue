<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, toRaw, useId, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { StatKey } from '@leyline/schema';
import type { GameCatalog } from '@leyline/game-data';
import { cloneAccount, parseAccount, accountSlots, equipArtifact, type AccountSlot, type AccountCharacter, type AccountArtifact, type LocalAccount } from '../domain/account';
import { accountConfigurations, hasLocalConfiguration, planClearedConfiguration } from '../domain/account-configurations';
import { effectiveStatGroups, characterLoadoutName, characterLoadoutLabel, equipmentConfigurationLabel } from '../domain/character-loadout-name';
import { artifactValueSignature, matchingInventoryArtifact, planShowcaseInventory } from '../domain/showcase-inventory';
import {buildRollBasis,type EffectiveRollBasis} from '../domain/effective-roll-basis';
import { useAccountStore } from '../stores/account';
import { localDataErrorLabel } from '../domain/workbench-labels';
import { loadAccountGameData } from '../domain/account-presentation';
import { showcaseArtifact } from '../domain/enka-import';
import ArtifactPickerDialog from '../components/ArtifactPickerDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import ContextMenu from '../components/ContextMenu.vue';
import CharacterForm from './CharacterForm.vue';
import ComparisonPanel from '../components/ComparisonPanel.vue';
import CharacterStats from './CharacterStats.vue';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import CharacterFavorite from '../components/CharacterFavorite.vue';
import EffectiveRollSummary from '../components/EffectiveRollSummary.vue';
import DisclosureHeading from '../components/DisclosureHeading.vue';
import EditorActions from '../components/EditorActions.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import ArtifactEquipmentGrid from '../components/ArtifactEquipmentGrid.vue';
import ArtifactDetail from './ArtifactDetail.vue';
import {useInventoryHistoryMerge} from '../composables/use-inventory-history-merge';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import { useCharacterLoadoutsStore, type CharacterLoadout } from '../stores/character-loadouts';
import { useArtifactCombinationsStore } from '../stores/artifact-combinations';
import { applyCombination, combinationSignature, type ArtifactCombination } from '../domain/artifact-combinations';
import ArtifactCombinationLibrary from './ArtifactCombinationLibrary.vue';
import ArtifactCombinationEditor from './ArtifactCombinationEditor.vue';

const props = defineProps<{
  characterId: string;
  presetId?: string;
  configurationDetail?: boolean;
  catalogCharacter?: { id: string; name: string };
  selectOnSave?: boolean;
}>();
const emit = defineEmits<{ close: []; back: []; saved: [id: string] }>();
const store = useAccountStore();
const { account, error } = storeToRefs(store);
const characterId = computed(() => props.characterId);
const loadouts = useCharacterLoadoutsStore();
const catalog = shallowRef<GameCatalog>();
onMounted(async () => { try { catalog.value = (await loadAccountGameData()).catalog; } catch { detailError.value = '目录加载失败。'; } });
const draftAccount = ref<LocalAccount>();
const editingAccount = computed(() => draftAccount.value ?? account.value);
const character = computed(() => editingAccount.value.characters.find(entry => entry.id === characterId.value));
const characterForm = ref<InstanceType<typeof CharacterForm>>();
const cultivationDirty = ref(false);
const formRevision = ref(0);
const detailError = ref('');
const detailBusy = ref(false);
const saveAsOpen = ref(false);
const configurationPickerOpen=ref(false);
const clearShowcaseOpen = ref(false);
const localViewTab = ref<HTMLButtonElement>();
const editingPresetId = ref('');
const draftStats = shallowRef<StatKey[]>();
let baselineCharacter = '';
let baselineArtifacts: AccountArtifact[] = [];
let baseSnapshot = '';
let presetBaseline: CharacterLoadout | undefined;
const detailDirty = computed(() => {
  const draft = draftAccount.value;
  if (!draft) return false;
  // Equipment edits replace the draft inventory array. Cultivation lives in CharacterForm until save.
  return cultivationDirty.value || !!draftStats.value || JSON.stringify(character.value) !== baselineCharacter
    || (toRaw(draft.artifacts) !== baselineArtifacts && JSON.stringify(toRaw(draft.artifacts)) !== JSON.stringify(baselineArtifacts));
});
const availableLoadouts = computed(() => loadouts.loadouts.filter(item => item.accountId === account.value.id && item.characterId === characterId.value));
const savedStats = computed(()=>loadouts.effectiveStats(account.value.id,characterId.value,character.value?.name));
const effectiveStats = computed(() => draftStats.value ?? savedStats.value);
const savedCharacter = computed(() => account.value.characters.find(entry => entry.id === characterId.value));
const useCurrent = computed(() => !!savedCharacter.value?.build && !detailDirty.value);
const effectiveBasis=computed(()=>equipmentView.value==='showcase'?buildRollBasis(character.value?.showcase?.build):characterForm.value?.rollBasis ?? buildRollBasis(character.value?.build));
function configurationName(entry:AccountCharacter, source:LocalAccount) { return characterLoadoutName(entry,source,loadouts.effectiveStats(source.id,entry.id,entry.name),catalog.value?.sets ?? []); }
const draftLabel=computed(()=>character.value?equipmentConfigurationLabel(equippedItems.value,effectiveStats.value,catalog.value?.sets ?? [],effectiveBasis.value,effectiveBasis.value.weaponName ?? '未配武器'):'');
function toggleEffectiveStat(stat:StatKey) {
  const values=effectiveStatGroups.filter(group=>effectiveStats.value.includes(group.stat)).map(group=>group.stat);
  setEffectiveChoices(values.includes(stat)?values.filter(value=>value!==stat):[...values,stat]);
}
function setEffectiveChoices(values:string|number|(string|number)[]) {
  if(!Array.isArray(values))return;
  const stats = effectiveStatGroups.filter(group=>values.includes(group.stat)).flatMap(group=>group.members);
  if (props.catalogCharacter) {
    draftStats.value = stats.length === savedStats.value.length && stats.every(stat => savedStats.value.includes(stat)) ? undefined : stats;
    return;
  }
  try { loadouts.setEffectiveStats(account.value.id,characterId.value,stats); }
  catch { detailError.value='有效属性选择未能保存，请检查本地存储。'; }
}

async function openSaveAs() {
  if (cultivationDirty.value && !await characterForm.value?.prepare()) return;
  saveAsOpen.value = true;
}
function restoreConfiguration() { const id=editingPresetId.value;resetDraft();if(id)tryPreset(id); }
function selectConfiguration(id:string) {
  if(id===editingPresetId.value)return;
  requestLeave(()=>{equipmentView.value='local';resetDraft();if(id)tryPreset(id);});
}
function setCleanDraft(next: LocalAccount) {
  baselineCharacter = JSON.stringify(next.characters.find(entry => entry.id === characterId.value));
  baselineArtifacts = toRaw(next.artifacts);
  draftAccount.value = next;
}
function resetDraft() {
  equipmentPickerOpen.value=false;
  baseSnapshot = JSON.stringify(toRaw(account.value));
  const next: LocalAccount = JSON.parse(baseSnapshot);
  if (props.catalogCharacter && !savedCharacter.value) {
    next.characters.push({ id: characterId.value, name: props.catalogCharacter.name, attack: 0, weapon: '', equipment: {} });
  }
  draftStats.value = undefined;
  setCleanDraft(next);
  editingPresetId.value='';presetBaseline=undefined;
  cultivationDirty.value = false; formRevision.value++;
  detailError.value = '';
}
async function saveDetail(asPreset = false) {
  if (!draftAccount.value || !character.value || detailBusy.value) return false;
  const draft = draftAccount.value;
  detailBusy.value = true; detailError.value = '';
  try {
    if (JSON.stringify(toRaw(account.value)) !== baseSnapshot) throw new Error('账号资料已在其他操作中变化，请先核对并还原草稿后重试。');
    if (props.catalogCharacter && useCurrent.value) return true;
    const next = cloneAccount(draft);
    let entry = next.characters.find(item => item.id === characterId.value)!;
    if (cultivationDirty.value || (props.catalogCharacter && !entry.build)) {
      const prepared = await characterForm.value?.prepare();
      if (!prepared) return false;
      entry = prepared;
      next.characters[next.characters.findIndex(item => item.id === entry.id)] = entry;
    }
    if (draftAccount.value !== draft || !active || JSON.stringify(toRaw(account.value)) !== baseSnapshot) throw new Error('编辑对象已变化，未保存。');
    if (!asPreset && presetBaseline && availableLoadouts.value.find(item => item.id === presetBaseline?.id) !== presetBaseline) {
      throw new Error('原配置已变化，请还原并核对后再保存。');
    }
    const valid = parseAccount(next);
    if(asPreset && !hasLocalConfiguration(entry))throw new Error('没有本地配置可另存。');
    if(!hasLocalConfiguration(entry) && !asPreset) {
      const plan=planClearedConfiguration(account.value,valid,loadouts.loadouts,entry.id,editingPresetId.value);
      loadouts.removeConfigurations(account.value.id, entry.id, editingPresetId.value, plan, () => store.commitEdit(plan.next));
      if(plan.removedCharacter) {
        closeCharacter();
        await nextTick();document.querySelector<HTMLInputElement>('[aria-label="搜索账号角色"]')?.focus();
      } else {resetDraft();}
      return true;
    }
    if (asPreset || editingPresetId.value) {
      if(!effectiveStats.value.length)throw new Error('请选择用于命名的有效词条。');
      const name=configurationName(entry,valid);
      if(asPreset)editingPresetId.value=loadouts.save(name,valid,entry);
      else loadouts.update(editingPresetId.value,name,valid,entry);
      presetBaseline=availableLoadouts.value.find(item=>item.id===editingPresetId.value);
      setCleanDraft(valid);cultivationDirty.value=false;formRevision.value++;
      saveAsOpen.value=false;
    } else {
      if (draftStats.value) loadouts.setEffectiveStats(account.value.id, entry.id, draftStats.value, () => store.commitEdit(valid));
      else store.commitEdit(valid);
      resetDraft();
    }
    return true;
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '保存失败，原配置保持不变。'; return false; }
  finally { detailBusy.value = false; }
}
async function saveCatalogCharacter() {
  if (await saveDetail()) emit('saved', characterId.value);
}
function tryPreset(id: string) {
  if (!id || !draftAccount.value || !character.value) return;
  detailError.value = '';
  try {
    if (detailDirty.value) throw new Error('请先保存或还原当前修改，再载入其他方案。');
    const preset = availableLoadouts.value.find(item => item.id === id);
    if (!preset) throw new Error('配装方案不存在或不属于当前账号角色。');
    const entry = preset.snapshot.characters[0];
    for (const item of preset.snapshot.artifacts) {
      const current = draftAccount.value.artifacts.find(candidate => candidate.id === item.id);
      if (item.inventoryId!==null && (!current || artifactValueSignature(current) !== artifactValueSignature(item))) throw new Error('方案中的实物已缺失或词条发生变化，请先核对库存。');
    }
    const source = toRaw(draftAccount.value);
    const next = { ...source, characters: [...source.characters], artifacts: [...source.artifacts] };
    next.artifacts.push(...preset.snapshot.artifacts.filter(item=>item.inventoryId===null && !next.artifacts.some(current=>current.id===item.id)));
    const original = next.characters.find(item => item.id === entry.id)!;
    const snapshot = JSON.parse(JSON.stringify(entry)) as AccountCharacter;
    const equipment = { ...snapshot.equipment };
    snapshot.equipment = {}; snapshot.showcase = original.showcase;
    next.characters[next.characters.findIndex(item => item.id === snapshot.id)] = snapshot;
    for (const artifact of Object.values(equipment)) equipArtifact(next, snapshot.id, artifact!);
    setCleanDraft(next);editingPresetId.value=id;presetBaseline=preset;formRevision.value++;cultivationDirty.value=false;

  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '方案未载入。'; }
}
const combinationStore=useArtifactCombinationsStore();
const combinationPickerOpen=ref(false),combinationEditorId=ref('');
const combinationSeed=ref<{items:AccountArtifact[];stats:StatKey[];referenceName:string;basis?:EffectiveRollBasis}>(),combinationPendingArtifacts=ref<AccountArtifact[]>([]);
const pendingCombination=ref<ArtifactCombination>();
let combinationBaseline='';
function syncImportedArtifacts(){
  if(!draftAccount.value)return;
  baseSnapshot=JSON.stringify(toRaw(account.value));
  const { artifacts }=JSON.parse(baseSnapshot) as LocalAccount;
  baselineArtifacts=artifacts;
  draftAccount.value.artifacts=artifacts;
}
async function saveCurrentCombination(){
  if(!character.value)return;
  const target=character.value,source=account.value,sourceView=equipmentView.value,form=characterForm.value;
  detailError.value='';
  try{
    let items:AccountArtifact[],pending:AccountArtifact[]=[];
    if(equipmentView.value==='showcase'){
      if(JSON.stringify(toRaw(account.value))!==baseSnapshot)throw new Error('账号已变化，请核对后还原草稿再保存组合。');
      const plan=planShowcaseInventory(account.value,[character.value]);
      items=plan.items[character.value.id];pending=items.filter(item=>!account.value.artifacts.some(current=>current.id===item.id));
    }else items=equippedItems.value;
    const stats=[...effectiveStats.value];
    const basis=equipmentView.value==='showcase'?buildRollBasis(character.value.showcase?.build):await characterForm.value?.getRollBasis() ?? buildRollBasis(character.value.build);
    if(!active || target!==character.value || source!==account.value || sourceView!==equipmentView.value || form!==characterForm.value)return;
    const existing=combinationStore.combinations.find(entry=>entry.accountId===account.value.id && combinationSignature(entry.items,entry.stats,entry.basis,entry.referenceName)===combinationSignature(items,stats,basis,character.value!.name));
    combinationEditorId.value=existing?.id ?? '';combinationSeed.value=existing?undefined:{items,stats,referenceName:character.value.name,basis};combinationPendingArtifacts.value=pending;
  }catch(cause){detailError.value=cause instanceof Error?cause.message:'组合未打开。';}
}
function combinationSaved(id:string,duplicate:boolean){
  if(combinationPendingArtifacts.value.length)syncImportedArtifacts();
  combinationSeed.value=undefined;combinationPendingArtifacts.value=[];combinationEditorId.value=duplicate?id:'';

}
function closeCombination(){combinationSeed.value=undefined;combinationPendingArtifacts.value=[];combinationEditorId.value='';}
function useCombination(combination:ArtifactCombination,confirmed=false){
  if(!character.value || !draftAccount.value)return;
  try{
    if(confirmed && combinationBaseline!==JSON.stringify(draftAccount.value))throw new Error('草稿已变化，请重新选择组合。');
    const plan=applyCombination(draftAccount.value,character.value.id,combination);
    if(!confirmed && combination.items.length<5){
      pendingCombination.value=combination;combinationBaseline=JSON.stringify(draftAccount.value);return;
    }
    draftAccount.value=plan.next;combinationPickerOpen.value=false;pendingCombination.value=undefined;

  }catch(cause){detailError.value=cause instanceof Error?cause.message:'组合未应用。';pendingCombination.value=undefined;}
}
const equipmentSlot = ref<AccountSlot>('flower');
const equipmentPickerOpen=ref(false);
const commitMergedInventory=useInventoryHistoryMerge();
const equipmentMenu=ref<{slot:AccountSlot;x:number;y:number}>(),inspectingSlot=ref<AccountSlot>(),importingSlot=ref<AccountSlot>();
let importPieceBaseline='';
function equipmentContext(slot:AccountSlot,event:MouseEvent|KeyboardEvent){
  const trigger=event.currentTarget as HTMLElement,bounds=trigger.getBoundingClientRect();trigger.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
  equipmentMenu.value={slot,x:'clientX' in event?event.clientX:bounds.left+12,y:'clientY' in event?event.clientY:bounds.top+12};
}
function openInspectedArtifact(slot:AccountSlot){
  if(props.catalogCharacter || equipmentView.value==='showcase'){inspectingSlot.value=slot;return;}
  const preset=editingPresetId.value;
  requestLeave(()=>{if(detailDirty.value){resetDraft();if(preset)tryPreset(preset);}inspectingSlot.value=slot;});
}
function closeInspectedArtifact(){const editable=!props.catalogCharacter && equipmentView.value==='local',preset=editingPresetId.value;inspectingSlot.value=undefined;if(editable){resetDraft();if(preset)tryPreset(preset);}}
function equipmentAction(action:string){const slot=equipmentMenu.value?.slot;equipmentMenu.value=undefined;if(!slot)return;
  if(action==='details')openInspectedArtifact(slot);
  else if(action==='replace')openEquipmentPicker(slot);
  else if(action==='remove' && character.value)delete character.value.equipment[slot];
  else if(action==='import')requestShowcasePiece(slot);
}
function requestShowcasePiece(slot:AccountSlot){importPieceBaseline=JSON.stringify(account.value);importingSlot.value=slot;}
function importShowcasePiece(){try{
  if(!character.value || !importingSlot.value)return;
  if(JSON.stringify(account.value)!==importPieceBaseline)throw new Error('库存已变化，请重新确认。');
  const plan=planShowcaseInventory(account.value,[character.value],[importingSlot.value]);commitMergedInventory(plan.next);syncImportedArtifacts();importingSlot.value=undefined;
}catch(cause){detailError.value=cause instanceof Error?cause.message:'未入库，请重试。';importingSlot.value=undefined;}}
function openEquipmentPicker(slot:AccountSlot) { equipmentSlot.value=slot;equipmentPickerOpen.value=true; }
function unequipCurrentSlot() { if(character.value)delete character.value.equipment[equipmentSlot.value];equipmentPickerOpen.value=false; }

let active = true;
onUnmounted(() => { active = false; });
const {discardOpen,requestLeave:protectDraft,cancelDiscard,discardChanges,saveAndLeave} = useUnsavedChanges(detailDirty);
function requestLeave(action: () => void, canceled?: () => void) {
  if (detailBusy.value) canceled?.();
  else protectDraft(action, canceled);
}
const panelOpen = ref(false);
const panelId = useId();
watch(() => account.value.id, () => emit('close'));
function closeCharacter() { emit('close'); }
function guardPreferred(action:()=>void) {
  const id=editingPresetId.value;
  requestLeave(()=>{if(detailDirty.value){resetDraft();if(id)tryPreset(id);}action();});
}
const clearTarget = ref<'local'|'showcase'>('local');
function requestClearShowcase() {
  const target=equipmentView.value;
  const open=()=>{ if(target==='showcase' && editingPresetId.value){resetDraft();equipmentView.value='showcase';}clearTarget.value=target;clearShowcaseOpen.value=true; };
  if(target==='showcase' && editingPresetId.value)requestLeave(open);else open();
}
const clearPreview=computed(()=>{
  if(!clearShowcaseOpen.value || !draftAccount.value || !character.value)return undefined;
  const next=cloneAccount(draftAccount.value),entry=next.characters.find(item=>item.id===character.value!.id)!;
  if(clearTarget.value==='local'){delete entry.build;entry.attack=0;entry.weapon='';entry.equipment={};}else delete entry.showcase;
  if(hasLocalConfiguration(entry))return undefined;
  try{return planClearedConfiguration(account.value,next,loadouts.loadouts,entry.id,editingPresetId.value);}catch{return undefined;}
});
function clearShowcase() {
  if (!character.value)return;
  if(clearTarget.value==='showcase')delete character.value.showcase;
  else {
    delete character.value.build;character.value.attack=0;character.value.weapon='';character.value.equipment={};
    cultivationDirty.value=false;formRevision.value++;
  }
  equipmentView.value='local';clearShowcaseOpen.value=false;nextTick(()=>localViewTab.value?.focus());

}
const equipmentView=ref<'local'|'showcase'>('local');
const equipmentEntries=computed(()=>accountSlots.map(slot=>{
  const entry=character.value;
  const item=equipmentView.value==='showcase' && entry ? showcaseArtifact(entry,slot,account.value)
    : editingAccount.value.artifacts.find(piece=>piece.id===entry?.equipment[slot]);
  return {slot,item};
}));
const equippedItems=computed(()=>equipmentEntries.value.flatMap(({item})=>item?[item]:[]));
function equipmentItem(slot:AccountSlot) { return equipmentEntries.value[accountSlots.indexOf(slot)].item; }
const inspectedInventoryId = computed(() => {
  const slot = inspectingSlot.value, entry = character.value;
  if (equipmentView.value !== 'showcase' || !slot || !entry?.showcase) return;
  const item = equipmentItem(slot);
  return item && matchingInventoryArtifact(account.value, item, entry.showcase.build.artifactMain, entry.equipment[slot])?.id;
});
const comparisonOptions=computed(()=>character.value?accountConfigurations(account.value,loadouts.loadouts,character.value.id).filter(item=>(equipmentView.value==='showcase' || item.presetId!==editingPresetId.value) && hasLocalConfiguration(item.character)).map(item=>({id:item.id,title:(item.presetId?'备选：':'首选：')+characterLoadoutLabel(item.character,item.source,effectiveStats.value,catalog.value?.sets ?? []),basis:buildRollBasis(item.character.build),items:accountSlots.flatMap(slot=>{const piece=item.source.artifacts.find(piece=>piece.id===item.character.equipment[slot]);return piece?[piece]:[];})})):[]);
function configurationDeleted(id:string,presetId:string){configurationPickerOpen.value=false;if(id!==characterId.value)return;if(presetId && presetId!==editingPresetId.value)return;const entry=account.value.characters.find(item=>item.id===id);if(!entry || props.configurationDetail && !hasLocalConfiguration(entry)){closeCharacter();return;}resetDraft();}
function chooseConfiguration(_characterId:string,presetId:string) { configurationPickerOpen.value=false;selectConfiguration(presetId); }
function equip(item: AccountArtifact) {
  if (!character.value) return;
  try {
    equipArtifact(editingAccount.value, character.value.id, item.id);
    equipmentPickerOpen.value = false;
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '装备未更新。'; }
}

resetDraft();
if (props.presetId) tryPreset(props.presetId);
defineExpose({ requestLeave });
</script>

<template>
  <WorkbenchDialog editor class="character-detail-dialog" v-if="character" :title="character.name"
    :dirty="detailDirty" :before-close="requestLeave" @close="closeCharacter">
    <template #title><h2 class="configuration-title">{{ character.name }}</h2></template>
    <template v-if="!catalogCharacter" #header-trailing><CharacterFavorite :account-id="account.id" :character-id="character.id" :name="character.name"
      :preset-id="configurationDetail || editingPresetId ? editingPresetId : undefined" /></template>
    <template v-if="!catalogCharacter" #header-secondary>
      <button class="configuration-title-button" :aria-label="`选择${character.name}配置`" @click="configurationPickerOpen=true">切换配置<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    </template>
    <template #header-leading>
      <div v-if="catalogCharacter" class="character-header-tools">
        <button type="button" class="ui-action soft" data-size="md" aria-label="返回角色列表" @click="requestLeave(()=>emit('back'))">返回</button>
        <EditorActions :dirty="detailDirty" :busy="detailBusy" :can-save="!!characterForm?.canSave"
          :save-label="selectOnSave && useCurrent ? '选用当前配置' : '保存'" @save="saveCatalogCharacter" @restore="restoreConfiguration" />
      </div>
      <div v-else class="character-header-tools"><div class="equipment-view-tabs" role="group" aria-label="角色资料来源"><button ref="localViewTab" data-view="local" :aria-pressed="equipmentView==='local'" :class="{active:equipmentView==='local'}" @click="equipmentView = 'local'">本地</button><button v-if="character.showcase" data-view="showcase" :aria-pressed="equipmentView==='showcase'" :class="{active:equipmentView==='showcase'}" @click="equipmentView = 'showcase'">展柜</button></div><EditorActions v-if="equipmentView==='local'" :dirty="detailDirty" :busy="detailBusy" allow-save-as @save="saveDetail()" @save-as="openSaveAs" @restore="restoreConfiguration" /><button class="clear-showcase ui-action soft" data-size="md" data-accent="pyro" @click="requestClearShowcase">删除</button></div>
    </template>
    <div class="account-editor">
      <p v-if="detailError || loadouts.error" role="alert">{{ detailError || loadouts.error }}</p>

      <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}</div>

      <CharacterForm ref="characterForm" v-show="equipmentView==='local'" details detached :key="`${character.id}-${formRevision}`" :character="character" :initial-character-id="catalogCharacter?.id" @dirty-change="cultivationDirty=$event" />
      <CharacterForm v-if="equipmentView==='showcase'" details :character="character" showcase />
      <section class="detail-panel"><DisclosureHeading class="inline-section-heading" title="角色面板" label="面板" :controls="panelId" :expanded="panelOpen" @toggle="panelOpen = !panelOpen" /><div :id="panelId"><CharacterStats v-if="panelOpen" :account="editingAccount" :character="character"
        :build="equipmentView === 'showcase' ? character.showcase?.build : characterForm?.draftBuild" :showcase="equipmentView === 'showcase'" /></div></section>
      <section class="detail-artifacts"><div class="inline-section-heading"><h3>圣遗物</h3><div class="combination-detail-actions"><button v-if="equipmentView==='local'" class="ui-action soft" data-size="md" data-accent="hydro" @click="combinationPickerOpen=true">应用组合</button><button class="ui-action soft" data-size="md" :data-accent="equipmentView==='showcase'?'electro':'anemo'" @click="saveCurrentCombination">保存组合</button></div></div>
      <ArtifactEquipmentGrid :entries="equipmentEntries" :account="editingAccount" :readonly="equipmentView==='showcase'" :effective-stats="effectiveStats" context-menu @menu="equipmentContext" @inspect="openInspectedArtifact" :wearers="equipmentView==='showcase' ? [{name:character.name,id:character.build?.character.id,label:'展柜快照'}] : undefined" @change="openEquipmentPicker" />
      </section>
      <section class="effective-stat-picker" role="group" aria-label="有效词条"><h3>有效词条</h3><EffectiveRollSummary :basis="effectiveBasis" :items="equippedItems" :selected-stats="effectiveStats" selectable @toggle="toggleEffectiveStat" /></section>
      <ComparisonPanel v-if="!catalogCharacter || comparisonOptions.length" :key="editingPresetId" kind="配置" :current="{title:(equipmentView==='showcase'?'展柜：':'当前配置：')+draftLabel,basis:effectiveBasis,items:equippedItems}" :options="comparisonOptions" :stats="effectiveStats" :reference-name="character.name" />
    </div>
  </WorkbenchDialog>
  <ContextMenu v-if="equipmentMenu" :x="equipmentMenu.x" :y="equipmentMenu.y" label="角色圣遗物操作" :options="[{id:'details',label:'查看详情'},...(equipmentView==='showcase'?[{id:'import',label:'入库',accent:'anemo' as const}]:[{id:'replace',label:'替换'},{id:'remove',label:'卸下',danger:true}])]" @close="equipmentMenu=undefined" @select="equipmentAction" />
  <ArtifactDetail v-if="inspectingSlot && equipmentItem(inspectingSlot)" :item="equipmentItem(inspectingSlot)!"
    :reference-item-id="inspectedInventoryId"
    :account="catalogCharacter ? editingAccount : undefined" :readonly="equipmentView==='showcase' || equipmentItem(inspectingSlot)?.inventoryId===null" @close="closeInspectedArtifact">
    <template v-if="equipmentView==='showcase'" #actions><button class="ui-action soft" data-size="md" data-accent="anemo" @click="requestShowcasePiece(inspectingSlot)">入库</button></template>
  </ArtifactDetail>
  <ConfirmationDialog v-if="importingSlot" title="入库圣遗物？" :danger="false" confirm-label="入库" @cancel="importingSlot=undefined" @confirm="importShowcasePiece"><p>相同内容合并，优先采用展柜强化次数；当前穿戴不变。</p></ConfirmationDialog>
  <ArtifactPickerDialog v-if="equipmentPickerOpen && character && equipmentView==='local'" :slot="equipmentSlot" :account="editingAccount" :current="equipmentItem(equipmentSlot)" :effective-stats="effectiveStats" @close="equipmentPickerOpen=false" @remove="unequipCurrentSlot" @select="equip" />
  <WorkbenchDialog v-if="combinationPickerOpen && character" title="选择圣遗物组合" @close="combinationPickerOpen=false"><ArtifactCombinationLibrary pick :stats="effectiveStats" :reference-name="character.name" @select="useCombination" /></WorkbenchDialog>
  <ArtifactCombinationEditor v-if="combinationEditorId || combinationSeed" :key="combinationEditorId || 'seed'" :combination="combinationStore.combinations.find(item=>item.id===combinationEditorId)" :seed="combinationSeed" :pending-artifacts="combinationPendingArtifacts" @close="closeCombination" @saved="combinationSaved" />
  <ConfirmationDialog v-if="pendingCombination" title="应用圣遗物组合？" :danger="false" confirm-label="应用到草稿" @cancel="pendingCombination=undefined" @confirm="useCombination(pendingCombination!,true)"><p v-if="pendingCombination.items.length<5">组合未满五件，缺少的部位将卸下。</p><p>保存角色后生效，库存物品保留。</p></ConfirmationDialog>
  <WorkbenchDialog v-if="configurationPickerOpen && character" :title="`${character.name}的配置`" @close="configurationPickerOpen=false"><p v-if="detailDirty" class="detail-feedback">切换前会确认未保存的修改。</p><CharacterConfigurationList :character-id="character.id" selectable :current-preset-id="editingPresetId"  :before-adopt="guardPreferred" @adopted="resetDraft();configurationPickerOpen=false" @deleted="configurationDeleted" @select="chooseConfiguration" /></WorkbenchDialog>

  <UnsavedChangesDialog v-if="discardOpen" :busy="detailBusy" @save="saveAndLeave(()=>saveDetail())" @continue="cancelDiscard" @discard="discardChanges" />
  <ConfirmationDialog v-if="clearShowcaseOpen" :title="clearTarget==='local'?'清除本地配装？':'清除展柜信息？'" confirm-label="确认清除" @cancel="clearShowcaseOpen=false" @confirm="clearShowcase"><p>{{ clearTarget==='local'?'清除本地培养与穿戴，圣遗物保留在库存。':'清除该角色的展柜信息。' }}</p><p v-if="clearPreview?.promotedId">保存后由下一套备选接替首选。</p><p v-if="clearPreview?.removedCharacter">已无其他配置及展柜，保存后移除角色。</p><p>保存后生效。</p></ConfirmationDialog>
  <WorkbenchDialog v-if="saveAsOpen && character" title="另存角色配装方案" @close="saveAsOpen=false"><label>方案名称<input :value="`${character.name} | ${draftLabel}`" aria-label="配装方案名称" readonly></label><p>按角色、有效平均词条数、套装和武器自动命名；首选配置和实际穿戴不变。</p><p v-if="!effectiveStats.length" role="alert">请先在详情中选择有效属性。</p><p v-if="detailError" role="alert">{{ detailError }}</p><button class="ui-action" data-accent="anemo" :disabled="detailBusy || !effectiveStats.length" @click="saveDetail(true)">确认另存</button></WorkbenchDialog>
</template>

<style scoped>
.character-detail-dialog { overflow-y:auto; scrollbar-gutter:stable both-edges; width:min(var(--dialog-width-editor),calc(100vw - 32px)); }
.configuration-title { display:flex; align-items:center; justify-content:center; min-width:0; min-height:var(--control-height-md); margin:0; line-height:1.2; }
.character-header-tools,.combination-detail-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; min-width:0; }
.equipment-view-tabs { display:flex; flex:none; padding:2px; box-sizing:border-box; height:var(--control-height-md); border:1px solid var(--line); border-radius:var(--control-radius); background:var(--neutral-canvas); }
.equipment-view-tabs button { height:26px; min-height:26px; padding:0 8px; border:0; border-radius:4px; background:transparent; color:var(--muted); font-size:var(--font-control); font-weight:700; }
.equipment-view-tabs button.active[data-view=local] { background:var(--element-hydro-light); color:var(--element-hydro-deep); box-shadow:0 1px 3px #283a3620; }
.equipment-view-tabs button.active[data-view=showcase] { background:var(--element-electro-light); color:var(--element-electro-deep); box-shadow:0 1px 3px #283a3620; }
.equipment-view-tabs button:focus-visible { outline:2px solid var(--element-hydro-deep); outline-offset:1px; }
.configuration-title-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:0; max-width:100%; height:var(--control-height-md); padding:0 8px; border:1px solid var(--line); border-radius:var(--control-radius); background:var(--surface-raised); color:var(--ink); --button-hover-border:var(--element-hydro-primary); font-size:var(--font-control); font-weight:700; }
.configuration-title-button svg { flex:none; width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.8; }
.detail-panel,.detail-artifacts { margin-top:14px; }
.inline-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:8px 0 12px; padding-bottom:10px; border-bottom:1px solid var(--line); text-align:left; }
.detail-artifacts .inline-section-heading { flex-wrap:wrap; }
.inline-section-heading h3 { margin:0; font-size:var(--font-control); }
.detail-panel :deep(.character-stats) { margin:0; padding:12px; border:1px solid var(--line); border-radius:10px; }
.detail-panel :deep(.character-stats h3) { display:none; }
.effective-stat-picker { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); }
.effective-stat-picker h3 { margin:0 0 10px; font-size:var(--font-control); }
.effective-stat-picker > div { display:flex; flex-wrap:wrap; gap:8px; }
.detail-feedback { margin-bottom:8px; color:var(--element-anemo-deep); font-size:var(--font-body); }
.account-error { color:var(--element-pyro-deep); }
@media(max-width:400px) { .character-header-tools { gap:5px; } }
</style>
