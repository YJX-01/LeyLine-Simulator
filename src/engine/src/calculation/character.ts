import { calculationJsonPointer, definitionKey, inspectCalculationStructure, structuredCharacterDefinitionSchema, type BoundFormula, type CalculationBinding, type CalculationDiagnostic, type DefinitionRef, type StructuredCharacterDefinition } from '@leyline/schema';
import { calculationBudgets, compileCalculation, compiledData, type CompiledCalculation, type CompiledData } from './compile';
import { validateBoundFormula, type BindingReporter } from './binding-validation';

export type CompiledStructuredCharacter = { ok: true; character: StructuredCharacterDefinition; program: CompiledCalculation; diagnostics: CalculationDiagnostic[] }
  | { ok: false; diagnostics: CalculationDiagnostic[] };

/** Validate the complete owned character snapshot without any catalog or registry lookup. */
export function compileStructuredCharacter(input: unknown): CompiledStructuredCharacter {
  const diagnostics = inspectCalculationStructure(input);
  if (diagnostics.length) return { ok: false, diagnostics };
  const parsed = structuredCharacterDefinitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map(issue => ({ code: 'invalid-range', severity: 'error',
    jsonPointer: calculationJsonPointer(issue.path), message: issue.message, affectedOutputIds: [] })) };
  const character = parsed.data, compiled = compileCalculation(character.calculation.bundle);
  if (!compiled.ok) return compiled;
  const data = compiledData(compiled.program)!;
  const report = (code: CalculationDiagnostic['code'], pointer: string, message: string) => diagnostics.push({ code, severity: 'error', jsonPointer: pointer, message, affectedOutputIds: [] });
  const sourceIds = [...character.sources, ...character.talents.flatMap(talent => [...talent.sources, ...talent.hits.flatMap(hit => hit.sources)])];
  if (sourceIds.some(id => !data.sources.some(source => source.id === id))) report('missing-dependency', '/sources', '角色快照缺少明确来源；必须提供完整闭包。');
  validateCharacterBindings(data, character, report);
  return diagnostics.length ? { ok: false, diagnostics } : { ok: true, character, program: compiled.program, diagnostics };
}

