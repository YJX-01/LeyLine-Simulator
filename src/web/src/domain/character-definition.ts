import { authoredHitEntries } from '@leyline/schema/hit-bindings';
import { linkCharacterFile } from '@leyline/game-data/character-file';
import { characterHitRef, findCharacterHit, characterMetadataSchema, projectSchema, type CharacterDefinition, type Project } from '@leyline/schema';
import { collectCalculationRoots, compileStructuredCharacter } from '@leyline/engine';
import { prepareCharacterImport, preparedCharacterSnapshot } from './structured-character-import';

export function copyCharacterDefinition(character: CharacterDefinition, dataVersion: string): CharacterDefinition {
  const token = crypto.randomUUID(), namespace = 'custom:' + token;
  const metadata = characterMetadataSchema.parse(character.metadata);
  metadata.namespace = namespace;
  metadata.id = 'custom-' + token;
  metadata.revision = '1';
  metadata.derivedFrom = { id: character.derivedFrom?.id ?? character.id, name: character.derivedFrom?.name ?? character.identity.name, revision: character.revision };
  metadata.identity.name += ' · 自定义';
  for (const profile of Object.values(metadata.support)) profile.evidence = 'declared';
  return linkCharacterFile(metadata, dataVersion, collectCalculationRoots);
}
export function parseCharacterDefinition(content: string, registry: readonly CharacterDefinition[] = []): CharacterDefinition {
  const prepared = prepareCharacterImport(content, registry);
  if (!prepared.ok) throw new Error('角色定义格式无效。' + prepared.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  if (prepared.prepared.disposition === 'conflict') throw new Error(prepared.prepared.conflicts.map(conflict => conflict.message).join('；'));
  return preparedCharacterSnapshot(prepared.prepared);
}
export function prepareCharacterDefinition(draft: CharacterDefinition, edits: Record<string, string>): CharacterDefinition {
  const file = characterMetadataSchema.parse(draft.metadata);
  for (const [key, text] of Object.entries(edits)) {
    const [skillId, hitText, levelText] = JSON.parse(key) as string[], hit = Number(hitText), level = Number(levelText);
    const talent = file.talents.find(talent => talent.id === skillId), base = authoredHitEntries(file, skillId)[hit]?.hit.base;
    const term = Array.isArray(base) ? base[0] : undefined;
    const source = term?.skill ? file.talents.find(skill => skill.id === term.skill) : talent;
    const parameter = source?.parameters.find(parameter => parameter.id === term?.parameter);
    if (!parameter || !Number.isInteger(hit) || !Number.isInteger(level) || parameter.values[level] === undefined) throw new Error('修改的参数或天赋等级已不存在。');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error('技能倍率须为非负有限数值。');
    parameter.values[level] = Number(text);
  }
  if (Object.keys(edits).length) for (const record of Object.values(file.support)) record.evidence = 'declared';
  return linkCharacterFile(file, draft.dataVersion, collectCalculationRoots);
}
export function applyCharacterDefinition(project: Project, actorId: string, file: CharacterDefinition, schema = projectSchema): Project {
  const checked = compileStructuredCharacter(file);
  if (!checked.ok) throw new Error(checked.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  const definition = checked.character, next = schema.parse(project), actor = next.candidate.actors.find(actor => actor.id === actorId);
  if (!actor?.build) throw new Error('请先选择有完整配装的队员。');
  const character = actor.build.character;
  if (definition.dataVersion !== actor.build.dataVersion) throw new Error('角色数据版本与当前配装不同，请先核对版本。');
  const original = character.derivedFrom?.id ?? character.id;
  if (definition.id !== character.id && definition.derivedFrom?.id !== original && definition.derivedFrom?.id !== character.id) throw new Error('请使用从当前队员角色复制的元数据。');
  if (actor.build.weapon && definition.identity.weaponType !== actor.build.weapon.weaponType) throw new Error('角色定义与武器类型不匹配。');
  for (const record of next.timeline) if (record.actor === actorId && record.damage && findCharacterHit(character, record.damage.hit)) {
    record.damage.hit = characterHitRef(definition, record.damage.hit.hitId);
  }
  actor.build.character = definition; actor.name = definition.identity.name;
  const snapshot = next.definitions.find(item => item.id === actor.character);
  if (!snapshot) throw new Error('当前队员的角色定义快照缺失。');
  snapshot.source = { kind: 'user', reference: definition.id + '@' + definition.revision, verified: false };
  snapshot.name = definition.identity.name + ' · 自定义角色快照';
  return schema.parse(next);
}
