import { bool, number } from './roster-audit-settings.mjs';
import { readContentSource } from './content-source.mjs';

// Independent level-one expectations from tools/data/sources/catalog/genshin-db/sets.json.
const elementalSets = {
  physical: 'paleflame', anemo: 'viridescentvenerer', geo: 'archaicpetra', electro: 'thunderingfury',
  hydro: 'heartofdepth', pyro: 'crimsonwitchofflames', cryo: 'blizzardstrayer', dendro: 'deepwoodmemories',
};
const melee = ['WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE'];
const ranged = ['WEAPON_BOW', 'WEAPON_CATALYST'];
const attack = { id: 'gladiatorsfinale', pieces: 2, attack: .18 };
const hp = { id: 'tenacityofthemillelith', pieces: 2, hp: .20 };
const defense = { id: 'huskofopulentdreams', pieces: 2, defense: .30 };
const crit = { id: 'berserker', pieces: 2, critRate: .12 };
const categorySets = [
  { ...attack, pieces: 4, category: 'normal', weapons: melee, bonus: .35 },
  { id: 'wandererstroupe', pieces: 4, category: 'charged', weapons: ranged, bonus: .35 },
  { id: 'longnightsoath', pieces: 2, category: 'plunge', bonus: .25 },
  { id: 'goldentroupe', pieces: 2, category: 'skill', bonus: .20 },
  { id: 'noblesseoblige', pieces: 2, category: 'burst', bonus: .20 },
];
const elements = Object.entries(elementalSets).map(([element, id]) => ({ id, pieces: 2, element, bonus: element === 'physical' ? .25 : .15 }));
const pyro = elements.find(set => set.element === 'pyro');
const skill = categorySets.find(set => set.category === 'skill');
const burst = categorySets.find(set => set.category === 'burst');
const profiles = [
  [], [attack], [hp], [defense], [crit], [{ id: 'adventurer', pieces: 2, flatHp: 1000 }],
  [{ id: 'luckydog', pieces: 2, flatDefense: 100 }], [{ id: 'martialartist', pieces: 2, categories: ['normal', 'charged'], bonus: .15 }],
  ...elements.map(s => [s]), ...categorySets.map(s => [s]),
  [attack, pyro], [pyro, burst], [attack, hp], [attack, defense], [crit, skill],
];
const setSources = readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json', import.meta.url));
// The full catalog crosses each distinct clause. Identically worded 2-piece sources share
// one representative of each (category, element, scaling) combination for their wiring checks.
const aliases = [];
for (const [set, second] of profiles) {
  if (!set || second || set.pieces !== 2) continue;
  for (const [id, source] of Object.entries(setSources)) {
    if (id !== set.id && source.effect2Pc === setSources[set.id].effect2Pc) aliases.push([{ ...set, id }]);
  }
}
// R1, level one, full HP unless specified. No defeated target, healing or HP-change events.
const weaponBonuses = {
  rust: { categories: { normal: .40, charged: -.10 } }, thestringless: { categories: { skill: .24, burst: .24 } },
  theblacksword: { categories: { normal: .20, charged: .20 } }, wolfsgravestone: { attack: .20 },
  tomeoftheeternalflow: { hp: .16 }, staffofhoma: { hp: .20, hpToAttack: .008 },
};

// Values carried over from the talent regressions, independent of the compiled base expression.
const counts = new Map([
  ['lyney.skill.param1', ['lyney.propSurplus', 'attack', 1, 2, 5]],
  ['beidou.skill.param3', ['counterCharge', 'attack', 3, 4, 2]],
  ['shikanoinheizou.skill.param1', ['shikanoinheizou.declension', 'attack', 1, 2, 4, 3]],
  ['mualani.skill.param1', ['mualani.waveMomentum', 'hp', 1, 2, 3, 3]],
]);
const suffusion = new Map(['aether-hydro', 'lumine-hydro'].flatMap(id =>
  [[1, .328], [2, 1.8928], [3, .328]].map(([i, rate]) => [id + '.skill.param' + i, { rate, addsHp: i === 1 }])));
