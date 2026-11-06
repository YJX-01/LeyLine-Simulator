<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { WorkbenchNode } from '@leyline/schema';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { actorLabel, definitionLabel, operationLabel, unitLabel, recordLabel, inputLabel, diagnosticLabel, effectLabel } from './domain/workbench-labels';
import { enableP3, newP3Node, parseP3Sample, reviseEffect } from './domain/p3-project';
import snapshot from '../../../fixtures/workbench/p3-snapshot.json';
import history from '../../../fixtures/workbench/p3-history.json';

const workspace = useAxisWorkspaceStore();
const { project, result } = storeToRefs(workspace);
const selectedDefinition = ref('');
const definition = computed(() => project.value.definitions.find(d => d.id === selectedDefinition.value));
const op = ref<WorkbenchNode['op']>('attribute');
const operations: WorkbenchNode['op'][] = ['constant', 'input', 'attribute', 'capture', 'history', 'add', 'multiply', 'divide', 'condition', 'game-damage'];
const sourceActor = ref('');
const recipient = ref('team');
const attribute = ref('attack');
const amount = ref(100);
const conversion = ref(false);
const coefficient = ref(0.2);
const captureAt = ref<'dynamic' | 'source'>('dynamic');
const startMs = ref(0);
const endMs = ref(8000);
const action = ref('');
const group = ref('自定义效果组');
const policy = ref<'add' | 'replace' | 'stack'>('add');
const maxStacks = ref(1);
const revisionValues = ref<Record<string, number>>({});
const error = ref('');
const records = computed(() => project.value.timeline);
const enabled = computed(() => project.value.rulesVersion === 'workbench-p3');
const readLabel = (key: string) => key.startsWith('capture:') ? '捕获值' : key.startsWith('history:') ? '历史累计与计数' : inputLabel(key);
const num = (value: number | null | undefined) => value == null ? '待确认' : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
function load(kind: 'snapshot' | 'history') {
  try { workspace.replaceProject(parseP3Sample(kind === 'snapshot' ? snapshot : history)); error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '样本打开失败'; }
}
function addNode() {
  if (!definition.value) return;
  const id = definition.value.id;
  workspace.command(draft => {
    const d = draft.definitions.find(entry => entry.id === id)!;
    d.nodes.push(newP3Node(op.value, d.nodes[0]?.id ?? '待选择节点', draft.timeline[0]?.id ?? '待选择记录'));
  });
}
function addEffect() {
  const owner = project.value.candidate.actors.find(a => a.id === sourceActor.value);
  if (!owner) { error.value = '请先选择效果来源角色。'; return; }
  if (!Number.isFinite(amount.value) || !Number.isFinite(coefficient.value) || !Number.isInteger(startMs.value) || !Number.isInteger(endMs.value) || startMs.value < 0 || endMs.value <= startMs.value || endMs.value > 3600000) { error.value = '请填写有限数值及有效的毫秒区间。'; return; }
  if (captureAt.value === 'source' && !action.value) { error.value = '来源捕获需要选择触发动作。'; return; }
  workspace.command(draft => {
    const actor = draft.candidate.actors.find(entry => entry.id === owner.id)!;
    let d = draft.definitions.find(entry => entry.id === actor.weapon)!;
    if (draft.candidate.actors.some(other => other.id !== actor.id && (other.weapon === d.id || other.character === d.id))) {
      d = JSON.parse(JSON.stringify(d));
      d.id = crypto.randomUUID();
      draft.definitions.push(d);
      actor.weapon = d.id;
    }
    const id = crypto.randomUUID();
    const unit = attribute.value === 'attack' ? 'attack' as const : 'scalar' as const;
    if (conversion.value && attribute.value === 'attack') {
      d.nodes.push({ id: `${id}-attribute`, op: 'attribute', actor: owner.id, key: 'attack', unit: 'attack' },
        { id: `${id}-rate`, op: 'constant', quantity: { value: coefficient.value, unit: 'scalar' } },
        { id, op: 'multiply', left: `${id}-attribute`, right: `${id}-rate` });
    } else d.nodes.push({ id, op: 'constant', quantity: { value: amount.value, unit } });
    d.effects.push({ id: `${id}-effect`, startMs: startMs.value, endMs: endMs.value, value: id, recipient: recipient.value,
      attribute: attribute.value, unit, group: group.value || '自定义效果组', policy: policy.value, maxStacks: maxStacks.value, captureAt: captureAt.value, ...(action.value ? { action: action.value } : {}) });
  });
  error.value = '';
}
function revision(id: string, disabled: boolean, unit: 'scalar' | 'attack' | 'damage', changeValue = false) {
  const value = revisionValues.value[id];
  if (changeValue && !Number.isFinite(value)) { error.value = '请先填写修订数值。'; return; }
  workspace.command(draft => reviseEffect(draft, id, disabled, changeValue ? { value, unit } : undefined));
}
function setOptional(target: object, key: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  Object.assign(target, { [key]: value || undefined });
}
function setReset(node: Extract<WorkbenchNode, { op: 'history' }>, event: Event) {
  node.resetAt = Array.from((event.target as HTMLSelectElement).selectedOptions).map(option => option.value);
}
</script>

