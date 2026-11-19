import { describeCharacter, linkCharacterFile } from '@leyline/game-data/character-file';
import { characterDefinitionSchema, projectSchema, type CharacterDefinition, type Project } from '@leyline/schema';
import { collectCalculationRoots, compileStructuredCharacter } from '@leyline/engine';
import { prepareCharacterImport, preparedCharacterSnapshot } from './structured-character-import';

export function copyCharacterDefinition(character: CharacterDefinition, dataVersion: string): CharacterDefinition {
  const copy = characterDefinitionSchema.parse(character), token = crypto.randomUUID(), namespace = 'custom:' + token;
  const metadata = describeCharacter(copy);
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
  const file = characterDefinitionSchema.parse(draft);
  for (const [key, text] of Object.entries(edits)) {
    const [skillId, hitText, levelText] = JSON.parse(key) as string[], hit = Number(hitText), level = Number(levelText);
    const talent = file.talents.find(talent => talent.id === skillId), parameter = talent?.parameters.find(parameter => parameter.id === talent.hits[hit]?.parameter);
    if (!parameter || !Number.isInteger(hit) || !Number.isInteger(level) || parameter.values[level] === undefined) throw new Error('修改的参数或天赋等级已不存在。');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error('技能倍率须为非负有限数值。');
    parameter.values[level] = Number(text);
  }
  if (Object.keys(edits).length) for (const record of file.calculation.bundle.coverage) record.evidence = 'declared';
  const checked = compileStructuredCharacter(file);
  if (!checked.ok) throw new Error(checked.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  return checked.character;
}
export function applyCharacterDefinition(project: Project, actorId: string, file: CharacterDefinition): Project {
  const checked = compileStructuredCharacter(file);
  if (!checked.ok) throw new Error(checked.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  const definition = checked.character, next = projectSchema.parse(project), actor = next.candidate.actors.find(actor => actor.id === actorId);
  if (!actor?.build) throw new Error('请先选择有完整配装的队员。');
  const character = actor.build.character;
  if (definition.dataVersion !== actor.build.dataVersion) throw new Error('角色数据版本与当前配装不同，请先核对版本。');
  const original = character.derivedFrom?.id ?? character.id;
  if (definition.id !== character.id && definition.derivedFrom?.id !== original && definition.derivedFrom?.id !== character.id) throw new Error('请使用从当前队员角色复制的元数据。');
  if (definition.identity.weaponType !== actor.build.weapon.weaponType) throw new Error('角色定义与武器类型不匹配。');
  actor.build.character = definition; actor.name = definition.identity.name;
  const snapshot = next.definitions.find(item => item.id === actor.character);
  if (!snapshot) throw new Error('当前队员的角色定义快照缺失。');
  snapshot.source = { kind: 'user', reference: definition.id + '@' + definition.revision, verified: false };
  snapshot.name = definition.identity.name + ' · 自定义角色快照';
  return projectSchema.parse(next);
}
