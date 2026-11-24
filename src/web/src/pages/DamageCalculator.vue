<script setup lang="ts">
import BattleSceneSettings from '../components/BattleSceneSettings.vue';
import AuraObservationForm from '../components/AuraObservationForm.vue';
import TalentHealingForm from '../components/TalentHealingForm.vue';
import ReactionRecordForm from '../components/ReactionRecordForm.vue';
import { addAuraObservation, addReactionObservation, addParticlePickup, addTalentHeal } from '../domain/real-project';
import CombatChangeList from '../components/CombatChangeList.vue';
import { grantedDamageChanges, resolveEquipmentPanel } from '@leyline/engine';
import { definitionKey, matchingSceneHits, sceneHitInInterval, type SceneDefinition, type SceneHitRequest, type SceneSelection } from '@leyline/schema';
import { combatFactDeclaration } from '@leyline/schema/buffs';
import { absorbedElements, ordinaryReactions } from '@leyline/schema/hit-bindings';
import { putHitFact, subjectFacts, findBuildHit, isTransformative, partyInfusionFact, talentInputMaximum, transformativeElements } from '@leyline/schema';
import { APP_VERSION } from '@leyline/schema/version';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, shallowRef, toRaw, watch } from 'vue';
import { getReactionCalculationBundle } from '@leyline/game-data';
import type { TransformativeFamily, ProjectReaction } from '@leyline/schema';
import { damageCalculatorSchema, projectSchema, type ValueType, createTalentRankReader, type AxisResponse, type Build, type DamageCalculatorDocument, type DamageRequest, type StatKey } from '@leyline/schema';
import type { AccountArtifact, AccountCharacter, LocalAccount } from '../domain/account';
import { addCalculatorCapture, addCalculatorSceneHit, calculatorRequest, calculatorCritProject, calculatorSceneHits, calculatorSnapshotDraft, calculatorWorkerRequest, copyProjectForCalculator, parseDamageCalculator, readCalculatorSource, prepareCalculatorContentUpdate } from '../domain/damage-calculator';
import { addActorFromBuild, addTransformativeReaction, defaultEnemy } from '../domain/real-project';
import { createEmptyProject, nextRecordId } from '../domain/workbench-project';
import { teamArtifactEntries, type TeamConfigurationRef } from '../domain/team-members';
import { buildRollBasis } from '../domain/effective-roll-basis';
import { defaultEffectiveStats, equipmentConfigurationLabel } from '../domain/character-loadout-name';
import { physicalArtifact } from '../domain/build-snapshot';
import { fileSignature } from '../domain/file-signature';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import { applyCharacterDefinition, copyCharacterDefinition, parseCharacterDefinition } from '../domain/character-definition';
import { exportCharacterSnapshot } from '../domain/structured-character-import';
import { packDocument } from '../domain/content-document';
import { downloadJson, downloadJsonText } from '../domain/download';
import { realElementLabel, realStatLabel, recordLabel, actorLabel, damageFamilyLabel, sceneHitLabel } from '../domain/workbench-labels';
import { useAccountStore } from '../stores/account';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import CharacterStatPanel from '../components/CharacterStatPanel.vue';
import EffectiveRollSummary from '../components/EffectiveRollSummary.vue';
import DisclosureHeading from '../components/DisclosureHeading.vue';
import ArtifactEquipmentGrid from '../components/ArtifactEquipmentGrid.vue';
import CharacterConfigurationCard from '../components/CharacterConfigurationCard.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import CharacterCatalogBrowser from '../components/CharacterCatalogBrowser.vue';
import GameIcon from '../components/GameIcon.vue';
import TeamCard from '../components/TeamCard.vue';
import CalculatorDamageCard from '../components/CalculatorDamageCard.vue';
import CalculatorDamagePicker from '../components/CalculatorDamagePicker.vue';
import CalculatorBuffPicker from '../components/CalculatorBuffPicker.vue';
import CalculatorEnemySettings from '../components/CalculatorEnemySettings.vue';
import SlotPlaceholder from '../components/SlotPlaceholder.vue';
import CalculatorFactorCards from '../components/CalculatorFactorCards.vue';
import { calculatorHitChoices, type CalculatorHitChoice } from '../domain/calculator-hits';
import { applyCalculatorBuffs, buffDisplayName, buffFactNames, calculatorBuffChoices, resolveBuffSelection } from '../domain/calculator-buffs';
import { presetCalculatorHitInputs, missingCalculatorPresets, calculatorFactPreset, calculatorHitElement, calculatorIntervals, calculatorOnFieldActor, calculatorHitFactFields, calculatorPartyInfusionOptions, type CalculatorFactField, selectionFacts, selectionEnumFallback, setCalculatorFact } from '../domain/calculator-conditions';
import { calculatorBuffReadouts, calculatorSupportText, damageNumber as number, reactionNames, critNames } from '../domain/calculator-factors';
import type { SavedTeam } from '../stores/saved-teams';
import { loadSavedDamage, saveDamageSnapshot } from '../platform/saved-damage';
const SavedDamageList = defineAsyncComponent(() => import('../components/SavedDamageList.vue'));
const TeamLibrary = defineAsyncComponent(() => import('./TeamLibrary.vue'));
const CharacterSelectionDialog = defineAsyncComponent(() => import('../components/CharacterSelectionDialog.vue'));
const ArtifactDetail = defineAsyncComponent(() => import('./ArtifactDetail.vue'));
const CharacterDetailDialog = defineAsyncComponent(() => import('./CharacterDetailDialog.vue'));
const ManualCharacterImport = defineAsyncComponent(() => import('./ManualCharacterImport.vue'));

const account = useAccountStore(), axis = useAxisWorkspaceStore();
const document = shallowRef<DamageCalculatorDocument>();
const working = ref(false), error = ref('');
const file = ref<HTMLInputElement>(), source = ref('');
const savedSignature = ref('');
const listed = shallowRef<{ id: string; signature: string }>();
const savingDamage = ref(false);
const response = shallowRef<AxisResponse>();
const resultExpanded = ref(true);
const inspectedArtifact = shallowRef<AccountArtifact>();
const criticalFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const expectedFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const criticalResult = shallowRef<AxisResponse['result']>();
const expectedResult = shallowRef<AxisResponse['result']>();
const picker = ref<'team' | 'character' | 'candidate' | 'damage' | 'buff' | 'list'>();
const characterSource = ref<'local' | 'showcase' | 'catalog'>('local');
const sourceChoices = computed(() => [
  { value: 'local', label: '本地' },
  ...(account.account.characters.some(entry => entry.showcase) ? [{ value: 'showcase', label: '展柜' }] : []),
  { value: 'catalog', label: '游戏目录' },
]);
const pendingTeam = shallowRef<Pick<SavedTeam,'id' | 'name' | 'project'>>();
const selectedTeam = computed(() => document.value?.team ?? pendingTeam.value);
const teamProject = computed(() => document.value?.team ? document.value.project : pendingTeam.value?.project);
const linkedConfiguration = shallowRef<TeamConfigurationRef>();
const editor = shallowRef<{ characterId: string; presetId?: string; complete?: boolean; snapshot?: LocalAccount }>();
const editorDialog = ref<InstanceType<typeof CharacterDetailDialog>>();
const catalogCharacter = shallowRef<{ id: string; name: string }>();
const catalogEditor = ref<InstanceType<typeof ManualCharacterImport>>();
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
const hitChoices = computed(() => queryCharacter.value && document.value ? calculatorHitChoices(queryCharacter.value, hitOwner.value?.build,
  createTalentRankReader(document.value.project.candidate.actors)) : []);
const selectedChoice = computed(() => hitChoices.value.find(choice => choice.ref.definition.group === damage.value.hit.definition.group
  && choice.ref.definition.namespace === damage.value.hit.definition.namespace
  && choice.ref.definition.id === damage.value.hit.definition.id && choice.ref.definition.revision === damage.value.hit.definition.revision && choice.hitId === damage.value.hit.hitId));
