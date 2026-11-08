<script setup lang="ts">
import { computed, ref, shallowRef, onMounted, onBeforeUnmount, watch, defineAsyncComponent, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
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
import ArtifactSummary from './ArtifactSummary.vue';
import GameIcon from './components/GameIcon.vue';
import StatusBadge from './components/StatusBadge.vue';
import DisclosureHeading from './components/DisclosureHeading.vue';
import type { RealStat } from '@leyline/schema';
import { effectiveStatGroups, characterLoadoutName, configurationSignature } from './domain/character-loadout-name';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { releaseMetadata, compareReleaseNewest } from './domain/catalog-release';
const EnkaImport = defineAsyncComponent(() => import('./EnkaImport.vue'));
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));

const props = defineProps<{ page: 'characters' | 'artifacts' }>();
const emit = defineEmits<{ settings:[] }>();
const store = useAccountStore();
const { account, error, notice } = storeToRefs(store);
const { selectedCharacterId: characterId, characterQuery: query, characterElement:elementFilter, characterWeapon:weaponFilter, characterProfile:profileFilter, characterEquipment:equipmentFilter, characterRarity:rarityFilter, characterSort:sort } = storeToRefs(store);
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
const discardOpen = ref(false);
const clearShowcaseOpen = ref(false);
const localViewTab = ref<HTMLButtonElement>();
let leaveAction: (()=>void) | undefined;
const saveAsName = ref('');
const selectedPreset = ref('');
const editingPresetId = ref('');
const preferredConfirmOpen = ref(false);
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
  try { const selected=effectiveStats.value;loadouts.setEffectiveStats(account.value.id,characterId.value,selected.includes(stat)?selected.filter(item=>!effectiveStatGroups.find(group=>group.stat===stat)!.members.includes(item)):[...selected,...effectiveStatGroups.find(group=>group.stat===stat)!.members]); }
  catch { detailError.value='有效属性选择未能保存，请检查本地存储。'; }
}
async function openSaveAs() {
  previewConfiguration.value=undefined;
  if(cultivationDirty.value) { const prepared=await characterForm.value?.prepare();if(!prepared)return;previewConfiguration.value=prepared; }
  saveAsOpen.value=true;
}
function restoreConfiguration() { const id=editingPresetId.value;resetDraft();if(id)tryPreset(id); }
function selectConfiguration(id:string) {
  selectedPreset.value=editingPresetId.value;
  requestLeave(()=>{equipmentView.value='local';resetDraft();if(id)tryPreset(id);});
}
function requestPreferred() { if(equipmentView.value==='local' && editingPresetId.value && !detailDirty.value)preferredConfirmOpen.value=true; }
function makePreferred() {
  if(!draftAccount.value || !character.value || !defaultCharacter.value)return;
  try {
    if(detailDirty.value)throw new Error('请先保存当前方案的修改。');
    if(JSON.stringify(account.value)!==baseSnapshot)throw new Error('账号已变化，请重新打开并核对。');
    const previous=defaultCharacter.value;
    if(!availableLoadouts.value.some(item=>configurationSignature(item.snapshot.characters[0])===configurationSignature(previous)))loadouts.save(configurationName(previous,account.value),account.value,previous);
    store.commitEdit(parseAccount(draftAccount.value));preferredConfirmOpen.value=false;resetDraft();detailNotice.value='已设为首选；原首选已保留为备选配装。';
  }catch(cause){detailError.value=cause instanceof Error?cause.message:'未更改首选。';preferredConfirmOpen.value=false;}
}
function resetDraft() {
  baseSnapshot = JSON.stringify(account.value);
  draftAccount.value = cloneAccount(account.value);draftBaseline=JSON.stringify(draftAccount.value);editingPresetId.value='';previewConfiguration.value=undefined;
  cultivationDirty.value = false; formRevision.value++; pending.value = undefined; detailMode.value='view'; artifactId.value='';
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
    draftAccount.value = parseAccount(next);draftBaseline=JSON.stringify(draftAccount.value);editingPresetId.value=id;selectedPreset.value=id;formRevision.value++;cultivationDirty.value=false;detailMode.value='view';
    pendingPreset.value = ''; detailNotice.value = '正在查看备选配装；保存只更新此方案，设为首选才改变实际穿戴。';
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '方案未载入。'; selectedPreset.value = ''; }
}
const artifactId = ref('');
const equipmentSlot = ref<AccountSlot>('flower');
const editingCharacter = ref(false);
const detailOpen = ref(false);
const panelOpen=ref(false);
const detailMode=ref<'view'|'equipment'>('view');
function requestLeave(action: ()=>void) {
  if (detailOpen.value && detailDirty.value) { leaveAction=action; discardOpen.value=true; }
  else if(!detailOpen.value && inventoryBrowser.value)inventoryBrowser.value.requestLeave(action);
  else action();
}
function requestCloseCharacter() { requestLeave(closeCharacter); }
function discardChanges() { const action=leaveAction; leaveAction=undefined; discardOpen.value=false; action?.(); }
const clearTarget = ref<'local'|'showcase'>('local');
function requestClearShowcase() {
  const target=equipmentView.value;
  const open=()=>{ if(target==='showcase' && editingPresetId.value){resetDraft();equipmentView.value='showcase';}clearTarget.value=target;clearShowcaseOpen.value=true; };
  if(target==='showcase' && editingPresetId.value)requestLeave(open);else open();
}
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
function protectUnload(event: BeforeUnloadEvent) { if(detailOpen.value && detailDirty.value) { event.preventDefault(); event.returnValue=''; } }
onMounted(()=>window.addEventListener('beforeunload',protectUnload));
onBeforeUnmount(()=>window.removeEventListener('beforeunload',protectUnload));
defineExpose({ requestLeave });
function openCharacter(id:string) { equipmentView.value='local'; characterId.value=id; resetDraft(); detailOpen.value=true;detailMode.value='view';panelOpen.value=false; }
function closeCharacter() { discardOpen.value=false;clearShowcaseOpen.value=false;leaveAction=undefined;draftAccount.value=undefined; cultivationDirty.value=false; saveAsOpen.value=false; pendingPreset.value=''; detailOpen.value=false; detailMode.value='view'; pending.value=undefined; }
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
const weapons = [{id:'WEAPON_SWORD_ONE_HAND',name:'单手剑'},{id:'WEAPON_CLAYMORE',name:'双手剑'},{id:'WEAPON_POLE',name:'长柄武器'},{id:'WEAPON_BOW',name:'弓'},{id:'WEAPON_CATALYST',name:'法器'}];
const profileOptions = [{id:'ready',name:'培养资料齐全'},{id:'pending',name:'待补全'}];
const equipmentOptions = [{id:'full',name:'本地装备齐全'},{id:'partial',name:'本地装备未齐'},{id:'empty',name:'尚未配置本地装备'}];
const sortOptions = [{id:'release',name:'实装版本从新到旧'},{id:'name',name:'名称'},{id:'level',name:'等级从高到低'},{id:'constellation',name:'命座从高到低'},{id:'equipment',name:'本地装备数量'}];
const metadata = (entry: typeof account.value.characters[number]) => entry.realBuild?.character ?? catalog.value?.characters.find(item => item.name === entry.name);
const characterRelease = (entry: typeof account.value.characters[number]) => releaseMetadata('characters',entry.realBuild?.character.id,entry.name);
const visibleCharacters = computed(() => {
  const items = account.value.characters.filter(entry => {
    const meta=metadata(entry), count=Object.values(entry.equipment).length;
    return entry.name.includes(query.value.trim()) && (!elementFilter.value.length || (meta && elementFilter.value.includes(meta.element)))
      && (!rarityFilter.value.length || rarityFilter.value.includes(String(characterRelease(entry)?.rarity)))
      && (!weaponFilter.value.length || (meta && weaponFilter.value.includes(meta.weaponType)))
      && (!profileFilter.value.length || profileFilter.value.includes(entry.realBuild ? 'ready' : 'pending'))
      && (!equipmentFilter.value.length || equipmentFilter.value.includes(count===5 ? 'full' : count>0 ? 'partial' : 'empty'));
  });
  return items.sort((a,b) => (sort.value==='release' ? compareReleaseNewest(characterRelease(a),characterRelease(b)) : sort.value==='level' ? (b.realBuild?.level??-1)-(a.realBuild?.level??-1) : sort.value==='constellation' ? (b.realBuild?.constellation??-1)-(a.realBuild?.constellation??-1) : sort.value==='equipment' ? Object.keys(b.equipment).length-Object.keys(a.equipment).length : 0) || a.name.localeCompare(b.name,'zh-CN'));
});
const galleryEntries = computed(()=>visibleCharacters.value.flatMap(entry=>{
  const primary={...entry,presetId:'',galleryKey:entry.id,gallerySnapshot:account.value};
  if(!store.showCharacterLoadouts)return [primary];
  const variants=loadouts.loadouts.filter(item=>item.accountId===account.value.id && item.characterId===entry.id && configurationSignature(item.snapshot.characters[0])!==configurationSignature(entry));
  return [primary,...variants.map(item=>({...item.snapshot.characters[0],showcase:entry.showcase,presetId:item.id,galleryKey:item.id,gallerySnapshot:item.snapshot}))];
}));
function openGallery(entry:{id:string;presetId:string}) { openCharacter(entry.id);if(entry.presetId)tryPreset(entry.presetId); }
const activeFilters = computed(() => elementFilter.value.length + weaponFilter.value.length + profileFilter.value.length + equipmentFilter.value.length + rarityFilter.value.length);
function toggleFilter(selected: string[], id: string) { const index = selected.indexOf(id); if (index < 0) selected.push(id); else selected.splice(index, 1); }
function resetFilters() { elementFilter.value=[]; weaponFilter.value=[]; profileFilter.value=[]; equipmentFilter.value=[]; rarityFilter.value=[]; }
const filterGroups = computed(() => [
  { id:'elements', title:'元素', options:elementPalette.map(item => ({id:item.id,name:item.name})), selected:elementFilter.value },
  { id:'rarity', title:'星级', options:[{id:'4',name:'四星'},{id:'5',name:'五星'}], selected:rarityFilter.value },
  { id:'weapons', title:'武器类型', options:weapons, selected:weaponFilter.value },
  { id:'profiles', title:'培养资料', options:profileOptions, selected:profileFilter.value },
  { id:'equipment', title:'本地配装', options:equipmentOptions, selected:equipmentFilter.value },
]);
const equipmentView=ref<'local'|'showcase'>('local');
watch(()=>character.value?.id,() => { equipmentView.value='local'; },{immediate:true});
function showImportedCharacter(id:string) { query.value='';resetFilters();modal.value='';openCharacter(id); }
function equipmentItem(slot:AccountSlot) { return equipmentView.value==='showcase'&&character.value?showcaseArtifact(character.value,slot):editingAccount.value.artifacts.find(item=>item.id===character.value?.equipment[slot]); }

