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
const shortText=JSON.stringify(Object.fromEntries(Object.entries(shortNames.sets).map(([id,entry])=>[id,entry.shortName])))+'\n';
const shortTarget=resolve(root,'src/web/generated/artifact-set-short-names.json');
if(process.argv.includes('--check')) { if(readFileSync(shortTarget,'utf8').replace(/\r\n/g,'\n')!==shortText)throw new Error('Artifact set abbreviations need regeneration.'); }
else writeGeneratedFile(shortTarget,shortText);

const effectiveDefaults=readContentSource(resolve(root,'src/game-data/data/tables/character-effective-stats.json'));
const effectiveGroups=new Set(['hp','attack','defense','critRate','critDamage','elementalMastery','energyRecharge']);
for(const [name,groups] of Object.entries(effectiveDefaults.characters))if(!name || !Array.isArray(groups) || !groups.length || groups.some(group=>!effectiveGroups.has(group)))throw new Error(`Invalid character effective attributes: ${name}`);
const effectiveText=JSON.stringify(effectiveDefaults,null,2)+'\n',effectiveTarget=resolve(root,'src/web/generated/character-effective-stats.json');
if(process.argv.includes('--check')) { if(readFileSync(effectiveTarget,'utf8').replace(/\r\n/g,'\n')!==effectiveText)throw new Error('Effective stat defaults need regeneration.'); }
else writeGeneratedFile(effectiveTarget,effectiveText);

const effectiveBasis=readContentSource(resolve(root,'src/game-data/data/tables/effective-roll-basis.json'));
for(const value of Object.values(effectiveBasis.defaults))if(!Number.isFinite(value) || value<=0)throw new Error('Invalid effective roll fallback.');
const basisText=JSON.stringify(effectiveBasis,null,2)+'\n',basisTarget=resolve(root,'src/web/generated/effective-roll-basis.json');
if(process.argv.includes('--check')) { if(readFileSync(basisTarget,'utf8').replace(/\r\n/g,'\n')!==basisText)throw new Error('Effective roll basis needs regeneration.'); }
else writeGeneratedFile(basisTarget,basisText);

const talentDisplay={characters:{}};
for(const file of readdirSync(resolve(root,'src/game-data/data/characters')).filter(file=>file.endsWith('.json')).sort()) {
 const character=readContentSource(resolve(root,'src/game-data/data/characters',file));
 const rows=character.talents.map(talent=>({key:talent.category,label:{normal:'A',skill:'E',burst:'Q'}[talent.category],icon:`${character.id}-combat${{normal:1,skill:2,burst:3}[talent.category]}`,name:talent.name,constellations:character.constellations.filter(item=>item.talentBonuses.some(bonus=>bonus.category===talent.category)).map(item=>item.rank)}));
 talentDisplay.characters[character.identity.name]=rows;
 talentDisplay.characters[character.id]=rows;
}
const talentText=JSON.stringify(talentDisplay)+'\n',talentTarget=resolve(root,'src/web/generated/character-talent-display.json');
if(process.argv.includes('--check')) {if(readFileSync(talentTarget,'utf8')!==talentText)throw new Error('Talent projection needs regeneration.');}
else writeGeneratedFile(talentTarget,talentText);
