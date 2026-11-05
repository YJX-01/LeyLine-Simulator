import { describe, it, expect } from 'vitest';
import { simulateTeam } from '@leyline/engine';
import { teamSchema } from '@leyline/schema';
import example from '../../../../fixtures/scenarios/first-team.json';
import { buildTimeline, filterEvents } from './results';
const input = teamSchema.parse(example);
describe('result presentation models', () => {
  it('reconciles cumulative damage and final energy with authoritative totals', () => {
    const result = simulateTeam(input), timeline = buildTimeline(input, result);
    expect(timeline.cumulative.at(-1)?.[1]).toBeCloseTo(result.totalDamage, 7);
    for (const actor of input.actors) {
      expect(timeline.energy[actor.id][0]).toEqual([0, actor.initialEnergy]);
      expect(timeline.energy[actor.id].at(-1)?.[1]).toBe(result.finalEnergy[actor.id]);
    }
    const fields = timeline.intervals.filter(interval => interval.kind === 'field');
    expect(fields.reduce((total, interval) => total + interval.end - interval.start, 0)).toBe(input.durationMs / 1000);
    expect(fields.at(-1)?.actorId).toBe(result.finalOnField);
  });
  it('closes replaced buffs and unfinished intervals without extending old instances', () => {
    const result = simulateTeam(input);
    result.events = [
      { type: 'buff-start', id: 'same', actorId: 'jean', timeMs: 1000, details: {} },
      { type: 'buff-replaced', id: 'same', actorId: 'jean', timeMs: 2000, details: {} },
      { type: 'buff-start', id: 'same', actorId: 'jean', timeMs: 2000, details: {} },
      { type: 'buff-end', id: 'same', actorId: 'jean', timeMs: 3000, details: {} },
    ];
    expect(buildTimeline(input, result).intervals.filter(interval => interval.kind === 'buff').map(interval => [interval.start, interval.end])).toEqual([[1, 2], [2, 3]]);
  });
  it('marks summary data unavailable and filters logs without changing original order', () => {
    const result = simulateTeam(input);
    expect(filterEvents(result.events, 'jean', 'hit')).toEqual(result.events.filter(event => event.actorId === 'jean' && event.type === 'hit'));
    expect(buildTimeline(input, { ...result, logMode: 'summary', events: [] }).detailed).toBe(false);
  });
});
