import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const equipment = 'tools/data/sources/catalog/genshin-db/';
const characterCases = [
  ['freminet', 'talents', 2, 'combat3', /重置元素战技「浮冰增压」的冷却时间/],
  ['eula', 'passives', 1, 'passive2', /施放凝浪之光剑时，重置冰潮的涡旋的冷却时间/, 4],
  ['kaedeharakazuha', 'constellations', 0, 'c1', /施放万叶之一刀时，重置千早振的冷却时间/, 0, 1],
  ['ningguang', 'constellations', 1, 'c2', /璇玑屏碎裂时，会清除冷却时间。\s*该效果每6秒只能触发一次/, 0, 2],
  ['razor', 'passives', 0, 'passive1', /施放雷牙时，重置利爪与苍雷的冷却时间/, 1],
  ['tartaglia', 'constellations', 5, 'c6', /在近战状态下施放极恶技·尽灭闪时，清除魔王武装·狂澜的冷却时间。\s*该效果会在回到远程状态后触发/, 0, 6],
  ['yaemiko', 'passives', 0, 'passive1', /施放大密法·天狐显真时，每摧毁一株杀生樱，就会重置一次野干役咒·杀生樱的冷却时间/, 1],
  ['arlecchino', 'talents', 2, 'combat3', /并在此后清除元素战技「万相化灰」的冷却时间/],
];
export const confirmedSkillResetWeaponHolders = {
  sacrificialsword: 'kaeya', sacrificialgreatsword: 'freminet', sacrificialfragments: 'sucrose', sacrificialbow: 'tartaglia',
};
export const confirmedSkillResetCharacterIds = [...new Set([
  ...characterCases.map(([id]) => id), ...Object.values(confirmedSkillResetWeaponHolders), 'beidou',
])];
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const resetAmount = 'attribute.confirmedSkillCooldownResetMs';
const restoredCharges = 'attribute.confirmedSkillChargesRestored';
const duration = 'skillCooldownBeforeResetMs';
const warmupMs = 3500;

