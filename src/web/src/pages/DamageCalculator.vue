<script setup lang="ts">
import BattleSceneSettings from '../components/BattleSceneSettings.vue';
import AuraObservationForm from '../components/AuraObservationForm.vue';
import TalentHealingForm from '../components/TalentHealingForm.vue';
import ReactionRecordForm from '../components/ReactionRecordForm.vue';
import { addAuraObservation, addReactionObservation, addParticlePickup, addTalentHeal } from '../domain/real-project';
import CombatChangeList from '../components/CombatChangeList.vue';
import { grantedDamageChanges } from '@leyline/engine';
import { definitionKey, matchingSceneHits, sceneHitInInterval, type SceneDefinition, type SceneHitRequest, type SceneSelection } from '@leyline/schema';
import { combatFactDeclaration } from '@leyline/schema/buffs';
import { ordinaryReactions } from '@leyline/schema/hit-bindings';
import { putHitFact, subjectFacts, findBuildHit, isTransformative, partyInfusionFact, talentInputMaximum } from '@leyline/schema';
import { APP_VERSION } from '@leyline/schema/version';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, shallowRef, toRaw, watch } from 'vue';
import { getReactionCalculationBundle, loadCatalog, type GameCatalog } from '@leyline/game-data';
import type { TransformativeFamily, ProjectReaction } from '@leyline/schema';
import { damageCalculatorSchema, projectSchema, type ValueType, elements, createTalentRankReader, type AxisResponse, type Build, type DamageCalculatorDocument, type DamageRequest } from '@leyline/schema';
import type { AccountCharacter } from '../domain/account';
import { addCalculatorSceneHit, calculatorRequest, calculatorSceneHits, calculatorWorkerRequest, copyProjectForCalculator, parseDamageCalculator, readCalculatorSource, prepareCalculatorContentUpdate } from '../domain/damage-calculator';
import { addActorFromBuild, addAttributeCapture, addTransformativeReaction, defaultEnemy } from '../domain/real-project';
import { createEmptyProject, nextRecordId } from '../domain/workbench-project';
import { teamArtifactEntries } from '../domain/team-members';
import { buildRollBasis } from '../domain/effective-roll-basis';
import { defaultEffectiveStats, equipmentConfigurationLabel } from '../domain/character-loadout-name';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import { applyCharacterDefinition, copyCharacterDefinition, parseCharacterDefinition } from '../domain/character-definition';
import { exportCharacterSnapshot } from '../domain/structured-character-import';
import { packDocument } from '../domain/content-document';
import { downloadJson, downloadJsonText } from '../domain/download';
import { realElementLabel, realStatLabel, recordLabel, actorLabel, damageFamilyLabel, sceneHitLabel } from '../domain/workbench-labels';
import { useAccountStore } from '../stores/account';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import CharacterConfigurationCard from '../components/CharacterConfigurationCard.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import CatalogBrowser from '../components/CatalogBrowser.vue';
import GameIcon from '../components/GameIcon.vue';
import TeamCard from '../components/TeamCard.vue';
import CalculatorDamagePicker from '../components/CalculatorDamagePicker.vue';
import CalculatorBuffPicker from '../components/CalculatorBuffPicker.vue';
import CalculatorFactorCards from '../components/CalculatorFactorCards.vue';
import { calculatorHitChoices, type CalculatorHitChoice } from '../domain/calculator-hits';
import { applyCalculatorBuffs, buffFactNames, calculatorBuffChoices, resolveBuffSelection } from '../domain/calculator-buffs';
import { calculatorHitElement, calculatorIntervals, calculatorOnFieldActor, calculatorHitFactFields, calculatorPartyInfusionOptions, type CalculatorFactField, selectionFacts, setCalculatorFact } from '../domain/calculator-conditions';
import { damageNumber as number, reactionNames, critNames } from '../domain/calculator-factors';
import type { SavedTeam } from '../stores/saved-teams';
import { loadSavedDamage, saveDamageSnapshot } from '../platform/saved-damage';
const SavedDamageList = defineAsyncComponent(() => import('../components/SavedDamageList.vue'));
const TeamLibrary = defineAsyncComponent(() => import('./TeamLibrary.vue'));
const CharacterSelectionDialog = defineAsyncComponent(() => import('../components/CharacterSelectionDialog.vue'));
const CalculatorBuildEditor = defineAsyncComponent(() => import('./CalculatorBuildEditor.vue'));

const account = useAccountStore(), axis = useAxisWorkspaceStore();
const document = shallowRef<DamageCalculatorDocument>();
const working = ref(false), error = ref('');
const file = ref<HTMLInputElement>(), source = ref('');
const savedSignature = ref('');
const listed = shallowRef<{ id: string; signature: string }>();
const savingDamage = ref(false);
const response = shallowRef<AxisResponse>();
const expectedResult = shallowRef<AxisResponse['result']>();
const picker = ref<'team' | 'character' | 'candidate' | 'damage' | 'buff' | 'list'>();
const catalog = shallowRef<GameCatalog>();
const characterSource = ref<'local' | 'showcase' | 'catalog'>('local');
const sourceChoices = computed(() => [
  { value: 'local', label: '本地' },
  ...(account.account.characters.some(entry => entry.showcase) ? [{ value: 'showcase', label: '展柜' }] : []),
  { value: 'catalog', label: '游戏目录' },
]);
const pendingTeam = shallowRef<Pick<SavedTeam,'id' | 'name' | 'project'>>();
const selectedTeam = computed(() => document.value?.team ?? pendingTeam.value);
const teamProject = computed(() => document.value?.team ? document.value.project : pendingTeam.value?.project);
const editor = shallowRef<{ name: string; character?: AccountCharacter; initialCharacterId?: string;
  equipment?: Pick<Build, 'artifacts' | 'sets'>; newSource?: string }>();
const editorDialog = ref<InstanceType<typeof CalculatorBuildEditor>>();
const contentReview = ref<Awaited<ReturnType<typeof prepareCalculatorContentUpdate>>>();
let reviewSignature = '';
const emptyDamage = (): DamageRequest => ({ hit: { definition: { group: 'characters', namespace: 'builtin', id: '', revision: '' }, hitId: '' }, crit: 'critical', reaction: 'none' });
const damage = ref<DamageRequest>(emptyDamage());
const enemy = ref(defaultEnemy());
const hitTime = ref(0), captureTime = ref<number | string>('');
const actor = computed(() => document.value?.project.candidate.actors.find(actor => actor.id === document.value!.actorId));
const hitOwner = computed(() => {
  const record = document.value?.project.timeline.find(record => record.id === document.value?.recordId);
  return record ? document.value?.project.candidate.actors.find(actor => actor.id === record.actor) : actor.value;
});
const character = computed<AccountCharacter | undefined>(() => actor.value?.build ? {
  id: actor.value.id, name: actor.value.build.character.identity.name, attack: 0, weapon: actor.value.build.weapon?.name ?? '', equipment: {}, build: actor.value.build,
} : undefined);
const queryCharacter = computed(() => hitOwner.value?.build?.character);
const skill = computed(() => findBuildHit(hitOwner.value?.build, damage.value.hit)?.talent);
const talentBonusLabel = computed(() => {
  const build = hitOwner.value?.build, category = skill.value?.category;
  if (!document.value || !build || !category) return '';
  const rank = createTalentRankReader(document.value.project.candidate.actors)(build, category);
  const base = build.talents[category];
  return rank.upperLevel === undefined ? String(rank.level - base) : `${rank.level - base}–${rank.upperLevel - base}（队伍元素待定）`;
});
const selectedBinding = computed(() => findBuildHit(hitOwner.value?.build, damage.value.hit));
const selectedHit = computed(() => selectedBinding.value?.hit);
const hitInputs = computed(() => (skill.value?.inputs ?? []).filter(input => input.usage !== 'healing'));
const selectedOutput = computed(() => Object.values(selectedHit.value?.damage ?? {})[0]);
const hitFacts = computed(() => selectedBinding.value ? selectionFacts(selectedOutput.value?.predicate, selectedBinding.value.entity.calculation.bundle) : []);
const hitChoices = computed(() => queryCharacter.value ? calculatorHitChoices(queryCharacter.value, hitOwner.value?.build) : []);
const selectedChoice = computed(() => hitChoices.value.find(choice => choice.ref.definition.group === damage.value.hit.definition.group
  && choice.ref.definition.namespace === damage.value.hit.definition.namespace
  && choice.ref.definition.id === damage.value.hit.definition.id && choice.ref.definition.revision === damage.value.hit.definition.revision && choice.hitId === damage.value.hit.hitId));
