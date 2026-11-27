<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AuditRow, EntityKind, EntitySummary, InventoryFilters } from '../types';
import {
  attributionStatusLabel,
  categoryLabel,
  comparisonTone,
  elementLabel,
  entityKindLabel,
  formatInt,
  formatPercent,
  runTone,
} from '../utils/format';
import StackedBar from './StackedBar.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  entities: EntitySummary[];
  selectedEntityKey: string;
  selectedKind: string;
  selectedRowId: string;
}>();

const emit = defineEmits<{
  'update:selectedEntityKey': [key: string];
  'update:selectedKind': [kind: string];
  inspect: [id: string];
  drillInventory: [preset: Partial<InventoryFilters>];
}>();

const search = ref('');
const statusFilter = ref<'all' | 'diff' | 'open-diff' | 'both' | 'matched'>('all');
const sortBy = ref<'diff' | 'matched' | 'total' | 'name'>('diff');
const visibleLimit = ref(80);

const categoryTab = ref<'' | 'damage' | 'buff' | 'unknown'>('');
const rowScopeFilter = ref<'all' | 'diff' | 'matched' | 'linked'>('all');
const hoveredRowId = ref('');

const kindOptions: { key: '' | EntityKind; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'character', label: '角色' },
  { key: 'weapon', label: '武器' },
  { key: 'set', label: '圣遗物' },
  { key: 'reaction', label: '反应' },
  { key: 'resonance', label: '共鸣' },
];

const kindCounts = computed(() => {
  const counts: Record<string, number> = { '': props.entities.length };
  for (const item of props.entities) {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  }
  return counts;
});

const filteredEntities = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  const list = props.entities.filter(item => {
    if (props.selectedKind && item.kind !== props.selectedKind) return false;
    if (statusFilter.value === 'diff' && item.different === 0) return false;
    if (statusFilter.value === 'open-diff' && item.openDiff === 0) return false;
    if (statusFilter.value === 'both' && (item.monaCount === 0 || item.leylineCount === 0)) return false;
    if (statusFilter.value === 'matched' && item.matched === 0) return false;
    if (!needle) return true;
    return item.name.toLocaleLowerCase().includes(needle) || item.key.toLocaleLowerCase().includes(needle);
  });

  return [...list].sort((a, b) => {
    if (sortBy.value === 'diff') {
      return b.openDiff - a.openDiff || b.different - a.different || b.matched - a.matched || a.name.localeCompare(b.name, 'zh-CN');
    }
    if (sortBy.value === 'matched') {
      return b.matched - a.matched || b.total - a.total || a.name.localeCompare(b.name, 'zh-CN');
    }
    if (sortBy.value === 'total') {
      return b.total - a.total || a.name.localeCompare(b.name, 'zh-CN');
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });
});

watch([search, statusFilter, sortBy, () => props.selectedKind], () => {
  visibleLimit.value = 80;
});

const displayedEntities = computed(() => filteredEntities.value.slice(0, visibleLimit.value));

const activeEntity = computed(() => {
  if (props.selectedEntityKey) {
    const found = props.entities.find(item => item.key === props.selectedEntityKey);
    if (found) return found;
  }
  return filteredEntities.value[0] ?? null;
});

watch(
  filteredEntities,
  list => {
    if (!props.selectedEntityKey && list.length) {
      emit('update:selectedEntityKey', list[0].key);
    }
  },
  { immediate: true },
);

function filterSideRows(rows: AuditRow[], side: 'mona' | 'leyline'): AuditRow[] {
  return rows
    .filter(row => {
      if (row.side !== side) return false;
      if (categoryTab.value && row.category !== categoryTab.value) return false;
      if (rowScopeFilter.value === 'diff' && row.comparison !== '有差异') return false;
      if (rowScopeFilter.value === 'matched' && row.comparison !== '一致') return false;
      if (rowScopeFilter.value === 'linked' && !(row.counterpartIds && row.counterpartIds.length)) return false;
      return true;
    })
    .sort((a, b) => {
      const rank = (row: AuditRow) =>
        row.comparison === '有差异' ? (row.attributionStatus === 'attributed' ? 1 : 0) : row.comparison === '一致' ? 2 : row.comparison === '待确认' ? 3 : 4;
      return rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh-CN');
    });
}

const monaRows = computed(() => (activeEntity.value ? filterSideRows(activeEntity.value.rows, 'mona') : []));
const leylineRows = computed(() => (activeEntity.value ? filterSideRows(activeEntity.value.rows, 'leyline') : []));

const highlightedIds = computed(() => {
  const focusId = hoveredRowId.value || props.selectedRowId;
  if (!focusId || !activeEntity.value) return new Set<string>();
  const set = new Set<string>();
  const focused = activeEntity.value.rows.find(row => row.id === focusId);
  if (focused?.counterpartIds) {
    for (const id of focused.counterpartIds) set.add(id);
  }
  for (const row of activeEntity.value.rows) {
    if (row.counterpartIds?.includes(focusId)) set.add(row.id);
  }
  return set;
});

