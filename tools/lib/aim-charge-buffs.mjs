import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const chinese = capture + 'ChineseSimplified/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const text = (type, id, key) => chinese + type + '/' + id + '.json#/' + key + '/description';
const get = (source) => {
  const [path, pointer] = source.split('#/');
  return pointer.split('/').reduce((current, key) => current[key], read(path));
};
const valueOf = (source, pattern) => {
  const value = get(source)?.match(pattern);
  if (!value) throw new Error(source + ': 蓄力参数原文与验算规则不符');
  return Number(value[1]);
};
const duration = (entity, talent, parameter) => capture + 'stats/talents.json#/' + entity + '/' + talent + '/' + parameter + '/0';
const reference = id => ({ namespace: 'builtin', id, revision: '1' });
const ratio = 'attribute.aimChargeTimeReductionRatio';
const milliseconds = 'attribute.aimChargeTimeReductionMs';
const instant = 'attribute.aimChargeInstant';
const perEnergy = 'attribute.aimChargeTimeReductionPerEnergy';
const aim = (id, index) => id + '.normal.param' + index;

export const aimChargeIds = ['diona', 'tighnari', 'ganyu', 'kujousara', 'faruzan', 'chasca', 'yelan', 'sethos', 'linnea'];
export const aimChargePeerIds = ['amber'];

