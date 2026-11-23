import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, fact, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const upstream = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const source = (id, anchor) => upstream + 'ChineseSimplified/' +
  (/^c[1-6]$/u.test(anchor) ? 'constellations/' : 'talents/') + id + '.json#' + anchor;
const description = (id, anchor) => read(source(id, anchor).split('#')[0])[anchor].description;
const quantity = (text, pattern) => {
  const amount = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(amount)) throw new Error('资源效果的固定来源缺少数值：' + pattern);
  return amount;
};
const teamMate = 'kaeya';
const known = result => result?.state === 'known' && result.value.kind === 'quantity' ? result.value.value : null;

export const characterResourceBuffIds = ['lohen', 'nefer', 'kinich'];

/** Independent expectations from current talent descriptions and explicit software inputs. */
export function auditCharacterResourceBuffs(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const peer = characters.get(teamMate);
  const makeBuild = (character, ascension, constellation, weaponId = novice[character.identity.weaponType]) => ({
    ...auditBuild(character, weapons.get(weaponId)), ascension, constellation, level: [1, 20, 40, 50, 60][ascension],
  });

  function scenario(entity, { ascension, rank = 0, weaponId, hitId } = {}) {
    const character = characters.get(entity);
    const build = makeBuild(character, ascension, rank, weaponId);
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: makeBuild(peer, 0, 0) }]);
    if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
    const { team } = prepared;
    const talent = hitId ? character.talents.find(entry => entry.hits.some(hit => hit.id === hitId)) : character.talents[0];
    const hit = hitId ? talent.hits.find(hit => hit.id === hitId) : talent.hits[0];
    const { setup, request } = auditHit(character, talent, hit, build.level);
    function frame(values) {
      const current = structuredClone(request.frame);
      setAuditDefaults(character, current);
      setGateFacts(character, current, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)));
      for (const [key, value] of Object.entries(values)) if (value === null) {
        if (character.metadata.facts[key].scope === 'query') current.facts[key] = fact(null);
        else current.factOverrides.find(entry => Object.hasOwn(entry.facts, key)).facts[key] = fact(null);
      }
      return current;
    }
    return {
      damage(values) {
        const evaluation = engine.evaluateStructuredHit(team, setup, { ...request, frame: frame(values) });
        return { status: evaluation.totals.all?.state, value: known(evaluation.totals.all) };
      },
      measure(outputs, { values = {}, recipient = 'actor', mastery } = {}) {
        const context = engine.createStructuredCombatContext(team, setup);
        if (mastery !== undefined) {
          // Exact boundary input for the panel evaluator. Active catalog bonuses still apply on top.
          context.actors[0].inputs.elementalMastery = number('elementalMastery', mastery);
        }
        const bindings = Object.fromEntries(outputs.map(output => [output, {
          kind: 'attribute', key: ref(output), actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' },
        }]));
        const result = engine.evaluateCombatBindings(team.program, context, bindings, { ...frame(values), ownerId: 'actor',
          recipientId: recipient, contributorId: null, hit: { skillId: talent.id, hitId: hit.id, category: hit.category,
            element: hit.element, family: 'ordinary', origin: hit.origin, reactionId: null } });
        return Object.fromEntries(outputs.map(output => [output, { status: result.outputs[output]?.state, value: known(result.outputs[output]) }]));
      },
    };
  }

  function row(evidence, settings, reading, expected, status = expected === null ? 'unknown' : 'known') {
    const valueMatches = expected === null ? reading.value === null : Number.isFinite(reading.value)
      && Math.abs(reading.value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
    const matches = reading.status === status && valueMatches;
    rows.push({ ...evidence, probe: settings, ...reading, expected, expectedStatus: status,
      ...(matches ? {} : { issue: '资源属性、伤害或生效条件与来源预期不符' }) });
  }

  function check(entity, clause, buffIndex, output, sources, run) {
    const [, section, index] = clause.split('/');
    const field = clause + '/buffs/' + buffIndex + '/modifiers/0';
    const effect = characters.get(entity).metadata[section][Number(index)].buffs?.[buffIndex];
    const evidence = { entity, field, clause, effectId: effect?.id ?? '', output, sources };
    if (effect?.modifiers[0].target !== (output === 'damage' ? 'attribute.baseMultiplier' : output)) {
      rows.push({ ...evidence, value: null, expected: null, issue: '来源条款缺少对应的资源贡献' });
      return;
    }
    const start = rows.length;
    run((settings, reading, expected) => row(evidence, settings, reading, expected));
    if (rows.length > start && rows.slice(start).every(probe => !probe.issue)) verified.add(entity + field);
  }

  if (characters.has('lohen') && peer) {
    const id = 'lohen', a1 = source(id, 'passive1'), c1 = source(id, 'c1');
    const kqm = 'https://keqingmains.com/q/lohen-quickguide/';
    const extra = quantity(description(id, 'passive1'), /额外积攒(\d+)点/u);
    const threshold = quantity(description(id, 'passive1'), /基础攻击力的(\d+)%/u) / 100;
    const capFactor = quantity(description(id, 'c1'), /上限提升至原来的(\d+)%/u) / 100;
    const gainFactor = quantity(description(id, 'c1'), /积攒的争胜提升至原来的(\d+)%/u) / 100;
    const baseCap = 100; // KQM's baseline, also used by the current damage input range.
    const growth = read(catalog + 'characters.json')[id].stats;
    const curve = read(catalog + 'character-curves.json');
    const weaponGrowth = read(catalog + 'weapons.json');
    const weaponCurve = read(catalog + 'weapon-curves.json');
    const attackFor = (weaponId, ascension, level) => {
      const weapon = weaponGrowth[weaponId].stats;
      return growth.base.attack * curve[level][growth.curve.attack] + growth.promotion[ascension].attack
        + (weapon.base.attack * weaponCurve[1][weapon.curve.attack] + weapon.promotion[0].attack);
    };
    const willGain = 'attribute.lohenWillBonusGain', willCap = 'attribute.lohenWillLimit', willFactor = 'attribute.lohenWillGainMultiplier';
    const whiteAttack = 'attribute.whiteAttack', attack = 'attribute.attack';
    const facts = (damage, active = true, other = true) => ({ 'lohen.masterstroke': active,
      'lohen.nearbyTeammateWillHit': other, 'lohen.teammateWillHitDamage': damage });
    const attackSources = [catalog + 'characters.json#/lohen/stats', catalog + 'character-curves.json',
      catalog + 'weapons.json#/beginnersprotector/stats', catalog + 'weapons.json#/whitetassel/stats', catalog + 'weapon-curves.json'];
    check(id, '/passives/0', 0, willGain, [a1, c1, ...attackSources], record => {
      for (const [rank, weaponId] of [[0, 'beginnersprotector'], [1, 'whitetassel']]) {
        const trial = scenario(id, { ascension: 4, rank, weaponId });
        const baseAttack = attackFor(weaponId, 4, 60);
        const minimum = baseAttack * threshold;
        const gain = extra * (rank ? gainFactor : 1);
        for (const [damage, active, other, recipient, expected] of [
          [minimum - 1, true, true, 'actor', 0], [minimum, true, true, 'actor', gain], [minimum + 1, true, true, 'actor', gain],
          [minimum, false, true, 'actor', 0], [minimum, true, false, 'actor', 0], [minimum, true, true, 'peer', 0],
          [null, true, true, 'actor', null],
        ]) {
          const settings = { values: facts(damage, active, other), recipient };
          record({ weaponId, rank, baseAttack, ...settings }, trial.measure([willGain], settings)[willGain], expected);
        }
        const values = { ...facts(minimum), 'lohen.cryoReactionAttackWindow': true };
        const reading = trial.measure([whiteAttack, attack, willGain], { values });
        record({ weaponId, rank, values, whiteAttack: reading[whiteAttack].value, attack: reading[attack].value },
          { ...reading[willGain], status: Math.abs(reading[whiteAttack].value - baseAttack) <= 1e-8 && reading[attack].value > baseAttack
            ? reading[willGain].status : 'invalid' }, gain);
      }
      const trial = scenario(id, { ascension: 0 });
      const values = facts(attackFor('beginnersprotector', 0, 1) * threshold);
      record({ ascension: 0, values }, trial.measure([willGain], { values })[willGain], 0);
    });
    const baseLimit = scenario(id, { ascension: 1, rank: 0 });
    check(id, '/talents/1', 1, willCap, [kqm], record => {
      for (const recipient of ['actor', 'peer']) {
        record({ rank: 0, recipient }, baseLimit.measure([willCap], { recipient })[willCap], recipient === 'actor' ? baseCap : 0);
      }
    });
    check(id, '/constellations/0', 0, willCap, [c1, kqm], record => {
      for (const [rank, recipient, expected] of [[0, 'actor', 0], [1, 'actor', baseCap * (capFactor - 1)], [1, 'peer', 0]]) {
        const base = baseLimit.measure([willCap], { recipient })[willCap];
        const total = scenario(id, { ascension: 1, rank }).measure([willCap], { recipient })[willCap];
        record({ rank, recipient, base: base.value, total: total.value }, { ...total, value: Number.isFinite(base.value) && Number.isFinite(total.value)
          ? total.value - base.value : null }, expected);
      }
    });
    check(id, '/constellations/0', 1, willFactor, [c1], record => {
      for (const [rank, active, other, recipient, expected] of [[0, true, true, 'actor', 1], [1, true, true, 'actor', gainFactor],
        [1, false, true, 'actor', 1], [1, true, false, 'actor', 1], [1, true, true, 'peer', 1]]) {
        const values = facts(0, active, other);
        record({ rank, recipient, values }, scenario(id, { ascension: 1, rank }).measure([willFactor], { values, recipient })[willFactor], expected);
      }
    });
    const statSource = upstream + 'stats/talents.json';
    const talents = read(statSource)[id];
    for (const [clause, buffIndex, hitId, rawKey, coefficient, rank, will, points] of [
      ['/talents/1', 0, 'lohen.skill.param17', 'combat2', 'param18', 1, 300, baseCap * capFactor],
      ['/talents/2', 0, 'lohen.burst.param1', 'combat3', 'param2', 0, 60, extra],
      ['/constellations/3', 0, 'lohen.burst.param1', 'combat3', 'param2', 4, 0, baseCap * capFactor],
    ]) {
      check(id, clause, buffIndex, 'damage', [c1, source(id, rawKey), statSource + '#' + id + '/' + rawKey + '/' + coefficient,
        ...(rank === 4 ? [source(id, 'c4')] : [])], record => {
        const trial = scenario(id, { ascension: 1, rank, hitId });
        const attack = attackFor('beginnersprotector', 1, 20);
        const value = rank === 4 ? { 'lohen.masterstroke': true } : { 'lohen.masterstroke': true, 'lohen.will': will };
        const ratio = talents[rawKey][hitId.split('.').at(-1)][0], perPoint = talents[rawKey][coefficient][0];
        record({ rank, hitId, value }, trial.damage(value), attack * ratio * (1 + points * perPoint) * 0.5 * 0.9);
      });
    }
    resolved.push({ entity: id, field: '/passives/0', sources: [a1, c1],
      resolved: '用洛恩当前基础攻击（角色和武器白值）判断已确认的附近队友单次伤害，额外积攒60点；一命按500%计算这项名义积攒量。',
      remaining: '争胜的实际到账还需合并该击基础积攒、当前点数、封顶与时间限制。' },
    { entity: id, field: '/constellations/0', sources: [c1, kqm],
      resolved: '一命将争胜上限从100提升至300，符合积攒条件的单次获取倍率变为5；镂骨彻心和元素爆发引用当前上限。',
      remaining: '自动识别队友范围、积攒事件和各次争胜消耗尚需资源轴。' });
  }

  if (characters.has('nefer') && peer) {
    const id = 'nefer', clause = '/passives/1', sourceRef = source(id, 'passive2');
    const configPath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/nefer-slither-dew.json';
    const { proudSkill, parameters, speedBonus, teamSpeed } = read(configPath);
    const sources = [sourceRef, ...['proudSkill', 'parameters', 'speedBonus', 'teamSpeed'].map(field => configPath + '#/' + field)];
    const text = description(id, 'passive2');
    const [, duration, threshold, slope, cap] = proudSkill.record.paramList;
    const window = duration * 1000;
    const increment = quantity(text, /每(\d+)点元素精通/u);
    const rate = quantity(text, /效果提升(\d+)%/u) / 100;
    const amount = mastery => Math.min(cap, Math.max(0, mastery * slope - threshold * slope));
    const rule = speedBonus.record;
    const ability = 'Avatar_' + proudSkill.record.openConfig;
    const parameterNames = ['Speed', 'BuffDuration', 'ElemMastery_Min', 'SpeedUp_Factor', 'SpeedUp_Max'];
    const configMatches = proudSkill.record.proudSkillId === 1222201 && parameters.pointer === '/' + proudSkill.record.openConfig
      && parameters.record[0].$type === 'AddAbility' && parameters.record[0].abilityName === ability
      && parameterNames.every((name, index) => {
        const parameter = parameters.record[index + 1];
        return parameter.$type === 'ModifyAbility' && parameter.abilityName === ability && parameter.paramSpecial === name
          && parameter.paramDelta === '%' + (index + 1) && parameter.paramRatio === 0;
      })
      && rule.$type === 'SetGlobalValue' && rule.useLimitRange && rule.minValue === 0 && rule.maxValue === 'SpeedUp_Max'
      && rule.value.join(' ') === 'SpeedUp_Factor FIGHT_PROP_ELEMENT_MASTERY MUL ElemMastery_Min SpeedUp_Factor MUL SUB'
      && teamSpeed.record.$type === 'ChangeMoonOvergrowMixin' && teamSpeed.record.speed === 'Speed' && teamSpeed.record.MEMACNMBBDG === 'Add'
      && teamSpeed.record.MPELLHFCMFA === rule.key && Math.abs(slope * increment - rate) < 1e-9
      && duration === quantity(text, /月绽放反应后的(\d+)秒内/u) && threshold === quantity(text, /元素精通超过(\d+)/u)
      && cap === quantity(text, /至多通过这种方式提升(\d+)%/u) / 100;
    if (!configMatches) throw new Error(id + ': 草露加速配置与固定来源不符');
    const output = 'attribute.neferSlitherDewBonus';
    const facts = (age, shadowDance = true, slither = true, veil = false) => ({ 'nefer.partyLunarBloomAge': age,
      'nefer.dewShadowDance': shadowDance, 'nefer.slither': slither, 'nefer.veilMastery': veil, fullMoonsign: veil });
    check(id, clause, 0, output, [...sources, source(id, 'passive1')], record => {
      const trial = scenario(id, { ascension: 4 });
      for (const [mastery, age, shadowDance, slither, veil, recipient, expected] of [
        [undefined, 0, true, true, false, 'actor', 0],
        [threshold - 1, 0, true, true, false, 'actor', 0],
        [threshold, 0, true, true, false, 'actor', 0],
        [threshold + 1, 0, true, true, false, 'actor', amount(threshold + 1)],
        [threshold + increment / 2, 0, true, true, false, 'actor', amount(threshold + increment / 2)],
        [threshold + increment - 1, 0, true, true, false, 'peer', amount(threshold + increment - 1)],
        [threshold + increment, window - 1, true, true, false, 'actor', rate],
        [threshold + increment, window, true, true, false, 'actor', 0],
        [threshold + increment, 0, false, true, false, 'actor', 0],
        [threshold + increment, 0, true, false, false, 'actor', 0],
        [threshold + increment, null, true, true, false, 'actor', null],
        [threshold, 0, true, true, true, 'peer', rate],
        [threshold + cap / slope - 1, 0, true, true, false, 'peer', amount(threshold + cap / slope - 1)],
        [threshold + cap / slope, 0, true, true, false, 'actor', cap],
        [threshold + cap / slope + 1, 0, true, true, false, 'peer', cap],
      ]) {
        const settings = { values: facts(age, shadowDance, slither, veil), recipient, mastery };
        record(settings, trial.measure([output], settings)[output], expected);
      }
      const settings = { values: facts(0), mastery: threshold + increment };
      record({ ascension: 3, ...settings }, scenario(id, { ascension: 3 }).measure([output], settings)[output], 0);
    });
    const reason = '固定配置给出加速比例，草露的实际基础积攒量、状态切换和加速刷新的同帧顺序及与四命的实际叠加仍需核对。';
    resolved.push({ entity: id, field: clause, resolved: '队员月绽放后5秒内，奈芙尔在影舞和蛇行条件下，每点超过500的元素精通连续提供0.1%队伍草露加速，上限50%。',
      remaining: reason, sources });
    gaps.push({ entity: id, field: clause, status: 'needs-evidence', reason, sources,
      softwareSources: ['https://github.com/genshinsim/gcsim/pull/3045/commits/d833248d5651e17c086ec2100126dc3718f8e7c7'] });
  }

  if (characters.has('kinich') && peer) {
    const id = 'kinich', clause = '/passives/0', sourceRef = source(id, 'passive1');
    const text = description(id, 'passive1');
    const interval = quantity(text, /每(\d+(?:\.\d+)?)秒/u) * 1000;
    const points = quantity(text, /为基尼奇产生(\d+)点夜魂值/u);
    const output = 'attribute.kinichDesolationNightsoul';
    const facts = (reaction, elapsed, first, bearing, target) => ({ 'kinich.nightsoulBlessing': bearing, 'kinich.desolationTarget': target,
      'kinich.desolationReactionDamage': reaction, 'kinich.firstDesolationGrant': first, 'kinich.lastDesolationGrantAge': elapsed });
    check(id, clause, 0, output, [sourceRef], record => {
      const trial = scenario(id, { ascension: 1 });
      for (const [reaction, elapsed, first, bearing, target, recipient, expected] of [
        ['burning', null, true, true, true, 'actor', points], ['burgeon', interval, false, true, true, 'actor', points],
        ['burning', interval - 1, false, true, true, 'actor', 0], ['burning', interval + 1, false, true, true, 'actor', points],
        ['other', interval, false, true, true, 'actor', 0], ['none', interval, false, true, true, 'actor', 0],
        ['burgeon', interval, false, true, false, 'actor', 0], ['burgeon', interval, false, false, true, 'actor', 0],
        ['burgeon', interval, false, true, true, 'peer', 0], ['burning', null, false, true, true, 'actor', null],
      ]) {
        const settings = { recipient, values: facts(reaction, elapsed, first, bearing, target) };
        record(settings, trial.measure([output], settings)[output], expected);
      }
      const settings = { values: facts('burning', interval, false, true, true) };
      record({ ascension: 0, ...settings }, scenario(id, { ascension: 0 }).measure([output], settings)[output], 0);
    });
    resolved.push({ entity: id, field: clause, sources: [sourceRef],
      resolved: '噩地目标受燃烧或烈绽放伤害，且基尼奇处于夜魂加持并满足800毫秒限次时，为基尼奇名义产生7点夜魂值。',
      remaining: '需自动关联噩地目标与多目标反应、同一次夜魂加持和实际夜魂值余额，才能确定新增的炮击次数。' });
  }

  return { rows, verified,
    resolved: resolved.filter(({ entity, field }) => [...verified].some(pointer => pointer.startsWith(entity + field + '/'))),
    gaps, summary: { characterResourceBuffCases: rows.length,
    characterResourceBuffMismatches: rows.filter(probe => probe.issue).length, verifiedCharacterResourceBuffModifiers: verified.size } };
}
