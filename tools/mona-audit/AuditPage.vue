<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import BehaviorLedger from './BehaviorLedger.vue';

type Row = { id: string; side: string; category: string; name: string; entity: string; entityName?: string; mechanism: string; run: string; comparison: string; implementation: string; chunk: string; featureText: string; roles?: string[] };
type Index = { versions: Record<string, unknown>; generatedAt: string; dirty: boolean | null; worktree?: string; summary: Record<string, unknown>; coverage?: InstanceType<typeof BehaviorLedger>['$props']['coverage']; rows: Row[] };
type Detail = Record<string, unknown>;
const data = shallowRef<Index | null>(null);
const error = ref('');
const detailError = ref('');
const loadingDetail = ref(false);
const openRaw = ref<Record<string, boolean>>({});
const detail = shallowRef<Detail | null>(null);
const params = new URLSearchParams(location.search);
const view = ref(params.get('view') === 'behaviors' ? 'behaviors' : 'inventory');
watch(view, value => {
  const url = new URL(location.href);
  if (value === 'behaviors') url.searchParams.set('view', value); else url.searchParams.delete('view');
  history.replaceState(null, '', url);
});
function inspectBehavior(id: string) { view.value = 'inventory'; jump(id); }
const query = ref(params.get('q') ?? '');
const initialDefault = !location.search;
const side = ref(params.get('side') ?? (initialDefault ? 'mona' : ''));
const category = ref(params.get('category') ?? (initialDefault ? 'damage' : ''));
const comparison = ref(params.get('comparison') ?? '');
const run = ref(params.get('run') ?? '');
const mechanism = ref(params.get('mechanism') ?? '');
const role = ref(params.get('role') ?? '');
const roles = { behavior: '范围内行为', parent: '归入父项', excluded: '范围外', pending: '待判定范围' };
const selected = ref(params.get('id') ?? '');
const page = ref(Math.max(1, Number(params.get('page')) || 1));
const pageSize = 25;
const cache = new Map<string, Record<string, Detail>>();
const options = (key: 'side' | 'category' | 'comparison' | 'run' | 'mechanism') => [...new Set((data.value?.rows ?? []).map(row => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return (data.value?.rows ?? []).filter(row => (!role.value || row.roles?.includes(role.value)) && (!side.value || row.side === side.value) && (!category.value || row.category === category.value) && (!comparison.value || row.comparison === comparison.value) && (!run.value || row.run === run.value) && (!mechanism.value || row.mechanism === mechanism.value) && (!needle || Object.values(row).some(value => String(value ?? '').toLocaleLowerCase().includes(needle))));
});
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const current = computed(() => data.value?.rows.find(row => row.id === selected.value));
watch([query, side, category, comparison, run, mechanism, role], () => { page.value = 1; selected.value = ''; }, { flush: 'sync' });
watch(pages, value => { if (page.value > value) page.value = value; });
watch([query, side, category, comparison, run, mechanism, role, selected, page], () => {
  const next = new URL(location.href);
  for (const [key, value] of Object.entries({ q: query.value, side: side.value, category: category.value, comparison: comparison.value, run: run.value, mechanism: mechanism.value, role: role.value, id: selected.value, page: page.value > 1 ? String(page.value) : '' })) {
    if (value) next.searchParams.set(key, value); else next.searchParams.delete(key);
  }
  history.replaceState(null, '', next);
});
watch(current, async row => {
  detail.value = null;
  openRaw.value = {};
  detailError.value = '';
  if (!row) return;
  loadingDetail.value = true;
  try {
    let chunk = cache.get(row.chunk);
    if (!chunk) {
      const response = await fetch(`./data/${row.chunk}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      chunk = await response.json() as Record<string, Detail>;
      cache.set(row.chunk, chunk);
    }
    if (selected.value === row.id) {
      detail.value = chunk[row.id] ?? null;
      if (!detail.value) detailError.value = '此条目没有详情。';
    }
  } catch (cause) {
    if (selected.value === row.id) detailError.value = `详情加载失败：${cause instanceof Error ? cause.message : String(cause)}`;
  } finally {
    if (selected.value === row.id) loadingDetail.value = false;
  }
}, { immediate: true });
function reset() { query.value = ''; side.value = ''; category.value = ''; comparison.value = ''; run.value = ''; mechanism.value = ''; role.value = ''; }
function select(row: Row) { selected.value = row.id; void nextTick(() => document.querySelector('#detail')?.scrollIntoView({ block: 'start', behavior: 'instant' })); }
function jump(id: string) { const row = data.value?.rows.find(item => item.id === id); if (!row) return; reset(); selected.value = id; void nextTick(() => { page.value = Math.floor((data.value?.rows.findIndex(item => item.id === id) ?? 0) / pageSize) + 1; document.querySelector('#detail')?.scrollIntoView({ block: 'start', behavior: 'instant' }); }); }
function shortcut(s: string, c: string) { reset(); side.value = s; category.value = c; }
function count(s: string, c: string) { return data.value?.rows.filter(row => row.side === s && row.category === c).length ?? 0; }
function display(value: unknown): string { return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []; }
const sideSummary = (name: string) => object(object(data.value?.summary.sides)[name]);
const summaryGroup = (name: string) => object(data.value?.summary[name]);
const detailInfo = computed(() => object(detail.value?.details));
const pairs = computed(() => array(detailInfo.value.pairs));
const probes = computed(() => array(detailInfo.value.probes));
const changes = computed(() => probes.value.flatMap(probe => Object.entries(object(probe.comparison)).flatMap(([group, value]) => {
  const obj = object(value);
  const calls = obj.status ? [obj] : Object.values(obj).map(object);
  return calls.flatMap(call => array(call.changes).map(change => ({ group, ...change })));
})));
function onRawToggle(key: string, event: Event) { openRaw.value[key] = (event.target as HTMLDetailsElement).open; }
function categoryLabel(value: string) { return ({ damage: '伤害', buff: '增益', unknown: '未分类' } as Record<string, string>)[value] ?? value; }
function sideLabel(value: string) { return value === 'mona' ? 'Mona' : value === 'leyline' ? 'LeyLine' : value; }
const links = computed(() => array(detail.value?.links));
const buffReadings = computed(() => array(detailInfo.value.batches).flatMap(b => {
  const record = object(b.record), e = object(record.behaviorEvidence);
  return e.mona && e.leyline ? [e] : [];
}));
function upstreamSource(raw: unknown) {
  if (typeof raw !== 'string') return '';
  const prefix = '.references/mona-community/';
  const path = raw.split('#')[0];
  const version = data.value?.versions.mona;
  if (!path.startsWith(prefix) || typeof version !== 'string' || !/^[a-f0-9]{40}$/.test(version)) return '';
  return 'https://github.com/TwiceDrop/genshin_artifact/blob/' + version + '/' + path.slice(prefix.length).split('/').map(encodeURIComponent).join('/');
}
function refs(value: unknown): { id: string; name: string; side: string }[] { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && typeof item.id === 'string') : []; }
const comparisonRows = computed(() => array(detailInfo.value.comparisons));
function pick(row: Record<string, unknown>, keys: string[]) { for (const key of keys) if (row[key] !== undefined) return display(row[key]); return '—'; }
function label(key: string) {
  const names: Record<string, string> = { features: '特征', source: '来源', sourceIds: '来源编号', raw: '原始资料', links: '映射说明', candidates: '候选项', details: '详情', name: '名称', description: '描述', id: '编号', url: '链接', value: '数值', type: '类型', text: '文本', title: '标题', mechanism: '机制', implementation: '实现', comparison: '对照', run: '运行结果', sides: '来源总计', mappings: '映射', scenarios: '场景', issues: '问题', limitations: '限制', delta: '差异' };
  return names[key] ?? key;
}
onMounted(async () => {
  try {
    const response = await fetch('./data/index.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data.value = await response.json() as Index;
    if (selected.value && !params.has('page')) { const index = filtered.value.findIndex(row => row.id === selected.value); if (index >= 0) page.value = Math.floor(index / pageSize) + 1; }
  } catch (cause) { error.value = `数据加载失败：${cause instanceof Error ? cause.message : String(cause)}`; }
});
</script>

<template>
  <div class="app">
    <header class="header">
      <div><h1>Mona 双向审计</h1></div>
      <div v-if="data" class="metadata"><span>生成时间：{{ data.generatedAt }}</span><span v-if="data.dirty === true" class="dirty">包含未提交变更</span><span v-else-if="data.dirty === null">工作区状态未知</span></div>
    </header>
    <main>
      <p v-if="error" class="notice" role="alert">{{ error }}。请运行 pnpm audit:mona 后刷新页面。</p>
      <p v-else-if="!data" class="notice" role="status">正在加载审计数据…</p>
      <template v-else>
        <section class="summary" aria-label="审计概览">
          <div><strong>版本</strong><span>Mona：<abbr :title="display(data.versions.mona)">{{ String(data.versions.mona ?? '未知').slice(0, 12) }}</abbr></span><span>LeyLine：<abbr :title="display(data.versions.leyline)">{{ String(data.versions.leyline ?? '未知').slice(0, 12) }}</abbr></span></div>
          <div v-for="name in ['mona', 'leyline']" :key="name"><strong>{{ name === 'mona' ? 'Mona' : 'LeyLine' }}</strong><span>原始 {{ display(sideSummary(name).raw) }} / 条目 {{ display(sideSummary(name).rows) }}</span><span>伤害 {{ display(sideSummary(name).damage) }} / 增益 {{ display(sideSummary(name).buff) }} / 未分类 {{ display(sideSummary(name).unknown) }}</span><span>已跑通 {{ display(sideSummary(name).passed) }} / 失败 {{ display(sideSummary(name).failed) }} / 未验证 {{ display(sideSummary(name).unverified) }}</span><span>可对照 {{ display(sideSummary(name).comparable) }} / 一致 {{ display(sideSummary(name).matched) }} / 差异 {{ display(sideSummary(name).different) }}</span></div>
          <div v-for="group in ['mappings', 'comparisons']" :key="group"><strong>{{ group === 'mappings' ? '映射' : '独立公式检查' }}</strong><span>总计 {{ display(summaryGroup(group).total) }} / 可对照 {{ display(summaryGroup(group).comparable) }}</span><span>一致 {{ display(summaryGroup(group).matched) }} / 差异 {{ display(summaryGroup(group).different) }} / 其他 {{ display(summaryGroup(group).other) }}</span></div>
          <div><strong>剧变反应同输入对照</strong><span>场景 {{ display(summaryGroup('direct').total) }} / 一致 {{ display(summaryGroup('direct').matched) }}</span><span>差异 {{ display(summaryGroup('direct').different) }} / 已归因 {{ display(data.summary.attributedScenarios) }}</span></div>
          <div><strong>差异映射</strong><span>总计 {{ display(summaryGroup('mappings').different) }} / 已归因 {{ display(data.summary.attributedMappings) }}</span></div>
          <div><strong>场景</strong><span>总计 {{ display(summaryGroup('scenarios').total) }}</span><span>问题 {{ Array.isArray(data.summary.issues) ? data.summary.issues.length : display(data.summary.issues) }}</span></div>
        </section>
        <details class="summary-more" @toggle="onRawToggle('summary', $event)"><summary>查看问题、限制和变化</summary><div v-for="key in ['issues', 'limitations', 'delta']" :key="key"><strong>{{ label(key) }}</strong><pre v-if="openRaw.summary">{{ JSON.stringify(data.summary[key], null, 2) }}</pre></div></details>
        <nav v-if="data.coverage" class="shortcuts" aria-label="审计视图">
          <button type="button" :aria-pressed="view === 'inventory'" @click="view = 'inventory'">条目目录</button>
          <button type="button" :aria-pressed="view === 'behaviors'" @click="view = 'behaviors'">行为缺口</button>
        </nav>
        <BehaviorLedger v-if="data.coverage && view === 'behaviors'" :coverage="data.coverage" :rows="data.rows" @inspect="inspectBehavior" />
        <template v-else>
        <div class="shortcuts" aria-label="快速筛选"><button v-for="pair in [['mona', 'damage'], ['mona', 'buff'], ['leyline', 'damage'], ['leyline', 'buff']]" :key="pair.join('-')" type="button" :aria-pressed="side === pair[0] && category === pair[1]" @click="shortcut(pair[0], pair[1])">{{ pair[0] === 'mona' ? 'Mona' : 'LeyLine' }} {{ pair[1] === 'damage' ? '伤害' : 'Buff' }} <strong>{{ count(pair[0], pair[1]) }}</strong></button></div>
        <section class="filters" aria-label="筛选条目">
          <label class="search">搜索<input v-model="query" name="q" autocomplete="off" type="search" placeholder="名称、机制或特征"></label>
          <label>来源<select v-model="side"><option value="">全部来源</option><option v-for="item in options('side')" :key="item" :value="item">{{ sideLabel(item) }}</option></select></label>
          <label>分类<select v-model="category"><option value="">全部分类</option><option v-for="item in options('category')" :key="item" :value="item">{{ categoryLabel(item) }}</option></select></label>
          <label>来源归属<select v-model="role" name="role"><option value="">全部归属</option><option v-for="(name, key) in roles" :key="key" :value="key">{{ name }}</option></select></label>
          <label>对照<select v-model="comparison" aria-label="对照"><option value="">全部结果</option><option v-for="item in options('comparison')" :key="item" :value="item">{{ item }}</option></select></label>
          <label>运行<select v-model="run"><option value="">全部运行状态</option><option v-for="item in options('run')" :key="item" :value="item">{{ item }}</option></select></label>
          <label>机制<select v-model="mechanism"><option value="">全部机制</option><option v-for="item in options('mechanism')" :key="item" :value="item">{{ item }}</option></select></label>
          <button type="button" class="reset" @click="reset">清除筛选</button>
        </section>
        <div class="workspace" :class="{ 'with-detail': !!current }">
          <section class="results" aria-label="审计条目">
            <div class="section-head"><h2>审计条目</h2><span aria-live="polite">{{ filtered.length }} / {{ data.rows.length }} 条</span></div>
            <div v-if="!filtered.length" class="empty">没有符合条件的条目。<button type="button" class="text-button" @click="reset">清除筛选</button></div>
            <div v-else class="table-wrap"><table class="result-table"><thead><tr><th>条目</th><th>特征</th><th>LeyLine 实现</th><th>本侧运行</th><th>已核对范围内的结论</th></tr></thead><tbody><tr v-for="row in visible" :key="row.id" :class="{ active: selected === row.id }"><td><button type="button" class="row-link" @click="select(row)">{{ row.name || row.entityName || row.entity || row.id }}</button><small>{{ row.entityName || row.entity }}<br>{{ sideLabel(row.side) }} / {{ categoryLabel(row.category) }}</small></td><td>{{ row.featureText || row.mechanism || '—' }}</td><td>{{ row.implementation || '—' }}</td><td>{{ row.run || '—' }}</td><td>{{ row.comparison || '—' }}</td></tr></tbody></table></div>
            <nav v-if="filtered.length" class="pagination" aria-label="分页"><button type="button" :disabled="page <= 1" @click="page--">上一页</button><span>第 {{ page }} / {{ pages }} 页</span><button type="button" :disabled="page >= pages" @click="page++">下一页</button></nav>
          </section>
          <section v-if="current" id="detail" class="detail" aria-label="条目详情" aria-live="polite">
            <template v-if="current"><div class="detail-heading"><div><p class="detail-category">{{ [sideLabel(current.side), categoryLabel(current.category)].filter(Boolean).join(' / ') }}</p><h2>{{ current.name || current.entityName || current.entity || current.id }}</h2></div><button type="button" class="close" aria-label="关闭详情" @click="selected = ''">×</button></div>
              <dl class="overview"><template v-for="key in (['entity', 'mechanism', 'run', 'comparison', 'implementation'] as const)" :key="key"><div v-if="current[key]"><dt>{{ label(key) }}</dt><dd>{{ current[key] }}</dd></div></template><div><dt>编号</dt><dd>{{ current.id }}</dd></div></dl>
              <p v-if="loadingDetail" class="detail-message">正在加载详情…</p><p v-else-if="detailError" class="detail-message" role="alert">{{ detailError }}</p>
              <template v-else-if="detail">
                <section class="evidence"><h3>来源归属</h3>
                  <a v-if="upstreamSource(detail.source)" :href="upstreamSource(detail.source)" target="_blank" rel="noreferrer">{{ detail.source }}</a><p v-else>{{ display(detail.source) }}</p>
                  <ul><li v-for="item in array(detail.assignments)" :key="String(item.id)">{{ display(item.id) }} — {{ item.reason ?? (Array.isArray(item.categories) ? item.categories.map(categoryLabel).join('、') : '') }}<small v-if="item.owner">{{ item.owner }}</small></li></ul>
                </section>
                <section v-if="array(detail.attribution).length" class="evidence"><h3>差异归因</h3><article v-for="item in array(detail.attribution)" :key="String(item.id)"><strong>{{ item.status === 'attributed' ? '已归因' : '待核对' }}</strong><p>{{ item.explanation }}</p><small>{{ item.id }}</small></article></section>
                <section v-if="buffReadings.length" class="evidence"><h3>Buff 条件读数</h3><div v-for="(e, i) in buffReadings" :key="i">
                  <p>{{ e.source }} 授予 {{ e.recipient }}　{{ e.attribute }}</p>
                  <table><thead><tr><th>来源</th><th>触发前</th><th>启用</th><th>关闭</th></tr></thead><tbody><tr v-for="s in ['mona', 'leyline']" :key="s"><th>{{ sideLabel(s) }}</th><td v-for="k in ['before', 'enabled', 'disabled']" :key="k">{{ display(object(e[s])[k]) }}</td></tr></tbody></table>
                </div></section>
                <section v-if="pairs.length" class="evidence"><h3>双侧直接对照</h3><div class="table-wrap"><table class="comparison-table"><thead><tr><th>输入 / 场景</th><th>Mona</th><th>LeyLine</th><th>差值</th><th>容差</th><th>结果</th><th>方法</th></tr></thead><tbody><tr v-for="(item, index) in pairs" :key="index"><td>{{ pick(item, ['scenario', 'input', 'name']) }}</td><td>{{ display(item.mona) }}</td><td>{{ display(item.leyline) }}</td><td>{{ display(item.difference) }}</td><td>{{ display(item.tolerance) }}</td><td>{{ display(item.result) }}</td><td>{{ display(item.method) }}</td></tr></tbody></table></div></section>
                <section v-if="comparisonRows.length" class="evidence"><h3>独立公式检查</h3><div class="table-wrap"><table class="comparison-table"><thead><tr><th>输入 / 场景</th><th>期望值</th><th>实际值</th><th>差值</th><th>容差</th><th>结果</th></tr></thead><tbody><tr v-for="(item, index) in comparisonRows" :key="index"><td>{{ pick(item, ['input', 'scenario', 'name', 'linkId']) }}</td><td>{{ pick(item, ['expected', 'mona']) }}</td><td>{{ pick(item, ['actual', 'leyline']) }}</td><td>{{ pick(item, ['difference', 'delta']) }}</td><td>{{ pick(item, ['tolerance']) }}</td><td>{{ pick(item, ['result']) }}</td></tr></tbody></table></div></section>
                <section v-for="refKey in ['counterparts', 'candidateRows']" :key="refKey" v-show="refs(detail[refKey]).length" class="evidence"><h3>{{ refKey === 'counterparts' ? '对应条目' : '候选条目' }}</h3><div class="reference-links"><button v-for="item in refs(detail[refKey])" :key="item.id" type="button" @click="jump(item.id)">{{ sideLabel(item.side) }} / {{ item.name || item.id }}</button></div></section>
                <section v-if="links.length" class="evidence"><h3>映射说明</h3><article v-for="(link, index) in links" :key="index" class="evidence-item"><dl><div v-if="link.explanation"><dt>说明</dt><dd>{{ display(link.explanation) }}</dd></div><div v-if="link.scope"><dt>范围</dt><dd>{{ display(link.scope) }}</dd></div><div v-if="link.disposition"><dt>结论</dt><dd>{{ display(link.disposition) }}</dd></div></dl></article></section>
                <section v-if="changes.length" class="evidence"><h3>Buff 探针变化</h3><div class="table-wrap"><table class="comparison-table"><thead><tr><th>属性路径</th><th>变化前</th><th>变化后</th></tr></thead><tbody><tr v-for="(change, index) in changes" :key="index"><td>{{ pick(change, ['path', 'key', 'field', 'group']) }}</td><td>{{ pick(change, ['before']) }}</td><td>{{ pick(change, ['after']) }}</td></tr></tbody></table></div></section>
                <section class="evidence"><h3>原始证据</h3><details v-for="(value, key) in detail" :key="key" @toggle="onRawToggle(String(key), $event)"><summary>{{ label(String(key)) }}</summary><pre v-if="openRaw[String(key)]">{{ JSON.stringify(value, null, 2) }}</pre></details></section>
              </template>
            </template><div v-else class="detail-empty">选择左侧条目查看详情</div>
          </section>
        </div>
        </template>
      </template>
    </main>
  </div>
</template>
