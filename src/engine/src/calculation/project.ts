import { authoredHit } from '@leyline/schema/hit-bindings';
import { combatFactDeclaration } from '@leyline/schema/buffs';
import { isTransformative } from '@leyline/schema';
import { subjectFacts, findBuildHit, buildSchema, combatConditionsSchema, damageRequestSchema, definitionKey, elements, statKeys, talentInputIssues, talentParameterAt,
  type AttributePanel, type Build, type CalculationBinding, type CalculationFact, type CalculationIssue, type CombatConditions,
  type CalculationEvent, type CombatContext, type CombatFrame, type DamageRequest, type DamageResult, type Enemy, type CalculationFeasibility, type QuantityUnit,
  type CalculationBundle, type EffectInstance, type EvaluationResult, type Project, type StatKey, type StructuredCombatSetup, type StructuredDamageEvaluation, type Value } from '@leyline/schema';
import { createStructuredCombatContext, evaluateStructuredHit, evaluateStructuredReaction, onFieldActor, prepareStructuredBuilds, structuredTeamFeasibility, type PreparedStructuredTeam } from './build-context';
import { evaluateCombatBindings, type BoundAttributeReader } from './context';
import { compiledData } from './compile';
import { buffEndMs, collectEffectInstances } from './effects';
import { damageBreakdown, lastTrace } from './damage-view';
import { compileCharacterActions } from './actions';
import { evaluateStateMachine } from './state-machine';
import { reactionOccurrence } from './project-reaction';
import { evaluateSceneHit } from './project-scene-hit';
import { castWindowStates } from './cast-windows';
import { resolveCombatHitElement } from './party-infusion';

type RecordEntry = Project['timeline'][number];
type World = Pick<Project, 'candidate' | 'timeline' | 'combatStates' | 'enemy' | 'reactionRules' | 'actionStates' | 'sceneEffects' | 'effectRevisions'>;
export interface ProjectRuntime { team: PreparedStructuredTeam; context: CombatContext; setup: StructuredCombatSetup; builds: Map<string, Build>; projectApplications: Set<string>; feasibility: CalculationFeasibility[];
  sceneEffects: Project['sceneEffects'];
  followUps: ReturnType<typeof castWindowStates>['followUps'] }
type Runtime = ProjectRuntime;
type PreparedRuntime = { ok: true; runtime: Runtime } | { ok: false; issues: CalculationIssue[] };
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
const fact = (value: Value | null): CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const ref = (id: string) => ({ namespace: 'builtin' as const, id, revision: '1' });
const conditionsFacts = (conditions: CombatConditions = {}): Record<string, CalculationFact> => Object.fromEntries(Object.entries(conditions)
  .filter(([, value]) => value !== undefined).map(([key, value]) => [key, fact(value === null ? null : typeof value === 'boolean' ? { kind: 'boolean', value } : quantity('scalar', value!))]));
const issue = (code: CalculationIssue['code'], message: string): CalculationIssue => ({ code, message });

export function projectCalculationEvent(record: RecordEntry, build?: Build): CalculationEvent {
  // Keep a frame for the query while excluding the independent scene hit from character triggers.
  if (record.sceneHit) return { id: record.id, kind: 'hit', actorId: null, targetIds: [], occurred: false,
    timeMs: record.timeMs, order: record.order, sourceEventIds: [], facts: {} };
  const selected = findBuildHit(build, record.damage?.hit);
  const skillId = selected?.talent?.id ?? record.skillId;
  const talent = selected?.talent ?? build?.character.talents.find(talent => talent.id === record.skillId);
  const hitId = record.damage?.hit.hitId;
  const captureId = record.damage?.capture?.recordId;
  const facts = record.damage?.facts ?? record.reactionEvent?.facts ?? record.talentHeal?.facts ?? record.captureFacts;
  const scoped = facts?.filter(row => row.subject.kind !== 'event');
  const reaction = record.damage?.reaction;
  const sourceEventIds = [...new Set([...(record.sourceEventIds ?? []), ...(captureId && captureId !== record.id ? [captureId] : [])])];
  return { id: record.id, kind: record.reactionEvent || record.observedReaction ? 'reaction' : record.kind === 'damage' ? 'hit' : record.kind,
    actorId: record.reactionEvent ? record.reactionEvent.triggerActorId ?? null : record.actor, targetIds: record.kind === 'damage' || record.observedReaction ? ['target'] : [],
    timeMs: record.timeMs, order: record.order, actionId: record.actionId, confirmedBuff: record.confirmedBuff, skillId, hitId, category: selected?.hit.category ?? talent?.category,
    ...(scoped?.length ? { subjectFacts: scoped } : {}), applications: record.damage?.effectApplications ?? record.reactionEvent?.effectApplications,
    reactionId: record.reactionEvent?.family ?? record.observedReaction ?? (reaction && reaction !== 'none' && reaction.trigger === 'record-owner' ? reaction.type : undefined),
    reactionElement: record.reactionEvent?.element ?? record.crystalElement,
    sourceEventIds, facts: { ...record.facts, ...subjectFacts(facts, { kind: 'event' }),
      ...(record.fieldSwitch && { enteredField: { value: { kind: 'boolean', value: true }, provenance: 'derived', sourceRefs: [] } }) } };
}

