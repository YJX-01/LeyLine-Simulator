<script setup lang="ts">
import { computed } from 'vue';
import type { AuditIndex, AuditRow, InventoryFilters } from '../types';
import { causeLabel, formatInt, formatPercent, formatSignedDelta, formatTimestamp, sideLabel } from '../utils/format';
import StackedBar, { type BarSegment } from './StackedBar.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  index: AuditIndex;
}>();

const emit = defineEmits<{
  drillInventory: [preset: Partial<InventoryFilters>];
  openView: [view: 'entities' | 'behaviors' | 'inventory'];
  inspect: [id: string];
}>();

const summary = computed(() => props.index.summary);

const diffStats = computed(() => {
  let total = 0;
  let open = 0;
  let attributed = 0;
  let scoped = 0;
  const causes = new Map<string, { cause: string; total: number; open: number; scoped: number; attributed: number }>();

  for (const row of props.index.rows) {
    if (row.comparison !== '有差异') continue;
    total++;
    if (row.attributionStatus === 'attributed') attributed++;
    else if (row.attributionStatus === 'attributed-scoped') scoped++;
    else open++;

    const rowCauses = row.attributionCauses?.length ? row.attributionCauses : ['unclassified'];
    for (const cause of rowCauses) {
      const current = causes.get(cause) ?? { cause, total: 0, open: 0, scoped: 0, attributed: 0 };
      current.total++;
      if (row.attributionStatus === 'attributed') current.attributed++;
      else if (row.attributionStatus === 'attributed-scoped') current.scoped++;
      else current.open++;
      causes.set(cause, current);
    }
  }

  return {
    total,
    open,
    attributed,
    scoped,
    causes: [...causes.values()].sort((a, b) => b.open - a.open || b.scoped - a.scoped || b.total - a.total),
  };
});

const behaviorTotals = computed(() => {
  const totals = props.index.coverage?.totals;
  if (!totals) return null;
  let total = 0;
  let opening = 0;
  let discovered = 0;
  let reopened = 0;
  let closed = 0;
  let ending = 0;
  for (const counts of Object.values(totals)) {
    total += counts.total;
    opening += counts.opening;
    discovered += counts.discovered;
    reopened += counts.reopened;
    closed += counts.closed;
    ending += counts.ending;
  }
  const verified = Math.max(0, total - ending);
  return { total, opening, discovered, reopened, closed, ending, verified, netChange: ending - opening };
});

function sideBreakdown(side: 'mona' | 'leyline') {
  const counts = { matched: 0, openDiff: 0, scopedDiff: 0, attrDiff: 0, pending: 0, exclusive: 0, unmapped: 0 };
  for (const row of props.index.rows as AuditRow[]) {
    if (row.side !== side) continue;
    if (row.comparison === '一致') counts.matched++;
    else if (row.comparison === '有差异') {
      if (row.attributionStatus === 'attributed') counts.attrDiff++;
      else if (row.attributionStatus === 'attributed-scoped') counts.scopedDiff++;
      else counts.openDiff++;
    } else if (row.comparison === '待确认' || row.comparison === '条件不可比') counts.pending++;
    else if (row.comparison === '仅 Mona' || row.comparison === '仅 LeyLine') counts.exclusive++;
    else counts.unmapped++;
  }
  return counts;
}

const monaBreakdown = computed(() => sideBreakdown('mona'));
const leylineBreakdown = computed(() => sideBreakdown('leyline'));

function buildComparisonSegments(side: 'mona' | 'leyline', counts: ReturnType<typeof sideBreakdown>): BarSegment[] {
  return [
    { key: '一致', label: '一致', value: counts.matched, tone: 'success', clickable: true },
    { key: '有差异:open', label: '待核对差异', value: counts.openDiff, tone: 'danger', clickable: true },
    { key: '有差异:attributed-scoped', label: '限定范围归因', value: counts.scopedDiff, tone: 'warning', clickable: true },
    { key: '有差异:attributed', label: '已归因差异', value: counts.attrDiff, tone: 'warning', clickable: true },
    { key: '待确认', label: '待确认', value: counts.pending, tone: 'warning', clickable: true },
    {
      key: side === 'mona' ? '仅 Mona' : '仅 LeyLine',
      label: side === 'mona' ? '仅 Mona' : '仅 LeyLine',
      value: counts.exclusive,
      tone: side === 'mona' ? 'info' : 'purple',
      clickable: true,
    },
    { key: '无复核映射', label: '无复核映射', value: counts.unmapped, tone: 'neutral', clickable: true },
  ];
}

