<script setup lang="ts">
import { computed, ref, shallowRef, onMounted, watch, defineAsyncComponent, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import type { RealStat } from '@leyline/schema';
import { cloneAccount, parseAccount, accountSlots, accountSlotLabels, artifactOwner, equipArtifact, type AccountSlot, type AccountCharacter, type LocalAccount } from './domain/account';
import { useAccountStore } from './stores/account';
import { localDataErrorLabel } from './domain/workbench-labels';
import { loadAccountGameData } from './domain/account-presentation';
import { showcaseArtifact } from './domain/enka-import';
import { elementPalette } from './styles/palette';
import type { RealCatalog } from '@leyline/game-data/real';
import { previewMonaSetRepairs, confirmMonaImport, type MonaImportPreview } from './domain/mona-import';
import ArtifactBrowser from './ArtifactBrowser.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import { organizeMonaWearNotes } from './domain/mona-wear-notes';
import CharacterForm from './CharacterForm.vue';
import CharacterStats from './CharacterStats.vue';
import ArtifactForm from './ArtifactForm.vue';
import CharacterCardPortraits from './components/CharacterCardPortraits.vue';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import CharacterFavorite from './components/CharacterFavorite.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import LibraryShortcuts from './components/LibraryShortcuts.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';
import LibraryImportActions from './components/LibraryImportActions.vue';
import FilterActions from './components/FilterActions.vue';
import SortPanel from './components/SortPanel.vue';
import EffectiveRollSummary from './components/EffectiveRollSummary.vue';
import GameIcon from './components/GameIcon.vue';
import StatusBadge from './components/StatusBadge.vue';
import { localConfigurationComplete as configurationReady } from './domain/account-configurations';
import DisclosureHeading from './components/DisclosureHeading.vue';
import EditorActions from './components/EditorActions.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';
import { useLibraryScroll } from './composables/use-library-scroll';
import { useUnsavedChanges } from './composables/use-unsaved-changes';
import { effectiveRollBreakdown, effectiveStatGroups, characterLoadoutName, configurationSignature } from './domain/character-loadout-name';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { hasLocalConfiguration, hasCharacterInformation, planClearedConfiguration } from './domain/account-configurations';
import { releaseMetadata, compareReleaseNewest } from './domain/catalog-release';
const EnkaImport = defineAsyncComponent(() => import('./EnkaImport.vue'));
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));
const monaImport=ref<InstanceType<typeof MonaImport>>();

