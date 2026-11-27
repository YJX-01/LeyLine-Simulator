import { computed, reactive, ref, shallowRef, watch } from 'vue';
import type {
  AuditDetail,
  AuditIndex,
  AuditRow,
  AuditView,
  EntityKind,
  EntitySummary,
  InventoryFilters,
} from '../types';

function inferInitialView(params: URLSearchParams): AuditView {
  const explicit = params.get('view');
  if (explicit === 'overview' || explicit === 'entities' || explicit === 'behaviors' || explicit === 'inventory') {
    return explicit;
  }
  if (params.has('side') || params.has('category') || params.has('comparison') || params.has('q') || params.has('role') || params.has('mechanism') || params.has('attr') || params.has('cause')) {
    return 'inventory';
  }
  if (params.has('entity') || params.has('kind')) {
    return 'entities';
  }
  return 'overview';
}

function fallbackEntityKey(row: AuditRow): string {
  if (row.entityKey) return row.entityKey;
  return (row.entity || row.id.split(':')[1] || 'other').toLowerCase();
}

function fallbackEntityKind(row: AuditRow): EntityKind {
  if (row.entityKind) return row.entityKind;
  if (row.id.startsWith('character:') || row.id.startsWith('clause:character:')) return 'character';
  if (row.id.startsWith('weapon:') || row.id.startsWith('clause:weapon:') || row.id.startsWith('mona:equipment-event:')) return 'weapon';
  if (row.id.startsWith('set:') || row.id.startsWith('clause:set:') || row.id.startsWith('mona:set-')) return 'set';
  if (row.id.startsWith('mona:reaction:') || row.id.startsWith('public:reactions')) return 'reaction';
  if (row.id.startsWith('public:resonances')) return 'resonance';
  return 'other';
}

