import { buildSchema, combatConditionsSchema, damageRequestSchema, definitionKey, elements, statKeys, talentInputIssues, talentLevelBonus,
  type AttributePanel, type Build, type CalculationBinding, type CalculationFact, type CalculationIssue, type CombatConditions,
  type CalculationEvent, type CombatContext, type CombatFrame, type DamageRequest, type DamageResult, type Enemy, type CalculationFeasibility, type QuantityUnit,
  type Project, type StatKey, type StructuredCombatSetup, type Value } from '@leyline/schema';
import { createStructuredCombatContext, evaluateStructuredHit, prepareStructuredBuilds, structuredTeamFeasibility, type PreparedStructuredTeam } from './build-context';
import { evaluateCombatBindings, type BoundAttributeReader } from './context';
import { compiledData } from './compile';
import { collectEffectInstances } from './effects';
import { damageBreakdown, lastTrace } from './damage-view';

type RecordEntry = Project['timeline'][number];
type World = Pick<Project, 'candidate' | 'timeline' | 'combatStates' | 'enemy'>;
interface Runtime { team: PreparedStructuredTeam; context: CombatContext; setup: StructuredCombatSetup; builds: Map<string, Build>; projectApplications: Set<string>; feasibility: CalculationFeasibility[] }
type PreparedRuntime = { ok: true; runtime: Runtime } | { ok: false; issues: CalculationIssue[] };
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
const fact = (value: Value | null): CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const ref = (id: string) => ({ namespace: 'builtin' as const, id, revision: '1' });
const conditionsFacts = (conditions: CombatConditions = {}): Record<string, CalculationFact> => Object.fromEntries(Object.entries(conditions)
  .filter(([, value]) => value !== undefined).map(([key, value]) => [key, fact(value === null ? null : typeof value === 'boolean' ? { kind: 'boolean', value } : quantity('scalar', value!))]));
const issue = (code: CalculationIssue['code'], message: string): CalculationIssue => ({ code, message });

export function projectCalculationEvent(record: RecordEntry, build?: Build): CalculationEvent {
  const skillId = record.damage?.skillId ?? record.skillId;
  const talent = build?.character.talents.find(talent => talent.id === skillId);
  const hitId = record.damage?.hitId;
  return { id: record.id, kind: record.kind === 'damage' ? 'hit' : record.kind, actorId: record.actor, targetIds: record.kind === 'damage' ? ['target'] : [],
    timeMs: record.timeMs, order: record.order, skillId, hitId, category: hitId ? talent?.hits.find(hit => hit.id === hitId)?.category : talent?.category,
    sourceEventIds: record.damage?.capture?.recordId ? [record.damage.capture.recordId] : [], facts: record.damage?.facts ?? {} };
}

/** Current project records are explicit query anchors; this function never schedules extra actions or hits. */
export function prepareProjectRuntime(world: World): PreparedRuntime {
  const actors = world.candidate.actors.filter(actor => actor.build).map(actor => ({ id: actor.id, build: actor.build! }));
  if (!actors.length || actors.length !== world.candidate.actors.length) return { ok: false, issues: [issue('unknown', '队伍中存在尚未补全的角色配装。')] };
  const prepared = prepareStructuredBuilds(actors);
  if (!prepared.ok) return { ok: false, issues: prepared.diagnostics.map(diagnostic => issue('invalid-input', diagnostic.message)) };
  const enemy = world.enemy;
  const builds = new Map(actors.map(actor => [actor.id, actor.build]));
  const setup: StructuredCombatSetup = {
    targets: [{ id: 'target', inputs: { level: fact(enemy ? quantity('count', enemy.level) : null), defenseReduction: fact(enemy ? quantity('scalar', enemy.defenseReduction) : null),
      ordinaryDamageReduction: fact(quantity('scalar', 0)), ...Object.fromEntries(elements.map(element => ['resistance.' + element, fact(enemy ? quantity('scalar', enemy.resistances[element]) : null)])) }, facts: {} }],
    team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [],
    factIntervals: (world.combatStates ?? []).map(interval => ({ id: interval.id, subject: { kind: 'actor', id: interval.actor }, startMs: interval.startMs, endMs: interval.endMs, facts: conditionsFacts(interval.values) })),
    events: world.timeline.map(record => projectCalculationEvent(record, builds.get(record.actor))),
  };
  try {
    const context = createStructuredCombatContext(prepared.team, setup);
    for (const actor of context.actors) actor.inputs.defenseIgnore = fact(quantity('scalar', enemy?.defenseIgnore ?? 0));
    return { ok: true, runtime: { team: prepared.team, context, setup, builds, projectApplications: new Set(), feasibility: [structuredTeamFeasibility(prepared.team)] } };
  } catch (error) { return { ok: false, issues: [issue('invalid-input', error instanceof Error ? error.message : '计算上下文无效。')] }; }
}