const categories = ['normal', 'charged', 'plunge', 'skill', 'burst'];

function excluded({ hit, source, declaration }) {
  if (!source || !declaration) return '非天赋直接声明的命中';
  if (!categories.includes(declaration.category ?? source.category)) return '其他伤害类型';
  if (!hit.damage.ordinary || Object.keys(hit.damage).length !== 1) return '反应或可变伤害族';
  if (hit.base.captures.length) return '锁面板';
  if (declaration.when?.length || declaration.elementBy || hit.coordinated) return '条件命中、可变元素或协同攻击';
  if (hit.id === 'yanfei.normal.param8') return '四枚丹火印需要六命';
  if (counts.has(hit.id)) return;
  if (!Array.isArray(declaration.base) || !declaration.base.length || declaration.base.some(term =>
    !['attack', 'hp', 'defense'].includes(term.stat) || Object.keys(term).some(k => !['stat', 'parameter', 'ratio'].includes(k)))) return '其他基础算式';
}

function inputsFor(hit) {
  if (suffusion.has(hit)) return [.49, .5, .50001, 1].map(health => ({ health }));
  const counter = counts.get(hit);
  if (counter) return Array.from({ length: counter[4] + 1 }, (_, count) => ({ count }));
  if (hit === 'mavuika.burst.param1') return [50, 125, 200].map(spirit => ({ spirit }));
  return [{}];
}

function oracle(character, entry, stats, input) {
  const { hit, declaration, source } = entry;
  const rank = character.id === 'tartaglia' && source.category === 'normal' ? 2 : 1;
  const rate = key => source.parameters.find(p => p.id === key)?.values[rank - 1];
  const hydro = suffusion.get(hit.id);
  if (hydro) return stats.attack * hydro.rate + (hydro.addsHp && input.health > .5 ? stats.hp * .0064 : 0);
  const counter = counts.get(hit.id);
  if (counter) {
    const [, stat, base, step, max, full] = counter;
    return stats[stat] * (rate('param' + base) + input.count * rate('param' + step) + (full && input.count === max ? rate('param' + full) : 0));
  }
  const base = declaration.base.reduce((sum, term) => sum + stats[term.stat] * (term.ratio ?? rate(term.parameter)), 0);
  return base + (input.spirit === undefined ? 0 : stats.attack * input.spirit * rate('param3'));
}

function configure(hit, input, frame) {
  if (input.health !== undefined) frame.factOverrides[0].facts.hpRatio = number('scalar', input.health);
  if (input.count !== undefined) frame.facts[counts.get(hit)[0]] = number('count', input.count);
  if (input.spirit !== undefined) frame.facts['mavuika.fightingSpirit'] = number('scalar', input.spirit);
}