/** Current project records are explicit query anchors; this function never schedules extra actions or hits. */
export function prepareProjectRuntime(world: World): PreparedRuntime {
  const actors = world.candidate.actors.map(({ id, build, element }) => ({ id, build, element }));
  const builds = new Map(actors.flatMap(actor => actor.build ? [[actor.id, actor.build] as const] : []));
  const dependencies: CalculationBundle[] = world.reactionRules ? [world.reactionRules] : [];
  for (const state of world.actionStates ?? []) {
    const checked = compileCharacterActions(state.actions, builds.get(state.actorId)?.character);
    if (!checked.ok) return { ok: false, issues: checked.diagnostics.map(diagnostic => issue('invalid-input', diagnostic.message)) };
    dependencies.push(checked.bundle);
  }
  const prepared = prepareStructuredBuilds(actors, dependencies, world.sceneEffects);
  if (!prepared.ok) return { ok: false, issues: prepared.diagnostics.map(diagnostic => issue('invalid-input', diagnostic.message)) };
  const enemy = world.enemy;
  const setup: StructuredCombatSetup = {
    targets: [{ id: 'target', inputs: { level: fact(enemy ? quantity('count', enemy.level) : null), defenseReduction: fact(enemy ? quantity('scalar', enemy.defenseReduction) : null),
      ordinaryDamageReduction: fact(quantity('scalar', 0)), ...Object.fromEntries(elements.map(element => ['resistance.' + element, fact(enemy ? quantity('scalar', enemy.resistances[element]) : null)])) }, facts: {} }],
    team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [],
    factIntervals: (world.combatStates ?? []).map(interval => ({ id: interval.id, subject: { kind: 'actor', id: interval.actor }, startMs: interval.startMs, endMs: interval.endMs, facts: conditionsFacts(interval.values) })),
    events: world.timeline.map(record => projectCalculationEvent(record, builds.get(record.actor))),
  };
  try {
    const context = createStructuredCombatContext(prepared.team, setup);
    const followUps=applyCastWindows(world,context);
    for (const actor of context.actors) if (builds.has(actor.id)) actor.inputs.defenseIgnore = fact(quantity('scalar', enemy?.defenseIgnore ?? 0));
    for (const [index, record] of world.timeline.entries()) {
      if (record.damage && findBuildHit(builds.get(record.actor), record.damage.hit)?.hit.coordinated) {
        const dealer = onFieldActor(prepared.team, context, { eventId: record.id, targetId: 'target', phase: 'before' });
        context.events[index].actorId = dealer?.id ?? null;
      }
    }
    const runtime = { team: prepared.team, context, setup, builds, followUps, sceneEffects: world.sceneEffects,
      projectApplications: new Set<string>(), feasibility: [structuredTeamFeasibility(prepared.team)] };
    updateHitOccurrences(runtime, world.timeline);
    if (world.effectRevisions?.length) {
      const available = new Set(runtimeEffectViews(runtime, () => true).map(instance => instance.id));
      context.effectRevisions = world.effectRevisions.filter(item => available.has(item.instanceId))
        .map(({instanceId, disabled, value}) => ({instanceId, disabled, ...(value ? {value: {kind: 'quantity' as const, ...value}} : {})}));
    }
    return { ok: true, runtime };
  } catch (error) {
    const messages = error instanceof Error && 'issues' in error && Array.isArray(error.issues)
      ? error.issues.map(entry => entry.message as string)
      : [error instanceof Error ? error.message : '计算上下文无效。'];
    return { ok: false, issues: [...new Set(messages)].map(message => issue('invalid-input', message)) };
  }
}

