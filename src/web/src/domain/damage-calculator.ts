import { APP_VERSION } from '@leyline/schema/version';
import { unpackDocument } from './content-document';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { damageCalculatorSchema, ordinaryTrialId, projectSchema, type AccountCharacter, type LocalAccount, type AxisRequest, type Build, type DamageCalculatorDocument, type DamageRequest, type Enemy, type Project } from '@leyline/schema';
import { loadAccountGameData } from './account-presentation';
import { addActorFromBuild } from './real-project';
import { createEmptyProject, nextRecordId } from './workbench-project';
import { calculationArtifact } from './build-snapshot';
import { collectCalculationRoots, prepareStructuredBuilds } from '@leyline/engine';
import { describeCharacter, linkCharacterFile } from '@leyline/game-data/character-file';
import { calculatorHitChoices } from './calculator-hits';

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
    return calculationArtifact(JSON.parse(JSON.stringify(item.real)), account.id);
  });
  const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => character.build?.sets.find(set => set.id === id) ?? getArtifactSet(id)));
  const equipment = { artifacts, sets };
  if (character.build) Object.assign(character.build, equipment);
  return { character, equipment };
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
  const recordId = nextRecordId(project);
  project.timeline.push({ id: recordId, actor: actorId, timeMs: 0, order: 0, kind: 'damage', definition: `${actorId}-real-damage`, damage });
  return damageCalculatorSchema.parse({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId, recordId });
}

export function calculatorRequest(input: DamageCalculatorDocument, taskId: number): AxisRequest {
  const document = damageCalculatorSchema.parse(input);
  for (const project of [document.project, ...document.baseline ? [document.baseline] : []]) {
    if (project.candidate.actors.some(actor => !actor.build)) throw new Error('计算副本中有尚未补全的队员配装。');
    const prepared = prepareStructuredBuilds(project.candidate.actors.map(actor => ({ id: actor.id, build: actor.build! })));
    if (!prepared.ok) throw new Error(prepared.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  }
  return calculatorWorkerRequest(document, taskId);
}

/** Bind the explicitly selected ordinary formula only in the evaluation copy. Stored definitions retain their original coverage. */
function withOrdinaryTrials(project: Project) {
  const trials = project.timeline.filter(record => record.damage && record.damage.outputId === ordinaryTrialId(record.damage.hitId));
  if (!trials.length) return project;
  const actors = project.candidate.actors.map(actor => {
    const records = trials.flatMap(record => record.actor === actor.id && record.damage ? [record.damage] : []);
    if (!records.length || !actor.build) return actor;
    const definition = actor.build.character;
    const choices = calculatorHitChoices(definition);
    const metadata = describeCharacter(definition);
    for (const damage of records) {
      const choice = choices.find(row => row.ordinaryTrial && row.outputId === damage.outputId && row.hitId === damage.hitId && row.skillId === damage.skillId);
      if (!choice) throw new Error('此命中缺少可供普通直伤试算的倍率。');
      const hit = metadata.talents.find(skill => skill.id === choice.skillId)!.hits.find(hit => hit.id === choice.hitId)!;
      hit.outputs = [{ id: choice.outputId!, family: 'ordinary' }];
      const profile = 'trial-' + hit.id;
      metadata.support[profile] = { ...metadata.support[hit.support], resolution: 'unavailable',
        reason: '按此命中的天赋倍率、元素和普通直伤公式试算，角色专属机制尚未完整核验。' };
      hit.support = profile;
    }
    return { ...actor, build: { ...actor.build, character: linkCharacterFile(metadata, actor.build.dataVersion, collectCalculationRoots) } };
  });
  return { ...project, candidate: { ...project.candidate, actors } };
}

/** The Worker prepares and validates the team when evaluating. File imports are checked before installation. */
export function calculatorWorkerRequest(document: DamageCalculatorDocument, taskId: number): AxisRequest {
  if (!document.baseline) return { taskId, session: 1, revision: taskId, project: withOrdinaryTrials(document.project) };
  const baseline = document.baseline;
  for (const key of ['timeline', 'conditions', 'enemy', 'combatStates', 'objective', 'effectRevisions', 'definitions'] as const) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(document.project[key])) throw new Error('同轴比较须保留基准的记录、条件与定义，请先结束对照。');
  }
  if (baseline.candidate.actors.length !== document.project.candidate.actors.length) throw new Error('比较队员已变化。');
  const replacements = withOrdinaryTrials(document.project).candidate.actors.map(actor => {
    const before = baseline.candidate.actors.find(entry => entry.id === actor.id);
    if (!before?.build || !actor.build || actor.build.character.id !== before.build.character.id) throw new Error('比较须使用同一角色的完整配装。');
    return { actorId: actor.id, build: actor.build };
  });
  return { taskId, session: 1, revision: taskId, project: withOrdinaryTrials(baseline), candidates: [{ id: 'calculator-candidate', name: '当前候选', replacements }] };
}

export function parseDamageCalculator(content: string): DamageCalculatorDocument {
  if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) throw new Error('计算文件超过8 MiB。');
  const document = damageCalculatorSchema.parse(unpackDocument('damage-calculator', JSON.parse(content)));
  calculatorRequest(document, 0);
  return document;
}

export function copyProjectForCalculator(input: Project): DamageCalculatorDocument {
  const project = projectSchema.parse(input);
  const record = project.timeline.find(record => record.kind === 'damage' && record.damage);
  const actorId = record?.actor ?? project.candidate.actors.find(actor => actor.build)?.id;
  if (!actorId) throw new Error('当前轴没有完整配装，请先准备队伍。');
  return damageCalculatorSchema.parse({ schemaVersion: APP_VERSION, kind: 'damage-calculator', project, actorId, ...(record ? { recordId: record.id } : {}) });
}
