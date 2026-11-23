import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const ratesPath = capture + 'stats/talents.json';
const sourcePath = (group, entity) => capture + 'ChineseSimplified/' + group + '/' + entity + '.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const rates = read(ratesPath);
const characters = read(catalog + 'characters.json');
const characterCurves = read(catalog + 'character-curves.json');
const weapons = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');

const summonHp = 'attribute.summonInitialHp';
const healingChance = 'attribute.talentHealingChance';
const hymn = 'attribute.paleHymnFromMoonsong';
const bond = 'attribute.bondOfLifeFromHealing';
const summons = [
  ['amber', 1, 0, 'baronBunnyCreated', 'recurvebow'],
  ['aratakiitto', 1, 1, 'ushiCreated', 'thebell'],
  ['ganyu', 1, 0, 'iceLotusCreated', 'recurvebow'],
  ['lyney', 0, 10, 'grinMalkinHatCreated', 'recurvebow'],
  ['ningguang', 1, 0, 'jadeScreenCreated', 'prototypeamber'],
];
const quantity = (id) => ({ kind: 'attribute', actor: { role: 'recipient' },
  key: { namespace: 'builtin', id, revision: '1' }, at: { kind: 'current', phase: 'same' } });

function sourceDetail(id, slot, detail, build) {
  const group = 'combat' + (slot + 1), talentPath = sourcePath('talents', id), rankPath = sourcePath('constellations', id);
  const original = read(talentPath), talent = original[group], raw = talent.attributes.labels[detail];
  const parameter = raw.match(/\{(param\d+):/)?.[1];
  const constellations = read(rankPath), increase = [3, 5].find(rank => constellations['c' + rank].description.includes(talent.name));
  const category = ['normal', 'skill', 'burst'][slot];
  const rank = build.talents[category] + (increase <= build.constellation ? 3 : 0);
  const rate = rates[id]?.[group]?.[parameter]?.[rank - 1];
  if (!Number.isFinite(rate) || (!increase && category !== 'normal')) throw new Error(id + ': 固定来源缺少详情参数或技能等级。');
  return { sourceLabel: raw.split('|')[0], rank, rate, original, talent, constellations, sources: [talentPath + '#' + group,
    ratesPath + '#' + id + '/' + group + '/' + parameter, ...increase ? [rankPath + '#c' + increase] : []] };
}

function capturedHp(id, build) {
  const character = characters[id].stats, promotion = character.promotion[build.ascension];
  const weapon = weapons[build.weapon.id].stats;
  const white = character.base.hp * characterCurves[build.level][character.curve.hp] + promotion.hp;
  const characterHpRate = character.specialized === 'FIGHT_PROP_HP_PERCENT' ? promotion.specialized : 0;
  const weaponHpRate = weapon.specialized === 'FIGHT_PROP_HP_PERCENT'
    ? weapon.base.specialized * weaponCurves[build.weaponLevel][weapon.curve.specialized] : 0;
  return { basis: white * (1 + characterHpRate + weaponHpRate), sources: [catalog + 'characters.json#' + id,
    catalog + 'character-curves.json#' + build.level, catalog + 'weapons.json#' + build.weapon.id,
    catalog + 'weapon-curves.json#' + build.weaponLevel] };
}

function assertSource(ok, id, detail) {
  if (!ok) throw new Error(id + ': 固定来源缺少' + detail + '的范围、条件或数值。');
}

function prepareBuild(engine, character, weapon, peerBuild, { ascension, constellation, talentLevel, weaponLevel = 1 }) {
  const level = [1, 40, 50, 60, 70, 80, 90][ascension];
  const build = { ...auditBuild(character, weapon), level, ascension, constellation, weaponLevel,
    weaponAscension: weaponLevel === 90 ? 6 : 0, talents: { normal: talentLevel, skill: talentLevel, burst: talentLevel } };
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: peerBuild }]);
  if (!prepared.ok) throw new Error(character.id + ': ' + JSON.stringify(prepared.diagnostics));
  return { build, team: prepared.team };
}