function frameFor(runtime: Runtime, actorId: string, record: RecordEntry, conditions: CombatConditions = {}, query = record.damage, phase: CombatFrame['phase'] = 'before'): CombatFrame {
  const build = runtime.builds.get(actorId), skill = build?.character.talents.find(talent => talent.id === query?.skillId), hit = skill?.hits.find(hit => hit.id === query?.hitId), output = hit?.outputs.find(output => output.id === query?.outputId);
  const overrides = new Map<string, Record<string, CalculationFact>>();
  for (const entry of record.damage?.stateOverrides ?? []) overrides.set(entry.actor, conditionsFacts(entry.values));
  overrides.set(actorId, { ...overrides.get(actorId), ...conditionsFacts(conditions), ...actorId === record.actor ? record.damage?.facts : {} });
  const captures = Object.fromEntries([...hit?.base.captures ?? [], ...output?.invocation.captures ?? []].flatMap(slot => record.damage?.capture?.recordId && record.damage.capture.phase
    ? [[slot.id, { eventId: record.damage.capture.recordId, phase: record.damage.capture.phase }]] : []));
  return { ownerId: actorId, recipientId: actorId, contributorId: null, targetId: 'target', eventId: record.id, sourceEventId: record.damage?.capture?.recordId ?? null, phase,
    facts: { ...Object.fromEntries(Object.entries(query?.inputs ?? {}).map(([key, value]) => [key, fact(value === null ? null : quantity(skill?.inputs?.find(input => input.id === key)?.type.unit ?? 'count', value))])) }, actorFacts: {}, captures, applications: (record.damage?.effectApplications ?? []).filter(application => !runtime.projectApplications.has(application.instanceId)),
    factOverrides: [...overrides].map(([id, facts]) => ({ subject: { kind: 'actor', id }, facts })),
    hit: hit ? { skillId: skill!.id, hitId: hit.id, category: hit.category, element: hit.element, family: output?.family ?? 'ordinary', origin: output?.origin ?? 'talent', reactionId: null } : null };
}

