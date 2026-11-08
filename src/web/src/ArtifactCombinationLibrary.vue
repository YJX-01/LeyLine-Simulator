<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { RealStat } from '@leyline/schema';
import { accountSlots } from './domain/account';
import { combinationName, effectiveTotal, validateCombinationItems, type ArtifactCombination } from './domain/artifact-combinations';
import { loadAccountGameData } from './domain/account-presentation';
import { downloadJson } from './domain/download';
import { useAccountStore } from './stores/account';
import { useArtifactCombinationsStore } from './stores/artifact-combinations';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { useLibraryViewStore } from './stores/library-view';
import { useViewportPage } from './composables/use-viewport-page';
import ArtifactCombinationEditor from './ArtifactCombinationEditor.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';
import LibraryPagination from './components/LibraryPagination.vue';
import EquipmentStrip from './components/EquipmentStrip.vue';
import EffectiveRollSummary from './components/EffectiveRollSummary.vue';
import MultiSelectPicker from './components/MultiSelectPicker.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import FilterActions from './components/FilterActions.vue';
import SortPanel from './components/SortPanel.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import LoadoutComparison from './components/LoadoutComparison.vue';
import GameIcon from './components/GameIcon.vue';
const props=defineProps<{pick?:boolean;stats?:RealStat[];referenceName?:string}>();
const emit=defineEmits<{select:[combination:ArtifactCombination];editRole:[characterId:string,presetId:string]}>();
const account=useAccountStore(),store=useArtifactCombinationsStore(),loadouts=useCharacterLoadoutsStore(),views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id)),localQuery=ref(''),localPage=ref(1);
const query=computed({get:()=>props.pick?localQuery.value:view.value.query,set:value=>{if(props.pick)localQuery.value=value;else view.value.query=value;page.value=1;}});
const storedPage=computed({get:()=>props.pick?localPage.value:view.value.page,set:value=>{if(props.pick)localPage.value=value;else view.value.page=value;}});
const sets=ref<{id:string;name:string}[]>([]),error=ref(''),notice=ref('');
const editor=ref<ArtifactCombination>(),creating=ref(false),deleteId=ref(''),filterOpen=ref(false),sortOpen=ref(false),compareOpen=ref(false),compared=ref<string[]>([]);
const selectedSets=ref<string[]>([]),complete=ref('all'),sort=ref('rolls'),direction=ref<'asc'|'desc'>('desc');
const list=ref<HTMLElement>(),pageSize=useViewportPage(list,()=> 'combinations',!props.pick);
const all=computed(()=>store.combinations.filter(combination=>combination.accountId===account.account.id));
function name(combination:ArtifactCombination){return combinationName(combination,sets.value);}
function stats(combination:ArtifactCombination){return props.stats ?? combination.stats;}
const shown=computed(()=>all.value.filter(combination=>name(combination).includes(query.value.trim()) || combination.referenceName.includes(query.value.trim())).filter(combination=>(!selectedSets.value.length || combination.items.some(item=>selectedSets.value.includes(item.real?.setId ?? ''))) && (complete.value==='all' || (combination.items.length===5)===(complete.value==='complete'))).sort((a,b)=>{
  const difference=sort.value==='rolls'?(effectiveTotal(a.items,stats(a)) ?? -1)-(effectiveTotal(b.items,stats(b)) ?? -1):sort.value==='pieces'?a.items.length-b.items.length:all.value.indexOf(a)-all.value.indexOf(b);
  return (direction.value==='asc'?1:-1)*difference;
}));
const pages=computed(()=>Math.max(1,Math.ceil(shown.value.length/(props.pick?6:pageSize.value))));
const page=computed({get:()=>Math.max(1,Math.min(storedPage.value,pages.value)),set:value=>{storedPage.value=Math.max(1,Math.min(value,pages.value));}});
const visible=computed(()=>shown.value.slice((page.value-1)*(props.pick?6:pageSize.value),page.value*(props.pick?6:pageSize.value)));
const comparedItems=computed(()=>compared.value.flatMap(id=>{const entry=all.value.find(item=>item.id===id);return entry?[entry]:[];}));
watch([storedPage,pages],()=>{if(storedPage.value!==page.value)storedPage.value=page.value;},{immediate:true});
watch([selectedSets,complete,sort,direction],()=>{page.value=1;},{deep:true});
watch(()=>account.account.id,()=>{editor.value=undefined;creating.value=false;compared.value=[];compareOpen.value=false;});
onMounted(async()=>{try{sets.value=(await loadAccountGameData()).catalog.sets;}catch{error.value='套装目录加载失败，请重新打开。';}});
function clearFilters(){query.value='';selectedSets.value=[];complete.value='all';}
function emptyAction(){if(all.value.length)clearFilters();else creating.value=true;}
function saved(id:string,duplicate:boolean){creating.value=false;editor.value=duplicate?store.combinations.find(item=>item.id===id):undefined;notice.value=duplicate?'已有相同组合，已打开。':'组合已保存，角色穿戴不变。';}
function toggleCompare(id:string){compared.value=compared.value.includes(id)?compared.value.filter(value=>value!==id):compared.value.length<2?[...compared.value,id]:compared.value;}
function stale(combination:ArtifactCombination){try{validateCombinationItems(account.account,combination.items);return false;}catch{return true;}}
function owners(combination:ArtifactCombination){return account.account.characters.filter(character=>accountSlots.every(slot=>(character.equipment[slot] ?? '')===(combination.items.find(item=>item.slot===slot)?.id ?? '')));}
function exportFile(){downloadJson({schemaVersion:1,kind:'artifact-combinations',accountId:account.account.id,combinations:all.value},'圣遗物组合.json');}
function remove(){try{store.remove(account.account.id,deleteId.value);compared.value=compared.value.filter(id=>id!==deleteId.value);deleteId.value='';}catch(cause){error.value=cause instanceof Error?cause.message:'删除失败。';}}
</script>
<template>
  <section class="combination-library" aria-label="圣遗物组合库">
    <LibraryToolbar v-model="query" label="搜索圣遗物组合" placeholder="查找组合或参考角色…" :filter-count="selectedSets.length+(complete!=='all'?1:0)" :sorted="sort!=='rolls' || direction!=='desc'" @filter="filterOpen=true" @sort="sortOpen=true"><template #actions><button class="ui-action soft" data-size="md" :disabled="comparedItems.length!==2" @click="compareOpen=true">对比 {{ comparedItems.length }}/2</button><button v-if="!pick" class="ui-action soft" @click="exportFile">导出组合</button><button class="ui-action" @click="creating=true;editor=undefined">新建组合</button></template></LibraryToolbar>
    <div class="collection-tools"><span role="status">匹配 {{ shown.length }} 组 / 共 {{ all.length }} 组</span><span v-if="pick && referenceName">按{{ referenceName }}统计</span><button v-if="query || selectedSets.length || complete!=='all'" class="ui-muted-button" @click="query='';selectedSets=[];complete='all'">清除筛选</button></div>
    <p v-if="error || store.error" role="alert">{{ error || store.error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <LibraryPagination v-if="!pick && all.length" v-model:page="page" :pages="pages" position="顶部" always />
    <div ref="list" class="combination-list"><article v-for="combination in visible" :key="combination.id" class="combination-row" :data-combination-id="combination.id">
      <div class="combination-heading"><h3>{{ name(combination) }}</h3><span>{{ combination.items.length }}/5 件</span><span v-if="stale(combination)" class="stale">库存已变化</span></div>
      <EquipmentStrip :entries="accountSlots.map(slot=>({slot,item:combination.items.find(item=>item.slot===slot)}))" />
      <EffectiveRollSummary :items="combination.items" :selected-stats="stats(combination)" />
      <div class="combination-actions"><div class="combination-owners"><span v-for="character in owners(combination)" :key="character.id" :title="`${character.name}当前采用`"><GameIcon kind="characters" :id="character.realBuild?.character.id" :name="character.name" :size="24" />{{ character.name }}</span></div><button class="ui-action soft" data-size="md" :aria-pressed="compared.includes(combination.id)" :disabled="compared.length===2 && !compared.includes(combination.id)" @click="toggleCompare(combination.id)">{{ compared.includes(combination.id)?'移出对比':'加入对比' }}</button><button class="ui-action soft" data-size="md" @click="editor=combination;creating=false">编辑组合</button><button v-if="pick" class="ui-action" data-size="md" :disabled="stale(combination)" @click="emit('select',combination)">应用组合</button><button v-else class="ui-action soft" data-accent="pyro" data-size="md" @click="deleteId=combination.id">删除</button></div>
    </article></div>
    <LibraryEmptyState v-if="!shown.length" :title="all.length?'没有匹配的组合':'还没有保存的组合'" :description="all.length?'清除筛选后重试。':'新建组合，或在角色详情中保存当前装备。'" :action="all.length?'清除筛选':'新建组合'" @action="emptyAction" />
    <LibraryPagination v-model:page="page" :pages="pages" :always="!pick && !!all.length" :position="pick?'':'底部'" />
    <WorkbenchDialog v-if="filterOpen" title="筛选组合" size="filter" @close="filterOpen=false"><div class="combination-filters"><h3>套装</h3><MultiSelectPicker v-model="selectedSets" label="组合套装" :options="sets" image-kind="artifacts" searchable /><h3>完整度</h3><ChoiceGroup v-model="complete" :options="[{value:'all',label:'全部'},{value:'complete',label:'完整五件'},{value:'partial',label:'未满五件'}]" label="组合完整度" /></div><template #footer><FilterActions flush @reset="selectedSets=[];complete='all'" @confirm="filterOpen=false" /></template></WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="组合排序" size="filter" @close="sortOpen=false"><SortPanel v-model="sort" v-model:direction="direction" :options="[{value:'rolls',label:'有效词条数'},{value:'pieces',label:'装备件数'},{value:'saved',label:'保存顺序'}]" @reset="sort='rolls';direction='desc'" @confirm="sortOpen=false" /></WorkbenchDialog>
    <ArtifactCombinationEditor v-if="creating || editor" :key="editor?.id ?? 'new'" :combination="editor" @close="creating=false;editor=undefined" @saved="saved" />
    <ConfirmationDialog v-if="deleteId" title="删除组合？" confirm-label="删除" @cancel="deleteId=''" @confirm="remove"><p>只删除保存的组合，库存和角色穿戴不变。</p></ConfirmationDialog>
    <LoadoutComparison v-if="compareOpen && comparedItems.length===2" :sides="comparedItems.map(item=>({title:name(item),items:item.items}))" :stats="props.stats ?? comparedItems[0].stats" :reference-name="props.referenceName ?? comparedItems[0].referenceName" @close="compareOpen=false" />
  </section>
</template>
<style scoped>
.combination-library { min-width:0; }.collection-tools { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:12px 0; font-size:var(--font-control); font-weight:700; color:var(--muted); }.combination-list { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; }.combination-row { display:grid; gap:12px; min-width:0; padding:12px; border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface); }.combination-row:hover { border-top-color:var(--element-anemo-primary); }.combination-heading { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }.combination-heading h3 { flex:1; min-width:0; font-size:var(--font-control); margin:0; overflow-wrap:anywhere; }.combination-heading span { font-size:var(--font-body); }.stale { color:var(--element-pyro-deep); }.combination-actions,.combination-owners { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.combination-owners { margin-right:auto; }.combination-owners span { display:flex; align-items:center; gap:4px; font-size:var(--font-body); }.combination-filters { display:grid; gap:12px; }.combination-filters h3 { margin:0; font-size:var(--font-control); }
</style>
