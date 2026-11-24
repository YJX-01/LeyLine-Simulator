<script setup lang="ts">
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import { computed, defineAsyncComponent, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { cloneAccount, accountSlots, type AccountCharacter } from '../domain/account';
import { buildRollBasis } from '../domain/effective-roll-basis';
import { effectiveRollBreakdown } from '../domain/character-loadout-name';
import { hasLocalConfiguration, hasCharacterInformation, localConfigurationComplete as configurationReady } from '../domain/account-configurations';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import CharacterDetailDialog from './CharacterDetailDialog.vue';
import { useAccountStore } from '../stores/account';
import { localDataErrorLabel } from '../domain/workbench-labels';
import { loadAccountGameData } from '../domain/account-presentation';
import { showcaseArtifact } from '../domain/enka-import';
import type { GameCatalog } from '@leyline/game-data';
import { previewMonaSetRepairs, confirmMonaImport, type MonaImportPreview } from '../domain/mona-import';
import ArtifactBrowser from './ArtifactBrowser.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import ManualCharacterImport from './ManualCharacterImport.vue';
import ImportActions from '../components/ImportActions.vue';
import ContextMenu from '../components/ContextMenu.vue';
import ArtifactForm from './ArtifactForm.vue';
import CharacterCardPortraits from '../components/CharacterCardPortraits.vue';
import CharacterLibraryTools from '../components/CharacterLibraryTools.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryListHeader from '../components/LibraryListHeader.vue';
import LibraryPagination from '../components/LibraryPagination.vue';
import LibraryImportActions from '../components/LibraryImportActions.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import FavoriteMark from '../components/FavoriteMark.vue';
import { useLibraryScroll } from '../composables/use-library-scroll';
import { useGridPageSize } from '../composables/use-grid-page-size';
import { useLibraryPreferencesStore } from '../stores/library-preferences';
import { useLibraryViewStore } from '../stores/library-view';
import { characterListGroup } from '../domain/elemental-forms';
import { teamArtifactEntries, teamMemberName, type TeamMember } from '../domain/team-members';
import { releaseMetadata, compareReleaseNewest } from '../domain/catalog-release';
const EnkaImport = defineAsyncComponent(() => import('./EnkaImport.vue'));
const enkaImport=ref<InstanceType<typeof EnkaImport>>();
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));
const monaImport=ref<InstanceType<typeof MonaImport>>();

const props = defineProps<{ page: 'characters' | 'artifacts'; pick?:boolean; selectedId?:string; pickMembers?:readonly TeamMember[]; pickShowcase?:boolean }>();
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
const preferences = useLibraryPreferencesStore();
const views = useLibraryViewStore();
const characterView = computed(() => views.forAccount(account.value.id));
const pickerCharacterOffset = ref(0);
const characterOffset = computed({
  get: () => props.pick ? pickerCharacterOffset.value : characterView.value.characterOffset,
  set: value => { if (props.pick) pickerCharacterOffset.value = value; else characterView.value.characterOffset = value; },
});
const characterGrid = ref<HTMLElement>();
const characterDensity = ref<'relaxed'|'compact'>('relaxed');
const characterRows = computed(() => ({ relaxed: preferences.rows.characters, compact: preferences.rows.characters }));
const characterPageSize = useGridPageSize(characterGrid, characterDensity, characterRows);
const inventoryIndex = computed(() => new Map(account.value.artifacts.map((item, index) => [item.id, { item, index }])));
const loadouts = useCharacterLoadoutsStore();
const characterMenu=ref<{id:string;x:number;y:number}>(),deleteCharacterId=ref('');
let deleteCharacterBaseline='';
const deletingCharacter=computed(()=>account.value.characters.find(item=>item.id===deleteCharacterId.value));
function openCharacterMenu(event:MouseEvent,id:string){
  if(props.pick)return;event.preventDefault();const trigger=event.currentTarget as HTMLElement;trigger.focus();const bounds=trigger.getBoundingClientRect();
  characterMenu.value={id,x:event.clientX || bounds.left+24,y:event.clientY || bounds.top+24};
}
function characterMenuAction(action:string){
  const selected=characterMenu.value;if(!selected)return;characterMenu.value=undefined;
  if(action==='details')openCharacter(selected.id);
  else{deleteCharacterId.value=selected.id;deleteCharacterBaseline=JSON.stringify(account.value);}
}
function deleteCharacter(){
  const target=deletingCharacter.value;if(!target)return;
  try{
    if(JSON.stringify(account.value)!==deleteCharacterBaseline)throw new Error('账号已变化，请重新核对后删除。');
    const next=cloneAccount(account.value);next.characters=next.characters.filter(item=>item.id!==target.id);
    loadouts.removeCharacter(account.value.id,target.id,()=>store.commitEdit(next));
    if(characterId.value===target.id)characterId.value='';
    deleteCharacterId.value='';error.value='';notice.value=`已彻底删除「${target.name}」，圣遗物保留在库中。`;
  }catch(cause){error.value=cause instanceof Error?cause.message:'角色未删除。';deleteCharacterId.value='';}
}
const inventoryBrowser=ref<InstanceType<typeof ArtifactBrowser>>();
const favoriteFilter=props.pick?ref<string[]>([]):context.characterFavoriteFilter;
watch(()=>account.value.id,()=>{favoriteFilter.value=[];});

