import { combatSchema, teamSchema, type TeamInput, type CombatSkill, type CombatResult, type CombatBuff } from '@leyline/schema';
import { content } from '@leyline/game-data';
import { resolveLoadout, type ResolvedLoadout } from './loadout';
import { simulateCombat } from './combat';
import type { CombatRuntime, RuntimeContext, RuntimeHit } from './combat-runtime';
import type { CombatPanel } from './mechanics/buff-store';
import { createGearRuntime } from './gear-runtime';

const frames = (value: number) => Math.round(value / 60 * 1000);
const layouts: Record<string, number[][]> = {
  jean: [[0], [1], [2], [3], [4]], xingqiu: [[0], [1], [2, 3], [4], [5, 6]],
  hutao: [[0], [1], [2], [3], [4, 5], [6]], albedo: [[0], [1], [2], [3], [4]], raiden: [[0], [1], [2], [3, 4], [5]],
};
const normalTiming: Record<string, { hits: number[][]; locks: number[] }> = {
  jean: { hits: [[13], [6], [17], [37], [25]], locks: [28, 20, 36, 52, 80] },
  xingqiu: { hits: [[10], [13], [9, 19], [17], [18, 39]], locks: [24, 30, 41, 36, 86] },
  hutao: { hits: [[12], [9], [17], [22], [16, 28], [23]], locks: [19, 17, 31, 35, 43, 79] },
  albedo: { hits: [[12], [11], [17], [17], [27]], locks: [20, 28, 40, 44, 74] },
  raiden: { hits: [[14], [9], [14], [14, 27], [34]], locks: [24, 19, 32, 41, 56] },
};
const burstNormalTiming = { hits: [[12], [13], [11], [22, 33], [33]], locks: [25, 22, 22, 44, 65] };
const namedTiming: Record<string, Record<string, { hit: number; lock: number; cd: number }>> = {
  jean: { E: { hit: 21, lock: 46, cd: 19 }, Q: { hit: 40, lock: 88, cd: 38 }, C: { hit: 36, lock: 56, cd: 0 } },
  xingqiu: { E: { hit: 12, lock: 77, cd: 10 }, Q: { hit: 18, lock: 40, cd: 0 }, C: { hit: 8, lock: 58, cd: 0 } },
  hutao: { E: { hit: 0, lock: 28, cd: 14 }, Q: { hit: 66, lock: 97, cd: 62 }, C: { hit: 23, lock: 61, cd: 0 } },
  albedo: { E: { hit: 25, lock: 32, cd: 23 }, Q: { hit: 75, lock: 96, cd: 74 }, C: { hit: 20, lock: 56, cd: 0 } },
  raiden: { E: { hit: 51, lock: 51, cd: 6 }, Q: { hit: 98, lock: 111, cd: 0 }, C: { hit: 22, lock: 41, cd: 0 } },
};
const hit = (element: RuntimeHit['element'], multiplier: number, category: RuntimeHit['category'], gauge: 0 | 1 | 2 = 0, tag = category ?? 'hit'): RuntimeHit =>
  ({ element, multiplier, category, gauge, icdTag: tag, icdRule: gauge ? 'standard' : 'none' });
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

