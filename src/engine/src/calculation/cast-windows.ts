import { authoredHitEntries } from '@leyline/schema/hit-bindings';
import { characterHitRef, createFieldPresenceReader, createTalentRankReader, hitBelongsToCharacter, putHitFact, subjectFacts, talentInputMaximum, type CalculationEvent, type CalculationFact, type Project } from '@leyline/schema';

type Entry = Project['timeline'][number];
type World = Pick<Project,'timeline'|'candidate'|'combatStates'>;
type Build = NonNullable<Project['candidate']['actors'][number]['build']>;
type Talent = Build['character']['talents'][number];
type Rule = NonNullable<Talent['castWindow']>;
type Frames = NonNullable<CalculationEvent['derivedStates']>;
type FollowUp = { owner:string; hit:string; source:string; remaining:number; uncertain:boolean };
const flag = (value:boolean | null):CalculationFact => ({value:value === null ? null : {kind:'boolean',value},provenance:'derived',sourceRefs:[]});
const count = (value:number | null):CalculationFact => ({value:value === null ? null : {kind:'quantity',unit:'count',value},provenance:'derived',sourceRefs:[]});

/** Casts and explicit field transitions are the clock for temporary transformations and zones. */
export function castWindowStates(world: World, rejected:ReadonlySet<string>=new Set()) {
  const frames = new Map<string,Frames>(), contacts = new Map<string,{key:string;ready:boolean|null}>();
  const followUps = new Map<string,FollowUp>();
  const exits: { owner:string; build:Build; hit:string; ready:string; certain:boolean; cast:Entry; time:number; source?:Entry; interval?:string }[] = [];
  const members = world.candidate.actors;
  const talentRank = createTalentRankReader(members);
  const windows = members.flatMap(({id:owner,build}) => !build ? [] : build.character.talents.flatMap(talent => {
    const rule = talent.castWindow;
    if (!rule) return [];
    const rank = talentRank(build, talent.category);
    const durations = talent.parameters.find(p => p.id === rule.durationParameter)!.values.slice(rank.level - 1, rank.upperLevel ?? rank.level);
    const duration = Math.max(...durations) * 1000, certainDuration = Math.min(...durations) * 1000;
    const input=talent.inputs?.find(i=>i.id===rule.hitCounter?.input);
    const follow=rule.followUp, unlock=follow&&authoredHitEntries(build.character.metadata,talent.id).find(entry=>entry.hit.id===follow.hit)?.unlock;
    return [{ owner,build,talent,rule,duration,certainDuration,certainEnd:0,end:0,nextContact:0,cast:undefined as Entry|undefined,
      follow:(!unlock || build[unlock.state]>=unlock.rank) ? follow : undefined, claim:undefined as FollowUp|undefined,
      counter:0 as number|null,max:input?talentInputMaximum(input,build.constellation):0,nextGain:0 }];
  }));
  const switches = world.timeline.filter(event => event.fieldSwitch);
  if (!windows.length && !switches.length && !world.combatStates?.some(s=>s.values.onField !== undefined)) return {frames,contacts,exits,followUps};
  const presence = createFieldPresenceReader(world);
  const bounds = (world.combatStates ?? []).filter(s => s.values.onField !== undefined || s.values.hpRatio === 0)
    .flatMap(s => [{time:s.startMs, s, start:true}, {time:s.endMs, s, start:false}]).sort((a,b)=>a.time-b.time);
  const ordered = [...world.timeline].sort((a,b)=>a.timeMs-b.timeMs || a.order-b.order || a.id.localeCompare(b.id));
  let bound = 0;
  function leave(owner:string,time:number,source?:Entry,interval?:string) {
    for (const w of windows) if (w.owner === owner && w.rule.cancelOnLeave && w.end > time && w.cast) {
      const exit = w.rule.exit;
      const hit = exit && authoredHitEntries(w.build.character.metadata,w.talent.id).find(entry => entry.hit.id === exit.hit);
      if (exit && hit && (!hit.unlock || w.build[hit.unlock.state] >= hit.unlock.rank)) {
        exits.push({owner,build:w.build,hit:hit.hit.id,ready:exit.ready,certain:time<w.certainEnd,time,source,interval,cast:w.cast});
      }
      w.end = time;
    }
  }
  function applyBound({time,s,start}:typeof bounds[number]) {
    if (start && s.values.hpRatio === 0) for (const w of windows) if (w.owner === s.actor && w.rule.cancelOnDefeat) w.end = Math.min(w.end,time);
    if (s.values.onField !== undefined) for (const w of windows) if (presence(w.owner,time,-Infinity)?.value === false) leave(w.owner,time,undefined,s.id);
  }
  function save(entry:Entry,states:Frames['before'],after:boolean) {
    for (const m of members) {
      const reading = presence(m.id,entry.timeMs,entry.order,after);
      if (reading) states[m.id] = { onField:flag(reading.value) };
    }
    for (const w of windows) {
      const state=states[w.owner] ??= {}, active=!!w.cast && entry.timeMs < w.end;
      const standalone=!!w.rule.hitCounter && !w.cast && entry.actor===w.owner && entry.damage && hitBelongsToCharacter(entry.damage.hit,w.build.character)
        && w.rule.hitCounter.hits.includes(entry.damage.hit.hitId);
      const uncertain = active && entry.timeMs >= w.certainEnd;
      state[w.rule.fact]=flag(uncertain ? null : active || !!standalone);
      const counter=w.rule.hitCounter;
      if (counter) {
        const observed=entry.actor===w.owner && entry.damage && hitBelongsToCharacter(entry.damage.hit,w.build.character)
          && subjectFacts(entry.damage.facts,{kind:'event'})?.[counter.input];
        state[counter.input]=!after && observed ? observed : count(uncertain ? null : active?w.counter:standalone?null:0);
      }
    }
  }
  for (const entry of ordered) {
    while (bound < bounds.length && bounds[bound].time <= entry.timeMs) applyBound(bounds[bound++]);
    for (const w of windows) if (w.rule.cancelOnDefeat) {
      const hp = subjectFacts(entry.damage?.facts,{kind:'actor',id:w.owner})?.hpRatio ?? (entry.actor === w.owner ? entry.facts?.hpRatio : undefined);
      if (hp?.value?.value === 0) w.end = Math.min(w.end,entry.timeMs);
    }
    const state:Frames = {before:{},after:{}};
    save(entry,state.before,false);
    if (entry.fieldSwitch) {
      for (const w of windows) if (w.owner !== entry.actor) leave(w.owner,entry.timeMs,entry);
    }
    for (const w of windows) if (entry.actor === w.owner) {
      if (entry.kind === 'action' && entry.skillId === w.talent.id && !rejected.has(entry.id)) {
        w.cast=entry; w.end=entry.timeMs+w.duration; w.certainEnd=entry.timeMs+w.certainDuration; w.nextContact=entry.timeMs; w.claim=undefined;
        w.counter=w.rule.hitCounter && w.build.ascension>=w.rule.hitCounter.ascension.rank?w.rule.hitCounter.ascension.initial:0;
        w.nextGain=entry.timeMs;
      }
      const counter=w.rule.hitCounter, hit=entry.damage?.hit;
      const follow=w.follow;
      if (follow && hit && hitBelongsToCharacter(hit,w.build.character)) {
        const fields=subjectFacts(entry.damage?.facts,{kind:'event'});
        const active=subjectFacts(entry.damage?.facts,{kind:'actor',id:w.owner})?.[w.rule.fact];
        if (!w.claim && w.cast && entry.timeMs<w.end && follow.triggers.includes(hit.hitId)
          && active?.value?.value!==false && fields?.targetsDamaged?.value?.value!==0) {
          w.claim={owner:w.owner,hit:follow.hit,source:entry.id,remaining:follow.recordedHits,uncertain:active?.value===null || !active && entry.timeMs>=w.certainEnd || fields?.targetsDamaged?.value===null};
          followUps.set(entry.id,w.claim);
        }
        if (hit.hitId===follow.hit && (w.cast || entry.sourceEventIds?.length)) {
          const linked=entry.sourceEventIds?.length ? entry.sourceEventIds.map(id=>followUps.get(id)).find(row=>row?.owner===w.owner && row.hit===follow.hit) : w.claim;
          const ready=linked && linked.remaining>0 ? linked.uncertain && fields?.[follow.ready]?.value?.value!==true ? null : true : false;
          contacts.set(entry.id,{key:follow.ready,ready});
          if (linked && ready!==false && fields?.[follow.ready]?.value?.value!==false) {
            linked.remaining--;
            if (fields?.[follow.ready]?.value?.value===true) linked.uncertain=false;
          }
        }
      }
      if (counter && hit && hitBelongsToCharacter(hit,w.build.character) && w.cast && entry.timeMs<w.end) {
        const fields=subjectFacts(entry.damage?.facts,{kind:'event'}), observed=fields?.[counter.input];
        if (observed) w.counter=observed.value?.kind==='quantity'?observed.value.value:null;
        if (hit.hitId===counter.ascension.fillHit && w.build.ascension>=counter.ascension.rank) w.counter=w.max;
        if (counter.hits.includes(hit.hitId) && entry.timeMs>=w.nextGain) {
          const targets=fields?.targetsDamaged;
          if (!targets || targets.value?.kind==='quantity' && targets.value.value>0) {
            if (w.counter!==null) w.counter=Math.min(w.max,w.counter+1);
            w.nextGain=entry.timeMs+counter.intervalMs;
          } else if (targets.value===null && w.counter!==w.max) w.counter=null;
        }
      }
      if (w.rule.contact && entry.damage?.hit.hitId === w.rule.contact.hit && hitBelongsToCharacter(entry.damage.hit,w.build.character)) {
        const key=w.rule.contact.ready, overrides=subjectFacts(entry.damage.facts,{kind:'event'});
        const zone=subjectFacts(entry.damage.facts,{kind:'actor',id:w.owner})?.[w.rule.fact];
        const inZone=zone ? zone.value?.value === true : !!w.cast && entry.timeMs<w.end;
        const ready=entry.timeMs>=w.nextContact;
        contacts.set(entry.id,{key,ready});
        if (inZone && ready && (!overrides?.[key] || overrides[key].value?.value===true)) w.nextContact=entry.timeMs+w.rule.contact.intervalMs;
      }
    }
    save(entry,state.after,true);
    frames.set(entry.id,state);
  }
  while (bound < bounds.length) applyBound(bounds[bound++]);
  return {frames,contacts,exits,followUps};
}

