<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { RealStat } from '@leyline/schema';
import { accountSlots, accountSlotLabels, artifactOwner, type AccountArtifact, type AccountSlot } from './domain/account';
import { accountStatLabels, ratioStat } from './domain/account-real';
import { useAccountStore } from './stores/account';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ArtifactEditor from './ArtifactEditor.vue';
import flower from './assets/genshin/artifact-flower.webp';
import plume from './assets/genshin/artifact-plume.webp';
import sands from './assets/genshin/artifact-sands.webp';
import goblet from './assets/genshin/artifact-goblet.webp';
import circlet from './assets/genshin/artifact-circlet.webp';
const props = defineProps<{ slot?: AccountSlot; pick?: boolean }>();
const emit = defineEmits<{ select: [item: AccountArtifact] }>();
const store = useAccountStore();
const images = { flower, plume, sands, goblet, circlet };
const context = storeToRefs(store);
const query = props.pick ? ref('') : context.inventoryQuery;
const slotFilter = props.pick ? ref('') : context.inventorySlot;
const statFilter = props.pick ? ref('') : context.inventoryStat;
const ownerFilter = props.pick ? ref('all') : context.inventoryOwner;
const page = props.pick ? ref(1) : context.inventoryPage;
const selectedId = ref('');
const selected = computed(() => store.account.artifacts.find(item => item.id === selectedId.value));
const format = (stat: RealStat, value: number) => `${(value * (ratioStat(stat) ? 100 : 1)).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}${ratioStat(stat) ? '%' : ''}`;
const owner = (item: AccountArtifact) => artifactOwner(store.account, item.id)?.name;
const filtered = computed(() => store.account.artifacts.filter(item => {
  const slot = props.slot || slotFilter.value;
  return (!slot || item.slot === slot) && (!statFilter.value || item.real?.mainStat === statFilter.value)
    && (ownerFilter.value === 'all' || (ownerFilter.value === 'free' ? !owner(item) : !!owner(item)))
    && `${item.name} ${owner(item) ?? ''} ${item.mona?.equippedBy ?? ''}`.includes(query.value.trim());
}));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 30)));
const visible = computed(() => filtered.value.slice((page.value - 1) * 30, page.value * 30));
watch([query, slotFilter, statFilter, ownerFilter, () => props.slot], () => { page.value = 1; });
watch(pages, count => { page.value = Math.min(page.value, count); });
</script>
<template>
  <section class="artifact-browser" aria-label="圣遗物库存浏览">
    <div class="filters"><label class="search">搜索库存<input v-model="query" aria-label="搜索圣遗物" placeholder="套装、角色或穿戴备注"></label><label>主词条<select v-model="statFilter" aria-label="筛选主词条"><option value="">全部主词条</option><option v-for="(name, stat) in accountStatLabels" :key="stat" :value="stat">{{ name }}</option></select></label><label>占用<select v-model="ownerFilter" aria-label="筛选装备占用"><option value="all">全部</option><option value="free">未在本地装备</option><option value="equipped">本地已装备</option></select></label></div>
    <div v-if="!slot" class="slot-tabs" aria-label="筛选圣遗物部位"><button :class="{ active: !slotFilter }" @click="slotFilter = ''">全部部位</button><button v-for="part in accountSlots" :key="part" :class="{ active: slotFilter === part }" @click="slotFilter = part">{{ accountSlotLabels[part] }}</button></div>
    <div class="inventory-count" role="status">共 {{ store.account.artifacts.length }} 件 · 筛选结果 {{ filtered.length }} 件 <span>第 {{ page }} / {{ pages }} 页</span></div>
    <div class="inventory-cards"><button v-for="item in visible" :key="item.id" class="inventory-card" :aria-label="`${pick ? '选择' : '查看'} ${item.name} ${item.id.slice(-6)}`" @click="pick ? emit('select', item) : selectedId = item.id">
      <div class="card-heading"><span>{{ accountSlotLabels[item.slot] }}</span><span>+{{ item.real?.level ?? 0 }}</span></div>
      <img :src="images[item.slot]" alt="" width="72" height="72"><h3>{{ item.name }}</h3>
      <p class="primary-stat">{{ item.real ? accountStatLabels[item.real.mainStat] : '旧版攻击增量' }} <strong>{{ item.real ? (item.mona ? format(item.real.mainStat, item.mona.mainValue) : '按等级表') : item.attack }}</strong></p>
      <dl v-if="item.real"><template v-for="sub in item.real.substats" :key="sub.stat"><dt>{{ accountStatLabels[sub.stat] }}</dt><dd>{{ format(sub.stat, sub.value) }}</dd></template></dl>
      <footer>{{ owner(item) ? `本地装备 · ${owner(item)}` : item.mona?.equippedBy ? `导出备注 · ${item.mona.equippedBy}` : '未装备' }}<small v-if="item.mona?.omit">原文件标记忽略</small><small v-if="item.mona?.setIdentityPending">套装身份待核对 · 不可用于计算</small></footer>
    </button></div>
    <div v-if="!filtered.length" class="empty"><h3>{{ store.account.artifacts.length ? '没有符合条件的圣遗物' : '圣遗物库还是空的' }}</h3><p>{{ store.account.artifacts.length ? '调整筛选或清空搜索后重试。' : '先导入莫娜文件，确认预览后即可在这里浏览真实词条。' }}</p></div>
    <div class="pagination"><button :disabled="page <= 1" @click="page--">上一页</button><button :disabled="page >= pages" @click="page++">下一页</button></div>
    <WorkbenchDialog v-if="selected" :title="selected.name" @close="selectedId = ''"><p>本地占用：{{ owner(selected) ?? '未装备' }}</p><p v-if="selected.mona?.equippedBy">原始穿戴备注：{{ selected.mona.equippedBy }}（不代表已导入完整角色资料）</p><ArtifactEditor :item="selected" /><details><summary>来源与实物身份</summary><p>{{ selected.real?.source?.key }}</p><p>{{ selected.id }}</p><p>{{ selected.real?.source?.fingerprint }}</p></details></WorkbenchDialog>
  </section>
