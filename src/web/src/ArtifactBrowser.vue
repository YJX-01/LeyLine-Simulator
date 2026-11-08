<script setup lang="ts">
import { computed, ref, watch, onMounted, shallowRef } from 'vue';
import { storeToRefs } from 'pinia';
import type { RealStat } from '@leyline/schema';
import { accountSlots, accountSlotLabels, artifactOwner, type AccountArtifact, type AccountSlot, type LocalAccount } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { useAccountStore } from './stores/account';
import { releaseMetadata, compareReleaseNewest } from './domain/catalog-release';
import { useViewportPage } from './composables/use-viewport-page';
import { loadAccountGameData } from './domain/account-presentation';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactIdentity from './components/ArtifactIdentity.vue';
import ArtifactDetail from './ArtifactDetail.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import MultiSelectPicker from './components/MultiSelectPicker.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import LibraryShortcuts from './components/LibraryShortcuts.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';
import LibraryPagination from './components/LibraryPagination.vue';
import StatFilterChoices from './components/StatFilterChoices.vue';
import FilterActions from './components/FilterActions.vue';
import SortPanel from './components/SortPanel.vue';
import ArtifactSummary from './ArtifactSummary.vue';
const props=defineProps<{slot?:AccountSlot;pick?:boolean;compareTo?:AccountArtifact;inline?:boolean;account?:LocalAccount;density?:'relaxed'|'compact';effectiveStats?:readonly RealStat[]}>();
const emit=defineEmits<{select:[item:AccountArtifact]}>();
const store=useAccountStore(),context=storeToRefs(store);
const inventory=computed(()=>props.account ?? store.account);
const density=computed(()=>props.density ?? store.inventoryDensity);
const query=props.pick?ref(''):context.inventoryQuery;
const slotFilter=props.pick?ref<string[]>([]):context.inventorySlot;
const statFilter=props.pick?ref<string[]>([]):context.inventoryStat;
const ownerFilter=props.pick?ref<string[]>([]):context.inventoryOwner;
const setFilter=props.pick?ref<string[]>([]):context.inventorySet;
const subFilter=props.pick?ref<string[]>([]):context.inventorySubstat;
const levelFilter=props.pick?ref<string[]>([]):context.inventoryLevel;
const sort=props.pick?ref('default'):context.inventorySort;
const sortDirection=props.pick?ref<'asc'|'desc'>('asc'):context.inventorySortDirection;
const subMatch=props.pick?ref('all'):context.inventorySubMatch;
const storedPage=props.pick?ref(1):context.inventoryPage;
const selectedId=ref(''),filterOpen=ref(false),sortOpen=ref(false);
const grid=ref<HTMLElement>();
const pageSize=useViewportPage(grid,()=>density.value,!props.pick,props.pick?undefined:context.inventoryPageSize);
const activeFilters=computed(()=>[statFilter,ownerFilter,setFilter,subFilter,levelFilter].reduce((count,filter)=>count+filter.value.length,0));
function resetFilters() { query.value='';slotFilter.value=[];statFilter.value=[];ownerFilter.value=[];setFilter.value=[];subFilter.value=[];levelFilter.value=[]; }
function setSortKey(key:string) { if(sort.value!==key){sort.value=key;sortDirection.value=key==='default'?'asc':'desc';} }
const artifactDetail=ref<InstanceType<typeof ArtifactDetail>>();
function requestLeave(action:()=>void) { if(artifactDetail.value)artifactDetail.value.requestLeave(action);else action(); }
function scrollToTools() { document.querySelector<HTMLElement>('.library-actions button')?.focus();window.scrollTo({top:0}); }
defineExpose({requestLeave});
const catalogSets=shallowRef<{id:string;name:string}[]>([]);
onMounted(async()=>{try {catalogSets.value=(await loadAccountGameData()).catalog.sets;}catch {store.error='套装目录加载失败，请重新打开库存。';}});
const sets=computed(()=>[...new Set(inventory.value.artifacts.map(item=>item.real?.setId ?? 'legacy'))].map(id=>({id,name:catalogSets.value.find(set=>set.id===id)?.name ?? (id.startsWith('mona-unresolved-')?'套装身份待核对':'旧版 / 散件')})).sort((a,b)=>compareReleaseNewest(releaseMetadata('artifacts',a.id),releaseMetadata('artifacts',b.id))));
const ownerOptions=computed(()=>[{id:'free',name:'未装备'},{id:'equipped',name:'已装备'},...inventory.value.characters.map(character=>({id:character.id,name:character.name,icon:character.realBuild?.character.id}))]);
const levelOptions=Array.from({length:21},(_,index)=>({id:String(index),name:`+${index}`}));
const selected=computed(()=>inventory.value.artifacts.find(item=>item.id===selectedId.value));
const owner=(item:AccountArtifact)=>artifactOwner(inventory.value,item.id)?.name;
const statOptions=Object.entries(accountStatLabels).filter(([stat])=>!stat.endsWith('Percent')).map(([stat,label])=>({stat,label:stat==='energyRecharge'?'元素充能效率':label}));
const mainOptions=computed(()=>statOptions.filter(option=>inventory.value.artifacts.some(item=>(!props.slot || item.slot===props.slot) && statMatches(item.real?.mainStat,option.stat))));
const subOptions=statOptions.filter(option=>['hp','attack','defense','elementalMastery','energyRecharge','critRate','critDamage'].includes(option.stat));
function statMatches(value:string|undefined,filter:string) { return value===filter || (['hp','attack','defense'].includes(filter) && value===`${filter}Percent`); }
const filtered=computed(()=>inventory.value.artifacts.filter(item=>{
  const hasSub=(stat:string)=>item.real?.substats.some(sub=>statMatches(sub.stat,stat));
  return (props.slot?item.slot===props.slot:!slotFilter.value.length || slotFilter.value.includes(item.slot))
    && (!statFilter.value.length || statFilter.value.some(stat=>statMatches(item.real?.mainStat,stat)))
    && (!ownerFilter.value.length || ownerFilter.value.some(id=>id==='free'?!owner(item):id==='equipped'?!!owner(item):artifactOwner(inventory.value,item.id)?.id===id))
    && (!setFilter.value.length || setFilter.value.includes(item.real?.setId ?? 'legacy'))
    && (!subFilter.value.length || (subMatch.value==='all'?subFilter.value.every(hasSub):subFilter.value.some(hasSub)))
    && (!levelFilter.value.length || levelFilter.value.includes(String(item.real?.level)))
    && `${item.name} ${owner(item) ?? ''}`.includes(query.value.trim());
}));
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/pageSize.value)));
const page=computed({get:()=>Math.max(1,Math.min(storedPage.value,pages.value)),set:value=>{storedPage.value=Math.max(1,Math.min(value,pages.value));}});
const visible=computed(()=>{
  const items=filtered.value.map((item,index)=>({item,index}));
  items.sort((a,b)=>{
    const order=sort.value==='release'?-compareReleaseNewest(releaseMetadata('artifacts',a.item.real?.setId),releaseMetadata('artifacts',b.item.real?.setId)):sort.value==='level'?(a.item.real?.level ?? 0)-(b.item.real?.level ?? 0):a.index-b.index;
    return (sortDirection.value==='asc'?1:-1)*order || a.index-b.index;
  });
  return items.slice((page.value-1)*pageSize.value,page.value*pageSize.value).map(entry=>entry.item);
});
watch([query,slotFilter,statFilter,ownerFilter,setFilter,subFilter,levelFilter,subMatch,sort,sortDirection,()=>props.slot],()=>{page.value=1;},{deep:true});
watch(pageSize,(next,previous)=>{page.value=Math.floor((storedPage.value-1)*previous/next)+1;},{flush:'sync'});
watch([storedPage,pages],()=>{if(storedPage.value!==page.value)storedPage.value=page.value;},{immediate:true});
</script>
<template>
  <section class="artifact-browser" aria-label="圣遗物库存浏览" :data-page-size="pageSize">
    <template v-if="!inline || !selected">
      <LibraryToolbar v-model="query" label="搜索圣遗物" placeholder="查找圣遗物或装备角色" :filter-count="activeFilters" :sorted="sort!=='default' || sortDirection!=='asc'" @filter="filterOpen=true" @sort="sortOpen=true"><template v-if="$slots.actions" #actions><slot name="actions" /></template></LibraryToolbar>
      <div class="inventory-options"><LibraryShortcuts v-if="!slot" v-model="slotFilter" class="slot-tabs" label="筛选圣遗物部位" all-label="全部部位" kind="artifactSlots" :mobile-columns="3" :options="accountSlots.map(slot=>({value:slot,label:accountSlotLabels[slot]}))" /><button v-if="activeFilters || query || slotFilter.length" class="inventory-reset" @click="resetFilters">清除筛选</button><span class="inventory-count" role="status">筛选结果 {{ filtered.length }} 件</span><ChoiceGroup v-if="!props.density" class="density-options" small joined tone="hydro" :model-value="density" :options="[{value:'relaxed',label:'疏松'},{value:'compact',label:'紧凑'}]" label="卡片密度" @update:model-value="store.inventoryDensity=$event==='compact'?'compact':'relaxed'" /></div>
      <WorkbenchDialog v-if="filterOpen" title="筛选圣遗物" size="filter" @close="filterOpen=false"><div class="artifact-filter-panel">
        <section><h3>套装</h3><MultiSelectPicker v-model="setFilter" label="筛选套装" :options="sets" image-kind="artifacts" searchable /></section>
        <section><h3>主词条</h3><StatFilterChoices v-model="statFilter" label="筛选主词条" :options="mainOptions" /></section>
        <section><div class="filter-heading"><h3>副词条</h3><ChoiceGroup v-model="subMatch" small joined :options="[{value:'any',label:'任一'},{value:'all',label:'全部'}]" label="副词条匹配方式" /></div><StatFilterChoices v-model="subFilter" label="筛选副词条" :options="subOptions" /></section>
        <section><h3>强化等级</h3><ChoiceGroup :model-value="levelFilter" :options="[{value:'16',label:'+16'},{value:'20',label:'+20'}]" label="常用强化等级" @update:model-value="levelFilter=$event as string[]" /><MultiSelectPicker v-model="levelFilter" label="筛选强化等级" :options="levelOptions" /></section>
        <section><h3>装备占用</h3><MultiSelectPicker v-model="ownerFilter" label="指定角色或装备占用" :options="ownerOptions" image-kind="characters" searchable /></section>
      </div><template #footer><FilterActions flush @reset="resetFilters" @confirm="filterOpen=false" /></template></WorkbenchDialog>
      <WorkbenchDialog v-if="sortOpen" title="圣遗物排序" size="filter" @close="sortOpen=false"><SortPanel :model-value="sort" v-model:direction="sortDirection" :options="[{value:'default',label:'导入顺序'},{value:'level',label:'等级'},{value:'release',label:'实装版本'}]" @update:model-value="setSortKey" @reset="sort='default';sortDirection='asc'" @confirm="sortOpen=false" /></WorkbenchDialog>
      <LibraryPagination v-model:page="page" :pages="pages" always position="顶部" class="pagination-top" />
      <div ref="grid" class="inventory-cards" :class="density"><button v-for="item in visible" :key="item.id" class="inventory-card artifact-item-card" :data-rarity="item.real?.rarity" :data-density="density" :aria-label="`${pick?'选择':'查看'} ${item.name} ${item.id.slice(-6)}`" @click="selectedId=item.id"><ArtifactSummary :account="inventory" :item="item" :variant="density" :effective-stats="props.effectiveStats" /></button></div>
      <LibraryEmptyState v-if="!filtered.length" :title="inventory.artifacts.length?'没有符合条件的圣遗物':'圣遗物库还是空的'" :description="inventory.artifacts.length?'清除搜索与筛选后重试。':'导入莫娜文件，确认预览后浏览真实词条。'" :action="inventory.artifacts.length?'清除搜索与筛选':'返回导入入口'" @action="inventory.artifacts.length?resetFilters():scrollToTools()" />
      <LibraryPagination v-model:page="page" :pages="pages" always position="底部" />
    </template><component :is="inline ? 'section' : WorkbenchDialog" v-if="selected && pick" :title="inline ? undefined : selected.name" @close="selectedId = ''"><button v-if="inline" class="ui-action soft" data-accent="anemo" @click="selectedId = ''">返回库存候选</button><div class="artifact-comparison"><section v-if="compareTo"><h3>当前装备</h3><ArtifactSummary :account="inventory" :item="compareTo" variant="relaxed" :effective-stats="props.effectiveStats" /></section><section><h3>准备装备</h3><ArtifactSummary :account="inventory" :item="selected" variant="relaxed" :effective-stats="props.effectiveStats" /></section></div><p>本地占用：{{ owner(selected) ?? '未装备' }}</p><p v-if="selected.mona?.equippedBy">原始穿戴备注：{{ selected.mona.equippedBy }}（与当前装备状态分开保存）</p><button class="ui-action" data-accent="anemo" @click="emit('select',selected); selectedId = ''">选择这件圣遗物</button><ArtifactIdentity :item="selected" /></component>
    <ArtifactDetail v-if="selected && !pick" ref="artifactDetail" :item="selected" :account="props.account" @close="selectedId=''" />
  </section>
