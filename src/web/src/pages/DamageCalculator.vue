<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { getArtifactSet } from '@leyline/game-data';
import { damageCalculatorSchema, elements, talentLevelBonus, type AxisResponse, type DamageCalculatorDocument, type DamageRequest } from '@leyline/schema';
import { accountSlots, accountSlotLabels, type AccountArtifact, type AccountCharacter, type AccountSlot } from '../domain/account';
import { calculatorRequest, copyProjectForCalculator, parseDamageCalculator, readCalculatorSource, prepareCalculatorContentUpdate } from '../domain/damage-calculator';
import { addActorFromBuild, addAttributeCapture, defaultEnemy } from '../domain/real-project';
import { createEmptyProject, nextRecordId } from '../domain/workbench-project';
import { downloadJson } from '../domain/download';
import { realElementLabel, realStatLabel, statusLabel, recordLabel, actorLabel } from '../domain/workbench-labels';
import { useAccountStore } from '../stores/account';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import CharacterForm from './CharacterForm.vue';
import ArtifactBrowser from './ArtifactBrowser.vue';
import ArtifactEquipmentGrid from '../components/ArtifactEquipmentGrid.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';

const account = useAccountStore(), axis = useAxisWorkspaceStore();
const document = ref<DamageCalculatorDocument>();
const form = ref<InstanceType<typeof CharacterForm>>();
const formRevision = ref(0), formDirty = ref(false), working = ref(false), error = ref('');
const file = ref<HTMLInputElement>(), source = ref(''), slot = ref<AccountSlot>();
const savedSignature = ref('');
const response = shallowRef<AxisResponse>();
const pendingSource = ref<Awaited<ReturnType<typeof readCalculatorSource>>>();
const contentReview = ref<Awaited<ReturnType<typeof prepareCalculatorContentUpdate>>>();
let reviewSignature = '';
const damage = ref<DamageRequest>({ skillId: '', hitIndex: 0, crit: null, reaction: null });
const enemy = ref(defaultEnemy());
const hitTime = ref(0), captureTime = ref<number | string>('');
const actor = computed(() => document.value?.project.candidate.actors.find(actor => actor.id === document.value!.actorId));
const hitOwner = computed(() => {
  const record = document.value?.project.timeline.find(record => record.id === document.value?.recordId);
  return record ? document.value?.project.candidate.actors.find(actor => actor.id === record.actor) : actor.value;
});
const character = computed<AccountCharacter | undefined>(() => actor.value?.build ? {
  id: actor.value.id, name: actor.value.build.character.identity.name, attack: 0, weapon: actor.value.build.weapon.name, equipment: {}, build: actor.value.build,
} : pendingSource.value?.character);
const queryCharacter = computed(() => hitOwner.value && hitOwner.value.id !== actor.value?.id ? hitOwner.value.build?.character : form.value?.selectedDefinition ?? hitOwner.value?.build?.character);
const skill = computed(() => queryCharacter.value?.talents.find(skill => skill.id === damage.value.skillId));
watch(() => queryCharacter.value?.id, (id, before) => { if (before && id && id !== before) { damage.value.skillId = ''; chooseSkill(); } });
const selectedHit = computed(() => skill.value?.hits[damage.value.hitIndex]);
const result = computed(() => response.value?.comparison?.candidates[0]?.result ?? response.value?.result);
const point = computed(() => result.value?.points.find(point => point.id === document.value?.recordId));
const baselinePoint = computed(() => response.value?.comparison?.baseline.points.find(point => point.id === document.value?.recordId));
const number = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '待确认' : value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
const inputNames: Record<string, string> = { counterCharge: '反击档位', namisen: '浪闪层数', resolve: '施放时消耗的愿力', lightfallEnergy: '光降之剑能量层数' };
const reactionNames = { none: '无反应', vaporize: '蒸发', melt: '融化', aggravate: '超激化', spread: '蔓激化' };
const reactionType = computed({ get: () => damage.value.reaction === null ? '' : damage.value.reaction === 'none' ? 'none' : damage.value.reaction.type,
  set: (value: string) => { damage.value.reaction = !value ? null : value === 'none' ? 'none' : { type: value as 'melt' | 'vaporize' | 'aggravate' | 'spread', trigger: 'record-owner' }; } });
