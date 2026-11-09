<script setup lang="ts">
import { computed, ref, watch, onMounted, shallowRef,nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import type { RealStat } from '@leyline/schema';
import { accountSlots, accountSlotLabels, artifactOwner, type AccountArtifact, type AccountSlot, type LocalAccount } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { useAccountStore } from './stores/account';
import { releaseMetadata, compareReleaseNewest } from './domain/catalog-release';
import { useViewportPage } from './composables/use-viewport-page';
import { loadAccountGameData } from './domain/account-presentation';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactDetail from './ArtifactDetail.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import MultiSelectPicker from './components/MultiSelectPicker.vue';
import ArtifactSetFilter from './components/ArtifactSetFilter.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import LibraryShortcuts from './components/LibraryShortcuts.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';
import LibraryPagination from './components/LibraryPagination.vue';
import LibraryListHeader from './components/LibraryListHeader.vue';
import StatFilterChoices from './components/StatFilterChoices.vue';
import FilterActions from './components/FilterActions.vue';
import FilterPanel from './components/FilterPanel.vue';
import FavoriteFilter from './components/FavoriteFilter.vue';
import ArtifactLevelFilter from './components/ArtifactLevelFilter.vue';
import SortPanel from './components/SortPanel.vue';
import ArtifactSummary from './ArtifactSummary.vue';
import ContextMenu from './components/ContextMenu.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import ArtifactDensitySwitch from './components/ArtifactDensitySwitch.vue';
import {useArtifactFavoritesStore} from './stores/artifact-favorites';
import {useCharacterLoadoutsStore} from './stores/character-loadouts';
import {useArtifactCombinationsStore} from './stores/artifact-combinations';
import {artifactReferences} from './domain/artifact-references';
import {useArtifactRemoval} from './composables/use-artifact-removal';
import {accountConfigurations} from './domain/account-configurations';
const props=defineProps<{slot?:AccountSlot;pick?:boolean;inline?:boolean;account?:LocalAccount;density?:'relaxed'|'compact';effectiveStats?:readonly RealStat[]}>();
const emit=defineEmits<{select:[item:AccountArtifact]}>();
const store=useAccountStore(),context=storeToRefs(store),favorites=useArtifactFavoritesStore(),loadouts=useCharacterLoadoutsStore(),combinations=useArtifactCombinationsStore();
const inventory=computed(()=>props.account ?? store.account);
const inventoryItems=computed(()=>inventory.value.artifacts.filter(item=>item.inventoryId!==null));
const density=computed(()=>props.density ?? store.inventoryDensity);
const query=props.pick?ref(''):context.inventoryQuery;
const slotFilter=props.pick?ref<string[]>([]):context.inventorySlot;
const statFilter=props.pick?ref<string[]>([]):context.inventoryStat;
const ownerFilter=props.pick?ref<string[]>([]):context.inventoryOwner;
const favoriteFilter=props.pick?ref<string[]>([]):context.inventoryFavoriteFilter;
const setFilter=props.pick?ref<string[]>([]):context.inventorySet;
const subFilter=props.pick?ref<string[]>([]):context.inventorySubstat;
const levelFilter=props.pick?ref<string[]>([]):context.inventoryLevel;
const sort=props.pick?ref('release'):context.inventorySort;
const sortDirection=props.pick?ref<'asc'|'desc'>('desc'):context.inventorySortDirection;
const subMatch=props.pick?ref('all'):context.inventorySubMatch;
const storedPage=props.pick?ref(1):context.inventoryPage;
const selectedId=ref(''),filterOpen=ref(false),sortOpen=ref(false);
const grid=ref<HTMLElement>();
const pageSize=useViewportPage(grid,()=>density.value,!props.pick,props.pick?undefined:context.inventoryPageSize);
const activeFilters=computed(()=>[statFilter,ownerFilter,setFilter,subFilter,levelFilter,favoriteFilter].reduce((count,filter)=>count+filter.value.length,0));
function clearConditions(){slotFilter.value=[];statFilter.value=[];ownerFilter.value=[];favoriteFilter.value=[];setFilter.value=[];subFilter.value=[];levelFilter.value=[];subMatch.value='all';sort.value='release';sortDirection.value='desc';}
function resetFilters() { query.value='';slotFilter.value=[];statFilter.value=[];ownerFilter.value=[];favoriteFilter.value=[];setFilter.value=[];subFilter.value=[];levelFilter.value=[]; }
function setSortKey(key:string) { if(sort.value!==key){sort.value=key;sortDirection.value=key==='default'?'asc':'desc';} }
const artifactDetail=ref<InstanceType<typeof ArtifactDetail>>();
function requestLeave(action:()=>void) { if(artifactDetail.value)artifactDetail.value.requestLeave(action);else action(); }
function scrollToTools() { document.querySelector<HTMLElement>('.library-actions button')?.focus();window.scrollTo({top:0}); }
defineExpose({requestLeave});
const catalogSets=shallowRef<{id:string;name:string;rarity:number}[]>([]);
onMounted(async()=>{try {catalogSets.value=(await loadAccountGameData()).catalog.sets;}catch {store.error='套装目录加载失败，请重新打开库存。';}});
const sets=computed(()=>[...catalogSets.value,...[...new Set(inventoryItems.value.map(item=>item.real?.setId ?? 'legacy'))].filter(id=>!catalogSets.value.some(set=>set.id===id)).map(id=>({id,name:id.startsWith('mona-unresolved-')?'套装身份待核对':'旧版 / 散件',rarity:0}))]);
const ownerOptions=computed(()=>[{id:'free',name:'未装备'},{id:'equipped',name:'已装备'},...inventory.value.characters.map(character=>({id:character.id,name:character.name,icon:character.realBuild?.character.id}))]);
const selected=computed(()=>inventory.value.artifacts.find(item=>item.id===selectedId.value));
const owner=(item:AccountArtifact)=>artifactOwner(inventory.value,item.id)?.name;
const statOptions=Object.entries(accountStatLabels).filter(([stat])=>!stat.endsWith('Percent')).map(([stat,label])=>({stat,label:stat==='energyRecharge'?'元素充能效率':label}));
const mainOptions=computed(()=>statOptions.filter(option=>inventoryItems.value.some(item=>(!props.slot || item.slot===props.slot) && statMatches(item.real?.mainStat,option.stat))));
const subOptions=statOptions.filter(option=>['hp','attack','defense','elementalMastery','energyRecharge','critRate','critDamage'].includes(option.stat));
function statMatches(value:string|undefined,filter:string) { return value===filter || (['hp','attack','defense'].includes(filter) && value===`${filter}Percent`); }
const filtered=computed(()=>inventoryItems.value.filter(item=>{
  const hasSub=(stat:string)=>item.real?.substats.some(sub=>statMatches(sub.stat,stat));
  return (props.slot?item.slot===props.slot:!slotFilter.value.length || slotFilter.value.includes(item.slot))
    && (!statFilter.value.length || statFilter.value.some(stat=>statMatches(item.real?.mainStat,stat)))
    && (!ownerFilter.value.length || ownerFilter.value.some(id=>id==='free'?!owner(item):id==='equipped'?!!owner(item):artifactOwner(inventory.value,item.id)?.id===id))
    && (!setFilter.value.length || setFilter.value.includes(item.real?.setId ?? 'legacy'))
    && (!subFilter.value.length || (subMatch.value==='all'?subFilter.value.every(hasSub):subFilter.value.some(hasSub)))
    && (!levelFilter.value.length || levelFilter.value.includes(String(item.real?.level)))
    && (!favoriteFilter.value.length || favoriteFilter.value.includes(String(favorites.level(inventory.value.id,item.id))))
    && `${item.name} ${item.alias ?? ''} ${owner(item) ?? ''}`.includes(query.value.trim());
}));
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/pageSize.value)));
const page=computed({get:()=>Math.max(1,Math.min(storedPage.value,pages.value)),set:value=>{storedPage.value=Math.max(1,Math.min(value,pages.value));}});
const visible=computed(()=>{
  const items=filtered.value.map((item,index)=>({item,index}));
  items.sort((a,b)=>{
    const order=sort.value==='favorite'?favorites.level(inventory.value.id,a.item.id)-favorites.level(inventory.value.id,b.item.id):sort.value==='release'?-compareReleaseNewest(releaseMetadata('artifacts',a.item.real?.setId),releaseMetadata('artifacts',b.item.real?.setId)):sort.value==='level'?(a.item.real?.level ?? 0)-(b.item.real?.level ?? 0):a.index-b.index;
    return (sortDirection.value==='asc'?1:-1)*order || a.index-b.index;
  });
  return items.slice((page.value-1)*pageSize.value,page.value*pageSize.value).map(entry=>entry.item);
});
watch([query,slotFilter,statFilter,ownerFilter,favoriteFilter,setFilter,subFilter,levelFilter,subMatch,sort,sortDirection,()=>props.slot],()=>{page.value=1;},{deep:true});
watch(pageSize,(next,previous)=>{page.value=Math.floor((storedPage.value-1)*previous/next)+1;},{flush:'sync'});
watch([storedPage,pages],()=>{if(storedPage.value!==page.value)storedPage.value=page.value;},{immediate:true});
const deleteArtifact=useArtifactRemoval();
const menu=ref<{item:AccountArtifact;x:number;y:number}>(),deleting=ref<AccountArtifact>(),menuError=ref('');let deleteBaseline='';let deleteFocus:HTMLButtonElement|undefined;
const deleteReferences=computed(()=>deleting.value?artifactReferences(inventory.value,accountConfigurations(inventory.value,loadouts.loadouts),combinations.combinations,deleting.value.id):[]);
function openMenu(event:MouseEvent,item:AccountArtifact){(event.currentTarget as HTMLElement).focus({preventScroll:true});menu.value={item,x:event.clientX,y:event.clientY};}
function menuKey(event:KeyboardEvent,item:AccountArtifact){if(event.key==='ContextMenu' || event.shiftKey && event.key==='F10'){event.preventDefault();const box=(event.currentTarget as HTMLElement).getBoundingClientRect();menu.value={item,x:box.left+12,y:box.top+12};}}
function menuAction(action:string){const item=menu.value?.item;menu.value=undefined;if(!item)return;try{if(action==='details')selectedId.value=item.id;else if(action==='delete'){deleteFocus=Array.from(grid.value?.querySelectorAll<HTMLButtonElement>('.inventory-card') ?? []).find(button=>button.dataset.artifactId===item.id);deleting.value=item;deleteBaseline=JSON.stringify(inventory.value);}else favorites.set(inventory.value.id,item.id,Number(action.slice(9)));}catch{menuError.value='收藏未保存，请检查本地存储。';}}
function cancelDelete(){deleting.value=undefined;nextTick(()=>deleteFocus?.isConnected && deleteFocus.focus({preventScroll:true}));}
function remove(){try{if(JSON.stringify(inventory.value)!==deleteBaseline)throw new Error('库存已变化，请重新确认。');deleteArtifact(deleting.value!.id);deleting.value=undefined;nextTick(()=>grid.value?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}));}catch(cause){menuError.value=cause instanceof Error?cause.message:'未删除，请重试。';deleting.value=undefined;}}
watch(()=>inventory.value.id,()=>{menu.value=undefined;deleting.value=undefined;});
</script>
<template>
  <section class="artifact-browser" aria-label="圣遗物库存浏览" :data-page-size="pageSize">
    <template v-if="!inline || !selected">
      <LibraryToolbar v-model="query" label="搜索圣遗物" placeholder="查找圣遗物或装备角色" :filter-count="activeFilters+slotFilter.length" :sorted="sort!=='release' || sortDirection!=='desc'" @filter="filterOpen=true" @sort="sortOpen=true" @reset="clearConditions"><template v-if="$slots.actions" #actions><slot name="actions" /></template></LibraryToolbar>
      <div class="inventory-options"><LibraryShortcuts v-if="!slot" v-model="slotFilter" class="slot-tabs" label="筛选圣遗物部位" all-label="全部部位" kind="artifactSlots" :mobile-columns="3" :options="accountSlots.map(slot=>({value:slot,label:accountSlotLabels[slot]}))" /><button v-if="activeFilters || query || slotFilter.length" class="inventory-reset" @click="resetFilters">清除筛选</button><ArtifactDensitySwitch v-if="!props.density" class="density-options" :model-value="density" @update:model-value="store.inventoryDensity=$event" /></div>
      <WorkbenchDialog v-if="filterOpen" title="筛选圣遗物" size="filter" @close="filterOpen=false"><FilterPanel class="artifact-filter-panel">
        <section><h3>套装</h3><ArtifactSetFilter v-model="setFilter" label="筛选套装" :options="sets" /></section>
        <section><h3>主词条</h3><StatFilterChoices v-model="statFilter" label="筛选主词条" :options="mainOptions" /></section>
        <section><div class="filter-heading"><h3>副词条</h3><ChoiceGroup v-model="subMatch" small joined :options="[{value:'any',label:'任一'},{value:'all',label:'全部'}]" label="副词条匹配方式" /></div><StatFilterChoices v-model="subFilter" label="筛选副词条" :options="subOptions" /></section>
        <section><h3>强化等级</h3><ArtifactLevelFilter v-model="levelFilter" /></section>
        <section><h3>收藏</h3><FavoriteFilter v-model="favoriteFilter" label="圣遗物收藏等级" /></section><section><h3>装备占用</h3><MultiSelectPicker v-model="ownerFilter" label="指定角色或装备占用" :options="ownerOptions" image-kind="characters" searchable /></section>
      </FilterPanel><template #footer><FilterActions flush @reset="resetFilters" @confirm="filterOpen=false" /></template></WorkbenchDialog>
      <WorkbenchDialog v-if="sortOpen" title="圣遗物排序" size="filter" @close="sortOpen=false"><SortPanel :model-value="sort" v-model:direction="sortDirection" :options="[{value:'release',label:'实装版本'},{value:'favorite',label:'收藏等级'},{value:'level',label:'等级'},{value:'default',label:'导入顺序'}]" @update:model-value="setSortKey" @reset="sort='release';sortDirection='desc'" @confirm="sortOpen=false" /></WorkbenchDialog>
      <LibraryListHeader v-model:page="page" :pages="pages" :count="filtered.length" :total="inventoryItems.length" unit="件圣遗物" class="inventory-results" />
      <div ref="grid" class="inventory-cards" :class="density"><button v-for="item in visible" :key="item.id" class="inventory-card artifact-item-card" :data-artifact-id="item.id" :data-rarity="item.real?.rarity" :data-density="density" :aria-label="`${pick?'选择':'查看'} ${item.alias ?? item.name} ${item.id.slice(-6)}`" @contextmenu.prevent="openMenu($event,item)" @keydown="menuKey($event,item)" @click="props.pick?emit('select',item):selectedId=item.id"><ArtifactSummary :account="inventory" :item="item" :variant="density" :effective-stats="props.effectiveStats" /></button></div>
      <p v-if="menuError" role="alert">{{ menuError }}</p>
      <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" label="圣遗物操作" :options="[{id:'details',label:'查看详情'},{id:favorites.level(inventory.id,menu.item.id)?'favorite-0':'favorite-1',label:favorites.level(inventory.id,menu.item.id)?'取消收藏':'收藏'},...(!pick?[{id:'delete',label:'删除',danger:true}]:[])]" @close="menu=undefined" @select="menuAction" />
      <ConfirmationDialog v-if="deleting" title="删除圣遗物？" confirm-label="删除" @cancel="cancelDelete" @confirm="remove"><p>删除「{{ deleting.alias ?? deleting.name }}」。</p><p v-if="deleteReferences.length">{{ deleteReferences.filter(item=>item.kind==='character').length }}个角色、{{ deleteReferences.filter(item=>item.kind==='configuration').length }}份配置、{{ deleteReferences.filter(item=>item.kind==='combination').length }}组组合引用此物品。佩戴、配置与组合保留内容并标为未入库。</p></ConfirmationDialog>
      <LibraryEmptyState v-if="!filtered.length" :title="inventoryItems.length?'没有符合条件的圣遗物':'圣遗物库还是空的'" :description="inventoryItems.length?'清除搜索与筛选后重试。':'导入莫娜文件，确认预览后浏览真实词条。'" :action="inventoryItems.length?'清除搜索与筛选':'返回导入入口'" @action="inventoryItems.length?resetFilters():scrollToTools()" />
      <LibraryPagination v-model:page="page" :pages="pages" always position="底部" full />
    </template>
    <ArtifactDetail v-if="selected" ref="artifactDetail" :item="selected" :account="props.account" @close="selectedId=''" />
  </section>
</template>
<style scoped>
.artifact-browser { min-width:0; }.inventory-options { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:12px 0; }.slot-tabs { display:flex; flex-wrap:wrap; gap:8px; }.slot-tabs button { display:flex; align-items:center; justify-content:center; gap:5px; height:40px; min-height:40px; padding:0 8px; font-size:var(--font-control); font-weight:700; white-space:nowrap; }.slot-tabs button[aria-pressed=true] { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }.slot-tabs :deep(.artifactSlots) { color:inherit; }.inventory-reset { border:0; padding:0 4px; min-height:32px; background:transparent; color:var(--muted); font-size:var(--font-control); font-weight:700; }.inventory-results { margin:8px 0 12px; }.density-options { margin-left:auto; }.inventory-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr)); gap:10px; }.inventory-cards.compact { grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--artifact-compact-min-width)),1fr)); gap:8px; }.density-options :deep(button) { font-size:var(--font-control); font-weight:700; }
@media(max-width:600px) { .slot-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); width:100%; gap:8px; }.slot-tabs button { min-width:0; padding-inline:4px; }.inventory-options { gap:8px; }.density-options { margin-left:auto; } }
</style>
