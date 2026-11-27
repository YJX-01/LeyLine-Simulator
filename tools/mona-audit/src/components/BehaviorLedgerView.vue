<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import type { AuditRow, BehaviorCounts, BehaviorCoverage, BehaviorRecord } from '../types';
import { behaviorGroupLabel, formatInt, formatPercent, shortPath } from '../utils/format';
import StackedBar from './StackedBar.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  coverage: BehaviorCoverage;
  rows: AuditRow[];
}>();

const emit = defineEmits<{
  inspect: [id: string];
}>();

const params = new URLSearchParams(location.search);
const group = ref(params.get('group') ?? '');
const transition = ref(params.get('change') ?? 'ending');
const facet = ref(params.get('batch') ?? '');
const gap = ref(params.get('gap') ?? '');
const search = ref('');
const page = ref(Math.max(1, Number(params.get('bp')) || 1));
const pageSize = 20;

const records = shallowRef<BehaviorRecord[]>([]);
const loading = ref(true);
const error = ref('');

const rowLookup = computed(() => new Map(props.rows.map(row => [row.id, row])));
const changes: Record<string, string> = {
  ending: '期末缺口',
  discovered: '新发现',
  closed: '本批关闭',
  reopened: '重新打开',
  all: '全部行为',
};
const columns = ['discovered', 'closed', 'reopened', 'ending'] as const;

const cohort = computed(() =>
  records.value.filter(
    item =>
      (!group.value || group.value === `${item.side}/${item.category}`) &&
      (!facet.value || item.facet === facet.value) &&
      (transition.value === 'all' ||
        (transition.value === 'ending' ? item.gaps.length > 0 : item.transition === transition.value)),
  ),
);

const filtered = computed(() => {
  const base = gap.value ? cohort.value.filter(item => item.gaps.includes(gap.value)) : cohort.value;
  const needle = search.value.trim().toLocaleLowerCase();
  if (!needle) return base;
  return base.filter(item => {
    const row = rowLookup.value.get(item.rowId);
    return (
      item.id.toLocaleLowerCase().includes(needle) ||
      item.source.toLocaleLowerCase().includes(needle) ||
      (item.reason ?? '').toLocaleLowerCase().includes(needle) ||
      (row?.entityName ?? '').toLocaleLowerCase().includes(needle) ||
      (row?.name ?? '').toLocaleLowerCase().includes(needle)
    );
  });
});

const blockers = computed(() => {
  const counts: Record<string, number> = {};
  for (const item of cohort.value) {
    for (const g of item.gaps) counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
});

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice(pageSize * (page.value - 1), pageSize * page.value));
const activeBatch = computed(() => props.coverage.batches.find(item => item.facet === facet.value));

const sortedBatches = computed(() =>
  [...props.coverage.batches].filter(item => item.behaviors > 0).sort((a, b) => b.behaviors - a.behaviors),
);
const maxBatchBehaviors = computed(() => Math.max(1, ...sortedBatches.value.map(item => item.behaviors)));

const windowCounts = computed<Record<string, BehaviorCounts>>(() => {
  if (!facet.value) return props.coverage.totals;
  if (activeBatch.value?.totals) return activeBatch.value.totals;
  const counts: Record<string, BehaviorCounts> = Object.fromEntries(
    Object.keys(props.coverage.totals).map(key => [
      key,
      { total: 0, opening: 0, discovered: 0, closed: 0, reopened: 0, ending: 0 },
    ]),
  );
  for (const item of records.value) {
    if (item.facet !== facet.value) continue;
    const c = counts[`${item.side}/${item.category}`];
    if (!c) continue;
    c.total++;
    if (item.gaps.length) c.ending++;
    if (item.transition === 'pending' || item.transition === 'closed') c.opening++;
    if (item.transition === 'discovered' || item.transition === 'closed' || item.transition === 'reopened') {
      c[item.transition]++;
    }
  }
  return counts;
});

function drill(key: string, state: string) {
  group.value = key;
  transition.value = state;
  gap.value = '';
}

function toggleFacet(facetId: string) {
  facet.value = facet.value === facetId ? '' : facetId;
}

function gapTone(gapKey: string): 'danger' | 'warning' | 'neutral' {
  if (gapKey === 'failed' || gapKey === 'difference' || gapKey === 'absent') return 'danger';
  if (gapKey === 'mapping' || gapKey === 'binding' || gapKey === 'implementation' || gapKey === 'scope') return 'warning';
  return 'neutral';
}