/** Checks one explicitly established conversion, summon, or eligible hit against captured talent rows. */
export function auditTalentDetailCurrent(entities, engine) {
  const byId = new Map(entities.characters.map(character => [character.id, character]));
  const weaponById = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const starter = character => character && weaponById.get(novice[character.identity.weaponType]);
  const peer = byId.get('kaeya');
  const rows = [], fields = new Map(), verified = new Set();
  const finish = () => ({ rows, verified, summary: { talentDetailCurrentCases: rows.length,
    talentDetailCurrentMismatches: rows.filter(row => row.issue).length, verifiedTalentDetailCurrentFields: verified.size } });
  if (!starter(peer)) return finish();
  const peerBuild = auditBuild(peer, starter(peer));

  function run(character, slot, detail, attribute, unit, configurations, probes) {
    if (!starter(character)) return;
    const id = character.id, field = '/talents/' + slot + '/details/' + detail, key = id + field;
    for (const configuration of configurations) {
      const weapon = configuration.weapon ? weaponById.get(configuration.weapon) : starter(character);
      if (!weapon) { fields.set(key, false); continue; }
      const { build, team } = prepareBuild(engine, character, weapon, peerBuild, configuration);
      const reference = sourceDetail(id, slot, detail, build);
      for (const probe of probes(reference, build)) {
        const { recipient = 'actor', expected, hitCategory = 'normal', hitId, onField = true, values, sources = [] } = probe;
        const dealer = recipient === 'actor' ? character : peer;
        const talent = dealer.talents[hitCategory === 'skill' ? 1 : hitCategory === 'burst' ? 2 : 0];
        const hit = talent.hits.find(entry => hitId ? entry.id === hitId : entry.category === hitCategory);
        const { setup, request } = auditHit(dealer, talent, hit);
        const { frame } = request;
        setup.events.at(-1).actorId = recipient;
        setAuditDefaults(character, frame);
        setGateFacts(character, frame, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)));
        for (const [input, value] of Object.entries(values)) if (value === null) {
          const scope = character.metadata.facts[input].scope;
          (scope === 'query' ? frame.facts : frame.factOverrides[0].facts)[input] = fact(null);
        }
        frame.factOverrides[0].facts.onField = bool(recipient === 'actor' && onField);
        frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: { onField: bool(recipient === 'peer' && onField) } });
        const context = engine.createStructuredCombatContext(team, setup);
        const result = engine.evaluateCombatBindings(team.program, context, { [attribute]: quantity(attribute) }, {
          ...frame, ownerId: recipient, recipientId: recipient, contributorId: null,
          hit: { skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, origin: hit.origin, family: 'ordinary', reactionId: null },
        });
        const output = result.outputs[attribute], status = output?.state ?? 'missing';
        const value = output?.state === 'known' && output.value.kind === 'quantity' && output.value.unit === unit ? output.value.value : null;
        const correct = expected === null ? status === 'unknown' : value !== null && Math.abs(value - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
        rows.push({ entity: id, field, attribute, unit, sourceLabel: reference.sourceLabel, rank: reference.rank,
          ascension: build.ascension, constellation: build.constellation, weapon: weapon.id, weaponLevel: build.weaponLevel,
          ...probe, recipient, onField, hitCategory, value, status, sources: [...reference.sources, ...sources],
          ...correct ? {} : { issue: '当次数值或适用范围与固定来源不符', diagnostics: result.diagnostics } });
        fields.set(key, correct && (fields.get(key) ?? true));
      }
    }
  }

  const builds = [{ ascension: 0, constellation: 0, talentLevel: 1 },
    { ascension: 6, constellation: 0, talentLevel: 10 }, { ascension: 6, constellation: 6, talentLevel: 10 }];
  for (const [id, slot, detail, condition, weapon] of summons) {
    run(byId.get(id), slot, detail, summonHp, 'hp', [...builds, { ...builds[2], weapon, weaponLevel: 90 }], (reference, build) => {
      assertSource(reference.sourceLabel.includes('继承生命') && /耐久度按比例继承.*生命值上限/.test(reference.talent.description), id, '召唤继承生命');
      const reading = capturedHp(id, build), expected = reading.basis * reference.rate;
      const key = id + '.' + condition;
      const hit = id === 'lyney' ? { hitCategory: 'charged', hitId: 'lyney.normal.param11' } : { hitCategory: 'skill' };
      return [
        { ...hit, values: { [key]: true }, expected, basis: reading.basis, sources: reading.sources },
        { ...hit, values: { [key]: false }, expected: 0 },
        { ...hit, values: { [key]: null }, expected: null },
        { values: { [key]: true }, recipient: 'peer', expected: 0 },
        ...id === 'lyney' ? [{ hitCategory: 'burst', hitId: 'lyney.burst.param2', values: { [key]: true }, expected,
          basis: reading.basis, sources: [...reading.sources, sourcePath('talents', id) + '#combat3'] }] : [],
      ];
    });
  }

  run(byId.get('noelle'), 1, 3, healingChance, 'scalar', [...builds, { ...builds[1], constellation: 1 }], (reference, build) => {
    const description = reference.constellations.c1.description;
    const c1Rate = Number(description.match(/触发几率提升至(\d+)%/)?.[1]) / 100;
    assertSource(reference.sourceLabel === '治疗触发几率' && /普通攻击与重击命中时/.test(reference.talent.description)
      && /同时处于大扫除与护心铠状态/.test(description) && Number.isFinite(c1Rate), 'noelle', '护心铠与一命治疗');
    const sources = [sourcePath('constellations', 'noelle') + '#c1'];
    return [
      [true, true, false, 'normal', 'actor', reference.rate],
      [true, true, true, 'charged', 'actor', build.constellation >= 1 ? c1Rate : reference.rate],
      [true, true, null, 'normal', 'actor', build.constellation >= 1 ? null : reference.rate],
      [true, null, true, 'normal', 'actor', null],
      [true, false, true, 'charged', 'actor', 0],
      [null, true, true, 'normal', 'actor', null],
      [false, null, null, 'normal', 'actor', 0],
      [true, true, true, 'plunge', 'actor', 0],
      [true, true, true, 'skill', 'actor', 0],
      [true, true, true, 'normal', 'peer', 0],
    ].map(([hasShield, landed, sweeping, hitCategory, recipient, expected]) => ({ hitCategory, recipient, expected, sources,
      values: { 'noelle.breastplateShieldActive': hasShield, 'noelle.breastplateAttackLanded': landed, 'noelle.sweepingTime': sweeping } }));
  });

  run(byId.get('lauma'), 2, 1, hymn, 'count', builds, reference => {
    const desc = reference.talent.description;
    const countInDescription = Number(desc.match(/每层使菈乌玛获得(\d+)层/)?.[1]);
    assertSource(reference.sourceLabel === '月咏转化为苍色祷歌' && /施放元素爆发后的15秒内/.test(desc)
      && /该效果至多触发一次/.test(desc) && /消耗所有的「月咏」/.test(desc) && countInDescription === reference.rate,
    'lauma', '月咏转化');
    return [
      [true, 1, 'actor', countInDescription], [true, 3, 'actor', 3 * countInDescription],
      [true, 0, 'actor', 0], [true, null, 'actor', null],
      [false, 3, 'actor', 0], [false, null, 'actor', 0], [null, 3, 'actor', null], [true, 3, 'peer', 0],
    ].map(([converted, amount, recipient, expected]) => ({ values: { 'lauma.moonsongConverted': converted, 'lauma.moonsongConsumed': amount }, recipient, expected }));
  });

  run(byId.get('clorinde'), 1, 4, bond, 'hp', [...builds, { ascension: 3, constellation: 0, talentLevel: 4 },
    { ascension: 4, constellation: 0, talentLevel: 4 }], (reference, build) => {
    const passive = reference.original.passive2.description;
    const upgraded = Number(passive.match(/治疗回复量转化为生命之契的比例提升至(\d+)%/)?.[1]) / 100;
    assertSource(reference.sourceLabel === '生命之契转化' && /贯夜以外的治疗效果将不会生效/.test(reference.talent.description)
      && /「夜巡」状态将在克洛琳德退场时解除/.test(reference.talent.description) && Number.isFinite(upgraded), 'clorinde', '夜巡治疗转化及突破被动');
    const rate = build.ascension >= 4 ? upgraded : reference.rate;
    const sources = [sourcePath('talents', 'clorinde') + '#passive2'];
    return [
      [true, true, 1000, true, 'actor', 1000 * rate], [true, true, 250.5, true, 'actor', 250.5 * rate],
      [true, true, 0, true, 'actor', 0], [true, true, null, true, 'actor', null],
      [true, false, null, true, 'actor', 0], [true, null, 1000, true, 'actor', null],
      [false, true, 1000, true, 'actor', 0], [null, true, 1000, true, 'actor', null],
      [true, true, 1000, false, 'actor', 0], [true, true, 1000, true, 'peer', 0],
    ].map(([active, confirmed, amount, onField, recipient, expected]) => ({ values: { 'clorinde.nightVigil': active,
      'clorinde.nonImpaleHealingConfirmed': confirmed, 'clorinde.convertibleHealingHp': amount }, onField, recipient, expected, sources }));
  });

  for (const [key, valid] of fields) if (valid) verified.add(key);
  return finish();
}
