<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted } from 'vue';

type Counts = { total: number; opening: number; discovered: number; closed: number; reopened: number; ending: number };
type Behavior = { id: string; rowId: string; side: string; category: string; facet: string; gaps: string[]; transition: string; source: string; reason?: string };
type Batch = { facet: string; behaviors: number; rows: number; blockers: Record<string, number>; totals?: Record<string, Counts> };
type Coverage = { file: string; totals: Record<string, Counts>; batches: Batch[]; facets: Record<string, string>; gaps: Record<string, string>; baseline: unknown; productChanges: {rowId: string; name: string}[] };
const props = defineProps<{ coverage: Coverage; rows: { id: string; name: string; entityName?: string }[] }>();
const emit = defineEmits<{ inspect: [id: string] }>();
const params = new URLSearchParams(location.search);
const group = ref(params.get('group') ?? '');
const transition = ref(params.get('change') ?? 'ending');
const facet = ref(params.get('batch') ?? '');
const gap = ref(params.get('gap') ?? '');
const page = ref(Math.max(1, Number(params.get('bp')) || 1));
const records = shallowRef<Behavior[]>([]);
const loading = ref(true), error = ref('');
const names = computed(() => new Map(props.rows.map(r => [r.id, r])));
const changes = { ending: '期末缺口', discovered: '新发现', closed: '本批关闭', reopened: '重新打开', all: '全部行为' };
const columns = ['discovered', 'closed', 'reopened', 'ending'] as const;
const label = (id: string) => id.split('/').map(s => ({ mona: 'Mona', leyline: 'LeyLine', damage: '伤害', buff: 'Buff', unknown: '待定范围' })[s] ?? s).join(' ');
const cohort = computed(() => records.value.filter(b => (!group.value || group.value === b.side + '/' + b.category)
  && (!facet.value || b.facet === facet.value)
  && (transition.value === 'all' || (transition.value === 'ending' ? b.gaps.length : b.transition === transition.value))));
const filtered = computed(() => gap.value ? cohort.value.filter(b => b.gaps.includes(gap.value)) : cohort.value);
const blockers = computed(() => {
  const counts: Record<string, number> = {};
  for (const b of cohort.value) for (const g of b.gaps) counts[g] = (counts[g] ?? 0) + 1;
  return counts;
});
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 15)));
const visible = computed(() => filtered.value.slice(15 * (page.value - 1), 15 * page.value));
const batch = computed(() => props.coverage.batches.find(b => b.facet === facet.value));
const windowCounts = computed(() => {
  if (!facet.value) return props.coverage.totals;
  if (batch.value?.totals) return batch.value.totals;
  const counts = Object.fromEntries(Object.keys(props.coverage.totals).map(key => [key, { total: 0, opening: 0, discovered: 0, closed: 0, reopened: 0, ending: 0 }]));
  for (const b of records.value) {
    if (b.facet !== facet.value) continue;
    const c = counts[b.side + '/' + b.category];
    c.total++;
    if (b.gaps.length) c.ending++;
    if (b.transition === 'pending' || b.transition === 'closed') c.opening++;
    if (b.transition === 'discovered' || b.transition === 'closed' || b.transition === 'reopened') c[b.transition]++;
  }
  return counts;
});
function drill(key: string, state: string) { group.value = key; transition.value = state; gap.value = ''; }
watch([group, transition, facet, gap], () => { page.value = 1; }, { flush: 'sync' });
watch([group, transition, facet, gap, page], () => {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ group: group.value, change: transition.value, batch: facet.value, gap: gap.value, bp: page.value > 1 ? String(page.value) : '' })) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
});
onMounted(async () => {
  try {
    const response = await fetch('./data/' + props.coverage.file);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    records.value = (await response.json()).behaviors;
    page.value = Math.min(page.value, pages.value);
  } catch (cause) { error.value = '行为台账加载失败，刷新页面可重试。' + String(cause); }
  finally { loading.value = false; }
});
</script>

<template>
  <section class="behavior-ledger" aria-label="行为缺口">
    <div class="section-head"><h2>行为缺口</h2><span>{{ coverage.baseline ? '与上批按行为编号比较' : '首次建账' }}</span></div>
    <div v-if="coverage.baseline" class="ledger-controls"><strong>本批新增或修正并已实算的正式绑定　{{ coverage.productChanges?.length ?? 0 }}</strong>
      <button v-for="change in coverage.productChanges" :key="change.rowId" type="button" @click="emit('inspect', change.rowId)">{{ change.name }}</button>
    </div>
    <div class="ledger-controls">
      <label>机制批次<select v-model="facet" name="batch"><option value="">全部批次</option><option v-for="(name, id) in coverage.facets" :key="id" :value="id">{{ name }}</option></select></label>
      <span v-if="batch">待办 {{ batch.behaviors }} 项行为，涉及 {{ batch.rows }} 个条目</span>
    </div>
    <div class="table-wrap"><table class="ledger-counts"><thead><tr><th>来源范围</th><th>行为总数</th><th>期初缺口</th><th v-for="key in columns" :key="key">{{ changes[key] }}</th></tr></thead>
      <tbody><tr v-for="(counts, key) in windowCounts" :key="key"><th scope="row">{{ label(String(key)) }}</th><td>{{ counts.total }}</td><td>{{ counts.opening }}</td>
        <td v-for="state in columns" :key="state"><button type="button" class="count-link" :disabled="!counts[state]" :aria-label="label(String(key)) + changes[state] + counts[state]" @click="drill(String(key), state)">{{ counts[state] }}</button></td>
      </tr></tbody></table></div>
    <div class="ledger-controls">
      <label>来源范围<select v-model="group" name="group"><option value="">全部范围</option><option v-for="(_, key) in coverage.totals" :key="key" :value="key">{{ label(String(key)) }}</option></select></label>
      <label>本批变化<select v-model="transition" name="change"><option v-for="(name, key) in changes" :key="key" :value="key">{{ name }}</option></select></label>
      <label>缺少的证据<select v-model="gap" name="gap"><option value="">全部缺口</option><option v-for="(name, key) in coverage.gaps" :key="key" :value="key">{{ name }} ({{ blockers[key] ?? 0 }})</option></select></label>
      <span aria-live="polite">{{ loading ? '正在加载…' : filtered.length + ' 项行为' }}</span>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-else-if="visible.length" class="table-wrap"><table class="behavior-list"><thead><tr><th>来源条目</th><th>行为</th><th>缺口</th></tr></thead>
      <tbody><tr v-for="b in visible" :key="b.id"><td>
        <button v-if="names.has(b.rowId)" class="row-link" type="button" @click="emit('inspect', b.rowId)">{{ names.get(b.rowId)?.entityName }} {{ names.get(b.rowId)?.name }}</button>
        <span v-else>{{ b.rowId }}</span><small>{{ b.source }}</small></td>
        <td>{{ coverage.facets[b.facet] }}<small v-if="b.reason">{{ b.reason }}</small></td><td>{{ b.gaps.map(k => coverage.gaps[k]).join('、') || '已核对' }}</td></tr></tbody></table></div>
    <p v-else-if="!loading" class="empty">当前条件下没有行为记录。</p>
    <nav v-if="pages > 1" class="pagination" aria-label="行为分页"><button type="button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button type="button" :disabled="page >= pages" @click="page++">下一页</button></nav>
  </section>
</template>
