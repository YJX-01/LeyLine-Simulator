import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact } from './roster-audit-settings.mjs';

const catalog = 'tools/data/sources/catalog/genshin-db/';
const evidencePath = 'tools/data/sources/catalog/equipment-recovery-remainders.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const { gameConfig, experiments } = read(evidencePath);
const charactersSource = read(catalog + 'characters.json');
const weaponsSource = read(catalog + 'weapons.json');
const setsSource = read(catalog + 'sets.json');
const characterCurves = read(catalog + 'character-curves.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const local = (file, path) => catalog + file + '.json#/' + path;
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const flag = value => value === null ? fact(null) : bool(value);
const owner = 'actor';
const peer = 'peer';

const aquila = {
  entity: 'aquilafavonia', field: '/buffs/1/modifiers/0', effect: 'aquilafavonia.falcon-healing',
  output: 'attribute.equipmentHealing', trigger: 'aquilafavonia.falconTriggered', scope: 'query', unit: 'hp',
};
const lucky = {
  entity: 'luckydog', field: '/effects/1/buffs/0/modifiers/0', effect: 'luckydog.mora-recovery',
  output: 'attribute.equipmentBaseHealingTick', trigger: 'luckydog.moraPicked', scope: 'owner', unit: 'hp',
};
const bell = {
  entity: 'thebell', field: '/buffs/1/modifiers/0', effect: 'thebell.triggered-shield',
  output: 'attribute.shieldAbsorption', trigger: 'thebell.rebelliousGuardianTriggered', scope: 'owner', unit: 'hp',
};
const bellDamage = {
  entity: 'thebell', field: '/buffs/0/modifiers/0', effect: 'thebell.shield-damage',
  output: 'attribute.damageBonus', unit: 'scalar',
};

export const equipmentRecoveryCharacterIds = ['jean', 'beidou', 'kaeya'];
export const equipmentRecoveryWeaponIds = ['aquilafavonia', 'thebell', 'dullblade', 'wastergreatsword'];
export const equipmentRecoverySetIds = ['luckydog', 'maidenbeloved', 'travelingdoctor', 'adventurer', 'retracingbolide'];

function requireSource(condition, entity) {
  if (!condition) throw new Error(entity + ' 的游戏配置、效果原文或实测索引不一致。');
}

function sourceNumber(description, pattern) {
  const value = Number(pattern.exec(description)?.[1]);
  if (!Number.isFinite(value)) throw new Error('效果原文缺少数值 ' + pattern.source);
  return value;
}

function configRefs(entity) {
  return Object.entries(gameConfig[entity]).flatMap(([key, { path }]) => [
    evidencePath + '#/gameConfig/' + entity + '/' + key,
    'https://gitlab.com/' + gameConfig.repository + '/-/blob/' + gameConfig.commit + '/' + path,
  ]);
}

function experimentRefs(entity) {
  const experiment = experiments[entity];
  return [evidencePath + '#/experiments/' + entity,
    'https://github.com/' + experiments.repository + '/blob/' + experiments.commit + '/' + experiment.path,
    ...(experiment.tests ? experiment.tests.map(test => test.recording) : [experiment.record, experiment.ownerScope.record])];
}

function weaponAffix(entry, rank) {
  const { affixes, ability } = gameConfig[entry.entity];
  const id = weaponsSource[entry.entity].metadata.id + 100000;
  const row = affixes.rows.find(row => (row.level ?? 0) === rank - 1);
  requireSource(row?.id === id && row.affixId === id * 10 + rank - 1
    && row.openConfig === ability.record.abilityName && affixes.rows.length === 5, entry.entity);
  return row;
}

function falconRates(rank) {
  const [attack, healing, damage, cooldown] = weaponAffix(aquila, rank).paramList;
  const { heal, damage: strike, targetPredicates, cooldown: clock } = gameConfig.aquilafavonia.ability.record;
  const description = weaponsSource.aquilafavonia.metadata['r' + rank].description;
  requireSource(heal.$type === 'HealHP' && heal.amountByCasterAttackRatio === 'H_Rate'
    && strike.$type === 'TriggerAttackEvent' && strike.targetType === 'Enemy' && strike.damagePercentage === 'D_Rate'
    && clock.$type === 'EquipAffixStart' && clock.cd === 'CDTime'
    && targetPredicates.some(test => test.$type === 'ByEquipAffixReady' && test.equipAffixDataID === clock.equipAffixDataID && test.target === 'Self')
    && targetPredicates.some(test => test.$type === 'ByHitDamage' && test.damage === 0)
    && attack === sourceNumber(description, /攻击力提高([\d.]+)%/) / 100
    && healing === sourceNumber(description, /恢复等同于攻击力的([\d.]+)%/) / 100
    && damage === sourceNumber(description, /造成([\d.]+)%攻击力的伤害/) / 100
    && cooldown === sourceNumber(description, /每(\d+)秒只能触发一次/), aquila.entity);
  return { attack, healing };
}

function bellRates(rank) {
  const [absorption, cooldown, damage] = weaponAffix(bell, rank).paramList;
  const ability = gameConfig.thebell.ability.record;
  const [shield] = ability.shield.modifierMixins;
  const [clock, attachment] = ability.cooldown;
  const description = weaponsSource.thebell.metadata['r' + rank].description;
  requireSource(ability.handler.predicates.some(test => test.$type === 'ByHitDamage' && test.damage === 0)
    && ability.handler.predicates.some(test => test.$type === 'ByEquipAffixReady' && test.equipAffixDataID === clock.equipAffixDataID && test.target === 'Self')
    && clock.$type === 'EquipAffixStart' && clock.cd === 'CDTime' && attachment.$type === 'AttachModifier'
    && shield.$type === 'EliteShieldMixin' && shield.shieldHPRatio === 'Rate' && shield.shieldType === 'default'
    && shield.onShieldBroken.some(action => action.$type === 'RemoveUniqueModifier' && action.modifierName === attachment.modifierName)
    && ability.damage.damagePercentageRatio === 'Dmg_Rate'
    && ability.damage.predicates.some(test => test.$type === 'ByHasShield' && test.target === 'Self' && test.type === 'All')
    && experiments.thebell.shields.includes('crystallize')
    && absorption === sourceNumber(description, /生命值上限([\d.]+)%/) / 100
    && cooldown === sourceNumber(description, /每(\d+)秒只能触发一次/)
    && ability.shield.duration === sourceNumber(description, /持续(\d+)秒/)
    && damage === sourceNumber(description, /造成的伤害提升([\d.]+)%/) / 100, bell.entity);
  return { absorption, damage };
}

function luckyRecovery() {
  const { affixes, ability, set, mora } = gameConfig.luckydog;
  const [affix] = affixes.rows;
  const [event] = ability.record.abilityMixins;
  const [action] = ability.record.modifiers[event.actions[0].modifierName].onAdded;
  const [hp] = affix.paramList;
  requireSource(set.record.setId === setsSource.luckydog.id && set.record.equipAffixId === affix.id
    && set.record.setNeedNum[affix.level] === 4 && affix.openConfig === ability.record.abilityName
    && event.onEvent === 'PickItem' && event.type === 'Current' && event.pickItemConfigIDs.includes(mora.record.id)
    && mora.record.itemJsonName === 'Default_Mora' && action.$type === 'HealHP' && action.amount === 'HealAmount'
    && hp === sourceNumber(setsSource.luckydog.effect4Pc, /恢复(\d+)点生命值/), lucky.entity);
  return hp;
}

function stats(build, stat) {
  const character = charactersSource[build.character.id].stats;
  const weapon = weaponsSource[build.weapon.id].stats;
  const growth = character.promotion[build.ascension];
  const characterWhite = character.base[stat] * characterCurves[build.level][character.curve[stat]] + growth[stat];
  const weaponWhite = weapon.base.attack * weaponCurves[build.weaponLevel][weapon.curve.attack] + weapon.promotion[build.weaponAscension].attack;
  return {
    white: characterWhite + (stat === 'attack' ? weaponWhite : 0),
    weaponPercent: weapon.specialized === 'FIGHT_PROP_HP_PERCENT' ? weapon.base.specialized * weaponCurves[build.weaponLevel][weapon.curve.specialized] : 0,
    outgoing: character.specialized === 'FIGHT_PROP_HEAL_ADD' ? growth.specialized : 0,
    sources: [local('characters', build.character.id + '/stats'), local('character-curves', build.level),
      local('weapons', build.weapon.id + '/stats'), local('weapon-curves', build.weaponLevel)],
  };
}

/** Tests confirmed recovery and shield grants through the current attribute evaluator. */
export function auditEquipmentRecoveryRemainders(entities, engine) {
  const [characters, weapons, sets] = ['characters', 'weapons', 'sets'].map(group => new Map(entities[group].map(entry => [entry.id, entry])));
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const maiden = sourceNumber(setsSource.maidenbeloved.effect2Pc, /治疗效果提升(\d+)%/) / 100;
  const doctor = sourceNumber(setsSource.travelingdoctor.effect2Pc, /受到的治疗效果提高(\d+)%/) / 100;
  const adventurer = sourceNumber(setsSource.adventurer.effect2Pc, /生命值上限提高(\d+)点/);
  const bolide = sourceNumber(setsSource.retracingbolide.effect2Pc, /护盾强效提高(\d+)%/) / 100;
  const ae = experiments.aquilafavonia.tests;
  requireSource(ae[0].incoming === 0 && ae[0].outgoing === 0
    && ae.every(test => Math.abs(test.restored - ae[0].restored * (1 + test.incoming + test.outgoing)) < 1), aquila.entity);

  function member(character, weapon, gear = {}, overrides = {}) {
    if (!characters.has(character) || !weapons.has(weapon) || Object.keys(gear).some(id => !sets.has(id))) return null;
    const chosen = Object.keys(gear).map(id => sets.get(id));
    let offset = 0;
    const theoreticalSetSlots = chosen.flatMap(set => {
      const selected = set.slots.slice(offset, offset + gear[set.id]);
      offset += gear[set.id];
      return selected.map(slot => ({ slot, setId: set.id }));
    });
    return { ...auditBuild(characters.get(character), weapons.get(weapon), chosen), ...overrides, theoreticalSetSlots };
  }

  function exercise(build, teammate, run) {
    if (!build || !teammate) return;
    const prepared = engine.prepareStructuredBuilds([{ id: owner, build }, { id: peer, build: teammate }]);
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
    const { team } = prepared;
    const granted = new Set(engine.grantedBuildEffects(build).map(({ effect }) => (effect.buff ?? effect.identity).id));
    run((entry, sources, expected, probe, { recipient = owner, active = true, applied = true, shielded = false, pieces,
      peerTriggered = true, companionRead } = {}) => {
      const character = recipient === owner ? build.character : teammate.character;
      const talent = character.talents[0], hit = talent.hits.find(hit => hit.category === 'normal');
      const { setup, request } = auditHit(character, talent, hit);
      setup.events.find(event => event.id === 'hit').actorId = recipient;
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
        hit: { skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, family: 'ordinary', origin: hit.origin, reactionId: null } };
      const subjects = new Map([owner, peer].map(id => [id, id === owner ? request.frame.factOverrides[0].facts : {}]));
      for (const [id, values] of subjects) Object.assign(values, { onField: bool(id === recipient), shielded: flag(id === recipient ? shielded : false) });
      if (build.character.id === 'beidou') subjects.get(owner)['beidou.tidecallerGuard'] = bool(false);
      if (entry.scope === 'query') frame.facts[entry.trigger] = flag(active);
      if (entry.scope === 'owner') {
        subjects.get(owner)[entry.trigger] = flag(active);
        subjects.get(peer)[entry.trigger] = bool(peerTriggered);
      }
      frame.factOverrides = [...subjects].map(([id, facts]) => ({ subject: { kind: 'actor', id }, facts }));
      if (entry.trigger && recipient === owner && applied !== null && granted.has(entry.effect)) {
        frame.applications = [{ instanceId: engine.calculationEffectInstanceId(owner, ref(entry.effect), null), active: applied }];
      }
      const context = engine.createStructuredCombatContext(team, setup);
      const key = output => ({ kind: 'attribute', actor: { role: 'recipient' }, key: ref(output), at: { kind: 'current', phase: 'same' } });
      const bindings = { value: key(entry.output) };
      if (companionRead) bindings.companion = key(companionRead.output);
      const reading = engine.evaluateCombatBindings(team.program, context, bindings, frame);
      const output = reading.outputs.value, state = output?.state ?? 'missing';
      const value = state === 'known' && output.value.kind === 'quantity' && output.value.unit === entry.unit ? output.value.value : null;
      const other = reading.outputs.companion;
      const accepts = expected === null ? state === 'unknown' : value !== null && Math.abs(value - expected) < 1e-8;
      const companionMatches = !companionRead || (other?.state === 'known' && other.value.kind === 'quantity'
        && other.value.unit === companionRead.unit && Math.abs(other.value.value - companionRead.expected) < 1e-8);
      rows.push({ ...entry, sources, probe, recipient, refinement: build.refinement, pieces, expected, value, state,
        ...(accepts && companionMatches ? {} : { issue: '装备当次数值、单位或适用条件与独立来源不符', diagnostics: reading.diagnostics }) });
    });
  }

  function confirm(entry, resolution, gap) {
    const matching = rows.filter(row => row.entity === entry.entity && row.field === entry.field);
    if (!matching.length || matching.some(row => row.issue)) return;
    const { entity, field, output } = entry;
    const sources = [...new Set(matching.flatMap(row => row.sources))];
    verified.add(entity + field);
    resolved.push({ entity, field, output, sources, resolved: resolution, remaining: gap });
    if (gap) gaps.push({ entity, field, output, sources, reason: gap });
  }

  const teammate = member('kaeya', 'dullblade', { maidenbeloved: 2, travelingdoctor: 2 });
  for (let refinement = 1; weapons.has(aquila.entity) && refinement <= 5; refinement++) {
    const { attack, healing } = falconRates(refinement);
    for (const [probe, gear, levels, bonus] of [
      ['普通攻击旁查询', {}, {}, 0], ['仅治疗加成', { maidenbeloved: 2 }, {}, maiden],
      ['仅受治疗加成', { travelingdoctor: 2 }, {}, doctor], ['角色成长与两项加成',
        { maidenbeloved: 2, travelingdoctor: 2 }, { level: 40, ascension: 2, weaponLevel: 40, weaponAscension: 2 }, maiden + doctor],
    ]) {
      const build = member('jean', aquila.entity, gear, { refinement, ...levels });
      if (!build) continue;
      const panel = stats(build, 'attack');
      const sources = [local('weapons', aquila.entity + '/metadata/r' + refinement + '/description'), ...configRefs(aquila.entity),
        ...experimentRefs(aquila.entity), ...panel.sources, local('sets', 'maidenbeloved/effect2Pc'), local('sets', 'travelingdoctor/effect2Pc')];
      exercise(build, teammate, check => {
        check(aquila, sources, panel.white * (1 + attack) * healing * (1 + panel.outgoing + bonus), probe);
        if (probe !== '普通攻击旁查询') return;
        check(aquila, sources, 0, '队友不受益', { recipient: peer });
        check(aquila, sources, 0, '不能触发', { active: false });
        check(aquila, sources, null, '触发未知', { active: null });
        check(aquila, sources, 0, '本次排除', { applied: false });
        check(aquila, sources, null, '是否应用未知', { applied: null });
      });
    }
  }
  if (weapons.has(aquila.entity)) exercise(member('jean', 'dullblade'), teammate, check => {
    check(aquila, configRefs(aquila.entity), 0, '未装备风鹰剑');
  });
  confirm(aquila, '同一承伤触发授予独立物理输出及持有者回复，回复按五阶攻击力倍率叠加治疗和受治疗加成。',
    '受击判定、15秒限次自动推进及缺失生命值限制后的实际恢复待接入。');

  if (sets.has(lucky.entity)) {
    const hp = luckyRecovery();
    for (const pieces of [0, 1, 2, 3, 4, 5]) for (const [level, ascension] of [[1, 0], [90, 6]]) {
      const build = member('jean', 'dullblade', { luckydog: pieces }, { level, ascension });
      const sources = [local('sets', 'luckydog/effect4Pc'), ...configRefs(lucky.entity), local('characters', 'jean/stats')];
      exercise(build, teammate, check => {
        check(lucky, sources, pieces >= 4 ? hp : 0, '摩拉拾取', { pieces });
        check(lucky, sources, 0, '队友不受益', { recipient: peer, pieces });
        check(lucky, sources, 0, '持有者未拾取', { active: false, pieces });
        check(lucky, sources, pieces >= 4 ? null : 0, '拾取未知', { active: null, pieces });
        check(lucky, sources, 0, '本次排除', { applied: false, pieces });
      });
    }
    confirm(lucky, '四件或五件持有者拾取指定摩拉掉落时，计算一次300点的基础回复。',
      '连续掉落拾取、治疗加成及实际恢复量尚无独立对照，拾取自动触发待接入。');
  }

  for (let refinement = 1; weapons.has(bell.entity) && refinement <= 5; refinement++) {
    const { absorption, damage } = bellRates(refinement);
    for (const [probe, gear, levels, flat, strength] of [
      ['基础配装', {}, {}, 0, 0], ['生命成长与已有护盾强效', { adventurer: 2, retracingbolide: 2 },
        { level: 40, ascension: 2, weaponLevel: 40, weaponAscension: 2 }, adventurer, bolide],
    ]) {
      const build = member('beidou', bell.entity, gear, { refinement, ...levels });
      if (!build) continue;
      const panel = stats(build, 'hp');
      const sources = [local('weapons', bell.entity + '/metadata/r' + refinement + '/description'), ...configRefs(bell.entity),
        ...experimentRefs(bell.entity), ...panel.sources, local('sets', 'adventurer/effect2Pc'), local('sets', 'retracingbolide/effect2Pc')];
      exercise(build, teammate, check => {
        const companionRead = { output: 'attribute.shieldStrength', expected: strength, unit: 'scalar' };
        check(bell, sources, (panel.white * (1 + panel.weaponPercent) + flat) * absorption, probe, { companionRead });
        if (probe !== '基础配装') return;
        check(bell, sources, 0, '队友不受益', { recipient: peer, shielded: true });
        check(bell, sources, 0, '已有其他盾但本次未触发钟剑', { active: false, shielded: true });
        check(bell, sources, null, '触发未知', { active: null });
        check(bell, sources, 0, '本次排除', { applied: false });
        check(bell, sources, null, '是否应用未知', { applied: null });
        check(bellDamage, sources, damage, '已有其他护盾', { shielded: true });
        check(bellDamage, sources, 0, '没有护盾', { shielded: false });
        check(bellDamage, sources, null, '护盾是否存在未知', { shielded: null });
        check(bellDamage, sources, 0, '队友独自获得其他护盾', { recipient: peer, shielded: true });
      });
    }
  }
  if (weapons.has(bell.entity)) exercise(member('beidou', 'wastergreatsword'), teammate, check => {
    check(bell, configRefs(bell.entity), 0, '未装备钟剑');
    check(bellDamage, configRefs(bell.entity), 0, '未装备钟剑但有盾', { shielded: true });
  });
  confirm(bell, '护主盾保护持有者，初始吸收量按五阶比例计算。护盾有效至10秒或提前破盾，45秒限次。',
    '承伤触发及冷却、换人后的盾实例存续与消退、护盾强效交互和实际吸收待接入及核对。');
  confirm(bellDamage, '持有者现有护盾时按精炼增加伤害，任何实际护盾均适用。', null);

  return { rows, verified, resolved, gaps, summary: { equipmentRecoveryCases: rows.length,
    equipmentRecoveryMismatches: rows.filter(row => row.issue).length, verifiedEquipmentRecoveryFields: verified.size,
    equipmentRecoveryGaps: gaps.length } };
}
