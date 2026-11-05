import { readFileSync, writeFileSync } from 'node:fs';
const artifact = (slot, set, mainStat, er) => ({ slot, set, level: 20, mainStat,
  substats: [{ stat: er ? 'ER' : 'EM', value: er ? 0.2 : 20 }] });
const actor = (id, weapon, set, sands, goblet, initialEnergy, hp = 1) => ({ id, character: id, level: 90,
  ascension: 6, constellation: 0, talents: { normal: 8, skill: 8, burst: 8 },
  weapon: { id: weapon, level: 90, ascension: 6, refinement: weapon === 'sacrificial-sword' ? 5 : 1 },
  artifacts: [artifact('FLOWER', set, 'HP_CONST', true), artifact('PLUME', set, 'ATK_CONST', true),
    artifact('SANDS', set, sands, sands !== 'ER'), artifact('GOBLET', set, goblet, true), artifact('CIRCLET', 'none', 'CRIT_RATE', true)],
  initialHpRatio: hp, initialEnergy });
const commands = [];
function cast(id, action, timeMs, loop) { commands.push({ type: 'cast', id: `${loop}-${id}-${action}-${timeMs}`, actorId: id, action, timeMs }); }
function swap(id, timeMs, loop) { commands.push({ type: 'switch', id: `${loop}-switch-${id}`, actorId: id, timeMs }); }
for (let loop = 0; loop < 2; loop++) {
  const start = loop * 24000;
  if (loop) swap('xingqiu', start, loop);
  cast('xingqiu', 'Q', start, loop); cast('xingqiu', 'E', start + 800, loop); cast('xingqiu', 'E', start + 2200, loop);
  swap('albedo', start + 3700, loop); cast('albedo', 'E', start + 3700, loop);
  swap('jean', start + 4800, loop); cast('jean', 'E', start + 4800, loop);
  swap('hutao', start + 6000, loop); cast('hutao', 'E', start + 6000, loop);
  for (let i = 0; i < 6; i++) { cast('hutao', 'N1', start + 6600 + i * 1400, loop); cast('hutao', 'C', start + 7000 + i * 1400, loop); }
}
const fixture = { schemaVersion: 1, rulesVersion: 'team-repo-v1', durationMs: 48000, seed: 1, mode: 'expected',
  actors: [actor('xingqiu', 'sacrificial-sword', 'emblem', 'ER', 'HYDRO_DMG', 80),
    actor('albedo', 'harbinger-of-dawn', 'gladiator', 'DEF_PER', 'GEO_DMG', 0),
    actor('jean', 'festering-desire', 'noblesse', 'ATK_PER', 'ANEMO_DMG', 0),
    actor('hutao', 'staff-of-homa', 'shimenawa', 'HP_PER', 'PYRO_DMG', 30, 0.6)],
  initialOnField: 'xingqiu', enemy: { level: 90, hpRatio: 1, resistance: 0.1, defenseReduction: 0,
    fatalBlossomHits: 2, collectCrystallizeShards: false }, commands, logMode: 'detailed', maxLogEvents: 10000 };
const destination = new URL('../fixtures/scenarios/first-team.json', import.meta.url);
const text = `${JSON.stringify(fixture, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error('Four-character fixture is stale');
} else writeFileSync(destination, text);