function buildRunSegments(side: 'mona' | 'leyline'): BarSegment[] {
  const s = summary.value.sides[side];
  if (!s) return [];
  return [
    { key: '已跑通', label: '已跑通', value: s.passed, tone: 'success', clickable: true },
    { key: '执行失败', label: '执行失败', value: s.failed, tone: 'danger', clickable: true },
    { key: '未验证', label: '未验证', value: s.unverified, tone: 'neutral', clickable: true },
  ];
}

function drillComparison(side: 'mona' | 'leyline', key: string) {
  if (key === '有差异:open') {
    emit('drillInventory', { side, comparison: '有差异', attr: 'open' });
  } else if (key === '有差异:attributed-scoped') {
    emit('drillInventory', { side, comparison: '有差异', attr: 'attributed-scoped' });
  } else if (key === '有差异:attributed') {
    emit('drillInventory', { side, comparison: '有差异', attr: 'attributed' });
  } else {
    emit('drillInventory', { side, comparison: key });
  }
}

function drillRun(side: 'mona' | 'leyline', run: string) {
  emit('drillInventory', { side, run });
}

const deltaEntries = computed(() => {
  const delta = summary.value.delta;
  if (!delta) return [];
  const groups: { title: string; items: { label: string; value: number; positiveIsGood?: boolean }[] }[] = [];
  for (const side of ['mona', 'leyline'] as const) {
    const d = delta[side];
    if (!d) continue;
    groups.push({
      title: `${sideLabel(side)} 条目变化`,
      items: [
        { label: '已跑通', value: d.passed ?? 0, positiveIsGood: true },
        { label: '执行失败', value: d.failed ?? 0, positiveIsGood: false },
        { label: '一致', value: d.matched ?? 0, positiveIsGood: true },
        { label: '有差异', value: d.different ?? 0, positiveIsGood: false },
      ],
    });
  }
  if (delta.mappings) {
    groups.push({
      title: '映射与场景变化',
      items: [
        { label: '映射一致', value: delta.mappings.matched ?? 0, positiveIsGood: true },
        { label: '映射差异', value: delta.mappings.different ?? 0, positiveIsGood: false },
        { label: '独立公式检查', value: delta.comparisons?.matched ?? 0, positiveIsGood: true },
        { label: '运行场景', value: delta.scenarios?.total ?? 0, positiveIsGood: true },
      ],
    });
  }
  return groups;
});

function deltaClass(value: number, positiveIsGood = true): string {
  if (value === 0) return 'delta-zero';
  const good = positiveIsGood ? value > 0 : value < 0;
  return good ? 'delta-pos' : 'delta-neg';
}

