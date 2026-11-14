import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../',import.meta.url));
const commit = '8e5badd60b5d894284ccc927a56c9683529d2592';
const luna = 'b0501c5d89767ead5f647869a2412521447f7682';
export const readAuditJson = path => JSON.parse(readFileSync(resolve(root,path),'utf8'));

/** Compare actual numeric fields on every run; no maintained file-hash inventory. */
export function numericAudit(read = readAuditJson) {
  const characters = read('tools/data/sources/catalog/genshin-db/characters.json');
  const weapons = read('tools/data/sources/catalog/genshin-db/weapons.json');
  const characterCurves = read('tools/data/sources/catalog/genshin-db/character-curves.json');
  const weaponCurves = read('tools/data/sources/catalog/genshin-db/weapon-curves.json');
  const talents = read(`tools/data/sources/genshin-db/${commit}/stats/talents.json`);
  const supplement = read('tools/data/sources/character-text/base-and-manekin.json');
  const rawCharacters = new Map(read(`tools/data/sources/lunagc/${luna}/AvatarExcelConfigData.json`).map(row=>[row.id,row]));
  const proudSkills = new Map();
  for (const row of read(supplement.proudSkillsFile)) proudSkills.set(`${row.proudSkillGroupId}/${row.level}`,row);
  const counts = {}, differences = [], templateParameterGaps = [], independentBaseDifferences = [];
  const check = (family,actual,expected,field) => {
    counts[family] = (counts[family] ?? 0)+1;
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual!==expected) differences.push({family,field,actual,source:expected});
  };
  const files = group => readdirSync(resolve(root,`src/game-data/data/${group}`)).filter(file=>file.endsWith('.json')).sort();
  for (const file of files('characters')) {
    const character = read(`src/game-data/data/characters/${file}`), binding = supplement.bindings[character.id];
    const base = binding?.baseId ?? (/^(aether|lumine)-/.test(character.id) ? character.id.split('-')[0] : character.id);
    const source = characters[base].stats;
    for (const [key,value] of Object.entries(character.attributes.base)) check('character-base',value,source.base[({critRate:'critrate',critDamage:'critdmg'})[key] ?? key],`${character.id}/base/${key}`);
    for (const [key,values] of Object.entries(character.progression.curves)) values.slice(1).forEach((value,index)=>check('character-curves',value,characterCurves[index+1][source.curve[key]],`${character.id}/curves/${key}/${index+1}`));
    character.progression.promotion.forEach((row,index)=>{
      for (const [key,value] of Object.entries(row)) check('character-promotion',value,source.promotion[index][key==='maxLevel'?'maxlevel':key],`${character.id}/promotion/${index}/${key}`);
    });
    const talentKey = /^(aether|lumine)-/.test(character.id) ? `traveler${character.id.split('-')[1]}` : base;
    character.talents.forEach((talent,index)=>{
      let group;
      if (binding) {
        const depot = supplement.skillDepots[binding.skillDepotId];
        const skillId = talent.category==='burst' ? depot.energySkill : depot.skills[talent.category==='normal'?0:1];
        group = supplement.skills[skillId].proudSkillGroupId;
      }
      for (const parameter of talent.parameters) parameter.values.forEach((value,level)=>{
        const expected = binding ? proudSkills.get(`${group}/${level+1}`).paramList[Number(parameter.id.replace('param',''))-1]
          : (talents[talentKey] ?? talents[base])[`combat${index+1}`][parameter.id][level];
        check('talent-parameters',value,expected,`${talent.id}/${parameter.id}/${level+1}`);
      });
      const declared = new Set(talent.parameters.map(parameter=>parameter.id));
      for (const detail of talent.details) for (const match of detail.template.matchAll(/\{([^}:]+)(?::[^}]+)?\}/g)) {
        if (!declared.has(match[1])) templateParameterGaps.push({character:character.id,talent:talent.id,parameter:match[1]});
      }
    });
    const raw = rawCharacters.get(character.identity.gameId);
    if (raw) for (const [key,rawKey] of Object.entries({hp:'hpBase',attack:'attackBase',defense:'defenseBase',critRate:'critical',critDamage:'criticalHurt'})) {
      const value = character.attributes.base[key], expected = raw[rawKey] ?? 0;
      if (value!==expected) independentBaseDifferences.push({character:character.id,field:key,catalog:value,independentRaw:expected,difference:expected-value});
    }
  }
  for (const file of files('weapons')) {
    const weapon = read(`src/game-data/data/weapons/${file}`), source = weapons[weapon.id].stats;
    if (!source) continue;
    check('weapon-base',weapon.baseAttack,source.base.attack,`${weapon.id}/attack`);
    check('weapon-base',weapon.baseStat,source.base.specialized,`${weapon.id}/specialized`);
    for (const [key,sourceKey] of [['attackCurve','attack'],['statCurve','specialized']]) weapon[key].slice(1).forEach((value,index)=>check('weapon-curves',value,weaponCurves[index+1][source.curve[sourceKey]],`${weapon.id}/${key}/${index+1}`));
    weapon.promotion.forEach((value,index)=>check('weapon-promotion',value,source.promotion[index].attack,`${weapon.id}/promotion/${index}`));
  }
  const rawAffixes = new Map(read(`tools/data/sources/lunagc/${luna}/ReliquaryAffixExcelConfigData.json`).map(row=>[String(row.id),row]));
  for (const [id,item] of Object.entries(read('src/game-data/data/tables/artifact-rolls.json').affixes)) check('artifact-affixes',item.value,rawAffixes.get(id)?.propValue,id);
  const props = {hp:'HP',hpPercent:'HP_PERCENT',attack:'ATTACK',attackPercent:'ATTACK_PERCENT',defense:'DEFENSE',defensePercent:'DEFENSE_PERCENT',critRate:'CRITICAL',critDamage:'CRITICAL_HURT',energyRecharge:'CHARGE_EFFICIENCY',elementalMastery:'ELEMENT_MASTERY',healingBonus:'HEAL_ADD',physicalBonus:'PHYSICAL_ADD_HURT',pyroBonus:'FIRE_ADD_HURT',electroBonus:'ELEC_ADD_HURT',hydroBonus:'WATER_ADD_HURT',anemoBonus:'WIND_ADD_HURT',geoBonus:'ROCK_ADD_HURT',dendroBonus:'GRASS_ADD_HURT',cryoBonus:'ICE_ADD_HURT'};
  const mainRows = new Map(read(`tools/data/sources/lunagc/${luna}/ReliquaryLevelExcelConfigData.json`).filter(row=>row.rank===5).map(row=>[row.level,row]));
  for (const [stat,values] of Object.entries(read('src/game-data/data/tables/artifact-main.json'))) values.forEach((value,level)=>{
    const expected = mainRows.get(level+1)?.addProps.find(prop=>prop.propType===`FIGHT_PROP_${props[stat]}`)?.value;
    check('artifact-main',value,expected,`${stat}/${level}`);
  });
  const reactions = read('src/game-data/data/tables/reactions.json');
  const reactionSource = 'tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5';
  const reactionLevels = read(`${reactionSource}/player.json`);
  reactions.levelMultipliers.forEach((value,level)=>{
    if (level > 0) check('reaction-levels',value,reactionLevels[level],`reaction-level/${level}`);
  });
  const reactionFacts = read(`${reactionSource}/reaction-facts.json`);
  const reactionNumbers = (actual,expected,path) => {
    for (const [key,value] of Object.entries(expected)) {
      if (typeof value==='number') check('reaction-formulas',actual?.[key],value,`${path}/${key}`);
      else if (value && typeof value==='object') reactionNumbers(actual?.[key],value,`${path}/${key}`);
    }
  };
  for (const family of ['amplifying','additive']) reactionNumbers(reactions[family],reactionFacts[family],family);
  return {schemaVersion:1,sourceCommit:commit,independentRawCommit:luna,
    method:'Exact numeric equality against adopted fixed JSON fields; checks run directly, without stored file hashes. Does not prove game float32 evaluation equivalence.',
    comparedValues:counts,differences,templateParameterGaps,independentBaseDifferences,
    mainStatChanges:read(`tools/data/sources/lunagc/${luna}/audit.json`).mainStats,
    staticRules:'Author-reviewed static rules remain separate from localized descriptions.',
    gaps:['Upstream formats may already round values.','No recorded full combat timeline or game float32 comparison.']};
}

export function assertNumericAudit(report) {
  if (report.differences.length || report.templateParameterGaps.length || report.independentBaseDifferences.length) {
    throw new Error(`Numeric source differences require review: ${JSON.stringify([...report.differences,...report.templateParameterGaps,...report.independentBaseDifferences].slice(0,5))}`);
  }
}