export function applyCastWindows(world:World,context:CombatContext,rejected?:ReadonlySet<string>) {
  const windows=castWindowStates(world,rejected);
  for(const event of context.events) {
    const states=windows.frames.get(event.id);
    if(states) {
      const prior=event.derivedStates;
      if(prior) for(const phase of ['before','after'] as const) for(const [actor,facts] of Object.entries(prior[phase])) states[phase][actor]={...facts,...states[phase][actor]};
      event.derivedStates=states;
    }
    const contact=windows.contacts.get(event.id);
    if(contact && (contact.ready!==true || !event.facts[contact.key] || event.facts[contact.key].provenance==='derived')) event.facts[contact.key]={value:contact.ready===null ? null : {kind:'boolean',value:contact.ready},provenance:'derived',sourceRefs:[]};
  }
  return windows.followUps;
}

export function evaluateProjectStates(runtime: Runtime, actionStates: NonNullable<Project['actionStates']>): NonNullable<EvaluationResult['actionStateRuns']> {
  const frames: NonNullable<CombatContext['stateFrames']> = [];
  const runs = actionStates.map(({ actorId, actions, startMs, initial }, index) => {
    const state = evaluateStateMachine(runtime.team.program, runtime.context, {
      id: 'project-state-' + index, definition: actions.calculation.stateMachine, ownerId: actorId, targetId: 'target', startMs, initial,
    });
    frames.push(...state.stateFrames);
    return { actorId, status: state.execution, diagnostics: state.diagnostics, requiredInputs: state.requiredInputs };
  });
  runtime.context = { ...runtime.context, stateFrames: [...runtime.context.stateFrames ?? [], ...frames] };
  return runs;
}

