<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type {
  AssignmentItem,
  AttributionItem,
  AuditDetail,
  AuditRow,
  BuffReading,
  FormulaComparison,
  NumericPair,
  ReferenceItem,
} from '../types';
import {
  attributionStatusLabel,
  categoryLabel,
  causeLabel,
  comparisonTone,
  displayValue,
  FEATURE_LABELS,
  formatNumber,
  formatRelativeDiff,
  formatSignedDelta,
  RAW_SECTION_LABELS,
  runTone,
  shortPath,
  sideLabel,
  upstreamGithubUrl,
} from '../utils/format';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  row: AuditRow;
  detail: AuditDetail | null;
  loading: boolean;
  error: string;
  canGoBack: boolean;
  monaVersion?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  back: [];
  inspect: [id: string];
  openEntity: [entityKey: string];
}>();

const showAllPairs = ref(false);
const showAllComparisons = ref(false);
const openRaw = ref<Record<string, boolean>>({});
const copiedState = ref('');
let backdropPressed = false;

watch(() => props.row.id, () => {
  showAllPairs.value = false;
  showAllComparisons.value = false;
  openRaw.value = {};
  copiedState.value = '';
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function onBackdropDown(event: MouseEvent) {
  backdropPressed = event.target === event.currentTarget;
}

function onBackdropUp(event: MouseEvent) {
  if (backdropPressed && event.target === event.currentTarget) {
    emit('close');
  }
  backdropPressed = false;
}

const detailInfo = computed(() => props.detail?.details ?? {});
const attributions = computed<AttributionItem[]>(() => Array.isArray(props.detail?.attribution) ? props.detail.attribution : []);
const assignments = computed<AssignmentItem[]>(() => Array.isArray(props.detail?.assignments) ? props.detail.assignments : []);
const counterparts = computed<ReferenceItem[]>(() => Array.isArray(props.detail?.counterparts) ? props.detail.counterparts : []);
const candidateRows = computed<ReferenceItem[]>(() => Array.isArray(props.detail?.candidateRows) ? props.detail.candidateRows : []);
const links = computed<Record<string, unknown>[]>(() => Array.isArray(props.detail?.links) ? props.detail.links : []);
const pairs = computed<NumericPair[]>(() => Array.isArray(detailInfo.value.pairs) ? detailInfo.value.pairs : []);
const comparisons = computed<FormulaComparison[]>(() => Array.isArray(detailInfo.value.comparisons) ? detailInfo.value.comparisons : []);

const visiblePairs = computed(() => (showAllPairs.value ? pairs.value : pairs.value.slice(0, 20)));
const visibleComparisons = computed(() => (showAllComparisons.value ? comparisons.value : comparisons.value.slice(0, 20)));

const buffReadings = computed<BuffReading[]>(() => {
  const batches = Array.isArray(detailInfo.value.batches) ? detailInfo.value.batches : [];
  const result: BuffReading[] = [];
  for (const b of batches) {
    const record = b?.record;
    const evidence = record && typeof record === 'object' ? (record.behaviorEvidence as BuffReading | undefined) : undefined;
    if (evidence?.mona && evidence?.leyline) {
      result.push(evidence);
    }
  }
  return result;
});

const probeChanges = computed(() => {
  const probes = Array.isArray(detailInfo.value.probes) ? detailInfo.value.probes : [];
  const list: { group: string; path: string; before: unknown; after: unknown }[] = [];
  for (const probe of probes) {
    const comp = probe?.comparison;
    if (!comp || typeof comp !== 'object') continue;
    for (const [group, value] of Object.entries(comp as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const obj = value as Record<string, unknown>;
      const calls = obj.status ? [obj] : Object.values(obj).filter((v): v is Record<string, unknown> => Boolean(v && typeof v === 'object'));
      for (const call of calls) {
        const changes = Array.isArray(call.changes) ? call.changes : [];
        for (const change of changes) {
          if (!change || typeof change !== 'object') continue;
          const item = change as Record<string, unknown>;
          list.push({
            group,
            path: String(item.path ?? item.key ?? item.field ?? group),
            before: item.before,
            after: item.after,
          });
        }
      }
    }
  }
  return list;
});

const structuredFeatures = computed(() => {
  const features = props.detail?.features;
  if (!features || typeof features !== 'object') return [];
  return Object.entries(features)
    .filter(([, value]) => value != null && (!Array.isArray(value) || value.length > 0))
    .map(([key, value]) => ({
      key,
      label: FEATURE_LABELS[key] ?? key,
      value: displayValue(value),
    }));
});

const githubLink = computed(() => upstreamGithubUrl(props.detail?.source, props.monaVersion));

function onRawToggle(key: string, event: Event) {
  openRaw.value[key] = (event.target as HTMLDetailsElement).open;
}

function buffDelta(side?: { before?: number; enabled?: number }): number | null {
  if (typeof side?.before === 'number' && typeof side?.enabled === 'number') {
    return side.enabled - side.before;
  }
  return null;
}

function buffRestored(side?: { before?: number; disabled?: number }): boolean | null {
  if (typeof side?.before === 'number' && typeof side?.disabled === 'number') {
    return Math.abs(side.disabled - side.before) <= 1e-7;
  }
  return null;
}

async function copyText(text: string, tag: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedState.value = tag;
    setTimeout(() => {
      if (copiedState.value === tag) copiedState.value = '';
    }, 1800);
  } catch {
    copiedState.value = '';
  }
}

function copyCurrentLink() {
  void copyText(window.location.href, 'link');
}

function pairScenario(item: NumericPair): string {
  return String(item.scenario ?? item.input ?? item.name ?? '—');
}

function comparisonScenario(item: FormulaComparison): string {
  return String(item.input ?? item.scenario ?? item.name ?? item.linkId ?? '—');
}
</script>

<template>
  <div class="drawer-backdrop" @mousedown="onBackdropDown" @mouseup="onBackdropUp">
    <section id="detail" class="drawer-panel" role="region" aria-label="条目详情" aria-live="polite">
      <header class="drawer-head">
        <div class="drawer-head-row">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <StatusBadge :tone="row.side === 'mona' ? 'info' : 'purple'" :label="sideLabel(row.side)" />
            <StatusBadge tone="neutral" :label="categoryLabel(row.category)" />
            <StatusBadge :tone="comparisonTone(row.comparison, row.attributionStatus)" :label="row.comparison || '—'" />
            <StatusBadge :tone="runTone(row.run)" :label="row.run || '—'" />
          </div>
          <div class="drawer-actions">
            <button v-if="canGoBack" type="button" class="btn btn-sm" @click="emit('back')">返回上一条</button>
            <button
              type="button"
              class="btn btn-sm"
              @click="copyCurrentLink"
            >
              {{ copiedState === 'link' ? '已复制链接' : '复制链接' }}
            </button>
            <button type="button" class="btn btn-sm" aria-label="关闭详情" @click="emit('close')">关闭</button>
          </div>
        </div>
        <div>
          <h2 class="drawer-title">{{ row.name || row.entityName || row.entity || row.id }}</h2>
          <div class="row-sub">
            <button
              v-if="row.entityKey"
              type="button"
              class="row-trigger"
              @click="emit('openEntity', row.entityKey); emit('close')"
            >
              {{ row.entityName || row.entity }}（在实体对照中查看）
            </button>
            <span v-else>{{ row.entityName || row.entity }}</span>
            <span class="muted">机制：{{ row.mechanism }}</span>
          </div>
        </div>
      </header>

      <div class="drawer-body">
        <p v-if="loading" class="notice-card" role="status">正在加载详情数据…</p>
        <p v-else-if="error" class="notice-card error" role="alert">{{ error }}</p>

        <template v-else-if="detail">
          <!-- Attribution Callout (Priority 1 for differences) -->
          <section v-if="attributions.length" class="detail-section">
            <h3>差异归因</h3>
            <article
              v-for="item in attributions"
              :key="item.id"
              class="callout"
              :class="item.status === 'attributed' ? 'warning' : 'danger'"
            >
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <StatusBadge
                    :tone="item.status === 'attributed' ? 'warning' : 'danger'"
                    :label="attributionStatusLabel(item.status)"
                  />
                  <strong>{{ causeLabel(item.cause) }}</strong>
                </div>
                <span class="muted" style="font-size: 13px;">{{ item.id }}</span>
              </div>
              <p v-if="item.explanation">{{ item.explanation }}</p>
              <div v-if="item.scope" class="muted">限定范围：{{ item.scope }}</div>
              <div v-if="item.evidence?.length" style="display: grid; gap: 4px; margin-top: 4px;">
                <span class="muted" style="font-size: 13px;">核对依据（{{ item.evidence.length }} 项）</span>
                <ul style="margin: 0; padding-left: 18px; display: grid; gap: 2px;">
                  <li v-for="(ev, idx) in item.evidence" :key="idx" :title="ev">{{ shortPath(ev) }}</li>
                </ul>
              </div>
            </article>
          </section>

          <!-- Counterpart / Candidate Links -->
          <section v-if="counterparts.length || candidateRows.length" class="detail-section">
            <h3>双向关联条目</h3>
            <div v-if="counterparts.length" class="chip-wrap">
              <button
                v-for="item in counterparts"
                :key="item.id"
                type="button"
                class="chip-btn"
                @click="emit('inspect', item.id)"
              >
                <StatusBadge :tone="item.side === 'mona' ? 'info' : 'purple'" :label="sideLabel(item.side)" />
                <span>{{ item.name || item.id }}</span>
              </button>
            </div>
            <div v-if="candidateRows.length" style="display: grid; gap: 6px; margin-top: 6px;">
              <span class="muted">候选条目</span>
              <div class="chip-wrap">
                <button
                  v-for="item in candidateRows"
                  :key="item.id"
                  type="button"
                  class="chip-btn"
                  @click="emit('inspect', item.id)"
                >
                  <StatusBadge :tone="item.side === 'mona' ? 'info' : 'purple'" :label="sideLabel(item.side)" />
                  <span>{{ item.name || item.id }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Buff 3-state Readings -->
          <section v-if="buffReadings.length" class="detail-section">
            <h3>Buff 三态条件读数</h3>
            <div v-for="(entry, idx) in buffReadings" :key="idx" class="callout" style="gap: 10px;">
              <div>
                <strong>{{ entry.source }}</strong> 授予 <strong>{{ entry.recipient }}</strong>（{{ entry.attribute }}）
              </div>
              <div class="table-scroll">
                <table class="num-table">
                  <thead>
                    <tr>
                      <th>来源</th>
                      <th>触发前</th>
                      <th>启用</th>
                      <th>关闭</th>
                      <th>实测增量</th>
                      <th>关闭还原</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="side in (['mona', 'leyline'] as const)" :key="side">
                      <td><StatusBadge :tone="side === 'mona' ? 'info' : 'purple'" :label="sideLabel(side)" /></td>
                      <td>{{ formatNumber(entry[side]?.before) }}</td>
                      <td>{{ formatNumber(entry[side]?.enabled) }}</td>
                      <td>{{ formatNumber(entry[side]?.disabled) }}</td>
                      <td><strong>{{ formatSignedDelta(buffDelta(entry[side])) }}</strong></td>
                      <td>
                        <StatusBadge
                          v-if="buffRestored(entry[side]) !== null"
                          :tone="buffRestored(entry[side]) ? 'success' : 'danger'"
                          :label="buffRestored(entry[side]) ? '已还原' : '未还原'"
                        />
                        <span v-else>—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <!-- Dual-side Direct Pairs -->
          <section v-if="pairs.length" class="detail-section">
            <div class="side-card-head">
              <h3>双侧直接对照（{{ pairs.length }}）</h3>
              <button
                v-if="pairs.length > 20"
                type="button"
                class="btn btn-xs"
                @click="showAllPairs = !showAllPairs"
              >
                {{ showAllPairs ? '收起' : `展开全部 ${pairs.length} 行` }}
              </button>
            </div>
            <div class="table-scroll">
              <table class="num-table">
                <thead>
                  <tr>
                    <th>输入场景</th>
                    <th>Mona</th>
                    <th>LeyLine</th>
                    <th>差值</th>
                    <th>相对误差</th>
                    <th>容差</th>
                    <th>结论</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in visiblePairs" :key="idx" :class="{ 'row-mismatch': item.result === '有差异' }">
                    <td>
                      <div>{{ pairScenario(item) }}</div>
                      <div v-if="item.method" class="muted" style="font-size: 12px;">{{ item.method }}</div>
                    </td>
                    <td :title="String(item.mona ?? '')">{{ formatNumber(item.mona) }}</td>
                    <td :title="String(item.leyline ?? '')">{{ formatNumber(item.leyline) }}</td>
                    <td :title="String(item.difference ?? '')">{{ formatSignedDelta(item.difference) }}</td>
                    <td>{{ formatRelativeDiff(item.leyline, item.mona) }}</td>
                    <td>{{ formatNumber(item.tolerance) }}</td>
                    <td>
                      <StatusBadge :tone="comparisonTone(item.result ?? '')" :label="item.result ?? '—'" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Independent Formula Comparisons -->
          <section v-if="comparisons.length" class="detail-section">
            <div class="side-card-head">
              <h3>独立公式检查（{{ comparisons.length }}）</h3>
              <button
                v-if="comparisons.length > 20"
                type="button"
                class="btn btn-xs"
                @click="showAllComparisons = !showAllComparisons"
              >
                {{ showAllComparisons ? '收起' : `展开全部 ${comparisons.length} 行` }}
              </button>
            </div>
            <div class="table-scroll">
              <table class="num-table">
                <thead>
                  <tr>
                    <th>算例</th>
                    <th>期望值</th>
                    <th>实际值</th>
                    <th>差值</th>
                    <th>相对误差</th>
                    <th>结论</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in visibleComparisons" :key="idx" :class="{ 'row-mismatch': item.result === '有差异' }">
                    <td>{{ comparisonScenario(item) }}</td>
                    <td :title="String(item.expected ?? item.mona ?? '')">{{ formatNumber(item.expected ?? item.mona) }}</td>
                    <td :title="String(item.actual ?? item.leyline ?? '')">{{ formatNumber(item.actual ?? item.leyline) }}</td>
                    <td>{{ formatSignedDelta(item.difference ?? item.delta) }}</td>
                    <td>{{ formatRelativeDiff(item.actual ?? item.leyline, item.expected ?? item.mona) }}</td>
                    <td>
                      <StatusBadge :tone="comparisonTone(item.result ?? '')" :label="item.result ?? '—'" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Structured Features -->
          <section v-if="structuredFeatures.length" class="detail-section">
            <h3>机制特征</h3>
            <div class="kv-grid">
              <div v-for="feat in structuredFeatures" :key="feat.key" class="kv-item">
                <span class="kv-key">{{ feat.label }}</span>
                <span class="kv-val">{{ feat.value }}</span>
              </div>
            </div>
          </section>

          <!-- Source Ownership (keeps heading '来源归属' for tests) -->
          <section class="detail-section">
            <h3>来源归属</h3>
            <div class="kv-grid">
              <div class="kv-item">
                <span class="kv-key">条目编号</span>
                <span class="kv-val">{{ row.id }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-key">实现文件</span>
                <span class="kv-val">{{ row.implementation || '—' }}</span>
              </div>
            </div>
            <div>
              <a v-if="githubLink" :href="githubLink" target="_blank" rel="noreferrer">{{ detail.source }}</a>
              <span v-else class="muted">{{ displayValue(detail.source) }}</span>
            </div>
            <ul v-if="assignments.length" style="margin: 0; padding-left: 18px; display: grid; gap: 6px;">
              <li v-for="item in assignments" :key="item.id">
                <strong>{{ item.id }}</strong>
                <span v-if="item.reason"> — {{ item.reason }}</span>
                <span v-else-if="item.categories?.length"> — {{ item.categories.map(categoryLabel).join('、') }}</span>
                <div v-if="item.owner" class="muted">{{ item.owner }}</div>
              </li>
            </ul>
          </section>

          <!-- Mapping Explanations -->
          <section v-if="links.length" class="detail-section">
            <h3>映射说明</h3>
            <article v-for="(link, idx) in links" :key="idx" class="callout">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <StatusBadge tone="neutral" :label="displayValue(link.disposition)" />
                <strong v-if="link.id">{{ link.id }}</strong>
              </div>
              <p v-if="link.explanation">{{ displayValue(link.explanation) }}</p>
              <div v-if="link.scope" class="muted">范围：{{ displayValue(link.scope) }}</div>
            </article>
          </section>

          <!-- Buff Probe Changes -->
          <section v-if="probeChanges.length" class="detail-section">
            <h3>Buff 探针属性变化</h3>
            <div class="table-scroll">
              <table class="num-table">
                <thead>
                  <tr>
                    <th>属性路径</th>
                    <th>变化前</th>
                    <th>变化后</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(change, idx) in probeChanges" :key="idx">
                    <td>{{ change.path }}</td>
                    <td>{{ formatNumber(change.before) }}</td>
                    <td>{{ formatNumber(change.after) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Raw Evidence -->
          <section class="detail-section">
            <div class="side-card-head">
              <h3>原始证据</h3>
              <button
                type="button"
                class="btn btn-xs"
                @click="copyText(JSON.stringify(detail, null, 2), 'json')"
              >
                {{ copiedState === 'json' ? '已复制 JSON' : '复制完整 JSON' }}
              </button>
            </div>
            <div style="display: grid; gap: 8px;">
              <details
                v-for="(value, key) in detail"
                :key="String(key)"
                class="raw-details"
                @toggle="onRawToggle(String(key), $event)"
              >
                <summary>{{ RAW_SECTION_LABELS[String(key)] ?? String(key) }}</summary>
                <pre v-if="openRaw[String(key)]" class="code-block">{{ JSON.stringify(value, null, 2) }}</pre>
              </details>
            </div>
          </section>
        </template>
      </div>
    </section>
  </div>
</template>