function emptyPanel(issues: CalculationIssue[]): AttributePanel {
  return { status: issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : 'partial', stats: Object.fromEntries(statKeys.map(key => [key, null])) as AttributePanel['stats'],
    contributions: [], categoryModifiers: [], diagnostics: issues.map(issue => issue.message), issues };
}
export function readRuntimePanel(runtime: Runtime, actorId: string, record: RecordEntry, conditions: CombatConditions = {}, query = record.damage, phase: CombatFrame['phase'] = 'before'): AttributePanel {
  const build = runtime.builds.get(actorId);
  if (!build) return emptyPanel([issue('unknown', '角色配装尚未明确。')]);
  const frame = frameFor(runtime, actorId, record, conditions, query, phase);
  const data = compiledData(runtime.team.program)!;
  const keys = [...new Set([...statKeys, ...[...data.attributes.values()].filter(attribute => (attribute.scope === 'actor' || frame.hit && attribute.scope === 'hit')
    && attribute.identity.namespace === 'builtin' && attribute.identity.id.startsWith('attribute.')).map(attribute => attribute.identity.id.slice('attribute.'.length))])];
  const bindings: Record<string, CalculationBinding> = Object.fromEntries(keys.map(key => [key, { kind: 'attribute', actor: { role: 'owner' }, key: build.character.attributes.outputs[key as StatKey] ?? ref('attribute.' + key), at: { kind: 'current', phase: 'same' } }]));
  const read = evaluateCombatBindings(runtime.team.program, runtime.context, bindings, frame);
  const panel = emptyPanel([]);
  panel.attributes = Object.fromEntries(keys.map(key => { const value = read.outputs[key]; return [key, value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null]; }));
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

export function evaluateRuntimeHit(runtime: Runtime, actorId: string, record: RecordEntry, conditions: CombatConditions = {}, attributeReader?: BoundAttributeReader): DamageResult {
  const damage = record.damage, build = runtime.builds.get(actorId), panel = readRuntimePanel(runtime, actorId, record, conditions);
  const empty = (issues: CalculationIssue[]): DamageResult => ({ status: issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : 'partial', value: null, panel,
    parts: { attack: panel.stats.attack, multiplier: null, bonus: null, crit: null, defense: null, resistance: null }, baseDamage: null, scaling: [], diagnostics: issues.map(issue => issue.message), issues });
  if (!damage || !build) return empty([issue('unknown', '尚未选择角色和明确输出。')]);
  const frame = frameFor(runtime, actorId, record, conditions), { ownerId, recipientId, contributorId, hit: metadata, ...requestFrame } = frame;
  const skill = build.character.talents.find(skill => skill.id === damage.skillId), hit = skill?.hits.find(hit => hit.id === damage.hitId);
  if (skill?.noIndependentDamage) return empty([issue('invalid-input', '该技能没有独立伤害。')]);
  const inputIssues = skill ? talentInputIssues(skill, damage.inputs, build.constellation) : [];
  if (inputIssues.length) return empty(inputIssues.map(message => issue('invalid-input', message)));
  const triggerPending = damage.reaction !== null && damage.reaction !== 'none' && damage.reaction.trigger === null;
  const result = evaluateStructuredHit(runtime.team, runtime.setup, { actorId, skillId: damage.skillId, hitId: damage.hitId, outputId: damage.outputId, frame: requestFrame,
    critMode: damage.crit, reactionMode: damage.reaction === null || triggerPending ? null : damage.reaction === 'none' ? 'none' : damage.reaction.type }, { context: runtime.context, attributeReader });
  const value = result.totals.all;
  const issues: CalculationIssue[] = result.diagnostics.filter(diagnostic => diagnostic.affectedOutputIds.length || ['budget', 'unreviewed-mechanism'].includes(diagnostic.code) || result.execution === 'invalid').map(diagnostic => issue(diagnostic.code === 'missing-fact' ? 'unknown' : diagnostic.code === 'unreviewed-mechanism' ? 'unsupported' : 'invalid-input', diagnostic.message));
  if (triggerPending) issues.push(issue('unknown', '反应触发归属尚未确认。'));
  const parameter = skill?.parameters.find(parameter => parameter.id === hit?.parameter), level = skill ? build.talents[skill.category] + talentLevelBonus(build.character, skill.category, build.constellation) : 0;
  const breakdown = damageBreakdown(compiledData(runtime.team.program)!, damage, hit, result);
  const multiplier = parameter?.values[level - 1] ?? breakdown.scaling[0]?.multiplier ?? null;
  const attackRead = lastTrace(result.trace, node => node.kind === 'attribute' && node.nodeId === 'attribute.attack' && node.context?.actorId === actorId);
  return { status: result.execution, value: value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null, panel,
    ...breakdown, parts: { attack: attackRead?.value?.kind === 'quantity' ? attackRead.value.value : panel.stats.attack, multiplier, ...breakdown.parts },
    diagnostics: issues.map(issue => issue.message), issues,
    structured: result };
}

export function evaluateBuildHit(input: unknown, damageInput: unknown, enemy?: Enemy): DamageResult {
  const build = buildSchema.safeParse(input), damage = damageRequestSchema.safeParse(damageInput);
  if (!build.success || !damage.success) return { status: 'invalid', value: null, panel: readBuildPanel(input), parts: { attack: null, multiplier: null, bonus: null, crit: null, defense: null, resistance: null }, baseDamage: null, scaling: [], diagnostics: ['当前配装或稳定输出选择无效。'], issues: [issue('invalid-input', '当前配装或稳定输出选择无效。')] };
  const { world, record } = directWorld(build.data, damage.data, enemy), prepared = prepareProjectRuntime(world);
  if (!prepared.ok) return { status: 'invalid', value: null, panel: emptyPanel(prepared.issues), parts: { attack: null, multiplier: null, bonus: null, crit: null, defense: null, resistance: null }, baseDamage: null, scaling: [], diagnostics: prepared.issues.map(issue => issue.message), issues: prepared.issues };
  return evaluateRuntimeHit(prepared.runtime, 'owner', record, damage.data.conditions);
}

export function runtimeEffectViews(runtime: Runtime, visit: () => boolean) {
  const data = compiledData(runtime.team.program)!;
  const entity = (actorId: string, reference: { namespace: string; id: string; revision: string }): string => {
    const build = runtime.builds.get(actorId)!;
    return [build.weapon, ...build.sets, build.character].find(entity => entity.calculation.bundle.effects.some(effect => definitionKey(effect.identity) === definitionKey(reference)))?.id ?? build.character.id;
  };
  const unit = (target: import('@leyline/schema').EffectDefinition['target']): QuantityUnit => {
    const type = target.kind === 'attribute' ? data.attributes.get(definitionKey(target.attribute))!.type
      : data.formulas.get(definitionKey(target.formula))!.definition.modifierPorts![target.port].type;
    return type.kind === 'quantity' ? type.unit : 'scalar';
  };
  return collectEffectInstances(data, runtime.context, 'target', visit).map(instance => ({ id: instance.id, owner: instance.owner.id, slot: 'content', definition: instance.definition.identity.id,
    version: instance.definition.identity.revision, effect: instance.definition.identity.id, action: instance.source?.id ?? null, startMs: instance.source?.timeMs ?? 0,
    endMs: instance.definition.lifetime.kind === 'interval' ? instance.source!.timeMs + instance.definition.lifetime.durationMs : 3600001,
    recipient: instance.definition.recipient.role === 'team' ? 'team' : instance.owner.id, attribute: instance.definition.target.kind === 'attribute' ? instance.definition.target.attribute.id.replace(/^attribute\./, '') : instance.definition.target.port,
    unit: unit(instance.definition.target),
    disabled: runtime.context.effectRevisions?.some(revision => revision.instanceId === instance.id && revision.disabled) ?? false,
    ...(!instance.triggerKnown ? { unconfirmed: true as const } : {}),
    content: { entity: entity(instance.owner.id, instance.definition.identity), rule: instance.definition.identity.id }, ...(instance.definition.lifetime.kind === 'permanent' ? { permanent: true as const } : {}),
    ...(instance.definition.application === 'explicit' ? { requiresApplication: true as const } : {}) }));
}