function frameFor(runtime: Runtime, actorId: string, record: RecordEntry, conditions: CombatConditions = {}, query = record.damage, phase: CombatFrame['phase'] = 'before'): CombatFrame {
  const build = runtime.builds.get(actorId), source = record.actor === actorId ? undefined : findBuildHit(runtime.builds.get(record.actor), query?.hit);
  const selected = findBuildHit(build, query?.hit) ?? (source?.hit.coordinated ? source : undefined);
  const skill = selected?.talent, hit = selected?.hit;
  const dealer = hit?.coordinated ? runtime.context.events.find(event => event.id === record.id)?.actorId : undefined;
  const dealerElement = dealer ? runtime.builds.get(dealer)?.character.identity.element : undefined;
  const rows = query?.facts ?? record.reactionEvent?.facts ?? [];
  const factOverrides: CombatFrame['factOverrides'] = rows.flatMap(row => row.subject.kind === 'event' ? [] : [{ subject: row.subject, facts: row.values }]);
  const current = factOverrides.find(entry => entry.subject.kind === 'actor' && entry.subject.id === actorId);
  const inherited = conditionsFacts(conditions);
  if (current) current.facts = { ...inherited, ...current.facts };
  else factOverrides.push({ subject: { kind: 'actor', id: actorId }, facts: inherited });
  const captures = Object.fromEntries((hit?.base.captures ?? []).flatMap(slot => record.damage?.capture?.recordId && record.damage.capture.phase
    ? [[slot.id, { eventId: record.damage.capture.recordId, phase: record.damage.capture.phase }]] : []));
  const facts = { ...subjectFacts(rows, { kind: 'event' }) };
  const counter=skill?.castWindow?.hitCounter;
  if (counter && hit && counter.hits.includes(hit.id) && !facts[counter.input]) {
    const state=runtime.context.events.find(e=>e.id===record.id)?.derivedStates?.before[actorId];
    if (state?.[skill!.castWindow!.fact]?.value?.value===true && state[counter.input]) facts[counter.input]=state[counter.input];
  }
  const contact=[skill?.castWindow?.contact,skill?.castWindow?.followUp].find(rule=>rule && rule.hit===hit?.id);
  if (contact) {
    const ready = runtime.context.events.find(e => e.id === record.id)?.facts[contact.ready];
    if (ready?.provenance === 'derived' && (!facts[contact.ready] || ready.value?.value !== true)) facts[contact.ready]=ready;
  }
  const frame: CombatFrame = { ownerId: actorId, recipientId: actorId, contributorId: null, targetId: 'target', eventId: record.id, sourceEventId: record.damage?.capture?.recordId ?? null, phase,
    facts, actorFacts: {}, captures, applications: (record.damage?.effectApplications ?? record.reactionEvent?.effectApplications ?? []).filter(application => !runtime.projectApplications.has(application.instanceId)),
    factOverrides, hit: null };
  if (hit) {
    const owner = runtime.builds.get(record.actor)?.character;
    const selector = authoredHit(owner?.metadata, skill?.id, hit.id)?.family;
    let family = typeof selector === 'string' ? selector : Object.keys(hit.damage)[0] ?? 'ordinary';
    if (typeof selector === 'object') {
      const declaration = combatFactDeclaration(owner?.metadata.facts, selector.by)!;
      const value = evaluateCombatBindings(runtime.team.program, runtime.context, { family: { kind: 'fact', key: selector.by, ...declaration } }, frame).outputs.family;
      if (value?.state === 'known' && value.value.kind === 'enum') family = selector.cases[value.value.value];
    }
    frame.hit = { skillId: skill?.id ?? null, hitId: hit.id, category: hit.category,
      element: dealerElement ?? resolveCombatHitElement(runtime.team.program, runtime.context, frame, hit, family, skill?.category === 'normal', build, runtime.builds.values()).element,
      family, origin: hit.origin, reactionId: query?.reaction && query.reaction !== 'none' && query.reaction.trigger ? query.reaction.type : null };
  } else if (record.reactionEvent) {
    frame.hit = { skillId: null, hitId: null, category: null, element: record.reactionEvent.element, origin: 'reaction',
      family: isTransformative(record.reactionEvent.family) ? 'transformative' : record.reactionEvent.family, reactionId: record.reactionEvent.family };
  }
  return frame;
}

function emptyPanel(issues: CalculationIssue[]): AttributePanel {
  return { status: issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : 'partial', stats: Object.fromEntries(statKeys.map(key => [key, null])) as AttributePanel['stats'],
    contributions: [], categoryModifiers: [], diagnostics: issues.map(issue => issue.message), issues };
}
export function recordedAttackApplies(runtime: Runtime, record: RecordEntry): boolean | undefined {
  const found = findBuildHit(runtime.builds.get(record.actor), record.damage?.hit);
  if (!found?.talent || found.hit.coordinated || record.reactionEvent) return false;
  const event = runtime.context.events.find(event => event.id === record.id);
  return event?.occurred === null ? undefined : !!event && event.occurred !== false;
}

