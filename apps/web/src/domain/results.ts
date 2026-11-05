import type { CombatEvent, TeamInput, TeamSimulationResult } from '@leyline/schema';
export type Point = [number, number];
export interface Interval { actorId: string; label: string; start: number; end: number; kind: 'field' | 'buff' | 'debuff' }
export function buildTimeline(input: TeamInput, result: TeamSimulationResult) {
  const cumulative: Point[] = [[0, 0]];
  const energy: Record<string, Point[]> = Object.fromEntries(input.actors.map(actor => [actor.id, [[0, actor.initialEnergy]]]));
  const intervals: Interval[] = [];
  const active = new Map<string, Omit<Interval, 'end'>>();
  let damage = 0, onField = input.initialOnField, fieldStart = 0;
  function close(key: string, end: number) { const interval = active.get(key); if (interval) { intervals.push({ ...interval, end }); active.delete(key); } }
  for (const event of result.events) {
    const time = event.timeMs / 1000;
    if (event.type === 'hit') { damage += event.damage; cumulative.push([time, damage]); continue; }
    if (event.type === 'energy' || event.type === 'cast') {
      const value = event.type === 'energy' ? event.details.after : event.details.energyAfter;
      if (typeof value === 'number') energy[event.actorId]?.push([time, value]);
    }
    if (event.type === 'switch') { intervals.push({ actorId: onField, label: '前台', start: fieldStart, end: time, kind: 'field' }); onField = event.actorId; fieldStart = time; }
    const key = `${event.actorId}:${event.type.startsWith('enemy-debuff') ? 'debuff' : 'buff'}:${event.id}`;
    if (event.type === 'buff-start' || event.type === 'enemy-debuff-start') {
      close(key, time);
      active.set(key, { actorId: event.actorId, label: event.id, start: time, kind: event.type === 'buff-start' ? 'buff' : 'debuff' });
    } else if (['buff-end', 'buff-replaced', 'enemy-debuff-end'].includes(event.type)) close(key, time);
  }
  const end = result.durationMs / 1000;
  if (result.logMode === 'detailed') {
    intervals.push({ actorId: onField, label: '前台', start: fieldStart, end, kind: 'field' });
    for (const key of active.keys()) close(key, end);
    cumulative.push([end, damage]);
    for (const actor of input.actors) energy[actor.id].push([end, result.finalEnergy[actor.id]]);
  }
  return { cumulative, energy, intervals: intervals.sort((a, b) => a.start - b.start), detailed: result.logMode === 'detailed' };
}
export function filterEvents(events: CombatEvent[], actor: string, type: string) {
  return events.filter(event => (!actor || event.actorId === actor) && (!type || event.type === type));
}
export const formatNumber = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