</template>
<style scoped>
.artifact-browser { min-width:0; }.inventory-options { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:12px 0; }.slot-tabs { display:flex; flex-wrap:wrap; gap:8px; }.slot-tabs button { display:flex; align-items:center; justify-content:center; gap:5px; height:40px; min-height:40px; padding:0 8px; font-size:var(--font-control); font-weight:700; white-space:nowrap; }.slot-tabs button[aria-pressed=true] { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }.slot-tabs :deep(.artifactSlots) { color:inherit; }.inventory-count { margin-left:auto; font-size:var(--font-control); font-weight:700; color:var(--muted); }.inventory-reset { border:0; padding:0 4px; min-height:32px; background:transparent; color:var(--muted); font-size:var(--font-control); font-weight:700; }.pagination-top { margin:8px 0 12px; }.inventory-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr)); gap:10px; }.inventory-cards.compact { grid-template-columns:repeat(auto-fill,minmax(min(100%,184px),1fr)); gap:8px; }.artifact-filter-panel { display:grid; gap:20px; }.artifact-filter-panel section { display:grid; gap:8px; }.artifact-filter-panel h3 { margin:0; font-size:var(--font-control); }.filter-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }.artifact-comparison { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:20px; margin-top:16px; }.artifact-comparison h3 { margin:0 0 12px; font-size:var(--font-control); }.density-options :deep(button) { font-size:var(--font-control); font-weight:700; }
@media(max-width:600px) { .slot-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); width:100%; gap:8px; }.slot-tabs button { min-width:0; padding-inline:4px; }.inventory-options { gap:8px; }.inventory-count { margin-left:0; margin-right:auto; }.density-options { margin-left:auto; } }
</style>
