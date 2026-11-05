import { teamSchema, type TeamInput } from '../../packages/schema/src';
import example from '../scenarios/first-team.json' with { type: 'json' };
export function performanceScenarios(): Record<string, TeamInput> {
  const team = teamSchema.parse(example);
  const longTeam: TeamInput = { ...team, durationMs: team.durationMs * 10, maxLogEvents: 20000,
    commands: Array.from({ length: 10 }, (_, cycle) => team.commands.map(command => ({ ...command, id: `${cycle}-${command.id}`, timeMs: cycle * team.durationMs + command.timeMs }))).flat() };
  const jean = { ...team.actors.find(actor => actor.character === 'jean')!, initialHpRatio: 1 };
  const maximum: TeamInput = { ...team, actors: [jean], initialOnField: jean.id, durationMs: 3_000_000, maxLogEvents: 20000,
    commands: Array.from({ length: 2000 }, (_, index) => ({ type: 'cast' as const, id: `normal-${index}`, actorId: jean.id, action: 'N1' as const, timeMs: index * 1500 })) };
  return { 'team-48s': team, 'team-480s': longTeam, '2000-commands': maximum, '2000-commands-summary': { ...maximum, logMode: 'summary' } };
}
