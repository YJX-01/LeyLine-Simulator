import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const genshinDb = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const ratesPath = genshinDb + 'stats/talents.json';
const upstream = (group, id) => genshinDb + 'ChineseSimplified/' + group + '/' + id + '.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const rates = read(ratesPath);
const growth = read(catalog + 'characters.json');
const curves = read(catalog + 'character-curves.json');
const weaponStats = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const absorption = 'attribute.shieldAbsorption';
const cap = 'attribute.shieldAbsorptionCap';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const actor = id => ({ kind: 'actor', id });
const attribute = id => ({ kind: 'attribute', actor: { role: 'recipient' }, key: ref(id), at: { kind: 'current', phase: 'same' } });

// Entries are [source detail index, attribute, part of a multi-line total].
const standard = [
  ['baizhu', 'gossamerShieldActive', 2, 0],
  ['beidou', 'tidecallerGuard', 1, 0, true],
  ['candace', 'sacredRiteGuard', 1, 0, true],
  ['citlali', 'opalShieldActive', 1, 1],
  ['dahlia', 'sacredFavorShieldActive', 2, 1],
  ['ineffa', 'flowingLightBarrierActive', 1, 1],
  ['lanyan', 'swallowWispShieldActive', 1, 1],
  ['nicole', 'brillianceShieldActive', 1, 1],
  ['noelle', 'breastplateShieldActive', 1, 1],
  ['valeriy', 'stormShieldActive', 1, 1],
  ['yunjin', 'openingFlourishGuard', 1, 3, true],
].map(([id, key, slot, index, ownerOnly]) => ({ id, key, ownerOnly, variants: [[true, [[slot, index, absorption]]]] }));
const variants = [
  ...standard,
  { id: 'diona', key: 'icyPawsShieldMode', variants: ['tap', 'hold'].map(mode => [mode, [[1, 1, absorption]]]) },
  { id: 'kirara', key: 'safeTransportShieldActive', variants: [[true, [[1, 1, absorption], [1, 2, cap]]]] },
  { id: 'layla', key: 'curtainOfSlumberActive', variants: [[true, [[1, 2, absorption]]]] },
  { id: 'thoma', key: 'blazingBarrierShieldSource', variants: [
    ['skill', [[1, 1, absorption], [1, 3, cap]]], ['burst', [[2, 2, absorption], [1, 3, cap]]],
  ] },
  { id: 'xinyan', key: 'sweepingFervorShieldLevel', variants: [1, 2, 3].map(index => ['level-' + index, [[1, index, absorption]]]) },
  { id: 'zhongli', key: 'jadeShieldActive', variants: [[true, [[1, 3, absorption, 'flat'], [1, 4, absorption, 'scaled']]]] },
];
const panelNames = { '生命值上限': 'hp', '最大生命值': 'hp', '攻击力': 'attack', '防御力': 'defense', '元素精通': 'elementalMastery' };
const specializedTypes = { hp: 'FIGHT_PROP_HP_PERCENT', attack: 'FIGHT_PROP_ATTACK_PERCENT', defense: 'FIGHT_PROP_DEFENSE_PERCENT',
  elementalMastery: 'FIGHT_PROP_ELEMENT_MASTERY' };

function sourcePanel(id, stat, build) {
  const character = growth[id].stats, weapon = weaponStats[build.weapon.id].stats;
  const promotion = character.promotion[build.ascension];
  const specialized = character.specialized === specializedTypes[stat] ? promotion.specialized : 0;
  if (stat === 'elementalMastery') {
    const c2 = id === 'citlali' && build.constellation >= 2 ? Number(read(upstream('constellations', id)).c2.description.match(/茜特菈莉的元素精通提升(\d+)点/)?.[1]) : 0;
    return specialized + c2;
  }
  const white = character.base[stat] * curves[build.level][character.curve[stat]] + promotion[stat]
    + (stat === 'attack' ? weapon.base.attack * weaponCurves[build.weaponLevel][weapon.curve.attack] + weapon.promotion[build.weaponAscension].attack : 0);
  return white * (1 + specialized);
}

