<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { accountSlots, accountSlotLabels, artifactOwner, type AccountArtifact, type AccountSlot } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { useAccountStore } from './stores/account';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactForm from './ArtifactForm.vue';
import ArtifactSummary from './ArtifactSummary.vue';
import { loadAccountGameData } from './domain/account-presentation';
import { onMounted, shallowRef } from 'vue';
const props = defineProps<{ slot?: AccountSlot; pick?: boolean; compareTo?: AccountArtifact; inline?: boolean }>();
const emit = defineEmits<{ select: [item: AccountArtifact] }>();
const store = useAccountStore();
const context = storeToRefs(store);
const query = props.pick ? ref('') : context.inventoryQuery;
const slotFilter = props.pick ? ref('') : context.inventorySlot;
const statFilter = props.pick ? ref('') : context.inventoryStat;
const ownerFilter = props.pick ? ref('all') : context.inventoryOwner;
const page = props.pick ? ref(1) : context.inventoryPage;
const selectedId = ref('');
const editing = ref(false);
const catalogSets = shallowRef<{ id: string; name: string }[]>([]);
const setFilter = props.pick ? ref('') : context.inventorySet;
const subFilter = props.pick ? ref('') : context.inventorySubstat;
const levelFilter = props.pick ? ref('') : context.inventoryLevel;
const sort = props.pick ? ref('default') : context.inventorySort;
const sets = computed(() => [...new Set(store.account.artifacts.map(item => item.real?.setId ?? 'legacy'))].map(id => ({ id, name: catalogSets.value.find(set => set.id === id)?.name ?? (id.startsWith('mona-unresolved-') ? '套装身份待核对' : '旧版 / 散件') })));
onMounted(async () => { try { catalogSets.value = (await loadAccountGameData()).catalog.sets; } catch { store.error = '套装目录加载失败，请重新打开库存。'; } });
const selected = computed(() => store.account.artifacts.find(item => item.id === selectedId.value));
const owner = (item: AccountArtifact) => artifactOwner(store.account, item.id)?.name;
const filtered = computed(() => store.account.artifacts.filter(item => {
  const slot = props.slot || slotFilter.value;
  return (!slot || item.slot === slot) && (!statFilter.value || item.real?.mainStat === statFilter.value)
    && (ownerFilter.value === 'all' || (ownerFilter.value === 'free' ? !owner(item) : !!owner(item)))
    && (!setFilter.value || (item.real?.setId ?? 'legacy') === setFilter.value)
    && (!subFilter.value || item.real?.substats.some(sub => sub.stat === subFilter.value))
    && (!levelFilter.value || item.real?.level === Number(levelFilter.value))
    && (['all','free','equipped'].includes(ownerFilter.value) || artifactOwner(store.account,item.id)?.id === ownerFilter.value)
    && `${item.name} ${owner(item) ?? ''}`.includes(query.value.trim());
}));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 30)));
const visible = computed(() => { const items = [...filtered.value]; if (sort.value === 'level') items.sort((a,b) => (b.real?.level ?? 0)-(a.real?.level ?? 0)); if (sort.value === 'name') items.sort((a,b) => a.name.localeCompare(b.name,'zh-CN')); return items.slice((page.value-1)*30,page.value*30); });
watch([query, slotFilter, statFilter, ownerFilter, setFilter, subFilter, levelFilter, sort, () => props.slot], () => { page.value = 1; });
watch(pages, count => { page.value = Math.min(page.value, count); });
</script>
<template>
  <section class="artifact-browser" aria-label="圣遗物库存浏览">
    <template v-if="!inline || !selected"><div class="filters"><label class="search">搜索库存<input v-model="query" aria-label="搜索圣遗物" placeholder="圣遗物名称或当前装备角色"></label><label>主词条<select v-model="statFilter" aria-label="筛选主词条"><option value="">全部主词条</option><option v-for="(name, stat) in accountStatLabels" :key="stat" :value="stat">{{ name }}</option></select></label><label>占用<select v-model="ownerFilter" aria-label="筛选装备占用"><option value="all">全部</option><option value="free">未在本地装备</option><option value="equipped">本地已装备</option><option v-for="character in store.account.characters" :key="character.id" :value="character.id">{{ character.name }}</option></select></label></div>
    <div class="filters more-filters"><label>套装<select v-model="setFilter"><option value="">全部</option><option v-for="set in sets" :key="set.id" :value="set.id">{{ set.name }}</option></select></label><label>副词条<select v-model="subFilter"><option value="">全部</option><option v-for="(label,stat) in accountStatLabels" :key="stat" :value="stat">{{ label }}</option></select></label><label>强化等级<select v-model="levelFilter"><option value="">全部</option><option v-for="n in 21" :key="n" :value="String(n-1)">+{{ n-1 }}</option></select></label><label>排序<select v-model="sort"><option value="default">导入顺序</option><option value="level">等级从高到低</option><option value="name">名称</option></select></label><button @click="query = ''; slotFilter = ''; statFilter = ''; ownerFilter = 'all'; setFilter = ''; subFilter = ''; levelFilter = ''; sort = 'default'">重置筛选</button></div>
    <div v-if="!slot" class="slot-tabs" aria-label="筛选圣遗物部位"><button :class="{ active: !slotFilter }" @click="slotFilter = ''">全部部位</button><button v-for="part in accountSlots" :key="part" :class="{ active: slotFilter === part }" @click="slotFilter = part">{{ accountSlotLabels[part] }}</button></div>
    <div class="inventory-count" role="status">共 {{ store.account.artifacts.length }} 件 · 筛选结果 {{ filtered.length }} 件 <span>第 {{ page }} / {{ pages }} 页</span><span class="density-options" role="group" aria-label="卡片密度"><button :aria-pressed="store.inventoryDensity==='relaxed'" @click="store.inventoryDensity='relaxed'">疏松</button><button :aria-pressed="store.inventoryDensity==='compact'" @click="store.inventoryDensity='compact'">紧凑</button></span></div>
    <div class="pagination top"><button :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages" @click="page++">下一页</button></div>
    <div class="inventory-cards" :class="store.inventoryDensity"><button v-for="item in visible" :key="item.id" class="inventory-card artifact-item-card" :data-rarity="item.real?.rarity" :data-density="store.inventoryDensity" :class="{ 'five-star': item.real?.rarity === 5 }" :aria-label="`${pick ? '选择' : '查看'} ${item.name} ${item.id.slice(-6)}`" @click="selectedId = item.id; editing = false">
      <ArtifactSummary :item="item" :variant="store.inventoryDensity" />
      <span v-if="item.mona?.omit || item.mona?.setIdentityPending" class="artifact-flags"><small v-if="item.mona?.omit">原文件标记忽略</small><small v-if="item.mona?.setIdentityPending">套装身份待核对</small></span>
    </button></div>
    <div v-if="!filtered.length" class="empty"><h3>{{ store.account.artifacts.length ? '没有符合条件的圣遗物' : '圣遗物库还是空的' }}</h3><p>{{ store.account.artifacts.length ? '调整筛选或清空搜索后重试。' : '先导入莫娜文件，确认预览后即可在这里浏览真实词条。' }}</p></div>
    <div class="pagination"><button :disabled="page <= 1" @click="page--">上一页</button><button :disabled="page >= pages" @click="page++">下一页</button></div>
    </template><component :is="inline ? 'section' : WorkbenchDialog" v-if="selected" :title="inline ? undefined : editing ? '编辑圣遗物' : selected.name" @close="selectedId = ''; editing = false"><button v-if="inline" @click="selectedId = ''; editing = false">返回库存候选</button><ArtifactForm v-if="editing" :inline="inline" :item="selected" @close="editing = false" /><template v-else><div class="artifact-comparison"><section v-if="pick && compareTo"><h3>当前装备</h3><ArtifactSummary :item="compareTo" :variant="store.inventoryDensity" /></section><section><h3 v-if="pick">准备装备</h3><ArtifactSummary :item="selected" :variant="store.inventoryDensity" /></section></div><p>本地占用：{{ owner(selected) ?? '未装备' }}</p><p v-if="selected.mona?.equippedBy">原始穿戴备注：{{ selected.mona.equippedBy }}（与当前装备状态分开保存）</p><button v-if="pick" @click="emit('select',selected); selectedId = ''">选择这件圣遗物</button><button v-else @click="editing = true">编辑圣遗物</button><details><summary>来源与实物身份</summary><p>{{ selected.id }}</p><p>{{ selected.real?.source?.key }}</p><p v-if="selected.mona">原文件主词条：{{ selected.mona.mainValue }}；当前值按强化等级表显示。</p></details></template></component>
  </section>
