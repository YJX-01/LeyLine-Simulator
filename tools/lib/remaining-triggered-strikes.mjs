import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, novice, number, projectQuery, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const read = path => readContentSource(new URL(path, import.meta.url));
const evidence = read('../data/sources/catalog/remaining-triggered-strikes.json').rows;
const growth = read('../data/sources/catalog/genshin-db/characters.json');
const weaponsSource = read('../data/sources/catalog/genshin-db/weapons.json');
const curves = read('../../src/game-data/data/tables/character-curves.json');
const elementalForms = ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];
const convertedElements = ['pyro', 'hydro', 'electro', 'cryo'];
const resistances = { physical: .12, anemo: .17, geo: .2, electro: .23, hydro: .28, pyro: .31, cryo: .37, dendro: .42 };
const characterLevel = [1, 20, 40, 50, 60, 70, 80];
const swordId = 'swordofnarzissenkreuz';

export const remainingTriggeredStrikeIds = ['kinich', 'prune', 'kaveh', 'jahoda', 'kaeya', 'manekin', 'manekina',
  ...['manekin', 'manekina'].flatMap(base => elementalForms.map(element => base + '-' + element))];

/** Compare the single-hit evaluation with fixed source values and the independently staged damage formula. */
export function auditRemainingTriggeredStrikes(entities, engine, onQuery) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map((entities.sets ?? []).map(set => [set.id, set]));
  const rows = [], verified = new Set(), resolved = [], gaps = [];

  function attack(id, { ascension = 0, weaponId = novice[characters.get(id).identity.weaponType] } = {}) {
    const stats = growth[id.replace(/^(manekina?)-\w+$/, '$1')].stats;
    const level = characterLevel[ascension];
    const promoted = stats.promotion[ascension];
    const weapon = weaponsSource[weaponId].stats;
    const attackPercent = (stats.specialized === 'FIGHT_PROP_ATTACK_PERCENT' ? promoted.specialized : 0)
      + (weapon.specialized === 'FIGHT_PROP_ATTACK_PERCENT' ? weapon.base.specialized : 0);
    return (stats.base.attack * curves[stats.curve.attack][level] + promoted.attack + weapon.base.attack) * (1 + attackPercent);
  }

  function check(entry, ownerId, hitId, category, settings, expected, expectedInput) {
    const { entity, field, sources } = entry;
    const { rank = 0, ascension = 0, refinement = 1, facts = {}, omit = [], crit = 'noncritical', reaction = 'none', setId } = settings;
    const character = characters.get(ownerId);
    const weaponCase = entity === swordId;
    const weaponId = settings.weaponId ?? (weaponCase ? swordId : novice[character.identity.weaponType]);
    const weapon = weapons.get(weaponId);
    const set = sets.get(setId);
    const build = { ...auditBuild(character, weapon, set ? [set] : []), level: characterLevel[ascension], ascension, constellation: rank, refinement };
    if (set) build.theoreticalSetSlots = set.slots.slice(0, 2).map(slot => ({ slot, setId }));
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
    if (!prepared.ok) throw new Error(ownerId + ': ' + JSON.stringify(prepared.diagnostics));
    const talent = weaponCase ? character.talents[0] : character.talents.find(talent => talent.hits.some(hit => hit.id === hitId));
    const hit = weaponCase ? weapons.get(swordId).hits.find(hit => hit.id === hitId) : talent?.hits.find(hit => hit.id === hitId);
    if (!hit) throw new Error('缺少触发命中 ' + hitId);
    const { request, setup } = auditHit(character, talent, weaponCase ? talent.hits[0] : hit, build.level);
    const frame = request.frame;
    setAuditDefaults(character, frame);
    if (weaponCase) {
      request.hit = { definition: { group: 'weapons', namespace: weapon.namespace, id: swordId, revision: weapons.get(swordId).revision }, hitId };
      delete setup.events[0].skillId;
      delete setup.events[0].category;
      setup.events[0].hitId = hitId;
    }
    setGateFacts(weaponCase ? weapons.get(swordId) : character, frame, facts);
    for (const key of omit) {
      delete frame.facts[key];
      for (const row of frame.factOverrides) delete row.facts[key];
    }
    for (const [element, resistance] of Object.entries(resistances)) setup.targets[0].inputs['resistance.' + element] = number('scalar', resistance);
    request.critMode = crit;
    request.reactionMode = reaction;
    const result = engine.evaluateStructuredHit(prepared.team, setup, request);
    const output = result.totals.all;
    const value = output.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
    const required = result.requiredInputs.map(input => input.key);
    const matches = expected === null ? value === null : value !== null && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
    const issue = !matches || hit.category !== category || (expectedInput && !required.includes(expectedInput));
    rows.push({ entity, field, sources, settings: { hit: hitId, character: ownerId, ...settings }, value, expected, execution: result.execution, required,
      ...(issue ? { issue: '触发条件、伤害类别或数值与来源的独立预期不符' } : {}) });
    if (onQuery && weaponCase && !issue && expected > 0 && !setId && !settings.crit) {
      onQuery({ label: [entity, refinement].join('/'), build, damage: projectQuery(request), expected, resistances });
    }
  }

  const hitDamage = (attack, ratio, element, factor = 1) => attack * ratio * .5 * (1 - resistances[element]) * factor;

  for (const entry of evidence) {
    const { entity, field, sources, basis, remaining } = entry;
    const before = rows.length;
    if (entity === 'kinich' && characters.has(entity)) {
      const hit = 'kinich.c6.scalespiker-bounce', ready = 'kinich.c6CannonBounceReady';
      const scenarios = [
        [{ rank: 6, facts: { [ready]: true } }, 7, 1],
        [{ rank: 5, facts: { [ready]: true } }, 0, 1],
        [{ rank: 6, facts: { [ready]: false } }, 0, 1],
        [{ rank: 6, crit: 'critical', facts: { [ready]: true } }, 7, 2.5],
        [{ rank: 6, ascension: 3, facts: { [ready]: true, 'kinich.hunterExperienceSpent': 2 } }, 7, 1],
        [{ rank: 6, ascension: 4, facts: { [ready]: true, 'kinich.hunterExperienceSpent': 2 } }, 13.4, 1],
        [{ rank: 6, ascension: 4, facts: { [ready]: true, 'kinich.hunterExperienceSpent': 1, 'kinich.firstCannon': true } }, 10.2, 2],
      ];
      if (sets.has('goldentroupe')) scenarios.push([{ rank: 6, setId: 'goldentroupe', facts: { [ready]: true } }, 7, 1.2]);
      for (const [settings, ratio, factor] of scenarios) check(entry, entity, hit, 'skill', settings, hitDamage(attack(entity, settings), ratio, 'dendro', factor));
      check(entry, entity, hit, 'skill', { rank: 6, omit: [ready] }, null, ready);
    } else if (entity === 'prune' && characters.has(entity)) {
      const hit = 'prune.c4.oathhammer-ricochet', ready = 'prune.c4OathhammerRicochetReady';
      for (const element of convertedElements) check(entry, entity, hit, 'other', { rank: 4, facts: { [ready]: true, absorbedElement: element } },
        hitDamage(attack(entity), .8, element));
      for (const [rank, fired, element] of [[3, true, 'pyro'], [4, false, 'pyro'], [4, true, 'none']]) {
        check(entry, entity, hit, 'other', { rank, facts: { [ready]: fired, absorbedElement: element } }, 0);
      }
      check(entry, entity, hit, 'other', { rank: 4, facts: { [ready]: true, absorbedElement: 'pyro' }, reaction: 'vaporize' }, null);
      check(entry, entity, hit, 'other', { rank: 4, facts: { [ready]: true }, omit: ['absorbedElement'] }, null, 'absorbedElement');
    } else if (entity === 'kaveh' && characters.has(entity)) {
      const hit = 'kaveh.c6.pairidaezas-light', ready = 'kaveh.c6PairidaezasLightReady';
      const scenarios = [[6, true, true], [5, true, true], [6, false, true], [6, true, false]];
      for (const [rank, painted, fired] of scenarios) {
        check(entry, entity, hit, 'other', { rank, facts: { 'kaveh.paintedDome': painted, [ready]: fired } },
          rank === 6 && painted && fired ? hitDamage(attack(entity), .618, 'dendro') : 0);
      }
      if (sets.has('noblesseoblige')) check(entry, entity, hit, 'other', { rank: 6, setId: 'noblesseoblige', facts: { 'kaveh.paintedDome': true, [ready]: true } },
        hitDamage(attack(entity), .618, 'dendro'));
      check(entry, entity, hit, 'other', { rank: 6, facts: { 'kaveh.paintedDome': true }, omit: [ready] }, null, ready);
    } else if (entity === 'manekin' || entity === 'manekina') {
      const forms = elementalForms.map(element => entity + '-' + element);
      if (!characters.has(entity) || !forms.every(id => characters.has(id))) continue;
      const hasBurst = characters.get(entity).talents.some(talent => talent.category === 'burst');
      rows.push({ entity, field, sources, settings: { character: entity, element: 'physical' }, value: Number(hasBurst), expected: 0,
        ...(hasBurst ? { issue: '基础形态无法释放禁限区域' } : {}) });
      for (const [index, id] of forms.entries()) {
        const hit = id + '.passive.zone-exit', ready = 'manekin.zoneExit';
        const expected = hitDamage(attack(id, { ascension: 1 }), 2, elementalForms[index]);
        check(entry, id, hit, 'other', { ascension: 1, facts: { [ready]: true } }, expected);
        check(entry, id, hit, 'other', { ascension: 1, facts: { [ready]: false } }, 0);
        check(entry, id, hit, 'other', { ascension: 0, facts: { [ready]: true } }, 0);
        if (sets.has('noblesseoblige')) check(entry, id, hit, 'other', { ascension: 1, setId: 'noblesseoblige', facts: { [ready]: true } }, expected);
      }
    } else if (entity === 'jahoda' && characters.has(entity)) {
      const boosted = 'jahoda.a1.coordinator-pyro-boost', standard = 'jahoda.burst.param2', initial = 'jahoda.burst.param1';
      const recorded = 'jahoda.coordinatorPyroBoost';
      const options = (absorbedElement, pyro, fullMoonsign = true) => ({ absorbedElement, [recorded]: pyro, fullMoonsign });
      const rates = growth[entity].talents.combat3;
      const ascension = 1, basis = attack(entity, { ascension });
      for (const element of convertedElements) {
        const ordinary = hitDamage(basis, rates.param2[0], element);
        check(entry, entity, boosted, 'burst', { ascension, facts: options(element, true) }, ordinary * 1.3);
        check(entry, entity, boosted, 'burst', { ascension, facts: options(element, false) }, 0);
        check(entry, entity, standard, 'burst', { ascension, facts: options(element, false) }, ordinary);
        check(entry, entity, standard, 'burst', { ascension, facts: options(element, true) }, 0);
      }
      check(entry, entity, boosted, 'burst', { ascension, facts: options('pyro', true, false) }, 0);
      check(entry, entity, boosted, 'burst', { ascension, facts: options('none', true) }, 0);
      check(entry, entity, boosted, 'burst', { ascension: 0, facts: options('pyro', true) }, 0);
      check(entry, entity, standard, 'burst', { ascension: 0, facts: options('pyro', true) }, hitDamage(attack(entity), rates.param2[0], 'pyro'));
      check(entry, entity, boosted, 'burst', { ascension, facts: options('pyro', false), omit: [recorded] }, null, recorded);
      check(entry, entity, initial, 'burst', { ascension, facts: options('pyro', true) }, hitDamage(basis, rates.param1[0], 'anemo'));
    } else if (entity === swordId && weapons.has(entity) && characters.has('kaeya')) {
      const owner = 'kaeya', hit = swordId + '.arkhe-blast', ready = swordId + '.arkheBlastReady', noArkhe = swordId + '.wielderWithoutArkhe';
      const active = { [ready]: true, [noArkhe]: true };
      const basis = attack(owner, { weaponId: swordId });
      for (let refinement = 1; refinement <= 5; refinement++) {
        const ratio = Number.parseFloat(weaponsSource[entity].metadata['r' + refinement].values[0]) / 100;
        check(entry, owner, hit, null, { refinement, facts: active }, hitDamage(basis, ratio, 'physical'));
      }
      check(entry, owner, hit, null, { facts: { ...active, [ready]: false } }, 0);
      check(entry, owner, hit, null, { facts: { ...active, [noArkhe]: false } }, 0);
      check(entry, owner, hit, null, { facts: active, omit: [ready] }, null, ready);
      if (sets.has('goldentroupe')) check(entry, owner, hit, null, { setId: 'goldentroupe', facts: active }, hitDamage(basis, 1.6, 'physical'));
      if (sets.has('noblesseoblige')) check(entry, owner, hit, null, { setId: 'noblesseoblige', facts: active }, hitDamage(basis, 1.6, 'physical'));
      check(entry, owner, hit, null, { crit: 'critical', facts: active }, hitDamage(basis, 1.6, 'physical', 1.5));
    }

    const checked = rows.slice(before);
    if (!checked.length || checked.some(row => row.issue)) continue;
    resolved.push({ entity, field, resolved: basis, remaining: remaining ?? '' });
    if (remaining) gaps.push({ entity, field, needed: remaining, reason: remaining, sources });
    else verified.add(entity + field);
  }
  return { rows, verified, resolved, gaps, summary: {
    remainingTriggeredStrikeCases: rows.length, remainingTriggeredStrikeFailures: rows.filter(row => row.issue).length,
    remainingTriggeredStrikeClausesVerified: verified.size, remainingTriggeredStrikeClausesResolved: resolved.length,
  } };
}
