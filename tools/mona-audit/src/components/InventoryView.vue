<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AuditRow, InventoryFilters } from '../types';
import {
  attributionStatusLabel,
  categoryLabel,
  causeLabel,
  comparisonTone,
  formatInt,
  ROLE_LABELS,
  runTone,
  shortPath,
  sideLabel,
} from '../utils/format';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  rows: AuditRow[];
  filters: InventoryFilters;
  page: number;
  selectedRowId: string;
}>();

const emit = defineEmits<{
  'update:page': [value: number];
  inspect: [id: string];
  reset: [];
  openEntity: [entityKey: string];
}>();

const pageSize = ref(25);
const sortKey = ref<'default' | 'entity' | 'comparison' | 'run'>('default');
const sortAsc = ref(true);

const optionList = (key: 'side' | 'category' | 'comparison' | 'run' | 'mechanism') =>
  [...new Set(props.rows.map(row => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

const sides = computed(() => optionList('side'));
const categories = computed(() => optionList('category'));
const comparisons = computed(() => optionList('comparison'));
const runs = computed(() => optionList('run'));
const mechanisms = computed(() => optionList('mechanism'));

const causes = computed(() => {
  const set = new Set<string>();
  for (const row of props.rows) {
    for (const c of row.attributionCauses ?? []) set.add(c);
  }
  return [...set].sort((a, b) => causeLabel(a).localeCompare(causeLabel(b), 'zh-CN'));
});

const presetCounts = computed(() => {
  let openDiff = 0;
  let scopedDiff = 0;
  let allDiff = 0;
  let matched = 0;
  let monaDamage = 0;
  let monaBuff = 0;
  let leylineDamage = 0;
  let leylineBuff = 0;
  for (const row of props.rows) {
    if (row.comparison === '有差异') {
      allDiff++;
      if (row.attributionStatus === 'attributed-scoped') scopedDiff++;
      else if (row.attributionStatus !== 'attributed') openDiff++;
    } else if (row.comparison === '一致') {
      matched++;
    }
    if (row.side === 'mona' && row.category === 'damage') monaDamage++;
    else if (row.side === 'mona' && row.category === 'buff') monaBuff++;
    else if (row.side === 'leyline' && row.category === 'damage') leylineDamage++;
    else if (row.side === 'leyline' && row.category === 'buff') leylineBuff++;
  }
  return { openDiff, scopedDiff, allDiff, matched, monaDamage, monaBuff, leylineDamage, leylineBuff };
});

const filtered = computed(() => {
  const needle = props.filters.q.trim().toLocaleLowerCase();
  return props.rows.filter(row => {
    if (props.filters.side && row.side !== props.filters.side) return false;
    if (props.filters.category && row.category !== props.filters.category) return false;
    if (props.filters.comparison && row.comparison !== props.filters.comparison) return false;
    if (props.filters.run && row.run !== props.filters.run) return false;
    if (props.filters.mechanism && row.mechanism !== props.filters.mechanism) return false;
    if (props.filters.role && !row.roles?.includes(props.filters.role)) return false;
    if (props.filters.attr) {
      if (props.filters.attr === 'open' && (row.attributionStatus === 'attributed' || row.attributionStatus === 'attributed-scoped')) return false;
      if (props.filters.attr === 'attributed' && row.attributionStatus !== 'attributed') return false;
      if (props.filters.attr === 'attributed-scoped' && row.attributionStatus !== 'attributed-scoped') return false;
    }
    if (props.filters.cause) {
      const rowCauses = row.attributionCauses?.length ? row.attributionCauses : ['unclassified'];
      if (!rowCauses.includes(props.filters.cause)) return false;
    }
    if (props.filters.entity && row.entityKey !== props.filters.entity) return false;
    if (!needle) return true;
    return (
      row.name.toLocaleLowerCase().includes(needle) ||
      (row.entityName ?? '').toLocaleLowerCase().includes(needle) ||
      row.entity.toLocaleLowerCase().includes(needle) ||
      row.mechanism.toLocaleLowerCase().includes(needle) ||
      row.featureText.toLocaleLowerCase().includes(needle) ||
      row.id.toLocaleLowerCase().includes(needle)
    );
  });
});

const sorted = computed(() => {
  if (sortKey.value === 'default') return filtered.value;
  const dir = sortAsc.value ? 1 : -1;
  return [...filtered.value].sort((a, b) => {
    if (sortKey.value === 'entity') {
      return dir * (a.entityName || a.entity).localeCompare(b.entityName || b.entity, 'zh-CN');
    }
    if (sortKey.value === 'comparison') {
      return dir * a.comparison.localeCompare(b.comparison, 'zh-CN');
    }
    return dir * a.run.localeCompare(b.run, 'zh-CN');
  });
});

const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)));
const visible = computed(() => {
  const safePage = Math.min(props.page, pages.value);
  return sorted.value.slice((safePage - 1) * pageSize.value, safePage * pageSize.value);
});