const props = defineProps<{ page: 'characters' | 'artifacts'; pick?:boolean; selectedId?:string }>();
const emit = defineEmits<{ settings:[]; select:[id:string] }>();
const store = useAccountStore();
useLibraryScroll(()=>props.page,!props.pick);
const { account, error, notice } = storeToRefs(store);
const context = storeToRefs(store);
const characterId = context.selectedCharacterId;
const query = props.pick ? ref('') : context.characterQuery;
const elementFilter = props.pick ? ref<string[]>([]) : context.characterElement;
const weaponFilter = props.pick ? ref<string[]>([]) : context.characterWeapon;
const rarityFilter = props.pick ? ref<string[]>([]) : context.characterRarity;
const sort = props.pick ? ref('release') : context.characterSort;
const sortDirection = props.pick ? ref<'asc'|'desc'>('desc') : context.characterSortDirection;
const draftAccount = ref<LocalAccount>();
const editingAccount = computed(() => draftAccount.value ?? account.value);
const character = computed(() => editingAccount.value.characters.find(entry => entry.id === characterId.value));
const loadouts = useCharacterLoadoutsStore();
const inventoryBrowser=ref<InstanceType<typeof ArtifactBrowser>>();
const characterForm = ref<InstanceType<typeof CharacterForm>>();
const cultivationDirty = ref(false);
const formRevision = ref(0);
const detailError = ref('');
const detailNotice = ref('');
const detailBusy = ref(false);
const saveAsOpen = ref(false);
const configurationPickerOpen=ref(false);
const clearShowcaseOpen = ref(false);
const localViewTab = ref<HTMLButtonElement>();
const saveAsName = ref('');
const selectedPreset = ref('');
const editingPresetId = ref('');
const favoriteFilter=props.pick?ref<string[]>([]):context.characterFavoriteFilter;
watch(()=>account.value.id,()=>{favoriteFilter.value=[];});
const previewConfiguration = ref<AccountCharacter>();
let draftBaseline = '';
const pendingPreset = ref('');
const presetTransfers = ref<string[]>([]);
let baseSnapshot = '';
const detailDirty = computed(() => cultivationDirty.value || (!!draftAccount.value && JSON.stringify(draftAccount.value) !== draftBaseline));
const availableLoadouts = computed(() => loadouts.loadouts.filter(item => item.accountId === account.value.id && item.characterId === characterId.value));
const effectiveStats = computed(()=>loadouts.effectiveStats(account.value.id,characterId.value,character.value?.name));
const defaultCharacter = computed(()=>account.value.characters.find(item=>item.id===characterId.value));
const alternateLoadouts = computed(()=>availableLoadouts.value.filter(item=>!defaultCharacter.value || configurationSignature(item.snapshot.characters[0])!==configurationSignature(defaultCharacter.value)));
function configurationName(entry:AccountCharacter, source:LocalAccount) { return characterLoadoutName(entry,source,loadouts.effectiveStats(source.id,entry.id,entry.name),catalog.value?.sets ?? []); }
const draftName = computed(()=>character.value?configurationName(previewConfiguration.value ?? character.value,editingAccount.value):'');
function toggleEffectiveStat(stat:RealStat) {
  const values=effectiveStatGroups.filter(group=>effectiveStats.value.includes(group.stat)).map(group=>group.stat);
  setEffectiveChoices(values.includes(stat)?values.filter(value=>value!==stat):[...values,stat]);
}
function setEffectiveChoices(values:string|number|(string|number)[]) {
  if(!Array.isArray(values))return;
  try { loadouts.setEffectiveStats(account.value.id,characterId.value,effectiveStatGroups.filter(group=>values.includes(group.stat)).flatMap(group=>group.members)); }
  catch { detailError.value='有效属性选择未能保存，请检查本地存储。'; }
}
async function openSaveAs() {
  previewConfiguration.value=undefined;
  if(cultivationDirty.value) { const prepared=await characterForm.value?.prepare();if(!prepared)return;previewConfiguration.value=prepared; }
  saveAsOpen.value=true;
}
function restoreConfiguration() { const id=editingPresetId.value;resetDraft();if(id)tryPreset(id); }
function selectConfiguration(id:string) {
  if(id===editingPresetId.value)return;
  selectedPreset.value=editingPresetId.value;
  requestLeave(()=>{equipmentView.value='local';resetDraft();if(id)tryPreset(id);});
}
function resetDraft() {
  equipmentPickerOpen.value=false;
  baseSnapshot = JSON.stringify(account.value);
  draftAccount.value = cloneAccount(account.value);draftBaseline=JSON.stringify(draftAccount.value);editingPresetId.value='';previewConfiguration.value=undefined;
  cultivationDirty.value = false; formRevision.value++; pending.value = undefined; artifactId.value='';
  detailError.value = ''; detailNotice.value = ''; selectedPreset.value = ''; pendingPreset.value = '';
}
async function saveDetail(asPreset = false) {
  if (!draftAccount.value || !character.value || detailBusy.value) return;
  if (pending.value) { detailError.value='请先确认或取消装备转移，再保存。'; return; }
  const draft = draftAccount.value;
  detailBusy.value = true; detailError.value = '';
  try {
    if (JSON.stringify(account.value) !== baseSnapshot) throw new Error('账号资料已在其他操作中变化，请先核对并还原草稿后重试。');
    const next = cloneAccount(draft);
    let entry = next.characters.find(item => item.id === characterId.value)!;
    if (cultivationDirty.value) {
      const prepared = await characterForm.value?.prepare();
      if (!prepared) return;
      entry = prepared;
      next.characters[next.characters.findIndex(item => item.id === entry.id)] = entry;
    }
    if (draftAccount.value !== draft || !detailOpen.value || JSON.stringify(account.value) !== baseSnapshot) throw new Error('编辑对象已变化，未保存。');
    const valid = parseAccount(next);
    if(asPreset && !hasLocalConfiguration(entry))throw new Error('没有本地配置可另存。');
    if(!hasLocalConfiguration(entry) && !asPreset) {
      const plan=planClearedConfiguration(account.value,valid,loadouts.loadouts,entry.id,editingPresetId.value);
      loadouts.removeMany(plan.removedIds,()=>store.commitEdit(plan.next));
      if(plan.removedCharacter) {
        closeCharacter();characterId.value='';
        await nextTick();document.querySelector<HTMLInputElement>('[aria-label="搜索账号角色"]')?.focus();
      } else {resetDraft();detailNotice.value=plan.promotedId?'已清除当前配置，备选已接替首选。':'已清除当前配置。';}
      return;
    }
    if (asPreset || editingPresetId.value) {
      if(!effectiveStats.value.length)throw new Error('请选择用于命名的有效词条。');
      const name=configurationName(entry,valid);
      if(asPreset)editingPresetId.value=loadouts.save(name,valid,entry);
      else loadouts.update(editingPresetId.value,name,valid,entry);
      selectedPreset.value=editingPresetId.value;draftAccount.value=valid;draftBaseline=JSON.stringify(valid);cultivationDirty.value=false;formRevision.value++;
      saveAsOpen.value=false;previewConfiguration.value=undefined;detailNotice.value='已保存备选配装，首选和实际穿戴保持不变。';
    } else {
      store.commitEdit(valid); resetDraft(); detailNotice.value = '已保存首选配置，展柜快照保持不变。';
    }
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '保存失败，原配置保持不变。'; }
  finally { detailBusy.value = false; }
}
function tryPreset(id: string, confirmed = false) {
  if (!id || !draftAccount.value || !character.value) return;
  detailError.value = '';
  try {
    if (detailDirty.value) throw new Error('请先保存或还原当前修改，再载入其他方案。');
    const preset = availableLoadouts.value.find(item => item.id === id);
    if (!preset) throw new Error('配装方案不存在或不属于当前账号角色。');
    const entry = preset.snapshot.characters[0];
    for (const item of preset.snapshot.artifacts) {
      const current = draftAccount.value.artifacts.find(candidate => candidate.id === item.id);
      if (!current || JSON.stringify(current.real) !== JSON.stringify(item.real)) throw new Error('方案中的实物已缺失或词条发生变化，请先核对库存。');
    }
    const transfers = Object.values(entry.equipment).flatMap(artifact => { const owner = artifactOwner(draftAccount.value!, artifact!); const item = draftAccount.value!.artifacts.find(item=>item.id===artifact); return owner && owner.id !== entry.id ? [`从「${owner.name}」卸下「${item?.name ?? '圣遗物'}」并转移给「${entry.name}」`] : []; });
    presetTransfers.value = transfers;
    if (transfers.length && !confirmed) { pendingPreset.value = id; return; }
    const next = cloneAccount(draftAccount.value);
    const original = next.characters.find(item => item.id === entry.id)!;
    const snapshot = JSON.parse(JSON.stringify(entry)) as AccountCharacter;
    const equipment = { ...snapshot.equipment };
    snapshot.equipment = {}; snapshot.showcase = original.showcase;
    next.characters[next.characters.findIndex(item => item.id === snapshot.id)] = snapshot;
    for (const artifact of Object.values(equipment)) equipArtifact(next, snapshot.id, artifact!, confirmed);
    draftAccount.value = parseAccount(next);draftBaseline=JSON.stringify(draftAccount.value);editingPresetId.value=id;selectedPreset.value=id;formRevision.value++;cultivationDirty.value=false;
    pendingPreset.value = ''; detailNotice.value = '正在查看备选配装；保存只更新此方案，设为首选才改变实际穿戴。';
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '方案未载入。'; selectedPreset.value = ''; }
}
const artifactId = ref('');
const equipmentSlot = ref<AccountSlot>('flower');
const equipmentPickerOpen=ref(false);
const equipmentBrowser=ref<InstanceType<typeof ArtifactBrowser>>();
function closeEquipmentPicker() { if(equipmentBrowser.value)equipmentBrowser.value.requestLeave(()=>equipmentPickerOpen.value=false);else equipmentPickerOpen.value=false; }
function openEquipmentPicker(slot:AccountSlot) { equipmentSlot.value=slot;equipmentPickerOpen.value=true; }
function unequipCurrentSlot() { if(character.value)delete character.value.equipment[equipmentSlot.value];equipmentPickerOpen.value=false; }
const editingCharacter = ref(false);
const detailOpen = ref(false);
const {discardOpen,requestLeave:protectDraft,cancelDiscard,discardChanges}=useUnsavedChanges(computed(()=>detailOpen.value && detailDirty.value));
const panelOpen=ref(false);
function requestLeave(action: ()=>void) {
  if(detailOpen.value)protectDraft(action);
  else if(inventoryBrowser.value)inventoryBrowser.value.requestLeave(action);
  else action();
}
function guardPreferred(action:()=>void) {
  const id=editingPresetId.value;
  requestLeave(()=>{if(detailDirty.value){resetDraft();if(id)tryPreset(id,true);}action();});
}
function requestCloseCharacter() { requestLeave(closeCharacter); }
const clearTarget = ref<'local'|'showcase'>('local');
function requestClearShowcase() {
  const target=equipmentView.value;
  const open=()=>{ if(target==='showcase' && editingPresetId.value){resetDraft();equipmentView.value='showcase';}clearTarget.value=target;clearShowcaseOpen.value=true; };
  if(target==='showcase' && editingPresetId.value)requestLeave(open);else open();
}
const clearPreview=computed(()=>{
  if(!clearShowcaseOpen.value || !draftAccount.value || !character.value)return undefined;
  const next=cloneAccount(draftAccount.value),entry=next.characters.find(item=>item.id===character.value!.id)!;
  if(clearTarget.value==='local'){delete entry.realBuild;entry.attack=0;entry.weapon='';entry.equipment={};}else delete entry.showcase;
  if(hasLocalConfiguration(entry))return undefined;
  try{return planClearedConfiguration(account.value,next,loadouts.loadouts,entry.id,editingPresetId.value);}catch{return undefined;}
});
function clearShowcase() {
  if (!character.value)return;
  if(clearTarget.value==='showcase')delete character.value.showcase;
  else {
    delete character.value.realBuild;character.value.attack=0;character.value.weapon='';character.value.equipment={};
    cultivationDirty.value=false;formRevision.value++;
  }
  equipmentView.value='local';clearShowcaseOpen.value=false;nextTick(()=>localViewTab.value?.focus());
  detailNotice.value=clearTarget.value==='showcase'?'展柜已清除，保存后生效。':'本地配装已清除，保存后生效。';
}
defineExpose({ requestLeave, openConfiguration });
function openCharacter(id:string) { equipmentView.value='local'; characterId.value=id; resetDraft(); detailOpen.value=true;panelOpen.value=false; }
function closeCharacter() { configurationPickerOpen.value=false;cancelDiscard();clearShowcaseOpen.value=false;draftAccount.value=undefined; cultivationDirty.value=false; saveAsOpen.value=false; pendingPreset.value=''; detailOpen.value=false; pending.value=undefined; }
watch([()=>account.value.id,()=>props.page],()=>{closeCharacter();modal.value='';});
const modal = ref<'import' | 'create' | 'equipment' | 'notes' | 'artifact' | 'repair' | 'network' | 'filters' | 'sort' | ''>('');
const repairPreview = ref<MonaImportPreview>();
const checkingSets = ref(false);
async function inspectSets() {
  if (checkingSets.value) return;
  checkingSets.value = true;
  const owner = account.value;
  try { const data = await loadAccountGameData(); const preview = await previewMonaSetRepairs(owner, data.catalog.sets); if (owner !== account.value) return; repairPreview.value = preview; modal.value = 'repair'; }
  catch (cause) { error.value = String(cause); } finally { checkingSets.value = false; }
}
function repairSets() {
  if (!repairPreview.value) return;
  try { confirmMonaImport(account.value, repairPreview.value, true); notice.value = `已补全 ${repairPreview.value.updates.length} 件圣遗物的套装身份，词条和装备归属不变。`; modal.value = ''; }
  catch (cause) { error.value = String(cause); }
}
const noteNames = computed(() => [...new Set(account.value.artifacts.flatMap(item => item.mona?.equippedBy ? [item.mona.equippedBy] : []))]);
function organizeNotes() {
  try { const result = organizeMonaWearNotes(account.value); query.value = ''; resetFilters(); notice.value = `已根据原始穿戴备注新增 ${result.added} 位待补全角色。${result.conflicts.join('；')}请设置角色与武器，等级和天赋按用户指定的满级设定核对。`; modal.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '整理失败，现有资料保持不变。'; }
}
const catalog = shallowRef<RealCatalog>();
onMounted(async () => { try { catalog.value = (await loadAccountGameData()).catalog; } catch { error.value = '目录加载失败，角色资料仍保留。'; } });
const weapons = [{id:'WEAPON_SWORD_ONE_HAND',name:'单手剑',icon:'dullblade'},{id:'WEAPON_CLAYMORE',name:'双手剑',icon:'wastergreatsword'},{id:'WEAPON_POLE',name:'长柄武器',icon:'beginnersprotector'},{id:'WEAPON_BOW',name:'弓',icon:'huntersbow'},{id:'WEAPON_CATALYST',name:'法器',icon:'apprenticesnotes'}];
const sortOptions = [{value:'favorite',label:'收藏等级'},{value:'release',label:'实装版本'},{value:'name',label:'名称'},{value:'level',label:'等级'},{value:'constellation',label:'命座'},{value:'rolls',label:'有效词条数'}];
function setSortKey(key:string) { if(sort.value!==key){sort.value=key;sortDirection.value=key==='name'?'asc':'desc';} }
const metadata = (entry: typeof account.value.characters[number]) => entry.realBuild?.character ?? catalog.value?.characters.find(item => item.name === entry.name);
const characterRelease = (entry: typeof account.value.characters[number]) => releaseMetadata('characters',entry.realBuild?.character.id,entry.name);
function roleRolls(entry:AccountCharacter) {
  const stats=loadouts.effectiveStats(account.value.id,entry.id,entry.name);
  const items=account.value.artifacts.filter(item=>Object.values(entry.equipment).includes(item.id));
  return effectiveRollBreakdown(items).filter(group=>group.members.some(stat=>stats.includes(stat))).reduce((sum,row)=>sum+(row.value ?? 0),0);
}
const visibleCharacters = computed(() => {
  const items = account.value.characters.filter(entry => {
    const meta=metadata(entry);
    if(!hasCharacterInformation(entry) && !loadouts.loadouts.some(item=>item.accountId===account.value.id && item.characterId===entry.id && hasLocalConfiguration(item.snapshot.characters[0])))return false;
    return (!favoriteFilter.value.length || favoriteFilter.value.includes(String(loadouts.favoriteLevel(account.value.id,entry.id)))) && entry.name.includes(query.value.trim()) && (!elementFilter.value.length || (meta && elementFilter.value.includes(meta.element)))
      && (!rarityFilter.value.length || rarityFilter.value.includes(String(characterRelease(entry)?.rarity)))
      && (!weaponFilter.value.length || (meta && weaponFilter.value.includes(meta.weaponType)));
  });
  return items.sort((a,b) => (sortDirection.value==='desc'?1:-1)*(sort.value==='favorite' ? loadouts.favoriteLevel(account.value.id,b.id)-loadouts.favoriteLevel(account.value.id,a.id) : sort.value==='release' ? compareReleaseNewest(characterRelease(a),characterRelease(b)) : sort.value==='level' ? (b.realBuild?.level??-1)-(a.realBuild?.level??-1) : sort.value==='constellation' ? (b.realBuild?.constellation??-1)-(a.realBuild?.constellation??-1) : sort.value==='rolls' ? roleRolls(b)-roleRolls(a) : sort.value==='name'?b.name.localeCompare(a.name,'zh-CN'):0) || a.name.localeCompare(b.name,'zh-CN'));
});
const galleryEntries = computed(()=>visibleCharacters.value.map(entry=>({...entry,presetId:'',galleryKey:entry.id,gallerySnapshot:account.value})));
function openGallery(entry:{id:string;presetId:string}) { if(props.pick){emit('select',entry.id);return;}openCharacter(entry.id);if(entry.presetId)tryPreset(entry.presetId); }
const activeFilters = computed(() => elementFilter.value.length + weaponFilter.value.length + rarityFilter.value.length + favoriteFilter.value.length);
function toggleFilter(selected: string[], id: string) { const index = selected.indexOf(id); if (index < 0) selected.push(id); else selected.splice(index, 1); }
function handleEmptyAction() { if(account.value.characters.length){query.value='';resetFilters();}else{editingCharacter.value=false;modal.value='create';} }
function resetFilters() { elementFilter.value=[]; weaponFilter.value=[]; rarityFilter.value=[]; favoriteFilter.value=[]; }
const filterGroups = computed(() => [
  { id:'elements', title:'元素', options:elementPalette.map(item => ({id:item.id,name:item.name,icon:item.id})), selected:elementFilter.value },
  { id:'favorite', title:'收藏', options:[{id:'0',name:'未收藏'},{id:'1',name:'1级收藏'},{id:'2',name:'2级收藏'},{id:'3',name:'3级收藏'}], selected:favoriteFilter.value },
  { id:'rarity', title:'星级', options:[{id:'4',name:'四星'},{id:'5',name:'五星'}], selected:rarityFilter.value },
  { id:'weapons', title:'武器类型', options:weapons, selected:weaponFilter.value },
]);
const equipmentView=ref<'local'|'showcase'>('local');
watch(()=>character.value?.id,() => { equipmentView.value='local'; },{immediate:true});
function showImportedCharacter(id:string) { query.value='';resetFilters();modal.value='';openCharacter(id); }
function equipmentItem(slot:AccountSlot) { return equipmentView.value==='showcase'&&character.value?showcaseArtifact(character.value,slot):editingAccount.value.artifacts.find(item=>item.id===character.value?.equipment[slot]); }

