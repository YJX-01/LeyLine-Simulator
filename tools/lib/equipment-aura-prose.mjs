import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, elements, setAuditDefaults } from './roster-audit-settings.mjs';

const sourcePath = 'tools/data/sources/catalog/genshin-db/weapons.json';
const source = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const elementNames = { pyro: '火', electro: '雷', hydro: '水', cryo: '冰' };
const rules = [
  ['bloodtaintedgreatsword', 'noelle', 'pyro', 'electro'],
  ['coolsteel', 'kaeya', 'hydro', 'cryo'],
  ['dragonsbane', 'xiangling', 'hydro', 'pyro'],
  ['lionsroar', 'kaeya', 'pyro', 'electro'],
  ['magicguide', 'lisa', 'hydro', 'electro'],
  ['rainslasher', 'noelle', 'hydro', 'electro'],
  ['ravenbow', 'amber', 'hydro', 'pyro'],
];
const ranks = [1, 2, 3, 4, 5];
const states = [false, true, null];
const attribute = 'attribute.damageBonus';
const peer = 'jean';
const field = '/buffs/0/modifiers/0';
const normalize = text => text?.replaceAll('**', '').trim().replace(/[，。；]$/, '');
const close = (actual, expected) => expected === null ? actual === null
  : Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7;

function sourceRanks(id, first, second) {
  const prefix = '对处于' + elementNames[first] + '元素或' + elementNames[second] + '元素影响下的敌人，造成的伤害提高';
  return ranks.map(rank => {
    const sentence = normalize(source[id]?.metadata?.['r' + rank]?.description);
    if (!sentence?.startsWith(prefix) || !/^\d+(?:\.\d+)?%$/.test(sentence.slice(prefix.length))) return null;
    const amount = Number(sentence.slice(prefix.length, -1)) / 100;
    return { rank, sentence, amount, ref: sourcePath + '#/' + id + '/metadata/r' + rank + '/description' };
  });
}

function scenarios(first, second, amount) {
  const result = states.flatMap(left => states.map(right => ({
    left, right, other: null, recipient: 'actor',
    expected: left === true || right === true ? amount : left === null || right === null ? null : 0,
  })));
  for (const other of elements.filter(element => !['physical', first, second].includes(element))) {
    result.push({ left: false, right: false, other, recipient: 'actor', expected: 0 });
  }
  result.push({ left: true, right: true, other: null, recipient: 'peer0', expected: 0 });
  return result;
}

/** Independently compare target-aura and recipient cases with the source amount for each refinement. */
export function auditEquipmentAuraCases(entities, engine) {
  const rows = [];
  const verified = new Set();
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const peerCharacter = characters.get(peer);
  const peerWeapon = weapons.get('dullblade');
  const resolved = [];
  const gaps = [];
  for (const [id, holder, first, second] of rules) {
    const weapon = weapons.get(id);
    const character = characters.get(holder);
    if (!weapon || !character || !peerCharacter || !peerWeapon) continue;
    const start = rows.length;
    const sourceTable = sourceRanks(id, first, second);
    for (const refinement of sourceTable.filter(Boolean)) {
      const { rank, amount, ref } = refinement;
      const prepared = engine.prepareStructuredBuilds([
        { id: 'actor', build: { ...auditBuild(character, weapon), refinement: rank } },
        { id: 'peer0', build: auditBuild(peerCharacter, peerWeapon) },
      ]);
      if (!prepared.ok) continue;
      for (const { expected, ...scenario } of scenarios(first, second, amount)) {
        const { left, right, other, recipient } = scenario;
        const dealer = recipient === 'actor' ? character : peerCharacter;
        const talent = dealer.talents.find(entry => entry.hits.some(hit => hit.category === 'normal'));
        const hit = talent?.hits.find(hit => hit.category === 'normal');
        if (!hit) continue;
        const { setup, request } = auditHit(dealer, talent, hit);
        setup.events.find(event => event.id === request.frame.eventId).actorId = recipient;
        setAuditDefaults(dealer, request.frame);
        request.frame.factOverrides[0].subject = { kind: 'actor', id: recipient };
        const aura = Object.fromEntries(elements.filter(element => element !== 'physical').map(element => ['aura.' + element, bool(element === other)]));
        for (const [element, value] of [[first, left], [second, right]]) {
          aura['aura.' + element] = value === null ? { ...bool(false), value: null } : bool(value);
        }
        const target = request.frame.factOverrides.find(override => override.subject.kind === 'target');
        if (target) Object.assign(target.facts, aura);
        else request.frame.factOverrides.push({ subject: { kind: 'target', id: 'enemy' }, facts: aura });
        const context = engine.createStructuredCombatContext(prepared.team, setup);
        const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
          hit: { skillId: talent.id, hitId: hit.id, category: 'normal', origin: 'talent', family: 'ordinary', element: hit.element, reactionId: null } };
        const bonus = engine.evaluateCombatBindings(prepared.team.program, context, { bonus: {
          kind: 'attribute', key: { id: attribute, namespace: 'builtin', revision: '1' }, actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' },
        } }, frame).outputs.bonus;
        const value = bonus?.state === 'known' ? bonus.value.value : null;
        const valid = bonus?.state === (expected === null ? 'unknown' : 'known') && close(value, expected);
        rows.push({ entity: id, rank, field, settings: { ...scenario, holder, first, second }, sources: [ref], value, expected,
          ...valid ? {} : { issue: '实际目标附着增伤与独立期望不符' } });
      }
    }
    const readings = rows.slice(start);
    const expectedCases = sourceTable.reduce((total, refinement) =>
      total + (refinement ? scenarios(first, second, refinement.amount).length : 0), 0);
    const sources = sourceTable.filter(Boolean).map(refinement => refinement.ref);
    if (!sourceTable.includes(null) && readings.length === expectedCases && readings.every(row => !row.issue)) {
      verified.add(id + field);
      resolved.push({ entity: id, field, sources });
    } else {
      gaps.push({ entity: id, field, sources, reason: '精炼原文、目标附着或持有者对照未齐备。' });
    }
  }
  return { rows, verified, resolved, gaps, summary: { equipmentAuraCases: rows.length,
    equipmentAuraMismatches: rows.filter(row => row.issue).length, verifiedEquipmentAuraModifiers: resolved.length,
    equipmentAuraGaps: gaps.length } };
}