export function updateHitOccurrences(runtime: Runtime, timeline: RecordEntry[]) {
  const events = new Map(runtime.context.events.map(event => [event.id, event]));
  for (const record of [...timeline].sort((a,b) => a.timeMs - b.timeMs || a.order - b.order || a.id.localeCompare(b.id))) {
    if (!record.damage) continue;
    const found = findBuildHit(runtime.builds.get(record.actor), record.damage.hit);
    if (!found) continue;
    const outputs = Object.values(found.hit.damage);
    if (!outputs.length || outputs.some(output => !output.predicate)) continue;
    const event = events.get(record.id)!;
    const dealer = found.hit.coordinated ? event.actorId : record.actor;
    const frame = frameFor(runtime, dealer ?? record.actor, record);
    if (found.hit.coordinated) frame.contributorId = record.actor;
    const states = outputs.map(output => evaluateCombatBindings(runtime.team.program, runtime.context, { active: output.predicate! }, frame).outputs.active);
    event.occurred = states.some(state => state.state === 'known' && state.value.kind === 'boolean' && state.value.value)
      ? true : states.every(state => state.state === 'known') ? false : null;
  }
}
export function readRuntimePanel(runtime: Runtime, actorId: string, record: RecordEntry, conditions: CombatConditions = {}, query = record.damage, phase: CombatFrame['phase'] = 'before'): AttributePanel {
  const build = runtime.builds.get(actorId);
  if (!build) return emptyPanel([issue('unknown', '角色配装尚未明确。')]);
  const frame = frameFor(runtime, actorId, record, conditions, query, phase);
  const data = compiledData(runtime.team.program)!;
  const keys = [...new Set([...statKeys, ...[...data.attributes.values()].filter(attribute => (attribute.scope === 'actor' || frame.hit && attribute.scope === 'hit')
    && attribute.identity.namespace === 'builtin' && attribute.identity.id.startsWith('attribute.')).map(attribute => attribute.identity.id.slice('attribute.'.length))])];
  const bindings: Record<string, CalculationBinding> = Object.fromEntries(keys.map(key => [key, { kind: 'attribute', actor: { role: 'owner' }, key: build.character.attributes.outputs[key as StatKey] ?? ref('attribute.' + key), at: { kind: 'current', phase: 'same' } }]));
  const target = frame.hit && runtime.context.targets.find(entry => entry.id === frame.targetId);
  if (target) for (const element of elements) {
    const id = 'target.resistance.' + element;
    if (target.inputs['resistance.' + element] && data.attributes.has(definitionKey(ref(id)))) {
      bindings[id] = { kind: 'enemy', key: ref(id), at: { kind: 'current', phase: 'same' } };
    }
  }
  for (const effect of frame.hit ? data.effects.values() : []) {
    if (effect.target.kind !== 'attribute') continue;
    const target = effect.target.attribute;
    if (!target.id.startsWith('target.') || data.attributes.get(definitionKey(target))?.scope !== 'target') continue;
    bindings[target.id] = { kind: 'enemy', key: target, at: { kind: 'current', phase: 'same' } };
  }
  const read = evaluateCombatBindings(runtime.team.program, runtime.context, bindings, frame);
  const panel = emptyPanel([]);
  const effectValues = new Map<string, NonNullable<AttributePanel['effectValues']>[number]>();
  const trace = new Map(read.trace.map(node => [node.id, node]));
  const pending = Object.values(read.outputs).map(value => value.traceId);
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = trace.get(id);
    if (!node) continue;
    pending.push(...node.dependencies);
    const context = node.context;
    if (node.kind !== 'effect' || !context?.effectInstanceId || context.recipientId !== actorId || context.eventId !== record.id || context.phase !== phase) continue;
    const quantity = node.value?.kind === 'quantity' ? node.value : undefined;
    effectValues.set(JSON.stringify([context.effectInstanceId, node.nodeId]), { instanceId: context.effectInstanceId, modifierId: node.nodeId, value: quantity?.value ?? null, unit: quantity?.unit });
  }
  if (effectValues.size) panel.effectValues = [...effectValues.values()];
  panel.attributes = Object.fromEntries(Object.entries(read.outputs).map(([key, value]) => [key, value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null]));
  for (const key of statKeys) { const value = read.outputs[key]; panel.stats[key] = value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null; }
  panel.issues = read.diagnostics.map(diagnostic => ({ code: diagnostic.code === 'missing-fact' ? 'unknown' : 'invalid-input', message: diagnostic.message,
    affects: diagnostic.affectedOutputIds.filter(key => statKeys.includes(key as StatKey)).map(stat => ({ stat: stat as StatKey })) }));
  panel.status = read.execution; panel.diagnostics = panel.issues.map(issue => issue.message);
  if (!frame.hit && panel.status === 'complete' && build.character.calculation.contextCoverageRefs.some(reference => {
    const proof = data.coverage.get(definitionKey(reference));
    return proof?.resolution !== 'complete' || proof.scope.kind === 'context' && proof.scope.maxConstellation < build.constellation;
  })) panel.status = 'partial';
  const actor = runtime.context.actors.find(actor => actor.id === actorId)!;
  const white = (key: string) => { const value = actor.inputs[key]?.value; return value?.kind === 'quantity' ? value.value : NaN; };
  panel.baseStats = { hp: white('whiteHp'), attack: white('whiteAttack'), defense: white('whiteDefense') };
  return panel;
}

