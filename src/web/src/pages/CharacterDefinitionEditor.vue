<script setup lang="ts">
import { formatJson } from '@leyline/schema';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getCharacter, loadCatalog, DATA_VERSION } from '@leyline/game-data';
import type { CharacterDefinitionFile } from '@leyline/schema';
import { applyCharacterDefinition, copyCharacterDefinition, parseCharacterDefinition, prepareCharacterDefinition } from '../domain/character-definition';
import { downloadJson } from '../domain/download';
import { getDesktopBridge } from '../platform/desktop';
import { useCharacterDefinitionStore } from '../stores/character-definition';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import CharacterMetadataPanel from '../components/CharacterMetadataPanel.vue';

const store = useCharacterDefinitionStore(), workspace = useAxisWorkspaceStore();
const choices = ref<{ id: string; name: string }[]>([]), preset = ref('jean');
const error = ref(''), notice = ref(''), busy = ref(false), input = ref<HTMLInputElement>();
const pending = ref<CharacterDefinitionFile>();
const skillId = ref(''), hit = ref(0), level = ref(0);
let request = 0;
onBeforeUnmount(() => { request++; });
onMounted(async () => {
  const token = ++request;
  try { const catalog = await loadCatalog(); if (token === request) choices.value = catalog.characters; }
  catch { if (token === request) error.value = '角色目录未能读取，请重试。'; }
});
const skills = computed(() => store.draft?.talents.filter(skill => skill.hits.length) ?? []);
const selectedSkill = computed(() => skills.value.find(skill => skill.id === skillId.value) ?? skills.value[0]);
const editKey = computed(() => JSON.stringify([selectedSkill.value?.id ?? '', String(hit.value), String(level.value)]));
const multiplier = computed(() => store.edits[editKey.value] ?? String(selectedSkill.value?.parameters.find(parameter=>parameter.id===selectedSkill.value?.hits[hit.value]?.parameter)?.values[level.value] ?? ''));
const previewDefinition=computed(()=>{if(!store.draft)return undefined;try{return prepareCharacterDefinition(store.draft,store.edits);}catch{return store.draft;}});
function receive(content:string) { open(parseCharacterDefinition(content)); }
function open(file: CharacterDefinitionFile) {
  if (store.dirty) pending.value = file;
  else { store.open(file); skillId.value = ''; hit.value = 0; level.value = 0; notice.value = '角色定义已载入草稿。'; }
}
async function copyPreset() {
  const token = ++request, id = preset.value;
  busy.value = true; error.value = ''; notice.value = '';
  try { const character = await getCharacter(id); if (token === request) open(copyCharacterDefinition(character, DATA_VERSION)); }
  catch (cause) { if (token === request) error.value = cause instanceof Error ? cause.message : '角色资料读取失败。'; }
  finally { if (token === request) busy.value = false; }
}
async function importFile(event: Event) {
  const element = event.target as HTMLInputElement, file = element.files?.[0], token = ++request;
  if (!file) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('角色定义超过 8 MiB。');
    const content = await file.text();
    if (token === request) receive(content);
  } catch (cause) { if (token === request) error.value = cause instanceof Error ? cause.message : '角色定义读取失败。'; }
  finally { element.value = ''; if (token === request) busy.value = false; }
}
async function openFile() {
  const bridge = getDesktopBridge();
  if (!bridge) { input.value?.click(); return; }
  const token = ++request;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const content = await bridge.openProject();
    if (token !== request) return;
    if (content === null) notice.value = '已取消打开，当前草稿保持不变。';
    else receive(content);
  } catch (cause) { if (token === request) error.value = cause instanceof Error ? cause.message : '角色定义读取失败。'; }
  finally { if (token === request) busy.value = false; }
}
function prepared() {
  if (!store.draft) throw new Error('请先复制或打开角色定义。');
  return prepareCharacterDefinition(store.draft, store.edits);
}
async function exportFile() {
  if (busy.value) return;
  error.value = ''; busy.value = true;
  try {
    const signature = JSON.stringify([store.draft, store.edits]), file = prepared(), bridge = getDesktopBridge();
    if (bridge) {
      if (!await bridge.saveProject(formatJson(file))) { notice.value = '已取消导出，当前草稿保持不变。'; return; }
    } else downloadJson(file, `${file.identity.name}.character.json`);
    if (JSON.stringify([store.draft, store.edits]) === signature) store.open(file);
    notice.value = '已导出角色元数据与静态规则；现有轴和账号未被修改。';
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '角色定义导出失败。'; }
  finally { busy.value = false; }
}
function apply() {
  error.value = '';
  try {
    const next = applyCharacterDefinition(workspace.project, workspace.actorId, prepared());
    workspace.command(project => { Object.assign(project, next); });
    notice.value = '已应用到所选队员的轴内候选，可撤销；账号实际配装保持原样。';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '角色定义应用失败。'; }
}
function replaceDraft() {
  if (!pending.value) return;
  store.open(pending.value); pending.value = undefined; skillId.value = ''; hit.value = 0; level.value = 0;
}
</script>

