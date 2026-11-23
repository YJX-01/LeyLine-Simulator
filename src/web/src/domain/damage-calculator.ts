import { definitionKey, findBuildHit, matchingSceneHits } from '@leyline/schema';
import { APP_VERSION } from '@leyline/schema/version';
import { unpackDocument } from './content-document';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { damageCalculatorSchema, projectSchema, type AccountCharacter, type LocalAccount, type AxisRequest, type Build, type DamageCalculatorDocument, type DamageRequest, type Enemy, type Project, type SceneHitRequest } from '@leyline/schema';
import { loadAccountGameData } from './account-presentation';
import { addActorFromBuild, addAttributeCapture } from './real-project';
import { createEmptyProject, nextRecordId } from './workbench-project';
import { accountSlotLabels, cloneAccount, type AccountArtifact } from './account';
import { calculationArtifact, physicalArtifact, resolveBuildEquipment } from './build-snapshot';
import { orderedArtifactContent } from './showcase-inventory';
import { prepareStructuredBuilds } from '@leyline/engine';

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
  const document = damageCalculatorSchema.parse(unpackDocument('damage-calculator', JSON.parse(content)));
  calculatorRequest(document, 0);
  return document;
}

export function copyProjectForCalculator(input: Project): DamageCalculatorDocument {
  const project = projectSchema.parse(input);
  const record = project.timeline.find(record => record.kind === 'damage' && (record.damage || record.reactionEvent || record.sceneHit));
  const actorId = record?.actor ?? project.candidate.actors.find(actor => actor.build)?.id;
  if (!actorId) throw new Error('当前轴没有完整配装，请先准备队伍。');
  return damageCalculatorSchema.parse({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId, ...(record ? { recordId: record.id } : {}) });
}
