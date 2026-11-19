<script setup lang="ts">
import {buildRollBasis} from '../domain/effective-roll-basis';
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { useAccountStore } from '../stores/account';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import { accountConfigurations, preparePreferredConfiguration, type AccountConfiguration } from '../domain/account-configurations';
import { accountSlots } from '../domain/account';
import { characterLoadoutName,equipmentConfigurationLabel } from '../domain/character-loadout-name';
import { loadAccountGameData } from '../domain/account-presentation';
import ArtifactDensitySwitch from '../components/ArtifactDensitySwitch.vue';
import CharacterConfigurationCard from '../components/CharacterConfigurationCard.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import LibraryShortcuts from '../components/LibraryShortcuts.vue';
import GameIcon from '../components/GameIcon.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import FilterPanel from '../components/FilterPanel.vue';
import SortPanel from '../components/SortPanel.vue';
import FilterActions from '../components/FilterActions.vue';
import LibraryPagination from '../components/LibraryPagination.vue';
import LibraryListHeader from '../components/LibraryListHeader.vue';
import ContextMenu from '../components/ContextMenu.vue';
import {configurationSortDefaults,useLibraryViewStore} from '../stores/library-view';
import {effectiveTotal} from '../domain/artifact-combinations';
import {hasLocalConfiguration,planConfigurationRemoval} from '../domain/account-configurations';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import { configurationSignature } from '../domain/character-loadout-name';
const props=defineProps<{characterId?:string;selectable?:boolean;currentPresetId?:string;beforeAdopt?:(action:()=>void)=>void}>();
const emit=defineEmits<{select:[characterId:string,presetId:string];pickRole:[];adopted:[];deleted:[characterId:string,presetId:string]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore();
const data=ref<Awaited<ReturnType<typeof loadAccountGameData>>>(),error=ref('');
const pendingPreferred=ref<AccountConfiguration>();
let adoptionBaseline='';
function requestPreferred(configuration:AccountConfiguration) {
  const open=()=>{try{preparePreferredConfiguration(account.account,configuration);adoptionBaseline=JSON.stringify(account.account);pendingPreferred.value=configuration;error.value='';}catch(cause){error.value=cause instanceof Error?cause.message:'配置不可采用。';}};
  if(props.beforeAdopt)props.beforeAdopt(open);else open();
}
function confirmPreferred() {
  const configuration=pendingPreferred.value;if(!configuration)return;
  try {
    if(JSON.stringify(account.account)!==adoptionBaseline)throw new Error('账号已变化，请重新核对配置。');
    const {next,current}=preparePreferredConfiguration(account.account,configuration);
    if(!loadouts.loadouts.some(item=>item.accountId===account.account.id && item.characterId===current.id && configurationSignature(item.snapshot.characters[0])===configurationSignature(current)))loadouts.save(characterLoadoutName(current,account.account,loadouts.effectiveStats(account.account.id,current.id,current.name),data.value?.catalog.sets ?? []),account.account,current);
    account.commitEdit(next);pendingPreferred.value=undefined;emit('adopted');
  }catch(cause){error.value=cause instanceof Error?cause.message:'未更改首选。';pendingPreferred.value=undefined;}
}
onMounted(async()=>{try{data.value=await loadAccountGameData();}catch{error.value='套装目录加载失败，请重新打开。';}});
const listRoot=ref<HTMLElement>();
const views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id));
const localQuery=ref(''),localFilter=ref('all'),localSort=ref<string>(configurationSortDefaults.key),localDirection=ref<'asc'|'desc'>(configurationSortDefaults.direction),localPage=ref(1);
const query=computed({get:()=>props.selectable?localQuery.value:view.value.configurationQuery,set:value=>{if(props.selectable)localQuery.value=value;else view.value.configurationQuery=value;}});
const filter=computed({get:()=>props.selectable?localFilter.value:view.value.configurationFilter,set:value=>{if(props.selectable)localFilter.value=value;else view.value.configurationFilter=value;}});
const sort=computed({get:()=>props.selectable?localSort.value:view.value.configurationSort,set:value=>{if(props.selectable)localSort.value=value;else view.value.configurationSort=value;}});
const direction=computed({get:()=>props.selectable?localDirection.value:view.value.configurationDirection,set:value=>{if(props.selectable)localDirection.value=value;else view.value.configurationDirection=value;}});
const page=computed({get:()=>props.selectable?localPage.value:view.value.configurationPage,set:value=>{if(props.selectable)localPage.value=value;else view.value.configurationPage=value;}});
const filterOpen=ref(false),sortOpen=ref(false);
const selectedRole=computed(()=>props.selectable?'':view.value.characterId);
const compact=computed(()=>!props.selectable && view.value.configurationDensity==='compact');
const selectedCharacter=computed(()=>account.account.characters.find(character=>character.id===selectedRole.value));
watch([selectedRole,selectedCharacter],([id,character])=>{
  if(id && !character)view.value.characterId='';
},{immediate:true});
function resetSort(){sort.value=configurationSortDefaults.key;direction.value=configurationSortDefaults.direction;}
function resetConditions(){
  filter.value='all';
  resetSort();
  if(!props.selectable)view.value.characterId='';
}
const allConfigurations=computed(()=>accountConfigurations(account.account,loadouts.loadouts).filter(item=>(!props.characterId || item.character.id===props.characterId) && (item.presetId || hasLocalConfiguration(item.character))));
const presentations=computed(()=>{
  const sets=data.value?.catalog.sets ?? [];
  const fullSetNames=new Map(sets.map(set=>[set.id,set.name]));
  const indexes=new Map<object,Map<string,typeof account.account.artifacts[number]>>();
  const masks=new Map<string,ReturnType<typeof loadouts.effectiveStats>>();
  return new Map(allConfigurations.value.map(configuration=>{
    let index=indexes.get(configuration.source);if(!index){index=new Map(configuration.source.artifacts.map(item=>[item.id,item]));indexes.set(configuration.source,index);}
    const entries=accountSlots.map(slot=>({slot,item:index!.get(configuration.character.equipment[slot] ?? '')}));
    const items=entries.flatMap(entry=>entry.item?[entry.item]:[]);
    let selected=masks.get(configuration.character.id);if(!selected){selected=loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name);masks.set(configuration.character.id,selected);}
    const basis=buildRollBasis(configuration.character.build),total=effectiveTotal(items,selected,basis) ?? -1;
    const label=equipmentConfigurationLabel(items,selected,sets,basis,configuration.character.build?.weapon.name ?? '未配武器',Math.max(0,total));
    const equippedSets=items.map(item=>item.real && !item.mona?.setIdentityPending?fullSetNames.get(item.real.setId):undefined);
    const searchText=[configuration.character.name,label,...equippedSets].join(' ');
    return [configuration.id,{entries,stats:selected,basis,total,name:label,searchText}] as const;
  }));
});
const configurations=computed(()=>{
  const search=query.value.trim();
  const matches=allConfigurations.value.filter(item=>(!selectedRole.value || item.character.id===selectedRole.value)
    && (!search || presentations.value.get(item.id)!.searchText.includes(search))
    && (filter.value==='all' || (filter.value==='preferred')===!item.presetId));
  const sign=direction.value==='asc'?1:-1;
  return matches.sort((a,b)=>{
    const byPreference=Number(!!a.presetId)-Number(!!b.presetId);
    if(sort.value==='preferred')return byPreference;
    const byRolls=sign*(presentations.value.get(a.id)!.total-presentations.value.get(b.id)!.total);
    return byRolls || byPreference;
  });
});
const pages=computed(()=>Math.max(1,Math.ceil(configurations.value.length/5)));
const visible = computed(() => configurations.value.slice((page.value-1)*5,page.value*5)
  .map(configuration => ({ configuration, presentation: presentations.value.get(configuration.id)! })));
