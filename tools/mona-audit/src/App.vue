<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuditData } from './composables/useAuditData';
import { formatInt, formatTimestamp } from './utils/format';
import OverviewView from './components/OverviewView.vue';
import EntityMatrixView from './components/EntityMatrixView.vue';
import BehaviorLedgerView from './components/BehaviorLedgerView.vue';
import InventoryView from './components/InventoryView.vue';
import DetailDrawer from './components/DetailDrawer.vue';

const {
  data,
  loading,
  error,
  view,
  selectedId,
  currentRow,
  detail,
  loadingDetail,
  detailError,
  detailHistory,
  entities,
  selectedEntityKey,
  selectedEntityKind,
  filters,
  page,
  openDetail,
  goBackDetail,
  closeDetail,
  resetInventoryFilters,
  navigateToInventory,
  navigateToEntity,
  loadIndex,
} = useAuditData();

const openDiffCount = computed(() =>
  (data.value?.rows ?? []).filter(row => row.comparison === '有差异' && row.attributionStatus !== 'attributed').length,
);

function inspectFromChild(id: string) {
  openDetail(id, Boolean(currentRow.value));
}

onMounted(() => {
  void loadIndex();
});
</script>

<template>
  <div class="audit-shell">
    <header class="top-bar">
      <div class="top-bar-inner">
        <div class="brand-group">
          <div class="brand-title">
            <span class="brand-accent" aria-hidden="true" />
            <h1>Mona 双向审计</h1>
          </div>
          <div v-if="data" class="meta-strip">
            <span class="meta-chip num" :title="String(data.versions.mona ?? '未知')">
              Mona <strong>{{ String(data.versions.mona ?? '未知').slice(0, 8) }}</strong>
            </span>
            <span class="meta-chip num" :title="String(data.versions.leyline ?? '未知')">
              LeyLine <strong>{{ String(data.versions.leyline ?? '未知').slice(0, 8) }}</strong>
            </span>
            <span class="meta-chip num">{{ formatTimestamp(data.generatedAt) }}</span>
            <span v-if="data.dirty === true" class="meta-chip warn">工作区有未提交变更</span>
          </div>
        </div>

        <nav v-if="data" class="view-tabs" aria-label="审计视图">
          <button type="button" class="view-tab" :aria-pressed="view === 'overview'" @click="view = 'overview'">
            对齐总览
          </button>
          <button type="button" class="view-tab" :aria-pressed="view === 'entities'" @click="view = 'entities'">
            <span>实体对照</span>
            <span class="tab-count">{{ formatInt(entities.length) }}</span>
          </button>
          <button
            v-if="data.coverage"
            type="button"
            class="view-tab"
            :aria-pressed="view === 'behaviors'"
            @click="view = 'behaviors'"
          >
            行为缺口
          </button>
          <button type="button" class="view-tab" :aria-pressed="view === 'inventory'" @click="view = 'inventory'">
            <span>条目明细</span>
            <span v-if="openDiffCount > 0" class="tab-count alert" title="待核对差异条数">{{ formatInt(openDiffCount) }}</span>
          </button>
        </nav>
      </div>
    </header>

    <main class="main-wrap">
      <div v-if="error" class="notice-card error" role="alert">
        {{ error }}。请在仓库根目录运行 pnpm audit:mona 后刷新页面。
      </div>
      <div v-else-if="loading || !data" class="notice-card" role="status">
        正在加载 Mona 双向审计快照…
      </div>
      <template v-else>
        <OverviewView
          v-if="view === 'overview'"
          :index="data"
          @drill-inventory="navigateToInventory"
          @open-view="target => (view = target)"
          @inspect="id => openDetail(id, false)"
        />
        <EntityMatrixView
          v-else-if="view === 'entities'"
          :entities="entities"
          :selected-entity-key="selectedEntityKey"
          :selected-kind="selectedEntityKind"
          :selected-row-id="selectedId"
          @update:selected-entity-key="val => (selectedEntityKey = val)"
          @update:selected-kind="val => (selectedEntityKind = val)"
          @inspect="id => openDetail(id, false)"
          @drill-inventory="navigateToInventory"
        />
        <BehaviorLedgerView
          v-else-if="view === 'behaviors' && data.coverage"
          :coverage="data.coverage"
          :rows="data.rows"
          @inspect="id => openDetail(id, false)"
        />
        <InventoryView
          v-else
          :rows="data.rows"
          :filters="filters"
          :page="page"
          :selected-row-id="selectedId"
          @update:page="val => (page = val)"
          @inspect="id => openDetail(id, false)"
          @reset="resetInventoryFilters"
          @open-entity="navigateToEntity"
        />
      </template>
    </main>

    <DetailDrawer
      v-if="currentRow"
      :row="currentRow"
      :detail="detail"
      :loading="loadingDetail"
      :error="detailError"
      :can-go-back="detailHistory.length > 0"
      :mona-version="data?.versions.mona"
      @close="closeDetail"
      @back="goBackDetail"
      @inspect="inspectFromChild"
      @open-entity="navigateToEntity"
    />
  </div>
</template>
