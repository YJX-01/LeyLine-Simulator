import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number } from './roster-audit-settings.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const ratesPath = sourceRoot + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const attribute = 'attribute.directEnergyRestored';
const binding = { kind: 'attribute', actor: { role: 'recipient' }, key: { namespace: 'builtin', id: attribute, revision: '1' },
  at: { kind: 'current', phase: 'same' } };
const energy = value => number('energy', value);
const count = value => number('count', value);
const mode = value => fact({ kind: 'enum', value });
const self = 'owner', others = 'others', everyone = 'everyone', onField = 'onField', electro = 'electro';
const pathTo = { c: 'constellations', p: 'passives', t: 'talents' };
const sourceSlot = { c: rank => 'c' + rank, p: index => 'passive' + (index + 1), t: index => 'combat' + (index + 1) };
const keyFor = (id, slot, suffix = '') => id + '.directEnergy.' + slot + suffix;
const travelerSource = id => id.replace(/^(?:aether|lumine)-/, 'traveler');

// Fixed values are transcribed from the cited game strings. Each row certifies only its energy output.
const fixed = [
  ['aino', 'c4', 10], ['albedo', 'c1', 1.2], ['alyosha', 'c1', 15], ['arlecchino', 'c4', 15],
  ['barbara', 'c1', 1], ['charlotte', 'c4', 2], ['chasca', 'c4', 1.5],
  ['chevreuse', 'c1', 6, { recipient: others, factScope: 'recipient', ascension: 1, field: true }],
  ['chongyun', 'c4', 1], ['citlali', 'c4', 8],
  ['columbina', 'c1', 6, { recipient: onField, moonsign: true, field: true }], ['columbina', 'c4', 4],
  ['cyno', 'c4', 3, { recipient: others }], ['dahlia', 'c1', 2.5], ['dehya', 'c4', 1.5], ['diona', 'c1', 15],
  ['escoffier', 'c4', 2, { ascension: 4 }], ['flins', 'c1', 8], ['furina', 'c4', 4], ['gaming', 'c4', 2],
  ['ganyu', 'c1', 2], ['iansan', 'c1', 15], ['ifa', 'c1', 6], ['illuga', 'c1', 12],
  ['jahoda', 'c4', 4], ['jahoda', 't1', 2, { moonsign: true }], ['kachina', 'c1', 3],
  ['kaeya', 'c6', 15], ['kinich', 'c4', 5], ['klee', 'p1', 2, { recipient: everyone }], ['klee', 'c6', 3, { recipient: others }],
  ['lauma', 'c4', 4], ['layla', 'c2', 1], ['lohen', 'c4', 15], ['lyney', 'p0', 3], ['mika', 'c4', 3], ['mitya', 'c1', 10],
  ['mualani', 'c4', 8, { ascension: 1 }], ['nilou', 'c4', 15], ['ororon', 'c4', 8], ['prune', 'c1', 2],
  ['qiqi', 'c1', 2], ['rosaria', 'c4', 5], ['sangonomiyakokomi', 'c4', 0.8], ['sayu', 'c4', 1.2],
  ['tartaglia', 'c2', 4], ['thoma', 'c4', 15], ['varesa', 'c2', 11.5], ['varesa', 'c6', 30], ['wanderer', 'p0', 0.8],
  ['xilonen', 'c2', 25, { recipient: electro }], ['xingqiu', 'c6', 3], ['yaemiko', 'c1', 8], ['yaoyao', 'c2', 3],
  ['yumemizukimizuki', 'c4', 5], ['zibai', 'p3', 1],
  ...['aether', 'lumine'].flatMap(id => [
    [id + '-cryo', 'c1', 5], [id + '-dendro', 'c1', 3.5], [id + '-hydro', 'c1', 2, { ascension: 1 }],
    [id + '-pyro', 'p1', 5, { suffix: '.flame' }], [id + '-pyro', 'p1', 4, { suffix: '.nightsoul' }],
    [id + '-electro', 'c6', 1, { recipient: onField, field: true, facts: [{ key: keyFor(id + '-electro', 't2'), value: bool(true) }] }],
  ]),
];
const curves = [
  ['dori', 't2', 'param4', /元素能量恢复/, { recipient: everyone, factScope: 'recipient' }],
  ['durin', 't1', 'param5', /元素能量恢复/], ['sethos', 't1', 'param2', /恢复元素能量/],
  ['tartaglia', 't2', 'param4', /技能返还元素能量（远程）/],
  ...['aether', 'lumine'].flatMap(name => {
    const id = name + '-electro';
    return [
      [id, 't1', 'param2', /元素能量恢复/, { recipient: everyone, factScope: 'recipient' }],
      [id, 't2', 'param3', /元素能量恢复/, { recipient: onField, field: true }],
      [id, 'c4', 'param2', /元素能量恢复/, { skillSlot: 't1', recipient: everyone, factScope: 'recipient', facts: [
        { key: keyFor(id, 't1'), subject: 'recipient', value: bool(true) },
      ] }],
    ];
  }),
];