function localConfigurationComplete(entry: AccountCharacter) {
  return !!entry.realBuild && accountSlots.every(slot => {
    const item = account.value.artifacts.find(item => item.id === entry.equipment[slot]);
    return item?.slot === slot && !!item.real && !item.mona?.setIdentityPending;
  });
}

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
  <section class="account-library panel">
    <header class="account-heading"><div class="account-heading-info"><button class="account-name" aria-label="账号设置" @click="emit('settings')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>{{ account.name }}</button><span class="account-count">{{ account.characters.length }} 角色<span>·</span>{{ account.artifacts.length }} 圣遗物</span></div><details v-if="notice" class="account-feedback"><summary><i></i>{{ notice.startsWith('已恢复') ? '草稿已恢复' : '操作完成' }}<span>详情⌄</span></summary><div role="status"><p>{{ notice }}</p><button class="ui-muted-button" @click="notice = ''">知道了</button><button class="ui-muted-button" @click="emit('settings')">账号与备份</button></div></details><span v-else class="local-status"><i></i>{{ store.dirty ? '本地草稿' : '文件已保存' }}</span></header>
    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>

    <template v-if="page === 'characters'">
      <div class="character-toolbar"><div class="character-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input v-model="query" aria-label="搜索账号角色" placeholder="查找角色"></div><button class="filter-trigger ui-muted-button" :class="{ applied:activeFilters }" @click="modal = 'filters'">筛选<span v-if="activeFilters">{{ activeFilters }}</span></button><button class="filter-trigger ui-muted-button" :class="{ applied:sort!=='release' }" @click="modal = 'sort'">排序</button><div class="character-import-actions"><button class="ui-action soft" data-accent="hydro" @click="modal = 'import'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H6V3ZM12 9v8m-3-3 3 3 3-3"/></svg>莫娜导入</button><button class="ui-action soft" data-accent="electro" @click="modal = 'network'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a17 17 0 0 1 0 16 17 17 0 0 1 0-16Z"/></svg>展柜导入</button><button class="ui-action" data-accent="anemo" aria-label="手动添加" @click="editingCharacter = false; modal = 'create'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>手动添加</button></div></div>
      <div class="element-shortcuts" role="group" aria-label="按元素筛选">
        <button :aria-pressed="!elementFilter.length" @click="elementFilter = []">全部</button>
        <button v-for="element in elementPalette" :key="element.id" :aria-label="`${element.name}元素`" :aria-pressed="elementFilter.includes(element.id)" :style="{ '--filter-light':element.light,'--filter-deep':element.deep }" @click="toggleFilter(elementFilter, element.id)"><GameIcon kind="elements" :id="element.id" :size="24" /><span>{{ element.name }}</span></button>
        <button v-if="activeFilters" class="reset-filters" @click="resetFilters">清除筛选</button>
      <label class="show-character-loadouts"><input type="checkbox" v-model="store.showCharacterLoadouts" aria-label="是否显示角色不同配装">是否显示角色不同配装</label></div>
      <WorkbenchDialog v-if="modal === 'filters'" title="筛选角色" @close="modal = ''"><div class="character-filter-panel">
        <section v-for="group in filterGroups" :key="group.id" :aria-label="group.title"><h3>{{ group.title }}</h3><div class="filter-options">
          <button :aria-pressed="!group.selected.length" :class="{selected:!group.selected.length}" @click="group.selected.splice(0)">全部</button>
          <button v-for="item in group.options" :key="item.id" :aria-pressed="group.selected.includes(item.id)" :class="{selected:group.selected.includes(item.id)}" @click="toggleFilter(group.selected,item.id)"><GameIcon v-if="group.id==='elements'" kind="elements" :id="item.id" :size="24" />{{ item.name }}</button>
        </div></section>
        <div class="filter-panel-actions"><button class="ui-muted-button" @click="resetFilters">重置筛选</button><button class="ui-action" data-accent="anemo" @click="modal = ''">完成</button></div>
      </div></WorkbenchDialog>
      <WorkbenchDialog v-if="modal === 'sort'" title="角色排序" @close="modal = ''"><div class="filter-options"><button v-for="item in sortOptions" :key="item.id" :aria-pressed="sort===item.id" :class="{selected:sort===item.id}" @click="sort=item.id;modal=''">{{ item.name }}</button></div></WorkbenchDialog>

      <WorkbenchDialog v-if="modal === 'notes'" title="从穿戴备注整理角色" @close="modal = ''"><p>文件中有 {{ noteNames.length }} 个角色穿戴备注：{{ noteNames.join('、') }}。</p><p>仅新增尚不存在的角色资料，并按没有冲突的原始备注登记装备。已有角色与装备不覆盖；武器、命座、等级和天赋不来自此文件，角色需继续补全后才能计算。</p><button @click="organizeNotes">确认按备注整理</button></WorkbenchDialog>
      <div class="character-cards">
        <button v-for="entry in galleryEntries" :key="entry.galleryKey" class="character-card" :class="{ selected: characterId === entry.id && editingPresetId===entry.presetId }" :aria-label="entry.presetId ? `查看${entry.name}备选配装${configurationName(entry,entry.gallerySnapshot)}详情` : `查看${entry.name}详情`" @click="openGallery(entry)">
          <span class="character-card-header">
            <span class="character-card-status">
              <StatusBadge label="本地" :tone="localConfigurationComplete(entry) ? 'hydro' : 'pyro'" :state="localConfigurationComplete(entry) ? 'complete' : 'pending'" :description="localConfigurationComplete(entry) ? '培养资料与五个部位的本地实物配置齐全' : '本地培养资料或五个部位的实物配置尚未齐全'" :accessible-name="`本地配置${localConfigurationComplete(entry) ? '完整' : '待补全'}`" />
              <StatusBadge v-if="entry.showcase" label="展柜" tone="electro" :state="entry.showcase ? 'complete' : 'missing'" :description="entry.showcase ? '有独立展柜快照' : '尚无展柜快照'" :accessible-name="entry.showcase ? '有展柜信息' : '无展柜信息'" />
            </span>
            <strong>{{ entry.name }}<small v-if="store.showCharacterLoadouts" class="configuration-kind">{{ entry.presetId?'备选':'首选' }}</small></strong>
            <svg class="character-card-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v14h14v-3M13 5h6v6m0-6-9 9"/></svg>
          </span>
          <CharacterCardPortraits :build="entry.realBuild" :name="entry.name" :artifacts="cardArtifacts(entry,entry.gallerySnapshot)" />
        </button>
      </div>
      <p v-if="!visibleCharacters.length" class="account-empty">{{ account.characters.length ? '没有符合条件的角色，请调整搜索或筛选。' : '还没有角色。使用上方的莫娜导入、展柜导入 或手动添加建立自己的角色资料。' }}</p>
      <WorkbenchDialog v-if="modal === 'create'" :title="editingCharacter ? '编辑角色资料' : '添加账号角色'" @close="modal = ''"><CharacterForm :character="editingCharacter ? character : undefined" @saved="openCharacter($event)" @close="modal = ''" /></WorkbenchDialog>
      <WorkbenchDialog class="character-detail-dialog" v-if="detailOpen && character" :title="character.name" @close="requestCloseCharacter">
      <template #title><h2 class="configuration-title"><select class="configuration-select" aria-label="角色配装方案" :title="selectedPreset ? draftName : defaultCharacter && configurationName(defaultCharacter,account)" :value="selectedPreset" @change="selectConfiguration(($event.target as HTMLSelectElement).value)"><option value="">首选 · {{ defaultCharacter && configurationName(defaultCharacter,account) }}</option><option v-for="item in alternateLoadouts" :key="item.id" :value="item.id">{{ configurationName(item.snapshot.characters[0],item.snapshot) }}</option></select><button class="preferred-star" :class="{active:!editingPresetId}" :disabled="equipmentView==='showcase' || !editingPresetId || detailDirty || detailBusy" :aria-label="editingPresetId?'设为首选':'当前为首选'" :title="editingPresetId?'设为首选':'当前为首选'" @click="requestPreferred"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg></button></h2></template>
      <template #header-leading><div class="character-header-tools"><div class="equipment-view-tabs"><button ref="localViewTab" data-view="local" :aria-pressed="equipmentView==='local'" :class="{active:equipmentView==='local'}" @click="equipmentView = 'local'">本地</button><button v-if="character.showcase" data-view="showcase" :aria-pressed="equipmentView==='showcase'" :class="{active:equipmentView==='showcase'}" @click="equipmentView = 'showcase'">展柜</button></div><div class="detail-actions" v-if="equipmentView==='local'"><button class="ui-action" data-accent="anemo" :disabled="!detailDirty || detailBusy" @click="saveDetail()">保存</button><button class="ui-action soft" data-accent="anemo" :disabled="!detailDirty || detailBusy" @click="openSaveAs">另存</button><button class="ui-action soft" data-accent="pyro" :disabled="!detailDirty || detailBusy" @click="restoreConfiguration">还原</button></div><button class="clear-showcase ui-action soft" data-accent="pyro" @click="requestClearShowcase">删除</button></div></template>
      <div class="account-editor">
        <p v-if="detailError || loadouts.error" role="alert">{{ detailError || loadouts.error }}</p><p v-if="detailNotice" class="detail-feedback" role="status">{{ detailNotice }}</p>

        <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}</div>

        <CharacterForm ref="characterForm" v-show="equipmentView==='local'" details detached :key="`${character.id}-${formRevision}`" :character="character" @dirty-change="cultivationDirty=$event" />
        <CharacterForm v-if="equipmentView==='showcase'" details :character="character" showcase />
        <section class="detail-panel"><DisclosureHeading class="inline-section-heading" title="角色面板" label="面板" controls="character-stat-panel" :expanded="panelOpen" @toggle="panelOpen = !panelOpen" /><div id="character-stat-panel"><p v-if="panelOpen && cultivationDirty && equipmentView==='local'" class="detail-feedback">培养数值尚未保存，保存后更新面板。</p><CharacterStats v-else-if="panelOpen" :account="editingAccount" :character="character" :showcase="equipmentView === 'showcase'" /></div></section>
        <section class="detail-artifacts"><div class="inline-section-heading"><h3>圣遗物</h3><button v-if="detailMode==='equipment'" @click="detailMode = 'view'">返回角色配装</button></div>
        <section v-if="detailMode==='equipment'" class="inline-equipment"><h3>选择{{ accountSlotLabels[equipmentSlot] }}</h3><ArtifactBrowser inline pick :account="editingAccount" density="relaxed" :slot="equipmentSlot" :compare-to="editingAccount.artifacts.find(item => item.id === character?.equipment[equipmentSlot])" @select="artifactId = $event.id; equip(); detailMode = 'view'" /></section>
        <div v-else class="equipment-list"><article v-for="slot in accountSlots" :key="slot" class="artifact-item-card" :data-rarity="equipmentItem(slot)?.real?.rarity" data-density="relaxed" :data-empty="!equipmentItem(slot)"><ArtifactSummary v-if="equipmentItem(slot)" :item="equipmentItem(slot)!" variant="relaxed" :account="editingAccount" :wearers="equipmentView==='showcase' ? [{name:character.name,id:character.realBuild?.character.id,label:'展柜快照'}] : undefined" /><button v-else class="empty-artifact" :aria-label="`装备${accountSlotLabels[slot]}`" :title="`${accountSlotLabels[slot]} · 未装备`" :disabled="equipmentView === 'showcase'" @click="equipmentSlot = slot; detailMode = 'equipment'"><GameIcon kind="artifactSlots" :id="slot" :size="48" /></button><div v-if="equipmentView === 'local' && equipmentItem(slot)" class="equipment-actions"><button class="equipment-change" :aria-label="`${character.equipment[slot] ? '更换' : '装备'}${accountSlotLabels[slot]}`" @click="equipmentSlot = slot; detailMode = 'equipment'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15l-4-4M20 17H5l4 4" /></svg></button><button v-if="character.equipment[slot]" class="equipment-remove" :aria-label="`卸下${accountSlotLabels[slot]}`" @click="delete character.equipment[slot]"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12v8h14v-8M12 15V3m-4 4 4-4 4 4" /></svg></button></div></article></div>
        </section>
        <section v-if="equipmentView==='local'" class="effective-stat-picker"><h3>有效词条</h3><div role="group" aria-label="有效词条"><button v-for="group in effectiveStatGroups" :key="group.stat" class="effective-stat-option" :aria-label="`有效词条${group.label}`" :aria-pressed="effectiveStats.includes(group.stat)" @click="toggleEffectiveStat(group.stat)"><GameIcon kind="stats" :id="group.icon" :size="22" /><span>{{ group.label }}</span></button></div></section>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
      </div>
      </WorkbenchDialog>
      <WorkbenchDialog v-if="preferredConfirmOpen" compact title="设为首选配置？" @close="preferredConfirmOpen=false"><p>采用当前配装并更新账号实际穿戴；原首选保留为备选配装。</p><p v-for="message in presetTransfers" :key="message">{{ message }}</p><button class="ui-action" data-accent="anemo" @click="makePreferred">确认设为首选</button></WorkbenchDialog>
      <WorkbenchDialog v-if="discardOpen" compact title="放弃未保存的修改？" @close="discardOpen=false; leaveAction=undefined"><p>退出将丢弃未保存的修改。</p><div class="confirmation-actions"><button class="ui-action soft" data-accent="anemo" @click="discardOpen=false; leaveAction=undefined">继续编辑</button><button class="ui-action" data-accent="pyro" @click="discardChanges">放弃修改并退出</button></div></WorkbenchDialog>
      <WorkbenchDialog v-if="clearShowcaseOpen" compact :title="clearTarget==='local'?'清除本地配装？':'清除展柜信息？'" @close="clearShowcaseOpen=false"><p>{{ clearTarget==='local'?'清除本地培养与穿戴，圣遗物保留在库存。':'清除该角色的展柜信息。' }}</p><p>保存后生效。</p><div class="confirmation-actions"><button class="ui-action soft" data-accent="anemo" @click="clearShowcaseOpen=false">取消</button><button class="ui-action" data-accent="pyro" @click="clearShowcase">确认清除</button></div></WorkbenchDialog>
      <WorkbenchDialog v-if="saveAsOpen" title="另存角色配装方案" @close="saveAsOpen=false"><label>方案名称<input :value="draftName" aria-label="配装方案名称" readonly></label><p>按角色、有效平均词条数、套装和武器自动命名；首选配置和实际穿戴不变。</p><p v-if="!effectiveStats.length" role="alert">请先在详情中选择有效属性。</p><p v-if="detailError" role="alert">{{ detailError }}</p><button class="ui-action" data-accent="anemo" :disabled="detailBusy || !effectiveStats.length" @click="saveDetail(true)">确认另存</button></WorkbenchDialog>
      <WorkbenchDialog v-if="pendingPreset" title="确认试用配装方案" @close="pendingPreset=''; selectedPreset=''"><p v-for="message in presetTransfers" :key="message">{{ message }}</p><p>试用只修改草稿，保存时才转移实际穿戴，原装备保留在库存。</p><button @click="tryPreset(pendingPreset,true)">确认试用方案</button></WorkbenchDialog>
    </template>
    <template v-else>
      <div class="account-toolbar"><button class="ui-action soft" data-accent="electro" @click="modal = 'import'">导入莫娜圣遗物</button><button class="ui-action" data-accent="anemo" @click="modal = 'artifact'">手动添加圣遗物</button><button v-if="account.artifacts.some(item => item.mona?.setIdentityPending)" :disabled="checkingSets" @click="inspectSets">核对已导入套装</button><span>先预览，再确认；保留每件实物与原始词条。</span></div>
      <WorkbenchDialog v-if="modal === 'repair' && repairPreview" title="核对已导入套装" @close="modal = ''"><p>根据莫娜 7.2.02 核实套装身份，仅补全未经手动修改的物品，不改变词条或穿戴关系。</p><p v-for="update in repairPreview.updates" :key="update.item.id">{{ update.item.mona?.sourceSetName }} → {{ update.item.name }}</p><p v-for="message in repairPreview.skipped" :key="message">{{ message }}</p><p v-if="!repairPreview.updates.length">没有可以直接补全的物品。</p><button :disabled="!repairPreview.updates.length" @click="repairSets">确认补全 {{ repairPreview.updates.length }} 件套装身份</button></WorkbenchDialog>
      <ArtifactBrowser ref="inventoryBrowser" />

      <WorkbenchDialog v-if="modal === 'artifact'" title="手动添加圣遗物" @close="modal = ''"><ArtifactForm @close="modal = ''" /></WorkbenchDialog>
    </template>
    <WorkbenchDialog v-if="modal === 'network'" title="从 Enka 展柜导入" @close="modal = ''"><EnkaImport @imported="showImportedCharacter" @close="modal = ''" /></WorkbenchDialog>
    <WorkbenchDialog v-if="modal === 'import'" :title="props.page==='characters' ? '从莫娜 JSON 添加角色' : '导入莫娜圣遗物'" @close="modal = ''"><MonaImport automatic @imported="modal = props.page==='characters' && noteNames.length ? 'notes' : ''" /><div v-if="props.page==='characters' && noteNames.length" class="existing-note-import"><p>当前库存已有 {{ noteNames.length }} 个穿戴备注，可整理为待补全角色。</p><button class="ui-action soft" data-accent="electro" @click="modal = 'notes'">从穿戴备注整理角色</button></div></WorkbenchDialog>
  </section>