<template>
  <section class="p3-panel panel" aria-label="效果快照与历史">
    <h2>效果、属性捕获与历史</h2>
    <p>效果从当前候选和动作重新生成。编辑使用当前轴、撤销记录和计算进程；保存轴时一并保存。</p>
    <div class="p3-actions"><button data-testid="p3-load-snapshot" @click="load('snapshot')">载入属性捕获示例</button><button data-testid="p3-load-history" @click="load('history')">载入历史结算示例</button><small>载入会替换当前轴，请先保存。</small></div>
    <template v-if="!enabled"><p>当前轴保留旧版规则。采用新规则后才能添加本页机制；原文件不自动升级。</p><button @click="workspace.command(enableP3)">当前轴明确采用 P3 规则</button></template>
    <template v-else>
      <p role="status">已采用 P3 规则 · 目标 {{ num(result.objectiveValue) }}</p>
      <div v-if="error" role="alert">{{ error }}</div>
      <div v-for="(issue, index) in result.diagnostics" :key="`${issue.path}-${index}`" role="status"><p>{{ diagnosticLabel(issue.code) }}</p><details><summary>诊断技术详情</summary>{{ issue.path }}：{{ issue.message }}</details></div>
      <details open><summary>创建自定义效果</summary>
        <div class="p3-fields">
          <label>效果来源角色<select v-model="sourceActor" aria-label="效果来源角色"><option value="">请选择</option><option v-for="a in project.candidate.actors" :key="a.id" :value="a.id">{{ actorLabel(project, a.id) }}</option></select></label>
          <label>效果接收者<select v-model="recipient" aria-label="效果接收者"><option value="self">来源自身</option><option value="team">全队</option><option v-for="a in project.candidate.actors" :key="a.id" :value="a.id">{{ actorLabel(project, a.id) }}</option></select></label>
          <label>作用属性<select v-model="attribute" aria-label="效果作用属性"><option value="attack">攻击力</option><option value="damageBonus">伤害加成</option></select></label>
          <label v-if="attribute === 'attack'"><input v-model="conversion" type="checkbox" aria-label="转换来源攻击力">按来源攻击力转换</label>
          <label v-if="conversion && attribute === 'attack'">转换系数<input v-model.number="coefficient" type="number" step="any" aria-label="效果转换系数"></label>
          <label v-else>固定增量<input v-model.number="amount" type="number" step="any" aria-label="效果固定增量"><small>伤害加成以 0.5 表示 50%</small></label>
          <label>读取方式<select v-model="captureAt" aria-label="效果读取方式"><option value="dynamic">动态读取</option><option value="source">触发前捕获（排除自身）</option></select></label>
          <label>开始偏移（毫秒）<input v-model.number="startMs" type="number" aria-label="新效果开始"></label><label>结束偏移（毫秒）<input v-model.number="endMs" type="number" aria-label="新效果结束"></label>
          <label>触发动作<select v-model="action" aria-label="新效果触发动作"><option value="">轴起点</option><option v-for="d in project.definitions" :key="d.id" :value="d.id">{{ definitionLabel(project, d.id) }}</option></select></label>
          <label>覆盖组<input v-model="group" aria-label="新效果覆盖组" maxlength="160"></label><label>同组规则<select v-model="policy" aria-label="新效果同组规则"><option value="add">全部相加</option><option value="replace">最新覆盖</option><option value="stack">限层叠加，替换最旧层</option></select></label><label v-if="policy === 'stack'">层数上限<input v-model.number="maxStacks" type="number" min="1" max="1000" aria-label="新效果层数上限"></label>
          <button @click="addEffect">创建效果到来源武器</button>
        </div>
      </details>
      <details open><summary>编辑轴内定义与捕获、历史公式</summary>
        <label>编辑 P3 定义<select v-model="selectedDefinition" aria-label="编辑 P3 定义"><option value="">请选择</option><option v-for="d in project.definitions" :key="d.id" :value="d.id">{{ definitionLabel(project, d.id) }}</option></select></label>
        <template v-if="definition">
          <div class="p3-fields"><label>新增运算<select v-model="op" aria-label="P3 新增运算"><option v-for="operation in operations" :key="operation" :value="operation">{{ operationLabel(operation) }}</option></select></label><button @click="addNode">添加 P3 节点</button><label>伤害根节点<select :value="definition.damage || ''" aria-label="P3 伤害根节点" @change="setOptional(definition, 'damage', $event)"><option value="">无</option><option v-for="(n, index) in definition.nodes" :key="n.id" :value="n.id">节点{{ index + 1 }} · {{ operationLabel(n.op) }}</option></select></label></div>
          <div v-for="(node, index) in definition.nodes" :key="node.id" class="p3-node" :data-p3-node="node.id">
            <h3>节点{{ index + 1 }} · {{ operationLabel(node.op) }}</h3><div class="p3-fields">
              <template v-if="node.op === 'constant'"><label>固定数值<input v-model.number="node.quantity.value" type="number" step="any" :aria-label="`P3 节点${index + 1}数值`"></label><label>单位<select v-model="node.quantity.unit"><option value="scalar">倍率</option><option value="attack">攻击力</option><option value="damage">伤害</option></select></label></template>
              <template v-if="node.op === 'input' || node.op === 'attribute'"><label>属性名称<select v-if="node.key === 'attack' || node.key === 'damageBonus'" v-model="node.key" :aria-label="`P3 节点${index + 1}属性`"><option value="attack">攻击力</option><option value="damageBonus">伤害加成</option></select><input v-else v-model="node.key" :aria-label="`P3 节点${index + 1}属性`"><button v-if="node.key === 'attack' || node.key === 'damageBonus'" @click="node.key = '自定义属性'">使用自定义属性</button></label><label>单位<select v-model="node.unit"><option value="scalar">倍率</option><option value="attack">攻击力</option><option value="damage">伤害</option></select></label></template>
              <template v-if="node.op === 'attribute'"><label>读取角色<select :value="node.actor || ''" :aria-label="`P3 节点${index + 1}角色`" @change="setOptional(node, 'actor', $event)"><option value="">当前角色</option><option v-for="a in project.candidate.actors" :key="a.id" :value="a.id">{{ actorLabel(project, a.id) }}</option></select></label><label>读取时刻<select :value="node.at || ''" @change="setOptional(node, 'at', $event)"><option value="">动态当前时刻</option><option v-for="r in records" :key="r.id" :value="r.id">{{ recordLabel(project, r.id) }} · {{ r.timeMs }}毫秒</option></select></label></template>
              <template v-if="node.op === 'attribute' || node.op === 'capture'"><label>阶段<select :value="node.phase || 'before'" @change="setOptional(node, 'phase', $event)"><option value="before">记录之前</option><option value="after">记录之后</option></select></label></template>
              <template v-if="node.op === 'capture'"><label>捕获记录<select v-model="node.at" :aria-label="`P3 节点${index + 1}捕获记录`"><option v-for="r in records" :key="r.id" :value="r.id">{{ recordLabel(project, r.id) }} · {{ r.timeMs }}毫秒</option></select></label><label>捕获值节点<select v-model="node.value"><option v-for="(n, i) in definition.nodes" :key="n.id" :value="n.id">节点{{ i + 1 }}</option></select></label></template>
              <template v-if="node.op === 'add' || node.op === 'multiply' || node.op === 'divide'"><label>左值<select v-model="node.left"><option v-for="(n, i) in definition.nodes" :key="n.id" :value="n.id">节点{{ i + 1 }}</option></select></label><label>右值<select v-model="node.right"><option v-for="(n, i) in definition.nodes" :key="n.id" :value="n.id">节点{{ i + 1 }}</option></select></label></template>
              <template v-if="node.op === 'history'"><label>观察方式<select v-model="node.mode" aria-label="历史观察方式"><option value="sum">前序伤害累计</option><option value="count">前序命中计数</option></select></label><label>窗口开始（毫秒，含）<input v-model.number="node.startMs" type="number" aria-label="历史窗口开始"></label><label>窗口结束（毫秒，不含）<input v-model.number="node.endMs" type="number" aria-label="历史窗口结束"></label><label>初值<input v-model.number="node.initial" type="number" aria-label="历史初值"></label><label>上限（留空无限）<input :value="node.cap" type="number" aria-label="历史上限" @change="node.cap = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)"></label><label>观察角色<select :value="node.actor || ''" aria-label="历史观察角色" @change="setOptional(node, 'actor', $event)"><option value="">全部角色</option><option v-for="a in project.candidate.actors" :key="a.id" :value="a.id">{{ actorLabel(project, a.id) }}</option></select></label><label>观察伤害定义<select :value="node.definition || ''" aria-label="历史观察定义" @change="setOptional(node, 'definition', $event)"><option value="">全部伤害定义</option><option v-for="d in project.definitions.filter(d => d.damage)" :key="d.id" :value="d.id">{{ definitionLabel(project, d.id) }}</option></select></label><label>重置记录（多选）<select multiple :value="node.resetAt || []" aria-label="历史重置记录" @change="setReset(node, $event)"><option v-for="r in records" :key="r.id" :value="r.id">{{ recordLabel(project, r.id) }} · {{ r.timeMs }}毫秒</option></select></label><label><input v-model="node.includeCurrent" type="checkbox" aria-label="历史包含当前结算">包含当前结算（自引用会诊断循环）</label></template>
              <template v-if="node.op === 'condition'"><label>条件名称<input v-model="node.key"></label><label>满足节点<select v-model="node.yes"><option v-for="(n, i) in definition.nodes" :key="n.id" :value="n.id">节点{{ i + 1 }}</option></select></label><label>不满足节点<select v-model="node.no"><option v-for="(n, i) in definition.nodes" :key="n.id" :value="n.id">节点{{ i + 1 }}</option></select></label></template>
              <button @click="definition.nodes.splice(index, 1)">删除节点{{ index + 1 }}</button>
            </div>
          </div>
          <div v-for="(effect, index) in definition.effects" :key="effect.id" class="p3-node" :data-p3-effect="effect.id"><h3>效果{{ index + 1 }}</h3><div class="p3-fields">
            <label>值节点<select v-model="effect.value"><option v-for="(n, i) in definition.nodes" :key="n.id" :value="n.id">节点{{ i + 1 }}</option></select></label><label>开始偏移（毫秒）<input v-model.number="effect.startMs" type="number"></label><label>结束偏移（毫秒）<input v-model.number="effect.endMs" type="number"></label>
            <label>接收者<select :value="effect.recipient || 'self'" @change="setOptional(effect, 'recipient', $event)"><option value="self">自身</option><option value="team">全队</option><option v-for="a in project.candidate.actors" :key="a.id" :value="a.id">{{ actorLabel(project, a.id) }}</option></select></label><label>属性<select :value="effect.attribute || 'damageBonus'" @change="setOptional(effect, 'attribute', $event)"><option value="attack">攻击力</option><option value="damageBonus">伤害加成</option></select></label><label>单位<select :value="effect.unit || 'scalar'" @change="setOptional(effect, 'unit', $event)"><option value="attack">攻击力</option><option value="scalar">倍率</option><option value="damage">伤害</option></select></label>
            <label>读取方式<select :value="effect.captureAt || 'dynamic'" @change="setOptional(effect, 'captureAt', $event)" :aria-label="`效果${index + 1}读取方式`"><option value="dynamic">动态读取</option><option value="source">来源动作前捕获</option></select></label><label>覆盖组<input v-model="effect.group"></label><label>规则<select :value="effect.policy || 'add'" @change="setOptional(effect, 'policy', $event)"><option value="add">相加</option><option value="replace">最新覆盖</option><option value="stack">限层叠加</option></select></label><label>层数上限<input v-model.number="effect.maxStacks" type="number" min="1"></label><label>动作定义<select :value="effect.action || ''" @change="setOptional(effect, 'action', $event)"><option value="">轴起点</option><option v-for="d in project.definitions" :key="d.id" :value="d.id">{{ definitionLabel(project, d.id) }}</option></select></label><label>触发条件<select :value="effect.condition || ''" @change="setOptional(effect, 'condition', $event)"><option value="">无条件</option><option v-for="(_, key) in project.conditions" :key="key" :value="key">{{ inputLabel(key) }}</option></select></label><button @click="definition.effects.splice(index, 1)">删除效果{{ index + 1 }}</button>
          </div></div>
        </template>
      </details>
      <details open><summary>候选效果与来源修订</summary><p>候选来自实际装备与动作；逐点是否采用请查看时间轴的公式来源。换装或删来源后，旧修订保留为待核对。</p>
        <article v-for="instance in result.effectInstances || []" :key="instance.id" class="p3-node" :data-p3-instance="instance.id"><strong>{{ actorLabel(project, instance.owner) }} · {{ definitionLabel(project, instance.definition) }}</strong><p>{{ instance.startMs }}–{{ instance.endMs }} 毫秒 · {{ instance.attribute === 'attack' ? '攻击力' : instance.attribute === 'damageBonus' ? '伤害加成' : instance.attribute }} · {{ instance.disabled ? '已禁用' : '可用候选' }} · 接收{{ instance.recipient === 'self' ? '来源自身' : instance.recipient === 'team' ? '全队' : actorLabel(project, instance.recipient) }} · {{ unitLabel(instance.unit) }}</p><div class="p3-fields"><button @click="revision(instance.id, !instance.disabled, instance.unit)">{{ instance.disabled ? '恢复来源实例' : '禁用来源实例' }}</button><label>人工修订数值<input v-model.number="revisionValues[instance.id]" type="number" step="any" :aria-label="`修订 ${effectLabel(project, instance.definition, instance.effect)}`"></label><button @click="revision(instance.id, instance.disabled, instance.unit, true)">应用数值修订</button><button @click="workspace.command(draft => { draft.effectRevisions = draft.effectRevisions?.filter(r => r.instanceId !== instance.id); })">清除此实例修订</button></div><details><summary>技术详情</summary><code>{{ instance.id }}</code></details></article>
        <div v-for="(entry, index) in project.effectRevisions || []" :key="entry.instanceId" class="p3-node"><span>修订{{ index + 1 }} · {{ result.effectInstances?.some(i => i.id === entry.instanceId) ? '来源仍匹配' : '来源已失配，待核对' }}</span><button @click="workspace.command(draft => { draft.effectRevisions?.splice(index, 1); })">移除修订{{ index + 1 }}</button><details><summary>技术详情</summary>{{ entry.instanceId }}</details></div>
      </details>
      <details><summary>属性读取与捕获轨迹</summary><article v-for="read in result.reads || []" :key="read.id" class="p3-node"><p>{{ actorLabel(project, read.actor) }} · {{ readLabel(read.key) }} · {{ read.timeMs }}毫秒 · {{ read.phase === 'before' ? '记录之前' : '记录之后' }} · {{ num(read.value) }} {{ unitLabel(read.unit) }}</p><p>关联 {{ recordLabel(project, read.recordId) }}</p><details><summary>技术详情与依赖</summary><p>{{ read.id }} · {{ read.key }}</p><p>{{ read.instanceId }}</p><code>{{ read.dependencies.join('、') }}</code></details></article></details>
    </template>
  </section>
</template>
<style scoped>
.p3-panel { margin: 20px 30px; } .p3-panel p { font-size: 12px; line-height: 1.8; margin: 12px 0; } .p3-actions,.p3-fields { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 16px 0; } label { display: grid; gap: 7px; min-width: 130px; font-size: 12px; } label:has(input[type=checkbox]) { display: flex; align-items: center; } input[type=checkbox] { width: auto; } summary { cursor: pointer; padding: 12px 0; } .p3-node { border: 1px solid var(--line); border-radius: 7px; padding: 12px; margin: 12px 0; } h3 { font-size: 13px; } code { overflow-wrap: anywhere; } button { margin: 3px; } small { font-size: 11px; color: #8a977c; }
</style>