const reactionChoices = computed(() => {
  const element = selectedHit.value?.element ?? skill.value?.element;
    const choices: Record<string, string[]> = { pyro: ['vaporize', 'melt'], hydro: ['vaporize'], cryo: ['melt'], electro: ['aggravate'], dendro: ['spread'] };
    return ['none', ...(choices[element ?? 'physical'] ?? [])] as (keyof typeof reactionNames)[];
});
const sources = computed(() => account.account.characters.flatMap(character => [
  { id: `local:${character.id}`, name: `本地 · ${character.name}${character.build ? '' : '（待补全培养与武器）'}` },
  ...(character.showcase ? [{ id: `showcase:${character.id}`, name: `展柜 · ${character.name}` }] : []),
]));
const records = computed(() => document.value?.project.timeline.filter(record => record.kind === 'damage' && record.damage) ?? []);
const captures = computed(() => document.value?.project.timeline.filter(record => record.actor === hitOwner.value?.id
  && (record.kind === 'damage' ? record.damage?.skillId : record.skillId) === selectedHit.value?.snapshot?.sourceSkillId) ?? []);
const entries = computed(() => accountSlots.map(slot => {
  const equipment = actor.value?.build ?? pendingSource.value?.equipment;
  const real = equipment?.artifacts.find(item => item.slot === slot);
  return { slot, item: real ? { id: real.id, name: `${equipment?.sets.find(set => set.id === real.setId)?.name ?? '圣遗物'} · ${accountSlotLabels[slot]}`, slot, attack: 0, real } as AccountArtifact : undefined };
}));
const signature = () => JSON.stringify([document.value ?? null, damage.value, enemy.value, hitTime.value, pendingSource.value ?? null]);
const dirty = computed(() => formDirty.value || (!!(document.value || pendingSource.value) && signature() !== savedSignature.value));
const { discardOpen, requestLeave, cancelDiscard, discardChanges, saveAndLeave } = useUnsavedChanges(dirty);
let activeWorker: Worker | undefined, taskId = 0;
function stop() { activeWorker?.terminate(); activeWorker = undefined; working.value = false; }
function invalidate() { stop(); response.value = undefined; }
watch([document, damage, enemy, hitTime], invalidate, { deep: true, flush: 'sync' });
watch(formDirty, value => { if (value) { invalidate(); contentReview.value = undefined; } });
onBeforeUnmount(stop);
function install(next: DamageCalculatorDocument, saved = false) {
  invalidate(); pendingSource.value = undefined; contentReview.value = undefined; document.value = damageCalculatorSchema.parse(next);
  const record = next.project.timeline.find(record => record.id === next.recordId);
  damage.value = record?.damage ? JSON.parse(JSON.stringify(record.damage)) : { skillId: '', hitIndex: 0, crit: null, reaction: null };
  hitTime.value = (record?.timeMs ?? 0) / 1000; captureTime.value = '';
  enemy.value = next.project.enemy ? JSON.parse(JSON.stringify(next.project.enemy)) : defaultEnemy();
  formDirty.value = false; formRevision.value++; error.value = ''; slot.value = undefined;
  savedSignature.value = saved ? signature() : '';
}
function newCalculation() { requestLeave(() => { invalidate(); pendingSource.value = undefined; contentReview.value = undefined; document.value = undefined; damage.value = { skillId: '', hitIndex: 0, crit: null, reaction: null }; enemy.value = defaultEnemy(); hitTime.value = 0; captureTime.value = ''; formDirty.value = false; formRevision.value++; error.value = ''; }); }
function copyAxis() { requestLeave(() => { try { install(copyProjectForCalculator(axis.project)); } catch (cause) { showError(cause); } }); }
function showError(cause: unknown) { error.value = cause instanceof Error ? cause.message : '计算未完成。'; }
async function loadSource() {
  const owner = account.account;
  const [kind, id] = source.value.split(':');
  const entry = owner.characters.find(character => character.id === id);
  if (!entry) return;
  try {
    const next = await readCalculatorSource(owner, id, kind === 'showcase' ? 'showcase' : 'local');
    if (owner !== account.account) throw new Error('账号已切换，请重新选择。');
    if (!next.character.build) {
      invalidate(); document.value = undefined; pendingSource.value = next; damage.value = { skillId: '', hitIndex: 0, crit: null, reaction: null }; enemy.value = defaultEnemy();
      hitTime.value = 0; captureTime.value = ''; formDirty.value = false; formRevision.value++; error.value = ''; slot.value = undefined; return;
    }
    const project = createEmptyProject();
    const actorId = addActorFromBuild(project, next.character.build);
    install({ schemaVersion: 1, kind: 'damage-calculator', project, actorId });
  } catch (cause) { showError(cause); }
}
async function prepareBuild() {
  const prepared = await form.value?.prepare();
  if (!prepared?.build) return false;
  if (pendingSource.value?.equipment) Object.assign(prepared.build, pendingSource.value.equipment);
  if (!document.value) {
    const project = createEmptyProject();
    const actorId = addActorFromBuild(project, prepared.build);
    document.value = { schemaVersion: 1, kind: 'damage-calculator', project, actorId };
  } else if (actor.value) actor.value.build = prepared.build;
  pendingSource.value = undefined; formDirty.value = false; formRevision.value++;
  return true;
}
async function equip(item?: AccountArtifact, part = slot.value) {
  const build = actor.value?.build ?? pendingSource.value?.equipment, owner = account.account;
  if (!build || !part) return;
  try {
    if (item && (!item.real || item.mona?.setIdentityPending || item.slot !== part)) throw new Error('所选实物的数值或套装身份待补全。');
    const artifacts = build.artifacts.filter(item => item.slot !== part);
    if (item?.real) artifacts.push({ ...JSON.parse(JSON.stringify(item.real)), inventoryAccountId: owner.id });
    const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => build.sets.find(set => set.id === id) ?? getArtifactSet(id)));
    if (build !== (actor.value?.build ?? pendingSource.value?.equipment) || owner !== account.account) return;
    // Keep pending cultivation edits in CharacterForm; it will merge these artifacts in prepare().
    if (actor.value?.build) actor.value.build = { ...actor.value.build, artifacts, sets };
    else if (pendingSource.value) pendingSource.value.equipment = { artifacts, sets, inventoryAccountId: owner.id };
    slot.value = undefined;
  } catch (cause) { showError(cause); }
}
async function prepareDocument() {
  if ((!document.value || formDirty.value) && !await prepareBuild()) return undefined;
  if (!document.value) return undefined;
  const next = damageCalculatorSchema.parse(document.value);
  if (!next.baseline) {
    next.project.enemy = enemy.value;
    const record = next.project.timeline.find(record => record.id === next.recordId);
    const timeMs = Math.round(hitTime.value * 1000);
    if (!Number.isFinite(hitTime.value) || timeMs < 0 || timeMs > 3600000) throw new Error('请填写0至3600秒内的命中时刻。');
    if (record && damage.value.skillId) { record.damage = JSON.parse(JSON.stringify(damage.value)); record.timeMs = timeMs; }
    else if (!record && damage.value.skillId) {
      if (next.project.timeline.some(record => record.kind !== 'capture') || next.project.candidate.actors.length > 1) throw new Error('请在复制的轴中选择已有命中。');
      next.recordId = nextRecordId(next.project);
      next.project.timeline.push({ id: next.recordId, actor: next.actorId, kind: 'damage', definition: `${next.actorId}-real-damage`,
        timeMs, order: Math.max(-1, ...next.project.timeline.map(record => record.order)) + 1, damage: JSON.parse(JSON.stringify(damage.value)) });
    }
  }
  return damageCalculatorSchema.parse(next);
}
async function createCapture() {
  error.value = '';
  try {
    if ((!document.value || formDirty.value) && !await prepareBuild()) return;
    if (!document.value || document.value.baseline || !hitOwner.value || !selectedHit.value?.snapshot) return;
    if (String(captureTime.value).trim() === '') throw new Error('请填写已确认的属性捕获时刻。');
    const timeMs = Math.round(Number(captureTime.value) * 1000);
    const next = damageCalculatorSchema.parse(document.value);
    const recordId = addAttributeCapture(next.project, hitOwner.value.id, selectedHit.value.snapshot.sourceSkillId, timeMs);
    document.value = next;
    damage.value.capture = { recordId, phase: null };
    captureTime.value = '';
  } catch (cause) { showError(cause); }
}
async function calculate() {
  error.value = '';
  try {
    const next = await prepareDocument();
    if (!next) return;
    if (!next.recordId) throw new Error('请选择技能与命中。');
    document.value = next;
    const request = calculatorRequest(next, ++taskId);
    stop(); working.value = true;
    const worker = new Worker(new URL('../workers/axis.worker.ts', import.meta.url), { type: 'module' });
    activeWorker = worker;
    worker.onmessage = (event: MessageEvent<AxisResponse>) => {
      if (activeWorker !== worker || event.data.taskId !== request.taskId) return;
      response.value = event.data;
      if (event.data.error) error.value = event.data.error;
      stop();
    };
    worker.onerror = () => { if (activeWorker === worker) { stop(); error.value = '计算进程未完成，请重新计算。'; } };
    worker.postMessage(request);
  } catch (cause) { stop(); showError(cause); }
}
async function reviewContent() {
  error.value = '';
  try {
    const next = await prepareDocument();
    if (!next) return;
    reviewSignature = signature();
    const review = await prepareCalculatorContentUpdate(next);
    if (reviewSignature !== signature() || formDirty.value) throw new Error('计算设定已变化，请重新检查当前内容。');
    contentReview.value = review;
  } catch (cause) { showError(cause); }
}
async function applyContent() {
  if (!contentReview.value) return;
  if (reviewSignature !== signature() || formDirty.value) { contentReview.value = undefined; error.value = '计算设定已变化，请重新检查当前内容。'; return; }
  install(contentReview.value.document);
  await nextTick();
  if (document.value?.recordId) await calculate();
}
async function pinBaseline() { await calculate(); if (document.value?.recordId) { document.value.baseline = JSON.parse(JSON.stringify(document.value.project)); await calculate(); } }
async function save() {
  error.value = '';
  try { const next = await prepareDocument(); if (!next) return false; calculatorRequest(next, 0); if (JSON.stringify(document.value) !== JSON.stringify(next)) document.value = next; downloadJson(next, '伤害计算.json'); savedSignature.value = signature(); return true; }
  catch (cause) { showError(cause); return false; }
}
async function openFile(event: Event) {
  const input = event.target as HTMLInputElement, selected = input.files?.[0]; input.value = '';
  if (!selected) return;
  try { if (selected.size > 8 * 1024 * 1024) throw new Error('计算文件超过8 MiB。'); install(parseDamageCalculator(await selected.text()), true); await nextTick(); await calculate(); savedSignature.value = signature(); }
  catch (cause) { showError(cause); }
}
async function switchActor(id: string) {
  if (!await prepareBuild() || !document.value) return;
  document.value.actorId = id; formRevision.value++;
}
async function selectRecord(id: string) {
  if (!await prepareBuild()) return;
  if (!document.value) return;
  const next = damageCalculatorSchema.parse(document.value);
  const previous = next.project.timeline.find(record => record.id === next.recordId);
  if (!next.baseline && previous?.damage) previous.damage = JSON.parse(JSON.stringify(damage.value));
  const record = next.project.timeline.find(record => record.id === id);
  if (!record?.damage) return;
  next.recordId = id; next.actorId = record.actor; install(next);
}
function chooseSkill() { damage.value.hitIndex = 0; delete damage.value.inputs; delete damage.value.capture; delete damage.value.effectApplications; damage.value.reaction = null; }
function setInput(id: string, event: Event) { const raw = (event.target as HTMLInputElement).value; damage.value.inputs = { ...damage.value.inputs, [id]: raw.trim() ? Number(raw) : null }; }
function setHp(event: Event) { const raw = (event.target as HTMLInputElement).value; damage.value.conditions = { ...damage.value.conditions, hpRatio: raw.trim() ? Number(raw) / 100 : null }; }
function setCapture(event: Event) { damage.value.capture = { recordId: (event.target as HTMLSelectElement).value || null, phase: damage.value.capture?.phase ?? null }; }
defineExpose({ requestLeave });
</script>

