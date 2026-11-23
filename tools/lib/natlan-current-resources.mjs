import { readContentSource } from './content-source.mjs';
import { auditBuild, bool, fact, novice, number } from './roster-audit-settings.mjs';

const upstream = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const game = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/natlan-current-resources.json';
const motion = 'https://www.youtube.com/watch?v=y-aHYuKiIpk&t=20s';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const clause = '/passives/3';
const anchor = 'passive4';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const sceneTypes = 'SCENE_WORLD,SCENE_ROOM';
const areaKey = 'natlanPhlogistonArea';
const sceneKey = 'natlan.worldOrRoom';
const ifaKeys = { dragon: 'ifa.indweltSaurian', ready: 'ifa.saurianHealReady', ratio: 'ifa.saurianHpRatio',
  health: 'ifa.saurianMaxHp', fuel: 'ifa.saurianAvailablePhlogiston' };
const varesaKeys = { food: 'varesa.partyFoodUsed', ready: 'varesa.foodPhlogistonReady',
  sprint: 'varesa.ordinarySprint', outside: 'varesa.outOfCombatSprint' };
const flag = value => value === null ? fact(null) : bool(value);
const quantity = (unit, value) => value === null ? fact(null) : number(unit, value);

export const natlanCurrentCharacterIds = ['ifa', 'varesa', 'barbara'];
export const natlanCurrentWeaponIds = ['apprenticesnotes'];

function proof(entity, passive, source) {
  const paths = ['ChineseSimplified', 'English'].map(language => upstream + language + '/talents/' + entity + '.json');
  const [zh, en] = paths.map(path => read(path)[anchor]);
  const ability = source.ability.record;
  const values = source.passive.record.paramList;
  const sources = [...paths.map(path => path + '#' + anchor), game + '#/' + entity];
  if (passive.name !== zh.name || passive.description !== zh.description
    || ability.abilityName !== 'Avatar_' + source.passive.record.openConfig
    || !en.description.includes('Domains, Trounce Domains, or the Spiral Abyss')) {
    throw new Error(entity + ' 的固定客户端天赋和运行时天赋不符。');
  }
  if (entity === 'ifa') {
    const [threshold, fuel, rate, seconds] = values;
    const condition = ability.handler.onThinkInterval;
    const matches = ['successActions', 'failActions'].every(branch => {
      const { targetPredicates, successActions } = condition[branch][0];
      return targetPredicates.some(p => p.$type === 'ByCurrentSceneTypes' && p.sceneTypes.join() === sceneTypes)
        && targetPredicates.some(p => p.$type === 'ByAvatarInVehicleType' && p.vehicleTypes.join() === 'Natsaurus')
        && targetPredicates.some(p => p.$type === 'ByTargetHPRatio' && p.logic === 'Lesser' && p.target === 'TargetVehicle'
          && p.hpRatio === 'PermanentSkill_4_LimitHpRatio')
        && targetPredicates.some(p => p.logic === 'GreaterOrEqual' && p.targetType === 'Team' && p.value === 'PermanentSkill_4_PhlogistonCost')
        && targetPredicates.some(p => p.$type === 'ByNot' && p.predicates.some(item => item.target === 'Team'
          && item.modifierName === 'UNIQUE_PermanentSkill_4_HealCD'))
        && successActions.some(a => a.target === 'TargetVehicle' && a.modifierName === 'Avatar_Ifa_PermanentSkill_4_HealHP_OnVehicle');
    });
    const heal = ability.vehicleHeal.onAdded[0];
    if (!matches || heal.$type !== 'HealHP' || heal.amountByTargetMaxHPRatio !== 'PermanentSkill_4_HealAmount'
      || ability.sharedCooldown.duration !== 'PermanentSkill_4_HealCD' || !zh.description.includes('受魂附的龙')
      || !en.description.includes('indwelt saurian') || !zh.description.includes(`低于${threshold * 100}%`)
      || !zh.description.includes(`消耗${fuel}点燃素为其恢复${rate * 100}%生命值`) || !zh.description.includes(`每${seconds}秒`)) {
      throw new Error('伊法的受魂附龙分支与固定来源不符。');
    }
    return { sources, threshold, fuel, rate, seconds };
  }
  const [restored, seconds] = values;
  const mixin = ability.teamFood.modifierMixins[0];
  const [restore, cooldown] = mixin.JNPBJINDLEJ;
  const flags = source.combatFlag.record.modifier;
  const costMixin = ability.abilityMixins[0];
  const { Actor_CostDashBsStaminaDelta: start, Actor_CostDashStaminaDelta: sustain } = ability.dashCost.properties;
  if (mixin.$type !== 'TeamAvatarEatMixin' || restore.$type !== 'ChangePhlogiston' || restore.MEMACNMBBDG !== 'Add'
    || restore.value !== 'Phlogiston' || ![restore, cooldown].every(action => action.doOffStage
      && action.predicates.some(p => p.$type === 'ByTargetInArea' && p.areas.join() === String(source.area.record.areaID1))
      && action.predicates.some(p => p.$type === 'ByCurrentSceneTypes' && p.sceneTypes.join() === sceneTypes)
      && action.predicates.some(p => p.key === ability.teamFoodTimer.onAdded[0].key && p.value === 0))
    || cooldown.modifierName !== 'UNIQUE_Avatar_Varesa_PermanentSkill_4_TeamAvatarEat_Timer' || ability.teamFoodTimer.duration !== 'Time'
    || costMixin.$type !== 'AttachModifierToGlobalValueMixin' || costMixin.modifierNameSteps.join() !== 'Avatar_Varesa_PermanentSkill_4_DashStaminaCostUp'
    || costMixin.valueSteps.join() !== '-0.5,0.5' || flags.onAdded[0].key !== costMixin.globalValueKey
    || flags.onAdded[0].value !== 1 || flags.onRemoved[0].value !== 0 || ![start, sustain].every(Number.isFinite)
    || !zh.description.includes(`自己的角色使用食物能恢复${restored}点燃素`) || !zh.description.includes(`每${seconds}秒`)
    || !en.description.includes('When she is not in combat, her Sprint Stamina consumption will also increase.')) {
    throw new Error('瓦雷莎的食物或非战斗冲刺条件与固定来源不符。');
  }
  return { sources, restored, seconds, start, sustain };
}

