import { readContentSource } from './content-source.mjs';
import { auditBuild, bool, fact, novice, number } from './roster-audit-settings.mjs';

const textRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const sourcePath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/movement-speed-clauses.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const movement = 'attribute.movementSpeed';
const glide = 'attribute.glideSpeed';
const stamina = 'attribute.staminaCostReduction';
const swift = 'UNIQUE_Avatar_Dehya_Talent_RunningInTheSun';
const glideModifier = 'UNIQUE_Fly_SpeedUp';
const diveModifier = 'UNIQUE_DiveDashSpeedUp';
const day = ['dahlia', 'dehya', 'gaming'];
const night = ['rosaria', 'illuga'];
const swiftIds = [...day, ...night, 'chiori'];
const gliders = ['xianyun', 'ororon'];
export const movementSpeedClauseIds = ['diona', ...swiftIds, 'kinich', 'neuvillette', ...gliders];
const passiveNumbers = { diona: 1, dahlia: 3, dehya: 3, gaming: 3, rosaria: 3, illuga: 4, chiori: 3, kinich: 4, neuvillette: 3, xianyun: 3, ororon: 4 };
const enumFact = value => fact({ kind: 'enum', value });
const mode = value => ({ 'movement.mode': enumFact(value) });
const field = (scope, index, buff, modifier) => `/${scope}/${index}/buffs/${buff}/modifiers/${modifier}`;

function requireSource(match, entity, detail) {
  if (!match) throw new Error(entity + ' 固定资料与待核验条款不符。' + detail);
}

function attached(ability, name, target) {
  return ability.onAdded?.some(entry => entry.$type === 'AttachModifier' && entry.modifierName === name && entry.target === target);
}

function percentage(text, expression) {
  return Number(text.match(expression)?.[1]) / 100;
}

