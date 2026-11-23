import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, elements, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const root = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const growthRoot = 'tools/data/sources/catalog/genshin-db/';
const ratesPath = root + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const growth = read(growthRoot + 'characters.json');
const curves = read(growthRoot + 'character-curves.json');
const weapons = read(growthRoot + 'weapons.json');
const rates = read(ratesPath);
const growthId = id => id.replace(/-hydro$/, '');
const hpSource = id => [growthRoot + 'characters.json#' + growthId(id), growthRoot + 'character-curves.json'];
const sourceId = id => id.replace(/^(aether|lumine)-hydro$/, 'travelerhydro');
const clauseSource = (entity, field) => {
  const [, group, index] = field.split('/');
  const path = root + 'ChineseSimplified/' + (group === 'passives' ? 'talents' : 'constellations') + '/' + sourceId(entity) + '.json';
  const anchor = (group === 'passives' ? 'passive' : 'c') + (+index + 1);
  return { source: path + '#' + anchor, text: read(path)[anchor].description };
};
const enumValue = value => fact({ kind: 'enum', value });
const flag = value => value === null ? fact(null) : bool(value);
const actor = id => ({ kind: 'actor', id });
const enemy = id => ({ kind: 'target', id });
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const at = { kind: 'current', phase: 'same' };
const absorption = 'attribute.shieldAbsorption';
const effective = 'attribute.effectiveShieldAbsorption';
const added = 'attribute.shieldAbsorptionAdded';
const strength = 'attribute.shieldStrength';
const pyro = 'attribute.pyroBonus';
const attack = 'target.attackReduction';
const normalSpeed = 'attribute.normalAttackSpeed';
const chargedSpeed = 'attribute.chargedAttackSpeed';
const owner = 'actor';
const peer = 'peer';
const minLevel = [1, 20, 40, 50, 60, 70, 80];
const resistances = Object.fromEntries(elements.map(element => [element, element === 'electro' ? .25 : .1]));

const close = (actual, expected) => actual !== null && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
function readNumber(text, pattern) {
  const value = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(value)) throw new Error('固定原文缺少参数 ' + pattern.source);
  return value;
}
const percent = (text, pattern) => readNumber(text, pattern) / 100;
function panelHp(id, { level, ascension }) {
  const stats = growth[growthId(id)].stats, promotion = stats.promotion[ascension];
  const white = stats.base.hp * curves[level][stats.curve.hp] + promotion.hp;
  return white * (1 + (stats.specialized === 'FIGHT_PROP_HP_PERCENT' ? promotion.specialized : 0));
}

function kiraraSkillCompounds() {
  const path = root + 'ChineseSimplified/talents/kirara.json';
  const labels = read(path).combat2.attributes.labels;
  return ['护盾吸收量|', '护盾吸收量上限|'].map(prefix => {
    const label = labels.find(value => value.startsWith(prefix));
    const [, ratio, flat] = label?.match(/\{(param\d+):[^}]*P\}(?:最大生命值|生命值上限)\+\{(param\d+):I\}/) ?? [];
    if (!ratio || !flat) throw new Error('安全运输护盾固定来源缺少吸收量公式 ' + prefix);
    return {
      source: [path + '#combat2', ratesPath + '#kirara/combat2/' + ratio, ratesPath + '#kirara/combat2/' + flat],
      amount: (hp, level) => hp * rates.kirara.combat2[ratio][level - 1] + rates.kirara.combat2[flat][level - 1],
    };
  });
}

export const confirmedMixedBuffIds = ['aether-hydro', 'beidou', 'dori', 'kaeya', 'kirara', 'lumine-hydro', 'qiqi', 'wriothesley', 'xinyan', 'yanfei', 'yoimiya', 'zhongli'];

