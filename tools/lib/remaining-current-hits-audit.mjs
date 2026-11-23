import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const genshinDb = 'data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const source = (group, id, key) => 'tools/' + genshinDb + 'ChineseSimplified/' + group + '/' + id + '.json#' + key;
const kqm = 'kqm-theorycrafting-library@7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5:';
const read = path => readContentSource(new URL(path, import.meta.url));
const rates = read('../' + genshinDb + 'stats/talents.json');
const growth = read('../data/sources/catalog/genshin-db/characters.json');
const weaponsSource = read('../data/sources/catalog/genshin-db/weapons.json');
const reference = id => ({ namespace: 'builtin', id, revision: '1' });
const known = output => output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;

export const remainingCurrentHitIds = ['emilie', 'linnea', 'jahoda', 'aether-electro', 'lumine-electro', 'lohen', 'aino', 'kaeya', 'mona', 'raidenshogun'];

/** Catalog loadouts with explicit software conditions and independently computed expectations. */
export function auditRemainingCurrentHits(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const emblem = entities.sets?.find(set => set.id === 'emblemofseveredfate');
  const rows = [], verified = new Set();

  function build(id, { rank = 0, ascension = 0, weaponId, withEmblem = false } = {}) {
    const character = characters.get(id);
    const weapon = weapons.get(weaponId ?? novice[character.identity.weaponType]);
    const loadout = auditBuild(character, weapon, withEmblem ? [emblem] : []);
    if (withEmblem) loadout.theoreticalSetSlots = emblem.slots.slice(0, 4).map(slot => ({ slot, setId: emblem.id }));
    return { ...loadout, level: [1, 20, 40, 50, 60, 70, 80][ascension], ascension, constellation: rank };
  }

  function probe(id, key, { rank, ascension, weaponId, peers = [], facts = {}, recipient = 'actor', recipientFacts = {}, stat, recipientCategory,
    omit = [] } = {}) {
    const owner = build(id, { rank, ascension, weaponId });
    const character = owner.character;
    const hitId = id + '.' + key;
    const talent = character.talents.find(entry => entry.hits.some(hit => hit.id === hitId));
    const hit = talent?.hits.find(entry => entry.id === hitId);
    if (!hit) throw new Error('缺少正式命中 ' + hitId);
    const members = [{ id: 'actor', build: owner }, ...peers.map((peer, index) => ({ id: 'peer' + index,
      build: typeof peer === 'string' ? build(peer) : build(peer.id, peer),
    }))];
    const prepared = engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
    const { team } = prepared;
    const { setup, request } = auditHit(character, talent, hit, owner.level);
    const frame = request.frame;
    setAuditDefaults(character, frame);
    setGateFacts(character, frame, facts);
    for (const key of omit) {
      delete frame.facts[key];
      for (const row of frame.factOverrides) delete row.facts[key];
    }
    setup.targets[0].inputs['resistance.dendro'] = number('scalar', 0.25);
    setup.targets[0].inputs['resistance.geo'] = number('scalar', 0.2);
    for (const [id, facts] of Object.entries(recipientFacts)) {
      const fields = Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, bool(value)]));
      const row = frame.factOverrides.find(row => row.subject.kind === 'actor' && row.subject.id === id);
      if (row) Object.assign(row.facts, fields);
      else frame.factOverrides.push({ subject: { kind: 'actor', id }, facts: fields });
    }
    if (!stat) {
      const result = engine.evaluateStructuredHit(team, setup, request);
      return { value: known(result.totals.all), execution: result.execution, required: result.requiredInputs.map(input => input.key) };
    }
    const context = engine.createStructuredCombatContext(team, setup);
    const measuredTalent = recipientCategory ? members.find(member => member.id === recipient)?.build.character.talents
      .find(talent => talent.category === recipientCategory) : talent;
    const measuredHit = recipientCategory ? measuredTalent.hits[0] : hit;
    const read = engine.evaluateCombatBindings(team.program, context, { value: { kind: 'attribute', key: reference('attribute.' + stat),
      actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' } } }, {
      ...frame, ownerId: 'actor', recipientId: recipient, contributorId: null, hit: { skillId: measuredTalent.id, hitId: measuredHit.id,
        category: measuredHit.category, element: measuredHit.element, family: 'ordinary', origin: measuredHit.origin, reactionId: null },
    });
    return { value: known(read.outputs.value), execution: null, required: read.requiredInputs.map(input => input.key) };
  }

  function record(entity, field, sources, settings, result, expected, assertion = () => true) {
    const matches = expected === null ? result.value === null : typeof result.value === 'number'
      && Math.abs(result.value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
    rows.push({ entity, field, sources, settings, ...result, expected,
      ...(!matches || !assertion(result) ? { issue: '本击数值或生效范围与固定来源的独立预期不符' } : {}) });
  }

  function certify(entity, field) {
    const checks = rows.filter(row => row.entity === entity && row.field === field);
    if (checks.length && checks.every(row => !row.issue)) verified.add(entity + field);
  }

  function levelOneAttack(id) {
    const weaponId = novice[characters.get(id).identity.weaponType];
    return growth[id].stats.base.attack + weaponsSource[weaponId].stats.base.attack;
  }

  if (characters.has('emilie')) {
    const id = 'emilie', field = '/constellations/5';
    const evidence = [source('constellations', id, 'c6'), source('talents', id, 'combat1'), kqm + 'src/data/characters/Emilie.json'];
    const window = active => ({ 'emilie.abidingFragrance': active });
    const attack = levelOneAttack(id);
    for (let stage = 1; stage <= 5; stage++) {
      const param = 'param' + stage, physical = 'normal.' + param, dendro = 'normal.c6-fragrance-' + stage;
      const scaling = rates.emilie.combat1[param][0];
      for (const [key, rank, active, expected] of [
        [dendro, 6, true, attack * (scaling + 3) * 0.5 * 0.75],
        [dendro, 6, false, 0],
        [dendro, 5, true, 0],
        [physical, 6, true, 0],
        [physical, 6, false, attack * scaling * 0.5 * 0.9],
        [physical, 5, true, attack * scaling * 0.5 * 0.9],
      ]) record(id, field, evidence, { key, rank, active }, probe(id, key, { rank, facts: window(active) }), expected);
    }
    const plunge = 'normal.param7';
    record(id, field, evidence, { key: plunge, rank: 6, active: true }, probe(id, plunge, { rank: 6, facts: window(true) }),
      attack * rates.emilie.combat1.param7[0] * 0.5 * 0.9);
    const key = 'normal.c6-fragrance-1';
    record(id, field, evidence, { key, rank: 6, active: null }, probe(id, key, { rank: 6, omit: ['emilie.abidingFragrance'] }),
      null, result => result.required.includes('emilie.abidingFragrance'));
    certify(id, field);
  }

  if (characters.has('linnea')) {
    const id = 'linnea', field = '/passives/3', quick = 'normal.ultra-convenient-quick-arrow';
    const evidence = [source('talents', id, 'passive4'), source('talents', id, 'combat1'), kqm + 'src/data/characters/Linnea.json'];
    const full = levelOneAttack(id) * rates.linnea.combat1.param5[0] * 0.5 * 0.8;
    const physical = levelOneAttack(id) * rates.linnea.combat1.param4[0] * 0.5 * 0.9;
    for (const [key, active, expected] of [[quick, true, full * 0.2], [quick, false, 0], ['normal.param5', false, full],
      ['normal.param5', true, 0], ['normal.param4', true, physical]]) {
      record(id, field, evidence, { key, active }, probe(id, key, { facts: { 'linnea.ultraConvenientQuickArrow': active } }), expected);
    }
    record(id, field, evidence, { key: quick, active: null }, probe(id, quick, { omit: ['linnea.ultraConvenientQuickArrow'] }),
      null, result => result.required.includes('linnea.ultraConvenientQuickArrow'));
  }

  if (characters.has('jahoda') && characters.has('aino') && characters.has('kaeya')) {
    const id = 'jahoda', field = '/constellations/5', key = 'normal.param1';
    const evidence = [source('constellations', id, 'c6'), kqm + 'src/data/characters/Jahoda.json'];
    for (const [rank, full, window, moonsign, nearby, recipient, peer, granted] of [
      [6, true, true, true, true, 'actor', 'aino', true],
      [6, true, true, true, true, 'peer0', 'aino', true],
      [5, true, true, true, true, 'peer0', 'aino', false],
      [6, false, true, true, true, 'actor', 'kaeya', false],
      [6, true, false, true, true, 'peer0', 'aino', false],
      [6, true, true, false, true, 'peer1', 'aino', false],
      [6, true, true, true, false, 'peer0', 'aino', false],
    ]) for (const [stat, baseline, increment] of [['critRate', 0.05, 0.05], ['critDamage', 0.5, 0.4]]) {
      const facts = { fullMoonsign: full, 'jahoda.fullBottleWindow': window };
      const recipientFacts = { [recipient]: { 'jahoda.recipientMoonsign': moonsign, 'jahoda.recipientNearby': nearby } };
      const result = probe(id, key, { rank, peers: peer === 'aino' ? [peer, 'kaeya'] : [peer], facts, recipient, recipientFacts, stat });
      record(id, field, evidence, { rank, full, window, moonsign, nearby, recipient, stat }, result, baseline + (granted ? increment : 0));
    }
    certify(id, field);
  }

  for (const id of ['aether-electro', 'lumine-electro']) if (characters.has(id) && characters.has('kaeya')) {
    const field = '/passives/1', key = 'skill.param1';
    const amulet = id + '.abundanceAmuletWindow';
    const evidence = [source('talents', 'travelerelectro', 'combat2'), source('talents', 'travelerelectro', 'passive2'),
      kqm + 'docs/characters/electro/traveler-electro.md:127-141', kqm + 'docs/characters/electro/traveler-electro.md:203-207',
      kqm + 'docs/evidence/characters/electro/traveler-electro.md:68-99', kqm + 'docs/evidence/characters/electro/traveler-electro.md:133'];
    const basis = 1 + weaponsSource.favoniussword.stats.base.specialized;
    const base = rates.travelerelectro.combat2.param4[0];
    const amplified = base + basis * 0.1;
    for (const [ascension, recipient, travelerActive, peerActive, expected] of [
      [3, 'actor', true, false, base],
      [3, 'peer0', false, true, base],
      [4, 'actor', true, false, amplified],
      [4, 'peer0', false, true, amplified],
      [4, 'peer0', true, true, amplified],
      [4, 'actor', false, true, 0],
      [4, 'peer0', true, false, 0],
      [4, 'actor', false, false, 0],
    ]) {
      const stat = 'particleEnergyRecharge';
      const recipientFacts = { actor: { [amulet]: travelerActive }, peer0: { [amulet]: peerActive } };
      const options = { ascension, weaponId: 'favoniussword', peers: ['kaeya'], recipient, recipientFacts, stat };
      record(id, field, evidence, { ascension, recipient, travelerActive, peerActive, stat }, probe(id, key, options), expected);
    }
    const conversions = [
      [{ id: 'mona', ascension: 4 }, 'hydroBonus', (1 + 0.16) * 0.2],
      [{ id: 'raidenshogun', ascension: 4 }, 'electroBonus', 0.16 * 0.4],
      [{ id: 'raidenshogun', ascension: 4, weaponId: 'engulfinglightning' }, 'attackPercent', (0.16 + 0.12) * 0.28],
      [{ id: 'raidenshogun', ascension: 4, withEmblem: true }, 'damageBonus', (1 + 0.16 + 0.2) * 0.25],
    ];
    const available = conversions.filter(([peer]) => characters.has(peer.id) && (!peer.withEmblem || emblem));
    for (const [peer, stat, expected] of available) {
      for (const active of [false, true]) {
        const result = probe(id, key, { ascension: 4, weaponId: 'favoniussword', peers: [peer], recipient: 'peer0', recipientCategory: 'burst',
          recipientFacts: { actor: { [amulet]: false }, peer0: { [amulet]: active } }, stat });
        record(id, field, evidence, { peer: peer.id, weaponId: peer.weaponId, withEmblem: peer.withEmblem, active, stat }, result, expected);
      }
    }
    if (available.length === conversions.length) certify(id, field);
  }

  if (characters.has('lohen')) {
    const id = 'lohen', field = '/constellations/3', key = 'burst.param1';
    const evidence = [source('constellations', id, 'c1'), source('constellations', id, 'c4'), source('talents', id, 'combat3'),
      kqm + 'src/data/characters/Lohen.json'];
    const attack = levelOneAttack(id);
    const burst = attack * rates.lohen.combat3.param1[0] * 0.5 * 0.9;
    const leveled = attack * rates.lohen.combat3.param1[3] * 0.5 * 0.9;
    const amp = points => 1 + points * rates.lohen.combat3.param2[0];
    for (const [rank, masterstroke, will, expected] of [
      [0, true, 100, burst * amp(100)],
      [1, true, 300, burst * amp(300)],
      [3, true, 25, burst * amp(25)],
      [3, true, 300, burst * amp(300)],
      [4, true, 0, burst * amp(300)],
      [4, true, 300, burst * amp(300)],
      [4, true, null, burst * amp(300)],
      [4, false, 0, burst],
      [6, true, 0, leveled * amp(300)],
    ]) {
      const facts = { 'lohen.masterstroke': masterstroke, ...(will === null ? {} : { 'lohen.will': will }) };
      record(id, field, evidence, { key, rank, masterstroke, will }, probe(id, key, { rank, facts, omit: will === null ? ['lohen.will'] : [] }), expected);
    }
    for (const [rank, will] of [[0, 101], [4, 301]]) {
      const facts = { 'lohen.masterstroke': true, 'lohen.will': will };
      record(id, field, evidence, { key, rank, masterstroke: true, will }, probe(id, key, { rank, facts }), null,
        result => result.execution === 'invalid');
    }
  }

  return { rows, verified, summary: { remainingCurrentHitCases: rows.length,
    remainingCurrentHitFailures: rows.filter(row => row.issue).length, remainingCurrentHitClausesVerified: verified.size } };
}
