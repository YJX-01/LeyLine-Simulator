import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { auditBuild, auditHit, bool, fact, novice, number } from './roster-audit-settings.mjs';

const upstream = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const kqm = 'https://github.com/KQM-git/TCL/blob/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/docs/evidence/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const growth = read(catalog + 'characters.json');
const curves = read(catalog + 'character-curves.json');
const setText = read(catalog + 'sets.json');
const gameConfigPath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/character-healing-facts.json';
const { source: gameConfigSource, ...gameConfig } = read(gameConfigPath);
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const amount = (unit, value) => value == null ? fact(null) : number(unit, value);
const flag = value => value == null ? fact(null) : bool(value);
const actor = id => ({ kind: 'actor', id });
const artifactEvidence = kqm + 'equipment/artifacts.md#extensive-look-at-what-heals-count-for-ohc';
const sourceFile = (entity, anchor) => upstream + (anchor.startsWith('c') ? 'constellations/' : 'talents/') + entity + '.json';
const sourceRef = (entity, anchor) => sourceFile(entity, anchor) + '#' + anchor;
const sourceText = (entity, anchor) => read(sourceFile(entity, anchor))[anchor]?.description ?? '';
const writtenRatio = (text, pattern) => Number(text.match(pattern)?.[1]) / 100;
const staminaOutput = 'attribute.staminaRestored';
const outgoingBonus = writtenRatio(setText.maidenbeloved.effect2Pc, /治疗效果提升(\d+)%/u);
const incomingBonus = writtenRatio(setText.travelingdoctor.effect2Pc, /受到的治疗效果提高(\d+)%/u);

const revivalFacts = (entity, gates = []) => [
  ['recipient', 'reviveFallenRecipient', true], ['event', entity + 'RevivalReady', true], ...gates,
];

const cases = [
  { entity: 'barbara', anchor: 'c6', heal: 'burst.revival', recipient: 'other', sources: [artifactEvidence,
    kqm + 'characters/hydro/barbara.md#c6-revive-can-be-canceled-by-switching'],
  ratio: /生命值恢复至(\d+)%/u, reviveTarget: 'AllPlayerAvatars', gates: revivalFacts('barbara', [['owner', 'onField', false]]),
  usesOutgoing: true, usesIncoming: true,
  resolved: '芭芭拉在后台且限次就绪，确认该队友已倒下后，含溢出的复苏治疗量为受益者生命上限乘以（1＋施救者治疗加成＋受益者受治疗加成）。实际生命值至多回满。',
  remaining: '需要从倒下动画、切人取消和15分钟限次自动识别本次复苏。' },
  { entity: 'qiqi', anchor: 'c6', heal: 'burst.revival', recipient: 'other', sources: [artifactEvidence],
    ratio: /生命值恢复至(\d+)%/u, reviveTarget: 'CurTeamAvatars',
    gates: revivalFacts('qiqi', [['event', 'qiqiRevivalBurstCast', true], ['recipient', 'qiqiRevivalNearby', true]]),
    usesOutgoing: true,
    resolved: '确认七七已成功施放元素爆发、限次就绪及该附近队员已倒下后，无受治疗加成时按受益者生命上限的50%乘以（1＋七七治疗加成）计算。',
    remaining: '需要由爆发施放自动分发给所有附近已倒队员，维护15分钟共用限次。',
    evidence: '旧版实验中倒下的受益者未获得双水共鸣的受治疗加成。仍缺倒下前装备独立常驻受治疗加成的到账对照。' },
  { entity: 'dahlia', anchor: 'c6', heal: 'burst.revival', recipient: 'on-field',
    ratio: /生命值恢复至(\d+)%/u, reviveTarget: 'CurLocalAvatar',
    gates: revivalFacts('dahlia', [['recipient', 'onField', true], ['recipient', 'dahlia.favonianFavor', true]]),
    resolved: '确认当前场上角色在西风之眷下倒下且限次就绪后，复苏的基础生命值为该角色生命上限的100%。',
    remaining: '需要从生效的西风之眷、场上角色倒下与切换、15分钟限次自动识别复苏。',
    evidence: '场上与后台动作均以受益者生命上限的100%作为输入。仍缺分别改变两项治疗加成后的结算量或超额治疗对照。' },
  { entity: 'zhongli', anchor: 'c6', heal: 'skill.chrysos', recipient: 'on-field', sources: [artifactEvidence,
    kqm + 'characters/geo/zhongli.md#c6-chrysos-bounty-of-dominator'],
  ratio: /回复量为伤害的(\d+)%/u, cap: /最大生命值的(\d+)%/u, basis: 'chrysosShieldDamage',
  gates: [['event', 'chrysosJadeShieldHit', true], ['recipient', 'onField', true]],
  resolved: '确认玉璋护盾的本次有效受击及回复使用的伤害量后，按该值的40%回复，基础回复量至多为受益者生命上限的8%。',
  remaining: '需要从战斗事件自动关联受击的玉璋护盾、伤害和当时受益者。',
  evidence: '尚缺同击盾前、盾后及回复的对照，以及治疗加成与单次封顶的结算顺序。' },
  { entity: 'lynette', anchor: 'passive3', heal: 'skill.recovery-orb', recipient: 'party', basis: 'recoveryOrbBaseHealing',
    ratio: /水中耐力与生命值提升(\d+)%/u, gates: [['event', 'recoveryOrbContact', true], ['recipient', 'recoveryOrbRecipient', true]],
    resolved: '确认接触复苏水团、当次受益者及该水团的各自基准后，生命和水中耐力的额外回复各是对应基准的25%。',
    remaining: '需要从探索事件自动识别复苏水团、接触和实际受益者。',
    evidence: '尚缺各种复苏水团的原始生命和水中耐力基准、治疗加成交互及两项实际到账量。' },
];

