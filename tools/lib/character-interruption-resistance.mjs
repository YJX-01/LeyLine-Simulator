import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const evidencePath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/character-interruption-resistance.json';
const textRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const evidence = read(evidencePath);
const output = 'attribute.incomingPoiseDamageMultiplier';
const bindings = { [output]: { kind: 'attribute', actor: { role: 'recipient' },
  key: { namespace: 'builtin', id: output, revision: '1' }, at: { kind: 'current', phase: 'same' } } };
const actor = id => ({ kind: 'actor', id });
const encode = value => value === null ? fact(null) : typeof value === 'number' ? number('count', value) : bool(value);
const encoded = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, encode(value)]));
const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-10 : a === b;
const quantity = trace => trace?.state === 'known' && trace.value?.kind === 'quantity' ? trace.value.value : null;

export const characterInterruptionResistanceIds = Object.keys(evidence.entries);
export const characterInterruptionResistancePeerIds = ['kaeya'];

function parameter(override, parameters) {
  const token = override.value.paramDelta.match(/^%(\d+)$/);
  if (!token) throw new Error('抗打断天赋参数引用无效。');
  const value = parameters.value.paramList[Number(token[1]) - 1];
  if (!Number.isFinite(value)) throw new Error('抗打断天赋参数缺失。');
  return value;
}

function multiplier(entry, seals = 0) {
  const raw = entry.multiplier.value;
  if (typeof raw === 'number') return raw;
  const rawKey = Array.isArray(raw) ? raw[1] : raw;
  if (!entry.special.pointer.endsWith('/' + rawKey) || entry.override && entry.override.value.paramSpecial !== rawKey) {
    throw new Error('抗打断修饰所引用的特殊参数与固定记录不符。');
  }
  const special = entry.special.value + (entry.override ? parameter(entry.override, entry.parameters) : 0);
  if (!Array.isArray(raw)) return special;
  if (raw.length !== 5 || raw[2] !== 'Feiyan_Temp_WeightCount' || raw[3] !== 'MUL' || raw[4] !== 'ADD') {
    throw new Error('烟绯的抗打断计算式与固定记录不符。');
  }
  return raw[0] + special * seals;
}

function documentedClause(entity, branch) {
  const passive = branch.startsWith('passive');
  const index = Number(branch.at(-1)) - 1;
  const textEntity = entity.endsWith('-geo') ? 'travelergeo' : entity;
  const textPath = textRoot + (passive ? 'talents/' : 'constellations/') + textEntity + '.json';
  const source = read(textPath)[branch];
  if (!source?.description.includes('抗打断')) throw new Error(entity + ' 缺少原始抗打断说明。');
  const pointer = '/' + (passive ? 'passives' : 'constellations') + '/' + index;
  const sourceRefs = [textPath + '#/' + branch + '/description', evidencePath + '#/entries/' + entity + '/' + branch];
  return { index, passive, pointer, sourceRefs };
}

