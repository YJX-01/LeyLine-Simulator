import { assembleCalculationLibrary } from './calculation-library.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, bool, elements, fact, number } from './roster-audit-settings.mjs';

export const ifaRescueReactionCharacterIds = ['ifa', 'sucrose', 'xingqiu', 'ororon', 'ineffa', 'sandrone'];
export const ifaRescueReactionWeaponIds = ['apprenticesnotes', 'magicguide', 'dullblade', 'huntersbow', 'beginnersprotector', 'wastergreatsword'];

const evidence = 'tools/data/sources/catalog/ifa-rescue-reactions.json';
const advancedFormulas = 'tools/data/sources/kqm-web/2026-11-15/reaction-formulas.json';
const levels = 'tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/player.json';
const characterGrowth = 'tools/data/sources/catalog/genshin-db/characters.json';
const characterCurves = 'tools/data/sources/catalog/genshin-db/character-curves.json';
const weaponGrowth = 'tools/data/sources/catalog/genshin-db/weapons.json';
const ineffaTalents = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/ineffa.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const { rule, ordinaryReactionFormula, gameData } = read(evidence);
const { rankedAggregation, eventFacts, constants } = read(advancedFormulas);
const levelMultipliers = read(levels);
const growth = read(characterGrowth);
const curves = read(characterCurves);
const weaponsSource = read(weaponGrowth);
const ineffaDischargeRatio = Number(read(ineffaTalents).passive1.description.match(/攻击力(\d+)%/)?.[1]) / 100;
const reactionRules = assembleCalculationLibrary(read('src/game-data/data/calculation/common.json'), read('src/game-data/data/calculation/reactions.json'), []);
const owners = {
  ifa: 'apprenticesnotes', sucrose: 'magicguide', xingqiu: 'dullblade', ororon: 'huntersbow', ineffa: 'beginnersprotector', sandrone: 'wastergreatsword',
};
const resistances = Object.fromEntries(elements.map(element => [element, element === 'cryo' ? .25 : .1]));
const cap = rule.baseCap + rule.c2CapIncrease;
const constant = (formula, node) => constants.find(entry => entry.formula === formula && entry.node === node).value;
const masteryScale = (family, em) => {
  const numerator = constant(family + '-em-bonus', 'numerator');
  const denominator = constant(family + '-em-bonus', 'denominator');
  return numerator * em / (denominator + em);
};
const quantity = value => value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null;
const close = (actual, expected) => actual !== null && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const unresolved = '自动夜魂值累加与消耗、刷新范围及离开范围的残留、延迟反应采样待受控逐帧观测。固定配置显示每0.5秒检查距离40内的队员，修饰器持续3秒；当次查询使用明确确认的加持、队伍夜魂值和受益资格。';
const fieldA1 = '/passives/0', fieldC2 = '/constellations/1';

