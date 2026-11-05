import { combatSchema, teamSchema, type CombatSkill, type CombatResult } from '@leyline/schema';
import { content } from '@leyline/game-data';
import { resolveLoadout, type ResolvedLoadout } from './loadout';
import { simulateCombat } from './combat';
import { createTeamRuntime } from './team-runtime';
import { frames, layouts, namedTiming, hit } from './team-profile';

export interface TeamResult extends CombatResult { loadouts: ResolvedLoadout[]; warnings: string[] }

export function simulateTeam(input: unknown): TeamResult {
  const team = teamSchema.parse(input);
  const loadouts = team.actors.map(resolveLoadout);
  const byId = new Map(loadouts.map(actor => [actor.loadout.id, actor]));
  const metadata = new Map<string, { owner: string; action: string }>();
  const ids = new Map<string, string>();
  const commands = new Map(team.commands.map(command => [command.id, command]));
  const skills: CombatSkill[] = [];
  for (const [index, actor] of loadouts.entries()) {
    const { character, id } = actor.loadout;
    const source = content.characters[character];
    const E = source.skills.E[String(actor.talents.skill)], Q = source.skills.Q[String(actor.talents.burst)];
    for (const action of ['N', ...layouts[character].map((_, i) => `N${i + 1}`), 'C', 'PL', 'PH', 'E', 'Q', 'E.proc', 'Q.proc', 'orbital']) {
      const skillId = `c${index}.${action}`;
      ids.set(`${id}:${action}`, skillId); metadata.set(skillId, { owner: id, action });
      const timing = namedTiming[character][action] ?? { hit: 0, lock: 0, cd: 0 };
      const category = action.startsWith('N') ? 'normal' : action === 'C' ? 'charged' : action === 'PL' || action === 'PH' ? 'plunge' : action.startsWith('Q') ? 'burst' : 'skill';
      const cooldown = action === 'E' ? E[{ jean: 3, xingqiu: 4, hutao: 5, albedo: 3, raiden: 4 }[character]] : action === 'Q' ? character === 'hutao' ? Q[4] : Q.at(-2)! : 0;
      skills.push({ id: skillId, ownerId: id, actionCategory: category, cooldownMs: Math.round(cooldown * 1000),
        cooldownStartDelayMs: frames(timing.cd), actionLockMs: frames(timing.lock), hitDelayMs: frames(timing.hit),
        energyCost: action === 'Q' ? actor.energyCapacity : 0, snapshot: character === 'hutao' && action === 'Q',
        effect: { type: 'hit', hit: hit('physical', 0, category) } });
    }
  }
  const skillId = (owner: string, action: string) => {
    const id = ids.get(`${owner}:${action}`);
    if (!id) throw new Error(`不支持的动作: ${owner}.${action}`);
    return id;
  };
  for (const command of team.commands) if (command.type === 'cast') {
    if (command.holdMs && (byId.get(command.actorId)!.loadout.character !== 'jean' || command.action !== 'E')) throw new Error('长按参数只适用于琴E');
    if (byId.get(command.actorId)!.loadout.character === 'albedo' && command.action === 'Q' && team.enemy.fatalBlossomHits === undefined) throw new Error('阿贝多Q必须明确配置敌人的 fatalBlossomHits（0—7）');
  }
  const combat = combatSchema.parse({ schemaVersion: 1, rulesVersion: 'team-core-v1', durationMs: team.durationMs, seed: team.seed,
    mode: team.mode, initialOnField: team.initialOnField,
    actors: loadouts.map(actor => ({ id: actor.loadout.id, name: actor.name, element: actor.element,
      stats: { ...actor.baseStats, critRate: Math.min(1, actor.baseStats.critRate) }, energyCapacity: actor.energyCapacity,
      initialEnergy: actor.loadout.initialEnergy, initialHpRatio: actor.loadout.initialHpRatio })), skills,
    commands: team.commands.map(command => command.type === 'switch' ? command : { type: 'cast', id: command.id, timeMs: command.timeMs, skillId: skillId(command.actorId, command.action) }),
    enemy: { enemyLevel: team.enemy.level, resistance: team.enemy.resistance, defenseReduction: team.enemy.defenseReduction, defenseIgnore: 0 },
    buffs: [], pickups: [], logMode: team.logMode, maxLogEvents: team.maxLogEvents,
  });
  const runtime = createTeamRuntime(team, loadouts, skillId, metadata, commands);
  const result = simulateCombat(combat, runtime);
  result.versions.data = content.version; result.versions.rules = 'team-repo-v1';
  return { ...result, loadouts, warnings: [
    '固定单目标、近战范围、无受击/位移/命中停顿；动作取消与敌人击杀不自动模拟。',
    '期望模式对伤害暴击和角色产球取期望，条件装备触发仍由显式种子决定。',
    '防御型命座记录状态；本场景不模拟敌人攻击。草反应不支持。',
    ...loadouts.flatMap(actor => [
      ...(actor.loadout.character === 'hutao' && actor.loadout.constellation >= 4 ? ['胡桃C4要求敌人死亡；静态敌人生命条件不产生击杀事件，因此本场景不会触发C4。'] : []),
      ...((actor.sets.bloodstained ?? 0) >= 4 ? ['染血骑士4件套需要击杀；当前静态目标场景不会触发击杀效果。'] : []),
      ...(actor.loadout.character === 'albedo' && actor.loadout.constellation >= 6 && !team.enemy.collectCrystallizeShards ? ['阿贝多C6未设置拾取结晶护盾条件，不自动假定护盾增伤生效。'] : []),
    ]),
  ] };
}