</template>
<style scoped>
.filters { display:flex; flex-wrap:wrap; gap:16px; align-items:end; } label { display:grid; gap:7px; font-size:13px; } .search { flex:1; min-width:180px; } input,select { min-height:40px; width:100%; box-sizing:border-box; } .slot-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:20px 0; } .slot-tabs .active { background:var(--element-anemo-deep); color:#fff8df; border-color:var(--element-anemo-deep); }
.inventory-count { display:flex; justify-content:space-between; padding:12px 0; font-size:13px; color:var(--muted); } .inventory-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
  .card-heading { display:flex; justify-content:space-between; font-size:12px; color:var(--muted); } img { display:block; margin:8px auto; } h3 { font-size:14px; margin:8px 0; } .primary-stat { font-size:12px; padding-bottom:10px; border-bottom:1px solid var(--line); } strong { float:right; } dl { display:grid; grid-template-columns:1fr auto; gap:7px; font-size:12px; min-height:68px; } dd { margin:0; } .pagination { display:flex; justify-content:center; gap:12px; margin:24px 0 0; } .empty { padding:60px 20px; text-align:center; border:1px dashed var(--line); border-radius:12px; } .empty p { font-size:13px; } details { overflow-wrap:anywhere; margin-top:16px; }
@media(max-width:600px) { .inventory-cards { grid-template-columns:minmax(0,1fr); gap:8px; }  .filters > label { flex:1; min-width:120px; } }
.more-filters { margin-top:12px; }.pagination.top { justify-content:flex-end; margin:0 0 12px; align-items:center; }
.artifact-comparison { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:24px; }
.slot-tabs > button,.pagination > button { color:var(--muted); background:var(--surface); border-color:var(--line); }.slot-tabs > button.active { background:var(--element-anemo-deep); color:#fffdf2; border-color:var(--element-anemo-deep); }.filters label { color:var(--muted); font-size:12px; }.filters input,.filters select { background:var(--surface); border-color:var(--line); color:var(--ink); }.inventory-count { border-top:1px solid var(--line); margin-top:12px; }
.density-options { display:inline-flex; gap:3px; }.density-options button { padding:4px 8px; color:var(--muted); background:var(--surface); border-color:var(--line); font-size:12px; font-weight:700; }.density-options button[aria-pressed=true] { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }.inventory-count { gap:8px; flex-wrap:wrap; align-items:center; }.inventory-cards.compact { grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:8px; }.artifact-flags { display:flex; gap:5px; margin-top:4px; font-size:10px; color:var(--muted); }
</style>
