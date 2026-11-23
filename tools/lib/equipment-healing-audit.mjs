import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number } from './roster-audit-settings.mjs';

const catalogRoot = 'tools/data/sources/catalog/genshin-db/';
const kqmPath = 'tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/equipment-healing-facts.json';
const adventurerTextPath = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/English/artifacts/adventurer.json';
const adventurerConfigPath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/equipment-healing-facts.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const weaponSource = read(catalogRoot + 'weapons.json');
const setSource = read(catalogRoot + 'sets.json');
const characterSource = read(catalogRoot + 'characters.json');
const curves = read(catalogRoot + 'character-curves.json');
const kqm = read(kqmPath);
const pinned = path => `https://github.com/${kqm.source.repository}/blob/${kqm.source.commit}/${path}`;
const local = (file, pointer) => catalogRoot + file + '.json#/' + pointer;
const rate = (description, pattern) => Number(pattern.exec(description)?.[1]) / 100;
const ratio = (set, field, pattern) => rate(setSource[set][field], pattern);
const units = { equipmentHealing: 'hp', equipmentBaseHealingTotal: 'hp', equipmentBaseHealingTick: 'hp',
  directEnergyRestored: 'energy', incomingHealingBonus: 'scalar', hp: 'hp', energyRecharge: 'scalar' };
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const bindings = Object.fromEntries(Object.keys(units).map(stat => [stat, { kind: 'attribute', actor: { role: 'recipient' },
  key: ref('attribute.' + stat), at: { kind: 'current', phase: 'same' } }]));
const weaponCases = [
  ['otherworldlystory', 'lisa', 'particleHealing', /^获得元素微粒或元素晶球时，恢复([\d.]+)%生命值。$/],
  ['recurvebow', 'amber', 'defeatHealing', /^击败敌人时，恢复([\d.]+)%生命值。$/],
  ['travelershandysword', 'kaeya', 'particleHealing', /^获得元素晶球或元素微粒时，恢复([\d.]+)%生命值。$/],
  ['whiteirongreatsword', 'noelle', 'defeatHealing', /^击败敌人时，恢复([\d.]+)%生命值。$/],
];
const healingField = '/buffs/0/modifiers/0';
const energyField = '/buffs/0/modifiers/1';
const fourPieceField = '/effects/1/buffs/0/modifiers/0';
const twoPieceField = '/effects/0/buffs/0/modifiers/0';
const adventurerHp = Number(/生命值上限提高(\d+)点/.exec(setSource.adventurer.effect2Pc)?.[1]);
const [, adventurerPercent, adventurerDuration] = /^Opening a chest regenerates (\d+)% Max HP over (\d+)s\.$/.exec(read(adventurerTextPath).effect4Pc) ?? [];
const { adventurer: adventurerConfig, source: configSource } = read(adventurerConfigPath);
const adventurerRecoverySources = [adventurerTextPath + '#/effect4Pc', local('sets', 'adventurer/effect4Pc'), pinned(kqm.adventurer.path),
  ...Object.entries(adventurerConfig).flatMap(([key, { path }]) => [adventurerConfigPath + '#/adventurer/' + key,
    `https://gitlab.com/${configSource.repository}/-/blob/${configSource.commit}/${path}`])];
const doctorBonus = ratio('travelingdoctor', 'effect2Pc', /受到的治疗效果提高(\d+)%/);
const maidenBonus = ratio('maidenbeloved', 'effect2Pc', /治疗效果提升(\d+)%/);
const exileBonus = ratio('theexile', 'effect2Pc', /元素充能效率提高(\d+)%/);
const doctorRate = ratio('travelingdoctor', 'effect4Pc', /施放元素爆发时，恢复(\d+)%生命值/);

export const equipmentHealingCharacterIds = ['amber', 'barbara', 'jean', 'kaeya', 'lisa', 'noelle'];
export const equipmentHealingWeaponIds = [...weaponCases.map(([id]) => id), 'prototypeamber', 'dullblade', 'apprenticesnotes', 'huntersbow'];
export const equipmentHealingSetIds = ['adventurer', 'travelingdoctor', 'maidenbeloved', 'theexile'];

function configured(character, weapon, setPieces, options = {}) {
  const build = { ...auditBuild(character, weapon, setPieces.map(([set]) => set)), ...options };
  let offset = 0;
  build.theoreticalSetSlots = setPieces.flatMap(([set, pieces]) => {
    const selected = set.slots.slice(offset, offset + pieces);
    offset += pieces;
    return selected.map(slot => ({ slot, setId: set.id }));
  });
  return build;
}