function sourceDetail(id, slot, index, build) {
  const group = 'combat' + (slot + 1), path = upstream('talents', id), talents = read(path)[group];
  const template = talents.attributes.labels[index];
  const rankPath = upstream('constellations', id), constellations = read(rankPath);
  const increase = [3, 5].find(rank => constellations['c' + rank].description.includes(talents.name));
  const rank = build.talents[slot === 1 ? 'skill' : 'burst'] + (increase <= build.constellation ? 3 : 0);
  const terms = [...template.matchAll(/\{(param\d+):([^}]*)\}(生命值上限|最大生命值|攻击力|防御力|元素精通)?/g)];
  if (!increase || !terms.length || !template.split('|')[0].includes('吸收量')) throw new Error(id + ': 固定来源缺少护盾公式或技能等级。');
  const parameters = [];
  let amount = 0;
  for (const [, parameter, format, panel] of terms) {
    const value = rates[id][group]?.[parameter]?.[rank - 1];
    if (!Number.isFinite(value) || panel && !format.endsWith('P') || !panel && format !== 'I') throw new Error(id + ': 护盾参数无效。');
    const basis = panel ? sourcePanel(id, panelNames[panel], build) : null;
    const source = ratesPath + '#' + id + '/' + group + '/' + parameter;
    parameters.push({ parameter, value, basis, source });
    amount += basis === null ? value : basis * value;
  }
  return { rank, amount, parameters, sources: [path + '#' + group, rankPath + '#c' + increase,
    catalog + 'characters.json#' + id, catalog + 'character-curves.json#' + build.level,
    catalog + 'weapons.json#' + build.weapon.id, catalog + 'weapon-curves.json#' + build.weaponLevel,
    ...id === 'citlali' ? [rankPath + '#c2'] : [],
    ...parameters.map(term => term.source)] };
}

function multiplier(id, mode, constellation) {
  if (id === 'diona') {
    const talentPath = upstream('talents', id), constellationPath = upstream('constellations', id);
    const hold = Number(read(talentPath).combat2.description.match(/获得(\d+)%伤害吸收量加成/)?.[1]) / 100;
    const c2 = Number(read(constellationPath).c2.description.match(/吸收量提高(\d+)%/)?.[1]) / 100;
    return { rate: (mode === 'hold' ? 1 + hold : 1) * (constellation >= 2 ? 1 + c2 : 1), sources: [constellationPath + '#c2',
      'https://library.keqingmains.com/combat-mechanics/damage/shields#diona'] };
  }
  if (id === 'layla') {
    const path = upstream('constellations', id);
    const c1 = Number(read(path).c1.description.match(/吸收量提高(\d+)%/)?.[1]) / 100;
    return { rate: constellation >= 1 ? 1 + c1 : 1, sources: [path + '#c1'] };
  }
  return { rate: 1, sources: [] };
}

function quantity(output) {
  return output?.state === 'known' && output.value.kind === 'quantity' && output.value.unit === 'hp' ? output.value.value : null;
}

