import { readContentSource } from './content-source.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const equipmentSource = 'tools/data/sources/catalog/genshin-db/';
const sets = readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json', import.meta.url));
const weapons = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const growth = readContentSource(new URL('../data/sources/catalog/genshin-db/characters.json', import.meta.url));
const curves = readContentSource(new URL('../data/sources/catalog/genshin-db/character-curves.json', import.meta.url));
const lifecyclePath = 'tools/data/sources/catalog/combat-lifecycle.json';
const blessings = readContentSource(new URL('../../' + lifecyclePath, import.meta.url)).reactionBlessings;
const elemental = { 火: 'pyro', 水: 'hydro', 风: 'anemo', 雷: 'electro', 草: 'dendro', 冰: 'cryo', 岩: 'geo' };
const close = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const passing = row => !row.issue && (row.actual === row.expected && row.expected === null
  || close(row.actual ?? row.value, row.expected) || row.value === null && row.expected === null);
const stat = value => 'attribute.' + value;
const effectId = (id, index) => index ? id + '.' + index : id;

function capturedNumber(match, index) {
  if (!match) return NaN;
  if (!Array.isArray(index)) return Number(match[index]);
  const [first, second] = index;
  return second < 0 ? Number(match[first]) - Number(match[-second]) : Number(match[first]) * Number(match[second]);
}

function indexRows(rows, key) {
  const index = new Map();
  for (const row of rows ?? []) {
    const id = key(row);
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(row);
  }
  return index;
}

function one(rows) {
  return rows.length === 1 ? rows[0] : undefined;
}

function characterRef(entity, field) {
  const [, section, index] = field.split('/');
  const origin = entity.replace(/^(?:aether|lumine)-/, 'traveler');
  if (section === 'constellations') return capture + 'constellations/' + origin + '.json#c' + (+index + 1);
  const key = section === 'passives' ? 'passive' + (+index + 1) : 'combat' + (+index + 1);
  return capture + 'talents/' + origin + '.json#' + key;
}

const castReadings = [
  ['albedo', '/passives/1', 'albedo.homuncular-nature', ['elementalMastery'], 'team', 'burst', 10000],
  ['collei', '/constellations/3', 'collei.gift-of-the-woods', ['elementalMastery'], 'others', 'burst', 12000],
  ['keqing', '/passives/1', 'keqing.aristocratic-dignity', ['critRate', 'energyRecharge'], 'owner', 'burst', 8000],
  ['amber', '/constellations/5', 'amber.c6-cast', ['movementSpeed', 'attackPercent'], 'team', 'burst', 10000],
  ['baizhu', '/constellations/3', 'baizhu.c4-cast', ['elementalMastery'], 'team', 'burst', 15000],
  ['gorou', '/passives/0', 'gorou.p1-cast', ['defensePercent'], 'team', 'burst', 12000],
  ['kamisatoayaka', '/passives/0', 'kamisatoayaka.p1-cast', ['damageBonus'], 'owner', 'skill', 6000, ['normal', 'charged']],
  ['kamisatoayato', '/constellations/3', 'kamisatoayato.c4-cast', ['normalAttackSpeed'], 'team', 'burst', 15000],
  ['kaveh', '/constellations/0', 'kaveh.c1-cast', ['resistance.dendro', 'incomingHealingBonus'], 'owner', 'skill', 3000],
  ['lanyan', '/constellations/3', 'lanyan.c4-cast', ['elementalMastery'], 'team', 'burst', 12000],
  ['yunjin', '/constellations/1', 'yunjin.c2-cast', ['damageBonus'], 'team', 'burst', 12000, ['normal']],
  ...['aether-pyro', 'lumine-pyro'].map(id => [id, '/constellations/3', id + '.c4-cast', ['pyroBonus'], 'owner', 'burst', 9000]),
];

const singleCharacterReadings = [
  ['aino', '/passives/1', 'aino.talent-flat-bonus', 'baseDamageBonus', s => 'own' in s],
  ['kachina', '/passives/1', 'kachina.talent-flat-bonus', 'baseDamageBonus', s => 'own' in s],
  ['freminet', '/passives/1', 'freminet.parallel-condensers', 'damageBonus', s => 'observations' in s],
  ['freminet', '/constellations/3', 'freminet.snowy-moon', 'attackPercent', s => 'observations' in s],
  ['freminet', '/constellations/5', 'freminet.dreams-and-determination', 'critDamage', s => 'observations' in s],
  ['hutao', '/passives/1', 'hutao.ascension-four.pyro-bonus', 'pyroBonus', s => 'unlocked' in s],
  ['kukishinobu', '/passives/0', 'kukishinobu.breaking-free', 'healingBonus', s => s.stat === 'healingBonus'],
  ['gaming', '/passives/1', 'gaming.a4-healing', 'incomingHealingBonus', s => s.stat === 'healing'],
  ['mona', '/passives/1', 'mona.waterborne-destiny', 'hydroBonus', s => s.stat === 'hydroBonus'],
  ['yaemiko', '/constellations/5', 'yaemiko.forbidden-art', 'defenseIgnore', s => s.stat === 'defenseIgnore'],
  ['yaemiko', '/passives/1', 'yaemiko.enlightened-blessing', 'damageBonus', s => s.stat === 'damageBonus' && s.basis === 'elementalMastery'],
  ['thoma', '/passives/1', 'thoma.flaming-assault', 'baseDamageBonus', s => s.stat === 'baseDamageBonus' && s.basis === 'hp'],
  ['aratakiitto', '/passives/1', 'aratakiitto.bloodline-of-the-crimson-oni', 'baseDamageBonus', s => s.stat === 'baseDamageBonus' && s.basis === 'defense'],
  ['sangonomiyakokomi', '/passives/3', 'sangonomiyakokomi.flawless-strategy', 'healingBonus', s => s.stat === 'healingBonus'],
];

const staminaSuppliers = {
  glide: ['amber', 'collei', 'venti'],
  swim: ['beidou', 'sangonomiyakokomi'],
  climb: ['candace', 'xiao'],
  sprint: ['kaeya', 'razor', 'kaedeharakazuha', 'chevreuse', 'shikanoinheizou'],
};

const equipmentReadings = [
  ['engulfinglightning', 1, 'engulfinglightning.attack', ['attackPercent'], 'xiangling'],
  ['cinnabarspindle', 0, 'cinnabarspindle.defense-skill-base.base', ['baseDamageBonus'], 'kaeya'],
  ['mouunsmoon', 0, 'mouunsmoon.watatsumi', ['damageBonus'], 'kujousara'],
  ['akuoumaru', 0, 'akuoumaru.watatsumi', ['damageBonus'], 'beidou'],
  ['wavebreakersfin', 0, 'wavebreakersfin.watatsumi', ['damageBonus'], 'raidenshogun'],
  ['lithicblade', 0, 'lithicblade.liyue', ['attackPercent', 'critRate'], 'beidou'],
  ['lithicspear', 0, 'lithicspear.liyue', ['attackPercent', 'critRate'], 'xiangling'],
  ['ringofyaxche', 0, 'ringofyaxche.jade-crown', ['damageBonus'], 'lisa'],
];

