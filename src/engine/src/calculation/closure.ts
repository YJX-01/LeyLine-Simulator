import { calculationClosureRequestSchema, calculationJsonPointer, definitionKey, inspectCalculationStructure, structuredCharacterDefinitionSchema,
  type CalculationBinding, type CalculationBundle, type CalculationDiagnostic, type DefinitionRef } from '@leyline/schema';
import { compileCalculation, compiledData } from './compile';
import { compileStructuredCharacter } from './character';

export type CalculationClosureResult = { ok: true; bundle: CalculationBundle; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] };

/** Iterative exact-reference collection; supplied registry only, with no filesystem or network resolver. */
export function collectCalculationRoots(library: unknown, input: unknown): CalculationClosureResult {
  const diagnostics = inspectCalculationStructure(input);
  if (diagnostics.length) return { ok: false, diagnostics };
  const request = calculationClosureRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, diagnostics: request.error.issues.map(issue => ({ code: 'invalid-range', severity: 'error', jsonPointer: calculationJsonPointer(issue.path), message: issue.message, affectedOutputIds: [] })) };
  const compiled = compileCalculation(library);
  if (!compiled.ok) return compiled;
  const data = compiledData(compiled.program)!, pending = [...request.data.roots], selected = new Set<string>(), sources = new Set(request.data.sourceIds), families = new Set(request.data.families);
  const report = (pointer: string, message: string) => diagnostics.push({ code: 'missing-dependency', severity: 'error', jsonPointer: pointer, message, affectedOutputIds: [] });
  for (const source of sources) if (!data.sources.some(record => record.id === source)) report('/sourceIds', '缺少明确来源：' + source);
  for (const family of families) if (!data.damageFamilies.includes(family)) report('/families', '缺少明确伤害族：' + family);
  const bindings = (root: CalculationBinding) => {
    const queue = [root];
    for (let index = 0; index < queue.length; index++) {
      const binding = queue[index];
      if (binding.kind === 'attribute' || binding.kind === 'enemy') pending.push(binding.key);
      if (binding.kind === 'formula') { pending.push(binding.formula); queue.push(...Object.values(binding.inputs)); }
    }
  };
  for (let index = 0; index < pending.length; index++) {
    const reference = pending[index], key = definitionKey(reference);
    if (selected.has(key)) continue;
    selected.add(key);
    const formula = data.formulas.get(key), table = data.tables.get(key), attribute = data.attributes.get(key), effect = data.effects.get(key), aggregate = data.aggregates.get(key), coverage = data.coverage.get(key), stateMachine = data.stateMachines.get(key);
    const definition = formula?.configuration ?? table ?? attribute ?? effect ?? aggregate ?? coverage ?? stateMachine;
    if (!definition) { report('/roots/' + index, '缺少依赖的精确版本：' + key); continue; }
    definition.sources.forEach(source => sources.add(source));
    if (formula) for (const node of formula.definition.nodes) {
      if (node.op === 'call') pending.push(node.formula);
      if (node.op === 'lookup') pending.push(node.table);
    }
    if (attribute && attribute.base.kind !== 'input') bindings(attribute.base);
    if (effect) {
      if (effect.target.kind === 'attribute') pending.push(effect.target.attribute); else pending.push(effect.target.formula);
      if (effect.predicate) bindings(effect.predicate); bindings(effect.value);
      (effect.appliesTo.families ?? []).forEach(family => families.add(family));
    }
    if (aggregate) pending.push(aggregate.itemFormula);
    if (coverage) coverage.mechanisms.forEach(mechanism => pending.push(...mechanism.ruleIds));
    if (stateMachine) {
      const invocations = [...stateMachine.requirements.map(requirement => requirement.predicate), ...stateMachine.states.flatMap(state => state.duration?.kind === 'formula' ? [state.duration.invocation] : []),
        ...stateMachine.transitions.flatMap(transition => [...transition.predicate ? [transition.predicate] : [], ...transition.updates.flatMap(update => update.value?.kind === 'formula' ? [update.value.invocation] : [])])];
      for (const invocation of invocations) {
        pending.push(invocation.formula, ...invocation.captures.flatMap(slot => slot.attributes)); Object.values(invocation.bindings).forEach(bindings);
        if (invocation.predicate) bindings(invocation.predicate);
      }
    }
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  const selectedFormulas = [...data.formulas.entries()].filter(([key]) => selected.has(key)).map(([, formula]) => formula);
  const formulas = selectedFormulas.map(formula => formula.configuration);
  const filter = <T>(map: ReadonlyMap<string, T>): T[] => [...map.entries()].filter(([key]) => selected.has(key)).map(([, definition]) => definition);
  const attributes = filter(data.attributes), effects = filter(data.effects), aggregates = filter(data.aggregates), coverage = filter(data.coverage), features = new Set(['fixed-templates-v1']);
  if (selectedFormulas.some(formula => formula.definition.nodes.some(node => node.op === 'call'))) features.add('formula-call-v1');
  if (selectedFormulas.some(formula => formula.definition.nodes.some(node => node.op === 'lookup'))) features.add('table-lookup-v1');
  if (selectedFormulas.some(formula => Object.keys(formula.definition.modifierPorts ?? {}).length)) features.add('modifier-port-v1');
  if (attributes.length || effects.length) features.add('combat-binding-v1');
  if (effects.length) features.add('effect-v1');
  if (coverage.length) features.add('coverage-v1');
  if (aggregates.length) {
    features.add('aggregate-v1');
    if (data.features.includes('bound-aggregate-v1')) features.add('bound-aggregate-v1');
    if (data.features.includes('probability-enumeration-v1')) features.add('probability-enumeration-v1');
  }
  const stateMachines = filter(data.stateMachines);
  if (stateMachines.length) { features.add('event-state-v1'); features.add('combat-binding-v1'); }
  return { ok: true, diagnostics, bundle: structuredClone({ schemaVersion: 2, runtimeVersion: 2, requiredFeatures: [...features],
    sources: data.sources.filter(source => sources.has(source.id)), formulas, tables: filter(data.tables), attributes, effects, aggregates, coverage, stateMachines, damageFamilies: [...families] }) };
}