function localConfigurationComplete(entry:AccountCharacter) { return configurationReady(account.value,entry); }
async function openConfiguration(id:string,presetId='') {
  const source=account.value,entry=source.characters.find(item=>item.id===id);if(!entry)return;
  query.value=entry.name;resetFilters();await nextTick();if(account.value!==source)return;
  [...document.querySelectorAll<HTMLButtonElement>('.character-cards > button')].find(button=>button.getAttribute('aria-label')===`查看${entry.name}详情`)?.focus();
  openCharacter(id);if(presetId)tryPreset(presetId);
}
function chooseConfiguration(_characterId:string,presetId:string) { configurationPickerOpen.value=false;selectConfiguration(presetId); }

function cardArtifacts(entry: AccountCharacter, context:LocalAccount=account.value) {
  // Never mix local physical items with the independent public showcase snapshot.
  return Object.keys(entry.equipment).length
    ? context.artifacts.filter(item => Object.values(entry.equipment).includes(item.id))
    : accountSlots.flatMap(slot => { const item = showcaseArtifact(entry, slot); return item ? [item] : []; });
}

const pending = ref<{ accountId: string; characterId: string; artifactId: string; message: string }>();
function equip() {
  if (!character.value || !artifactId.value) { error.value = '请选择角色和圣遗物。'; return; }
  const owner = artifactOwner(editingAccount.value, artifactId.value);
  const item = editingAccount.value.artifacts.find(entry => entry.id === artifactId.value)!;
  if (owner && owner.id !== character.value.id) {
    pending.value = { accountId: account.value.id, characterId: character.value.id, artifactId: item.id, message: `将「${item.name}」从「${owner.name}」卸下并转移给「${character.value.name}」，替换目标角色同部位装备（原装备保留在库存）。` };
  } else equipArtifact(editingAccount.value, character.value.id, item.id);
}
function confirmTransfer() {
  if (!pending.value) return;
  if (pending.value.accountId !== account.value.id) { pending.value = undefined; return; }
  try { equipArtifact(editingAccount.value, pending.value.characterId, pending.value.artifactId, true); } catch (cause) { error.value = String(cause); pending.value = undefined; return; }
  pending.value = undefined;
  detailNotice.value = '转移已加入草稿，保存后才生效，原装备仍保留在库存。';
}
</script>