export function useAuditData() {
  const params = new URLSearchParams(location.search);
  const data = shallowRef<AuditIndex | null>(null);
  const loading = ref(true);
  const error = ref('');

  const view = ref<AuditView>(inferInitialView(params));
  const selectedId = ref(params.get('id') ?? '');
  const detailHistory = ref<string[]>([]);
  const detail = shallowRef<AuditDetail | null>(null);
  const loadingDetail = ref(false);
  const detailError = ref('');
  const chunkCache = new Map<string, Record<string, AuditDetail>>();

  const selectedEntityKey = ref(params.get('entity') ?? '');
  const selectedEntityKind = ref(params.get('kind') ?? '');

  const filters = reactive<InventoryFilters>({
    q: params.get('q') ?? '',
    side: params.get('side') ?? '',
    category: params.get('category') ?? '',
    comparison: params.get('comparison') ?? '',
    run: params.get('run') ?? '',
    mechanism: params.get('mechanism') ?? '',
    role: params.get('role') ?? '',
    attr: params.get('attr') ?? '',
    cause: params.get('cause') ?? '',
    entity: '',
  });
  const page = ref(Math.max(1, Number(params.get('page')) || 1));

  const rowMap = computed(() => {
    const map = new Map<string, AuditRow>();
    for (const row of data.value?.rows ?? []) {
      map.set(row.id, row);
    }
    return map;
  });

  const currentRow = computed(() => (selectedId.value ? rowMap.value.get(selectedId.value) ?? null : null));

  const entities = computed<EntitySummary[]>(() => {
    const map = new Map<string, EntitySummary>();
    for (const row of data.value?.rows ?? []) {
      const key = fallbackEntityKey(row);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          name: row.entityName || row.entity || key,
          kind: fallbackEntityKind(row),
          element: row.element,
          total: 0,
          monaCount: 0,
          leylineCount: 0,
          matched: 0,
          different: 0,
          openDiff: 0,
          attributedDiff: 0,
          pending: 0,
          unmapped: 0,
          exclusive: 0,
          comparable: 0,
          passed: 0,
          failed: 0,
          rows: [],
        };
        map.set(key, entry);
      }
      if (!entry.element && row.element) entry.element = row.element;
      entry.total++;
      if (row.side === 'mona') entry.monaCount++;
      else if (row.side === 'leyline') entry.leylineCount++;
      if (row.run === '已跑通') entry.passed++;
      else if (row.run === '执行失败') entry.failed++;

      if (row.comparison === '一致') {
        entry.matched++;
        entry.comparable++;
      } else if (row.comparison === '有差异') {
        entry.different++;
        entry.comparable++;
        if (row.attributionStatus === 'attributed' || row.attributionStatus === 'attributed-scoped') entry.attributedDiff++;
        else entry.openDiff++;
      } else if (row.comparison === '待确认' || row.comparison === '条件不可比') {
        entry.pending++;
      } else if (row.comparison === '仅 Mona' || row.comparison === '仅 LeyLine') {
        entry.exclusive++;
      } else {
        entry.unmapped++;
      }
      entry.rows.push(row);
    }
    return [...map.values()];
  });

  const entityMap = computed(() => {
    const map = new Map<string, EntitySummary>();
    for (const item of entities.value) map.set(item.key, item);
    return map;
  });

  function syncUrl() {
    const next = new URL(location.href);
    const managed: Record<string, string> = {
      view: view.value === 'overview' ? '' : view.value,
      id: selectedId.value,
      entity: view.value === 'entities' ? selectedEntityKey.value : '',
      kind: view.value === 'entities' ? selectedEntityKind.value : '',
      q: view.value === 'inventory' ? filters.q : '',
      side: view.value === 'inventory' ? filters.side : '',
      category: view.value === 'inventory' ? filters.category : '',
      comparison: view.value === 'inventory' ? filters.comparison : '',
      run: view.value === 'inventory' ? filters.run : '',
      mechanism: view.value === 'inventory' ? filters.mechanism : '',
      role: view.value === 'inventory' ? filters.role : '',
      attr: view.value === 'inventory' ? filters.attr : '',
      cause: view.value === 'inventory' ? filters.cause : '',
      page: view.value === 'inventory' && page.value > 1 ? String(page.value) : '',
    };
    for (const [key, val] of Object.entries(managed)) {
      if (val) next.searchParams.set(key, val);
      else next.searchParams.delete(key);
    }
    if (view.value !== 'behaviors') {
      for (const key of ['group', 'change', 'batch', 'gap', 'bp']) {
        next.searchParams.delete(key);
      }
    }
    history.replaceState(null, '', next);
  }

  watch(
    [
      view,
      selectedId,
      selectedEntityKey,
      selectedEntityKind,
      () => filters.q,
      () => filters.side,
      () => filters.category,
      () => filters.comparison,
      () => filters.run,
      () => filters.mechanism,
      () => filters.role,
      () => filters.attr,
      () => filters.cause,
      page,
    ],
    syncUrl,
  );

  watch(
    currentRow,
    async row => {
      detail.value = null;
      detailError.value = '';
      if (!row) {
        loadingDetail.value = false;
        return;
      }
      loadingDetail.value = true;
      const targetId = row.id;
      try {
        let chunk = chunkCache.get(row.chunk);
        if (!chunk) {
          const response = await fetch(`./data/${row.chunk}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          chunk = (await response.json()) as Record<string, AuditDetail>;
          chunkCache.set(row.chunk, chunk);
        }
        if (selectedId.value === targetId) {
          detail.value = chunk[targetId] ?? null;
          if (!detail.value) detailError.value = '此条目没有详情记录。';
        }
      } catch (cause) {
        if (selectedId.value === targetId) {
          detailError.value = `详情加载失败：${cause instanceof Error ? cause.message : String(cause)}`;
        }
      } finally {
        if (selectedId.value === targetId) {
          loadingDetail.value = false;
        }
      }
    },
    { immediate: true },
  );

  function openDetail(id: string, pushHistory = false) {
    if (!id) return;
    if (pushHistory && selectedId.value && selectedId.value !== id) {
      detailHistory.value = [...detailHistory.value.slice(-19), selectedId.value];
    } else if (!pushHistory) {
      detailHistory.value = [];
    }
    selectedId.value = id;
  }

  function goBackDetail() {
    if (!detailHistory.value.length) return;
    const previous = detailHistory.value[detailHistory.value.length - 1];
    detailHistory.value = detailHistory.value.slice(0, -1);
    selectedId.value = previous;
  }

  function closeDetail() {
    selectedId.value = '';
    detailHistory.value = [];
  }

  function resetInventoryFilters() {
    filters.q = '';
    filters.side = '';
    filters.category = '';
    filters.comparison = '';
    filters.run = '';
    filters.mechanism = '';
    filters.role = '';
    filters.attr = '';
    filters.cause = '';
    filters.entity = '';
    page.value = 1;
  }

  function navigateToInventory(preset: Partial<InventoryFilters> = {}) {
    resetInventoryFilters();
    Object.assign(filters, preset);
    view.value = 'inventory';
  }

  function navigateToEntity(entityKey: string) {
    selectedEntityKey.value = entityKey;
    view.value = 'entities';
  }

  async function loadIndex() {
    loading.value = true;
    error.value = '';
    try {
      const response = await fetch('./data/index.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data.value = (await response.json()) as AuditIndex;
    } catch (cause) {
      error.value = `审计数据加载失败：${cause instanceof Error ? cause.message : String(cause)}`;
    } finally {
      loading.value = false;
    }
  }

  return {
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
    rowMap,
    entities,
    entityMap,
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
  };
}
