import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const canonical = 'docs/constant/real-game/';
// Capture is an explicit maintenance action. Ordinary generation/check never reads references.
if (process.argv.includes('--capture')) {
  const referenceRoot = resolve(root, '.references/genshin-db');
  const commit = execFileSync('git', ['-C', referenceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (commit !== '8e5badd60b5d894284ccc927a56c9683529d2592') throw new Error('Reference SHA changed; review and version the canonical snapshot first.');
  const reference = resolve(referenceRoot, 'src/data');
  const out = resolve(root, canonical);
  mkdirSync(out, { recursive: true });
  const originalHashes = {};
  const upstream = path => {
    const absolute = resolve(root, path);
    const text = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    originalHashes[path] = createHash('sha256').update(text).digest('hex');
    return JSON.parse(text);
  };
  const upstreamFile = path => upstream(`.references/genshin-db/src/data/${path}`);
  const characterStats = upstreamFile('stats/characters.json');
  const talentStats = upstreamFile('stats/talents.json');
  const weaponStats = upstreamFile('stats/weapons.json');
  const characterInput = {}, weaponInput = {}, setInput = {};
  for (const file of readdirSync(resolve(reference, 'ChineseSimplified/characters')).filter(name => name.endsWith('.json')).sort()) {
    const m = upstreamFile(`ChineseSimplified/characters/${file}`);
    const id = file.slice(0, -5);
    const talentPath = `ChineseSimplified/talents/${file}`;
    const talents = existsSync(resolve(reference, talentPath)) ? upstreamFile(talentPath) : {};
    characterInput[id] = { metadata: Object.fromEntries(['id', 'name', 'elementType', 'weaponType'].map(key => [key, m[key]])), stats: characterStats[id], talents: talentStats[id] ?? {}, names: Object.fromEntries(Object.entries(talents).filter(([key, value]) => key.startsWith('combat') && value && typeof value === 'object').map(([key, value]) => [key, value.name ?? ''])) };
  }
  for (const file of readdirSync(resolve(reference, 'ChineseSimplified/weapons')).filter(name => name.endsWith('.json')).sort()) {
    const m = upstreamFile(`ChineseSimplified/weapons/${file}`), id = file.slice(0, -5);
    weaponInput[id] = { metadata: Object.fromEntries(Object.entries(m).filter(([key]) => ['id', 'name', 'weaponType', 'rarity'].includes(key) || /^r[1-5]$/.test(key))), stats: weaponStats[id] };
  }
  for (const file of readdirSync(resolve(reference, 'ChineseSimplified/artifacts')).filter(name => name.endsWith('.json')).sort()) {
    const m = upstreamFile(`ChineseSimplified/artifacts/${file}`);
    setInput[file.slice(0, -5)] = Object.fromEntries(Object.entries(m).filter(([key]) => ['id', 'name', 'rarityList', 'effect1Pc', 'effect2Pc', 'effect4Pc'].includes(key)));
  }
  const input = { 'characters.json': characterInput, 'weapons.json': weaponInput, 'sets.json': setInput,
    'character-curves.json': upstreamFile('curve/characters.json'), 'weapon-curves.json': upstreamFile('curve/weapons.json'),
    'artifact-main.json': upstream('docs/constant/ArtifactStat.json').main_stat['5'] };
  input['sources.json'] = { version: 'genshin-db-8e5badd-real-v1', repository: 'theBowja/genshin-db', commit: '8e5badd60b5d894284ccc927a56c9683529d2592', hashFormat: 'sha256-lf-normalized', hashes: originalHashes, scope: '固定本地数值快照；角色126、武器256、套装63。首批零命战技。' };
  for (const [name, value] of Object.entries(input)) writeFileSync(resolve(out, name), `${JSON.stringify(value)}\n`);
  mkdirSync(resolve(root, 'licenses/sources/genshin-db'), { recursive: true });
  writeFileSync(resolve(root, 'licenses/sources/genshin-db/LICENSE'), readFileSync(resolve(root, '.references/genshin-db/LICENSE')));
}

const hashes = {};
const read = name => {
  const text = readFileSync(resolve(root, canonical, name), 'utf8').replace(/\r\n/g, '\n');
  hashes[name] = createHash('sha256').update(text).digest('hex');
  return JSON.parse(text);
};
const characters = read('characters.json'), weapons = read('weapons.json'), sets = read('sets.json');
const characterCurves = read('character-curves.json'), weaponCurves = read('weapon-curves.json');
const main = read('artifact-main.json'), sources = read('sources.json');
const elements = ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];
const stats = ['hp', 'hpPercent', 'attack', 'attackPercent', 'defense', 'defensePercent', 'critRate', 'critDamage', 'energyRecharge', 'elementalMastery', ...elements.map(e => `${e}Bonus`), 'healingBonus'];
const properties = { FIGHT_PROP_HP_PERCENT: 'hpPercent', FIGHT_PROP_ATTACK_PERCENT: 'attackPercent', FIGHT_PROP_DEFENSE_PERCENT: 'defensePercent', FIGHT_PROP_CRITICAL: 'critRate', FIGHT_PROP_CRITICAL_HURT: 'critDamage', FIGHT_PROP_CHARGE_EFFICIENCY: 'energyRecharge', FIGHT_PROP_ELEMENT_MASTERY: 'elementalMastery', FIGHT_PROP_PHYSICAL_ADD_HURT: 'physicalBonus', FIGHT_PROP_WIND_ADD_HURT: 'anemoBonus', FIGHT_PROP_ROCK_ADD_HURT: 'geoBonus', FIGHT_PROP_ELEC_ADD_HURT: 'electroBonus', FIGHT_PROP_WATER_ADD_HURT: 'hydroBonus', FIGHT_PROP_FIRE_ADD_HURT: 'pyroBonus', FIGHT_PROP_ICE_ADD_HURT: 'cryoBonus', FIGHT_PROP_GRASS_ADD_HURT: 'dendroBonus', FIGHT_PROP_HEAL_ADD: 'healingBonus' };
const elementMap = { ELEMENT_ANEMO: 'anemo', ELEMENT_GEO: 'geo', ELEMENT_ELECTRO: 'electro', ELEMENT_HYDRO: 'hydro', ELEMENT_PYRO: 'pyro', ELEMENT_CRYO: 'cryo', ELEMENT_DENDRO: 'dendro', ELEMENT_NONE: 'physical' };
const first = new Set(['jean', 'kaeya', 'xingqiu']);
const source = path => ({ repository: sources.repository, commit: sources.commit, path });
const curve = (table, key) => Array.from({ length: 101 }, (_, level) => level ? table[String(level)]?.[key] : 0);
const modifier = (stat, value, rest = {}) => ({ stat, values: Array.isArray(value) ? value : [value], ...rest });
const damageModifiers = (value, category) => elements.map(element => modifier(`${element}Bonus`, value, { category }));
const normalizedCharacters = Object.entries(characters).map(([id, data]) => {
  const { metadata: m, stats: s } = data;
  const element = elementMap[m.elementType];
  if (!element || !properties[s.specialized]) throw new Error(`Unknown character mapping: ${id}`);
  const supported = first.has(id);
  const skills = ['combat1', 'combat2', 'combat3'].filter(key => data.names[key]).map((key, i) => {
    const category = ['normal', 'skill', 'burst'][i];
    const known = supported && category === 'skill';
    const params = data.talents[key];
    return { id: `${id}.${category}`, name: data.names[key], category,
      element: category === 'normal' && m.weaponType !== 'WEAPON_CATALYST' ? 'physical' : element,
      multipliers: known ? [params.param1, ...(id === 'xingqiu' ? [params.param2] : [])] : [],
      support: { supported: known, reason: known ? id === 'xingqiu' ? '零命战技两段分别记录；不自动追加命中或反应。' : '零命战技单次直接命中；不模拟击退、坠落或反应。' : '技能资料已收录，命中结构、特殊取值或机制尚未核验，不能完整计算。' } };
  });
  return { id, name: m.name, element, weaponType: m.weaponType,
    base: { hp: s.base.hp, attack: s.base.attack, defense: s.base.defense, critRate: s.base.critrate, critDamage: s.base.critdmg },
    curves: { hp: curve(characterCurves, s.curve.hp), attack: curve(characterCurves, s.curve.attack), defense: curve(characterCurves, s.curve.defense) },
    specialized: properties[s.specialized], promotion: s.promotion.map(p => ({ maxLevel: p.maxlevel, hp: p.hp, attack: p.attack, defense: p.defense, specialized: p.specialized })),
    skills, modifiers: id === 'xingqiu' ? [modifier('hydroBonus', 0.2, { minAscension: 4 })] : [],
    support: { supported, reason: supported ? '首批零命战技伤害验算；其他技能、命座与复杂机制未开放。' : '基础数值与技能名称可查；角色被动、命座和伤害规则尚未核验。' },
    source: source(`src/data/stats/characters.json#${id}`) };
});
const travelerForms=read('traveler-forms.json');
for(const baseId of ['aether','lumine'])for(const form of travelerForms.forms){
  const base=normalizedCharacters.find(character=>character.id===baseId);
  if(!base || form.skills.length!==3)throw new Error('Invalid traveler form metadata.');
  const id=`${baseId}-${form.element}`,label=form.talentName.match(/\((.+)元素\)/)?.[1];
  if(!label || !elements.includes(form.element))throw new Error('Unknown traveler element.');
  normalizedCharacters.push({...base,id,name:`${base.name}（${label}）`,element:form.element,
    skills:form.skills.map((skill,index)=>({id:`${id}.${['normal','skill','burst'][index]}`,name:skill.name,category:['normal','skill','burst'][index],element:index===0?'physical':form.element,multipliers:[],support:{supported:false,reason:'独立元素形态资料已收录，伤害机制尚未核验。'}})),
    source:{repository:travelerForms.source.repository,commit:travelerForms.source.commit,path:`${form.sourcePath};src/data/stats/characters.json#${baseId}`}});
}
const allowedWeapons = new Set(['dullblade', 'silversword', 'favoniussword', 'sacrificialsword', 'travelershandysword', 'harbingerofdawn', 'festeringdesire']);
const normalizedWeapons = Object.entries(weapons).map(([id, data]) => {
  const { metadata: m, stats: s } = data;
  const supported = allowedWeapons.has(id);
  const values = index => [1, 2, 3, 4, 5].map(rank => Number(m[`r${rank}`].values[index].replace('%', '')) / 100);
  const modifiers = id === 'harbingerofdawn' ? [modifier('critRate', values(0), { hpAbove: 0.9 })]
    : id === 'festeringdesire' ? [...damageModifiers(values(0), 'skill'), modifier('critRate', values(1), { category: 'skill' })] : [];
  const note = id === 'favoniussword' ? '伤害面板已支持；产球和能量不模拟，不生成额外命中。' : id === 'sacrificialsword' ? '伤害面板已支持；冷却重置不模拟，额外战技须自行标注。'
    : id === 'travelershandysword' ? '伤害面板已支持；拾球治疗不模拟。' : id === 'harbingerofdawn' ? '根据明确提供的生命比例判断严格高于90%的暴击增益。' : id === 'festeringdesire' ? '战技伤害加成与战技专属暴击已支持。'
    : supported ? '无伤害被动，基础属性已支持。' : `基础属性可查，武器效果尚未核验；${m.r1?.description ?? '未提供可核验的效果。'}`;
  return { id, name: m.name, weaponType: m.weaponType, rarity: m.rarity, baseAttack: s.base.attack, baseStat: s.base.specialized,
    stat: s.specialized ? properties[s.specialized] : 'attackPercent', attackCurve: curve(weaponCurves, s.curve.attack), statCurve: curve(weaponCurves, s.curve.specialized),
    promotion: s.promotion.map(p => p.attack), modifiers, support: { supported, reason: note.slice(0, 1000) }, source: source(`src/data/stats/weapons.json#${id}`) };
});
function setModifiers(text) {
  const direct = [ [/攻击力(?:提高|提升)([\d.]+)%/, 'attackPercent', 100], [/生命值(?:提高|提升)([\d.]+)%/, 'hpPercent', 100], [/防御力(?:提高|提升)([\d.]+)%/, 'defensePercent', 100], [/暴击率(?:提高|提升)([\d.]+)%/, 'critRate', 100], [/元素充能效率(?:提高|提升)([\d.]+)%/, 'energyRecharge', 100], [/元素精通(?:提高|提升)([\d.]+)点/, 'elementalMastery', 1], [/治疗(?:效果|加成)(?:提高|提升)([\d.]+)%/, 'healingBonus', 100], [/造成的治疗效果提升([\d.]+)%/, 'healingBonus', 100] ];
  for (const [pattern, stat, divisor] of direct) { const match = text.match(pattern); if (match) return [modifier(stat, Number(match[1]) / divisor)]; }
  for (const [name, element] of [['风', 'anemo'], ['岩', 'geo'], ['雷', 'electro'], ['水', 'hydro'], ['火', 'pyro'], ['冰', 'cryo'], ['草', 'dendro']]) {
    const match = text.match(new RegExp(`获得([\\d.]+)%${name}元素伤害加成`)); if (match) return [modifier(`${element}Bonus`, Number(match[1]) / 100)];
  }
  const physical = text.match(/物理伤害(?:提高|提升)([\d.]+)%/); if (physical) return [modifier('physicalBonus', Number(physical[1]) / 100)];
  const category = text.match(/元素(战技|爆发)造成的伤害提高([\d.]+)%/); if (category) return damageModifiers(Number(category[2]) / 100, category[1] === '战技' ? 'skill' : 'burst');
  return [];
}
const normalizedSets = Object.entries(sets).map(([id, data]) => ({ id, name: data.name,
  effects: [1, 2, 4].filter(pieces => data[`effect${pieces}Pc`]).map(pieces => {
    const text = data[`effect${pieces}Pc`];
    const modifiers = pieces === 2 ? setModifiers(text) : [];
    return { pieces, modifiers, support: { supported: modifiers.length > 0, reason: modifiers.length ? text : `效果未实现：${text}` } };
  }), source: source(`src/data/ChineseSimplified/artifacts/${id}.json`) }));
const mainMap = { HP_CONST: 'hp', ATK_CONST: 'attack', HP_PER: 'hpPercent', ATK_PER: 'attackPercent', DEF_PER: 'defensePercent', CRIT_RATE: 'critRate', CRIT_DMG: 'critDamage', ER: 'energyRecharge', EM: 'elementalMastery', PHYSICAL_DMG: 'physicalBonus', HEAL_BONUS: 'healingBonus' };
const artifactMain = Object.fromEntries(stats.map(stat => [stat, Array(21).fill(0)]));
for (const [key, values] of Object.entries(main)) {
  const stat = mainMap[key];
  const targets = key === 'ELEM_DMG' ? elements.filter(e => e !== 'physical').map(e => `${e}Bonus`) : stat ? [stat] : [];
  for (const target of targets) artifactMain[target] = values.map(value => value / (['HP_CONST', 'ATK_CONST', 'EM'].includes(key) ? 1 : 100));
}
const catalog = { version: sources.version,
  characters: normalizedCharacters.map(({ id, name, element, weaponType, support }) => ({ id, name, element, weaponType, ...support })),
  weapons: normalizedWeapons.map(({ id, name, weaponType, rarity, support }) => ({ id, name, weaponType, rarity, ...support })),
  sets: normalizedSets.map(({ id, name }) => ({ id, name, rarity: Math.max(...sets[id].rarityList) })) };
const outputs = { 'catalog.json': catalog, 'artifact-main.json': artifactMain };
for (const [category, entries, size] of [['characters', normalizedCharacters, 10], ['weapons', normalizedWeapons, 40], ['sets', normalizedSets, 30]]) {
  for (let start = 0; start < entries.length; start += size) outputs[`${category}-${start / size}.json`] = entries.slice(start, start + size);
}
function validateFinite(value, path = '') {
  if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid numeric source ${path}`);
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) validateFinite(child, `${path}.${key}`);
}
validateFinite(outputs);
outputs['manifest.json'] = { version: sources.version, repository: sources.repository, commit: sources.commit, hashFormat: 'sha256-lf-normalized', canonicalHashes: hashes,
  files: Object.fromEntries(Object.entries(outputs).map(([name, data]) => [name, createHash('sha256').update(`${JSON.stringify(data)}\n`).digest('hex')])) };
const directory = resolve(root, 'src/game-data/src/real-data');
mkdirSync(directory, { recursive: true });
for (const [name, data] of Object.entries(outputs)) {
  const text = `${JSON.stringify(data)}\n`, path = resolve(directory, name);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error(`Real game snapshot stale: ${name}`); }
  else writeFileSync(path, text);
}
console.log(`Real snapshot ${sources.version}: ${normalizedCharacters.length} characters, ${normalizedWeapons.length} weapons, ${normalizedSets.length} sets; ${Object.keys(outputs).length} chunks.`);
