import { calculationBundleSchema, calculationJsonPointer, characterActionsDefinitionSchema, definitionKey, inspectCalculationStructure,
  type CalculationBundle, type CalculationDiagnostic, type CharacterActionsDefinition, type StructuredCharacterDefinition } from '@leyline/schema';
import { compileStructuredCharacter } from './character';
import { compiledData, deduplicateCalculationBundle, type CompiledCalculation } from './compile';
import { collectCalculationRoots } from './closure';

export type CompiledCharacterActions = { ok: true; actions: CharacterActionsDefinition; character: StructuredCharacterDefinition;
  bundle: CalculationBundle; program: CompiledCalculation; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] };

/** All dependencies come from these two supplied snapshots. An action file cannot replace its character. */
export function compileCharacterActions(input: unknown, characterInput: unknown, dependenciesInput?: unknown): CompiledCharacterActions {
  const diagnostics = [input, dependenciesInput].flatMap(value => value === undefined ? [] : inspectCalculationStructure(value));
  if (diagnostics.length) return { ok: false, diagnostics };
  const parsed = characterActionsDefinitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map(issue => ({ code: issue.path[0] === 'schemaVersion' ? 'unsupported-version' : 'invalid-range', severity: 'error',
    jsonPointer: calculationJsonPointer(issue.path), message: issue.message, affectedOutputIds: [] })) };
  const checked = compileStructuredCharacter(characterInput);
  if (!checked.ok) return checked;
  const actions = parsed.data, character = checked.character;
  const report = (code: CalculationDiagnostic['code'], jsonPointer: string, message: string) => diagnostics.push({ code, severity: 'error', jsonPointer, message, affectedOutputIds: [] });
  if (definitionKey(actions.character) !== definitionKey(character)) report('stale-reference', '/character', '动作文件与所选角色的命名空间、身份或修订不匹配。');
  const dependencies = dependenciesInput === undefined ? null : calculationBundleSchema.safeParse(dependenciesInput);
  if (dependencies && !dependencies.success) return { ok: false, diagnostics: dependencies.error.issues.map(issue => ({ code: 'invalid-range', severity: 'error', jsonPointer: '/dependencies' + calculationJsonPointer(issue.path), message: issue.message, affectedOutputIds: [] })) };
  let bundle: CalculationBundle = structuredClone(character.calculation.bundle);
  for (const additions of [actions.calculation.bundle, ...dependencies?.success ? [dependencies.data] : []]) {
    bundle.requiredFeatures = [...new Set([...bundle.requiredFeatures, ...additions.requiredFeatures])];
    bundle.damageFamilies = [...new Set([...bundle.damageFamilies ?? [], ...additions.damageFamilies ?? []])];
    for (const key of ['sources', 'formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const) (bundle[key] as unknown[]).push(...additions[key]);
  }
  const sourceIds = [...new Set([...actions.sources, ...actions.actions.flatMap(action => action.sources), ...actions.gaps.flatMap(gap => gap.sources)])];
  const closure = collectCalculationRoots(deduplicateCalculationBundle(bundle), { roots: [actions.calculation.stateMachine], sourceIds, families: [] });
  if (!closure.ok) return { ok: false, diagnostics: [...diagnostics, ...closure.diagnostics] };
  bundle = structuredClone(character.calculation.bundle);
  bundle.requiredFeatures = [...new Set([...bundle.requiredFeatures, ...closure.bundle.requiredFeatures])];
  bundle.damageFamilies = [...new Set([...bundle.damageFamilies ?? [], ...closure.bundle.damageFamilies ?? []])];
  for (const key of ['sources', 'formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const) (bundle[key] as unknown[]).push(...closure.bundle[key]);
  bundle = deduplicateCalculationBundle(bundle);
  const compiled = compileStructuredCharacter({ ...character, calculation: { ...character.calculation, bundle } });
  if (!compiled.ok) return { ok: false, diagnostics: [...diagnostics, ...compiled.diagnostics] };
  const data = compiledData(compiled.program)!, machine = data.stateMachines.get(definitionKey(actions.calculation.stateMachine));
  if (!machine) report('missing-dependency', '/calculation/stateMachine', '动作文件缺少状态机的精确版本。');
  for (const id of [...actions.sources, ...actions.actions.flatMap(action => action.sources), ...actions.gaps.flatMap(gap => gap.sources)]) {
    if (!data.sources.some(source => source.id === id)) report('missing-dependency', '/sources', '动作文件缺少来源记录：' + id);
  }
  for (const [index, action] of actions.actions.entries()) {
    if (action.skillId !== null && !character.talents.some(talent => talent.id === action.skillId)) report('stale-reference', `/actions/${index}/skillId`, '动作引用的技能不存在。');
    for (const [hitIndex, reference] of action.hits.entries()) {
      const exists = character.talents.some(talent => talent.hits.some(hit => hit.id === reference.hitId));
      if (!exists) report('stale-reference', `/actions/${index}/hits/${hitIndex}`, '动作引用的命中已失效。');
    }
  }
  if (machine) for (const selector of [...machine.requirements.map(rule => rule.selector), ...machine.transitions.map(rule => rule.selector)]) {
    if (selector.actionIds?.some(id => !actions.actions.some(action => action.id === id))) report('stale-reference', '/calculation/stateMachine', '状态规则引用了未声明的动作。');
    if (selector.skillIds?.some(id => !character.talents.some(talent => talent.id === id))) report('stale-reference', '/calculation/stateMachine', '状态规则引用了不存在的技能。');
    if (selector.hitIds?.some(id => !character.talents.some(talent => talent.hits.some(hit => hit.id === id)))) report('stale-reference', '/calculation/stateMachine', '状态规则引用了不存在的命中。');
  }
  return diagnostics.length ? { ok: false, diagnostics } : { ok: true, actions, character, bundle, program: compiled.program, diagnostics };
}
