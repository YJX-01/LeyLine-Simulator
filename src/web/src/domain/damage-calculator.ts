import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { damageCalculatorSchema, projectSchema, type AccountCharacter, type LocalAccount, type AxisRequest, type Build, type DamageCalculatorDocument, type DamageRequest, type Enemy, type Project } from '@leyline/schema';
import { loadAccountGameData } from './account-presentation';
import { addActorFromBuild } from './real-project';
import { createEmptyProject, nextRecordId } from './workbench-project';

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
    return { ...JSON.parse(JSON.stringify(item.real)) as Build['artifacts'][number], inventoryAccountId: account.id };
  });
  const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => character.build?.sets.find(set => set.id === id) ?? getArtifactSet(id)));
  const equipment = { artifacts, sets, inventoryAccountId: account.id };
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
    getCharacter(before.character.id), getWeapon(before.weapon.id), Promise.all(before.sets.map(set => getArtifactSet(set.id))), loadAccountGameData(),
  ]);
  const after: Build = { ...before, character, weapon, sets, artifactMain: data.main, reactionRules: data.reactions, dataVersion: data.catalog.version };
  const labels = { character: `角色定义（${before.character.revision} → ${character.revision}）`, weapon: '武器定义', sets: '套装定义', artifactMain: '圣遗物主词条表', reactionRules: '反应规则', dataVersion: '内容版本' };
  const changes = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => labels[key]);
  actor.build = after;
  // Refresh only the metadata of this actor's carried calculation snapshots; keep authored graph rules/revisions intact.
  const definitionIds = new Set([actor.character, actor.weapon, ...document.project.timeline.filter(record => record.actor === actor.id).map(record => record.definition)]);
  for (const definition of document.project.definitions) if (definitionIds.has(definition.id) && !definition.effects.length && (!definition.nodes.length || definition.nodes.every(node => node.op === 'game-damage'))) {
    definition.version = after.dataVersion;
    definition.source = { kind: 'user', reference: definition.id === actor.weapon ? `${weapon.id}@${after.dataVersion}` : `${character.id}@${character.revision}`, verified: false };
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
  return damageCalculatorSchema.parse({ schemaVersion: 1, kind: 'damage-calculator', project, actorId, recordId });
}

export function calculatorRequest(input: DamageCalculatorDocument, taskId: number): AxisRequest {
  const document = damageCalculatorSchema.parse(input);
  if (!document.baseline) return { taskId, session: 1, revision: taskId, project: document.project };
  const baseline = document.baseline;
  for (const key of ['timeline', 'conditions', 'enemy', 'combatStates', 'objective', 'effectRevisions', 'definitions'] as const) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(document.project[key])) throw new Error('同轴比较须保留基准的记录、条件与定义，请先结束对照。');
  }
  if (baseline.candidate.actors.length !== document.project.candidate.actors.length) throw new Error('比较队员已变化。');
  const replacements = document.project.candidate.actors.map(actor => {
    const before = baseline.candidate.actors.find(entry => entry.id === actor.id);
    if (!before?.build || !actor.build || actor.build.character.id !== before.build.character.id) throw new Error('比较须使用同一角色的完整配装。');
    return { actorId: actor.id, build: actor.build };
  });
  return { taskId, session: 1, revision: taskId, project: baseline, candidates: [{ id: 'calculator-candidate', name: '当前候选', replacements }] };
}

export function parseDamageCalculator(content: string): DamageCalculatorDocument {
  if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) throw new Error('计算文件超过8 MiB。');
  const document = damageCalculatorSchema.parse(JSON.parse(content));
  calculatorRequest(document, 0);
  return document;
}

export function copyProjectForCalculator(input: Project): DamageCalculatorDocument {
  const project = projectSchema.parse(input);
  const record = project.timeline.find(record => record.kind === 'damage' && record.damage);
  const actorId = record?.actor ?? project.candidate.actors.find(actor => actor.build)?.id;
  if (!actorId) throw new Error('当前轴没有完整配装，请先准备队伍。');
  return damageCalculatorSchema.parse({ schemaVersion: 1, kind: 'damage-calculator', project, actorId, ...(record ? { recordId: record.id } : {}) });
}