<template>
  <section class="account-library panel" :class="{'pick-mode':props.pick}">

    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>

    <template v-if="page === 'characters'">
      <LibraryToolbar v-model="query" label="搜索账号角色" placeholder="查找角色" :filter-count="activeFilters" :sorted="sort!=='release' || sortDirection!=='desc'" @filter="modal='filters'" @sort="modal='sort'"><template v-if="!props.pick" #actions><LibraryImportActions showcase @mona="modal='import'" @showcase="modal='network'" @create="editingCharacter=false;modal='create'" /></template></LibraryToolbar>
      <div class="character-shortcut-row"><LibraryShortcuts v-model="elementFilter" label="按元素筛选" all-label="全部" kind="elements" :mobile-columns="4" :options="elementPalette.map(element=>({value:element.id,label:element.name,light:element.light,deep:element.deep}))" /><button v-if="activeFilters" class="reset-filters" @click="resetFilters">清除筛选</button></div>
      <WorkbenchDialog v-if="modal === 'filters'" title="筛选角色" size="filter" @close="modal = ''"><div class="character-filter-panel">
        <section v-for="group in filterGroups" :key="group.id" :aria-label="group.title"><h3>{{ group.title }}</h3><div class="filter-options">
          <button :aria-pressed="!group.selected.length" :class="{selected:!group.selected.length}" @click="group.selected.splice(0)">全部</button>
          <button v-for="item in group.options" :key="item.id" :aria-pressed="group.selected.includes(item.id)" :class="{selected:group.selected.includes(item.id)}" @click="toggleFilter(group.selected,item.id)"><GameIcon v-if="group.id==='elements'" kind="elements" :id="item.id" :size="24" /><GameIcon v-else-if="group.id==='weapons'" kind="weapons" :id="'icon' in item ? String(item.icon) : undefined" :size="24" /><svg v-else-if="group.id==='favorite' || group.id==='rarity'" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>{{ item.name }}</button>
        </div></section>
        <FilterActions @reset="resetFilters" @confirm="modal=''" />
      </div></WorkbenchDialog>
      <WorkbenchDialog v-if="modal === 'sort'" title="角色排序" size="filter" @close="modal = ''"><SortPanel :model-value="sort" v-model:direction="sortDirection" :options="sortOptions" @update:model-value="setSortKey" @reset="sort='release';sortDirection='desc'" @confirm="modal=''" /></WorkbenchDialog>

      <WorkbenchDialog v-if="modal === 'notes'" title="从穿戴备注整理角色" @close="modal = ''"><p>文件中有 {{ noteNames.length }} 个角色穿戴备注：{{ noteNames.join('、') }}。</p><p>仅新增尚不存在的角色资料，并按没有冲突的原始备注登记装备。已有角色与装备不覆盖；武器、命座、等级和天赋不来自此文件，角色需继续补全后才能计算。</p><button @click="organizeNotes">确认按备注整理</button></WorkbenchDialog>
      <div class="character-cards">
        <button v-for="entry in galleryEntries" :key="entry.galleryKey" class="character-card" :class="{ selected:props.pick ? props.selectedId===entry.id : characterId === entry.id && editingPresetId===entry.presetId }" :aria-label="props.pick ? `选择${entry.name}` : entry.presetId ? `查看${entry.name}备选配装${configurationName(entry,entry.gallerySnapshot)}详情` : `查看${entry.name}详情`" @click="openGallery(entry)">
          <span class="character-card-header">
            <span class="character-card-status">
              <StatusBadge :label="localConfigurationComplete(entry) ? '就绪' : '缺失'" :state="localConfigurationComplete(entry) ? 'complete' : 'missing'" :description="localConfigurationComplete(entry) ? '培养资料与五个部位的本地实物配置齐全' : '本地培养资料或五个部位的实物配置尚未齐全'" :accessible-name="`本地配置${localConfigurationComplete(entry) ? '就绪' : '缺失'}`" />
              <StatusBadge v-if="entry.showcase" label="展柜" tone="electro" state="complete" description="有独立展柜快照" accessible-name="有展柜信息" />
            </span>
            <strong>{{ entry.name }}</strong>
            <span class="character-card-trailing"><span v-if="loadouts.favoriteLevel(account.id,entry.id)" class="card-favorite" :aria-label="`${loadouts.favoriteLevel(account.id,entry.id)}级收藏`"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>{{ loadouts.favoriteLevel(account.id,entry.id) }}</span><svg class="character-card-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v14h14v-3M13 5h6v6m0-6-9 9"/></svg></span>
          </span>
          <CharacterCardPortraits :build="entry.realBuild" :name="entry.name" :artifacts="cardArtifacts(entry,entry.gallerySnapshot)" />
        </button>
      </div>
      <LibraryEmptyState v-if="!visibleCharacters.length" :title="account.characters.length?'没有符合条件的角色':'角色库还是空的'" :description="account.characters.length?'清除搜索与筛选后重试。':'导入角色资料，或手动添加角色。'" :action="account.characters.length?'清除搜索与筛选':'手动添加角色'" @action="handleEmptyAction" />
      <WorkbenchDialog v-if="modal === 'create'" :title="editingCharacter ? '编辑角色资料' : '添加账号角色'" @close="modal = ''"><CharacterForm :character="editingCharacter ? character : undefined" @saved="openCharacter($event)" @close="modal = ''" /></WorkbenchDialog>
      <WorkbenchDialog editor class="character-detail-dialog" v-if="detailOpen && character" :title="character.name" @close="requestCloseCharacter">
      <template #title><h2 class="configuration-title">{{ character.name }}</h2></template>
      <template #header-trailing><CharacterFavorite :account-id="account.id" :character-id="character.id" :name="character.name" /><button class="configuration-title-button" :aria-label="`选择${character.name}配置`" title="切换当前角色的配置" @click="configurationPickerOpen=true"><span>{{ draftName.split(' · ').slice(1).join('|') }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></template>
      <template #header-leading><div class="character-header-tools"><div class="equipment-view-tabs" role="group" aria-label="角色资料来源"><button ref="localViewTab" data-view="local" :aria-pressed="equipmentView==='local'" :class="{active:equipmentView==='local'}" @click="equipmentView = 'local'">本地</button><button v-if="character.showcase" data-view="showcase" :aria-pressed="equipmentView==='showcase'" :class="{active:equipmentView==='showcase'}" @click="equipmentView = 'showcase'">展柜</button></div><EditorActions v-if="equipmentView==='local'" :dirty="detailDirty" :busy="detailBusy" allow-save-as @save="saveDetail()" @save-as="openSaveAs" @restore="restoreConfiguration" /><button class="clear-showcase ui-action soft" data-accent="pyro" @click="requestClearShowcase">删除</button></div></template>
      <div class="account-editor">
        <p v-if="detailError || loadouts.error" role="alert">{{ detailError || loadouts.error }}</p><p v-if="detailNotice" class="detail-feedback" role="status">{{ detailNotice }}</p>

        <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}</div>

        <CharacterForm ref="characterForm" v-show="equipmentView==='local'" details detached :key="`${character.id}-${formRevision}`" :character="character" @dirty-change="cultivationDirty=$event" />
        <CharacterForm v-if="equipmentView==='showcase'" details :character="character" showcase />
        <section class="detail-panel"><DisclosureHeading class="inline-section-heading" title="角色面板" label="面板" controls="character-stat-panel" :expanded="panelOpen" @toggle="panelOpen = !panelOpen" /><div id="character-stat-panel"><p v-if="panelOpen && cultivationDirty && equipmentView==='local'" class="detail-feedback">培养数值尚未保存，保存后更新面板。</p><CharacterStats v-else-if="panelOpen" :account="editingAccount" :character="character" :showcase="equipmentView === 'showcase'" /></div></section>
        <section class="detail-artifacts"><div class="inline-section-heading"><h3>圣遗物</h3></div>
        <ArtifactEquipmentGrid :entries="accountSlots.map(slot=>({slot,item:equipmentItem(slot)}))" :account="editingAccount" :readonly="equipmentView==='showcase'" :effective-stats="effectiveStats" popup :wearers="equipmentView==='showcase' ? [{name:character.name,id:character.realBuild?.character.id,label:'展柜快照'}] : undefined" @change="openEquipmentPicker" />
        </section>
        <section class="effective-stat-picker" role="group" aria-label="有效词条"><h3>有效词条</h3><EffectiveRollSummary :items="accountSlots.flatMap(slot=>{const item=equipmentItem(slot);return item?[item]:[];})" :selected-stats="effectiveStats" selectable @toggle="toggleEffectiveStat" /></section>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
      </div>
      </WorkbenchDialog>
      <WorkbenchDialog v-if="equipmentPickerOpen && character && equipmentView==='local'" :title="`选择${accountSlotLabels[equipmentSlot]}`" @close="closeEquipmentPicker"><template #header-leading><button v-if="character.equipment[equipmentSlot]" class="ui-action soft" data-accent="pyro" data-size="md" @click="unequipCurrentSlot">卸下</button></template><ArtifactBrowser ref="equipmentBrowser" :effective-stats="effectiveStats" inline pick :account="editingAccount" density="relaxed" :slot="equipmentSlot" :compare-to="equipmentItem(equipmentSlot)" @select="artifactId=$event.id;equip();equipmentPickerOpen=false" /></WorkbenchDialog>
      <WorkbenchDialog v-if="configurationPickerOpen && character" :title="`${character.name}的配置`" @close="configurationPickerOpen=false"><p v-if="detailDirty" class="detail-feedback">切换前会确认未保存的修改。</p><CharacterConfigurationList :character-id="character.id" selectable :current-preset-id="editingPresetId"  :before-adopt="guardPreferred" @adopted="resetDraft();configurationPickerOpen=false" @select="chooseConfiguration" /></WorkbenchDialog>

      <ConfirmationDialog v-if="discardOpen" title="放弃未保存的修改？" confirm-label="放弃修改并退出" cancel-label="继续编辑" @cancel="cancelDiscard" @confirm="discardChanges"><p>退出将丢弃未保存的修改。</p></ConfirmationDialog>
      <ConfirmationDialog v-if="clearShowcaseOpen" :title="clearTarget==='local'?'清除本地配装？':'清除展柜信息？'" confirm-label="确认清除" @cancel="clearShowcaseOpen=false" @confirm="clearShowcase"><p>{{ clearTarget==='local'?'清除本地培养与穿戴，圣遗物保留在库存。':'清除该角色的展柜信息。' }}</p><p v-if="clearPreview?.promotedId">保存后由下一套备选接替首选。</p><p v-if="clearPreview?.removedCharacter">已无其他配置及展柜，保存后移除角色。</p><p v-for="message in clearPreview?.transfers ?? []" :key="message">{{ message }}</p><p>保存后生效。</p></ConfirmationDialog>
      <WorkbenchDialog v-if="saveAsOpen" title="另存角色配装方案" @close="saveAsOpen=false"><label>方案名称<input :value="draftName" aria-label="配装方案名称" readonly></label><p>按角色、有效平均词条数、套装和武器自动命名；首选配置和实际穿戴不变。</p><p v-if="!effectiveStats.length" role="alert">请先在详情中选择有效属性。</p><p v-if="detailError" role="alert">{{ detailError }}</p><button class="ui-action" data-accent="anemo" :disabled="detailBusy || !effectiveStats.length" @click="saveDetail(true)">确认另存</button></WorkbenchDialog>
      <WorkbenchDialog v-if="pendingPreset" title="确认试用配装方案" @close="pendingPreset=''; selectedPreset=''"><p v-for="message in presetTransfers" :key="message">{{ message }}</p><p>试用只修改草稿，保存时才转移实际穿戴，原装备保留在库存。</p><button @click="tryPreset(pendingPreset,true)">确认试用方案</button></WorkbenchDialog>
    </template>
    <template v-else>

      <WorkbenchDialog v-if="modal === 'repair' && repairPreview" title="核对已导入套装" @close="modal = ''"><p>根据莫娜 7.2.02 核实套装身份，仅补全未经手动修改的物品，不改变词条或穿戴关系。</p><p v-for="update in repairPreview.updates" :key="update.item.id">{{ update.item.mona?.sourceSetName }} → {{ update.item.name }}</p><p v-for="message in repairPreview.skipped" :key="message">{{ message }}</p><p v-if="!repairPreview.updates.length">没有可以直接补全的物品。</p><button :disabled="!repairPreview.updates.length" @click="repairSets">确认补全 {{ repairPreview.updates.length }} 件套装身份</button></WorkbenchDialog>
      <ArtifactBrowser ref="inventoryBrowser"><template #actions><LibraryImportActions create-label="手动添加圣遗物" @mona="modal='import'" @create="modal='artifact'" /><button v-if="account.artifacts.some(item => item.mona?.setIdentityPending)" class="ui-muted-button" :disabled="checkingSets" @click="inspectSets">核对已导入套装</button></template></ArtifactBrowser>

      <WorkbenchDialog v-if="modal === 'artifact'" title="手动添加圣遗物" @close="modal = ''"><ArtifactForm @close="modal = ''" /></WorkbenchDialog>
    </template>
    <WorkbenchDialog v-if="modal === 'network'" title="从 Enka 展柜导入" @close="modal = ''"><EnkaImport @imported="showImportedCharacter" @close="modal = ''" /></WorkbenchDialog>
    <WorkbenchDialog v-if="modal === 'import'" :title="props.page==='characters' ? '从莫娜 JSON 添加角色' : '导入莫娜圣遗物'" sticky-footer @close="modal = ''"><MonaImport ref="monaImport" automatic @imported="modal = props.page==='characters' && noteNames.length ? 'notes' : ''" /><div v-if="props.page==='characters' && noteNames.length" class="existing-note-import"><p>库存有 {{ noteNames.length }} 个穿戴备注，可用于添加角色。</p><button class="ui-action soft" data-accent="electro" @click="modal = 'notes'">从穿戴备注整理角色</button></div><template #footer><div class="mona-import-footer"><button class="ui-action soft" :aria-label="monaImport?.hasPreview?'取消导入':'取消'" @click="modal=''">取消</button><button v-if="monaImport?.hasPreview" class="ui-action" :disabled="!monaImport.canConfirm" :aria-label="monaImport.confirmLabel" @click="monaImport.confirm()">{{ monaImport.confirmText }}</button></div></template></WorkbenchDialog>
  </section>