</template>

<style scoped>
.account-library .character-detail-dialog { overflow-y:auto; scrollbar-gutter:stable both-edges; width:min(1000px,calc(100vw - 32px)); }
.inline-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:16px 0; }.inline-section-heading h3 { margin:0; }
.character-card-header { position:relative; display:grid; grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); align-items:center; gap:8px; width:100%; }.character-card-header > strong { grid-column:2; grid-row:1; text-align:center; }.character-card-status { grid-column:1; grid-row:1; justify-self:start; }.character-card-header > strong { font-size:16px; line-height:22px; }.character-card-status { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; width:88px; }.character-card-open { grid-column:3; grid-row:1; justify-self:end; width:16px; height:16px; fill:none; stroke:var(--muted); stroke-width:1.6; }
.detail-panel { margin-top:16px; }.detail-panel :deep(.character-stats) { margin:0; padding:12px; border:1px solid var(--line); border-radius:10px; }.detail-panel :deep(.character-stats h3) { display:none; }.detail-artifacts { margin-top:18px; }
.character-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(312px,1fr)); gap:8px; margin:0; }
.character-cards .character-card { container-type:inline-size; display:flex; flex-direction:column; align-items:flex-start; gap:6px; min-width:0; padding:10px 7px 12px; color:var(--ink); text-align:left; border:1px solid var(--line); border-radius:16px; background:var(--surface-raised); box-shadow:0 2px 8px #283a3605; transition:border-color .15s,box-shadow .15s,transform .15s; }
.character-cards .character-card:hover { transform:translateY(-2px); border-color:var(--element-anemo-primary); box-shadow:0 8px 24px #283a3610; }




@media(prefers-reduced-motion:reduce){.character-cards .character-card { transition:none; }.character-cards .character-card:hover { transform:none; }}
@media(max-width:550px){.character-cards { grid-template-columns:minmax(0,1fr); }.character-cards .character-card { padding:10px 7px 12px; }}

.account-empty { padding:40px 20px; border:1px dashed var(--line); border-radius:12px; text-align:center; }.legacy-inventory { margin-top:24px; }.account-library { margin: 0 30px; color: var(--text, var(--ink)); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size: 12px; line-height: 1.8; }
label { font-size: 12px; display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }

.equipment-list, .account-copy, .transfer-confirm, .account-real-panel, details { grid-column: 1/-1; }.equipment-list > div { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 12px; }
.account-copy { border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 12px; }
.account-note { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:0 0 16px; }.account-note strong { font-size:14px; }.account-note span { color:var(--muted); }.account-error { color: var(--element-pyro-deep); }.transfer-confirm { border: 1px solid #ad8b4b; padding: 16px; }.transfer-confirm button { margin-right: 12px; }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size: 11px; overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
.account-editor { display:block; margin:0; }h2 { margin:0; font-size:20px; }.equipment-list { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }.equipment-list article { grid-column:span 2; }h3 { font-size:13px; margin:0 0 14px; }.equipment-actions { display:flex; gap:8px; margin-top:12px; }.account-library { margin-inline:0; }
@media(max-width:800px) {  }
h2 { margin-top:7px; }.equipment-actions button { padding:8px 10px; font-size:12px; }.equipment-actions button:last-child:not(:first-child) { background:transparent; color:var(--muted); border-color:var(--line); }.account-note { padding-bottom:16px; border-bottom:1px solid var(--line); }
.account-toolbar > button:last-child:not(:first-child) { background:var(--surface); color:var(--muted); border-color:var(--line); }.account-library > [role=status] { color:#61755d; font-size:12px; padding:8px 12px; background:#eef3e8; border-radius:8px; margin-top:0; }
.account-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:32px; margin-bottom:18px; }.account-heading-info { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }.account-name { display:flex; align-items:center; gap:8px; padding:0; border:0; min-height:28px; color:var(--ink); background:transparent; font-size:14px; font-weight:600; }.account-name svg { width:18px; height:18px; stroke:var(--muted); stroke-width:1.6; fill:none; }.account-count { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--muted); }.account-count > span { opacity:.5; }.account-feedback { position:relative; flex-shrink:0; font-size:12px; }.account-feedback > summary,.local-status { display:flex; align-items:center; gap:6px; color:var(--element-anemo-deep); cursor:pointer; list-style:none; font-size:12px; }.account-feedback summary::-webkit-details-marker { display:none; }.account-feedback summary > span { margin-left:5px; color:var(--muted); font-size:11px; }.account-feedback i,.local-status i { width:6px; height:6px; border-radius:50%; background:var(--element-anemo-primary); }.account-feedback > div { position:absolute; top:28px; right:0; width:min(320px,70vw); padding:14px; background:var(--surface-raised); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px #283a3614; z-index:5; }.account-feedback p { margin:0 0 10px; }.account-feedback button { font-size:12px; padding:6px 8px; margin-right:8px; }.character-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }.character-search { position:relative; flex:1; min-width:170px; max-width:320px; }.character-search > svg { position:absolute; width:16px; height:16px; top:12px; left:12px; stroke:var(--muted); stroke-width:1.6; fill:none; }.character-search input { height:40px; min-width:0; padding:9px 12px 9px 36px; background:var(--surface-raised); border-color:var(--line); font-size:13px; }.filter-trigger { height:40px; font-size:12px; padding:8px 12px; }.filter-trigger.applied { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.filter-trigger > span { padding-left:6px; }.character-import-actions { margin-left:auto; display:flex; gap:8px; }.reset-filters { padding:0; border:0; background:none; color:inherit; font-size:12px; min-height:16px; }.reset-filters { padding:3px 7px; color:var(--muted); }.character-filter-panel h3 { margin:20px 0 10px; font-size:13px; }.character-filter-panel h3:first-child { margin-top:0; }.filter-options { display:flex; flex-wrap:wrap; gap:8px; }.filter-options button { --filter-light:var(--element-anemo-light); --filter-deep:var(--element-anemo-deep); color:var(--muted); background:var(--surface); border-color:var(--line); padding:9px 15px; font-size:13px; }.filter-options button.selected { background:var(--filter-light); color:var(--filter-deep); border-color:var(--filter-deep); }.filter-panel-actions { display:flex; justify-content:space-between; margin-top:24px; }.existing-note-import { border-top:1px solid var(--line); margin-top:16px; padding-top:12px; }.equipment-view-tabs { display:flex; gap:8px; align-items:center; margin-top:16px; }.equipment-view-tabs button { color:var(--muted); background:var(--surface); border-color:var(--line); padding:7px 12px; font-size:12px; }.equipment-view-tabs button.active { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }.equipment-view-tabs span { color:var(--muted); font-size:11px; }.snapshot-note { color:var(--element-hydro-deep); }
.equipment-list article:nth-child(4) { grid-column:2/span 2; }.equipment-list article:nth-child(5) { grid-column:4/span 2; }@media(max-width:900px){.equipment-list { grid-template-columns:repeat(2,minmax(0,1fr)); }.equipment-list article,.equipment-list article:nth-child(4),.equipment-list article:nth-child(5) { grid-column:auto; }}@media(max-width:620px){.equipment-list { grid-template-columns:minmax(0,1fr); }}
@media(max-width:1000px){.character-import-actions { width:100%; margin-left:0; }.character-search { max-width:none; }}@media(max-width:550px){.account-heading { align-items:flex-start; }.account-heading-info { gap:3px; flex-direction:column; align-items:flex-start; }.account-feedback > summary > span { display:none; }.character-import-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }.character-import-actions .ui-action { padding:8px 6px; font-size:12px; gap:5px; }.character-import-actions svg { width:14px; height:14px; }.equipment-view-tabs { flex-wrap:wrap; }}
.element-shortcuts { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:10px 0 14px; }
.element-shortcuts > button { display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:4px 8px; min-height:34px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--muted); font-size:13px; }
.element-shortcuts > button[aria-pressed=true] { background:var(--filter-light,var(--element-anemo-light)); color:var(--filter-deep,var(--element-anemo-deep)); border-color:currentColor; }
.filter-options button { display:inline-flex; align-items:center; gap:6px; }
.character-filter-panel section + section { margin-top:20px; }
@media(max-width:550px) { .element-shortcuts { gap:4px; }.element-shortcuts > button { padding:4px 6px; } }
.character-detail-dialog :deep(header) { display:grid; grid-template-columns:1fr auto 1fr; padding:12px 20px; }
.character-detail-dialog :deep(header h2) { grid-column:2; grid-row:1; text-align:center; font-size:24px; }
.character-detail-dialog :deep(header > button) { grid-column:3; grid-row:1; justify-self:end; color:var(--element-pyro-deep); background:var(--element-pyro-light); border-color:transparent; font-size:15px; }
.character-detail-dialog :deep(.dialog-content) { padding:16px 20px 20px; font-size:16px; }
.character-detail-dialog .equipment-view-tabs { grid-column:1; grid-row:1; justify-content:flex-start; margin:0; gap:8px; }
.character-detail-dialog .equipment-view-tabs button { height:32px; min-height:32px; font-size:13px; padding:5px 8px; }
.character-detail-dialog .equipment-view-tabs button[data-view=local] { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }
.character-detail-dialog .equipment-view-tabs button[data-view=showcase] { color:var(--element-electro-deep); background:var(--element-electro-light); border-color:var(--element-electro-primary); }
.character-detail-dialog .detail-panel,.character-detail-dialog .detail-artifacts { padding:0; background:transparent; margin-top:14px; }.character-detail-dialog .inline-section-heading { margin:8px 0 12px; padding-bottom:10px; border-bottom:1px solid var(--line); }
.character-detail-dialog .inline-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; text-align:left; }.character-detail-dialog .inline-section-heading h3 { margin:0; font-size:16px; font-weight:700; text-align:left; }
.character-detail-dialog .inline-section-heading button { font-size:15px; }

