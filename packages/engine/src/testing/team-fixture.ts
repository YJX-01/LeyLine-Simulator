import { teamSchema, type CharacterId, type TeamInput } from '@leyline/schema';
export function testTeam(character: CharacterId = 'jean'): TeamInput {
  const polearm = character === 'hutao' || character === 'raiden';
  return teamSchema.parse({ schemaVersion: 1, rulesVersion: 'team-repo-v1', durationMs: 20000, seed: 1, mode: 'noncritical',
    actors: [{ id: character, character, level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 },
      weapon: { id: polearm ? 'staff-of-homa' : 'harbinger-of-dawn', level: 90, ascension: 6, refinement: 1 },
      artifacts: [], initialHpRatio: 1, initialEnergy: { jean: 80, xingqiu: 80, hutao: 60, albedo: 40, raiden: 90 }[character] }],
    initialOnField: character, enemy: { level: 90, hpRatio: 1, resistance: 0, defenseReduction: 0, fatalBlossomHits: 2 },
    commands: [{ type: 'cast', id: 'E', timeMs: 0, actorId: character, action: 'E' }], logMode: 'detailed', maxLogEvents: 10000 });
}