watch([group, transition, facet, gap, search], () => {
  page.value = 1;
}, { flush: 'sync' });

watch([group, transition, facet, gap, page], () => {
  const url = new URL(location.href);
  const entries: Record<string, string> = {
    group: group.value,
    change: transition.value,
    batch: facet.value,
    gap: gap.value,
    bp: page.value > 1 ? String(page.value) : '',
  };
  for (const [key, value] of Object.entries(entries)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
});

onMounted(async () => {
  try {
    const response = await fetch(`./data/${props.coverage.file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { behaviors: BehaviorRecord[] };
    records.value = payload.behaviors ?? [];
    page.value = Math.min(page.value, pages.value);
  } catch (cause) {
    error.value = `行为台账加载失败，刷新页面可重试。${cause instanceof Error ? cause.message : String(cause)}`;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="ledger-stack" aria-label="行为缺口">
    <!-- Top Summary Card -->
    <div class="panel">
      <div class="panel-head">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <h2>行为缺口收支台账</h2>
          <StatusBadge
            :tone="coverage.baseline ? 'info' : 'neutral'"
            :label="coverage.baseline ? '与上批按行为编号比较' : '首次建账'"
          />
        </div>
        <span v-if="activeBatch" class="muted num">
          当前批次待办 {{ formatInt(activeBatch.behaviors) }} 项行为，涉及 {{ formatInt(activeBatch.rows) }} 个条目
        </span>
      </div>

      <div v-if="coverage.baseline && coverage.productChanges?.length" class="panel-body" style="border-bottom: 1px solid var(--neutral-line-soft);">
        <div style="display: grid; gap: 8px;">
          <strong>本批新增或修正并已实算的正式绑定 {{ formatInt(coverage.productChanges.length) }}</strong>
          <div class="chip-wrap">
            <button
              v-for="change in coverage.productChanges"
              :key="change.rowId + (change.id ?? '')"
              type="button"
              class="chip-btn"
              @click="emit('inspect', change.rowId)"
            >
              {{ change.name }}
            </button>
          </div>
        </div>
      </div>

      <div class="table-scroll">
        <table class="ledger-table">
          <thead>
            <tr>
              <th>来源范围</th>
              <th style="width: 170px;">已核对进度</th>
              <th>行为总数</th>
              <th>期初缺口</th>
              <th v-for="key in columns" :key="key">{{ changes[key] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(counts, key) in windowCounts" :key="key">
              <th scope="row">{{ behaviorGroupLabel(String(key)) }}</th>
              <td>
                <div style="display: grid; gap: 4px;">
                  <StackedBar
                    compact
                    :show-legend="false"
                    :segments="[
                      { key: 'done', label: '已核对', value: Math.max(0, counts.total - counts.ending), tone: 'success' },
                      { key: 'open', label: '期末缺口', value: counts.ending, tone: 'neutral' },
                    ]"
                  />
                  <span class="muted num" style="font-size: 12px; text-align: left;">
                    {{ formatPercent(Math.max(0, counts.total - counts.ending), counts.total) }}
                  </span>
                </div>
              </td>
              <td>{{ formatInt(counts.total) }}</td>
              <td>{{ formatInt(counts.opening) }}</td>
              <td v-for="state in columns" :key="state">
                <button
                  type="button"
                  class="count-drill"
                  :class="state"
                  :disabled="!counts[state]"
                  :aria-label="behaviorGroupLabel(String(key)) + changes[state] + counts[state]"
                  @click="drill(String(key), state)"
                >
                  {{ formatInt(counts[state]) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Facet Backlog Strip -->
    <div v-if="sortedBatches.length" class="panel">
      <div class="panel-head">
        <h2>机制批次缺口分布</h2>
        <button v-if="facet" type="button" class="btn btn-xs" @click="facet = ''">显示全部批次</button>
      </div>
      <div class="panel-body">
        <div class="facet-bars">
          <button
            v-for="item in sortedBatches"
            :key="item.facet"
            type="button"
            class="facet-bar-btn"
            :class="{ active: facet === item.facet }"
            @click="toggleFacet(item.facet)"
          >
            <div class="facet-bar-top">
              <span>{{ coverage.facets[item.facet] ?? item.facet }}</span>
              <span class="num">{{ formatInt(item.behaviors) }}</span>
            </div>
            <div class="facet-bar-track">
              <div class="facet-bar-fill" :style="{ width: `${Math.max(4, (item.behaviors / maxBatchBehaviors) * 100)}%` }" />
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Filter + Behavior Records Table -->
    <div class="panel">
      <div class="filter-bar">
        <div class="filter-grid">
          <label class="field-label">
            <span>搜索行为</span>
            <input v-model="search" type="search" class="ctrl-input" placeholder="实体名、条目名、来源路径">
          </label>
          <label class="field-label">
            <span>机制批次</span>
            <select v-model="facet" name="batch" class="ctrl-select">
              <option value="">全部批次</option>
              <option v-for="(name, id) in coverage.facets" :key="id" :value="id">{{ name }}</option>
            </select>
          </label>
          <label class="field-label">
            <span>来源范围</span>
            <select v-model="group" name="group" class="ctrl-select">
              <option value="">全部范围</option>
              <option v-for="(_, key) in coverage.totals" :key="key" :value="key">{{ behaviorGroupLabel(String(key)) }}</option>
            </select>
          </label>
          <label class="field-label">
            <span>本批变化</span>
            <select v-model="transition" name="change" class="ctrl-select">
              <option v-for="(name, key) in changes" :key="key" :value="key">{{ name }}</option>
            </select>
          </label>
          <label class="field-label">
            <span>缺少的证据</span>
            <select v-model="gap" name="gap" class="ctrl-select">
              <option value="">全部缺口</option>
              <option v-for="(name, key) in coverage.gaps" :key="key" :value="key">
                {{ name }} ({{ blockers[key] ?? 0 }})
              </option>
            </select>
          </label>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
          <span class="muted num" aria-live="polite">
            {{ loading ? '正在加载行为台账…' : `共 ${formatInt(filtered.length)} 项行为` }}
          </span>
          <button
            v-if="group || facet || gap || search || transition !== 'ending'"
            type="button"
            class="btn btn-sm"
            @click="group = ''; facet = ''; gap = ''; search = ''; transition = 'ending'"
          >
            重置筛选
          </button>
        </div>
      </div>

      <p v-if="error" class="notice-card error" role="alert" style="margin: 16px;">{{ error }}</p>

      <div v-else-if="visible.length" class="table-scroll">
        <table class="data-table behavior-list">
          <thead>
            <tr>
              <th style="width: 42%;">来源条目</th>
              <th style="width: 22%;">行为机制</th>
              <th>缺口状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in visible" :key="b.id">
              <td>
                <button
                  v-if="rowLookup.has(b.rowId)"
                  type="button"
                  class="row-trigger"
                  @click="emit('inspect', b.rowId)"
                >
                  {{ rowLookup.get(b.rowId)?.entityName }} {{ rowLookup.get(b.rowId)?.name }}
                </button>
                <span v-else>{{ b.rowId }}</span>
                <div class="row-sub">
                  <StatusBadge :tone="b.side === 'mona' ? 'info' : 'purple'" :label="behaviorGroupLabel(`${b.side}/${b.category}`)" />
                  <span :title="b.source">{{ shortPath(b.source) }}</span>
                </div>
              </td>
              <td>
                <strong>{{ coverage.facets[b.facet] ?? b.facet }}</strong>
                <div v-if="b.reason" class="muted" style="margin-top: 4px;">{{ b.reason }}</div>
              </td>
              <td>
                <div v-if="b.gaps.length" class="chip-wrap" style="gap: 6px;">
                  <StatusBadge
                    v-for="g in b.gaps"
                    :key="g"
                    :tone="gapTone(g)"
                    :label="coverage.gaps[g] ?? g"
                  />
                </div>
                <StatusBadge v-else tone="success" label="已核对" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="!loading" class="empty-state">当前条件下没有行为记录。</div>

      <nav v-if="pages > 1" class="pagination-bar" aria-label="行为分页">
        <span class="muted num">第 {{ page }} / {{ pages }} 页</span>
        <div class="pagination-actions">
          <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <button type="button" class="btn btn-sm" :disabled="page >= pages" @click="page++">下一页</button>
        </div>
      </nav>
    </div>
  </section>
</template>
