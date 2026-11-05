import { describe, expect, it } from 'vitest';
import { combatSchema, type CombatInput, type CombatHitEvent } from '@leyline/schema';
import { simulateCombat } from './combat';
import scenario from '../../../fixtures/scenarios/combat-stage-3.json';
import expected from '../../../fixtures/expected/combat-stage-3.json';

const fresh = () => combatSchema.parse(structuredClone(scenario));
const hitEvents = (input: CombatInput) => simulateCombat(input).events.filter((e): e is CombatHitEvent => e.type === 'hit');
function simple(): CombatInput {
  const config = fresh();
  config.actors = [config.actors[0]];
  config.actors[0].initialEnergy = 6;
  config.buffs = []; config.pickups = [];
  config.skills = [config.skills[2]];
  config.skills[0].energyCost = 0;
  config.skills[0].actionLockMs = 0;
  config.skills[0].cooldownMs = 0;
  config.commands = [{ type: 'cast', id: 'first', timeMs: 0, skillId: 'burst' }];
  return config;
}

describe('unified combat integration', () => {
  it('matches the independently calculated stage-3 scenario', () => {
    const result = simulateCombat(scenario);
    expect(result.totalDamage).toBe(expected.totalDamage);
    expect(result.dps).toBe(expected.dps);
    const hits = result.events.filter(e => e.type === 'hit');
    expect(hits.map(e => e.timeMs)).toEqual(expected.hitTimesMs);
    expect(hits.map(e => e.damage)).toEqual(expected.hitDamage);
    expect(hits.flatMap(e => e.reaction ? [e.reaction] : [])).toEqual(expected.reactions);
    expect(result.damageByActor).toEqual(expected.damageByActor);
    for (const [id, value] of Object.entries(expected.finalEnergy)) expect(result.finalEnergy[id]).toBeCloseTo(value);
    expect(result.finalOnField).toBe(expected.finalOnField);
    expect(result.events).toHaveLength(expected.events);
    expect(result.finalAura?.units).toBeCloseTo(0.1736842105263158);
    expect(result.events.filter(e => e.type === 'energy' && e.actorId === 'pyro')[0]).toMatchObject({ details: { overflow: 1.1999999999999993 } });
  });
  it('distinguishes snapshot and dynamic panels while direct bonuses remain live', () => {
    const config = fresh();
    config.skills[0].snapshot = false;
    expect(simulateCombat(config).totalDamage).toBe(expected.dynamicTotalDamage);
    const hits = hitEvents(fresh());
    expect(hits[0]).toMatchObject({ snapshot: true, calculation: { baseDamage: 1500 } });
    expect(hits[2]).toMatchObject({ snapshot: true, calculation: { bonusMultiplier: 1.2 } });
    expect(hits[4].calculation.bonusMultiplier).toBe(1);
  });
  it('uses current enemy debuffs even for a snapshotted delayed attack', () => {
    const config = simple();
    config.skills[0].snapshot = true;
    config.skills[0].hitDelayMs = 1000;
    config.enemy.resistances = { physical: 0.1 };
    config.enemyDebuffs = [{ id: 'shred', startMs: 500, durationMs: 501, resistanceReduction: 0.3, defenseReduction: 0 }];
    expect(simulateCombat(config).totalDamage).toBeCloseTo(1100);
    config.enemyDebuffs[0].durationMs = 500;
    expect(simulateCombat(config).totalDamage).toBeCloseTo(900);
  });
  it('captures panel buffs at cast, not at delayed hit or summon creation', () => {
    const config = simple();
    config.skills[0].snapshot = true;
    config.skills[0].hitDelayMs = 1000;
    config.buffs = [
      { id: 'panel', targetIds: ['pyro'], startMs: 0, durationMs: 1, stacking: 'add', group: 'atk', modifiers: { attackPercent: 1 } },
      { id: 'direct', targetIds: ['pyro'], startMs: 500, durationMs: 1000, stacking: 'add', group: 'direct', modifiers: { directDamageBonus: 0.5 } },
    ];
    expect(simulateCombat(config).totalDamage).toBe(3000);
    config.skills[0].snapshot = false;
    expect(simulateCombat(config).totalDamage).toBe(1500);
  });
  it('keeps damage when ICD blocks application and amplification', () => {
    const config = simple();
    config.skills[0].effect = { type: 'hit', hit: { element: 'pyro', multiplier: 1, gauge: 1, icdTag: 'normal', icdRule: 'standard' } };
    const auraSkill = structuredClone(config.skills[0]);
    auraSkill.id = 'aura';
    auraSkill.effect = { type: 'hit', hit: { element: 'hydro', multiplier: 0, gauge: 4, icdTag: 'aura', icdRule: 'none' } };
    config.skills.push(auraSkill);
    config.commands = [{ type: 'cast', id: 'aura', timeMs: 0, skillId: 'aura' },
      ...[1, 2, 3, 4].map(timeMs => ({ type: 'cast' as const, id: String(timeMs), timeMs, skillId: 'burst' }))];
    const hits = hitEvents(config).slice(1);
    expect(hits.map(e => e.damage)).toEqual([1500, 1000, 1000, 1500]);
    expect(hits.map(e => e.applied)).toEqual([true, false, false, true]);
  });
  it('retains summon ownership and snapshot buffs after switching away', () => {
    const hits = hitEvents(fresh());
    expect(hits[2].actorId).toBe('pyro');
    expect(hits[2].buffIds).toContain('attack-window');
    expect(hits[2].source).toBe('summon');
  });
  it('does not consume energy or cooldown when a cast fails', () => {
    const config = simple();
    config.skills[0].energyCost = 6;
    config.skills[0].cooldownMs = 1000;
    config.actors[0].initialEnergy = 0;
    config.pickups = [{ type: 'flat', id: 'restore', timeMs: 1, actorId: 'pyro', amount: 6 }];
    config.commands.push({ type: 'cast', id: 'second', timeMs: 1, skillId: 'burst' });
    const result = simulateCombat(config);
    expect(result.events.filter(e => e.type === 'rejected')).toMatchObject([{ details: { reason: 'energy' } }]);
    expect(result.hits).toBe(1);
    expect(result.finalEnergy.pyro).toBe(0);
  });
  it('generates particles on successful hits, collects after travel, and reads live recharge', () => {
    const config = simple();
    config.actors[0].initialEnergy = 0; config.actors[0].energyCapacity = 80;
    config.skills[0].particlesOnHit = { element: 'pyro', count: 2, travelMs: 200, cooldownMs: 1000 };
    config.buffs = [{ id: 'recharge', targetIds: ['pyro'], startMs: 100, durationMs: 200, stacking: 'add', group: 'er', modifiers: { energyRecharge: 1 } }];
    const result = simulateCombat(config);
    expect(result.finalEnergy.pyro).toBe(18);
    expect(result.events.find(e => e.type === 'energy')).toMatchObject({ timeMs: 200, details: { gained: 18 } });
    config.skills[0].energyCost = 6;
    expect(simulateCombat(config).finalEnergy.pyro).toBe(0);
  });
  it('gates particle generation independently from damage and honors travel beyond the horizon', () => {
    const config = simple();
    config.actors[0].initialEnergy = 0; config.actors[0].energyCapacity = 80;
    config.skills[0].particlesOnHit = { element: 'pyro', count: 1, travelMs: 0, cooldownMs: 1000 };
    config.commands = [0, 500, 1000].map(timeMs => ({ type: 'cast', id: String(timeMs), timeMs, skillId: 'burst' }));
    const result = simulateCombat(config);
    expect(result.hits).toBe(3);
    expect(result.finalEnergy.pyro).toBe(12);
    config.skills[0].particlesOnHit.travelMs = 5000;
    expect(simulateCombat(config).finalEnergy.pyro).toBe(0);
  });
  it('enforces locks, cooldowns, off-field casts and switch cooldown boundaries', () => {
    const config = fresh();
    config.commands = [
      { type: 'cast', id: 'off', timeMs: 0, skillId: 'wave' },
      { type: 'cast', id: 'turret', timeMs: 0, skillId: 'turret' },
      { type: 'switch', id: 'locked', timeMs: 199, actorId: 'hydro' },
      { type: 'switch', id: 'allowed', timeMs: 200, actorId: 'hydro' },
      { type: 'switch', id: 'early', timeMs: 1199, actorId: 'pyro' },
      { type: 'switch', id: 'boundary', timeMs: 1200, actorId: 'pyro' },
    ];
    expect(simulateCombat(config).events.flatMap(e => e.type === 'rejected' ? [e.details.reason] : []))
      .toEqual(['off-field', 'action-lock', 'switch-cooldown']);
  });
  it('honors skill cooldown start delay and exact ready time', () => {
    const config = simple();
    config.skills[0].cooldownMs = 100;
    config.skills[0].cooldownStartDelayMs = 50;
    config.commands.push({ type: 'cast', id: 'early', timeMs: 149, skillId: 'burst' },
      { type: 'cast', id: 'ready', timeMs: 150, skillId: 'burst' });
    const result = simulateCombat(config);
    expect(result.hits).toBe(2);
    expect(result.events.find(e => e.type === 'rejected')).toMatchObject({ id: 'early', details: { reason: 'cooldown' } });
  });
  it('processes particle pickup before same-time switching and casting', () => {
    const config = fresh();
    config.commands = [{ type: 'switch', id: 'switch', timeMs: 0, actorId: 'hydro' }];
    config.pickups = [{ type: 'particle', id: 'collect', timeMs: 0, element: 'hydro', count: 1 }];
    config.buffs = [];
    const result = simulateCombat(config);
    expect(result.finalEnergy.hydro).toBeCloseTo(1.8);
    expect(result.finalEnergy.cryo).toBeCloseTo(0.6);
  });
  it('replaces a summon in the same owner slot and cancels its later ticks', () => {
    const config = simple();
    const turret = fresh().skills[0];
    turret.energyCost = 0; turret.actionLockMs = 0;
    config.skills = [turret];
    config.commands = [{ type: 'cast', id: 'a', timeMs: 0, skillId: 'turret' }, { type: 'cast', id: 'b', timeMs: 1000, skillId: 'turret' }];
    const result = simulateCombat(config);
    expect(result.events.filter(e => e.type === 'hit').map(e => e.timeMs)).toEqual([500, 1500, 2500, 3500]);
    expect(result.events.filter(e => e.type === 'summon-end')).toMatchObject([
      { timeMs: 1000, details: { reason: 'replaced' } }, { timeMs: 4000, details: { reason: 'expired' } },
    ]);
  });
  it('never ticks a summon at its exclusive expiry boundary', () => {
    const config = simple();
    const turret = fresh().skills[0];
    turret.energyCost = 0;
    if (turret.effect.type !== 'summon' || turret.effect.summon.trigger.type !== 'periodic') throw new Error('fixture');
    turret.effect.summon.trigger.firstDelayMs = 0;
    config.skills = [turret]; config.commands = [{ type: 'cast', id: 'a', timeMs: 0, skillId: 'turret' }];
    expect(hitEvents(config).map(e => e.timeMs)).toEqual([0, 1000, 2000]);
  });
  it('coordinates only on direct hits, respects proc cooldown and cancels delayed expired procs', () => {
    const config = simple();
    const turret = fresh().skills[0];
    turret.energyCost = 0; turret.actionLockMs = 0;
    if (turret.effect.type !== 'summon') throw new Error('fixture');
    turret.effect.summon.trigger = { type: 'coordinated', cooldownMs: 1000, delayMs: 20 };
    turret.effect.summon.lifetimeMs = 2000;
    config.skills.push(turret);
    config.commands = [{ type: 'cast', id: 'spawn', timeMs: 0, skillId: 'turret' },
      ...[1, 500, 1001, 1990].map((timeMs, i) => ({ type: 'cast' as const, id: `hit-${i}`, timeMs, skillId: 'burst' }))];
    expect(hitEvents(config).filter(e => e.source === 'summon').map(e => e.timeMs)).toEqual([21, 1021]);
    turret.effect.summon.trigger.cooldownMs = 1;
    expect(hitEvents(config).filter(e => e.source === 'summon').map(e => e.timeMs)).toEqual([21, 520, 1021]);
  });
  it('replaces and refreshes grouped buffs without resurrecting old values', () => {
    const config = simple();
    config.buffs = [
      { id: 'old', targetIds: ['pyro'], startMs: 0, durationMs: 1000, stacking: 'replace', group: 'attack', modifiers: { attackPercent: 1 } },
      { id: 'new', targetIds: ['pyro'], startMs: 500, durationMs: 2000, stacking: 'replace', group: 'attack', modifiers: { attackPercent: 0.5 } },
      { id: 'independent', targetIds: ['pyro'], startMs: 0, durationMs: 500, stacking: 'add', group: 'other', modifiers: { flatAttack: 100 } },
    ];
    config.commands = [0, 500, 1000, 2500].map(timeMs => ({ type: 'cast', id: String(timeMs), timeMs, skillId: 'burst' }));
    expect(hitEvents(config).map(e => e.damage)).toEqual([2100, 1500, 1500, 1000]);
  });
  it('has identical summary totals without detailed log allocations', () => {
    const config = fresh();
    const detailed = simulateCombat(config);
    config.logMode = 'summary'; config.maxLogEvents = 1;
    const summary = simulateCombat(config);
    expect(summary.events).toEqual([]);
    expect(summary.totalDamage).toBe(detailed.totalDamage);
    expect(summary.eventCounts).toEqual(detailed.eventCounts);
    expect(summary.reactionCounts).toEqual(detailed.reactionCounts);
  });
  it('fails instead of silently truncating logs or runaway event chains', () => {
    const config = fresh();
    config.maxLogEvents = 1;
    expect(() => simulateCombat(config)).toThrow('log budget exceeded');
    config.logMode = 'summary'; config.durationMs = 30000;
    const skill = config.skills[0];
    if (skill.effect.type !== 'summon' || skill.effect.summon.trigger.type !== 'periodic') throw new Error('fixture');
    skill.effect.summon.lifetimeMs = 30000;
    skill.effect.summon.trigger.intervalMs = 1;
    expect(() => simulateCombat(config)).toThrow('Event budget exceeded');
  });
  it('reproduces random outcomes and isolates interleaved runs', () => {
    const config = fresh(); config.mode = 'random';
    for (const actor of config.actors) actor.stats.critRate = 0.5;
    const first = simulateCombat(config);
    const other = fresh(); other.seed = 1;
    simulateCombat(other);
    expect(simulateCombat(config)).toEqual(first);
    expect(first.events.filter(e => e.type === 'hit').every(e => typeof e.critical === 'boolean')).toBe(true);
  });
  it('supports forced critical/noncritical without random rolls', () => {
    const config = simple(); config.mode = 'critical';
    expect(simulateCombat(config).totalDamage).toBe(2000);
    config.mode = 'noncritical'; expect(simulateCombat(config).totalDamage).toBe(1000);
  });
  it('fails explicitly for a supported element pair with unsupported reaction semantics', () => {
    const config = fresh();
    config.skills[0].effect = { type: 'hit', hit: { element: 'hydro', multiplier: 1, gauge: 1, icdTag: 'wet', icdRule: 'none' } };
    config.commands = [{ type: 'cast', id: 'wet', timeMs: 0, skillId: 'turret' },
      { type: 'switch', id: 'switch', timeMs: 1000, actorId: 'cryo' },
      { type: 'cast', id: 'freeze', timeMs: 1000, skillId: 'frost' }];
    expect(() => simulateCombat(config)).toThrow('Unsupported reaction');
  });
});