const standalone = computed(() => !damage.value.hit.hitId ? document.value?.project.timeline.find(r=>r.id===document.value?.recordId)?.reactionEvent : undefined);
const sceneHit = computed(() => !damage.value.hit.hitId ? document.value?.project.timeline.find(record => record.id === document.value?.recordId)?.sceneHit : undefined);
const sceneChoices = computed(() => calculatorSceneHits(document.value?.project));
const sceneDefinition = computed(() => sceneHit.value && matchingSceneHits(document.value?.project.sceneEffects, sceneHit.value.scene)[0]?.definition);
const sceneHitDefinition = computed(() => sceneDefinition.value?.hits?.[0]);
const sceneBaseOnly = computed(() => sceneHitDefinition.value && 'settlement' in sceneHitDefinition.value);
const transformative = computed(() => !!standalone.value && isTransformative(standalone.value.family));
const selectedLabel = computed(() => sceneHit.value ? sceneHitLabel(sceneDefinition.value) : standalone.value ? damageFamilyLabel(standalone.value.family)+' · '+realElementLabel(standalone.value.element) :
  selectedChoice.value ? selectedChoice.value.alias+'　'+selectedChoice.value.name : '');
const intervals = computed(() => document.value && hitOwner.value
  ? calculatorIntervals(document.value.project, hitOwner.value.id, Math.round(hitTime.value * 1000), document.value.recordId) : {});
const buffs = computed(() => document.value && hitOwner.value ? calculatorBuffChoices(document.value.project, hitOwner.value.id, damage.value,
  Math.round(hitTime.value * 1000), document.value.recordId, intervals.value) : []);
const includedBuffs = computed(() => buffs.value.filter(buff => buff.checked));
const factFields = computed(() => {
  const hit = selectedHit.value;
  const owner = hitOwner.value?.id;
  if (!owner) return [];
  const fields = new Map<string, CalculatorFactField & { label: string }>();
  const partyFields: CalculatorFactField[] = hit?.coordinated ? (document.value?.project.candidate.actors ?? []).map(member => ({
    key: 'onField', type: { kind: 'boolean' }, subject: { kind: 'actor', id: member.id },
  })) : [];
  const dealer = hit?.coordinated && document.value ? calculatorOnFieldActor(document.value.project, damage.value, Math.round(hitTime.value * 1000), document.value.recordId) : hitOwner.value;
  const dealerBuild = dealer?.build;
  const changes = dealerBuild ? grantedDamageChanges(dealerBuild).filter(({ rule }) => !rule.categories || hit?.category && rule.categories.includes(hit.category)) : [];
  if (changes.length) {
    const keys = ['targetsDamaged', 'triggerRoll', ...changes.some(({ rule }) => rule.critical) ? ['criticalTargets'] : []];
    for (const key of keys) partyFields.push({ key, type: combatFactDeclaration(undefined, key)!.type, subject: { kind: 'event' } });
  }
  for (const field of [...partyFields, ...calculatorHitFactFields(selectedBinding.value, owner, dealer?.id, hitOwner.value?.build?.constellation), ...buffs.value.flatMap(buff => buff.fields)]) {
    const subject = field.subject;
    if (!subject || subject.kind === 'actor' && subject.id === owner && ['hpRatio', 'shielded', 'onField'].includes(field.key)
      || subject.kind === 'event' && (hitInputs.value.some(input => input.id === field.key) || ['critMode', 'reactionMode'].includes(field.key))) continue;
    const name = subject.kind === 'actor' ? document.value?.project.candidate.actors.find(actor => actor.id === subject.id)?.build?.character.identity.name
      : subject.kind === 'team' ? '队伍' : subject.kind === 'target' ? '目标' : '本击';
    const label = field.label ?? selectedBinding.value?.entity.metadata.facts?.[field.key]?.label ?? buffFactNames[field.key] ?? field.key;
    fields.set(JSON.stringify([subject, field.key]), { ...field, label: [name, label].filter(Boolean).join(' · ') });
  }
  return [...fields.values()];
});
const metadataFile = ref<HTMLInputElement>();
function updateScenes(scenes: SceneSelection[]) {
  if (!document.value || document.value.baseline) return;
  invalidate();
  document.value = { ...document.value, project: { ...document.value.project, sceneEffects: scenes } };
  if (document.value.recordId) void calculate();
}
function updateSceneHit(patch: Partial<Pick<SceneHitRequest, 'elementLevelCo' | 'triggered' | 'targetHit'>>) {
  const current = document.value;
  if (!current || current.baseline || !sceneHit.value) return;
  const timeline = current.project.timeline.map(record => record.id === current.recordId && record.sceneHit
    ? { ...record, sceneHit: { ...record.sceneHit, ...patch } } : record);
  document.value = { ...current, project: { ...current.project, timeline } };
}
const sceneTriggered = computed({ get: () => sceneHit.value?.triggered ?? null, set: triggered => updateSceneHit({ triggered }) });
const sceneTargetHit = computed({ get: () => sceneHit.value?.targetHit ?? null, set: targetHit => updateSceneHit({ targetHit }) });
function setSceneCoefficient(event: Event) {
  const input = event.target as HTMLInputElement;
  updateSceneHit({ elementLevelCo: input.value === '' ? null : input.valueAsNumber });
}
function exportMetadata() {
  if (!actor.value?.build) return;
  try {
    const file = copyCharacterDefinition(actor.value.build.character, actor.value.build.dataVersion);
    downloadJsonText(exportCharacterSnapshot(file), file.identity.name + '.character.json');
  }
  catch (cause) { showError(cause); }
}
async function importMetadata(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
  if (!file || !document.value || !actor.value?.build || document.value.baseline) return;
  error.value = '';
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('角色定义超过8 MiB。');
    const before = signature(), selected = actor.value.build.character, actorId = actor.value.id;
    const definition = parseCharacterDefinition(await file.text(), [selected]);
    if (before !== signature()) throw new Error('计算副本已变化，请重新导入。');
    const current = prepareDocument()!;
    const next = { ...current, project: applyCharacterDefinition(current.project, actorId, definition) };
    calculatorRequest(next, 0);
    install(next);
    if (next.recordId) await calculate();
  } catch (cause) { showError(cause); }
}
const result = computed(() => response.value?.comparison?.candidates[0]?.result ?? response.value?.result);
const point = computed(() => result.value?.points.find(point => point.id === document.value?.recordId));
const expectedPoint = computed(() => expectedResult.value?.points.find(point => point.id === document.value?.recordId));
const baselinePoint = computed(() => response.value?.comparison?.baseline.points.find(point => point.id === document.value?.recordId));
const comparisonPoint = computed(() => response.value?.comparison?.candidates[0]?.points.find(point => point.id === document.value?.recordId));

const inputNames: Record<string, string> = { counterCharge: '反击档位', namisen: '浪闪层数', resolve: '施放时消耗的愿力', lightfallEnergy: '光降之剑能量层数' };
const factLabels: Record<string, string> = { ...buffFactNames, ...inputNames, critMode: '暴击', reactionMode: '反应' };
function diagnosticText(message: string) {
  const prefix = '计算事实尚未明确：';
  if (!message.startsWith(prefix)) return message;
  const key = message.slice(prefix.length);
  return '需填写' + (factLabels[key] ?? key);
}
const missingBuff = computed(() => [point.value, expectedPoint.value].some(point => point?.real?.structured?.requiredInputs.some(input =>
  input.requiredBy.length && (factFields.value.some(field => field.key === input.key) || ['onField', 'shielded', 'hpRatio'].includes(input.key)))));
const diagnostics = computed(() => {
  const recordPath = document.value?.recordId && 'timeline.' + document.value.recordId;
  const all = [...(result.value?.diagnostics ?? []), ...(expectedResult.value?.diagnostics ?? [])];
  return [...new Set(all.filter(({ path }) => !recordPath || !path.startsWith('timeline.') || path === recordPath || path.startsWith(recordPath + '.'))
    .map(diagnostic => diagnosticText(diagnostic.message)))];
});
function unavailable(assessment: AxisResponse['result'] | undefined, record: typeof point.value) {
  if (record?.real?.status === 'invalid' || assessment?.status === 'invalid') return '输入需修正';
  if (record?.real?.issues.some(issue => issue.code === 'unknown')) return '需补充条件';
  if (record?.real?.issues.some(issue => issue.code === 'unsupported')) return '机制尚未支持';
  return '需补充条件';
}
const reactionType = computed({ get: () => damage.value.reaction === null ? '' : damage.value.reaction === 'none' ? 'none' : damage.value.reaction.type,
  set: (value: string) => { damage.value.reaction = !value ? null : value === 'none' ? 'none' : { type: value as 'melt' | 'vaporize' | 'aggravate' | 'spread', trigger: 'record-owner' }; } });