/** Evaluates the confirmed current shield and the declared caps against the captured tables. */
export function auditShieldAbsorption(entities, engine) {
  const rows = [], verified = new Set(), fields = new Map();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peer = characters.get('kaeya');
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const finish = () => ({ rows, verified, summary: { shieldAbsorptionCases: rows.length,
    shieldAbsorptionMismatches: rows.filter(row => row.issue).length, verifiedShieldAbsorptionDetails: verified.size } });
  if (!peer || !starter(peer)) return finish();
  const peerBuild = auditBuild(peer, starter(peer));

  function measure(team, character, key, mode, recipient, onField, bindings) {
    const dealer = recipient === 'actor' ? character : peer;
    const talent = dealer.talents[0], hit = talent.hits[0];
    const { setup, request } = auditHit(dealer, talent, hit);
    setup.events[0].actorId = recipient;
    setAuditDefaults(character, request.frame);
    if (mode !== null) setGateFacts(character, request.frame, { [key]: mode });
    else request.frame.factOverrides[0].facts[key] = fact(null);
    request.frame.factOverrides[0].facts.onField = bool(recipient === 'actor' && onField);
    const peerFacts = { onField: bool(recipient === 'peer' && onField) };
    if (character.id === 'kirara') peerFacts['kirara.criticalTransportShieldActive'] = bool(false);
      if (character.id === 'layla') {
        request.frame.factOverrides[0].facts['layla.curtainOfSlumberCoopShield'] = bool(false);
        peerFacts['layla.curtainOfSlumberCoopShield'] = bool(false);
        if (recipient === 'peer') {
          peerFacts[key] = mode === null ? fact(null) : bool(mode);
          request.frame.factOverrides[0].facts[key] = bool(false);
        }
      }
    request.frame.factOverrides.push({ subject: actor('peer'), facts: peerFacts });
    const context = engine.createStructuredCombatContext(team, setup);
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin, element: hit.element, reactionId: null } };
    return engine.evaluateCombatBindings(team.program, context, bindings, frame);
  }

  function record(id, detail, field, probe, expected, output, diagnostics) {
    const value = quantity(output);
    const status = output?.state ?? 'missing';
    const correct = expected === null ? status === 'unknown' : value !== null && Math.abs(value - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
    rows.push({ entity: id, field, ...detail, ...probe, expected, value, status,
      ...correct ? {} : { issue: '当次护盾数值或受益条件与原始资料不符', diagnostics } });
    const label = id + field;
    fields.set(label, correct && (fields.get(label) ?? true));
  }

  for (const { id, key: localKey, variants: cases, ownerOnly } of variants) {
    const character = characters.get(id);
    if (!character || !starter(character)) continue;
    const key = id + '.' + localKey;
    const constellations = id === 'diona' ? [0, 1, 2, 6] : id === 'layla' ? [0, 1, 6] : [0, 6];
    for (const constellation of constellations) {
      const rank = constellation === 0 ? 1 : 10;
      const build = { ...auditBuild(character, starter(character)), constellation,
        ascension: constellation === 0 ? 0 : 6, level: constellation === 0 ? 1 : 90, talents: { normal: 1, skill: rank, burst: rank } };
      const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: peerBuild }]);
      if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
      for (const [mode, details] of cases) {
        const readings = details.map(([slot, index, attributeId, part]) => ({ slot, index, attribute: attributeId, part, ...sourceDetail(id, slot, index, build) }));
        const attrs = Object.fromEntries(readings.map(row => [row.attribute, attribute(row.attribute)]));
        const boost = multiplier(id, mode, constellation);
        for (const recipient of ['actor', 'peer']) for (const [input, onField] of [
          [mode, true], [mode, false], [typeof mode === 'boolean' ? false : 'none', true], [null, true],
        ]) {
          const result = measure(prepared.team, character, key, input, recipient, onField, attrs);
          const eligible = onField && (!ownerOnly || recipient === 'actor');
          const active = eligible && input === mode;
          const unknown = eligible && input === null;
          const probe = { mode, input, recipient, onField, constellation, baseTalentLevel: rank };
          for (const { slot, index, amount, sources, part, ...detail } of readings) {
            const field = '/talents/' + slot + '/details/' + index;
            const total = readings.filter(row => row.attribute === detail.attribute).reduce((sum, row) => sum + row.amount, 0);
            record(id, { ...detail, sources: [...sources, ...boost.sources], ...(part ? { part, component: amount } : {}) }, field, probe,
              unknown ? null : active ? total * (detail.attribute === absorption ? boost.rate : 1) : 0,
              result.outputs[detail.attribute], result.diagnostics);
          }
          if (id !== 'zhongli' || !active) continue;
          // Read the actual fixed term, then measure the actual scaling branch with the fixed term zeroed.
          const binding = character.calculation.bundle.effects.find(effect => effect.identity.id === 'zhongli.shield-absorption')?.value;
          if (binding?.kind !== 'formula' || !binding.inputs.flat) throw new Error('钟离护盾缺少独立基础吸收量绑定。');
          const parts = { flat: binding.inputs.flat, scaled: { ...binding, inputs: {
            ...binding.inputs, flat: { kind: 'constant', value: { kind: 'quantity', unit: 'hp', value: 0 } },
          } } };
          const resultParts = measure(prepared.team, character, key, input, 'actor', true, parts);
          for (const { slot, index, amount, part, sources, ...detail } of readings) {
            record(id, { ...detail, part, sources }, '/talents/' + slot + '/details/' + index, probe,
              amount, resultParts.outputs[part], resultParts.diagnostics);
          }
        }
      }
    }
  }
  for (const [key, passes] of fields) if (passes) verified.add(key);
  return finish();
}
