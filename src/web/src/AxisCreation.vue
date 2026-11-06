<script setup lang="ts">
import { ref } from 'vue';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { useDefinitionLibraryStore } from './stores/definition-library';
import { copyDefinitionToProject, createSyntheticTeam } from './domain/definition-library';
import { definitionLabel } from './domain/workbench-labels';
import type { WorkbenchUnit } from '@leyline/schema';
import { unitLabel } from './domain/workbench-labels';

const workspace = useAxisWorkspaceStore();
const definitions = useDefinitionLibraryStore();
const name = ref('虚构角色');
const attack = ref(1000);
const character = ref('');
const weapon = ref('');
const error = ref('');
const attribute = ref('自定义属性');
const attributeValue = ref(0);
const attributeUnit = ref<WorkbenchUnit>('scalar');
const units: WorkbenchUnit[] = ['scalar', 'attack', 'damage'];
function create() {
  try { workspace.command(draft => { workspace.actorId = createSyntheticTeam(draft, name.value, attack.value); }); error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '创建失败。'; }
}
function addActor() {
  if (!workspace.project.definitions.some(entry => entry.id === character.value) || !workspace.project.definitions.some(entry => entry.id === weapon.value) || !Number.isFinite(attack.value)) { error.value = '请选择角色与武器定义，并填写有效攻击力。'; return; }
  const id = crypto.randomUUID();
  workspace.command(draft => { draft.candidate.actors.push({ id, name: name.value.trim() || '自定义角色', character: character.value, weapon: weapon.value, inputs: { attack: { value: attack.value, unit: 'attack' } } }); });
  workspace.actorId = id;
  error.value = '';
}
function addAttribute() {
  if (!workspace.actor || !attribute.value.trim() || !Number.isFinite(attributeValue.value)) { error.value = '请先选择队员，并填写属性名称与有效数值。'; return; }
  workspace.command(draft => {
    const actor = draft.candidate.actors.find(entry => entry.id === workspace.actorId);
    if (actor) actor.inputs = { ...actor.inputs, [attribute.value.trim()]: { value: attributeValue.value, unit: attributeUnit.value } };
  });
  error.value = '';
}
function importDefinition(id: string) {
  const definition = definitions.library.definitions.find(entry => entry.id === id);
  if (!definition) return;
  try { workspace.command(draft => { copyDefinitionToProject(draft, definition, definitions.library.definitions); }); error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '复制失败。'; }
}
</script>
<template>
  <section class="panel creation-panel" aria-label="创建队伍">
    <h2>创建队伍与候选</h2>
    <p>先建立定义和队伍，再到时间轴添加动作与伤害。候选配置独立于账号实际装备。</p>
    <div class="creation-fields"><label>角色名称<input v-model="name" aria-label="新角色名称" maxlength="160"></label><label>初始攻击力<input v-model.number="attack" type="number" aria-label="初始攻击力"></label></div>
    <button @click="create">创建合成角色与基础定义</button>
    <details><summary>使用已有定义建队</summary>
      <p>从独立定义库复制到当前轴，不自动更新已有快照。</p>
      <button v-for="definition in definitions.library.definitions" :key="definition.id" @click="importDefinition(definition.id)">复制 {{ definition.name || '自定义内容' }} 到当前轴</button>
      <div class="creation-fields"><label>角色定义<select v-model="character" aria-label="新队员角色定义"><option value="">请选择</option><option v-for="definition in workspace.project.definitions" :key="definition.id" :value="definition.id">{{ definitionLabel(workspace.project, definition.id) }}</option></select></label><label>武器定义<select v-model="weapon" aria-label="新队员武器定义"><option value="">请选择</option><option v-for="definition in workspace.project.definitions" :key="definition.id" :value="definition.id">{{ definitionLabel(workspace.project, definition.id) }}</option></select></label></div>
      <button @click="addActor">添加队员</button>
    </details>
    <details><summary>添加当前队员的自定义候选属性</summary><p>属性名称应与内容定义中的引用属性一致；新增属性不会修改账号资料。</p><div class="creation-fields"><label>属性名称<input v-model="attribute" maxlength="160" aria-label="自定义候选属性名称"></label><label>数值<input v-model.number="attributeValue" type="number" aria-label="自定义候选属性数值"></label><label>单位<select v-model="attributeUnit" aria-label="自定义候选属性单位"><option v-for="unit in units" :key="unit" :value="unit">{{ unitLabel(unit) }}</option></select></label><button @click="addAttribute">保存候选属性</button></div></details>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.creation-panel { margin: 0 0 20px; } p { margin: 12px 0; font-size: 12px; line-height: 1.7; } .creation-fields { display: flex; flex-wrap: wrap; gap: 16px; margin: 15px 0; } label { display: grid; gap: 8px; } details { margin-top: 16px; } button { margin: 4px; }
</style>
