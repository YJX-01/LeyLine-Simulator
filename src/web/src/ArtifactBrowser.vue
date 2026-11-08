<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { accountSlots, accountSlotLabels, artifactOwner, type AccountArtifact, type AccountSlot, type LocalAccount } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { useAccountStore } from './stores/account';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactIdentity from './components/ArtifactIdentity.vue';
import ArtifactDetail from './ArtifactDetail.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import GameIcon from './components/GameIcon.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import FilterActions from './components/FilterActions.vue';
import SortPanel from './components/SortPanel.vue';
import type { RealStat } from '@leyline/schema';
import ArtifactSummary from './ArtifactSummary.vue';
import { loadAccountGameData } from './domain/account-presentation';
import { onMounted, shallowRef } from 'vue';
const props = defineProps<{ slot?: AccountSlot; pick?: boolean; compareTo?: AccountArtifact; inline?: boolean; account?: LocalAccount; density?: 'relaxed' | 'compact'; effectiveStats?:readonly RealStat[] }>();
const emit = defineEmits<{ select: [item: AccountArtifact] }>();
const store = useAccountStore();
const context = storeToRefs(store);
const inventory = computed(() => props.account ?? store.account);
const density = computed(() => props.density ?? store.inventoryDensity);
const query = props.pick ? ref('') : context.inventoryQuery;
const slotFilter = props.pick ? ref('') : context.inventorySlot;
const statFilter = props.pick ? ref('') : context.inventoryStat;
const ownerFilter = props.pick ? ref('all') : context.inventoryOwner;
const page = props.pick ? ref(1) : context.inventoryPage;
const selectedId = ref('');
const filterOpen=ref(false),sortOpen=ref(false);
const activeFilters=computed(()=>[statFilter.value,ownerFilter.value!=='all',setFilter.value,subFilter.value,levelFilter.value].filter(Boolean).length);
function resetFilters() { query.value='';slotFilter.value='';statFilter.value='';ownerFilter.value='all';setFilter.value='';subFilter.value='';levelFilter.value='';sort.value='default';sortDirection.value='asc'; }