<template>
  <section class="damage-calculator" aria-label="伤害计算器">
    <header class="calculator-heading"><div><h2>计算器</h2><span>{{ dirty ? '未保存' : document ? '已保存' : '独立计算设定' }}</span></div><div class="calculator-actions">
      <button class="ui-action soft" data-accent="anemo" @click="newCalculation">新建计算</button>
      <button class="ui-action soft" data-accent="anemo" @click="copyAxis">复制当前轴</button>
      <button class="ui-action soft" data-accent="anemo" @click="requestLeave(() => file?.click())">打开计算</button>
      <button class="ui-action" data-accent="anemo" @click="save">保存计算</button>
    </div></header>
    <input ref="file" hidden type="file" accept=".json,application/json" aria-label="打开伤害计算文件" @change="openFile">
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="calculator-layout">
      <section class="panel calculator-build"><h3>角色与配装</h3>
        <div v-if="sources.length" class="calculator-source"><label for="calculator-source">资料来源</label><select id="calculator-source" v-model="source"><option value="">选择已保存的资料</option><option v-for="entry in sources" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><button class="ui-action soft" data-accent="hydro" :disabled="!source" @click="requestLeave(loadSource)">读取配装</button></div>
        <label v-if="document && document.project.candidate.actors.length > 1">试配队员<select :value="document.actorId" @change="switchActor(($event.target as HTMLSelectElement).value)"><option v-for="actor in document.project.candidate.actors" :key="actor.id" :value="actor.id">{{ actorLabel(document.project, actor.id) }}</option></select></label>
        <CharacterForm ref="form" :key="formRevision" candidate detached details resolve-identity :character="character" @dirty-change="formDirty = $event" />
        <button class="ui-action soft" data-accent="anemo" @click="prepareBuild">应用配装</button>
        <button v-if="actor?.build" class="ui-action soft" data-accent="hydro" :disabled="!!document?.baseline || working" @click="reviewContent">检查当前内容</button>
        <template v-if="actor?.build || pendingSource?.equipment"><h3>圣遗物</h3><ArtifactEquipmentGrid :entries="entries" :wearers="[]" @change="slot = $event" @remove="equip(undefined, $event)" /></template>
      </section>
      <div class="calculator-right">
        <section class="panel calculator-conditions"><h3>命中条件</h3>
          <label v-if="records.length > 1">查看记录<select :value="document?.recordId" @change="selectRecord(($event.target as HTMLSelectElement).value)"><option v-for="record in records" :key="record.id" :value="record.id">{{ actorLabel(document!.project, record.actor) }} · {{ recordLabel(document!.project, record.id) }} · {{ record.timeMs / 1000 }}秒</option></select></label>
          <fieldset :disabled="!!document?.baseline"><div class="calculator-fields">
            <label>技能<select v-model="damage.skillId" :disabled="!queryCharacter" @change="chooseSkill"><option value="">选择技能</option><option v-for="talent in queryCharacter?.talents.filter(talent => talent.hits.length)" :key="talent.id" :value="talent.id">{{ talent.name }}</option></select></label>
            <label>命中类型<select v-model.number="damage.hitIndex" :disabled="!skill" @change="delete damage.capture"><option v-for="(hit, index) in skill?.hits" :key="index" :value="index">第{{ index + 1 }}类 · {{ realElementLabel(hit.element ?? skill!.element) }}</option></select></label>
            <label>命中时刻（秒）<input v-model.number="hitTime" type="number" min="0" max="3600" step="0.001"></label>
            <label>暴击<select v-model="damage.crit"><option :value="null">待确认</option><option value="noncritical">非暴击</option><option value="critical">暴击</option><option value="expected">期望伤害</option></select></label>
            <label>反应<select v-model="reactionType"><option value="">待确认</option><option v-for="reaction in reactionChoices" :key="reaction" :value="reaction">{{ reactionNames[reaction] }}</option></select></label>
            <label v-for="input in skill?.inputs" :key="input.id">{{ inputNames[input.id] ?? input.id }}<select v-if="input.id === 'counterCharge'" :value="damage.inputs?.[input.id] ?? ''" @change="setInput(input.id, $event)"><option value="">待确认</option><option :value="0">0 · 无反击加成</option><option :value="1">1 · 一档反击</option><option :value="2">2 · 满档／完美反击</option></select><input v-else type="number" :min="input.min" :max="input.max" :step="input.integer ? 1 : 'any'" :value="damage.inputs?.[input.id] ?? ''" placeholder="待确认" @input="setInput(input.id, $event)"></label>
            <label>生命比例（%）<input type="number" min="0" max="100" step="any" :value="damage.conditions?.hpRatio == null ? '' : damage.conditions.hpRatio * 100" placeholder="待确认" @input="setHp"></label>
            <label v-for="field in (['onField', 'shielded'] as const)" :key="field">{{ field === 'onField' ? '站场' : '护盾存在' }}<select :value="damage.conditions?.[field] == null ? '' : String(damage.conditions[field])" @change="damage.conditions = { ...damage.conditions, [field]: ($event.target as HTMLSelectElement).value === '' ? null : ($event.target as HTMLSelectElement).value === 'true' }"><option value="">待确认</option><option value="true">是</option><option value="false">否</option></select></label>
            <template v-if="selectedHit?.snapshot"><label>属性捕获来源<select :value="damage.capture?.recordId ?? ''" @change="setCapture"><option value="">待确认</option><option v-for="record in captures" :key="record.id" :value="record.id">{{ actorLabel(document!.project, record.actor) }} · {{ recordLabel(document!.project, record.id) }} · {{ record.timeMs / 1000 }}秒</option></select></label><label>捕获时点<select :value="damage.capture?.phase ?? ''" @change="damage.capture = { recordId: damage.capture?.recordId ?? null, phase: (($event.target as HTMLSelectElement).value || null) as 'before' | 'after' | null }"><option value="">待确认</option><option value="before">记录生效前</option><option value="after">记录生效后</option></select></label></template>
          </div><details><summary>目标条件 · 计算设定</summary><div class="calculator-fields">
            <label>目标等级<input v-model.number="enemy.level" type="number" min="1" max="200"></label>
            <label>减防比例<input v-model.number="enemy.defenseReduction" type="number" min="0" max="1" step="0.01"></label><label>无视防御比例<input v-model.number="enemy.defenseIgnore" type="number" min="0" max="1" step="0.01"></label>
            <label v-for="element in elements" :key="element">{{ realElementLabel(element) }}抗性（比例）<input v-model.number="enemy.resistances[element]" type="number" step="0.01"></label>
          </div></details></fieldset>
          <fieldset v-if="selectedHit?.snapshot" :disabled="!!document?.baseline"><label>独立捕获时刻（秒）<input v-model="captureTime" type="number" min="0" max="3600" step="0.001" placeholder="填写已确认时刻"></label><button class="ui-action soft" data-accent="hydro" @click="createCapture">添加属性捕获点</button></fieldset>
          <div class="calculator-actions"><button class="ui-action" data-accent="anemo" :disabled="working" @click="calculate">{{ working ? '计算中' : document?.baseline ? '重算候选' : '计算伤害' }}</button><button v-if="!document?.baseline" class="ui-action soft" data-accent="anemo" :disabled="!point || formDirty" @click="pinBaseline">设为比较基准</button><button v-else class="ui-action soft" data-accent="pyro" @click="delete document!.baseline">结束对照</button></div>
        </section>
        <section class="panel calculator-result" aria-label="计算结果"><h3>伤害结果</h3><template v-if="result">
          <p role="status">{{ statusLabel(result.status) }}</p><output data-testid="calculator-value">{{ number(point?.value) }}</output>
          <table v-if="response?.comparison"><thead><tr><th>基准</th><th>当前候选</th><th>差值</th></tr></thead><tbody><tr><td>{{ number(baselinePoint?.value) }}</td><td>{{ number(point?.value) }}</td><td data-testid="calculator-delta">{{ number(response.comparison.candidates[0]?.points.find(entry => entry.id === document?.recordId)?.delta) }}</td></tr></tbody></table>
          <template v-if="point?.real"><h3>计算分项</h3><table><tbody><tr v-for="(term, index) in point.real.scaling" :key="index"><th>{{ realStatLabel(term.stat) }}缩放</th><td>{{ number(term.attribute) }} × {{ number(term.multiplier) }}<template v-if="term.count"> × {{ number(term.count.value) }}</template> = {{ number(term.contribution) }}</td></tr><tr><th>技能基础伤害</th><td>{{ number(point.real.baseDamage) }}</td></tr><tr><th>附加基础伤害</th><td>{{ number(point.real.baseDamageBonus) }}</td></tr><tr v-for="(label, key) in { bonus: '增伤乘区', crit: '暴击乘区', defense: '防御乘区', resistance: '抗性乘区' }" :key="key"><th>{{ label }}</th><td>{{ number(point.real.parts[key]) }}</td></tr><template v-if="point.real.reaction"><tr><th>反应倍率</th><td>{{ number(point.real.reaction.multiplier) }}</td></tr><tr><th>反应基础加值</th><td>{{ number(point.real.reaction.addedBaseDamage) }}</td></tr></template></tbody></table>
          <details><summary>配装属性与来源</summary><p v-if="actor?.build && skill">{{ skill.name }} · 天赋 {{ actor.build.talents[skill.category] }} + {{ talentLevelBonus(actor.build.character, skill.category, actor.build.constellation) }}</p><dl><template v-for="(value, key) in point.real.panel.stats" :key="key"><dt>{{ realStatLabel(key) }}</dt><dd>{{ number(value) }}</dd></template></dl><p v-for="entry in point.real.panel.contributions" :key="`${entry.source}:${entry.stat}:${entry.value}`">{{ entry.source }} · {{ realStatLabel(entry.stat) }} {{ number(entry.value) }}</p><p v-for="source in actor?.build?.character.damageCoverage?.filter(proof => proof.skillId === damage.skillId).flatMap(proof => proof.sources)" :key="source.path">{{ source.repository }} · {{ source.commit.slice(0, 7) }} · {{ source.path }}</p></details>
          </template>
          <ul v-if="result.diagnostics.length" aria-label="未完成的计算条件"><li v-for="(diagnostic, index) in result.diagnostics" :key="index">{{ diagnostic.message }}</li></ul>
        </template><p v-else>选择配装与命中条件后计算。</p></section>
      </div>
    </div>
    <WorkbenchDialog v-if="slot" :title="`选择${accountSlotLabels[slot]}`" @close="slot = undefined"><ArtifactBrowser inline pick density="relaxed" :slot="slot" @select="equip" /></WorkbenchDialog>
    <WorkbenchDialog v-if="contentReview" title="更新计算副本内容" @close="contentReview = undefined"><p>替换当前试配队员的内容定义，保留培养与装备选择。账号和原轴保留原记录，已有条件与效果引用继续校验。</p><ul v-if="contentReview.changes.length"><li v-for="change in contentReview.changes" :key="change">{{ change }}</li></ul><p v-else>当前定义已与内置内容一致。</p><button v-if="contentReview.changes.length" class="ui-action" data-accent="hydro" @click="applyContent">采用当前内容并重算</button></WorkbenchDialog>
    <UnsavedChangesDialog v-if="discardOpen" @continue="cancelDiscard" @discard="discardChanges" @save="saveAndLeave(save)" />
  </section>
