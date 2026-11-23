import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const read = path => readContentSource(new URL(path, import.meta.url));
const evidence = read('../data/sources/catalog/trigger-hit-evidence.json');
const growth = read('../data/sources/catalog/genshin-db/characters.json');
const weaponsSource = read('../data/sources/catalog/genshin-db/weapons.json');
const curves = read('../../src/game-data/data/tables/character-curves.json');
const resistances = { cryo: 0.2, electro: 0.25, pyro: 0.3, hydro: 0.35, dendro: 0.4, geo: 0.45, anemo: 0.5 };
const ready = (key, flags = {}) => ({ [key]: true, ...flags });

const hitCases = [
  { entity: 'charlotte', hit: 'normal.param9', skill: 'normal', field: '/talents/0', category: 'charged', element: 'cryo',
    readiness: 'spiritbreathReady', ratio: growth.charlotte.talents.combat1.param9[0], noReaction: 'melt' },
  { entity: 'mavuika', hit: 'c6.flamestrider-crash', skill: 'skill', field: '/constellations/5', category: 'skill', element: 'pyro',
    rank: 6, readiness: 'c6CrashReady', conditions: { ringActive: true }, ratio: 2, noReaction: 'vaporize' },
  { entity: 'mavuika', hit: 'c6.scorching-ring', skill: 'skill', field: '/constellations/5', category: 'skill', element: 'pyro',
    rank: 6, readiness: 'c6RidingRingReady', conditions: { flamestrider: true }, ratio: 5, noReaction: 'melt' },
  { entity: 'arlecchino', hit: 'c2.balemoon-bloodfire', skill: 'skill', field: '/constellations/1', category: 'other', element: 'pyro', rank: 2,
    ascension: 1, readiness: 'c2BloodfireReady', facts: { inCombat: true }, ratio: 9 },
  { entity: 'citlali', hit: 'c4.obsidian-skull', skill: 'skill', field: '/constellations/3', category: 'other', element: 'cryo',
    rank: 4, readiness: 'c4SkullReady', ratio: 18 },
  { entity: 'kachina', hit: 'c6.shield-shockwave', skill: 'skill', field: '/constellations/5', category: 'other', element: 'geo',
    rank: 6, readiness: 'c6ShieldShockwaveReady', ratio: 2 },
  { entity: 'ororon', hit: 'a0.hypersense', skill: 'skill', field: '/passives/0', category: 'other', element: 'electro',
    ascension: 1, readiness: 'a1HypersenseReady', ratio: 1.6 },
  { entity: 'ororon', hit: 'c6.hypersense', skill: 'burst', field: '/constellations/5', category: 'other', element: 'electro',
    rank: 6, ascension: 1, readiness: 'c6HypersenseReady', ratio: 3.2 },
  { entity: 'dori', hit: 'c2.jinni-toop', skill: 'burst', field: '/constellations/1', category: 'other', element: 'electro',
    rank: 2, readiness: 'c2JinniToopReady', ratio: .5 },
  { entity: 'yaoyao', hit: 'c6.mega-radish', skill: 'skill', field: '/constellations/5', category: 'other', element: 'dendro',
    rank: 6, readiness: 'c6MegaRadishReady', ratio: .75 },
  { entity: 'jahoda', hit: 'c1.meowball-bounce', skill: 'skill', field: '/constellations/0', category: 'skill', element: 'hydro', rank: 1,
    readiness: 'c1MeowballBounceReady', facts: { absorbedElement: 'hydro', fullMoonsign: true }, ratio: growth.jahoda.talents.combat2.param5[0] },
  { entity: 'lohen', hit: 'c2.evilsbane-blade', skill: 'normal', field: '/constellations/1', category: 'other', element: 'cryo', rank: 2,
    readiness: 'c2EvilsbaneBladeReady', conditions: { masterstroke: true }, ratio: 5 },
];

export const triggerHitSourceIds = [...new Set(hitCases.map(({ entity }) => entity))];
const known = output => output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
const namespaced = (entity, data) => Object.fromEntries(Object.entries(data).map(([key, value]) =>
  [key === 'absorbedElement' || key === 'fullMoonsign' ? key : entity + '.' + key, value]));

