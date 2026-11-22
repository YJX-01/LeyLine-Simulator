import { authoredHit, ordinaryHitInvocation, resolveHitElement } from '@leyline/schema/hit-bindings';
import { combatFactDeclaration, grantBuffs } from '@leyline/schema/buffs';
import { buildSetCounts, findBuildHit, hitEventFactIssues, sceneSelectionsSchema, weaponRefinementLimit, type CombatFrame, type SceneSelection } from '@leyline/schema';
import { evaluateCombatBindings } from './context';
import { grantedBuildEffects, grantedGleamEffects, grantedResonances, suppliesMoonsign, type Grant } from './grants';
import { APP_VERSION } from '@leyline/schema/version';
import { artifactSubstatLimits, calculationBundleSchema, calculationJsonPointer, combatContextSchema, definitionKey, inspectCalculationStructure, inventoryAllocationsSchema, statKeys, structuredBuildActorsSchema, structuredCombatSetupSchema, structuredHitRequestSchema, valueMatchesType,
  talentInputIssues, createTalentRankReader, type CalculationBundle, type CalculationDiagnostic, type CalculationFact, type CombatActor, type CombatContext, type EvaluatedValue,
  type DamageOccurrence, type DefinitionRef, type InventoryAllocation, type StructuredBuild, type StructuredDamageEvaluation, type Value, type ValueType } from '@leyline/schema';
import { calculationBudgets, compileCalculation, compiledData, type CompiledCalculation, type CompiledData } from './compile';
import { validateCharacterBindings } from './character';
import { evaluateDamageQuery } from './queries';
import type { BoundAttributeReader } from './context';
import { checkInventoryFeasibility } from './feasibility';