const infusionChoices = computed(() => {
  if (!document.value || !selectedBinding.value || !hitOwner.value) return [];
  return [...calculatorPartyInfusionOptions(document.value.project, damage.value, selectedBinding.value,
    hitOwner.value.id, Math.round(hitTime.value * 1000), document.value.recordId)];
});
const partyInfusion = computed({
  get: () => {
    const source = document.value?.project.timeline.find(record => record.id === document.value?.recordId);
    const value = (subjectFacts(damage.value.facts, { kind: 'event' })?.[partyInfusionFact] ?? source?.facts?.[partyInfusionFact])?.value;
    return value?.kind === 'enum' && infusionChoices.value.some(([element]) => element === value.value) ? value.value : 'none';
  },
  set: (value: string) => {
    putHitFact(damage.value.facts ??= [], { kind: 'event' }, partyInfusionFact, { kind: 'enum', value });
    if (reactionType.value && !reactionChoices.value.some(choice => choice === reactionType.value)) damage.value.reaction = 'none';
  },
});
const hitElement = computed(() => {
  const selected = selectedBinding.value;
  if (!selected || !document.value || !hitOwner.value) return selected?.hit.element;
  const { project, recordId } = document.value;
  const timeMs = Math.round(hitTime.value * 1000);
  if (selected.hit.coordinated) {
    const dealer = calculatorOnFieldActor(project, damage.value, timeMs, recordId);
    return dealer?.build?.character.identity.element ?? dealer?.element;
  }
  return calculatorHitElement(project, damage.value, selected, hitOwner.value.id, timeMs, recordId);
});
const reactionChoices = computed(() => ['none' as const, ...selectedHit.value?.reactions === false ? [] : ordinaryReactions(hitElement.value)]);
const records = computed(() => document.value?.project.timeline.filter(record => record.kind === 'damage' && (record.damage || record.reactionEvent || record.sceneHit)) ?? []);
const captures = computed(() => document.value?.project.timeline.filter(record => record.actor === hitOwner.value?.id
  && (record.kind === 'damage' ? findBuildHit(hitOwner.value?.build, record.damage?.hit)?.talent?.id : record.skillId) === selectedHit.value?.snapshot?.sourceSkillId) ?? []);