function directWorld(build: Build, damage?: DamageRequest, enemy?: Enemy): { world: World; record: RecordEntry } {
  const record: RecordEntry = { id: 'query', actor: 'owner', kind: damage ? 'damage' : 'capture', definition: 'query', timeMs: 0, order: 0, ...damage ? { damage } : {} };
  return { world: { candidate: { id: 'query', actors: [{ id: 'owner', character: 'character', weapon: 'weapon', inputs: {}, build }] }, timeline: [record], enemy }, record };
}
export function readBuildPanel(input: unknown, conditions: CombatConditions = {}, query?: DamageRequest): AttributePanel {
  const build = buildSchema.safeParse(input);
  if (!build.success || !combatConditionsSchema.safeParse(conditions).success) return emptyPanel([issue('invalid-input', '配装或战斗条件格式无效。')]);
  const { world, record } = directWorld(build.data, query), prepared = prepareProjectRuntime(world);
  return prepared.ok ? readRuntimePanel(prepared.runtime, 'owner', record, conditions, query) : emptyPanel(prepared.issues);
}

function needsCombatContext(binding: CalculationBinding): boolean {
  switch (binding.kind) {
    case 'constant':
    case 'refinement-parameter':
      return false;
    case 'attribute':
      if (binding.at.kind !== 'current') return true;
      return binding.actor.role !== 'owner' && binding.actor.role !== 'recipient';
    case 'actor-state':
    case 'talent-parameter':
      return binding.actor.role !== 'owner' && binding.actor.role !== 'recipient';
    case 'formula':
      return Object.values(binding.inputs).some(needsCombatContext);
    default:
      return true;
  }
}

/** Read the equipped build with its passive stats, without assuming a combat state. */
export function resolveEquipmentPanel(input: unknown): AttributePanel {
  const parsed = buildSchema.safeParse(input);
  if (!parsed.success) return emptyPanel([issue('invalid-input', '配装格式无效。')]);
  const { world, record } = directWorld(parsed.data);
  const prepared = prepareProjectRuntime(world);
  if (!prepared.ok) return emptyPanel(prepared.issues);
  const { runtime } = prepared;
  const data = compiledData(runtime.team.program)!;
  for (const actor of runtime.context.actors) {
    actor.effects = actor.effects.filter(reference => {
      const effect = data.effects.get(definitionKey(reference))!;
      return effect.trigger.kind === 'permanent' && effect.application === 'always' && !Object.keys(effect.appliesTo).length
        && effect.recipient.role !== 'fact-actor' && (!effect.predicate || !needsCombatContext(effect.predicate))
        && !needsCombatContext(effect.value);
    });
  }
  return readRuntimePanel(runtime, 'owner', record);
}