declare const teamBrand: unique symbol;
export interface PreparedStructuredTeam { readonly [teamBrand]: true; readonly program: CompiledCalculation; readonly actorCount: number; readonly talentRank: ReturnType<typeof createTalentRankReader> }
interface TeamData { builds: Map<string, StructuredBuild>; actors: CombatActor[]; inventory: InventoryAllocation[]; scenes: SceneSelection[]; sceneGrants: Map<string, Grant[]> }
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
export function prepareStructuredBuilds(input: unknown, dependenciesInput?: unknown, scenesInput: unknown = []): PreparedTeamResult {
  const diagnostics: CalculationDiagnostic[] = [input, ...dependenciesInput === undefined ? [] : [dependenciesInput]].flatMap(value => inspectCalculationStructure(value));
  const report = (code: CalculationDiagnostic['code'], pointer: string, message: string) => diagnostics.push({ code, severity: 'error', jsonPointer: pointer, message, affectedOutputIds: [] });
  if (diagnostics.length) return { ok: false, diagnostics };
  const parsed = structuredBuildActorsSchema.safeParse(input);
  if (!parsed.success) { for (const issue of parsed.error.issues) report('invalid-range', calculationJsonPointer(issue.path), issue.message); return { ok: false, diagnostics }; }
  const merged: CalculationBundle = { schemaVersion: APP_VERSION, runtimeVersion: APP_VERSION, requiredFeatures: ['fixed-templates-v1'], sources: [], formulas: [], tables: [], attributes: [], effects: [], aggregates: [], coverage: [], stateMachines: [], damageFamilies: [] };
  const features = new Set(merged.requiredFeatures), families = new Set<string>(), identities = new Map<string, string>();
  const selected = sceneSelectionsSchema.safeParse(scenesInput);
  if (!selected.success) return { ok: false, diagnostics: selected.error.issues.map(issue => ({ code: 'invalid-range', severity: 'error',
    jsonPointer: '/sceneEffects' + calculationJsonPointer(issue.path), affectedOutputIds: [], message: issue.message })) };
  const data: TeamData = { builds: new Map(), actors: [], inventory: [], scenes: selected.data, sceneGrants:new Map() };
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
  const talentRank = createTalentRankReader(parsed.data);
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
    if (weapon && (character.identity.weaponType !== weapon.weaponType || build.refinement > weaponRefinementLimit(weapon))) report('invalid-range', pointer + '/weapon', '武器类型或精炼不合法。');
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
    const ids = new Set<string>(), slots = new Set<string>(), setCounts = buildSetCounts(build);
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
      const set = build.sets.find(set => set.id === artifact.setId);
      if (set && (!set.rarities.includes(artifact.rarity) || !set.slots.includes(artifact.slot))) report('invalid-range', pointer + '/artifacts', '圣遗物星级或部位不在套装的合法集合中。');
      allocation.artifacts.push({ slot: artifact.slot, inventoryAccountId: artifact.inventory?.accountId ?? null, inventoryItemId: artifact.inventory?.itemId ?? null });
    }
    for (const slot of build.theoreticalSetSlots ?? []) {
      const set = build.sets.find(set => set.id === slot.setId);
      if (slots.has(slot.slot) || !set?.slots.includes(slot.slot)) report('invalid-range', pointer + '/theoreticalSetSlots', '理论套装须占用可用且未穿戴的部位。');
      slots.add(slot.slot);
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
    const burst = character.talents.find(talent => talent.category === 'burst'), capacity = burst?.energyCapacity;
    const energy = !burst || capacity === 0 ? 0 : capacity && burst.parameters.find(p => p.id === capacity.parameter)?.values[0];
    if (energy !== undefined) inputs.energyCapacity = derived(quantity('energy', energy), character.sources);
    for (const key of ['defenseIgnore', 'amplifyingReactionBonus', 'additiveReactionBonus']) inputs[key] = derived(quantity('scalar', 0), []);
    const effects = grantedBuildEffects(build, setCounts).map(grant => grant.effect.identity);
    const talents: CombatActor['talents'] = character.talents.map(talent => {
      const rank = talentRank(build, talent.category);
      return { id: talent.id, ...rank, sourceRefs: [...new Set([...talent.sources, ...rank.sourceRefs])],
      parameters: talent.parameters.map(parameter => {
        const unit = parameter.unit === 'ratio' || parameter.unit === 'scalar' ? 'scalar' : parameter.unit === 'seconds' ? 'milliseconds' : parameter.unit === 'unknown' ? null : parameter.unit;
        const type: ValueType | null = unit ? { kind: 'quantity', unit } : null;
        return { id: parameter.id, type, values: parameter.values.map(value => {
          if (!unit) return null;
          const number = parameter.unit === 'seconds' ? Number(String(value) + 'e3') : value;
          return unit === 'milliseconds' && (!Number.isSafeInteger(number) || number < 0) ? null : quantity(unit, number);
        }) };
      }) };
    });
    data.actors.push({ id, identity: { element: character.identity.element, region:character.identity.region, weaponType: character.identity.weaponType, sourceRefs: character.sources }, inputs, facts: {}, actorFacts: {}, ascension: build.ascension, constellation: build.constellation, refinement: build.refinement, setCounts, effects, talents }); data.inventory.push(allocation);
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  const resonance = grantedResonances(parsed.data);
  if (resonance) data.actors.find(actor => actor.id === resonance.ownerId)!.effects.push(...resonance.grants.map(grant => grant.effect.identity));
  for(const [id,grants] of grantedGleamEffects(parsed.data)) data.actors.find(actor=>actor.id===id)!.effects.push(...grants.map(g=>g.effect.identity));
  const owner = data.actors.find(actor => data.builds.has(actor.id));
  const selectedScenes = new Map<string, string>();
  for (const { definition } of data.scenes) {
    const prior = selectedScenes.get(definition.id), normalized = canonical(definition);
    if (prior && prior !== normalized) report('conflicting-definition', '/sceneEffects', '同一场景定义有相互冲突的版本。');
    if (prior || !owner) continue;
    selectedScenes.set(definition.id, normalized);
    for (const buff of definition.buffs) for (const family of buff.appliesTo?.families ?? []) families.add(family);
    merged.sources.push({ id: definition.id, kind: 'definition' });
    const inScene = { fact:definition.id };
    for (const buff of definition.buffs) {
      const condition = buff.condition ? {call:'condition.all',output:'active',inputs:{term0:inScene,term1:buff.condition}} : inScene;
      const grant = { ...buff, condition, ...(buff.trigger ? {trigger:{...buff.trigger,duringTeamInterval:definition.id}} : {}) };
      const references = grantBuffs({ buffs:[grant] },merged.effects,[definition.id],{ [definition.id]: {scope:'team',type:{kind:'boolean'}} });
      const holders = buff.recipient === 'owner' ? data.actors.filter(actor => data.builds.has(actor.id)) : [owner];
      const effects = merged.effects.slice(-references.length);
      for (const holder of holders) {
        holder.effects.push(...references);
        const grants = data.sceneGrants.get(holder.id) ?? [];
        for (const effect of effects) grants.push({entity:data.builds.get(holder.id)!.character,effect,scene:{id:definition.id,name:definition.name}});
        data.sceneGrants.set(holder.id,grants);
      }
    }
  }
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
  const team = Object.freeze({ program: compiled.program, actorCount: data.actors.length, talentRank }) as PreparedStructuredTeam; teams.set(team, data);
  return { ok: true, team, diagnostics };
}