export function auditOrdinaryHitProfiles(character, entries, starter, context) {
  const { weapons, characters, build, team, evaluate, record, whiteStat, seenAliases, unsampled } = context;
  const cases = [];
  for (const entry of entries) {
    const reason = excluded(entry);
    if (reason) {
      unsampled.push({ rule: 'ordinary-profiles', recipient: character.id, hit: entry.hit.id, category: entry.hit.category, reason });
      continue;
    }
    const { declaration, source } = entry;
    const category = declaration.category ?? source.category;
    const element = declaration.element ?? source.element;
    const scaling = [...new Set(declaration.base.map(term => term.stat))].sort().join('+');
    const signature = [category, element, scaling].join('/');
    const checkAliases = !seenAliases.has(signature);
    seenAliases.add(signature);
    for (const input of inputsFor(entry.hit.id)) cases.push({ entry, input, category, element, scaling, checkAliases, baseline: null });
  }
  if (!cases.length) return;
  const loadouts = profiles.map(sets => ({ rule: 'ordinary-profiles', sets, weapon: starter, samples: cases }));
  const bennett = characters.get('bennett');
  const sourceIsDealer = character.id === bennett.id;
  const support = build(sourceIsDealer ? characters.get('kaeya') : bennett);
  const inspiration = whiteStat(bennett, weapons.get('dullblade'), 'attack') * .56;
  for (const sets of [[], [attack, pyro]]) for (const field of [false, true]) {
    loadouts.push({ rule: 'ordinary-party', sets, weapon: starter, field, samples: cases });
  }
  const representatives = cases.filter(s => s.checkAliases);
  if (representatives.length) loadouts.push(...aliases.map(sets => ({ rule: 'ordinary-equivalent-sets', sets, weapon: starter, samples: representatives })));
  for (const id of Object.keys(weaponBonuses)) {
    const weapon = weapons.get(id);
    if (weapon.weaponType === character.identity.weaponType) {
      for (const sets of [[], [attack, pyro], [crit, skill]]) loadouts.push({ rule: 'ordinary-weapons', sets, weapon, samples: cases });
    }
  }
  for (const { rule, sets, weapon, samples, field } of loadouts) {
    const gear = sets.map(set => [set.id, set.pieces]);
    const party = team(build(character, gear, weapon), field === undefined ? undefined : support);
    const profile = gear.map(([id, pieces]) => id + '/' + pieces).join('+') || 'baseline';
    const passive = weaponBonuses[weapon.id] ?? {};
    const secondary = weapon.stat ? weapon.baseStat * weapon.statCurve[1] : 0;
    const stats = {};
    for (const key of ['hp', 'defense', 'attack']) {
      const percent = sets.reduce((sum, set) => sum + (set[key] ?? 0), passive[key] ?? 0);
      stats[key] = whiteStat(character, weapon, key) * (1 + percent + (weapon.stat === key + 'Percent' ? secondary : 0));
    }
    stats.hp += sets.reduce((sum, set) => sum + (set.flatHp ?? 0), 0);
    stats.defense += sets.reduce((sum, set) => sum + (set.flatDefense ?? 0), 0);
    stats.attack += stats.hp * (passive.hpToAttack ?? 0);
    const mode = sets.includes(crit) ? 'expected' : 'noncritical';
    const baseCrit = character.attributes.base.critRate + (weapon.stat === 'critRate' ? secondary : 0) - (character.id === 'sangonomiyakokomi' ? 1 : 0);
    const cd = character.attributes.base.critDamage + (weapon.stat === 'critDamage' ? secondary : 0);
    const critFactor = mode === 'expected' ? 1 + Math.max(0, Math.min(1, baseCrit + crit.critRate)) * cd : 1;
    for (const sample of samples) {
      const { entry, input, element, category, scaling } = sample;
      const bonus = sets.filter(set => (!set.element || set.element === element) && (!set.category || set.category === category)
        && (!set.categories || set.categories.includes(category)) && (!set.weapons || set.weapons.includes(character.identity.weaponType)))
        .reduce((sum, set) => sum + (set.bonus ?? 0), passive.categories?.[category] ?? 0);
      const buffed = field && (input.health ?? 1) > .70 ? { ...stats, attack: stats.attack + inspiration } : stats;
      const expected = oracle(character, entry, buffed, input) * .45 * (1 + bonus) * critFactor;
      const actual = evaluate(party, character, entry, mode, (setup, frame) => {
        configure(entry.hit.id, input, frame);
        if (weapon.id === 'wolfsgravestone') frame.factOverrides[0].facts['wolfsgravestone.low-target-hitActive'] = bool(false);
        if (field !== undefined) {
          setup.events[0].timeMs = 1000;
          setup.events.unshift({ id: 'cast', kind: 'action', actorId: sourceIsDealer ? 'actor' : 'peer', targetIds: [],
            timeMs: 0, order: 0, category: 'burst', skillId: 'bennett.burst', sourceEventIds: [], facts: {} });
          frame.factOverrides[0].facts['bennett.inField'] = bool(field);
          frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: {
            onField: bool(false), 'bennett.inField': bool(false), hpRatio: number('scalar', 1),
          } });
        }
      });
      if (!sets.length && weapon === starter && field === undefined) sample.baseline = actual;
      record(rule, character, entry, { profile, weapon: weapon.id, element, scaling, mode, ...input,
        ...(field !== undefined && { source: bennett.id, field }) }, actual, expected, sample.baseline);
    }
  }
}