export function scheduleCastExits(project:Project,rejected?:ReadonlySet<string>):Project {
  if (!project.candidate.actors.some(m => m.build?.character.talents.some(t => t.castWindow?.exit))) return project;
  const {exits}=castWindowStates(project,rejected);
  if (!exits.length) return project;
  const records=[...project.timeline], claimed=new Set<string>(), ids=new Set(records.map(r=>r.id));
  for (const exit of exits) {
    const sources=[exit.cast.id,...exit.source ? [exit.source.id] : []];
    const matches=records.filter(r => r.actor===exit.owner && r.timeMs===exit.time && r.damage?.hit.hitId===exit.hit &&
      hitBelongsToCharacter(r.damage.hit,exit.build.character) && !claimed.has(r.id) && (!r.sourceEventIds?.length || sources.every(id=>r.sourceEventIds!.includes(id))));
    const prior=matches[0], hit=characterHitRef(exit.build.character,exit.hit);
    const baseId='zone-exit-'+exit.cast.id+'-'+(exit.source?.id ?? exit.interval);
    let id=prior?.id ?? baseId;
    for (let suffix=1; !prior && ids.has(id); suffix++) id=baseId+'-'+suffix;
    ids.add(id);
    const choices=exit.source?.fieldSwitch ?? {crit:null,reaction:null};
    const damage=structuredClone(prior?.damage ?? {...choices,hit});
    if (!prior || !subjectFacts(prior.damage?.facts,{kind:'event'})?.[exit.ready]) {
      putHitFact(damage.facts ??= [],{kind:'event'},exit.ready,exit.certain ? {kind:'boolean',value:true} : null,'derived');
    }
    const record:Entry={...prior,id,actor:exit.owner,timeMs:exit.time,order:Math.max(prior?.order ?? 0,(exit.source?.order ?? -1)+1),
      kind:'damage',definition:exit.owner+'-real-damage',sourceEventIds:sources,damage};
    if (prior) records[records.indexOf(prior)]=record;
    else records.push(record);
    claimed.add(record.id);
    for(const duplicate of matches.slice(1)) {
      const copy=structuredClone(duplicate);
      putHitFact(copy.damage!.facts ??= [],{kind:'event'},exit.ready,{kind:'boolean',value:false},'derived');
      records[records.indexOf(duplicate)]=copy;
      claimed.add(copy.id);
    }
  }
  return {...project,timeline:records};
}