/** Use confirmed observations as query inputs and compare the evaluated amount with the pinned clauses. */
export function auditConfirmedSkillResets(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peer = characters.get('beidou');
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const prepared = new Map();

  function verify({ entity, holder, clause, buffList, effect, output, hit, sources, evidence, message, remaining,
    weapon, set, rank = 0, ascension = 0, facts, cases }) {
    if (!holder || !peer || !starter(holder) || !starter(peer)) return;
    const buffIndex = buffList?.findIndex(buff => buff.id === effect) ?? -1;
    const buffPath = clause === '/buffs' ? clause : clause + '/buffs';
    const field = buffPath + '/' + buffIndex + '/modifiers/0';
    const start = rows.length;
    const unit = output === resetAmount ? 'milliseconds' : 'count';
    const binding = { kind: 'attribute', actor: { role: 'recipient' }, key: ref(output), at: { kind: 'current', phase: 'same' } };
    const expectedSuccess = unit === 'milliseconds' ? warmupMs : 1;
    const probes = [
      { label: '已确认本次触发', expected: expectedSuccess },
      { label: '未应用', expected: 0, application: false },
      { label: '应用未知', expected: null, application: null },
      { label: '其他受益人', expected: 0, recipient: 'peer', eligible: false },
      ...ascension ? [{ label: '突破未解锁', expected: 0, ascension: ascension - 1, eligible: false }] : [],
      ...rank ? [{ label: '命座未解锁', expected: 0, rank: rank - 1, eligible: false }] : [],
      ...Object.hasOwn(facts, duration) ? [
        { label: '战技已恢复', expected: 0, facts: { [duration]: 0 } },
        { label: '重置前冷却未知', expected: null, facts: { [duration]: null } },
      ] : [],
      ...cases,
    ];
    for (const probe of probes) {
      const { recipient = 'actor', application = true, eligible = true, refinement = 1 } = probe;
      const appliedWeapon = probe.unequipped ? starter(holder) : weapon ?? starter(holder);
      const pieces = probe.pieces ?? (set ? 4 : 0);
      const constellation = probe.rank ?? rank, promotion = probe.ascension ?? ascension;
      const teamKey = JSON.stringify([holder.id, appliedWeapon.id, constellation, promotion, refinement, pieces, set?.id]);
      let team = prepared.get(teamKey);
      if (!team) {
        const build = { ...auditBuild(holder, appliedWeapon, set ? [set] : []), constellation, ascension: promotion, refinement,
          level: promotion ? holder.progression.promotion[promotion - 1].maxLevel : 1,
          ...weapon?.id === 'sacrificialfragments' ? { constellation: 1 } : {} };
        if (set) build.theoreticalSetSlots = set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id }));
        const result = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: auditBuild(peer, starter(peer)) }]);
        if (!result.ok) throw new Error(entity.id + ' 重置验算配装无效 ' + JSON.stringify(result.diagnostics));
        team = result.team;
        prepared.set(teamKey, team);
      }
      const actor = recipient === 'actor' ? holder : peer;
      const hitId = recipient === 'peer' ? peer.talents[0].hits[0].id : probe.hit ?? hit;
      const talent = actor.talents.find(entry => entry.hits.some(entry => entry.id === hitId));
      const hitDefinition = talent?.hits.find(entry => entry.id === hitId);
      if (!talent || !hitDefinition) throw new Error(entity.id + ' 缺少战技重置验算命中 ' + hitId);
      const { setup, request: { frame } } = auditHit(actor, talent, hitDefinition);
      setup.events.find(event => event.id === frame.eventId).actorId = recipient;
      const context = engine.createStructuredCombatContext(team, setup);
      Object.assign(frame, { ownerId: recipient, recipientId: recipient, contributorId: null, facts: {}, factOverrides: [],
        hit: { skillId: talent.id, hitId, category: hitDefinition.category, element: hitDefinition.element,
          family: Object.keys(hitDefinition.damage)[0], origin: hitDefinition.origin, reactionId: null } });
      const onField = [];
      for (const [key, value] of Object.entries({ ...facts, ...probe.facts })) {
        const observed = value === null ? fact(null) : typeof value === 'boolean' ? bool(value) : number(key === duration ? 'milliseconds' : 'count', value);
        if (key === 'onField') onField.push({ subject: { kind: 'actor', id: 'actor' }, facts: { onField: observed } });
        else frame.facts[key] = observed;
      }
      frame.factOverrides = onField;
      if (eligible && buffIndex >= 0) frame.applications = [{ instanceId: engine.calculationEffectInstanceId('actor', ref(effect), null), active: application }];
      const evaluation = engine.evaluateCombatBindings(team.program, context, { reset: binding }, frame);
      const checked = evaluation.outputs.reset;
      const absent = probe.unequipped && !context.actors.find(actor => actor.id === 'actor')?.effects.some(reference => reference.id === effect)
        && evaluation.diagnostics.some(diagnostic => diagnostic.code === 'missing-dependency' && diagnostic.jsonPointer === '/bindings/reset/key');
      const status = absent ? 'absent' : checked?.state ?? 'missing';
      const value = absent ? 0 : checked?.state === 'known' && checked.value.kind === 'quantity' && checked.value.unit === unit ? checked.value.value : null;
      const trace = evaluation.trace.find(node => node.kind === 'effect' && node.definition.id === effect);
      const expectedStatus = probe.status ?? (probe.expected === null ? 'unknown' : 'known');
      const matches = (status === expectedStatus || absent && expectedStatus === 'known') && value === probe.expected
        && (!trace || trace.context?.actorId === 'actor' && trace.context.recipientId === recipient)
        && (probe.expected === 0 || probe.expected === null || trace?.value?.kind === 'quantity' && trace.value.value === probe.expected);
      rows.push({ entity: entity.id, clause, field, sources, effect, output, probe: probe.label, expected: probe.expected, value, status,
        ...(unit === 'milliseconds' && value !== null && value > 0 ? { cooldownAfterMs: (probe.facts?.[duration] ?? facts[duration]) - value } : {}),
        ...buffIndex >= 0 && evidence && matches ? {} : { issue: '确认重置后的数值或来源不符', diagnostics: evaluation.diagnostics } });
    }
    if (rows.slice(start).some(row => row.issue)) {
      gaps.push({ entity: entity.id, field: clause, sources, reason: '确认重置后的数值或来源不符。' });
      return;
    }
    verified.add(entity.id + clause);
    verified.add(entity.id + field.split('/modifiers/')[0]);
    verified.add(entity.id + field);
    resolved.push({ entity: entity.id, field: clause, sources, resolved: message, ...remaining && { remaining } });
    if (remaining) gaps.push({ entity: entity.id, field: clause + '/support/mechanisms/1', sources, reason: remaining });
  }

  for (const [id, group, index, section, pattern, ascension, rank] of characterCases) {
    const character = characters.get(id);
    if (!character) continue;
    const path = capture + (group === 'constellations' ? group : 'talents') + '/' + id + '.json';
    const source = read(path);
    const sources = [path + '#/' + section + '/description'];
    const effect = id + '.skillReset', trigger = effect + '.confirmed', ready = effect + '.ready';
    const available = effect + '.availableCharges', destroyed = effect + '.destroyedSesshouSakura';
    const screen = id === 'ningguang', charge = id === 'yaemiko';
    const capacity = charge ? Number(/拥有(\d+)次可使用次数/.exec(source.combat2.description)?.[1]) : 1;
    if (charge) sources.push(path + '#/combat2/description', path + '#/combat3/description');
    const facts = { [trigger]: true, ...screen ? { [ready]: true } : {},
      ...charge ? { [available]: capacity - 1, [destroyed]: capacity - 1 } : { [duration]: warmupMs } };
    const cases = [
      { label: '触发条件不满足', facts: { [trigger]: false, ...!charge && { [duration]: null } }, expected: 0 },
      { label: '触发条件未知', facts: { [trigger]: null }, expected: null },
    ];
    if (screen) cases.push(
      { label: '璇玑屏重置间隔尚未结束', facts: { [ready]: false }, expected: 0 },
      { label: '璇玑屏重置间隔未知', facts: { [ready]: null }, expected: null });
    else cases.push({ label: id === 'tartaglia' ? '远程爆发' : '其他施放',
      hit: id === 'tartaglia' ? 'tartaglia.burst.param3' : character.talents[0].hits[0].id, eligible: false, expected: 0 });
    if (charge && Number.isInteger(capacity)) {
      for (let free = 0; free <= capacity; free++) for (let removed = 0; removed <= capacity; removed++) cases.push({
        label: '爆发摧毁 ' + removed + ' 株，原有 ' + free + ' 次', facts: { [available]: free, [destroyed]: removed },
        expected: Math.min(removed, capacity - free),
      });
      cases.push(
        { label: '摧毁数量未知', facts: { [destroyed]: null }, expected: null },
        { label: '战技次数已满', facts: { [available]: capacity, [destroyed]: null }, expected: 0 },
        { label: '确认未摧毁杀生樱', facts: { [available]: null, [destroyed]: 0 }, expected: 0 },
        { label: '非法战技次数', facts: { [available]: capacity + 1 }, expected: null, status: 'invalid' },
        { label: '非法摧毁数量', facts: { [destroyed]: capacity + 1 }, expected: null, status: 'invalid' });
    }
    verify({ entity: character, holder: character, clause: '/' + group + '/' + index, buffList: character.metadata[group][index].buffs,
      effect, output: charge ? restoredCharges : resetAmount, hit: id + '.burst.param1', sources, ascension, rank, facts, cases,
      evidence: pattern.test(source[section].description) && (!charge || capacity === character.talents[1].skillCharges && /通过这种方式摧毁一株杀生樱/.test(source.combat3.description)),
      message: charge ? '已确认爆发实际摧毁的杀生樱数量后，按每株一次及战技容量计算恢复次数。' : '已确认本次触发且有冷却时，清除本次剩余战技冷却。' });
  }

  const capturedWeaponText = read(equipment + 'weapons.json');
  for (const [id, holderId] of Object.entries(confirmedSkillResetWeaponHolders)) {
    const weapon = weapons.get(id), holder = characters.get(holderId);
    if (!weapon || !holder) continue;
    const chances = weapon.metadata.buffs.find(buff => buff.onDamage)?.onDamage;
    const r1 = /^元素战技造成伤害时，有(\d+)%的概率重置该技能的冷却时间，该效果每(\d+)秒只能触发一次。$/;
    const keys = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const matches = keys.map(key => r1.exec(capturedWeaponText[id].metadata[key].description));
    const ready = 'sacrificial.resetReady', triggered = 'sacrificial.resetTriggered';
    const facts = { onField: true, targetsDamaged: 1, [duration]: warmupMs, [ready]: true, [triggered]: true };
    const hit = holder.talents.find(entry => entry.category === 'skill').hits.find(entry => entry.category === 'skill')?.id;
    const cases = [
      ...keys.slice(1).map((key, index) => ({ label: '已确认' + key + '概率成功', refinement: index + 2, expected: 1 })),
      { label: '未装备该祭礼武器', expected: 0, unequipped: true, eligible: false },
      { label: '其他施放', hit: holder.talents[0].hits[0].id, expected: 0, eligible: false },
      ...Object.entries({ onField: false, targetsDamaged: 0, [ready]: false, [triggered]: false }).map(([key, value]) => ({
        label: '不满足 ' + key, facts: { [key]: value }, expected: 0,
      })),
      { label: '概率结果未知', facts: { [triggered]: null }, expected: null },
      { label: '一次判定命中多个敌人', facts: { targetsDamaged: 3 }, expected: 1 },
    ];
    verify({ entity: weapon, holder, clause: '/buffs', buffList: weapon.metadata.buffs, effect: id + '.confirmed-reset',
      output: restoredCharges, hit, weapon, facts, cases, sources: keys.map(key => equipment + 'weapons.json#/' + id + '/metadata/' + key + '/description'),
      evidence: chances?.change.kind === 'reset-skill' && matches.every((match, index) => match
        && Number(match[1]) / 100 === chances.chance[index] && Number(match[2]) * 1000 === chances.cooldownMs[index]),
      message: '持有者在场以战技造成伤害，间隔已结束且概率成功时，只恢复正在恢复的一次战技。' });
  }

  const gambler = entities.sets?.find(set => set.id === 'gambler');
  const holder = characters.get('kaeya');
  if (gambler && holder) {
    const source = equipment + 'sets.json';
    const description = read(source).gambler.effect4Pc;
    const ready = 'gambler.resetReady', single = 'gambler.oneSkillChargeRecovering';
    verify({ entity: gambler, holder, clause: '/effects/1', buffList: gambler.metadata.effects[1].buffs,
      effect: 'gambler.confirmed-reset', output: resetAmount, hit: holder.talents[0].hits[0].id, set: gambler,
      facts: { enemyDefeated: true, [ready]: true, [single]: true, [duration]: warmupMs },
      sources: [source + '#/gambler/effect4Pc'], evidence: /击败敌人时，有100%概率清除元素战技的冷却时间。该效果每15秒至多触发一次。/.test(description),
      cases: [
        { label: '只有三件套', expected: 0, pieces: 3, eligible: false },
        { label: '没有击败敌人', expected: 0, facts: { enemyDefeated: false } },
        { label: '十五秒间隔未结束', expected: 0, facts: { [ready]: false } },
        { label: '战技恢复次数未知', expected: null, facts: { [single]: null } },
      ],
      message: '已确认穿戴者击败敌人、十五秒间隔结束且仅有一次战技正在恢复时，清除本次剩余战技冷却。',
      remaining: '原文未区分多次战技同时在恢复时的清除范围，实际触发顺序仍须根据战斗记录检查。' });
  }
  return { rows, verified, resolved, gaps, summary: { confirmedSkillResetCases: rows.length,
    confirmedSkillResetMismatches: rows.filter(row => row.issue).length, confirmedSkillResetClausesVerified: resolved.length,
    confirmedSkillResetGaps: gaps.length } };
}
