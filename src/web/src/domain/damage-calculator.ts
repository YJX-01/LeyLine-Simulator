import { definitionKey, findBuildHit, matchingSceneHits, putHitFact, subjectFacts } from '@leyline/schema';
import { APP_VERSION } from '@leyline/schema/version';
import { readWorkbenchDocument } from './content-document';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { damageCalculatorSchema, projectSchema, type AccountCharacter, type LocalAccount, type AxisRequest, type Build, type DamageCalculatorDocument, type DamageRequest, type Enemy, type Project, type SceneHitRequest } from '@leyline/schema';
import { loadAccountGameData } from './account-presentation';
import { addActorFromBuild, addAttributeCapture } from './real-project';
import { createEmptyProject, nextRecordId } from './workbench-project';
import { accountSlotLabels, cloneAccount, type AccountArtifact } from './account';
import { calculationArtifact, physicalArtifact, resolveBuildEquipment } from './build-snapshot';
import { orderedArtifactContent } from './showcase-inventory';
import { prepareStructuredBuilds, projectBuffContext } from '@leyline/engine';
import { applyCalculatorBuffs, calculatorBuffChecked, calculatorBuffChoices, effectInstanceInRuntime, reconcileTeammateCalculatorEffects, resolveBuffSelection } from './calculator-buffs';
import { calculatorFactPreset, calculatorHitFactFields, calculatorHitRadiance, calculatorIntervals, calculatorOnFieldActor, calculatorPersonalInfusion, derivedTeamFactKeys, hitPremiseFacts, presetCalculatorHitInputs, readCalculatorPersonalInfusion, readCalculatorRadiance, selectedHitBranchPredicate, selectionEnumFallback, writeCalculatorPersonalInfusion, writeCalculatorRadiance } from './calculator-conditions';

/** Read wearing references even when Mona supplied no cultivation/weapon build. Never borrow a showcase. */
export async function readCalculatorSource(account: LocalAccount, characterId: string, kind: 'local' | 'showcase') {
  const entry = account.characters.find(character => character.id === characterId);
  if (!entry) throw new Error('所选角色已不存在。');
  const character: AccountCharacter = JSON.parse(JSON.stringify(entry));
  if (kind === 'showcase') {
    if (!character.showcase) throw new Error('所选来源没有展柜配装。');
    character.build = character.showcase.build;
    character.equipment = {};
    return { character, equipment: undefined };
  }
  const artifacts: Build['artifacts'] = Object.entries(character.equipment).map(([slot, id]) => {
    const item = account.artifacts.find(item => item.id === id);
    if (!item?.real || item.mona?.setIdentityPending || item.slot !== slot) throw new Error('本地装备的数值或套装身份待补全。');
    return calculationArtifact(JSON.parse(JSON.stringify(item.real)), item.inventoryId === null ? undefined : account.id);
  });
  const equipment = await resolveBuildEquipment(artifacts, character.build);
  if (character.build) Object.assign(character.build, equipment);
  return { character, equipment };
}

/** Present independent calculation snapshots in the shared character editor. */
export function calculatorSnapshotDraft(account: LocalAccount, build: Build) {
  const current = account.characters.find(entry => {
    const definition = entry.build?.character ?? entry.showcase?.build.character;
    return definition ? definition.id === build.character.id && definition.namespace === build.character.namespace
      : build.character.namespace === 'builtin' && entry.name === build.character.identity.name;
  });
  const draft = cloneAccount(account);
  const character: AccountCharacter = {
    ...current, id: current?.id ?? crypto.randomUUID(), name: build.character.identity.name,
    attack: 0, weapon: build.weapon?.name ?? '', equipment: {}, build,
  };
  for (const piece of build.artifacts) {
    const snapshot: AccountArtifact = {
      id: piece.id, slot: piece.slot, real: physicalArtifact(piece), attack: 0,
      name: `${build.sets.find(set => set.id === piece.setId)?.name ?? '圣遗物'} ${accountSlotLabels[piece.slot]}`,
    };
    const local = piece.inventory?.accountId === account.id
      ? draft.artifacts.find(item => item.id === piece.inventory?.itemId) : undefined;
    if (local?.real && local.inventoryId !== null && !local.mona?.setIdentityPending
      && orderedArtifactContent(local, build.artifactMain) === orderedArtifactContent(snapshot, build.artifactMain)) {
      character.equipment[piece.slot] = local.id;
    } else {
      const id = crypto.randomUUID();
      draft.artifacts.push({ ...snapshot, id, real: { ...snapshot.real!, id }, inventoryId: null });
      character.equipment[piece.slot] = id;
    }
  }
  if (current) draft.characters[draft.characters.findIndex(entry => entry.id === current.id)] = character;
  else draft.characters.push(character);
  return { account: draft, character };
}

