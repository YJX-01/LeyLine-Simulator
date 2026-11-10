import type { RuntimeContext } from './combat-runtime';
import type { ResolvedLoadout } from './loadout';
import { hit, talentScalers } from './team-profile';

/** Per-simulation periodic character effects; refreshes preserve their existing cadence. */
export function createTeamEffects(
  skillId: (owner: string, action: string) => string,
  timers: Map<string, number>, counters: Map<string, number>,
) {
  const marks = new Map<string, { end: number; next: number; flat: number }>();
  const until = (key: string, now: number) => (timers.get(key) ?? -1) > now;
  function bloodBlossom(ctx: RuntimeContext, actor: ResolvedLoadout) {
    const id = actor.loadout.id;
    const existing = marks.get(id);
    const flat = actor.loadout.constellation >= 2 ? ctx.panel(id).maxHp * 0.1 : 0;
    if (existing && existing.end >= ctx.timeMs) { existing.end = ctx.timeMs + 8000; existing.flat = flat; return; }
    const mark = { end: ctx.timeMs + 8000, next: ctx.timeMs + 4000, flat }; marks.set(id, mark);
    const tick = () => {
      if (marks.get(id) !== mark || ctx.timeMs > mark.end) return;
      ctx.hit(id, skillId(id, 'E.proc'), { ...hit('pyro', talentScalers(actor, 'E')[2], 'skill', 1, 'blossom'), flatDamage: mark.flat }, `blossom:${id}:${ctx.timeMs}`, 'summon');
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
  return { bloodBlossom, orbitals };
}