watch(
  [
    () => props.filters.q,
    () => props.filters.side,
    () => props.filters.category,
    () => props.filters.comparison,
    () => props.filters.run,
    () => props.filters.mechanism,
    () => props.filters.role,
    () => props.filters.attr,
    () => props.filters.cause,
    () => props.filters.entity,
    pageSize,
  ],
  () => {
    emit('update:page', 1);
  },
);

watch(pages, max => {
  if (props.page > max) emit('update:page', max);
});

function toggleSort(key: 'entity' | 'comparison' | 'run') {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

function applyPreset(preset: Partial<InventoryFilters>) {
  emit('reset');
  Object.assign(props.filters, preset);
}

function isPreset(check: Partial<InventoryFilters>): boolean {
  return Object.entries(check).every(([k, v]) => props.filters[k as keyof InventoryFilters] === v);
}

function comparisonText(row: AuditRow): string {
  if (row.comparison === '有差异' && row.attributionStatus) {
    return `有差异 ${attributionStatusLabel(row.attributionStatus)}`;
  }
  return row.comparison || '—';
}
</script>

<template>
  <section class="panel" aria-label="审计条目">
    <!-- Quick Presets & Multi-filter Bar -->
    <div class="filter-bar">
      <div class="pill-group" role="group" aria-label="快捷筛选">
        <button
          type="button"
          class="pill-btn danger"
          :aria-pressed="isPreset({ comparison: '有差异', attr: 'open' })"
          @click="applyPreset({ comparison: '有差异', attr: 'open' })"
        >
          <span>待核对差异</span>
          <strong class="num">{{ formatInt(presetCounts.openDiff) }}</strong>
        </button>
        <button
          v-if="presetCounts.scopedDiff > 0"
          type="button"
          class="pill-btn"
          :aria-pressed="isPreset({ comparison: '有差异', attr: 'attributed-scoped' })"
          @click="applyPreset({ comparison: '有差异', attr: 'attributed-scoped' })"
        >
          <span>限定范围归因</span>
          <strong class="num">{{ formatInt(presetCounts.scopedDiff) }}</strong>
        </button>
        <button
          type="button"
          class="pill-btn danger"
          :aria-pressed="isPreset({ comparison: '有差异', attr: '' })"
          @click="applyPreset({ comparison: '有差异' })"
        >
          <span>全部差异</span>
          <strong class="num">{{ formatInt(presetCounts.allDiff) }}</strong>
        </button>
        <button
          type="button"
          class="pill-btn success"
          :aria-pressed="isPreset({ comparison: '一致', side: '' })"
          @click="applyPreset({ comparison: '一致' })"
        >
          <span>已一致</span>
          <strong class="num">{{ formatInt(presetCounts.matched) }}</strong>
        </button>
        <button
          type="button"
          class="pill-btn"
          :aria-pressed="isPreset({ side: 'mona', category: 'damage', comparison: '' })"
          @click="applyPreset({ side: 'mona', category: 'damage' })"
        >
          <span>Mona 伤害</span>
          <strong class="num">{{ formatInt(presetCounts.monaDamage) }}</strong>
        </button>
        <button
          type="button"
          class="pill-btn"
          :aria-pressed="isPreset({ side: 'mona', category: 'buff', comparison: '' })"
          @click="applyPreset({ side: 'mona', category: 'buff' })"
        >
          <span>Mona 增益</span>
          <strong class="num">{{ formatInt(presetCounts.monaBuff) }}</strong>
        </button>
        <button
          type="button"
          class="pill-btn"
          :aria-pressed="isPreset({ side: 'leyline', category: 'damage', comparison: '' })"
          @click="applyPreset({ side: 'leyline', category: 'damage' })"
        >
          <span>LeyLine 伤害</span>
          <strong class="num">{{ formatInt(presetCounts.leylineDamage) }}</strong>
        </button>
        <button
          type="button"
          class="pill-btn"
          :aria-pressed="isPreset({ side: 'leyline', category: 'buff', comparison: '' })"
          @click="applyPreset({ side: 'leyline', category: 'buff' })"
        >
          <span>LeyLine 增益</span>
          <strong class="num">{{ formatInt(presetCounts.leylineBuff) }}</strong>
        </button>
      </div>

      <div class="filter-grid">
        <label class="field-label">
          <span>搜索</span>
          <input v-model="filters.q" name="q" type="search" class="ctrl-input" autocomplete="off" placeholder="实体、名称、机制或特征">
        </label>
        <label class="field-label">
          <span>来源</span>
          <select v-model="filters.side" class="ctrl-select">
            <option value="">全部来源</option>
            <option v-for="item in sides" :key="item" :value="item">{{ sideLabel(item) }}</option>
          </select>
        </label>
        <label class="field-label">
          <span>分类</span>
          <select v-model="filters.category" class="ctrl-select">
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item" :value="item">{{ categoryLabel(item) }}</option>
          </select>
        </label>
        <label class="field-label">
          <span>对照结论</span>
          <select v-model="filters.comparison" class="ctrl-select" aria-label="对照">
            <option value="">全部结果</option>
            <option v-for="item in comparisons" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="field-label">
          <span>差异归因</span>
          <select v-model="filters.attr" class="ctrl-select">
            <option value="">全部状态</option>
            <option value="open">待核对</option>
            <option value="attributed">已归因</option>
            <option value="attributed-scoped">限定范围已归因</option>
          </select>
        </label>
        <label class="field-label">
          <span>差异原因</span>
          <select v-model="filters.cause" class="ctrl-select">
            <option value="">全部原因</option>
            <option v-for="item in causes" :key="item" :value="item">{{ causeLabel(item) }}</option>
          </select>
        </label>
        <label class="field-label">
          <span>来源归属</span>
          <select v-model="filters.role" name="role" class="ctrl-select">
            <option value="">全部归属</option>
            <option v-for="(name, key) in ROLE_LABELS" :key="key" :value="key">{{ name }}</option>
          </select>
        </label>
        <label class="field-label">
          <span>运行状态</span>
          <select v-model="filters.run" class="ctrl-select">
            <option value="">全部运行</option>
            <option v-for="item in runs" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="field-label">
          <span>机制</span>
          <select v-model="filters.mechanism" class="ctrl-select">
            <option value="">全部机制</option>
            <option v-for="item in mechanisms" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <div>
          <button type="button" class="btn" style="width: 100%;" @click="emit('reset')">清除筛选</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <span class="muted num" aria-live="polite">
          显示 {{ formatInt(filtered.length) }} / {{ formatInt(rows.length) }} 条
        </span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="display: inline-flex; align-items: center; gap: 6px; color: var(--neutral-muted);">
            <span>每页</span>
            <select v-model.number="pageSize" class="ctrl-select" style="height: 32px; width: 84px;">
              <option :value="25">25 条</option>
              <option :value="50">50 条</option>
              <option :value="100">100 条</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <!-- Results Table -->
    <div v-if="!filtered.length" class="empty-state">
      <span>没有符合条件的审计条目</span>
      <button type="button" class="btn btn-sm" @click="emit('reset')">清除筛选</button>
    </div>

    <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th style="min-width: 240px;">
              <button type="button" class="th-sort" @click="toggleSort('entity')">
                条目与实体 {{ sortKey === 'entity' ? (sortAsc ? '↑' : '↓') : '' }}
              </button>
            </th>
            <th style="min-width: 260px;">机制与特征</th>
            <th style="width: 115px;">
              <button type="button" class="th-sort" @click="toggleSort('run')">
                运行 {{ sortKey === 'run' ? (sortAsc ? '↑' : '↓') : '' }}
              </button>
            </th>
            <th style="width: 170px;">
              <button type="button" class="th-sort" @click="toggleSort('comparison')">
                对齐结论 {{ sortKey === 'comparison' ? (sortAsc ? '↑' : '↓') : '' }}
              </button>
            </th>
            <th style="min-width: 180px;">LeyLine 实现</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visible" :key="row.id" :class="{ active: selectedRowId === row.id }">
            <td>
              <button type="button" class="row-trigger" @click="emit('inspect', row.id)">
                {{ row.name || row.entityName || row.entity || row.id }}
              </button>
              <div class="row-sub">
                <StatusBadge :tone="row.side === 'mona' ? 'info' : 'purple'" :label="sideLabel(row.side)" />
                <StatusBadge tone="neutral" :label="categoryLabel(row.category)" />
                <button
                  v-if="row.entityKey"
                  type="button"
                  class="row-trigger"
                  style="font-weight: 600; color: var(--neutral-muted);"
                  @click="emit('openEntity', row.entityKey)"
                >
                  {{ row.entityName || row.entity }}
                </button>
                <span v-else>{{ row.entityName || row.entity }}</span>
              </div>
            </td>
            <td>
              <div>{{ row.featureText || row.mechanism || '—' }}</div>
              <div v-if="row.attributionCauses?.length" class="row-sub">
                <StatusBadge
                  v-for="cause in row.attributionCauses"
                  :key="cause"
                  tone="warning"
                  :label="causeLabel(cause)"
                />
              </div>
            </td>
            <td>
              <StatusBadge :tone="runTone(row.run)" :label="row.run || '—'" />
            </td>
            <td>
              <StatusBadge :tone="comparisonTone(row.comparison, row.attributionStatus)" :label="comparisonText(row)" />
            </td>
            <td>
              <span class="muted" :title="row.implementation">{{ shortPath(row.implementation) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="filtered.length" class="pagination-bar" aria-label="分页">
      <span class="muted num">第 {{ page }} / {{ pages }} 页</span>
      <div class="pagination-actions">
        <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="emit('update:page', page - 1)">上一页</button>
        <button type="button" class="btn btn-sm" :disabled="page >= pages" @click="emit('update:page', page + 1)">下一页</button>
      </div>
    </nav>
  </section>
</template>