/** Explicit review candidate. Saved/custom definitions are never silently rebound on file open. */
export async function prepareCalculatorContentUpdate(input: DamageCalculatorDocument) {
  const document = damageCalculatorSchema.parse(input);
  if (document.baseline) throw new Error('请先结束对照，再更新计算副本的内容。');
  const actor = document.project.candidate.actors.find(actor => actor.id === document.actorId)!;
  const before = actor.build!;
  if (before.character.origin !== 'builtin') throw new Error('自定义角色须保留其定义，不能替换为内置内容。');
  const [character, weapon, sets, data] = await Promise.all([
    getCharacter(before.character.id), before.weapon ? getWeapon(before.weapon.id) : null, Promise.all(before.sets.map(set => getArtifactSet(set.id))), loadAccountGameData(),
  ]);
  const after: Build = { ...before, character, weapon, sets, artifactMain: data.main, sources: [...before.sources, ...data.sources.filter(source => !before.sources.some(existing => existing.id === source.id))], artifactMainSourceRefs: data.artifactMainSourceRefs, dataVersion: data.catalog.version };
  const labels = { character: `角色定义（${before.character.revision} → ${character.revision}）`, weapon: '武器定义', sets: '套装定义', artifactMain: '圣遗物主词条表', dataVersion: '内容版本' };
  const changes = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => labels[key]);
  for (const record of document.project.timeline) {
    if (record.actor !== actor.id || !record.damage || !findBuildHit(before, record.damage.hit)) continue;
    const previous = record.damage.hit;
    const owner = previous.definition.group === 'characters' ? character : previous.definition.group === 'weapons' ? weapon : sets.find(set => set.id === previous.definition.id && set.namespace === previous.definition.namespace);
    if (!owner || owner.namespace !== previous.definition.namespace || owner.id !== previous.definition.id) throw new Error('新版缺少已选命中的定义：' + previous.hitId);
    const ref = { ...previous, definition: { ...previous.definition, revision: owner.revision } };
    if (!findBuildHit(after, ref)) throw new Error('新版缺少已选命中：' + ref.hitId);
    record.damage.hit = ref;
  }
  actor.build = after;
  // Refresh only the metadata of this actor's carried calculation snapshots; keep authored graph rules/revisions intact.
  const definitionIds = new Set([actor.character, actor.weapon, ...document.project.timeline.filter(record => record.actor === actor.id).map(record => record.definition)]);
  for (const definition of document.project.definitions) if (definitionIds.has(definition.id) && !definition.effects.length && (!definition.nodes.length || definition.nodes.every(node => node.op === 'game-damage'))) {
    definition.version = after.dataVersion;
    const reference = definition.id === actor.weapon ? (weapon ? `${weapon.id}@${after.dataVersion}` : after.dataVersion) : `${character.id}@${character.revision}`;
    definition.source = { kind: 'user', reference, verified: false };
  }
  return { document: damageCalculatorSchema.parse(document), changes };
}