</template>

<style scoped>
.account-library .character-detail-dialog { overflow-y:auto; scrollbar-gutter:stable both-edges; width:min(var(--dialog-width-editor),calc(100vw - 32px)); }
.inline-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:16px 0; }.inline-section-heading h3 { margin:0; }
.character-card-header { position:relative; display:grid; grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); align-items:center; gap:8px; width:100%; }.character-card-header > strong { grid-column:2; grid-row:1; text-align:center; }.character-card-status { grid-column:1; grid-row:1; justify-self:start; }.character-card-header > strong { font-size:var(--font-control); line-height:22px; }.character-card-status { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; width:88px; }.character-card-open { grid-column:3; grid-row:1; justify-self:end; width:16px; height:16px; fill:none; stroke:var(--muted); stroke-width:1.6; }
.detail-panel { margin-top:16px; }.detail-panel :deep(.character-stats) { margin:0; padding:12px; border:1px solid var(--line); border-radius:10px; }.detail-panel :deep(.character-stats h3) { display:none; }.detail-artifacts { margin-top:18px; }
.character-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,312px),1fr)); justify-content:center; gap:12px; margin:0; }
.character-cards .character-card { container-type:inline-size; width:100%; max-width:360px; justify-self:center; display:flex; flex-direction:column; align-items:flex-start; gap:6px; min-width:0; padding:10px 7px 12px; color:var(--ink); text-align:left; border:1px solid var(--line); border-radius:16px; background:var(--surface-raised); box-shadow:0 2px 8px color-mix(in srgb,var(--neutral-ink) 1.96%,transparent); transition:border-color .15s,box-shadow .15s,transform .15s; }
.character-cards .character-card:hover { transform:translateY(-2px); border-color:var(--element-anemo-primary); box-shadow:0 8px 24px color-mix(in srgb,var(--neutral-ink) 6.27%,transparent); }




