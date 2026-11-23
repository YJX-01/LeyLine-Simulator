import { readContentSource } from './content-source.mjs';
import { auditBuild, bool, fact, novice, number } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const description = (id, group, section) => capture + 'ChineseSimplified/' + group + '/' + id + '.json#/' + section + '/description';
const talent = (id, section) => description(id, 'talents', section);
const constellation = (id, rank) => description(id, 'constellations', 'c' + rank);
const stats = capture + 'stats/talents.json';
const roster = 'tools/data/sources/catalog/genshin-db/characters.json';
const configuration = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/conditional-cast-cooldowns.json#/';
const documents = new Map();
function raw(source) {
  const [path, pointer] = source.split('#/');
  if (!documents.has(path)) documents.set(path, readContentSource(new URL('../../' + path, import.meta.url)));
  return pointer.split('/').reduce((value, key) => value[key], documents.get(path));
}
function amount(source, pattern) {
  const match = raw(source).match(pattern);
  if (!match) throw new Error(source + ' 缺少预期冷却数值 ' + pattern);
  return Number(match[1]);
}

const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const attribute = id => ({ kind: 'attribute', actor: { role: 'recipient' }, key: ref('attribute.' + id),
  at: { kind: 'current', phase: 'same' } });
const numeric = row => row?.state === 'known' && row.value?.kind === 'quantity' ? row.value.value : null;
const modifiers = {
  skill: 'currentCastSkillCooldownReduction',
  burst: 'currentCastBurstCooldownReduction',
  flat: 'currentCastSkillCooldownReductionMs',
  passion: 'passionOverloadCooldownAfterPassivesMs',
  spear: 'northernSpearArrayBaseCooldownOverrideMs',
  grapple: 'forwardGrappleCooldownReduction',
  spirit: 'spiritEnvoyFormCooldownReduction',
  xenochromatic: 'xenochromaticFontemerAbilityCooldownReduction',
  transmission: 'nightsoulTransmissionCooldownReduction',
};
const peer = 'lisa';
const ordinary = 'kaeya';
const fixedSpecialCooldownHit = 'flins.skill.param7';
export const conditionalCastCooldownCharacterIds = [
  'bennett', 'candace', 'chongyun', 'eula', 'flins', 'freminet', 'furina', 'kinich', 'lauma', 'mavuika',
];
export const conditionalCastCooldownPeerIds = [peer, ordinary];