const captureRecord = computed(() => captures.value.find(record => record.kind === 'capture' && record.id === damage.value.capture?.recordId));
type CaptureRecord = DamageCalculatorDocument['project']['timeline'][number];
type CaptureField = CalculatorFactField & { subject: NonNullable<CalculatorFactField['subject']> };
function fieldsAtCapture(record: CaptureRecord, attributes?: Set<string>) {
  if (!document.value) return [];
  const choices = calculatorBuffChoices(document.value.project, record.actor, emptyDamage(), record.timeMs, record.id);
  const fields = new Map<string, CaptureField>();
  for (const buff of choices) for (const field of buff.fields) {
    if (!field.subject || field.subject.kind === 'event') continue;
    if (attributes && !buff.modifiers.some(modifier => attributes.has(modifier.target))) continue;
    fields.set(JSON.stringify([field.subject, field.key]), { ...field, subject: field.subject });
  }
  return [...fields.values()];
}
const captureGroups = computed(() => {
  const project = document.value?.project;
  if (!project) return [];
  const current = captureRecord.value;
  const groups = current ? [{ record: current, title: '捕获时的增益条件', fields: fieldsAtCapture(current) }] : [];
  const statsAtCast = new Map<string, Set<string>>();
  for (const { capturedStats } of buffs.value) {
    if (!capturedStats) continue;
    const attributes = statsAtCast.get(capturedStats.recordId) ?? new Set<string>();
    for (const attribute of capturedStats.attributes) {
      attributes.add(attribute);
      if (attribute === 'attribute.attack') { attributes.add('attribute.flatAttack'); attributes.add('attribute.attackPercent'); }
    }
    statsAtCast.set(capturedStats.recordId, attributes);
  }
  for (const [id, attributes] of statsAtCast) {
    const record = project.timeline.find(entry => entry.id === id);
    if (!record || record.id === current?.id) continue;
    const fields = fieldsAtCapture(record, attributes);
    if (fields.length) groups.push({ record, title: actorLabel(project, record.actor) + ' · ' + recordLabel(project, record.id) + '施放时的增益条件', fields });
  }
  return groups;
});
function captureFieldLabel(field: CaptureField) {
  const label = field.label ?? buffFactNames[field.key] ?? inputNames[field.key] ?? field.key;
  const subject = field.subject;
  const name = subject.kind === 'actor' && document.value ? actorLabel(document.value.project, subject.id) : subject.kind === 'team' ? '队伍' : '目标';
  return name + ' · ' + label;
}
function editCaptureFact(record: CaptureRecord, field: CaptureField, event: Event) {
  const current = document.value;
  if (!current) return;
  const input = (event.target as HTMLInputElement).value;
  const type = field.type;
  const value = input === '' ? null : type.kind === 'quantity' ? { ...type, value: Number(input) }
    : type.kind === 'boolean' ? { kind: 'boolean' as const, value: input === 'true' } : { kind: 'enum' as const, value: input };
  if (value?.kind === 'quantity' && (!Number.isFinite(value.value) || value.unit === 'count' && (!Number.isSafeInteger(value.value) || value.value < 0))) return;
  const facts = structuredClone(toRaw(record.captureFacts ?? []));
  putHitFact(facts, field.subject, field.key, value);
  const timeline = current.project.timeline.map(row => row.id === record.id ? { ...row, captureFacts: facts } : row);
  document.value = { ...current, project: { ...current.project, timeline } };
  void calculate();
}
const loadouts = useCharacterLoadoutsStore();
const entries = computed(() => teamArtifactEntries(actor.value?.build, account.account));
const basis = computed(() => buildRollBasis(actor.value?.build));
function effectiveStats(name: string) {
  const entry = account.account.characters.find(character => character.name === name);
  return entry ? loadouts.effectiveStats(account.account.id, entry.id, name) : defaultEffectiveStats(name);
}
const configurationName = computed(() => {
  const build = actor.value?.build;
  return build && equipmentConfigurationLabel(entries.value.flatMap(entry => entry.item ?? []), effectiveStats(build.character.identity.name), build.sets, basis.value, build.weapon?.name ?? '未配武器');
});
const documentSignature = computed(() => JSON.stringify(document.value ?? null));
const signature = () => documentSignature.value + '\n' + JSON.stringify([damage.value, enemy.value, hitTime.value]);
const dirty = computed(() => !!document.value && signature() !== savedSignature.value);
const { discardOpen, requestLeave, cancelDiscard, discardChanges, saveAndLeave } = useUnsavedChanges(dirty);
let activeWorker: Worker | undefined, taskId = 0, sourceRead = 0;
let calculationFinished: Promise<void> | undefined, finishCalculation: (() => void) | undefined;
function stop() {
  activeWorker?.terminate(); activeWorker = undefined; working.value = false;
  finishCalculation?.(); finishCalculation = undefined; calculationFinished = undefined;
}
function invalidate() { stop(); response.value = undefined; expectedResult.value = undefined; }
watch(document, invalidate, { flush: 'sync' });
watch([damage, enemy, hitTime], invalidate, { deep: true, flush: 'sync' });
onBeforeUnmount(stop);
function install(next: DamageCalculatorDocument, saved = false) {
  sourceRead++;
  listed.value = undefined;
  invalidate(); pendingTeam.value = undefined; contentReview.value = undefined; document.value = damageCalculatorSchema.parse(next);
  const record = next.project.timeline.find(record => record.id === next.recordId);
  damage.value = record?.damage ? JSON.parse(JSON.stringify(record.damage)) : emptyDamage();
  if (record?.reactionEvent) {
    const reaction = structuredClone(toRaw(record.reactionEvent));
    damage.value = { ...damage.value, crit: isTransformative(reaction.family) ? reaction.contributors[0].crit : null,
      facts: reaction.facts, effectApplications: reaction.effectApplications };
  }
  hitTime.value = (record?.timeMs ?? 0) / 1000; captureTime.value = '';
  enemy.value = next.project.enemy ? JSON.parse(JSON.stringify(next.project.enemy)) : defaultEnemy();
  error.value = ''; source.value = '';
  savedSignature.value = saved ? signature() : '';
}
function clearCalculation() {
  sourceRead++;
  listed.value = undefined;
  invalidate(); pendingTeam.value = undefined; contentReview.value = undefined; document.value = undefined;
  damage.value = emptyDamage(); enemy.value = defaultEnemy(); hitTime.value = 0; captureTime.value = '';
  editor.value = undefined; error.value = ''; source.value = '';
}
function newCalculation() { requestLeave(clearCalculation); }
function copyAxis() { requestLeave(() => { try { const copy = copyProjectForCalculator(axis.project); install(copy); if (copy.recordId) void calculate(); } catch (cause) { showError(cause); } }); }
function showError(cause: unknown) { error.value = cause instanceof Error ? cause.message : '计算未完成。'; }
async function openCharacters() {
  characterSource.value = !account.account.characters.length ? 'catalog' : source.value.startsWith('showcase:') ? 'showcase' : 'local';
  picker.value = 'character';
  try { catalog.value ??= await loadCatalog(); } catch (cause) { showError(cause); }
}
const roleName = computed(() => queryCharacter.value?.identity.name);
function chooseTeam(team?: SavedTeam) {
  picker.value = undefined;
  if (team?.id === selectedTeam.value?.id) return;
  const role = queryCharacter.value?.id;
  requestLeave(() => {
    clearCalculation();
    if (!team) return;
    const project = projectSchema.parse(toRaw(team.project));
    const member = project.candidate.actors.find(member => member.build && member.build.character.id === role);
    const identity = { id: team.id, name: team.name };
    if (member) install({ schemaVersion: APP_VERSION, kind: 'damage-calculator', team: identity, project, actorId: member.id });
    else pendingTeam.value = { ...identity, project };
  });
}
function chooseCharacter(id: string) {
  const team = selectedTeam.value, roster = teamProject.value;
  picker.value = undefined;
  if (team && roster) {
    const member = roster.candidate.actors.find(member => member.id === id);
    if (!member?.build) { error.value = '该队员缺少计算配装。'; return; }
    if (actor.value?.id === id) return;
    try {
      const current = document.value ? prepareDocument() : undefined;
      if (document.value && !current) return;
      const project = current?.project ?? roster;
      const record = project.timeline.find(entry => entry.actor === id && entry.damage);
      install({ schemaVersion: APP_VERSION, kind: 'damage-calculator', team: { id: team.id, name: team.name }, project, actorId: id, recordId: record?.id });
      if (record) void calculate();
    } catch (cause) { showError(cause); }
    return;
  }
  if (characterSource.value === 'catalog') {
    requestLeave(() => { editor.value = { initialCharacterId: id, name: catalog.value?.characters.find(item => item.id === id)?.name ?? id, newSource: 'catalog:' + id }; });
  } else {
    const kind = characterSource.value;
    requestLeave(() => { void loadSource(kind, id); });
  }
}
function selectDamage(choice: CalculatorHitChoice) {
  if (!choice.available) return;
  picker.value = undefined;
  if (JSON.stringify(damage.value.hit) === JSON.stringify(choice.ref) && selectedChoice.value) {
    if (!result.value && !working.value) void calculate();
    return;
  }
  const previousInputs = hitInputs.value;
  const previousSkill = skill.value?.id, previousReaction = reactionType.value;
  if (sceneHit.value) damage.value = emptyDamage();
  damage.value = { ...damage.value, hit: choice.ref };
  delete damage.value.hitOrdinal;
  if (selectedHit.value?.critical === 'always') damage.value.crit = 'critical';
  const priorFacts = subjectFacts(damage.value.facts, { kind: 'event' });
  if (previousSkill !== choice.skillId && priorFacts) for (const input of previousInputs) delete priorFacts[input.id];
  delete damage.value.capture;
  if (hitOwner.value) for (const setting of hitFacts.value) setCalculatorFact(damage.value, setting, hitOwner.value.id);
  if (previousReaction && !reactionChoices.value.some(kind => kind === previousReaction)) damage.value.reaction = 'none';
  if (damage.value.effectApplications?.length) {
    const applicable = new Set(buffs.value.filter(option => option.explicit && !option.triggerSkill && !option.confirmTrigger).map(option => option.id));
    damage.value.effectApplications = damage.value.effectApplications.filter(entry => applicable.has(entry.instanceId));
  }
  if (!previousSkill || previousSkill !== choice.skillId) {
    for (const input of hitInputs.value) putHitFact(damage.value.facts ??= [], { kind: 'event' }, input.id, { ...input.type, value: input.min });
  }
  if (hitOwner.value) {
    const draft: DamageRequest = JSON.parse(JSON.stringify(damage.value));
    const changes = resolveBuffSelection(buffs.value, draft, intervals.value, hitOwner.value.id, new Map());
    applyBuffs(changes, draft);
  } else void calculate();
}
function selectSceneHit(definition: SceneDefinition) {
  const current = document.value, owner = hitOwner.value?.id;
  if (!current || !owner || current.baseline) return;
  picker.value = undefined;
  if (sceneHit.value && definitionKey(sceneHit.value.scene) === definitionKey(definition)) {
    if (!result.value && !working.value) void calculate();
    return;
  }
  try {
    const scene = { namespace: 'builtin' as const, id: definition.id, revision: definition.revision };
    const next = prepareDocument()!;
    const matching = matchingSceneHits(next.project.sceneEffects, scene);
    const currentTime = Math.round(hitTime.value * 1000), delay = definition.hits?.[0]?.delayMs ?? 0;
    const earliest = matching.find(entry => entry.startMs + delay < entry.endMs);
    const timeMs = earliest && !matching.some(entry => sceneHitInInterval(entry, currentTime)) ? earliest.startMs + delay : currentTime;
    next.recordId = addCalculatorSceneHit(next.project, owner, scene, timeMs, next.recordId);
    install(next);
    void calculate();
  } catch (cause) { showError(cause); }
}
async function selectReaction(family:TransformativeFamily,element:ProjectReaction['element']) {
  const current=document.value, owner=hitOwner.value?.id;
  if (!current || !owner || current.baseline) return;
  try {
    const before=signature(), rules=current.project.reactionRules ?? await getReactionCalculationBundle();
    if (before!==signature()) return;
    const next=prepareDocument()!;
    next.recordId=addTransformativeReaction(next.project,owner,family,element,Math.round(hitTime.value*1000),rules,next.recordId);
    install(next); picker.value=undefined;
    await calculate();
  } catch(cause) { showError(cause); }
}
function applyBuffs(changes: Map<string,boolean>, draft: DamageRequest, durations?: Map<string,number[]>) {
  if (!document.value || document.value.baseline) return;
  try {
    const next = applyCalculatorBuffs(document.value.project, draft, buffs.value, changes, Math.round(hitTime.value * 1000), document.value.recordId, durations);
    if (next.project !== document.value.project) document.value = { ...document.value, project: next.project };
    damage.value = { ...draft, effectApplications: next.applications };
    picker.value = undefined;
    if (selectedLabel.value) void calculate();
  } catch (cause) { showError(cause); }
}
async function loadSource(kind: 'local' | 'showcase', id: string) {
  const read = ++sourceRead;
  const owner = account.account;
  const entry = owner.characters.find(character => character.id === id);
  if (!entry) return;
  try {
    const next = await readCalculatorSource(owner, id, kind);
    if (read !== sourceRead) return;
    if (owner !== account.account) throw new Error('账号已切换，请重新选择。');
    if (!next.character.build) {
      editor.value = { ...next, name: next.character.name, newSource: kind + ':' + id }; return;
    }
    const project = createEmptyProject();
    const actorId = addActorFromBuild(project, next.character.build);
    install({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId });
    source.value = kind + ':' + id;
  } catch (cause) { if (read === sourceRead) showError(cause); }
}
function applyBuild(build: Build) {
  if (editor.value?.newSource) {
    const project = createEmptyProject();
    const actorId = addActorFromBuild(project, build);
    install({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId });
    source.value = editor.value.newSource;
    return;
  }
  const current = document.value;
  if (!current) return;
  const { project } = current;
  const actors = project.candidate.actors.map(member => member.id === current.actorId ? { ...member, build } : member);
  document.value = { ...current, project: { ...project, candidate: { ...project.candidate, actors } } };
  if (selectedLabel.value) void calculate();
}
function recordBeforeHit(add:(project:DamageCalculatorDocument['project'],timeMs:number)=>string) {
  if (!document.value || document.value.baseline) return;
  try {
    const next=prepareDocument()!;
    const id=add(next.project,Math.round(hitTime.value*1000));
    const query=next.project.timeline.find(r=>r.id===next.recordId),source=next.project.timeline.find(r=>r.id===id)!;
    if (query) {
      const order=query.order;
      for (const record of next.project.timeline) if (record!==source && record.timeMs===source.timeMs && record.order>=order) record.order++;
      source.order=order;
    }
    install(next);
    void calculate();
  } catch (cause) { showError(cause); }
}
function prepareDocument() {
  const current = document.value;
  if (!current) return undefined;
  if (current.baseline) return damageCalculatorSchema.parse(current);
  const timeline = [...current.project.timeline];
  const next = { ...current, project: { ...current.project, enemy: enemy.value, timeline } };
  const timeMs = Math.round(hitTime.value * 1000);
  if (!Number.isFinite(hitTime.value) || timeMs < 0 || timeMs > 3600000) throw new Error('请填写0至3600秒内的命中时刻。');
  if (damage.value.hit.hitId) {
    const index = timeline.findIndex(record => record.id === next.recordId);
    if (index >= 0) timeline[index] = { ...timeline[index], reactionEvent:undefined, sceneHit:undefined, timeMs, damage: damage.value };
    else {
      next.recordId = nextRecordId(next.project);
      timeline.push({ id: next.recordId, actor: next.actorId, kind: 'damage', definition: `${next.actorId}-real-damage`,
        timeMs, order: Math.max(-1, ...timeline.map(record => record.order)) + 1, damage: damage.value });
    }
  } else if (standalone.value) {
    const i=timeline.findIndex(r=>r.id===next.recordId);
    const reaction = standalone.value;
    if (i>=0) timeline[i]={...timeline[i],timeMs,reactionEvent:{...reaction, facts:damage.value.facts, effectApplications:damage.value.effectApplications,
      contributors: transformative.value ? reaction.contributors.map(owner => ({ ...owner, crit:damage.value.crit })) : reaction.contributors }};
  } else if (sceneHit.value) {
    const index = timeline.findIndex(record => record.id === next.recordId);
    if (index >= 0) timeline[index] = { ...timeline[index], timeMs };
  }
  return damageCalculatorSchema.parse(next);
}
async function createCapture() {
  error.value = '';
  try {
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
    const next = prepareDocument();
    if (!next) return;
    if (!next.recordId) throw new Error('请选择伤害。');
    if (JSON.stringify(next) !== documentSignature.value) document.value = next;
    const request = calculatorWorkerRequest(next, ++taskId);
    stop(); working.value = true;
    const worker = new Worker(new URL('../workers/axis.worker.ts', import.meta.url), { type: 'module' });
    activeWorker = worker;
    calculationFinished = new Promise<void>(resolve => { finishCalculation = resolve; });
    const recordId = next.recordId;
    const expectedTask = ++taskId;
    worker.onmessage = (event: MessageEvent<AxisResponse>) => {
      if (activeWorker !== worker) return;
      if (event.data.taskId === expectedTask) {
        expectedResult.value = event.data.result;
        if (event.data.error) error.value = event.data.error;
        stop(); return;
      }
      if (event.data.taskId !== request.taskId) return;
      response.value = event.data;
      if (event.data.error) { error.value = event.data.error; stop(); return; }
      if (sceneHit.value || standalone.value && !transformative.value || damage.value.crit === 'expected' || selectedHit.value?.critical === 'always') { expectedResult.value = result.value; stop(); return; }
      try {
        const evaluated = request.candidates ? calculatorWorkerRequest({ ...next, baseline: undefined }, expectedTask).project : request.project;
        const timeline = evaluated.timeline.map(record => {
          if (record.id !== recordId) return record;
          if (record.damage) return { ...record, damage: { ...record.damage, crit: 'expected' as const } };
          const reaction = record.reactionEvent;
          return reaction && isTransformative(reaction.family) ? { ...record, reactionEvent: { ...reaction,
            contributors: reaction.contributors.map(owner => ({ ...owner, crit: 'expected' as const })) } } : record;
        });
        worker.postMessage({ taskId: expectedTask, session: 1, revision: expectedTask, project: { ...evaluated, timeline } });
      } catch (cause) { stop(); showError(cause); }
    };
    worker.onmessageerror = worker.onerror = () => { if (activeWorker === worker) { stop(); error.value = '计算进程未完成，请重新计算。'; } };
    worker.postMessage(request);
    await calculationFinished;
  } catch (cause) { stop(); showError(cause); }
}
async function reviewContent() {
  error.value = '';
  try {
    const next = prepareDocument();
    if (!next) return;
    reviewSignature = signature();
    const review = await prepareCalculatorContentUpdate(next);
    if (reviewSignature !== signature()) throw new Error('计算设定已变化，请重新检查当前内容。');
    contentReview.value = review;
  } catch (cause) { showError(cause); }
}
async function applyContent() {
  if (!contentReview.value) return;
  if (reviewSignature !== signature()) { contentReview.value = undefined; error.value = '计算设定已变化，请重新检查当前内容。'; return; }
  install(contentReview.value.document);
  await nextTick();
  if (document.value?.recordId) await calculate();
}
async function pinBaseline() {
  if (!document.value?.recordId || point.value?.value == null) return;
  document.value = { ...document.value, baseline: projectSchema.parse(document.value.project) };
  await calculate();
}
function endComparison() {
  if (!document.value) return;
  document.value = { ...document.value, baseline: undefined };
  if (document.value.recordId) void calculate();
}
async function save() {
  error.value = '';
  try { const next = prepareDocument(); if (!next) return false; calculatorRequest(next, 0); if (JSON.stringify(document.value) !== JSON.stringify(next)) document.value = next; downloadJson(packDocument('damage-calculator', next), '伤害计算.json'); savedSignature.value = signature(); return true; }
  catch (cause) { showError(cause); return false; }
}
async function saveDamage() {
  if (!document.value || !selectedLabel.value || savingDamage.value) return false;
  savingDamage.value = true;
  error.value = '';
  try {
    const next = prepareDocument()!;
    if (JSON.stringify(next) !== documentSignature.value) document.value = next;
    const before = signature();
    if (before === listed.value?.signature) return true;
    if (calculationFinished) await calculationFinished;
    else if (!result.value) await calculate();
    if (signature() !== before || !result.value) return false;
    const value = point.value?.value ?? undefined;
    const id = await saveDamageSnapshot({
      name: sceneHit.value ? selectedLabel.value : [roleName.value,...(standalone.value ? [selectedLabel.value] : [selectedChoice.value!.alias,selectedChoice.value!.name])].join(' / '),
      team: next.team?.name, value, verification: point.value?.real?.status === 'partial' ? 'pending' : undefined,
    }, next);
    if (signature() !== before) return false;
    listed.value = { id, signature: before };
    savedSignature.value = before;
    return true;
  } catch (cause) {
    error.value = cause instanceof DOMException && cause.name === 'QuotaExceededError' ? '本机存储空间不足，可导出计算文件。' : '伤害未能保存。' + (cause instanceof Error ? cause.message : '');
    return false;
  } finally { savingDamage.value = false; }
}
function reopenDamage(id: string) {
  picker.value = undefined;
  requestLeave(async () => {
    const read = ++sourceRead, before = signature();
    try {
      const next = await loadSavedDamage(id);
      if (read !== sourceRead || signature() !== before) return;
      install(next, true);
      if (next.recordId) void calculate();
      savedSignature.value = signature();
      listed.value = { id, signature: savedSignature.value };
    } catch (cause) { if (read === sourceRead) showError(cause); }
  });
}
async function openFile(event: Event) {
  const input = event.target as HTMLInputElement, selected = input.files?.[0]; input.value = '';
  if (!selected) return;
  try { if (selected.size > 8 * 1024 * 1024) throw new Error('计算文件超过8 MiB。'); install(parseDamageCalculator(await selected.text()), true); if (document.value?.recordId) void calculate(); savedSignature.value = signature(); }
  catch (cause) { showError(cause); }
}
function switchActor(id: string) {
  picker.value = undefined;
  if (document.value && id !== document.value.actorId) document.value = { ...document.value, actorId: id };
}
async function selectRecord(id: string) {
  if (!document.value) return;
  try {
    const next = prepareDocument()!;
    const record = next.project.timeline.find(record => record.id === id);
    if (!record?.damage && !record?.reactionEvent && !record?.sceneHit) return;
    next.recordId = id; next.actorId = record.actor; install(next);
    await calculate();
  } catch (cause) { showError(cause); }
}
function setInput(id: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value, input = hitInputs.value.find(input => input.id === id);
  if (input) putHitFact(damage.value.facts ??= [], { kind: 'event' }, id, raw.trim() ? { ...input.type, value: Number(raw) } : null);
}
function setHitOrdinal(event: Event) {
  const control = event.target as HTMLSelectElement;
  if (control.value) damage.value.hitOrdinal = Number(control.value);
  else delete damage.value.hitOrdinal;
}
function setCapture(event: Event) { damage.value.capture = { recordId: (event.target as HTMLSelectElement).value || null, phase: damage.value.capture?.phase ?? null }; }
function leaveCalculator(action: () => void) {
  if (editorDialog.value) editorDialog.value.requestLeave(() => { editor.value = undefined; requestLeave(action); });
  else requestLeave(action);
}
defineExpose({ requestLeave: leaveCalculator });
</script>

