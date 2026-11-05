import { expect, it } from 'vitest';
import { loadoutSchema, teamSchema } from '@leyline/schema';
const actor = { id: 'jean', character: 'jean', level: 90, ascension: 6, constellation: 0,
  talents: { normal: 1, skill: 1, burst: 1 }, weapon: { id: 'harbinger-of-dawn', level: 90, ascension: 6, refinement: 1 },
  artifacts: [], initialHpRatio: 1, initialEnergy: 80 };
it('validates actual loadout boundaries rather than guessing ascension', () => {
  expect(loadoutSchema.safeParse(actor).success).toBe(true);
  expect(loadoutSchema.safeParse({ ...actor, level: 79 }).success).toBe(false);
  expect(loadoutSchema.safeParse({ ...actor, weapon: { ...actor.weapon, id: 'missing' } }).success).toBe(false);
});
it('rejects duplicate characters, missing references and unsupported actions', () => {
  const team = { schemaVersion: 1, rulesVersion: 'team-repo-v1', durationMs: 1000, seed: 1, mode: 'expected',
    actors: [actor], initialOnField: 'jean', enemy: { level: 90, hpRatio: 1, resistance: 0.1, defenseReduction: 0 },
    commands: [], logMode: 'detailed', maxLogEvents: 10000 };
  expect(teamSchema.safeParse(team).success).toBe(true);
  expect(teamSchema.safeParse({ ...team, actors: [actor, { ...actor, id: 'second' }] }).success).toBe(false);
  expect(teamSchema.safeParse({ ...team, initialOnField: 'missing' }).success).toBe(false);
  expect(teamSchema.safeParse({ ...team, commands: [{ id: 'a', type: 'cast', timeMs: 0, actorId: 'jean', action: 'unknown' }] }).success).toBe(false);
});
