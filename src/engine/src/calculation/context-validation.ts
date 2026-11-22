import { definitionKey, valueMatchesType, type CalculationDiagnostic, type CalculationFact, type CombatContext } from '@leyline/schema';
import type { CompiledData } from './compile';
import { validateCalculationEvents } from './events';

export function validateContextDefinitions(data: CompiledData, context: CombatContext): { diagnostics: CalculationDiagnostic[]; sources: ReadonlySet<string> } {
  const diagnostics = validateCalculationEvents(context), sources = new Set<string>(), contents = new Map<string, string>();
  const report = (code: CalculationDiagnostic['code'], pointer: string, message: string) => diagnostics.push({ code, severity: 'error', jsonPointer: pointer, message, affectedOutputIds: [] });
  for (const source of [...data.sources, ...context.sources]) {
    const content = JSON.stringify(source, Object.keys(source).sort());
    if (contents.has(source.id) && contents.get(source.id) !== content) report('conflicting-definition', '/context/sources', '相同来源身份对应不同内容。');
    contents.set(source.id, content); sources.add(source.id);
  }
  const facts = [...context.actors.flatMap(actor => [...Object.values(actor.inputs), ...Object.values(actor.facts)]),
    ...context.targets.flatMap(target => [...Object.values(target.inputs), ...Object.values(target.facts)]), ...Object.values(context.team.inputs), ...Object.values(context.team.facts),
    ...context.events.flatMap(event => Object.values(event.facts)), ...context.factIntervals.flatMap(interval => Object.values(interval.facts)),
    ...(context.stateFrames ?? []).flatMap(entry => Object.values(entry.facts))];
  const actorIds = new Set(context.actors.map(actor => actor.id));
  const targetIds = new Set(context.targets.map(target => target.id));
  for (const [i,event] of context.events.entries()) {
    for (const { subject, values } of event.subjectFacts ?? []) {
      if (subject.kind === 'actor' && !actorIds.has(subject.id) || subject.kind === 'target' && !targetIds.has(subject.id)) {
        report('stale-reference', '/context/events/' + i + '/subjectFacts', '事实的主体不在当前队伍或目标中。');
      }
      facts.push(...Object.values(values));
    }
    for (const state of Object.values(event.derivedStates ?? {})) for (const [actor, values] of Object.entries(state)) {
      if (!actorIds.has(actor)) report('stale-reference', '/context/events/' + i, '推导状态引用了无效的队员。');
      facts.push(...Object.values(values));
    }
  }
  if (!factsHaveSources(facts, sources)) report('missing-dependency', '/context', '事实缺少来源记录。');
  for (const [index, actor] of context.actors.entries()) {
    if (actor.identity?.sourceRefs.some(source => !sources.has(source))) report('missing-dependency', `/context/actors/${index}/identity`, '队员元素身份缺少来源记录。');
    if (actor.talents.some(talent => talent.sourceRefs.some(source => !sources.has(source)))) report('missing-dependency', `/context/actors/${index}/talents`, '技能参数缺少来源记录。');
    const keys = actor.effects.map(definitionKey);
    if (new Set(keys).size !== keys.length) report('conflicting-definition', `/context/actors/${index}/effects`, '队员效果身份重复。');
    if (keys.some(key => !data.effects.has(key))) report('stale-reference', `/context/actors/${index}/effects`, '队员效果缺少精确版本。');
    for (const talent of actor.talents) for (const parameter of talent.parameters) if (parameter.type && parameter.values.some(value => value !== null && !valueMatchesType(value, parameter.type!))) report('unit-mismatch', `/context/actors/${index}/talents`, '技能参数类型或单位不匹配。');
  }
  return { diagnostics, sources };
}
export function factsHaveSources(facts: readonly CalculationFact[], sources: ReadonlySet<string>): boolean {
  return facts.every(fact => fact.sourceRefs.every(source => sources.has(source)));
}
