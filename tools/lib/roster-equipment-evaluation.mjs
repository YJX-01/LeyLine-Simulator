import { auditBuild, auditHit, bool, fact, number, novice, projectQuery, setAuditDefaults } from './roster-audit-settings.mjs';
import { readContentSource } from './content-source.mjs';

const equipmentChecks = readContentSource(new URL('../data/sources/catalog/equipment-modifier-checks.json', import.meta.url));
const evidence = group => readContentSource(new URL('../data/sources/catalog/genshin-db/' + group + '.json', import.meta.url));

const comparisons = { eq: (a, b) => a === b, lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b };

function conditionSettings(binding, active, entity, build) {
  if (!binding) return [];
  if (binding.kind === 'fact' && binding.type.kind === 'boolean') return [[binding, bool(active)]];
  if (binding.kind !== 'formula') return;
  const template = entity.calculation.bundle.formulas.find(f => f.identity.id === binding.formula.id)?.template;
  if (template?.id === 'condition-group') {
    const desired = template.negate ? !active : active;
    const candidates = Object.values(binding.inputs).map(term => conditionSettings(term, desired, entity, build));
    if (desired !== (template.operator === 'all')) return candidates.find(settings => settings !== undefined);
    if (candidates.some(settings => settings === undefined)) return;
    return candidates.flat();
  }
  if (template?.id === 'energy-full' && binding.inputs.energy.kind === 'fact') {
    const burst = build.character.talents.find(talent => talent.category === 'burst');
    const capacity = burst?.parameters.find(parameter => parameter.id === burst.energyCapacity?.parameter)?.values[build.talents.burst - 1] ?? 0;
    if (capacity || !active) return [[binding.inputs.energy, number('energy', active ? capacity : 0)]];
    return;
  }
  if (template?.id === 'enum-condition') {
    const input = binding.inputs[template.input];
    if (input.kind !== 'fact' || input.type.kind !== 'enum') return;
    const value = input.type.values.find(candidate => (candidate === template.equals) === active);
    if (value !== undefined) return [[input, fact({ kind: 'enum', value })]];
    return;
  }
  if (template?.id !== 'quantity-condition' && template?.id !== 'threshold-condition') return;
  const { threshold, relation } = template;
  const input = binding.inputs[template.input];
  const compare = value => comparisons[relation](value, threshold) === active;
  if (input.kind === 'actor-state' && compare(build[input.property])) return [];
  if (input.kind !== 'fact' || input.type.kind !== 'quantity') return;
  const unit = input.type.unit;
  const upper = 'maxInput' in template ? template.maxInput : undefined;
  const maximum = Math.min(upper ?? Infinity, ['hpRatio', 'targetHpRatio'].includes(input.key) ? 1 : Infinity);
  const discrete = unit === 'count' || unit === 'milliseconds';
  const step = discrete ? 1 : Math.max(0.01, Math.abs(threshold) * 0.01);
  const value = [threshold, threshold - step, threshold + step, 0, maximum].find(value => Number.isFinite(value)
    && value >= 0 && value <= maximum && (!discrete || Number.isSafeInteger(value)) && compare(value));
  if (value !== undefined) return [[input, number(unit, value)]];
}