function sourceHp(build) {
  const source = characterSource[build.character.id].stats;
  const weapon = weaponSource[build.weapon.id].stats;
  const white = source.base.hp * curves[build.level][source.curve.hp] + source.promotion[build.ascension].hp;
  const weaponHp = weapon.specialized === 'FIGHT_PROP_HP_PERCENT' ? weapon.base.specialized : 0;
  const hasAdventurer = build.theoreticalSetSlots.filter(slot => slot.setId === 'adventurer').length >= 2;
  return white * (1 + weaponHp) + (hasAdventurer ? adventurerHp : 0);
}

function sourceOutgoing(build) {
  const source = characterSource[build.character.id].stats;
  const own = source.specialized === 'FIGHT_PROP_HEAL_ADD' ? source.promotion[build.ascension].specialized : 0;
  return own + (build.theoreticalSetSlots.filter(slot => slot.setId === 'maidenbeloved').length >= 2 ? maidenBonus : 0);
}

const sourceIncoming = build => build.theoreticalSetSlots.filter(slot => slot.setId === 'travelingdoctor').length >= 2 ? doctorBonus : 0;
const nominal = (owner, recipient, fraction) => sourceHp(recipient) * fraction * (1 + sourceOutgoing(owner) + sourceIncoming(recipient));
const growthSources = (owner, recipient) => [...new Set([owner, recipient].flatMap(build => [local('characters', build.character.id + '/stats'), local('character-curves', build.level)])),
  local('sets', 'maidenbeloved/effect2Pc'), local('sets', 'travelingdoctor/effect2Pc')];

function adventurerTick() {
  const { set, affix, ability } = adventurerConfig;
  const [duration, interval, ratio] = affix.record.paramList;
  const { abilityName, abilityMixins: [event], modifiers } = ability.record.Default;
  const modifier = modifiers[event.actions[0].modifierName];
  const [heal] = modifier.onThinkInterval;
  if (set.record.setId !== setSource.adventurer.id || set.record.setNeedNum[affix.record.level] !== 4
    || set.record.equipAffixId !== affix.record.id || affix.record.openConfig !== abilityName || event.onEvent !== 'ChestOpen'
    || modifier.duration[0] !== 'HealDuration' || modifier.thinkInterval !== 'HealInterval'
    || heal.$type !== 'HealHP' || heal.amountByTargetMaxHPRatio !== 'HealRatio'
    || duration !== Number(adventurerDuration) || !Number.isInteger(duration / interval)
    || Math.abs(duration / interval * ratio - Number(adventurerPercent) / 100) >= 1e-8) {
    throw new Error('冒险家四件套的探索回复配置与原文不一致。');
  }
  return { interval, ratio };
}