@media(max-width:550px) { .character-detail-dialog .equipment-view-tabs { grid-column:1/-1; grid-row:2; }.character-detail-dialog :deep(header) { row-gap:10px; }.character-card-header { grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); }.character-detail-dialog :deep(.dialog-content) { padding:12px; }.character-detail-dialog :deep(header) { padding:12px; }.character-detail-dialog :deep(header > button) { padding:6px; } }
@media(max-width:400px) { .character-card-header { grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); } }
@container(max-width:295.99px) { .character-card-header { grid-template-columns:88px minmax(104px,1fr) 16px; } }
.artifact-item-card[data-empty=true] { border-style:dashed; }.empty-artifact.empty-artifact { display:flex; align-items:center; justify-content:center; width:100%; min-height:104px; padding:12px; border:0; background:transparent; color:var(--muted); }.empty-artifact:disabled { opacity:.6; }
.character-header-tools .equipment-view-tabs { grid-column:auto; grid-row:auto; display:flex; align-items:center; gap:4px; }.character-header-tools { display:flex; align-items:center; gap:8px; min-width:0; white-space:nowrap; }.detail-actions { display:flex; gap:6px; }.detail-actions .ui-action { min-height:32px; padding:5px 10px; }.loadout-picker { display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:12px; }.loadout-picker select { width:min(320px,100%); }.detail-feedback { color:var(--element-anemo-deep); font-size:12px; margin-bottom:8px; }
.equipment-view-tabs button.active { outline:1px solid currentColor; outline-offset:1px; }.showcase-menu { position:relative; margin:0; }.showcase-menu > summary { display:flex; align-items:center; justify-content:center; width:20px; height:32px; color:var(--element-electro-deep); cursor:pointer; list-style:none; }.showcase-menu > summary::-webkit-details-marker { display:none; }.showcase-menu svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.6; }.showcase-menu > button { position:absolute; right:0; top:100%; width:100px; z-index:20; color:var(--element-pyro-deep); background:var(--surface-raised); box-shadow:0 4px 15px #283a3620; }.confirmation-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
.equipment-list { max-width:684px; margin-inline:auto; }@media(max-width:900px) { .equipment-list { max-width:452px; } }@media(max-width:550px) { .equipment-list { max-width:220px; }.character-header-tools { grid-column:1/-1; grid-row:2; justify-content:flex-start; } }
.equipment-list .artifact-item-card { position:relative; }.equipment-list .equipment-actions { position:absolute; inset:0; margin:0; pointer-events:none; }.equipment-actions button.equipment-change,.equipment-actions button.equipment-remove { position:absolute; top:-9px; width:22px; height:22px; min-height:22px; padding:3px; border:1px solid var(--line); border-radius:50%; background:var(--surface-raised); pointer-events:auto; }.equipment-actions .equipment-change { left:-7px; color:var(--element-hydro-deep); }.equipment-actions .equipment-remove { right:-7px; color:var(--element-pyro-deep); }.equipment-actions svg { display:block; width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.8; }
.character-header-tools .clear-showcase { height:32px; min-height:32px; padding:5px 8px; font-size:12px; }
@media(max-width:400px) { .character-header-tools { gap:5px; }.detail-actions { gap:4px; }.detail-actions .ui-action,.character-detail-dialog .equipment-view-tabs button,.character-header-tools .clear-showcase { padding:4px 6px; font-size:12px; } }
.configuration-title { display:flex; align-items:center; width:230px; max-width:100%; gap:3px; }.configuration-select { min-width:0; width:calc(100% - 27px); padding:3px 14px 3px 2px; border:0; background:transparent; font-size:14px; font-weight:700; text-overflow:ellipsis; }.preferred-star { display:flex; align-items:center; justify-content:center; width:24px; height:24px; min-height:24px; padding:3px; border:0; color:var(--element-geo-deep); background:transparent; }.preferred-star svg { width:18px; height:18px; fill:none; stroke:currentColor; }.preferred-star.active svg { fill:var(--element-geo-primary); }
.show-character-loadouts { display:flex !important; align-items:center; gap:5px; margin-left:auto; font-size:12px; color:var(--muted); white-space:nowrap; }.show-character-loadouts input { width:14px; height:14px; min-height:14px; padding:0; accent-color:var(--element-anemo-deep); }.configuration-kind { display:block; margin-top:1px; font-size:9px; line-height:10px; color:var(--muted); }
.effective-stat-picker { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); }.effective-stat-picker h3 { margin-bottom:10px; font-size:15px; }.effective-stat-picker > div { display:flex; flex-wrap:wrap; gap:8px; }.effective-stat-option { display:flex; align-items:center; justify-content:center; gap:6px; min-height:40px; padding:7px 11px; border:1px solid var(--line); border-radius:var(--control-radius); color:var(--muted); background:var(--surface-raised); }.effective-stat-option[aria-pressed=true] { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); box-shadow:inset 0 0 0 1px var(--element-anemo-primary); }.effective-stat-option :deep(.stats) { color:inherit; }
</style>