function verifiedRank(results, id, holder, first, second, { rank, amount, sentence }) {
  const gear = results.equipment?.rows?.find(row => row.entity === id && row.kind === 'weapon'
    && row.field === '/buffs' && row.refinement === rank);
  const modifier = gear?.modifiers?.find(row => row.id === id + '.targetBonus' && row.target === attribute);
  if (gear?.issue || normalize(gear?.description) !== sentence || !modifier || modifier.issue || modifier.unverified?.length !== 0
    || ![modifier.sourceValue, modifier.declaredValue, modifier.amount].every(value => close(value, amount))) return null;

  const rows = (results.equipmentAuraCases?.rows ?? []).filter(row => row.entity === id && row.field === field && row.rank === rank);
  const required = scenarios(first, second, amount);
  if (rows.length !== required.length) return null;
  const complete = required.every(({ expected, ...settings }) => rows.some(row =>
    !row.issue && row.settings?.holder === holder && row.settings.first === first && row.settings.second === second
    && Object.entries(settings).every(([key, value]) => row.settings[key] === value)
    && close(row.expected, expected) && close(row.value, expected)));
  return complete ? rows : null;
}

/** Bind only the complete source sentence whose exact modifier and all rank cases have passed. */
export function makeEquipmentAuraProseProofs(entities, results) {
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const claims = new Map();
  for (const [id, holder, first, second] of rules) {
    const weapon = weapons.get(id);
    const grant = weapon?.metadata.buffs?.[0];
    const table = sourceRanks(id, first, second);
    if (weapon?.maxRefinement !== ranks.length || grant?.id !== id + '.targetBonus'
      || grant.modifiers?.[0]?.target !== attribute || table.includes(null)) continue;
    const readings = table.map(refinement => verifiedRank(results, id, holder, first, second, refinement));
    if (readings.includes(null)) continue;
    claims.set(id, { sentence: table[0].sentence, proof: { audit: 'equipmentAuraCases', field,
      scope: '按五阶原文核验持有者对两种目标附着的分别与同时增伤、其他附着排除、未知判定及队友排除。',
      cases: readings.flat().length, refs: [
        ...table.map(row => row.ref),
        'src/game-data/data/weapons/' + id + '.json#' + field,
        'tools/data/sources/catalog/equipment-modifier-checks.json#/' + grant.id,
      ] } });
  }
  return (id, ownerField, sentence) => {
    const claim = claims.get(id);
    return { whole: ownerField === '/buffs' && claim && normalize(sentence) === claim.sentence ? [claim.proof] : [], parts: [] };
  };
}