describe('combat input isolation and references', () => {
  it.each([
    { seed: -1 }, { seed: undefined }, { rulesVersion: 'future' }, { initialOnField: 'missing' },
    { actors: [] }, { commands: [{ type: 'cast', id: 'x', timeMs: 0, skillId: 'missing' }] },
    { commands: [{ type: 'switch', id: 'x', timeMs: 0, actorId: 'missing' }] },
    { pickups: [{ type: 'flat', id: 'x', timeMs: 0, actorId: 'missing', amount: 1 }] },
    { commands: [{ type: 'cast', id: 'x', timeMs: 4001, skillId: 'burst' }] },
  ])('rejects invalid configuration %o', change => {
    expect(() => simulateCombat({ ...fresh(), ...change })).toThrow();
  });
  it('rejects duplicates, unknown owners/targets, excessive energy and physical aura', () => {
    const config = fresh();
    config.actors[0].initialEnergy = 7;
    expect(combatSchema.safeParse(config).success).toBe(false);
    config.actors[0].initialEnergy = 6;
    config.skills[0].ownerId = 'missing';
    expect(combatSchema.safeParse(config).success).toBe(false);
    config.skills[0].ownerId = 'pyro';
    config.buffs[0].targetIds = ['missing'];
    expect(combatSchema.safeParse(config).success).toBe(false);
    config.buffs = [];
    config.actors.push(config.actors[0]);
    expect(combatSchema.safeParse(config).success).toBe(false);
    const invalid = simple();
    if (invalid.skills[0].effect.type !== 'hit') throw new Error('fixture');
    invalid.skills[0].effect.hit.gauge = 1;
    expect(combatSchema.safeParse(invalid).success).toBe(false);
  });
});