export function evaluateRuntimeHit(runtime: Runtime, actorId: string, record: RecordEntry, conditions: CombatConditions = {}, attributeReader?: BoundAttributeReader): DamageResult {
  if (record.sceneHit) return evaluateSceneHit(runtime.sceneEffects, record.sceneHit, record.timeMs, emptyPanel([]));
  const damage = record.damage, build = runtime.builds.get(actorId), panel = readRuntimePanel(runtime, actorId, record, conditions);
  const empty = (issues: CalculationIssue[]): DamageResult => ({ status: issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : 'partial', value: null, panel,
    parts: { attack: panel.stats.attack, multiplier: null, bonus: null, crit: null, defense: null, resistance: null }, baseDamage: null, scaling: [], diagnostics: issues.map(issue => issue.message), issues });
  if (record.reactionEvent) {
    const program = compiledData(runtime.team.program)!, family = record.reactionEvent.family;
    if (isTransformative(family) ? !program.attributes.has(definitionKey(ref('attribute.reaction.' + family + '.coefficient')))
      : !program.aggregates.has(definitionKey(ref(family)))) return empty([issue('unknown', '尚未提供此反应的求值规则。')]);
    const output = reactionOccurrence(record.id, record.reactionEvent, id => frameFor(runtime, id, record, id === actorId ? conditions : {}),
      id => program.attributes.has(definitionKey(ref('attribute.' + id))));
    const result = evaluateStructuredReaction(runtime.team, runtime.context, output, attributeReader);
    return { ...empty(resultIssues(result)), status: result.execution, ...resultValues(result), structured: result };
  }
  if (!damage || !build) return empty([issue('unknown', '尚未选择角色和明确输出。')]);
  const frame = frameFor(runtime, actorId, record, conditions), { ownerId, recipientId, contributorId, hit: metadata, ...requestFrame } = frame;
  const selected = findBuildHit(build, damage.hit), skill = selected?.talent, hit = selected?.hit;
  if (damage.hitOrdinal !== undefined && damage.hitOrdinal > (hit?.selection?.repetitions ?? 0)) {
    return empty([issue('invalid-input', '命中序号须在所选单击的重复次数内。')]);
  }
  if (skill?.noIndependentDamage && hit?.origin !== 'triggered') return empty([issue('invalid-input', '该技能没有独立伤害。')]);
  const triggerPending = damage.reaction !== null && damage.reaction !== 'none' && damage.reaction.trigger === null;
  const result = evaluateStructuredHit(runtime.team, runtime.setup, { actorId, hit: damage.hit, frame: requestFrame,
    critMode: damage.crit, reactionMode: damage.reaction === null || triggerPending ? null : damage.reaction === 'none' ? 'none' : damage.reaction.type }, { context: runtime.context, attributeReader });
  const issues = resultIssues(result);
  if (triggerPending) issues.push(issue('unknown', '反应触发归属尚未确认。'));
  const base = authoredHit(build.character.metadata, skill?.id, hit?.id)?.base;
  const primary = Array.isArray(base) ? base[0] : undefined;
  const selectedMultiplier = skill ? talentParameterAt(skill, primary?.parameter, runtime.team.talentRank(build, skill.category)) : undefined;
  const dealer = hit?.coordinated ? result.outputs[0]?.actorId : actorId;
  const dealtPanel = dealer && dealer !== actorId ? readRuntimePanel(runtime, dealer, record) : panel;
  const dealtElement = dealer && hit?.coordinated ? runtime.builds.get(dealer)?.character.identity.element : undefined;
  const resolvedElement = dealtElement ?? metadata?.element;
  const resolvedHit = hit && resolvedElement ? { ...hit, element: resolvedElement } : hit;
  const breakdown = damageBreakdown(compiledData(runtime.team.program)!, damage, resolvedHit, result);
  const multiplier = selectedMultiplier ?? breakdown.scaling[0]?.multiplier ?? null;
  const attackRead = lastTrace(result.trace, node => node.kind === 'attribute' && node.nodeId === 'attribute.attack' && node.context?.actorId === dealer);
  return { status: result.execution, ...resultValues(result, triggerPending), panel: dealtPanel,
    ...breakdown, parts: { attack: attackRead?.value?.kind === 'quantity' ? attackRead.value.value : dealtPanel.stats.attack, multiplier, ...breakdown.parts },
    diagnostics: issues.map(issue => issue.message), issues,
    structured: result };
}

function resultIssues(result: StructuredDamageEvaluation): CalculationIssue[] {
  return result.diagnostics.filter(diagnostic => diagnostic.affectedOutputIds.length || ['budget', 'unreviewed-mechanism'].includes(diagnostic.code) || result.execution === 'invalid')
    .map(diagnostic => issue(diagnostic.code === 'missing-fact' ? 'unknown' : diagnostic.code === 'unreviewed-mechanism' ? 'unsupported' : 'invalid-input', diagnostic.message));
}

function resultValues(result: StructuredDamageEvaluation, pending = false): Pick<DamageResult, 'value'> {
  const value = result.totals.all;
  return { value: !pending && value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null };
}

