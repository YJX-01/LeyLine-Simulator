<script setup lang="ts">
import {buildRollBasis} from './domain/effective-roll-basis';
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { useAccountStore } from './stores/account';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { accountConfigurations, preparePreferredConfiguration, localConfigurationComplete, type AccountConfiguration } from './domain/account-configurations';
import { accountSlots } from './domain/account';
import { characterLoadoutName,equipmentConfigurationName } from './domain/character-loadout-name';
import { loadAccountGameData } from './domain/account-presentation';
import GameIcon from './components/GameIcon.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import FilterPanel from './components/FilterPanel.vue';
import SortPanel from './components/SortPanel.vue';
import FilterActions from './components/FilterActions.vue';
import LibraryPagination from './components/LibraryPagination.vue';
import LibraryListHeader from './components/LibraryListHeader.vue';
import ConfigurationTitle from './components/ConfigurationTitle.vue';
import ContextMenu from './components/ContextMenu.vue';
import EffectiveRollSummary from './components/EffectiveRollSummary.vue';
import {useLibraryViewStore} from './stores/library-view';
import {effectiveTotal} from './domain/artifact-combinations';
import {hasLocalConfiguration,planConfigurationRemoval} from './domain/account-configurations';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import WeaponPlaceholder from './components/WeaponPlaceholder.vue';
import EquipmentStrip from './components/EquipmentStrip.vue';
import { configurationSignature } from './domain/character-loadout-name';
const props=defineProps<{characterId?:string;selectable?:boolean;currentPresetId?:string;beforeAdopt?:(action:()=>void)=>void}>();
const emit=defineEmits<{select:[characterId:string,presetId:string];adopted:[];deleted:[characterId:string,presetId:string];resetRole:[]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore();
const data=ref<Awaited<ReturnType<typeof loadAccountGameData>>>(),error=ref('');
const pendingPreferred=ref<AccountConfiguration>(),transfers=ref<string[]>([]),notice=ref('');
let adoptionBaseline='';
function requestPreferred(configuration:AccountConfiguration) {
  const open=()=>{try{const prepared=preparePreferredConfiguration(account.account,configuration);adoptionBaseline=JSON.stringify(account.account);transfers.value=prepared.transfers;pendingPreferred.value=configuration;error.value='';}catch(cause){error.value=cause instanceof Error?cause.message:'配置不可采用。';}};
  if(props.beforeAdopt)props.beforeAdopt(open);else open();
}
function confirmPreferred() {
  const configuration=pendingPreferred.value;if(!configuration)return;
  try {
    if(JSON.stringify(account.account)!==adoptionBaseline)throw new Error('账号已变化，请重新核对配置。');
    const {next,current}=preparePreferredConfiguration(account.account,configuration);
    if(!loadouts.loadouts.some(item=>item.accountId===account.account.id && item.characterId===current.id && configurationSignature(item.snapshot.characters[0])===configurationSignature(current)))loadouts.save(characterLoadoutName(current,account.account,loadouts.effectiveStats(account.account.id,current.id,current.name),data.value?.catalog.sets ?? []),account.account,current);
    account.commitEdit(next);pendingPreferred.value=undefined;notice.value='已设为首选，原首选保留为备选。';emit('adopted');
  }catch(cause){error.value=cause instanceof Error?cause.message:'未更改首选。';pendingPreferred.value=undefined;}
}
onMounted(async()=>{try{data.value=await loadAccountGameData();}catch{error.value='套装目录加载失败，请重新打开。';}});
const listRoot=ref<HTMLElement>();
const views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id));
const localQuery=ref(''),localFilter=ref('all'),localSort=ref('rolls'),localDirection=ref<'asc'|'desc'>('desc'),localPage=ref(1);
const query=computed({get:()=>props.selectable?localQuery.value:view.value.configurationQuery,set:value=>{if(props.selectable)localQuery.value=value;else view.value.configurationQuery=value;}});
const filter=computed({get:()=>props.selectable?localFilter.value:view.value.configurationFilter,set:value=>{if(props.selectable)localFilter.value=value;else view.value.configurationFilter=value;}});
const sort=computed({get:()=>props.selectable?localSort.value:view.value.configurationSort,set:value=>{if(props.selectable)localSort.value=value;else view.value.configurationSort=value;}});
const direction=computed({get:()=>props.selectable?localDirection.value:view.value.configurationDirection,set:value=>{if(props.selectable)localDirection.value=value;else view.value.configurationDirection=value;}});
const page=computed({get:()=>props.selectable?localPage.value:view.value.configurationPage,set:value=>{if(props.selectable)localPage.value=value;else view.value.configurationPage=value;}});
const filterOpen=ref(false),sortOpen=ref(false);
const allConfigurations=computed(()=>accountConfigurations(account.account,loadouts.loadouts).filter(item=>(!props.characterId || item.character.id===props.characterId) && (item.presetId || hasLocalConfiguration(item.character))));
const presentations=computed(()=>{
  const indexes=new Map<object,Map<string,typeof account.account.artifacts[number]>>();
  const masks=new Map<string,ReturnType<typeof loadouts.effectiveStats>>();
  return new Map(allConfigurations.value.map(configuration=>{
    let index=indexes.get(configuration.source);if(!index){index=new Map(configuration.source.artifacts.map(item=>[item.id,item]));indexes.set(configuration.source,index);}
    const entries=accountSlots.map(slot=>({slot,item:index!.get(configuration.character.equipment[slot] ?? '')}));
    const items=entries.flatMap(entry=>entry.item?[entry.item]:[]);
    let selected=masks.get(configuration.character.id);if(!selected){selected=loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name);masks.set(configuration.character.id,selected);}
    const basis=buildRollBasis(configuration.character.realBuild),total=effectiveTotal(items,selected,basis) ?? -1;
    const label=equipmentConfigurationName(configuration.character.name,items,selected,data.value?.catalog.sets ?? [],basis,configuration.character.realBuild?.weapon.name ?? '未配武器',Math.max(0,total)).split(' · ').slice(1).join('|');
    return [configuration.id,{entries,items,stats:selected,basis,total,name:label}] as const;
  }));
});
const configurations=computed(()=>{
  const search=query.value.trim();
  return allConfigurations.value.filter(item=>(!search || `${item.character.name} ${name(item)}`.includes(search)) && (filter.value==='all' || (filter.value==='preferred')===!item.presetId)).sort((a,b)=>sort.value==='default'?Number(!!a.presetId)-Number(!!b.presetId):(direction.value==='asc'?1:-1)*(presentations.value.get(a.id)!.total-presentations.value.get(b.id)!.total));
});
const pages=computed(()=>Math.max(1,Math.ceil(configurations.value.length/5)));
const visible=computed(()=>configurations.value.slice((page.value-1)*5,page.value*5));
watch([query,filter,sort,direction,()=>props.characterId],()=>{page.value=1;menu.value=undefined;});
watch(pages,value=>{page.value=Math.max(1,Math.min(page.value,value));});
function stats(configuration:AccountConfiguration){return presentations.value.get(configuration.id)!.stats;}
function name(configuration:AccountConfiguration){return presentations.value.get(configuration.id)!.name;}
function entries(configuration:AccountConfiguration){return presentations.value.get(configuration.id)!.entries;}
function pieces(configuration:AccountConfiguration){return presentations.value.get(configuration.id)!.items;}
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
    <LibraryToolbar v-model="query" label="搜索角色配置" placeholder="查找角色、套装或武器…" :filter-count="(filter==='all'?0:1)+(!selectable && characterId?1:0)" :sorted="sort!=='rolls' || direction!=='desc'" @filter="filterOpen=true" @sort="sortOpen=true" @reset="filter='all';sort='rolls';direction='desc';emit('resetRole')"><template v-if="$slots.actions" #actions><slot name="actions" /></template></LibraryToolbar>
    <p v-if="error || loadouts.error" role="alert">{{ error || loadouts.error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <LibraryListHeader v-model:page="page" :pages="pages" :count="configurations.length" :total="allConfigurations.length" unit="套配置" />
    <article v-for="configuration in visible" :key="configuration.id" class="configuration-row" :class="{current:selectable && currentPresetId===configuration.presetId}" :data-preset-id="configuration.presetId" :data-configuration-id="configuration.id" @contextmenu.prevent="openMenu($event,configuration)">
      <div class="configuration-top"><div class="configuration-heading"><ConfigurationTitle :character-name="configuration.character.name" :name="name(configuration)" :preferred="!configuration.presetId" :current="selectable && currentPresetId===configuration.presetId" /><span v-if="configuration.character.realBuild" class="configuration-cultivation">{{ configuration.character.realBuild.level }}级 · {{ configuration.character.realBuild.constellation }}命 · 天赋 {{ configuration.character.realBuild.talents.normal }}/{{ configuration.character.realBuild.talents.skill }}/{{ configuration.character.realBuild.talents.burst }} · 武器 {{ configuration.character.realBuild.weaponLevel }}级 · 精炼{{ configuration.character.realBuild.refinement }}</span><span v-else class="configuration-cultivation">培养资料缺失 · 未配置武器</span></div><button v-if="selectable && configuration.presetId" class="ui-action soft configuration-prefer" data-size="md" :aria-label="`设${configuration.character.name}此配置为首选`" @click="requestPreferred(configuration)">设为首选</button></div>
      <EquipmentStrip :effective-stats="stats(configuration)" :entries="entries(configuration)"><template #leading><GameIcon kind="characters" :id="configuration.character.realBuild?.character.id" :name="configuration.character.name" :size="64" :level="configuration.character.realBuild?.level" :constellation="configuration.character.realBuild?.constellation" /><GameIcon v-if="configuration.character.realBuild" kind="weapons" :id="configuration.character.realBuild.weapon.id" :name="configuration.character.realBuild.weapon.name" :size="64" :level="configuration.character.realBuild.weaponLevel" :refinement="configuration.character.realBuild.refinement" /><WeaponPlaceholder v-else :size="64" /></template></EquipmentStrip>
      <EffectiveRollSummary inline :basis="presentations.get(configuration.id)!.basis" :items="pieces(configuration)" :selected-stats="stats(configuration)" />
      <button class="configuration-open" :aria-label="`${selectable?'选择':'查看'}${configuration.character.name}${configuration.presetId?'备选':'首选'}配置`" :disabled="selectable && currentPresetId===configuration.presetId" @click="open(configuration)" @keydown="menuKey($event,configuration)"></button>
    </article>
    <LibraryPagination v-model:page="page" :pages="pages" always position="底部" full />
    <p v-if="!configurations.length" class="configuration-empty">{{ query || filter!=='all'?'没有匹配的配置，请调整筛选。':'还没有本地配置，请前往角色库保存。' }}</p>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" label="配置操作" :options="[{id:'details',label:'查看详情'},{id:'delete',label:'删除',danger:true}]" @close="menu=undefined" @select="menuAction" />
    <ConfirmationDialog v-if="deleting" title="清除配置？" confirm-label="确认清除" @cancel="cancelDelete" @confirm="confirmDelete"><p>清除「{{ deleting.character.name }}」的{{ deleting.presetId?'这份备选':'首选' }}配置。</p><p v-if="deletePlan?.promotedId">下一份备选将接替首选。</p><p v-for="message in deletePlan?.transfers ?? []" :key="message">{{ message }}</p><p>圣遗物库存与展柜信息保留。</p></ConfirmationDialog>
    <ConfirmationDialog v-if="pendingPreferred" title="设为首选配置？" :danger="false" confirm-label="确认设为首选" @cancel="pendingPreferred=undefined" @confirm="confirmPreferred"><p>采用此配置，原首选保留为备选。</p><p v-for="message in transfers" :key="message">{{ message }}</p></ConfirmationDialog>
    <WorkbenchDialog v-if="filterOpen" title="筛选角色配置" size="filter" @close="filterOpen=false"><FilterPanel><section><h3>配置类型</h3><ChoiceGroup stretch v-model="filter" label="配置类型" :options="[{value:'all',label:'全部'},{value:'preferred',label:'首选'},{value:'alternate',label:'备选'}]" /></section></FilterPanel><template #footer><FilterActions flush @reset="filter='all'" @confirm="filterOpen=false" /></template></WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="配置排序" size="filter" @close="sortOpen=false"><SortPanel v-model="sort" v-model:direction="direction" :options="[{value:'default',label:'首选优先'},{value:'rolls',label:'有效词条数'}]" @reset="sort='rolls';direction='desc'" @confirm="sortOpen=false" /></WorkbenchDialog>
  </div>
</template>
<style scoped>
.character-configuration-list { display:grid; gap:12px; }.configuration-count,.configuration-empty { margin:0; color:var(--muted); font-size:var(--font-body); }.configuration-row { position:relative; display:grid; gap:12px; min-width:0; padding:16px; border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface); }.configuration-row.current { border-color:var(--element-anemo-primary); }
.configuration-top { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }.configuration-heading { display:flex; align-items:baseline; flex-wrap:wrap; flex:1; min-width:0; gap:8px 12px; }.configuration-cultivation { color:var(--muted); font-size:var(--font-body); }.configuration-prefer { position:relative; z-index:2; font-size:var(--font-control); font-weight:700; }
.configuration-open { position:absolute; inset:0; z-index:1; width:100%; height:100%; min-height:0; border:0; border-radius:inherit; background:transparent; padding:0; cursor:pointer; }.configuration-open:hover { background:transparent; box-shadow:none; }.configuration-open:disabled { opacity:1; cursor:default; }.configuration-open:focus-visible { outline:2px solid var(--element-hydro-deep); outline-offset:2px; }
@media(max-width:600px) { .configuration-top { align-items:start; }.configuration-heading { flex-basis:100%; }.configuration-row { padding:12px; } }
</style>