@media(prefers-reduced-motion:reduce){.character-cards .character-card { transition:none; }.character-cards .character-card:hover { transform:none; }}
@media(max-width:550px){.character-cards { grid-template-columns:minmax(0,1fr); }.character-cards .character-card { padding:10px 7px 12px; }}

.account-empty { padding:40px 20px; border:1px dashed var(--line); border-radius:12px; text-align:center; }.legacy-inventory { margin-top:24px; }.account-library { margin: 0 30px; color: var(--text, var(--ink)); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size:var(--font-body); line-height: 1.8; }
label { font-size:var(--font-body); display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }


.account-copy { border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 12px; }
.account-note { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:0 0 16px; }.account-note strong { font-size:var(--font-body); }.account-note span { color:var(--muted); }.account-error { color: var(--element-pyro-deep); }.transfer-confirm { border: 1px solid var(--element-geo-primary); padding: 16px; }.transfer-confirm button { margin-right: 12px; }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size:var(--font-body); overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
.account-editor { display:block; margin:0; }h2 { margin:0; font-size:var(--font-dialog); }h3 { font-size:var(--font-body); margin:0 0 14px; }.account-library { margin-inline:0; }
@media(max-width:800px) {  }
h2 { margin-top:7px; }.account-note { padding-bottom:16px; border-bottom:1px solid var(--line); }
.account-toolbar > button:last-child:not(:first-child) { background:var(--surface); color:var(--muted); border-color:var(--line); }.account-library > [role=status] { color:var(--neutral-muted); font-size:var(--font-body); padding:8px 12px; background:var(--element-dendro-light); border-radius:8px; margin-top:0; }
.account-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:32px; margin-bottom:18px; }.account-heading-info { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }.account-name { display:flex; align-items:center; gap:8px; padding:0; border:0; min-height:var(--control-height-md); color:var(--ink); background:transparent; font-size:var(--font-body); font-weight:600; }.account-name svg { width:18px; height:18px; stroke:var(--muted); stroke-width:1.6; fill:none; }.account-count { display:flex; align-items:center; gap:10px; font-size:var(--font-body); color:var(--muted); }.account-count > span { opacity:.5; }.account-feedback { position:relative; flex-shrink:0; font-size:var(--font-body); }.account-feedback > summary,.local-status { display:flex; align-items:center; gap:6px; color:var(--element-anemo-deep); cursor:pointer; list-style:none; font-size:var(--font-body); }.account-feedback summary::-webkit-details-marker { display:none; }.account-feedback summary > span { margin-left:5px; color:var(--muted); font-size:var(--font-body); }.account-feedback i,.local-status i { width:6px; height:6px; border-radius:50%; background:var(--element-anemo-primary); }.account-feedback > div { position:absolute; top:28px; right:0; width:min(320px,70vw); padding:14px; background:var(--surface-raised); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px color-mix(in srgb,var(--neutral-ink) 7.84%,transparent); z-index:5; }.account-feedback p { margin:0 0 10px; }.account-feedback button { font-size:var(--font-body); padding:6px 8px; margin-right:8px; }.character-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }.character-search { position:relative; flex:1; min-width:170px; max-width:320px; }.character-search > svg { position:absolute; width:16px; height:16px; top:12px; left:12px; stroke:var(--muted); stroke-width:1.6; fill:none; }.character-search input { height:40px; min-width:0; padding:0 12px 0 36px; background:var(--surface-raised); border-color:var(--line); font-size:var(--font-body); }.filter-trigger { height:40px; font-size:var(--font-body); padding:8px 12px; }.filter-trigger.applied { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.filter-trigger > span { padding-left:6px; }.character-import-actions { margin-left:auto; display:flex; gap:8px; }.reset-filters { padding:0; border:0; background:none; color:inherit; font-size:var(--font-body); min-height:var(--control-height-md); }.reset-filters { padding:3px 7px; color:var(--muted); }.filter-options { display:flex; flex-wrap:wrap; gap:8px; }.filter-options button { height:var(--control-height-lg); padding:0 12px; --filter-light:var(--element-anemo-light); --filter-deep:var(--element-anemo-deep); color:var(--muted); background:var(--surface); border-color:var(--line); padding:9px 15px; font-size:var(--font-body); }.filter-options button.selected { background:var(--filter-light); color:var(--filter-deep); border-color:var(--filter-deep); }.filter-panel-actions { display:flex; justify-content:space-between; margin-top:24px; }.existing-note-import { border-top:1px solid var(--line); margin-top:16px; padding-top:12px; }.equipment-view-tabs { display:flex; gap:8px; align-items:center; margin-top:16px; }.equipment-view-tabs button { color:var(--muted); background:var(--surface); border-color:var(--line); padding:7px 12px; font-size:var(--font-body); }.equipment-view-tabs button.active { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }.equipment-view-tabs span { color:var(--muted); font-size:var(--font-body); }.snapshot-note { color:var(--element-hydro-deep); }
@media(max-width:900px){}@media(max-width:620px){}
@media(max-width:1000px){.character-import-actions { width:100%; margin-left:0; }.character-search { max-width:none; }}@media(max-width:550px){.account-heading { align-items:flex-start; }.account-heading-info { gap:3px; flex-direction:column; align-items:flex-start; }.account-feedback > summary > span { display:none; }.character-import-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }.character-import-actions .ui-action { padding:8px 6px; font-size:var(--font-body); gap:5px; }.character-import-actions svg { width:14px; height:14px; }.equipment-view-tabs { flex-wrap:wrap; }}
.element-shortcuts { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:10px 0 14px; }
.element-shortcuts > button { display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:4px 8px; height:var(--control-height-md); min-height:var(--control-height-md); border:1px solid transparent; border-radius:6px; background:transparent; color:var(--muted); font-size:var(--font-body); }
.element-shortcuts > button[aria-pressed=true] { background:var(--filter-light,var(--element-anemo-light)); color:var(--filter-deep,var(--element-anemo-deep)); border-color:currentColor; }
.filter-options button { display:inline-flex; align-items:center; gap:6px; }