export function evaluateBuildHit(input: unknown, damageInput: unknown, enemy?: Enemy): DamageResult {
  const build = buildSchema.safeParse(input), damage = damageRequestSchema.safeParse(damageInput);
  if (!build.success || !damage.success) return { status: 'invalid', value: null, panel: readBuildPanel(input), parts: { attack: null, multiplier: null, bonus: null, crit: null, defense: null, resistance: null }, baseDamage: null, scaling: [], diagnostics: ['当前配装或稳定输出选择无效。'], issues: [issue('invalid-input', '当前配装或稳定输出选择无效。')] };
  const { world, record } = directWorld(build.data, damage.data, enemy), prepared = prepareProjectRuntime(world);
  if (!prepared.ok) return { status: 'invalid', value: null, panel: emptyPanel(prepared.issues), parts: { attack: null, multiplier: null, bonus: null, crit: null, defense: null, resistance: null }, baseDamage: null, scaling: [], diagnostics: prepared.issues.map(issue => issue.message), issues: prepared.issues };
  return evaluateRuntimeHit(prepared.runtime, 'owner', record);
}

export function runtimeEffectViews(runtime: Runtime, visit: () => boolean): EffectInstance[] {
  const data = compiledData(runtime.team.program)!;
  const entity = (actorId: string, reference: { namespace: string; id: string; revision: string }): string => {
    const build = runtime.builds.get(actorId)!;
    return [build.weapon, ...build.sets, build.character].find(entity => entity?.calculation.bundle.effects.some(effect => definitionKey(effect.identity) === definitionKey(reference)))?.id ?? build.character.id;
  };
  const unit = (target: import('@leyline/schema').EffectDefinition['target']): QuantityUnit => {
    const type = target.kind === 'attribute' ? data.attributes.get(definitionKey(target.attribute))!.type
      : data.formulas.get(definitionKey(target.formula))!.definition.modifierPorts![target.port].type;
    return type.kind === 'quantity' ? type.unit : 'scalar';
  };
  const views = new Map<string, EffectInstance>();
  for (const instance of collectEffectInstances(data, runtime.context, 'target', visit)) {
    const window = instance.definition.windowFact;
    if (!instance.source && window) {
      const subject = {kind: 'actor' as const, id: instance.owner.id};
      const observed = instance.owner.facts[window] || runtime.context.events.some(event =>
        subjectFacts(event.subjectFacts, subject)?.[window] || event.derivedStates?.before[subject.id]?.[window] || event.derivedStates?.after[subject.id]?.[window])
        || [...runtime.context.factIntervals, ...(runtime.context.stateFrames ?? [])].some(entry =>
          entry.subject.kind === 'actor' && entry.subject.id === subject.id && entry.facts[window]);
      if (!observed) continue;
    }
    const modifier = { definition: instance.definition.identity.id, attribute: instance.definition.target.kind === 'attribute'
      ? instance.definition.target.attribute.id.replace(/^attribute\./, '') : instance.definition.target.port, unit: unit(instance.definition.target) };
    const previous = views.get(instance.id);
    if (previous) { previous.modifiers!.push(modifier); continue; }
    views.set(instance.id, { id: instance.id, owner: instance.owner.id, slot: 'content', definition: instance.definition.identity.id,
    version: instance.definition.identity.revision, effect: instance.definition.identity.id, action: instance.source?.id ?? null, startMs: instance.source?.timeMs ?? 0,
      endMs: Math.min(buffEndMs(instance.definition, instance.source, instance.until), instance.replacedBy?.timeMs ?? Infinity),
      ...(instance.possibleEndMs === undefined ? {} : { possibleEndMs: instance.possibleEndMs }),
    recipient: instance.definition.recipient.role === 'team' ? 'team' : instance.owner.id, attribute: modifier.attribute, unit: modifier.unit, modifiers: [modifier],
    disabled: runtime.context.effectRevisions?.some(revision => revision.instanceId === instance.id && revision.disabled) ?? false,
    ...(!instance.triggerKnown ? { unconfirmed: true as const } : {}),
    content: { entity: entity(instance.owner.id, instance.definition.identity), rule: instance.definition.identity.id }, ...(instance.definition.lifetime.kind === 'permanent' ? { permanent: true as const } : {}),
    ...(instance.definition.application === 'explicit' ? { requiresApplication: true as const } : {}) });
  }
  return [...views.values()];
}