</template>
<style scoped>
.filters { display:flex; flex-wrap:wrap; gap:16px; align-items:end; } label { display:grid; gap:7px; font-size:13px; } .search { flex:1; min-width:180px; } input,select { min-height:40px; width:100%; box-sizing:border-box; } .slot-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:20px 0; } .slot-tabs .active { background:#314e48; color:#fff8df; border-color:#314e48; }
.inventory-count { display:flex; justify-content:space-between; padding:12px 0; font-size:13px; color:#596b62; } .inventory-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(205px,1fr)); gap:14px; }
.inventory-card { text-align:left; padding:16px; background:linear-gradient(155deg,#fffdf7,#f2efdf); border:1px solid #d8cfb4; border-radius:10px; color:#34443e; transition:transform .12s,box-shadow .12s; } .inventory-card:hover { transform:translateY(-2px); box-shadow:0 5px 16px #354b4520; } .card-heading { display:flex; justify-content:space-between; font-size:12px; color:#776c4e; } img { display:block; margin:8px auto; } h3 { font-size:14px; margin:8px 0; } .primary-stat { font-size:12px; padding-bottom:10px; border-bottom:1px solid #ded8c3; } strong { float:right; } dl { display:grid; grid-template-columns:1fr auto; gap:7px; font-size:12px; min-height:68px; } dd { margin:0; } footer { font-size:11px; border-top:1px solid #ded8c3; padding-top:10px; color:#657668; } footer small { display:block; } .pagination { display:flex; justify-content:center; gap:12px; margin:24px 0 0; } .empty { padding:60px 20px; text-align:center; border:1px dashed #bdb79e; border-radius:12px; } .empty p { font-size:13px; } details { overflow-wrap:anywhere; margin-top:16px; }
@media(max-width:600px) { .inventory-cards { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .inventory-card { padding:10px; } .filters > label { flex:1; min-width:120px; } }
</style>