const standalone = computed(() => !damage.value.hit.hitId ? document.value?.project.timeline.find(r=>r.id===document.value?.recordId)?.reactionEvent : undefined);
const sceneHit = computed(() => !damage.value.hit.hitId ? document.value?.project.timeline.find(record => record.id === document.value?.recordId)?.sceneHit : undefined);
const sceneChoices = computed(() => calculatorSceneHits(document.value?.project));
const sceneDefinition = computed(() => sceneHit.value && matchingSceneHits(document.value?.project.sceneEffects, sceneHit.value.scene)[0]?.definition);
const sceneHitDefinition = computed(() => sceneDefinition.value?.hits?.[0]);
const hasDamageCard = computed(() => !!(selectedChoice.value || standalone.value || sceneDefinition.value));
const sceneBaseOnly = computed(() => sceneHitDefinition.value && 'settlement' in sceneHitDefinition.value);
const transformative = computed(() => !!standalone.value && isTransformative(standalone.value.family));
const selectedLabel = computed(() => {
  if (sceneHit.value) return sceneHitLabel(sceneDefinition.value);
  if (standalone.value) return damageFamilyLabel(standalone.value.family);
  const row = selectedChoice.value;
  if (!row) return '';
  const name = row.alias && row.alias !== row.name ? row.alias + '（' + row.name + '）' : row.name;
  return row.code + ' ' + name;
});
const intervals = computed(() => document.value && hitOwner.value
  ? calculatorIntervals(document.value.project, hitOwner.value.id, Math.round(hitTime.value * 1000), document.value.recordId) : {});
const buffs = computed(() => document.value && hitOwner.value ? calculatorBuffChoices(document.value.project, hitOwner.value.id, damage.value,
  Math.round(hitTime.value * 1000), document.value.recordId, intervals.value) : []);