<template>
  <section class="damage-calculator panel library-page" aria-label="伤害计算">
    <LibraryCornerOrnaments />
    <header class="library-page-toolbar damage-toolbar">
      <button type="button" class="ui-action soft" data-accent="hydro" aria-haspopup="dialog" @click="picker = 'list'">伤害列表</button>
      <button type="button" class="ui-action" data-accent="anemo" :disabled="!selectedLabel || savingDamage || listed?.signature === signature()" @click="saveDamage">保存伤害</button>
    </header>
    <div class="calculator-selections" aria-label="计算选择">
      <TeamCard v-if="selectedTeam && teamProject" class="calculator-team" action="replace" :name="selectedTeam.name" :members="teamProject.candidate.actors"
        aria-label="选择队伍" aria-haspopup="dialog" :disabled="!!document?.baseline" @click="picker = 'team'" />
      <button v-else type="button" class="selection-tile primary-slot" data-card-action="select" aria-haspopup="dialog" :disabled="!!document?.baseline" @click="picker = 'team'">
        <span class="add-mark" aria-hidden="true">+</span><strong>选择队伍</strong>
      </button>
      <button type="button" class="selection-tile primary-slot role-slot" :data-card-action="roleName ? 'replace' : 'select'" aria-label="选择角色" aria-haspopup="dialog"
        :class="{ filled: roleName }" :disabled="!!document?.baseline" @click="openCharacters">
        <template v-if="roleName">
          <GameIcon kind="characters" :id="queryCharacter?.derivedFrom?.id ?? queryCharacter?.id" :name="roleName" :size="64" :replaceable="!document?.baseline"
            :level="hitOwner?.build?.level" :constellation="hitOwner?.build?.constellation" />
          <span><small>角色</small><strong>{{ roleName }}</strong></span>
        </template>
        <template v-else><span class="add-mark" aria-hidden="true">+</span><strong>选择角色</strong></template>
      </button>
      <button type="button" class="selection-tile secondary-slot" :data-card-action="selectedLabel ? 'replace' : 'select'" aria-label="选择伤害" aria-haspopup="dialog" :data-hit-id="damage.hit.hitId"
        :disabled="!queryCharacter || !!document?.baseline" @click="picker = 'damage'">
        <GameIcon v-if="selectedChoice" :kind="selectedChoice.iconKind ?? 'skills'" :id="selectedChoice.icon" :size="32" :replaceable="!document?.baseline" /><span v-else-if="!standalone && !sceneHit" class="add-mark small" aria-hidden="true">+</span>
        <span><small v-if="selectedLabel">伤害</small><strong>{{ selectedLabel || '选择伤害' }}</strong></span>
      </button>
      <button type="button" class="selection-tile secondary-slot" data-card-action="select" aria-label="选择增益" aria-haspopup="dialog" :disabled="!queryCharacter || !!document?.baseline || !!sceneHit" @click="picker = 'buff'">
        <GameIcon v-if="includedBuffs.length" :kind="includedBuffs[0].icon.kind" :id="includedBuffs[0].icon.id" :monochrome="includedBuffs[0].icon.kind === 'constellations'" :size="32" />
        <span v-else class="add-mark small" aria-hidden="true">+</span>
        <span><small v-if="includedBuffs.length">增益</small><strong>{{ includedBuffs.length ? includedBuffs[0].name + (includedBuffs.length > 1 ? ' 等 ' + includedBuffs.length + ' 项' : '') : '选择增益' }}</strong></span>
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <section class="library-section calculator-result" aria-label="计算结果">
      <header class="result-heading"><h3>伤害结果</h3><div class="library-page-actions">
        <button class="ui-action soft" v-if="!document?.baseline && point?.value != null" data-accent="anemo" :disabled="working" @click="pinBaseline">设为比较基准</button>
        <button v-if="document?.baseline" class="ui-action soft" data-accent="pyro" @click="endComparison">结束对照</button>
        <button class="ui-action" data-accent="anemo" :disabled="working || !selectedLabel" @click="calculate">{{ working ? '计算中' : document?.baseline ? '重算候选' : '计算伤害' }}</button>
      </div></header>
      <div class="damage-totals">
        <div><span>{{ sceneHitDefinition?.recipient === 'character' ? '场上角色最终承伤' : sceneBaseOnly || point?.real?.status !== 'partial' ? '最终伤害值' : '模型伤害（待核验）' }} <small v-if="!sceneHit && damage.crit">{{ critNames[damage.crit] }}</small></span>
          <output v-if="result" data-testid="calculator-value">{{ point?.value != null ? number(point.value) : sceneBaseOnly && point?.real?.baseDamage != null ? '待核验' : unavailable(result, point) }}</output><strong v-else>—</strong></div>
        <div v-if="sceneBaseOnly"><span>减伤前基数</span><output v-if="result" data-testid="calculator-scene-base">{{ number(point?.real?.baseDamage) }}</output><strong v-else>—</strong></div>
        <div v-if="!sceneHit"><span>{{ expectedPoint?.real?.status === 'partial' ? '模型期望（待核验）' : '期望伤害值' }}</span><output v-if="result" data-testid="calculator-expected">{{ working && !expectedResult ? '…' : expectedPoint?.value == null ? unavailable(expectedResult, expectedPoint) : number(expectedPoint?.value) }}</output><strong v-else>—</strong></div>
      </div>
      <template v-if="result">
        <details v-if="diagnostics.length" class="result-support"
          :open="point?.value == null || !!expectedResult && expectedPoint?.value == null"><summary>计算条件与支持范围</summary>
          <ul aria-label="未完成的计算条件"><li v-for="message in diagnostics" :key="message">{{ message }}</li></ul>
          <button v-if="missingBuff && !document?.baseline" type="button" class="ui-action soft" data-size="md" @click="picker = 'buff'">补充增益条件</button>
        </details>
        <details v-if="point?.real?.sceneHit" class="result-support"><summary>场景冲击倍率与来源</summary>
          <dl><dt>冲击倍率</dt><dd>{{ number(point.real.sceneHit.multiplier) }}</dd>
            <dt>ElementLevelCo 系数</dt><dd>{{ number(point.real.sceneHit.elementLevelCo) }}</dd></dl>
          <p v-for="sourceRef in point.real.sceneHit.sourceRefs" :key="sourceRef">{{ sourceRef }}</p>
        </details>
        <CalculatorFactorCards v-if="point?.real && !sceneHit" :real="point.real" :damage="damage" :buffs="buffs" />
        <table v-if="response?.comparison"><thead><tr><th>基准</th><th>当前候选</th><th>差值</th></tr></thead><tbody><tr><td>{{ number(baselinePoint?.value) }}</td><td>{{ number(point?.value) }}</td><td data-testid="calculator-delta">{{ number(comparisonPoint?.delta) }}</td></tr></tbody></table>
        <details v-if="point?.real && !sceneHit" class="result-support"><summary>配装属性与来源</summary>
          <p v-if="queryCharacter?.origin === 'custom'">角色来源 / 自定义声明</p>
          <p v-if="hitOwner?.build && skill">{{ skill.name }} / 天赋 {{ hitOwner.build.talents[skill.category] }} + {{ talentBonusLabel }}</p>
          <dl><template v-for="(value, key) in point.real.panel.stats" :key="key"><dt>{{ realStatLabel(key) }}</dt><dd>{{ number(value) }}</dd></template></dl>
          <p v-for="entry in point.real.panel.contributions" :key="entry.source + ':' + entry.stat + ':' + entry.value">{{ entry.source }} / {{ realStatLabel(entry.stat) }} {{ number(entry.value) }}</p>
        </details>
      </template>
    </section>
    <section v-if="document" class="library-section calculator-conditions"><h3>命中条件</h3>
      <label v-if="records.length > 1 && !document?.team">查看记录<select :value="document?.recordId" @change="selectRecord(($event.target as HTMLSelectElement).value)"><option v-for="record in records" :key="record.id" :value="record.id">{{ actorLabel(document!.project, record.actor) }} / {{ recordLabel(document!.project, record.id) }} / {{ record.timeMs / 1000 }}秒</option></select></label>
      <fieldset v-if="selectedLabel || records.length" :disabled="!!document?.baseline"><div class="calculator-fields">
            <label>命中时刻（秒）<input v-model.number="hitTime" type="number" min="0" max="3600" step="0.001"></label>
            <label v-if="selectedHit?.selection?.repetitions">本次命中序号<select :value="damage.hitOrdinal ?? ''" @change="setHitOrdinal">
              <option value="">未指定</option><option v-for="ordinal in selectedHit.selection.repetitions" :key="ordinal" :value="ordinal">第{{ ordinal }}击</option>
            </select></label>
            <template v-if="sceneHit">
              <label>ElementLevelCo 系数<input type="number" min="0" step="any" placeholder="待确认" :value="sceneHit.elementLevelCo ?? ''" @input="setSceneCoefficient"></label>
              <label>冲击触发<select v-model="sceneTriggered"><option :value="null">待确认</option><option :value="true">已满足</option><option :value="false">未满足</option></select></label>
              <label>{{ sceneHitDefinition?.recipient === 'character' ? '场上角色受到冲击' : '当前敌人受到冲击' }}<select v-model="sceneTargetHit"><option :value="null">待确认</option><option :value="true">命中</option><option :value="false">未命中</option></select></label>
            </template>
            <label v-else-if="!standalone || transformative">暴击<select v-model="damage.crit" :disabled="selectedHit?.critical === 'always'"><option :value="null">待确认</option><option value="noncritical">非暴击</option><option value="critical">暴击</option><option value="expected">期望伤害</option></select></label>
            <label v-if="infusionChoices.length">本击队伍附魔<select v-model="partyInfusion"><option value="none">无</option><option v-for="[element, sources] in infusionChoices" :key="element" :value="element">{{ realElementLabel(element) }}元素（{{ sources.join('、') }}）</option></select></label>
            <label v-if="!standalone && !sceneHit">反应<select v-model="reactionType"><option value="">待确认</option><option v-for="reaction in reactionChoices" :key="reaction" :value="reaction">{{ reactionNames[reaction] }}</option></select></label>
            <label v-for="input in hitInputs" :key="input.id">{{ inputNames[input.id] ?? queryCharacter?.metadata.facts?.[input.id]?.label ?? buffFactNames[input.id] ?? input.id }}
              <select v-if="input.id === 'counterCharge'" :value="subjectFacts(damage.facts, { kind: 'event' })?.[input.id]?.value?.value ?? ''" @change="setInput(input.id, $event)"><option value="">待确认</option><option :value="0">0 / 无反击加成</option><option :value="1">1 / 一档反击</option><option :value="2">2 / 满档／完美反击</option></select>
              <input v-else type="number" :min="input.min" :max="talentInputMaximum(input, hitOwner?.build?.constellation ?? 0)" :step="input.integer ? 1 : 'any'" :value="subjectFacts(damage.facts, { kind: 'event' })?.[input.id]?.value?.value ?? ''" placeholder="待确认" @input="setInput(input.id, $event)">
            </label>
            <template v-if="selectedHit?.snapshot"><label>属性捕获来源<select :value="damage.capture?.recordId ?? ''" @change="setCapture"><option value="">待确认</option><option v-for="record in captures" :key="record.id" :value="record.id">{{ actorLabel(document!.project, record.actor) }} / {{ recordLabel(document!.project, record.id) }} / {{ record.timeMs / 1000 }}秒</option></select></label><label>捕获时点<select :value="damage.capture?.phase ?? ''" @change="damage.capture = { recordId: damage.capture?.recordId ?? null, phase: (($event.target as HTMLSelectElement).value || null) as 'before' | 'after' | null }"><option value="">待确认</option><option value="before">记录生效前</option><option value="after">记录生效后</option></select></label></template>
          </div>
          <p v-if="sceneHitDefinition" class="muted">{{ sceneHitDefinition.trigger }}。<template v-if="sceneHitDefinition.cooldownMs">冷却 {{ sceneHitDefinition.cooldownMs / 1000 }} 秒。</template>
            <template v-if="sceneHitDefinition.delayMs">触发后 {{ sceneHitDefinition.delayMs }} 毫秒命中。</template><template v-if="sceneHitDefinition.radius">冲击范围 {{ sceneHitDefinition.radius }} 米。</template></p>
          <details v-for="group in captureGroups" :key="group.record.id"><summary>{{ group.title }}</summary><div class="calculator-fields">
            <label v-for="field in group.fields" :key="JSON.stringify([field.subject, field.key])">{{ captureFieldLabel(field) }}
              <input v-if="field.type.kind === 'quantity'" type="number" :step="field.type.unit === 'count' ? 1 : 'any'"
                :value="subjectFacts(group.record.captureFacts, field.subject)?.[field.key]?.value?.value ?? ''" @change="editCaptureFact(group.record, field, $event)">
              <select v-else :value="String(subjectFacts(group.record.captureFacts, field.subject)?.[field.key]?.value?.value ?? '')" @change="editCaptureFact(group.record, field, $event)">
                <option value="">待确认</option><template v-if="field.type.kind === 'boolean'"><option value="true">是</option><option value="false">否</option></template>
                <option v-else v-for="option in field.type.values" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
          </div></details>
          <details v-if="!sceneHit"><summary>目标与计算条件</summary><div class="calculator-fields">
            <label>目标等级<input v-model.number="enemy.level" type="number" min="1" max="200"></label>
            <label>减防比例<input v-model.number="enemy.defenseReduction" type="number" min="0" max="1" step="0.01"></label><label>无视防御比例<input v-model.number="enemy.defenseIgnore" type="number" min="0" max="1" step="0.01"></label>
            <label v-for="element in elements" :key="element">{{ realElementLabel(element) }}抗性（比例）<input v-model.number="enemy.resistances[element]" type="number" step="0.01"></label>
          </div></details></fieldset>
          <fieldset class="calculator-scene-settings" :disabled="!!document.baseline"><BattleSceneSettings :selections="document.project.sceneEffects" @change="updateScenes" /></fieldset>
          <TalentHealingForm v-if="document && !document.baseline" :members="document.project.candidate.actors" @apply="(actor,recipient,heal,facts)=>recordBeforeHit((p,t)=>addTalentHeal(p,actor,recipient,heal,t,facts))" />
          <AuraObservationForm v-if="document && hitOwner && !document.baseline" :members="document.project.candidate.actors.filter(a=>a.build)" :actor="hitOwner.id" @apply="(actor,aura)=>recordBeforeHit((p,t)=>addAuraObservation(p,actor,t,aura))" />
          <ReactionRecordForm v-if="document && hitOwner && !document.baseline" :project="document.project" :actor="hitOwner.id" :time-ms="Math.round(hitTime*1000)" :before="document.recordId" :changes="result?.combatChanges"
            @reaction="(actor,reaction,element)=>recordBeforeHit((p,t)=>addReactionObservation(p,actor,t,reaction,element))"
            @pickup="(actor,source,effect)=>recordBeforeHit((p,t)=>addParticlePickup(p,actor,source,t,effect))" />
          <fieldset v-if="selectedHit?.snapshot" :disabled="!!document?.baseline"><label>独立捕获时刻（秒）<input v-model="captureTime" type="number" min="0" max="3600" step="0.001" placeholder="填写已确认时刻"></label><button class="ui-action soft" data-accent="hydro" @click="createCapture">添加属性捕获点</button></fieldset>
    </section>
    <section v-if="character?.build" class="library-section calculator-build" aria-label="角色配置">
      <header class="result-heading"><h3>角色配置</h3>
        <button v-if="document && !document.team && document.project.candidate.actors.length > 1" class="ui-action soft" data-size="md" @click="picker = 'candidate'">试配队员</button>
      </header>
      <CharacterConfigurationCard compact :character-name="character.name" :configuration-name="configurationName" :build="character.build"
        :entries="entries" :basis="basis" :effective-stats="effectiveStats(character.name)" open-label="编辑角色配置"
        @open="editor = { name: character.name, character }" />
      <details v-if="!document?.baseline" class="result-support"><summary>角色定义</summary>
        <div class="library-page-actions"><button class="ui-action soft" data-accent="hydro" :disabled="working" @click="reviewContent">检查当前内容</button>
          <button class="ui-action soft" data-accent="hydro" @click="exportMetadata">导出角色定义副本</button>
          <button class="ui-action soft" data-accent="hydro" @click="metadataFile?.click()">导入角色定义</button></div>
        <input ref="metadataFile" hidden type="file" accept=".json,application/json" aria-label="导入计算器角色定义" @change="importMetadata">
      </details>
    </section>
    <CombatChangeList v-if="document" :changes="result?.combatChanges" :team="document.project.candidate.actors" />
    <footer class="library-page-toolbar">
      <span v-if="dirty || document" class="library-page-status">{{ dirty ? '未保存' : '已保存' }}</span>
      <div class="library-page-actions">
        <button class="ui-action soft" data-accent="anemo" @click="copyAxis">复制当前轴</button>
        <button class="ui-action soft" @click="newCalculation">新建计算</button>
        <button class="ui-action soft" @click="requestLeave(() => file?.click())">打开计算</button>
        <button class="ui-action soft" :disabled="!character" @click="save">导出计算文件</button>
      </div>
    </footer>
    <input ref="file" hidden type="file" accept=".json,application/json" aria-label="打开伤害计算文件" @change="openFile">
    <SavedDamageList v-if="picker === 'list'" @close="picker = undefined" @open="reopenDamage" @deleted="id => { if (listed?.id === id) listed = undefined; }" />
    <WorkbenchDialog v-if="picker === 'team'" title="选择队伍" center-title @close="picker = undefined">
      <template v-if="selectedTeam" #header-leading><button type="button" class="ui-action soft" data-size="md" @click="chooseTeam()">清除队伍</button></template>
      <TeamLibrary pick :selected-id="selectedTeam?.id" @select="chooseTeam" />
    </WorkbenchDialog>
    <CharacterSelectionDialog v-if="picker === 'character'" :members="teamProject?.candidate.actors" :showcase-only="!teamProject && characterSource === 'showcase'"
      :selected-id="teamProject ? actor?.id : source.startsWith(characterSource + ':') ? source.slice(characterSource.length + 1) : undefined" @close="picker = undefined" @select="chooseCharacter">
      <template v-if="!teamProject && account.account.characters.length" #header-leading>
        <ChoiceGroup joined small label="角色资料来源" :tone="characterSource === 'showcase' ? 'electro' : 'hydro'" :model-value="characterSource" :options="sourceChoices"
          @update:model-value="characterSource = $event as typeof characterSource" />
      </template>
      <template v-if="!teamProject && characterSource === 'catalog'" #browser>
        <CatalogBrowser :options="catalog?.characters ?? []" kind="characters" label="游戏角色" :selected-id="queryCharacter?.id" @select="chooseCharacter" />
      </template>
    </CharacterSelectionDialog>
    <CalculatorDamagePicker v-if="picker === 'damage'" :choices="hitChoices" :selected="damage.hit.hitId ?? undefined" :scenes="sceneChoices"
      :selected-scene="sceneHit && definitionKey(sceneHit.scene)" @close="picker = undefined" @select="selectDamage" @reaction="selectReaction" @scene="selectSceneHit" />
    <CalculatorBuffPicker v-if="picker === 'buff' && hitOwner" :choices="buffs" :damage="damage" :actor-id="hitOwner.id" :intervals="intervals"
      :fields="factFields" :hit-facts="hitFacts" :time="hitTime" @close="picker = undefined" @apply="applyBuffs" />
    <CharacterSelectionDialog v-if="picker === 'candidate' && document" title="试配队员" :members="document.project.candidate.actors" :selected-id="document.actorId" @close="picker = undefined" @select="switchActor" />
    <CalculatorBuildEditor v-if="editor" ref="editorDialog" :name="editor.name" :initial-character-id="editor.initialCharacterId" :character="editor.character"
      :equipment="editor.equipment" :effective-stats="effectiveStats(editor.name)" @close="editor = undefined" @apply="applyBuild" />
    <WorkbenchDialog v-if="contentReview" title="更新计算副本内容" @close="contentReview = undefined"><p>替换当前试配队员的内容定义，保留培养与装备选择。账号和原轴保留原记录，已有条件与效果引用继续校验。</p><ul v-if="contentReview.changes.length"><li v-for="change in contentReview.changes" :key="change">{{ change }}</li></ul><p v-else>当前定义已与内置内容一致。</p><button v-if="contentReview.changes.length" class="ui-action" data-accent="hydro" @click="applyContent">采用当前内容并重算</button></WorkbenchDialog>
    <UnsavedChangesDialog v-if="discardOpen" @continue="cancelDiscard" @discard="discardChanges" @save="saveAndLeave(selectedLabel ? saveDamage : save)" />
  </section>