const detail = shallowRef<{ id: string; presetId: string }>();
const editor = ref<InstanceType<typeof CharacterDetailDialog>>();
const manual = ref<InstanceType<typeof ManualCharacterImport>>();
function openCharacter(id: string, presetId = '') {
  characterId.value = id;
  detail.value = { id, presetId };
}
function closeCharacter() {
  detail.value = undefined;
}
function requestLeave(action: () => void) {
  const current = editor.value ?? manual.value ?? inventoryBrowser.value;
  if (current) current.requestLeave(action);
  else action();
}
defineExpose({ requestLeave });
watch([()=>account.value.id,()=>props.page],()=>{characterMenu.value=undefined;deleteCharacterId.value='';closeCharacter();modal.value='';});
const modal = ref<'import' | 'create' | 'equipment' | 'artifact' | 'repair' | 'network' | 'filters' | 'sort' | ''>('');
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
const catalog = shallowRef<GameCatalog>();
onMounted(async () => { try { catalog.value = (await loadAccountGameData()).catalog; } catch { error.value = '目录加载失败，角色资料仍保留。'; } });
const sortOptions = [{value:'release',label:'实装版本'},{value:'favorite',label:'收藏等级'},{value:'name',label:'名称'},{value:'level',label:'等级'},{value:'constellation',label:'命座'},{value:'rolls',label:'有效词条数'}];
const metadata = (entry: typeof account.value.characters[number]) => entry.build?.character.identity ?? catalog.value?.characters.find(item => item.name === entry.name);
const characterRelease = (entry: typeof account.value.characters[number]) => releaseMetadata('characters',entry.build?.character.id,entry.name);
function roleRolls(entry:AccountCharacter) {
  const stats=loadouts.effectiveStats(account.value.id,entry.id,entry.name);
  const items=props.pickMembers || props.pickShowcase ? teamArtifactEntries(entry.build).flatMap(slot => slot.item ?? []) : inventoryEquipment(entry);
  return effectiveRollBreakdown(items,buildRollBasis(Object.values(entry.equipment).some(Boolean)?entry.build:entry.showcase?.build ?? entry.build)).filter(group=>group.members.some(stat=>stats.includes(stat))).reduce((sum,row)=>sum+(row.value ?? 0),0);
}
const availableCharacters = computed(() => {
  const characters: AccountCharacter[] = props.pickMembers?.map(member => ({
    id: member.id, name: teamMemberName(member), attack: 0, weapon: member.build?.weapon?.name ?? '', equipment: {}, build: member.build,
  })) ?? (props.pickShowcase ? account.value.characters.flatMap(entry => entry.showcase ? [{ ...entry, equipment: {}, build: entry.showcase.build }] : []) : account.value.characters);
  if (props.pickMembers) return characters;
  return characters.filter(entry => hasCharacterInformation(entry) || loadouts.loadouts.some(item =>
    item.accountId === account.value.id && item.characterId === entry.id && hasLocalConfiguration(item.snapshot.characters[0])));
});
const visibleCharacters = computed(() => {
  const items = availableCharacters.value.filter(entry => {
    const meta=metadata(entry);
    return (!favoriteFilter.value.length || favoriteFilter.value.includes(String(loadouts.favoriteLevel(account.value.id,entry.id)))) && entry.name.includes(query.value.trim()) && (!elementFilter.value.length || (meta && elementFilter.value.includes(meta.element)))
      && (!rarityFilter.value.length || rarityFilter.value.includes(String(characterRelease(entry)?.rarity)))
      && (!weaponFilter.value.length || (meta && weaponFilter.value.includes(meta.weaponType)));
  });
  return items.sort((a,b) => characterListGroup(a.build?.character.id ?? catalog.value?.characters.find(item=>item.name===a.name)?.id)-characterListGroup(b.build?.character.id ?? catalog.value?.characters.find(item=>item.name===b.name)?.id) || (sortDirection.value==='desc'?1:-1)*(sort.value==='favorite' ? loadouts.favoriteLevel(account.value.id,b.id)-loadouts.favoriteLevel(account.value.id,a.id) : sort.value==='release' ? compareReleaseNewest(characterRelease(a),characterRelease(b)) : sort.value==='level' ? (b.build?.level??-1)-(a.build?.level??-1) : sort.value==='constellation' ? (b.build?.constellation??-1)-(a.build?.constellation??-1) : sort.value==='rolls' ? roleRolls(b)-roleRolls(a) : sort.value==='name'?b.name.localeCompare(a.name,'zh-CN'):0) || a.name.localeCompare(b.name,'zh-CN'));
});
const characterPages = computed(() => Math.max(1, Math.ceil(visibleCharacters.value.length / characterPageSize.value)));
const characterPage = computed({
  get: () => Math.min(characterPages.value, Math.floor(characterOffset.value / characterPageSize.value) + 1),
  set: value => { characterOffset.value = (Math.max(1, Math.min(value, characterPages.value)) - 1) * characterPageSize.value; },
});
watch([query,elementFilter,weaponFilter,rarityFilter,favoriteFilter,sort,sortDirection], () => {
  if (!props.pick) characterPage.value = 1;
}, { deep: true });
watch([characterPages,characterPageSize,() => account.value.id], () => {
  const lastOffset = (characterPages.value - 1) * characterPageSize.value;
  if (characterOffset.value > lastOffset) characterOffset.value = lastOffset;
});
const galleryEntries = computed(()=>(props.pick ? visibleCharacters.value : visibleCharacters.value.slice(
  (characterPage.value - 1) * characterPageSize.value, characterPage.value * characterPageSize.value,
)).map(entry=>({
  ...entry, presetId:'', galleryKey:entry.id, ready:props.pickMembers || props.pickShowcase ? entry.build?.artifacts.length === accountSlots.length : configurationReady(account.value,entry),
  artifacts: props.pickMembers || props.pickShowcase ? teamArtifactEntries(entry.build).flatMap(slot => slot.item ?? []) : Object.keys(entry.equipment).length ? inventoryEquipment(entry) : accountSlots.flatMap(slot=>showcaseArtifact(entry,slot) ?? []),
})));
function openGallery(entry: { id: string; presetId: string }) {
  if (props.pick) emit('select', entry.id);
  else openCharacter(entry.id, entry.presetId);
}
function resetFilters() { elementFilter.value=[]; weaponFilter.value=[]; rarityFilter.value=[]; favoriteFilter.value=[]; }
function showImportedCharacter(id:string) {
  query.value='';resetFilters();modal.value='';characterId.value=id;
  void nextTick(() => {
    const index = visibleCharacters.value.findIndex(entry => entry.id === id);
    if (index >= 0) characterPage.value = Math.floor(index / characterPageSize.value) + 1;
  });
}
function inventoryEquipment(entry: AccountCharacter) {
  return Object.values(entry.equipment).flatMap(id => inventoryIndex.value.get(id) ?? [])
    .sort((a,b)=>a.index-b.index).map(({item})=>item);
}

