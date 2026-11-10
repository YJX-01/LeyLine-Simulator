<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import type { StatKey } from '@leyline/schema';
import { accountSlots } from '../domain/account';
import { combinationName, effectiveTotal, validateCombinationItems, type ArtifactCombination } from '../domain/artifact-combinations';
import { loadAccountGameData } from '../domain/account-presentation';
import { useAccountStore } from '../stores/account';
import { useArtifactCombinationsStore } from '../stores/artifact-combinations';
import { useLibraryViewStore } from '../stores/library-view';
import ArtifactCombinationEditor from './ArtifactCombinationEditor.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryPagination from '../components/LibraryPagination.vue';
import LibraryListHeader from '../components/LibraryListHeader.vue';
import ContextMenu from '../components/ContextMenu.vue';
import EquipmentStrip from '../components/EquipmentStrip.vue';
import EffectiveRollSummary from '../components/EffectiveRollSummary.vue';
import ArtifactSetFilter from '../components/ArtifactSetFilter.vue';
import FavoriteFilter from '../components/FavoriteFilter.vue';
import FavoriteMark from '../components/FavoriteMark.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import FilterPanel from '../components/FilterPanel.vue';
import FilterActions from '../components/FilterActions.vue';
import SortPanel from '../components/SortPanel.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import GameIcon from '../components/GameIcon.vue';
const editorView=ref<InstanceType<typeof ArtifactCombinationEditor>>();
defineExpose({requestLeave:(action:()=>void)=>editorView.value?editorView.value.requestLeave(action):action(),openCombination:(id:string)=>{editor.value=store.combinations.find(item=>item.id===id && item.accountId===account.account.id);creating.value=false;}});
const props=defineProps<{pick?:boolean;stats?:StatKey[];referenceName?:string}>();
const emit=defineEmits<{select:[combination:ArtifactCombination];editRole:[characterId:string,presetId:string];closed:[]}>();
const account=useAccountStore(),store=useArtifactCombinationsStore(),views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id)),localQuery=ref(''),localPage=ref(1);
const query=computed({get:()=>props.pick?localQuery.value:view.value.query,set:value=>{if(props.pick)localQuery.value=value;else view.value.query=value;page.value=1;}});
const storedPage=computed({get:()=>props.pick?localPage.value:view.value.page,set:value=>{if(props.pick)localPage.value=value;else view.value.page=value;}});
const characters=ref<{id:string;name:string}[]>([]);
const sets=ref<{id:string;name:string;rarity:number}[]>([]),error=ref('');
const editor=ref<ArtifactCombination>(),creating=ref(false),deleteId=ref(''),filterOpen=ref(false),sortOpen=ref(false);
const selectedSets=ref<string[]>([]),favoriteFilter=ref<string[]>([]),sort=ref('rolls'),direction=ref<'asc'|'desc'>('desc');
const pageSize=5,library=ref<HTMLElement>();
let deleteFocus:HTMLButtonElement|undefined;
const all=computed(()=>store.combinations.filter(combination=>combination.accountId===account.account.id));
function name(combination:ArtifactCombination){return combinationName(combination,sets.value);}
function stats(combination:ArtifactCombination){return props.stats ?? combination.stats;}
const shown=computed(()=>all.value.filter(combination=>name(combination).includes(query.value.trim()) || combination.referenceName.includes(query.value.trim())).filter(combination=>(!selectedSets.value.length || combination.items.some(item=>selectedSets.value.includes(item.real?.setId ?? ''))) && (!favoriteFilter.value.length || favoriteFilter.value.includes(String(combination.favorite ?? 0)))).sort((a,b)=>{
  const difference=sort.value==='rolls'?(effectiveTotal(a.items,stats(a),a.basis) ?? -1)-(effectiveTotal(b.items,stats(b),b.basis) ?? -1):sort.value==='favorite'?(a.favorite ?? 0)-(b.favorite ?? 0):sort.value==='pieces'?a.items.length-b.items.length:all.value.indexOf(a)-all.value.indexOf(b);
  return (direction.value==='asc'?1:-1)*difference;
}));
const pages=computed(()=>Math.max(1,Math.ceil(shown.value.length/pageSize)));
const page=computed({get:()=>Math.max(1,Math.min(storedPage.value,pages.value)),set:value=>{storedPage.value=Math.max(1,Math.min(value,pages.value));}});
const visible=computed(()=>shown.value.slice((page.value-1)*pageSize,page.value*pageSize));
watch([storedPage,pages],()=>{if(storedPage.value!==page.value)storedPage.value=page.value;},{immediate:true});
watch([selectedSets,favoriteFilter,sort,direction],()=>{page.value=1;},{deep:true});
watch(()=>account.account.id,()=>{editor.value=undefined;creating.value=false;deleteId.value='';menu.value=undefined;});
onMounted(async()=>{try{const data=await loadAccountGameData();sets.value=data.catalog.sets;characters.value=data.catalog.characters;}catch{error.value='套装目录加载失败，请重新打开。';}});
function clearFilters(){query.value='';selectedSets.value=[];favoriteFilter.value=[];}
function emptyAction(){if(all.value.length)clearFilters();else creating.value=true;}
function saved(id:string,duplicate:boolean){creating.value=false;editor.value=duplicate?store.combinations.find(item=>item.id===id):undefined;if(!duplicate)emit('closed');}
function stale(combination:ArtifactCombination){try{validateCombinationItems(account.account,combination.items);return false;}catch{return true;}}
function referenceId(combination:ArtifactCombination){return characters.value.find(character=>character.name===combination.referenceName)?.id;}
const menu=ref<{combination:ArtifactCombination;x:number;y:number}>();
function open(combination:ArtifactCombination){if(props.pick){if(!stale(combination))emit('select',combination);}else{editor.value=combination;creating.value=false;}}
function openMenu(event:MouseEvent,combination:ArtifactCombination){(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('.combination-open')?.focus({preventScroll:true});menu.value={combination,x:event.clientX,y:event.clientY};}
function menuKey(event:KeyboardEvent,combination:ArtifactCombination){if(event.key==='ContextMenu' || event.shiftKey && event.key==='F10'){event.preventDefault();const box=(event.currentTarget as HTMLElement).getBoundingClientRect();menu.value={combination,x:box.left+12,y:box.top+12};}}
function menuAction(action:string){const combination=menu.value?.combination;menu.value=undefined;if(!combination)return;if(action==='details'){editor.value=combination;creating.value=false;}else if(action==='favorite'){try{store.setFavorite(account.account.id,combination.id,combination.favorite?0:1);}catch(cause){error.value=cause instanceof Error?cause.message:'收藏未保存。';}}else{deleteFocus=Array.from(library.value?.querySelectorAll<HTMLElement>('.combination-row') ?? []).find(row=>row.dataset.combinationId===combination.id)?.querySelector<HTMLButtonElement>('.combination-open') ?? undefined;deleteId.value=combination.id;}}
function cancelDelete(){deleteId.value='';nextTick(()=>{if(deleteFocus?.isConnected)deleteFocus.focus({preventScroll:true});});}
function remove(){try{store.remove(account.account.id,deleteId.value);deleteId.value='';nextTick(()=>library.value?.querySelector<HTMLInputElement>('input[name=library-search]')?.focus({preventScroll:true}));}catch(cause){error.value=cause instanceof Error?cause.message:'删除失败。';}}
</script>
<template>
  <section ref="library" class="combination-library" aria-label="圣遗物组合库">
    <LibraryToolbar v-model="query" label="搜索圣遗物组合" placeholder="查找组合或参考角色…" :filter-count="selectedSets.length+favoriteFilter.length" :sorted="sort!=='rolls' || direction!=='desc'" @filter="filterOpen=true" @sort="sortOpen=true" @reset="selectedSets=[];favoriteFilter=[];sort='rolls';direction='desc'"><template #actions><button class="ui-action library-primary-action" aria-label="新建组合" @click="creating=true;editor=undefined"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>新建组合</button></template></LibraryToolbar>
    <LibraryListHeader v-model:page="page" :pages="pages" :count="shown.length" :total="all.length" unit="组组合" />
    <p v-if="pick && referenceName" class="pick-reference">按{{ referenceName }}统计</p>
    <p v-if="error || store.error" role="alert">{{ error || store.error }}</p>
    <div class="combination-list"><article v-for="combination in visible" :key="combination.id" class="combination-row" :data-combination-id="combination.id" @contextmenu.prevent="openMenu($event,combination)">
      <div class="combination-heading"><h3>{{ name(combination) }}</h3><span v-if="stale(combination)" class="stale">{{ combination.items.some(item=>item.inventoryId===null)?'含未入库':'库存已变化' }}</span><span v-if="combination.referenceName" class="combination-reference" role="img" :title="`参考角色：${combination.referenceName}`" :aria-label="`参考角色：${combination.referenceName}`"><GameIcon kind="characters" :id="referenceId(combination)" :name="combination.referenceName" :size="32" /></span><span v-if="combination.favorite" class="combination-favorite" :title="`${combination.favorite}级收藏`" :aria-label="`${combination.favorite}级收藏`"><FavoriteMark :level="combination.favorite" /></span></div>
      <EquipmentStrip :effective-stats="stats(combination)" :entries="accountSlots.map(slot=>({slot,item:combination.items.find(item=>item.slot===slot)}))" />
      <EffectiveRollSummary inline :basis="combination.basis" :items="combination.items" :selected-stats="stats(combination)" />
      <button class="combination-open" :aria-label="pick?'应用组合':`查看组合：${name(combination)}`" :disabled="pick && stale(combination)" @click="open(combination)" @keydown="menuKey($event,combination)"></button>
    </article></div>
    <LibraryEmptyState v-if="!shown.length" :title="all.length?'没有匹配的组合':'还没有保存的组合'" :description="all.length?'清除筛选后重试。':'新建组合，或在角色详情中保存当前装备。'" :action="all.length?'清除筛选':'新建组合'" @action="emptyAction" />
    <LibraryPagination v-model:page="page" :pages="pages" always position="底部" full />
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" label="组合操作" :options="pick?[{id:'details',label:'查看详情'}]:[{id:'details',label:'查看详情'},{id:'favorite',label:menu.combination.favorite?'取消收藏':'收藏'},{id:'delete',label:'删除',danger:true}]" @close="menu=undefined" @select="menuAction" />
    <WorkbenchDialog v-if="filterOpen" title="筛选组合" size="filter" @close="filterOpen=false"><FilterPanel><section><h3>套装</h3><ArtifactSetFilter v-model="selectedSets" label="组合套装" :options="sets" /></section><section><h3>收藏</h3><FavoriteFilter v-model="favoriteFilter" label="组合收藏等级" /></section></FilterPanel><template #footer><FilterActions flush @reset="selectedSets=[];favoriteFilter=[]" @confirm="filterOpen=false" /></template></WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="组合排序" size="filter" @close="sortOpen=false"><SortPanel v-model="sort" v-model:direction="direction" :options="[{value:'rolls',label:'有效词条数'},{value:'favorite',label:'收藏等级'},{value:'pieces',label:'装备件数'},{value:'saved',label:'保存顺序'}]" @reset="sort='rolls';direction='desc'" @confirm="sortOpen=false" /></WorkbenchDialog>
    <ArtifactCombinationEditor ref="editorView" v-if="creating || editor" :key="editor?.id ?? 'new'" :combination="editor" @close="creating=false;editor=undefined;emit('closed')" @saved="saved" />
    <ConfirmationDialog v-if="deleteId" title="删除组合？" confirm-label="删除" @cancel="cancelDelete" @confirm="remove"><p>只删除保存的组合，库存和角色穿戴不变。</p></ConfirmationDialog>
  </section>
</template>
<style scoped>
.combination-library { display:grid; gap:12px; min-width:0; }.combination-list { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; }.combination-row { position:relative; display:grid; gap:12px; min-width:0; padding:16px; border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface); }.combination-heading { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }.combination-heading h3 { flex:1; min-width:0; font-size:var(--font-control); margin:0; overflow-wrap:anywhere; }.combination-heading > span,.pick-reference { font-size:var(--font-body); }.stale { color:var(--element-pyro-deep); }.combination-reference { display:flex; align-items:center; margin-left:auto; }
.combination-open { position:absolute; inset:0; z-index:1; width:100%; height:100%; min-height:0; border:0; border-radius:inherit; background:transparent; padding:0; cursor:pointer; }.combination-open:hover { background:transparent; box-shadow:none; }.combination-open:disabled { opacity:1; cursor:default; }.combination-open:focus-visible { outline:2px solid var(--element-hydro-deep); outline-offset:2px; }
@media(max-width:600px) { .combination-row { padding:12px; } }
</style>