/** Compare real catalog hits against their independently recorded coefficients and damage tags. */
export function auditTriggerHitSources(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map(entities.sets.map(set => [set.id, set]));
  const rows = [], verified = new Set();
  const buildFor = (id, sets = []) => {
    const character = characters.get(id);
    return auditBuild(character, weapons.get(novice[character.identity.weaponType]), sets);
  };

  function check(spec, settings, expected, assertion = () => true) {
    const { entity, field, skill, hit: key, category, readiness } = spec;
    const ascension = settings.ascension ?? spec.ascension ?? 0;
    const constellation = settings.rank ?? spec.rank ?? 0;
    const level = ascension === 1 ? 20 : 1;
    const character = characters.get(entity);
    const talent = character.talents.find(entry => entry.id === entity + '.' + skill);
    const hit = talent.hits.find(entry => entry.id === entity + '.' + key);
    if (!hit) throw new Error('缺少触发命中 ' + entity + '.' + key);
    const set = settings.set ? sets.get(settings.set) : null;
    const owner = { ...buildFor(entity, set ? [set] : []), level, ascension, constellation };
    if (set) owner.theoreticalSetSlots = set.slots.slice(0, settings.set === 'wandererstroupe' ? 4 : 2).map(slot => ({ slot, setId: set.id }));
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build: owner }]);
    if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
    const { setup, request } = auditHit(character, talent, hit, level);
    const frame = request.frame;
    setAuditDefaults(character, frame);
    setGateFacts(character, frame, namespaced(entity, { ...ready(readiness), ...spec.conditions, ...spec.facts, ...settings.facts }));
    if (entity === 'yaoyao') {
      const capture = setup.events.find(event => event.kind === 'capture');
      capture.subjectFacts = [{ subject: { kind: 'actor', id: 'actor' }, values: {
        onField: bool(true), 'yaoyao.radishBurstArea': bool(settings.captureRadish ?? false),
      } }];
    }
    if (settings.omit) delete frame.facts[entity + '.' + readiness];
    if (settings.omitCapture) frame.captures = {};
    for (const [element, value] of Object.entries(resistances)) setup.targets[0].inputs['resistance.' + element] = number('scalar', value);
    request.reactionMode = settings.reaction ?? 'none';
    const result = engine.evaluateStructuredHit(prepared.team, setup, request);
    const value = known(result.totals.all);
    const matches = expected === null ? value === null : value !== null && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
    const sources = evidence.rows.find(row => row.entity === entity && row.field === field).sources;
    rows.push({ entity, field, sources, settings: { hit: hit.id, ...settings }, value, expected, execution: result.execution,
      required: result.requiredInputs.map(input => input.key),
      ...(!matches || hit.category !== category || !assertion(result) ? { issue: '触发命中、伤害类别或适用条件与独立预期不符' } : {}) });
  }

  for (const spec of hitCases) {
    const { entity, readiness, ratio, element, category } = spec;
    if (!characters.has(entity)) continue;
    const stats = growth[entity].stats;
    const ascension = spec.ascension ?? 0;
    const level = ascension === 1 ? 20 : 1;
    const weaponId = novice[characters.get(entity).identity.weaponType];
    const white = stats.base.attack * curves[stats.curve.attack][level] + stats.promotion[ascension].attack + weaponsSource[weaponId].stats.base.attack;
    const attack = white + (entity === 'mavuika' ? 200 : 0);
    const basis = entity === 'citlali' ? 125 : entity === 'kachina' ? stats.base.defense : attack;
    const defense = entity === 'mavuika' ? 1 / 1.8 : .5;
    const activeBonus = entity === 'arlecchino' ? .4 : 0;
    const damage = (bonus = 0, currentElement = element) => basis * ratio * defense * (1 - resistances[currentElement]) * (1 + activeBonus + bonus);
    const facts = entity === 'mavuika' ? { nightsoulActive: true } : {};
    check(spec, { facts }, damage());
    check(spec, { facts: { ...facts, [readiness]: false } }, 0);
    check(spec, { facts, omit: true }, null, result => result.requiredInputs.some(input => input.key === entity + '.' + readiness));
    if (spec.rank) check(spec, { facts, rank: spec.rank - 1 }, 0);
    if (ascension) check(spec, { facts, ascension: 0 }, 0);
    for (const gate of Object.keys(spec.conditions ?? {})) check(spec, { facts: { ...facts, [gate]: false } }, 0);
    check(spec, { facts, set: 'goldentroupe' }, damage(category === 'skill' ? .2 : 0));
    check(spec, { facts, set: 'wandererstroupe' }, (entity === 'citlali' ? damage() * 205 / 125 : damage(category === 'charged' ? .35 : 0)));
    check(spec, { facts, set: 'noblesseoblige' }, damage(category === 'burst' ? .2 : 0));
    if (spec.noReaction) check(spec, { facts, reaction: spec.noReaction }, null, result => result.execution === 'invalid');
    if (entity === 'arlecchino') check(spec, { facts, reaction: 'vaporize' }, damage() * 1.5);
    if (entity === 'yaoyao') {
      check(spec, { facts, omitCapture: true }, null, result => result.requiredInputs.some(input => input.key.includes('panel')));
      check(spec, { facts: { radishBurstArea: true }, captureRadish: false }, damage());
      check(spec, { facts: { radishBurstArea: false }, captureRadish: true }, damage(.15));
    }
    if (entity === 'jahoda') {
      check(spec, { facts: { fullMoonsign: false } }, 0);
      check(spec, { facts: { absorbedElement: 'none' } }, 0);
      for (const switched of ['pyro', 'cryo', 'electro']) check(spec, { facts: { absorbedElement: switched } }, damage(0, switched));
    }
    if (entity === 'ororon') {
      const passive = spec.skill === 'skill';
      check(spec, { rank: passive ? 1 : spec.rank, facts: { nighttide: true } }, damage(.5));
      check(spec, { rank: passive ? 2 : spec.rank, facts: { nighttide: true, burstElectroWindow: true, burstEnemies: 1 } }, damage(.66));
      if (passive) {
        check(spec, { rank: 0, facts: { nighttide: true } }, damage());
        check(spec, { rank: 1, facts: { nighttide: false } }, damage());
      }
    }
  }

  if (['yaoyao', 'charlotte', 'mavuika', 'ororon'].every(id => characters.has(id))) {
    const entity = 'yaoyao', field = '/talents/2';
    const sources = evidence.rows.find(row => row.entity === entity && row.field === field).sources;
    const ids = ['yaoyao', 'charlotte', 'mavuika', 'ororon'];
    const members = ids.map((id, i) => ({ id: i === 0 ? 'actor' : 'peer' + i, build: buildFor(id) }));
    const prepared = engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
    const { team } = prepared;
    const character = characters.get(entity);
    const talent = character.talents.find(talent => talent.id === 'yaoyao.burst');
    const talentRatio = growth.yaoyao.talents.combat3.param5[0];
    for (const [active, onField, recipient, expected] of [
      [true, true, 'actor', .15 + talentRatio], [false, true, 'actor', .15], [true, false, 'actor', .15], [true, true, 'peer1', .15],
    ]) {
      const { setup, request } = auditHit(character, talent, talent.hits[0]);
      const frame = request.frame;
      setGateFacts(character, frame, { 'yaoyao.adeptalLegacy': active });
      frame.factOverrides[0].facts.onField = bool(onField);
      const context = engine.createStructuredCombatContext(team, setup);
      const result = engine.evaluateCombatBindings(team.program, context, { value: { kind: 'attribute', actor: { role: 'recipient' },
        key: { namespace: 'builtin', id: 'attribute.resistance.dendro', revision: '1' }, at: { kind: 'current', phase: 'same' } } },
      { ...frame, ownerId: 'actor', recipientId: recipient, contributorId: null, hit: null });
      const value = known(result.outputs.value);
      rows.push({ entity, field, sources, settings: { active, onField, recipient }, value, expected,
        ...(value === null || Math.abs(value - expected) > 1e-9 ? { issue: '桂子仙机个人草抗与独立预期不符' } : {}) });
    }
  }

  for (const { entity, field, resolution } of evidence.rows) {
    const checks = rows.filter(row => row.entity === entity && row.field === field);
    if (resolution === 'complete' && checks.length && checks.every(row => !row.issue)) verified.add(entity + field);
  }
  return { rows, verified, summary: { triggerHitSourceCases: rows.length, triggerHitSourceFailures: rows.filter(row => row.issue).length,
    triggerHitSourceClausesVerified: verified.size, triggerHitSourceOpen: evidence.rows.filter(row => row.resolution !== 'complete').length } };
}
