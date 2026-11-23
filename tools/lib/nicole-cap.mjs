import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, number } from './roster-audit-settings.mjs';

const evidencePath = 'tools/data/sources/catalog/nicole-kenosis.json';
const fixed = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const evidence = read(evidencePath);
const talentsPath = fixed + 'stats/talents.json';
const { nicole: { combat2: skill }, bennett: { combat3: burst } } = read(talentsPath);
const characters = read(catalog + 'characters.json');
const characterCurves = read(catalog + 'character-curves.json');
const weapons = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const sets = read(catalog + 'sets.json');
const foodId = 'scene.food.adeptustemptation.delicious';
const food = read('src/game-data/data/calculation/battle-scenes.json').find(definition => definition.id === foodId);
const { entity, field } = evidence;
const sources = [evidencePath, ...Object.values(evidence.sources), fixed + 'ChineseSimplified/talents/nicole.json#combat2',
  fixed + 'ChineseSimplified/constellations/nicole.json#c2', talentsPath + '#nicole/combat2', talentsPath + '#bennett/combat3/param4',
  ...['nicole', 'sucrose', 'bennett'].map(id => catalog + 'characters.json#' + id),
  ...['memoryofdust', 'thrillingtalesofdragonslayers', 'dullblade'].map(id => catalog + 'weapons.json#' + id),
  ...['gladiatorsfinale', 'shimenawasreminiscence', 'noblesseoblige'].map(id => catalog + 'sets.json#' + id),
  catalog + 'character-curves.json', catalog + 'weapon-curves.json',
  'tools/data/sources/catalog/battle-scenes.json#' + foodId];
const attack = { kind: 'attribute', actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' },
  key: { id: 'attribute.attack', namespace: 'builtin', revision: '1' } };
const percent = text => Number(text.match(/(\d+)%/)[1]) / 100;
const amount = growth => growth.data.base.attack * growth.curves[growth.level][growth.data.curve.attack]
  + growth.data.promotion[growth.ascension].attack;
const white = build => amount({ data: characters[build.character.id].stats, curves: characterCurves, level: build.level, ascension: build.ascension })
  + amount({ data: weapons[build.weapon.id].stats, curves: weaponCurves, level: build.weaponLevel, ascension: build.weaponAscension });
const weaponRate = (id, index) => percent(weapons[id].metadata.r5.values[index]);
const scope = '以施放前的非额外攻击力锁定虚己之赐，核对封顶两侧、二命独立加攻、重施放时清除旧加成以及到期。';

const recipes = {
  characters: ['nicole', 'sucrose', 'bennett', 'zhongli'],
  weapons: ['memoryofdust', 'thrillingtalesofdragonslayers', 'dullblade', 'beginnersprotector'],
  sets: ['gladiatorsfinale', 'shimenawasreminiscence', 'noblesseoblige'],
};

const owner = 'actor', peer = 'peer';
const firstCast = 6000, nextCast = firstCast + skill.param8[0] * 1000;

function conditions({ layers = 0, shielded = false, handedOff = false, inField = false, upgraded = false } = {}) {
  return [
    { subject: { kind: 'actor', id: owner }, values: { onField: bool(true), shielded: bool(shielded), hpRatio: number('scalar', 1),
      'memoryofdust.attackLayers': number('count', layers), 'thrillingtalesofdragonslayers.switchRecipient': bool(handedOff),
      'nicole.blessedDirection': bool(upgraded), 'bennett.inField': bool(inField) } },
    { subject: { kind: 'actor', id: peer }, values: { onField: bool(false), 'nicole.blessedDirection': bool(false),
      'bennett.inField': bool(false), 'thrillingtalesofdragonslayers.switchRecipient': bool(false) } },
  ];
}

function action(id, actorId, skillId, timeMs, subjectFacts = []) {
  return { id, kind: 'action', actorId, skillId, timeMs, order: 0, targetIds: [], sourceEventIds: [], facts: {}, subjectFacts };
}