function evidenceFor(entity, raw) {
  const ordinal = passiveNumbers[entity];
  const path = `${textRoot}talents/${entity}.json`;
  const description = read(path)['passive' + ordinal].description;
  const { records } = raw.ability;
  const ability = records[0];
  const { modifiers } = ability;
  const sources = [`${path}#passive${ordinal}`, `${sourcePath}#/entries/${entity}/ability`];
  if (raw.passive) sources.push(`${sourcePath}#/entries/${entity}/passive`);
  const declaredSpeed = percentage(description, /移动速度提[高升]([\d.]+)%/);
  const output = (id, target, value, modifier = 0) => ({ entity, effect: id + (modifier ? '.' + modifier : ''), target, amount: value,
    field: field('passives', ordinal - 1, 0, modifier), clause: `/passives/${ordinal - 1}`, sources });
  if (swiftIds.includes(entity)) {
    const modification = modifiers[swift];
    const [predicate] = Object.values(modifiers).filter(entry => entry.onAdded?.some(action => action.modifierName === swift));
    const [attach] = predicate?.onAdded ?? [];
    const scene = attach?.predicates?.find(entry => entry.$type === 'ByCurrentSceneTypes');
    const property = modification?.properties.Animator_MoveSpeedRatio;
    const speed = typeof property === 'number' ? property : raw.passive.record.paramList[0];
    requireSource(modification?.isUnique && scene?.sceneTypes?.join() === 'SCENE_WORLD,SCENE_ROOM' && speed === declaredSpeed
      && description.includes('该效果在秘境、征讨领域、深境螺旋中无效，迅行效果无法叠加。'), entity, '迅行来源、数值或场景门槛');
    if (entity === 'chiori') {
      const checks = modifiers.Chiori_CheckSelfIsCool_Avatar.modifierMixins;
      requireSource(checks.some(entry => entry.$type === 'AttachModifierToCostumeTypeMixin' && entry.NIGDGLDFHDK[0] === 0)
        && checks.some(entry => entry.$type === 'AttachModifierToFlyCloakTypeMixin' && entry.PBPKDAJOAAB[0] === 140001)
        && description.includes('队伍中任意自己的角色装备了默认衣装以外的衣装，或初始之翼以外的风之翼'), entity, '装扮检查');
    } else {
      const [mixin] = Object.values(modifiers).flatMap(entry => entry.modifierMixins ?? []).filter(entry => entry.$type === 'AttachToDayNightMixin');
      const atNight = night.includes(entity);
      requireSource((mixin?.time ?? 'Day') === (atNight ? 'Night' : 'Day')
        && description.includes(atNight ? '夜间（18时至6时）' : '白天（6时至18时）'), entity, '昼夜条件');
    }
    return { effects: [output(entity + '.swift-stride', movement, speed)] };
  }
  if (entity === 'diona') {
    const handler = 'UNIQUE_Diona_PermanentSkill_1_Handler';
    const property = modifiers.DionaPermanentSkill_SpeedUp.properties;
    const [speed, cost] = raw.passive.record.paramList;
    const normal = modifiers.UNIQUE_Diona_Elemental_Art_Shield.onAdded.find(entry => entry.modifierName === handler);
    const coop = modifiers.UNIQUE_Diona_Constellation_2_Shield.onAdded.find(entry => entry.modifierName === handler);
    requireSource(modifiers[handler].modifierMixins.some(entry => entry.$type === 'CurLocalAvatarMixinV2' && entry.modifierName === 'DionaPermanentSkill_SpeedUp')
      && normal?.target === 'Team' && normal.predicates[0].talentParam === 'Diona_PermanentSkill_1'
      && coop?.target === 'Team' && coop.predicates[0].key === '_ABILITY_Diona_PermanentSkill_1'
      && property.Actor_CostStaminaRatio === 'Diona_CostStaminaDelta' && property.Animator_MoveSpeedRatio === 'Diona_Speed'
      && speed === declaredSpeed && -cost === percentage(description, /体力消耗降低([\d.]+)%/) && raw.passive.record.breakLevel === 1,
    entity, '本地当前角色、猫爪冻冻护盾、解锁与移速体力参数');
    return { effects: [output('diona.a1.icy-paws', movement, speed), output('diona.a1.icy-paws', stamina, -cost, 1)] };
  }
  if (entity === 'kinich') {
    const gather = modifiers.UNIQUE_Kinich_Gather.modifierMixins[0];
    const action = gather.actions[0];
    const range = action.predicates.find(entry => entry.$type === 'ByTargetPositionToSelfPosition');
    const [speed, seconds] = raw.passive.record.paramList;
    const [c1Speed, c1Seconds] = raw.constellation.record.paramList;
    const c1Path = `${textRoot}constellations/kinich.json`;
    const c1 = read(c1Path).c1.description;
    const special = modifiers.UNIQUE_Kinich_Speed_Up;
    requireSource(gather.onEvent === 'GatherItem' && gather.predicates.some(entry => entry.$type === 'ByGatherType' && entry.type === 'SpecialGathering')
      && action.modifierName === 'UNIQUE_Kinich_Speed_Up' && action.target === 'CurTeamAvatars' && range?.logic === 'LesserOrEqual' && range.value === 40
      && special.isUnique && special.properties.Animator_MoveSpeedRatio === 'Speed' && special.duration === 'Duration'
      && description.includes('在纳塔存在燃素机制的区域时，与部分采集物交互')
      && speed === declaredSpeed && seconds === Number(description.match(/持续([\d.]+)秒/)?.[1]), entity, '指定采集类型、距离、纳塔燃素区、数值或时长');
    const hook = records[1].modifiers;
    const landing = records[2].modifiers.Avatar_Kinich_Talent_1_MoveSpeed;
    requireSource(hook.Kinich_Grapnel_DropEffect_Talent_1.modifierMixins.some(entry => entry.modifierName === 'Kinich_Talent_1_Applier' && entry.stateIDs.includes('Fall'))
      && hook.Kinich_Talent_1_Applier.onRemoved.some(entry => entry.abilityName === 'Avatar_Kinich_Talent_1')
      && landing.duration === 'MovespeedDuration' && landing.properties.Animator_MoveSpeedRatio === 'MovespeedRatio'
      && c1.includes('进行空中摆荡落地后') && percentage(c1, /移动速度提升([\d.]+)%/) === c1Speed
      && c1Seconds === Number(c1.match(/持续([\d.]+)秒/)?.[1]), entity, '一命摆荡落地、数值或时长');
    return { range: range.value, gatherMs: seconds * 1000, landingMs: c1Seconds * 1000,
      effects: [output('kinich.special-gathering-speed', movement, speed), { ...output('kinich.c1.swing-landing-speed', movement, c1Speed),
        field: field('constellations', 0, 1, 0), clause: '/constellations/0',
        sources: [`${c1Path}#c1`, `${sourcePath}#/entries/kinich/ability`, `${sourcePath}#/entries/kinich/constellation`] }] };
  }
  if (entity === 'neuvillette') {
    const effect = modifiers[diveModifier];
    const states = effect.modifierMixins[0].normalizedStateIDList.map(entry => entry.stateID);
    const speed = modifiers.DiveDashSpeedUp.properties.Animator_MoveSpeedRatio;
    requireSource(effect.isUnique && attached(ability, diveModifier, 'CurTeamAvatars')
      && states.join() === 'DiveDashBS,DiveDash,DiveDashB,DiveDashAS' && speed === declaredSpeed
      && description.includes('自己的角色进行水下冲刺时') && description.includes('效果完全相同的固有天赋叠加'), entity, '水下冲刺状态及叠加组');
    return { effects: [output('neuvillette.underwater-sprint-speed', movement, speed)] };
  }
  const effect = modifiers[glideModifier];
  const speed = modifiers.Fly_SpeedUp.properties.Actor_FlyForwardSpeedMaxRatio;
  requireSource(effect.isUnique && attached(ability, glideModifier, 'CurTeamAvatars') && effect.modifierMixins[0].stateIDs.join() === 'Fly'
    && speed === declaredSpeed && description.includes('自己的角色滑翔时') && description.includes('效果完全相同的固有天赋叠加'), entity, '滑翔前进速度、状态及叠加组');
  return { effects: [output(entity + '.glide-speed', glide, speed)] };
}