export function validateCharacterBindings(data: CompiledData, character: StructuredCharacterDefinition, report: BindingReporter): void {
  type Actors = Record<'owner' | 'recipient' | 'contributor', boolean>;
  const self: Actors = { owner: true, recipient: true, contributor: false };
  const visitedAttributes = new Set<string>();
  const attributeBindings = (reference: DefinitionRef, actors: Actors, pointer: string, depth = 0): void => {
    if (depth > calculationBudgets.depth) { report('budget', pointer, '角色参数依赖深度超过预算。'); return; }
    const key = JSON.stringify([definitionKey(reference), actors]);
    if (visitedAttributes.has(key)) return;
    visitedAttributes.add(key);
    const attribute = data.attributes.get(definitionKey(reference));
    if (!attribute || attribute.base.kind === 'input') return;
    const index = character.calculation.bundle.attributes.findIndex(item => definitionKey(item.identity) === definitionKey(reference));
    bindingParameters(attribute.base, index < 0 ? pointer : `/calculation/bundle/attributes/${index}/base`, actors, depth + 1);
  };
  const bindingParameters = (binding: CalculationBinding, pointer: string, actors: Actors, depth = 0): void => {
    if (depth > calculationBudgets.depth) { report('budget', pointer, '角色参数绑定深度超过预算。'); return; }
    if (binding.kind === 'talent-parameter' && binding.actor.role !== 'fact-actor' && actors[binding.actor.role]) {
      const parameter = character.talents.find(talent => talent.id === binding.skillId)?.parameters.find(parameter => parameter.id === binding.parameterId);
      if (!parameter) report('missing-dependency', pointer + '/parameterId', '角色规则引用了不存在的技能参数：' + binding.skillId + '.' + binding.parameterId);
      else {
        const unit = parameter.unit === 'ratio' ? 'scalar' : parameter.unit === 'seconds' ? 'milliseconds' : parameter.unit;
        if (unit !== 'unknown' && (binding.type.kind !== 'quantity' || binding.type.unit !== unit)) report('unit-mismatch', pointer + '/type', '角色参数绑定与原参数单位不一致。');
      }
    }
    if (binding.kind === 'formula') for (const [key, input] of Object.entries(binding.inputs)) bindingParameters(input, pointer + '/inputs' + calculationJsonPointer([key]), actors, depth + 1);
    if (binding.kind === 'attribute' || binding.kind === 'enemy') {
      const definition = data.attributes.get(definitionKey(binding.key));
      const actorIsSelf = binding.kind === 'attribute' && binding.actor.role !== 'fact-actor' && actors[binding.actor.role];
      const baseActors = definition?.scope === 'target' || definition?.scope === 'team' ? actors : { ...actors, owner: actorIsSelf, recipient: actorIsSelf };
      attributeBindings(binding.key, baseActors, pointer + '/key', depth + 1);
    }
  };
  for (const [key, reference] of Object.entries(character.attributes.outputs)) {
    const definition = data.attributes.get(definitionKey(reference)), unit = ['hp', 'attack', 'defense', 'elementalMastery'].includes(key) ? key : 'scalar';
    if (!definition) report('missing-dependency', '/attributes/outputs', '角色面板缺少属性的精确版本。');
    else if (definition.scope !== 'actor' || definition.type.kind !== 'quantity' || definition.type.unit !== unit) report('unit-mismatch', '/attributes/outputs', '角色面板输出的类型、单位或作用域不匹配。');
    attributeBindings(reference, self, '/attributes/outputs' + calculationJsonPointer([key]));
  }
  const ruleIds = [...character.calculation.ruleIds, ...character.passives.flatMap(passive => passive.ruleIds), ...character.constellations.flatMap(constellation => constellation.ruleIds)];
  for (const reference of ruleIds) {
    const effect = data.effects.get(definitionKey(reference));
    if (!effect) continue;
    const index = character.calculation.bundle.effects.findIndex(item => definitionKey(item.identity) === definitionKey(reference));
    const pointer = `/calculation/bundle/effects/${index}`, actors = { owner: true, recipient: effect.recipient.role === 'owner', contributor: false };
    if (effect.predicate) bindingParameters(effect.predicate, pointer + '/predicate', actors);
    bindingParameters(effect.value, pointer + '/value', actors);
  }
  const validateInvocation = (invocation: BoundFormula, pointer: string): void => {
    validateBoundFormula(data, invocation, (code, location, message) => report(code, pointer + location.slice('/invocation'.length), message));
    for (const [key, binding] of Object.entries(invocation.bindings)) bindingParameters(binding, pointer + '/bindings' + calculationJsonPointer([key]), self);
    if (invocation.predicate) bindingParameters(invocation.predicate, pointer + '/predicate', self);
  };
  for (const [index, machine] of character.calculation.bundle.stateMachines.entries()) {
    const pointer = `/calculation/bundle/stateMachines/${index}`;
    for (const [stateIndex, state] of machine.states.entries()) if (state.duration?.kind === 'formula') validateInvocation(state.duration.invocation, `${pointer}/states/${stateIndex}/duration`);
    for (const [requirementIndex, requirement] of machine.requirements.entries()) validateInvocation(requirement.predicate, `${pointer}/requirements/${requirementIndex}/predicate`);
    for (const [transitionIndex, transition] of machine.transitions.entries()) {
      if (transition.predicate) validateInvocation(transition.predicate, `${pointer}/transitions/${transitionIndex}/predicate`);
      for (const [updateIndex, update] of transition.updates.entries()) if (update.value?.kind === 'formula') validateInvocation(update.value.invocation, `${pointer}/transitions/${transitionIndex}/updates/${updateIndex}/value`);
    }
  }
  for (const [talentIndex, talent] of character.talents.entries()) for (const [hitIndex, hit] of talent.hits.entries()) {
    const pointer = `/talents/${talentIndex}/hits/${hitIndex}`;
    validateInvocation(hit.base, pointer + '/base');
    for (const [index, output] of hit.outputs.entries()) {
      const outputPointer = `${pointer}/outputs/${index}`;
      validateInvocation(output.invocation, outputPointer + '/invocation');
      if (!data.damageFamilies.includes(output.family)) report('missing-dependency', outputPointer + '/family', '命中输出引用了未声明的伤害族。');
      const formula = data.formulas.get(definitionKey(output.invocation.formula));
      const type = formula?.definition.outputs[output.invocation.output]?.type;
      if (type && (type.kind !== 'quantity' || type.unit !== 'damage')) report('unit-mismatch', outputPointer + '/invocation/output', '伤害输出必须是damage数量。');
    }
  }
}