/** A user-selected single query; never expands an action into an attack sequence. */
export function createDamageCalculation(build: Build, damage: DamageRequest, enemy: Enemy): DamageCalculatorDocument {
  const project = createEmptyProject();
  project.enemy = enemy;
  const actorId = addActorFromBuild(project, build);
  damage = { ...damage, ...(damage.facts ? { facts: damage.facts.map(row => row.subject.kind === 'actor' && row.subject.id === 'owner'
    ? { ...row, subject: { kind: 'actor', id: actorId } } : row) } : {}) };
  const recordId = nextRecordId(project);
  project.timeline.push({ id: recordId, actor: actorId, timeMs: 0, order: 0, kind: 'damage', definition: `${actorId}-real-damage`, damage });
  return damageCalculatorSchema.parse({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId, recordId });
}

export function addCalculatorCapture(project: Project, actor: string, skill: string, timeMs: number, hitId?: string) {
  const id = addAttributeCapture(project, actor, skill, timeMs);
  const hit = project.timeline.find(record => record.id === hitId);
  if (hit && hit.timeMs === timeMs) {
    const order = hit.order;
    for (const record of project.timeline) {
      if (record.id === id) record.order = order;
      else if (record.timeMs === timeMs && record.order >= order) record.order++;
    }
  }
  return id;
}

export function calculatorSceneHits(project: Project | undefined) {
  const choices = new Map((project?.sceneEffects ?? []).filter(({ definition }) => definition.hits?.length)
    .map(({ definition }) => [definitionKey(definition), definition]));
  return [...choices.values()];
}

export function addCalculatorSceneHit(project: Project, actorId: string, scene: SceneHitRequest['scene'], timeMs: number, replaceId?: string) {
  const previous = project.timeline.find(record => record.id === replaceId);
  if (replaceId && (!previous || previous.kind !== 'damage' || previous.actor !== actorId)) throw new Error('场景冲击的计算记录已失效。');
  if (!matchingSceneHits(project.sceneEffects, scene).length) throw new Error('请先选择对应难度的场景效果。');
  const id = previous?.id ?? nextRecordId(project);
  const record: Project['timeline'][number] = {
    id, actor: actorId, timeMs, order: previous?.order ?? Math.max(-1, ...project.timeline.map(entry => entry.order)) + 1,
    kind: 'damage', definition: `${actorId}-real-damage`,
    sceneHit: { scene, elementLevelCo: 1, triggered: true, targetHit: true },
  };
  project.timeline = previous ? project.timeline.map(entry => entry.id === id ? record : entry) : [...project.timeline, record];
  if (!previous && project.objective.damageIds) project.objective.damageIds.push(id);
  return id;
}