</script>

<template>
  <section class="account-library panel" :class="{'pick-mode':props.pick,'library-page':!props.pick}">
    <LibraryCornerOrnaments v-if="!props.pick" />

    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>

    <template v-if="page === 'characters'">
      <div class="character-library-list">
        <CharacterLibraryTools v-model:query="query" v-model:elements="elementFilter" v-model:weapons="weaponFilter" v-model:rarities="rarityFilter" v-model:favorites="favoriteFilter" v-model:sort="sort" v-model:direction="sortDirection" label="搜索账号角色" :sort-options="sortOptions"><template v-if="!props.pick" #actions><LibraryImportActions :mona="false" showcase @showcase="modal='network'" @create="modal='create'" /></template></CharacterLibraryTools>

        <LibraryListHeader v-if="!props.pick" v-model:page="characterPage" :pages="characterPages" :count="visibleCharacters.length" :total="availableCharacters.length" unit="名角色" />
        <div v-if="galleryEntries.length" ref="characterGrid" class="character-cards">
          <button v-for="entry in galleryEntries" :key="entry.galleryKey" class="character-card" :data-density="pick ? 'compact' : undefined" :data-current="pick && selectedId === entry.id" :data-card-action="pick ? 'select' : 'detail'" :class="{ 'equipment-slot-card': pick, selected:props.pick ? props.selectedId===entry.id : characterId === entry.id && (detail?.presetId ?? '')===entry.presetId }" :aria-label="props.pick ? `选择${entry.name}` : `查看${entry.name}详情`" @click="openGallery(entry)" @contextmenu="openCharacterMenu($event,entry.id)">
            <span class="character-card-header">
              <span class="character-card-status">
                <StatusBadge :label="entry.ready ? '就绪' : '缺失'" :state="entry.ready ? 'complete' : 'missing'"
                  :description="props.pickShowcase || props.pickMembers ? (entry.ready ? '配装快照的培养资料和五件圣遗物齐全' : '配装快照的培养资料或圣遗物尚未齐全') : (entry.ready ? '培养资料与五个部位的本地实物配置齐全' : '本地培养资料或五个部位的实物配置尚未齐全')"
                  :accessible-name="(props.pickShowcase ? '展柜配置' : props.pickMembers ? '队员配置' : '本地配置') + (entry.ready ? '就绪' : '缺失')" />
                <StatusBadge v-if="entry.showcase" label="展柜" tone="electro" state="complete" description="有独立展柜快照" accessible-name="有展柜信息" />
              </span>
              <strong>{{ entry.name }}</strong>
              <span v-if="loadouts.favoriteLevel(account.id,entry.id)" class="card-favorite" :aria-label="`${loadouts.favoriteLevel(account.id,entry.id)}级收藏`"><FavoriteMark :level="loadouts.favoriteLevel(account.id,entry.id)" /></span>
            </span>
            <CharacterCardPortraits :build="entry.build" :name="entry.name" :artifacts="entry.artifacts" />
          </button>
        </div>
        <LibraryEmptyState v-if="!visibleCharacters.length && pickMembers" title="没有符合条件的队员" action="清除搜索与筛选" @action="query='';resetFilters()" />
        <LibraryEmptyState v-else-if="!visibleCharacters.length" title="角色库还是空的" filtered-title="没有符合条件的角色"
          :filtered="!!availableCharacters.length" create-label="手动添加角色"
          @create="modal='create'" @clear="query='';resetFilters()" />
        <LibraryPagination v-if="!props.pick" v-model:page="characterPage" :pages="characterPages" always position="底部" full />
      </div>
      <ContextMenu v-if="characterMenu && !props.pick" :x="characterMenu.x" :y="characterMenu.y" label="角色操作" :options="[{id:'details',label:'查看详情'},{id:'delete',label:'彻底删除',danger:true}]" @close="characterMenu=undefined" @select="characterMenuAction" />
      <ConfirmationDialog v-if="deletingCharacter" title="彻底删除角色？" confirm-label="彻底删除" @cancel="deleteCharacterId=''" @confirm="deleteCharacter"><p>清除「{{ deletingCharacter.name }}」的本地、展柜、全部配装和收藏。</p><p>圣遗物保留在库中。</p></ConfirmationDialog>
      <ManualCharacterImport ref="manual" v-if="modal==='create'" @saved="openCharacter" @close="modal=''" />
      <CharacterDetailDialog v-if="detail" ref="editor" :key="detail.id" :character-id="detail.id" :preset-id="detail.presetId" @close="closeCharacter" />
    </template>
    <template v-else>

      <WorkbenchDialog v-if="modal === 'repair' && repairPreview" title="核对已导入套装" @close="modal = ''"><p>根据莫娜 7.2.02 核实套装身份，仅补全未经手动修改的物品，不改变词条或穿戴关系。</p><p v-for="update in repairPreview.updates" :key="update.item.id">{{ update.item.mona?.sourceSetName }} → {{ update.item.name }}</p><p v-for="message in repairPreview.skipped" :key="message">{{ message }}</p><p v-if="!repairPreview.updates.length">没有可以直接补全的物品。</p><button :disabled="!repairPreview.updates.length" @click="repairSets">确认补全 {{ repairPreview.updates.length }} 件套装身份</button></WorkbenchDialog>
      <ArtifactBrowser ref="inventoryBrowser" @create="modal='artifact'"><template #actions><LibraryImportActions create-label="手动添加圣遗物" @mona="modal='import'" @create="modal='artifact'" /><button v-if="account.artifacts.some(item => item.mona?.setIdentityPending)" class="ui-muted-button" :disabled="checkingSets" @click="inspectSets">核对已导入套装</button></template></ArtifactBrowser>

      <WorkbenchDialog v-if="modal === 'artifact'" class="manual-artifact-dialog" title="手动添加圣遗物" @close="modal = ''"><ArtifactForm @close="modal = ''" /></WorkbenchDialog>
    </template>
    <WorkbenchDialog v-if="modal === 'network'" title="从角色展柜导入" sticky-footer @close="modal = ''"><EnkaImport ref="enkaImport" @imported="showImportedCharacter" @close="modal = ''" /><template #footer><ImportActions tone="electro" :label="enkaImport?.confirmLabel" :ready="enkaImport?.canConfirm" :show-confirm="!!enkaImport?.hasPreview" :busy="enkaImport?.busy" @cancel="modal=''" @confirm="enkaImport?.confirm()" /></template></WorkbenchDialog>
    <WorkbenchDialog v-if="modal === 'import'" title="导入莫娜圣遗物" sticky-footer @close="modal = ''"><MonaImport ref="monaImport" automatic @imported="modal=''" /><template #footer><ImportActions tone="hydro" :label="monaImport?.confirmLabel" :ready="monaImport?.canConfirm" :show-confirm="!!monaImport?.hasPreview" :busy="monaImport?.busy" @cancel="modal=''" @confirm="monaImport?.confirm()" /></template></WorkbenchDialog>
  </section>