</template>

<style scoped>
.damage-calculator,.calculator-result,.calculator-conditions,.calculator-build { display:grid; min-width:0; gap:12px; }
.damage-toolbar { display:flex; align-items:center; justify-content:space-between; }
.calculator-selections { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.selection-tile { box-sizing:border-box; display:flex; align-items:center; justify-content:center; gap:12px; min-width:0; width:100%; padding:16px; background:var(--surface); color:var(--ink); }

.primary-slot,.calculator-team { min-height:140px; }
.primary-slot:not(.filled) { flex-direction:column; border-style:dashed; }
.selection-tile.filled:disabled,.secondary-slot:disabled:has(small),.calculator-team:disabled { opacity:1; }
.selection-tile strong { display:block; overflow-wrap:anywhere; font-size:var(--font-control); }
.selection-tile small,.damage-totals small { font-size:var(--font-body); color:var(--muted); font-weight:400; }
.add-mark { display:grid; place-items:center; width:40px; height:40px; color:var(--element-anemo-deep); background:var(--element-anemo-light); border-radius:7px; font-size:var(--font-title); font-weight:400; }
.add-mark.small { width:32px; height:32px; }
.secondary-slot { justify-content:flex-start; min-height:68px; padding:10px 16px; text-align:left; }.role-slot.filled { text-align:left; }
button.calculator-team { grid-template-columns:minmax(0,1fr) auto; gap:4px; }
.calculator-team :deep(.team-row-members) { grid-row:2; grid-column:1/-1; }
.calculator-team :deep(.team-row-trailing) { grid-row:1; grid-column:2; }
.result-heading { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.result-heading { justify-content:space-between; }.damage-calculator h3 { margin:0; font-size:var(--font-control); }
.damage-totals { display:grid; grid-template-columns:1fr 1fr; padding:16px; border:1px solid var(--line); border-radius:7px; background:var(--surface); }
.damage-totals > div { display:grid; gap:4px; min-width:0; padding-inline:8px; }
.damage-totals > div + div { padding-left:24px; border-left:1px solid var(--line); }
.damage-totals small { margin-left:4px; }
.damage-totals output,.damage-totals strong { font-size:var(--font-title); font-weight:700; font-variant-numeric:tabular-nums; color:var(--element-anemo-deep); overflow-wrap:anywhere; }
.damage-totals > div + div output { color:var(--ink); }
.calculator-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr)); gap:12px; }
label,input,select,fieldset { min-width:0; box-sizing:border-box; }
fieldset { border:0; padding:0; margin:0; }
.calculator-conditions fieldset + fieldset { display:grid; justify-items:start; gap:8px; }
.calculator-conditions fieldset + .calculator-scene-settings { justify-items:stretch; }
.calculator-conditions details { margin-top:12px; }
.calculator-conditions summary,.result-support > summary { cursor:pointer; color:var(--ink); font-weight:700; line-height:var(--control-height-md); }
.calculator-conditions details[open] > summary { margin-bottom:8px; }
.calculator-result table { width:100%; border-collapse:collapse; table-layout:fixed; font-variant-numeric:tabular-nums; }
th,td { padding:8px 4px; border-bottom:1px solid var(--line); text-align:left; overflow-wrap:anywhere; font-size:var(--font-body); }
dl { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:8px 0; font-variant-numeric:tabular-nums; }
dd { margin:0; text-align:right; }p,li { overflow-wrap:anywhere; }ul { margin:0; padding-left:20px; }
@media(max-width:600px) {
  .calculator-selections { gap:8px; }.primary-slot,.calculator-team { min-height:114px; }.secondary-slot { padding:8px; gap:6px; }
  .role-slot.filled { flex-direction:column; text-align:center; }.damage-totals { grid-template-columns:1fr; padding:4px 12px; }
  .damage-totals > div,.damage-totals > div + div { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; padding:8px 0; border-left:0; }
  .damage-totals > div + div { border-top:1px solid var(--line); }
  .calculator-team :deep(.team-row-members) { gap:4px; }
}
</style>