/** Verify confirmed margins on one query, using fixed descriptions and independent talent curves. */
export function auditConditionalCastCooldowns(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const prepared = new Map();

  function teamFor(id, party, rank, ascension) {
    const key = JSON.stringify([id, party, rank, ascension]);
    if (prepared.has(key)) return prepared.get(key);
    const builds = party.map(member => {
      const character = characters.get(member);
      const weapon = weapons.get(novice[character.identity.weaponType]);
      if (!weapon) throw new Error(member + ' 缺少当次冷却验算武器');
      const build = auditBuild(character, weapon);
      if (member === id) Object.assign(build, { constellation: rank, ascension,
        level: ascension ? character.progression.promotion[ascension - 1].maxLevel : 1 });
      return { id: member, build };
    });
    const result = engine.prepareStructuredBuilds(builds);
    if (!result.ok) throw new Error(id + ' 当次冷却验算配装无效 ' + JSON.stringify(result.diagnostics));
    prepared.set(key, result.team);
    return result.team;
  }

  function verify({ entity, clause, buff, output, sources, rank = 0, ascension = 0, expected, label, remaining,
    hit, unrelatedHit, gate, onField, teammate = false, recipient = entity, extraCases = [], otherExpected }) {
    const character = characters.get(entity);
    if (!character || !characters.has(peer) || !characters.has(ordinary)) return;
    const [, section, index] = clause.split('/');
    const buffs = character.metadata[section][Number(index)].buffs ?? [];
    const buffIndex = buffs.findIndex(entry => entry.id === buff);
    const modifierIndex = buffs[buffIndex]?.modifiers.findIndex(modifier => modifier.target === 'attribute.' + output
      && (!modifier.appliesTo?.hitIds || modifier.appliesTo.hitIds.includes(hit))) ?? -1;
    const field = modifierIndex < 0 ? clause : clause + '/buffs/' + buffIndex + '/modifiers/' + modifierIndex;
    const effect = modifierIndex > 0 ? buff + '.' + modifierIndex : buff;
    const definition = character.calculation.bundle.effects.find(entry => entry.identity.id === effect);
    const evidence = { entity, clause, field, effect, output: 'attribute.' + output, sources };
    if (modifierIndex < 0 || definition?.target.attribute?.id !== evidence.output) {
      rows.push({ ...evidence, value: null, expected, issue: '缺少当次冷却贡献' });
      gaps.push({ entity, field: clause, sources, reason: '缺少当次冷却贡献。' });
      return;
    }
    const base = { recipient, hit, rank, ascension, party: [entity, peer, ordinary], enabled: true, applicable: true,
      facts: { [gate]: true, ...(onField && { onField: true }) } };
    const samples = [
      { ...base, expected, label: '当次条件满足' },
      { ...base, facts: { ...base.facts, [gate]: false }, expected: 0, label: '当次条件不满足' },
      { ...base, facts: { ...base.facts, [gate]: null }, expected: null, label: '当次条件未知' },
      { ...base, enabled: false, expected: 0, label: '当次贡献未启用' },
      ...(unrelatedHit ? [{ ...base, hit: unrelatedHit, applicable: false, expected: 0, label: '其他施放' }] : []),
      ...(onField ? [
        { ...base, facts: { ...base.facts, onField: false }, expected: 0, label: '退场后潜猎失效' },
        { ...base, facts: { ...base.facts, onField: null }, expected: null, label: '在场状态未知' },
      ] : []),
      ...(rank ? [{ ...base, rank: rank - 1, applicable: false, expected: 0, label: '命座未解锁' }] : []),
      ...(ascension ? [{ ...base, ascension: ascension - 1, applicable: false, expected: 0, label: '突破天赋未解锁' }] : []),
      ...(teammate ? [
        { ...base, recipient: entity, hit: null, applicable: false, expected: 0, label: '能力持有者未参与此查询', party: [peer, ordinary], excludedOwner: true },
      ] : [{ ...base, recipient: peer, hit: 'lisa.skill.param1', applicable: false, expected: 0, label: '其他受益人' }]),
      ...extraCases.map(settings => ({ ...base, ...settings })),
    ];
    const start = rows.length;
    for (const sample of samples) {
      const selected = sample.excludedOwner ? peer : sample.recipient;
      const team = teamFor(entity, sample.party, sample.rank, sample.ascension);
      const beneficiary = characters.get(selected);
      const skill = beneficiary.talents.find(entry => entry.hits.some(entry => entry.id === sample.hit));
      const hit = skill?.hits.find(entry => entry.id === sample.hit);
      const hitIdentity = hit ? { skillId: skill.id, hitId: hit.id, category: hit.category, element: hit.element,
        family: Object.keys(hit.damage)[0], origin: hit.origin, reactionId: null } : null;
      if (sample.hit && !hitIdentity) throw new Error(selected + ' 缺少真实冷却验算命中 ' + sample.hit);
      const event = { id: 'current', kind: hit ? 'hit' : 'action', actorId: selected,
        ...(hitIdentity && { skillId: hitIdentity.skillId, hitId: hitIdentity.hitId, category: hitIdentity.category }),
        timeMs: 0, order: 0, targetIds: [], sourceEventIds: [], facts: {} };
      const context = engine.createStructuredCombatContext(team, {
        targets: [{ id: 'enemy', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [], events: [event],
      });
      const queryFacts = {}, actorFacts = {};
      for (const [key, value] of Object.entries(sample.facts)) {
        const observed = value === null ? fact(null) : bool(value);
        (key === 'onField' ? actorFacts : queryFacts)[key] = observed;
      }
      const frame = {
        eventId: 'current', ownerId: selected, recipientId: selected, contributorId: null, targetId: 'enemy', phase: 'before', sourceEventId: null,
        facts: queryFacts, actorFacts: {}, captures: {}, hit: hitIdentity,
        applications: sample.applicable ? [{ instanceId: engine.calculationEffectInstanceId(entity, definition.buff ?? definition.identity, null),
          active: sample.enabled }] : [],
        factOverrides: sample.party.includes(entity) ? [{ subject: { kind: 'actor', id: entity }, facts: actorFacts }] : [],
      };
      const available = new Set(sample.party.flatMap(id => characters.get(id).calculation.bundle.attributes.map(entry => entry.identity.id)));
      if (!available.has(evidence.output) && sample.excludedOwner) {
        rows.push({ ...evidence, expected: 0, value: 0, actualOutput: 0, status: 'absent', probe: { ...sample, recipient: selected } });
        continue;
      }
      const watched = ['elementalSkillCooldownReduction', 'elementalSkillCooldownReductionMs', 'elementalBurstCooldownReductionMs',
        ...Object.values(modifiers).filter(key => key !== output)].filter(key => available.has('attribute.' + key));
      const result = engine.evaluateCombatBindings(team.program, context,
        { measured: attribute(output), ...Object.fromEntries(watched.map(key => [key, attribute(key)])) }, frame);
      const trace = result.trace.find(node => node.kind === 'effect' && node.definition.id === effect &&
        node.context?.actorId === entity && node.context?.recipientId === selected);
      const status = result.outputs.measured?.state ?? 'missing';
      const value = trace ? numeric(trace) : 0;
      const actualOutput = numeric(result.outputs.measured);
      const matches = reading => sample.expected === null ? reading === null : reading !== null && Math.abs(reading - sample.expected) < 1e-8;
      const unexpectedOutputs = watched.filter(key => {
        const expectedBase = key === 'elementalSkillCooldownReduction' && selected === 'bennett' && sample.ascension >= 1 ? 0.2 : 0;
        const expected = otherExpected ? otherExpected(key, sample, expectedBase) : expectedBase;
        return numeric(result.outputs[key]) !== expected;
      });
      const passed = matches(value) && matches(actualOutput) && status === (sample.expected === null ? 'unknown' : 'known')
        && !unexpectedOutputs.length;
      rows.push({ ...evidence, expected: sample.expected, value, actualOutput, status, probe: { ...sample, recipient: selected },
        ...(passed ? {} : { issue: '当次冷却、受益人或其他能力的冷却与固定来源不符', diagnostics: result.diagnostics, unexpectedOutputs }) });
    }
    if (rows.slice(start).some(row => row.issue)) {
      gaps.push({ entity, field: clause, sources, reason: '当次条件或冷却读取与固定来源不符。' });
      return;
    }
    verified.add(entity + field);
    if (!remaining) verified.add(entity + clause);
    resolved.push({ entity, field, sources, resolved: label, ...(remaining ? { remaining } : {}) });
  }

  function constantDetail(id, label) {
    const labels = capture + 'ChineseSimplified/talents/' + id + '.json#/combat2/attributes/labels';
    const detail = raw(labels);
    const index = detail.findIndex(entry => entry.startsWith(label + '|'));
    const parameter = detail[index]?.match(/\|\{(param\d+):F1\}秒$/)?.[1];
    if (!parameter) throw new Error(labels + ' 缺少预期详情 ' + label);
    const values = stats + '#/' + id + '/combat2/' + parameter;
    const seconds = raw(values);
    if (!Number.isFinite(seconds[0]) || !seconds.every(value => value === seconds[0])) throw new Error(values + ' 不是固定冷却');
    return { seconds: seconds[0], sources: [labels + '/' + index, values] };
  }

  for (const [entity, rank, hit, alternate] of [
    ['candace', 4, 'candace.skill.param4', 'candace.burst.param1'],
    ['eula', 2, 'eula.skill.param2', 'eula.skill.param1'],
  ]) {
    const source = constellation(entity, rank);
    if (!raw(source).includes('长按的冷却时间，使其降低至与点按的冷却时间相同')) throw new Error(source + ' 缺少长按替换范围');
    const tap = constantDetail(entity, '点按冷却时间'), hold = constantDetail(entity, '长按冷却时间');
    const expected = Math.round((hold.seconds - tap.seconds) * 1000);
    verify({ entity, clause: '/constellations/' + (rank - 1), buff: entity + '.c' + rank + '.hold-cooldown',
      output: modifiers.flat, gate: entity + '.c' + rank + '.heldSkillCast', rank, hit, unrelatedHit: alternate, expected,
      sources: [source, ...tap.sources, ...hold.sources], label: '本次长按冷却由' + hold.seconds + '秒减至' + tap.seconds + '秒',
      extraCases: entity === 'candace' ? [{ hit: 'candace.skill.param3', facts: { 'candace.c4.heldSkillCast': true }, expected, label: '长按提前释放' },
        { hit: 'candace.skill.param3', facts: { 'candace.c4.heldSkillCast': false }, expected: 0, label: '点按' }] : [] });
  }

  const frost = constellation('chongyun', 2);
  const flinsSkill = talent('flins', 'combat2');
  if (!raw(flinsSkill).includes('该冷却时间不会受到其他效果影响')) throw new Error(flinsSkill + ' 缺少北国枪阵的固定冷却声明');
  const fieldRatio = amount(frost, /领域内施放的元素战技与元素爆发的冷却时间减少([\d.]+)%/) / 100;
  for (const [output, hit] of [[modifiers.skill, 'lisa.skill.param1'], [modifiers.burst, 'lisa.burst.param1']]) {
    const selfHit = output === modifiers.skill ? 'chongyun.skill.param1' : 'chongyun.burst.param1';
    const otherId = output === modifiers.skill ? 'kaeya.skill.param1' : 'kaeya.burst.param1';
    verify({ entity: 'chongyun', clause: '/constellations/1', buff: 'chongyun.c2.frost-field-cast-cooldown',
      output, gate: 'chongyun.c2.recipientCastInFrostField', rank: 2,
      sources: [frost, talent('chongyun', 'combat2'), ...(output === modifiers.skill ? [flinsSkill] : [])],
      recipient: peer, teammate: true, hit, unrelatedHit: 'lisa.normal.param1',
      expected: fieldRatio, label: '受益人领域内本次' + (output === modifiers.skill ? '元素战技' : '元素爆发') + '冷却缩减' + fieldRatio * 100 + '%',
      extraCases: [{ recipient: 'chongyun', hit: selfHit, expected: fieldRatio, label: '领域内重云自身' },
        { recipient: ordinary, hit: otherId, facts: { 'chongyun.c2.recipientCastInFrostField': false }, expected: 0, label: '领域外其他队员' },
        ...(output === modifiers.skill && characters.has('flins') ? [{ recipient: 'flins', hit: fixedSpecialCooldownHit,
          party: ['chongyun', 'flins', ordinary], applicable: false, expected: 0, label: '排除固定冷却的北国枪阵' }] : [])] });
  }
  const spear = constellation('flins', 1), spearBase = constantDetail('flins', '北国枪阵冷却时间');
  const spearSeconds = amount(spear, /北国枪阵的基础冷却时间缩短为([\d.]+)秒/);
  verify({ entity: 'flins', clause: '/constellations/0', buff: 'flins.c1.northern-spear-array-cooldown',
    output: modifiers.spear, gate: 'flins.c1.northernSpearArrayCast', rank: 1, hit: fixedSpecialCooldownHit, unrelatedHit: 'flins.skill.param1',
    expected: spearSeconds * 1000, sources: [spear, flinsSkill, ...spearBase.sources],
    label: '北国枪阵基础冷却由' + spearBase.seconds + '秒替换为' + spearSeconds + '秒' });

  const freminet = talent('freminet', 'combat3');
  verify({ entity: 'freminet', clause: '/talents/2', buff: 'freminet.burst.subnautical-hunter-cast-cooldown',
    output: modifiers.skill, gate: 'freminet.burst.subnauticalHunterAtCast', onField: true,
    hit: 'freminet.skill.param1', unrelatedHit: 'freminet.burst.param1', expected: amount(freminet, /冷却时间缩短([\d.]+)%/) / 100,
    sources: [freminet, talent('freminet', 'combat2')], label: '潜猎中的本次浮冰增压冷却缩减70%',
    remaining: '元素爆发施放时的战技冷却重置是独立的事件。' });

  const kinich = talent('kinich', 'combat2');
  verify({ entity: 'kinich', clause: '/talents/1', buff: 'kinich.skill.forward-swing-cooldown',
    output: modifiers.grapple, gate: 'kinich.skill.forwardGrappleWithoutTarget', hit: 'kinich.normal.param9', unrelatedHit: 'kinich.skill.param1',
    expected: amount(kinich, /空中摆荡，并使冷却时间缩短([\d.]+)%/) / 100,
    sources: [kinich, talent('kinich', 'combat1')], label: '对应空中普攻的无目标向前抛钩摆荡冷却缩减60%',
    extraCases: [{ hit: 'kinich.skill.param2', applicable: false, expected: 0, label: '迴猎贯鳞炮' }] });

  const lauma = talent('lauma', 'passive2');
  const masteryRate = amount(lauma, /灵使化形」的冷却时间缩短([\d.]+)%/) / 100;
  const masteryCap = amount(lauma, /至多使「灵使化形」的冷却时间缩短([\d.]+)%/) / 100;
  const mastery = roster + '#/lauma/stats/promotion/4/specialized';
  verify({ entity: 'lauma', clause: '/passives/1', buff: 'lauma.a4.spirit-envoy-cooldown',
    output: modifiers.spirit, gate: 'lauma.a4.spiritEnvoyFormEnded', ascension: 4, hit: 'lauma.normal.param9',
    expected: Math.min(masteryCap, raw(mastery) * masteryRate), sources: [lauma, talent('lauma', 'combat1'), mastery],
    label: '灵使化形每点元素精通缩短0.02%，最高20%' });

  const mavuika = talent('mavuika', 'passive4');
  verify({ entity: 'mavuika', clause: '/passives/3', buff: 'mavuika.utility.nightsoul-transmission-cooldown',
    output: modifiers.transmission, gate: 'mavuika.utility.nightsoulTransmissionTriggered', recipient: peer, teammate: true,
    hit: 'lisa.skill.param1', expected: amount(mavuika, /队伍触发夜魂传递的冷却时间减少([\d.]+)%/) / 100,
    sources: [mavuika, talent('mavuika', 'passive3')], label: '队伍夜魂传递冷却缩减20%',
    extraCases: [{ recipient: 'mavuika', hit: 'mavuika.skill.param1', expected: 0.2, label: '玛薇卡所在队伍' }] });

  const furina = talent('furina', 'passive3');
  const furinaAbility = configuration + 'furina/ability/record';
  const furinaTalent = configuration + 'furina/talent/record/0';
  const teamAbility = configuration + 'furina/recipientComparison/record';
  const { abilityName, onAdded, modifiers: { GV_Toggle: toggle } } = raw(furinaAbility);
  if (raw(furinaTalent).$type !== 'AddAbility' || raw(furinaTalent).abilityName !== abilityName
    || onAdded[0].$type !== 'AttachModifier' || onAdded[0].modifierName !== 'GV_Toggle' || onAdded[0].target
    || toggle.onAdded[0].$type !== 'SetGlobalValue' || toggle.onAdded[0].key !== '_ABILITY_Diving_SkillCDReduction'
    || toggle.onAdded[0].target || raw(teamAbility).target !== 'CurTeamAvatars') {
    throw new Error(furinaAbility + ' 缺少自身水下能力与明确队伍目标的对照配置');
  }
  verify({ entity: 'furina', clause: '/passives/2', buff: 'furina.utility.fontemer-ability-cooldown',
    output: modifiers.xenochromatic, gate: 'furina.utility.fontemerAbilityUsed', hit: 'furina.normal.param1',
    expected: amount(furina, /异色原海异种能力的冷却时间降低([\d.]+)%/) / 100,
    sources: [furina, furinaTalent, furinaAbility, teamAbility], label: '芙宁娜使用异色原海异种能力的冷却缩减30%' });

  const bennett = talent('bennett', 'passive2');
  const a1Description = talent('bennett', 'passive1');
  const a1 = configuration + 'bennett/ascension1/record';
  const a4 = configuration + 'bennett/ascension4/record';
  const baseTap = stats + '#/bennett/combat2/param7/0';
  const tapSeconds = raw(baseTap);
  const a1Ratio = amount(a1Description, /冷却时间减少([\d.]+)%/) / 100;
  const a4Ratio = amount(bennett, /冷却时间减少([\d.]+)%/) / 100;
  const { cdDelta, skillID } = raw(a1);
  if (raw(a1).$type !== 'ModifySkillCD' || -cdDelta / tapSeconds !== a1Ratio
    || !raw(a4).some(entry => entry.$type === 'UnlockTalentParam' && entry.talentParam === 'Donot_Blow_Self')) {
    throw new Error(a4 + ' 缺少第一天赋共用冷却及第四天赋领域配置');
  }
  const bennettGate = 'bennett.a4.castInInspirationField';
  const bennettCasts = [
    ['tap', 7, [1], '点按'], ['hold1', 8, [2, 3], '一段蓄力'], ['hold2', 9, [4, 5, 6], '二段蓄力'],
  ].map(([key, parameter, hits, label]) => {
    const source = configuration + 'bennett/casts/' + key + '/record';
    const baseDuration = stats + '#/bennett/combat2/param' + parameter + '/0';
    const { failActions: [outside], successActions: [inside], targetPredicates } = raw(source);
    if (![outside, inside].every(action => action.$type === 'AvatarSkillStart' && action.skillID === skillID)
      || outside.cdRatio * tapSeconds !== raw(baseDuration) || inside.cdRatio / outside.cdRatio !== 1 - a4Ratio
      || !targetPredicates.some(entry => entry.key === '_ABILITY_Talent_Bennett_DonotBlow' && entry.value === 1)) {
      throw new Error(source + ' 缺少相同战技的领域前后倍率');
    }
    return { sources: [source, baseDuration], hits: hits.map(index => 'bennett.skill.param' + index), label,
      expected: (tapSeconds + cdDelta) * inside.cdRatio * 1000 };
  });
  const bennettRead = { entity: 'bennett', clause: '/passives/1', buff: 'bennett.a4.passion-overload-cooldown',
    gate: bennettGate, ascension: 4, unrelatedHit: 'bennett.burst.param1' };
  const bennettSources = [bennett, a1Description, a1, a4, baseTap];
  const contributes = sample => sample.applicable && sample.enabled && sample.facts[bennettGate] !== false;
  function relatedCooldown(key, sample, base, related, expected) {
    if (key !== related) return base;
    return !contributes(sample) ? 0 : sample.facts[bennettGate] === null ? null : expected;
  }
  verify({ ...bennettRead, output: modifiers.skill, hit: bennettCasts[0].hits[0],
    expected: a4Ratio, sources: [...bennettSources, ...bennettCasts[0].sources],
    label: '领域内本次热情过载的无畏的热血贡献为50%',
    otherExpected: (key, sample, base) => relatedCooldown(key, sample, base, modifiers.passion, bennettCasts[0].expected) });
  for (const cast of bennettCasts) {
    verify({ ...bennettRead, output: modifiers.passion, hit: cast.hits[0], expected: cast.expected,
      sources: [...new Set([...bennettSources, ...cast.sources])],
      label: '领域内' + cast.label + '计入两项突破天赋后的冷却为' + cast.expected / 1000 + '秒',
      otherExpected: (key, sample, base) => relatedCooldown(key, sample, base, modifiers.skill, a4Ratio),
      extraCases: cast.hits.slice(1).map(hit => ({ hit, expected: cast.expected, label: '同一施放的后续命中' })) });
  }

  for (const entry of resolved) if (entry.remaining) {
    const clause = entry.field.split('/buffs/')[0];
    gaps.push({ entity: entry.entity, field: clause, sources: entry.sources, reason: entry.remaining });
  }
  for (const entry of gaps) verified.delete(entry.entity + entry.field);
  return { rows, verified, resolved, gaps, summary: { conditionalCastCooldownCases: rows.length,
    conditionalCastCooldownMismatches: rows.filter(row => row.issue).length, verifiedConditionalCastCooldownModifiers: resolved.length,
    conditionalCastCooldownGaps: gaps.length } };
}
