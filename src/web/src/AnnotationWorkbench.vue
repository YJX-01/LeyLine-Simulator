<script setup lang="ts">
import { computed, ref } from 'vue';
import { actorLabel, definitionLabel, recordLabel, nodeLabel, effectLabel, projectLabel, unitLabel, operationLabel, diagnosticLabel, statusLabel, inputLabel, capabilityLabel, errorLabel } from './domain/workbench-labels';

import { storeToRefs } from 'pinia';
import type { WorkbenchNode } from '@leyline/schema';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { acceptanceCases, createWorkbenchProject, importWorkbenchProject, nextRecordId, removeTimelineRecord, setDamageSelected, type AcceptanceCase } from './domain/workbench-project';

const workspace = useAxisWorkspaceStore();
const { project, actorId, selectedId: selectedPoint, notice: message, error, busy, result } = storeToRefs(workspace);
const currentCase = ref<AcceptanceCase>('weapon-a');
const baseline = ref(JSON.stringify(createWorkbenchProject()));
const fileInput = ref<HTMLInputElement>();
const actor = computed(() => project.value.candidate.actors.find(entry => entry.id === actorId.value));
const weaponDefinition = computed(() => project.value.definitions.find(d => d.id === actor.value?.weapon));
const damageRecords = computed(() => project.value.timeline.filter(record => record.kind === 'damage'));
const point = computed(() => result.value.points.find(entry => entry.id === selectedPoint.value) ?? result.value.points[0]);
const caseInfo = computed(() => acceptanceCases.find(entry => entry.id === currentCase.value));
const matchesSample = computed(() => baseline.value === JSON.stringify(project.value));
const complete = computed(() => result.value.status === 'complete');
const totalTimelineMs = computed(() => Math.max(8000, ...project.value.timeline.map(record => record.timeMs), ...(weaponDefinition.value?.effects.map(effect => effect.endMs) ?? [])));
const isDesktop = Boolean(window.leylineDesktop);
const number = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  return value.trim() === '' ? NaN : Number(value);
};
const text = (event: Event) => (event.target as HTMLInputElement).value;
const format = (value: number | null | undefined) => value === null || value === undefined ? '待确认' : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
function constantNode(node: WorkbenchNode) { return node.op === 'constant' ? node.quantity : undefined; }
function loadCase(id: AcceptanceCase) {
  workspace.loadSample(id);
  currentCase.value = id;
  baseline.value = JSON.stringify(project.value);
  actorId.value = project.value.candidate.actors[0]?.id ?? '';
  selectedPoint.value = 'hit-2';
  error.value = '';
  message.value = '已加载独立验收样本，可以直接检查参考算式或继续编辑。';
}
function conditionValue(key: string) {
  return project.value.conditions[key] === true ? 'true' : project.value.conditions[key] === false ? 'false' : 'unknown';
}
function setCondition(key: string, event: Event) {
  const value = text(event);
  project.value.conditions[key] = value === 'unknown' ? null : value === 'true';
}
function toggleCondition(effect: { condition?: string }, enabled: boolean) {
  if (enabled) {
    effect.condition = 'triggered';
    if (!Object.hasOwn(project.value.conditions, 'triggered')) project.value.conditions.triggered = null;
  } else delete effect.condition;
}
function addRecord(kind: 'action' | 'damage') {
  if (!actor.value) return;
  const definition = kind === 'damage' ? project.value.definitions.find(d => d.damage) : project.value.definitions.find(d => d.id === actor.value?.character);
  if (!definition) return;
  const id = nextRecordId(project.value);
  project.value.timeline.push({ id, kind, actor: actor.value.id, definition: definition.id, timeMs: 0, order: project.value.timeline.length });
  if (kind === 'damage' && project.value.objective.damageIds) project.value.objective.damageIds.push(id);
  selectedPoint.value = id;
}
async function openProject() {
  if (!await workspace.openNativeProject()) fileInput.value?.click();
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await workspace.inputFile(file);
  input.value = '';
}
async function saveProject() { await workspace.saveProject(); }
</script>