function applyConditionSettings(settings, frame, sourceEvent) {
  if (settings === undefined) return false;
  const changes = new Map();
  for (const [binding, value] of settings) {
    const timed = binding.scope === 'source-event' || binding.at === 'source-event';
    if (timed && !sourceEvent || binding.scope === 'contributor' && !frame.contributorId) return false;
    const subject = binding.scope === 'team' ? { kind: 'team' } : binding.scope === 'target' ? { kind: 'target', id: frame.targetId }
      : { kind: 'actor', id: binding.scope === 'recipient' ? frame.recipientId : binding.scope === 'event-actor' ? sourceEvent?.actorId ?? frame.recipientId
        : binding.scope === 'contributor' ? frame.contributorId : frame.ownerId };
    const event = binding.scope === 'query' || binding.scope === 'source-event';
    const key = JSON.stringify([timed, event ? 'event' : subject, binding.key]);
    if (changes.has(key) && changes.get(key).value.value.value !== value.value.value) return false;
    changes.set(key, { timed, event, subject, key: binding.key, value });
  }
  const onField = [...changes.values()].filter(change => !change.timed && !change.event && change.subject.kind === 'actor'
    && change.key === 'onField' && change.value.value.value === true);
  if (onField.length > 1) return false;
  if (onField.length === 1) for (const row of frame.factOverrides) {
    if (row.subject.kind === 'actor' && row.subject.id !== onField[0].subject.id && row.facts.onField) row.facts.onField = bool(false);
  }
  for (const { timed, event, subject, key, value } of changes.values()) {
    if (event) (timed ? sourceEvent.facts : frame.facts)[key] = value;
    else {
      const rows = timed ? sourceEvent.subjectFacts ??= [] : frame.factOverrides;
      const field = timed ? 'values' : 'facts';
      let row = rows.find(entry => entry.subject.kind === subject.kind && entry.subject.id === subject.id);
      if (!row) rows.push(row = { subject, [field]: {} });
      row[field][key] = value;
    }
  }
  return true;
}
function hitFrame(selector, talent, hit) {
  const family = selector.families?.[0] ?? 'ordinary';
  const reactionId = selector.reactionIds?.[0] ?? (/^(lunar|stellar)-/.test(family) ? family : null);
  const origin = selector.origins?.[0] ?? (family === 'transformative' ? 'reaction' : 'talent');
  if (origin === 'reaction' && !reactionId) return;
  return { skillId: origin === 'talent' ? selector.skillIds?.[0] ?? talent.id : null,
    hitId: origin === 'talent' ? selector.hitIds?.[0] ?? hit.id : null, element: selector.elements?.[0] ?? hit.element,
    category: origin === 'talent' ? selector.categories?.[0] ?? hit.category : null, family, origin, reactionId };
}

function triggerEvent(selector, build, observationUnits) {
  const skill = build.character.talents.find(talent => selector.skillIds?.includes(talent.id) || selector.categories?.includes(talent.category));
  const reactionId = selector.reactionIds?.[0] ?? Object.keys(selector.reactionElements ?? {})[0];
  const reactionElement = selector.reactionElements?.[reactionId]?.[0];
  const { observation } = selector;
  const facts = observation ? { [observation.key]: observation.test === 'true' ? bool(true)
    : number(observationUnits[observation.key] ?? 'scalar', observation.test === 'decrease' ? -.1 : .1) } : {};
  const fields = { category: selector.categories?.[0] ?? skill?.category, skillId: selector.skillIds?.[0] ?? skill?.id,
    hitId: selector.hitIds?.[0], actionId: selector.actionIds?.[0], reactionId, reactionElement };
  return { id: 'trigger', kind: selector.kinds[0], actorId: 'actor', targetIds: selector.target === 'any' ? [] : ['enemy'], timeMs: 0, order: 0,
    sourceEventIds: [], facts, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) };
}

function baselineFacts(frame) {
  const actor = frame.factOverrides[0].facts;
  Object.assign(actor, { nearbyEnemies: number('count', 1), 'deathmatch.enemiesAtUpdate': number('count', 1), currentEnergy: number('energy', 0) });
  frame.factOverrides.push({ subject: { kind: 'target', id: frame.targetId }, facts: Object.fromEntries(
    [['targetHpRatio', number('scalar', 1)], ...['cryo', 'electro', 'hydro', 'pyro', 'frozen'].map(id => ['aura.' + id, bool(false)])]) });
}

function recipientEligible(recipient, character) {
  return (!recipient.elements || recipient.elements.includes(character.identity.element))
    && (!recipient.weaponTypes || recipient.weaponTypes.includes(character.identity.weaponType));
}

