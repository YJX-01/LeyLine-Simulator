import { characterHitRef, definitionKey, talentLevelBonus, type Diagnostic, type Project } from '@leyline/schema';
import { projectCombatEvents } from './combat-changes';

type Entry = Project['timeline'][number];
type Placement = { cast: Entry; start: number; end: number; nearby: Set<string> };
type Scheduled = { time: number; order: number; run: () => void };

/** Resolve independent creation clocks and explicit spatial relationships for a single target. */
export function resolveSummons(project: Project): { project: Project; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const timeline = [...project.timeline];
  const reserved = new Set(timeline.map(record => record.id)), consumed = new Set<string>();
  let sequence = 0, remaining = 10000;
  let rejected: Set<string> | undefined;
  for (const { id: actor, build } of project.candidate.actors) {
    if (!build) continue;
    for (const talent of build.character.talents) {
      const rule = talent.summon;
      if (!rule) continue;
      const casts = project.timeline.filter(entry => entry.actor === actor && entry.kind === 'action' && [talent.id, rule.release.skill].includes(entry.skillId ?? ''));
      if (!casts.length) continue;
      rejected ??= new Set(projectCombatEvents(project).filter(e=>e.kind==='action' && e.occurred===false).map(e=>e.id));
      const level = build.talents[talent.category] + talentLevelBonus(build.character, talent.category, build.constellation);
      const duration = talent.parameters.find(param => param.id === rule.durationParameter)?.values[level - 1];
      const active: Placement[] = [], shots: Scheduled[] = [], transitions: Scheduled[] = [];
      const milliseconds = (frame: number) => Math.round(frame * 1000 / rule.fps);
      function addHit(cast: Entry, hitId: string, timeMs: number, sources: string[]) {
        if (!cast.summon?.targetInRange || timeMs > 3600000) return;
        const hit = characterHitRef(build!.character, hitId);
        const match = timeline.findIndex(entry => !consumed.has(entry.id) && entry.actor === actor && entry.timeMs === timeMs
          && entry.damage?.hit.hitId === hitId && definitionKey(entry.damage.hit.definition) === definitionKey(hit.definition)
          && (!entry.sourceEventIds?.length || sources.every(id => entry.sourceEventIds!.includes(id))));
        if (match >= 0) {
          const entry = timeline[match];
          timeline[match] = { ...entry, sourceEventIds: [...new Set([...entry.sourceEventIds ?? [], ...sources])] };
          consumed.add(entry.id);
          return;
        }
        if (timeline.length >= 10000) {
          if (!diagnostics.some(entry => entry.code === 'budget')) diagnostics.push({ code: 'budget', path: 'timeline', message: '召唤伤害超出项目事件上限。' });
          return;
        }
        let id: string;
        do { id = 'derived-summon-' + ++sequence; } while (reserved.has(id));
        reserved.add(id); consumed.add(id);
        timeline.push({ id, actor, timeMs, order: cast.order, kind: 'damage', definition: actor + '-real-damage', sourceEventIds: sources,
          damage: { hit, crit: cast.summon.crit, reaction: cast.summon.reaction } });
      }
      for (const cast of casts) {
        if (rejected.has(cast.id)) continue;
        if (!cast.summon || !duration) {
          diagnostics.push({ code: 'unknown', path: 'timeline.' + cast.id + '.summon', message: '召唤物缺少邻近创建记录、目标范围或持续时间。' });
          continue;
        }
        const selected = cast.summon;
        if (cast.skillId === talent.id) {
          const start = cast.timeMs + milliseconds(rule.spawn);
          const placement = { cast, start, end: start + duration * 1000, nearby: new Set(selected.nearby) };
          transitions.push({ time: start, order: cast.order, run() {
            const previous = active.filter(p => p.end > start);
            const replaced = previous.find(p => p.cast.id === selected.replace) ?? (previous.length >= rule.capacity ? previous[0] : undefined);
            if (replaced) replaced.end = start;
            active.push(placement);
          } });
          for (let frame = rule.spawn + rule.firstShot; cast.timeMs + milliseconds(frame) < start + duration * 1000; frame += rule.interval) {
            if (remaining-- <= 0) {
              if (!diagnostics.some(entry => entry.code === 'budget')) diagnostics.push({ code: 'budget', path: 'timeline', message: '召唤物调度超出项目事件上限。' });
              break;
            }
            const time = cast.timeMs + milliseconds(frame), impact = cast.timeMs + milliseconds(frame + rule.impactDelay);
            shots.push({ time, order: cast.order, run() {
              if (time >= placement.end) return;
              const neighbors = active.filter(p => p !== placement && p.start <= time && time < p.end
                && (p.nearby.has(cast.id) || placement.nearby.has(p.cast.id)));
              const rank = neighbors.length + Number(build!.constellation >= rule.extraRankAt);
              addHit(cast, rule.rankHits[Math.min(rank, rule.rankHits.length - 1)], impact, [cast.id]);
            } });
          }
        } else {
          transitions.push({ time: cast.timeMs, order: cast.order, run() {
            addHit(cast, rule.release.hit, cast.timeMs + milliseconds(rule.release.impact), [cast.id]);
            const nearby = active.filter(p => p.end > cast.timeMs && selected.nearby.includes(p.cast.id));
            nearby.forEach((p, i) => {
              p.end = cast.timeMs;
              addHit(cast, rule.release.additionalHit, cast.timeMs + milliseconds(rule.release.firstAdditional + i * rule.release.spacing), [cast.id, p.cast.id]);
            });
          } });
        }
      }
      const events = [...transitions, ...shots].sort((a, b) => a.time - b.time || a.order - b.order);
      for (const event of events) event.run();
    }
  }
  return { project: timeline.length === project.timeline.length && !consumed.size ? project : { ...project, timeline }, diagnostics };
}
