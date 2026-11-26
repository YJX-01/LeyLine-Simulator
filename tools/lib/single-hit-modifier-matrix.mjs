import { auditOrdinaryHitProfiles, precomputeAliasHitIds } from './ordinary-hit-profiles.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

export { precomputeAliasHitIds };

const categories = ['normal', 'charged', 'plunge', 'skill', 'burst'];
const melee = new Set(['WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE']);
const gladiator = 'gladiatorsfinale', crimson = 'crimsonwitchofflames', noblesse = 'noblesseoblige', viridescent = 'viridescentvenerer';

function entries(character) {
  return character.talents.flatMap(talent => {
    const source = character.metadata.talents.find(row => row.id === talent.id);
    return talent.hits.map(hit => ({ talent, hit, source, declaration: source?.hits?.find(row => row.id === hit.id) }));
  });
}

function ordinary({ hit, declaration }) {
  return declaration && !declaration.when?.length && !hit.base.captures.length
    && Object.keys(hit.damage).length === 1 && hit.damage.ordinary;
}

// One level, no ascension, no inventory. Only explicit linear terms have a hand-calculated oracle.
function whiteStat(character, weapon, stat) {
  const base = character.attributes.base[stat] * character.progression.curves[stat][1] + character.progression.promotion[0][stat];
  return stat === 'attack' ? base + weapon.baseAttack * weapon.attackCurve[1] + weapon.promotion[0] : base;
}