/** Independent damage expectations for explicitly attributed reactions. */
export function auditIfaRescueReactions(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const available = ids => ids.every(id => characters.has(id) && weapons.has(owners[id]));

  function attack(id, ascension) {
    const { base, curve, promotion } = growth[id].stats;
    const level = ascension ? 20 : 1;
    return base.attack * curves[level][curve.attack] + promotion[ascension].attack + weaponsSource[owners[id]].stats.base.attack;
  }
  const blessing = (id, ascension = 0) => 1 + Math.min(.14, .00007 * attack(id, ascension));
  const near = value => value === null ? fact(null) : bool(value);
  const pointsFact = value => value === null ? fact(null) : number('scalar', value);
  const mastery = id => id === 'sucrose' ? weaponsSource.magicguide.stats.base.specialized : 0;
  const sources = [evidence, levels, advancedFormulas, characterGrowth, weaponGrowth];
  const bonus = (family, points) => points * (rule.bonusPerPoint[family] ?? 0);
  const ordinary = (family, element, actor, points) => {
    const em = mastery(actor);
    return ordinaryReactionFormula.coefficients[family] * levelMultipliers[actor === 'ifa' ? 20 : 1]
      * (1 + ordinaryReactionFormula.masteryNumerator * em / (ordinaryReactionFormula.masteryDenominator + em) + bonus(family, points))
      * (1 - resistances[element]);
  };

  function probe({ family, element, ids, dealer, coefficient, recipients = { [dealer]: true }, provider, direct },
    { rank = 0, ascension = 1, points = 80, active = true, omitIfa = false, expectedPoints }) {
    const members = omitIfa ? ids : ['ifa', ...ids];
    if (!available(members)) return;
    const actors = members.map(id => {
      const build = auditBuild(characters.get(id), weapons.get(owners[id]));
      const stage = id === 'ifa' ? ascension : id === dealer ? direct?.ascension ?? 0 : 0;
      return { id, character: id, weapon: owners[id], build: {
        ...build, level: stage ? 20 : 1, ascension: stage, constellation: id === 'ifa' ? rank : 0,
      }, inputs: {} };
    });
    const build = actors[0].build;
    const definitions = [...new Set(members.flatMap(id => [id, owners[id]]))].map(id => ({ id, name: id, version: '1',
      source: { kind: 'preset', reference: build.dataVersion, verified: false }, nodes: [], effects: [] }));
    definitions.push({ id: 'reaction-query', name: 'reaction-query', version: '1',
      source: { kind: 'user', reference: 'ifa-rescue-reactions', verified: false },
      nodes: [{ id: 'result', op: 'game-damage' }], damage: 'result', effects: [] });
    const contributors = Object.entries(recipients).map(([actorId, recipient]) => ({
      actorId, qualified: true, crit: 'noncritical', facts: { 'ifa.rescueRecipient': near(recipient) },
    }));
    const scope = [
      { subject: { kind: 'actor', id: 'ifa' }, values: { 'ifa.rescueNightsoulBlessing': near(active) } },
      { subject: { kind: 'team' }, values: { 'ifa.rescueTeamNightsoul': pointsFact(points) } },
    ];
    const event = { id: 'reaction', kind: 'damage', actor: dealer, timeMs: 1, order: 1, definition: 'reaction-query' };
    if (direct) {
      const owner = characters.get(dealer);
      event.damage = { hit: { definition: { group: 'characters', namespace: owner.namespace, id: dealer, revision: owner.revision }, hitId: direct.hitId },
        crit: 'noncritical', reaction: 'none', facts: [...scope,
          { subject: { kind: 'actor', id: dealer }, values: { ...direct.ownerFacts, 'ifa.rescueRecipient': near(recipients[dealer]) } },
          { subject: { kind: 'target', id: 'target' }, values: { 'aura.hydro': bool(false), 'aura.electro': bool(false) } },
          ...(direct.queryFacts ? [{ subject: { kind: 'event' }, values: direct.queryFacts }] : []),
        ] };
    } else {
      event.reactionEvent = { family, element, triggerActorId: dealer, ...(coefficient !== undefined && { coefficient }),
        facts: omitIfa ? [] : scope, contributors };
    }
    const project = { schemaVersion: build.schemaVersion, rulesVersion: 'timeline-v1', id: 'ifa-rescue-audit', revision: '1',
      definitions, candidate: { id: 'team', actors }, conditions: {}, reactionRules,
      enemy: { level: 1, defenseReduction: 0, defenseIgnore: 0, resistances }, timeline: [event], objective: {} };
    const result = engine.evaluateTimeline(project);
    const damage = result.points[0]?.real?.structured?.totals.all;
    const value = quantity(damage), status = damage?.state ?? result.status;
    const familyType = family === 'lunar-charged' ? 'lunar' : 'stellar';
    const currentPoints = recipients[dealer] ? expectedPoints : 0;
    let expected = null;
    if (expectedPoints !== null) {
      if (direct) {
        const reactionCoefficient = constant(family + '-direct', 'reactionCoefficient');
        expected = attack(dealer, direct.ascension) * direct.ratio * reactionCoefficient * blessing(provider, direct.ascension)
          * (1 + masteryScale(familyType, mastery(dealer)) + bonus(family, currentPoints)) * (1 - resistances[element]);
      } else if (coefficient !== undefined || family === 'lunar-charged') {
        const reactionCoefficient = coefficient ?? constant('lunar-charged-individual', 'reactionCoefficient');
        const contributions = Object.entries(recipients).map(([actor, nearby]) => reactionCoefficient * levelMultipliers[actor === 'ifa' ? 20 : 1]
          * blessing(provider) * (1 + masteryScale(familyType, mastery(actor)) + bonus(family, nearby ? expectedPoints : 0)) * (1 - resistances[element]));
        expected = contributions.sort((a, b) => b - a).reduce((sum, part, index) => sum + part * rankedAggregation.weights[index], 0);
      } else {
        expected = ordinary(family, element, dealer, currentPoints);
      }
    }
    const matches = expected === null ? status === 'unknown' : close(value, expected);
    rows.push({ entity: 'ifa', field: rank >= 2 ? fieldC2 : fieldA1, output: 'reaction-damage',
      probe: { family, element, rank, ascension, points, active, dealer, recipients, ...(omitIfa && { omitIfa }), ...(direct && { hitId: direct.hitId }) },
      sources: [...sources, ...direct?.sources ?? []], expected, value, status, ...matches ? {} : { issue: '救援要义的反应伤害与固定配置及独立算式不符。', diagnostics: result.diagnostics } });
  }

  const cases = [
    { family: 'swirl', element: 'cryo', ids: ['sucrose', 'ororon'], dealer: 'sucrose' },
    { family: 'electro-charged', element: 'electro', ids: ['xingqiu', 'ororon'], dealer: 'xingqiu' },
    { family: 'lunar-charged', element: 'electro', ids: ['xingqiu', 'ororon', 'ineffa'], dealer: 'xingqiu', provider: 'ineffa' },
    { family: 'stellar-swirl', element: 'cryo', ids: ['sucrose', 'ororon', 'sandrone'], dealer: 'sucrose', provider: 'sandrone',
      coefficient: eventFacts.stellarSwirlReactionCoefficients.cryoLevel1 },
  ];
  const threshold = rule.c2Threshold;
  const capTrigger = threshold + (cap - threshold) / (rule.pointsPerNightsoul + rule.c2AdditionalPointsPerExcess);
  for (const entry of cases) {
    for (const settings of [
      { points: 0, expectedPoints: 0 },
      { points: 80, expectedPoints: 80 },
      { points: rule.baseCap + 1, expectedPoints: rule.baseCap },
      { rank: 2, points: threshold - 1, expectedPoints: threshold - 1 },
      { rank: 2, points: threshold, expectedPoints: threshold },
      { rank: 2, points: threshold + 1, expectedPoints: threshold + 1 + rule.c2AdditionalPointsPerExcess },
      { rank: 2, points: capTrigger - 1, expectedPoints: cap - rule.pointsPerNightsoul - rule.c2AdditionalPointsPerExcess },
      { rank: 2, points: capTrigger, expectedPoints: cap },
      { rank: 2, points: capTrigger + 1, expectedPoints: cap },
      { rank: 2, ascension: 0, expectedPoints: 0 },
      { rank: 2, points: null, active: false, expectedPoints: 0 },
      { points: null, expectedPoints: null },
    ]) probe(entry, settings);
  }
  const [swirl, , lunar, stellar] = cases;
  probe({ ...swirl, ids: ['ororon'], dealer: 'ifa' }, { expectedPoints: 80 });
  probe({ ...swirl, recipients: { sucrose: false } }, { rank: 2, expectedPoints: 0 });
  probe({ ...swirl, recipients: { sucrose: null } }, { expectedPoints: null });
  probe(swirl, { active: null, expectedPoints: null });
  probe(swirl, { omitIfa: true, expectedPoints: 0 });
  probe({ family: 'overloaded', element: 'pyro', ids: ['ororon'], dealer: 'ororon' }, { rank: 2, points: null, expectedPoints: 0 });
  probe({ ...lunar, recipients: { xingqiu: false, ororon: true } }, { rank: 2, expectedPoints: 160 });
  probe({ ...stellar, element: 'anemo', coefficient: eventFacts.stellarSwirlReactionCoefficients.initialAnemo,
    recipients: { sucrose: false, sandrone: true } }, { rank: 2, expectedPoints: 160 });
  for (const element of ['pyro', 'hydro', 'electro']) probe({ ...swirl, element }, { expectedPoints: 80 });
  for (const [entry, dealer, direct] of [
    [lunar, 'ineffa', { hitId: 'ineffa.a0.thundercloud-discharge', ascension: 1, ratio: ineffaDischargeRatio,
      queryFacts: { 'ineffa.birgittaNearThundercloud': bool(true) }, sources: [characterCurves, ineffaTalents + '#passive1'] }],
    [stellar, 'sandrone', { hitId: 'sandrone.burst.param2', ascension: 0, ratio: growth.sandrone.talents.combat3.param6[0],
      ownerFacts: { radiance: fact({ kind: 'enum', value: 'stellar-swirl' }) }, sources: [characterGrowth + '#sandrone/talents/combat3/param6'] }],
  ]) {
    probe({ ...entry, dealer, direct }, { rank: 2, expectedPoints: 160 });
    probe({ ...entry, dealer, direct, recipients: { [dealer]: false } }, { rank: 2, expectedPoints: 0 });
  }

  if (ifaRescueReactionCharacterIds.every(id => available([id])) && rows.length && rows.every(row => !row.issue)) {
    const character = characters.get('ifa');
    for (const [field, clause, resolvedText] of [
      [fieldA1, character.metadata.passives[0], '确认本次夜魂加持、队伍夜魂值及受益者后，扩散、感电、月感电、星扩散分别按每点1.5%、1.5%、0.2%、0.24%计入，基础上限150点。'],
      [fieldC2, character.metadata.constellations[1], '已解锁场中医者视野时，总夜魂值超过60的部分每点额外给4点，上限提高至200点。'],
    ]) {
      verified.add('ifa' + field);
      clause.buffs.forEach((_, index) => verified.add('ifa' + field + '/buffs/' + index));
      resolved.push({ entity: 'ifa', field, resolved: resolvedText, remaining: unresolved });
    }
    gaps.push({ entity: 'ifa', field: fieldA1, reason: unresolved });
  }
  if (gameData.passive.breakLevel !== 1) throw new Error('伊法场中医者视野解锁条件与固定游戏配置不一致。');
  return { rows, verified, resolved, gaps, summary: {
    ifaRescueReactionCases: rows.length, ifaRescueReactionMismatches: rows.filter(row => row.issue).length,
    verifiedIfaRescueReactions: verified.size,
  } };
}
