import { passiveEnergyClock } from './passive-energy';
import { findBuildHit, subjectFacts, talentLevelBonus, type CalculationBinding, type CalculationFact, type CombatChange, type CombatFrame, type Project } from '@leyline/schema';
import { actorIsOnField, grantedSceneEffects } from './build-context';
import { evaluateCombatBindings } from './context';
import { grantedBuildEffects, grantedDamageChanges, grantedPeriodicEnergy, grantedResonances } from './grants';
import { applyCastWindows, evaluateProjectStates, prepareProjectRuntime, updateHitOccurrences, type ProjectRuntime } from './project';
import { scheduleCastExits } from './cast-windows';
import { compiledData } from './compile';
import { calculationEffectInstanceId, collectEffectInstances, type EffectInstance } from './effects';

type Entry = Project['timeline'][number];
const number = (fact?: CalculationFact) => fact?.value?.kind === 'quantity' ? fact.value.value : undefined;
const amount = (unit: 'energy' | 'milliseconds', value: number | undefined): CalculationFact => ({
  value: value === undefined ? null : { kind: 'quantity', unit, value }, provenance: 'derived', sourceRefs: [],
});

/** Resource gains and cooldown changes follow the same ordered hits as damage. Pickup has its own time and recipient. */
export function resolveCombatChanges(project: Project, runtime: ProjectRuntime): CombatChange[] {
  const rules = new Map([...runtime.builds].map(([id, build]) => [id, grantedDamageChanges(build)]));
  const partyParticles = grantedResonances(project.candidate.actors)?.particles ?? [];
  function readsResource(binding?: CalculationBinding): boolean {
    return !!binding && (binding.kind === 'fact' && ['currentEnergy','skillCooldownRemaining'].includes(binding.key)
      || binding.kind === 'formula' && Object.values(binding.inputs).some(readsResource));
  }
  const recovery = [...runtime.builds].flatMap(([actor,b])=>grantedPeriodicEnergy(b).map(grant=>({ actor,...grant })));
  const tracksCasts = project.timeline.some(entry => entry.kind === 'action' &&
    runtime.builds.get(entry.actor)?.character.talents.some(t => t.id === entry.skillId && (t.cooldownParameter || t.energyCapacity)));
  const trackFacts = tracksCasts || recovery.length > 0 || project.timeline.some(entry=>entry.aura) || [...runtime.builds.values()].some(build => grantedBuildEffects(build).some(({ effect }) => readsResource(effect.predicate) || readsResource(effect.value)));
  if (!trackFacts && !partyParticles.length && ![...rules.values()].some(entries => entries.length)) return [];
  const results: CombatChange[] = [], timers = new Map<string, { ready: number; possible: number }>();
  const drops = new Map<string, CombatChange[]>(), picked = new Set<CombatChange>();
  function recordDrop(change: CombatChange) {
    const group = drops.get(change.source) ?? [];
    group.push(change);
    drops.set(change.source, group);
  }
  const energy = new Map<string, number | undefined>(), queues = new Map<string, number[]>();
  const chargeReduction = new Map<string, number>();
  const auraEnds = new Map<string, Map<string,number | null>>();
  const burstReady = new Map<string, number>();
  const events = new Map(runtime.context.events.map(event => [event.id, event]));
  let seed = project.seed;
  const roll = () => {
    if (seed === undefined) return;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const timeline = [...project.timeline].sort((a,b) => a.timeMs - b.timeMs || a.order - b.order || a.id.localeCompare(b.id));
  const restoreUntil = passiveEnergyClock(project, timeline, recovery);
  const capacities = new Map(runtime.context.actors.map(actor => [actor.id, number(actor.inputs.energyCapacity)]));
  const rejected=new Set<string>();
  function reject(entry:Entry) {
    rejected.add(entry.id);
    events.get(entry.id)!.occurred=false;
    runtime.followUps=applyCastWindows(project,runtime.context,rejected);
    updateHitOccurrences(runtime,project.timeline);
  }
  function frame(actor: string, eventId: string): CombatFrame {
    return { eventId, ownerId: actor, recipientId: actor, contributorId: null, targetId: 'target', phase: 'before', sourceEventId: null,
      facts: {}, actorFacts: {}, applications: [], captures: {}, factOverrides: [], hit: null };
  }
  const stat = (actor: string, eventId: string, key: string) => {
    const result = evaluateCombatBindings(runtime.team.program, runtime.context, { value: { kind: 'attribute', actor: { role: 'owner' },
      key: { namespace: 'builtin', id: 'attribute.' + key, revision: '1' }, at: { kind: 'current', phase: 'same' } } }, frame(actor,eventId)).outputs.value;
    return result?.state === 'known' && result.value.kind === 'quantity' ? result.value.value : undefined;
  };
  function publish(entry: Entry, phase: 'before' | 'after') {
    if (!trackFacts && !partyParticles.length) return;
    const states = events.get(entry.id)!.derivedStates ??= { before: {}, after: {} };
    for (const id of new Set([...energy.keys(), ...queues.keys(), ...auraEnds.keys()])) {
      const facts: Record<string, CalculationFact> = {};
      if (energy.has(id)) facts.currentEnergy = amount('energy', energy.get(id));
      const queue = queues.get(id);
      if (queue) facts.skillCooldownRemaining = amount('milliseconds', Math.max(0, (queue[0] ?? entry.timeMs) - entry.timeMs));
      for (const [element,end] of auraEnds.get(id) ?? []) {
        facts['aura.'+element] = { value:end===null?null:{kind:'boolean',value:entry.timeMs<end},provenance:'derived',sourceRefs:[] };
      }
      states[phase][id] = { ...states[phase][id], ...facts };
    }
  }
  function pickup(entry: Entry, source: string) {
    const drop = drops.get(source)?.find(row => entry.particleEffect ? row.effect === entry.particleEffect : row.kind === 'clear-particles');
    if (!drop || picked.has(drop)) return;
    picked.add(drop);
    const teamSize = project.candidate.actors.length;
    for (const member of project.candidate.actors) {
      const change: CombatChange = { source: entry.id, actor: drop.actor, effect: drop.effect, timeMs: entry.timeMs, kind: 'particle-energy',
        recipient: member.id, status: 'applied', ...(drop.particleElement ? {particleElement:drop.particleElement} : {}) };
      if (drop.status !== 'applied') {
        change.status = drop.status;
        if (drop.status === 'unknown') { change.missing = drop.missing; energy.set(member.id, undefined); }
        results.push(change);
        continue;
      }
      const recharge = member.build && stat(member.id, entry.id, 'energyRecharge');
      if (recharge === undefined || teamSize > 4) {
        change.status = 'unknown'; change.missing = [teamSize > 4 ? 'partySize' : 'energyRecharge']; energy.set(member.id, undefined);
      } else {
        const share = member.id === entry.actor ? 1 : (10 - teamSize) / 10;
        const perParticle = drop.particleElement ? member.build?.character.identity.element === drop.particleElement ? 3 : 1 : 2;
        change.energyGain = drop.particles! * perParticle * share * recharge;
        const previous = energy.get(member.id), capacity = number(runtime.context.actors.find(a => a.id === member.id)?.inputs.energyCapacity);
        if (previous !== undefined && capacity !== undefined) {
          change.energyAfter = Math.min(capacity, previous + change.energyGain);
          energy.set(member.id, change.energyAfter);
        }
      }
      results.push(change);
    }
  }
  for (const entry of timeline) {
    restoreUntil(entry.timeMs, energy, id => capacities.get(id), results);
    const event = events.get(entry.id)!;
    for (const [actor, queue] of queues) queues.set(actor, queue.filter(end => end > entry.timeMs));
    for (const actor of project.candidate.actors) {
      const own = subjectFacts(entry.damage?.facts, { kind: 'actor', id: actor.id });
      const observed = own?.currentEnergy ?? (entry.actor === actor.id ? entry.facts?.currentEnergy : undefined);
      if (observed) energy.set(actor.id, number(observed));
      const remaining = own?.skillCooldownRemaining ?? (entry.actor === actor.id ? entry.facts?.skillCooldownRemaining : undefined);
      if (remaining) {
        const ms = number(remaining);
        if (ms === undefined) queues.delete(actor.id);
        else if (!ms) queues.set(actor.id, []);
        else {
          const queue = queues.get(actor.id) ?? [], next = entry.timeMs + ms;
          queues.set(actor.id, [next, ...queue.slice(1).map(time => next + time - queue[0])]);
        }
      }
    }
    publish(entry, 'before');
    if (entry.aura) {
      const { element,baseDurationMs }=entry.aura;
      const key='auraDurationReduction.'+element;
      const reduction=baseDurationMs===0?0:stat(entry.actor,entry.id,key);
      const durationMs=reduction===undefined?undefined:Math.round(baseDurationMs*(1-reduction));
      const owned=auraEnds.get(entry.actor) ?? new Map<string,number|null>();
      owned.set(element,durationMs===undefined?null:entry.timeMs+durationMs);auraEnds.set(entry.actor,owned);
      results.push({kind:'aura-duration',effect:'aura.'+element,source:entry.id,actor:entry.actor,timeMs:entry.timeMs,
        ...(durationMs===undefined?{status:'unknown',missing:[key]}:{status:'applied',durationMs})});
    }
    if (entry.particleSource) pickup(entry, entry.particleSource);
    const build = runtime.builds.get(entry.actor);
    if (build && entry.kind === 'action') {
      const talent = build.character.talents.find(t => t.id === entry.skillId);
      if (talent?.category === 'skill') {
        const level = build.talents.skill + talentLevelBonus(build.character, 'skill', build.constellation);
        const seconds = talent.parameters.find(p => p.id === talent.cooldownParameter)?.values[level - 1];
        const queue = queues.get(entry.actor) ?? [];
        const maxCharges = (talent.skillCharges ?? 1) + build.character.constellations.filter(c=>c.rank<=build.constellation && c.extraSkillCharge).length;
        const saved = queue.length ? chargeReduction.get(entry.actor) : undefined;
        const adjustment = seconds === undefined ? undefined : saved ?? stat(entry.actor, entry.id, 'skillCooldownReduction');
        const duration = entry.facts?.skillCooldownMs ? number(entry.facts.skillCooldownMs)
          : seconds !== undefined && adjustment !== undefined ? Math.round(1000 * seconds * (1 - adjustment)) : undefined;
        if (queue.length >= maxCharges) {
          results.push({actor:entry.actor,source:entry.id,effect:talent.id,timeMs:entry.timeMs,kind:'skill-charge',status:'excluded',chargesAfter:0,cooldownAfterMs:queue[0]-entry.timeMs});
          reject(entry);
        } else if (duration !== undefined && duration > 0) {
          if (talent.skillCharges && !queue.length && adjustment !== undefined) chargeReduction.set(entry.actor,adjustment);
          queues.set(entry.actor, [...queue, (queue.at(-1) ?? entry.timeMs) + duration]);
          if(talent.skillCharges) results.push({actor:entry.actor,source:entry.id,effect:talent.id,timeMs:entry.timeMs,kind:'skill-charge',status:'applied',
            chargesAfter:maxCharges-queue.length-1,cooldownAfterMs:(queues.get(entry.actor)![0]-entry.timeMs)});
        }
        else queues.delete(entry.actor);
      }
      if (talent?.category === 'burst' && (energy.has(entry.actor) || talent.energyCapacity || talent.cooldownParameter)) {
        const level = build.talents.burst + talentLevelBonus(build.character, 'burst', build.constellation);
        const previous = energy.get(entry.actor), capacity = capacities.get(entry.actor);
        const spent = entry.facts?.energySpent ? number(entry.facts.energySpent) : talent.energyCapacity ? capacity : undefined;
        const cooldown = talent.parameters.find(p => p.id === talent.cooldownParameter)?.values[level-1];
        const next = burstReady.get(entry.actor) ?? 0;
        const source = { actor:entry.actor, source:entry.id, effect:talent.id, timeMs:entry.timeMs };
        if (entry.timeMs < next) {
          results.push({...source, kind:'burst-cooldown', status:'excluded', cooldownAfterMs:next - entry.timeMs});
          reject(entry);
        } else if (previous !== undefined && spent !== undefined && previous < spent) {
          results.push({...source, kind:'burst-energy', status:'excluded', energyAfter:previous});
          reject(entry);
        } else {
          if (cooldown !== undefined) {
            const reduction = stat(entry.actor,entry.id,'skillCooldownReduction');
            if (reduction !== undefined) burstReady.set(entry.actor,entry.timeMs + Math.round(1000*cooldown*(1-reduction)));
          }
          const after = spent === undefined ? undefined : previous !== undefined ? previous-spent : spent === capacity ? 0 : undefined;
          energy.set(entry.actor,after);
          if (talent.energyCapacity || entry.facts?.energySpent) results.push({...source, kind:'burst-energy',
            status:spent === undefined ? 'unknown' : 'applied', energyGain:spent === undefined ? undefined : -spent, energyAfter:after,
            ...(spent === undefined ? {missing:['energySpent']} : {})});
        }
      }
    }
    const actor = event.actorId, hit = entry.damage && findBuildHit(build, entry.damage.hit);
    for (const rule of partyParticles) {
      const reaction = event.reactionId ?? (entry.damage?.reaction && entry.damage.reaction !== 'none' ? entry.damage.reaction.type : undefined);
      if (!reaction || !(rule.reactions.includes(reaction) || reaction === 'swirl' && entry.reactionEvent && rule.swirlElements.includes(entry.reactionEvent.element))) continue;
      const timer = timers.get(rule.id) ?? {ready:0,possible:0};
      const row: CombatChange = {source:entry.id, actor:actor ?? entry.actor, effect:rule.id, timeMs:entry.timeMs, kind:'elemental-particles', particleElement:rule.element, status:'excluded'};
      results.push(row);
      recordDrop(row);
      if (entry.timeMs < timer.ready || event.occurred === false || number(event.facts.targetsDamaged) === 0) continue;
      const missing = [];
      if (!actor || !event.reactionId) missing.push('reactionTrigger');
      if (event.occurred === null) missing.push('hitApplied');
      if (entry.timeMs < timer.possible) missing.push('previousTrigger');
      if (missing.length) {
        row.status = 'unknown'; row.missing = missing;
        timers.set(rule.id,{ready:timer.ready,possible:entry.timeMs + rule.cooldownMs});
      } else {
        row.status = 'applied'; row.particles = rule.count; row.nextTriggerMs = entry.timeMs + rule.cooldownMs;
        timers.set(rule.id,{ready:row.nextTriggerMs,possible:row.nextTriggerMs});
      }
    }
    if (actor && entry.damage && hit && !entry.reactionEvent) for (const { id, rule } of rules.get(actor) ?? []) {
      if (rule.categories && (!hit.hit.category || !rule.categories.includes(hit.hit.category))) continue;
      const index = runtime.builds.get(actor)!.refinement - 1, key = JSON.stringify([actor,id]);
      const timer = timers.get(key) ?? { ready: 0, possible: 0 }, cooldown = rule.cooldownMs[index];
      const row: CombatChange = { actor, effect: id, source: entry.id, timeMs: entry.timeMs, kind: rule.change.kind, status: 'excluded' };
      results.push(row);
      if (rule.change.kind === 'clear-particles') recordDrop(row);
      if (entry.timeMs < timer.ready) { row.nextTriggerMs = timer.ready; continue; }
      const facts = event.facts, targets = number(facts.targetsDamaged);
      const critical = facts.criticalTargets ? number(facts.criticalTargets) : entry.damage.crit === 'critical' ? targets : entry.damage.crit === 'noncritical' ? 0 : undefined;
      if (targets === 0 || rule.critical && critical === 0) continue;
      const active = actorIsOnField(runtime.team, runtime.context, frame(actor, entry.id), actor);
      if (active === false) continue;
      const applies = event.occurred === undefined ? true : event.occurred;
      if (applies === false) continue;
      const n = rule.critical ? critical : targets;
      const missing: string[] = [];
      if (active === undefined) missing.push('onField');
      if (applies !== true) missing.push('hitApplied');
      if (targets === undefined) missing.push('targetsDamaged');
      if (rule.critical && critical === undefined) missing.push('criticalTargets');
      if (entry.timeMs < timer.possible) missing.push('previousTrigger');
      const probability = n === undefined ? undefined : 1 - (1 - rule.chance[index]) ** n;
      row.probability = probability;
      const sample = probability !== undefined && probability < 1 ? facts.triggerRoll ? number(facts.triggerRoll) : roll() : 0;
      if (probability !== undefined && sample !== undefined && sample >= probability) continue;
      if (sample === undefined) missing.push('triggerRoll');
      if (missing.length) {
        row.status = 'unknown'; row.missing = missing;
        timers.set(key, { ...timer, possible: Math.max(timer.possible, entry.timeMs + cooldown) });
        continue;
      }
      row.status = 'applied'; row.nextTriggerMs = entry.timeMs + cooldown;
      timers.set(key, { ready: row.nextTriggerMs, possible: row.nextTriggerMs });
      if (rule.change.kind === 'clear-particles') row.particles = rule.change.count;
      else {
        const queue = queues.get(actor);
        if (queue?.length) {
          const saved = queue[0] - entry.timeMs;
          queues.set(actor, queue.slice(1).map(time => time - saved));
        }
        if (queue) row.cooldownAfterMs = Math.max(0, (queues.get(actor)?.[0] ?? entry.timeMs) - entry.timeMs);
        else row.missing = ['skillCooldownRemaining'];
      }
    }
    publish(entry, 'after');
  }
  return results;
}

export function expandCastExits(project:Project) {
  if(!project.candidate.actors.some(a=>a.build?.character.talents.some(t=>t.castWindow?.exit)) || !project.timeline.some(r=>r.kind==='action')) return project;
  const prepared=prepareProjectRuntime(project);
  if(!prepared.ok) return project;
  resolveCombatChanges(project,prepared.runtime);
  const rejected=new Set(prepared.runtime.context.events.filter(e=>e.kind==='action' && e.occurred===false).map(e=>e.id));
  return scheduleCastExits(project,rejected);
}

export function projectBuffContext(project: Project, includeInstances = false) {
  const prepared = prepareProjectRuntime(project);
  if (!prepared.ok) return;
  if (project.actionStates?.length) {
    evaluateProjectStates(prepared.runtime,project.actionStates);
    updateHitOccurrences(prepared.runtime,project.timeline);
  }
  resolveCombatChanges(project,prepared.runtime);
  const {events, factIntervals} = prepared.runtime.context;
  const instances = new Map<string, EffectInstance[]>();
  if (includeInstances) {
    const data = compiledData(prepared.runtime.team.program)!;
    for (const instance of collectEffectInstances(data, prepared.runtime.context, 'target', () => true)) {
      const key = calculationEffectInstanceId(instance.owner.id, instance.definition.identity, null);
      const list = instances.get(key) ?? [];
      list.push(instance);
      instances.set(key, list);
    }
  }
  return {events,factIntervals,instances,sceneGrants:grantedSceneEffects(prepared.runtime.team)};
}

export function projectCombatEvents(project: Project) { return projectBuffContext(project)?.events ?? []; }

export function projectCastFact(project:Project,actorId:string,fact:string,timeMs:number,recordId?:string):boolean|undefined {
  const actor=project.candidate.actors.find(member=>member.id===actorId);
  if (!actor?.build?.character.talents.some(t=>t.castWindow?.fact===fact)) return;
  const source=project.timeline.find(entry=>entry.id===recordId);
  let id='window-query';
  for(let n=1; !source && project.timeline.some(entry=>entry.id===id); n++) id='window-query-'+n;
  const anchor:Entry=source ? {...source,timeMs} : {id, actor:actorId,timeMs,order:Number.MAX_SAFE_INTEGER,kind:'capture',definition:actor.character};
  const world={...project,timeline:[...project.timeline.filter(entry=>entry!==source),anchor]};
  const value=projectCombatEvents(world).find(entry=>entry.id===anchor.id)?.derivedStates?.before[actorId]?.[fact]?.value;
  return value?.kind==='boolean' ? value.value : undefined;
}
