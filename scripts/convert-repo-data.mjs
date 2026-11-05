import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceHashes = {};
function read(path) {
  const bytes = readFileSync(resolve(root, path));
  sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes.toString('utf8'));
}
const characters = { jean: 'Jean', xingqiu: 'Xingqiu', hutao: 'Hutao', albedo: 'Albedo', raiden: 'Shogun' };
const weapons = { 'harbinger-of-dawn': 'Harbinger_of_Dawn', 'favonius-sword': 'Favonius_Sword',
  'sacrificial-sword': 'Sacrificial_Sword', 'festering-desire': 'Festering_Desire',
  'white-tassel': 'White_Tassel', 'prototype-starglitter': 'Prototype_Starglitter',
  'staff-of-homa': 'Staff_of_Homa', 'engulfing-lightning': 'Engulfing_Lightning' };
const base = read('docs/constant/CharacterConfig.json');
const skills = read('docs/constant/SkillConfig.json');
const times = read('docs/constant/ActionTime.json');
const growth = read('docs/constant/CharacterLevelMultiplier.json');
const weaponList = read('docs/constant/WeaponConfig.json');
const weaponGrowth = read('docs/constant/WeaponLevelMultiplier.json');
const artifacts = read('docs/constant/ArtifactStat.json');
const reactions = read('docs/constant/ReactionLevelMultiplier.json');
const output = { version: 'repo-content-v1', characters: {}, weapons: {}, growth, weaponGrowth,
  artifactMain: {}, artifactAllowed: artifacts.main_stat_name, artifactSubstats: artifacts.sub_stat_name, reactionLevels: reactions.player };
for (const [id, name] of Object.entries(characters)) {
  if (!base[name] || !skills[name] || !times[name]) throw new Error(`Missing character: ${name}`);
  for (const type of ['A', 'E', 'Q']) for (let level = 1; level <= 15; level++) {
    if (!skills[name][type]?.[level]?.length || skills[name][type][level].some(v => !Number.isFinite(v))) throw new Error(`Invalid skill: ${name}.${type}.${level}`);
  }
  output.characters[id] = { sourceName: name, base: base[name], skills: skills[name], frames: times[name] };
}
for (const [id, name] of Object.entries(weapons)) {
  const weapon = weaponList.find(item => item.name === name);
  if (!weapon || !weaponGrowth[weapon.atk_curve] || !weaponGrowth[weapon.stat_curve]) throw new Error(`Missing weapon: ${name}`);
  output.weapons[id] = weapon;
}
for (const [stat, values] of Object.entries(artifacts.main_stat['5'])) {
  if (!Array.isArray(values) || values.length !== 21) throw new Error(`Invalid artifact stat: ${stat}`);
  const ratio = !['HP_CONST', 'ATK_CONST', 'EM'].includes(stat);
  output.artifactMain[stat] = values.map(value => Number(value) / (ratio ? 100 : 1));
}
function checkFinite(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite source value');
  if (value && typeof value === 'object') Object.values(value).forEach(checkFinite);
}
checkFinite(output);
const destination = resolve(root, 'packages/game-data/src/generated');
mkdirSync(destination, { recursive: true });
for (const [name, data] of Object.entries({ 'content.json': output, 'sources.json': { version: output.version, hashes: sourceHashes } })) {
  const path = resolve(destination, name);
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== text) throw new Error(`Generated data is stale: ${name}`);
  } else writeFileSync(path, text);
}
process.stdout.write(`Validated ${Object.keys(characters).length} characters, ${Object.keys(weapons).length} weapons and 5-star artifact main stats.\n`);