export function auditNatlanCurrentResources(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const build = character => auditBuild(character, weapons.get(novice[character.identity.weaponType]));
  const catalog = read(game);
  const peer = characters.get('barbara');

  for (const entity of ['ifa', 'varesa']) {
    const holder = characters.get(entity);
    if (!holder || !peer) continue;
    const passive = holder.metadata.passives[3];
    const evidence = proof(entity, passive, catalog[entity]);
    const { sources } = evidence;
    const teams = new Map();
    function trial(passiveBuff, modifierIndex, unit, label, expected, options = {}) {
      const { owner = 'actor', recipient = owner, eventActor = recipient, area = true, scene = true, values = {}, prior = {}, extraSources = [] } = options;
      const buff = passive.buffs[passiveBuff], modifier = buff.modifiers[modifierIndex];
      const effect = modifierIndex === 0 ? buff.id : buff.id + '.' + modifierIndex;
      const output = modifier.target, field = clause + `/buffs/${passiveBuff}/modifiers/${modifierIndex}`;
      if (!teams.has(owner)) {
        const prepared = engine.prepareStructuredBuilds([{ id: owner, build: build(holder) }, { id: owner === 'actor' ? 'peer' : 'actor', build: build(peer) }]);
        if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
        teams.set(owner, prepared.team);
      }
      const team = teams.get(owner);
      const event = (id, order, facts) => ({ id, kind: 'state-change', actorId: eventActor, targetIds: [], timeMs: order, order, sourceEventIds: [], facts });
      const setup = { team: { facts: { [areaKey]: flag(area) }, inputs: {}, actorFacts: {} },
        targets: [{ id: 'enemy', inputs: {}, facts: {} }], sources: [], factIntervals: [],
        events: [event('previous', 0, prior), event('current', 1, { [sceneKey]: flag(scene), ...values })] };
      const frame = { eventId: 'current', targetId: 'enemy', sourceEventId: null, phase: 'before', ownerId: recipient, recipientId: recipient,
        contributorId: null, hit: null, facts: {}, actorFacts: {}, factOverrides: [], applications: [], captures: {} };
      const binding = { kind: 'attribute', actor: { role: 'recipient' }, key: ref(output), at: { kind: 'current', phase: 'same' } };
      const result = engine.evaluateCombatBindings(team.program, engine.createStructuredCombatContext(team, setup), { value: binding }, frame);
      const measured = result.outputs.value;
      const status = measured?.state ?? 'missing', expectedStatus = expected === null ? 'unknown' : 'known';
      const contribution = result.trace.find(node => node.kind === 'effect' && node.definition.id === effect
        && node.context?.eventId === frame.eventId && node.context.actorId === owner && node.context.recipientId === recipient);
      const value = status === 'known' && measured.value.kind === 'quantity' && measured.value.unit === unit ? measured.value.value : null;
      const correctEffect = expected === 0 ? !contribution : contribution?.state === expectedStatus;
      const matches = status === expectedStatus && correctEffect && (expected === null ? value === null : value !== null && Math.abs(value - expected) < 1e-9);
      rows.push({ entity, clause, field, output, effect, unit, sources: [...sources, ...extraSources],
        probe: { label, owner, recipient, eventActor, area, scene, values, prior }, expected, expectedStatus, value, status,
        ...!matches && { issue: '当次资源、受益归属或非战斗冲刺参数不符', diagnostics: result.diagnostics } });
    }

    if (entity === 'ifa') {
      const { rate, threshold, fuel, seconds } = evidence;
      const dragonSource = game + '#/saurianHpInputExamples';
      const { gadget, properties, curve } = catalog.saurianHpInputExamples;
      if (gadget.record.type !== 'Vehicle' || gadget.record.jsonName !== 'Natsaurus_Drillhead_Vehicle_01' || gadget.record.id !== properties.record.id
        || curve.records.some(row => row.curve.arith !== 'ARITH_MULTI' || row.curve.type !== properties.record.hpCurve)) {
        throw new Error('固定嵴锋龙生命记录与属性曲线不符。');
      }
      const [levelOneHp, levelNinetyHp] = curve.records.map(row => properties.record.hp * row.curve.value);
      const check = (label, { maxHp = levelNinetyHp, ratio = threshold - .01, teamFuel = fuel, dragon = true, ready = true, ...options } = {},
        expected = maxHp * rate) => trial(0, 0, 'hp', label, expected, { ...options, extraSources: [dragonSource], values: {
          [ifaKeys.dragon]: flag(dragon), [ifaKeys.ready]: flag(ready), [ifaKeys.ratio]: quantity('scalar', ratio),
          [ifaKeys.health]: quantity('hp', maxHp), [ifaKeys.fuel]: quantity('count', teamFuel),
        } });
      check('受魂附的一级龙，伊法仍可在后台继续提供治疗', { maxHp: levelOneHp, eventActor: 'peer' });
      check('受魂附的九十级龙，队伍恰有十点燃素', { owner: 'peer', eventActor: 'actor' });
      check('恰好40%生命', { ratio: threshold }, 0);
      check('超过40%生命', { ratio: threshold + .01 }, 0);
      check('燃素少一单位', { teamFuel: fuel - 1 }, 0);
      check('未魂附或不是自己的魂附', { dragon: false }, 0);
      check('队伍限次未就绪', { ready: false }, 0);
      check('位于秘境、征讨领域或深境螺旋', { scene: false }, 0);
      check('区域没有纳塔燃素机制', { area: false }, 0);
      check('龙的数值无需归到当前队友面板', { recipient: 'peer' }, 0);
      for (const key of ['area', 'scene', 'maxHp', 'ratio', 'teamFuel', 'dragon', 'ready']) check('缺少当次 ' + key, { [key]: null }, null);
      check('来源不符合时无需最大生命值', { dragon: false, maxHp: null }, 0);
      resolved.push({ entity, field: clause,
        resolved: `已确定的魂附龙在符合场景、燃素至少${fuel}点、低于${threshold * 100}%生命且${seconds}秒限次就绪时，按该龙生命上限的${rate * 100}%给出基础回复量。`,
        remaining: '需要自动跟踪受魂附生物生命、1秒资格检测、队伍共享限次及燃素扣除。' });
      gaps.push({ entity, field: clause, status: 'needs-evidence', sources,
        reason: '需要受魂附龙治疗的实际到账、治疗加成、受治疗加成和舍入对照，以及六命非战斗夜魂状态下实际燃素扣除的对照。' });
    } else {
      const { restored, seconds, start, sustain } = evidence;
      const food = (label, { used = true, ready = true, ...options } = {}, expected = restored) => trial(0, 0, 'count', label, expected,
        { ...options, values: { [varesaKeys.food]: flag(used), [varesaKeys.ready]: flag(ready) } });
      food('瓦雷莎使用食物');
      food('队友使用食物，瓦雷莎在后台', { recipient: 'peer' });
      food('另一位置的瓦雷莎，其队友在符合条件的普通室内使用食物', { owner: 'peer', eventActor: 'actor' });
      food('其他队伍使用食物', { used: false }, 0);
      food('队伍未使用食物', { used: false }, 0);
      food('燃素回充限次未就绪', { ready: false }, 0);
      food('位于秘境、征讨领域或深境螺旋', { scene: false }, 0);
      food('区域没有纳塔燃素机制', { area: false }, 0);
      food('食物使用归属未知', { used: null }, null);
      food('场景未知', { scene: null }, null);
      food('区域燃素机制未知', { area: null }, null);
      food('限次未知', { ready: null }, null);
      food('上一事件可以触发，本次食物事实未知', { used: null, prior: { [varesaKeys.food]: flag(true) } }, null);
      for (const [index, unit, amount] of [[0, 'stamina', start], [1, 'staminaPerSecond', sustain]]) {
        const sprint = (label, { ordinary = true, outside = true, ...options } = {}, expected = amount) => trial(1, index, unit, label, expected,
          { ...options, values: { [varesaKeys.sprint]: flag(ordinary), [varesaKeys.outside]: flag(outside) } });
        sprint('瓦雷莎非战斗普通冲刺', { area: false });
        sprint('瓦雷莎战斗中普通冲刺', { outside: false }, 0);
        sprint('瓦雷莎突驰烈进', { ordinary: false }, 0);
        sprint('队友的冲刺不继承加值', { recipient: 'peer' }, 0);
        sprint('当前移动种类未知', { ordinary: null }, null);
        sprint('当前战斗状态未知', { outside: null }, null);
      }
      resolved.push({ entity, field: clause,
        resolved: `自己的队员在合格的纳塔燃素场景使用食物时，给出本次${restored}点名义回充。瓦雷莎非战斗普通冲刺起步额外消耗${start}点，持续冲刺额外消耗${sustain}点/秒。`,
        remaining: `需要自动识别食物使用、${seconds}秒限次、燃素上限及实际回充，并跟踪冲刺阶段和战斗标记。` });
      gaps.push({ entity, field: clause, status: 'needs-evidence', sources: [...sources, motion],
        reason: '缺少普通冲刺速度对同体型基础速度的可复核倍率或固定速度函数，以及有其他体力修正时两种消耗加值的叠加顺序。' });
    }
    if (rows.some(row => row.entity === entity && row.issue)) {
      resolved.pop();
      gaps.pop();
      continue;
    }
    for (const row of rows.filter(row => row.entity === entity)) verified.add(entity + row.field);
    const remaining = resolved.at(-1).remaining;
    gaps.push({ entity, field: clause, status: 'timeline-only', sources, reason: remaining });
  }

  return { rows, verified, resolved, gaps, summary: { natlanCurrentResourceCases: rows.length,
    natlanCurrentResourceMismatches: rows.filter(row => row.issue).length, verifiedNatlanCurrentResources: verified.size } };
}
