import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const chinese = capture + 'ChineseSimplified/';
const talentValues = capture + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const normal = 'attribute.normalAttackSpeed';
const charged = 'attribute.chargedAttackSpeed';
const movement = 'attribute.movementSpeed';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const flag = value => value === null ? fact(null) : bool(value);
const scope = id => ({ kind: 'actor', id });
const switchIn = (actor, timeMs) => ({ actor, timeMs, kind: 'state-change', fieldSwitch: { crit: null, reaction: null } });
const cast = (actor, timeMs, skillId, facts) => ({ actor, timeMs, kind: 'action', skillId, facts });
const amount = (text, pattern, unit = 1) => {
  const value = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(value)) throw new Error('固定原文缺少攻速参数 ' + pattern.source);
  return value / unit;
};

export const combatSpeedIds = ['aratakiitto', 'chongyun', 'cyno', 'jean', 'kaveh', 'mika', 'shikanoinheizou', 'yunjin'];
export const combatSpeedPeerIds = ['amber', 'kaeya', 'lisa', 'xiangling'];

/** Check each named effect and its actual calculation output using the captured descriptions and real hit IDs. */
export function auditCombatSpeedClauses(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(entry => [entry.id, entry]));
  const weapons = new Map(entities.weapons.map(entry => [entry.id, entry]));
  const prepared = new Map();

  function team(entity, recipient, ascension, constellation, events) {
    const members = [...new Set([entity, recipient, ...events.map(event => event.actor)])];
    const key = JSON.stringify([members, ascension, constellation]);
    if (!prepared.has(key)) {
      const actors = members.map(id => {
        const character = characters.get(id);
        const weapon = character && weapons.get(novice[character.identity.weaponType]);
        if (!weapon) throw new Error('攻速验算缺少角色或入门武器 ' + id);
        const build = auditBuild(character, weapon);
        if (id === entity) Object.assign(build, { ascension, constellation,
          level: ascension === 0 ? 1 : character.progression.promotion[ascension - 1].maxLevel });
        return { id, build };
      });
      const result = engine.prepareStructuredBuilds(actors);
      if (!result.ok) throw new Error(entity + ': ' + JSON.stringify(result.diagnostics));
      prepared.set(key, { team: result.team, actors });
    }
    return prepared.get(key);
  }

  function check(entity, field, sources, probes, outputs) {
    for (const probe of probes) {
      const { ascension = 0, constellation = 0, recipient = entity, category = 'normal', hitId, timeMs = 1,
        ownerFacts, recipientFacts, query, events = [], timeline = false } = probe;
      if (!characters.has(recipient)) throw new Error('攻速验算缺少受益队员 ' + recipient);
      const { team: lineup, actors } = team(entity, recipient, ascension, constellation, events);
      const dealer = characters.get(recipient);
      const talents = hitId ? dealer.talents : category === 'normal' || category === 'charged' || category === 'plunge'
        ? [dealer.talents[0]] : dealer.talents.filter(talent => talent.category === category);
      const talent = talents.find(talent => talent.hits.some(hit => hitId ? hit.id === hitId : hit.category === category));
      const hit = talent?.hits.find(hit => hitId ? hit.id === hitId : hit.category === category);
      if (!hit) throw new Error(recipient + ' 缺少指定命中 ' + (hitId ?? category));
      const { setup, request } = auditHit(dealer, talent, hit);
      const initial = request.frame.factOverrides[0];
      const supplier = recipient === entity ? initial : { subject: scope('actor'), facts: {} };
      if (supplier !== initial) {
        request.frame.factOverrides.unshift(supplier);
        initial.subject = scope(recipient);
      }
      setAuditDefaults(characters.get(entity), request.frame);
      supplier.subject = scope(entity);
      initial.subject = scope(recipient);
      Object.assign(supplier.facts, ownerFacts);
      Object.assign(initial.facts, recipientFacts);
      Object.assign(request.frame.facts, query);
      if (timeline) delete supplier.facts['kaveh.painting'];
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
        hit: { skillId: talent.id, hitId: hit.id, element: hit.element, category: hit.category, family: 'ordinary', origin: hit.origin, reactionId: null } };
      for (const event of setup.events) {
        event.actorId = recipient;
        for (const observation of event.subjectFacts ?? []) if (observation.subject.kind === 'actor') observation.subject.id = recipient;
      }
      const anchor = setup.events.find(entry => entry.id === 'hit');
      Object.assign(anchor, { timeMs, order: events.length });
      const records = events.map((record, index) => ({ ...record, id: 'speed-event-' + index, order: index, definition: record.actor }));
      if (timeline) {
        const character = characters.get(entity);
        const project = { schemaVersion: character.schemaVersion, rulesVersion: 'timeline-v1', id: 'combat-speed-audit', revision: '1',
          candidate: { id: 'team', actors: actors.map(({ id, build }) => ({ id, build, character: build.character.id, weapon: build.weapon.id, inputs: {} })) },
          definitions: [], objective: {}, conditions: {}, timeline: [...records,
            { id: 'hit', actor: recipient, timeMs, order: events.length, kind: 'capture', definition: recipient }] };
        const result = engine.projectBuffContext(project);
        if (!result) throw new Error(entity + ': 攻速窗口无法投影');
        anchor.derivedStates = result.events.find(event => event.id === 'hit')?.derivedStates;
        setup.events.unshift(...result.events.filter(event => event.id !== 'hit'));
      } else {
        setup.events.unshift(...records.map(record => engine.projectCalculationEvent(record, actors.find(member => member.id === record.actor)?.build)));
      }
      const bindings = Object.fromEntries(outputs.map(({ attribute }) => [attribute, {
        kind: 'attribute', actor: { role: 'recipient' }, key: ref(attribute), at: { kind: 'current', phase: 'same' },
      }]));
      const context = engine.createStructuredCombatContext(lineup, setup);
      const result = engine.evaluateCombatBindings(lineup.program, context, bindings, frame);
      for (const { attribute, modifier = 0, id, expected } of outputs) {
        const wanted = expected(probe);
        const reading = result.outputs[attribute];
        const status = reading?.state ?? 'missing';
        const value = status === 'known' && reading.value.kind === 'quantity' ? reading.value.value : null;
        const modifierId = id + (modifier ? '.' + modifier : '');
        const effectTraces = result.trace.filter(trace => trace.kind === 'effect' && trace.definition.id === modifierId
          && trace.context?.actorId === entity && trace.context?.recipientId === recipient);
        const contributes = effectTraces.some(trace => trace.state === 'known' && trace.value?.kind === 'quantity' && trace.value.value > 0);
        const passed = wanted === null ? status === 'unknown' : value !== null && Math.abs(value - wanted) < 1e-8 && contributes === (wanted > 0);
        rows.push({ entity, field: field + '/buffs/0/modifiers/' + modifier, modifierId, output: attribute,
          probe: { ...probe, recipient, hitId: hit.id, category: hit.category }, sources, expected: wanted, value, status,
          ...(passed ? {} : { issue: '攻速或移动速度未匹配独立原文预期', diagnostics: result.diagnostics }) });
      }
    }
  }

  function clause(entity, field, details, run) {
    if (!characters.has(entity)) return;
    const [, group, index] = field.split('/');
    const key = (group === 'passives' ? 'passive' : 'c') + (Number(index) + 1);
    const path = chinese + (group === 'passives' ? 'talents/' : 'constellations/') + entity + '.json';
    const sources = [path + '#/' + key + '/description', ...(details.sources ?? [])];
    const start = rows.length;
    run(read(path)[key].description, (probes, ...outputs) => check(entity, field, sources, probes, outputs));
    const samples = rows.slice(start);
    for (const pointer of new Set(samples.map(row => row.field))) {
      const matching = samples.filter(row => row.field === pointer);
      if (matching.some(row => row.expected > 0) && matching.every(row => !row.issue)) verified.add(entity + pointer);
    }
    if (!samples.length || samples.some(row => row.issue)) return;
    const remaining = details.remaining ?? '';
    resolved.push({ entity, field, sources, resolved: details.done, remaining });
    if (remaining) gaps.push({ entity, field, sources, reason: remaining });
    else verified.add(entity + field);
  }
  const cases = (variant, ...categories) => categories.map(category => ({ ...variant, category }));
  const timed = (timeMs, ...events) => ({ timeMs, events });
  const within = (time, start, duration) => time >= start && time < start + duration;

  clause('aratakiitto', '/passives/0', {
    sources: [chinese + 'talents/aratakiitto.json#/combat1', 'https://library.keqingmains.com/characters/geo/itto/#ascension-passives'],
    done: '已输入同一轮此前斩击次数时，荒泷逆袈裟连斩与终结按每次10%、至多30%读重击攻速。',
    remaining: '仍需连续动作的衔接、中断和实际动作帧数。',
  }, (text, verify) => {
    const step = amount(text, /斩击攻击速度提升(\d+)%/, 100), cap = amount(text, /至多提升(\d+)%/, 100);
    const slashes = [6, 7].map(index => 'aratakiitto.normal.param' + index);
    const hitIds = [...slashes, 'aratakiitto.normal.param5', 'aratakiitto.normal.param1', 'aratakiitto.normal.param9'];
    verify([
      ...[0, 1].flatMap(ascension => hitIds.flatMap(hitId => [0, 1, 2, 3, 4, null].map(count => ({
        ascension, hitId, count, query: { 'aratakiitto.priorKesagiriSlashes': count === null ? fact(null) : number('count', count) },
      })))),
      { ascension: 1, recipient: 'kaeya', category: 'charged', count: 3, query: { 'aratakiitto.priorKesagiriSlashes': number('count', 3) } },
    ], { id: 'aratakiitto.a0.kesagiri-speed', attribute: charged,
      expected: ({ ascension, hitId, count }) => !ascension || !slashes.includes(hitId) ? 0 : count === null ? null : Math.min(cap, count * step) });
  });

  clause('chongyun', '/passives/0', {
    sources: ['https://keqingmains.com/q/chongyun-quickguide/#talents'],
    done: '确认领域位置后，8%普攻攻速仅授予领域内单手剑、双手剑和长柄武器队员。',
    remaining: '领域位置由受益队员输入，实际进出及空间判定仍需记录。',
  }, (text, verify) => {
    const ratio = amount(text, /普通攻击的攻击速度提升(\d+)%/, 100);
    const eligible = ['chongyun', 'kaeya', 'xiangling'];
    const recipients = [...eligible, 'amber', 'lisa'];
    verify([
      ...recipients.flatMap(recipient => [0, 1].flatMap(ascension => [true, false, null].map(inside => ({
        ascension, recipient, inside, recipientFacts: { 'chongyun.insideFrostField': flag(inside) },
        ...(recipient !== 'chongyun' && { ownerFacts: { 'chongyun.insideFrostField': bool(!inside) } }),
      })))),
      ...cases({ ascension: 1, recipient: 'kaeya', inside: true, recipientFacts: { 'chongyun.insideFrostField': bool(true) } },
        'charged', 'plunge', 'skill', 'burst'),
    ], { id: 'chongyun.a0.frost-field-speed', attribute: normal,
      expected: ({ ascension, recipient, category = 'normal', inside }) => !ascension || category !== 'normal' || !eligible.includes(recipient) || inside === false
        ? 0 : inside === null ? null : ratio });
  });

  clause('cyno', '/constellations/0', {
    sources: [chinese + 'talents/cyno.json#/passive1/description', 'https://library.keqingmains.com/characters/electro/cyno#constellations'],
    done: '解锁落羽的裁择后，爆发提供10秒20%普攻攻速，已记录的裁定战技刷新时长，叠加仍为20%。',
    remaining: '末途真眼的自动开启、特殊状态与换人中断需要对应的动作记录。裁定战技伤害与渡荒之雷分别验算。',
  }, (text, verify) => {
    const ratio = amount(text, /普通攻击的攻击速度提升(\d+)%/, 100);
    const duration = amount(text, /持续(\d+)秒/) * 1000;
    const burst = cast('cyno', 0, 'cyno.burst');
    const refresh = value => cast('cyno', 8000, 'cyno.skill', { 'cyno.endseer': flag(value) });
    const settings = { ascension: 1, constellation: 1, hitId: 'cyno.burst.param1' };
    const probe = (expected, timeMs, ...events) => ({ ...settings, expected, ...timed(timeMs, ...events) });
    verify([
      probe(0, 1), probe(ratio, 0, burst), probe(ratio, duration - 1, burst), probe(0, duration, burst),
      probe(ratio, 9000, burst, refresh(true)), probe(ratio, duration, burst, refresh(true)), probe(ratio, 7999 + duration, burst, refresh(true)),
      probe(0, 8000 + duration, burst, refresh(true)), probe(0, duration, burst, refresh(false)),
      probe(0, duration, burst, cast('cyno', 8000, 'cyno.skill')), probe(null, duration, burst, refresh(null)),
      { ...probe(0, 1, burst), ascension: 0 }, { ...probe(0, 1, burst), constellation: 0 },
      { ...probe(0, 1, burst), recipient: 'kaeya', hitId: undefined },
      { ...probe(0, 1, cast('kaeya', 0, 'cyno.burst')) },
      ...cases({ ...probe(0, 1, burst), hitId: undefined }, 'charged', 'plunge', 'skill'),
      { ...probe(0, 1, burst), hitId: 'cyno.burst.param7' },
    ], { id: 'cyno.c1.unceasing-vigil-speed', attribute: normal, expected: probe => probe.expected });
  });

  clause('kaveh', '/constellations/1', {
    sources: [chinese + 'talents/kaveh.json#/combat3', talentValues + '#/kaveh/combat3/param2'],
    done: '复用繁绘隅穹状态，期间仅卡维普攻获得15%攻速，离场或持续时间到期后失效。',
  }, (text, verify) => {
    const ratio = amount(text, /普通攻击的攻击速度提升(\d+)%/, 100);
    const duration = read(talentValues).kaveh.combat3.param2[0] * 1000;
    const active = { constellation: 2, ownerFacts: { 'kaveh.painting': bool(true) } };
    verify([
      ...cases(active, 'normal', 'charged', 'plunge', 'skill', 'burst'),
      { ...active, recipient: 'kaeya' }, { ...active, constellation: 1 },
      ...[false, null].map(state => ({ constellation: 2, state, ownerFacts: { 'kaveh.painting': flag(state) } })),
      ...[0, duration - 1, duration].map(timeMs => ({ constellation: 2, timeline: true, state: timeMs < duration,
        ...timed(timeMs, cast('kaveh', 0, 'kaveh.burst')) })),
      { constellation: 2, timeline: true, state: false, recipient: 'kaeya',
        ...timed(4001, cast('kaveh', 0, 'kaveh.burst'), switchIn('kaeya', 4000)) },
      { constellation: 2, timeline: true, state: false,
        ...timed(4002, cast('kaveh', 0, 'kaveh.burst'), switchIn('kaeya', 4000), switchIn('kaveh', 4001)) },
    ], { id: 'kaveh.c2.painted-dome-speed', attribute: normal,
      expected: ({ constellation, category = 'normal', recipient = 'kaveh', state = true }) =>
        constellation < 2 || category !== 'normal' || recipient !== 'kaveh' || state === false ? 0 : state === null ? null : ratio });
  });

  clause('jean', '/constellations/1', {
    sources: ['https://library.keqingmains.com/characters/anemo/jean#constellations',
      'https://library.keqingmains.com/evidence/general-mechanics/movement-and-physics',
      'https://genshin-impact.fandom.com/wiki/Loading_Screen/Others#Combat'],
    done: '琴已拾取晶球或微粒后，自身与队友获得15秒15%普通攻击速度与15%移动速度，同效果只保留一层。',
    remaining: '拾取可显式确认，目前尚未从微粒和晶球系统自动联动。实际移动时间与攻击帧数待验证。',
  }, (text, verify) => {
    const attackRate = amount(text, /获得(\d+)%攻击速度/, 100), movementRate = amount(text, /和(\d+)%移动速度/, 100);
    const duration = amount(text, /持续(\d+)秒/) * 1000;
    const pickup = (actor, timeMs, occurred = true) => ({ actor, timeMs, kind: 'state-change',
      facts: { 'jean.pickedUpElementalEnergy': flag(occurred) } });
    const good = pickup('jean', 300);
    const active = { constellation: 2, active: true, ...timed(301, good) };
    const expected = probe => probe.constellation === 2 && probe.active !== false ? probe.active === null ? null : 1 : 0;
    verify([
      ...['jean', 'kaeya', 'amber'].flatMap(recipient => cases({ ...active, recipient }, 'normal', 'charged', 'plunge', 'skill', 'burst')),
      { ...active, constellation: 1 }, { ...active, active: false, events: [] },
      { ...active, active: false, recipient: 'kaeya', events: [pickup('kaeya', 300)] },
      { ...active, active: false, events: [pickup('jean', 300, false)] },
      { ...active, active: null, events: [pickup('jean', 300, null)] },
      { ...active, ...timed(300 + duration - 1, good) }, { ...active, active: false, ...timed(300 + duration, good) },
      { ...active, ...timed(800, good, pickup('jean', 700)) },
      { ...active, ...timed(700 + duration - 1, good, pickup('jean', 700)) },
      { ...active, active: false, ...timed(700 + duration, good, pickup('jean', 700)) },
    ], { id: 'jean.c2.peoples-aegis-speed', attribute: normal,
      expected: probe => (probe.category ?? 'normal') === 'normal' ? expected(probe) === null ? null : attackRate * expected(probe) : 0 },
    { id: 'jean.c2.peoples-aegis-speed', modifier: 1, attribute: movement,
      expected: probe => expected(probe) === null ? null : movementRate * expected(probe) });
  });

  clause('shikanoinheizou', '/constellations/0', {
    done: '按实际时间轴登场记录给予鹿野院平藏本人5秒15%普攻攻速，复核10秒再次触发边界与同时间顺序。',
    remaining: '登场获得的一层变格需要与勠心拳层数的状态及消费联动。',
  }, (text, verify) => {
    const ratio = amount(text, /普通攻击的攻击速度提升(\d+)%/, 100);
    const duration = amount(text, /登场后的(\d+)秒内/) * 1000, cooldown = amount(text, /每(\d+)秒最多触发一次/) * 1000;
    const entry = switchIn('shikanoinheizou', 0);
    const reenter = time => switchIn('shikanoinheizou', time);
    const active = { constellation: 1, ...timed(0, entry) };
    verify([
      ...cases({ ...active, expected: 0 }, 'charged', 'plunge', 'skill', 'burst'),
      { ...active, expected: ratio }, { ...active, constellation: 0, expected: 0 },
      { ...active, recipient: 'kaeya', expected: 0 }, { ...active, recipient: 'kaeya', expected: 0, events: [switchIn('kaeya', 0)] },
      { ...active, expected: 0, events: [{ actor: 'shikanoinheizou', kind: 'state-change', timeMs: 0 }] },
      ...[duration - 1, duration, cooldown - 1, cooldown, cooldown + duration - 1, cooldown + duration].map(timeMs => ({
        ...active, ...timed(timeMs, entry, switchIn('kaeya', 2000), reenter(cooldown - 1), reenter(cooldown)),
        expected: within(timeMs, 0, duration) || within(timeMs, cooldown, duration) ? ratio : 0,
      })),
    ], { id: 'shikanoinheizou.c1.field-entry-speed', attribute: normal, expected: probe => probe.expected });
  });

  clause('yunjin', '/constellations/5', {
    sources: [chinese + 'talents/yunjin.json#/combat3/description', 'https://library.keqingmains.com/characters/geo/yunjin/#constellations'],
    done: '复用单个受益队员的飞云旗阵状态，明确仍有生效次数时提供12%普攻攻速。',
    remaining: '当前速率由本次受益旗阵状态输入，从爆发和实际命中驱动攻速失效的联动待验证。',
  }, (text, verify) => {
    const ratio = amount(text, /普通攻击的攻击速度提升(\d+)%/, 100);
    const variant = (recipient, active, constellation = 6) => ({ constellation, recipient, active,
      recipientFacts: { 'yunjin.flagFormation': flag(active) },
      ...(recipient !== 'yunjin' && { ownerFacts: { 'yunjin.flagFormation': bool(!active) } }),
    });
    verify([
      ...['yunjin', 'kaeya', 'amber'].flatMap(recipient => [5, 6].flatMap(rank => [true, false, null].map(active => variant(recipient, active, rank)))),
      ...cases(variant('kaeya', true), 'charged', 'plunge', 'skill', 'burst'),
    ], { id: 'yunjin.c6.flag-formation-speed', attribute: normal,
      expected: ({ constellation, category = 'normal', active }) => constellation < 6 || category !== 'normal' || active === false
        ? 0 : active === null ? null : ratio });
  });

  if (characters.has('mika')) {
    const sources = [chinese + 'constellations/mika.json#/c1/description', talentValues + '#/mika/combat2/param4'];
    if (!/恢复生命值的间隔降低.+等同于灵风状态提供的攻击速度提升比例/.test(read(chinese + 'constellations/mika.json').c1.description)) {
      throw new Error('米卡一命固定原文缺少治疗间隔关系');
    }
    gaps.push({ entity: 'mika', field: '/constellations/0', sources,
      reason: '鹰翎治疗间隔按灵风所提供的攻速比例缩短，需将双状态与战技等级落实到各队员治疗触发间隔。' });
  }
  return { rows, verified, resolved, gaps, summary: { combatSpeedCases: rows.length,
    combatSpeedMismatches: rows.filter(row => row.issue).length, verifiedCombatSpeedFields: verified.size, combatSpeedGaps: gaps.length } };
}