watch([query,filter,sort,direction,selectedRole,()=>props.characterId],()=>{page.value=1;menu.value=undefined;});
watch(pages,value=>{page.value=Math.max(1,Math.min(page.value,value));});
function open(configuration:AccountConfiguration){if(!(props.selectable && props.currentPresetId===configuration.presetId))emit('select',configuration.character.id,configuration.presetId);}
const menu=ref<{configuration:AccountConfiguration;x:number;y:number}>();
function openMenu(event:MouseEvent,configuration:AccountConfiguration){menu.value={configuration,x:event.clientX,y:event.clientY};}
function menuKey(event:KeyboardEvent,configuration:AccountConfiguration){if(event.key==='ContextMenu' || event.shiftKey && event.key==='F10'){event.preventDefault();const box=(event.currentTarget as HTMLElement).getBoundingClientRect();menu.value={configuration,x:box.left+12,y:box.top+12};}}
function menuAction(id:string){const configuration=menu.value?.configuration;menu.value=undefined;if(!configuration)return;if(id==='details')open(configuration);else requestDelete(configuration);}
const deleting=ref<AccountConfiguration>(),deletePlan=ref<ReturnType<typeof planConfigurationRemoval>>();let deleteBaseline='';let deleteFocus:HTMLButtonElement|undefined;
function cancelDelete(){deleting.value=undefined;nextTick(()=>{if(deleteFocus?.isConnected)deleteFocus.focus();});}
function requestDelete(configuration:AccountConfiguration){const action=()=>{try{deleteFocus=Array.from(listRoot.value?.querySelectorAll<HTMLElement>('.configuration-row') ?? []).find(row=>row.dataset.configurationId===configuration.id)?.querySelector<HTMLButtonElement>('.configuration-open') ?? undefined;deletePlan.value=planConfigurationRemoval(account.account,loadouts.loadouts,configuration.character.id,configuration.presetId);deleteBaseline=JSON.stringify([account.account,loadouts.loadouts]);deleting.value=configuration;error.value='';}catch(cause){error.value=cause instanceof Error?cause.message:'配置无法清除。';}};if(props.beforeAdopt)props.beforeAdopt(action);else action();}
function confirmDelete(){const configuration=deleting.value;if(!configuration)return;try{if(JSON.stringify([account.account,loadouts.loadouts])!==deleteBaseline)throw new Error('资料已变化，请重新确认清除。');const plan=planConfigurationRemoval(account.account,loadouts.loadouts,configuration.character.id,configuration.presetId);loadouts.removeMany(plan.removedIds,()=>{if(plan.accountChanged)account.commitEdit(plan.next);});deleting.value=undefined;emit('deleted',configuration.character.id,configuration.presetId);nextTick(()=>listRoot.value?.querySelector<HTMLInputElement>('[aria-label="搜索角色配置"]')?.focus());}catch(cause){error.value=cause instanceof Error?cause.message:'清除失败，原配置保持不变。';deleting.value=undefined;}}
</script>
<template>
  <div ref="listRoot" class="character-configuration-list">
    <LibraryToolbar v-model="query" label="搜索角色配置" placeholder="查找角色、套装或武器…"
      :filter-count="Number(filter!=='all')+Number(!!selectedRole)" :sorted="sort!==configurationSortDefaults.key || direction!==configurationSortDefaults.direction"
      @filter="filterOpen=true" @sort="sortOpen=true" @reset="resetConditions" />
    <div v-if="!selectable" class="configuration-shortcuts">
      <LibraryShortcuts :model-value="selectedRole?[selectedRole]:[]" label="按角色筛选" all-label="全部角色" kind="characters" @update:model-value="view.characterId=''">
        <button type="button" class="configuration-role-picker" aria-label="选择角色" aria-haspopup="dialog"
          :aria-description="selectedCharacter?.name" :title="selectedCharacter?.name" :data-active="selectedRole || undefined" @click="emit('pickRole')">
          <GameIcon v-if="selectedCharacter" kind="characters" :id="selectedCharacter.build?.character.id" :name="selectedCharacter.name" :size="24" />
          <span>{{ selectedCharacter?.name ?? '选择角色' }}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </LibraryShortcuts>
      <ArtifactDensitySwitch v-model="view.configurationDensity" class="configuration-density" />
    </div>
    <p v-if="error || loadouts.error" role="alert">{{ error || loadouts.error }}</p>
    <LibraryListHeader v-model:page="page" :pages="pages" :count="configurations.length" :total="allConfigurations.length" unit="套配置" />
    <div v-if="visible.length" class="configuration-cards" :class="{compact}">
      <CharacterConfigurationCard v-for="{ configuration, presentation } in visible" :key="configuration.id"
        :character-name="configuration.character.name" :build="configuration.character.build"
        :configuration-name="presentation.name" :entries="presentation.entries" :basis="presentation.basis"
        :effective-stats="presentation.stats" :preferred="!configuration.presetId" :compact="compact"
        :current="selectable && currentPresetId === configuration.presetId"
        :open-label="`${selectable?'选择':'查看'}${configuration.character.name}${configuration.presetId?'备选':'首选'}配置`"
        :data-preset-id="configuration.presetId" :data-configuration-id="configuration.id"
        @open="open(configuration)" @open-keydown="menuKey($event,configuration)" @contextmenu.prevent="openMenu($event,configuration)">
        <template v-if="selectable && configuration.presetId" #actions>
          <button type="button" class="ui-action soft configuration-prefer" data-size="md"
            :aria-label="`设${configuration.character.name}此配置为首选`" @click="requestPreferred(configuration)">设为首选</button>
        </template>
      </CharacterConfigurationCard>
    </div>
    <LibraryPagination v-model:page="page" :pages="pages" always position="底部" full />
    <p v-if="!configurations.length" class="configuration-empty">{{ query || filter!=='all' || selectedRole?'没有匹配的配置，请调整筛选。':'还没有本地配置，请前往角色库保存。' }}</p>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" label="配置操作" :options="[{id:'details',label:'查看详情'},{id:'delete',label:'删除',danger:true}]" @close="menu=undefined" @select="menuAction" />
    <ConfirmationDialog v-if="deleting" title="清除配置？" confirm-label="确认清除" @cancel="cancelDelete" @confirm="confirmDelete"><p>清除「{{ deleting.character.name }}」的{{ deleting.presetId?'这份备选':'首选' }}配置。</p><p v-if="deletePlan?.promotedId">下一份备选将接替首选。</p><p>圣遗物库存与展柜信息保留。</p></ConfirmationDialog>
    <ConfirmationDialog v-if="pendingPreferred" title="设为首选配置？" :danger="false" confirm-label="确认设为首选" @cancel="pendingPreferred=undefined" @confirm="confirmPreferred"><p>采用此配置，原首选保留为备选。</p></ConfirmationDialog>
    <WorkbenchDialog v-if="filterOpen" title="筛选角色配置" size="filter" @close="filterOpen=false"><FilterPanel><section><h3>配置类型</h3><ChoiceGroup stretch v-model="filter" label="配置类型" :options="[{value:'all',label:'全部'},{value:'preferred',label:'首选'},{value:'alternate',label:'备选'}]" /></section></FilterPanel><template #footer><FilterActions flush @reset="filter='all'" @confirm="filterOpen=false" /></template></WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="配置排序" size="filter" @close="sortOpen=false">
      <SortPanel v-model="sort" v-model:direction="direction" :fixed-order="sort==='preferred'"
        :options="[{value:'rolls',label:'有效词条数'},{value:'preferred',label:'首选优先'}]" @reset="resetSort" @confirm="sortOpen=false" />
    </WorkbenchDialog>
  </div>
</template>
<style scoped>
.character-configuration-list { display:grid; gap:12px; min-width:0; container:configuration-list / inline-size; }
.configuration-shortcuts { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.configuration-role-picker { min-width:0; max-width:224px; }
.configuration-role-picker > span:not(.game-icon) { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.configuration-role-picker > svg { flex:none; width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.8; }
.configuration-density { margin-inline-start:auto; }
.configuration-cards { display:grid; gap:12px; min-width:0; }
.configuration-cards.compact { gap:10px; align-items:start; }
@container configuration-list (max-width:390px) {
  .configuration-role-picker { max-width:112px; }
  .configuration-density :deep(svg) { display:none; }
}
@container configuration-list (min-width:640px) {
  .configuration-cards.compact { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
.configuration-empty { margin:0; color:var(--muted); font-size:var(--font-body); }
.configuration-prefer { position:relative; z-index:2; font-size:var(--font-control); font-weight:700; }
</style>
