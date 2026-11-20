import { readFileSync } from 'node:fs';

export const vesnaRecording = '.references/enka/uid-107590923.json';
const read = (name: string) => JSON.parse(readFileSync('tools/data/sources/' + name, 'utf8'));

function recordedArtifactStats(avatarId: number): Record<string, number> {
  const raw = JSON.parse(readFileSync(vesnaRecording, 'utf8'));
  const main = read('lunagc/b0501c5d89767ead5f647869a2412521447f7682/ReliquaryLevelExcelConfigData.json');
  const gear = raw.avatarInfoList.find((entry: { avatarId: number }) => entry.avatarId === avatarId).equipList;
  const stats: Record<string, number> = {};
  const add = (key: string, value: number) => { stats[key] = (stats[key] ?? 0) + value; };
  for (const item of gear) {
    if (!item.reliquary) continue;
    const property = item.flat.reliquaryMainstat.mainPropId;
    const row = main.find((row: { rank: number; level: number }) => row.rank === item.flat.rankLevel && row.level === item.reliquary.level);
    add(property, row.addProps.find((entry: { propType: string }) => entry.propType === property).value);
    for (const sub of item.flat.reliquarySubstats) {
      const key = sub.appendPropId ?? sub.appendPropID;
      const flat = ['FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_ELEMENT_MASTERY'].includes(key);
      add(key, (sub.statValue ?? sub.propValue) / (flat ? 1 : 100));
    }
  }
  return stats;
}

/** Ordinary direct plunge trial for the level-80 C0 Varesa in the same showcase. */
export function recordedVaresaPlunge(mode: 'critical' | 'expected'): number {
  const stats = recordedArtifactStats(10000111);
  const character = read('catalog/genshin-db/characters.json').varesa.stats;
  const weapon = read('catalog/genshin-db/weapons.json').thewidsith.stats;
  const curves = read('catalog/genshin-db/character-curves.json'), weaponCurves = read('catalog/genshin-db/weapon-curves.json');
  const params = read('genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json').varesa.combat3.param5;
  const white = character.base.attack * curves[80][character.curve.attack] + character.promotion[5].attack
    + weapon.base.attack * weaponCurves[90][weapon.curve.attack] + weapon.promotion[6].attack;
  const attack = white * (1 + (stats.FIGHT_PROP_ATTACK_PERCENT ?? 0) + 0.18) + (stats.FIGHT_PROP_ATTACK ?? 0);
  const critRate = Math.min(1, character.base.critrate + character.promotion[5].specialized + (stats.FIGHT_PROP_CRITICAL ?? 0));
  const critDamage = character.base.critdmg + weapon.base.specialized * weaponCurves[90][weapon.curve.specialized] + (stats.FIGHT_PROP_CRITICAL_HURT ?? 0);
  const crit = 1 + (mode === 'critical' ? 1 : critRate) * critDamage;
  return attack * params[6] * (1 + (stats.FIGHT_PROP_ELEC_ADD_HURT ?? 0)) * crit * (180 / 370) * 0.9;
}

/** Independent arithmetic for the recorded gear. Each non-Cryo/Anemo teammate adds 25 mastery at C2. */
export function recordedVesnaDamage(refinement: 1 | 2, talentMultiplier = 1, loyalWind = true, mode: 'critical' | 'expected' = 'expected', otherElementMembers = 0): number {
  const stats = recordedArtifactStats(10000143);
  const character = read('catalog/genshin-db/characters.json').vesna.stats;
  const weapon = read('catalog/genshin-db/weapons.json').beyondthechrysalis.stats;
  const curves = read('catalog/genshin-db/character-curves.json'), weaponCurves = read('catalog/genshin-db/weapon-curves.json');
  const params = read('genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json').vesna.combat2.param5;
  const white = character.base.attack * curves[90][character.curve.attack] + character.promotion[6].attack
    + weapon.base.attack * weaponCurves[90][weapon.curve.attack] + weapon.promotion[6].attack;
  const attack = white * (1 + (stats.FIGHT_PROP_ATTACK_PERCENT ?? 0) + 0.18 + 0.06 + 0.4) + (stats.FIGHT_PROP_ATTACK ?? 0);
  const mastery = (stats.FIGHT_PROP_ELEMENT_MASTERY ?? 0) + 25 * otherElementMembers;
  const critRate = Math.min(1, 0.05 + 0.192 + (stats.FIGHT_PROP_CRITICAL ?? 0) + 0.16);
  const critDamage = 0.5 + weapon.base.specialized * weaponCurves[90][weapon.curve.specialized]
    + (stats.FIGHT_PROP_CRITICAL_HURT ?? 0) + (loyalWind ? (refinement === 1 ? 0.56 : 0.72) : 0);
  const bonus = 1 + 6 * mastery / (mastery + 2000) + 0.2 + (refinement === 1 ? 0.36 : 0.45) + 0.4;
  const crit = 1 + (mode === 'critical' ? 1 : critRate) * critDamage;
  return attack * params[9] * talentMultiplier * 1.6 * (1 + Math.min(attack * 0.00007, 0.14)) * bonus * crit * 0.9;
}