export function auditCharacterInterruptionResistance(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const teams = new Map();

  function teamFor(lineup) {
    const key = JSON.stringify(lineup);
    if (!teams.has(key)) {
      const actors = lineup.map(({ id, entity, ascension = 0, constellation = 0 }) => {
        const character = characters.get(entity), weapon = weapons.get(novice[character?.identity.weaponType]);
        if (!character || !weapon) throw new Error('抗打断验算缺少角色或入门武器 ' + entity);
        const build = auditBuild(character, weapon);
        Object.assign(build, { ascension, constellation, level: character.progression.promotion[ascension - 1]?.maxLevel ?? 1 });
        return { id, build };
      });
      const prepared = engine.prepareStructuredBuilds(actors);
      if (!prepared.ok) throw new Error('抗打断验算配装失败 ' + JSON.stringify(prepared.diagnostics));
      teams.set(key, prepared.team);
    }
    return teams.get(key);
  }

  function run(entity, modifierId, probe) {
    const { hitId, recipient = 'actor', peer = 'kaeya', constellation = 0, ascension = 0, peerConstellation = 0,
      ownerFacts, recipientFacts, teamFacts, capture = false } = probe;
    const lineup = [{ id: 'actor', entity, constellation, ascension }, { id: 'peer', entity: peer, constellation: peerConstellation }];
    const team = teamFor(lineup);
    const dealer = characters.get(recipient === 'actor' ? entity : peer);
    const talent = hitId ? dealer.talents.find(talent => talent.hits.some(hit => hit.id === hitId)) : dealer.talents[0];
    const hit = hitId ? talent?.hits.find(hit => hit.id === hitId) : talent?.hits[0];
    if (!hit) throw new Error(dealer.id + ' 缺少抗打断验算动作 ' + hitId);
    const { setup, request } = auditHit(dealer, talent, hit);
    const { frame } = request;
    const initial = frame.factOverrides[0];
    initial.subject = actor(recipient);
    if (recipient === 'peer') frame.factOverrides.unshift({ subject: actor('actor'), facts: { onField: bool(false) } });
    setAuditDefaults(characters.get(entity), frame);
    if (recipient === 'peer' && peer !== 'kaeya') setAuditDefaults(dealer, frame);
    Object.assign(frame.factOverrides[0].facts, encoded(ownerFacts ?? {}));
    Object.assign(initial.facts, encoded(recipientFacts ?? {}));
    setup.team.facts = encoded(teamFacts ?? {});
    setup.events[setup.events.length - 1].actorId = recipient;
    if (capture) {
      setup.events = [{ id: 'hit', kind: 'capture', actorId: recipient, targetIds: [], sourceEventIds: [], facts: {}, timeMs: 1, order: 1 }];
    }
    const hitFrame = capture ? null : { skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element,
      family: 'ordinary', origin: hit.origin, reactionId: null };
    const context = engine.createStructuredCombatContext(team, setup);
    const checked = engine.evaluateCombatBindings(team.program, context, bindings,
      { ...frame, ownerId: recipient, recipientId: recipient, contributorId: null, hit: hitFrame });
    const reading = checked.outputs[output];
    const effect = checked.trace.find(node => node.kind === 'effect' && node.definition.id === modifierId
      && node.context?.actorId === 'actor' && node.context?.recipientId === recipient);
    return { value: quantity(reading), status: reading?.state ?? 'missing', contribution: quantity(effect),
      diagnostics: checked.diagnostics.slice(0, 5) };
  }

  function check(entity, branch, buffIndex, modifierIndex, probes, details) {
    const definition = characters.get(entity);
    if (!definition) return;
    const { index, passive, pointer, sourceRefs } = documentedClause(entity, branch);
    const sources = [...sourceRefs, ...details.sources ?? []];
    const field = pointer + '/buffs/' + buffIndex + '/modifiers/' + modifierIndex;
    const entry = definition.metadata[passive ? 'passives' : 'constellations'][index].buffs?.[buffIndex];
    const modifierId = details.id + (modifierIndex ? '.' + modifierIndex : '');
    const valid = entry?.id === details.id && entry?.modifiers[modifierIndex]?.target === output;
    const confirmed = multiplier(evidence.entries[entity][branch], details.seals);
    const start = rows.length;
    for (const { label, state, contributes = state === 'active', ...settings } of probes) {
      const probe = { ascension: passive ? 1 : 0, constellation: passive ? 0 : index + 1, ...settings };
      const expectedContribution = contributes ? confirmed : null;
      const expected = state === 'unknown' || state === 'invalid' ? null
        : state === 'active' ? confirmed * (probe.otherMultiplier ?? 1) : probe.otherMultiplier ?? 1;
      const expectedStatus = state === 'unknown' || state === 'invalid' ? state : 'known';
      const { diagnostics, ...actual } = run(entity, modifierId, probe);
      const matches = valid && same(actual.value, expected) && actual.status === expectedStatus && same(actual.contribution, expectedContribution);
      rows.push({ entity, field, modifierId, output, probe: { label, ...probe }, sources, expected, expectedStatus, expectedContribution, ...actual,
        ...(matches ? {} : { issue: '抗打断倍率、适用范围或增益明细与固定资料不符。', diagnostics }) });
    }
    if (rows.slice(start).some(row => row.issue)) return;
    verified.add(entity + field);
    if (!details.resolved) return;
    resolved.push({ entity, field: pointer, sources, resolved: details.resolved, remaining: details.remaining });
    gaps.push({ entity, field: pointer, sources, kind: '历史与特殊交互', needed: details.remaining, reason: details.remaining });
  }

  const active = (label, settings = {}) => ({ label, state: 'active', ...settings });
  const inactive = (label, settings = {}) => ({ label, state: 'inactive', ...settings });
  const unknown = (label, settings = {}) => ({ label, state: 'unknown', ...settings });
  const inputs = (key, value) => ({ ownerFacts: { [key]: value } });
  const confirmedWindow = key => [active('确认状态有效', inputs(key, true)), inactive('确认状态已结束', inputs(key, false)),
    unknown('状态未知', inputs(key, null)), inactive('未解锁', { ...inputs(key, true), constellation: 0 }),
    inactive('队友无此效果', { ...inputs(key, true), recipient: 'peer' })];

  check('aratakiitto', 'passive1', 0, 1, [
    active('荒泷逆袈裟连斩', { hitId: 'aratakiitto.normal.param6' }),
    active('荒泷逆袈裟终结', { hitId: 'aratakiitto.normal.param7' }),
    inactive('普通重击', { hitId: 'aratakiitto.normal.param5' }), inactive('未解锁', { ascension: 0, hitId: 'aratakiitto.normal.param6' }),
    inactive('队友普通攻击', { recipient: 'peer' }),
  ], { id: 'aratakiitto.a0.kesagiri-speed', resolved: '荒泷逆袈裟连斩与终结的命中查询可读取受削韧倍率0。',
    remaining: '仍需把连续动作的起手、斩击和收招状态接到受击时刻。' });

  const masque = value => inputs('arlecchino.masqueRedDeath', value);
  check('arlecchino', 'c1', 0, 0, [
    active('红死之宴普通攻击', { ...masque(true), hitId: 'arlecchino.normal.param1' }),
    active('红死之宴重击', { ...masque(true), hitId: 'arlecchino.normal.param7' }),
    inactive('未转化重击', { ...masque(false), hitId: 'arlecchino.normal.param7' }),
    inactive('下落攻击', { ...masque(true), hitId: 'arlecchino.normal.param9' }),
    inactive('队友攻击', { ...masque(true), recipient: 'peer' }),
    inactive('零命', { ...masque(true), constellation: 0 }),
    unknown('红死之宴状态未知', masque(null)),
  ], { id: 'arlecchino.c1.red-death-poise', resolved: '只在确认红死之宴有效的普通攻击或重击中读取受削韧倍率0。',
    remaining: '仍需普通攻击和重击的受击判定帧，以及红死之宴状态的实战变更记录。' });

  const flame = value => inputs('clorinde.brightFlameStacks', value);
  check('clorinde', 'c2', 1, 0, [active('三层', flame(3)), inactive('两层', flame(2)), inactive('零层', flame(0)),
    inactive('突破天赋未解锁', { ...flame(3), ascension: 0 }),
    inactive('一命', { ...flame(3), constellation: 1 }),
    inactive('队友不获益', { ...flame(3), recipient: 'peer' }), unknown('层数未知', flame(null)),
    { label: '超过三层', state: 'invalid', ...flame(4) },
  ].map(probe => ({ ascension: 1, ...probe })), {
    id: 'clorinde.c2.flame-poise', resolved: '已解锁突破天赋并恰有三层有效破夜明焰时读取自身受削韧倍率0.3。',
    remaining: '仍需跟踪15秒独立层计时和符合条件的队员反应。' });

  const shade = (night, protection, extra = {}) => ({ ownerFacts: {
    'clorinde.nightVigil': night, 'clorinde.c6.shadeProtectionWindow': protection, ...extra,
  } });
  check('clorinde', 'c6', 1, 0, [active('夜巡第六次明烛之影未到期', shade(true, true)),
    inactive('第六次明烛之影已满一秒', shade(true, false)), inactive('夜巡先结束', shade(false, true)),
    inactive('低于六命', { ...shade(true, true), constellation: 5 }),
    inactive('队友不获益', { ...shade(true, true), recipient: 'peer' }),
    unknown('第六次明烛之影计时未知', shade(true, null)),
    active('同时拥有三层破夜明焰', { ...shade(true, true, { 'clorinde.brightFlameStacks': 3 }), ascension: 1, otherMultiplier: 0.3 }),
  ], { id: 'clorinde.c6.night-vigil-poise', resolved: '处于夜巡且第六次明烛之影后的1秒尚未结束时，自身受削韧倍率为0。',
    remaining: '仍需追击次数、每秒触发限制、最后一次追击时间和夜巡结束的事件记录。' });

  const lunar = (window, full = true) => ({ ...inputs('columbina.c1.lunarBloomProtectionWindow', window), teamFacts: { fullMoonsign: full } });
  check('columbina', 'c1', 2, 0, [active('月绽放且自身在场', lunar(true)),
    active('月绽放后切换到队友', { ...lunar(true), recipient: 'peer' }),
    inactive('场下队友', { ...lunar(true), recipient: 'peer', recipientFacts: { onField: false } }),
    inactive('非月兆满辉', lunar(true, false)), inactive('没有月绽放引力干涉或8秒过期', lunar(false)),
    inactive('零命', { ...lunar(true), constellation: 0 }), unknown('本次窗口未知', lunar(null)),
  ], { id: 'columbina.c1.lunar-bloom-poise', resolved: '确认月兆满辉的一命月绽放引力干涉8秒状态时，当前本地场上角色获得受削韧倍率0.3。',
    remaining: '仍需计算引力值归属、自动建立8秒窗口，并验证联机角色的归属。' });

  const forged = (window, activeField = true, inside = true) => ({ recipient: 'peer',
    ownerFacts: { 'dehya.a1.goldenForgedWindow': window, 'dehya.fierySanctumActive': activeField },
    recipientFacts: { 'dehya.insideFierySanctum': inside },
  });
  check('dehya', 'passive1', 1, 0, [active('队友在施加者的净焰剑狱内', forged(true)),
    active('本人在自己的净焰剑狱内', { ...forged(true), recipient: 'actor' }),
    inactive('受益人不在领域', forged(true, true, false)), inactive('无活动领域', forged(true, false)),
    inactive('9秒已过', forged(false)), inactive('未解锁', { ...forged(true), ascension: 0 }),
    inactive('队友在场下', { ...forged(true), recipientFacts: { 'dehya.insideFierySanctum': true, onField: false } }),
    unknown('覆盖情况未知', forged(true, true, null)),
  ], { id: 'dehya.a1.golden-forged-poise', resolved: '在净焰昂藏产生的9秒熔金铸躯窗口内，施加者领域内的场上角色获得受削韧倍率0。',
    remaining: '仍需净焰昂藏触发、18秒限次、领域重置与回收期间的连续位置记录。' });

  check('hutao', 'c6', 0, 9, confirmedWindow('hutao.butterflyEmbraceWindow'), {
    id: 'hutao.c6.butterfly-embrace', resolved: '血之灶火触发后的10秒有效状态给胡桃受削韧倍率0。',
    remaining: '仍需以实际来伤和生命值跨阈值事件记录触发与60秒限次。' });
  check('lisa', 'c2', 0, 1, confirmedWindow('lisa.holdingVioletArc'), {
    id: 'lisa.c2.violet-arc-defence', resolved: '丽莎处于苍雷长按蓄力状态时，自身受削韧倍率为0.5。',
    remaining: '仍需长按蓄力、就绪与放开时刻的动作记录。' });
  check('neuvillette', 'c1', 0, 0, [...confirmedWindow('neuvillette.legalEvaluationOrEquitableJudgment').map(probe => ({ capture: true, ...probe })),
    active('衡平推裁持续伤害', { ...inputs('neuvillette.legalEvaluationOrEquitableJudgment', true), hitId: 'neuvillette.normal.param5' }),
    inactive('普通重击', { ...inputs('neuvillette.legalEvaluationOrEquitableJudgment', false), hitId: 'neuvillette.normal.param4' }),
  ], { id: 'neuvillette.c1.equitable-judgment-poise', resolved: '诉论心证蓄力或衡平推裁的动作有效状态中，自身受削韧倍率为0。',
    remaining: '仍需把蓄力起手、吸收源水之滴、转入持续攻击与收招的实际动作帧接到受击时刻。' });
  check('varesa', 'c2', 1, 0, [...confirmedWindow('varesa.specialBurstReady'),
    inactive('仅有炽热激情', { ownerFacts: { 'varesa.specialBurstReady': false, 'varesa.fieryPassion': true } }),
  ], { id: 'varesa.c2.limit-drive-poise', resolved: '二命处于有效极限驱动状态时，自身受削韧倍率为0。',
    remaining: '仍需实际下落动作结束时刻、特殊爆发或战技移除极限驱动的事件记录。' });

  const samples = (enabled, nearby = true) => ({ ...inputs('xilonen.sourceSamplesActive', enabled),
    recipientFacts: { 'xilonen.c1.nearbySampleRecipient': nearby } });
  check('xilonen', 'c1', 0, 0, [active('自身在场', samples(true)), active('范围内的在场队友', { ...samples(true), recipient: 'peer' }),
    inactive('源音采样未激活', samples(false)), inactive('在范围外', samples(true, false)),
    inactive('场下队友', { ...samples(true), recipient: 'peer', recipientFacts: { 'xilonen.c1.nearbySampleRecipient': true, onField: false } }),
    inactive('零命', { ...samples(true), constellation: 0 }), unknown('距离条件未知', samples(true, null)),
  ], { id: 'xilonen.c1.active-samples-poise', resolved: '源音采样激活且场上角色在有效范围内时，受削韧倍率为0.5。',
    remaining: '仍需复现探测刷新间隔、出入范围的残留时长及联机受益范围。' });

  const sealEntry = evidence.entries.yanfei.c1;
  const caps = sealEntry.baseSealCap.value + parameter(sealEntry.sealCapOverride, sealEntry.sealCapParameters);
  const sealHit = seals => 'yanfei.normal.param' + Number(sealEntry.hitParameters[seals].value.paramDelta.slice(1));
  for (let seals = 1; seals <= caps; seals++) {
    if (!sealEntry.hitParameters[seals].value.paramSpecial.endsWith('Lv0' + seals)) throw new Error('丹火印档位来源错误。');
    check('yanfei', 'c1', seals - 1, 0, [active(seals + '枚丹火印', { hitId: sealHit(seals), constellation: seals === 4 ? 6 : 1 }),
      inactive('无丹火印', { hitId: sealHit(0) }), inactive('普通攻击'),
      inactive('未解锁本档', { hitId: sealHit(seals), constellation: seals === 4 ? 5 : 0 }),
    ], { seals, id: 'yanfei.c1.charged-poise.' + seals, ...(seals !== caps ? {} : {
      resolved: '按重击丹火印档位读取 1 − 0.1 × 印数的受削韧倍率，第四枚限六命。',
      remaining: '仍需按蓄力和咏唱动作捕获丹火印实际数量与受击时刻。',
    }) });
  }

  for (const entity of ['aether-geo', 'lumine-geo']) {
    const enclosed = value => ({ recipientFacts: { [entity + '.stonewallEnclosed']: value } });
    const twin = entity === 'aether-geo' ? 'lumine-geo' : 'aether-geo';
    const stackKey = 'lisa.holdingVioletArc';
    const lisa = multiplier(evidence.entries.lisa.c2);
    check(entity, 'c1', 1, 0, [active('旅行者在自己的岩嶂中', enclosed(true)),
      active('队友在岩嶂内', { ...enclosed(true), recipient: 'peer' }), inactive('队友在岩嶂外', { ...enclosed(false), recipient: 'peer' }),
      inactive('零命', { ...enclosed(true), constellation: 0 }), unknown('队友是否在岩嶂内未知', { ...enclosed(null), recipient: 'peer' }),
      active('与队友自身抗打断倍率相乘', { recipient: 'peer', peer: 'lisa', peerConstellation: 2,
        recipientFacts: { [entity + '.stonewallEnclosed']: true, [stackKey]: true }, otherMultiplier: lisa }),
      unknown('双岩主岩嶂重叠，覆盖顺序未知', { contributes: true, peer: twin, peerConstellation: 1,
        recipientFacts: { [entity + '.stonewallEnclosed']: true, [twin + '.stonewallEnclosed']: true } }),
    ], { id: entity + '.c1.stonewall-poise', sources: evidence.interpretation.stacking.evidence,
      resolved: '岩嶂所覆盖的队员获得受削韧倍率0.7，与另一独立能力给予的倍率相乘。',
      remaining: '仍需记录岩嶂位置、存在区间及同类重叠领域；实际打断还需要来伤削韧和动作阶段。' });
  }

  return { rows, verified, resolved, gaps, summary: { characterInterruptionResistanceCases: rows.length,
    characterInterruptionResistanceMismatches: rows.filter(row => row.issue).length, verifiedCharacterInterruptionResistance: verified.size } };
}
