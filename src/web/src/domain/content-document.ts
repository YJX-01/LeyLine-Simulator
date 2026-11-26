import { fileSignature } from './file-signature';
import * as schemas from '@leyline/schema';
import { collectCalculationRoots } from '@leyline/engine';
import { linkCharacterFile, linkEquipmentFile } from '@leyline/game-data/character-file';

type DocumentKind = 'account' | 'axis' | 'damage-calculator' | 'axis-recovery' | 'character-loadouts' | 'saved-teams';
type Fields = Record<string, unknown>;
const record = (value: unknown): value is Fields => !!value && typeof value === 'object' && !Array.isArray(value);
const entryKey = (value: schemas.DefinitionRef) => schemas.definitionKey(value);
type Library = { characters: Map<string, unknown>; weapons: Map<string, unknown>; sets: Map<string, unknown>; mainStats: Map<string, unknown>; curves: Map<string, unknown> };
const library = (): Library => ({ characters: new Map(), weapons: new Map(), sets: new Map(), mainStats: new Map(), curves: new Map() });
const groups = ['characters', 'weapons', 'sets', 'mainStats', 'curves'] as const;
function portableSource(source: schemas.CalculationBundle['sources'][number]) {
  return source.kind === 'recording' ? { id: source.id, kind: source.kind, reference: source.id } : { id: source.id, kind: 'definition' as const };
}
function walk(value: unknown, build: (value: Fields) => unknown, portable = false): unknown {
  if (Array.isArray(value)) return value.map(entry => walk(entry, build, portable));
  if (!record(value)) return value;
  if (value.kind === 'calculation-build') return build(value);
  if (portable && Array.isArray(value.sources) && value.runtimeVersion && Array.isArray(value.requiredFeatures)) {
    return { ...value, sources: value.sources.map(portableSource) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry, build, portable)]));
}

export function packDocument(kind: DocumentKind, value: unknown) {
  const content = library();
  function store(group: keyof Library, key: string, data: unknown) {
    const previous = content[group].get(key);
    if (previous !== undefined && fileSignature(previous) !== fileSignature(data)) throw new Error('同一修订对应不同内容：' + key);
    content[group].set(key, data);
    return key;
  }
  const document = walk(value, raw => {
    const { character, weapon, sets, artifactMain, ...rest } = raw as unknown as schemas.Build;
    for (const stat of ['hp', 'attack', 'defense'] as const) {
      const key = character.metadata.progression.curveIds[stat];
      if (!Object.hasOwn(character.metadata.curves ?? {}, key)) store('curves', key, character.progression.curves[stat]);
    }
    return { ...rest, sources: rest.sources.map(portableSource), character: store('characters', entryKey(character), character.metadata),
      weapon: weapon === null ? null : store('weapons', entryKey(weapon), schemas.weaponMetadataSchema.parse(weapon.metadata)), sets: sets.map(set => store('sets', entryKey(set), schemas.artifactSetMetadataSchema.parse(set.metadata))),
      artifactMain: store('mainStats', rest.dataVersion, artifactMain) };
  }, true);
  return { schemaVersion: schemas.APP_VERSION, kind, document,
    content: Object.fromEntries(groups.map(group => [group, Object.fromEntries(content[group])])) };
}

export class DocumentReadError extends Error {
  constructor(readonly original: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : '文档未通过校验。', { cause });
  }
}

/** Keep the serialized source available when a recognized document cannot be evaluated. */
export function readWorkbenchDocument<T>(kind: 'axis' | 'axis-recovery' | 'damage-calculator', input: unknown,
  validate: (data: unknown) => T, original?: string): T {
  try {
    return validate(unpackDocument(kind, input));
  } catch (cause) {
    if (!record(input) || input.kind !== kind || !record(input.content) || !record(input.document)) throw cause;
    throw new DocumentReadError(original ?? JSON.stringify(input), cause);
  }
}

/** Resolve only definitions explicitly selected in this file. Domain readers validate the restored document. */
export function unpackDocument(kind: DocumentKind, value: unknown): unknown {
  if (!record(value) || value.kind !== kind || value.schemaVersion !== schemas.APP_VERSION || !record(value.content) || !Object.hasOwn(value, 'document')) throw new Error('不支持此文件格式或版本。');
  const content = value.content, resolved = new Map<string, schemas.CharacterDefinition>();
  for (const group of groups) if (!record(content[group])) throw new Error('文件缺少内容表：' + group);
  function get(group: keyof Library, key: unknown) {
    const table = content[group] as Fields;
    if (typeof key !== 'string' || !Object.hasOwn(table, key)) throw new Error('文件中的配装引用失效：' + group + '/' + key);
    return table[key];
  }
  const equipmentCache = new Map<string, unknown>();
  return walk(value.document, build => {
    if (typeof build.dataVersion !== 'string' || typeof build.character !== 'string' || !Array.isArray(build.sets)) throw new Error('文件中的配装引用无效。');
    const cacheKey = JSON.stringify([build.character, build.dataVersion]);
    let character = resolved.get(cacheKey);
    if (!character) {
      const metadata = schemas.characterMetadataSchema.parse(get('characters', build.character));
      if (entryKey(metadata) !== build.character) throw new Error('角色的修订与文件引用不一致。');
      const keys = Object.values(metadata.progression.curveIds).filter(key => !Object.hasOwn(metadata.curves ?? {}, key));
      const curves = Object.fromEntries(keys.map(key => [key, get('curves', key)]));
      character = linkCharacterFile(metadata, build.dataVersion, collectCalculationRoots, curves);
      resolved.set(cacheKey, character);
    }
    const equipment = (group: 'sets' | 'weapons', key: unknown) => {
      const item = get(group, key);
      if (!record(item) || entryKey(schemas.definitionRefSchema.parse({ namespace: item.namespace, id: item.id, revision: item.revision })) !== key) throw new Error('装备的修订与文件引用不一致。');
      const cacheKey = JSON.stringify([group, key]);
      if (!equipmentCache.has(cacheKey)) {
        const metadata = (group === 'weapons' ? schemas.weaponMetadataSchema : schemas.artifactSetMetadataSchema).parse(item);
        equipmentCache.set(cacheKey, linkEquipmentFile(metadata, collectCalculationRoots));
      }
      return equipmentCache.get(cacheKey);
    };
    if (build.artifactMain !== build.dataVersion) throw new Error('圣遗物主词条表版本与配装不一致。');
    return { ...build, character, weapon: build.weapon === null ? null : equipment('weapons', build.weapon), sets: build.sets.map(key => equipment('sets', key)), artifactMain: get('mainStats', build.artifactMain) };
  });
}
