import { definitionKey, type CalculationBinding, type CalculationTraceNode, type DamageRequest, type DamageResult,
  type DefinitionRef, type EvaluatedValue, type StructuredDamageEvaluation, type StructuredCharacterDefinition } from '@leyline/schema';
import type { CompiledData } from './compile';

type Hit = Pick<StructuredCharacterDefinition['talents'][number]['hits'][number], 'base' | 'element' | 'snapshot'>;

function numeric(value: EvaluatedValue | CalculationTraceNode | undefined): number | null {
  return value?.state === 'known' && value.value?.kind === 'quantity' ? value.value.value : null;
}

export function lastTrace(trace: readonly CalculationTraceNode[], match: (node: CalculationTraceNode) => boolean): CalculationTraceNode | undefined {
  for (let index = trace.length - 1; index >= 0; index--) if (match(trace[index])) return trace[index];
}

/** Project the computed trace into the existing inspector fields. No damage arithmetic here. */
export function damageBreakdown(data: CompiledData, request: DamageRequest, hit: Hit | undefined, result: StructuredDamageEvaluation) {
  const root = result.outputs[0];
  const stages = new Map(root?.stages.map(stage => [stage.id, numeric(stage.value)]));
  const traceById = new Map(result.trace.map(node => [node.id, node]));
  const stage = (id: string) => stages.get(id) ?? null;
  const rootNode = (id: string) => lastTrace(result.trace, node => node.nodeId === id && !!root && definitionKey(node.definition) === definitionKey(root.computation.definition));
  const scale: DamageResult['scaling'] = [];

  function walk(reference: DefinitionRef, bindings: Record<string, CalculationBinding>, outputTraceId?: string): void {
    const recipe = data.formulas.get(definitionKey(reference))?.configuration.template;
    if (recipe?.id !== 'scaled-damage' && recipe?.id !== 'damage-sum') return;
    const nodes = new Map<string, CalculationTraceNode>(), seen = new Set<string>();
    const pending = outputTraceId ? [outputTraceId] : [];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = traceById.get(id);
      if (!node) continue;
      if (definitionKey(node.definition) === definitionKey(reference) && !nodes.has(node.nodeId)) nodes.set(node.nodeId, node);
      pending.push(...node.dependencies);
    }
    if (recipe.id === 'damage-sum') {
      for (const [key, binding] of Object.entries(bindings)) if (binding.kind === 'formula') walk(binding.formula, binding.inputs, nodes.get(key)?.dependencies[0]);
      return;
    }
    for (const [index, term] of recipe.terms.entries()) {
      const ratio = bindings[term.ratio], count = term.count ? bindings[term.count] : undefined;
      const contribution = numeric(nodes.get(`$term${index}.${term.count ? 'value' : 'scaled'}`));
      scale.push({ stat: term.stat, parameter: ratio?.kind === 'talent-parameter' ? ratio.parameterId : term.ratio,
        attribute: numeric(nodes.get(term.attribute)), multiplier: numeric(nodes.get(term.ratio)), contribution,
        ...(count?.kind === 'fact' ? { count: { input: count.key, value: numeric(nodes.get(term.count!)) } } : {}) });
    }
  }
  if (hit) walk(hit.base.formula, hit.base.bindings, (rootNode('skillBase') ?? rootNode('scaledBase'))?.dependencies[0]);
  const parts = { bonus: stage('bonus') ?? stage('reaction-bonus'), crit: stage('crit'), defense: stage('defense'), resistance: stage('resistance') };
  const reaction = request.reaction && request.reaction !== 'none' && hit ? request.reaction : undefined;
  let detail: DamageResult['reaction'];
  if (reaction && hit) {
    const family = reaction.type === 'melt' || reaction.type === 'vaporize' ? 'amplifying' : 'additive';
    const template = lastTrace(result.trace, node => {
      const formula = data.formulas.get(definitionKey(node.definition))?.configuration.template;
      return formula?.id === 'standard-reaction' && formula.family === family;
    })?.definition;
    const inReaction = (id: string) => numeric(lastTrace(result.trace, node => node.nodeId === id && !!template && definitionKey(node.definition) === definitionKey(template)));
    const sources = data.sources.filter(source => template && data.formulas.get(definitionKey(template))?.configuration.sources.includes(source.id))
      .flatMap(source => source.kind === 'repo' ? [{ repository: source.repository, commit: source.commit, path: source.path }] : []);
    detail = { ...reaction, family, element: hit.element, elementalMastery: inReaction('em'), bonus: inReaction('reactionBonus'), coefficient: inReaction('reactionCoefficient'),
      levelMultiplier: inReaction('levelMultiplier'), multiplier: stage('amplification'), addedBaseDamage: stage('reaction-base'), rulesRevision: template?.revision ?? null, sources };
  }
  return { parts, baseDamage: numeric(rootNode('skillBase')) ?? stage('skill-base') ?? stage('reaction-base'),
    baseDamageBonus: result.diagnostics.some(diagnostic => diagnostic.code === 'unreviewed-mechanism' && diagnostic.nodeId === 'attribute.baseDamageBonus')
      ? null : stage('base-flat') ?? stage('reaction-flat'), scaling: scale,
    ...(hit?.snapshot ? { capture: { ...hit.snapshot, recordId: request.capture?.recordId ?? null, phase: request.capture?.phase ?? null } } : {}),
    ...(detail ? { reaction: detail } : {}) };
}
