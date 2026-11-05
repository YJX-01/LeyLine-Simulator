import type { CombatSkill, CombatHitEvent } from '@leyline/schema';
import type { ResolvedLoadout } from './loadout';
import type { RuntimeContext, RuntimeHit } from './combat-runtime';
import type { CombatPanel } from './mechanics/buff-store';

export function createGearRuntime(loadouts: ResolvedLoadout[], skillId: (id: string, action: string) => string) {
  const actors = new Map(loadouts.map(actor => [actor.loadout.id, actor]));
  const timers = new Map<string, number>(), stacks = new Map<string, number>();
  const active = (id: string, now: number) => (timers.get(id) ?? -1) > now;
  return {
    panel(ctx: RuntimeContext, id: string, panel: CombatPanel) {
      const actor = actors.get(id)!, rank = actor.loadout.weapon.refinement - 1, hp = ctx.health.get(id).ratio;
      const base = actor.baseStats;
      if (actor.loadout.weapon.id === 'harbinger-of-dawn' && hp > 0.9) panel.critRate += 0.14 + rank * 0.035;
      if (actor.loadout.weapon.id === 'staff-of-homa') panel.attack += panel.maxHp * (0.008 + rank * 0.002 + (hp < 0.5 ? 0.01 + rank * 0.002 : 0));
      if (actor.loadout.weapon.id === 'engulfing-lightning') panel.attack += (base.characterBaseAttack + base.weaponBaseAttack)
        * Math.max(0, Math.min((panel.energyRecharge - 1) * (0.28 + rank * 0.07), 0.8 + rank * 0.1));
      if ((actor.sets.emblem ?? 0) >= 4) panel.categoryBonuses.burst = (panel.categoryBonuses.burst ?? 0) + Math.min(0.75, panel.energyRecharge * 0.25);
      if (active(`${id}:shimenawa`, ctx.timeMs)) for (const category of ['normal', 'charged', 'plunge']) panel.categoryBonuses[category] = (panel.categoryBonuses[category] ?? 0) + 0.5;
      if (active(`${id}:starglitter`, ctx.timeMs)) for (const category of ['normal', 'charged']) panel.categoryBonuses[category] = (panel.categoryBonuses[category] ?? 0)
        + (stacks.get(id) ?? 0) * (0.08 + (actor.loadout.weapon.refinement - 1) * 0.02);
      return panel;
    },
    hit(id: string, value: RuntimeHit) {
      const actor = actors.get(id)!;
      if (actor.loadout.weapon.id === 'festering-desire' && value.category === 'skill') value.critRateBonus = (value.critRateBonus ?? 0) + 0.06 + (actor.loadout.weapon.refinement - 1) * 0.015;
      return value;
    },
    cast(ctx: RuntimeContext, skill: CombatSkill) {
      const actor = actors.get(skill.ownerId)!, id = skill.ownerId, rank = actor.loadout.weapon.refinement - 1;
      const add = (name: string, targets: string[], durationMs: number, modifiers: Parameters<RuntimeContext['addBuff']>[0]['modifiers'], group = name) => ctx.addBuff({
        id: `${id}:${name}:${ctx.timeMs}`, group, stacking: 'replace', targetIds: targets, startMs: ctx.timeMs, durationMs, modifiers,
      });
      if (skill.actionCategory === 'burst' && skill.id === skillId(id, 'Q')) {
        if ((actor.sets.noblesse ?? 0) >= 4) add('noblesse', loadouts.map(a => a.loadout.id), 12000, { attackPercent: 0.2 }, 'noblesse');
        if (actor.loadout.weapon.id === 'engulfing-lightning') add('engulfing', [id], 12000, { energyRecharge: 0.3 + rank * 0.05 });
      }
      if (skill.id !== skillId(id, 'E')) return;
      if ((actor.sets.shimenawa ?? 0) >= 4 && !active(`${id}:shimenawa`, ctx.timeMs) && ctx.energy.get(id) >= 15) {
        const before = ctx.energy.get(id); ctx.energy.spend(id, 15); timers.set(`${id}:shimenawa`, ctx.timeMs + 10000);
        ctx.log('energy', `${id}:shimenawa`, id, { before, after: ctx.energy.get(id), spent: 15, pickupType: 'cost' });
      }
      if (actor.loadout.weapon.id === 'prototype-starglitter') {
        stacks.set(id, active(`${id}:starglitter`, ctx.timeMs) ? Math.min(2, (stacks.get(id) ?? 0) + 1) : 1);
        timers.set(`${id}:starglitter`, ctx.timeMs + 12000);
      }
    },
    afterHit(ctx: RuntimeContext, event: CombatHitEvent, value: RuntimeHit) {
      if (event.source === 'reaction' || event.damage <= 0 || ctx.onField !== event.actorId) return;
      const actor = actors.get(event.actorId)!, id = event.actorId, weapon = actor.loadout.weapon.id, rank = actor.loadout.weapon.refinement - 1;
      if (weapon === 'sacrificial-sword' && value.category === 'skill' && !active(`${id}:sacrificial`, ctx.timeMs)) {
        if (ctx.random() < 0.4 + rank * 0.1) {
          timers.set(`${id}:sacrificial`, ctx.timeMs + 30000 - rank * 3500);
          ctx.resetCooldown(skillId(id, 'E')); ctx.log('status', 'sacrificial-proc', id, { reset: skillId(id, 'E') });
        }
      }
      if (weapon === 'favonius-sword' && !active(`${id}:favonius`, ctx.timeMs)) {
        const critical = event.critical ?? (ctx.random() < Math.min(1, ctx.panel(id).critRate + (value.critRateBonus ?? 0)));
        if (critical && ctx.random() < 0.6 + rank * 0.1) {
          timers.set(`${id}:favonius`, ctx.timeMs + 12000 - rank * 1500);
          ctx.particles(`${id}:favonius`, 'clear', 3, 700); ctx.log('status', 'favonius-proc', id);
        }
      }
    },
  };
}