// The raw terms in these rows are source-derived input quantities, never observed battle logs.
const counts = [
  ['barbara', 'c4', 'barbara.energyChargedTargets', 1, 5], ['lisa', 'c1', 'lisa.energyHoldTargets', 2, 10],
  ['navia', 'c1', 'navia.energyShardsConsumed', 3, 9],
  ['aether-geo', 'c4', 'aether-geo.energyShockwaveTargets', 5, 25], ['lumine-geo', 'c4', 'lumine-geo.energyShockwaveTargets', 5, 25],
];
const modes = [
  ['freminet', 'c2', [['零至三阶', 2], ['四阶', 3]]],
  ['shikanoinheizou', 'c4', [['首次爆发', 9], ['同一聚风蹴内随后爆发', 1.5]]],
  ['kaedeharakazuha', 'c4', [['点按千早振', 3], ['长按千早振', 4], ['滑翔满一秒', 2]], 45],
];
const remaining = [
  { entity: 'valeriy', field: '/constellations/0/buffs/0/modifiers/0', reason: '消耗大于40且小于100点冲击势能时，非整10点档位的回能计算规则仍需原始配置或游戏观测。' },
];

function source(id, slot) {
  const rank = Number(slot[1]), kind = slot[0], index = rank - (kind === 'c'), field = '/' + pathTo[kind] + '/' + index;
  const file = sourceRoot + 'ChineseSimplified/' + (kind === 'c' ? 'constellations' : 'talents') + '/' + travelerSource(id) + '.json';
  const anchor = sourceSlot[kind](rank);
  return { field, index, path: file + '#' + anchor, entry: read(file)[anchor], anchor };
}