function evaluateEquipmentCase(engine, build, owner, row, expectedWhite, holderCases, observationUnits, onQuery, chooseRecipient) {
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
  if (!prepared.ok) return { ...row, issue: '配装无法装配', diagnostics: prepared.diagnostics.map(d => d.message) };
  const talent = build.character.talents[0], hit = talent.hits[0];
  const { setup, request } = auditHit(build.character, talent, hit);
  baselineFacts(request.frame);
  for (const entity of [build.character, owner]) setAuditDefaults(entity, request.frame);
  const allGrants = engine.grantedBuildEffects(build);
  const context = engine.createStructuredCombatContext(prepared.team, setup);
  const result = engine.evaluateStructuredHit(prepared.team, setup, request, { context });
  const white = context.actors[0].inputs.whiteAttack.value?.value;
  const grants = allGrants.filter(grant => grant.entity.id === owner.id);
  if (result.totals.all.state !== 'known') {
    row.missingHitFields = result.requiredInputs.map(input => ({ key: input.key, scope: input.scope }));
    row.hitDiagnostics = result.diagnostics.map(({ code, message }) => ({ code, message }));
  }
  row.whiteAttack = white;
  row.expectedWhiteAttack = expectedWhite;
  row.hit = hit.id;
  row.value = result.totals.all.state === 'known' ? result.totals.all.value.value : null;
  if (onQuery && row.value !== null) {
    onQuery({label:[row.entity,row.refinement??row.pieces,row.count].filter(value=>value!==undefined).join('/'),
      build,damage:projectQuery(request),expected:row.value});
  }
  row.grants = grants.map(grant => grant.effect.identity.id);
  row.modifiers = [];
  if (!Number.isFinite(white) || Math.abs(expectedWhite - white) > 1e-8) row.issue = '白值与来源不符';
  const teams = new Map();
  for (const { effect } of grants) {
    const id = effect.identity.id;
    const reading = { id, amount: null, unverified: [] };
    row.modifiers.push(reading);
    if (effect.target.kind !== 'attribute') { reading.unverified.push('乘区端口待逐项核验'); continue; }
    reading.target = effect.target.attribute.id;
    const relevantHit = hitFrame(effect.appliesTo, talent, hit);
    if (!relevantHit) { reading.unverified.push('需要明确的反应查询'); continue; }
    const required = effect.recipient;
    const peer = required.role === 'team' && (required.excludeOwner || !recipientEligible(required, build.character)) ? chooseRecipient(required, build.character.id) : undefined;
    if (required.role === 'fact-actor' || peer === null) { reading.unverified.push('需要明确的实际受益者'); continue; }
    if (peer && !teams.has(peer.character.id)) {
      const paired = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'recipient', build: peer }]);
      if (!paired.ok) { reading.unverified.push('受益者样例配装无法装配'); continue; }
      teams.set(peer.character.id, paired.team);
    }
    const probeTeam = peer ? teams.get(peer.character.id) : prepared.team;
    const probeWorld = peer ? engine.createStructuredCombatContext(probeTeam, setup) : context;
    const frame = { ...request.frame, ownerId: 'actor', recipientId: peer ? 'recipient' : 'actor', contributorId: null, hit: relevantHit };
    if (peer) reading.recipient = peer.character.id;
    const target = effect.recipient.role === 'target';
    const input = { kind: target ? 'enemy' : 'attribute', key: effect.target.attribute, at: { kind: 'current', phase: 'same' }, ...(target ? {} : { actor: { role: 'recipient' } }) };
    const evaluate = (world, applications, active = true, setConditions = true) => {
      const current = { ...frame, facts: { ...frame.facts }, factOverrides: structuredClone(frame.factOverrides), applications };
      // This probe supplies an actual trigger event and checks its expiry. A
      // defaulted manual window fact would override that event in the engine.
      if (effect.windowFact) {
        const ownerFacts = current.factOverrides.find(row => row.subject.kind === 'actor' && row.subject.id === 'actor')?.facts;
        if (ownerFacts) delete ownerFacts[effect.windowFact];
      }
      const trigger = world.events.find(event => event.id === 'trigger'), source = trigger && structuredClone(trigger);
      if (source) world = { ...world, events: world.events.map(event => event === trigger ? source : event) };
      const sample = holderCases?.get(id)?.[active ? 'included' : 'excluded'];
      const settings = conditionSettings(effect.predicate, active, owner, sample?.build ?? build);
      if (setConditions && !applyConditionSettings(settings, current, source) && !sample) return;
      if(sample) {
        if(sample.useBurst) {
          const burst=sample.build.character.talents.find(t=>t.category==='burst'),hit=burst.hits[0];
          current.hit={...current.hit,skillId:burst.id,hitId:hit.id,element:hit.element};
        }
        const real=engine.createStructuredCombatContext(sample.team,setup);
        return engine.evaluateCombatBindings(sample.team.program,{...real,events:world.events,effectRevisions:world.effectRevisions},{value:input},current);
      }
      return engine.evaluateCombatBindings(probeTeam.program, world, { value: input }, current);
    };
    const selection = effect.trigger.kind === 'event' ? effect.trigger.selector : undefined;
    const trigger = Array.isArray(selection) ? selection[0] : selection;
    let activeContext = probeWorld, sourceId = null;
    if (trigger) {
      const event = triggerEvent(trigger, build, observationUnits);
      activeContext = { ...probeWorld, events: [event, ...probeWorld.events] };
      sourceId = event.id;
    }
    const instanceId = engine.calculationEffectInstanceId('actor', effect.buff ?? effect.identity, sourceId);
    const on = evaluate(activeContext, effect.application === 'explicit' ? [{ instanceId, active: true }] : []);
    const off = evaluate(trigger ? probeWorld : { ...probeWorld, effectRevisions: [{ instanceId, disabled: true }] }, [], true, false);
    const traced = result => result?.trace.findLast(node => node.kind === 'effect' && node.nodeId === id);
    const known = result => result?.outputs.value?.state === 'known';
    const contribution = traced(on);
    const excluded = known(off) && !traced(off);
    const amount = contribution?.value?.kind === 'quantity' ? contribution.value.value : null;
    const expected = effect.value.kind === 'constant' ? effect.value.value.value
      : effect.value.kind === 'refinement-parameter' ? effect.value.values[build.refinement - 1] : undefined;
    const disabledCondition = effect.predicate ? evaluate(activeContext, [], false) : null;
    const inactive = effect.predicate ? known(disabledCondition) && !traced(disabledCondition) : undefined;
    Object.assign(reading, { amount, excluded, ...(inactive === undefined ? {} : { conditionExcluded: inactive }), ...(expected === undefined ? {} : { declaredValue: expected }) });
    const holders=holderCases?.get(id);
    if (holders) reading.holders = { included: holders.included.build.character.id, excluded: holders.excluded.build.character.id };
    const source = equipmentChecks[id];
    if (source && row.kind === 'weapon') {
      const matches = [...row.description.matchAll(new RegExp(source.pattern, 'g'))];
      reading.sourceValue = matches.length === 1 ? (source.sign ?? 1) * Number(matches[0][1]) / source.divisor : null;
      if (source.entity !== row.entity || source.stat !== effect.target.attribute.id.slice('attribute.'.length)
        || reading.sourceValue !== null && amount !== null && Math.abs(amount - reading.sourceValue) > 1e-8) reading.issue = '实际贡献与采用值不符';
      if (reading.sourceValue === null) reading.unverified.push('精炼原文匹配待核对');
    } else if (row.kind === 'weapon' || expected === undefined) reading.unverified.push('数值贡献缺少来源的独立对照');
    if (trigger && effect.lifetime.kind === 'interval') {
      const shifted = { ...activeContext, events: activeContext.events.map(event => event.id === request.frame.eventId
        ? { ...event, timeMs: effect.lifetime.durationMs } : event) };
      const timed = evaluate(shifted, []);
      reading.expired = known(timed) && !traced(timed);
      if (traced(timed)?.state === 'known') reading.issue = '排除后仍然生效';
      else if (!reading.expired) reading.unverified.push('到期场景缺少可确定的输出');
    }
    if (amount !== null && expected !== undefined && Math.abs(amount - expected) > 1e-9) reading.issue = '实际贡献与采用值不符';
    if (traced(off)?.state === 'known') reading.issue = '排除后仍然生效';
    else if (!excluded) reading.unverified.push('排除场景缺少可确定的输出');
    if (inactive === false) reading.unverified.push('排除条件尚待核验');
    if (amount === null) reading.unverified.push('此条件场景未观察到数值贡献');
  }
  return row;
}