</template>

<style scoped>
.character-library-list { display:grid; gap:12px; min-width:0; }
.character-library-list :deep(.character-shortcut-row) { margin:0; }
.character-card-header { position:relative; display:grid; grid-template-columns:var(--character-card-media-columns); align-items:center; gap:var(--character-card-media-gap); width:100%; }
.character-card-header > strong { grid-column:2; grid-row:1; text-align:center; font-size:var(--font-control); line-height:22px; overflow-wrap:anywhere; }
.character-card-status { grid-column:1; grid-row:1; justify-self:start; display:grid; grid-template-columns:repeat(auto-fill,minmax(36px,1fr)); gap:4px; width:var(--character-card-equipment-size); }
.character-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,312px),1fr)); justify-content:center; gap:12px; margin:0; }
:where(.character-cards) .character-card {
  --character-card-media-gap:8px;
  --character-card-media-width:min(280px,calc(100cqi - 2 * var(--character-card-media-gap)));
  --character-card-equipment-size:calc(var(--character-card-media-width) * 88 / 280);
  --character-card-character-size:calc(var(--character-card-media-width) * 104 / 280);
  --character-card-media-columns:minmax(0,1fr) var(--character-card-character-size) minmax(0,1fr);
  container-type:inline-size; width:100%; max-width:360px; justify-self:center; display:flex; flex-direction:column;
  align-items:flex-start; gap:6px; min-width:0; padding:10px 7px 12px; color:var(--ink); text-align:left;
  background:var(--surface);
}
@media(max-width:550px){.character-cards { grid-template-columns:minmax(0,1fr); }:where(.character-cards) .character-card { padding:10px 7px 12px; }}