function createTeamRuntime(team: TeamInput, loadouts: ResolvedLoadout[], skillId: (id: string, action: string) => string,
  metadata: Map<string, { owner: string; action: string }>, commands: Map<string, TeamInput['commands'][number]>): CombatRuntime {
  const actors = new Map(loadouts.map(actor => [actor.loadout.id, actor]));
  const gear = createGearRuntime(loadouts, skillId);
  const party = loadouts.map(actor => actor.loadout.id);
  const timers = new Map<string, number>();
  const counters = new Map<string, number>();
  const combo = new Map<string, number>();
  const comboTime = new Map<string, number>();
  const conversion = new Map<string, number>();
  const flowerPanels = new Map<string, CombatPanel>();
  const marks = new Map<string, { end: number; next: number; flat: number }>();
  const actionParts = new Map<string, { values: number[]; times: number[]; element: RuntimeHit['element']; category: RuntimeHit['category']; gauge: 0 | 1 | 2; snapshot: boolean }>();
  let stamina = 240, staminaTime = 0, regenAt = 0;
  const updateStamina = (now: number) => { stamina = Math.min(240, stamina + Math.max(0, now - Math.max(staminaTime, regenAt)) * 0.025); staminaTime = now; };
  const staminaCost = (ctx: RuntimeContext, skill: CombatSkill) => {
    if (skill.actionCategory !== 'charged') return 0;
    const actor = actors.get(skill.ownerId)!;
    if (actor.loadout.character === 'hutao' && actor.loadout.constellation >= 1 && until(`${skill.ownerId}:papilio`, ctx.timeMs)) return 0;
    return actor.loadout.character === 'hutao' || (actor.loadout.character === 'raiden' && !until(`${skill.ownerId}:musou`, ctx.timeMs)) ? 25 : 20;
  };
  const until = (key: string, now: number) => (timers.get(key) ?? -1) > now;
  const buff = (ctx: RuntimeContext, id: string, targets: string[], duration: number, modifiers: CombatBuff['modifiers'], group = id) => {
    if (targets.length) ctx.addBuff({ id: `${id}:${ctx.timeMs}`, targetIds: targets, startMs: ctx.timeMs, durationMs: duration, modifiers, stacking: 'replace', group });
  };
  const others = (id: string) => party.filter(other => other !== id);
  const scalers = (actor: ResolvedLoadout, key: 'A' | 'E' | 'Q') => content.characters[actor.loadout.character].skills[key][String(actor.talents[key === 'A' ? 'normal' : key === 'E' ? 'skill' : 'burst'])];
  const sampleCount = (ctx: RuntimeContext, base: number, extraChance: number) => team.mode === 'random' ? base + Number(ctx.random() < extraChance) : base + extraChance;
  const endHutao = (ctx: RuntimeContext, actor: ResolvedLoadout) => {
    const id = actor.loadout.id;
    if (!until(`${id}:papilio`, ctx.timeMs) && (timers.get(`${id}:papilio`) ?? -1) !== ctx.timeMs) return;
    timers.set(`${id}:papilio`, -1);
    if (actor.loadout.ascension >= 1) buff(ctx, `${id}:A1`, others(id), 8000, { critRate: 0.12 });
    ctx.log('status', 'papilio-end', id);
  };
  const endRaiden = (ctx: RuntimeContext, actor: ResolvedLoadout) => {
    const id = actor.loadout.id;
    if ((timers.get(`${id}:musou`) ?? -1) < ctx.timeMs) return;
    timers.set(`${id}:musou`, -1);
    if (actor.loadout.constellation >= 4) buff(ctx, `${id}:C4`, others(id), 10000, { attackPercent: 0.3 });
  };
  function bloodBlossom(ctx: RuntimeContext, actor: ResolvedLoadout) {
    const id = actor.loadout.id;
    const existing = marks.get(id);
    const flat = actor.loadout.constellation >= 2 ? ctx.panel(id).maxHp * 0.1 : 0;
    if (existing && existing.end >= ctx.timeMs) { existing.end = ctx.timeMs + 8000; existing.flat = flat; return; }
    const mark = { end: ctx.timeMs + 8000, next: ctx.timeMs + 4000, flat }; marks.set(id, mark);
    const tick = () => {
      if (marks.get(id) !== mark || ctx.timeMs > mark.end) return;
      ctx.hit(id, skillId(id, 'E.proc'), { ...hit('pyro', scalers(actor, 'E')[2], 'skill', 1, 'blossom'), flatDamage: mark.flat }, `blossom:${id}:${ctx.timeMs}`, 'summon');
      mark.next = ctx.timeMs + 4000;
      ctx.schedule(mark.next, tick);
    };
    ctx.schedule(mark.next, tick);
  }
  function orbitals(ctx: RuntimeContext, actor: ResolvedLoadout, duration: number) {
    const id = actor.loadout.id, end = ctx.timeMs + duration;
    timers.set(`${id}:orbitals`, end);
    const newContact = !until(`${id}:contact-active`, ctx.timeMs);
    const generation = (counters.get(`${id}:contact-generation`) ?? 0) + Number(newContact);
    if (newContact) counters.set(`${id}:contact-generation`, generation);
    const apply = () => {
      if (counters.get(`${id}:contact-generation`) !== generation || !until(`${id}:orbitals`, ctx.timeMs)) return;
      ctx.hit(id, skillId(id, 'orbital'), { ...hit('hydro', 0, 'skill', 1, 'orbitals'), applicationOnly: true }, `orbitals:${ctx.timeMs}`, 'summon');
      ctx.schedule(ctx.timeMs + 2250, apply);
    };
    // Recasts refresh duration, not the existing 2.25s contact timer.
    if (newContact) { timers.set(`${id}:contact-active`, end); apply(); }
    else timers.set(`${id}:contact-active`, end);
    ctx.schedule(end, () => {
      if (timers.get(`${id}:orbitals`) !== end) return;
      if (actor.loadout.ascension >= 1) ctx.heal(ctx.onField, ctx.panel(id).maxHp * 0.06 * (actor.loadout.constellation >= 1 ? 4 : 3) * (1 + ctx.panel(id).healingBonus), `${id}:rain-heal`);
    }, -20);
  }
  return {
    initialize(ctx) {
      for (const actor of loadouts) {
        ctx.log('status', 'content-profile', actor.loadout.id, { character: actor.loadout.character, constellation: actor.loadout.constellation });
      }
    },
    modifyPanel(ctx, id, panel) {
      const actor = actors.get(id)!, rank = actor.loadout.weapon.refinement - 1, hp = ctx.health.get(id).ratio;
      const base = actor.baseStats;
      if (actor.loadout.weapon.id === 'harbinger-of-dawn' && hp > 0.9) panel.critRate += 0.14 + rank * 0.035;
      if (actor.loadout.weapon.id === 'staff-of-homa') panel.attack += panel.maxHp * (0.008 + rank * 0.002 + (hp < 0.5 ? 0.01 + rank * 0.002 : 0));
      if (actor.loadout.weapon.id === 'engulfing-lightning') panel.attack += (base.characterBaseAttack + base.weaponBaseAttack)
        * Math.max(0, Math.min((panel.energyRecharge - 1) * (0.28 + rank * 0.07), 0.8 + rank * 0.1));
      if ((actor.sets.emblem ?? 0) >= 4) panel.categoryBonuses.burst = (panel.categoryBonuses.burst ?? 0) + Math.min(0.75, panel.energyRecharge * 0.25);
      if (actor.loadout.character === 'xingqiu' && actor.loadout.ascension >= 4) panel.damageBonuses.hydro = (panel.damageBonuses.hydro ?? 0) + 0.2;
      if (actor.loadout.character === 'hutao') {
        if (until(`${id}:papilio`, ctx.timeMs)) panel.attack += conversion.get(id) ?? 0;
        if (actor.loadout.ascension >= 4 && hp <= 0.5) panel.damageBonuses.pyro = (panel.damageBonuses.pyro ?? 0) + 0.33;
        if (until(`${id}:C6`, ctx.timeMs)) panel.critRate += 1;
      }
      if (actor.loadout.character === 'raiden' && actor.loadout.ascension >= 4) panel.damageBonuses.electro = (panel.damageBonuses.electro ?? 0) + Math.max(0, panel.energyRecharge - 1) * 0.4;
      panel.critRate = Math.min(1, panel.critRate);
      return gear.panel(ctx, id, panel);
    },
    prepareSkill(ctx, skill, commandId) {
      const meta = metadata.get(skill.id)!, actor = actors.get(meta.owner)!, id = meta.owner, role = actor.loadout.character;
      let action = meta.action;
      if (action === 'N') {
        const next = (comboTime.get(id) ?? -Infinity) + 2000 >= ctx.timeMs ? combo.get(id) ?? 0 : 0;
        action = `N${next % layouts[role].length + 1}`;
      }
      const normal = /^N\d$/.test(action), musou = role === 'raiden' && until(`${id}:musou`, ctx.timeMs);
      const A = musou ? scalers(actor, 'Q') : scalers(actor, 'A');
      let values: number[] = [], times: number[] = [], element: RuntimeHit['element'] = 'physical';
      let category: RuntimeHit['category'] = skill.actionCategory, gauge: 0 | 1 | 2 = 0;
      if (normal) {
        const index = Number(action[1]) - 1;
        const indexes = musou ? [[4], [5], [6], [7, 8], [9]][index] : layouts[role][index];
        if (!indexes) throw new Error(`不支持的普攻段: ${role}.${action}`);
        const timing = musou ? burstNormalTiming : normalTiming[role];
        values = indexes.map(i => A[i]); times = timing.hits[index].map(frames); skill.actionLockMs = frames(timing.locks[index]);
      } else if (action === 'C') {
        const indexes = musou ? [10, 11] : { jean: [5], xingqiu: [7, 8], hutao: [7], albedo: [5, 6], raiden: [6] }[role];
        values = indexes.map(i => A[i]);
        times = role === 'xingqiu' ? [frames(8), frames(20)] : role === 'albedo' ? [frames(20), frames(20)] : musou ? [frames(24), frames(32)] : values.map((_, i) => skill.hitDelayMs + i * frames(8));
        if (musou) skill.actionLockMs = frames(61);
        if (role === 'hutao' && until(`${id}:papilio`, ctx.timeMs)) { times = [frames(3)]; skill.actionLockMs = frames(46); }
      } else if (action === 'PL' || action === 'PH') {
        values = [A.at(action === 'PL' ? -2 : -1)!];
        if (musou) values = [A[action === 'PL' ? 14 : 15]];
        times = [0]; skill.actionLockMs = 500;
      }
      if (role === 'hutao' && until(`${id}:papilio`, ctx.timeMs) && ['normal', 'charged', 'plunge'].includes(category!)) { element = 'pyro'; gauge = 1; }
      if (musou && values.length) { element = 'electro'; gauge = 1; category = 'burst'; values = values.map(value => value + (conversion.get(`${id}:resolve`) ?? 0) * scalers(actor, 'Q')[2]); }
      for (const source of loadouts) if (source.loadout.character === 'jean' && until(`${source.loadout.id}:speed`, ctx.timeMs) && normal) {
        skill.actionLockMs = Math.round(skill.actionLockMs / 1.15); times = times.map(time => Math.round(time / 1.15)); break;
      }
      const command = commands.get(commandId);
      if (role === 'jean' && action === 'E' && command?.type === 'cast') { skill.hitDelayMs += command.holdMs ?? 0; skill.actionLockMs += command.holdMs ?? 0; }
      actionParts.set(commandId, { values, times, element, category, gauge, snapshot: role === 'hutao' && action === 'Q' });
      return skill;
    },
    rejectCast(ctx, skill) { updateStamina(ctx.timeMs); return staminaCost(ctx, skill) > stamina ? 'stamina' : undefined; },
    onCast(ctx, skill, commandId) {
      gear.cast(ctx, skill);
      const { owner: id, action } = metadata.get(skill.id)!, actor = actors.get(id)!, role = actor.loadout.character;
      const E = scalers(actor, 'E'), Q = scalers(actor, 'Q');
      const pieces = actionParts.get(commandId)!;
      updateStamina(ctx.timeMs);
      const cost = staminaCost(ctx, skill);
      if (cost) { stamina -= cost; regenAt = ctx.timeMs + 1500; ctx.log('status', 'stamina', id, { cost, after: stamina }); }
      if (skill.actionCategory === 'normal') { combo.set(id, (/^N\d$/.test(action) ? Number(action[1]) : (combo.get(id) ?? 0) + 1) % layouts[role].length); comboTime.set(id, ctx.timeMs); }
      else combo.delete(id);
      for (const raiden of loadouts.filter(a => a.loadout.character === 'raiden')) if (action === 'Q' && raiden.loadout.id !== id) {
        const rid = raiden.loadout.id, bonus = raiden.loadout.constellation >= 1 ? (actor.element === 'electro' ? 1.8 : 1.2) : 1;
        counters.set(`${rid}:resolve`, Math.min(60, (counters.get(`${rid}:resolve`) ?? 0) + skill.energyCost * scalers(raiden, 'Q')[3] * bonus));
      }
      const emit = (delay: number, value: RuntimeHit, suffix = '', snapshot?: CombatPanel) => ctx.schedule(ctx.timeMs + delay,
        () => ctx.hit(id, skill.id, value, `${commandId}${suffix}`, 'direct', snapshot));
      if (pieces.values.length) {
        pieces.values.forEach((value, i) => emit(pieces.times[i], { ...hit(pieces.element, value, pieces.category, pieces.gauge,
          pieces.category === 'charged' && role === 'hutao' ? 'charged' : 'normal'),
          icdRule: role === 'hutao' && pieces.category === 'charged' ? 'none' : pieces.gauge ? 'standard' : 'none', blunt: skill.actionCategory === 'plunge',
        }, `:${i}`));
        return true;
      }
      if (action === 'E') {
        if (role === 'hutao') {
          conversion.set(id, Math.min(ctx.panel(id).maxHp * E[1], 4 * (actor.baseStats.characterBaseAttack + actor.baseStats.weaponBaseAttack)));
          timers.set(`${id}:papilio`, ctx.timeMs + 9000); ctx.loseHp(id, ctx.health.get(id).current * 0.3, `${id}:E`);
          if (actor.loadout.constellation >= 6 && ctx.health.get(id).ratio < 0.25 && !until(`${id}:C6cd`, ctx.timeMs)) {
            timers.set(`${id}:C6`, ctx.timeMs + 10000); timers.set(`${id}:C6cd`, ctx.timeMs + 60000); ctx.log('status', 'hutao-C6', id);
          }
          const end = ctx.timeMs + 9000;
          ctx.schedule(end, () => { if (timers.get(`${id}:papilio`) === end) endHutao(ctx, actor); }, -20);
        } else if (role === 'xingqiu') {
          emit(frames(12), { ...hit('hydro', E[0], 'skill', 1, 'skill'), icdRule: 'none' }, ':0');
          emit(frames(31), { ...hit('hydro', E[1], 'skill', 1, 'skill'), icdRule: 'none' }, ':1');
          orbitals(ctx, actor, 15000);
        } else {
          const element = actor.element as RuntimeHit['element'];
          const hold = commands.get(commandId);
          const bonus = role === 'jean' && actor.loadout.constellation >= 1 && hold?.type === 'cast' && (hold.holdMs ?? 0) >= 1000 ? 0.4 : 0;
          const saved = role === 'albedo' ? ctx.panel(id) : undefined;
          if (saved) flowerPanels.set(id, saved);
          emit(skill.hitDelayMs, { ...hit(element, E[0], 'skill', role === 'jean' ? 2 : 1, 'skill'), icdRule: role === 'raiden' ? 'standard' : 'none', damageBonus: bonus }, '', saved);
          if (role === 'albedo' || role === 'raiden') {
            const proc = ctx.skill(skillId(id, 'E.proc'));
            ctx.schedule(ctx.timeMs + skill.hitDelayMs, () => ctx.spawn(id, proc, {
              slot: 'skill-field', lifetimeMs: Math.round(E[2] * 1000),
              hit: { ...hit(element, E[1], 'skill', 1, `${role}-proc`), scaling: role === 'albedo' ? 'defense' : 'attack' },
              trigger: { type: 'coordinated', cooldownMs: role === 'albedo' ? 2000 : 900, delayMs: 20, allowSummonHits: true },
            }, saved));
          }
        }
      } else if (action === 'Q') {
        if (role === 'xingqiu') {
          const duration = actor.loadout.constellation >= 2 ? 18000 : 15000;
          timers.set(`${id}:rain`, ctx.timeMs + duration); counters.set(`${id}:wave`, 0); orbitals(ctx, actor, duration);
          ctx.spawn(id, ctx.skill(skillId(id, 'Q.proc')), { slot: 'rain', lifetimeMs: duration,
            hit: hit('hydro', Q[0], 'burst', 1, 'rain'),
            trigger: { type: 'coordinated', condition: 'normal-attack', cooldownMs: 1000, delayMs: 20 },
          });
        } else if (role === 'jean') {
          const saved = ctx.panel(id), fieldStart = ctx.timeMs + skill.hitDelayMs, end = fieldStart + 10000;
          emit(skill.hitDelayMs, { ...hit('anemo', Q[0], 'burst', 2, 'burst'), icdRule: 'none' });
          emit(skill.hitDelayMs + 1, { ...hit('anemo', Q[1], 'burst', 1, 'field'), icdRule: 'none' }, ':entry');
          ctx.schedule(fieldStart, () => {
            timers.set(`${id}:field`, end);
            for (const target of party) ctx.heal(target, (saved.attack * Q[2] + Q[3]) * (1 + saved.healingBonus), `${id}:Q`);
            if (actor.loadout.ascension >= 4) ctx.restoreEnergy(id, 16, `${id}:A4`);
            if (actor.loadout.constellation >= 4) ctx.addEnemyDebuff({ id: `${id}:C4`, startMs: ctx.timeMs, durationMs: 10000, resistanceReduction: 0.4, defenseReduction: 0, elements: ['anemo'] });
            if (actor.loadout.constellation >= 6) ctx.log('status', 'jean-C6-field-damage-reduction', id, { reduction: 0.35, end });
          });
          for (let i = 1; i <= 10; i++) ctx.schedule(fieldStart + i * 1000, () => ctx.heal(ctx.onField,
            (saved.attack * Q[4] + Q[5]) * (1 + saved.healingBonus), `${id}:Q-tick`));
          ctx.schedule(end, () => ctx.hit(id, skill.id, { ...hit('anemo', Q[1], 'burst', 1, 'field'), icdRule: 'none' }, `${commandId}:exit`, 'summon'));
        } else if (role === 'hutao') {
          const saved = ctx.panel(id);
          ctx.schedule(ctx.timeMs + skill.hitDelayMs, () => {
            const low = ctx.health.get(id).ratio <= 0.5;
            ctx.hit(id, skill.id, { ...hit('pyro', Q[low ? 1 : 0], 'burst', 2, 'burst'), icdRule: 'none' }, commandId, 'direct', saved);
            ctx.heal(id, ctx.panel(id).maxHp * Q[low ? 3 : 2] * (1 + saved.healingBonus), `${id}:Q-heal`);
            if (actor.loadout.constellation >= 2) bloodBlossom(ctx, actor);
          });
        } else if (role === 'albedo') {
          const stacks = until(`${id}:reckoning`, ctx.timeMs) ? counters.get(`${id}:reckoning`) ?? 0 : 0;
          const saved = ctx.panel(id), flat = actor.loadout.constellation >= 2 ? saved.defense * 0.3 * stacks : 0;
          counters.set(`${id}:reckoning`, 0);
          emit(skill.hitDelayMs, { ...hit('geo', Q[0], 'burst', 1, 'burst'), flatDamage: flat, icdRule: 'none' }, '', saved);
          if (ctx.hasSummon(id, 'skill-field')) for (let i = 0; i < (team.enemy.fatalBlossomHits ?? 0); i++) emit(frames(145),
            { ...hit('geo', Q[1], 'burst', 1, 'fatal'), flatDamage: flat }, `:fatal-${i}`, flowerPanels.get(id) ?? saved);
          if (actor.loadout.ascension >= 4) buff(ctx, `${id}:A4`, party, 10000, { elementalMastery: 125 });
        } else if (role === 'raiden') {
          const stacks = counters.get(`${id}:resolve`) ?? 0; conversion.set(`${id}:resolve`, stacks); counters.set(`${id}:resolve`, 0);
          emit(skill.hitDelayMs, { ...hit('electro', Q[0] + stacks * Q[1], 'burst', 2, 'burst'), icdRule: 'none', defenseIgnore: actor.loadout.constellation >= 2 ? 0.6 : 0 });
          const start = ctx.timeMs + skill.actionLockMs, end = start + 7000;
          ctx.schedule(start, () => { timers.set(`${id}:musou`, end); counters.set(`${id}:restores`, 0); timers.set(`${id}:restoreCd`, -1); });
          ctx.schedule(end, () => { if (timers.get(`${id}:musou`) === end) endRaiden(ctx, actor); }, -20);
        }
      }
      return true;
    },
    prepareHit(ctx, id, skill, value) {
      const actor = actors.get(id)!, action = metadata.get(skill)?.action, role = actor.loadout.character;
      if (role === 'xingqiu' && action === 'E' && actor.loadout.constellation >= 4 && until(`${id}:rain`, ctx.timeMs)) value.multiplier *= 1.5;
      if (role === 'albedo' && action === 'E.proc' && actor.loadout.ascension >= 1 && team.enemy.hpRatio < 0.5) value.damageBonus = (value.damageBonus ?? 0) + 0.25;
      if (role === 'raiden' && actor.loadout.constellation >= 2 && (value.category === 'burst' || until(`${id}:musou`, ctx.timeMs))) value.defenseIgnore = 0.6;
      for (const source of loadouts) {
        const sid = source.loadout.id;
        if (source.loadout.character === 'raiden' && ctx.hasSummon(sid, 'skill-field') && value.category === 'burst') value.damageBonus = (value.damageBonus ?? 0) + actor.energyCapacity * scalers(source, 'E')[3];
        if (source.loadout.character === 'albedo' && ctx.hasSummon(sid, 'skill-field')) {
          if (source.loadout.constellation >= 4 && value.category === 'plunge') value.damageBonus = (value.damageBonus ?? 0) + 0.3;
          if (source.loadout.constellation >= 6 && ctx.onField === id && until('crystal-shield', ctx.timeMs)) value.damageBonus = (value.damageBonus ?? 0) + 0.17;
        }
      }
      return gear.hit(id, value);
    },
    onHit(ctx, event, value) {
      gear.afterHit(ctx, event, value);
      if (event.source === 'reaction' || event.damage <= 0) return;
      const actor = actors.get(event.actorId)!, id = event.actorId, action = metadata.get(event.skillId)?.action, role = actor.loadout.character;
      if (role === 'jean') {
        if (action === 'E') ctx.particles(`${id}:E-particles`, 'anemo', sampleCount(ctx, 2, 2 / 3), 700);
        if (value.category === 'normal' && actor.loadout.ascension >= 1) {
          const factor = team.mode === 'random' ? Number(ctx.random() < 0.5) * 0.15 : 0.075;
          for (const target of party) ctx.heal(target, ctx.panel(id).attack * factor * (1 + ctx.panel(id).healingBonus), `${id}:A1`);
        }
      }
      if (role === 'xingqiu' && action === 'E' && event.id.endsWith(':1')) ctx.particles(`${id}:E-particles`, 'hydro', 5, 700);
      if (role === 'xingqiu' && action === 'Q.proc' && actor.loadout.constellation >= 2) ctx.addEnemyDebuff({ id: `${id}:C2`, startMs: ctx.timeMs, durationMs: 4000, resistanceReduction: 0.15, defenseReduction: 0, elements: ['hydro'] });
      if (role === 'hutao' && until(`${id}:papilio`, ctx.timeMs) && (value.category === 'normal' || value.category === 'charged')) {
        if (!until(`${id}:particles`, ctx.timeMs)) { timers.set(`${id}:particles`, ctx.timeMs + 5000); ctx.particles(`${id}:E-particles`, 'pyro', sampleCount(ctx, 2, 0.4), 700); }
        if (value.category === 'charged') bloodBlossom(ctx, actor);
      }
      if (role === 'albedo' && action === 'E.proc') {
        ctx.particles(`${id}:E-particles`, 'geo', sampleCount(ctx, 0, 2 / 3), 700);
        if (actor.loadout.constellation >= 1) ctx.restoreEnergy(id, 1.2, `${id}:C1`);
        if (actor.loadout.constellation >= 2) { counters.set(`${id}:reckoning`, Math.min(4, until(`${id}:reckoning`, ctx.timeMs) ? (counters.get(`${id}:reckoning`) ?? 0) + 1 : 1)); timers.set(`${id}:reckoning`, ctx.timeMs + 30000); }
      }
      if (role === 'raiden') {
        if (action === 'E.proc') ctx.particles(`${id}:E-particles`, 'electro', sampleCount(ctx, 0, 0.5), 700);
        if (until(`${id}:musou`, ctx.timeMs) && action !== 'Q' && value.category === 'burst' && !until(`${id}:restoreCd`, ctx.timeMs) && (counters.get(`${id}:restores`) ?? 0) < 5) {
          timers.set(`${id}:restoreCd`, ctx.timeMs + 1000); counters.set(`${id}:restores`, (counters.get(`${id}:restores`) ?? 0) + 1);
          const restore = scalers(actor, 'Q')[16] * (actor.loadout.ascension >= 4 ? 1 + Math.max(0, ctx.panel(id).energyRecharge - 1) * 0.6 : 1);
          for (const target of party) ctx.restoreEnergy(target, restore, `${id}:Q-restore`);
          if (actor.loadout.constellation >= 6) for (const target of others(id)) {
            ctx.reduceCooldown(skillId(target, 'Q'), 1000); ctx.log('status', 'raiden-C6-cooldown', target, { reducedMs: 1000 });
          }
        }
      }
    },
    canTriggerSummon(_ctx, instance, event, value) {
      const owner = actors.get(instance.ownerId)!;
      return !(owner.loadout.character === 'albedo' && event.actorId === instance.ownerId && value.category === 'burst');
    },
    onSummonTrigger(ctx, instance, triggerId) {
      const actor = actors.get(instance.ownerId)!, id = actor.loadout.id;
      if (actor.loadout.character !== 'xingqiu') return false;
      const wave = counters.get(`${id}:wave`) ?? 0; counters.set(`${id}:wave`, wave + 1);
      const count = actor.loadout.constellation >= 6 ? [2, 3, 5][wave % 3] : [2, 3][wave % 2];
      const saved = ctx.panel(id);
      for (let i = 0; i < count; i++) ctx.hit(id, instance.skillId, instance.definition.hit, `rain:${triggerId}:${i}`, 'summon', saved);
      if (actor.loadout.constellation >= 6 && wave % 3 === 2) ctx.restoreEnergy(id, 3, `${id}:C6`);
      return true;
    },
    onSwitch(ctx, previous) {
      combo.delete(previous);
      const actor = actors.get(previous)!;
      if (actor.loadout.character === 'hutao') endHutao(ctx, actor);
      if (actor.loadout.character === 'raiden') endRaiden(ctx, actor);
    },
    onEnergy(ctx, actorId) {
      const actor = actors.get(actorId)!;
      if (actor.loadout.character === 'jean' && actor.loadout.constellation >= 2 && ctx.onField === actorId) timers.set(`${actorId}:speed`, ctx.timeMs + 15000);
      for (const source of loadouts) if (source.loadout.character === 'raiden' && source.loadout.ascension >= 1 && !until(`${source.loadout.id}:resolveCd`, ctx.timeMs)) {
        timers.set(`${source.loadout.id}:resolveCd`, ctx.timeMs + 3000); counters.set(`${source.loadout.id}:resolve`, Math.min(60, (counters.get(`${source.loadout.id}:resolve`) ?? 0) + 2));
      }
    },
    onReaction(ctx, _actorId, reaction) {
      if (reaction.reaction === 'crystallize' && team.enemy.collectCrystallizeShards) timers.set('crystal-shield', ctx.timeMs + 15000);
    },
  };
}
