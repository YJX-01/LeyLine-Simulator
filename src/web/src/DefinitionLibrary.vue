<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WorkbenchNode, WorkbenchUnit } from '@leyline/schema';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { useDefinitionLibraryStore } from './stores/definition-library';
import { cloneDefinition, copyDefinitionToProject, createDefinition } from './domain/definition-library';
import { localDataErrorLabel, definitionLabel, operationLabel, unitLabel, capabilityLabel, inputLabel } from './domain/workbench-labels';

const workspace = useAxisWorkspaceStore();
const store = useDefinitionLibraryStore();
const name = ref('自定义伤害');
const kind = ref<'damage' | 'equipment' | 'character'>('damage');
const selectedId = ref('');
const selected = computed(() => store.library.definitions.find(entry => entry.id === selectedId.value));
const error = ref('');
const fileInput = ref<HTMLInputElement>();
const operations: WorkbenchNode['op'][] = ['constant', 'input', 'add', 'multiply', 'divide', 'condition', 'unsupported'];
const units: WorkbenchUnit[] = ['scalar', 'attack', 'damage'];
const op = ref<WorkbenchNode['op']>('constant');
function create() {
  const definition = createDefinition(name.value, kind.value);
  store.library.definitions.push(definition);
  selectedId.value = definition.id;
}
function addNode() {
  const definition = selected.value;
  if (!definition) return;
  const id = crypto.randomUUID();
  const first = definition.nodes[0]?.id ?? id;
  const operation = op.value;
  const node: WorkbenchNode = operation === 'constant' ? { id, op: operation, quantity: { value: 1, unit: 'scalar' } }
    : operation === 'input' ? { id, op: operation, key: 'attack', unit: 'attack' }
    : operation === 'condition' ? { id, op: operation, key: '触发条件', yes: first, no: first }
    : operation === 'unsupported' ? { id, op: operation, capability: 'snapshot' }
    : operation === 'attribute' ? { id, op: operation, key: 'attack', unit: 'attack' }
    : operation === 'capture' ? { id, op: operation, at: '待选择记录', value: first }
    : operation === 'history' ? { id, op: operation, mode: 'sum', startMs: 0, endMs: 6000 }
    : operation === 'game-damage' ? { id, op: operation }
    : { id, op: operation, left: first, right: first };
  definition.nodes.push(node);
}
function copy(id: string) {
  const definition = store.library.definitions.find(entry => entry.id === id);
  if (!definition) return;
  try { workspace.command(draft => { copyDefinitionToProject(draft, definition, store.library.definitions); }); error.value = ''; store.notice = '已复制到当前轴；后续定义库修改不影响轴快照。'; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '复制失败。'; }
}
function collect(id: string) {
  const definition = workspace.project.definitions.find(entry => entry.id === id);
  if (!definition) return;
  if (store.library.definitions.some(entry => entry.id === id)) { error.value = '库中已有该定义。请直接编辑库内版本，轴中快照不会更新。'; return; }
  store.library.definitions.push(cloneDefinition(definition));
  selectedId.value = id;
  error.value = '';
}
function addEffect() {
  const definition = selected.value;
  if (!definition) return;
  const value = crypto.randomUUID();
  definition.nodes.push({ id: value, op: 'constant', quantity: { value: 0.2, unit: 'scalar' } });
  definition.effects.push({ id: crypto.randomUUID(), startMs: 0, endMs: 5000, value });
}
function condition(effect: { condition?: string }, enabled: boolean) {
  if (enabled) effect.condition = '触发条件'; else delete effect.condition;
}
async function open() { if (!await store.openNative()) fileInput.value?.click(); }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  try {
    if (file && file.size > 8 * 1024 * 1024) throw new Error('定义库超过 8 MiB，当前资料保持不变。');
    if (file) store.importContent(await file.text());
    selectedId.value = store.library.definitions[0]?.id ?? '';
  } catch (cause) { store.error = cause instanceof Error ? cause.message : '打开失败。'; }
  input.value = '';
}
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
function conditionName(previous: string, event: Event) {
  const name = (event.target as HTMLInputElement).value;
  return previous === 'triggered' && name === '触发条件' ? previous : name;
}
</script>
<template>
  <section class="independent-library" aria-label="独立内容定义库">
    <div class="library-actions"><h2>独立内容定义库</h2><button class="ui-action soft" data-accent="anemo" :disabled="store.busy" @click="open">打开定义库</button><button class="ui-action soft" data-accent="anemo" :disabled="store.busy" @click="store.save()">保存定义库</button><span>{{ store.dirty ? '定义库有未保存修改' : '定义库已保存' }}</span></div>
    <input ref="fileInput" type="file" accept=".json,application/json" aria-label="导入内容定义库文件" hidden @change="importFile">
    <p role="status">{{ store.notice }}</p><div v-if="store.error || error" role="alert">{{ localDataErrorLabel(store.error || error) }}<details><summary>技术详情</summary>{{ store.error || error }}</details></div>
    <div class="library-fields"><label>内容名称<input v-model="name" aria-label="新定义名称" maxlength="160"></label><label>内容类型<select v-model="kind" aria-label="新定义类型"><option value="damage">伤害公式</option><option value="character">角色</option><option value="equipment">武器或效果</option></select></label><button class="ui-action soft" data-accent="anemo" @click="create">创建定义</button></div>
    <div class="library-fields"><label>编辑库内定义<select v-model="selectedId" aria-label="编辑库内定义"><option value="">请选择</option><option v-for="(definition, index) in store.library.definitions" :key="definition.id" :value="definition.id">{{ definition.name || `内容${index + 1}` }}</option></select></label><button class="ui-action soft" data-accent="anemo" :disabled="!selected" @click="copy(selectedId)">复制所选定义到当前轴</button></div>
    <div v-if="selected" class="definition-editor">
      <div class="library-fields"><label>显示名称<input v-model="selected.name" aria-label="定义显示名称" maxlength="160"></label><label>使用版本<input v-model="selected.version" aria-label="定义使用版本" maxlength="160"></label></div>
      <p>属性引用随候选配置重新取值；固定常量不会随换装改变。库内更新不自动传播到已有轴。未知条件可以随轴保存。</p>
      <div class="library-fields"><label>新增节点类型<select v-model="op" aria-label="新增节点类型"><option v-for="operation in operations" :key="operation" :value="operation">{{ operationLabel(operation) }}</option></select></label><button class="ui-action soft" data-accent="anemo" @click="addNode">添加公式节点</button></div>
      <div v-for="(node, index) in selected.nodes" :key="node.id" class="node-editor">
        <strong>节点{{ index + 1 }} · {{ operationLabel(node.op) }}</strong>
        <template v-if="node.op === 'constant'"><label>固定数值<input v-model.number="node.quantity.value" type="number" :aria-label="`节点${index + 1}固定数值`"></label><label>单位<select v-model="node.quantity.unit" :aria-label="`节点${index + 1}单位`"><option v-for="unit in units" :key="unit" :value="unit">{{ unitLabel(unit) }}</option></select></label></template>
        <template v-else-if="node.op === 'input'"><label>引用属性<select v-model="node.key" :aria-label="`节点${index + 1}引用属性`"><option value="attack">攻击力</option><option v-if="node.key !== 'attack'" :value="node.key">{{ node.key }}</option></select><button class="ui-action soft" data-accent="anemo" v-if="node.key === 'attack'" @click="node.key = '自定义属性'">使用自定义属性</button><input v-else v-model="node.key" aria-label="自定义引用属性名称"></label><label>单位<select v-model="node.unit" :aria-label="`节点${index + 1}单位`"><option v-for="unit in units" :key="unit" :value="unit">{{ unitLabel(unit) }}</option></select></label></template>
        <template v-else-if="node.op === 'add' || node.op === 'multiply' || node.op === 'divide'"><label>左侧节点<select v-model="node.left" :aria-label="`节点${index + 1}左侧节点`"><option v-for="(entry, n) in selected.nodes" :key="entry.id" :value="entry.id">节点{{ n + 1 }}</option></select></label><label>右侧节点<select v-model="node.right" :aria-label="`节点${index + 1}右侧节点`"><option v-for="(entry, n) in selected.nodes" :key="entry.id" :value="entry.id">节点{{ n + 1 }}</option></select></label></template>
        <template v-else-if="node.op === 'condition'"><label>条件名称<input :value="inputLabel(node.key)" :aria-label="`节点${index + 1}条件名称`" @input="node.key = conditionName(node.key, $event)"></label><label>满足时<select v-model="node.yes"><option v-for="(entry, n) in selected.nodes" :key="entry.id" :value="entry.id">节点{{ n + 1 }}</option></select></label><label>不满足时<select v-model="node.no"><option v-for="(entry, n) in selected.nodes" :key="entry.id" :value="entry.id">节点{{ n + 1 }}</option></select></label></template>
        <template v-else-if="node.op === 'unsupported'"><label>能力占位<select v-model="node.capability"><option v-for="capability in ['snapshot', 'history', 'probability']" :key="capability" :value="capability">{{ capabilityLabel(capability) }}</option></select></label><span>仅保留文件兼容性，不能完整计算。</span></template>
        <button class="ui-action soft" data-accent="anemo" @click="selected.nodes.splice(index, 1)">删除节点{{ index + 1 }}</button>
      </div>
      <label>伤害根节点<select :value="selected.damage || ''" aria-label="库内伤害根节点" @change="selected.damage = ($event.target as HTMLSelectElement).value || undefined"><option value="">无伤害公式</option><option v-for="(node, index) in selected.nodes" :key="node.id" :value="node.id">节点{{ index + 1 }}</option></select></label>
      <button class="ui-action soft" data-accent="anemo" @click="addEffect">添加区间伤害加成</button>
      <div v-for="(effect, index) in selected.effects" :key="effect.id" class="node-editor">
        <strong>区间效果{{ index + 1 }}</strong><label>开始（毫秒）<input v-model.number="effect.startMs" type="number"></label><label>结束（毫秒）<input v-model.number="effect.endMs" type="number"></label><label>加成节点<select v-model="effect.value"><option v-for="(node, n) in selected.nodes" :key="node.id" :value="node.id">节点{{ n + 1 }}</option></select></label>
        <label><input type="checkbox" :checked="Boolean(effect.condition)" @change="condition(effect, checked($event))">需要触发条件</label><label v-if="effect.condition">条件名称<input :value="inputLabel(effect.condition)" @input="effect.condition = conditionName(effect.condition, $event)"></label><label>动作触发<select :value="effect.action || ''" @change="effect.action = ($event.target as HTMLSelectElement).value || undefined"><option value="">从轴起点计时</option><option v-for="(definition, n) in store.library.definitions" :key="definition.id" :value="definition.id">{{ definition.name || `内容${n + 1}` }}</option></select></label><button class="ui-action soft" data-accent="anemo" @click="selected.effects.splice(index, 1)">删除效果{{ index + 1 }}</button>
      </div>
      <details><summary>技术详情</summary><p>稳定标识：{{ selected.id }}；版本：{{ selected.version }}</p></details>
    </div>
    <details><summary>将当前轴快照收藏到独立库</summary><button class="ui-action soft" data-accent="anemo" v-for="definition in workspace.project.definitions" :key="definition.id" @click="collect(definition.id)">收藏 {{ definitionLabel(workspace.project, definition.id) }}</button></details>
  </section>
</template>
<style scoped>
.independent-library { margin: 0 0 20px; } p { margin: 12px 0; font-size:var(--font-body); line-height: 1.7; } .library-actions,.library-fields,.node-editor { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin: 14px 0; } .library-actions h2 { margin-right: auto; } label { display: grid; gap: 7px; min-width: 130px; } .node-editor { border: 1px solid var(--line); border-radius: 7px; padding: 14px; } .node-editor strong { align-self: center; } button { margin: 4px; } details { margin-top: 16px; }
</style>