/** Compare confirmed, current outputs with the captured descriptions and curves. */
export function auditConfirmedMixedBuffs(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weaponCatalog = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const starter = character => weaponCatalog.get(novice[character.identity.weaponType]);
  const peerCharacter = characters.get('kaeya');
  const teams = new Map();

  function build(id, { constellation = 0, ascension = 0, level = minLevel[ascension], skill = 1 } = {}) {
    const character = characters.get(id);
    return { ...auditBuild(character, starter(character)), constellation, ascension, level, talents: { normal: 1, skill, burst: 1 } };
  }
  function team(id, settings) {
    const key = JSON.stringify([id, settings]);
    if (!teams.has(key)) {
      const ownerBuild = build(id, settings), peerBuild = build('kaeya');
      const prepared = engine.prepareStructuredBuilds([{ id: owner, build: ownerBuild }, { id: peer, build: peerBuild }]);
      if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
      teams.set(key, prepared.team);
    }
    return teams.get(key);
  }
  function settingsFor(entity, settings = {}, { recipient = owner, category, element, hitId, target = 'enemy', values = [], query = {} } = {}) {
    const character = characters.get(entity), dealer = recipient === owner ? character : peerCharacter;
    const talent = hitId ? dealer.talents.find(entry => entry.hits.some(hit => hit.id === hitId)) : dealer.talents[0];
    const hit = hitId ? talent.hits.find(entry => entry.id === hitId) : talent.hits[0];
    const { setup, request } = auditHit(dealer, talent, hit, settings.level ?? minLevel[settings.ascension ?? 0]);
    setAuditDefaults(character, request.frame);
    setup.targets.push({ ...setup.targets[0], id: 'other' });
    setup.events.find(event => event.id === 'hit').actorId = recipient;
    setup.events.find(event => event.id === 'hit').targetIds = [target];
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, targetId: target,
      hit: { skillId: talent.id, hitId: hit.id, category: category ?? hit.category, family: 'ordinary', origin: hit.origin,
        element: element ?? hit.element, reactionId: null }, facts: { ...request.frame.facts, ...query } };
    for (const [subject, key, value] of values) {
      let override = frame.factOverrides.find(entry => entry.subject.kind === subject.kind && entry.subject.id === subject.id);
      if (!override) frame.factOverrides.push(override = { subject, facts: {} });
      override.facts[key] = value;
    }
    const prepared = team(entity, settings);
    return { setup, request, frame, team: prepared, context: engine.createStructuredCombatContext(prepared, setup) };
  }
  function measure(entity, settings, input, ids) {
    const sample = settingsFor(entity, settings, input);
    const bindings = Object.fromEntries(ids.map(id => [id, { ...id.startsWith('target.') ? { kind: 'enemy' }
      : { kind: 'attribute', actor: { role: 'recipient' } }, key: ref(id), at }]));
    return engine.evaluateCombatBindings(sample.team.program, sample.context, bindings, sample.frame);
  }
  function clause(entity, field, proof, covered, remaining, run) {
    if (!characters.has(entity) || !starter(characters.get(entity)) || !peerCharacter || !starter(peerCharacter)) return;
    const start = rows.length, info = clauseSource(entity, field);
    const addRow = (output, probe, expected, value, status, diagnostics, sources) => {
      const matches = expected === null ? status === 'unknown' : close(value, expected);
      rows.push({ entity, field, output, probe, sources: [info.source, ...sources], expected, value, status,
        ...matches ? {} : { issue: '当次效果与独立来源算式不符', diagnostics } });
    };
    const check = (settings, input, expected, sources = []) => {
      const result = measure(entity, settings, input, Object.keys(expected));
      for (const [key, wanted] of Object.entries(expected)) {
        const output = result.outputs[key], status = output?.state ?? 'missing';
        const value = status === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
        addRow(key, { settings, input }, wanted, value, status, result.diagnostics, sources);
      }
    };
    run({ ...info, check, addRow });
    if (rows.length === start || rows.slice(start).some(row => row.issue)) return;
    for (const key of proof) verified.add(entity + (key.startsWith('/buffs/') ? field : '') + key);
    resolved.push({ entity, field, resolved: covered, remaining });
    if (remaining) gaps.push({ entity, field, reason: remaining });
    else verified.add(entity + field);
  }

  for (const [entity, rank, key, element, share, remaining] of [
    ['beidou', 1, 'beidou.stormbreakerShieldActive', 'electro', 'team', '斫雷护盾实例、实际消耗、破裂与15秒失效仍需独立受击记录。'],
    ['yanfei', 4, 'yanfei.burstShieldActive', 'pyro', 'team', '四命护盾实例、实际消耗、破裂与15秒失效仍需独立受击记录。'],
    ['kirara', 2, 'kirara.criticalTransportShieldActive', 'dendro', 'other', '联机碰撞的授予、队友10秒限次、独立护盾实例及12秒失效仍待验证。'],
    ...['aether-hydro', 'lumine-hydro'].map(id => [id, 4, id + '.torrentSurgeShieldActive', 'hydro', 'self', '长按结束后的消失、露滴受击每2秒补满或重生，以及实际剩余量仍需验证。']),
  ]) {
    clause(entity, '/constellations/' + (rank - 1), ['/buffs/0'], '确认当前护盾条件并验算原始盾量和对应来伤元素的吸收量。', remaining, ({ text, check }) => {
      const ratio = percent(text, share === 'other' ? /吸收量上限的(\d+)%/ : /生命值上限(\d+)%/);
      const multiplier = percent(text, /有(\d+)%的吸收效果/);
      const cap = share === 'other' ? kiraraSkillCompounds()[1] : null;
      const sources = [...hpSource(entity), ...cap?.source ?? []];
      for (const settings of [{ constellation: rank - 1 }, { constellation: rank }, { constellation: rank, ascension: 6, level: 90, skill: 10 }]) {
        const hp = panelHp(entity, { level: settings.level ?? 1, ascension: settings.ascension ?? 0 });
        const raw = (cap ? cap.amount(hp, settings.skill ?? 1) : hp) * ratio;
        for (const [recipient, onField, active, incoming] of [
          [owner, true, true, element], [peer, true, true, element], [owner, true, true, 'physical'], [peer, true, true, 'physical'],
          [owner, false, true, element], [peer, false, true, element], [owner, true, false, element], [peer, true, false, element],
          [owner, true, null, element], [peer, true, null, element], [owner, true, true, null], [peer, true, true, null],
        ]) {
          const eligible = settings.constellation >= rank && onField && (share === 'team' || recipient === (share === 'self' ? owner : peer));
          const expected = !eligible || active === false ? 0 : active === null ? null : raw;
          check(settings, { recipient, query: { incomingShieldElement: incoming === null ? fact(null) : enumValue(incoming) }, values: [
            [actor(recipient), 'onField', bool(onField)], [actor(share === 'other' ? recipient : owner), key, flag(active)],
          ] }, { [absorption]: expected, [effective]: expected === 0 ? 0 : expected === null || incoming === null ? null
            : expected * (incoming === element ? multiplier : 1) }, sources);
        }
      }
    });
  }

  clause('kirara', '/passives/0', ['/buffs/0'], '确认箱态结束时实际层数，验算新增盾量。', '原盾实例与剩余量、上限及刷新仍需独立受击记录。', ({ text, check }) => {
    const ratio = percent(text, /安全运输护盾的(\d+)%/), limit = readNumber(text, /至多叠加(\d+)层/);
    const base = kiraraSkillCompounds()[0];
    for (const ascension of [0, 1, 6]) {
      const settings = { ascension, skill: ascension === 6 ? 10 : 1 };
      const raw = base.amount(panelHp('kirara', { level: minLevel[ascension], ascension }), settings.skill);
      for (const [recipient, active, stacks] of [[owner, true, 0], [owner, true, 1], [owner, true, limit], [owner, true, limit + 1],
        [owner, false, limit], [owner, null, limit], [owner, true, null], [peer, true, limit]]) {
        const valid = ascension > 0 && recipient === owner && active !== false;
        const expected = !valid ? 0 : active === null || stacks === null ? null : Math.min(stacks, limit) * raw * ratio;
        check(settings, { recipient, values: [[actor(owner), 'kirara.reinforcedPackagingExit', flag(active)],
          [actor(owner), 'kirara.reinforcedPackagingStacks', stacks === null ? fact(null) : number('count', stacks)]] },
        { [added]: expected, [absorption]: 0 }, [...hpSource('kirara'), ...base.source]);
      }
    }
  });

  clause('zhongli', '/passives/0', ['/buffs/0'], '按当前同一玉璋护盾实例的确证受击层数计算护盾强效。', '受击叠层、换人继承与换盾清零仍需同盾实例记录。', ({ text, check }) => {
    const ratio = percent(text, /护盾强效提升(\d+)%/), limit = readNumber(text, /至多叠加(\d+)次/);
    for (const ascension of [0, 1]) for (const recipient of [owner, peer]) for (const [active, onField, stacks] of [
      [true, true, 0], [true, true, 2], [true, true, limit], [true, true, limit + 1], [true, true, null], [false, true, limit], [true, false, limit],
    ]) {
      check({ ascension }, { recipient, values: [[actor(owner), 'zhongli.jadeShieldActive', bool(active)], [actor(recipient), 'onField', bool(onField)],
        [actor(owner), 'zhongli.jadeShieldFortificationStacks', stacks === null ? fact(null) : number('count', stacks)]] },
      { [strength]: !ascension || !active || !onField ? 0 : stacks === null ? null : Math.min(stacks, limit) * ratio });
    }
  });

  clause('yoimiya', '/passives/0', ['/buffs/0'], '按本次火伤发生前确证仍有效的层数计算火伤加成。', '普攻命中后的新增层数和三秒续期仍需独立时序证据。', ({ text, check }) => {
    const ratio = percent(text, /提供(\d+)%火元素伤害加成/), limit = readNumber(text, /至多叠加(\d+)次/);
    for (const ascension of [0, 1]) for (const [recipient, element, category, stacks] of [
      [owner, 'pyro', 'normal', 0], [owner, 'pyro', 'normal', 3], [owner, 'pyro', 'burst', limit], [owner, 'pyro', 'charged', limit + 1],
      [owner, 'pyro', 'normal', null], [owner, 'physical', 'normal', limit], [peer, 'pyro', 'normal', limit],
    ]) {
      check({ ascension }, { recipient, element, category, values: [[actor(owner), 'yoimiya.tricksAtHit', stacks === null ? fact(null) : number('count', stacks)]] },
        { [pyro]: !ascension || recipient !== owner || element !== 'pyro' ? 0 : stacks === null ? null : Math.min(stacks, limit) * ratio });
    }
  });

  clause('qiqi', '/constellations/3', ['/buffs/0'], '按指定目标是否带有度厄真符计算20%攻击力降低。', '仍需把同一目标的有效攻击力用于实际入向伤害。', ({ text, check }) => {
    const reduction = percent(text, /攻击力下降(\d+)%/);
    for (const constellation of [3, 4]) for (const recipient of [owner, peer]) for (const target of ['enemy', 'other']) for (const marked of [true, false, null]) {
      check({ constellation }, { recipient, target,
        values: [[enemy('enemy'), 'qiqi.fortunePreservingTalisman', flag(marked)], [enemy('other'), 'qiqi.fortunePreservingTalisman', bool(false)]] },
      { [attack]: constellation < 4 || target === 'other' || marked === false ? 0 : marked === null ? null : reduction });
    }
  });

  clause('xinyan', '/constellations/0', ['/buffs/0'], '当次普通攻击和重击分别应用12%攻速。', '暴击触发、五秒限次及重击开始时的攻速保持仍需时序证据。', ({ text, check }) => {
    const ratio = percent(text, /攻击速度提升(\d+)%/);
    for (const constellation of [0, 1]) for (const [recipient, category, active] of [
      [owner, 'normal', true], [owner, 'charged', true], [owner, 'plunge', true], [owner, 'burst', true], [peer, 'normal', true],
      [owner, 'normal', false], [owner, 'charged', false], [owner, 'normal', null], [owner, 'charged', null],
    ]) {
      const expected = !constellation || recipient === peer || active === false ? 0 : active === null ? null : ratio;
      check({ constellation }, { recipient, category, values: [[actor(owner), 'xinyan.fatalAccelerationWindow', flag(active)]] },
        { [normalSpeed]: category === 'normal' ? expected : 0, [chargedSpeed]: category === 'charged' ? expected : 0 });
    }
  });

  function healProbe(entity, settings, field, recipient, active, healId) {
    const character = characters.get(entity), ownerBuild = build(entity, settings), peerBuild = build('kaeya');
    const builds = [[owner, ownerBuild], [peer, peerBuild]];
    const actors = builds.map(([id, build]) => ({ id, character: build.character.id, weapon: build.weapon.id, build, inputs: {} }));
    const definitions = builds.flatMap(([, build]) => [build.character.id, build.weapon.id]).map(id => ({
      id, name: id, version: character.dataVersion, source: { kind: 'preset', reference: character.dataVersion, verified: false }, nodes: [], effects: [],
    }));
    const facts = [{ subject: { kind: 'event' }, values: { [field]: flag(active) } }];
    if (entity === 'dori') for (const { id } of actors) facts.push({ subject: actor(id), values: { 'dori.jinniLinked': bool(false) } });
    const record = { id: 'heal', kind: 'state-change', actor: owner, timeMs: 1, order: 1, definition: entity,
      talentHeal: { definition: { namespace: character.namespace, id: entity, revision: character.revision }, healId, recipientId: recipient,
        facts } };
    const project = { schemaVersion: character.schemaVersion, rulesVersion: 'timeline-v1', id: 'confirmed-healing-audit', revision: '1', definitions,
      candidate: { id: 'team', actors }, conditions: {}, enemy: { level: 1, defenseReduction: 0, defenseIgnore: 0, resistances },
      timeline: [record], objective: {} };
    return engine.evaluateTimeline(project).combatChanges?.find(change => change.kind === 'talent-healing');
  }
  clause('wriothesley', '/constellations/3', ['/buffs/0', '/buffs/1', '/talents/0/heals/0'], '已确认有效的互斥溢疗攻速分支，并验算普通凌跃拳30%和四命50%的自身治疗。', '治疗需实际溢出、触发时的站场状态及分别四秒和六秒的自动结算。', ({ text, check, addRow }) => {
    const self = percent(text, /攻击速度提升(\d+)%/), party = percent(text, /自己的角色攻击速度提升(\d+)%/);
    const c4Rate = percent(text, /回复量提升为(\d+)%/);
    const passive = clauseSource('wriothesley', '/passives/0');
    const original = percent(passive.text, /回复量相当于莱欧斯利生命值上限的(\d+)%/);
    for (const constellation of [3, 4, 6]) {
      for (const recipient of [owner, peer]) for (const mode of ['none', 'on-field', 'off-field', null]) {
        const expected = constellation < 4 ? 0 : mode === 'off-field' ? party : recipient === owner && mode === 'on-field' ? self : mode === null ? null : 0;
        check({ constellation }, { recipient, values: [[actor(owner), 'wriothesley.overhealAttackSpeedMode', mode === null ? fact(null) : enumValue(mode)]] },
          { [normalSpeed]: expected, [chargedSpeed]: 0 });
      }
      for (const ascension of [0, 1]) for (const [recipient, active] of [[owner, true], [peer, true], [owner, false], [owner, null]]) {
        const settings = { ascension, constellation }, rate = constellation < 4 ? original : c4Rate;
        const reading = healProbe('wriothesley', settings, 'wriothesley.graciousRebuke', recipient, active, 'wriothesley.normal.heal.rebuke');
        const expected = !ascension || recipient !== owner || active === false ? 0 : active === null ? null
          : panelHp('wriothesley', { level: minLevel[ascension], ascension }) * rate;
        addRow('healing', { settings, recipient, active }, expected, reading?.healing ?? null, reading?.status,
          reading?.missing, [passive.source, ...hpSource('wriothesley')]);
      }
    }
  });

  const doriInfusions = Array.from({ length: 9 }, (_, index) => '/talents/0/hits/' + index + '/infusion');
  clause('dori', '/constellations/5', [...doriInfusions, '/talents/0/heals/0'], '已确认的三秒雷附魔覆盖普攻、重击与下落，同时验算已确认在范围的单次普攻治疗。', '施放到附魔失效、其他附魔覆盖、实际命中和全队范围与0.1秒限次仍需独立时序验证。', ({ text, addRow }) => {
    const healRate = percent(text, /生命值上限(\d+)%/);
    const infusionSource = 'https://library.keqingmains.com/combat-mechanics/elemental-effects/weapon-infusion';
    const evidence = 'https://library.keqingmains.com/evidence/combat-mechanics/elemental-effects/weapon-infusion';
    if (!text.includes('雷元素附魔')) throw new Error('多莉固定原文缺少雷附魔');
    const physicalHits = [1, 2, 3, 4, 5, 6, 9, 10, 11].map(index => 'param' + index);
    for (const constellation of [5, 6]) {
      for (const parameter of physicalHits) for (const active of [true, false, null]) {
        const settings = { constellation };
        const hit = 'dori.normal.' + parameter;
        const { team, setup, request } = settingsFor('dori', settings, { hitId: hit,
          values: [[actor(owner), 'dori.c6ElectroInfusion', flag(active)]] });
        for (const [element, resist] of Object.entries(resistances)) setup.targets[0].inputs['resistance.' + element] = number('scalar', resist);
        const response = engine.evaluateStructuredHit(team, setup, request);
        const attack = growth.dori.stats.base.attack + weapons.wastergreatsword.stats.base.attack;
        const multiplier = rates.dori.combat1[parameter][0];
        const elemental = constellation >= 6 && active === true;
        const expected = constellation >= 6 && active === null ? null : attack * multiplier * .5 * (1 - resistances[elemental ? 'electro' : 'physical']);
        const total = response.totals.all;
        const result = total.state === 'known' && total.value.kind === 'quantity' ? total.value.value : null;
        addRow('infusion', { settings, hit, active }, expected, result, total.state, response.diagnostics,
          [infusionSource, evidence, ratesPath + '#dori/combat1/' + parameter, growthRoot + 'characters.json#dori', growthRoot + 'weapons.json#wastergreatsword']);
      }
      for (const recipient of [owner, peer]) for (const active of [true, false, null]) {
        const settings = { constellation };
        const reading = healProbe('dori', settings, 'dori.c6HealingReady', recipient, active, 'dori.normal.heal.sprinkling-weight');
        const expected = constellation < 6 || active === false ? 0 : active === null ? null
          : panelHp('dori', { level: 1, ascension: 0 }) * healRate;
        addRow('healing', { settings, recipient, active }, expected, reading?.healing ?? null, reading?.status, reading?.missing, hpSource('dori'));
      }
    }
  });

  return { rows, verified, resolved, gaps, summary: { confirmedMixedBuffCases: rows.length,
    confirmedMixedBuffMismatches: rows.filter(row => row.issue).length, verifiedConfirmedMixedBuffs: verified.size } };
}
