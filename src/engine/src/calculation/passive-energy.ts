import { createFieldPresenceReader, type Build, type CombatChange, type Project } from '@leyline/schema';

type Entry = Project['timeline'][number];
type Buff = NonNullable<Build['character']['metadata']['buffs']>[number];
type Recovery = { actor:string; id:string; rule:NonNullable<Buff['periodicEnergy']> };

/** Advance only known off-field ranges. A missing reading produces one diagnostic per continuous interval. */
export function passiveEnergyClock(project:Project, timeline:Entry[], grants:Recovery[]) {
  const horizon = (timeline.at(-1)?.timeMs ?? 0) + 1;
  const presence = createFieldPresenceReader(project);
  const clocks = grants.map(({actor,id,rule}) => {
    type Range = { start:number; end:number; next:number; source:string; missing:boolean };
    const intervals = (project.combatStates ?? []).filter(entry => entry.values.onField !== undefined && (entry.actor === actor || entry.values.onField === true));
    const switches = timeline.filter(entry => entry.fieldSwitch);
    const times = [...new Set([0,horizon,...intervals.flatMap(s => [s.startMs,s.endMs]),...switches.map(entry => entry.timeMs)])].sort((a,b) => a-b);
    const ranges: Range[] = [];
    for (let i=0; i<times.length-1 && times[i]<horizon; i++) {
      const time=times[i], end=Math.min(horizon,times[i+1]);
      const state = presence(actor,time);
      if (state?.value !== false) continue;
      const last=ranges.at(-1);
      if (last?.end===time) last.end=end;
      else ranges.push({start:time,end,next:time+rule.intervalMs,source:state.id,missing:false});
    }
    return {actor,id,rule,ranges,index:0};
  });
  return (time:number, energy:Map<string,number|undefined>, capacity:(id:string)=>number|undefined, results:CombatChange[]) => {
    for (const clock of clocks) {
      const {actor,id,rule,ranges}=clock;
      while (clock.index<ranges.length) {
        const range=ranges[clock.index], last=Math.min(time,range.end-1);
        if (range.next<=last) {
          const n=Math.floor((last-range.next)/rule.intervalMs)+1, first=range.next;
          range.next+=n*rule.intervalMs;
          const old=energy.get(actor), cap=capacity(actor);
          const source={actor,recipient:actor,effect:id,source:range.source,kind:'passive-energy' as const};
          if (cap!==0 && (old===undefined || cap===undefined)) {
            if (!range.missing) results.push({...source,timeMs:first,status:'unknown',missing:[cap===undefined?'energyCapacity':'currentEnergy']});
            range.missing=true;
          } else if (old!==undefined && cap!==undefined) {
            range.missing=false;
            const threshold='belowEnergy' in rule ? Math.min(rule.belowEnergy,cap) : cap*rule.belowRatio;
            const count=Math.min(n,Math.ceil((threshold-old)/rule.amount));
            for (let i=0;i<count;) {
              const step=count>100 ? count : 1, before=energy.get(actor)!, after=Math.min(cap,before+rule.amount*step);
              i+=step;
              results.push({...source,timeMs:first+(i-1)*rule.intervalMs,status:'applied',energyGain:after-before,energyAfter:after,...(step>1?{ticks:step}:{})});
              energy.set(actor,after);
            }
          }
        }
        if (time<range.end) break;
        clock.index++;
      }
    }
  };
}