/** Compare independent game strings and talent tables with the current, explicitly confirmed energy grant. */
export function auditCurrentEnergyGrants(entities, engine) {
  const rows = [], verified = new Set(), clauses = new Map();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const starterAvailable = id => characters.has(id) && starter(characters.get(id));
  const gaps = remaining.filter(({ entity }) => characters.has(entity));
  const peerName = ['kaeya', 'amber', 'lisa'].find(starterAvailable);
  if (!peerName) return { rows, verified, summary: { currentEnergyCases: 0, currentEnergyMismatches: 0, verifiedEnergyClauses: 0 }, gaps };
  const rates = read(ratesPath);
  const minLevel = [1, 20, 40, 50, 60, 70, 80];
  function verify(id, slot, options, probes) {
    if (!starterAvailable(id)) return;
    const info = source(id, slot), sources = [info.path, ...options.sources ?? []];
    const character = characters.get(id), constellation = slot[0] === 'c' ? Number(slot[1]) : 0;
    const buffId = keyFor(id, slot, options.suffix), peer = peerName === id ? 'amber' : peerName;
    const buffIndex = character.metadata[pathTo[slot[0]]][info.index].buffs?.findIndex(buff => buff.id === buffId) ?? -1;
    const field = buffIndex < 0 ? info.field : info.field + '/buffs/' + buffIndex;
    const fieldKey = id + field;
    const grade = clauses.get(fieldKey) ?? { checks: 0, failures: 0 };
    clauses.set(fieldKey, grade);
    const ascension = options.ascension ?? (slot[0] === 'p' ? character.passives[Number(slot[1])].unlockAscension ?? 0 : 0);
    if (!starterAvailable(peer)) return;
    const prepared = new Map();
    function check({ expected, recipient = 'actor', active = true, application = true, facts = [], level, locked, peers = [peer], label }) {
      const rank = locked === 'constellation' ? constellation - 1 : constellation;
      const asc = locked === 'ascension' ? ascension - 1 : level ? 6 : ascension;
      const cacheKey = JSON.stringify([rank, asc, level, peers]);
      let team = prepared.get(cacheKey);
      const party = [character, ...peers.map(name => characters.get(name))];
      if (!team) {
        const composition = party.map((member, index) => ({ id: index ? 'peer' + index : 'actor', build: auditBuild(member, starter(member)) }));
        Object.assign(composition[0].build, { constellation: rank, ascension: asc, level: minLevel[asc],
          ...level && { talents: { normal: 1, skill: level, burst: level } } });
        const compiled = engine.prepareStructuredBuilds(composition);
        if (!compiled.ok) throw new Error(id + ' ' + slot + ': ' + JSON.stringify(compiled.diagnostics));
        team = compiled.team;
        prepared.set(cacheKey, team);
      }
      const talent = character.talents[0], hit = talent.hits[0];
      const { setup, request } = auditHit(character, talent, hit);
      const { frame } = request;
      frame.ownerId = 'actor';
      frame.recipientId = recipient;
      frame.contributorId = null;
      frame.hit = null;
      frame.factOverrides = [];
      frame.facts = {};
      const flags = [
        ...(active === null ? [] : [{ key: buffId, subject: options.factScope, value: bool(active) }]),
        ...(options.field ? [{ key: 'onField', subject: 'recipient', value: bool(true) }] : []),
        ...(options.moonsign ? [{ key: 'fullMoonsign', subject: 'team', value: bool(true) }] : []),
        ...options.facts ?? [], ...facts,
      ];
      for (const { key, subject = 'owner', value } of flags) {
        if (key === 'audit.energyRecharge') continue;
        if (subject === 'query') frame.facts[key] = value;
        else {
          const target = subject === 'team' ? { kind: 'team' } : { kind: 'actor', id: subject === 'recipient' ? recipient : subject === 'owner' ? 'actor' : subject };
          let row = frame.factOverrides.find(row => row.subject.kind === target.kind && row.subject.id === target.id);
          if (!row) frame.factOverrides.push(row = { subject: target, facts: {} });
          row.facts[key] = value;
        }
      }
      const context = engine.createStructuredCombatContext(team, setup);
      const receiver = context.actors.find(member => member.id === recipient);
      frame.applications = party.flatMap((member, index) => {
        const owner = context.actors[index];
        const effectIds = new Set(member.calculation.bundle.effects.filter(effect => effect.target.kind === 'attribute' && effect.target.attribute.id === attribute
          && owner.effects.some(reference => reference.id === effect.identity.id)
          && engine.effectRecipientMatches(effect.recipient, owner.id, receiver.id, receiver.identity) === true)
          .map(effect => (effect.buff ?? effect.identity).id));
        return [...effectIds].flatMap(effectId => {
          const selected = index === 0 && effectId === buffId;
          if (selected && application === null) return [];
          return [{ instanceId: engine.calculationEffectInstanceId(owner.id, { namespace: 'builtin', id: effectId, revision: '1' }, null),
            active: selected ? application : false }];
        });
      });
      for (const { subject, value } of flags.filter(flag => flag.key === 'audit.energyRecharge')) {
        context.actors.find(member => member.id === (subject ?? 'actor')).inputs.energyRecharge = value;
      }
      const result = engine.evaluateCombatBindings(team.program, context, { energy: binding }, frame);
      const output = result.outputs.energy;
      const value = output?.state === 'known' && output.value.kind === 'quantity' && output.value.unit === 'energy' ? output.value.value : null;
      const valueMatches = expected === null ? output?.state === 'unknown' : value !== null && Math.abs(value - expected) < 1e-9;
      const matches = buffIndex >= 0 && valueMatches && options.evidence(info.entry);
      rows.push({ entity: id, field, effect: buffId, attribute, sources, probe: label, recipient, constellation: rank, ascension: asc,
        expected, value, ...matches ? {} : { issue: '本次回能结果、单位或来源与预期不符', diagnostics: result.diagnostics } });
      grade.checks++;
      if (!matches) grade.failures++;
    }
    const recipient = options.recipient ?? self;
    const electroPeer = ['lisa', 'fischl', 'beidou'].find(starterAvailable);
    const optionsForPeer = recipient === electro && electroPeer ? { recipient: 'peer1', peers: [electroPeer] } : { recipient: 'peer1' };
    const target = recipient === others || recipient === electro ? optionsForPeer : {};
    const baseline = probes[0];
    if (recipient !== electro || electroPeer) {
      for (const probe of probes) check({ ...target, ...probe });
      const { facts } = baseline;
      check({ ...target, facts, expected: 0, active: false, label: '触发关闭' });
      check({ ...target, facts, expected: null, active: null, label: '触发未知' });
      check({ ...target, facts, expected: 0, application: false, label: '未应用' });
      check({ ...target, facts, expected: null, application: null, label: '应用未确认' });
      if (constellation) check({ ...target, facts, expected: 0, locked: 'constellation', label: '命座未解锁' });
      if (ascension) check({ ...target, facts, expected: 0, locked: 'ascension', label: '天赋未解锁' });
    }
    check({ ...baseline, peers: [peer], expected: recipient === self || recipient === electro ? 0 : baseline.expected, recipient: 'peer1', label: '队员受益者' });
    check({ ...baseline, expected: recipient === others || recipient === electro ? 0 : baseline.expected, recipient: 'actor', label: '持有者受益' });
    if (options.field) check({ ...target, facts: [...baseline.facts ?? [], { key: 'onField', subject: 'recipient', value: bool(false) }], expected: 0, label: '受益者不在场' });
    if (options.moonsign) check({ ...target, facts: [...baseline.facts ?? [], { key: 'fullMoonsign', subject: 'team', value: bool(false) }], expected: 0, label: '未达到月兆满辉' });
  }

  const mentions = (entry, value) => new RegExp('(?:^|[^\\d.])' + String(value).replace('.', '\\.') + '点(?:元素)?能量').test(entry?.description ?? '');
  for (const [id, slot, expected, options] of fixed) {
    verify(id, slot, { ...options, evidence: entry => mentions(entry, expected) }, [{ expected, label: '一次已确认触发' }]);
  }
  for (const [id, slot, parameter, label, options = {}] of curves) {
    if (!starterAvailable(id)) continue;
    const skill = source(id, options.skillSlot ?? slot), sourceId = travelerSource(id);
    const values = rates[sourceId][skill.anchor][parameter];
    verify(id, slot, { ...options, sources: [skill.path, ratesPath + '#' + sourceId + '/' + skill.anchor + '/' + parameter],
      evidence: entry => skill.entry.attributes.labels.some(field => label.test(field) && field.includes('{' + parameter + ':'))
        && (slot !== 'c4' || /恢复的元素能量提高100%/.test(entry.description)) },
    [{ expected: values[0], label: '天赋等级1' }, { expected: values[9], level: 10, label: '天赋等级10' }]);
  }
  for (const [id, slot, key, rate, cap] of counts) {
    verify(id, slot, { evidence: entry => mentions(entry, rate) && mentions(entry, cap) }, [1, 0, 2, 6, null].map(value => ({
      expected: value === null ? null : Math.min(value * rate, cap), label: '独立数量 ' + value,
      facts: value === null ? [] : [{ key, subject: 'query', value: count(value) }],
    })));
  }
  for (const [id, slot, choices, threshold] of modes) {
    const key = keyFor(id, slot) + '.mode';
    const basis = threshold ? [{ key: 'currentEnergy', value: energy(threshold - 1) }] : [];
    const inputs = value => value === null ? basis : [...basis, { key, subject: 'query', value: mode(value) }];
    const probes = [...choices, ['none', 0], [null, null]].map(([value, expected]) => ({ expected, facts: inputs(value), label: '互斥档 ' + value }));
    if (threshold) probes.push({ expected: 0, facts: [...inputs(choices[0][0]), { key: 'currentEnergy', value: energy(threshold) }], label: '恰达能量阈值' });
    const evidence = id === 'kaedeharakazuha' ? entry => /分别为枫原万叶恢复3、4点元素能量/.test(entry.description) && mentions(entry, 2)
      : id === 'freminet' ? entry => mentions(entry, 2) && /转为恢复3点/.test(entry.description)
      : entry => choices.every(([, value]) => mentions(entry, value));
    verify(id, slot, { evidence }, probes);
  }
  if (['kaeya', 'noelle', 'ningguang', 'yunjin'].every(starterAvailable)) {
    verify('aratakiitto', 'c2', { evidence: entry => /元素能量恢复6点/.test(entry.description) && mentions(entry, 18) }, [
      { expected: 6, peers: ['kaeya'], label: '1个岩队员（含一斗）' },
      { expected: 12, peers: ['kaeya', 'noelle'], label: '2个岩队员' },
      { expected: 18, peers: ['noelle', 'ningguang', 'yunjin'], label: '4个岩队员触及封顶' },
    ]);
  }
  verify('faruzan', 'c4', { evidence: entry => [2, 0.5, 4].every(value => mentions(entry, value)) }, [1, 0, 2, 5, 6, null].map(value => ({
    expected: value === null ? null : value === 0 ? 0 : Math.min(2 + 0.5 * (value - 1), 4), label: '风涡命中 ' + value,
    facts: value === null ? [] : [{ key: 'faruzan.energyVortexTargets', subject: 'query', value: count(value) }],
  })));
  for (const [id, multiplier, cap, recipient] of [['dori', 5, 15, self], ['kujousara', 1.2, Infinity, everyone]]) {
    verify(id, 'p1', { recipient, evidence: entry => mentions(entry, multiplier) && (!Number.isFinite(cap) || mentions(entry, cap)) }, [1, 2, 3, 4].map(value => ({
      expected: Math.min(multiplier * value, cap), label: '充能倍率 ' + value, facts: [{ key: 'audit.energyRecharge', value: number('scalar', value) }],
    })));
  }
  verify('ororon', 'p1', { recipient: everyone, evidence: entry => /若欧洛伦处于队伍后台，还会为欧洛伦恢复3点元素能量/.test(entry.description),
    facts: [{ key: 'onField', value: bool(false) }, { key: 'onField', subject: 'peer1', value: bool(true) }] }, [
    { expected: 3, label: '欧洛伦在后台' }, { recipient: 'peer1', expected: 3, label: '击中敌人的当前场上队员' },
    { recipient: 'peer1', expected: 0, facts: [{ key: 'onField', subject: 'recipient', value: bool(false) }], label: '其他后台队员' },
    { expected: 3, facts: [{ key: 'onField', value: bool(true) }, { key: 'onField', subject: 'peer1', value: bool(false) }], label: '欧洛伦自己站场仅回复一次' },
  ]);
  verify('kamisatoayato', 'p1', { evidence: entry => /处于队伍后台时，若元素能量低于40点，每1秒为自己恢复2点元素能量/.test(entry.description) },
    [[39, false, 2], [40, false, 0], [0, true, 0], [null, false, null]].map(([current, field, expected]) => ({
      expected, label: '后台回能阈值 ' + current, facts: [{ key: 'onField', value: bool(field) }, ...current === null ? [] : [{ key: 'currentEnergy', value: energy(current) }]],
    })));
  if (starterAvailable('razor')) for (const [slot, spendMode] of [['t1', '长按利爪与苍雷'], ['t2', '施放雷牙']]) {
    const skill = source('razor', 't1'), sigilEnergy = rates.razor.combat2.param4[0];
    verify('razor', slot, { sources: [skill.path, ratesPath + '#razor/combat2/param4'],
      evidence: entry => /雷之印/.test(entry.description) && skill.entry.attributes.labels.some(field => /雷之印吸收恢复能量\|每个\{param4:/.test(field)) },
    [[1, spendMode, sigilEnergy], [3, spendMode, 3 * sigilEnergy], [1, 'none', 0], [null, spendMode, null]].map(([value, action, expected]) => ({ expected,
      label: '雷之印消耗 ' + value, facts: [{ key: 'razor.energySigilSpendMode', subject: 'query', value: mode(action) },
        ...value === null ? [] : [{ key: 'razor.energySigilsSpent', subject: 'query', value: count(value) }]],
    })));
  }
  for (const [key, { checks, failures }] of clauses) if (checks && !failures) verified.add(key);
  return { rows, verified, summary: { currentEnergyCases: rows.length, currentEnergyMismatches: rows.filter(row => row.issue).length,
    verifiedEnergyClauses: verified.size }, gaps };
}

export const currentEnergyGrantAuditCharacterIds = [...new Set([
  ...fixed.map(row => row[0]), ...curves.map(row => row[0]), ...counts.map(row => row[0]), ...modes.map(row => row[0]),
  ...remaining.map(row => row.entity), 'amber', 'lisa', 'noelle', 'ningguang', 'yunjin',
  'aratakiitto', 'faruzan', 'dori', 'kujousara', 'ororon', 'kamisatoayato', 'razor',
])];