function baseDamage(character, weapon, { declaration, source }, attackBonus = 0) {
  if (!Array.isArray(declaration?.base)) return null;
  let total = 0;
  for (const term of declaration.base) {
    if (!['attack', 'defense', 'hp'].includes(term.stat) || Object.keys(term).some(key => !['stat', 'parameter', 'ratio'].includes(key))) return null;
    const stat = whiteStat(character, weapon, term.stat) * (term.stat === 'attack' ? 1 + attackBonus : 1);
    const rank = character.id === 'tartaglia' && source.category === 'normal' ? 2 : 1;
    const rate = term.ratio ?? source.parameters.find(p => p.id === term.parameter)?.values[rank - 1];
    total += stat * rate;
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function auditSingleHitModifiers(entities, engine, options = {}) {
  const { characterIds, aliasHitIds, includeCrossChecks = true } = options;
  const characters = new Map(entities.characters.map(c => [c.id, c]));
  const weapons = new Map(entities.weapons.map(w => [w.id, w]));
  const sets = new Map(entities.sets.map(s => [s.id, s]));
  const rows = [], unsampled = [];
  const seenAliases = new Set();
  const teamCache = new Map();
  const starter = c => weapons.get(novice[c.identity.weaponType]);

  function build(c, gear = [], weapon = starter(c), constellation = 0) {
    const definitions = gear.map(([id]) => sets.get(id));
    const result = auditBuild(c, weapon, definitions);
    result.constellation = constellation;
    let offset = 0;
    result.theoreticalSetSlots = gear.flatMap(([id, count]) => {
      const slots = sets.get(id).slots.slice(offset, offset + count);
      offset += count;
      return slots.map(slot => ({ slot, setId: id }));
    });
    return result;
  }

  function buildKey(b) {
    const slots = (b.theoreticalSetSlots ?? []).map(s => s.setId + ':' + s.slot).join(',');
    return `${b.character.id}|${b.weapon?.id ?? ''}|${b.constellation}|${slots}`;
  }

  function team(dealer, peer) {
    const key = buildKey(dealer) + '||' + (peer ? buildKey(peer) : '');
    const cached = teamCache.get(key);
    if (cached) return cached;
    const actors = [{ id: 'actor', build: dealer }];
    if (peer) actors.push({ id: 'peer', build: peer });
    const prepared = engine.prepareStructuredBuilds(actors);
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
    teamCache.set(key, prepared.team);
    return prepared.team;
  }

  function evaluate(party, character, entry, mode = 'noncritical', configure) {
    const { setup, request } = auditHit(character, entry.talent, entry.hit);
    setAuditDefaults(character, request.frame);
    configure?.(setup, request.frame);
    request.critMode = mode;
    const result = engine.evaluateStructuredHit(party, setup, request);
    const value = result.totals.all.value?.value;
    if (Number.isFinite(value)) return { value };
    return { value: null, required: result.requiredInputs?.map(input => input.key), diagnostics: result.diagnostics };
  }

  function record(rule, character, entry, conditions, actual, expected, before) {
    const missing = actual.value === null ? actual : before?.value === null ? before : undefined;
    const status = missing ? (missing.required?.length ? 'missing-input' : 'missing-result')
      : expected === null || !Number.isFinite(expected) || expected <= 0 ? 'missing-evidence'
      : Math.abs(actual.value - expected) <= Math.max(1e-8, expected * 1e-8) ? 'passed' : 'mismatch';
    rows.push({ rule, recipient: character.id, hit: entry.hit.id, category: entry.hit.category, conditions, expected, actual: actual.value,
      ...(before && { before: before.value }), status, ...(missing && { required: missing.required, diagnostics: missing.diagnostics }) });
  }

  const context = { weapons, characters, build, team, evaluate, record, whiteStat, seenAliases, aliasHitIds, unsampled };
  const targetCharacters = characterIds ? characterIds.map(id => characters.get(id)).filter(Boolean) : [...characters.values()];
  for (const character of targetCharacters) {
    const hits = entries(character);
    auditOrdinaryHitProfiles(character, hits, starter(character), context);
    const normal = hits.find(e => e.talent.category === 'normal' && e.hit.category === 'normal');
    const parties = [0, 2, 4].map(n => team(build(character, n ? [[gladiator, n]] : [])));
    if (!normal?.declaration || !normal.hit.damage.ordinary || normal.hit.base.captures.length) {
      unsampled.push({ recipient: character.id, category: 'normal', required: true, reason: '缺少可独立对照的普攻首段' });
    } else {
      const before = evaluate(parties[0], character, normal);
      for (const [index, pieces] of [0, 2, 4].entries()) {
        const weaponType = character.identity.weaponType;
        const base = baseDamage(character, starter(character), normal, pieces >= 2 ? .18 : 0);
        record('gladiator-normal', character, normal, { set: gladiator, pieces, weaponType }, pieces ? evaluate(parties[index], character, normal) : before,
          base === null ? null : base * .45 * (pieces === 4 && melee.has(weaponType) ? 1.35 : 1), before);
      }
    }
    for (const category of categories.slice(1)) {
      const entry = hits.find(e => e.hit.category === category && ordinary(e));
      if (!entry) {
        unsampled.push({ recipient: character.id, category, reason: '没有无捕获、无前置门槛的该类直伤段' });
        continue;
      }
      const before = evaluate(parties[1], character, entry);
      record('gladiator-exclusion', character, entry, { set: gladiator, fromPieces: 2, toPieces: 4 }, evaluate(parties[2], character, entry), before.value, before);
    }
  }

  if (!includeCrossChecks) {
    const samples = [...new Map(unsampled.map(row => [JSON.stringify(row), row])).values()];
    const failures = rows.filter(row => row.status !== 'passed').concat(samples.filter(row => row.required));
    return { rows, unsampled: samples, failures };
  }

  // Both 2-piece sources occupy different slots. Cross element, hit category and stacking bucket.
  for (const [id, firstSet, secondSet] of [['yanfei', crimson, noblesse], ['yanfei', gladiator, crimson], ['kaeya', crimson, noblesse]]) {
    const c = characters.get(id);
    const hits = entries(c);
    const baseline = new Map();
    for (const a of [false, true]) for (const b of [false, true]) {
      const gear = [[firstSet, a], [secondSet, b]].filter(([, on]) => on).map(([name]) => [name, 2]);
      const party = team(build(c, gear));
      for (const category of categories) {
        const entry = hits.find(e => e.hit.category === category && ordinary(e));
        if (!entry) {
          unsampled.push({ recipient: id, category, required: id === 'yanfei', reason: '缺少无捕获的叠加规则样本' });
          continue;
        }
        const cross = firstSet === gladiator;
        const pyro = id === 'yanfei';
        const base = baseDamage(c, starter(c), entry, cross && a ? .18 : 0);
        const bonus = (pyro && (cross ? b : a) ? .15 : 0) + (!cross && b && category === 'burst' ? .20 : 0);
        const result = evaluate(party, c, entry);
        if (!a && !b) baseline.set(entry.hit.id, result);
        record(cross ? 'attack-times-bonus' : 'additive-bonuses', c, entry, { firstSet, a, secondSet, b },
          result, base === null ? null : base * (1 + bonus) * .45, baseline.get(entry.hit.id));
        if (cross && a && b) {
          for (const [mode, factor] of [['noncritical', 1], ['critical', 1.5], ['expected', 1.025]]) {
            for (const resistance of [-.1, 0, .1]) {
              const actual = evaluate(party, c, entry, mode, setup => {
                setup.targets[0].inputs['resistance.pyro'] = number('scalar', resistance);
              });
              const multiplier = resistance < 0 ? 1 - resistance / 2 : 1 - resistance;
              record('crit-and-resistance', c, entry, { firstSet, secondSet, mode, resistance }, actual,
                base === null ? null : base * (1 + bonus) * .5 * factor * multiplier, result);
            }
          }
        }
      }
    }
  }

  // Xinyan C2 adds 100 percentage points only to the physical portion of her burst.
  const xinyan = characters.get('xinyan');
  for (const constellation of [0, 2]) for (const weapon of [starter(xinyan), weapons.get('blackcliffslasher')]) {
    const party = team(build(xinyan, [], weapon, constellation));
    for (const [hitId, physical] of [['xinyan.burst.param1', true], ['xinyan.burst.param2', false]]) {
      const entry = entries(xinyan).find(e => e.hit.id === hitId && ordinary(e));
      if (!entry) {
        unsampled.push({ recipient: xinyan.id, hit: hitId, required: true, reason: '缺少辛焱爆发的物理段或火伤段' });
        continue;
      }
      const base = baseDamage(xinyan, weapon, entry);
      const cd = .5 + (weapon.id === 'blackcliffslasher' ? .12 : 0);
      const cr = physical && constellation === 2 ? 1 : .05;
      const before = evaluate(party, xinyan, entry);
      for (const [mode, factor] of [['noncritical', 1], ['critical', 1 + cd], ['expected', 1 + cr * cd]]) {
        record('crit-selection', xinyan, entry, { constellation, weapon: weapon.id, mode }, evaluate(party, xinyan, entry, mode),
          base === null ? null : base * .45 * factor, before);
      }
    }
  }

  // Jean C4 is target-wide. The 2-piece Anemo bonus belongs exclusively to its wearer.
  const jean = characters.get('jean'), sucrose = characters.get('sucrose');
  for (const [dealer, peer, category, element] of [[sucrose, jean, 'normal', 'anemo'], [jean, sucrose, 'normal', 'physical'], [jean, sucrose, 'skill', 'anemo']]) {
    for (const wears of [dealer, peer]) {
      const member = c => build(c, c === wears ? [[viridescent, 2]] : [], starter(c), c === jean ? 4 : 0);
      const party = team(member(dealer), member(peer));
      const entry = entries(dealer).find(e => e.hit.category === category && ordinary(e));
      if (!entry) {
        unsampled.push({ recipient: dealer.id, category, required: true, reason: '缺少减抗范围样本' });
        continue;
      }
      const base = baseDamage(dealer, starter(dealer), entry);
      const baseline = new Map();
      for (const inField of [false, true]) for (const resistance of [0, .10, .40]) {
        const anemo = element === 'anemo';
        const effective = resistance - (inField && anemo ? .4 : 0);
        const factor = effective < 0 ? 1 - effective / 2 : 1 - effective;
        const actual = evaluate(party, dealer, entry, 'noncritical', (setup, frame) => {
          setup.targets[0].inputs['resistance.' + element] = number('scalar', resistance);
          setGateFacts(jean, frame, { 'jean.c4EnemyInsideDandelion': inField });
        });
        if (!inField) baseline.set(resistance, actual);
        record('resistance-and-recipient', dealer, entry, { source: jean.id, set: viridescent, wears: wears.id, element, inField, resistance }, actual,
          base === null ? null : base * .5 * factor * (anemo && wears === dealer ? 1.15 : 1), baseline.get(resistance));
      }
    }
  }
  // C0 Inspiration uses Bennett's white attack, even when another character deals the hit.
  const bennett = characters.get('bennett'), kaeya = characters.get('kaeya');
  for (const [dealer, peer] of [[kaeya, bennett], [bennett, kaeya]]) {
    const entry = entries(dealer).find(e => e.hit.category === 'normal' && ordinary(e));
    if (!entry) {
      unsampled.push({ recipient: dealer.id, category: 'normal', required: true, reason: '缺少鼓舞领域的普攻对照' });
      continue;
    }
    const weapon = starter(dealer), party = team(build(dealer), build(peer));
    const flat = whiteStat(bennett, starter(bennett), 'attack') * .56;
    const base = baseDamage(dealer, weapon, entry);
    const before = evaluate(party, dealer, entry);
    for (const caster of [kaeya, bennett]) for (const onField of [false, true]) for (const inField of [false, true]) {
      const actual = evaluate(party, dealer, entry, 'noncritical', (setup, frame) => {
        setup.events[0].timeMs = 1000;
        setup.events.unshift({ id: 'cast', kind: 'action', actorId: caster === dealer ? 'actor' : 'peer', targetIds: [],
          timeMs: 0, order: 0, category: 'burst', skillId: caster.id + '.burst', sourceEventIds: [], facts: {} });
        Object.assign(frame.factOverrides[0].facts, { onField: bool(onField), 'bennett.inField': bool(inField) });
        frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: {
          onField: bool(!onField), 'bennett.inField': bool(!inField), hpRatio: number('scalar', 1),
        } });
      });
      const bonus = caster === bennett && onField && inField ? flat : 0;
      record('party-attack', dealer, entry, { source: bennett.id, caster: caster.id, onField, inField }, actual,
        base === null ? null : base * (1 + bonus / whiteStat(dealer, weapon, 'attack')) * .45, before);
    }
  }
  const samples = [...new Map(unsampled.map(row => [JSON.stringify(row), row])).values()];
  const failures = rows.filter(row => row.status !== 'passed').concat(samples.filter(row => row.required));
  return { rows, unsampled: samples, failures };
}