<template>
  <main class="annotation-workbench">
    <header class="workbench-header">
      <div><p class="eyebrow">地脉 · 伤害轴工作台</p><h1>伤害轴工作台</h1><p class="subtitle">记录命中，替换配装，检查每一步计算。</p></div>
      <div class="header-actions"><a href="#axis">返回工作台</a><span class="environment">{{ isDesktop ? '桌面端' : '浏览器' }} · 公式验收工具</span><button class="secondary" :disabled="busy" @click="openProject">打开项目</button><button :disabled="busy" @click="saveProject">保存项目</button></div>
    </header>
    <input ref="fileInput" type="file" accept=".json,application/json" aria-label="导入项目文件" class="file-input" @change="importFile">
    <div v-if="error" class="notice error-notice" role="alert">{{ errorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>
    <p class="project-notice" role="status">{{ message }}</p>
    <div class="workbench-grid">
      <nav class="sample-sidebar" aria-label="验收样本">
        <p class="section-kicker">P0 / P1 · 可操作验收</p><h2>普通伤害</h2><p class="muted">合成数据 · 非真实角色机制</p>
        <button v-for="entry in acceptanceCases" :key="entry.id" class="sample-button" :class="{ active: currentCase === entry.id && matchesSample }" @click="loadCase(entry.id)"><span>{{ entry.label }}</span><strong>{{ entry.expected.toLocaleString() }}</strong></button>
        <div class="sample-explanation"><span class="small-label">独立手算参考</span><p>{{ caseInfo?.calculation }}</p><span class="sample-state" :class="{ passed: matchesSample && result.objectiveValue === caseInfo?.expected }">{{ matchesSample ? (result.objectiveValue === caseInfo?.expected ? '✓ 当前样本结果一致' : '结果与参考不一致') : '当前为自定义编辑；参考仅对应原样本' }}</span></div>
        <div class="future-note"><strong>后续能力样本</strong><p>快照：6900 / 7020 / 6600<br>窗口累计：150 / 180</p><span>已保留独立期望，尚未支持计算。</span></div>
        <a class="legacy-link" href="#workbench">打开原自动模拟器</a>
      </nav>
      <div class="editor-column">
        <section class="editor-card">
          <div class="section-heading"><div><span class="section-kicker">01 · 候选方案</span><h2>候选配装与属性</h2></div><span class="chip">规则快照</span></div>
          <div class="fields candidate-fields">
            <label>当前角色<select v-model="actorId"><option v-for="entry in project.candidate.actors" :key="entry.id" :value="entry.id">{{ actorLabel(project, entry.id) }}</option></select></label>
            <label v-if="actor">武器方案<select v-model="actor.weapon"><option v-for="definition in project.definitions" :key="definition.id" :value="definition.id">{{ definitionLabel(project, definition.id) }}</option></select></label>
            <template v-if="actor"><label v-for="(quantity, key) in actor.inputs" :key="key">{{ key === 'attack' ? '攻击力' : key }}<input type="number" step="any" :value="quantity.value" @input="quantity.value = number($event)"><span class="field-hint">单位：{{ unitLabel(quantity.unit) }}</span></label></template>
          </div>
          <p v-if="!actor" class="muted">项目没有可编辑角色，请加载左侧样本开始验收。</p>
          <div v-if="weaponDefinition" class="effect-editor"><div class="subheading"><h3>武器效果</h3><span>{{ definitionLabel(project, weaponDefinition.id) }}</span></div>
            <p v-if="!weaponDefinition.effects.length" class="empty-state">此方案没有区间效果，换装后不会沿用旧武器加成。</p>
            <div v-for="effect in weaponDefinition.effects" :key="effect.id" class="effect-block">
              <div class="effect-title"><strong>{{ effectLabel(project, weaponDefinition.id, effect.id) }}</strong><span>区间左闭右开 [起点, 终点)</span></div>
              <div class="fields"><label>生效起点（毫秒）<input type="number" min="0" step="1" :value="effect.startMs" @input="effect.startMs = number($event)"></label><label>失效终点（毫秒）<input type="number" min="0" step="1" :value="effect.endMs" @input="effect.endMs = number($event)"></label>
                <template v-for="node in weaponDefinition.nodes.filter(node => node.id === effect.value)" :key="node.id"><label v-if="node.op === 'constant'">伤害加成（%）<input type="number" step="any" :value="node.quantity.value * 100" @input="node.quantity.value = number($event) / 100"></label></template>
              </div>
              <label class="checkbox-label"><input type="checkbox" :checked="Boolean(effect.condition)" @change="toggleCondition(effect, ($event.target as HTMLInputElement).checked)">此效果需要额外触发条件</label>
              <label v-if="effect.condition" class="condition-field">条件 {{ inputLabel(effect.condition) }}<select :value="conditionValue(effect.condition)" @change="setCondition(effect.condition!, $event)"><option value="unknown">待确认（未知）</option><option value="true">明确满足</option><option value="false">明确不满足</option></select></label>
            </div>
          </div>
        </section>
        <section class="editor-card">
          <div class="section-heading"><div><span class="section-kicker">02 · 时间轴</span><h2>动作与伤害点</h2></div><div class="inline-actions"><button class="secondary small" :disabled="!actor" @click="addRecord('action')">添加动作</button><button class="secondary small" :disabled="!actor || !project.definitions.some(d => d.damage)" @click="addRecord('damage')">添加伤害点</button></div></div>
          <div class="axis-preview" aria-label="伤害轴预览"><div class="axis-track"><span v-for="record in project.timeline" :key="record.id" :style="{ left: `${record.timeMs / totalTimelineMs * 100}%` }" class="axis-point" :class="{ action: record.kind === 'action' }" :title="`${recordLabel(project, record.id)} · ${record.timeMs}毫秒`"></span></div><div class="axis-labels"><span>0秒</span><span>{{ totalTimelineMs / 1000 }}秒</span></div></div>
          <div class="table-scroll"><table aria-label="时间轴记录"><thead><tr><th>目标</th><th>记录</th><th>时间（毫秒）</th><th>同刻顺序</th><th>定义</th><th></th></tr></thead><tbody><tr v-for="record in project.timeline" :key="record.id"><td><input v-if="record.kind === 'damage'" type="checkbox" :aria-label="`目标 ${recordLabel(project, record.id)}`" :checked="!project.objective.damageIds || project.objective.damageIds.includes(record.id)" @change="setDamageSelected(project, record.id, ($event.target as HTMLInputElement).checked)"><span v-else class="muted">—</span></td><td><span class="record-kind">{{ record.kind === 'action' ? '动作' : '伤害' }}</span><span class="record-id">{{ recordLabel(project, record.id) }}</span></td><td><input type="number" min="0" step="1" :aria-label="`时间 ${recordLabel(project, record.id)}`" :value="record.timeMs" @input="record.timeMs = number($event)"></td><td><input type="number" min="0" step="1" :aria-label="`顺序 ${recordLabel(project, record.id)}`" :value="record.order" @input="record.order = number($event)"></td><td><select v-model="record.definition" :aria-label="`定义 ${recordLabel(project, record.id)}`"><option v-for="definition in project.definitions.filter(d => record.kind === 'action' || d.damage)" :key="definition.id" :value="definition.id">{{ definitionLabel(project, definition.id) }}</option></select></td><td><button class="delete-button" :aria-label="`删除 ${recordLabel(project, record.id)}`" @click="removeTimelineRecord(project, record.id)">移除</button></td></tr></tbody></table></div>
          <p class="field-hint">勾选只改变目标统计范围；其他记录、效果及计算上下文始终保留。时间单位为整数毫秒。</p>
        </section>
        <section class="editor-card definition-card">
          <div class="section-heading"><div><span class="section-kicker">03 · 公式定义</span><h2>公式与定义快照</h2></div><span class="chip">预设 / 用户定义共用计算</span></div>
          <details v-for="definition in project.definitions.filter(d => d.damage)" :key="definition.id" open><summary>{{ definitionLabel(project, definition.id) }} · 版本{{ definition.version }}</summary><div class="fields"><label>伤害根节点<select v-model="definition.damage"><option v-for="node in definition.nodes" :key="node.id" :value="node.id">{{ nodeLabel(project, definition.id, node.id) }} · {{ operationLabel(node.op) }}</option></select></label><label>内容来源<select v-model="definition.source.kind"><option value="user">用户定义</option><option value="preset">预设内容</option></select></label></div><div class="node-list"><div v-for="node in definition.nodes" :key="node.id" class="node-row"><code>{{ nodeLabel(project, definition.id, node.id) }}</code><span class="node-op">{{ operationLabel(node.op) }}</span><label v-if="constantNode(node)">数值<input type="number" step="any" :aria-label="`常量 ${nodeLabel(project, definition.id, node.id)}`" :value="constantNode(node)?.value" @input="node.op === 'constant' && (node.quantity.value = number($event))"></label><span v-else-if="node.op === 'input'" class="muted">读取候选属性 {{ inputLabel(node.key) }} · {{ unitLabel(node.unit) }}</span><span v-else-if="node.op === 'multiply' || node.op === 'add' || node.op === 'divide'" class="muted">{{ nodeLabel(project, definition.id, node.left) }} {{ node.op === 'add' ? '+' : node.op === 'multiply' ? '×' : '÷' }} {{ nodeLabel(project, definition.id, node.right) }}</span><span v-else-if="node.op === 'condition'" class="muted">条件 {{ inputLabel(node.key) }} → {{ nodeLabel(project, definition.id, node.yes) }} / {{ nodeLabel(project, definition.id, node.no) }}</span><span v-else-if="node.op === 'unsupported'" class="muted">尚未支持 {{ capabilityLabel(node.capability) }}</span></div></div></details>
          <p class="field-hint">当前样本明确排除暴击、反应及敌人减免；这里的合成公式不代表完整游戏伤害。</p>
        </section>
      </div>
      <aside class="results-column">
        <section class="result-card"><div class="section-heading"><h2>计算结果</h2><span class="result-state" :class="{ complete }">{{ complete ? '已完整计算' : result.status === 'partial' ? '部分待确认' : '输入需修正' }}</span></div><p class="small-label">所选目标伤害</p><p class="objective-number" data-testid="objective-value">{{ format(result.objectiveValue) }}</p><div class="result-meta"><span>全轴总伤害</span><strong data-testid="total-value">{{ format(result.totalValue) }}</strong></div><div class="result-meta"><span>保留伤害点</span><strong>{{ result.points.length }} / {{ damageRecords.length }}</strong></div><p class="live-hint"><span></span>每次编辑都重新绑定配装并求值</p></section>
        <section class="result-card"><h3>逐点明细</h3><div v-if="!result.points.length" class="empty-state">添加伤害点后查看结果。</div><button v-for="entry in result.points" :key="entry.id" class="point-result" :class="{ selected: point?.id === entry.id }" @click="selectedPoint = entry.id"><span>{{ recordLabel(project, entry.id) }}<small>{{ project.timeline.find(r => r.id === entry.id)?.timeMs }} 毫秒</small></span><strong>{{ format(entry.value) }}</strong></button><p class="field-hint">点击伤害点查看公式引用与来源。</p></section>
        <section v-if="point" class="result-card trace-card"><h3>{{ recordLabel(project, point.id) }} · 公式与来源</h3><p class="formula-root"><code>{{ definitionLabel(project, point.formula.definition) }} / {{ nodeLabel(project, point.formula.definition, point.formula.root) }}</code></p><p>{{ point.formula.effects.length ? `读取 ${point.formula.effects.length} 个候选区间效果` : '没有区间效果参与此命中' }}</p><ul class="effect-sources"><li v-for="effect in point.formula.effects" :key="`${effect.definition}-${effect.effect}-${effect.action}`">{{ definitionLabel(project, effect.definition) }} / {{ effectLabel(project, effect.definition, effect.effect) }}<span v-if="effect.action"> · 动作 {{ recordLabel(project, effect.action) }}</span></li></ul><details><summary>技术详情：来源轨迹（{{ point.sources.length }}）</summary><ul class="source-list"><li v-for="source in point.sources" :key="source.path"><strong>{{ definitionLabel(project, source.definition) }} · {{ source.version }}</strong><span>{{ source.source.kind === 'preset' ? '预设' : '用户定义' }} · {{ source.source.reference }}</span><code>{{ source.path }}</code></li></ul></details></section>
        <section class="result-card diagnostics-card"><h3>条件与诊断</h3><p v-if="!result.diagnostics.length" class="clear-state">✓ 当前没有未知条件或计算错误</p><ul v-else class="diagnostics" aria-label="计算诊断"><li v-for="diagnostic in result.diagnostics" :key="`${diagnostic.code}-${diagnostic.path}-${diagnostic.message}`"><strong>{{ diagnosticLabel(diagnostic.code) }}</strong><details><summary>技术详情</summary><p>{{ diagnostic.message }}</p><code>{{ diagnostic.code }} · {{ diagnostic.path }}</code></details></li></ul><p class="field-hint">未知条件不会被当作不满足。未确定的总值不显示为完整伤害。</p></section>
      </aside>
    </div>
    <details><summary>技术详情：项目原始数据</summary><pre>{{ JSON.stringify(project, null, 2) }}</pre></details>
  </main>
</template>

<style scoped>
.annotation-workbench { max-width: 1640px; margin: 0 auto; padding: 30px 32px 48px; color: #23352f; }
.annotation-workbench *, .annotation-workbench *::before, .annotation-workbench *::after { box-sizing: border-box; }
.workbench-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
.workbench-header h1 { font-size: 2rem; letter-spacing: -.04em; margin: 6px 0; }
.eyebrow { color: #577e69; font-weight: 700; font-size: .69rem; letter-spacing: .17em; margin: 0; }
.subtitle { margin: 8px 0 0; color: #6d7b73; font-size: .9rem; }
.header-actions, .inline-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.annotation-workbench button { border: 1px solid #245b43; background: #245b43; color: #fff; border-radius: 7px; font-weight: 600; font-size: .84rem; padding: 10px 15px; }
.annotation-workbench button:hover { filter: brightness(.96); }
.annotation-workbench button.secondary { color: #355341; background: #fff; border-color: #d4ded6; }
.annotation-workbench button.small { padding: 8px 10px; font-size: .76rem; }
.environment { color: #6e7a73; font-size: .74rem; margin-right: 8px; }
.file-input { display: none; }
.project-notice { font-size: .79rem; color: #6b7a70; padding: 10px 0; margin: 0 0 10px; }
.notice { border-radius: 7px; padding: 12px 16px; font-size: .85rem; }
.error-notice { color: #973e30; background: #fff0e8; border: 1px solid #ebc2b1; }
.workbench-grid { display: grid; grid-template-columns: 218px minmax(380px,1fr) 310px; gap: 20px; align-items: start; }
.sample-sidebar { padding: 20px 0; }
.annotation-workbench h2 { font-size: 1.04rem; margin: 6px 0; }
.annotation-workbench h3 { font-size: .86rem; margin: 0 0 12px; }
.section-kicker { color: #829286; font-size: .64rem; font-weight: 700; letter-spacing: .11em; }
.muted { color: #829087; font-size: .77rem; }
.sample-sidebar > .muted { margin-bottom: 24px; }
.annotation-workbench .sample-button { display: flex; width: 100%; gap: 8px; align-items: center; justify-content: space-between; text-align: left; background: transparent; border: 1px solid transparent; padding: 13px 10px; color: #6b7d70; font-size: .76rem; margin: 4px 0; }
.sample-button strong { font-size: .88rem; font-variant-numeric: tabular-nums; }
.annotation-workbench .sample-button.active { background: #e5eee6; color: #245b43; border-color: #d4e1d6; }
.sample-explanation { margin: 24px 8px; padding-top: 18px; border-top: 1px solid #dce4dd; font-size: .8rem; line-height: 1.8; }
.small-label { font-size: .7rem; color: #8a968e; }
.sample-state { display: block; color: #9b8058; font-size: .7rem; line-height: 1.6; }
.sample-state.passed { color: #33815a; }
.future-note { margin: 26px 8px; font-size: .72rem; color: #839086; line-height: 1.8; }
.future-note strong { color: #5d7163; }
.future-note span { font-size: .67rem; }
.legacy-link { display: inline-block; margin: 8px; font-size: .73rem; color: #6f8c78; }
.editor-column, .results-column { display: grid; gap: 18px; min-width: 0; }
.results-column { background: transparent; padding: 0; border-radius: 0; line-height: normal; }
.annotation-workbench section { border-radius: 10px; border: 1px solid #e1e7df; background: #fff; padding: 22px; min-width: 0; }
.section-heading { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; }
.chip { padding: 5px 8px; font-size: .62rem; color: #829384; border: 1px solid #e0e7de; border-radius: 5px; }
.fields { display: grid; grid-template-columns: repeat(auto-fit,minmax(130px,1fr)); gap: 14px; }
.candidate-fields { grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); }
.annotation-workbench label { color: #63756a; font-size: .73rem; gap: 7px; }
.annotation-workbench input, .annotation-workbench select { width: 100%; min-width: 0; font-size: .82rem; padding: 9px 10px; border: 1px solid #dce4db; background: #fcfdfb; color: #2d4637; border-radius: 5px; }
.annotation-workbench input:focus, .annotation-workbench select:focus { outline: 2px solid #8eb69a; outline-offset: 1px; }
.annotation-workbench input[type=checkbox] { width: 15px; height: 15px; accent-color: #2d7451; }
.field-hint { color: #929e94; font-size: .68rem; line-height: 1.8; margin: 12px 0 0; }
.subheading { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 12px; padding-top: 18px; border-top: 1px solid #edf0e9; }
.subheading h3 { margin: 0; }.subheading > span { font-size: .68rem; color: #829184; }
.effect-title { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 13px; font-size: .72rem; color: #607d67; }
.effect-title > span { color: #96a091; font-size: .64rem; }
.effect-block + .effect-block { margin-top: 20px; }
.annotation-workbench .checkbox-label { display: flex; align-items: center; margin-top: 15px; font-size: .72rem; }
.condition-field { margin-top: 12px; max-width: 240px; }
.empty-state { font-size: .74rem; background: #f4f7f1; border-radius: 6px; padding: 13px; color: #85917e; line-height: 1.8; }
.axis-preview { padding: 10px 14px 4px; margin-bottom: 15px; }
.axis-track { height: 2px; background: #e0e9dc; position: relative; margin: 10px 0; }
.axis-point { position: absolute; top: -5px; height: 12px; width: 12px; border-radius: 50%; background: #477b55; border: 3px solid #d8e6d3; transform: translateX(-50%); }
.axis-point.action { border-radius: 2px; background: #b99855; border-color: #ece1c2; }
.axis-labels { display: flex; justify-content: space-between; font-size: .63rem; color: #99a491; }
.table-scroll { overflow-x: auto; }.annotation-workbench table { width: 100%; border-collapse: collapse; text-align: left; font-size: .73rem; }
.annotation-workbench th { font-size: .64rem; color: #8b998c; font-weight: 500; padding: 10px 5px; border-bottom: 1px solid #e6ece2; white-space: nowrap; }
.annotation-workbench td { padding: 12px 5px; border-bottom: 1px solid #eef2eb; }
.annotation-workbench td input[type=number] { min-width: 73px; padding: 8px 6px; }.annotation-workbench td select { min-width: 120px; padding: 8px 6px; font-size: .7rem; }
.record-kind { display: block; color: #8e9d8c; font-size: .61rem; margin-bottom: 4px; }.record-id { font-size: .73rem; white-space: nowrap; }
.annotation-workbench .delete-button { padding: 7px; border: 0; color: #9f8c7b; background: transparent; font-weight: 400; font-size: .7rem; }
.definition-card details + details { margin-top: 15px; }.annotation-workbench summary { cursor: pointer; color: #697d6c; font-size: .76rem; margin-bottom: 14px; }
.node-list { margin-top: 16px; }.node-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eff2eb; flex-wrap: wrap; font-size: .72rem; }
.node-row code { min-width: 75px; font-size: .71rem; color: #54725b; }.node-op { padding: 3px 7px; background: #f2f5ee; border-radius: 4px; color: #8a9b80; font-size: .63rem; }.node-row label { display: flex; align-items: center; }.node-row input { max-width: 100px; }.node-row .muted { font-size: .69rem; }
.annotation-workbench .result-card { padding: 20px; }.result-card .section-heading { margin-bottom: 22px; }.result-state { font-size: .64rem; color: #a17e3c; background: #fbf2dd; padding: 5px 7px; border-radius: 4px; }.result-state.complete { color: #3d7a50; background: #eaf3e6; }
.objective-number { margin: 8px 0 24px; color: #245b43; font-size: 2.5rem; letter-spacing: -.05em; font-weight: 650; font-variant-numeric: tabular-nums; }
.result-meta { display: flex; justify-content: space-between; gap: 10px; margin: 13px 0; font-size: .73rem; color: #8b998a; }.result-meta strong { font-weight: 500; color: #60765f; }
.live-hint { color: #9ba893; font-size: .64rem; margin: 22px 0 0; display: flex; align-items: center; gap: 7px; }.live-hint > span { width: 5px; height: 5px; background: #73a16c; border-radius: 50%; }
.annotation-workbench .point-result { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 10px; margin: 7px 0; border: 1px solid #eef1e9; background: #fff; color: #526b56; text-align: left; font-weight: 400; font-size: .75rem; }.annotation-workbench .point-result.selected { background: #f0f5eb; border-color: #dce7d5; }.point-result small { display: block; color: #99a48f; font-size: .65rem; margin-top: 5px; }.point-result strong { font-size: 1rem; }
.trace-card { font-size: .73rem; color: #8b9985; line-height: 1.8; }.formula-root { background: #f3f6ee; padding: 9px; border-radius: 5px; overflow-wrap: anywhere; font-size: .69rem; color: #6e836a; }.effect-sources { padding-left: 16px; font-size: .66rem; }.source-list { padding: 0; list-style: none; }.source-list li { border-top: 1px solid #eef2e8; padding: 10px 0; display: grid; gap: 4px; }.source-list strong { color: #6c8267; font-size: .7rem; }.source-list span { font-size: .65rem; }.source-list code, .diagnostics code { overflow-wrap: anywhere; font-size: .6rem; line-height: 1.6; }
.clear-state { color: #709268; font-size: .69rem; }.diagnostics { list-style: none; margin: 0; padding: 0; }.diagnostics li { padding: 10px; border: 1px solid #f0e5cf; background: #fffbf0; border-radius: 5px; margin-bottom: 10px; font-size: .7rem; color: #a38957; }.diagnostics p { margin: 5px 0; line-height: 1.6; overflow-wrap: anywhere; }.diagnostics strong { font-size: .67rem; }
@media (max-width: 1200px) { .workbench-grid { grid-template-columns: 180px minmax(350px,1fr) 270px; gap: 14px; }.annotation-workbench { padding: 24px 20px; }.annotation-workbench section { padding: 18px; }.environment { display: none; } }
@media (max-width: 1020px) { .workbench-grid { grid-template-columns: 170px minmax(0,1fr); }.results-column { grid-column: 2; grid-template-columns: repeat(2,minmax(0,1fr)); }.sample-sidebar { grid-row: span 2; }.trace-card, .diagnostics-card { grid-column: auto; } }
@media (max-width: 680px) { .annotation-workbench { padding: 18px 14px; }.workbench-header { display: block; }.header-actions { margin-top: 20px; }.workbench-grid { display: flex; flex-direction: column; }.sample-sidebar, .editor-column, .results-column { width: 100%; }.sample-sidebar { padding: 8px 0; }.sample-sidebar > .muted { margin-bottom: 12px; }.sample-sidebar .sample-button { width: calc(50% - 4px); display: inline-flex; margin: 2px; padding: 10px 8px; font-size: .67rem; }.sample-button strong { font-size: .74rem; }.sample-explanation { margin: 12px 4px; padding-top: 10px; }.future-note { margin: 14px 4px; }.legacy-link { margin: 0 4px 14px; }.results-column { display: grid; grid-template-columns: 1fr; }.effect-title { display: block; }.effect-title > span { display: block; margin-top: 5px; }.section-heading { margin-bottom: 16px; }.objective-number { font-size: 2.3rem; } }
</style>