function rowComparisonLabel(row: AuditRow): string {
  if (row.comparison === '有差异' && row.attributionStatus) {
    return `有差异 ${attributionStatusLabel(row.attributionStatus)}`;
  }
  return row.comparison || '—';
}
</script>

<template>
  <section class="entity-layout" aria-label="实体对照">
    <!-- Left Sidebar: Unified Entities -->
    <aside class="panel entity-sidebar" aria-label="实体列表">
      <div class="entity-controls">
        <input
          v-model="search"
          type="search"
          class="ctrl-input"
          aria-label="搜索实体"
          placeholder="搜索角色、武器、圣遗物或反应"
        >
        <div class="pill-group" role="group" aria-label="实体类型">
          <button
            v-for="opt in kindOptions"
            :key="opt.key"
            type="button"
            class="pill-btn"
            :aria-pressed="selectedKind === opt.key"
            @click="emit('update:selectedKind', opt.key)"
          >
            <span>{{ opt.label }}</span>
            <span class="num muted">{{ kindCounts[opt.key] ?? 0 }}</span>
          </button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <select v-model="statusFilter" class="ctrl-select" aria-label="状态筛选">
            <option value="all">全部实体</option>
            <option value="open-diff">含待核对差异</option>
            <option value="diff">含任意差异</option>
            <option value="both">双侧均有条目</option>
            <option value="matched">含已一致条目</option>
          </select>
          <select v-model="sortBy" class="ctrl-select" aria-label="排序方式">
            <option value="diff">按差异优先</option>
            <option value="matched">按一致数降序</option>
            <option value="total">按条目数降序</option>
            <option value="name">按名称排序</option>
          </select>
        </div>
        <div class="muted num">匹配 {{ formatInt(filteredEntities.length) }} / {{ formatInt(entities.length) }} 个实体</div>
      </div>

      <div class="entity-scroll">
        <div v-if="!displayedEntities.length" class="empty-state">
          <span>没有匹配的实体</span>
          <button type="button" class="btn btn-sm" @click="search = ''; statusFilter = 'all'; emit('update:selectedKind', '')">
            重置筛选
          </button>
        </div>
        <template v-else>
          <button
            v-for="item in displayedEntities"
            :key="item.key"
            type="button"
            class="entity-item"
            :class="{ active: activeEntity?.key === item.key }"
            @click="emit('update:selectedEntityKey', item.key)"
          >
            <div class="entity-item-top">
              <div class="entity-name-wrap">
                <span v-if="item.element" class="element-dot" :class="`element-${item.element}`" aria-hidden="true" />
                <span class="entity-name">{{ item.name }}</span>
                <span v-if="item.name.toLowerCase() !== item.key" class="entity-key">{{ item.key }}</span>
              </div>
              <StatusBadge v-if="item.openDiff > 0" tone="danger" :label="`差异 ${item.openDiff}`" />
              <StatusBadge v-else-if="item.attributedDiff > 0" tone="warning" :label="`已归因 ${item.attributedDiff}`" />
              <StatusBadge v-else-if="item.matched > 0" tone="success" :label="`一致 ${item.matched}`" />
            </div>
            <div class="entity-item-counts">
              <span>{{ entityKindLabel(item.kind) }}</span>
              <span>Mona {{ item.monaCount }} / LeyLine {{ item.leylineCount }}</span>
            </div>
            <StackedBar
              compact
              :show-legend="false"
              :segments="[
                { key: 'matched', label: '一致', value: item.matched, tone: 'success' },
                { key: 'openDiff', label: '待核对差异', value: item.openDiff, tone: 'danger' },
                { key: 'attrDiff', label: '已归因差异', value: item.attributedDiff, tone: 'warning' },
                { key: 'pending', label: '待确认', value: item.pending, tone: 'warning' },
                { key: 'unmapped', label: '无映射', value: item.unmapped + item.exclusive, tone: 'neutral' },
              ]"
            />
          </button>
          <div v-if="filteredEntities.length > visibleLimit" style="padding: 12px; text-align: center;">
            <button type="button" class="btn btn-sm" @click="visibleLimit += 80">
              加载更多实体（剩余 {{ formatInt(filteredEntities.length - visibleLimit) }}）
            </button>
          </div>
        </template>
      </div>
    </aside>

    <!-- Right Workspace: Side-by-Side Alignment -->
    <div v-if="activeEntity" class="panel" aria-label="双侧对照明细">
      <div class="entity-split-head">
        <div class="side-card-head" style="flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <h2 style="font-size: 20px;">{{ activeEntity.name }}</h2>
            <StatusBadge tone="neutral" :label="entityKindLabel(activeEntity.kind)" :element="activeEntity.element" />
            <StatusBadge v-if="activeEntity.element" tone="info" :label="`${elementLabel(activeEntity.element)}元素`" />
            <span class="muted">{{ activeEntity.key }}</span>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            @click="emit('drillInventory', { q: activeEntity.name })"
          >
            在明细表中查看
          </button>
        </div>

        <StackedBar
          :segments="[
            { key: 'matched', label: '一致', value: activeEntity.matched, tone: 'success' },
            { key: 'openDiff', label: '待核对差异', value: activeEntity.openDiff, tone: 'danger' },
            { key: 'attrDiff', label: '已归因差异', value: activeEntity.attributedDiff, tone: 'warning' },
            { key: 'pending', label: '待确认', value: activeEntity.pending, tone: 'warning' },
            { key: 'exclusive', label: '仅单侧', value: activeEntity.exclusive, tone: 'purple' },
            { key: 'unmapped', label: '无映射', value: activeEntity.unmapped, tone: 'neutral' },
          ]"
          :aria-label="`${activeEntity.name} 对齐分布`"
        />

        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;">
          <div class="pill-group" role="group" aria-label="按分类筛选">
            <button type="button" class="pill-btn" :aria-pressed="categoryTab === ''" @click="categoryTab = ''">全部类别</button>
            <button type="button" class="pill-btn" :aria-pressed="categoryTab === 'damage'" @click="categoryTab = 'damage'">伤害</button>
            <button type="button" class="pill-btn" :aria-pressed="categoryTab === 'buff'" @click="categoryTab = 'buff'">增益</button>
            <button type="button" class="pill-btn" :aria-pressed="categoryTab === 'unknown'" @click="categoryTab = 'unknown'">未分类</button>
          </div>
          <div class="pill-group" role="group" aria-label="按对照状态筛选">
            <button type="button" class="pill-btn" :aria-pressed="rowScopeFilter === 'all'" @click="rowScopeFilter = 'all'">全部</button>
            <button type="button" class="pill-btn danger" :aria-pressed="rowScopeFilter === 'diff'" @click="rowScopeFilter = 'diff'">仅看差异</button>
            <button type="button" class="pill-btn success" :aria-pressed="rowScopeFilter === 'matched'" @click="rowScopeFilter = 'matched'">仅看一致</button>
            <button type="button" class="pill-btn" :aria-pressed="rowScopeFilter === 'linked'" @click="rowScopeFilter = 'linked'">仅看已关联</button>
          </div>
        </div>
        <div class="muted num">
          可对照一致率 {{ formatPercent(activeEntity.matched, activeEntity.comparable) }}，悬停任一卡片可联动高亮对侧对应条目
        </div>
      </div>

      <div class="entity-split-columns">
        <!-- Mona Column -->
        <div class="side-column">
          <div class="side-column-header mona">
            <span>Mona 侧</span>
            <span class="num">{{ formatInt(monaRows.length) }} 条</span>
          </div>
          <div v-if="!monaRows.length" class="empty-state">当前条件下无 Mona 条目</div>
          <button
            v-for="row in monaRows"
            :key="row.id"
            type="button"
            class="item-card"
            :class="{ selected: selectedRowId === row.id, linked: highlightedIds.has(row.id) }"
            @mouseenter="hoveredRowId = row.id"
            @mouseleave="hoveredRowId = ''"
            @focus="hoveredRowId = row.id"
            @blur="hoveredRowId = ''"
            @click="emit('inspect', row.id)"
          >
            <div class="item-card-top">
              <span class="item-card-title">{{ row.name || row.id }}</span>
              <StatusBadge :tone="comparisonTone(row.comparison, row.attributionStatus)" :label="rowComparisonLabel(row)" />
            </div>
            <div class="item-card-meta">
              <StatusBadge tone="neutral" :label="categoryLabel(row.category)" />
              <StatusBadge :tone="runTone(row.run)" :label="row.run" />
              <span>{{ row.mechanism }}</span>
              <span v-if="row.counterpartIds?.length" class="muted num">关联 {{ row.counterpartIds.length }}</span>
            </div>
          </button>
        </div>

        <!-- LeyLine Column -->
        <div class="side-column">
          <div class="side-column-header leyline">
            <span>LeyLine 侧</span>
            <span class="num">{{ formatInt(leylineRows.length) }} 条</span>
          </div>
          <div v-if="!leylineRows.length" class="empty-state">当前条件下无 LeyLine 条目</div>
          <button
            v-for="row in leylineRows"
            :key="row.id"
            type="button"
            class="item-card"
            :class="{ selected: selectedRowId === row.id, linked: highlightedIds.has(row.id) }"
            @mouseenter="hoveredRowId = row.id"
            @mouseleave="hoveredRowId = ''"
            @focus="hoveredRowId = row.id"
            @blur="hoveredRowId = ''"
            @click="emit('inspect', row.id)"
          >
            <div class="item-card-top">
              <span class="item-card-title">{{ row.name || row.id }}</span>
              <StatusBadge :tone="comparisonTone(row.comparison, row.attributionStatus)" :label="rowComparisonLabel(row)" />
            </div>
            <div class="item-card-meta">
              <StatusBadge tone="neutral" :label="categoryLabel(row.category)" />
              <StatusBadge :tone="runTone(row.run)" :label="row.run" />
              <span>{{ row.mechanism }}</span>
              <span v-if="row.counterpartIds?.length" class="muted num">关联 {{ row.counterpartIds.length }}</span>
            </div>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="panel empty-state">请从左侧选择一个实体查看双侧对照。</div>
  </section>
</template>