/** Attribute read through the public evaluator using a legal team, source totals and explicit cast conditions. */
export function auditNicoleCap(entities, engine) {
  const rows = [], resolved = [], gaps = [], verified = new Set();
  const audit = { rows, resolved, gaps, verified };
  const find = (group, id) => entities[group]?.find(entry => entry.id === id);
  if (Object.entries(recipes).some(([group, ids]) => ids.some(id => !find(group, id)))) return audit;

  const [gladiator, shimenawa, noblesse] = recipes.sets.map(id => find('sets', id));
  const build = (id, weapon, selectedSets) => auditBuild(find('characters', id), find('weapons', weapon), selectedSets);
  const caster = { ...build('nicole', 'memoryofdust', [gladiator, shimenawa]), level: 90, ascension: 6,
    weaponLevel: 90, weaponAscension: 6, refinement: 5, theoreticalSetSlots: [
      { slot: 'flower', setId: gladiator.id }, { slot: 'plume', setId: gladiator.id },
      { slot: 'sands', setId: shimenawa.id }, { slot: 'goblet', setId: shimenawa.id },
    ] };
  const recipient = { ...build('sucrose', 'thrillingtalesofdragonslayers'), refinement: 5 };
  const bennett = { ...build('bennett', 'dullblade', [noblesse]), level: 90, ascension: 6, weaponLevel: 70, weaponAscension: 4,
    talents: { normal: 1, skill: 1, burst: 10 }, theoreticalSetSlots: noblesse.slots.slice(0, 4).map(slot => ({ slot, setId: noblesse.id })) };
  const zhongli = build('zhongli', 'beginnersprotector');
  const foodAttack = evidence.attackProperties.SERVER_Atk_Team_Modifier_lv5_3.Actor_AttackDelta;
  const baseCasterAttack = white(caster);
  const weapon = weapons.memoryofdust.stats;
  const attackAscension = characters.nicole.stats.promotion[6].specialized;
  const equippedAttack = weapon.base.specialized * weaponCurves[90][weapon.curve.specialized] + (weapon.promotion[6].specialized ?? 0);
  const staticAttack = attackAscension + equippedAttack + percent(sets.gladiatorsfinale.effect2Pc) + percent(sets.shimenawasreminiscence.effect2Pc);
  const resonance = 0.25, noblesseRate = percent(sets.noblesseoblige.effect4Pc);
  const permanentAttack = baseCasterAttack * (1 + staticAttack + resonance) + foodAttack;
  const temporaryAttack = layers => baseCasterAttack * (noblesseRate + weaponRate('thrillingtalesofdragonslayers', 0)
    + layers * weaponRate('memoryofdust', 1) * 2);
  const bennettAttack = white(bennett) * burst.param4[9];
  const baseRecipientAttack = white(recipient);
  const recipientAttack = baseRecipientAttack * (1 + resonance) + foodAttack;
  const constellationText = read(fixed + 'ChineseSimplified/constellations/nicole.json').c2.description;
  const extraC2 = Number(constellationText.match(/额外提升(\d+)点攻击力/)[1]);

  for (const constellation of [0, 2]) for (const rank of [1, 10]) {
    const prepared = engine.prepareStructuredBuilds([
      { id: owner, build: { ...caster, constellation, talents: { normal: 1, skill: rank, burst: 1 } } },
      { id: peer, build: recipient }, { id: 'bennett', build: bennett }, { id: 'zhongli', build: zhongli },
    ], [], [{ definition: food, startMs: 0, endMs: food.durationMs }]);
    if (!prepared.ok) throw new Error('nicole cap: ' + JSON.stringify(prepared.diagnostics));
    const rate = skill.param5[rank - 1], cap = skill.param6[rank - 1], flat = constellation === 2 ? extraC2 : 0;
    const duration = skill.param7[rank - 1] * 1000;
    const resultantBonus = basis => Math.min(basis * rate, cap) + flat;

    for (const layers of [4, 5]) {
      const initialBasis = permanentAttack + temporaryAttack(layers);
      const firstBonus = resultantBonus(initialBasis), nextBonus = resultantBonus(permanentAttack);
      if ((initialBasis > cap / rate) !== (layers === 5) || initialBasis + bennettAttack <= cap / rate) {
        throw new Error('Nicole 的合法设定须分别覆盖封顶两侧，班尼特的额外攻击须能区分读取口径。');
      }
      const activeFacts = conditions({ layers, shielded: true, handedOff: true, inField: true });
      const oldBlessing = conditions({ upgraded: true });
      const initial = action('first-skill', owner, 'nicole.skill', firstCast, activeFacts);
      const refresh = action('next-skill', owner, 'nicole.skill', nextCast, oldBlessing);
      const { setup, request } = auditHit(caster.character, caster.character.talents[0], caster.character.talents[0].hits[0]);
      const bennettCast = { ...action('burst', 'bennett', 'bennett.burst', 1000), category: 'burst' };
      const trials = [
        { check: 'before-cast', event: initial, expected: 0, active: true, basis: initialBasis },
        { check: 'first-cast', timeMs: firstCast + 1, expected: firstBonus, active: true, basis: initialBasis },
        { check: 'same-snapshot', timeMs: 17000, expected: firstBonus, basis: initialBasis },
        { check: 'before-refresh', event: refresh, expected: firstBonus, upgraded: true, basis: initialBasis },
        { check: 'refresh', timeMs: nextCast + 1, expected: nextBonus, basis: permanentAttack },
        { check: 'expiry', timeMs: nextCast + duration, expected: 0 },
      ];
      for (const trial of trials) for (const recipientId of [owner, peer]) {
        const event = trial.event ?? { ...setup.events[0], timeMs: trial.timeMs, order: 1,
          subjectFacts: trial.active ? activeFacts : conditions() };
        const events = [bennettCast, initial, refresh].filter(entry => entry.timeMs < event.timeMs).concat(event);
        const context = engine.createStructuredCombatContext(prepared.team, { ...setup, events });
        const frame = { ...request.frame, eventId: event.id, phase: 'before', ownerId: recipientId, recipientId,
          contributorId: null, hit: null, factOverrides: [] };
        const result = engine.evaluateCombatBindings(prepared.team.program, context, { attack }, frame);
        const state = result.outputs.attack?.state;
        const unscaled = recipientId === owner ? permanentAttack + (trial.active ? temporaryAttack(layers) + bennettAttack : 0)
          + (trial.upgraded ? extraC2 : 0) : recipientAttack + (trial.active ? baseRecipientAttack * noblesseRate : 0);
        const total = state === 'known' ? result.outputs.attack.value.value : null;
        const value = total === null ? null : total - unscaled;
        rows.push({ entity, field, output: 'attribute.attack', rank, constellation, layers, recipient: recipientId, check: trial.check,
          basis: trial.basis ?? null, cap, timeMs: event.timeMs, expected: trial.expected, value, status: state, sources,
          ...(value === null || Math.abs(value - trial.expected) > evidence.tolerance ? {
            issue: '虚己之赐的当次攻击力贡献与独立算式不符。', diagnostics: result.diagnostics, unscaled, total,
          } : {}) });
      }
    }
  }
  if (rows.every(row => !row.issue)) {
    verified.add(entity + field);
    resolved.push({ entity, field, resolved: scope, remaining: '正式游戏录像及联机距离判定另验。', sources });
  } else gaps.push({ entity, field, status: 'needs-review', reason: '虚己之赐的封顶、施放时的锁定基准或重施放行为仍需复核。', sources });
  return audit;
}
