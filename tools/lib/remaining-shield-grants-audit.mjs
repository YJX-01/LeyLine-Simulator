import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const upstream = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const mechanics = 'kqm-theorycrafting-library@7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5:';
const ratesPath = upstream + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const characterStats = read(catalog + 'characters.json');
const characterCurves = read(catalog + 'character-curves.json');
const weaponStats = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const rates = read(ratesPath);
const owner = 'actor';
const peer = 'peer';
const raw = 'attribute.shieldAbsorption';
const effective = 'attribute.effectiveShieldAbsorption';
const added = 'attribute.shieldAbsorptionAdded';
const strength = 'attribute.shieldStrength';
const actor = id => ({ kind: 'actor', id });
const flag = value => value === null ? fact(null) : bool(value);
const quantity = (unit, value) => value === null ? fact(null) : number(unit, value);
const element = value => fact(value === null ? null : { kind: 'enum', value });
const at = { kind: 'current', phase: 'same' };
const upstreamFile = (group, id) => upstream + 'ChineseSimplified/' + group + '/' + id + '.json';
const minLevel = [1, 20, 40, 50, 60, 70, 80];

function readNumber(text, pattern) {
  const value = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(value)) throw new Error('固定来源缺少参数 ' + pattern.source);
  return value;
}
const percentage = (text, pattern) => readNumber(text, pattern) / 100;

function sourcePanel(id, stat, build) {
  const stats = characterStats[id].stats, promotion = stats.promotion[build.ascension];
  const specializedStat = { hp: 'HP', attack: 'ATTACK', defense: 'DEFENSE' }[stat];
  const specialized = stats.specialized === 'FIGHT_PROP_' + specializedStat + '_PERCENT' ? promotion.specialized : 0;
  let white = stats.base[stat] * characterCurves[build.level][stats.curve[stat]] + promotion[stat];
  const sources = [catalog + 'characters.json#' + id, catalog + 'character-curves.json#' + build.level];
  if (stat === 'attack') {
    const weapon = weaponStats[build.weapon.id].stats;
    white += weapon.base.attack * weaponCurves[build.weaponLevel][weapon.curve.attack] + weapon.promotion[build.weaponAscension].attack;
    sources.push(catalog + 'weapons.json#' + build.weapon.id, catalog + 'weapon-curves.json#' + build.weaponLevel);
  }
  return { value: white * (1 + specialized), sources };
}

function originalLanYanShield(build) {
  const talentPath = upstreamFile('talents', 'lanyan'), skill = read(talentPath).combat2;
  const rankPath = upstreamFile('constellations', 'lanyan'), c3 = read(rankPath).c3.description;
  const label = skill.attributes.labels.find(line => line.startsWith('护盾吸收量|'));
  const [, ratio, flat] = label?.match(/\{(param\d+):[^}]*P\}攻击力\+\{(param\d+):I\}/) ?? [];
  if (!ratio || !flat || !c3.includes(skill.name)) throw new Error('凤缕护盾固定来源缺少原始吸收量或战技加级。');
  const level = build.talents.skill + (build.constellation >= 3 ? readNumber(c3, /提高(\d+)级/) : 0);
  const panel = sourcePanel('lanyan', 'attack', build);
  const value = panel.value * rates.lanyan.combat2[ratio][level - 1] + rates.lanyan.combat2[flat][level - 1];
  return { value, sources: [...panel.sources, talentPath + '#combat2', rankPath + '#c3',
    ratesPath + '#lanyan/combat2/' + ratio, ratesPath + '#lanyan/combat2/' + flat] };
}

export const remainingShieldGrantIds = ['kaeya', 'noelle', 'dahlia', 'thoma', 'lanyan'];

