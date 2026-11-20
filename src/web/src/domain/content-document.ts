import { fileSignature } from './file-signature';
import * as schemas from '@leyline/schema';
import { collectCalculationRoots } from '@leyline/engine';
import { describeCharacter, linkCharacterFile } from '@leyline/game-data/character-file';

type DocumentKind = 'account' | 'axis' | 'damage-calculator' | 'axis-recovery' | 'character-loadouts' | 'saved-teams';
type Fields = Record<string, unknown>;
const record = (value: unknown): value is Fields => !!value && typeof value === 'object' && !Array.isArray(value);
const entryKey = (value: schemas.DefinitionRef) => schemas.definitionKey(value);
type Library = { characters: Map<string, unknown>; weapons: Map<string, unknown>; sets: Map<string, unknown>; mainStats: Map<string, unknown> };
const library = (): Library => ({ characters: new Map(), weapons: new Map(), sets: new Map(), mainStats: new Map() });
const groups = ['characters', 'weapons', 'sets', 'mainStats'] as const;
function walk(value: unknown, build: (value: Fields) => unknown): unknown {
  if (Array.isArray(value)) return value.map(entry => walk(entry, build));
  if (!record(value)) return value;
  if (value.kind === 'calculation-build') return build(value);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry, build)]));
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
    return { ...rest, character: store('characters', entryKey(character), describeCharacter(character)),
      weapon: weapon === null ? null : store('weapons', entryKey(weapon), weapon), sets: sets.map(set => store('sets', entryKey(set), set)),
      artifactMain: store('mainStats', rest.dataVersion, artifactMain) };
  });
  return { schemaVersion: schemas.APP_VERSION, kind, document,
    content: Object.fromEntries(groups.map(group => [group, Object.fromEntries(content[group])])) };
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
  return walk(value.document, build => {
    if (typeof build.dataVersion !== 'string' || typeof build.character !== 'string' || !Array.isArray(build.sets)) throw new Error('文件中的配装引用无效。');
    const cacheKey = JSON.stringify([build.character, build.dataVersion]);
    let character = resolved.get(cacheKey);
    if (!character) {
      const metadata = schemas.characterMetadataSchema.parse(get('characters', build.character));
      if (entryKey(metadata) !== build.character) throw new Error('角色的修订与文件引用不一致。');
      character = linkCharacterFile(metadata, build.dataVersion, collectCalculationRoots);
      resolved.set(cacheKey, character);
    }
    const equipment = (group: 'sets' | 'weapons', key: unknown) => {
      const item = get(group, key);
      if (!record(item) || entryKey(schemas.definitionRefSchema.parse({ namespace: item.namespace, id: item.id, revision: item.revision })) !== key) throw new Error('装备的修订与文件引用不一致。');
      return item;
    };
    if (build.artifactMain !== build.dataVersion) throw new Error('圣遗物主词条表版本与配装不一致。');
    return { ...build, character, weapon: build.weapon === null ? null : equipment('weapons', build.weapon), sets: build.sets.map(key => equipment('sets', key)), artifactMain: get('mainStats', build.artifactMain) };
  });
}
