import { describe, it, expect } from 'vitest';
import { resolveLoadout } from '@leyline/engine';
import { characterIdSchema, teamSchema } from '@leyline/schema';
import example from '../../../../fixtures/scenarios/first-team.json';
import { newActor, removeActor, canonical, percentStat } from './editor';
describe('team editing operations', () => {
  it('creates compatible loadouts for every supported character', () => {
    for (const id of characterIdSchema.options) expect(resolveLoadout(newActor(id)).energyCapacity).toBeGreaterThan(0);
  });
  it('removes references and repairs initial field without changing remaining command order', () => {
    const input = teamSchema.parse(example), id = input.initialOnField;
    const next = removeActor(input, id);
    expect(next.commands).toEqual(input.commands.filter(command => command.actorId !== id));
    expect(next.actors.some(actor => actor.id === next.initialOnField)).toBe(true);
    expect(teamSchema.safeParse(next).success).toBe(true);
    expect(removeActor({ ...next, actors: [next.actors[0]] }, next.actors[0].id).actors).toHaveLength(1);
  });
  it('ignores object property order but preserves command order in signatures', () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(percentStat('ER')).toBe(true); expect(percentStat('EM')).toBe(false);
  });
});
