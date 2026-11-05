import { expect, it } from 'vitest';
import { simulateTeam } from './team';
import { testTeam } from './testing/team-fixture';
import { content } from '@leyline/game-data';

it('applies Jean C2 only after an on-field pickup and C4 only to Anemo', () => {
  const config = testTeam(); config.actors[0].constellation = 2;
  config.commands.push({ type: 'cast', id: 'N', timeMs: 2000, actorId: 'jean', action: 'N1' });
  expect(simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'N:0')?.timeMs).toBe(2189);
  config.actors[0].constellation = 4;
  config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'jean', action: 'Q' },
    { type: 'cast', id: 'E', timeMs: 2000, actorId: 'jean', action: 'E' },
    { type: 'cast', id: 'N', timeMs: 3000, actorId: 'jean', action: 'N1' }];
  const result = simulateTeam(config);
  expect(result.events.find(e => e.type === 'hit' && e.id === 'E')).toMatchObject({ calculation: { resistanceMultiplier: 1.2 } });
  expect(result.events.find(e => e.type === 'hit' && e.id === 'N:0')).toMatchObject({ calculation: { resistanceMultiplier: 1 } });
});
it('uses Xingqiu C4 as an independent multiplicative skill modifier and C1 raises end healing', () => {
  const config = testTeam('xingqiu'); config.actors[0].constellation = 3;
  config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'xingqiu', action: 'Q' }, { type: 'cast', id: 'E', timeMs: 1000, actorId: 'xingqiu', action: 'E' }];
  const before = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'E:0');
  config.actors[0].constellation = 4;
  const after = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'E:0');
  expect(after?.type === 'hit' && before?.type === 'hit' && after.calculation.baseDamage / before.calculation.baseDamage).toBeCloseTo(1.5);
  config.actors[0].constellation = 1; config.actors[0].initialHpRatio = 0.1; config.commands = [config.commands[0]];
  const healed = simulateTeam(config).finalHealth.xingqiu;
  expect(healed.current / healed.max).toBeCloseTo(0.34);
});
it('grants Hu Tao A1 to allies on ending E and C2 adds captured maximum-HP damage to blossom', () => {
  const config = testTeam('hutao'); config.mode = 'expected'; config.actors.push(testTeam('xingqiu').actors[0]);
  config.commands.push({ type: 'switch', id: 'switch', timeMs: 1000, actorId: 'xingqiu' }, { type: 'cast', id: 'N', timeMs: 1000, actorId: 'xingqiu', action: 'N1' });
  const event = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'N:0');
  expect(event?.type === 'hit' && event.calculation.critMultiplier).toBeCloseTo(1 + 0.31 * 0.969);
  const solo = testTeam('hutao'); solo.actors[0].constellation = 1;
  solo.commands.push({ type: 'cast', id: 'C', timeMs: 1000, actorId: 'hutao', action: 'C' });
  const before = simulateTeam(solo).events.find(e => e.type === 'hit' && e.id.startsWith('blossom:'));
  solo.actors[0].constellation = 2;
  const result = simulateTeam(solo), after = result.events.find(e => e.type === 'hit' && e.id.startsWith('blossom:'));
  expect(after?.type === 'hit' && before?.type === 'hit' && after.calculation.baseDamage - before.calculation.baseDamage).toBeCloseTo(result.loadouts[0].stats.maxHp * 0.1);
});
it('consumes Albedo C2 stacks for Q and does not generate transient blossoms from his Q', () => {
  const config = testTeam('albedo'); config.actors[0].constellation = 1;
  config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'albedo', action: 'N1' }, { type: 'cast', id: 'Q', timeMs: 2000, actorId: 'albedo', action: 'Q' });
  const before = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'Q');
  config.actors[0].constellation = 2;
  const result = simulateTeam(config), after = result.events.find(e => e.type === 'hit' && e.id === 'Q');
  expect(after?.type === 'hit' && before?.type === 'hit' && after.calculation.baseDamage - before.calculation.baseDamage).toBeCloseTo(result.loadouts[0].stats.defense * 0.3);
  expect(result.events.filter(e => e.type === 'hit' && e.skillId.endsWith('E.proc'))).toHaveLength(1);
});
it('uses the strict Albedo A1 health boundary and C4 plunge modifier', () => {
  const config = testTeam('albedo'); config.enemy.hpRatio = 0.49;
  config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'albedo', action: 'N1' });
  const low = simulateTeam(config).events.find(e => e.type === 'hit' && e.skillId.endsWith('E.proc'));
  expect(low?.type === 'hit' && low.calculation.bonusMultiplier).toBeCloseTo(1 + 0.288 + 0.25);
  config.enemy.hpRatio = 0.5;
  const high = simulateTeam(config).events.find(e => e.type === 'hit' && e.skillId.endsWith('E.proc'));
  expect(high?.type === 'hit' && high.calculation.bonusMultiplier).toBeCloseTo(1 + 0.288);
  config.actors[0].constellation = 4; config.commands[1] = { type: 'cast', id: 'P', timeMs: 1000, actorId: 'albedo', action: 'PL' };
  expect(simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'P:0')).toMatchObject({ calculation: { bonusMultiplier: 1.3 } });
});
it('requires explicit crystallize pickup before Albedo C6 buffs the active ally', () => {
  const config = testTeam('albedo'); config.actors[0].constellation = 6; config.actors.push(testTeam('xingqiu').actors[0]);
  config.commands.push({ type: 'switch', id: 'switch', timeMs: 1000, actorId: 'xingqiu' }, { type: 'cast', id: 'E2', timeMs: 1000, actorId: 'xingqiu', action: 'E' });
  const plain = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'E2:1');
  config.enemy.collectCrystallizeShards = true;
  const shielded = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'E2:1');
  expect(plain?.type === 'hit' && plain.calculation.bonusMultiplier).toBeCloseTo(1.2);
  expect(shielded?.type === 'hit' && shielded.calculation.bonusMultiplier).toBeCloseTo(1.37);
});
it('grants Albedo A4 elemental mastery to an ally actually triggering vaporize', () => {
  const config = testTeam('albedo'); config.actors.push(testTeam('xingqiu').actors[0], testTeam('hutao').actors[0]);
  config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'albedo', action: 'Q' },
    { type: 'switch', id: 'switch1', timeMs: 2000, actorId: 'xingqiu' }, { type: 'cast', id: 'E', timeMs: 2000, actorId: 'xingqiu', action: 'E' },
    { type: 'switch', id: 'switch2', timeMs: 4000, actorId: 'hutao' }, { type: 'cast', id: 'H', timeMs: 4000, actorId: 'hutao', action: 'E' },
    { type: 'cast', id: 'N', timeMs: 5000, actorId: 'hutao', action: 'N1' }];
  const hit = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'N:0');
  expect(hit?.type === 'hit' && hit.reactionMultiplier).toBeCloseTo(1.5 * (1 + 2.78 * 125 / 1525));
});
it('builds Raiden A1 resolve from particles even when energy is capped, and limits C6 cooldown procs', () => {
  const config = testTeam('raiden');
  config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'raiden', action: 'N1' }, { type: 'cast', id: 'Q', timeMs: 3000, actorId: 'raiden', action: 'Q' });
  const result = simulateTeam(config), stats = result.loadouts[0].stats, q = content.characters.raiden.skills.Q['1'];
  const attack = stats.characterBaseAttack + stats.weaponBaseAttack + stats.flatAttack;
  expect(result.events.find(e => e.type === 'hit' && e.id === 'Q')).toMatchObject({ calculation: { baseDamage: attack * (q[0] + 2 * q[1]) } });
  config.actors[0].constellation = 6; config.actors.push(testTeam().actors[0]);
  config.commands.push(...[5000, 6100, 7200, 8300, 9400, 10500].map((timeMs, i) => ({ type: 'cast' as const, id: `B${i}`, timeMs, actorId: 'raiden', action: 'N1' as const })));
  expect(simulateTeam(config).events.filter(e => e.type === 'status' && e.id === 'raiden-C6-cooldown')).toHaveLength(5);
});

it('grants Raiden C4 attack to teammates after switching out of Musou Isshin', () => {
  const config = testTeam('raiden'); config.actors[0].constellation = 4; config.actors.push(testTeam('xingqiu').actors[0]);
  config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'raiden', action: 'Q' },
    { type: 'switch', id: 'switch', timeMs: 3000, actorId: 'xingqiu' }, { type: 'cast', id: 'N', timeMs: 3000, actorId: 'xingqiu', action: 'N1' }];
  const result = simulateTeam(config), stats = result.loadouts[1].stats;
  const attack = (stats.characterBaseAttack + stats.weaponBaseAttack) * (1 + stats.attackPercent + 0.3) + stats.flatAttack;
  const hit = result.events.find(event => event.type === 'hit' && event.id === 'N:0');
  expect(hit?.type === 'hit' && hit.calculation.baseDamage).toBeCloseTo(attack * content.characters.xingqiu.skills.A['1'][0]);
});
