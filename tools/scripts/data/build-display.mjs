import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
import { writeGeneratedFile } from '../../lib/generated-files.mjs';
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: node tools/scripts/data/build-display.mjs [--check]');
const root=resolve(import.meta.dirname,'../../..');
// UI names are community terminology only; they never alter set identities or mechanics.
const shortNames=readContentSource(resolve(root,'src/game-data/data/tables/artifact-set-short-names.json'));
const realSets=JSON.parse(readFileSync(resolve(root,'tools/data/sources/catalog/genshin-db/sets.json'),'utf8'));
for(const [id,entry] of Object.entries(shortNames.sets))if(realSets[id]?.name!==entry.name || !entry.shortName)throw new Error(`Invalid set abbreviation: ${id}`);

const effectiveDefaults=readContentSource(resolve(root,'src/game-data/data/tables/character-effective-stats.json'));
const effectiveGroups=new Set(['hp','attack','defense','critRate','critDamage','elementalMastery','energyRecharge']);
for(const [name,groups] of Object.entries(effectiveDefaults.characters))if(!name || !Array.isArray(groups) || !groups.length || groups.some(group=>!effectiveGroups.has(group)))throw new Error(`Invalid character effective attributes: ${name}`);

const effectiveBasis=readContentSource(resolve(root,'src/game-data/data/tables/effective-roll-basis.json'));
for(const value of Object.values(effectiveBasis.defaults))if(!Number.isFinite(value) || value<=0)throw new Error('Invalid effective roll fallback.');