export function auditAimChargeBuffs(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const bow = entities.weapons.find(weapon => weapon.id === 'huntersbow');
  const prepared = new Map();

  function prepare(entity, recipient, ascension, constellation) {
    const key = JSON.stringify([entity, recipient, ascension, constellation]);
    if (prepared.has(key)) return prepared.get(key);
    if (!bow) throw new Error('瞄准蓄力验算缺少猎弓');
    const builds = new Map([...new Set([entity, recipient])].map(id => [id, auditBuild(characters.get(id), bow)]));
    const owner = builds.get(entity);
    Object.assign(owner, { ascension, constellation, level: ascension > 0 ? owner.character.progression.promotion[ascension - 1].maxLevel : 1 });
    const result = engine.prepareStructuredBuilds([...builds].map(([id, build]) => ({ id, build })));
    if (!result.ok) throw new Error(entity + ': ' + JSON.stringify(result.diagnostics));
    const ready = { team: result.team, builds };
    prepared.set(key, ready);
    return ready;
  }

  function check(entity, clause, field, effect, output, sources, cases, description, remaining) {
    for (const { hitId, expected, expectedOutput = expected, label, recipient = entity, ascension = 0, constellation = 0,
      timeMs = 1, casts = [], conditions = {} } of cases) {
      const { team, builds } = prepare(entity, recipient, ascension, constellation);
      const character = characters.get(recipient);
      const talent = character.talents.find(talent => talent.hits.some(hit => hit.id === hitId));
      const hit = talent?.hits.find(hit => hit.id === hitId);
      if (!hit) throw new Error(recipient + ' 缺少瞄准蓄力验算命中 ' + hitId);
      const { setup, request } = auditHit(character, talent, hit);
      for (const [index, event] of setup.events.entries()) {
        event.actorId = recipient;
        for (const row of event.subjectFacts ?? []) if (row.subject.kind === 'actor') row.subject = { kind: 'actor', id: recipient };
        if (event.id === 'hit') Object.assign(event, { timeMs, order: casts.length + index });
        else event.order = casts.length + index;
      }
      for (const observation of request.frame.factOverrides) observation.subject = { kind: 'actor', id: recipient };
      for (const [key, setting] of Object.entries(conditions)) {
        const observation = setting === null ? fact(null) : bool(setting);
        const declaration = characters.get(entity).metadata.facts[key];
        if (declaration.scope === 'query') request.frame.facts[key] = observation;
        else request.frame.factOverrides[0].facts[key] = observation;
      }
      setup.events.unshift(...casts.map(({ actor = entity, ...cast }, order) => engine.projectCalculationEvent({
        ...cast, actor, definition: actor, order, id: 'aim-cast-' + order, kind: 'action',
      }, builds.get(actor))));
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
        hit: { skillId: talent.id, hitId, element: hit.element, category: hit.category, family: 'ordinary', origin: hit.origin, reactionId: null } };
      const context = engine.createStructuredCombatContext(team, setup);
      const result = engine.evaluateCombatBindings(team.program, context, {
        [output]: { kind: 'attribute', actor: { role: 'recipient' }, key: reference(output), at: { kind: 'current', phase: 'same' } },
      }, frame);
      const contribution = result.trace.find(trace => trace.kind === 'effect' && trace.definition.id === effect
        && trace.context?.actorId === entity && trace.context?.recipientId === recipient);
      const reading = result.outputs[output];
      const status = reading?.state ?? 'missing';
      const actualOutput = numeric(reading);
      const value = contribution ? numeric(contribution) : 0;
      const matches = (actual, target) => target === null ? actual === null : typeof actual === 'number' && Math.abs(actual - target) < 1e-8;
      const passed = matches(value, expected) && matches(actualOutput, expectedOutput) && status === (expectedOutput === null ? 'unknown' : 'known');
      rows.push({ entity, clause, field, effect, output, sources, expected, value, expectedOutput, actualOutput, status,
        probe: { label, recipient, hitId, ascension, constellation, timeMs, casts, conditions },
        ...(passed ? {} : { issue: '瞄准蓄力贡献或属性读数未匹配原文预期', diagnostics: result.diagnostics }) });
    }
    const samples = rows.filter(row => row.entity === entity && row.field === field);
    if (!samples.some(row => row.expected > 0) || samples.some(row => row.issue)) return;
    verified.add(entity + field);
    resolved.push({ entity, field: clause, sources, resolved: description, remaining });
    if (remaining) gaps.push({ entity, field: clause, sources, reason: remaining });
    else verified.add(entity + clause);
  }

  const fields = (clause, buff = 0, modifier = 0) => [clause, clause + '/buffs/' + buff + '/modifiers/' + modifier];
  const casesForWindow = ({ entity, skill, hitId, other, key, unlock, window, benefit, peer = false }) => {
    const cast = (timeMs = 0) => ({ skillId: skill, timeMs });
    const facts = value => ({ conditions: { [key]: value } });
    const run = (label, timeMs, expected, options = {}) => ({ label, hitId, ...unlock, timeMs, expected,
      casts: [cast()], ...facts(true), ...options });
    return [
      run('施放前', 0, 0, { casts: [] }), run('同刻先施放', 0, benefit), run('持续窗口内最后一毫秒', window - 1, benefit),
      run('窗口结束', window, 0), run('合格次数或位置条件不满足', 1, 0, facts(false)),
      run('当次条件未知', 1, null, facts(null)), run('重新施放后', window + 1, benefit, { casts: [cast(), cast(window)] }),
      ...Object.entries(unlock).map(([key, value]) => run('尚未解锁', 1, 0, { [key]: value - 1 })),
      ...other.map(hitId => run('其他命中', 1, 0, { hitId })),
      ...(peer ? [run('队友瞄准', 1, 0, { recipient: 'amber', hitId: aim('amber', 7) })] : []),
    ];
  };

  if (characters.has('diona')) {
    const source = text('constellations', 'diona', 'c4');
    const durationSource = duration('diona', 'combat3', 'param7');
    const benefit = valueOf(source, /蓄力时间减少(\d+)%/) / 100;
    check('diona', ...fields('/constellations/3'), 'diona.c4.signature-mix-aim', ratio, [source, durationSource], casesForWindow({
      entity: 'diona', skill: 'diona.burst', hitId: aim('diona', 8), other: [aim('diona', 7), aim('diona', 1), 'diona.burst.param1'],
      key: 'diona.signatureMixArea', unlock: { constellation: 4 }, window: get(durationSource) * 1000, benefit, peer: characters.has('amber'),
    }), '施放最烈特调后的领域存续期间，迪奥娜本人在领域内的满蓄力瞄准缩短60%。', '领域位置由当次事实确认。');
  }

  if (characters.has('tighnari')) {
    const source = text('talents', 'tighnari', 'combat2');
    const durationSource = duration('tighnari', 'combat2', 'param3');
    const c6Source = text('constellations', 'tighnari', 'c6');
    const benefit = valueOf(source, /蓄力时间减少([\d.]+)秒/) * 1000;
    const shots = valueOf(source, /发射(\d+)次花筥箭/);
    const constellationBenefit = valueOf(c6Source, /蓄力时间减少([\d.]+)秒/) * 1000;
    const hitId = aim('tighnari', 7), key = 'tighnari.vijnanaSuffusionShot';
    const cast = { skillId: 'tighnari.skill', timeMs: 0 };
    const other = [aim('tighnari', 6), aim('tighnari', 8), aim('tighnari', 1)];
    const current = Array.from({ length: shots + 1 }, (_, index) => ({ label: '当次为战技后的第' + (index + 1) + '发花筥箭',
      hitId, casts: [cast], conditions: { [key]: index < shots }, expected: index < shots ? benefit : 0 }));
    check('tighnari', ...fields('/talents/1'), 'tighnari.skill.vijnana-suffusion-aim', milliseconds, [source, durationSource], [
      ...casesForWindow({ entity: 'tighnari', skill: cast.skillId, hitId, other,
        key, unlock: {}, window: get(durationSource) * 1000, benefit }), ...current,
      { ...current[0], label: '六命同时提供独立缩短量', constellation: 6, expectedOutput: benefit + constellationBenefit },
    ], '最近一次战技的通塞识窗口内，确认是前三发的花筥箭读取2.4秒缩短量。', '实际发射次数由当次事实确认。');
    check('tighnari', ...fields('/constellations/5'), 'tighnari.c6.wreath-arrow-aim', milliseconds, [c6Source], [
      { label: '解锁六命', hitId, constellation: 6, expected: constellationBenefit },
      { label: '尚未解锁', hitId, constellation: 5, expected: 0 },
      ...other.map(hitId => ({ label: '其他命中', hitId, constellation: 6, expected: 0 })),
      { ...current[0], label: '六命和通塞识各自读取明示缩短量', constellation: 6, expected: constellationBenefit, expectedOutput: benefit + constellationBenefit },
    ], '六命花筥箭读取0.9秒缩短量。', '数值为明示缩短量，组合的最终蓄力时间仍缺独立记录。');
  }

  if (characters.has('ganyu')) {
    const source = text('constellations', 'ganyu', 'c6');
    const window = valueOf(source, /后(\d+)秒内的第一次霜华矢，无需蓄力/) * 1000;
    check('ganyu', ...fields('/constellations/5'), 'ganyu.c6.frostflake-aim', instant, [source], casesForWindow({
      entity: 'ganyu', skill: 'ganyu.skill', hitId: aim('ganyu', 9), other: [aim('ganyu', 8), aim('ganyu', 10), aim('ganyu', 1)],
      key: 'ganyu.c6FirstFrostflakeArrow', unlock: { constellation: 6 }, window, benefit: 1, peer: characters.has('amber'),
    }), '确认是最近一次战技后30秒内首发霜华矢时，本次免蓄力。', '发射后消耗由当次事实确认。');
  }

  if (characters.has('kujousara')) {
    const source = text('talents', 'kujousara', 'passive1');
    const skillSource = text('talents', 'kujousara', 'combat2');
    const benefit = valueOf(source, /蓄力时间减少(\d+)%/) / 100;
    const window = valueOf(skillSource, /持续(\d+)秒的「乌羽护持」/) * 1000;
    check('kujousara', ...fields('/passives/0'), 'kujousara.a1.crowfeather-aim', ratio, [source, skillSource], casesForWindow({
      entity: 'kujousara', skill: 'kujousara.skill', hitId: aim('kujousara', 7), other: [aim('kujousara', 6), aim('kujousara', 1), 'kujousara.skill.param1'],
      key: 'kujousara.crowfeatherCoverShot', unlock: { ascension: 1 }, window, benefit,
    }), '战技后18秒内，确认仍可消耗乌羽护持的满蓄力箭缩短60%。', '发射后消耗由当次事实确认。');
  }

  if (characters.has('faruzan')) {
    const source = text('talents', 'faruzan', 'passive1');
    const skillSource = text('talents', 'faruzan', 'combat2');
    const c1Source = text('constellations', 'faruzan', 'c1');
    const durationSource = duration('faruzan', 'combat2', 'param4');
    const benefit = valueOf(source, /蓄力时间减少(\d+)%/) / 100;
    const arrowLimit = valueOf(c1Source, /释放(\d+)枚「飓烈箭」/);
    const cast = { skillId: 'faruzan.skill', timeMs: 0 };
    const hitId = 'faruzan.skill.hurricane-arrow', key = 'faruzan.hurricaneArrow';
    const shot = (constellation, index, active) => ({ label: constellation + '命本轮第' + index + '发', ascension: 1, constellation,
      hitId, casts: [cast], conditions: { [key]: active }, expected: active ? benefit : 0 });
    check('faruzan', ...fields('/passives/0', 1), 'faruzan.a1.hurricane-aim', ratio, [source, skillSource, c1Source, durationSource], [
      ...casesForWindow({ entity: 'faruzan', skill: cast.skillId, hitId, other: [aim('faruzan', 6), 'faruzan.skill.param2', aim('faruzan', 1)],
        key, unlock: { ascension: 1 }, window: get(durationSource) * 1000, benefit }),
      shot(0, 2, false), ...Array.from({ length: arrowLimit + 1 }, (_, index) => shot(1, index + 1, index < arrowLimit)),
    ], '疾风示现窗口内，确认占有效次数的飓烈箭缩短60%。一命将当轮可用发数增至二。', '发数由当次事实确认，风压坍陷的伤害和诡风之祸另行验证。');
  }

  if (characters.has('chasca')) {
    const source = text('constellations', 'chasca', 'c6');
    const window = valueOf(source, /接下来的(\d+)秒内.+会立即完成蓄力/);
    const first = { label: '转化后窗口内的首次长按', ascension: 1, constellation: 6, hitId: 'chasca.skill.param3',
      conditions: { 'chasca.fatalRounds': true }, expected: 1 };
    check('chasca', ...fields('/constellations/5', 0, 1), 'chasca.c6.fatal-round-crit.1', instant, [source], [
      first, { ...first, hitId: 'chasca.skill.param4' },
      ...['chasca.skill.param2', aim('chasca', 6), 'chasca.burst.param1'].map(hitId => ({ ...first, label: '其他命中', hitId, expected: 0 })),
      { ...first, label: '尚未解锁天赋', ascension: 0, expected: 0 }, { ...first, label: '尚未解锁六命', constellation: 5, expected: 0 },
      ...['窗口已过', '前一轮已消费', '未获命袭'].map(label => ({ ...first, label, conditions: { 'chasca.fatalRounds': false }, expected: 0 })),
      { ...first, label: '命袭未知', conditions: { 'chasca.fatalRounds': null }, expected: null },
    ], '确认获得命袭后' + window + '秒内首次长按多重瞄准时，本轮免蓄力。', '常驻缩时无具体数值。附灵转化、刷新间隔与多重瞄准消耗由当次事实确认。');
  }

  if (characters.has('yelan')) {
    const source = text('talents', 'yelan', 'combat1');
    const skillSource = text('talents', 'yelan', 'combat2');
    const benefit = valueOf(source, /蓄力时间减少(\d+)%/) / 100;
    const first = { label: '消耗破局状态', hitId: aim('yelan', 7), conditions: { 'yelan.breakthroughBarbShot': true }, expected: benefit };
    check('yelan', ...fields('/talents/0'), 'yelan.breakthrough-aim', ratio, [source, skillSource], [
      first, { ...first, label: '状态已用完', conditions: { 'yelan.breakthroughBarbShot': false }, expected: 0 },
      { ...first, label: '战技后是否获得状态未知', conditions: { 'yelan.breakthroughBarbShot': null }, expected: null },
      ...[aim('yelan', 6), aim('yelan', 1), 'yelan.c6.mastermind-barb'].map(hitId => ({ ...first, label: '其他命中', hitId, constellation: 6, expected: 0 })),
    ], '确认破局状态用于本发破局矢时，满蓄力瞄准缩短80%。', '脱战、战技概率和发射消耗通过当次事实确认。');
  }

  if (characters.has('sethos')) {
    const source = text('talents', 'sethos', 'passive1');
    const benefit = valueOf(source, /每1点当前元素能量都将使蓄力时间减少([\d.]+)秒/) * 1000;
    const floor = valueOf(source, /蓄力时间降低至([\d.]+)秒/);
    const cap = valueOf(source, /并计入(\d+)点元素能量/);
    check('sethos', ...fields('/passives/0'), 'sethos.a1.black-kite-aim-rate', perEnergy, [source], [
      ...[aim('sethos', 6), aim('sethos', 7)].flatMap(hitId => [0, 1].map(ascension => ({
        label: ascension ? '受天赋影响的蓄力箭' : '尚未解锁', hitId, ascension, expected: ascension ? benefit : 0,
      }))),
      ...[aim('sethos', 5), aim('sethos', 1), 'sethos.burst.dusk-bolt-1'].map(hitId => ({ label: '其他命中', hitId, ascension: 1, expected: 0 })),
    ], '两阶瞄准箭每点计入能量缩短' + benefit / 1000 + '秒，上限' + cap + '点，蓄力时间最低' + floor + '秒。',
    '实际计入能量、最低蓄力限制和最终时间仍需各蓄力档的基础时长与发射观察。');
  }

  if (characters.has('linnea')) {
    const source = text('talents', 'linnea', 'passive4');
    if (!/蓄力时间大幅减少/.test(get(source))) throw new Error(source + ': 缺少快捷矢蓄力原文');
    gaps.push({ entity: 'linnea', field: '/passives/3', sources: [source], reason: '脱战快捷矢的蓄力缩短仅有定性描述，尚无可复核的秒数或比例。' });
  }

  return { rows, verified, resolved, gaps, summary: { aimChargeCases: rows.length,
    aimChargeMismatches: rows.filter(row => row.issue).length, verifiedAimChargeFields: verified.size, aimChargeGaps: gaps.length } };
}

const numeric = reading => reading?.state === 'known' && reading.value?.kind === 'quantity' ? reading.value.value : null;