export function grantedSceneEffects(team: PreparedStructuredTeam) { return teams.get(team)!.sceneGrants; }

export function createStructuredCombatContext(team: PreparedStructuredTeam, setup: unknown): CombatContext {
  const data = teams.get(team);
  if (!data) throw new Error('配装程序无效。');
  const issues = inspectCalculationStructure(setup);
  if (issues.length) throw new Error(issues[0].message);
  const world = structuredCombatSetupSchema.parse(setup);
  const bearers = [...data.builds.values()].filter(suppliesMoonsign);
  const unknown = data.actors.length - data.builds.size;
  const elements = new Set(data.actors.flatMap(actor => actor.identity?.element && actor.identity.element !== 'physical' ? [actor.identity.element] : []));
  const unknownElements = data.actors.filter(actor => !actor.identity?.element).length;
  if (!world.team.facts.threeTeamElements && (elements.size >= 3 || elements.size + unknownElements < 3)) {
    world.team.facts.threeTeamElements = derived({kind:'boolean',value:elements.size >= 3},[]);
  }
  for (const [key,required] of [['fullMoonsign',2],['firstMoonsign',1]] as const) {
    if (world.team.facts[key] || bearers.length < required && bearers.length + unknown >= required) continue;
    world.team.facts[key] = derived({kind:'boolean',value:bearers.length >= required},bearers.flatMap(build => build.character.sources));
  }
  for (const [i, { definition, startMs, endMs }] of data.scenes.entries()) {
    const state = (value: boolean) => derived({ kind: 'boolean', value }, [definition.id]);
    world.team.facts[definition.id] = state(false);
    world.factIntervals.push({ id: definition.id + '.' + i, subject: { kind: 'team' }, startMs, endMs, facts: { [definition.id]: state(true) } });
  }
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
type FieldFrame = Pick<CombatFrame, 'eventId' | 'targetId' | 'phase'> & Partial<Pick<CombatFrame, 'factOverrides'>>;
export function actorIsOnField(team: PreparedStructuredTeam, context: CombatContext, frame: FieldFrame, actorId: string) {
  const reading = evaluateCombatBindings(team.program, context, { active: { kind: 'fact', key: 'onField', scope: 'owner', type: { kind: 'boolean' } } },
    { facts: {}, actorFacts: {}, factOverrides: [], applications: [], captures: {}, ...frame, ownerId: actorId, recipientId: actorId, contributorId: null, sourceEventId: null, hit: null });
  const active = reading.outputs.active?.state === 'known' ? reading.outputs.active.value : null;
  return active?.kind === 'boolean' ? active.value : undefined;
}
export function onFieldActor(team: PreparedStructuredTeam, context: CombatContext, frame: FieldFrame) {
  const selected = context.actors.filter(actor => actorIsOnField(team, context, frame, actor.id));
  return selected.length === 1 ? selected[0] : undefined;
}
export function evaluateStructuredHit(team: PreparedStructuredTeam, setup: unknown, requestInput: unknown, options: { attributeReader?: BoundAttributeReader; context?: CombatContext } = {}): StructuredDamageEvaluation {
  const data = teams.get(team), request = inspectCalculationStructure(requestInput).length ? null : structuredHitRequestSchema.safeParse(requestInput);
  if (!data || !request?.success) return evaluateDamageQuery(team?.program, {}, {});
  const query = request.data, build = data.builds.get(query.actorId);
  const found = findBuildHit(build, query.hit), talent = found?.talent, hit = found?.hit;
  let context: CombatContext;
  try { context = options.context ? combatContextSchema.parse(options.context) : createStructuredCombatContext(team, setup); }
  catch { return evaluateDamageQuery(team.program, {}, {}); }
  const reserved = Object.hasOwn(query.frame.facts, 'critMode') || Object.hasOwn(query.frame.facts, 'reactionMode');
  const inputIssues = found && build ? hitEventFactIssues(found.entity, talent, query.frame.facts, build.constellation, data.builds.values()) : [];
  if (reserved || inputIssues.length) {
    const invalid = evaluateDamageQuery(team.program, context, { kind: 'hit', output: null });
    for (const message of [...inputIssues, ...reserved ? ['伤害模式事实重复定义。'] : []]) invalid.diagnostics.push({ code: reserved ? 'conflicting-definition' : 'invalid-range', severity: 'error', jsonPointer: '/frame/facts', affectedOutputIds: [], message });
    return invalid;
  }
  const declaration = authoredHit(build?.character.metadata, talent?.id, hit?.id);
  const family = declaration?.family;
  let selectedFamily = typeof family === 'string' ? family : hit && !talent ? Object.keys(hit.damage)[0] : 'ordinary';
  let missingBranch: string | undefined;
  let infused: boolean | undefined;
  if (hit?.infusion) {
    const read = evaluateCombatBindings(team.program, context, { infused:{kind:'fact',scope:'owner',key:hit.infusion.fact,type:{kind:'boolean'}} },
      { ...query.frame,ownerId:query.actorId,recipientId:query.actorId,contributorId:null,hit:null }).outputs.infused;
    if (read?.state === 'known' && read.value.kind === 'boolean') infused=read.value.value;
    else missingBranch=hit.infusion.fact;
  }
  const dealer = hit?.coordinated ? onFieldActor(team, context, query.frame) : undefined;
  if (hit?.coordinated && !dealer?.identity) {
    const ready = (query.frame.facts[hit.coordinated.readyFact] ?? context.events.find(event => event.id === query.frame.eventId)?.facts[hit.coordinated.readyFact])?.value;
    if (!(ready?.kind === 'boolean' && !ready.value)) missingBranch = 'onField';
  }
  if (typeof family === 'object' && build) {
    const field = combatFactDeclaration(build.character.metadata.facts, family.by)!;
    const read = evaluateCombatBindings(team.program, context, { family: { kind: 'fact', key: family.by, ...field } },
      { ...query.frame, ownerId: query.actorId, recipientId: query.actorId, contributorId: null, hit: null });
    const value = read.outputs.family;
    if (value?.state === 'known' && value.value.kind === 'enum') selectedFamily = family.cases[value.value.value];
    else {
      const first = Object.entries(hit?.damage ?? {})[0];
      const predicate = first?.[1].predicate;
      const gate = predicate && evaluateCombatBindings(team.program, context, { gate: predicate },
        { ...query.frame, ownerId: query.actorId, recipientId: query.actorId, contributorId: null, hit: null }).outputs.gate;
      if (first && gate?.state === 'known' && gate.value.kind === 'boolean' && !gate.value.value) selectedFamily = first[0];
      else missingBranch = family.by;
    }
  }
  const teamElements = context.actors.map(actor => actor.identity?.element);
  const elementInput = hit?.elementBy && (query.frame.facts[hit.elementBy] ?? context.events.find(event => event.id === query.frame.eventId)?.facts[hit.elementBy]);
  const selection = hit && resolveHitElement(hit, elementInput?.value, teamElements, infused);
  if (hit && selection?.missing) {
    const predicate = hit.damage.ordinary?.predicate;
    const gate = predicate && evaluateCombatBindings(team.program, context, { gate: predicate }, { ...query.frame, ownerId: query.actorId, recipientId: query.actorId, contributorId: null, hit: null }).outputs.gate;
    if (!(gate?.state === 'known' && gate.value.kind === 'boolean' && !gate.value.value)) missingBranch = selection.missing;
  }
  const output = !missingBranch ? hit?.damage[selectedFamily] : undefined;
  if (!build || !hit || !output) {
    const result = evaluateDamageQuery(team.program, context, { kind: 'event', eventId: query.frame.eventId, outputs: [] });
    const reason = `diagnostic-${result.diagnostics.length + 1}`;
    const pending = !!hit && !output;
    const pendingBuild = !build && data.actors.some(actor => actor.id === query.actorId);
    result.diagnostics.push({ code: missingBranch ? 'missing-fact' : pending ? 'unreviewed-mechanism' : pendingBuild ? 'missing-fact' : 'stale-reference', severity: 'error', jsonPointer: '/hitId', affectedOutputIds: hit ? [hit.id] : [],
      message: missingBranch ? query.hit.hitId + ' 缺少分支条件 ' + missingBranch : pending ? query.hit.hitId + ' 尚缺伤害公式。' : pendingBuild ? '命中归属队员的配装尚未提供。' : '角色、技能、命中或输出引用已失效。' });
    const state = (pending || pendingBuild) && result.execution !== 'invalid' ? 'unknown' : 'invalid';
    const traceId = `trace-${result.trace.length + 1}`;
    result.trace.push({ id: traceId, kind: 'coverage', definition: hit?.coverageRefs[0] ?? reference({ namespace: 'builtin', id: 'runtime.damage-query', revision: '1' }), nodeId: 'unavailable-output', dependencies: [result.totals.all.traceId], value: null, state, sourceRefs: hit?.sources ?? [] });
    if (missingBranch && build) result.requiredInputs.push({ key: missingBranch, type: combatFactDeclaration(build.character.metadata.facts, missingBranch)?.type ?? { kind: 'enum', values: ['anemo', 'pyro', 'hydro', 'electro', 'cryo'] },
      scope: missingBranch === 'partyPriorityElement' || combatFactDeclaration(build.character.metadata.facts, missingBranch)?.scope === 'team' ? 'team' : combatFactDeclaration(build.character.metadata.facts, missingBranch)?.scope === 'query' ? 'query' : 'actor:' + query.actorId, requiredBy: [query.hit.hitId], sourceRefs: hit?.sources ?? [] });
    const value: EvaluatedValue = { state, reasons: [reason], traceId };
    result.work.traceNodes = result.trace.length;
    result.execution = state === 'unknown' ? 'partial' : 'invalid'; result.totals = { all: value, objective: value }; result.events.forEach(event => { event.total = value; }); return result;
  }
  const element = dealer?.identity?.element ?? selection!.element;
  const invocation = hit.elementBy || hit.coordinated || infused ? ordinaryHitInvocation({ ...hit, element }, output.predicate) : output;
  const dealingActor = dealer?.id ?? query.actorId;
  if (hit.coordinated && dealer && dealer.id !== query.actorId) {
    context = { ...context, events: context.events.map(event => event.id === query.frame.eventId && event.actorId === query.actorId
      ? { ...event, actorId: dealer.id } : event) };
  }
  const frame = { ...query.frame, ownerId: dealingActor, recipientId: dealingActor, contributorId: hit.coordinated ? query.actorId : null,
    facts: { ...query.frame.facts, critMode: { value: query.critMode === null ? null : { kind: 'enum' as const, value: query.critMode }, provenance: 'explicit' as const, sourceRefs: [] },
      reactionMode: { value: query.reactionMode === null ? null : { kind: 'enum' as const, value: query.reactionMode }, provenance: 'explicit' as const, sourceRefs: [] } },
    hit: { skillId: talent?.id ?? null, hitId: hit.id, element, category: hit.category, family: selectedFamily, origin: hit.origin,
      reactionId: query.reactionMode && query.reactionMode !== 'none' ? query.reactionMode : null } };
  const result = evaluateDamageQuery(team.program, context, { kind: 'hit', output: { eventId: frame.eventId, outputId: hit.id, actorId: dealingActor, contributorIds: hit.coordinated ? [query.actorId] : [], family: selectedFamily,
    computation: { kind: 'formula', invocation, frame } }, inventoryAllocations: data.inventory }, { limits: { trace: calculationBudgets.trace - 2 }, attributeReader: options.attributeReader });
  const program = compiledData(team.program)!;
  const refs = hit.coverageRefs;
  const evidenceOrder = ['declared', 'adopted', 'independently-checked', 'observed'] as const;
  const evidence = Math.min(...refs.map(reference => evidenceOrder.indexOf(program.coverage.get(definitionKey(reference))!.evidence)));
  for (const occurrence of result.outputs) occurrence.evidence = evidenceOrder[evidence] ?? 'declared';
  const gaps = coverageGaps(data, program, result, selectedFamily, query.actorId, refs, !!options.attributeReader);
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
    const checked = new Set<string>();
    const add = (refs: DefinitionRef[], owner: string) => {
      for (const ref of new Map(refs.map(ref => [definitionKey(ref), ref])).values()) {
        const identity = definitionKey(ref);
        if (checked.has(identity)) continue;
        checked.add(identity);
        const record = program.coverage.get(identity)!;
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
  for (const output of result.outputs) {
    output.execution = 'partial';
    output.diagnosticIds.push(...reasons);
  }
  result.execution = 'partial';
}