</template>

<style scoped>
.damage-calculator { margin:24px 30px; font-size:var(--font-body); min-width:0; }
.calculator-heading,.calculator-actions,.calculator-source { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.calculator-heading { justify-content:space-between; margin-bottom:24px; }.calculator-heading h2 { font-size:var(--font-title); margin:0 0 8px; }
.calculator-layout { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(340px,1fr); gap:20px; align-items:start; }
.calculator-build,.calculator-conditions,.calculator-result { padding:20px; min-width:0; }.calculator-right { display:grid; gap:20px; min-width:0; }
h3 { font-size:var(--font-control); margin:0 0 20px; }.calculator-build > h3:not(:first-child),.calculator-result h3:not(:first-child) { margin-top:24px; }
.calculator-source { margin-bottom:20px; }.calculator-source select { flex:1; min-width:150px; }.calculator-build > button { margin:20px 0; }
.calculator-build { container-type:inline-size; }
@container(max-width:650px) {
  .calculator-build :deep(.cultivation-groups) { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .calculator-build :deep(.talent-group) { grid-column:1/-1; width:240px; padding-top:0; }
  .calculator-build :deep(.character-cultivation) { grid-column:1; grid-row:2; }
  .calculator-build :deep(.weapon-cultivation) { grid-column:2; grid-row:2; }
  .calculator-build :deep(.refinement-field) { grid-column:2; grid-row:3; }
  .calculator-build :deep(.constellation-row) { grid-column:1/-1; grid-row:4; }
}
.calculator-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-bottom:20px; }
label { display:grid; gap:8px; min-width:0; }select,input { width:100%; min-width:0; box-sizing:border-box; font-size:var(--font-body); height:var(--control-height-lg); }
fieldset { min-width:0; border:0; padding:0; margin:0; }details { margin:20px 0; }summary { cursor:pointer; margin-bottom:16px; }
output { display:block; font-size:var(--font-title); font-weight:700; margin:20px 0; color:var(--element-anemo-deep); }
table { width:100%; border-collapse:collapse; table-layout:fixed; }th,td { padding:12px 4px; border-bottom:1px solid var(--neutral-line); text-align:left; overflow-wrap:anywhere; font-size:var(--font-body); }th { width:42%; }
dl { display:grid; grid-template-columns:1fr 1fr; gap:8px; }dd { margin:0; text-align:right; }p,li { line-height:1.8; overflow-wrap:anywhere; }ul { padding-left:20px; }
@media(max-width:1250px) { .calculator-layout { grid-template-columns:minmax(0,1fr); } }
@media(max-width:700px) { .damage-calculator { margin:16px; }.calculator-fields { grid-template-columns:minmax(0,1fr); }.calculator-heading { align-items:flex-start; }.calculator-build,.calculator-conditions,.calculator-result { padding:16px; } }
</style>
