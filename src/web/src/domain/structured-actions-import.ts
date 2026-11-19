import { definitionKey, parseCalculationJson, type CalculationDiagnostic, type CharacterActionsDefinition, type DefinitionRef, type StructuredCharacterDefinition } from '@leyline/schema';
import { collectCalculationRoots, compileCharacterActions, type CompiledCharacterActions } from '@leyline/engine';

declare const preparedBrand: unique symbol;
export interface PreparedActionsImport {
  readonly [preparedBrand]: true;
  readonly identity: DefinitionRef;
  readonly character: DefinitionRef;
  readonly disposition: 'add' | 'reuse' | 'replace' | 'conflict';
  readonly conflicts: readonly string[];
}
interface PreparedData { character: string; current: string; actions: CharacterActionsDefinition; disposition: PreparedActionsImport['disposition'] }
const preparedImports = new WeakMap<PreparedActionsImport, PreparedData>();
const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}' : JSON.stringify(value);
const collections = ['formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const;
type ImportResult = { ok: true; prepared: PreparedActionsImport; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] };

function closedSnapshot(checked: Extract<CompiledCharacterActions, { ok: true }>): CharacterActionsDefinition {
  const actions = checked.actions;
  const closure = collectCalculationRoots(checked.bundle, { roots: [actions.calculation.stateMachine],
    sourceIds: [...new Set([...actions.sources, ...actions.actions.flatMap(action => action.sources), ...actions.gaps.flatMap(gap => gap.sources)])], families: [] });
  if (!closure.ok) throw new Error(closure.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  return { ...actions, calculation: { ...actions.calculation, bundle: closure.bundle } };
}

/** A companion transaction never applies a character, equipment, account or timeline change. */
export function prepareActionsImport(text: string, character: StructuredCharacterDefinition, current: CharacterActionsDefinition | null): ImportResult {
  const json = parseCalculationJson(text);
  if (!json.ok) return json;
  const incoming = compileCharacterActions(json.value, character);
  if (!incoming.ok) return incoming;
  const previous = current === null ? null : compileCharacterActions(current, character);
  if (previous && !previous.ok) return previous;
  const actions = closedSnapshot(incoming), existing = previous?.ok ? closedSnapshot(previous) : null;
  const conflicts: string[] = [], identity = definitionKey(actions.identity);
  const identical = existing !== null && canonical(existing) === canonical(actions);
  if (actions.identity.namespace === 'builtin' && !identical) conflicts.push('外部 builtin 动作只能复用当前相同内容；新动作须使用独立 custom 身份。');
  if (existing && identity === definitionKey(existing.identity) && !identical) conflicts.push('相同动作完整身份对应不同内容，须修改命名空间或修订。');
  if (existing) {
    const definitions = new Map(collections.flatMap(kind => existing.calculation.bundle[kind].map(definition => [definitionKey(definition.identity), canonical({ kind, definition })] as const)));
    for (const kind of collections) for (const definition of actions.calculation.bundle[kind]) {
      const key = definitionKey(definition.identity);
      if (definitions.has(key) && definitions.get(key) !== canonical({ kind, definition })) conflicts.push('同一计算定义完整身份内容冲突：' + key);
    }
    const sources = new Map(existing.calculation.bundle.sources.map(source => [source.id, canonical(source)]));
    for (const source of actions.calculation.bundle.sources) if (sources.has(source.id) && sources.get(source.id) !== canonical(source)) conflicts.push('同一来源身份内容冲突：' + source.id);
  }
  const disposition = conflicts.length ? 'conflict' : identical ? 'reuse' : existing ? 'replace' : 'add';
  const prepared = Object.freeze({ identity: Object.freeze({ ...actions.identity }), character: Object.freeze({ ...actions.character }), disposition,
    conflicts: Object.freeze([...new Set(conflicts)]) }) as PreparedActionsImport;
  preparedImports.set(prepared, { character: canonical(incoming.character), current: canonical(current), actions, disposition });
  return { ok: true, prepared, diagnostics: [] };
}

export function preparedActionsSnapshot(prepared: PreparedActionsImport): CharacterActionsDefinition {
  const data = preparedImports.get(prepared);
  if (!data) throw new Error('动作导入准备结果无效。');
  return structuredClone(data.actions);
}

/** Caller applies this owned value only after the existing explicit confirmation. */
export function applyActionsImport(character: StructuredCharacterDefinition, current: CharacterActionsDefinition | null, prepared: PreparedActionsImport): CharacterActionsDefinition {
  const data = preparedImports.get(prepared);
  if (!data || canonical(character) !== data.character || canonical(current) !== data.current) throw new Error('角色或动作已变化，请重新准备导入。');
  if (data.disposition === 'conflict') throw new Error('动作导入冲突尚未解决，已有内容保持不变。');
  return structuredClone(data.actions);
}

export function exportActionsSnapshot(actions: unknown, character: unknown): string {
  const checked = compileCharacterActions(actions, character);
  if (!checked.ok) throw new Error(checked.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  const snapshot = closedSnapshot(checked);
  const reopened = compileCharacterActions(snapshot, character);
  if (!reopened.ok) throw new Error(reopened.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  const text = JSON.stringify(snapshot, null, 2) + '\n', parsed = parseCalculationJson(text);
  if (!parsed.ok) throw new Error(parsed.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  return text;
}