const event = (id, timeMs, actorId, facts = {}, order = 0) => ({ id, kind: 'state-change', actorId, targetIds: [], timeMs, order, sourceEventIds: [], facts });
const bindings = Object.fromEntries([movement, glide, stamina, ...['sprint', 'glide', 'swim', 'climb'].map(key => stamina + '.' + key)].map(id => [id, {
  kind: 'attribute', actor: { role: 'recipient' }, key: { namespace: 'builtin', id, revision: '1' }, at: { kind: 'current', phase: 'same' },
}]));

export function auditMovementSpeedClauses(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const evidence = read(sourcePath).entries;
  const proof = Object.fromEntries(movementSpeedClauseIds.map(id => [id, evidenceFor(id, evidence[id])]));
  const declarations = new Map();
  const teams = new Map();

  for (const [id, { effects }] of Object.entries(proof)) for (const descriptor of effects) {
    const [scope, clause, , buff, , modifier] = descriptor.field.slice(1).split('/');
    const authored = characters.get(id)?.metadata[scope][clause]?.buffs?.[buff];
    const definition = characters.get(id)?.calculation.bundle.effects.find(entry => entry.identity.id === descriptor.effect);
    declarations.set(descriptor.effect, !!definition && authored?.modifiers?.[modifier]?.target === descriptor.target
      && authored.id + (modifier === '0' ? '' : '.' + modifier) === descriptor.effect);
  }

  function run(effect, label, expected, options = {}) {
    const { entity, target } = effect;
    const lineup = options.lineup ?? [entity, 'noelle'];
    if (!lineup.every(id => characters.has(id) && weapons.has(novice[characters.get(id).identity.weaponType]))) return;
    const ascension = options.ascension ?? (lineup.includes('diona') ? 1 : 0);
    const constellation = options.constellation ?? 0;
    const key = JSON.stringify([lineup, ascension, constellation]);
    if (!teams.has(key)) {
      const builds = lineup.map(id => {
        const character = characters.get(id);
        const build = auditBuild(character, weapons.get(novice[character.identity.weaponType]));
        if (id === 'diona' && ascension) Object.assign(build, { ascension, level: 20 });
        if (id === 'kinich') build.constellation = constellation;
        return { id, build };
      });
      const result = engine.prepareStructuredBuilds(builds);
      if (!result.ok) throw new Error(`${entity}: ${JSON.stringify(result.diagnostics)}`);
      teams.set(key, result.team);
    }
    const team = teams.get(key);
    const recipient = options.recipient ?? lineup.at(-1);
    const now = options.now ?? 1000;
    const current = options.current ?? event('current', now, recipient, {}, 10);
    const setup = { targets: [{ id: 'enemy', inputs: {}, facts: {} }], team: { inputs: {}, facts: options.team ?? {}, actorFacts: {} },
      sources: [], factIntervals: [], events: [...options.events ?? [], current] };
    const frame = { ownerId: recipient, recipientId: recipient, targetId: 'enemy', contributorId: null, eventId: current.id,
      phase: options.phase ?? 'before', sourceEventId: null, captures: {}, facts: {}, actorFacts: {}, hit: null, applications: [],
      factOverrides: Object.entries(options.actors ?? {}).map(([id, facts]) => ({ subject: { kind: 'actor', id }, facts })) };
    const context = engine.createStructuredCombatContext(team, setup);
    const output = options.output ?? target;
    const result = engine.evaluateCombatBindings(team.program, context, { [output]: bindings[output] }, frame);
    const datum = result.outputs[output];
    const status = datum?.state ?? 'missing';
    const value = datum?.state === 'known' && datum.value.kind === 'quantity' && datum.value.unit === 'scalar' ? datum.value.value : null;
    const expectedStatus = expected === null ? 'unknown' : 'known';
    const contribution = result.trace.find(node => node.kind === 'effect' && node.definition.id === effect.effect
      && node.context?.actorId === entity && node.context.recipientId === recipient && node.context.eventId === current.id);
    const expectedContribution = options.contribution ?? (expected === null || expected !== 0);
    const contributionState = expectedContribution ? contribution?.state === expectedStatus : !contribution;
    const matches = declarations.get(effect.effect) && contributionState && status === expectedStatus
      && (value === expected || value !== null && expected !== null && Math.abs(value - expected) <= 1e-12);
    rows.push({ entity, clause: effect.clause, field: effect.field, effect: effect.effect, output, actual: value, value, status, expected, expectedStatus,
      sources: [...new Set([...effect.sources, ...(options.sourceEffects ?? []).flatMap(entry => entry.sources)])], probe: { label, recipient },
      ...matches ? {} : { issue: '移速或体力属性、适用角色、贡献来源或时段不符', diagnostics: result.diagnostics } });
  }

  const stance = (recipient, movementMode) => ({ actors: { [recipient]: mode(movementMode) }, recipient });
  const scene = (minutes, location = 'world-or-room', extra = {}) => ({
    'world.timeMinutes': minutes === null ? fact(null) : number('count', minutes), 'world.locationType': enumFact(location), ...extra,
  });
  const outfit = (costume, wings) => ({ 'chiori.teamAlternateOutfit': bool(costume), 'chiori.teamAlternateGlider': bool(wings) });
  for (const entity of [...day, ...night]) {
    const [effect] = proof[entity].effects, atNight = night.includes(entity);
    for (const [time, after] of [[0, true], [359, true], [360, false], [1079, false], [1080, true], [1439, true]]) {
      run(effect, `游戏时间第${time}分钟`, atNight === after ? effect.amount : 0, { team: scene(time) });
    }
    for (const location of ['domain', 'trounce-domain', 'spiral-abyss', 'other-scene']) {
      run(effect, '不适用场景 ' + location, 0, { team: scene(atNight ? 1080 : 360, location) });
    }
    run(effect, '天赋来源本人', effect.amount, { team: scene(atNight ? 1080 : 360), recipient: entity });
    run(effect, '有效场景内时间待确认', null, { team: scene(null) });
  }

  const [chiori] = proof.chiori.effects;
  for (const [costume, wings] of [[false, false], [true, false], [false, true], [true, true]]) {
    run(chiori, `任一队员的衣装${costume}与风之翼${wings}`, costume || wings ? chiori.amount : 0, { team: scene(0, 'world-or-room', outfit(costume, wings)) });
  }
  for (const location of ['domain', 'trounce-domain', 'spiral-abyss', 'other-scene']) {
    run(chiori, '装备了非默认风之翼的排除场景 ' + location, 0, { team: scene(720, location, outfit(false, true)) });
  }
  for (const [lineup, minutes] of [[day, 360], [night, 1080]]) {
    const [first, ...peers] = lineup;
    const [effect] = proof[first].effects;
    run(effect, '多个同时间迅行与千织合计一次', effect.amount, { lineup: [...lineup, 'chiori'], recipient: peers[0],
      team: scene(minutes, 'world-or-room', outfit(true, true)), sourceEffects: [...peers, 'chiori'].flatMap(id => proof[id].effects) });
  }

  const shield = (id, protectedByDiona, onField, shielded = protectedByDiona) => ({ recipient: id, actors: { [id]: {
    'diona.icyPawsShield': bool(protectedByDiona), onField: bool(onField), shielded: bool(shielded),
  } } });
  for (const effect of proof.diona.effects) {
    const cases = [
      ['迪奥娜受猫爪冻冻保护', true, shield('diona', true, true)],
      ['当前队员受猫爪冻冻保护', true, shield('noelle', true, true)],
      ['只受另一护盾保护', false, shield('noelle', false, true, true)],
      ['队员当前不在场', false, shield('noelle', true, false)],
      ['尚未解锁一破天赋', false, { ...shield('noelle', true, true), ascension: 0 }],
    ];
    for (const [label, active, options] of cases) run(effect, label, active ? effect.amount : 0, options);
    if (effect.target === stamina) for (const name of ['sprint', 'glide', 'swim', 'climb']) {
      run(effect, '通用体力降低计入 ' + name, effect.amount, { ...shield('noelle', true, true), output: stamina + '.' + name });
    }
  }

  for (const entity of [...gliders, 'neuvillette']) {
    const [effect] = proof[entity].effects;
    const active = entity === 'neuvillette' ? 'underwater-sprint' : 'gliding';
    for (const movementMode of ['other-movement', 'gliding', 'underwater-sprint']) {
      run(effect, '队员当前状态 ' + movementMode, movementMode === active ? effect.amount : 0, stance('noelle', movementMode));
    }
    run(effect, '天赋来源本人', effect.amount, stance(entity, active));
  }
  const [xianyun] = proof.xianyun.effects;
  const [ororon] = proof.ororon.effects;
  const [dive] = proof.neuvillette.effects;
  run(xianyun, '两个滑翔天赋与水下冲刺在场', xianyun.amount, { lineup: [...gliders, 'neuvillette'], ...stance('ororon', 'gliding'), sourceEffects: [ororon, dive] });
  run(xianyun, '滑翔专用速度独立于通用速度', 0, { output: movement, lineup: [...gliders, 'neuvillette'], ...stance('ororon', 'gliding'), sourceEffects: [ororon, dive] });
  run(dive, '水下冲刺时不取得滑翔专用速度', 0, { output: glide, lineup: [...gliders, 'neuvillette'], ...stance('ororon', 'underwater-sprint'), sourceEffects: [xianyun, ororon] });

  const { effects: [gather, landing], range, gatherMs, landingMs } = proof.kinich;
  const collect = (time, qualifies = true) => event('gather-' + time, time, 'noelle', { 'kinich.specialGathering': bool(qualifies) });
  const land = (time, actor = 'kinich', qualifies = true) => event('landing-' + time, time, actor, { 'kinich.swingLanding': bool(qualifies) });
  const gatherSettings = (distance = range, area = true, recipient = 'noelle') => ({ recipient,
    team: { 'kinich.gatherInNatlanPhlogistonArea': bool(area) }, actors: { [recipient]: { 'kinich.gatherDistance': number('scalar', distance) } },
  });
  const trigger = collect(0);
  for (const [label, active, options] of [
    ['合格采集刚发生', true, { events: [trigger], now: 1 }],
    ['同一采集事件的生效前阶段', false, { current: trigger }],
    ['同一采集事件的生效后阶段', true, { current: trigger, phase: 'after' }],
    ['合格采集的最后一毫秒', true, { events: [trigger], now: gatherMs - 1 }],
    ['采集加速到期', false, { events: [trigger], now: gatherMs }],
    ['普通采集', false, { events: [collect(0, false)] }],
    ['采集时超出距离', false, { events: [trigger], ...gatherSettings(range + 0.01) }],
    ['采集时不在燃素机制区', false, { events: [trigger], ...gatherSettings(range, false) }],
    ['受益人可以是基尼奇本人', true, { events: [trigger], ...gatherSettings(range, true, 'kinich') }],
    ['再次采集刷新且数值只加一次', true, { events: [trigger, collect(1000)], now: 2000 }],
    ['第一段过期而刷新段仍存在', true, { events: [trigger, collect(1000)], now: gatherMs }],
    ['第二段亦过期', false, { events: [trigger, collect(1000)], now: gatherMs + 1000 }],
    ['无相应采集事件', false, {}],
    ['同一输入再次计算', true, { events: [trigger], now: 1 }],
  ]) run(gather, label, active ? gather.amount : 0, { ...gatherSettings(), ...options });

  for (const [label, active, options] of [
    ['一命本人摆荡落地', true, { events: [land(0)], now: 1 }],
    ['落地加速最后一毫秒', true, { events: [land(0)], now: landingMs - 1 }],
    ['落地加速到期', false, { events: [land(0)], now: landingMs }],
    ['尚未解锁一命', false, { events: [land(0)], constellation: 0 }],
    ['队友同一时段不获本人落地加速', false, { events: [land(0)], recipient: 'noelle' }],
    ['队友触发落地记录', false, { events: [land(0, 'noelle')] }],
    ['本人其他落地', false, { events: [land(0, 'kinich', false)] }],
  ]) run(landing, label, active ? landing.amount : 0, { constellation: 1, recipient: 'kinich', ...options });

  for (const { effects } of Object.values(proof)) for (const entry of effects) {
    const checks = rows.filter(row => row.effect === entry.effect);
    if (!checks.length || checks.some(row => row.issue)) continue;
    verified.add(entry.entity + entry.field);
    if (!resolved.some(row => row.entity === entry.entity && row.field === entry.clause)) {
      resolved.push({ entity: entry.entity, field: entry.clause, resolved: '按固定技能配置与本次编辑的条件计算实际移速或体力加成。' });
    }
  }
  if (characters.has('kinich')) {
    const needed = '仍需识别场景中各采集物是否发出 SpecialGathering，以及采集瞬间各队员的位置。条件计算接受实况确认的采集事件与距离。';
    gaps.push({ entity: 'kinich', field: gather.clause, kind: '历史与特殊交互', sources: gather.sources, needed, reason: needed });
  }
  return { rows, verified, resolved, gaps, summary: {
    movementSpeedClauseCases: rows.length, movementSpeedClauseMismatches: rows.filter(row => row.issue).length, verifiedMovementSpeedClauses: verified.size,
  } };
}