export function calculatorRequest(input: DamageCalculatorDocument, taskId: number): AxisRequest {
  const document = damageCalculatorSchema.parse(input);
  for (const project of [document.project, ...document.baseline ? [document.baseline] : []]) {
    const prepared = prepareStructuredBuilds(project.candidate.actors.map(({ id, build, element }) => ({ id, build, element })), project.reactionRules, project.sceneEffects);
    if (!prepared.ok) throw new Error(prepared.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  }
  return calculatorWorkerRequest(document, taskId);
}

/** Evaluate one headline using the candidate loadout and the same encounter and hit. */
export function calculatorCritProject(project: Project, recordId: string, mode: 'critical' | 'expected'): Project {
  const hit = project.timeline.find(record => record.id === recordId);
  if (!hit) return project;
  let variant = hit;
  if (hit.damage && hit.damage.crit !== mode) {
    const build = project.candidate.actors.find(actor => actor.id === hit.actor)?.build;
    if (findBuildHit(build, hit.damage.hit)?.hit.critical === 'always') return project;
    variant = { ...hit, damage: { ...hit.damage, crit: mode } };
  } else if (hit.reactionEvent) {
    const reaction = hit.reactionEvent;
    // The supplied joint distribution already covers exactly the contributors using expectation.
    if (mode === 'expected' && reaction.jointCrit || reaction.contributors.every(owner => owner.crit === mode)) return project;
    variant = { ...hit, reactionEvent: { ...reaction, jointCrit: undefined,
      contributors: reaction.contributors.map(owner => ({ ...owner, crit: mode })) } };
  }
  if (variant === hit) return project;
  return { ...project, timeline: project.timeline.map(record => record === hit ? variant : record) };
}

/** The Worker prepares and validates the team when evaluating. File imports are checked before installation. */
export function calculatorWorkerRequest(document: DamageCalculatorDocument, taskId: number): AxisRequest {
  if (!document.baseline) return { taskId, session: 1, revision: taskId, project: document.project };
  const baseline = document.baseline;
  for (const key of ['timeline', 'conditions', 'enemy', 'combatStates', 'sceneEffects', 'reactionRules', 'actionStates', 'objective', 'effectRevisions', 'definitions'] as const) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(document.project[key])) throw new Error('同轴比较须保留基准的记录、条件与定义，请先结束对照。');
  }
  if (baseline.candidate.actors.length !== document.project.candidate.actors.length) throw new Error('比较队员已变化。');
  const replacements = document.project.candidate.actors.flatMap(actor => {
    const before = baseline.candidate.actors.find(entry => entry.id === actor.id);
    if (before && !before.build && !actor.build && before.element === actor.element) return [];
    if (!before?.build || !actor.build || actor.build.character.id !== before.build.character.id) throw new Error('比较须使用同一角色的完整配装。');
    return [{ actorId: actor.id, build: actor.build }];
  });
  return { taskId, session: 1, revision: taskId, project: baseline, candidates: [{ id: 'calculator-candidate', name: '当前候选', replacements }] };
}

export function parseDamageCalculator(content: string): DamageCalculatorDocument {
  if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) throw new Error('计算文件超过8 MiB。');
  return readWorkbenchDocument('damage-calculator', JSON.parse(content), data => {
    const document = damageCalculatorSchema.parse(data);
    calculatorRequest(document, 0);
    return document;
  }, content);
}

export function copyProjectForCalculator(input: Project): DamageCalculatorDocument {
  const project = projectSchema.parse(input);
  const record = project.timeline.find(record => record.kind === 'damage' && (record.damage || record.reactionEvent || record.sceneHit));
  const actorId = record?.actor ?? project.candidate.actors.find(actor => actor.build)?.id;
  if (!actorId) throw new Error('当前轴没有完整配装，请先准备队伍。');
  return damageCalculatorSchema.parse({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId, ...(record ? { recordId: record.id } : {}) });
}

function validEffectInstanceIds(project: Project): Set<string> | undefined {
  const context = projectBuffContext(project, true);
  if (!context) return undefined;
  const ids = new Set<string>();
  for (const group of context.instances.values()) {
    for (const instance of group) {
      if (effectInstanceInRuntime(instance, context)) ids.add(instance.id);
    }
  }
  return ids;
}

function presetEnabledBuffFields(choices: ReturnType<typeof calculatorBuffChoices>, damage: DamageRequest, actorId: string) {
  for (const choice of choices) {
    if (choice.disabled || !calculatorBuffChecked(choice, damage)) continue;
    for (const field of choice.fields) {
      if (field.fromTrigger || field.inherited || !field.subject) continue;
      if (field.subject.kind === 'team' && derivedTeamFactKeys.has(field.key)) continue;
      if (field.subject.kind === 'event' && ['critMode', 'reactionMode'].includes(field.key)) continue;
      if (subjectFacts(damage.facts, field.subject)?.[field.key]?.value != null) continue;
      putHitFact(damage.facts ??= [], field.subject, field.key, calculatorFactPreset(field, actorId), 'preset');
    }
  }
}