export function auditRemainingShieldGrants(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const starter = character => character && weapons.get(novice[character.identity.weaponType]);
  const teams = new Map();

  function build(id, { constellation = 0, ascension = 0, level = minLevel[ascension], skill = 1 } = {}) {
    const character = characters.get(id);
    return { ...auditBuild(character, starter(character)), constellation, ascension, level, talents: { normal: 1, skill, burst: 1 } };
  }

  function measure(id, settings, { recipient = owner, category = 'normal', ownerOnField = recipient === owner,
    peerOnField = recipient === peer, facts = [], query = {} }, expected) {
    const key = JSON.stringify([id, settings]);
    if (!teams.has(key)) {
      const prepared = engine.prepareStructuredBuilds([{ id: owner, build: build(id, settings) }, { id: peer, build: build('kaeya') }]);
      if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
      teams.set(key, prepared.team);
    }
    const character = characters.get(id), dealer = recipient === owner ? character : characters.get('kaeya');
    const talent = dealer.talents[0], hit = talent.hits.find(entry => entry.category === category);
    if (!hit) throw new Error(dealer.id + ': 缺少对照类别 ' + category);
    const { setup, request } = auditHit(dealer, talent, hit);
    setup.events.find(event => event.id === 'hit').actorId = recipient;
    setAuditDefaults(character, request.frame);
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin,
        element: hit.element, reactionId: null }, facts: { ...request.frame.facts, ...query } };
    const inputs = [[owner, 'onField', flag(ownerOnField)], [peer, 'onField', flag(peerOnField)],
      [peer, 'hpRatio', number('scalar', 1)], ...facts];
    for (const [id, key, value] of inputs) {
      let override = frame.factOverrides.find(row => row.subject.kind === 'actor' && row.subject.id === id);
      if (!override) frame.factOverrides.push(override = { subject: actor(id), facts: {} });
      override.facts[key] = value;
    }
    const team = teams.get(key);
    const context = engine.createStructuredCombatContext(team, setup);
    const bindings = Object.fromEntries(Object.keys(expected).map(id => [id, { kind: 'attribute',
      actor: { role: 'recipient' }, key: { namespace: 'builtin', id, revision: '1' }, at }]));
    return engine.evaluateCombatBindings(team.program, context, bindings, frame);
  }

  function clause(entity, group, rank, covered, remaining, run) {
    if (!starter(characters.get(entity)) || !starter(characters.get('kaeya'))) return;
    const passive = group === 'passives', field = '/' + group + '/' + (rank - 1);
    const path = upstreamFile(passive ? 'talents' : 'constellations', entity);
    const anchor = (passive ? 'passive' : 'c') + rank;
    const text = read(path)[anchor].description, first = rows.length;
    function check(settings, input, expected, sources = [], expectedNullStatus = 'unknown') {
      const result = measure(entity, settings, input, expected);
      for (const [output, wanted] of Object.entries(expected)) {
        const datum = result.outputs[output], status = datum?.state ?? 'missing';
        const unit = output === strength ? 'scalar' : 'hp';
        const value = status === 'known' && datum.value.kind === 'quantity' && datum.value.unit === unit ? datum.value.value : null;
        const correct = wanted === null ? status === expectedNullStatus
          : value !== null && Math.abs(value - wanted) <= Math.max(1e-8, Math.abs(wanted) * 1e-9);
        rows.push({ entity, field, output, probe: { settings, input }, sources: [path + '#' + anchor, ...sources],
          expected: wanted, value, status, ...correct ? {} : { issue: '当次护盾输出与固定来源不符', diagnostics: result.diagnostics } });
      }
    }
    run(text, check);
    if (rows.length === first || rows.slice(first).some(row => row.issue)) return;
    verified.add(entity + field + '/buffs/0');
    resolved.push({ entity, field, resolved: covered, remaining });
    gaps.push({ entity, field, reason: remaining });
  }

  clause('kaeya', 'constellations', 4, '确认受击与可触发状态，计算低于阈值时凯亚的初始盾量及来伤元素吸收量。',
    '60秒限次、盾实例存续、换人及实际吸收需独立受击记录。', (text, check) => {
      const threshold = percentage(text, /生命值低于(\d+)%/), scale = percentage(text, /生命值上限(\d+)%/);
      const multiplier = percentage(text, /有(\d+)%的吸收效果/);
      for (const settings of [{ constellation: 3 }, { constellation: 4 }, { constellation: 4, ascension: 6, level: 90 }]) {
        const panel = sourcePanel('kaeya', 'hp', build('kaeya', settings));
        for (const [recipient, onField, ready, hp, incoming] of [
          [owner, true, true, threshold - .01, 'cryo'], [owner, true, true, threshold - .01, 'physical'],
          [owner, true, true, threshold - .01, null], [owner, true, true, threshold, 'cryo'],
          [owner, true, true, threshold + .01, 'cryo'], [owner, true, false, threshold - .01, 'cryo'],
          [owner, true, null, threshold - .01, 'cryo'], [owner, true, true, null, 'cryo'],
          [owner, false, true, threshold - .01, 'cryo'], [peer, true, true, threshold - .01, 'cryo'],
        ]) {
          const eligible = settings.constellation >= 4 && recipient === owner && onField && ready !== false && (hp === null || hp < threshold);
          const amount = !eligible ? 0 : ready === null || hp === null ? null : panel.value * scale;
          check(settings, { recipient, ownerOnField: recipient === owner && onField, query: { incomingShieldElement: element(incoming) }, facts: [
            [owner, 'kaeya.c4.frozen-kiss.hit-eligible', flag(ready)], [owner, 'hpRatio', quantity('scalar', hp)],
          ] }, { [raw]: amount, [effective]: amount === 0 ? 0 : amount === null || incoming === null ? null
            : amount * (incoming === 'cryo' ? multiplier : 1) }, panel.sources);
        }
      }
    });

  clause('noelle', 'passives', 1, '确认后台诺艾尔和低于阈值的其他场上队员，计算初始盾量及全伤害吸收量。',
    '60秒限次、盾实例存续、换人及实际吸收需独立受击记录。', (text, check) => {
      const threshold = percentage(text, /生命值低于(\d+)%/), scale = percentage(text, /防御力(\d+)%/);
      const multiplier = percentage(text, /有(\d+)%的吸收效果/);
      for (const settings of [{ ascension: 0 }, { ascension: 1 }, { ascension: 6, level: 90 }]) {
        const panel = sourcePanel('noelle', 'defense', build('noelle', settings));
        for (const [recipient, ownerOnField, peerOnField, ready, hp, incoming] of [
          [peer, false, true, true, threshold - .01, 'physical'], [peer, false, true, true, threshold - .01, 'geo'],
          [peer, false, true, true, threshold - .01, null], [peer, false, true, true, threshold, 'physical'],
          [peer, false, true, true, threshold + .01, 'physical'], [peer, false, true, false, threshold - .01, 'physical'],
          [peer, false, true, null, threshold - .01, 'physical'], [peer, false, true, true, null, 'physical'],
          [peer, true, false, true, threshold - .01, 'physical'], [peer, false, false, true, threshold - .01, 'physical'],
          [peer, null, true, true, threshold - .01, 'physical'], [owner, true, false, true, threshold - .01, 'physical'],
        ]) {
          const eligible = settings.ascension >= 1 && recipient === peer && ownerOnField !== true && peerOnField
            && ready !== false && (hp === null || hp < threshold);
          const amount = !eligible ? 0 : ready === null || hp === null || ownerOnField === null ? null : panel.value * scale;
          check(settings, { recipient, ownerOnField, peerOnField, query: { incomingShieldElement: element(incoming) }, facts: [
            [owner, 'noelle.a1.devotion.eligible', flag(ready)], [recipient, 'hpRatio', quantity('scalar', hp)],
          ] }, { [raw]: amount, [effective]: amount === null ? null : amount * multiplier },
          [...panel.sources, mechanics + 'docs/characters/geo/noelle.md:158-165']);
        }
      }
    });

  clause('dahlia', 'constellations', 2, '对实际获得祝颂重唤护盾授予且增益仍有效者计算护盾强效。',
    '祝颂累计和消耗、破盾重生、换人时受益人及12秒到期仍需记录。', (text, check) => {
      const boost = percentage(text, /护盾强效提升(\d+)%/);
      const key = 'dahlia.c2.sacred-favor-strength.active';
      for (const constellation of [1, 2]) for (const recipient of [owner, peer]) for (const active of [true, false, null]) {
        check({ constellation }, { recipient, facts: [
          [recipient, key, flag(active)], [recipient === owner ? peer : owner, key, bool(active !== true)],
        ] }, { [strength]: constellation < 2 || active === false ? 0 : active === null ? null : boost });
      }
    });

  clause('thoma', 'passives', 1, '按当前场上受益人有效的甲衣交叠层数计算护盾强效。',
    '0.3秒限次、6秒失效及取得、刷新和换人时的层数演进仍需护盾记录。', (text, check) => {
      const boost = percentage(text, /护盾强效提升(\d+)%/), limit = readNumber(text, /至多叠加(\d+)次/);
      const key = 'thoma.a1.imbricated-armor.stacks';
      for (const ascension of [0, 1]) for (const recipient of [owner, peer]) for (const [onField, stacks] of [
        [true, 0], [true, 1], [true, 3], [true, limit], [true, limit + 1], [true, null], [false, limit], [null, limit],
      ]) {
        check({ ascension }, { recipient, ownerOnField: recipient === owner ? onField : false,
          peerOnField: recipient === peer ? onField : false, facts: [
            [recipient, key, quantity('count', stacks)], [recipient === owner ? peer : owner, key, number('count', stacks === 0 ? limit : 0)],
          ] }, { [strength]: !ascension || onField === false ? 0 : onField === null || stacks === null ? null : Math.min(stacks, limit) * boost },
        [mechanics + 'docs/characters/pyro/thoma.md:159-163']);
      }
    });

  clause('lanyan', 'constellations', 2, '按存续凤缕护盾的原始吸收量与剩余比例计算合格普攻的本次修复量，保留原盾上限。',
    '2秒限次、盾实例连续性及当前剩余量仍需独立记录。', (text, check) => {
      const restored = percentage(text, /恢复(\d+)%凤缕护盾的伤害吸收量/);
      for (const settings of [{ constellation: 1 }, { constellation: 2 }, { constellation: 3, ascension: 6, level: 90, skill: 10 }]) {
        const original = originalLanYanShield(build('lanyan', settings));
        for (const recipient of [owner, peer]) for (const [category, onField, shield, hit, remaining, initial] of [
          ['normal', true, true, true, .25, original.value], ['normal', true, true, true, .9, original.value],
          ['normal', true, true, true, 1, original.value], ['normal', true, true, true, 0, original.value],
          ['normal', true, false, true, .25, original.value], ['normal', true, true, false, .25, original.value],
          ['normal', true, true, null, .25, original.value], ['normal', true, null, true, .25, original.value],
          ['normal', false, true, true, .25, original.value], ['charged', true, true, true, .25, original.value],
          ['normal', true, true, true, null, original.value], ['normal', true, true, true, .25, null],
          ['normal', true, true, true, .25, -original.value],
        ]) {
          const legal = settings.constellation >= 2 && category === 'normal' && onField && shield !== false && hit !== false && remaining !== 0;
          const amount = !legal ? 0 : shield === null || hit === null || remaining === null || initial === null || initial < 0 ? null
            : initial * Math.min(restored, 1 - remaining);
          check(settings, { recipient, category, ownerOnField: recipient === owner && onField, peerOnField: recipient === peer && onField,
            query: { 'lanyan.c2.swallow-wisp-repair.eligible-hit': flag(hit) }, facts: [
              [owner, 'lanyan.swallowWispShieldActive', flag(shield)],
              [owner, 'lanyan.c2.swallow-wisp-repair.initial', quantity('hp', initial)],
              [owner, 'lanyan.c2.swallow-wisp-repair.remaining', quantity('scalar', remaining)],
            ] }, { [added]: amount }, [...original.sources, mechanics + 'docs/evidence/combat-mechanics/damage/shields.md:61-75'],
          initial < 0 ? 'invalid' : 'unknown');
        }
      }
    });

  return { rows, verified, resolved, gaps, summary: { remainingShieldGrantCases: rows.length,
    remainingShieldGrantMismatches: rows.filter(row => row.issue).length, verifiedRemainingShieldGrants: verified.size } };
}