.account-library { margin: 0 30px; color: var(--text, var(--ink)); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size:var(--font-body); line-height: 1.8; }
label { font-size:var(--font-body); display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }

.account-copy { border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 12px; }
.account-note { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:0 0 16px; }.account-note strong { font-size:var(--font-body); }.account-note span { color:var(--muted); }.account-error { color: var(--element-pyro-deep); }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size:var(--font-body); overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
.account-editor { display:block; margin:0; }h2 { margin:0; font-size:var(--font-dialog); }h3 { font-size:var(--font-body); margin:0 0 14px; }.account-library { margin-inline:0; }
@media(max-width:800px) {  }
h2 { margin-top:7px; }.account-note { padding-bottom:16px; border-bottom:1px solid var(--line); }
.account-toolbar > button:last-child:not(:first-child) { background:var(--surface); color:var(--muted); border-color:var(--line); }.account-library > [role=status] { color:var(--neutral-muted); font-size:var(--font-body); padding:8px 12px; background:var(--element-dendro-light); border-radius:8px; margin-top:0; }
.account-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:32px; margin-bottom:18px; }.account-heading-info { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }.account-name { display:flex; align-items:center; gap:8px; padding:0; border:0; min-height:var(--control-height-md); color:var(--ink); background:transparent; font-size:var(--font-body); font-weight:600; }.account-name svg { width:18px; height:18px; stroke:var(--muted); stroke-width:1.6; fill:none; }.account-count { display:flex; align-items:center; gap:10px; font-size:var(--font-body); color:var(--muted); }.account-count > span { opacity:.5; }.account-feedback { position:relative; flex-shrink:0; font-size:var(--font-body); }.account-feedback > summary,.local-status { display:flex; align-items:center; gap:6px; color:var(--element-anemo-deep); cursor:pointer; list-style:none; font-size:var(--font-body); }.account-feedback summary::-webkit-details-marker { display:none; }.account-feedback summary > span { margin-left:5px; color:var(--muted); font-size:var(--font-body); }.account-feedback i,.local-status i { width:6px; height:6px; border-radius:50%; background:var(--element-anemo-primary); }.account-feedback > div { position:absolute; top:28px; right:0; width:min(320px,70vw); padding:14px; background:var(--surface-raised); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px color-mix(in srgb,var(--neutral-ink) 7.84%,transparent); z-index:5; }.account-feedback p { margin:0 0 10px; }.account-feedback button { font-size:var(--font-body); padding:6px 8px; margin-right:8px; }.character-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }.character-search { position:relative; flex:1; min-width:170px; max-width:320px; }.character-search > svg { position:absolute; width:16px; height:16px; top:12px; left:12px; stroke:var(--muted); stroke-width:1.6; fill:none; }.character-search input { height:40px; min-width:0; padding:0 12px 0 36px; background:var(--surface-raised); border-color:var(--line); font-size:var(--font-body); }.filter-trigger { height:40px; font-size:var(--font-body); padding:8px 12px; }.filter-trigger.applied { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.filter-trigger > span { padding-left:6px; }.character-import-actions { margin-left:auto; display:flex; gap:8px; }.reset-filters { padding:0; border:0; background:none; color:inherit; font-size:var(--font-body); min-height:var(--control-height-md); }.reset-filters { padding:3px 7px; color:var(--muted); }.filter-options { display:flex; flex-wrap:wrap; gap:8px; }.filter-options button { height:var(--control-height-lg); padding:0 12px; --filter-light:var(--element-anemo-light); --filter-deep:var(--element-anemo-deep); color:var(--muted); background:var(--surface); border-color:var(--line); padding:9px 15px; font-size:var(--font-body); }.filter-options button.selected { background:var(--filter-light); color:var(--filter-deep); border-color:var(--filter-deep); }.filter-panel-actions { display:flex; justify-content:space-between; margin-top:24px; }.equipment-view-tabs { display:flex; gap:8px; align-items:center; margin-top:16px; }.equipment-view-tabs button { color:var(--muted); background:var(--surface); border-color:var(--line); padding:7px 12px; font-size:var(--font-body); }.equipment-view-tabs button.active { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }.equipment-view-tabs span { color:var(--muted); font-size:var(--font-body); }.snapshot-note { color:var(--element-hydro-deep); }
@media(max-width:900px){}@media(max-width:620px){}
@media(max-width:1000px){.character-import-actions { width:100%; margin-left:0; }.character-search { max-width:none; }}@media(max-width:550px){.account-heading { align-items:flex-start; }.account-heading-info { gap:3px; flex-direction:column; align-items:flex-start; }.account-feedback > summary > span { display:none; }.character-import-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }.character-import-actions .ui-action { padding:8px 6px; font-size:var(--font-body); gap:5px; }.character-import-actions svg { width:14px; height:14px; }.equipment-view-tabs { flex-wrap:wrap; }}
.element-shortcuts { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:10px 0 14px; }
.element-shortcuts > button { display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:4px 8px; height:var(--control-height-md); min-height:var(--control-height-md); border:1px solid transparent; border-radius:6px; background:transparent; color:var(--muted); font-size:var(--font-body); }
.element-shortcuts > button[aria-pressed=true] { background:var(--filter-light,var(--element-anemo-light)); color:var(--filter-deep,var(--element-anemo-deep)); border-color:currentColor; }
.filter-options button { display:inline-flex; align-items:center; gap:6px; }