@media(max-width:550px) { .element-shortcuts { gap:4px; }.element-shortcuts > button { padding:4px 6px; } }




.character-detail-dialog .equipment-view-tabs { grid-column:1; grid-row:1; justify-content:flex-start; margin:0; gap:8px; }
.character-detail-dialog .equipment-view-tabs button { height:32px; min-height:32px; font-size:var(--font-body); padding:5px 8px; }
.character-detail-dialog .equipment-view-tabs button[data-view=local] { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }
.character-detail-dialog .equipment-view-tabs button[data-view=showcase] { color:var(--element-electro-deep); background:var(--element-electro-light); border-color:var(--element-electro-primary); }
.character-detail-dialog .detail-panel,.character-detail-dialog .detail-artifacts { padding:0; background:transparent; margin-top:14px; }.character-detail-dialog .inline-section-heading { margin:8px 0 12px; padding-bottom:10px; border-bottom:1px solid var(--line); }
.character-detail-dialog .inline-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; text-align:left; }.character-detail-dialog .inline-section-heading h3 { margin:0; font-size:var(--font-control); font-weight:700; text-align:left; }
.character-detail-dialog .inline-section-heading button { font-size:var(--font-control); }

@media(max-width:550px) { .character-detail-dialog .equipment-view-tabs { grid-column:1/-1; grid-row:2; }.character-card-header { grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); } }
@media(max-width:400px) { .character-card-header { grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); } }
@container(max-width:295.99px) { .character-card-header { grid-template-columns:88px minmax(0,1fr) 88px; } }

