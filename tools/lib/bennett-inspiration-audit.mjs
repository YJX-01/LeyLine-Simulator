import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, number } from './roster-audit-settings.mjs';

const entity = 'bennett', peer = 'kaeya', effect = 'bennett.inspiration';
const field = '/talents/2/buffs/0', c1Field = '/constellations/0';
const detail = '/talents/2/details/2';
const attribute = 'attribute.attack';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const snapshot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const talentPath = snapshot + 'ChineseSimplified/talents/bennett.json';
const constellationPath = snapshot + 'ChineseSimplified/constellations/bennett.json';
const ratesPath = snapshot + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const talents = read(talentPath);
const constellations = read(constellationPath);
const characters = read(catalog + 'characters.json');
const curves = read(catalog + 'character-curves.json');
const weapons = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const sets = read(catalog + 'sets.json');
const rates = read(ratesPath).bennett.combat3;
const rankParameter = talents.combat3.attributes.labels.find(label => label.startsWith('攻击力加成比例|'))?.match(/\{(param\d+):/)?.[1];
const threshold = Number(talents.combat3.description.match(/生命值高于(\d+)%/)?.[1]) / 100;
const extra = Number(constellations.c1.description.match(/追加班尼特基础攻击力的(\d+)%/)?.[1]) / 100;

function sourceAttack(id, build) {
  const character = characters[id].stats, weapon = weapons[build.weapon.id].stats;
  return character.base.attack * curves[build.level][character.curve.attack] + character.promotion[build.ascension].attack
    + weapon.base.attack * weaponCurves[build.weaponLevel][weapon.curve.attack] + weapon.promotion[build.weaponAscension].attack;
}

export function auditBennettInspiration(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const bennett = entities.characters.find(character => character.id === entity);
  const kaeya = entities.characters.find(character => character.id === peer);
  const dullBlade = entities.weapons.find(weapon => weapon.id === 'dullblade');
  const favoniusSword = entities.weapons.find(weapon => weapon.id === 'favoniussword');
  const gladiator = entities.sets?.find(set => set.id === 'gladiatorsfinale');
  const finish = () => ({ rows, verified, resolved, gaps, summary: { bennettInspirationCases: rows.length,
    bennettInspirationFailures: rows.filter(row => row.issue).length, bennettInspirationProvenFields: verified.size } });
  if (!bennett || !kaeya || !dullBlade || !favoniusSword) return finish();
  if (!rates[rankParameter]?.length || !Number.isFinite(threshold) || !Number.isFinite(extra)
    || !constellations.c1.description.includes('不再有生命值限制')) throw new Error('班尼特固定来源缺少攻击力倍率或生命比例条件。');

  const kaeyaBuild = auditBuild(kaeya, dullBlade);
  const sources = [talentPath + '#combat3', constellationPath + '#c1', ratesPath + '#bennett/combat3/' + rankParameter,
    catalog + 'characters.json#bennett', catalog + 'characters.json#kaeya', catalog + 'character-curves.json'];

  const loadouts = [[0, 1, dullBlade, 1], [1, 1, dullBlade, 1], [0, 10, favoniusSword, 90],
    [1, 10, favoniusSword, 90], [5, 10, favoniusSword, 90]];
  if (gladiator) loadouts.push([1, 10, favoniusSword, 90, gladiator]);
  for (const [constellation, burst, weapon, level, set] of loadouts) {
    const ascension = level === 1 ? 0 : 6;
    const build = { ...auditBuild(bennett, weapon, set ? [set] : []), constellation, level, ascension, weaponLevel: level, weaponAscension: ascension,
      talents: { normal: 1, skill: 1, burst } };
    if (set) build.theoreticalSetSlots = set.slots.slice(0, 2).map(slot => ({ slot, setId: set.id }));
    const attackPercent = set ? Number(sets[set.id].effect2Pc.match(/攻击力提高(\d+)%/)?.[1]) / 100 : 0;
    const rank = burst + (constellation < 5 ? 0 : Number(constellations.c5.description.match(/提高(\d+)级/)?.[1]));
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: kaeyaBuild }]);
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
    const team = prepared.team, attack = sourceAttack(entity, build), kaeyaAttack = sourceAttack(peer, kaeyaBuild);
    const cases = [[threshold - .01, true, true, true], [threshold, true, true, true], [threshold + .01, true, true, true],
      [null, true, true, true], [threshold + .01, false, true, true], [threshold - .01, false, true, true],
      [threshold + .01, true, false, true], [threshold + .01, true, true, false], [threshold + .01, null, true, true]];

    for (const recipient of ['actor', 'peer']) for (const [hpRatio, inside, onField, cast] of cases) {
      const dealer = recipient === 'actor' ? bennett : kaeya;
      const talent = dealer.talents[0], hit = talent.hits[0];
      const { setup, request } = auditHit(dealer, talent, hit);
      const [event] = setup.events;
      event.actorId = recipient;
      event.timeMs = 1000;
      if (cast) setup.events.unshift({ id: 'cast', kind: 'action', timeMs: 0, order: 0, actorId: 'actor', targetIds: [],
        skillId: 'bennett.burst', category: 'burst', sourceEventIds: [], facts: {} });
      const other = recipient === 'actor' ? 'peer' : 'actor';
      const receiver = { onField: bool(onField), 'bennett.inField': inside === null ? fact(null) : bool(inside),
        hpRatio: hpRatio === null ? fact(null) : number('scalar', hpRatio) };
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
        hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin, element: hit.element, reactionId: null },
        factOverrides: [{ subject: { kind: 'actor', id: recipient }, facts: receiver }, { subject: { kind: 'actor', id: other },
          facts: { onField: bool(!onField), 'bennett.inField': bool(inside !== true), hpRatio: number('scalar', hpRatio > threshold ? .5 : 1) } }] };
      const inactiveField = !cast || !onField || inside === false;
      const thresholdApplies = !constellation && hpRatio !== null && hpRatio <= threshold;
      const baseContribution = inactiveField || thresholdApplies ? 0 : inside === null || !constellation && hpRatio === null ? null
        : attack * rates[rankParameter][rank - 1];
      const extraContribution = inactiveField || !constellation ? 0 : inside === null ? null : attack * extra;
      const total = baseContribution === null || extraContribution === null ? null : baseContribution + extraContribution;
      const probe = { constellation, rank, weapon: weapon.id, set: set?.id, recipient, hpRatio, inside, onField, cast };
      const refs = [...new Set([...sources, catalog + 'weapons.json#' + weapon.id, catalog + 'weapons.json#dullblade',
        catalog + 'weapon-curves.json', ...constellation >= 5 ? [constellationPath + '#c5'] : [], ...set ? [catalog + 'sets.json#' + set.id] : []])];
      const base = recipient === 'actor' ? attack * (1 + attackPercent) : kaeyaAttack;

      function record(pointer, rule, expected, disabled) {
        const context = engine.createStructuredCombatContext(team, setup);
        if (disabled) {
          const owner = context.actors.find(actor => actor.id === 'actor');
          owner.effects = owner.effects.filter(reference => reference.id !== disabled);
        }
        const query = engine.evaluateCombatBindings(team.program, context, { [attribute]: {
          kind: 'attribute', actor: { role: 'recipient' }, key: { namespace: 'builtin', id: attribute, revision: '1' }, at: { kind: 'current', phase: 'same' },
        } }, frame);
        const output = query.outputs[attribute], status = output?.state ?? 'missing';
        const value = status === 'known' && output.value.kind === 'quantity' && output.value.unit === 'attack' ? output.value.value - base : null;
        const matches = expected === null ? status === 'unknown' : value !== null && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
        const row = { entity, field: pointer, attribute, effect: rule, probe, sources: refs, expected, value, status,
          ...matches ? {} : { issue: '鼓舞领域当次基础攻击力贡献或适用条件与固定依据不符。', diagnostics: query.diagnostics } };
        rows.push(row);
        return row;
      }

      const baseRow = record(field + '/modifiers/0', effect, baseContribution, effect + '.1');
      rows.push({ ...baseRow, field: detail });
      record(field + '/modifiers/1', effect + '.1', extraContribution, effect);
      if (constellation) record(c1Field, effect, total);
    }
  }

  if (rows.length && rows.every(row => !row.issue)) {
    for (const pointer of [c1Field, detail, field + '/modifiers/0', field + '/modifiers/1']) verified.add(entity + pointer);
    resolved.push({ entity, field: c1Field, resolved: '确认鼓舞领域生效后，一命解除受益者的70%生命门槛并追加班尼特自身基础攻击力的20%。', remaining: '' });
  }
  return finish();
}