export function collectCalculationClosure(characterInput: unknown, registry?: unknown): CalculationClosureResult {
  const structure = inspectCalculationStructure(characterInput);
  if (structure.length) return { ok: false, diagnostics: structure };
  const parsed = structuredCharacterDefinitionSchema.safeParse(characterInput);
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map(issue => ({ code: 'invalid-range', severity: 'error', jsonPointer: calculationJsonPointer(issue.path), message: issue.message, affectedOutputIds: [] })) };
  const character = parsed.data, roots: DefinitionRef[] = [...Object.values(character.attributes.outputs), ...character.calculation.ruleIds, ...character.calculation.contextCoverageRefs,
    ...character.passives.flatMap(passive => passive.ruleIds), ...character.constellations.flatMap(constellation => constellation.ruleIds)];
  const sourceIds = new Set(character.sources), families = new Set<string>();
  const bindingRoots = (binding: CalculationBinding): void => {
    if (binding.kind === 'attribute' || binding.kind === 'enemy') roots.push(binding.key);
    if (binding.kind === 'formula') { roots.push(binding.formula); Object.values(binding.inputs).forEach(bindingRoots); }
  };
  for (const talent of character.talents) {
    talent.sources.forEach(source => sourceIds.add(source));
    for (const hit of talent.hits) {
      hit.sources.forEach(source => sourceIds.add(source)); roots.push(...hit.coverageRefs);
      for (const invocation of [hit.base, ...hit.outputs.map(output => output.invocation)]) {
        roots.push(invocation.formula, ...invocation.captures.flatMap(slot => slot.attributes)); Object.values(invocation.bindings).forEach(bindingRoots);
        if (invocation.predicate) bindingRoots(invocation.predicate);
      }
      for (const output of hit.outputs) { families.add(output.family); roots.push(...output.coverageRefs); }
    }
  }
  const result = collectCalculationRoots(registry ?? character.calculation.bundle, { roots, sourceIds: [...sourceIds], families: [...families] });
  if (!result.ok) return result;
  const compiled = compileStructuredCharacter({ ...character, calculation: { ...character.calculation, bundle: result.bundle } });
  return compiled.ok ? result : compiled;
}