.character-header-tools .equipment-view-tabs { grid-column:auto; grid-row:auto; display:flex; align-items:center; gap:4px; }.character-header-tools { display:flex; align-items:center; gap:8px; min-width:0; white-space:nowrap; }.detail-feedback { color:var(--element-anemo-deep); font-size:var(--font-body); margin-bottom:8px; }
.equipment-view-tabs button.active { outline:1px solid currentColor; outline-offset:1px; }.confirmation-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
@media(max-width:550px) { .character-header-tools { grid-column:1/-1; grid-row:2; justify-content:flex-start; } }

.character-header-tools .clear-showcase { height:32px; min-height:32px; padding:5px 8px; font-size:var(--font-body); }
@media(max-width:400px) { .character-header-tools { gap:5px; } }
.configuration-title { display:flex; align-items:center; min-width:0; max-width:100%; gap:6px; }
.effective-stat-picker { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); }.effective-stat-picker h3 { margin-bottom:10px; font-size:var(--font-control); }.effective-stat-picker > div { display:flex; flex-wrap:wrap; gap:8px; }
.configuration-title-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:0; max-width:280px; height:var(--control-height-md); min-height:var(--control-height-md); padding:0 4px; border:0; background:transparent; color:var(--ink); font-size:var(--font-dialog); font-weight:700; }.configuration-title-button > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.configuration-title-button svg { flex:none; width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.8; }.account-library.pick-mode { margin:0; padding:0; border:0; box-shadow:none; background:transparent; }.account-library.pick-mode::after { display:none; }

.configuration-title { display:flex; align-items:center; justify-content:center; min-height:var(--control-height-md); margin:0; line-height:1.2; }
.configuration-title-button { height:var(--control-height-md); min-height:var(--control-height-md); min-width:0; max-width:100%; padding:0 8px; border:1px solid var(--line); border-radius:var(--control-radius); background:var(--surface-raised); font-size:var(--font-body); }
.character-header-tools .equipment-view-tabs { display:flex; flex:none; gap:0; margin:0; padding:2px; height:32px; box-sizing:border-box; border:1px solid var(--line); border-radius:var(--control-radius); background:var(--neutral-canvas); }
.character-detail-dialog .character-header-tools .equipment-view-tabs button { height:26px; min-height:26px; padding:0 8px; border:0; border-radius:4px; outline:none; background:transparent; color:var(--muted); font-weight:700; }
.character-detail-dialog .character-header-tools .equipment-view-tabs button.active[data-view=local] { background:var(--element-hydro-light); color:var(--element-hydro-deep); box-shadow:0 1px 3px #283a3620; }
.character-detail-dialog .character-header-tools .equipment-view-tabs button.active[data-view=showcase] { background:var(--element-electro-light); color:var(--element-electro-deep); box-shadow:0 1px 3px #283a3620; }
.character-header-tools .equipment-view-tabs button:focus-visible { outline:2px solid var(--element-hydro-deep); outline-offset:1px; }
@media(max-width:850px) {
  .character-detail-dialog :deep(header) { grid-template-columns:32px minmax(0,1fr) 32px; gap:8px; }
  .character-detail-dialog .configuration-title { grid-column:2; grid-row:1; justify-content:center; }
  .character-detail-dialog :deep(header > .dialog-trailing) { display:contents; }
  .character-detail-dialog :deep(.dialog-trailing > .character-favorite) { grid-column:1; grid-row:1; }
  .character-detail-dialog .configuration-title-button { grid-column:1/-1; grid-row:2; width:100%; max-width:none; }
  .character-detail-dialog :deep(.dialog-trailing > .ui-close) { grid-column:3; grid-row:1; }
  .account-library .character-detail-dialog .character-header-tools { grid-column:1/-1; grid-row:3; justify-content:center; }
  .character-detail-dialog { scroll-padding-top:152px; }
}
.card-favorite { display:inline-flex; align-items:center; gap:2px; margin-left:4px; color:var(--element-geo-deep); font-size:var(--font-body); font-weight:700; }
.character-card-trailing { grid-column:3; grid-row:1; display:flex; align-items:center; justify-self:end; gap:8px; }.card-favorite { margin:0; }.card-favorite svg { width:16px; height:16px; fill:var(--element-geo-light); stroke:currentColor; }
.character-filter-panel { display:grid; gap:20px; }.character-filter-panel :deep(.filter-actions) { margin:0; }.character-filter-panel h3 { margin:0 0 10px; font-size:var(--font-control); font-weight:700; }.character-filter-panel .filter-options { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }.character-filter-panel .filter-options button { display:flex; align-items:center; justify-content:center; gap:5px; padding:0 6px; height:40px; font-size:var(--font-body); font-weight:700; }.character-filter-panel .filter-options svg { width:18px; height:18px; color:var(--element-geo-deep); }.character-filter-panel .filter-panel-actions { margin:0; }
.character-filter-panel [aria-label=收藏] .filter-options { grid-template-columns:repeat(5,minmax(0,1fr)); }.character-filter-panel [aria-label=星级] .filter-options,.character-filter-panel [aria-label=武器类型] .filter-options { grid-template-columns:repeat(3,minmax(0,1fr)); }
@media(max-width:500px) { .character-filter-panel .filter-options { grid-template-columns:repeat(3,minmax(0,1fr)); }.character-filter-panel [aria-label=收藏] .filter-options,.character-filter-panel [aria-label=武器类型] .filter-options { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>

<style scoped>
.character-shortcut-row { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:12px 0; }.character-shortcut-row .reset-filters { font-size:var(--font-control); font-weight:700; }.character-header-tools { flex-wrap:wrap; }
</style>

<style scoped>
.mona-import-footer { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:12px; }.mona-import-footer .ui-action { font-size:var(--font-control); font-weight:700; }
</style>