/** Every legal refinement and every set threshold is queried with the same evaluator as a project. */
export function rosterEquipmentEvaluation(entities, engine, observationUnits, onQuery, verified = new Set()) {
  const weapons = evidence('weapons'), sets = evidence('sets'), rows = [], gaps = [];
  const weaponById = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const memberIds = { WEAPON_SWORD_ONE_HAND: 'kaeya', WEAPON_CLAYMORE: 'noelle', WEAPON_POLE: 'xiangling', WEAPON_BOW: 'amber', WEAPON_CATALYST: 'lisa' };
  const member = type => entities.characters.find(c => c.id === memberIds[type]);
  function chooseRecipient(recipient, ownerId) {
    const character = entities.characters.find(candidate => candidate.id !== ownerId && recipientEligible(recipient, candidate)
      && weaponById.has(novice[candidate.identity.weaponType]));
    return character ? auditBuild(character, weaponById.get(novice[character.identity.weaponType])) : null;
  }
  function whiteBase(c) { return c.attributes.base.attack * c.progression.curves.attack[1] + c.progression.promotion[0].attack; }
  function assess(rows, support, hits) {
    const row = rows.at(-1);
    const issued = rows.flatMap(entry => [entry.issue, ...(entry.modifiers ?? []).map(modifier => modifier.issue)]).filter(Boolean);
    const status = verified.has(row.entity + row.field);
    row.independentClause = status;
    const pending = status ? [] : rows.flatMap(entry => [
      ...(entry.missingHitFields ? ['样例普通命中缺少可确定的输出'] : []),
      ...(entry.modifiers ?? []).flatMap(modifier => modifier.unverified ?? []),
      ...(entry.unverified ?? []),
    ]);
    if (!status && hits?.length) pending.push('装备独立命中需要对应的数值证明');
    if (support.resolution !== 'complete') pending.push(support.reason);
    const reasons = [...new Set([...issued, ...pending])];
    if (reasons.length) gaps.push({ ...row, reasons, reason: reasons.join('；') });
  }
  for (const weapon of entities.weapons) {
    const c = member(weapon.weaponType), data = weapons[weapon.id];
    const refinements = Object.keys(data.metadata).filter(key => /^r[1-5]$/.test(key)).map(key => Number(key.slice(1))).sort((a, b) => a - b);
    if (!refinements.length) refinements.push(1);
    if (weapon.maxRefinement !== refinements.at(-1)) throw new Error(weapon.id + ': 正式精炼上限与本地档位不符。');
    for (const refinement of refinements) {
      const build = { ...auditBuild(c, weapon), refinement };
      const text = data.metadata['r' + refinement]?.description;
      let capacityCases;
      if(weapon.id==='moonweaversdawn') {
        const samples=['keqing','kaeya','kamisatoayaka'].map(id=>{
          const build={...auditBuild(entities.characters.find(c=>c.id===id),weapon),refinement};
          const prepared=engine.prepareStructuredBuilds([{id:'actor',build}]);
          if(!prepared.ok)throw Error(JSON.stringify(prepared.diagnostics));
          return {build,team:prepared.team,useBurst:true};
        });
        capacityCases=new Map([['moonweaversdawn.capacity',{included:samples[0],excluded:samples[2]}],['moonweaversdawn.capacity.1',{included:samples[1],excluded:samples[0]}]]);
      }
      const row = evaluateEquipmentCase(engine, build, weapon, { kind: 'weapon', entity: weapon.id, field: '/buffs', refinement, description: text ?? '' },
        whiteBase(c) + data.stats.base.attack + data.stats.promotion[0].attack, capacityCases, observationUnits, onQuery, chooseRecipient);
      rows.push(row);
      assess([row], weapon.metadata.support, weapon.hits);
    }
  }
  for (const set of entities.sets) for (const [i, piece] of set.metadata.effects.entries()) {
    const type = piece.buffs?.find(buff => buff.activation?.weaponTypes)?.activation.weaponTypes[0] ?? 'WEAPON_SWORD_ONE_HAND';
    const c = member(type), w = entities.weapons.find(weapon => weapon.id === novice[type]);
    const counts = [piece.pieces - 1, piece.pieces];
    const pair = counts.map(count => {
      const build = { ...auditBuild(c, w, [set]), theoreticalSetSlots: set.slots.slice(0, count).map(slot => ({ slot, setId: set.id })) };
      let holders;
      if(set.id==='defenderswill' && count===4) {
        const byElement = new Map(['amber','barbara','kaeya','lisa','noelle','sucrose','collei'].map(id=>{
          const character=entities.characters.find(c=>c.id===id);
          const weapon=entities.weapons.find(w=>w.id===novice[character.identity.weaponType]);
          const sample={...auditBuild(character,weapon,[set]),theoreticalSetSlots:build.theoreticalSetSlots};
          const prepared=engine.prepareStructuredBuilds([{id:'actor',build:sample}]);
          if(!prepared.ok)throw Error(JSON.stringify(prepared.diagnostics));
          return [character.identity.element,{build:sample,team:prepared.team}];
        }));
        holders=new Map([...byElement].map(([element,included])=>['defenderswill.resistance.'+element,{included,excluded:byElement.get(element==='cryo'?'hydro':'cryo')}]));
      }
      return evaluateEquipmentCase(engine, build, set, { kind: 'set', entity: set.id, pieces: piece.pieces, count, field: '/effects/' + i,
        description: sets[set.id]['effect' + piece.pieces + 'Pc'] ?? '' }, whiteBase(c) + weapons[w.id].stats.base.attack + weapons[w.id].stats.promotion[0].attack,
        holders, observationUnits, onQuery, chooseRecipient);
    });
    const ids = set.effects[i].ruleIds.map(ref => ref.id);
    const snapshot = { ascension: 0, constellation: 0, refinement: 1 };
    const included = set.calculation.bundle.effects.filter(effect => ids.includes(effect.identity.id)).filter(({ activation }) =>
      (!activation.elements || activation.elements.includes(c.identity.element)) && (!activation.weaponTypes || activation.weaponTypes.includes(c.identity.weaponType))
      && (!activation.characterGameIds || activation.characterGameIds.includes(c.identity.gameId))
      && ['ascension', 'constellation', 'refinement'].every(key => (activation[key] ?? 0) <= snapshot[key])).map(effect => effect.identity.id);
    if (ids.some(id => pair[0].grants?.includes(id)) || included.some(id => !pair[1].grants?.includes(id))) pair[1].issue = '件数门槛的授予与排除不符';
    if (ids.length !== included.length) pair[1].unverified = ['另有持有者条件，需相应配装样例'];
    rows.push(...pair);
    assess(pair, piece.support, set.effects[i].hits);
  }
  const modifiers = rows.flatMap(row => row.modifiers ?? []);
  return { rows, gaps, summary: { weaponRefinementsEvaluated: rows.filter(r => r.kind === 'weapon').length,
    weaponClausesPending: new Set(gaps.filter(row => row.kind === 'weapon').map(row => row.entity)).size,
    setClausesPending: gaps.filter(row => row.kind === 'set').length,
    setThresholdsEvaluated: rows.filter(r => r.kind === 'set').length / 2, equipmentScenarios: rows.length,
    weaponTextComparisons: modifiers.filter(m => Number.isFinite(m.sourceValue) && !m.issue).length,
    equipmentNumericHits: rows.filter(row => Number.isFinite(row.value)).length, equipmentMissingValues: rows.filter(row => !Number.isFinite(row.value)).length, equipmentMismatches: rows.filter(row => row.issue).length,
    modifierScenarios: modifiers.length, numericModifierContributions: modifiers.filter(m => m.amount !== null && !m.issue).length,
    unverifiedEquipmentModifiers: modifiers.filter(m => m.unverified?.length).length,
    modifierMismatches: modifiers.filter(m => m.issue === '实际贡献与采用值不符' || m.issue === '排除后仍然生效').length } };
}