const buffIcons = computed(() => {
  const values = calculatorBuffReadouts(point.value?.real, buffs.value);
  return buffs.value.filter(buff => buff.checked).map(buff => ({
    id: buff.id, icon: buff.icon, label: [buffDisplayName(buff), buff.source, buff.description].join('，'),
    rows: values.get(buff.id) ?? [],
  }));
});
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
  for (const key of ['hpRatio', 'onField', 'shielded'] as const) partyFields.push({
    key, type: combatFactDeclaration(undefined, key)!.type, subject: { kind: 'actor', id: owner },
  });
  for (const field of [...partyFields, ...calculatorHitFactFields(selectedBinding.value, owner, dealer?.id, hitOwner.value?.build?.constellation), ...buffs.value.flatMap(buff => buff.fields)]) {
    const subject = field.subject;
    if (!subject
      || subject.kind === 'event' && (hitInputs.value.some(input => input.id === field.key) || ['critMode', 'reactionMode'].includes(field.key))) continue;
    const name = subject.kind === 'actor' ? document.value?.project.candidate.actors.find(actor => actor.id === subject.id)?.build?.character.identity.name
      : subject.kind === 'team' ? '队伍' : subject.kind === 'target' ? '目标' : '本击';
    const label = field.label ?? selectedBinding.value?.entity.metadata.facts?.[field.key]?.label ?? buffFactNames[field.key] ?? field.key;
    const own = subject.kind === 'actor' && subject.id === owner;
    const caption = field.key === 'hpRatio' ? '生命比例（%）' : label;
    fields.set(JSON.stringify([subject, field.key]), { ...field, label: own && ['hpRatio', 'onField', 'shielded'].includes(field.key)
      ? caption : [name, caption].filter(Boolean).join(' · ') });
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
const sceneTriggered = computed({ get: () => sceneHit.value?.triggered ?? true, set: triggered => updateSceneHit({ triggered }) });
const sceneTargetHit = computed({ get: () => sceneHit.value?.targetHit ?? true, set: targetHit => updateSceneHit({ targetHit }) });
function setSceneCoefficient(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.value) input.value = '1';
  updateSceneHit({ elementLevelCo: input.valueAsNumber });
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
const inactiveHit = computed(() => {
  const evaluation = point.value?.real?.structured;
  const output = evaluation?.outputs.find(row => row.outputId === damage.value.hit.hitId);
  if (output?.value.state !== 'known' || output.value.value.value !== 0
    || !evaluation?.trace.some(node => node.id === output.value.traceId && node.nodeId === 'predicate')) return;
  const binding = selectedBinding.value;
  const excluded = binding && selectionFacts(binding.hit.damage[output.family]?.predicate, binding.entity.calculation.bundle, false);
  return excluded?.some(setting => setting.key === 'radiance' && setting.value.value === 'none')
    ? '需要辉映·星超导或辉映·星扩散' : '当前条件下不会触发此命中';
});
const radianceStatus = computed(() => {
  if (!result.value || !selectedBinding.value || !hitOwner.value || !document.value) return;
  const excluded = selectionFacts(selectedOutput.value?.predicate, selectedBinding.value.entity.calculation.bundle, false);
  if (excluded.length !== 1 || excluded[0].key !== 'radiance' || excluded[0].value.value !== 'none') return;
  const fact = point.value?.real?.structured?.trace.find(node => node.nodeId === 'radiance'
    && node.state === 'known' && node.value?.kind === 'enum');
  const labels: Record<string, string> = { none: '无', 'stellar-conduct': '星超导', 'stellar-swirl': '星扩散' };
  return fact?.value?.kind === 'enum' ? labels[fact.value.value] : undefined;
});
const criticalPoint = computed(() => criticalResult.value?.points.find(point => point.id === document.value?.recordId));
const candidateBuild = computed(() => actor.value?.build);
const equipmentPanel = computed(() => candidateBuild.value && resolveEquipmentPanel(candidateBuild.value));
const candidatePanel = computed(() => {
  if (!sceneHit.value && hitOwner.value?.id === actor.value?.id && point.value?.real) return point.value.real.panel;
  return equipmentPanel.value;
});
const expectedPoint = computed(() => expectedResult.value?.points.find(point => point.id === document.value?.recordId));
const baselinePoint = computed(() => response.value?.comparison?.baseline.points.find(point => point.id === document.value?.recordId));
const comparisonPoint = computed(() => response.value?.comparison?.candidates[0]?.points.find(point => point.id === document.value?.recordId));

const inputNames: Record<string, string> = { counterCharge: '反击档位', namisen: '浪闪层数', resolve: '施放时消耗的愿力', lightfallEnergy: '光降之剑能量层数' };
const factLabels: Record<string, string> = { ...buffFactNames, ...inputNames, critMode: '暴击', reactionMode: '反应' };
function diagnosticText(message: string) {
  const prefix = '计算事实尚未明确：';
  if (!message.startsWith(prefix)) return calculatorSupportText(message);
  const key = message.slice(prefix.length);
  return '需填写' + (factLabels[key] ?? factFields.value.find(field => field.key === key)?.label ?? key);
}
const missingBuff = computed(() => [point.value, criticalPoint.value, expectedPoint.value].some(point => point?.real?.structured?.requiredInputs.some(input =>
  input.requiredBy.length && (factFields.value.some(field => field.key === input.key) || ['onField', 'shielded', 'hpRatio'].includes(input.key)))));
const diagnostics = computed(() => {
  const recordPath = document.value?.recordId && 'timeline.' + document.value.recordId;
  const all = [...(result.value?.diagnostics ?? []), ...(criticalResult.value?.diagnostics ?? []), ...(expectedResult.value?.diagnostics ?? [])];
  return [...new Set(all.filter(({ path }) => !recordPath || !path.startsWith('timeline.') || path === recordPath || path.startsWith(recordPath + '.'))
    .map(diagnostic => diagnosticText(diagnostic.message)))];
});
function unavailable(assessment: AxisResponse['result'] | undefined, record: typeof point.value) {
  if (record?.real?.status === 'invalid' || assessment?.status === 'invalid') return '输入需修正';
  const missing = record?.real?.issues.find(issue => issue.code === 'unknown');
  if (missing) return diagnosticText(missing.message);
  if (record?.real?.issues.some(issue => issue.code === 'unsupported')) return '机制尚未支持';
  return '未取得计算结果';
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
const absorbedElement = computed({
  get: () => {
    const record = document.value?.project.timeline.find(row => row.id === document.value?.recordId);
    const value = (subjectFacts(damage.value.facts, { kind: 'event' })?.absorbedElement ?? record?.facts?.absorbedElement)?.value;
    return value?.kind === 'enum' ? value.value : 'none';
  },
  set: (value: string) => {
    putHitFact(damage.value.facts ??= [], { kind: 'event' }, 'absorbedElement', { kind: 'enum', value });
    if (reactionType.value && !reactionChoices.value.some(kind => kind === reactionType.value)) damage.value.reaction = 'none';
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
  const value = input === '' ? calculatorFactPreset(field, record.actor) : type.kind === 'quantity' ? { ...type, value: Number(input) }
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
const calculationStats = ref<Record<string, readonly StatKey[]>>({});
function effectiveStats(name: string) {
  const linked = linkedConfiguration.value;
  if (linked?.accountId === account.account.id) return loadouts.effectiveStats(linked.accountId, linked.characterId, name);
  const definition = actor.value?.build?.character;
  const selected = definition?.identity.name === name ? calculationStats.value[definitionKey(definition)] : undefined;
  if (selected) return selected;
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
function invalidate() { stop(); response.value = undefined; criticalResult.value = undefined; expectedResult.value = undefined; }
watch(document, invalidate, { flush: 'sync' });
watch([damage, enemy, hitTime], invalidate, { deep: true, flush: 'sync' });
onBeforeUnmount(stop);
function install(next: DamageCalculatorDocument, saved = false) {
  const keepsActor = !saved && next.project.id === document.value?.project.id && next.actorId === document.value.actorId
    && fileSignature(next.project.candidate.actors.find(member => member.id === next.actorId)?.build) === fileSignature(actor.value?.build);
  if (!keepsActor) { linkedConfiguration.value = undefined; source.value = ''; }
  sourceRead++;
  listed.value = undefined;
  invalidate(); pendingTeam.value = undefined; contentReview.value = undefined; document.value = damageCalculatorSchema.parse(next);
  const record = next.project.timeline.find(record => record.id === next.recordId);
  damage.value = record?.damage ? JSON.parse(JSON.stringify(record.damage)) : emptyDamage();
  if (record?.reactionEvent) {
    const reaction = structuredClone(toRaw(record.reactionEvent));
    damage.value = { ...damage.value, crit: isTransformative(reaction.family) ? reaction.contributors[0].crit ?? 'noncritical' : null,
      facts: reaction.facts, effectApplications: reaction.effectApplications };
  }
  hitTime.value = (record?.timeMs ?? 0) / 1000; captureTime.value = '';
  enemy.value = next.project.enemy ? JSON.parse(JSON.stringify(next.project.enemy)) : defaultEnemy();
  error.value = '';
  savedSignature.value = saved ? signature() : '';
}
function clearCalculation() {
  sourceRead++;
  listed.value = undefined;
  invalidate(); pendingTeam.value = undefined; contentReview.value = undefined; document.value = undefined;
  damage.value = emptyDamage(); enemy.value = defaultEnemy(); hitTime.value = 0; captureTime.value = '';
  editor.value = undefined; linkedConfiguration.value = undefined; error.value = ''; source.value = '';
}
function newCalculation() { requestLeave(clearCalculation); }
function copyAxis() { requestLeave(() => { try { const copy = copyProjectForCalculator(axis.project); install(copy); if (copy.recordId) void calculate(); } catch (cause) { showError(cause); } }); }
function showError(cause: unknown) { error.value = cause instanceof Error ? cause.message : '计算未完成。'; }
function openCharacters() {
  characterSource.value = !account.account.characters.length ? 'catalog' : source.value.startsWith('showcase:') ? 'showcase' : 'local';
  picker.value = 'character';
}
const roleName = computed(() => queryCharacter.value?.identity.name);
function openCharacterDetails() {
  if (!actor.value?.build) return;
  const linked = linkedConfiguration.value;
  if (!document.value?.baseline && linked && configurationAccount(linked)?.characters.some(entry => entry.id === linked.characterId && entry.build)) {
    editor.value = { characterId: linked.characterId, presetId: linked.presetId };
    return;
  }
  const draft = calculatorSnapshotDraft(account.account, actor.value.build);
  editor.value = { characterId: draft.character.id, snapshot: draft.account };
}
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
  const kind = characterSource.value;
  if (kind !== 'catalog') requestLeave(() => { void loadSource(kind, id); });
}
function chooseCatalogCharacter(entry: { id: string; name: string }) {
  requestLeave(() => { catalogCharacter.value = entry; });
}
function useSavedCharacter(id: string) {
  picker.value = undefined;
  void loadSource('local', id);
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
  if (selectedHit.value?.selection?.repetitions) damage.value.hitOrdinal = 1;
  else delete damage.value.hitOrdinal;
  if (selectedHit.value?.critical === 'always') damage.value.crit = 'critical';
  const priorFacts = subjectFacts(damage.value.facts, { kind: 'event' });
  if (previousSkill !== choice.skillId && priorFacts) for (const input of previousInputs) delete priorFacts[input.id];
  delete damage.value.capture;
  if (hitOwner.value) for (const setting of hitFacts.value) setCalculatorFact(damage.value, setting, hitOwner.value.id);
  if (hitOwner.value && selectedBinding.value) {
    const settings = selectionEnumFallback(selectedOutput.value?.predicate, selectedBinding.value.entity.calculation.bundle,
      factFields.value, damage.value.facts, hitOwner.value.id);
    for (const setting of settings) setCalculatorFact(damage.value, setting, hitOwner.value.id);
  }
  if (previousReaction && !reactionChoices.value.some(kind => kind === previousReaction)) damage.value.reaction = 'none';
  if (damage.value.effectApplications?.length) {
    const applicable = new Set(buffs.value.filter(option => option.explicit && !option.triggerSkill && !option.confirmTrigger).map(option => option.id));
    damage.value.effectApplications = damage.value.effectApplications.filter(entry => applicable.has(entry.instanceId));
  }
  if (!previousSkill || previousSkill !== choice.skillId) {
    presetCalculatorHitInputs(damage.value, hitInputs.value);
  }
  if (hitOwner.value) {
    const draft: DamageRequest = JSON.parse(JSON.stringify(damage.value));
    // Set up the ordinary single-hit trial before resolving conditional passives.
    if (!document.value?.project.timeline.length) {
      for (const field of factFields.value) {
        if (field.subject?.kind !== 'actor' || !['onField', 'hpRatio', 'shielded'].includes(field.key)) continue;
        if (subjectFacts(draft.facts, field.subject)?.[field.key]?.value == null)
          setCalculatorFact(draft, { ...field, value: calculatorFactPreset(field, hitOwner.value.id) }, hitOwner.value.id);
      }
    }
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
function setReactionElement(event: Event) {
  const current = document.value, reaction = standalone.value;
  const element = (event.target as HTMLSelectElement).value as ProjectReaction['element'];
  if (!current || current.baseline || !reaction || !isTransformative(reaction.family) || !transformativeElements[reaction.family].includes(element)) return;
  const timeline = current.project.timeline.map(record => record.id === current.recordId
    ? { ...record, reactionEvent: { ...reaction, element } } : record);
  document.value = { ...current, project: { ...current.project, timeline } };
  void calculate();
}
function defaultReactionElement(family: TransformativeFamily) {
  const allowed = transformativeElements[family];
  const partyElements = new Set(document.value?.project.candidate.actors.map(actor => actor.build?.character.identity.element ?? actor.element));
  const matching = allowed.filter(element => partyElements.has(element));
  return matching.length === 1 ? matching[0] : allowed[0];
}
async function selectReaction(family: TransformativeFamily) {
  const current=document.value, owner=hitOwner.value?.id;
  if (!current || !owner || current.baseline) return;
  if (standalone.value?.family === family) { picker.value = undefined; return; }
  const element = defaultReactionElement(family);
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
    if (kind === 'local' && !entry.build) {
      editor.value = { characterId: id, complete: true };
      return;
    }
    const next = await readCalculatorSource(owner, id, kind);
    if (read !== sourceRead) return;
    if (owner !== account.account) throw new Error('账号已切换，请重新选择。');
    startWithBuild(next.character.build!);
    source.value = kind + ':' + id;
    if (kind === 'local') linkedConfiguration.value = { accountId: owner.id, characterId: id, presetId: '' };
  } catch (cause) { if (read === sourceRead) showError(cause); }
}
function configurationAccount(link: TeamConfigurationRef) {
  if (link.accountId !== account.account.id) return;
  return link.presetId ? loadouts.loadouts.find(entry => entry.id === link.presetId
    && entry.accountId === link.accountId && entry.characterId === link.characterId)?.snapshot : account.account;
}
async function useSavedConfiguration(characterId: string, presetId: string) {
  const session = editor.value;
  const current = document.value;
  const link = { accountId: account.account.id, characterId, presetId };
  const saved = configurationAccount(link);
  if (!saved) return;
  try {
    const { character } = await readCalculatorSource(saved, characterId, 'local');
    if (document.value !== current || configurationAccount(link) !== saved || !character.build) return;
    if (session?.complete) { startWithBuild(character.build); editor.value = undefined; }
    else applyBuild(character.build);
    if (!document.value?.baseline) {
      linkedConfiguration.value = link;
      source.value = 'local:' + characterId;
    }
  } catch (cause) { showError(cause); }
}
async function saveSnapshotDraft(draft: LocalAccount, stats: readonly StatKey[]) {
  const session = editor.value, snapshot = session?.snapshot, owner = account.account;
  if (!snapshot) throw new Error('请重新打开角色详情。');
  const { character } = await readCalculatorSource(draft, session.characterId, 'local');
  if (session !== editor.value || owner !== account.account) throw new Error('编辑对象已变化，未保存。');
  const build = character.build!;
  const before = snapshot.characters.find(entry => entry.id === session.characterId);
  build.artifacts = build.artifacts.map(piece => {
    const previous = before?.build?.artifacts.find(artifact => artifact.slot === piece.slot);
    const initialItem = snapshot.artifacts.find(item => item.id === before?.equipment[piece.slot]);
    const currentItem = owner.artifacts.find(item => item.id === piece.id);
    if (piece.id === initialItem?.id && previous && fileSignature(initialItem.real) === fileSignature(physicalArtifact(piece))) return previous;
    return fileSignature(currentItem?.real) === fileSignature(physicalArtifact(piece)) ? piece : { ...piece, inventory: null };
  });
  applyBuild(build);
  calculationStats.value[definitionKey(build.character)] = [...stats];
  editor.value = undefined;
}
function startWithBuild(build: Build) {
  const project = createEmptyProject();
  const actorId = addActorFromBuild(project, build);
  install({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId });
}
function applyBuild(build: Build) {
  const current = document.value;
  if (!current) return;
  if (fileSignature(actor.value?.build) === fileSignature(build)) return;
  linkedConfiguration.value = undefined;
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
    damage.value.crit ??= 'critical';
    damage.value.reaction ??= 'none';
    const existing = timeline.find(record => record.id === next.recordId);
    presetCalculatorHitInputs(damage.value, hitInputs.value, existing?.facts);
    const index = timeline.findIndex(record => record.id === next.recordId);
    if (index >= 0) timeline[index] = { ...timeline[index], reactionEvent:undefined, sceneHit:undefined, timeMs, damage: damage.value };
    else {
      next.recordId = nextRecordId(next.project);
      timeline.push({ id: next.recordId, actor: next.actorId, kind: 'damage', definition: `${next.actorId}-real-damage`,
        timeMs, order: Math.max(-1, ...timeline.map(record => record.order)) + 1, damage: damage.value });
    }
    const snapshot = selectedHit.value?.snapshot;
    if (snapshot && !damage.value.capture?.recordId) {
      const hit = timeline.find(record => record.id === next.recordId)!;
      const source = captures.value.filter(record => record.id !== hit.id && (record.timeMs < timeMs
        || record.timeMs === timeMs && record.order < hit.order)).sort((a,b) => b.timeMs - a.timeMs || b.order - a.order)[0];
      let recordId = source?.id;
      if (!recordId && skill.value?.id === snapshot.sourceSkillId) recordId = hit.id;
      recordId ??= addCalculatorCapture(next.project, hit.actor, snapshot.sourceSkillId, timeMs, hit.id);
      damage.value.capture = { recordId, phase: 'before' };
      next.project.timeline.find(record => record.id === hit.id)!.damage = damage.value;
    } else if (damage.value.capture) damage.value.capture.phase ??= 'before';
  } else if (standalone.value) {
    const i=timeline.findIndex(r=>r.id===next.recordId);
    const reaction = standalone.value;
    if (i>=0) timeline[i]={...timeline[i],timeMs,reactionEvent:{...reaction, facts:damage.value.facts, effectApplications:damage.value.effectApplications,
      contributors: transformative.value ? reaction.contributors.map(owner => ({ ...owner, crit:damage.value.crit })) : reaction.contributors }};
  } else if (sceneHit.value) {
    const index = timeline.findIndex(record => record.id === next.recordId);
    if (index >= 0) {
      const scene = sceneHit.value;
      timeline[index] = { ...timeline[index], timeMs, sceneHit: { ...scene,
        triggered: scene.triggered ?? true, targetHit: scene.targetHit ?? true, elementLevelCo: scene.elementLevelCo ?? 1 } };
    }
  }
  return damageCalculatorSchema.parse(next);
}
async function createCapture() {
  error.value = '';
  try {
    if (!document.value || document.value.baseline || !hitOwner.value || !selectedHit.value?.snapshot) return;
    const timeMs = Math.round(Number(captureTime.value === '' ? hitTime.value : captureTime.value) * 1000);
    if (timeMs > Math.round(hitTime.value * 1000)) throw new Error('属性捕获时刻应早于或等于命中时刻。');
    const next = prepareDocument()!;
    const recordId = addCalculatorCapture(next.project, hitOwner.value.id, selectedHit.value.snapshot.sourceSkillId, timeMs, next.recordId);
    document.value = next;
    damage.value.capture = { recordId, phase: 'before' };
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
    const modes = ['critical', 'expected'] as const;
    type Mode = typeof modes[number];
    const results = new Map<Mode, AxisResponse['result']>();
    const tasks = new Map<number, Mode>();
    let actual: AxisResponse;
    let retry: Promise<void> | undefined;
    function complete(critical: AxisResponse['result'], expected: AxisResponse['result']) {
      const evaluation = actual.comparison?.candidates[0]?.result ?? actual.result;
      const incomplete = [evaluation, critical, expected].flatMap(result => {
        const point = result.points.find(point => point.id === recordId);
        return point?.value == null && point?.real?.structured ? [point.real.structured] : [];
      });
      const missing = incomplete.flatMap(entry => entry.requiredInputs);
      const owner = hitOwner.value?.id;
      if (owner && next && !next.baseline && missing.length) {
        const updated = new Map<string, CaptureRecord>();
        for (const { record, fields } of captureGroups.value) {
          const atSource = incomplete.some(entry => entry.trace.some(node =>
            node.context?.eventId === record.id && node.state === 'unknown'));
          if (!atSource) continue;
          const presets = missingCalculatorPresets(record.captureFacts, fields, missing, record.actor);
          if (!presets.length) continue;
          const facts = structuredClone(toRaw(record.captureFacts ?? []));
          for (const preset of presets) putHitFact(facts, preset.subject, preset.key, preset.value);
          updated.set(record.id, { ...record, captureFacts: facts });
        }
        if (updated.size) {
          document.value = { ...next, project: { ...next.project, timeline: next.project.timeline.map(row => updated.get(row.id) ?? row) } };
          retry = calculate();
          return;
        }
        const presets = missingCalculatorPresets(damage.value.facts, factFields.value, missing, owner);
        if (presets.length) {
          const draft: DamageRequest = JSON.parse(JSON.stringify(damage.value));
          for (const preset of presets) setCalculatorFact(draft, preset, owner);
          damage.value = draft;
          retry = calculate();
          return;
        }
      }
      response.value = actual;
      criticalResult.value = critical;
      expectedResult.value = expected;
      stop();
    }
    worker.onmessage = (event: MessageEvent<AxisResponse>) => {
      if (activeWorker !== worker) return;
      if (event.data.error) { error.value = event.data.error; stop(); return; }
      try {
        if (event.data.taskId === request.taskId) {
          actual = event.data;
          const evaluation = actual.comparison?.candidates[0]?.result ?? actual.result;
          for (const mode of modes) {
            const project = calculatorCritProject(next.project, recordId, mode);
            if (project === next.project) {
              results.set(mode, evaluation);
            } else {
              const id = ++taskId;
              tasks.set(id, mode);
              worker.postMessage({ taskId: id, session: 1, revision: id, project });
            }
          }
        } else {
          const mode = tasks.get(event.data.taskId);
          if (!mode) return;
          results.set(mode, event.data.result);
        }
        const critical = results.get('critical'), expected = results.get('expected');
        if (critical && expected) complete(critical, expected);
      } catch (cause) { stop(); showError(cause); }
    };
    worker.onmessageerror = worker.onerror = () => { if (activeWorker === worker) { stop(); error.value = '计算进程未完成，请重新计算。'; } };
    worker.postMessage(request);
    await calculationFinished;
    await retry;
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
  try {
    while (calculationFinished) await calculationFinished;
    const next = prepareDocument(); if (!next) return false; calculatorRequest(next, 0); if (JSON.stringify(document.value) !== JSON.stringify(next)) document.value = next; downloadJson(packDocument('damage-calculator', next), '伤害计算.json'); savedSignature.value = signature(); return true; }
  catch (cause) { showError(cause); return false; }
}
async function saveDamage() {
  if (!document.value || !selectedLabel.value || savingDamage.value) return false;
  savingDamage.value = true;
  error.value = '';
  try {
    if (calculationFinished) {
      while (calculationFinished) await calculationFinished;
    } else if (!result.value) await calculate();
    if (!result.value) return false;
    const next = prepareDocument()!;
    const before = signature();
    if (before === listed.value?.signature) return true;
    const value = point.value?.value ?? undefined;
    const id = await saveDamageSnapshot({
      name: sceneHit.value ? selectedLabel.value : [roleName.value, selectedLabel.value,
        ...(standalone.value?.family === 'swirl' ? [realElementLabel(standalone.value.element)] : [])].join(' / '),
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
  if (!input) return;
  const value = raw.trim() ? Number(raw) : input.min;
  putHitFact(damage.value.facts ??= [], { kind: 'event' }, id, { ...input.type, value });
  if (!raw.trim()) (event.target as HTMLInputElement).value = String(value);
}
function setHitOrdinal(event: Event) {
  const control = event.target as HTMLSelectElement;
  if (control.value) damage.value.hitOrdinal = Number(control.value);
  else delete damage.value.hitOrdinal;
}
function setCapture(event: Event) {
  const recordId = (event.target as HTMLSelectElement).value;
  damage.value.capture = { recordId, phase: recordId === document.value?.recordId ? 'before' : damage.value.capture?.phase ?? 'before' };
}
function leaveCalculator(action: () => void) {
  if (catalogEditor.value) catalogEditor.value.requestLeave(() => { catalogCharacter.value = undefined; requestLeave(action); });
  else if (editorDialog.value) editorDialog.value.requestLeave(() => { editor.value = undefined; requestLeave(action); });
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
      <TeamCard v-if="selectedTeam && teamProject" class="calculator-team equipment-slot-card" data-density="compact" action="replace" :name="selectedTeam.name" :members="teamProject.candidate.actors" :title="selectedTeam.name"
        :style="{ '--member-count': teamProject.candidate.actors.length || 1 }"
        aria-label="选择队伍" aria-haspopup="dialog" :disabled="!!document?.baseline" @click="picker = 'team'" />
      <button v-else type="button" class="selection-tile primary-slot equipment-slot-card" data-density="compact" data-empty="true" data-card-action="select" aria-haspopup="dialog" :disabled="!!document?.baseline" @click="picker = 'team'">
        <SlotPlaceholder label="选择队伍" />
      </button>
      <CharacterConfigurationCard v-if="character?.build" class="slot-configuration equipment-slot-card" data-density="compact" compact truncate-name
        :character-name="character.name" :configuration-name="configurationName" :build="character.build" :entries="entries" :basis="basis"
        :effective-stats="effectiveStats(character.name)" :open-label="`查看${character.name}详情`"
        :replace-label="document?.baseline ? undefined : `更换${character.name}`" @open="openCharacterDetails" @replace="openCharacters" />
      <button v-else type="button" class="selection-tile primary-slot equipment-slot-card" data-density="compact" data-empty="true" data-card-action="select" aria-haspopup="dialog"
        :disabled="!!document?.baseline" @click="openCharacters">
        <SlotPlaceholder label="选择角色" />
      </button>
      <button type="button" class="selection-tile damage-slot" data-density="compact" :data-empty="!hasDamageCard" :data-card-action="hasDamageCard ? undefined : 'select'" :class="{ 'equipment-slot-card': !hasDamageCard }" aria-label="选择伤害" aria-haspopup="dialog" :data-hit-id="damage.hit.hitId"
        :disabled="!queryCharacter || !!document?.baseline" @click="picker = 'damage'">
        <CalculatorDamageCard v-if="hasDamageCard" class="equipment-slot-card" data-density="compact" :hit="selectedChoice" :scene="sceneDefinition"
          :family="standalone?.family" :element="standalone?.element" :coefficient="standalone?.coefficient" :rules="document?.project.reactionRules" />
        <SlotPlaceholder v-else label="选择伤害" />
      </button>
      <button type="button" class="selection-tile buff-slot equipment-slot-card" data-density="compact" :data-empty="!buffIcons.length" :class="{ 'filled-slot': buffIcons.length }" data-card-action="select" aria-label="选择增益" aria-haspopup="dialog"
        :aria-describedby="buffIcons.length ? 'calculator-buff-summary' : undefined" :disabled="!queryCharacter || !!document?.baseline || !!sceneHit" @click="picker = 'buff'">
        <span v-if="buffIcons.length" class="buff-icons" aria-hidden="true">
          <span v-for="buff in buffIcons" :key="buff.id" class="buff-icon" :title="[buff.label, ...buff.rows.map(row => row.join(' '))].join('\n')">
            <GameIcon :kind="buff.icon.kind" :id="buff.icon.id" :monochrome="buff.icon.kind === 'constellations'" :size="36"><template #fallback><GameIcon kind="stats" id="elementalMastery" :size="28" /></template></GameIcon>
          </span>
        </span>
        <SlotPlaceholder v-if="!buffIcons.length" label="选择增益" />
        <span v-else id="calculator-buff-summary" role="tooltip">
          <span v-for="buff in buffIcons" :key="buff.id" class="buff-tip">
            {{ buff.label }}
            <span v-for="[name, value] in buff.rows" :key="name" class="buff-readout"><span>{{ name }}</span> <b>{{ value }}</b></span>
          </span>
        </span>
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <section class="library-section calculator-result" aria-label="计算结果">
      <header class="result-heading"><DisclosureHeading title="伤害结果" controls="calculator-result-details" :expanded="resultExpanded" @toggle="resultExpanded = !resultExpanded" /><div class="library-page-actions">
        <button class="ui-action soft" v-if="!document?.baseline && point?.value != null" data-accent="anemo" :disabled="working" @click="pinBaseline">设为比较基准</button>
        <button v-if="document?.baseline" class="ui-action soft" data-accent="pyro" @click="endComparison">结束对照</button>
        <button class="ui-action" data-accent="anemo" :disabled="working || !selectedLabel" @click="calculate">{{ working ? '计算中' : document?.baseline ? '重算候选' : '计算伤害' }}</button>
      </div></header>
      <div class="damage-totals">
        <div v-if="sceneHit"><span>{{ sceneHitDefinition?.recipient === 'character' ? '场上角色最终承伤' : '最终伤害值' }}</span>
          <output v-if="result" data-testid="calculator-value">{{ point?.value != null ? number(point.value) : sceneBaseOnly && point?.real?.baseDamage != null ? '仅能计算减伤前基数' : unavailable(result, point) }}</output><strong v-else>—</strong></div>
        <div v-if="sceneBaseOnly"><span>减伤前基数</span><output v-if="result" data-testid="calculator-scene-base">{{ number(point?.real?.baseDamage) }}</output><strong v-else>—</strong></div>
        <template v-if="!sceneHit">
          <div class="critical-total"><span>暴击伤害值 <small v-if="criticalPoint?.real?.status === 'partial'">模型估算</small></span>
            <output v-if="result" data-testid="calculator-critical">{{ criticalPoint?.value != null ? criticalFormat.format(criticalPoint.value) : unavailable(criticalResult, criticalPoint) }}</output><strong v-else>—</strong></div>
          <div class="expected-total"><span>期望伤害值 <small v-if="expectedPoint?.real?.status === 'partial'">模型估算</small></span>
            <output v-if="result" data-testid="calculator-expected">{{ expectedPoint?.value != null ? expectedFormat.format(expectedPoint.value) : unavailable(expectedResult, expectedPoint) }}</output><strong v-else>—</strong></div>
        </template>
      </div>
      <div v-if="radianceStatus" class="library-page-actions" data-testid="calculator-radiance">
        星辉状态：{{ radianceStatus }}
      </div>
      <div v-if="inactiveHit" class="library-page-actions" role="status">
        <span>{{ inactiveHit }}</span>
        <button v-if="!document?.baseline" type="button" class="ui-action soft" @click="picker = 'buff'">调整命中条件</button>
      </div>
      <div id="calculator-result-details" v-show="result && resultExpanded" class="result-details">
        <template v-if="result">
          <details v-if="diagnostics.length" class="result-support"
            :open="point?.value == null || criticalPoint?.value == null || expectedPoint?.value == null"><summary>计算条件与支持范围</summary>
            <ul aria-label="未完成的计算条件"><li v-for="message in diagnostics" :key="message">{{ message }}</li></ul>
            <button v-if="missingBuff && !document?.baseline" type="button" class="ui-action soft" data-size="md" @click="picker = 'buff'">补充增益条件</button>
          </details>
          <details v-if="point?.real?.sceneHit" class="result-support"><summary>场景冲击倍率与来源</summary>
            <dl><dt>冲击倍率</dt><dd>{{ number(point.real.sceneHit.multiplier) }}</dd>
              <dt>ElementLevelCo 系数</dt><dd>{{ number(point.real.sceneHit.elementLevelCo) }}</dd></dl>
            <p v-for="sourceRef in point.real.sceneHit.sourceRefs" :key="sourceRef">{{ sourceRef }}</p>
          </details>
        </template>
        <CalculatorFactorCards v-if="!sceneHit" :real="point?.real" :expected="expectedPoint?.real" :guaranteed-crit="!standalone && selectedHit?.critical === 'always'" :damage="damage" :buffs="buffs" />
        <template v-if="result">
          <table v-if="response?.comparison"><thead><tr><th>基准</th><th>当前候选</th><th>差值</th></tr></thead><tbody><tr><td>{{ number(baselinePoint?.value) }}</td><td>{{ number(point?.value) }}</td><td data-testid="calculator-delta">{{ number(comparisonPoint?.delta) }}</td></tr></tbody></table>
          <details v-if="!sceneHit" class="result-support"><summary>配装属性与来源</summary>
            <dl><dt>{{ damage.crit ? critNames[damage.crit] + '命中伤害' : '本次命中伤害' }}</dt><dd><output data-testid="calculator-value">{{ point?.value != null ? number(point.value) : unavailable(result, point) }}</output></dd></dl>
            <p v-if="queryCharacter?.origin === 'custom'">角色来源 / 自定义声明</p>
            <p v-if="hitOwner?.build && skill">{{ skill.name }} / 天赋 {{ hitOwner.build.talents[skill.category] }} + {{ talentBonusLabel }}</p>
            <dl><template v-for="(value, key) in point?.real?.panel.stats" :key="key"><dt>{{ realStatLabel(key) }}</dt><dd>{{ number(value) }}</dd></template></dl>
            <p v-for="entry in point?.real?.panel.contributions" :key="entry.source + ':' + entry.stat + ':' + entry.value">{{ entry.source }} / {{ realStatLabel(entry.stat) }} {{ number(entry.value) }}</p>
          </details>
        </template>
      </div>
    </section>
    <section v-if="document" class="library-section calculator-conditions"><h3>命中条件</h3>
      <label v-if="records.length > 1 && !document?.team">查看记录<select :value="document?.recordId" @change="selectRecord(($event.target as HTMLSelectElement).value)"><option v-for="record in records" :key="record.id" :value="record.id">{{ actorLabel(document!.project, record.actor) }} / {{ recordLabel(document!.project, record.id) }} / {{ record.timeMs / 1000 }}秒</option></select></label>
      <fieldset v-if="selectedLabel || records.length" :disabled="!!document?.baseline"><div class="calculator-fields">
            <label>命中时刻（秒）<input v-model.number="hitTime" type="number" min="0" max="3600" step="0.001"></label>
            <label v-if="selectedHit?.selection?.repetitions">本次命中序号<select :value="damage.hitOrdinal ?? ''" @change="setHitOrdinal">
              <option value="">未指定</option><option v-for="ordinal in selectedHit.selection.repetitions" :key="ordinal" :value="ordinal">第{{ ordinal }}击</option>
            </select></label>
            <template v-if="sceneHit">
              <label>ElementLevelCo 系数<input type="number" min="0" step="any" :value="sceneHit.elementLevelCo ?? 1" @input="($event.target as HTMLInputElement).value && setSceneCoefficient($event)" @change="setSceneCoefficient"></label>
              <label>冲击触发<select v-model="sceneTriggered"><option :value="true">已满足</option><option :value="false">未满足</option></select></label>
              <label>{{ sceneHitDefinition?.recipient === 'character' ? '场上角色受到冲击' : '当前敌人受到冲击' }}<select v-model="sceneTargetHit"><option :value="true">命中</option><option :value="false">未命中</option></select></label>
            </template>
            <label v-else-if="!standalone || transformative">暴击<select v-model="damage.crit" :disabled="selectedHit?.critical === 'always'"><option value="noncritical">非暴击</option><option value="critical">暴击</option><option value="expected">期望伤害</option></select></label>
            <label v-if="infusionChoices.length">本击队伍附魔<select v-model="partyInfusion"><option value="none">无</option><option v-for="[element, sources] in infusionChoices" :key="element" :value="element">{{ realElementLabel(element) }}元素（{{ sources.join('、') }}）</option></select></label>
            <label v-if="selectedHit?.elementBy === 'absorbedElement'">转化元素<select v-model="absorbedElement"><option value="none">无</option><option v-for="element in absorbedElements" :key="element" :value="element">{{ realElementLabel(element) }}</option></select></label>
            <label v-if="standalone?.family === 'swirl'">扩散元素<select :value="standalone.element" @change="setReactionElement"><option v-for="element in transformativeElements.swirl" :key="element" :value="element">{{ realElementLabel(element) }}</option></select></label>
            <label v-if="!standalone && !sceneHit">反应<select v-model="reactionType"><option v-for="reaction in reactionChoices" :key="reaction" :value="reaction">{{ reactionNames[reaction] }}</option></select></label>
            <label v-for="input in hitInputs" :key="input.id">{{ inputNames[input.id] ?? queryCharacter?.metadata.facts?.[input.id]?.label ?? buffFactNames[input.id] ?? input.id }}
              <select v-if="input.id === 'counterCharge'" :value="subjectFacts(damage.facts, { kind: 'event' })?.[input.id]?.value?.value ?? ''" @change="setInput(input.id, $event)"><option :value="0">0 / 无反击加成</option><option :value="1">1 / 一档反击</option><option :value="2">2 / 满档／完美反击</option></select>
              <input v-else type="number" :min="input.min" :max="talentInputMaximum(input, hitOwner?.build?.constellation ?? 0)" :step="input.integer ? 1 : 'any'" :value="subjectFacts(damage.facts, { kind: 'event' })?.[input.id]?.value?.value ?? ''" @input="($event.target as HTMLInputElement).value && setInput(input.id, $event)" @change="setInput(input.id, $event)">
            </label>
            <template v-if="selectedHit?.snapshot"><label>属性捕获来源<select :value="damage.capture?.recordId ?? ''" @change="setCapture"><option v-for="record in captures" :key="record.id" :value="record.id">{{ actorLabel(document!.project, record.actor) }} / {{ recordLabel(document!.project, record.id) }} / {{ record.timeMs / 1000 }}秒</option></select></label><label>捕获时点<select :value="damage.capture?.phase ?? ''" @change="damage.capture = { recordId: damage.capture?.recordId ?? null, phase: (($event.target as HTMLSelectElement).value || null) as 'before' | 'after' | null }"><option value="before">记录生效前</option><option :disabled="damage.capture?.recordId === document.recordId" value="after">记录生效后</option></select></label></template>
          </div>
          <p v-if="sceneHitDefinition" class="muted">{{ sceneHitDefinition.trigger }}。<template v-if="sceneHitDefinition.cooldownMs">冷却 {{ sceneHitDefinition.cooldownMs / 1000 }} 秒。</template>
            <template v-if="sceneHitDefinition.delayMs">触发后 {{ sceneHitDefinition.delayMs }} 毫秒命中。</template><template v-if="sceneHitDefinition.radius">冲击范围 {{ sceneHitDefinition.radius }} 米。</template></p>
          <details v-for="group in captureGroups" :key="group.record.id"><summary>{{ group.title }}</summary><div class="calculator-fields">
            <label v-for="field in group.fields" :key="JSON.stringify([field.subject, field.key])">{{ captureFieldLabel(field) }}
              <input v-if="field.type.kind === 'quantity'" type="number" :step="field.type.unit === 'count' ? 1 : 'any'"
                :value="subjectFacts(group.record.captureFacts, field.subject)?.[field.key]?.value?.value ?? calculatorFactPreset(field, group.record.actor).value" @change="editCaptureFact(group.record, field, $event)">
              <select v-else :value="String(subjectFacts(group.record.captureFacts, field.subject)?.[field.key]?.value?.value ?? calculatorFactPreset(field, group.record.actor).value)" @change="editCaptureFact(group.record, field, $event)">
                <template v-if="field.type.kind === 'boolean'"><option value="true">是</option><option value="false">否</option></template>
                <option v-else v-for="option in field.type.values" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
          </div></details>
      </fieldset>
          <fieldset class="calculator-scene-settings" :disabled="!!document.baseline"><BattleSceneSettings :selections="document.project.sceneEffects" @change="updateScenes" /></fieldset>
          <TalentHealingForm v-if="document && !document.baseline" :members="document.project.candidate.actors" @apply="(actor,recipient,heal,facts)=>recordBeforeHit((p,t)=>addTalentHeal(p,actor,recipient,heal,t,facts))" />
          <AuraObservationForm v-if="document && hitOwner && !document.baseline" :members="document.project.candidate.actors.filter(a=>a.build)" :actor="hitOwner.id" @apply="(actor,aura)=>recordBeforeHit((p,t)=>addAuraObservation(p,actor,t,aura))" />
          <ReactionRecordForm v-if="document && hitOwner && !document.baseline" :project="document.project" :actor="hitOwner.id" :time-ms="Math.round(hitTime*1000)" :before="document.recordId" :changes="result?.combatChanges"
            @reaction="(actor,reaction,element)=>recordBeforeHit((p,t)=>addReactionObservation(p,actor,t,reaction,element))"
            @pickup="(actor,source,effect)=>recordBeforeHit((p,t)=>addParticlePickup(p,actor,source,t,effect))" />
          <fieldset v-if="selectedHit?.snapshot" :disabled="!!document?.baseline"><label>独立捕获时刻（秒）<input v-model="captureTime" type="number" min="0" max="3600" step="0.001" :placeholder="String(hitTime)"></label><button class="ui-action soft" data-accent="hydro" @click="createCapture">添加属性捕获点</button></fieldset>
    </section>
    <section v-if="character?.build" class="library-section calculator-build" aria-label="角色配置">
      <header class="result-heading"><h3>角色配置</h3>
        <button v-if="document && !document.team && document.project.candidate.actors.length > 1" class="ui-action soft" data-size="md" @click="picker = 'candidate'">试配队员</button>
      </header>
      <CharacterStatPanel v-if="candidatePanel" title="实时角色面板" :element="character.build.character.identity.element ?? 'physical'" :stats="candidatePanel.stats" />
      <div class="mobile-rolls">
        <EffectiveRollSummary inline stacked :basis="basis" :items="entries.flatMap(entry => entry.item ?? [])" :selected-stats="effectiveStats(character.name)" />
      </div>
      <h3>圣遗物</h3>
      <ArtifactEquipmentGrid :entries="entries" readonly :effective-stats="effectiveStats(character.name)"
        :wearers="[{name:character.name,id:character.build.character.id}]" @inspect="slot => inspectedArtifact = entries.find(entry => entry.slot === slot)?.item" />
      <details v-if="!document?.baseline" class="result-support"><summary>角色定义</summary>
        <div class="library-page-actions"><button class="ui-action soft" data-accent="hydro" :disabled="working" @click="reviewContent">检查当前内容</button>
          <button class="ui-action soft" data-accent="hydro" @click="exportMetadata">导出角色定义副本</button>
          <button class="ui-action soft" data-accent="hydro" @click="metadataFile?.click()">导入角色定义</button></div>
        <input ref="metadataFile" hidden type="file" accept=".json,application/json" aria-label="导入计算器角色定义" @change="importMetadata">
      </details>
    </section>
    <ArtifactDetail v-if="inspectedArtifact" :item="inspectedArtifact" readonly @close="inspectedArtifact = undefined" />
    <CombatChangeList v-if="document" :changes="result?.combatChanges" :team="document.project.candidate.actors" />
    <CalculatorEnemySettings :enemy="enemy" :element="standalone?.element ?? hitElement" :disabled="!document || !!document.baseline" @change="enemy = $event" />
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
        <CharacterCatalogBrowser :selected-id="queryCharacter?.id" @select="chooseCatalogCharacter" />
        <ManualCharacterImport v-if="catalogCharacter" ref="catalogEditor" :initial-character="catalogCharacter"
          @saved="useSavedCharacter" @close="catalogCharacter = undefined" />
      </template>
    </CharacterSelectionDialog>
    <CalculatorDamagePicker v-if="picker === 'damage'" :choices="hitChoices" :group-settings="queryCharacter?.metadata.calculator?.groups" :selected="selectedChoice" :scenes="sceneChoices"
      :swirl-element="standalone?.family === 'swirl' ? standalone.element : defaultReactionElement('swirl')" :selected-reaction="standalone?.family" :reaction-rules="document?.project.reactionRules"
      :selected-scene="sceneHit && definitionKey(sceneHit.scene)" @close="picker = undefined" @select="selectDamage" @reaction="selectReaction" @scene="selectSceneHit" />
    <CalculatorBuffPicker v-if="picker === 'buff' && hitOwner" :choices="buffs" :damage="damage" :actor-id="hitOwner.id" :intervals="intervals"
      :fields="factFields" :hit-facts="hitFacts" :time="hitTime" @close="picker = undefined" @apply="applyBuffs" />
    <CharacterSelectionDialog v-if="picker === 'candidate' && document" title="试配队员" :members="document.project.candidate.actors" :selected-id="document.actorId" @close="picker = undefined" @select="switchActor" />
    <CharacterDetailDialog v-if="editor" ref="editorDialog" :character-id="editor.characterId" :preset-id="editor.presetId" :complete="editor.complete"
      :detached="editor.snapshot && { account: editor.snapshot, effectiveStats: effectiveStats(character?.name ?? ''), apply: saveSnapshotDraft }"
      @configuration-saved="useSavedConfiguration" @close="editor = undefined" />
    <WorkbenchDialog v-if="contentReview" title="更新计算副本内容" @close="contentReview = undefined"><p>替换当前试配队员的内容定义，保留培养与装备选择。账号和原轴保留原记录，已有条件与效果引用继续校验。</p><ul v-if="contentReview.changes.length"><li v-for="change in contentReview.changes" :key="change">{{ change }}</li></ul><p v-else>当前定义已与内置内容一致。</p><button v-if="contentReview.changes.length" class="ui-action" data-accent="hydro" @click="applyContent">采用当前内容并重算</button></WorkbenchDialog>
    <UnsavedChangesDialog v-if="discardOpen" @continue="cancelDiscard" @discard="discardChanges" @save="saveAndLeave(selectedLabel ? saveDamage : save)" />
  </section>
</template>

<style scoped>
.damage-calculator,.calculator-result,.calculator-conditions,.calculator-build { display:grid; min-width:0; gap:12px; }
.damage-calculator { container:calculator / inline-size; }
.damage-toolbar { display:flex; align-items:center; justify-content:space-between; }
.calculator-selections { display:grid; grid-auto-rows:140px; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.calculator-selections > * { box-sizing:border-box; min-height:0; }
.selection-tile { box-sizing:border-box; display:flex; align-items:center; min-width:0; width:100%; }
.filled-slot:disabled,.calculator-team:disabled { opacity:1; }
.selection-tile strong { display:block; overflow-wrap:anywhere; font-size:var(--font-control); }
.selection-tile small,.damage-totals small { font-size:var(--font-body); color:var(--muted); font-weight:400; }
.filled-slot { justify-content:flex-start; padding:10px 16px; text-align:left; }
.damage-slot[data-empty=false] { display:grid; grid-template-rows:minmax(0,1fr); align-items:stretch; padding:0; border:0 solid transparent; border-radius:10px; background:transparent; --button-hover-border:transparent; --damage-slot-highlight:color-mix(in srgb,var(--element-hydro-primary) 14%,var(--surface-raised)); }
.damage-slot :deep(.choice-card) { box-sizing:border-box; min-height:0; grid-template-rows:minmax(0,1fr); }
.damage-slot:enabled:is(:active,:focus-visible) :deep(.choice-card) { background:var(--damage-slot-highlight); }
@media (any-hover:hover) {
  .damage-slot:enabled:hover :deep(.choice-card) { background:var(--damage-slot-highlight); }
}
.damage-slot :deep(.details) { grid-template-rows:auto minmax(0,1fr) auto; }
.damage-slot :deep(.details > :first-child),.damage-slot :deep(.source),.damage-slot :deep(.code) { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.damage-slot :deep(.note) { overflow:hidden; }
.damage-slot :deep(.value) { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
.damage-slot:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.buff-slot { position:relative; }
.buff-icons { display:flex; flex-wrap:wrap; gap:6px; max-height:100%; overflow-y:auto; }
.buff-icon { display:inline-flex; }
.buff-icon :deep(.game-icon) { pointer-events:none; }
.buff-slot [role=tooltip] { display:none; position:absolute; top:100%; left:0; right:0; z-index:2; padding:8px 12px; border:1px solid var(--line); border-radius:7px; background:var(--surface); color:var(--ink); font-size:14px; }
.buff-slot:focus-visible [role=tooltip] { display:grid; gap:6px; }
.buff-tip,.buff-readout { display:block; overflow-wrap:anywhere; }
button.calculator-team { container-type:inline-size; grid-template-columns:minmax(0,1fr) auto; align-content:center; gap:4px; --portrait-limit:var(--team-portrait-size); }
.calculator-team :deep(strong) { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.calculator-team :deep(.team-row-members) { grid-row:2; grid-column:1/-1; flex-wrap:nowrap; gap:4px;
  --team-portrait-size:min(var(--portrait-limit),calc((100cqi + 4px) / var(--member-count) - 4px)); }
.calculator-team :deep(.team-row-trailing) { grid-row:1; grid-column:2; }
.result-heading { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.result-heading { justify-content:space-between; }.damage-calculator h3 { margin:0; font-size:var(--font-control); }
.damage-totals { display:grid; grid-template-columns:1fr 1fr; padding:16px; border:1px solid var(--line); border-radius:7px; background:var(--surface); }
.damage-totals > div { display:grid; gap:4px; min-width:0; padding-inline:8px; }
.damage-totals > div + div { padding-left:24px; border-left:1px solid var(--line); }
.damage-totals small { margin-left:4px; }
.damage-totals output,.damage-totals strong { font-size:var(--font-title); font-weight:700; font-variant-numeric:tabular-nums; color:inherit; overflow-wrap:anywhere; }
.critical-total { color:var(--element-pyro-deep); }
.expected-total { color:var(--element-anemo-deep); }
.result-details { display:grid; gap:12px; min-width:0; }
.calculator-build { grid-template-columns:minmax(0,1fr); }
.calculator-build .mobile-rolls { display:none; }
.calculator-build .character-stats { margin:0; }
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
@container (max-width:240px) {
  .calculator-selections :deep(.configuration-title) { display:grid; grid-template-columns:minmax(0,1fr); gap:1px; }
}
@container calculator (max-width:800px) {
  .calculator-selections :deep(.configuration-body > .effective-roll-summary.inline.readonly.stacked) { display:none; }
  .calculator-build .mobile-rolls { display:block; }
}
@media(max-width:600px) {
  .calculator-selections { grid-auto-rows:114px; }.filled-slot { padding:8px; gap:6px; }
  .damage-slot :deep(.choice-card) { grid-template-columns:40px minmax(0,1fr); gap:6px; }
  .damage-slot :deep(.portrait) { width:40px; height:40px; }
  .damage-slot :deep(.portrait > *) { transform:scale(.84); }
  .damage-slot :deep(.details) { gap:2px; line-height:1.25; }
  .damage-slot :deep(.identity) { line-height:1.15; }
  .damage-slot :deep(.source) { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; white-space:normal; }
  .damage-totals { padding:10px 4px; }
  .damage-totals > div + div { padding-left:8px; }
}
</style>
