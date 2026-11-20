import { APP_VERSION } from '@leyline/schema/version';
import { canTryOrdinaryHit, ordinaryHitInvocation, ordinaryTrialId } from '@leyline/schema/hit-bindings';
import { artifactSubstatLimits, calculationBundleSchema, calculationJsonPointer, combatContextSchema, definitionKey, inspectCalculationStructure, inventoryAllocationsSchema, statKeys, structuredBuildActorsSchema, structuredCombatSetupSchema, structuredHitRequestSchema, valueMatchesType,
  talentInputIssues, talentLevelBonus, type CalculationBundle, type CalculationDiagnostic, type CalculationFact, type CombatActor, type CombatContext, type EvaluatedValue,
  type DamageOccurrence, type DefinitionRef, type InventoryAllocation, type StructuredBuild, type StructuredDamageEvaluation, type Value, type ValueType } from '@leyline/schema';
import { calculationBudgets, compileCalculation, compiledData, type CompiledCalculation, type CompiledData } from './compile';
import { validateCharacterBindings } from './character';
import { evaluateDamageQuery } from './queries';
import type { BoundAttributeReader } from './context';
import { checkInventoryFeasibility } from './feasibility';

declare const teamBrand: unique symbol;
export interface PreparedStructuredTeam { readonly [teamBrand]: true; readonly program: CompiledCalculation; readonly actorCount: number }
interface TeamData { builds: Map<string, StructuredBuild>; actors: CombatActor[]; inventory: InventoryAllocation[] }
const teams = new WeakMap<PreparedStructuredTeam, TeamData>();
type PreparedTeamResult = { ok: true; team: PreparedStructuredTeam; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] };
const reference = (entity: { namespace: string; id: string; revision: string }): DefinitionRef => ({ namespace: entity.namespace, id: entity.id, revision: entity.revision });
const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}' : JSON.stringify(value);
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
const derived = (value: Value, sourceRefs: string[]): CalculationFact => ({ value, provenance: 'derived', sourceRefs });
const maxLevels = [20, 40, 50, 60, 70, 80, 90], minLevels = [1, 20, 40, 50, 60, 70, 80], maxTalents = [1, 1, 2, 4, 6, 8, 10];
const allowedMain: Record<StructuredBuild['artifacts'][number]['slot'], readonly string[]> = {
  flower: ['hp'], plume: ['attack'], sands: ['hpPercent', 'attackPercent', 'defensePercent', 'energyRecharge', 'elementalMastery'],
  goblet: ['hpPercent', 'attackPercent', 'defensePercent', 'elementalMastery', 'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus'],
  circlet: ['hpPercent', 'attackPercent', 'defensePercent', 'elementalMastery', 'critRate', 'critDamage', 'healingBonus'],
};