function presetActorDefaults(damage: DamageRequest, targetActorId: string, intervals: ReturnType<typeof calculatorIntervals>, onFieldDefault: boolean) {
  const target = { kind: 'actor' as const, id: targetActorId };
  const existing = subjectFacts(damage.facts, target);
  if (intervals.onField === undefined && existing?.onField?.value == null) {
    putHitFact(damage.facts ??= [], target, 'onField', { kind: 'boolean', value: onFieldDefault }, 'preset');
  }
  if (intervals.hpRatio === undefined && existing?.hpRatio?.value == null) {
    putHitFact(damage.facts ??= [], target, 'hpRatio', { kind: 'quantity', unit: 'scalar', value: 1 }, 'preset');
  }
  if (intervals.shielded === undefined && existing?.shielded?.value == null) {
    putHitFact(damage.facts ??= [], target, 'shielded', { kind: 'boolean', value: false }, 'preset');
  }
}

function reconcileState(inputProject: Project, actorId: string, inputDamage: DamageRequest, timeMs = 0, recordId?: string) {
  let project: Project = JSON.parse(JSON.stringify(inputProject));
  const damage: DamageRequest = JSON.parse(JSON.stringify(inputDamage));
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const build = actor?.build;
  const selected = findBuildHit(build, damage.hit);
  const intervals = calculatorIntervals(project, actorId, timeMs, recordId);
  if (!selected) return { project, damage, choices: [] as ReturnType<typeof calculatorBuffChoices>, intervals };

  project.timeline = project.timeline.filter(entry => !entry.id.startsWith('calc-cast-') || (entry.actor === actorId && entry.skillId === selected.talent?.id));
  damage.crit = selected.hit.critical === 'always' ? 'critical' : (damage.crit ?? 'critical');
  damage.reaction ??= 'none';
  if (selected.hit.selection?.repetitions) damage.hitOrdinal = Math.min(Math.max(1, damage.hitOrdinal ?? 1), selected.hit.selection.repetitions);
  else delete damage.hitOrdinal;

  const existingRecord = recordId ? project.timeline.find(entry => entry.id === recordId) : undefined;
  presetCalculatorHitInputs(damage, selected.talent?.inputs ?? [], existingRecord?.facts);

  const radiance = calculatorHitRadiance(selected);
  if (radiance) {
    const existing = subjectFacts(damage.facts, { kind: 'actor', id: actorId })?.radiance;
    const current = readCalculatorRadiance(damage, actorId);
    if (!current || !radiance.validOptions.includes(current) || existing?.provenance === 'preset') {
      writeCalculatorRadiance(damage, actorId, radiance.defaultValue, 'preset');
    }
  }

  const branchPredicate = selectedHitBranchPredicate(selected);
  for (const setting of hitPremiseFacts(branchPredicate, selected.entity.calculation.bundle, {
    constellation: build?.constellation ?? 0,
    ascension: build?.ascension ?? 6,
    hitInputs: selected.talent?.inputs,
  })) {
    if (radiance && setting.key === 'radiance') continue;
    const subject = setting.subject ?? { kind: 'actor' as const, id: actorId };
    const existing = subjectFacts(damage.facts, subject)?.[setting.key];
    if (existing?.value == null || existing.provenance === 'preset') {
      putHitFact(damage.facts ??= [], subject, setting.key, setting.value, 'preset');
    }
  }

  const infusion = calculatorPersonalInfusion(selected, build?.constellation ?? 0, actorId);
  if (infusion) {
    const existing = subjectFacts(damage.facts, { kind: 'actor', id: actorId })?.[infusion.key];
    if (readCalculatorPersonalInfusion(damage, actorId, infusion.key) === undefined || existing?.provenance === 'preset') {
      writeCalculatorPersonalInfusion(damage, actorId, infusion.key, infusion.defaultValue, 'preset');
    }
  }

  const dealer = selected.hit.coordinated ? calculatorOnFieldActor(project, damage, timeMs, recordId) : undefined;
  const dealerId = dealer?.id ?? actorId;
  if (dealer && dealer.id !== actorId) {
    presetActorDefaults(damage, actorId, intervals, false);
    presetActorDefaults(damage, dealer.id, calculatorIntervals(project, dealer.id, timeMs, recordId), true);
  } else {
    presetActorDefaults(damage, actorId, intervals, true);
  }

  const hitFields = calculatorHitFactFields(selected, actorId, dealerId, build?.constellation ?? 0);
  for (const branch of Object.values(selected.hit.damage)) {
    for (const setting of selectionEnumFallback(branch.predicate, selected.entity.calculation.bundle, hitFields, damage.facts, dealerId)) {
      const subject = setting.subject ?? { kind: 'actor' as const, id: dealerId };
      if (subjectFacts(damage.facts, subject)?.[setting.key]?.value == null) {
        putHitFact(damage.facts ??= [], subject, setting.key, setting.value, 'preset');
      }
    }
  }
  for (const field of hitFields) {
    if (!field.subject || field.subject.kind === 'team' && derivedTeamFactKeys.has(field.key)) continue;
    if (field.subject.kind === 'event' && ['critMode', 'reactionMode'].includes(field.key)) continue;
    if (subjectFacts(damage.facts, field.subject)?.[field.key]?.value != null) continue;
    putHitFact(damage.facts ??= [], field.subject, field.key, calculatorFactPreset(field, actorId), 'preset');
  }

  if (existingRecord) existingRecord.damage = damage;
  if (project.effectRevisions?.length) {
    const validIds = validEffectInstanceIds(project);
    if (validIds) {
      const kept = project.effectRevisions.filter(entry => validIds.has(entry.instanceId));
      project.effectRevisions = kept.length ? kept : undefined;
    }
  }

  const choices = calculatorBuffChoices(project, actorId, damage, timeMs, recordId, intervals);
  if (damage.effectApplications?.length) {
    const applicable = new Set(choices.filter(option => option.explicit && !option.triggerSkill && !option.confirmTrigger).map(option => option.id));
    const kept = damage.effectApplications.filter(entry => applicable.has(entry.instanceId));
    damage.effectApplications = kept.length ? kept : undefined;
  }

  const selectedChanges = resolveBuffSelection(choices, damage, intervals, actorId, new Map());
  const applied = applyCalculatorBuffs(project, damage, choices, selectedChanges, timeMs, recordId);
  project = applied.project;
  damage.effectApplications = applied.applications;
  if (existingRecord) {
    const updatedRecord = project.timeline.find(entry => entry.id === recordId);
    if (updatedRecord) updatedRecord.damage = damage;
  }
  return { project, damage, choices, intervals };
}