export const remainingEventGrantIds = [...cases.map(row => row.entity), 'kaeya'];
export const remainingEventGrantSetIds = ['maidenbeloved', 'travelingdoctor'];

function sourceHp(build) {
  const stats = growth[build.character.id].stats;
  const promotion = stats.promotion[build.ascension];
  const ratio = stats.specialized === 'FIGHT_PROP_HP_PERCENT' ? promotion.specialized : 0;
  return (stats.base.hp * curves[build.level][stats.curve.hp] + promotion.hp) * (1 + ratio);
}

const remainingGaps = [
  ['iansan', 'passive2', 'timeline-only', '热身治疗的60%攻击力已接入。夜魂迸发授予10秒热身、恢复至少一点夜魂与2.8秒限次仍需要自动关联。'],
  ['ifa', 'passive4', 'timeline-only', '需要自动跟踪受魂附生物生命、1秒资格检测、队伍共享限次及燃素扣除。'],
  ['varesa', 'passive4', 'needs-evidence', '缺少普通冲刺速度对同体型基础速度的可复核倍率或固定速度函数，以及有其他体力修正时两种消耗加值的叠加顺序。'],
];

export async function auditRemainingEventGrants(entities, engine) {
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const characters = new Map(entities.characters.map(entry => [entry.id, entry]));
  const weapons = new Map(entities.weapons.map(entry => [entry.id, entry]));
  const maiden = entities.sets?.find(entry => entry.id === 'maidenbeloved');
  const doctor = entities.sets?.find(entry => entry.id === 'travelingdoctor');
  const rows = [], resolved = [], verified = new Set();
  const gaps = remainingGaps.filter(([entity]) => characters.has(entity)).map(([entity, anchor, status, reason]) => ({
    entity, field: '/' + (anchor.startsWith('c') ? 'constellations/' : 'passives/') + (Number(anchor.at(-1)) - 1),
    status, reason, sources: [sourceRef(entity, anchor)],
  }));
  function build(character, rank = 0, equipped) {
    const result = { ...auditBuild(character, weapons.get(novice[character.identity.weaponType]), equipped ? [equipped] : []), constellation: rank };
    if (equipped) result.theoreticalSetSlots = equipped.slots.slice(0, 2).map(slot => ({ slot, setId: equipped.id }));
    return result;
  }

  function addRow(row, { status, value, base }, expected, expectedStatus, expectedBase = expected) {
    const equal = (actual, wanted) => actual === wanted || actual != null && wanted != null && Math.abs(actual - wanted) < 1e-7;
    rows.push({ ...row, status, value, base, expected, expectedStatus, expectedBase,
      ...(status === expectedStatus && equal(value, expected) && equal(base, expectedBase) ? {} : { issue: '当前事件回复量、资格或受益者不符' }) });
  }

  for (const row of cases.filter(({ entity }) => characters.has(entity))) {
    const { entity, anchor, recipient, basis, gates, heal, reviveTarget } = row;
    const character = characters.get(entity), peer = characters.get('kaeya');
    const [category, name] = heal.split('.');
    const healId = `${entity}.${category}.heal.${name}`;
    const inConstellation = anchor.startsWith('c'), rank = inConstellation ? 6 : 0;
    const field = inConstellation ? '/constellations/5' : '/passives/2';
    const sources = [sourceRef(entity, anchor), ...(row.sources ?? []), catalog + 'characters.json#/kaeya/stats'];
    const text = sourceText(entity, anchor), textRate = writtenRatio(text, row.ratio);
    const config = reviveTarget ? gameConfig[entity] : undefined;
    let rate = textRate;
    if (config) {
      sources.push(gameConfigPath + '#/' + entity, gameConfigSource.repository + '/blob/' + gameConfigSource.revision + '/' + config.path);
      const actionRate = action => typeof action.amountByTargetMaxHPRatio === 'number' ? action.amountByTargetMaxHPRatio
        : config.abilitySpecials?.[action.amountByTargetMaxHPRatio];
      rate = actionRate(config.actions[0]);
      if (rate !== textRate || config.actions.some(action => action.$type !== 'ReviveAvatar' || action.target !== reviveTarget || actionRate(action) !== rate)) {
        rows.push({ entity, field, healId, sources, issue: '复苏动作的目标或生命上限比例与原文不符' });
        continue;
      }
      const observed = config.observation;
      if (observed) {
        const bubble = gameConfig.revivalObservation;
        sources.push(gameConfigPath + '#/revivalObservation', bubble.discussion, observed.record);
        const incoming = row.usesIncoming ? observed.incomingHealingBonus : observed.incomingHealingBonusApplied;
        const base = observed.maxHp * rate;
        const healing = base * (1 + observed.outgoingHealingBonus + incoming);
        const bubbleScale = bubble.bubbleHealingRatio * (1 - bubble.physicalResistance);
        const matchesBubble = amount => Math.abs(amount * bubbleScale - observed.bubbleDamage) <= bubble.displayTolerance;
        if (!matchesBubble(healing) || Math.abs(Math.min(healing, observed.maxHp) - observed.hpAfter) > bubble.displayTolerance
          || matchesBubble(base * (1 + incoming)) || row.usesIncoming && matchesBubble(base * (1 + observed.outgoingHealingBonus))) {
          rows.push({ entity, field, healId, sources, issue: '复苏到账或海染对照与治疗加成的独立预期不符' });
          continue;
        }
      }
    }
    const cap = row.cap ? writtenRatio(text, row.cap) : null;
    const talent = character.talents.find(entry => entry.category === category);
    const healIndex = talent.heals?.findIndex(entry => entry.id === healId) ?? -1;
    const declaration = talent.heals?.[healIndex];
    const pointer = `/talents/${character.talents.indexOf(talent)}/heals/${healIndex}`;
    if (!declaration || declaration.origin?.[inConstellation ? 'constellation' : 'passive'] !== Number(anchor.at(-1)) - 1
      || !Number.isFinite(rate) || row.cap && !Number.isFinite(cap)) {
      rows.push({ entity, field, healId, sources, issue: '固定来源或授予入口不符' });
      continue;
    }
    const first = rows.length;
    const trial = (title, { values = gates, constellation = rank, self = false, bonus = false, incoming = false, fraction = .1,
      expectedStatus = 'applied' } = {}) => {
      const project = createEmptyProject();
      project.enemy = defaultEnemy();
      const ownerBuild = build(character, constellation, bonus ? maiden : undefined);
      const recipientBuild = self ? ownerBuild : build(peer, 0, incoming ? doctor : undefined);
      const owner = addActorFromBuild(project, ownerBuild), to = self ? owner : addActorFromBuild(project, recipientBuild);
      const subjects = { owner: actor(owner), recipient: actor(to), event: { kind: 'event' } };
      const supplied = new Map();
      for (const [subject, key, value] of values) {
        const entry = subjects[subject];
        if (!supplied.has(entry.kind + (entry.id ?? ''))) supplied.set(entry.kind + (entry.id ?? ''), { subject: entry, values: {} });
        supplied.get(entry.kind + (entry.id ?? '')).values[key] = flag(value);
      }
      const maxHp = sourceHp(recipientBuild);
      const basisAmount = basis && fraction !== null ? maxHp * fraction : null;
      if (basis) {
        if (!supplied.has('event')) supplied.set('event', { subject: subjects.event, values: {} });
        supplied.get('event').values[basis] = amount('hp', basisAmount);
      }
      const record = { id: 'current-healing', kind: 'state-change', timeMs: 1, order: 1, actor: owner, definition: project.candidate.actors[0].character,
        talentHeal: { definition: { namespace: character.namespace, id: entity, revision: character.revision }, healId, recipientId: to,
          facts: [...supplied.values()] } };
      project.timeline.push(record);
      const before = JSON.stringify(project);
      const timeline = engine.evaluateTimeline(project);
      const changes = timeline.combatChanges?.filter(change => change.kind === 'talent-healing');
      const reading = changes?.[0];
      const nominal = (basis ? basisAmount : maxHp) * rate;
      const capped = cap === null ? nominal : Math.min(nominal, maxHp * cap);
      const outgoingFactor = bonus && row.usesOutgoing ? outgoingBonus : 0;
      const incomingFactor = incoming && row.usesIncoming ? incomingBonus : 0;
      const expected = expectedStatus === 'applied' ? capped * (1 + outgoingFactor + incomingFactor) : expectedStatus === 'excluded' ? 0 : null;
      const expectedBase = expectedStatus === 'unknown' && (bonus || incoming) ? capped : null;
      const intact = JSON.stringify(project) === before;
      const status = intact && changes?.length === 1 && reading?.actor === owner && reading.recipient === to && reading.source === record.id
        && reading.effect === healId ? reading.status : 'missing';
      addRow({ entity, field, pointer, healId, output: 'healing', sources, probe: { title, constellation, values, self, bonus, incoming, basisAmount },
        ...(reading?.missing?.length ? { missing: reading.missing } : {}) },
        { status, value: reading?.healing ?? null, base: reading?.baseHealing ?? null }, expected, expectedStatus, expectedBase);
    };
    trial('本次确认');
    if (cap !== null) {
      trial('恰达受益者上限', { fraction: cap / rate });
      trial('超过受益者上限', { fraction: 1 });
    }
    if (basis) {
      trial('零基准', { fraction: 0 });
      trial('缺本次基准', { fraction: null, expectedStatus: 'unknown' });
    }
    if (recipient === 'other') trial('受益者为施救者', { self: true, expectedStatus: 'excluded' });
    if (inConstellation) trial('五命锁定', { constellation: 5, expectedStatus: 'excluded' });
    if (maiden) trial('施救者治疗加成', { bonus: true, expectedStatus: row.usesOutgoing ? 'applied' : 'unknown' });
    if (config && doctor) trial('受益者受治疗加成', { incoming: true, expectedStatus: row.usesIncoming ? 'applied' : 'unknown' });
    if (row.usesIncoming && maiden && doctor) trial('两项治疗加成', { bonus: true, incoming: true });
    for (const [index, [, key, value]] of gates.entries()) {
      const changed = altered => gates.map((fact, i) => i === index ? [fact[0], key, altered] : fact);
      trial('不符合 ' + key, { values: changed(!value), expectedStatus: 'excluded' });
      trial('未确认 ' + key, { values: changed(null), expectedStatus: 'unknown' });
    }

    if (entity === 'lynette') {
      const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build: build(character) }, { id: 'peer', build: build(peer) }]);
      if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
      const peerTalent = peer.talents[0], hit = peerTalent.hits[0];
      const { setup, request } = auditHit(peer, peerTalent, hit);
      setup.events[0].actorId = 'peer';
      const context = engine.createStructuredCombatContext(prepared.team, setup);
      const bindings = { value: { kind: 'attribute', key: ref(staminaOutput), actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' } } };
      const staminaPointer = '/passives/2/buffs/0/modifiers/0';
      for (const [base, contact, receiver, expected, status] of [[100, true, true, 100 * rate, 'known'], [0, true, true, 0, 'known'],
        [100, false, true, 0, 'known'], [100, true, false, 0, 'known'], [null, true, true, null, 'unknown'], [100, null, true, null, 'unknown']]) {
        const frame = { ...request.frame, ownerId: 'peer', recipientId: 'peer', contributorId: null,
          hit: { skillId: peerTalent.id, hitId: hit.id, category: hit.category, element: hit.element, family: 'ordinary', origin: 'talent', reactionId: null },
          facts: { recoveryOrbContact: flag(contact), recoveryOrbBaseStamina: amount('stamina', base) },
          factOverrides: [{ subject: actor('peer'), facts: { recoveryOrbRecipient: flag(receiver) } }] };
        const reading = engine.evaluateCombatBindings(prepared.team.program, context, bindings, frame).outputs.value;
        const value = reading?.state === 'known' && reading.value.kind === 'quantity' && reading.value.unit === 'stamina' ? reading.value.value : null;
        addRow({ entity, field, pointer: staminaPointer, output: staminaOutput, sources,
          probe: { base, contact, receiver } }, { status: reading?.state ?? 'missing', value, base: null }, expected, status, null);
      }
      if (!rows.slice(first).some(probe => probe.pointer === staminaPointer && probe.issue)) verified.add(entity + staminaPointer);
    }
    if (rows.slice(first).some(probe => probe.issue)) continue;
    verified.add(entity + field);
    verified.add(entity + pointer);
    resolved.push({ entity, field, resolved: row.resolved, remaining: row.remaining });
    gaps.push({ entity, field, status: 'timeline-only', reason: row.remaining, sources });
    if (row.evidence) gaps.push({ entity, field, status: 'needs-evidence', reason: row.evidence, sources });
  }
  return { rows, verified, resolved, gaps, summary: { remainingEventGrantCases: rows.length,
    remainingEventGrantFailures: rows.filter(row => row.issue).length, remainingEventGrantClauses: resolved.length } };
}