@media(max-width:550px) { .element-shortcuts { gap:4px; }.element-shortcuts > button { padding:4px 6px; } }

.account-library.pick-mode { margin:0; padding:0; border:0; box-shadow:none; background:transparent; }.account-library.pick-mode::after { display:none; }
@media(max-width:550px) { .character-card-header { grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); } }
@container(max-width:295.99px) { .character-card-header { grid-template-columns:88px minmax(0,1fr) 88px; } }
.card-favorite { grid-column:3; grid-row:1; justify-self:end; display:inline-flex; align-items:center; }
.character-filter-panel { display:grid; gap:20px; }.character-filter-panel :deep(.filter-actions) { margin:0; }.character-filter-panel h3 { margin:0 0 10px; font-size:var(--font-control); font-weight:700; }.character-filter-panel .filter-options { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }.character-filter-panel .filter-options button { display:flex; align-items:center; justify-content:center; gap:5px; padding:0 6px; height:40px; font-size:var(--font-control); font-weight:700; }.character-filter-panel .filter-options svg { width:18px; height:18px; color:var(--element-geo-deep); }.character-filter-panel .filter-panel-actions { margin:0; }
.character-filter-panel [aria-label=收藏] .filter-options { grid-template-columns:repeat(5,minmax(0,1fr)); }.character-filter-panel [aria-label=星级] .filter-options,.character-filter-panel [aria-label=武器类型] .filter-options { grid-template-columns:repeat(3,minmax(0,1fr)); }
@media(max-width:500px) { .character-filter-panel .filter-options { grid-template-columns:repeat(3,minmax(0,1fr)); }.character-filter-panel [aria-label=收藏] .filter-options,.character-filter-panel [aria-label=武器类型] .filter-options { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>

<style scoped>
.character-shortcut-row { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:12px 0; }.character-shortcut-row .reset-filters { font-size:var(--font-control); font-weight:700; }.character-header-tools { flex-wrap:wrap; }
</style>

<style scoped>
.mona-import-footer .ui-action { font-size:var(--font-control); font-weight:700; }
</style>

<style scoped>.manual-artifact-dialog :deep(.artifact-form) { width:100%; max-width:640px; margin-inline:auto; }</style>