// Every expression names the branch in the captured prose. Grouped expressions
// yield a captured value by one-based index, with an optional source multiplier.
const weaponTextReadings = {
  astralvulturescrimsonplumage: [
    ['reaction-attack', 'attackPercent', /扩散或星扩散反应后的\d+秒内，攻击力提高([\d.]+)%/],
    ['charged1', 'damageBonus', /重击造成的伤害提高([\d.]+)%\/([\d.]+)%/, 1],
    ['charged2', 'damageBonus', /重击造成的伤害提高([\d.]+)%\/([\d.]+)%/, 2],
    ['burst1', 'damageBonus', /元素爆发造成的伤害提高([\d.]+)%\/([\d.]+)%/, 1],
    ['burst2', 'damageBonus', /元素爆发造成的伤害提高([\d.]+)%\/([\d.]+)%/, 2],
  ],
  ateaspoonoftranscendence: ['stellar-conduct', 'stellar-swirl'].map(family =>
    [family, 'reaction.' + family + '.damageBonus', /星超导和星扩散反应伤害提升([\d.]+)%/]),
  athameartis: [
    ['daybreak-owner', 'attackPercent', /白昼之刃」效果：攻击力提升([\d.]+)%/],
    ['daybreak-team', 'attackPercent', /当前场上角色攻击力提升([\d.]+)%/, 1, 1, 'team'],
    ['daybreak-owner-hexerei', 'attackPercent', /白昼之刃」效果：攻击力提升([\d.]+)%[^。]+。\s*此外，队伍拥有「魔导·秘仪」效果时，「白昼之刃」的效果额外提升([\d.]+)%/, [1, 2], .01],
    ['daybreak-team-hexerei', 'attackPercent', /当前场上角色攻击力提升([\d.]+)%[^。]+。\s*此外，队伍拥有「魔导·秘仪」效果时，「白昼之刃」的效果额外提升([\d.]+)%/, [1, 2], .01, 'team'],
  ],
  athousandfloatingdreams: [
    ...[1, 2, 3].map(stacks => ['matching-' + stacks, 'elementalMastery', /相同：元素精通提升([\d.]+)点/, 1, stacks * 100]),
    ['others', 'elementalMastery', /装备者以外的附近角色的元素精通提升([\d.]+)点/, 1, 100, 'team'],
  ],
  balladoftheboundlessblue: [
    ['normal', 'damageBonus', /普通攻击造成的伤害提升([\d.]+)%/],
    ['charged', 'damageBonus', /重击造成的伤害提升([\d.]+)%/],
  ],
  bloodsoakedruins: [
    ['lunar-damage', 'reaction.lunar.damageBonus', /月感电反应伤害提高([\d.]+)%/],
    ['lunar-crit-damage', 'critDamage', /荒落的挽歌」：暴击伤害提高([\d.]+)%/],
  ],
  calamityqueller: [['elemental', 'damageBonus', /^获得([\d.]+)%所有元素伤害加成/]],
  cashflowsupervision: [
    ['normal-damage', 'damageBonus', /普通攻击造成的伤害提升([\d.]+)%/],
    ['charged-damage', 'damageBonus', /重击造成的伤害提升([\d.]+)%/],
    ['stellar-conduct', 'reaction.stellar-conduct.damageBonus', /星超导反应伤害提升([\d.]+)%/],
    ['full-stack-speed', 'normalAttackSpeed', /叠加3层的状态下时，攻击速度提升([\d.]+)%/],
  ],
  cloudforged: [1, 2].map(stacks => ['mastery' + stacks, 'elementalMastery', /元素能量减少后，装备者的元素精通提升([\d.]+)点/, 1, 100 * stacks]),
  compoundbow: [
    ['normal-charged-stacks', 'attackPercent', /命中时，提升([\d.]+)%攻击力/],
    ['normal-charged-stacks.1', 'normalAttackSpeed', /攻击力与([\d.]+)%普通攻击速度/],
  ],
  cranesechoingcall: [['plunge', 'damageBonus', /所有角色下落攻击造成的伤害提高([\d.]+)%/, 1, 1, 'team']],
  crimsonmoonssemblance: [
    ['bond-damage', 'damageBonus', /装备者具有生命之契时，造成的伤害提升([\d.]+)%/],
    ['large-bond-damage', 'damageBonus', /造成的伤害将进一步提升([\d.]+)%/],
  ],
  elegyfortheend: [
    ['mastery', 'elementalMastery', /一部分。元素精通提高([\d.]+)点/, 1, 100],
    ['farewell-elementalMastery', 'elementalMastery', /别离之歌」效果：元素精通提高([\d.]+)点/, 1, 100, 'team'],
    ['farewell-attackPercent', 'attackPercent', /别离之歌」效果：元素精通提高[\d.]+点，攻击力提升([\d.]+)%/, 1, 1, 'team'],
  ],
  everlastingmoonglow: [['healing', 'healingBonus', /^治疗加成提升([\d.]+)%/]],
  fadingtwilight: [1, 2, 3].map(state =>
    ['twilight' + state, 'damageBonus', /夕暮、流霞、朝晖三种状态，分别能使造成的伤害提升([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, state]),
  ferrousshadow: [1, 2, 3, 4, 5].map(rank => ['low-hp-charged-r' + rank, 'damageBonus', /重击不会轻易被打断，并提高([\d.]+)%重击伤害/, 1, 1, 'owner', rank]),
  finaleofthedeep: [['skill-attack', 'attackPercent', /施放元素战技时，攻击力提升([\d.]+)%/]],
  flameforgedinsight: [['reaction-mastery', 'elementalMastery', /在接下来的\d+秒内使元素精通提升([\d.]+)点/, 1, 100]],
  flowingpurity: [['skill-elements', 'damageBonus', /施放元素战技时，所有元素伤害加成提升([\d.]+)%/]],
  forestregalia: [['leaf', 'elementalMastery', /拾取种识之叶的角色元素精通提升([\d.]+)点/, 1, 100, 'team']],
  freedomsworn: [
    ['damage', 'damageBonus', /一部分。造成的伤害提高([\d.]+)%/],
    ['rebel-damage', 'damageBonus', /普通攻击、重击、下落攻击造成的伤害提高([\d.]+)%/, 1, 1, 'team'],
    ['rebel-attack', 'attackPercent', /普通攻击、重击、下落攻击造成的伤害提高[\d.]+%，攻击力提升([\d.]+)%/, 1, 1, 'team'],
  ],
  forgedbythegoldenmelody: ['live', 'echo'].flatMap(prefix => [
    [prefix + '-attack', 'attackPercent', /攻击力提升([\d.]+)%\/元素精通提升/],
    [prefix + '-mastery', 'elementalMastery', /元素精通提升([\d.]+)点\/星烁反应伤害提升/, 1, 100],
    ...['stellar-conduct', 'stellar-swirl'].map(family =>
      [prefix + '-' + family, 'reaction.' + family + '.damageBonus', /星烁反应伤害提升([\d.]+)%/]),
  ]),
  fruitoffulfillment: [1, 2, 3, 4, 5].map(stacks =>
    ['wax-mastery-' + stacks, 'elementalMastery', /元素精通提升([\d.]+)点/, 1, 100 * stacks]),
  hakushinring: Object.values(elemental).map(element =>
    [element + '-reaction', element + 'Bonus', /获得([\d.]+)%对应元素的元素伤害加成/, 1, 1, 'team']),
  harangeppakufutsu: [['elemental', 'damageBonus', /^获得([\d.]+)%所有元素伤害加成/]],
  ibispiercer: [['charged-mastery', 'elementalMastery', /元素精通提升([\d.]+)点/, 1, 100]],
  kagurasverity: [['full-dance', 'damageBonus', /持有3层时，该角色获得([\d.]+)%所有元素伤害加成/]],
  lostprayertothesacredwinds: [['movement', 'movementSpeed', /^移动速度提高([\d.]+)%/]],
  mistsplitterreforged: [
    ['elements', 'damageBonus', /^获得([\d.]+)%所有元素伤害加成/],
    ...[1, 2, 3].flatMap(stacks => ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'].map((element, index) =>
      ['emblem-' + stacks + (index ? '.' + index : ''), element + 'Bonus', /获得([\d.]+)\/([\d.]+)\/([\d.]+)%自己的元素类型的元素伤害加成/, stacks])),
  ],
  moonpiercer: [['leaf', 'attackPercent', /拾取苏生之叶的角色攻击力提升([\d.]+)%/, 1, 1, 'team']],
  polarstar: [1, 2, 3, 4].map(stacks =>
    ['star' + stacks, 'attackPercent', /攻击力将提高([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)%/, stacks]),
  prototyperancour: [
    ['building-stacks', 'attackPercent', /攻击力和防御力提高([\d.]+)%/],
    ['building-stacks.1', 'defensePercent', /攻击力和防御力提高([\d.]+)%/],
  ],
  sacrificialjade: [
    ['jade', 'hpPercent', /生命值上限提升([\d.]+)%/],
    ['jade.1', 'elementalMastery', /元素精通提升([\d.]+)点/, 1, 100],
  ],
  silvershowerheartstrings: [
    ...[1, 2, 3].map(stacks => ['remedy' + stacks, 'hpPercent', /生命值上限提升([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, stacks]),
    ['remedy-burst', 'critRate', /元素爆发的暴击率提升([\d.]+)%/],
  ],
  slingshot: [['fast', 'damageBonus', /伤害增加([\d.]+)%/], ['slow', 'damageBonus', /伤害下降([\d.]+)%/, 1, -1]],
  songofbrokenpines: [
    ['attack', 'attackPercent', /一部分。攻击力提高([\d.]+)%/],
    ['banner-normalAttackSpeed', 'normalAttackSpeed', /揭旗之歌」效果：普通攻击速度提高([\d.]+)%/, 1, 1, 'team'],
    ['banner-attackPercent', 'attackPercent', /揭旗之歌」效果：普通攻击速度提高[\d.]+%，攻击力提升([\d.]+)%/, 1, 1, 'team'],
  ],
  sapwoodblade: [['leaf', 'elementalMastery', /拾取种识之叶的角色元素精通提升([\d.]+)点/, 1, 100, 'team']],
  talkingstick: [
    ['pyro', 'attackPercent', /火元素附着后的\d+秒内，攻击力提升([\d.]+)%/],
    ['other-elements', 'damageBonus', /水元素、冰元素、雷元素或草元素附着后的\d+秒内，所有元素伤害加成提升([\d.]+)%/],
  ],
  thefirstgreatmagic: [
    ...[1, 2, 3].map(stacks => ['gimmick-' + stacks, 'attackPercent', /攻击力提升([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, stacks]),
    ...[1, 2, 3].map(stacks => ['theatrics-' + stacks, 'movementSpeed', /移动速度提升([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, stacks]),
  ],
  thewidsith: [
    ['song-attackPercent', 'attackPercent', /宣叙调：攻击力提升([\d.]+)%/],
    ['song-damageBonus', 'damageBonus', /咏叹调：全元素伤害提升([\d.]+)%/],
    ['song-elementalMastery', 'elementalMastery', /间奏曲：元素精通提升([\d.]+)/, 1, 100],
  ],
  thrillingtalesofdragonslayers: [['handoff-attack', 'attackPercent', /新登场的角色攻击力提升([\d.]+)%/, 1, 1, 'team']],
  thunderingpulse: [1, 2, 3].map(stacks =>
    ['thunder' + stacks, 'damageBonus', /普通攻击造成的伤害提高([\d.]+)\/([\d.]+)\/([\d.]+)%/, stacks]),
  tulaytullahsremembrance: [['normal-speed', 'normalAttackSpeed', /^普通攻击速度提升([\d.]+)%/]],
  urakumisugiri: [
    ['defense', 'defensePercent', /装备者的防御力提升([\d.]+)%/],
    ['geo-normal', 'damageBonus', /普通攻击造成的伤害提升([\d.]+)%[^；]+；队伍中附近的角色在场上造成岩元素伤害后，上述效果进一步提升([\d.]+)%/, [1, 2], .01],
    ['geo-skill', 'damageBonus', /元素战技造成的伤害提升([\d.]+)%；队伍中附近的角色在场上造成岩元素伤害后，上述效果进一步提升([\d.]+)%/, [1, 2], .01],
  ],
  vividnotions: [
    ['dawn', 'critDamage', /初霞之彩」效果：下落攻击造成的暴击伤害提升([\d.]+)%/],
    ['twilight', 'critDamage', /苍暮之辉」效果：下落攻击造成的暴击伤害提升([\d.]+)%/],
  ],
  whiteblind: [
    ['normal-charged-stacks', 'attackPercent', /攻击力和防御力提高([\d.]+)%/],
    ['normal-charged-stacks.1', 'defensePercent', /攻击力和防御力提高([\d.]+)%/],
  ],
};

const setTraceReadings = {
  adaycarvedfromrisingwinds: [
    ['pastoral-favor', 'attackPercent', /攻击力提高([\d.]+)%/],
    ['pastoral-favor.1', 'critRate', /暴击率提升([\d.]+)%/],
  ],
  archaicpetra: ['pyro', 'hydro', 'cryo', 'electro'].map(element =>
    ['crystal-' + element, element + 'Bonus', /所有角色获得([\d.]+)%对应元素伤害加成/, 1, 1, 'team']),
  aubadeofmorningstarandmoon: [
    ['lunar-base', 'reaction.lunar.damageBonus', /队伍后台时，造成的月曜反应伤害提升([\d.]+)%/],
    ['lunar-full', 'reaction.lunar.damageBonus', /月兆等级至少为满辉时，造成的月曜反应伤害进一步提升([\d.]+)%/],
  ],
  berserker: [['4', 'critRate', /生命值低于70%时，暴击率额外提升([\d.]+)%/]],
  bloodstainedchivalry: [['vanquished', 'damageBonus', /重击造成的伤害提升([\d.]+)%/]],
  braveheart: [['4', 'damageBonus', /生命值高于50%的敌人，造成的伤害增加([\d.]+)%/]],
  celestialgift: Object.values(elemental).flatMap(element => [
    ['light-' + element, element + 'Bonus', /依据装备者的元素类型，使队伍中附近的所有角色获得([\d.]+)%对应元素伤害加成/, 1, 1, 'team'],
    ['hymn-owner-' + element, element + 'Bonus', /上述两种元素伤害加成提升至([\d.]+)%/, 1, 1, 'team'],
    ['hymn-field-' + element, element + 'Bonus', /上述两种元素伤害加成提升至([\d.]+)%/, 1, 1, 'team'],
  ]),
  crimsonwitchofflames: [
    ['transformative', 'reaction.transformative.damageBonus', /超载、燃烧、烈绽放反应造成的伤害提升([\d.]+)%/],
    ['amplifying', 'amplifyingReactionBonus', /蒸发、融化反应的加成系数提高([\d.]+)%/],
  ],
  desertpavilionchronicle: [
    ['after-charged', 'normalAttackSpeed', /重击命中敌人后，该角色的普通攻击速度提升([\d.]+)%/],
    ['after-charged.1', 'damageBonus', /普通攻击、重击与下落攻击造成的伤害提升([\d.]+)%/],
  ],
  finaleofthedeepgalleries: [
    ['normal', 'damageBonus', /普通攻击造成的伤害提升([\d.]+)%/],
    ['burst', 'damageBonus', /元素爆发造成的伤害提升([\d.]+)%/],
  ],
  fragmentofharmonicwhimsy: [['bond-stacks', 'damageBonus', /生命之契的数值提升或降低时，角色造成的伤害提升([\d.]+)%/]],
  goldentroupe: [
    ['skill', 'damageBonus', /^元素战技造成的伤害提升([\d.]+)%/],
    ['backstage', 'damageBonus', /队伍后台时，元素战技造成的伤害还将进一步提升([\d.]+)%/],
  ],
  heartofdepth: [['after-cast', 'damageBonus', /施放元素战技后的\d+秒内，普通攻击与重击造成的伤害提高([\d.]+)%/]],
  heartofthefurnace: [
    ['stellar-attack', 'attackPercent', /星烁反应伤害后的\d+秒内，攻击力提升([\d.]+)%/],
    ...['stellar-conduct', 'stellar-swirl'].map(family =>
      [family, 'reaction.' + family + '.damageBonus', /队伍中附近的所有角色造成的星烁反应伤害提升([\d.]+)%/, 1, 1, 'team']),
  ],
  instructor: [['reaction-mastery', 'elementalMastery', /触发元素反应后，队伍中所有角色的元素精通提高([\d.]+)点/, 1, 100, 'team']],
  maidenbeloved: [['after-cast', 'incomingHealingBonus', /队伍中所有角色受治疗效果加成提高([\d.]+)%/, 1, 1, 'team']],
  nightoftheskysunveiling: [
    ['moonlight-first', 'critRate', /初辉\/满辉时，暴击率提升([\d.]+)%\/([\d.]+)%/],
    ['moonlight-full', 'critRate', /初辉\/满辉时，暴击率提升([\d.]+)%\/([\d.]+)%/, [2, -1]],
    ['moonlight-lunar', 'reaction.lunar.damageBonus', /所有角色触发的月曜反应造成的伤害提升([\d.]+)%/, 1, 1, 'team'],
  ],
  nymphsdream: [1, 2, 3].flatMap(stacks => [
    ['nymph-attack-' + stacks, 'attackPercent', /攻击力将提高([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, stacks],
    ['nymph-hydro-' + stacks, 'hydroBonus', /水元素伤害加成提升([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, stacks],
  ]),
  obsidiancodex: [['nightsoul-consumed', 'critRate', /在场上消耗1点夜魂值后，暴击率提高([\d.]+)%/]],
  resolutionofsojourner: [['critRate', 'critRate', /^重击的暴击率提升([\d.]+)%/]],
  retracingbolide: [['damageBonus', 'damageBonus', /^处于护盾庇护下时，额外获得([\d.]+)%普通攻击和重击伤害加成/]],
  scrolloftheheroofcindercity: Object.values(elemental).flatMap(element => [
    ['base-' + element, element + 'Bonus', /所有角色的该元素反应相关的元素伤害加成提升([\d.]+)%/, 1, 1, 'team'],
    ['nightsoul-' + element, element + 'Bonus', /夜魂加持状态下，还将使队伍中附近的所有角色的与该元素反应相关的元素伤害加成提升([\d.]+)%/, 1, 1, 'team'],
  ]),
  silkenmoonsserenade: [
    ['moonlight-first', 'elementalMastery', /初辉\/满辉时，队伍中的所有角色的元素精通提高([\d.]+)点\/([\d.]+)点/, 1, 100, 'team'],
    ['moonlight-full', 'elementalMastery', /初辉\/满辉时，队伍中的所有角色的元素精通提高([\d.]+)点\/([\d.]+)点/, [2, -1], 100, 'team'],
    ['moonlight-lunar', 'reaction.lunar.damageBonus', /所有角色触发的月曜反应造成的伤害提升([\d.]+)%/, 1, 1, 'team'],
  ],
  thunderingfury: [
    ['transformative', 'reaction.transformative.damageBonus', /超载、感电、超导、超绽放反应造成的伤害提升([\d.]+)%/],
    ['aggravate', 'additiveReactionBonus', /超激化反应带来的伤害提升提高([\d.]+)%/],
    ['lunar-charged', 'reaction.lunar.damageBonus', /月感电、星超导反应造成的伤害提升([\d.]+)%/],
    ['stellar-conduct', 'reaction.stellar-conduct.damageBonus', /月感电、星超导反应造成的伤害提升([\d.]+)%/],
  ],
  tinymiracle: Object.values(elemental).map(element =>
    ['protect-' + element, 'resistance.' + element, /受到某个元素类型的伤害后，相应的抗性提升([\d.]+)%/]),
  viridescentvenerer: [
    ['swirl', 'reaction.transformative.damageBonus', /^扩散反应造成的伤害提升([\d.]+)%/],
    ['stellar-swirl', 'reaction.stellar-swirl.damageBonus', /星扩散反应造成的伤害提升([\d.]+)%/],
    ...['pyro', 'electro', 'hydro', 'cryo'].map(element =>
      ['shred-' + element, 'target.resistance.' + element, /降低受到影响的敌人([\d.]+)%的对应元素抗性/, 1, -1, 'target']),
  ],
};

function sourceSetModifier(text, target) {
  let match = /^获得([\d.]+)%([火水风雷草冰岩])元素伤害加成。$/.exec(text);
  if (match && target === stat(elemental[match[2]] + 'Bonus')) return { amount: Number(match[1]) / 100 };
  match = /^造成的物理伤害提高([\d.]+)%。$/.exec(text);
  if (match && target === stat('physicalBonus')) return { amount: +match[1] / 100 };
  match = /^(元素战技|下落攻击|普通攻击与重击)造成的伤害(?:提高|提升)([\d.]+)%。$/.exec(text);
  if (match && target === stat('damageBonus')) {
    const categories = { 元素战技: ['skill'], 下落攻击: ['plunge'], 普通攻击与重击: ['normal', 'charged'] }[match[1]];
    return { amount: +match[2] / 100, categories };
  }
  match = /^(所有元素|[火水风雷草冰岩]元素)抗性提高([\d.]+)%。$/.exec(text);
  const targets = match?.[1] === '所有元素' ? Object.values(elemental) : [elemental[match?.[1]?.[0]]];
  if (match && targets.filter(Boolean).some(element => target === stat('resistance.' + element))) return { amount: +match[2] / 100 };
  match = /^受到的([火水风雷草冰岩])元素附着效果的持续时间减少([\d.]+)%。$/.exec(text);
  if (match && target === stat('auraDurationReduction.' + elemental[match[1]])) return { amount: +match[2] / 100 };
  match = /^角色造成的治疗效果提升([\d.]+)%。$/.exec(text);
  if (match && target === stat('healingBonus')) return { amount: +match[1] / 100 };
  match = /^防御力提高([\d.]+)点。$/.exec(text);
  if (match && target === stat('defense')) return { amount: +match[1] };
}

function sameList(actual, expected) {
  return (actual?.length ?? 0) === (expected?.length ?? 0) && (expected ?? []).every(value => actual.includes(value));
}

function probeCase(row, actual = row.actual ?? row.value, expected = row.expected, settings = row.settings) {
  return { actual, expected, settings };
}

function auditSettings(row) {
  const { entity, actual, expected, issue, ...settings } = row;
  return settings;
}

function allPassed(cases) {
  return cases.length > 0 && cases.every(passing);
}

function captureCases(rows, active, inactive, describe = probeCase) {
  if (!allPassed(rows)) return;
  const positive = rows.find(active), negative = rows.find(inactive);
  if (positive && negative) return [describe(positive), describe(negative)];
}

/** Associate independent comparisons with the exact authored grant and modifier displayed in the calculator. */
export function registeredModifierEvidence(entities, results) {
  const output = new Map();
  const metadata = new Map([...entities.characters, ...entities.weapons, ...entities.sets].map(entity => [entity.id, entity.metadata ?? entity]));
  const menu = indexRows((results.calculator?.buffs ?? []).filter(row => row.listed && !row.issue), row => row.entity + row.field);
  const character = indexRows(results.characterBuffs?.rows, row => row.entity + row.field);
  const equipment = indexRows(results.equipmentContexts?.rows, row => row.entity + row.field);
  const setConditions = indexRows(results.setConditions?.rows, row => row.entity);
  const stockEquipment = indexRows(results.equipment?.rows, row => row.entity + row.field);
  const blessingReadings = indexRows(results.reactionBlessings?.rows, row => row.entity + row.field);

  function add(entity, field, id, modifier, target, audit, refs, scope, cases) {
    if (!cases || !allPassed(cases)) return;
    const pointer = field + '/modifiers/' + modifier;
    const key = entity + pointer;
    const choice = one(menu.get(key) ?? []);
    const grant = field.slice(1).split('/').reduce((value, part) => value?.[part], metadata.get(entity));
    const active = cases[0];
    if (choice?.id !== id || choice.target !== target || grant?.id !== id || grant.modifiers?.[modifier]?.target !== target
      || !Number.isFinite(active?.actual) || !Number.isFinite(active.expected) || active.actual === 0) return;
    if (output.has(key)) {
      const previous = output.get(key);
      previous.cases.push(...cases);
      previous.refs = [...new Set([...previous.refs, ...refs])];
      return;
    }
    output.set(key, { key, entity, field: pointer, id, modifier, target, audit, actual: active.actual, expected: active.expected, refs, scope, cases });
  }

  for (const [entity, owner, id, stats, role, category, duration, categories] of castReadings) {
    const field = owner + '/buffs/0';
    const grant = field.slice(1).split('/').reduce((value, part) => value?.[part], metadata.get(entity));
    if ((grant?.recipient ?? 'owner') !== (role === 'others' ? 'team' : role) || !!grant?.excludeOwner !== (role === 'others')) continue;
    for (const [i, target] of stats.entries()) {
      const rows = (character.get(entity + owner) ?? []).filter(row => row.settings.stat === target && 'skillId' in row.settings);
      const positive = s => s.unlocked && s.time === 1 && s.actorId === 'actor' && s.skillId === entity + '.' + category
        && (role === 'owner' ? s.recipient === 'actor' : s.recipient === 'peer0') && (!categories || categories.includes(s.category));
      const expired = s => s.unlocked && s.time === duration && s.actorId === 'actor' && s.skillId === entity + '.' + category
        && (role === 'owner' ? s.recipient === 'actor' : s.recipient === 'peer0') && (!categories || categories.includes(s.category));
      const cases = captureCases(rows, row => positive(row.settings) && row.expected !== 0,
        row => expired(row.settings) && row.expected === 0);
      add(entity, field, id, i, stat(target), 'characterBuffs', [characterRef(entity, owner)],
        '实际施放者、受益角色、解锁和持续时间的独立切换对照。', cases);
    }
  }

  for (const [entity, owner, id, target, select] of singleCharacterReadings) {
    const field = owner + '/buffs/0';
    const rows = (character.get(entity + owner) ?? []).filter(row => select(row.settings));
    const cases = captureCases(rows, row => row.expected > 0 && (row.settings.recipient ?? 'actor') === 'actor',
      row => row.expected === 0);
    add(entity, field, id, 0, stat(target), 'characterBuffs', [characterRef(entity, owner)],
      '原条款限定的实际角色、动作或状态与不生效读数。', cases);
  }

  const scaling = [
    ['dehya', '/constellations/0', 'dehya.the-flame-incandescent', 1, 'baseDamageBonus', 'dehya.skill.param1'],
    ['dehya', '/constellations/0', 'dehya.the-flame-incandescent', 2, 'baseDamageBonus', 'dehya.burst.param1'],
    ['tighnari', '/passives/1', 'tighnari.scholarly-blade', 0, 'damageBonus', 'tighnari.normal.param7'],
    ['tighnari', '/passives/1', 'tighnari.scholarly-blade', 1, 'damageBonus', 'tighnari.burst.param1'],
  ];
  for (const [entity, owner, id, index, target, hit] of scaling) {
    const rows = (character.get(entity + owner) ?? []).filter(row => row.settings.stat === target && row.settings.hit === hit);
    const cases = captureCases(rows, row => row.expected > 0 && row.settings.recipient === 'actor',
      row => row.expected === 0 && (row.settings.recipient === 'peer0' || row.settings.input === 0));
    add(entity, owner + '/buffs/0', id, index, stat(target), 'characterBuffs', [characterRef(entity, owner)],
      '相同属性的另一修饰器不匹配这个实际命中。用持有者的合法面板数值与空贡献分支对照。', cases);
  }

  const furina = 'furina';
  for (const [index, target] of ['damageBonus', 'incomingHealingBonus', 'hpPercent'].entries()) {
    const owner = index === 2 ? '/constellations/1' : '/constellations/0';
    const rows = (character.get(furina + owner) ?? []).filter(row => row.settings.stat === target
      && row.settings.rank === (index === 2 ? 2 : 0) && row.settings.changes?.length > 0);
    const role = index === 2 ? 'actor' : 'peer0';
    const cases = captureCases(rows, row => row.settings.recipient === role && row.settings.time === 10 && row.expected > 0,
      row => row.settings.recipient === role && row.settings.time === 18000 && row.expected === 0);
    add(furina, '/talents/2/buffs/0', 'furina.fanfare', index, stat(target), 'characterBuffs',
      [characterRef(furina, '/talents/2'), characterRef(furina, owner)],
      '十级爆发下以实际队伍生命变化累加，区分队员的增伤、受治疗和二命独有生命上限，核对到期归零。', cases);
  }

  const kokomi = 'sangonomiyakokomi';
  const garment = character.get(kokomi + '/passives/1') ?? [];
  for (const [index, category] of ['normal', 'charged'].entries()) {
    const rows = garment.filter(row => row.settings.ascension < 4 && row.settings.category === category);
    const caseFor = captureCases(rows, row => row.settings.recipient === 'actor' && row.settings.active && row.expected > 0,
      row => row.settings.recipient === 'actor' && !row.settings.active && row.expected === 0);
    add(kokomi, '/talents/2/buffs/0', kokomi + '.garment-damage', index, stat('baseDamageBonus'), 'characterBuffs',
      [characterRef(kokomi, '/talents/2')], '突破四前隔离仪来羽衣的普攻或重击生命值贡献，并检查仪来羽衣未启用。', caseFor);
  }
  const pearl = one(garment.filter(row => row.settings.ascension === 4 && row.settings.category === 'normal'
    && row.settings.recipient === 'actor' && row.settings.active));
  const garmentOnly = one(garment.filter(row => row.settings.ascension === 3 && row.settings.category === 'normal'
    && row.settings.recipient === 'actor' && row.settings.active));
  const noPearl = one(garment.filter(row => row.settings.ascension === 4 && row.settings.category === 'normal'
    && row.settings.recipient === 'actor' && !row.settings.active));
  if (pearl && garmentOnly && noPearl && allPassed([pearl, garmentOnly, noPearl])) {
    const { base, curve, promotion } = growth[kokomi].stats;
    const hp = base.hp * curves[60][curve.hp];
    const hpRatio = (hp + promotion[4].hp) / (hp + promotion[3].hp);
    add(kokomi, '/passives/1/buffs/0', kokomi + '.song-of-pearls', 0, stat('baseDamageBonus'), 'characterBuffs',
      [characterRef(kokomi, '/passives/1'), characterRef(kokomi, '/talents/2'),
        equipmentSource + 'characters.json#/' + kokomi + '/stats', equipmentSource + 'character-curves.json'],
      '将第三次突破的仪来羽衣普攻贡献按生命上限校正，用差分隔离第四次突破的治疗加成增量。',
      [probeCase(pearl, pearl.value - garmentOnly.value * hpRatio, pearl.expected - garmentOnly.expected * hpRatio,
        { ...pearl.settings, hpRatio }), probeCase(noPearl)]);
  }

  for (const [index, source] of blessings.entries()) {
    const entity = source.entity;
    const passive = metadata.get(entity)?.passives?.findIndex(row => row.id === entity + '.passive3');
    if (!Number.isInteger(passive) || passive < 0) continue;
    const owner = '/passives/' + passive;
    const grant = metadata.get(entity).passives[passive].buffs?.[0];
    if (grant?.id !== entity + '.reaction-blessing') continue;
    for (const [i, definition] of grant.modifiers.entries()) {
      const target = definition.target;
      if (grant.modifiers.filter(candidate => candidate.target === target).length !== 1) continue;
      const rows = (blessingReadings.get(entity + owner + '/buffs') ?? []).filter(row => row.target === target);
      const cases = captureCases(rows, row => row.expected > 0 && row.recipient === 'kaeya',
        row => row.family === 'ordinary' && row.expected === 0,
        row => probeCase(row, row.value, row.expected, { family: row.family, supplier: entity, recipient: row.recipient, weapon: row.weapon, basis: row.basis }));
      add(entity, owner + '/buffs/0', grant.id, i, target, 'reactionBlessings',
        [lifecyclePath + '#/reactionBlessings/' + index, characterRef(entity, owner)],
        '以独立条款的提供者面板、受益角色及指定反应族为输入，普通伤害贡献为零。', cases);
    }
  }

  for (const [action, suppliers] of Object.entries(staminaSuppliers)) for (const entity of suppliers) {
    const passive = metadata.get(entity)?.passives?.findIndex(row => row.buffs?.some(buff => buff.id === entity + '.stamina-' + action));
    if (!Number.isInteger(passive) || passive < 0) continue;
    const owner = '/passives/' + passive;
    const noDuplicate = row => row.settings.party?.length === 1 && row.settings.party[0] === 'jean' && row.settings.recipient === 'peer0';
    const rows = (character.get(entity + owner) ?? []).filter(noDuplicate);
    const cases = captureCases(rows, row => row.settings.action === action && row.expected > 0,
      row => row.settings.action !== action && row.expected === 0);
    add(entity, owner + '/buffs/0', entity + '.stamina-' + action, 0, stat('staminaCostReduction.' + action),
      'characterBuffs', [characterRef(entity, owner)], '将角色加入队伍后，对受益队员逐项区分体力消耗类型。', cases);
  }

  {
    const entity = 'raidenshogun', field = '/talents/1/buffs/0';
    const rows = character.get(entity + field) ?? [];
    const same = s => s.level === 10 && s.capacity === 60 && s.who === 'actor' && s.skill === entity + '.skill' && s.time === 1;
    const cases = captureCases(rows, row => same(row.settings) && row.settings.category === 'burst' && row.expected > 0,
      row => same(row.settings) && row.settings.category === 'skill' && row.expected === 0);
    add(entity, field, entity + '.eye', 0, stat('damageBonus'), 'characterBuffs', [characterRef(entity, field)],
      '实际消耗60能量的队员和十级恶曜之眼下，比较爆发与战技增伤。', cases);
  }

  for (const [entity, index, id, stats, holder] of equipmentReadings) {
    const field = '/buffs/' + index;
    for (const [i, target] of stats.entries()) {
      const rows = (equipment.get(entity + field) ?? []).filter(row => !row.settings.stat || row.settings.stat === target);
      const cases = [];
      const ranks = Object.keys(weapons[entity]?.metadata ?? {}).filter(key => /^r[1-5]$/.test(key));
      const lithic = entity === 'lithicblade' || entity === 'lithicspear';
      for (const rank of ranks) {
        const current = rows.filter(row => row.rank === +rank.slice(1));
        const solo = row => row.settings.others.length === 0 && !row.settings.recipient;
        const baseline = lithic && one(current.filter(row => solo(row) && row.settings.owner !== holder));
        const pair = captureCases(current, row => lithic ? solo(row) && row.settings.owner === holder
          : row.expected > 0 && row.settings.recipient !== 'peer0',
          row => lithic ? row === baseline : row.expected === 0,
          row => probeCase(row, row.value - (baseline?.value ?? 0), row.expected - (baseline?.expected ?? 0),
            { rank: row.rank, holder: row.settings.owner ?? holder, ...row.settings }));
        if (!pair) break;
        cases.push(...pair);
      }
      if (cases.length !== ranks.length * 2) continue;
      add(entity, field, id, i, stat(target), 'equipmentContexts', [equipmentSource + 'weapons.json#/' + entity + '/metadata'],
        '按各合法精炼档对照实际持有者、队伍或命中条件和排除分支。', cases);
    }
  }

  for (const [key, options] of menu) {
    const option = one(options);
    if (!option) continue;
    const { entity, field, target, id } = option;
    const match = /^(\/effects\/\d+)(\/buffs\/\d+)\/modifiers\/(\d+)$/.exec(field);
    if (!match) continue;
    const [, effectField, buffField, index] = match;
    const rows = stockEquipment.get(entity + effectField) ?? [];
    const equipped = one(rows.filter(row => row.kind === 'set' && row.count === row.pieces));
    const below = one(rows.filter(row => row.kind === 'set' && row.count === row.pieces - 1));
    if (!equipped || !below || equipped.issue || below.issue) continue;
    const original = sets[entity]?.['effect' + equipped.pieces + 'Pc'];
    const independent = sourceSetModifier(original, target);
    if (!independent || option.role !== 'owner' || !sameList(option.appliesTo?.categories, independent.categories)) continue;
    const rule = effectId(id, +index);
    const active = one((equipped.modifiers ?? []).filter(row => row.id === rule && row.target === target));
    if (!active?.excluded || active.issue || active.unverified?.length || below.grants?.includes(rule) !== false) continue;
    const refs = [equipmentSource + 'sets.json#/' + entity + '/effect' + equipped.pieces + 'Pc'];
    add(entity, effectField + buffField, id, +index, target, 'equipment', refs,
      '套装原文中的数值与精确授予贡献对照，同时检查少一件时不授予该效果。', [
        { actual: active.amount, expected: independent.amount, settings: { pieces: equipped.pieces, holder: equipped.hit, categories: independent.categories } },
        { actual: 0, expected: 0, settings: { pieces: below.count } },
      ]);
  }

  addEquipmentTrace();
  addTalentTable(add, indexRows(results.talentTable?.rows, row => row.entity + row.field));
  addSetConditions(add, setConditions);
  return [...output.values()];

  function addEquipmentTrace() {
    for (const options of menu.values()) {
      const option = one(options);
      if (!option) continue;
      const { entity, field, id, target } = option;
      const match = /^(\/effects\/\d+)?(\/buffs\/\d+)\/modifiers\/(\d+)$/.exec(field);
      if (!match) continue;
      const [, effectField, buffField, position] = match;
      const rules = effectField ? setTraceReadings[entity] : weaponTextReadings[entity];
      if (!rules) continue;
      const index = +position;
      const rule = effectId(id, index);
      const declaration = one(rules.filter(([suffix, key]) =>
        rule === entity + '.' + suffix && target === (key.startsWith('target.') ? key : stat(key))));
      if (!declaration) continue;
      const [, , pattern, captureIndex = 1, factor = 1, role = 'owner', oneRank] = declaration;
      if (option.role !== role) continue;
      const owner = effectField || '/buffs';
      const rows = stockEquipment.get(entity + owner) ?? [];
      const equipped = effectField ? rows.filter(row => row.count === row.pieces)
        : rows.filter(row => !oneRank || row.refinement === oneRank);
      const below = effectField && one(rows.filter(row => row.count === row.pieces - 1));
      if (!equipped.length || effectField && (!below || below.issue || below.grants?.includes(rule) !== false)) continue;
      const cases = [];
      const refs = new Set();
      for (const row of equipped) {
        if (row.issue) break;
        const sourceKey = effectField ? 'effect' + row.pieces + 'Pc' : 'r' + row.refinement;
        const original = effectField ? sets[entity]?.[sourceKey] : weapons[entity]?.metadata?.[sourceKey]?.description;
        if (!original) break;
        const wording = [...original.matchAll(new RegExp(pattern.source, 'g'))];
        const expected = capturedNumber(one(wording), captureIndex) * factor / 100;
        const active = one((row.modifiers ?? []).filter(reading => reading.id === rule && reading.target === target));
        if (!active?.excluded || active.issue || !close(active.amount, expected) || active.conditionExcluded === false
          || active.expired === false || active.unverified?.some(issue => issue !== '数值贡献缺少来源的独立对照')) break;
        const grant = ((effectField ?? '') + buffField).split('/').filter(Boolean).reduce((value, part) => value?.[part], metadata.get(entity));
        if (!grant || (grant.condition || grant.modifiers[index].condition) && active.conditionExcluded !== true
          || grant.trigger?.kind === 'event' && grant.lifetime?.kind === 'interval' && active.expired !== true
          || role === 'team' && grant.excludeOwner && !active.recipient) break;
        const holder = row.hit?.split('.')[0];
        const settings = { holder, recipient: active.recipient ?? (role === 'target' ? 'enemy' : holder),
          ...(effectField ? { pieces: row.pieces } : { refinement: row.refinement }),
          categories: option.appliesTo?.categories, reactions: option.appliesTo?.reactionIds, condition: grant.modifiers[index].condition ?? grant.condition,
          trigger: grant.trigger?.selector, state: 'active' };
        const exclusion = active.conditionExcluded ? 'condition-excluded' : active.expired ? 'expired' : below ? 'below-set-threshold' : 'grant-disabled';
        cases.push({ actual: active.amount, expected, settings },
          { actual: 0, expected: 0, settings: { ...settings, ...(below && exclusion === 'below-set-threshold' ? { pieces: below.count } : {}), state: exclusion } });
        refs.add(equipmentSource + (effectField ? 'sets.json#/' + entity + '/' + sourceKey
          : 'weapons.json#/' + entity + '/metadata/' + sourceKey + '/description'));
      }
      if (cases.length !== 2 * equipped.length) continue;
      add(entity, (effectField ?? '') + buffField, id, index, target, 'equipment', [...refs],
        '将独立原文中的数值与指定持有者、受益者和引擎授予编号下的单条贡献对照，保留排除读数。', cases);
    }
  }
}

function addTalentTable(add, groups) {
  function check(entity, field, grant, index, target, detail, readings, active, inactive, extract = probeCase) {
    const rows = (groups.get(entity + detail) ?? []).filter(readings);
    const cases = captureCases(rows, active, inactive, extract);
    add(entity, field, entity + '.' + grant, index, target, 'talentTable', [...new Set(rows.flatMap(row => row.sources ?? []))],
      '隔离原技能表该等级、当次受益者和相应条件的贡献，并保留关闭条件的实际读数。', cases);
  }
  const detail = (talent, row) => '/talents/' + talent + '/details/' + row;
  const teamGrant = row => row.rank === 1 && row.recipient === 'peer' && row.onField;
  check('alyosha', '/talents/1/buffs/0', 't1.hunter-precision-attack', 0, stat('attackPercent'), detail(1, 4),
    row => row.attribute === stat('attackPercent') && teamGrant(row) && row.constellation === 0 && row.stacks === 1,
    row => row.active && row.expected > 0, row => !row.active && row.expected === 0);
  {
    const rows = (groups.get('alyosha' + detail(1, 4)) ?? []).filter(row => row.attribute === stat('attackPercent')
      && row.rank === 13 && row.constellation === 6 && row.recipient === 'peer' && row.onField && row.active);
    const oneStack = one(rows.filter(row => row.stacks === 1));
    const twoStacks = one(rows.filter(row => row.stacks === 2));
    if (oneStack && twoStacks && allPassed(rows)) {
      add('alyosha', '/talents/1/buffs/0', 'alyosha.t1.hunter-precision-attack', 1, stat('attackPercent'), 'talentTable',
        twoStacks.sources, '同一位六命受益队员的两层与一层差分，隔离第二条猎者之准贡献。',
        [probeCase(twoStacks, twoStacks.value - oneStack.value, twoStacks.expected - oneStack.expected, auditSettings(twoStacks)),
          probeCase(oneStack, oneStack.value - oneStack.expected, 0, auditSettings(oneStack))]);
    }
  }

  check('cyno', '/talents/2/buffs/0', 't2.pactsworn-elemental-mastery', 0, stat('elementalMastery'), detail(2, 9),
    row => row.attribute === stat('elementalMastery') && row.rank === 1 && row.recipient === 'actor' && row.onField,
    row => row.active && row.expected > 0, row => !row.active && row.expected === 0);
  check('cyno', '/passives/1/buffs/0', 'a1.pactsworn-mastery', 0, stat('baseDamageBonus'), detail(2, 9),
    row => row.attribute === stat('baseDamageBonus') && row.rank === 10 && row.recipient === 'actor' && row.onField,
    row => row.active && row.expected > 0, row => !row.active && row.expected === 0);
  check('dehya', '/talents/1/buffs/0', 't1.fiery-sanctum-mitigation', 0, stat('incomingDamageReduction'), detail(1, 3),
    row => row.attribute === stat('incomingDamageReduction') && teamGrant(row) && row.inRange && row.eligible,
    row => row.fieldActive && row.expected > 0, row => !row.fieldActive && row.expected === 0);
  check('mika', '/talents/1/buffs/0', 't1.soulwind-attack-speed', 0, stat('normalAttackSpeed'), detail(1, 3),
    row => row.attribute === stat('normalAttackSpeed') && teamGrant(row),
    row => row.active && row.expected > 0, row => !row.active && row.expected === 0);

  const defense = (groups.get('eula' + detail(1, 3)) ?? []).filter(row => row.attribute === stat('defense') && row.rank === 1);
  const noGrimheart = one(defense.filter(row => row.stacks === 0));
  if (noGrimheart?.value > 0 && noGrimheart.expected > 0) {
    check('eula', '/talents/1/buffs/1', 't1.grimheart-defense', 0, stat('defensePercent'), detail(1, 3),
      row => defense.includes(row), row => row.stacks === 1, row => row === noGrimheart,
      row => probeCase(row, row.value / noGrimheart.value - 1, row.expected / noGrimheart.expected - 1, auditSettings(row)));
  }

  const huTao = (groups.get('hutao' + detail(1, 1)) ?? []).filter(row => row.attribute === stat('attack')
    && row.rank === 1 && row.weaponId === 'beginnersprotector' && row.onField);
  const normalAttack = one(huTao.filter(row => !row.active));
  if (normalAttack?.value > 0 && normalAttack.expected > 0) {
    check('hutao', '/talents/1/buffs/0', 't1.paramita-attack', 0, stat('attack'), detail(1, 1),
      row => huTao.includes(row), row => row.active, row => row === normalAttack,
      row => probeCase(row, row.value - normalAttack.value, row.expected - normalAttack.expected, auditSettings(row)));
  }

  check('razor', '/talents/1/buffs/0', 't1.electro-sigil-recharge', 0, stat('energyRecharge'), detail(1, 2),
    row => row.attribute === stat('energyRecharge') && row.rank === 1 && row.recipient === 'actor' && !row.energyBelowHalf,
    row => row.stacks === 3, row => row.stacks === 0,
    row => probeCase(row, row.value - 1, row.expected - 1, auditSettings(row)));
  check('razor', '/passives/1/buffs/0', 'a1.hunger-recharge', 0, stat('energyRecharge'), detail(1, 2),
    row => row.attribute === stat('energyRecharge') && row.rank === 10 && row.recipient === 'actor' && row.stacks === 0,
    row => row.energyBelowHalf, row => !row.energyBelowHalf,
    row => probeCase(row, row.value - 1, row.expected - 1, auditSettings(row)));
  for (const [index, attribute] of ['normalAttackSpeed', 'resistance.electro'].entries()) {
    check('razor', '/talents/2/buffs/0', 't2.wolf-within-benefits', index, stat(attribute), detail(2, 2 + index),
      row => row.attribute === stat(attribute) && row.rank === 1 && row.recipient === 'actor' && row.onField,
      row => row.active && row.expected > 0, row => !row.active && row.expected === 0);
  }

  for (const [index, element] of ['pyro', 'hydro', 'cryo', 'electro', 'geo'].entries()) {
    const target = 'target.resistance.' + element;
    check('xilonen', '/talents/1/buffs/' + Number(element !== 'geo'),
      element === 'geo' ? 't1.geo-sample-resistance' : 't1.converted-samples-resistance', element === 'geo' ? 0 : index,
      target, detail(1, 1), row => row.attribute === target && row.rank === 10 && row.recipient === 'peer',
      row => row.inRange && row.expected < .1, row => !row.inRange && row.expected === .1,
      row => probeCase(row, row.value - .1, row.expected - .1, auditSettings(row)));
  }
}

function addSetConditions(add, groups) {
  function check(entity, index, id, modifier, target, scope, cases) {
    add(entity, '/effects/1/buffs/' + index, entity + '.' + id, modifier, target, 'setConditions',
      [equipmentSource + 'sets.json#/' + entity + '/effect4Pc'], scope, cases);
  }

  for (const [entity, grant, category] of [['gladiatorsfinale', 'normal', 'normal'], ['wandererstroupe', 'charged', 'charged']]) {
    const rows = groups.get(entity) ?? [];
    const holder = entity === 'gladiatorsfinale' ? 'kaeya' : 'amber';
    const describe = row => probeCase(row, row.actual / row.threePieces - 1, row.expected / row.threePieces - 1, auditSettings(row));
    check(entity, 0, grant, 0, stat('damageBonus'), '比较同一持有者三件与四件的伤害倍率，并检查不适用的动作。',
      captureCases(rows, row => row.actor === holder && row.category === category && row.expected > row.threePieces,
        row => row.actor === holder && row.category === 'plunge' && row.expected === row.threePieces, describe));
  }

  const deepwood = groups.get('deepwoodmemories') ?? [];
  check('deepwoodmemories', 0, 'resistance', 0, 'target.resistance.dendro',
    '同一敌人的命中事件引起草抗变化，另一敌人与到期分支作排除。',
    captureCases(deepwood, row => row.category === 'skill' && row.target === 'enemy' && row.time === 1 && !row.refresh,
      row => row.category === 'skill' && row.target === 'elsewhere' && row.time === 1 && !row.refresh,
      row => {
        const resistanceChange = total => {
          const multiplier = .9 * total / row.baseline;
          return (multiplier > 1 ? 2 : 1) * (1 - multiplier) - .1;
        };
        return probeCase(row, resistanceChange(row.actual), row.target === 'enemy' ? -.3 : 0, auditSettings(row));
      }));

  const blizzard = groups.get('blizzardstrayer') ?? [];
  if (allPassed(blizzard)) {
    const cold = one(blizzard.filter(row => row.cryo && !row.frozen && !row.afterImpact));
    const frozen = one(blizzard.filter(row => row.cryo && row.frozen && !row.afterImpact));
    const off = one(blizzard.filter(row => !row.cryo && !row.frozen && !row.afterImpact));
    const critical = row => probeCase(row, 2 * (row.actual / row.noncritical - 1) - .05, (Number(row.cryo) + Number(row.frozen)) * .2, auditSettings(row));
    if (cold && off) check('blizzardstrayer', 0, 'cryo', 0, stat('critRate'), '克制冰附着的暴击率分支，用同一命中的非暴击与平均伤害差求值。',
      [critical(cold), critical(off)]);
    if (cold && frozen) {
      const ice = critical(cold), freeze = critical(frozen);
      check('blizzardstrayer', 1, 'frozen', 0, stat('critRate'), '在同样的冰附着条件上增加冻结，差分只归于冻结的额外暴击率。',
        [{ actual: freeze.actual - ice.actual, expected: freeze.expected - ice.expected, settings: { before: ice.settings, after: freeze.settings } },
          { actual: 0, expected: 0, settings: ice.settings }]);
    }
  }

  const ward = groups.get('defenderswill') ?? [];
  for (const [index, element] of ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'].entries()) {
    const rows = ward.filter(row => row.element === element);
    const cases = captureCases(rows, row => row.pieces === 4 && row.expected > 0 && (row.party?.includes(element) || element === 'cryo'),
      row => row.recipient === 'peer' && row.expected === 0,
      row => {
        const resonance = row.party?.length === 3 && new Set(['cryo', ...row.party]).size === 4 ? .15 : 0;
        return probeCase(row, row.actual - resonance, row.expected - resonance, auditSettings(row));
      });
    check('defenderswill', index, 'resistance.' + element, 0, stat('resistance.' + element),
      '队伍确有对应元素时扣除独立的共鸣基线，并检查无套装的队员。', cases);
  }

  for (const [i, target] of ['attackPercent', 'shieldStrength'].entries()) {
    const rows = (groups.get('tenacityofthemillelith') ?? []).filter(row => row.key === target && row.recipient === 'support');
    const soleHit = row => row.pieces === 4 && row.sources?.length === 1 && row.sources[0] === 'shield-impact';
    check('tenacityofthemillelith', 0, 'skill', i, stat(target), '持有者战技命中后另一队员的对应增益，与同一触发到期对照。',
      captureCases(rows, row => soleHit(row) && row.time === 2999 && row.expected > 0,
        row => soleHit(row) && row.time === 3000 && row.expected === 0, row => probeCase(row, row.actual, row.expected, auditSettings(row))));
  }

  const glow = groups.get('vourukashasglow') ?? [];
  const base = glow.find(row => row.pieces === 4 && row.recipient === 'actor' && row.category === 'skill' && row.sources?.length === 0);
  const stacked = glow.find(row => row.pieces === 4 && row.recipient === 'actor' && row.category === 'skill' && row.stacks === 5);
  const peer = glow.find(row => row.pieces === 4 && row.recipient === 'peer' && row.category === 'skill' && row.stacks === 5);
  if (base && stacked && peer && allPassed(glow)) {
    check('vourukashasglow', 0, 'base', 0, stat('damageBonus'), '四件套持有者未承伤时的战技基础增伤与非持有者对照。',
      [probeCase(base, base.actual, base.expected, auditSettings(base)), probeCase(peer, peer.actual, peer.expected, auditSettings(peer))]);
    check('vourukashasglow', 1, 'after-damage', 0, stat('damageBonus'), '同一持有者同类攻击，差分 5 层承伤增幅和无层数时的基础增伤。',
      [{ actual: stacked.actual - base.actual, expected: stacked.expected - base.expected, settings: auditSettings(stacked) },
        { actual: 0, expected: 0, settings: auditSettings(base) }]);
  }
}