const artifactDetail=ref<InstanceType<typeof ArtifactDetail>>();
function requestLeave(action:()=>void) { if(artifactDetail.value)artifactDetail.value.requestLeave(action);else action(); }
defineExpose({requestLeave});
const catalogSets = shallowRef<{ id: string; name: string }[]>([]);
const setFilter = props.pick ? ref('') : context.inventorySet;
const subFilter = props.pick ? ref('') : context.inventorySubstat;
const levelFilter = props.pick ? ref('') : context.inventoryLevel;
const sort = props.pick ? ref('default') : context.inventorySort;
const sortDirection=props.pick?ref<'asc'|'desc'>('asc'):context.inventorySortDirection;
function setSortKey(key:string) { if(sort.value!==key){sort.value=key;sortDirection.value=key==='level'?'desc':'asc';} }
const sets = computed(() => [...new Set(inventory.value.artifacts.map(item => item.real?.setId ?? 'legacy'))].map(id => ({ id, name: catalogSets.value.find(set => set.id === id)?.name ?? (id.startsWith('mona-unresolved-') ? '套装身份待核对' : '旧版 / 散件') })));
onMounted(async () => { try { catalogSets.value = (await loadAccountGameData()).catalog.sets; } catch { store.error = '套装目录加载失败，请重新打开库存。'; } });
const selected = computed(() => inventory.value.artifacts.find(item => item.id === selectedId.value));
const owner = (item: AccountArtifact) => artifactOwner(inventory.value, item.id)?.name;
const statOptions=Object.entries(accountStatLabels).filter(([stat])=>!stat.endsWith('Percent')).map(([stat,label])=>({stat,label}));
function statMatches(value:string|undefined,filter:string) { return value===filter || (['hp','attack','defense'].includes(filter) && value===`${filter}Percent`); }
const filtered = computed(() => inventory.value.artifacts.filter(item => {
  const slot = props.slot || slotFilter.value;
  return (!slot || item.slot === slot) && (!statFilter.value || statMatches(item.real?.mainStat,statFilter.value))
    && (ownerFilter.value === 'all' || (ownerFilter.value === 'free' ? !owner(item) : !!owner(item)))
    && (!setFilter.value || (item.real?.setId ?? 'legacy') === setFilter.value)
    && (!subFilter.value || item.real?.substats.some(sub => statMatches(sub.stat,subFilter.value)))
    && (!levelFilter.value || item.real?.level === Number(levelFilter.value))
    && (['all','free','equipped'].includes(ownerFilter.value) || artifactOwner(inventory.value,item.id)?.id === ownerFilter.value)
    && `${item.name} ${owner(item) ?? ''}`.includes(query.value.trim());
}));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 30)));
const visible = computed(() => {
  const items=filtered.value.map((item,index)=>({item,index}));
  items.sort((a,b)=>(sortDirection.value==='asc'?1:-1)*(sort.value==='level'?(a.item.real?.level ?? 0)-(b.item.real?.level ?? 0):sort.value==='name'?a.item.name.localeCompare(b.item.name,'zh-CN'):a.index-b.index));
  return items.slice((page.value-1)*30,page.value*30).map(entry=>entry.item);
});
watch([query, slotFilter, statFilter, ownerFilter, setFilter, subFilter, levelFilter, sort, sortDirection, () => props.slot], () => { page.value = 1; });
watch(pages, count => { page.value = Math.min(page.value, count); });
</script>
<template>
  <section class="artifact-browser" aria-label="圣遗物库存浏览">
    <template v-if="!inline || !selected">
    <LibraryToolbar v-model="query" label="搜索圣遗物" placeholder="查找圣遗物或装备角色" :filter-count="activeFilters" :sorted="sort!=='default' || sortDirection!=='asc'" @filter="filterOpen=true" @sort="sortOpen=true"><template v-if="$slots.actions" #actions><slot name="actions" /></template></LibraryToolbar>
    <div class="inventory-options"><div v-if="!slot" class="slot-tabs" role="group" aria-label="筛选圣遗物部位"><button :class="{ active: !slotFilter }" :aria-pressed="!slotFilter" @click="slotFilter = ''">全部部位</button><button v-for="part in accountSlots" :key="part" :class="{ active: slotFilter === part }" :aria-pressed="slotFilter===part" @click="slotFilter = part"><GameIcon kind="artifactSlots" :id="part" :size="24" />{{ accountSlotLabels[part] }}</button></div><button v-if="activeFilters || query || slotFilter" class="inventory-reset" @click="resetFilters">清除筛选</button><span class="inventory-count" role="status" :title="`共 ${inventory.artifacts.length} 件 · 第 ${page} / ${pages} 页`">筛选结果 {{ filtered.length }} 件</span><ChoiceGroup v-if="!props.density" class="density-options" small joined tone="hydro" :model-value="density" :options="[{value:'relaxed',label:'疏松'},{value:'compact',label:'紧凑'}]" label="卡片密度" @update:model-value="store.inventoryDensity=$event==='compact'?'compact':'relaxed'" /></div>
    <WorkbenchDialog v-if="filterOpen" title="筛选圣遗物" size="filter" @close="filterOpen=false"><div class="artifact-filter-panel"><label>套装<select v-model="setFilter" aria-label="筛选套装"><option value="">全部套装</option><option v-for="set in sets" :key="set.id" :value="set.id">{{ set.name }}</option></select></label><label>装备占用<select v-model="ownerFilter" aria-label="筛选装备占用"><option value="all">全部</option><option value="free">未在本地装备</option><option value="equipped">本地已装备</option><option v-for="character in inventory.characters" :key="character.id" :value="character.id">{{ character.name }}</option></select></label><label>主词条<select v-model="statFilter" aria-label="筛选主词条"><option value="">全部主词条</option><option v-for="option in statOptions" :key="option.stat" :value="option.stat">{{ option.label }}</option></select></label><label>副词条<select v-model="subFilter" aria-label="筛选副词条"><option value="">全部副词条</option><option v-for="option in statOptions" :key="option.stat" :value="option.stat">{{ option.label }}</option></select></label><label>强化等级<select v-model="levelFilter" aria-label="筛选强化等级"><option value="">全部等级</option><option v-for="n in 21" :key="n" :value="String(n-1)">+{{ n-1 }}</option></select></label></div><FilterActions @reset="resetFilters" @confirm="filterOpen=false" /></WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="圣遗物排序" size="filter" @close="sortOpen=false"><SortPanel :model-value="sort" v-model:direction="sortDirection" :options="[{value:'default',label:'导入顺序'},{value:'level',label:'等级'},{value:'name',label:'名称'}]" @update:model-value="setSortKey" @reset="sort='default';sortDirection='asc'" @confirm="sortOpen=false" /></WorkbenchDialog>
    <div class="inventory-cards" :class="density"><button v-for="item in visible" :key="item.id" class="inventory-card artifact-item-card" :data-rarity="item.real?.rarity" :data-density="density" :class="{ 'five-star': item.real?.rarity === 5 }" :aria-label="`${pick ? '选择' : '查看'} ${item.name} ${item.id.slice(-6)}`" @click="selectedId = item.id">
      <ArtifactSummary :account="inventory" :item="item" :variant="density" :effective-stats="props.effectiveStats" />
      <span v-if="item.mona?.omit || item.mona?.setIdentityPending" class="artifact-flags"><small v-if="item.mona?.omit">原文件标记忽略</small><small v-if="item.mona?.setIdentityPending">套装身份待核对</small></span>
    </button></div>
    <div v-if="!filtered.length" class="empty"><h3>{{ inventory.artifacts.length ? '没有符合条件的圣遗物' : '圣遗物库还是空的' }}</h3><p>{{ inventory.artifacts.length ? '调整筛选或清空搜索后重试。' : '先导入莫娜文件，确认预览后即可在这里浏览真实词条。' }}</p></div>
    <div class="pagination"><button :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages" @click="page++">下一页</button></div>
    </template><component :is="inline ? 'section' : WorkbenchDialog" v-if="selected && pick" :title="inline ? undefined : selected.name" @close="selectedId = ''"><button v-if="inline" class="ui-action soft" data-accent="anemo" @click="selectedId = ''">返回库存候选</button><div class="artifact-comparison"><section v-if="compareTo"><h3>当前装备</h3><ArtifactSummary :account="inventory" :item="compareTo" variant="relaxed" :effective-stats="props.effectiveStats" /></section><section><h3>准备装备</h3><ArtifactSummary :account="inventory" :item="selected" variant="relaxed" :effective-stats="props.effectiveStats" /></section></div><p>本地占用：{{ owner(selected) ?? '未装备' }}</p><p v-if="selected.mona?.equippedBy">原始穿戴备注：{{ selected.mona.equippedBy }}（与当前装备状态分开保存）</p><button class="ui-action" data-accent="anemo" @click="emit('select',selected); selectedId = ''">选择这件圣遗物</button><ArtifactIdentity :item="selected" /></component>
    <ArtifactDetail v-if="selected && !pick" ref="artifactDetail" :item="selected" :account="props.account" @close="selectedId=''" />
  </section>
