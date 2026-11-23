import { readContentSource } from './content-source.mjs';
import { auditBuild, bool, fact, novice, number } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const description = (entity, group, key) => capture + group + '/' + entity + '.json#/' + key + '/description';
const talent = (entity, key) => description(entity, 'talents', key);
const constellation = (entity, rank) => description(entity, 'constellations', 'c' + rank);
const skillMs = 'attribute.elementalSkillCooldownReductionMs';
const burstMs = 'attribute.elementalBurstCooldownReductionMs';
const skillRatio = 'attribute.elementalSkillCooldownReduction';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const peer = 'kaeya';
const sourceData = new Map();
const text = source => {
  const [path, pointer] = source.split('#/');
  if (!sourceData.has(path)) sourceData.set(path, readContentSource(new URL('../../' + path, import.meta.url)));
  return pointer.split('/').reduce((value, key) => value[key], sourceData.get(path));
};
const amountFrom = (source, pattern, multiplier = 1) => {
  const match = text(source).match(pattern);
  if (!match) throw new Error(source + ' 缺少预期冷却数值 ' + pattern);
  return Number(match[1]) * multiplier;
};
const millisecondsFrom = source => amountFrom(source, /冷却时间(?:减少|缩短)([\d.]+)秒/, 1000);
const ratioFrom = source => amountFrom(source, /冷却时间(?:减少|降低)([\d.]+)%/, 0.01);
const numeric = reading => reading?.state === 'known' && reading.value?.kind === 'quantity' ? reading.value.value : null;

export const directCooldownCharacterIds = [
  'aether-electro', 'aether-geo', 'alhaitham', 'aratakiitto', 'arlecchino', 'barbara', 'bennett', 'candace',
  'charlotte', 'chiori', 'chongyun', 'dori', 'eula', 'flins', 'freminet', 'furina', 'gorou', 'kaedeharakazuha',
  'kinich', 'kujousara', 'lauma', 'lumine-electro', 'lumine-geo', 'mavuika', 'navia', 'raidenshogun',
  'razor', 'thoma', 'xilonen', 'yoimiya', 'yunjin',
];
export const directCooldownPeerIds = [peer, 'lisa', 'albedo', 'noelle', 'ningguang'];