/** Current build snapshots only. Growth and equipment inputs never execute static or combat modifiers. */
export function prepareStructuredBuilds(input: unknown, dependenciesInput?: unknown): PreparedTeamResult {
  const diagnostics: CalculationDiagnostic[] = [input, ...dependenciesInput === undefined ? [] : [dependenciesInput]].flatMap(value => inspectCalculationStructure(value));
  const report = (code: CalculationDiagnostic['code'], pointer: string, message: string) => diagnostics.push({ code, severity: 'error', jsonPointer: pointer, message, affectedOutputIds: [] });
  if (diagnostics.length) return { ok: false, diagnostics };
  const parsed = structuredBuildActorsSchema.safeParse(input);
  if (!parsed.success) { for (const issue of parsed.error.issues) report('invalid-range', calculationJsonPointer(issue.path), issue.message); return { ok: false, diagnostics }; }
  const merged: CalculationBundle = { schemaVersion: APP_VERSION, runtimeVersion: APP_VERSION, requiredFeatures: ['fixed-templates-v1'], sources: [], formulas: [], tables: [], attributes: [], effects: [], aggregates: [], coverage: [], stateMachines: [], damageFamilies: [] };
  const features = new Set(merged.requiredFeatures), families = new Set<string>(), identities = new Map<string, string>();
  const data: TeamData = { builds: new Map(), actors: [], inventory: [] };
  const appendBundle = (bundle: CalculationBundle) => {
    bundle.requiredFeatures.forEach(feature => features.add(feature)); (bundle.damageFamilies ?? []).forEach(family => families.add(family));
    for (const key of ['sources', 'formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const) (merged[key] as unknown[]).push(...bundle[key]);
  };
  for (const input of Array.isArray(dependenciesInput) ? dependenciesInput : dependenciesInput === undefined ? [] : [dependenciesInput]) {
    const dependencies = calculationBundleSchema.safeParse(input);
    if (!dependencies.success) {
      for (const issue of dependencies.error.issues) report('invalid-range', '/dependencies' + calculationJsonPointer(issue.path), issue.message);
      return { ok: false, diagnostics };
    }
    appendBundle(dependencies.data);
  }
  const append = (entity: StructuredBuild['character'] | NonNullable<StructuredBuild['weapon']> | StructuredBuild['sets'][number]) => {
    const key = definitionKey(reference(entity)), content = canonical(entity);
    if (identities.has(key)) { if (identities.get(key) !== content) report('conflicting-definition', '/build', '相同实体身份的快照内容冲突。'); return; }
    identities.set(key, content);
    appendBundle(entity.calculation.bundle);
  };
  for (const [index, entry] of parsed.data.entries()) {
    if (!entry.build) {
      data.actors.push({ id: entry.id, inputs: {}, facts: {}, actorFacts: {}, ascension: null, constellation: null, refinement: null,
        ...(entry.element ? { identity: { element: entry.element, sourceRefs: [] } } : {}), setCounts: {}, effects: [], talents: [] });
      continue;
    }
    const { build, id } = entry, character = build.character, weapon = build.weapon, pointer = `/${index}/build`;
    data.builds.set(id, build); append(character); if (weapon) append(weapon); build.sets.forEach(append); merged.sources.push(...build.sources);
    const validLevel = (level: number, ascension: number) => level >= minLevels[ascension] && level <= maxLevels[ascension];
    if (!(validLevel(build.level, build.ascension) || build.ascension === 6 && [95, 100].includes(build.level))) report('invalid-range', pointer + '/level', '角色等级与突破阶段不匹配。');
    if (weapon && (!validLevel(build.weaponLevel, build.weaponAscension) || build.weaponAscension >= weapon.promotion.length)) report('invalid-range', pointer + '/weaponLevel', '武器等级与突破阶段不匹配。');
    if (Object.values(build.talents).some(level => level > maxTalents[build.ascension])) report('invalid-range', pointer + '/talents', '基础天赋等级超出突破阶段上限；命座加级由装配器另加一次。');
    if (weapon && (character.identity.weaponType !== weapon.weaponType || weapon.rarity < 3 && build.refinement !== 1)) report('invalid-range', pointer + '/weapon', '武器类型或精炼不合法。');
    const inputs: CombatActor['inputs'] = {}, raw = Object.fromEntries(statKeys.map(key => [key, 0])) as Record<typeof statKeys[number], number>;
    const rawSources = new Map<string, Set<string>>();
    const add = (key: typeof statKeys[number], value: number, sources: string[]) => { raw[key] += value; const refs = rawSources.get(key) ?? new Set(); sources.forEach(source => refs.add(source)); rawSources.set(key, refs); };
    const promotion = character.progression.promotion[build.ascension];
    for (const stat of ['hp', 'attack', 'defense'] as const) {
      const white = character.attributes.base[stat] * character.progression.curves[stat][build.level] + promotion[stat]
        + (stat === 'attack' && weapon ? weapon.baseAttack * weapon.attackCurve[build.weaponLevel] + (weapon.promotion[build.weaponAscension] ?? NaN) : 0);
      if (!Number.isFinite(white) || white < 0 || stat === 'hp' && white === 0) report('invalid-range', pointer + '/progression', '成长或突破快照缺失或非法。');
      inputs['white' + stat[0].toUpperCase() + stat.slice(1)] = derived(quantity(stat, white), [...character.sources, ...stat === 'attack' && weapon ? weapon.sources : []]);
    }
    add('critRate', character.attributes.base.critRate, character.sources); add('critDamage', character.attributes.base.critDamage, character.sources); add('energyRecharge', 1, character.sources);
    add(character.attributes.specialized, promotion.specialized, character.sources);
    if (weapon) add(weapon.stat, weapon.baseStat * weapon.statCurve[build.weaponLevel], weapon.sources);
    const ids = new Set<string>(), slots = new Set<string>(), setCounts: Record<string, number> = Object.create(null) as Record<string, number>;
    const allocation: InventoryAllocation = { actorId: id, artifacts: [] };
    for (const artifact of build.artifacts) {
      if (ids.has(artifact.id) || slots.has(artifact.slot)) report('invalid-range', pointer + '/artifacts', '同一队员的圣遗物身份或部位重复。');
      ids.add(artifact.id); slots.add(artifact.slot);
      if (!allowedMain[artifact.slot].includes(artifact.mainStat)) report('invalid-range', pointer + '/artifacts', '圣遗物主词条与部位不匹配。');
      const main = build.artifactMain[artifact.rarity][artifact.mainStat][artifact.level];
      if (!Number.isFinite(main) || main < 0) report('invalid-range', pointer + '/artifactMain', '主词条成长值非法。');
      add(artifact.mainStat, main, build.artifactMainSourceRefs);
      const stats = new Set<string>();
      const subLimits = artifactSubstatLimits[artifact.rarity];
      for (const sub of artifact.substats) {
        if (stats.has(sub.stat) || sub.stat === artifact.mainStat || subLimits[sub.stat] === undefined || sub.value > subLimits[sub.stat]! + 1e-8) report('invalid-range', pointer + '/artifacts', '圣遗物副词条重复、与主词条冲突或超出范围。');
        stats.add(sub.stat); add(sub.stat, sub.value, artifact.sourceRefs);
      }
      setCounts[artifact.setId] = (setCounts[artifact.setId] ?? 0) + 1;
      const set = build.sets.find(set => set.id === artifact.setId);
      if (set && (!set.rarities.includes(artifact.rarity) || !set.slots.includes(artifact.slot))) report('invalid-range', pointer + '/artifacts', '圣遗物星级或部位不在套装的合法集合中。');
      allocation.artifacts.push({ slot: artifact.slot, inventoryAccountId: artifact.inventory?.accountId ?? null, inventoryItemId: artifact.inventory?.itemId ?? null });
    }
    if (new Set(build.sets.map(set => set.id)).size !== build.sets.length) report('conflicting-definition', pointer + '/sets', '套装身份重复或存在不明确的同名空间引用。');
    for (const setId of Object.keys(setCounts)) if (setId !== 'none' && !build.sets.some(set => set.id === setId)) report('missing-dependency', pointer + '/sets', '已装备圣遗物缺少对应套装快照。');
    for (const stat of statKeys) {
      const unit = ['hp', 'attack', 'defense', 'elementalMastery'].includes(stat) ? stat as 'hp' | 'attack' | 'defense' | 'elementalMastery' : 'scalar';
      const key = ['hp', 'attack', 'defense'].includes(stat) ? 'flat' + stat[0].toUpperCase() + stat.slice(1) : stat;
      if (!Number.isFinite(raw[stat])) report('invalid-range', pointer, '配装输入不是有限数值。');
      inputs[key] = derived(quantity(unit, raw[stat]), [...rawSources.get(stat) ?? []]);
    }
    inputs.level = derived(quantity('count', build.level), character.sources);
    for (const key of ['defenseIgnore', 'amplifyingReactionBonus', 'additiveReactionBonus']) inputs[key] = derived(quantity('scalar', 0), []);
    const effects = [...character.calculation.ruleIds, ...character.passives.filter(passive => build.ascension >= (passive.unlockAscension ?? 0)).flatMap(passive => passive.ruleIds),
      ...character.constellations.filter(constellation => build.constellation >= constellation.rank).flatMap(constellation => constellation.ruleIds), ...weapon?.calculation.ruleIds ?? [],
      ...build.sets.flatMap(set => [...set.calculation.ruleIds, ...set.effects.filter(effect => (setCounts[set.id] ?? 0) >= effect.pieces).flatMap(effect => effect.ruleIds)])];
    const talents: CombatActor['talents'] = character.talents.map(talent => ({ id: talent.id, level: build.talents[talent.category] + talentLevelBonus(character, talent.category, build.constellation), sourceRefs: talent.sources,
      parameters: talent.parameters.map(parameter => {
        const unit = parameter.unit === 'ratio' || parameter.unit === 'scalar' ? 'scalar' : parameter.unit === 'seconds' ? 'milliseconds' : parameter.unit === 'unknown' ? null : parameter.unit;
        const type: ValueType | null = unit ? { kind: 'quantity', unit } : null;
        return { id: parameter.id, type, values: parameter.values.map(value => {
          if (!unit) return null;
          const number = parameter.unit === 'seconds' ? Number(String(value) + 'e3') : value;
          return unit === 'milliseconds' && (!Number.isSafeInteger(number) || number < 0) ? null : quantity(unit, number);
        }) };
      }) }));
    data.actors.push({ id, identity: { element: character.identity.element, sourceRefs: character.sources }, inputs, facts: {}, actorFacts: {}, ascension: build.ascension, constellation: build.constellation, refinement: build.refinement, setCounts, effects, talents }); data.inventory.push(allocation);
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  const inventory = inventoryAllocationsSchema.safeParse(data.inventory);
  if (!inventory.success) { for (const issue of inventory.error.issues) report('invalid-range', '/inventory' + calculationJsonPointer(issue.path), issue.message); return { ok: false, diagnostics }; }
  for (const key of ['sources', 'formulas', 'tables', 'attributes', 'effects', 'aggregates', 'coverage', 'stateMachines'] as const) {
    const seen = new Set<string>();
    (merged[key] as unknown[]) = merged[key].filter(definition => {
      const content = canonical(definition);
      if (seen.has(content)) return false; seen.add(content); return true;
    });
  }
  merged.requiredFeatures = [...features]; merged.damageFamilies = [...families];
  const compiled = compileCalculation(merged);
  if (!compiled.ok) return compiled;
  const programData = compiledData(compiled.program)!;
  for (const build of data.builds.values()) {
    validateCharacterBindings(programData, build.character, report);
    const allRefs = [...build.character.calculation.contextCoverageRefs, ...build.weapon?.coverageRefs ?? [], ...build.sets.flatMap(set => set.effects.flatMap(effect => effect.coverageRefs))];
    if (allRefs.some(reference => !programData.coverage.has(definitionKey(reference)))) report('missing-dependency', '/coverage', '配装快照缺少覆盖记录的精确版本。');
  }
  const sources = new Set(programData.sources.map(source => source.id));
  for (const actor of data.actors) if (Object.values(actor.inputs).some(fact => fact.sourceRefs.some(source => !sources.has(source))) || actor.talents.some(talent => talent.sourceRefs.some(source => !sources.has(source)))) report('missing-dependency', '/sources', '配装属性或参数缺少来源记录。');
  if (diagnostics.length) return { ok: false, diagnostics };
  const team = Object.freeze({ program: compiled.program, actorCount: data.actors.length }) as PreparedStructuredTeam; teams.set(team, data);
  return { ok: true, team, diagnostics };
}

export function createStructuredCombatContext(team: PreparedStructuredTeam, setup: unknown): CombatContext {
  const data = teams.get(team);
  if (!data) throw new Error('配装程序无效。');
  const issues = inspectCalculationStructure(setup);
  if (issues.length) throw new Error(issues[0].message);
  const world = structuredCombatSetupSchema.parse(setup);
  return combatContextSchema.parse({ ...world, actors: data.actors });
}

export function structuredTeamFeasibility(team: PreparedStructuredTeam) {
  const data = teams.get(team), result = checkInventoryFeasibility(data?.inventory);
  if (result.status === 'pass' && data && data.inventory.length !== data.actors.length) result.status = 'unknown';
  return result;
}

export function evaluateStructuredReaction(team: PreparedStructuredTeam, context: CombatContext, output: DamageOccurrence, attributeReader?: BoundAttributeReader) {
  const data = teams.get(team)!;
  const result = evaluateDamageQuery(team.program, context, { kind: 'event', eventId: output.eventId, outputs: [output], inventoryAllocations: data.inventory },
    { limits: { trace: calculationBudgets.trace - 2 }, attributeReader });
  const program = compiledData(team.program)!;
  applyDamageCoverage(result, coverageGaps(data, program, result, output.family, undefined, [], !!attributeReader));
  return result;
}
export function evaluateStructuredHit(team: PreparedStructuredTeam, setup: unknown, requestInput: unknown, options: { attributeReader?: BoundAttributeReader; context?: CombatContext } = {}): StructuredDamageEvaluation {
  const data = teams.get(team), request = inspectCalculationStructure(requestInput).length ? null : structuredHitRequestSchema.safeParse(requestInput);
  if (!data || !request?.success) return evaluateDamageQuery(team?.program, {}, {});
  const query = request.data, build = data.builds.get(query.actorId), talent = build?.character.talents.find(talent => talent.id === query.skillId), hit = talent?.hits.find(hit => hit.id === query.hitId);
  const trial = !!(talent && hit && query.outputId === ordinaryTrialId(hit.id) && canTryOrdinaryHit(talent, hit));
  const output = trial && hit ? { id: query.outputId!, family: 'ordinary', origin: 'talent' as const, invocation: ordinaryHitInvocation(hit), coverageRefs: hit.coverageRefs }
    : hit?.outputs.find(output => output.id === query.outputId);
  let context: CombatContext;
  try { context = options.context ? combatContextSchema.parse(options.context) : createStructuredCombatContext(team, setup); }
  catch { return evaluateDamageQuery(team.program, {}, {}); }
  const reserved = Object.hasOwn(query.frame.facts, 'critMode') || Object.hasOwn(query.frame.facts, 'reactionMode');
  const inputs = Object.fromEntries(Object.entries(query.frame.facts).flatMap(([key, fact]) => {
    const input = talent?.inputs?.find(input => input.id === key);
    return input ? [[key, fact.value === null ? null : valueMatchesType(fact.value, input.type) && fact.value.kind === 'quantity' ? fact.value.value : NaN]] : [];
  }));
  const inputIssues = talent && build ? talentInputIssues(talent, inputs, build.constellation) : [];
  if (reserved || inputIssues.length) {
    const invalid = evaluateDamageQuery(team.program, context, { kind: 'hit', output: null });
    for (const message of [...inputIssues, ...reserved ? ['伤害模式事实重复定义。'] : []]) invalid.diagnostics.push({ code: reserved ? 'conflicting-definition' : 'invalid-range', severity: 'error', jsonPointer: '/frame/facts', affectedOutputIds: [], message });
    return invalid;
  }
  if (!build || !talent || !hit || !output) {
    const result = evaluateDamageQuery(team.program, context, { kind: 'event', eventId: query.frame.eventId, outputs: [] });
    const reason = `diagnostic-${result.diagnostics.length + 1}`;
    const pending = hit !== undefined && query.outputId === null;
    const pendingBuild = !build && data.actors.some(actor => actor.id === query.actorId);
    result.diagnostics.push({ code: pending ? 'unreviewed-mechanism' : pendingBuild ? 'missing-fact' : 'stale-reference', severity: 'error', jsonPointer: '/hitId', affectedOutputIds: [],
      message: pending ? '此命中尚未选择计算输出。' : pendingBuild ? '命中归属队员的配装尚未提供。' : '角色、技能、命中或输出引用已失效。' });
    const state = (pending || pendingBuild) && result.execution !== 'invalid' ? 'unknown' : 'invalid';
    const traceId = `trace-${result.trace.length + 1}`;
    result.trace.push({ id: traceId, kind: 'coverage', definition: hit?.coverageRefs[0] ?? reference({ namespace: 'builtin', id: 'runtime.damage-query', revision: '1' }), nodeId: 'unavailable-output', dependencies: [result.totals.all.traceId], value: null, state, sourceRefs: hit?.sources ?? [] });
    const value: EvaluatedValue = { state, reasons: [reason], traceId };
    result.work.traceNodes = result.trace.length;
    result.execution = state === 'unknown' ? 'partial' : 'invalid'; result.totals = { all: value, objective: value }; result.events.forEach(event => { event.total = value; }); return result;
  }
  const frame = { ...query.frame, ownerId: query.actorId, recipientId: query.actorId, contributorId: null,
    facts: { ...query.frame.facts, critMode: { value: query.critMode === null ? null : { kind: 'enum' as const, value: query.critMode }, provenance: 'explicit' as const, sourceRefs: [] },
      reactionMode: { value: query.reactionMode === null ? null : { kind: 'enum' as const, value: query.reactionMode }, provenance: 'explicit' as const, sourceRefs: [] } },
    hit: { skillId: talent.id, hitId: hit.id, element: hit.element, category: hit.category, family: output.family, origin: output.origin, reactionId: null } };
  const result = evaluateDamageQuery(team.program, context, { kind: 'hit', output: { eventId: frame.eventId, outputId: output.id, actorId: query.actorId, contributorIds: [], family: output.family,
    computation: { kind: 'formula', invocation: output.invocation, frame } }, inventoryAllocations: data.inventory }, { limits: { trace: calculationBudgets.trace - 2 }, attributeReader: options.attributeReader });
  const program = compiledData(team.program)!;
  const refs = [...output.coverageRefs, ...hit.coverageRefs];
  const evidenceOrder = ['declared', 'adopted', 'independently-checked', 'observed'] as const;
  const evidence = Math.min(...refs.map(reference => evidenceOrder.indexOf(program.coverage.get(definitionKey(reference))!.evidence)));
  for (const occurrence of result.outputs) occurrence.evidence = evidenceOrder[evidence] ?? 'declared';
  const gaps = coverageGaps(data, program, result, output.family, query.actorId, refs, !!options.attributeReader);
  if (trial) gaps.unshift({ definition: hit.coverageRefs[0], sources: hit.sources, message: '按本次选定的普通直伤公式试算。' });
  applyDamageCoverage(result, gaps);
  return result;
}

interface CoverageGap {
  definition: DefinitionRef;
  sources: string[];
  message: string;
  nodeId?: string;
}

function coverageGaps(data: TeamData, program: CompiledData, result: StructuredDamageEvaluation, family: string,
  actorId?: string, hitRefs: DefinitionRef[] = [], externalAttributes = false): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const attributes = result.trace.filter(node => node.kind === 'attribute');
  const effects = result.trace.filter(node => node.kind === 'effect');
  const fallback = hitRefs[0] ?? result.outputs[0]?.computation.definition;
  for (const actor of data.actors) {
    const build = data.builds.get(actor.id);
    if (!build) {
      if (fallback) gaps.push({ definition: fallback, sources: [], message: '队员 ' + actor.id + ' 的装备效果尚未提供。' });
      continue;
    }
    const name = build.character.identity.name;
    const add = (refs: DefinitionRef[], owner: string) => {
      for (const ref of new Map(refs.map(ref => [definitionKey(ref), ref])).values()) {
        const record = program.coverage.get(definitionKey(ref))!;
        const { scope } = record;
        const outOfRange = scope.kind !== 'equipment' && build.constellation > scope.maxConstellation;
        const missing = record.mechanisms.filter(mechanism => mechanism.resolution === 'unavailable');
        const relevant = missing.filter(({ impact, ruleIds }) => {
          if (impact?.families && !impact.families.includes(family)) return false;
          if (impact?.recipient === 'owner' && !externalAttributes) {
            return attributes.some(node => node.context?.actorId === actor.id && (!impact.attributes || impact.attributes.includes(node.nodeId)));
          }
          if (impact?.attributes && !externalAttributes && !attributes.some(node => impact.attributes!.includes(node.nodeId))) return false;
          if (scope.kind === 'context' && ruleIds.length && !externalAttributes) {
            return effects.some(node => ruleIds.some(ref => definitionKey(ref) === definitionKey(node.definition))
              && node.context?.actorId === actor.id);
          }
          return true;
        });
        if (record.resolution === 'complete' ? !outOfRange : missing.length > 0 && !relevant.length) continue;
        const targets = new Set(relevant.flatMap(mechanism => mechanism.ruleIds).flatMap(reference => {
          const effect = program.effects.get(definitionKey(reference));
          return effect?.target.kind === 'attribute' ? [effect.target.attribute.id] : [];
        }));
        gaps.push({ definition: ref, sources: record.sources,
          message: record.resolution === 'complete' && outOfRange
            ? `${owner}的命座为${build.constellation}命，此项仅核验至${scope.maxConstellation}命 · ${record.reason}`
            : owner + ' · ' + record.reason,
          ...(targets.size === 1 ? { nodeId: [...targets][0] } : {}) });
      }
    };
    add(actor.id === actorId ? hitRefs : build.character.calculation.contextCoverageRefs, name);
    if (build.weapon) add(build.weapon.coverageRefs, name + '的' + build.weapon.name);
    for (const set of build.sets) for (const effect of set.effects) {
      if ((actor.setCounts[set.id] ?? 0) >= effect.pieces) add(effect.coverageRefs, name + '的' + set.name + effect.pieces + '件套');
    }
  }
  return gaps;
}

function applyDamageCoverage(result: StructuredDamageEvaluation, gaps: CoverageGap[]) {
  if (!gaps.length || result.execution === 'invalid') return;
  const reasons = gaps.map(({ message, nodeId }) => {
    const id = `diagnostic-${result.diagnostics.length + 1}`;
    result.diagnostics.push({ code: 'unreviewed-mechanism', severity: 'warning', jsonPointer: '/coverage', affectedOutputIds: result.outputs.map(output => output.id), message, ...(nodeId ? { nodeId } : {}) });
    return id;
  });
  const sources = [...new Set(gaps.flatMap(gap => gap.sources))];
  const gate = (original: EvaluatedValue, nodeId: string): EvaluatedValue => {
    const traceId = `trace-${result.trace.length + 1}`;
    result.trace.push({ id: traceId, kind: 'coverage', definition: gaps[0].definition, nodeId, dependencies: [original.traceId], value: null, state: 'unknown', sourceRefs: sources });
    return { state: 'unknown', traceId, reasons: [...new Set([...(original.state === 'known' ? [] : original.reasons), ...reasons])] };
  };
  for (const output of result.outputs) {
    if (output.value.state === 'known') output.modeledValue = output.value;
    output.value = gate(output.value, output.outputId);
    output.execution = 'partial';
    output.diagnosticIds.push(...reasons);
  }
  const value = gate(result.totals.all, 'event-total');
  result.execution = 'partial';
  result.totals = { all: value, objective: value };
  for (const event of result.events) event.total = value;
  result.work.traceNodes = result.trace.length;
}