</template>
<style scoped>
.inventory-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.inventory-search { position:relative; flex:1; min-width:160px; max-width:320px; }.inventory-search > svg { position:absolute; left:12px; top:12px; width:16px; height:16px; }.inventory-search input { padding-left:36px; }.inventory-count { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px 6px; margin-left:auto; font-size:var(--font-body); color:var(--muted); }.inventory-options { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:12px 0 16px; }.slot-tabs { display:flex; flex-wrap:wrap; gap:8px; }.slot-tabs button { display:flex; align-items:center; justify-content:center; gap:5px; height:40px; min-height:40px; padding:0 8px; font-size:var(--font-body); font-weight:700; }.slot-tabs button.active { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }.slot-tabs :deep(.artifactSlots) { color:inherit; }.density-options { margin-left:0; }.inventory-reset { border:0; padding:0 4px; min-height:32px; background:transparent; color:var(--muted); font-size:var(--font-body); }.applied { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }
.inventory-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr)); gap:10px; }.inventory-cards.compact { grid-template-columns:repeat(auto-fill,minmax(min(100%,184px),1fr)); gap:4px; }.pagination { display:flex; align-items:center; justify-content:center; gap:12px; margin:16px 0 0; font-size:var(--font-body); }.empty { padding:24px 0; text-align:center; }.artifact-flags { display:flex; gap:5px; margin-top:4px; font-size:var(--font-body); color:var(--muted); }
.artifact-filter-panel { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }.artifact-filter-panel label { display:grid; gap:8px; font-size:var(--font-body); font-weight:700; }.filter-dialog-actions { display:flex; align-items:center; justify-content:space-between; margin-top:20px; gap:8px; }.inventory-sort-options { display:flex; flex-wrap:wrap; gap:8px; }.artifact-comparison { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:20px; margin-top:16px; }.artifact-comparison h3 { margin:0 0 12px; font-size:var(--font-control); }
@media(max-width:600px) { .inventory-count { width:100%; justify-content:space-between; }.inventory-search { max-width:none; }.slot-tabs { gap:6px; }.slot-tabs button { flex:1; }.inventory-options { align-items:flex-start; }.artifact-filter-panel { grid-template-columns:minmax(0,1fr); } }
</style>