/** Compares confirmed amounts and inactive, pending and excluded inputs against independent sources. */
export function auditEquipmentHealing(entities, engine) {
  const rows = [], gaps = [], verified = new Set();
  const characters = new Map(entities.characters.map(entry => [entry.id, entry]));
  const weapons = new Map(entities.weapons.map(entry => [entry.id, entry]));
  const sets = new Map(entities.sets.map(entry => [entry.id, entry]));
  const doctor = sets.get('travelingdoctor'), maiden = sets.get('maidenbeloved');
  const formulaSources = [kqmPath + '#/formula', pinned(kqm.formula.path), pinned(kqm.formula.evidence)];
  if (sets.has('adventurer')) gaps.push({ entity: 'adventurer', pieces: 4, field: '/effects/1/support/mechanisms/2',
    sources: adventurerRecoverySources,
    reason: '已核对完整5秒和每隔1秒单次回复的基础量。探索事件自动触发、重复互动、治疗加成和实际到账量待处理。' });
  if (weapons.has('prototypeamber')) gaps.push({ entity: 'prototypeamber', field: '/support/mechanisms/2',
    sources: [local('weapons', 'prototypeamber/metadata/r1/description'), pinned(kqm.prototypeAmber.overlapPath)],
    reason: '自动结算每次回复的时刻、多名持有者之间的治疗覆盖，以及治疗和能量的实际到账量尚待接入。' });
  for (const [entity, , trigger] of weaponCases) if (weapons.has(entity)) gaps.push({ entity, field: '/support/mechanisms/1',
    sources: [local('weapons', entity + '/metadata/r1/description'), pinned(kqm.testedSelfHealingWeapons.path)],
    reason: trigger === 'particleHealing' ? '实际获得元素微粒或晶球的事件归属、连续获取及实际到账量待处理。' : '实际击败的事件归属、连续击败及实际到账量待处理。' });
  if (doctor) gaps.push({ entity: doctor.id, pieces: 4, field: '/effects/1/support/mechanisms/1',
    sources: [local('sets', 'travelingdoctor/effect4Pc'), pinned(kqm.travelingDoctor.path)],
    reason: '当前单次计算需要确认持有者已施放元素爆发。爆发记录自动生成回复及实际到账量待处理。' });

  function member(id, slotted = [], weapon = weapons.get(novice[characters.get(id)?.identity.weaponType]), options = {}) {
    const character = characters.get(id);
    return character && weapon && slotted.every(([set]) => set) ? configured(character, weapon, slotted, options) : null;
  }

  function exercise(builds, run) {
    if (Object.values(builds).some(build => !build)) return;
    const compiled = engine.prepareStructuredBuilds(Object.entries(builds).map(([id, build]) => ({ id, build })));
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
    const { team } = compiled;
    const owner = builds.actor.character, talent = owner.talents[0], hit = talent.hits[0];
    const grants = engine.grantedBuildEffects(builds.actor);
    run(({ entity, field, effect, trigger, sources, attribute, recipient = 'actor', expected, active = true, applied = true, missingHp = false, probe, pieces }) => {
      const { setup, request } = auditHit(owner, talent, hit);
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
        hit: { skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, family: 'ordinary', origin: 'talent', reactionId: null } };
      frame.factOverrides = Object.keys(builds).map((id, index) => ({ subject: { kind: 'actor', id }, facts: {
        onField: bool(index === 0), hpRatio: number('scalar', index === 0 ? 0.55 : 0.35),
        ...(id === 'actor' && trigger && active !== undefined ? { [trigger]: active === null ? fact(null) : bool(active) } : {}),
      } }));
      const applicable = effect && grants.some(({ effect: grant }) => (grant.buff ?? grant.identity).id === effect
        && engine.effectRecipientMatches(grant.recipient, 'actor', recipient, builds[recipient].character.identity) === true);
      if (applicable && applied !== null) frame.applications = [{ instanceId: engine.calculationEffectInstanceId('actor', ref(effect), null), active: applied }];
      const context = engine.createStructuredCombatContext(team, setup);
      if (missingHp) delete context.actors.find(actor => actor.id === recipient).inputs.whiteHp;
      const reading = engine.evaluateCombatBindings(team.program, context, { value: bindings[attribute] }, frame);
      const output = reading.outputs.value, unit = units[attribute];
      const value = output?.state === 'known' && output.value.kind === 'quantity' && output.value.unit === unit ? output.value.value : null;
      const match = expected === null ? output?.state === 'unknown' : Number.isFinite(expected) && value !== null && Math.abs(value - expected) < 1e-8;
      rows.push({ entity, field, ...pieces && { pieces }, ...effect && { effect }, probe, recipient,
        refinement: builds.actor.refinement, sources, attribute, unit, expected, value, state: output?.state,
        ...match ? {} : { issue: '装备当次结果、适用条件或单位与独立来源不符', diagnostics: reading.diagnostics } });
    });
  }

  for (const [entity, holder, condition, pattern] of weaponCases) {
    const weapon = weapons.get(entity);
    if (!weapon) continue;
    if (!kqm.testedSelfHealingWeapons.weapons.includes(entity)) throw new Error('缺少低星武器治疗加成实测 ' + entity);
    for (let refinement = 1; refinement <= 5; refinement++) {
      const sourceKey = 'r' + refinement;
      const fraction = rate(weaponSource[entity].metadata[sourceKey].description, pattern);
      const trigger = entity + '.' + condition, effect = entity + '.healing';
      for (const gear of ['空白', '仅治疗加成', '仅受治疗加成', '治疗与受治疗加成', '队友装备加成']) {
        const slots = [...['仅治疗加成', '治疗与受治疗加成'].includes(gear) ? [[maiden, 2]] : [],
          ...['仅受治疗加成', '治疗与受治疗加成'].includes(gear) ? [[doctor, 2]] : []];
        const actor = member(holder, slots, weapon, { refinement });
        const peer = member('barbara', gear === '队友装备加成' ? [[maiden, 2], [doctor, 2]] : []);
        if (!actor || !peer) continue;
        const sources = [local('weapons', `${entity}/metadata/${sourceKey}/description`), local('weapons', entity + '/stats'),
          kqmPath + '#/testedSelfHealingWeapons', pinned(kqm.testedSelfHealingWeapons.path), ...formulaSources, ...growthSources(actor, actor)];
        const base = { entity, field: healingField, attribute: 'equipmentHealing', effect, trigger, sources };
        exercise({ actor, peer }, check => {
          check({ ...base, probe: gear, expected: nominal(actor, actor, fraction) });
          if (gear !== '空白') return;
          check({ ...base, probe: '队友不受益', recipient: 'peer', expected: 0 });
          check({ ...base, probe: '触发明确为否', active: false, expected: 0 });
          check({ ...base, probe: '触发未知', active: null, expected: null });
          check({ ...base, probe: '本次排除', applied: false, expected: 0 });
          check({ ...base, probe: '本次是否应用未知', applied: null, expected: null });
        });
      }
    }
  }

  const amber = weapons.get('prototypeamber');
  if (amber) for (let refinement = 1; refinement <= 5; refinement++) {
    const sourceKey = 'r' + refinement;
    const description = weaponSource.prototypeamber.metadata[sourceKey].description;
    const [, energy, percent] = /^施放元素爆发后6秒内，每2秒恢复([\d.]+)点元素能量，队伍中的所有角色每2秒恢复([\d.]+)%生命值。$/.exec(description) ?? [];
    const trigger = 'prototypeamber.recoveryTick', effect = 'prototypeamber.recovery';
    const sources = [local('weapons', `prototypeamber/metadata/${sourceKey}/description`), local('weapons', 'prototypeamber/stats')];
    const heal = { entity: amber.id, field: healingField, attribute: 'equipmentHealing', effect, trigger };
    const restore = { entity: amber.id, field: energyField, attribute: 'directEnergyRestored', effect, trigger,
      sources: [...sources, kqmPath + '#/prototypeAmber', pinned(kqm.prototypeAmber.energyPath), local('sets', 'theexile/effect2Pc')] };
    for (const [gear, ownerSlots, peerSlots] of [
      ['空白', [], []], ['持有者施疗／队员受疗', [[maiden, 2], [sets.get('theexile'), 2]], [[doctor, 2]]],
      ['持有者受疗／队员施疗', [[doctor, 2]], [[maiden, 2]]],
    ]) {
      const actor = member('lisa', ownerSlots, amber, { refinement });
      const peer = member('barbara', peerSlots), other = member('amber', [[sets.get('adventurer'), 2]]);
      if (!actor || !peer || !other) continue;
      exercise({ actor, peer, other }, check => {
        if (gear === '持有者施疗／队员受疗') check({ ...restore, attribute: 'energyRecharge', probe: '持有者充能效率输入', expected: 1 + exileBonus });
        for (const [recipient, build] of Object.entries({ actor, peer, other })) {
          const evidence = [...sources, local('weapons', build.weapon.id + '/stats'), local('sets', 'adventurer/effect2Pc'),
            kqmPath + '#/prototypeAmber', pinned(kqm.prototypeAmber.hpBasisPath), pinned(kqm.prototypeAmber.healingBonusPath),
            ...formulaSources, ...growthSources(actor, build)];
          check({ ...heal, sources: evidence, probe: gear, recipient, expected: nominal(actor, build, Number(percent) / 100) });
          check({ ...restore, probe: gear, recipient, expected: recipient === 'actor' ? Number(energy) : 0 });
          if (gear !== '空白') continue;
          for (const base of [{ ...heal, sources: evidence }, restore]) {
            const applies = base.attribute === 'equipmentHealing' || recipient === 'actor';
            check({ ...base, probe: '回复明确未触发', recipient, active: false, expected: 0 });
            check({ ...base, probe: '回复触发未知', recipient, active: null, expected: applies ? null : 0 });
            check({ ...base, probe: '本次排除', recipient, applied: false, expected: 0 });
            check({ ...base, probe: '本次是否应用未知', recipient, applied: null, expected: applies ? null : 0 });
          }
          check({ ...heal, sources: evidence, probe: '受益者生命上限未知', recipient, missingHp: true, expected: null });
        }
      });
    }
  }

  if (doctor) for (const pieces of [0, 1, 2, 3, 4, 5]) {
    const peer = member('barbara');
    for (const [level, ascension] of [[1, 0], [40, 2]]) {
      const actor = member('jean', [[doctor, pieces]], undefined, { level, ascension });
      if (!actor || !peer) continue;
      const sources = [local('sets', 'travelingdoctor/effect4Pc'), pinned(kqm.travelingDoctor.path),
        ...growthSources(actor, actor), ...formulaSources];
      const heal = { entity: doctor.id, field: fourPieceField, attribute: 'equipmentHealing', effect: 'travelingdoctor.burst-healing',
        trigger: 'travelingdoctor.burstHealing', pieces: 4, sources };
      const hpBonus = { entity: doctor.id, field: twoPieceField, attribute: 'incomingHealingBonus', pieces: 2,
        sources: [local('sets', 'travelingdoctor/effect2Pc'), pinned(kqm.travelingDoctor.twoPiecePath)] };
      exercise({ actor, peer }, check => {
        const probe = pieces + '件／等级' + level;
        check({ ...hpBonus, probe, expected: pieces >= 2 ? doctorBonus : 0 });
        check({ ...hpBonus, probe, recipient: 'peer', expected: 0 });
        check({ ...heal, probe, expected: pieces >= 4 ? nominal(actor, actor, doctorRate) : 0 });
        check({ ...heal, probe, recipient: 'peer', expected: 0 });
        check({ ...heal, probe: probe + '未施放', active: false, expected: 0 });
        check({ ...heal, probe: probe + '施放未知', active: null, expected: pieces >= 4 ? null : 0 });
        check({ ...heal, probe: probe + '本次排除', applied: false, expected: 0 });
      });
    }
  }

  const adventurer = sets.get('adventurer');
  if (adventurer) {
    const { interval, ratio } = adventurerTick();
    for (const pieces of [0, 1, 2, 3, 4, 5]) {
      const peer = member('barbara');
      for (const [holder, level, ascension] of [['amber', 1, 0], ['jean', 40, 2]]) {
        const actor = member(holder, [[adventurer, pieces]], undefined, { level, ascension });
        if (!actor || !peer) continue;
        const base = { entity: adventurer.id, field: twoPieceField, attribute: 'hp', pieces: 2, probe: pieces + '件／等级' + level,
          sources: [local('sets', 'adventurer/effect2Pc'), local('character-curves', level), local('characters', holder + '/stats')] };
        exercise({ actor, peer }, check => {
          check({ ...base, expected: sourceHp(actor) });
          if (holder === 'amber') check({ ...base, sources: [local('character-curves', 1), local('characters', 'barbara/stats')], recipient: 'peer', expected: sourceHp(peer) });
          for (const [field, attribute, effect, trigger, fraction, label] of [
            [fourPieceField, 'equipmentBaseHealingTotal', 'adventurer.full-recovery', 'adventurer.fullRecovery', Number(adventurerPercent) / 100, '完成' + adventurerDuration + '秒回复'],
            ['/effects/1/buffs/1/modifiers/0', 'equipmentBaseHealingTick', 'adventurer.recovery-tick', 'adventurer.recoveryTick', ratio, interval + '秒间隔的一次回复'],
          ]) {
            const recovery = { entity: adventurer.id, field, attribute, pieces: 4, effect, trigger, sources: [...adventurerRecoverySources, ...base.sources] };
            const probe = base.probe + '／' + label;
            check({ ...recovery, probe, expected: pieces >= 4 ? sourceHp(actor) * fraction : 0 });
            check({ ...recovery, probe, recipient: 'peer', expected: 0 });
            check({ ...recovery, probe: base.probe + '／回复条件未填写', trigger: undefined, expected: pieces >= 4 ? null : 0 });
            if (pieces < 4) continue;
            check({ ...recovery, probe: base.probe + '／未确认本次回复', active: false, expected: 0 });
            check({ ...recovery, probe: base.probe + '／本次排除', applied: false, expected: 0 });
            check({ ...recovery, probe: base.probe + '／本次是否应用未知', applied: null, expected: null });
            check({ ...recovery, probe: base.probe + '／生命上限未知', missingHp: true, expected: null });
          }
        });
      }
    }
  }

  const byField = Map.groupBy(rows, row => row.entity + row.field);
  for (const [key, checks] of byField) if (checks.every(row => !row.issue)) verified.add(key);
  return { rows, verified, gaps, summary: { equipmentHealingCases: rows.length, equipmentHealingMismatches: rows.filter(row => row.issue).length,
    verifiedEquipmentHealingFields: verified.size, equipmentHealingGaps: gaps.length } };
}
