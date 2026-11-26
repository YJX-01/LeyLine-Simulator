import { APP_VERSION } from '../../src/schema/src/version.mjs';
import { readCalculationData } from './catalog-data.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCalculationLibrary } from './calculation-library.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const commit = '8e5badd60b5d894284ccc927a56c9683529d2592';
const luna = 'b0501c5d89767ead5f647869a2412521447f7682';
export const readAuditJson = readCalculationData;

/** Compare actual numeric fields on every run; no maintained file-hash inventory. */
export async function numericAudit(read = readAuditJson) {
  const { describeCalculationTemplate, standardReactionParameters } = await loadContentSchema('/src/engine/src/index.ts');
  const library = readCalculationLibrary(read);
  const definition = (field, id) => {
    const result = library[field].find(item => item.identity.namespace === 'builtin' && item.identity.id === id && item.identity.revision === '1');
    if (!result) throw new Error(`Missing numeric-audit definition: ${field}/${id}`);
    return result;
  };
  const formulaDefinition = id => {
    const configuration = definition('formulas', id);
    return { ...describeCalculationTemplate(configuration), template: configuration.template };
  };
  const characters = read('tools/data/sources/catalog/genshin-db/characters.json');
  const weapons = read('tools/data/sources/catalog/genshin-db/weapons.json');
  const characterCurves = read('tools/data/sources/catalog/genshin-db/character-curves.json');
  const weaponCurves = read('tools/data/sources/catalog/genshin-db/weapon-curves.json');
  const talents = read(`tools/data/sources/genshin-db/${commit}/stats/talents.json`);
  const textExcerpts = read(`tools/data/sources/genshin-db/${commit}/text-excerpts.json`);
  const supplement = read('tools/data/sources/character-text/base-and-manekin.json');
  const innateBaseStats = read('tools/data/sources/catalog/innate-base-stats.json').characters;
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
    for (const [key,value] of Object.entries(character.attributes.base)) {
      if (key === 'elementalMastery') continue;
      check('character-base',value,source.base[({critRate:'critrate',critDamage:'critdmg'})[key] ?? key],`${character.id}/base/${key}`);
    }
    check('character-base',character.attributes.base.elementalMastery ?? 0,innateBaseStats[character.id]?.elementalMastery ?? 0,`${character.id}/base/elementalMastery`);
    for (const [key,values] of Object.entries(character.progression.curves)) values.slice(1).forEach((value,index)=>check('character-curves',value,characterCurves[index+1][source.curve[key]],`${character.id}/curves/${key}/${index+1}`));
    character.progression.promotion.forEach((row,index)=>{
      for (const [key,value] of Object.entries(row)) check('character-promotion',value,source.promotion[index][key==='maxLevel'?'maxlevel':key],`${character.id}/promotion/${index}/${key}`);
    });
    const talentKey = /^(aether|lumine)-/.test(character.id) ? `traveler${character.id.split('-')[1]}` : base;
    character.talents.forEach((talent,index)=>{
      // genshin-db stores a single shared traveler<element> table using Lumine's normal-attack param7;
      // verify elemental Aether normal attacks against Aether's adopted ProudSkill group (730) instead.
      const sourceBinding = binding ?? (character.id.startsWith('aether-') && talent.category === 'normal' ? supplement.bindings.aether : undefined);
      let group;
      if (sourceBinding) {
        const depot = supplement.skillDepots[sourceBinding.skillDepotId];
        const skillId = talent.category==='burst' ? depot.energySkill : depot.skills[talent.category==='normal'?0:1];
        group = supplement.skills[skillId].proudSkillGroupId;
      }
      for (const parameter of talent.parameters) parameter.values.forEach((value,level)=>{
        const expected = sourceBinding ? proudSkills.get(`${group}/${level+1}`).paramList[Number(parameter.id.replace('param',''))-1]
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
  const mainRows = new Map(read(`tools/data/sources/lunagc/${luna}/ReliquaryLevelExcelConfigData.json`).map(row=>[`${row.rank}/${row.level}`,row]));
  for (const [rarity,table] of Object.entries(read('src/game-data/data/tables/artifact-main.json'))) for (const [stat,values] of Object.entries(table)) values.forEach((value,level)=>{
    const expected = mainRows.get(`${rarity}/${level+1}`)?.addProps.find(prop=>prop.propType===`FIGHT_PROP_${props[stat]}`)?.value;
    check('artifact-main',value,expected,`${rarity}/${stat}/${level}`);
  });
  for (const [id, source] of Object.entries(read('tools/data/sources/catalog/genshin-db/sets.json'))) {
    const actual = read(`src/game-data/data/artifact-sets/${id}.json`).rarities;
    check('artifact-set-rarities', actual?.length, source.rarityList.length, `${id}/rarities/length`);
    source.rarityList.forEach((rarity, index) => check('artifact-set-rarities', actual?.[index], rarity, `${id}/rarities/${index}`));
  }
  for (const [id, slots] of Object.entries(read('tools/data/sources/artifact-rarity/set-slots.json').sets)) {
    const actual = read(`src/game-data/data/artifact-sets/${id}.json`).slots;
    check('artifact-set-slots', actual?.length, slots.length, `${id}/slots/length`);
    for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet']) check('artifact-set-slots', Number(actual?.includes(slot)), Number(slots.includes(slot)), `${id}/slots/${slot}`);
  }
  const reactions = read('src/game-data/data/calculation/reactions.json').rules;
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
  for (const family of ['amplifying','additive']) reactionNumbers(standardReactionParameters[family],reactionFacts[family],family);
  const formulaFacts = read(`${reactionSource}/calculation-formula-facts.json`);
  for (const fact of formulaFacts.constants) {
    const formula = formulaDefinition(fact.formula);
    check('calculation-formulas', formula.constants[fact.node]?.value, fact.value, `${fact.formula}/${fact.node}`);
  }
  for (const family of ['amplifying', 'additive']) {
    const formula = formulaDefinition(family);
    for (const [node, field] of [['emNumerator', 'emNumerator'], ['emDenominator', 'emDenominator']]) {
      check('calculation-formulas', formula.constants[node]?.value, reactionFacts[family][field], `${family}/${node}`);
    }
  }
  const lunarStellarFacts = read('tools/data/sources/kqm-web/2026-11-15/reaction-formulas.json');
  reactionNumbers(read('src/game-data/data/tables/stellar-swirl.json'), lunarStellarFacts.eventFacts.stellarSwirlReactionCoefficients, 'stellar-swirl');
  for (const fact of lunarStellarFacts.constants) {
    const formula = formulaDefinition(fact.formula);
    check('lunar-stellar-formulas', formula.constants[fact.node]?.value, fact.value, `${fact.formula}/${fact.node}`);
  }
  for (const id of ['lunar-charged', 'lunar-crystallize', 'stellar-swirl']) {
    const aggregate = definition('aggregates', id);
    lunarStellarFacts.rankedAggregation.weights.forEach((weight, index) => check('lunar-stellar-aggregation', aggregate.weights[index], weight, `${id}/weights/${index}`));
  }
  for (const [element, coefficients] of [['pyro', [reactionFacts.amplifying.melt.pyro, reactionFacts.amplifying.vaporize.pyro]],
    ['hydro', [reactionFacts.amplifying.vaporize.hydro]], ['cryo', [reactionFacts.amplifying.melt.cryo]], ['electro', [reactionFacts.additive.aggravate]], ['dendro', [reactionFacts.additive.spread]]]) {
    const formula = formulaDefinition(`${element}-ordinary-reaction`);
    coefficients.forEach((value, index) => check('bound-reaction-formulas', formula.constants['coefficient' + index].value, value, `${element}/coefficient${index}`));
  }
  const effectFacts = read('tools/data/sources/calculation-effects/catalog-facts.json');
  const adoptedWeapons = new Map(effectFacts.weapons.map(weapon => [weapon.id, weapon]));
  const adoptedSets = new Map(effectFacts.sets.map(set => [set.id, set]));
  // Parse decimal percentages as decimal exponents, avoiding an extra binary division rounding.
  const sourceNumber = text => text.endsWith('%') ? Number(text.slice(0, -1) + 'e-2') : Number(text);
  const numbers = text => [...text.matchAll(/\d+(?:\.\d+)?%?/g)].map(match => sourceNumber(match[0]));
  const effectDefinition = id => definition('effects', id);
  for (const record of read('tools/data/sources/calculation-effects/retained-rules.json').rules) {
    if (record.status !== 'retained-static') continue;
    const effect = effectDefinition(record.effect.id), stat = effect.target.attribute.id.replace('attribute.', '');
    const weapon = adoptedWeapons.get(record.entity), set = adoptedSets.get(record.entity);
    if (weapon) {
      const valueIndex = record.entity === 'festeringdesire' && stat === 'critRate' ? 1 : 0;
      weapon.refinements.forEach((rank, index) => check('effect-refinements', effect.value.values[index], sourceNumber(rank.values[valueIndex]), `${record.effect.id}/${index + 1}`));
    } else if (set) check('effect-static', effect.value.value.value, numbers(set.effect2Pc)[0], record.effect.id);
    else {
      const talent = textExcerpts.talents[record.entity];
      check('effect-static', effect.value.value.value, numbers(talent.passive2.description)[0], record.effect.id);
    }
  }
  for (const [id, input, valueIndex] of [['primordialjadecutter', 'rate', 1], ['staffofhoma', 'rate', 1], ['staffofhoma', 'low-rate', 2], ['cinnabarspindle', 'rate', 0]]) {
    const effectId = id === 'cinnabarspindle' ? `${id}.defense-skill-base.base` : `${id}.hp-to-attack.attack`;
    const effect = effectDefinition(effectId);
    adoptedWeapons.get(id).refinements.forEach((rank, index) => check('effect-refinements', effect.value.inputs[input].values[index], sourceNumber(rank.values[valueIndex]), `${effectId}/${input}/${index + 1}`));
  }
  for (const [id, bindings] of [['hutao', [['half', 0], ['bonus', 1]]], ['nahida', [['threshold', 0], ['one-em', 1], ['bonus-rate', 2], ['crit-rate', 3], ['bonus-cap', 4], ['crit-cap', 5]]],
    ['neuvillette', [['threshold', 0], ['cap', 3]]]]) {
    const source = textExcerpts.talents[id], values = numbers(source.passive2.description);
    const formula = formulaDefinition(`${id}.ascension-four`);
    const selected = formula.template;
    const fields = id === 'hutao' ? { half: selected.threshold, bonus: selected.value }
      : id === 'nahida' ? { threshold: selected.threshold, 'one-em': formula.constants.$oneUnit.value, 'bonus-rate': selected.channels[0].rate, 'crit-rate': selected.channels[1].rate, 'bonus-cap': selected.channels[0].cap, 'crit-cap': selected.channels[1].cap }
        : { threshold: selected.threshold, cap: selected.channels[0].cap };
    for (const [field, index] of bindings) check('effect-formulas', fields[field], values[index], `${id}/${field}`);
    if (id === 'neuvillette') check('effect-formulas', selected.channels[0].rate, values[2] / values[1], `${id}/rate`);
  }
  const harbinger = formulaDefinition('harbingerofdawn.hp-condition');
  const vesnaTalents = textExcerpts.talents.vesna;
  const vesnaConstellations = textExcerpts.constellations.vesna;
  const discipline = numbers(vesnaTalents.passive1.description), composition = numbers(vesnaTalents.passive2.description), linchpin = numbers(vesnaTalents.passive3.description);
  const vesnaFormula = id => formulaDefinition('vesna.' + id).template;
  const linchpinFormula = formulaDefinition(effectDefinition('vesna.linchpin-base.effect').value.formula.id).template;
  for (const [field, value] of [['rate', discipline[3]], ['offset', discipline[2]], ['maxInput', discipline[1]]]) check('stellar-character-formulas', vesnaFormula('discipline')[field], value, 'vesna/discipline/' + field);
  check('stellar-character-formulas', vesnaFormula('max-discipline').threshold, discipline[1], 'vesna/max-discipline');
  check('stellar-character-formulas', vesnaFormula('cryo-anemo-attack').rate, composition[0], 'vesna/party-attack');
  check('stellar-character-formulas', vesnaFormula('other-element-mastery').rate, composition[1], 'vesna/party-mastery');
  const triple = vesnaConstellations.c4.description.includes('三倍') ? 3 : NaN;
  check('stellar-character-formulas', vesnaFormula('cryo-anemo-attack-c4').rate, composition[0] * triple, 'vesna/c4-attack');
  check('stellar-character-formulas', vesnaFormula('other-element-mastery-c4').rate, composition[1] * triple, 'vesna/c4-mastery');
  check('stellar-character-formulas', linchpinFormula.rate, Number(String(linchpin[1]) + 'e-2'), 'vesna/linchpin-rate');
  check('stellar-character-formulas', linchpin[0], 100, 'vesna/linchpin-unit');
  check('stellar-character-formulas', linchpinFormula.cap, linchpin[2], 'vesna/linchpin-cap');
  for (const [id, key, index] of [['c1-bonus', 'c1', 0], ['c2-attack', 'c2', 0], ['c6-elevation', 'c6', 3]]) check('stellar-character-effects', effectDefinition('vesna.' + id + '.effect').value.value.value, numbers(vesnaConstellations[key].description)[index], 'vesna/' + id);
  const vesna = read('src/game-data/data/characters/vesna.json');
  const c6Ratios = numbers(vesnaConstellations.c6.description);
  for (const [id, index] of [['slash', 1], ['spirit', 2]]) check('stellar-character-effects', vesna.talents.find(talent => talent.category === 'skill').hits.find(hit => hit.id === 'vesna.skill.c6.' + id).base.bindings.ratio.value.value, c6Ratios[index], 'vesna/c6-' + id);
  const stellarEquipment = read('tools/data/sources/calculation-effects/stellar-equipment.json');
  for (const [key, index] of [['loyalWind', 0], ['betrayalWind', 2]]) {
    const values = effectDefinition(`beyondthechrysalis.${key}`).value.values;
    for (const rank of stellarEquipment.weapon.ranks) check('stellar-equipment', values[rank.rank - 1], numbers(rank.description)[index], `beyondthechrysalis/${key}/${rank.rank}`);
  }
  for (const [key, index] of [['critRate', 1], ['reaction.stellar-swirl.damageBonus', 2]]) {
    const modifiers = library.effects.filter(effect => effect.buff?.id === 'scarletproof.stellar' && effect.target.attribute?.id === 'attribute.'+key);
    check('stellar-equipment', modifiers.length === 1 ? modifiers[0].value.value.value : null, numbers(stellarEquipment.set.effect4Pc)[index], `scarletproof/${key}`);
  }
  const vesnaActions = read('src/game-data/data/actions/vesna.json').calculation.bundle.stateMachines[0];
  const state = key => vesnaActions.states.find(state => state.key === 'vesna.' + key);
  const transition = id => vesnaActions.transitions.find(transition => transition.id === id);
  const actionFormula = id => formulaDefinition('vesna.actions.' + id).template;
  const entryLayers = vesnaTalents.combat2.description.includes('获得两层') ? 2 : NaN;
  const burstLayers = vesnaTalents.combat3.description.includes('获得一层') ? 1 : NaN;
  const research = read('tools/data/sources/calculation-hits/vesna-actions.json').resourceResearch;
  const quantumDenominator = 6;
  for (const [actual, expected, key] of [
    [state('disciplineStacks').capacity, discipline[1], 'discipline-capacity'],
    [state('disciplineStacks').duration.value.value, discipline[0] * 1000, 'discipline-duration'],
    [state('c6Window').duration.value.value, c6Ratios[0] * 1000, 'c6-window'],
    [state('specialStage').capacity, vesnaTalents.combat2.description.includes('至多提升至三阶') ? 3 : NaN, 'stage-capacity'],
    [state('highestCasts').capacity, vesnaConstellations.c1.description.includes('四次最高境界') ? 4 : NaN, 'highest-capacity'],
    [state('swordQiSixths').knownCapacityFloor, entryLayers * quantumDenominator, 'capacity-floor'],
    [transition('enter-sword-qi').updates[0].value.value.value, entryLayers * quantumDenominator, 'entry-grant'],
    [transition('burst-sword-qi').updates[0].value.value.value, burstLayers * quantumDenominator, 'burst-grant'],
    [transition('pinion-sword-qi').updates[0].value.value.value, research.perEmission, 'pinion-grant'],
    [transition('c2-discipline').updates[0].value.value.value, discipline[1], 'c2-stacks'],
    [transition('enter').updates.find(update => update.state === 'vesna.specialStage').value.value.value, vesnaTalents.combat2.description.includes('初始境界为一阶') ? 1 : NaN, 'initial-stage'],
    [actionFormula('first-highest').threshold, vesnaConstellations.c1.description.includes('首次施放') ? 0 : NaN, 'first-highest'],
    [actionFormula('third-highest').threshold, vesnaTalents.combat2.description.includes('三次最高境界') ? 3 : NaN, 'c0-exit-count'],
    [actionFormula('fourth-highest').threshold, vesnaConstellations.c1.description.includes('四次最高境界') ? 4 : NaN, 'c1-exit-count'],
  ]) check('stellar-action-state', actual, expected, 'vesna/actions/' + key);
  for (const [skillId, parameterId, unit, sourceTalent] of [['skill', 'param12', 'seconds', 'combat2'], ['skill', 'param14', 'seconds', 'combat2'], ['burst', 'param3', 'seconds', 'combat3'], ['burst', 'param4', 'energy', 'combat3']]) {
    const parameter = vesna.talents.find(talent => talent.id === 'vesna.' + skillId).parameters.find(parameter => parameter.id === parameterId);
    const label = vesnaTalents[sourceTalent].attributes.labels.find(label => label.includes('{' + parameterId + ':'));
    if (!label || parameter.unit !== unit || unit === 'seconds' && !label.includes('秒') || unit === 'energy' && !label.includes('元素能量')) templateParameterGaps.push({ character: 'vesna', talent: skillId, parameter: parameterId, unit: parameter.unit, expected: unit });
  }
  check('effect-formulas', harbinger.template.threshold, numbers(adoptedWeapons.get('harbingerofdawn').refinements[0].description)[0], 'harbingerofdawn/hp-threshold');
  const homa = formulaDefinition('staffofhoma.hp-to-attack');
  check('effect-formulas', homa.template.conditionalRate.threshold, numbers(adoptedWeapons.get('staffofhoma').refinements[0].description)[2], 'staffofhoma/hp-threshold');
  check('effect-duration', effectDefinition('yunjin.flying-cloud-base.base').lifetime.durationMs, talents.yunjin.combat3.param3[0] * 1000, 'yunjin/duration');
  const noblesse = adoptedSets.get('noblesseoblige');
  check('effect-formulas', formulaDefinition('noblesseoblige.burst-bonus').template.value.value, numbers(noblesse.effect2Pc)[0], 'noblesse/2pc');
  check('effect-formulas', formulaDefinition('noblesseoblige.burst-team-attack').template.value.value, numbers(noblesse.effect4Pc)[0], 'noblesse/4pc');
  check('effect-duration', effectDefinition('noblesseoblige.burst-team-attack.team-attack').lifetime.durationMs, numbers(noblesse.effect4Pc)[1] * 1000, 'noblesse/duration');
  return {schemaVersion:APP_VERSION,sourceCommit:commit,independentRawCommit:luna,
    method:'Exact numeric equality of maintained JSON parameters and fixed TS algorithm constants against adopted sources; no stored file hashes. Does not prove game float32 evaluation equivalence.',
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