const groupedIssues = computed(() => {
  const map = new Map<string, { message: string; ids: string[]; count: number }>();
  for (const item of summary.value.issues) {
    const message = String(item.issue ?? item.message ?? JSON.stringify(item));
    const bucket = map.get(message) ?? { message, ids: [], count: 0 };
    bucket.count++;
    if (typeof item.id === 'string' && item.id) bucket.ids.push(item.id);
    map.set(message, bucket);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
});
</script>

<template>
  <section class="overview-stack" aria-label="对齐总览">
    <!-- KPI Row -->
    <div class="kpi-grid">
      <button
        type="button"
        class="kpi-card clickable"
        @click="emit('drillInventory', { comparison: '一致' })"
      >
        <div class="kpi-head">
          <span>可对照映射一致率</span>
          <StatusBadge
            :tone="summary.mappings.different === 0 ? 'success' : 'info'"
            :label="`共 ${formatInt(summary.mappings.total)} 组`"
          />
        </div>
        <div class="kpi-main">
          <span class="kpi-figure">{{ formatPercent(summary.mappings.matched, summary.mappings.comparable ?? summary.mappings.total) }}</span>
          <span class="kpi-sub">{{ formatInt(summary.mappings.matched) }} / {{ formatInt(summary.mappings.comparable ?? summary.mappings.total) }}</span>
        </div>
        <span class="muted num">
          差异映射 {{ formatInt(summary.mappings.different) }}（已归因 {{ formatInt(summary.attributedMappings) }}<template v-if="summary.attributedScopedMappings"> / 限定归因 {{ formatInt(summary.attributedScopedMappings) }}</template>）
        </span>
      </button>

      <button
        type="button"
        class="kpi-card clickable"
        @click="emit('drillInventory', { comparison: '有差异', attr: 'open' })"
      >
        <div class="kpi-head">
          <span>差异条目与归因</span>
          <StatusBadge
            :tone="diffStats.open > 0 ? 'danger' : 'success'"
            :label="diffStats.open > 0 ? `待核对 ${formatInt(diffStats.open)}` : '无未归因差异'"
          />
        </div>
        <div class="kpi-main">
          <span class="kpi-figure">{{ formatInt(diffStats.total) }}</span>
          <span class="kpi-sub">
            已归因 {{ formatInt(diffStats.attributed) }}<template v-if="diffStats.scoped > 0"> / 限定 {{ formatInt(diffStats.scoped) }}</template> / 待核对 {{ formatInt(diffStats.open) }}
          </span>
        </div>
        <span class="muted">点击直接筛选待核对差异条目</span>
      </button>

      <div class="kpi-card">
        <div class="kpi-head">
          <span>独立公式与剧变对照</span>
          <StatusBadge
            :tone="summary.comparisons.different === 0 ? 'success' : 'danger'"
            :label="summary.comparisons.different === 0 ? '公式 100% 通过' : `差异 ${summary.comparisons.different}`"
          />
        </div>
        <div class="kpi-main">
          <span class="kpi-figure">{{ formatInt(summary.comparisons.matched) }}</span>
          <span class="kpi-sub">独立算例 / {{ formatInt(summary.scenarios.total) }} 场景</span>
        </div>
        <span class="muted num">
          剧变同输入 {{ formatInt(summary.direct.matched) }} 一致 / {{ formatInt(summary.direct.different) }} 差异（已归因 {{ formatInt(summary.attributedScenarios) }}）
        </span>
      </div>

      <button
        v-if="behaviorTotals"
        type="button"
        class="kpi-card clickable"
        @click="emit('openView', 'behaviors')"
      >
        <div class="kpi-head">
          <span>行为台账收敛</span>
          <StatusBadge
            :tone="behaviorTotals.closed > 0 ? 'success' : 'neutral'"
            :label="`本批关闭 ${formatInt(behaviorTotals.closed)}`"
          />
        </div>
        <div class="kpi-main">
          <span class="kpi-figure">{{ formatPercent(behaviorTotals.verified, behaviorTotals.total, 2) }}</span>
          <span class="kpi-sub">已核对 {{ formatInt(behaviorTotals.verified) }} / {{ formatInt(behaviorTotals.total) }}</span>
        </div>
        <span class="muted num">
          期末缺口 {{ formatInt(behaviorTotals.ending) }}（新发现 {{ formatInt(behaviorTotals.discovered) }} / 重开 {{ formatInt(behaviorTotals.reopened) }}）
        </span>
      </button>
    </div>

    <!-- Mona vs LeyLine Alignment Cards -->
    <div class="two-col-grid">
      <article v-for="side in (['mona', 'leyline'] as const)" :key="side" class="panel">
        <div class="panel-head side-card-head">
          <div style="display: flex; align-items: center; gap: 10px;">
            <StatusBadge :tone="side === 'mona' ? 'info' : 'purple'" :label="sideLabel(side)" />
            <h2>{{ side === 'mona' ? 'Mona 侧覆盖与对齐' : 'LeyLine 侧覆盖与对齐' }}</h2>
          </div>
          <span class="muted num">
            展示 {{ formatInt(summary.sides[side]?.rows) }} 条（原始 {{ formatInt(summary.sides[side]?.raw) }}）
          </span>
        </div>
        <div class="panel-body block-gap">
          <div class="side-metrics">
            <div class="mini-stat">
              <div class="mini-stat-label">伤害条目</div>
              <div class="mini-stat-value">{{ formatInt(summary.sides[side]?.damage) }}</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">增益条目</div>
              <div class="mini-stat-value">{{ formatInt(summary.sides[side]?.buff) }}</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">未分类 / 归属项</div>
              <div class="mini-stat-value">{{ formatInt(summary.sides[side]?.unknown) }}</div>
            </div>
          </div>

          <div>
            <div class="side-card-head" style="margin-bottom: 8px;">
              <strong>对照结论分布</strong>
              <span class="muted num">
                可对照一致率 {{ formatPercent(summary.sides[side]?.matched ?? 0, summary.sides[side]?.comparable ?? 0) }}
              </span>
            </div>
            <StackedBar
              :segments="buildComparisonSegments(side, side === 'mona' ? monaBreakdown : leylineBreakdown)"
              :aria-label="`${sideLabel(side)} 对照结论分布`"
              @select="key => drillComparison(side, key)"
            />
          </div>

          <div>
            <div class="side-card-head" style="margin-bottom: 8px;">
              <strong>本侧运行验证</strong>
              <span class="muted num">
                已跑通 {{ formatPercent(summary.sides[side]?.passed ?? 0, summary.sides[side]?.rows ?? 0) }}
              </span>
            </div>
            <StackedBar
              :segments="buildRunSegments(side)"
              compact
              :aria-label="`${sideLabel(side)} 运行状态分布`"
              @select="run => drillRun(side, run)"
            />
          </div>
        </div>
      </article>
    </div>

    <!-- Difference Causes & Delta / Product Changes -->
    <div class="two-col-grid">
      <article class="panel">
        <div class="panel-head">
          <h2>差异原因归类</h2>
          <button
            type="button"
            class="btn btn-sm"
            @click="emit('drillInventory', { comparison: '有差异' })"
          >
            查看全部 {{ formatInt(diffStats.total) }} 条差异
          </button>
        </div>
        <div class="panel-body">
          <div v-if="diffStats.causes.length" class="cause-list">
            <button
              v-for="item in diffStats.causes"
              :key="item.cause"
              type="button"
              class="cause-row"
              @click="emit('drillInventory', { comparison: '有差异', cause: item.cause })"
            >
              <div class="cause-row-top">
                <span class="cause-row-title">{{ causeLabel(item.cause) }}</span>
                <span class="cause-counts">
                  <StatusBadge v-if="item.open > 0" tone="danger" :label="`待核对 ${item.open}`" />
                  <StatusBadge v-if="item.scoped > 0" tone="warning" :label="`限定归因 ${item.scoped}`" />
                  <StatusBadge v-if="item.attributed > 0" tone="warning" :label="`已归因 ${item.attributed}`" />
                </span>
              </div>
              <StackedBar
                compact
                :show-legend="false"
                :segments="[
                  { key: 'open', label: '待核对', value: item.open, tone: 'danger' },
                  { key: 'scoped', label: '限定归因', value: item.scoped, tone: 'warning' },
                  { key: 'attr', label: '已归因', value: item.attributed, tone: 'warning' },
                ]"
              />
            </button>
          </div>
          <div v-else class="empty-state">当前报告没有差异条目。</div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <h2>本轮变化与正式绑定</h2>
          <button type="button" class="btn btn-sm" @click="emit('openView', 'entities')">
            进入实体双栏对照
          </button>
        </div>
        <div class="panel-body block-gap">
          <div v-if="deltaEntries.length" class="delta-grid">
            <div v-for="group in deltaEntries" :key="group.title" class="delta-box">
              <strong>{{ group.title }}</strong>
              <div v-for="item in group.items" :key="item.label" class="delta-line">
                <span class="muted">{{ item.label }}</span>
                <span :class="deltaClass(item.value, item.positiveIsGood)">{{ formatSignedDelta(item.value) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="muted">本次快照没有相对上一轮的对比增量。</p>

          <div v-if="index.coverage?.productChanges?.length" class="block-gap" style="gap: 8px;">
            <strong>本批新增或修正并已实算的正式绑定（{{ formatInt(index.coverage.productChanges.length) }}）</strong>
            <div class="chip-wrap">
              <button
                v-for="change in index.coverage.productChanges.slice(0, 16)"
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
      </article>
    </div>

    <!-- Stateless Full-Catalog Sweep Summary (Read-only supplementary view) -->
    <article v-if="index.sweep?.modes?.length" class="panel" aria-label="无状态全量扫雷覆盖">
      <div class="panel-head">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <h2>无状态全量数值扫雷（{{ index.sweep.totals.modes }} 个专项模式）</h2>
          <StatusBadge
            :tone="index.sweep.totals.suspect === 0 ? 'success' : 'danger'"
            :label="index.sweep.totals.suspect === 0 ? '0 疑似真误差' : `疑似真误差 ${formatInt(index.sweep.totals.suspect)}`"
          />
          <StatusBadge
            tone="warning"
            :label="`已知 Mona 误差 ${formatInt(index.sweep.totals.knownArtifact)}`"
          />
        </div>
        <span class="muted num">
          匹配 {{ formatInt(index.sweep.totals.matched) }} / {{ formatInt(index.sweep.totals.total) }}，更新于 {{ formatTimestamp(index.sweep.generatedAt) }}
        </span>
      </div>
      <div class="table-scroll">
        <table class="data-table num">
          <thead>
            <tr>
              <th>专项模式</th>
              <th style="width: 190px;">通过率</th>
              <th style="text-align: right;">已匹配 / 总计</th>
              <th style="text-align: right;">疑似真误差</th>
              <th style="text-align: right;">已知 Mona 误差</th>
              <th style="text-align: right;">耗时</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in index.sweep.modes" :key="m.mode">
              <td>
                <strong>{{ m.label }}</strong>
                <span class="muted" style="margin-left: 8px;">{{ m.mode }}</span>
              </td>
              <td>
                <StackedBar
                  compact
                  :show-legend="false"
                  :segments="[
                    { key: 'ok', label: '匹配', value: m.matched, tone: 'success' },
                    { key: 'known', label: '已知 Mona 误差', value: m.knownArtifact, tone: 'warning' },
                    { key: 'suspect', label: '疑似真误差', value: m.suspect, tone: 'danger' },
                    { key: 'other', label: '其他', value: Math.max(0, m.total - m.matched - m.knownArtifact - m.suspect), tone: 'neutral' },
                  ]"
                />
              </td>
              <td style="text-align: right;">
                <strong>{{ formatInt(m.matched) }}</strong> / {{ formatInt(m.total) }}
                <span class="muted">({{ formatPercent(m.matched, m.total) }})</span>
              </td>
              <td style="text-align: right;">
                <StatusBadge :tone="m.suspect === 0 ? 'success' : 'danger'" :label="formatInt(m.suspect)" />
              </td>
              <td style="text-align: right;">
                <StatusBadge :tone="m.knownArtifact > 0 ? 'warning' : 'neutral'" :label="formatInt(m.knownArtifact)" />
              </td>
              <td style="text-align: right;" class="muted">
                {{ m.elapsedMs ? `${(m.elapsedMs / 1000).toFixed(1)}s` : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <!-- Issues & Limitations -->
    <article v-if="summary.issues.length || summary.limitations.length" class="panel">
      <div class="panel-head">
        <h2>审计提醒与范围限制</h2>
        <span class="muted num">问题 {{ summary.issues.length }} 项 / 范围说明 {{ summary.limitations.length }} 项</span>
      </div>
      <div class="panel-body block-gap">
        <ul v-if="groupedIssues.length" class="issue-list">
          <li v-for="group in groupedIssues" :key="group.message" class="issue-item" style="display: grid; gap: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <strong>{{ group.message }}</strong>
              <StatusBadge tone="danger" :label="`${formatInt(group.count)} 项`" />
            </div>
            <details v-if="group.ids.length" style="font-size: 13px;">
              <summary style="cursor: pointer; color: var(--pyro-deep);">查看涉及条目（{{ formatInt(group.ids.length) }}）</summary>
              <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px 10px;">
                <span v-for="(id, idx) in group.ids" :key="idx">{{ id }}</span>
              </div>
            </details>
          </li>
        </ul>
        <ul v-if="summary.limitations.length" class="issue-list">
          <li v-for="(limit, idx) in summary.limitations" :key="idx" class="limit-item">
            {{ limit }}
          </li>
        </ul>
      </div>
    </article>
  </section>
</template>
