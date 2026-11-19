import * as schemas from '@leyline/schema';
import { DATA_VERSION } from '@leyline/game-data';
import { describeCharacter, linkCharacterFile } from '@leyline/game-data/character-file';
import { definitionKey, parseCalculationJson, type CalculationDiagnostic, type DefinitionRef, type StructuredCharacterDefinition } from '@leyline/schema';
import { collectCalculationClosure, collectCalculationRoots, compileStructuredCharacter } from '@leyline/engine';

export interface CharacterImportConflict { kind: 'builtin-claim' | 'character' | 'calculation' | 'source'; identity: string; message: string }
declare const preparedBrand: unique symbol;
export interface PreparedCharacterImport {
  readonly [preparedBrand]: true;
  readonly identity: DefinitionRef;
  readonly name: string;
  readonly disposition: 'add' | 'reuse' | 'conflict';
  readonly conflicts: readonly CharacterImportConflict[];
}
interface PreparedData { registry: string; character: StructuredCharacterDefinition; disposition: PreparedCharacterImport['disposition'] }
const preparedImports = new WeakMap<PreparedCharacterImport, PreparedData>();
const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}' : JSON.stringify(value);
const reference = (character: StructuredCharacterDefinition): DefinitionRef => ({ namespace: character.namespace, id: character.id, revision: character.revision });
type ImportResult = { ok: true; prepared: PreparedCharacterImport; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] };

/** Prepare current JSON only. External evidence labels are declarations, never builtin authority. */
export function prepareCharacterImport(text: string, registry: readonly StructuredCharacterDefinition[]): ImportResult {
  const json = parseCalculationJson(text);
  if (!json.ok) return json;
  const parsed = schemas.characterMetadataSchema.safeParse(json.value);
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map(issue => ({ code: 'invalid-range', severity: 'error', jsonPointer: schemas.calculationJsonPointer(issue.path), message: issue.message, affectedOutputIds: [] })) };
  try {
    return prepareResolvedCharacterImport(linkCharacterFile(parsed.data, DATA_VERSION, collectCalculationRoots), registry);
  } catch (cause) {
    return { ok: false, diagnostics: [{ code: 'missing-dependency', severity: 'error', jsonPointer: '/', message: cause instanceof Error ? cause.message : '角色依赖无效。', affectedOutputIds: [] }] };
  }
}