/** Read direct contributions on the current query. Expectations come from the captured descriptions. */
export function auditDirectCooldownAmounts(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const prepared = new Map();

  function teamFor(entity, party, rank, ascension) {
    const key = JSON.stringify([entity, party, rank, ascension]);
    if (prepared.has(key)) return prepared.get(key);
    const builds = [entity, ...party].map(id => {
      const character = characters.get(id);
      const weapon = weapons.get(novice[character.identity.weaponType]);
      if (!weapon) throw new Error(id + ' 缺少冷却验算武器');
      const build = auditBuild(character, weapon);
      if (id === entity) Object.assign(build, { constellation: rank, ascension,
        level: ascension ? character.progression.promotion[ascension - 1].maxLevel : 1 });
      return { id, build };
    });
    const result = engine.prepareStructuredBuilds(builds);
    if (!result.ok) throw new Error(entity + ' 冷却验算配装无效 ' + JSON.stringify(result.diagnostics));
    prepared.set(key, result.team);
    return result.team;
  }

  function verify({ entity, clause, buff, output, sources, rank = 0, ascension = 0, cases, remaining }) {
    const character = characters.get(entity);
    if (!character || !characters.has(peer)) return;
    const [, section, index] = clause.split('/');
    const buffs = character.metadata[section][Number(index)].buffs ?? [];
    const buffIndex = buffs.findIndex(entry => entry.id === buff);
    const modifierIndex = buffs[buffIndex]?.modifiers.findIndex(modifier => modifier.target === output) ?? -1;
    const field = modifierIndex < 0 ? clause : clause + '/buffs/' + buffIndex + '/modifiers/' + modifierIndex;
    const effect = modifierIndex > 0 ? buff + '.' + modifierIndex : buff;
    const definition = character.calculation.bundle.effects.find(entry => entry.identity.id === effect);
    const evidence = { entity, clause, field, effect, output, sources };
    if (modifierIndex < 0 || definition?.target.attribute?.id !== output) {
      rows.push({ ...evidence, value: null, expected: cases[0].expected, issue: '缺少精确冷却贡献' });
      return;
    }
    const excludedOutput = output === burstMs ? skillMs : burstMs;
    const start = rows.length;
    for (const settings of cases) {
      const { expected, recipient = entity, party = [peer], facts = {}, caseRank = rank, caseAscension = ascension,
        active = true, applicationAvailable = true } = settings;
      if (party.some(id => !characters.has(id))) continue;
      const team = teamFor(entity, party, caseRank, caseAscension);
      const beneficiary = characters.get(recipient);
      const associatedTalent = beneficiary.talents.find(entry => entry.category === (output === burstMs ? 'burst' : 'skill'));
      const event = { id: 'current', kind: 'action', actorId: recipient, skillId: associatedTalent.id, category: associatedTalent.category,
        timeMs: 0, order: 0, targetIds: [], sourceEventIds: [], facts: {} };
      const context = engine.createStructuredCombatContext(team, {
        targets: [{ id: 'enemy', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [], events: [event],
      });
      const actorFacts = new Map(), queryFacts = {};
      for (const [key, value] of Object.entries(facts)) {
        const declared = character.metadata.facts[key];
        if (!declared) throw new Error(entity + ' 缺少当次冷却事实 ' + key);
        const observation = value === null ? fact(null) : typeof value === 'boolean' ? bool(value) : number(declared.type.unit, value);
        if (declared.scope === 'query') { queryFacts[key] = observation; continue; }
        const id = declared.scope === 'recipient' ? recipient : entity;
        if (!actorFacts.has(id)) actorFacts.set(id, {});
        actorFacts.get(id)[key] = observation;
      }
      const frame = {
        eventId: 'current', ownerId: recipient, recipientId: recipient, contributorId: null, targetId: 'enemy', phase: 'before', sourceEventId: null,
        facts: queryFacts, actorFacts: {}, captures: {}, hit: null,
        applications: definition.application === 'always' || !applicationAvailable ? [] :
          [{ instanceId: engine.calculationEffectInstanceId(entity, definition.buff ?? definition.identity, null), active }],
        factOverrides: [...actorFacts].map(([id, facts]) => ({ subject: { kind: 'actor', id }, facts })),
      };
      const binding = id => ({ kind: 'attribute', actor: { role: 'recipient' }, key: ref(id), at: { kind: 'current', phase: 'same' } });
      const measureOther = [entity, ...party].some(id => characters.get(id).calculation.bundle.attributes
        .some(attribute => attribute.identity.id === excludedOutput));
      const result = engine.evaluateCombatBindings(team.program, context,
        { measured: binding(output), ...(measureOther && { other: binding(excludedOutput) }) }, frame);
      const trace = result.trace.find(node => node.kind === 'effect' && node.definition.id === effect &&
        node.context?.actorId === entity && node.context?.recipientId === recipient);
      const status = result.outputs.measured?.state ?? 'missing';
      const value = trace ? numeric(trace) : 0;
      const actualOutput = numeric(result.outputs.measured);
      const otherOutput = measureOther ? numeric(result.outputs.other) : 0;
      const expectedOther = entity === 'thoma' ? expected : 0;
      const matches = reading => expected === null ? reading === null : reading !== null && Math.abs(reading - expected) < 1e-8;
      const passed = matches(value) && matches(actualOutput) && otherOutput === expectedOther
        && status === (expected === null ? 'unknown' : 'known');
      rows.push({ ...evidence, expected, value, actualOutput, otherOutput, expectedOther, status, probe: { ...settings, recipient, party, caseRank, caseAscension },
        ...(passed ? {} : { issue: '冷却减少量、受益者或当次门槛与固定来源不符', diagnostics: result.diagnostics }) });
    }
    const samples = rows.slice(start);
    if (!samples.some(row => row.expected > 0) || samples.some(row => row.issue)) return;
    verified.add(entity + field);
    if (!remaining) verified.add(entity + clause);
    const amounts = [...new Set(samples.filter(row => row.expected > 0).map(row => row.expected))];
    const unit = output === skillRatio ? '%' : '秒';
    const values = amounts.map(value => (output === skillRatio ? Math.round(value * 100) : value / 1000) + unit);
    const type = output === burstMs ? '元素爆发' : '元素战技';
    resolved.push({ entity, field, sources, resolved: type + '冷却减少' + values.join('、'), ...(remaining ? { remaining } : {}) });
  }

  function positiveAndExclusions(entity, base, expected, settings = {}) {
    const recipient = settings.recipient ?? entity;
    return [{ ...settings, label: '条件满足', facts: base, expected },
      ...Object.entries(base).filter(([, value]) => value === true).map(([key]) => ({
        ...settings, label: key + ' 不满足', facts: { ...base, [key]: false }, expected: 0,
      })),
      ...(Object.keys(base).length ? [{ ...settings, label: '当次条件未知', facts: { ...base, [Object.keys(base)[0]]: null }, expected: null },
        { ...settings, label: '未启用本次增益', facts: base, active: false, expected: 0 }] : []),
      { ...settings, label: '排除不受益角色', recipient: recipient === entity ? peer : entity, facts: base, expected: 0, applicationAvailable: false }];
  }
  const withUnlock = (cases, rank, ascension) => [
    ...cases,
    ...(rank > 0 ? [{ ...cases[0], label: '命座未解锁', caseRank: rank - 1, expected: 0, applicationAvailable: false }] : []),
    ...(ascension > 0 ? [{ ...cases[0], label: '突破天赋未解锁', caseAscension: ascension - 1, expected: 0, applicationAvailable: false }] : []),
  ];
  const baseFacts = (entity, tier, keys) => Object.fromEntries(keys.map(key => [entity + '.' + tier + '.' + key, true]));
  function checkTimingLabel(entity, key, source, pattern, labelFor) {
    const seconds = amountFrom(source, pattern);
    const declaration = characters.get(entity)?.metadata.facts?.[key];
    if (declaration && !declaration.label.includes(labelFor(seconds))) throw new Error(source + ' 的触发间隔标签不一致');
  }
  const triggerInterval = /每([\d.]+)秒至多触发一次/;
  const minimumInterval = seconds => '至少' + seconds + '秒';

  for (const [entity, tier, suff, remaining] of [
    ['barbara', 'c2', 'melody-loop-cooldown', '同一命座的水伤增益由独立效果验算。'],
    ['bennett', 'a1', 'passion-overload-cooldown'],
    ['kaedeharakazuha', 'c1', 'chihayaburu-cooldown', '保留施放元素爆发后的冷却重置为独立规则。'],
    ['razor', 'a1', 'claw-and-thunder-cooldown', '保留施放元素爆发后的冷却重置为独立规则。'],
    ['yunjin', 'c1', 'opening-flourish-cooldown'],
  ]) {
    const unlock = Number(tier[1]), isConstellation = tier[0] === 'c';
    const rank = isConstellation ? unlock : 0, ascension = isConstellation ? 0 : unlock;
    const source = isConstellation ? constellation(entity, unlock) : talent(entity, 'passive' + unlock);
    verify({ entity, clause: (isConstellation ? '/constellations/' : '/passives/') + (unlock - 1), buff: entity + '.' + tier + '.' + suff,
      output: skillRatio, sources: [source], rank, ascension, remaining,
      cases: withUnlock(positiveAndExclusions(entity, {}, ratioFrom(source)), rank, ascension) });
  }

  for (const traveler of ['aether', 'lumine']) for (const [element, suff, facts] of [
    ['geo', 'starfall-sword-cooldown', {}],
    ['electro', 'lightning-blade-cooldown', baseFacts(traveler + '-electro', 'a1', ['abundanceAmuletTeammatePickup'])],
  ]) {
    const entity = traveler + '-' + element, source = talent('traveler' + element, 'passive1');
    verify({ entity, clause: '/passives/0', buff: entity + '.a1.' + suff, output: skillMs, sources: [source], ascension: 1,
      cases: withUnlock(positiveAndExclusions(entity, facts, millisecondsFrom(source)), 0, 1) });
  }

  for (const [entity, tier, suff, flags, interval, output = skillMs, remaining] of [
    ['alhaitham', 'c1', 'intuition-cooldown', ['projectionHit'], true],
    ['gorou', 'c1', 'inuzaka-cooldown', ['otherActiveGeoDamage', 'attackerInGeneralArea'], true],
    ['kujousara', 'c1', 'tengu-cooldown', ['tenguJuuraiAppliedAttackOrHit'], true],
    ['thoma', 'c1', 'blazing-barrier-cooldown', ['otherAllyHitWithOwnBarrier'], true],
    ['thoma', 'c1', 'blazing-barrier-cooldown', ['otherAllyHitWithOwnBarrier'], true, burstMs],
    ['yoimiya', 'c4', 'niwabi-cooldown', ['ownAurousBlazeExploded'], false],
    ['dori', 'a1', 'spiritwarding-lamp-cooldown', ['jinniLinkedReactor', 'qualifyingElectroReaction'], true],
    ['chiori', 'c6', 'flutter-cooldown', ['tailorMadeFollowUp'], false, skillMs, '普通攻击伤害提升由独立贡献验算。'],
  ]) {
    const unlock = Number(tier[1]), isConstellation = tier[0] === 'c';
    const rank = isConstellation ? unlock : 0, ascension = entity === 'chiori' || !isConstellation ? 1 : 0;
    const source = isConstellation ? constellation(entity, unlock) : talent(entity, 'passive' + unlock);
    const facts = baseFacts(entity, tier, [...flags, ...(interval ? ['cooldownIntervalReady'] : [])]);
    if (interval) checkTimingLabel(entity, entity + '.' + tier + '.cooldownIntervalReady', source, triggerInterval, minimumInterval);
    verify({ entity, clause: (isConstellation ? '/constellations/' : '/passives/') + (unlock - 1), buff: entity + '.' + tier + '.' + suff,
      output, sources: entity === 'chiori' ? [source, talent(entity, 'passive1')] : [source], rank, ascension, remaining,
      cases: withUnlock(positiveAndExclusions(entity, facts, output === burstMs ? amountFrom(source, /真红炽火之大铠的冷却时间减少([\d.]+)秒/, 1000)
        : millisecondsFrom(source), entity === 'gorou' ? { party: ['albedo', peer] } : {}), rank, ascension) });
  }

  for (const [entity, clause, buff, source, key, flags, limit, settings] of [
    ['charlotte', '/passives/0', 'a1.framing-cooldown', talent('charlotte', 'passive1'), 'a1.focusedImpressionCooldownUses',
      ['focusedImpressionDefeated'], /减少(\d+)次元素战技/, { ascension: 1 }],
    ['freminet', '/passives/0', 'a1.floe-cooldown', talent('freminet', 'passive1'), 'a1.shatteringPressureLevel',
      ['shatteringPressureCast'], /小于(四)阶/, { ascension: 1 }],
    ['raidenshogun', '/constellations/5', 'c6.wishbearer-cooldown', constellation('raidenshogun', 6), 'c6.wishbearerCooldownUses',
      ['musouIsshinBurstHit', 'cooldownIntervalReady', 'nearbyCooldownTeammate'], /在持续期间内至多触发(\d+)次/, { rank: 6, recipient: peer }],
  ]) {
    const threshold = text(source).match(limit)?.[1] === '四' ? 4 : amountFrom(source, limit);
    const factKey = entity + '.' + key, expected = millisecondsFrom(source);
    if (entity === 'charlotte') checkTimingLabel(entity, factKey, source, /每(\d+)秒/, seconds => seconds + '秒计数周期');
    if (entity === 'raidenshogun') checkTimingLabel(entity, entity + '.c6.cooldownIntervalReady', source, triggerInterval, minimumInterval);
    const facts = { ...baseFacts(entity, key.split('.')[0], flags), [factKey]: threshold - 1 };
    const { rank = 0, ascension = 0, recipient } = settings;
    verify({ entity, clause, buff: entity + '.' + buff, output: recipient ? burstMs : skillMs, sources: [source], rank, ascension,
      cases: withUnlock([
        ...positiveAndExclusions(entity, facts, expected, { recipient }),
        ...[0, threshold, threshold + 1, null].map(count => ({ label: '计数边界 ' + String(count), recipient,
          facts: { ...facts, [factKey]: count }, expected: count === null ? null : count < threshold ? expected : 0 })),
      ], rank, ascension) });
  }

  for (const [entity, rank] of [['arlecchino', 4], ['aratakiitto', 2], ['navia', 1], ['xilonen', 2]]) {
    const source = constellation(entity, rank), gate = entity + '.directEnergy.c' + rank;
    const amount = millisecondsFrom(source);
    if (entity === 'arlecchino') checkTimingLabel(entity, gate, source, triggerInterval, minimumInterval);
    let cases = positiveAndExclusions(entity, { [gate]: true }, amount);
    if (entity === 'aratakiitto') {
      const cap = amountFrom(source, /至多减少([\d.]+)秒冷却时间/, 1000);
      cases.push(...[['albedo'], ['albedo', 'noelle'], ['albedo', 'noelle', 'ningguang']].map((party, index) => ({
        label: '队伍中有' + (index + 2) + '名岩元素队员', party, facts: { [gate]: true }, expected: Math.min(cap, (index + 2) * amount),
      })));
    } else if (entity === 'navia') {
      const shards = 'navia.energyShardsConsumed', cap = amountFrom(source, /冷却时间减少([\d.]+)秒。$/, 1000);
      cases = positiveAndExclusions(entity, { [gate]: true, [shards]: 1 }, amount);
      cases.push(...[0, 2, 3, 6, null].map(count => ({ label: '本次消耗裂晶弹片 ' + String(count), facts: { [gate]: true, [shards]: count },
        expected: count === null ? null : Math.min(cap, count * amount) })));
    } else if (entity === 'xilonen') {
      const facts = { [gate]: true, 'xilonen.c2.nearbyElectroCooldownTeammate': true };
      cases = positiveAndExclusions(entity, facts, amount, { recipient: 'lisa', party: ['lisa', peer] });
      cases.push({ label: '排除附近的非雷队员', recipient: peer, party: ['lisa', peer], facts, expected: 0, applicationAvailable: false });
    }
    verify({ entity, clause: '/constellations/' + (rank - 1), buff: entity === 'xilonen' ? 'xilonen.c2.electro-cooldown' : gate,
      output: burstMs, sources: [source], rank, cases: withUnlock(cases, rank, 0),
      remaining: '此处验算元素爆发冷却减少量，同一命座的元素能量及其他增益由独立贡献验算。' });
  }

  for (const [entity, field, source, reason] of [
    ['bennett', '/passives/1', talent('bennett', 'passive2'), '领域内热情过载的50%缩减尚需与第一固有天赋20%的叠算口径和本次施放进行独立绑定。'],
    ['candace', '/constellations/3', constellation('candace', 4), '需为圣仪·苍鹭庇卫区分长按与点按的基础冷却，且只调整长按。'],
    ['chongyun', '/constellations/1', constellation('chongyun', 2), '需把15%缩减限定在领域内的那一次战技或爆发施放，避免同一个条件影响其他施放。'],
    ['eula', '/constellations/1', constellation('eula', 2), '需为冰潮的涡旋区分长按与点按的基础冷却，且只调整长按。'],
    ['flins', '/constellations/0', constellation('flins', 1), '4秒是特殊元素战技北国枪阵替换后的基础冷却，需要该特殊战技独立入口。'],
    ['freminet', '/talents/2', talent('freminet', 'combat3'), '潜猎模式中的70%缩减需要在施放时确认仍在模式内且未退场，战技重置也须独立处理。'],
    ['furina', '/passives/2', talent('furina', 'passive3'), '30%缩减作用于异色原海异种能力，当前战技与爆发查询无此能力。'],
    ['kinich', '/talents/1', talent('kinich', 'combat2'), '60%缩减只作用于无敌人或攻击物时向前发钩索的空中摆荡，需独立的无目标施放分支。'],
    ['lauma', '/passives/1', talent('lauma', 'passive2'), '每点元素精通0.02%、最多20%的缩减仅作用于灵使化形的独立冷却。'],
    ['mavuika', '/passives/3', talent('mavuika', 'passive4'), '20%缩减作用于全队夜魂传递的共享冷却，当前战技与爆发查询无此计时。'],
  ]) if (characters.has(entity)) gaps.push({ entity, field, sources: [source], reason });

  return { rows, verified, resolved, gaps, summary: { directCooldownCases: rows.length,
    directCooldownMismatches: rows.filter(row => row.issue).length, verifiedDirectCooldownModifiers: resolved.length, directCooldownGaps: gaps.length } };
}