<template>
  <section class="character-definition" aria-label="自定义角色元数据">
    <h2>角色元数据</h2>
    <p>复制已收录角色的介绍、成长、技能参数和规则进行试配。自定义修改未经游戏核验，导出文件不包含账号或库存。</p>
    <div class="definition-actions">
      <label>来源角色<select v-model="preset" aria-label="角色定义来源"><option v-for="choice in choices" :key="choice.id" :value="choice.id">{{ choice.name }}</option></select></label>
      <button class="ui-action soft" data-accent="anemo" :disabled="busy || !choices.length" @click="copyPreset">复制角色元数据</button>
      <button class="ui-action soft" data-accent="anemo" :disabled="busy" @click="openFile">打开角色定义</button>
      <input ref="input" type="file" accept=".json,application/json" aria-label="导入角色定义文件" hidden @change="importFile">
    </div>
    <div v-if="store.draft" class="definition-draft">
      <label>角色名称<input v-model="store.draft.identity.name" aria-label="角色元数据名称" maxlength="160"></label>
      <p>来源：{{ store.draft.derivedFrom?.name ?? store.draft.identity.name }} · 自定义试配。草稿切页保留，文件导出后可重新打开。</p>
      <details><summary>数据来源与版本</summary><p>{{ store.draft.origin }} · {{ store.draft.dataVersion }}</p></details>
      <div v-if="selectedSkill" class="definition-actions">
        <label>技能<select :value="selectedSkill.id" aria-label="元数据技能" @change="skillId = ($event.target as HTMLSelectElement).value; hit = 0; level = 0"><option v-for="skill in skills" :key="skill.id" :value="skill.id">{{ skill.name }}</option></select></label>
        <label>命中段<select v-model.number="hit" aria-label="元数据命中段"><option v-for="(_, index) in selectedSkill.hits" :key="index" :value="index">第 {{ index + 1 }} 段</option></select></label>
        <label>天赋等级<select v-model.number="level" aria-label="元数据天赋等级"><option v-for="(_, index) in selectedSkill.parameters.find(parameter=>parameter.id===selectedSkill.hits[hit]?.parameter)?.values ?? []" :key="index" :value="index">{{ index + 1 }} 级</option></select></label>
        <label>倍率系数<input :value="multiplier" inputmode="decimal" aria-label="元数据技能倍率" @input="store.edits[editKey] = ($event.target as HTMLInputElement).value"></label>
      </div>
      <CharacterMetadataPanel :character="previewDefinition!" />
      <div class="definition-actions"><button class="ui-action soft" data-accent="anemo" :disabled="busy" @click="exportFile">导出角色定义</button><button class="ui-action soft" data-accent="anemo" :disabled="busy || !workspace.actor?.build" @click="apply">应用到所选队员</button></div>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    <WorkbenchDialog v-if="pending" title="替换角色元数据草稿" compact @close="pending = undefined">
      <p>当前草稿有未导出的修改。是否使用新打开的角色定义替换？</p>
      <template #footer><button class="ui-action soft" data-accent="anemo" @click="pending = undefined">保留草稿</button><button class="ui-action" data-accent="anemo" @click="replaceDraft">替换草稿</button></template>
    </WorkbenchDialog>
  </section>
</template>

<style scoped>
.character-definition { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 24px; }
.definition-actions { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin: 14px 0; }
.definition-draft > label, .definition-actions label { display: grid; gap: 7px; min-width: 0; max-width: 100%; }
.definition-draft > label { max-width: 420px; }
select, input { min-width: 0; max-width: 100%; }
p { overflow-wrap: anywhere; }
</style>