export function prepareResolvedCharacterImport(value: unknown, registry: readonly StructuredCharacterDefinition[]): ImportResult {
  const incoming = compileStructuredCharacter(value);
  if (!incoming.ok) return incoming;
  const diagnostics: CalculationDiagnostic[] = [], current: StructuredCharacterDefinition[] = [];
  const seenCharacters = new Set<string>();
  for (const entry of registry) {
    const compiled = compileStructuredCharacter(entry);
    if (!compiled.ok) return compiled;
    const key = definitionKey(reference(compiled.character));
    if (seenCharacters.has(key)) return { ok: false, diagnostics: [{ code: 'conflicting-definition', severity: 'error', jsonPointer: '/registry', message: '现有注册表角色完整身份重复。', affectedOutputIds: [] }] };
    seenCharacters.add(key);
    current.push(compiled.character);
  }
  let character = incoming.character;
  if (character.origin === 'custom') {
    const knownCoverage = new Map(current.flatMap(entry => entry.calculation.bundle.coverage).map(record => [definitionKey(record.identity), canonical(record)]));
    for (const record of character.calculation.bundle.coverage) if (knownCoverage.get(definitionKey(record.identity)) !== canonical(record)) record.evidence = 'declared';
    const normalized = compileStructuredCharacter(character);
    if (!normalized.ok) return normalized;
    character = normalized.character;
  }
  const identity = reference(character), key = definitionKey(identity), conflicts: CharacterImportConflict[] = [];
  const existing = current.find(entry => definitionKey(reference(entry)) === key);
  const identical = existing !== undefined && canonical(existing) === canonical(character);
  if (character.origin === 'builtin' && !identical) conflicts.push({ kind: 'builtin-claim', identity: key, message: '外部builtin声明只能复用已注册的相同内容；新定义必须使用独立的custom命名空间。' });
  if (existing && !identical) conflicts.push({ kind: 'character', identity: key, message: '相同角色完整身份对应不同内容，须明确修改命名空间或修订后重新准备。' });
  const definitions = new Map<string, string>(), sources = new Map<string, string>();
  for (const entry of current) {
    for (const kind of ['formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const) for (const definition of entry.calculation.bundle[kind]) {
      const id = definitionKey(definition.identity), content = canonical({ kind, definition });
      if (definitions.has(id) && definitions.get(id) !== content) return { ok: false, diagnostics: [{ code: 'conflicting-definition', severity: 'error', jsonPointer: '/registry', message: '现有注册表已有计算定义冲突。', affectedOutputIds: [] }] };
      definitions.set(id, content);
    }
    for (const source of entry.calculation.bundle.sources) {
      const content = canonical(source);
      if (sources.has(source.id) && sources.get(source.id) !== content) return { ok: false, diagnostics: [{ code: 'conflicting-definition', severity: 'error', jsonPointer: '/registry', message: '现有注册表已有来源冲突。', affectedOutputIds: [] }] };
      sources.set(source.id, content);
    }
  }
  for (const kind of ['formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const) for (const definition of character.calculation.bundle[kind]) {
    const id = definitionKey(definition.identity);
    if (definitions.has(id) && definitions.get(id) !== canonical({ kind, definition })) conflicts.push({ kind: 'calculation', identity: id, message: '同一计算定义完整身份的内容冲突。' });
  }
  for (const source of character.calculation.bundle.sources) if (sources.has(source.id) && sources.get(source.id) !== canonical(source)) conflicts.push({ kind: 'source', identity: source.id, message: '同一来源身份的内容冲突。' });
  const disposition = conflicts.length ? 'conflict' : identical ? 'reuse' : 'add';
  const prepared = Object.freeze({ identity: Object.freeze({ ...identity }), name: character.identity.name, disposition, conflicts: Object.freeze(conflicts.map(conflict => Object.freeze(conflict))) }) as PreparedCharacterImport;
  preparedImports.set(prepared, { registry: canonical(current), character, disposition });
  return { ok: true, prepared, diagnostics };
}

export function preparedCharacterSnapshot(prepared: PreparedCharacterImport): StructuredCharacterDefinition {
  const data = preparedImports.get(prepared);
  if (!data) throw new Error('导入准备结果无效。');
  return structuredClone(data.character);
}

/** Atomic owned return value. The caller writes it only through its existing explicit confirmation flow. */
export function applyCharacterImport(registry: readonly StructuredCharacterDefinition[], prepared: PreparedCharacterImport): StructuredCharacterDefinition[] {
  const data = preparedImports.get(prepared);
  if (!data || canonical(registry) !== data.registry) throw new Error('注册表已变化或准备结果无效，请重新准备导入。');
  if (data.disposition === 'conflict') throw new Error('导入冲突尚未解决，现有注册表保持不变。');
  return structuredClone(data.disposition === 'reuse' ? [...registry] : [...registry, data.character]);
}

export function exportCharacterSnapshot(input: unknown): string {
  const character = compileStructuredCharacter(input);
  if (!character.ok) throw new Error(character.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  const closure = collectCalculationClosure(character.character);
  if (!closure.ok) throw new Error(closure.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  const value = schemas.characterMetadataSchema.parse(describeCharacter({ ...character.character, calculation: { ...character.character.calculation, bundle: closure.bundle } }));
  const text = JSON.stringify(value, null, 2) + '\n', parsed = parseCalculationJson(text);
  if (!parsed.ok) throw new Error(parsed.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  return text;
}