/** Reconcile hit inputs, premise facts, stale revisions/applications, and default buff selection for a single damage query. */
export function reconcileCalculatorHitState(inputProject: Project, actorId: string, inputDamage: DamageRequest, timeMs = 0, recordId?: string): { project: Project; damage: DamageRequest } {
  const { project, damage } = reconcileState(inputProject, actorId, inputDamage, timeMs, recordId);
  return { project, damage };
}

/** Build a self-consistent cloned project ready for direct engine or Worker evaluation of one record. */
export function prepareCalculatorEvaluationProject(inputProject: Project, actorId: string, recordId: string): Project {
  let project: Project = JSON.parse(JSON.stringify(inputProject));
  const record = project.timeline.find(entry => entry.id === recordId);
  if (!record?.damage?.hit.hitId) {
    if (project.effectRevisions?.length) {
      const validIds = validEffectInstanceIds(project);
      if (validIds) {
        const kept = project.effectRevisions.filter(entry => validIds.has(entry.instanceId));
        project.effectRevisions = kept.length ? kept : undefined;
      }
    }
    if (!record?.reactionEvent) return project;
    const reactionDamage: DamageRequest = {
      hit: { definition: { group: 'characters', namespace: 'builtin', id: '', revision: '' }, hitId: '' },
      crit: record.reactionEvent.contributors[0]?.crit ?? 'critical',
      reaction: 'none',
      ...(record.reactionEvent.facts ? { facts: JSON.parse(JSON.stringify(record.reactionEvent.facts)) } : {}),
      ...(record.reactionEvent.effectApplications ? { effectApplications: JSON.parse(JSON.stringify(record.reactionEvent.effectApplications)) } : {}),
    };
    const intervals = calculatorIntervals(project, record.actor, record.timeMs, record.id);
    presetActorDefaults(reactionDamage, record.actor, intervals, true);
    let choices = calculatorBuffChoices(project, record.actor, reactionDamage, record.timeMs, record.id, intervals);
    if (reactionDamage.effectApplications?.length) {
      const applicable = new Set(choices.filter(option => option.explicit && !option.triggerSkill && !option.confirmTrigger).map(option => option.id));
      const kept = reactionDamage.effectApplications.filter(entry => applicable.has(entry.instanceId));
      reactionDamage.effectApplications = kept.length ? kept : undefined;
    }
    const selectedChanges = resolveBuffSelection(choices, reactionDamage, intervals, record.actor, new Map());
    if (selectedChanges.size) {
      const applied = applyCalculatorBuffs(project, reactionDamage, choices, selectedChanges, record.timeMs, record.id);
      project = applied.project;
      reactionDamage.effectApplications = applied.applications;
      choices = calculatorBuffChoices(project, record.actor, reactionDamage, record.timeMs, record.id, intervals);
    }
    presetEnabledBuffFields(choices, reactionDamage, record.actor);
    const enabledPrimaryIds = new Set(choices.filter(choice => !choice.disabled && calculatorBuffChecked(choice, reactionDamage)).map(choice => choice.id));
    reconcileTeammateCalculatorEffects(project, reactionDamage, record.actor, enabledPrimaryIds, record.timeMs, record.id);
    const targetRecord = project.timeline.find(entry => entry.id === record.id);
    if (targetRecord?.reactionEvent) {
      if (reactionDamage.facts?.length) targetRecord.reactionEvent.facts = reactionDamage.facts;
      else delete targetRecord.reactionEvent.facts;
      if (reactionDamage.effectApplications?.length) targetRecord.reactionEvent.effectApplications = reactionDamage.effectApplications;
      else delete targetRecord.reactionEvent.effectApplications;
    }
    return project;
  }

  const reconciled = reconcileState(project, record.actor, record.damage, record.timeMs, record.id);
  project = reconciled.project;
  const damage = reconciled.damage;
  const intervals = reconciled.intervals;
  let choices = reconciled.choices;

  const guaranteed = new Map<string, boolean>();
  for (const choice of choices) {
    if (choice.guaranteedTrigger && calculatorBuffChecked(choice, damage)) guaranteed.set(choice.id, true);
  }
  if (guaranteed.size) {
    const applied = applyCalculatorBuffs(project, damage, choices, guaranteed, record.timeMs, record.id);
    project = applied.project;
    damage.effectApplications = applied.applications;
    const hitRecordAfter = project.timeline.find(entry => entry.id === record.id);
    if (hitRecordAfter) hitRecordAfter.damage = damage;
    choices = calculatorBuffChoices(project, record.actor, damage, record.timeMs, record.id, intervals);
    const postSelected = resolveBuffSelection(choices, damage, intervals, record.actor, new Map());
    if (postSelected.size) {
      const postApplied = applyCalculatorBuffs(project, damage, choices, postSelected, record.timeMs, record.id);
      project = postApplied.project;
      damage.effectApplications = postApplied.applications;
      choices = calculatorBuffChoices(project, record.actor, damage, record.timeMs, record.id, intervals);
    }
  }

  const ownerBuild = project.candidate.actors.find(entry => entry.id === record.actor)?.build;
  const selected = findBuildHit(ownerBuild, damage.hit);
  const dealer = selected?.hit.coordinated ? calculatorOnFieldActor(project, damage, record.timeMs, record.id) : undefined;
  const primaryRecipientId = dealer?.id ?? record.actor;
  presetEnabledBuffFields(choices, damage, primaryRecipientId);
  const enabledPrimaryIds = new Set(
    choices.filter(choice => !choice.disabled && calculatorBuffChecked(choice, damage)).map(choice => choice.id),
  );
  reconcileTeammateCalculatorEffects(project, damage, primaryRecipientId, enabledPrimaryIds, record.timeMs, record.id);

  const hitRecord = project.timeline.find(entry => entry.id === record.id);
  if (hitRecord) hitRecord.damage = damage;
  if (hitRecord && selected?.hit.snapshot) {
    const snapshot = selected.hit.snapshot;
    const allowedCapture = (entry: Project['timeline'][number]) => entry.actor === record.actor
      && (snapshot.sourceKind === 'capture-only' ? entry.kind === 'capture'
        : snapshot.sourceKind === 'action-or-capture' ? entry.kind === 'capture' || entry.kind === 'action'
        : true)
      && (entry.kind === 'damage' ? findBuildHit(ownerBuild, entry.damage?.hit)?.talent?.id : entry.skillId) === snapshot.sourceSkillId;
    if (damage.capture?.recordId) {
      const current = project.timeline.find(entry => entry.id === damage.capture?.recordId);
      const ordered = current && (current.timeMs < hitRecord.timeMs || current.timeMs === hitRecord.timeMs
        && (current.order < hitRecord.order || current.id === hitRecord.id && (damage.capture.phase ?? 'before') === 'before'));
      if (!current || !ordered || !allowedCapture(current)) delete damage.capture;
    }
    if (!damage.capture?.recordId) {
      const source = project.timeline.filter(entry => entry.id !== hitRecord.id && allowedCapture(entry)
        && (entry.timeMs < hitRecord.timeMs || entry.timeMs === hitRecord.timeMs && entry.order < hitRecord.order))
        .sort((a, b) => b.timeMs - a.timeMs || b.order - a.order)[0];
      let captureId = source?.id;
      if (!captureId && !snapshot.sourceKind && selected.talent?.id === snapshot.sourceSkillId) captureId = hitRecord.id;
      captureId ??= addCalculatorCapture(project, hitRecord.actor, snapshot.sourceSkillId, hitRecord.timeMs, hitRecord.id);
      damage.capture = { recordId: captureId, phase: 'before' };
    } else {
      damage.capture.phase ??= 'before';
    }
    const targetHit = project.timeline.find(entry => entry.id === record.id);
    if (targetHit) targetHit.damage = damage;
    if (targetHit && damage.capture.recordId && damage.capture.recordId !== targetHit.id) {
      const captureRecord = project.timeline.find(entry => entry.id === damage.capture!.recordId);
      if (captureRecord) {
        if (captureRecord.kind === 'capture' && captureRecord.timeMs === targetHit.timeMs && captureRecord.order >= targetHit.order) {
          const insertionOrder = targetHit.order;
          for (const entry of project.timeline) {
            if (entry !== captureRecord && entry.timeMs === targetHit.timeMs && entry.order >= insertionOrder) entry.order++;
          }
          captureRecord.order = insertionOrder;
        }
        if (captureRecord.kind === 'capture' || (captureRecord.kind === 'action' && captureRecord.skillId)) {
          for (const row of damage.facts ?? []) {
            if (row.subject.kind === 'event') continue;
            for (const [key, fact] of Object.entries(row.values)) {
              if (row.subject.kind === 'team' && derivedTeamFactKeys.has(key)) continue;
              if (fact.value == null || subjectFacts(captureRecord.captureFacts, row.subject)?.[key]?.value != null) continue;
              putHitFact(captureRecord.captureFacts ??= [], row.subject, key, fact.value, 'preset');
            }
          }
        }
      }
    }
  }

  return project;
}
