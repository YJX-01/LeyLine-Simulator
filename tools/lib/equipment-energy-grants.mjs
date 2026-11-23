import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number } from './roster-audit-settings.mjs';

const root = 'tools/data/sources/catalog/genshin-db/';
const weaponPath = root + 'weapons.json';
const setPath = root + 'sets.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const restored = 'attribute.directEnergyRestored';
const change = 'attribute.directEnergyChange';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const rules = {
  amenomakageuchi: [/每个为该角色恢复([\d.]+)点元素能量/, /胤种持续30秒，至多同时存在3个.*2秒之后/],
  angelosheptades: [/使装备者恢复([\d.]+)点元素能量/, /每14秒.*不处于战斗状态下开启各类宝箱.*处于队伍后台/],
  bloodsoakedruins: [/为装备者恢复([\d.]+)点元素能量/, /装备者触发月感电反应.*每14秒/],
  cranesechoingcall: [/为装备者恢复([\d.]+)点元素能量/, /附近的角色的下落攻击命中敌人时.*每0\.7秒.*队伍后台/],
  everlastingmoonglow: [/命中敌人时恢复([\d.]+)点元素能量/, /施放元素爆发后的12秒内，普通攻击命中敌人.*每0\.1秒/],
  exaiphanesblade: [/使旅行者恢复([\d.]+)点元素能量/, /旅行者装备时.*命中敌人后.*每5秒.*队伍后台/],
  flameforgedinsight: [/反应时，恢复([\d.]+)点元素能量/, /感电、月感电、绽放、月绽放、结晶或月结晶.*每15秒.*队伍后台/],
  frostbreath: [/其他角色恢复([\d.]+)点元素能量/, /触发冰元素或水元素相关反应.*队伍中自己的其他角色.*每16秒/],
  jadefallssplendor: [/每2\.5秒恢复([\d.]+)点元素能量/, /施放元素爆发或创造护盾后的3秒内.*每2\.5秒.*队伍后台/],
  katsuragikirinagamasa: [/每2秒恢复([\d.]+)点元素能量/, /元素战技命中后.*此后的6秒内，每2秒.*每10秒.*队伍后台/],
  kitaincrossspear: [/每2秒恢复([\d.]+)点元素能量/, /元素战技命中后.*此后的6秒内，每2秒.*每10秒.*队伍后台/],
  lumidouceelegy: [/时间刷新时，恢复([\d.]+)点元素能量/, /触发燃烧反应或对处于燃烧状态下的敌人造成草元素伤害.*叠加至2层或2层的持续时间刷新时.*每12秒.*队伍后台/],
  nocturnescurtaincall: [/为装备者恢复([\d.]+)点元素能量/, /装备者触发月曜反应或对敌人造成月曜反应伤害.*每18秒.*队伍后台/],
  portablepowersaw: [/每枚消耗的坚忍标记为装备者恢复([\d.]+)点元素能量/, /受到治疗或进行治疗时.*至多拥有三枚.*施放元素战技或元素爆发.*效果产生2秒后.*每15秒.*队伍后台/],
  songofthevigil: [/为装备者恢复([\d.]+)点元素能量/, /触发元素反应后.*每9秒.*队伍后台/],
  thedockhandsassistant: [/每枚消耗的坚忍标记为装备者恢复([\d.]+)点元素能量/, /受到治疗或进行治疗时.*至多拥有三枚.*施放元素战技或元素爆发.*效果产生2秒后.*每15秒.*队伍后台/],
  tomeoftheeternalflow: [/时间刷新时，恢复([\d.]+)点元素能量/, /当前生命值提升或降低.*每0\.3秒.*叠加至3层或3层的持续时间刷新时.*每12秒/],
  whitelakefrostfeather: [/使装备者恢复([\d.]+)点元素能量/, /持有3层时.*触发星烁反应或造成星烁反应伤害时.*每3\.5秒.*队伍后台/],
};
const setRules = {
  scholar: [4, /额外恢复([\d.]+)点元素能量/, /获得元素微粒或元素晶球时.*所有弓箭和法器角色.*每3秒/],
  scrolloftheheroofcindercity: [2, /装备者恢复([\d.]+)点元素能量/, /附近的角色触发「夜魂迸发」时/],
  theexile: [4, /恢复([\d.]+)点元素能量/, /施放元素爆发后，每2秒.*不包括自己.*持续6秒，无法叠加/],
};
const countFields = { amenomakageuchi: 'consumedSeeds', portablepowersaw: 'consumedMarks', thedockhandsassistant: 'consumedMarks' };
const layerFields = { lumidouceelegy: ['burningLayers', 2], tomeoftheeternalflow: ['energyLayers', 3], whitelakefrostfeather: ['lakeLayers', 3] };
const drainWeapons = ['katsuragikirinagamasa', 'kitaincrossspear'];
const holderByWeapon = { WEAPON_SWORD_ONE_HAND: 'kaeya', WEAPON_CATALYST: 'lisa', WEAPON_CLAYMORE: 'noelle',
  WEAPON_BOW: 'amber', WEAPON_POLE: 'xiangling' };
const kqmWeapons = 'https://github.com/KQM-git/TCL/blob/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/docs/evidence/equipment/weapons.md';
const debitSources = { kitaincrossspear: '#kitain-passive-will-proc-even-if-carrier-has-0-energy',
  katsuragikirinagamasa: '#katsuragikiri-nagamasa-energy-drain-delay' };

export const equipmentEnergyWeaponIds = Object.keys(rules);
export const equipmentEnergySetIds = Object.keys(setRules);
export const equipmentEnergyCharacterIds = [...Object.values(holderByWeapon), 'aether-anemo', 'lumine-geo', 'barbara'];

function makeBuild(character, weapon, set, pieces, refinement) {
  const build = { ...auditBuild(character, weapon, set ? [set] : []), refinement };
  if (set) build.theoreticalSetSlots = set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id }));
  return build;
}

/** Evaluate confirmed one-shot grants independently of the nominal amounts and triggers in the adopted definitions. */
export function auditEquipmentEnergyGrants(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [], teams = new Map();
  const weapons = new Map(entities.weapons.map(entry => [entry.id, entry]));
  const sets = new Map(entities.sets.map(entry => [entry.id, entry]));
  const characters = new Map(entities.characters.map(entry => [entry.id, entry]));
  const weaponSource = read(weaponPath), setSource = read(setPath);
  const starter = character => weapons.get(novice[character.identity.weaponType]);

  function check({ item, set, pieces, baseField, buffs, slot, output, owner, evidence, remaining, probes }) {
    const peer = characters.get('barbara'), bow = characters.get('amber'), sword = characters.get('kaeya');
    if (!owner || !peer || !bow || !sword || ![owner, peer, bow, sword].every(starter)) return;
    const id = item.id, buffId = id + '.' + slot;
    const buffIndex = buffs.findIndex(buff => buff.id === buffId);
    const modifierIndex = buffs[buffIndex]?.modifiers.findIndex(modifier => modifier.target === output) ?? -1;
    const buffField = baseField + '/buffs/' + buffIndex, field = buffField + '/modifiers/' + modifierIndex;
    const effect = modifierIndex > 0 ? buffId + '.' + modifierIndex : buffId;
    const start = rows.length;
    for (const probe of probes) {
      const { refinement = 1, count = pieces, recipient = 'actor', equipped = true, onField = true,
        application = true, expected, expectedStatus = expected === null ? 'unknown' : 'known', flags = {}, second = false,
        alternativeOwner } = probe;
      const selectedOwner = alternativeOwner ?? owner;
      const weapon = set || !equipped ? starter(selectedOwner) : item;
      const key = JSON.stringify([selectedOwner.id, weapon.id, refinement, set?.id, count, second]);
      let prepared = teams.get(key);
      if (!prepared) {
        prepared = engine.prepareStructuredBuilds([
          { id: 'actor', build: makeBuild(selectedOwner, weapon, set, count, refinement) },
          { id: 'peer', build: makeBuild(peer, starter(peer), second ? set : undefined, count, 1) },
          { id: 'bow', build: makeBuild(bow, starter(bow), undefined, 0, 1) },
          { id: 'sword', build: makeBuild(sword, starter(sword), undefined, 0, 1) },
        ]);
        teams.set(key, prepared);
      }
      let value = null, status, diagnostics;
      if (!prepared.ok) {
        diagnostics = prepared.diagnostics;
        status = diagnostics.some(diagnostic => diagnostic.code === 'invalid-range') ? 'rejected' : 'missing';
      } else {
        const talent = selectedOwner.talents[0];
        const { setup, request: { frame } } = auditHit(selectedOwner, talent, talent.hits[0]);
        Object.assign(frame, { ownerId: 'actor', recipientId: recipient, contributorId: null, hit: null, facts: {},
          factOverrides: [{ subject: { kind: 'actor', id: 'actor' }, facts: { onField: bool(onField), ...flags } },
            ...(second ? [{ subject: { kind: 'actor', id: 'peer' }, facts: flags }] : [])] });
        const { team } = prepared, context = engine.createStructuredCombatContext(team, setup);
        const receiver = context.actors.find(actor => actor.id === recipient);
        const memberDefinitions = [[selectedOwner, weapon, ...set ? [set] : []], [peer, starter(peer), ...second ? [set] : []],
          [bow, starter(bow)], [sword, starter(sword)]];
        for (const [index, actor] of context.actors.entries()) {
          const definitions = memberDefinitions[index].flatMap(definition => definition.calculation.bundle.effects);
          const effectIds = new Set(definitions.filter(rule => rule.application === 'explicit' && rule.trigger.kind === 'permanent'
            && rule.target.kind === 'attribute' && rule.target.attribute.id === output
            && actor.effects.some(reference => reference.id === rule.identity.id)
            && engine.effectRecipientMatches(rule.recipient, actor.id, recipient, receiver.identity) === true)
            .map(rule => (rule.buff ?? rule.identity).id));
          for (const id of effectIds) {
            const selected = id === buffId && (index === 0 || second && index === 1);
            if (selected && application === null) continue;
            frame.applications.push({ instanceId: engine.calculationEffectInstanceId(actor.id, ref(id), null), active: selected && application });
          }
        }
        const result = engine.evaluateCombatBindings(team.program, context, {
          energy: { kind: 'attribute', actor: { role: 'recipient' }, key: ref(output), at: { kind: 'current', phase: 'same' } },
        }, frame);
        const reading = result.outputs.energy;
        status = reading?.state ?? result.outputs.invalid?.state ?? 'missing';
        diagnostics = result.diagnostics;
        if (reading?.state === 'known' && reading.value.kind === 'quantity' && reading.value.unit === 'energy') value = reading.value.value;
      }
      const { valid, sources } = evidence(refinement);
      const pass = status === expectedStatus && (expected === null || value !== null && Math.abs(value - expected) < 1e-9);
      rows.push({ entity: id, field, effect, output, value, expected, expectedStatus, status, sources,
        probe: { label: probe.label, owner: selectedOwner.id, refinement, pieces: count, recipient, equipped, onField, application, flags },
        ...buffIndex >= 0 && modifierIndex >= 0 && valid && pass ? {} : { issue: '本次直接能量输出、来源或条件与预期不符', diagnostics } });
    }
    if (rows.slice(start).some(row => row.issue)) return;
    verified.add(id + buffField);
    verified.add(id + field);
    if (output === restored) {
      const clauseField = baseField || '/buffs';
      const sources = evidence(1).sources;
      resolved.push({ entity: id, field: clauseField, resolved: '已核对明确触发时的固定回能、合法精炼或套装件数及受益范围。', remaining });
      gaps.push({ entity: id, field: clauseField, reason: remaining, status: 'timeline-only', sources });
    }
  }

  for (const [id, [amountPattern, triggerPattern]] of Object.entries(rules)) {
    const item = weapons.get(id);
    if (!item) continue;
    const source = weaponSource[id].metadata, drain = drainWeapons.includes(id), base = id + '.directEnergy';
    const rankSource = rank => source['r' + rank] ?? source.r1;
    const stated = rank => Number(amountPattern.exec(rankSource(rank).description)?.[1]);
    const nominalDebit = Number(/流失(\d+)点元素能量/.exec(source.r1.description)?.[1]);
    const evidence = rank => ({ valid: Number.isFinite(stated(rank)) && triggerPattern.test(rankSource(rank).description),
      sources: [weaponPath + '#/' + id + '/metadata/r' + (source['r' + rank] ? rank : 1) + '/description'] });
    const fieldForCount = countFields[id] && id + '.' + countFields[id];
    const [layerName, layers] = layerFields[id] ?? [];
    const fieldForLayers = layerName && id + '.' + layerName;
    const traveler = id === 'exaiphanesblade', teamEnergy = id === 'frostbreath';
    const owner = characters.get(traveler ? 'aether-anemo' : holderByWeapon[item.weaponType]);
    const trigger = base + (drain ? 'Stage' : 'Triggered');
    const stage = value => fact({ kind: 'enum', value });
    const flags = { [trigger]: drain ? stage('回能') : bool(true),
      ...fieldForCount && { [fieldForCount]: number('count', 1) },
      ...fieldForLayers && { [fieldForLayers]: number('count', layers) } };
    const resolve = probe => ({ recipient: teamEnergy ? 'peer' : 'actor', ...probe, flags: { ...flags, ...probe.flags } });
    const refinements = Array.from({ length: 5 }, (_, index) => index + 1);
    const probes = [
      ...refinements.map(refinement => ({ label: '合法精炼与本次触发', refinement, expected: stated(refinement) })),
      ...[0, 1.5, 6].map(refinement => ({ label: '非法精炼档', refinement, expected: null, expectedStatus: 'rejected' })),
      { label: '未满足本次条件或触发间隔', flags: { [trigger]: drain ? stage('未触发') : bool(false) }, expected: 0 },
      { label: '触发条件未知', flags: { [trigger]: fact(null) }, expected: null },
      { label: '未应用', application: false, expected: 0 },
      { label: '应用待确认', application: null, expected: null },
      { label: '未装备', equipped: false, expected: 0 },
      { label: '排除不受益角色', recipient: teamEnergy ? 'actor' : 'peer', expected: 0 },
      ...(/队伍后台/.test(source.r1.description) ? [{ label: '后台回能或取得触发资源', onField: false, expected: stated(1) }] : []),
      ...fieldForCount ? [0, 2, 3, 4].map(count => ({ label: '已消费层数 ' + count, refinement: 5,
        flags: { [fieldForCount]: number('count', count) }, expected: count > 3 ? null : stated(5) * count,
        ...count > 3 && { expectedStatus: 'invalid' } })) : [],
      ...fieldForLayers ? [{ label: '叠层尚未达到回能门槛', flags: { [fieldForLayers]: number('count', layers - 1) }, expected: 0 }] : [],
      ...traveler ? [
        { label: '非旅行者命中仍不回复', alternativeOwner: characters.get('kaeya'), expected: 0 },
        ...characters.has('lumine-geo') ? [{ label: '荧的其他元素形态仍有资格', alternativeOwner: characters.get('lumine-geo'), expected: stated(1) }] : [],
      ] : [],
      ...drain ? [{ label: '扣能时刻没有总恢复', flags: { [trigger]: stage('扣除') }, expected: 0 }] : [],
    ];
    const remaining = '跨事件的自动触发、冷却、排程和实际到账量待接入。'
      + (traveler ? '历史共鸣进度仍由用户确认。' : '');
    const details = { item, baseField: '', buffs: item.metadata.buffs ?? [], owner, evidence, remaining };
    check({ ...details, slot: 'directEnergy', output: restored, probes: probes.map(resolve) });
    if (drain) {
      check({ ...details, slot: 'directEnergy', output: change,
        probes: [...refinements.map(refinement => ({ label: '每跳只计一次正向能量变化', refinement, expected: stated(refinement) })),
          { label: '尚未到达回能脉冲', flags: { [trigger]: stage('未触发') }, expected: 0 }].map(resolve) });
      const withDebitSource = rank => ({ valid: evidence(rank).valid && nominalDebit === 3,
        sources: [...evidence(rank).sources, kqmWeapons + debitSources[id]] });
      check({ ...details, slot: 'directEnergySpend', output: change, evidence: withDebitSource,
        probes: [...[0, 1.5, 3, 12].map(current => ({ label: '扣能时当前能量 ' + current,
          flags: { [trigger]: stage('扣除'), currentEnergy: number('energy', current) }, expected: -Math.min(current, nominalDebit) })),
        { label: '回能脉冲时不会再次扣能', flags: { currentEnergy: number('energy', 8) }, expected: 0 },
        { label: '扣能时当前能量未知', flags: { [trigger]: stage('扣除') }, expected: null }].map(resolve) });
    }
  }

  for (const [id, [pieces, amountPattern, triggerPattern]] of Object.entries(setRules)) {
    const item = sets.get(id);
    if (!item) continue;
    const { metadata } = item, index = metadata.effects.findIndex(entry => entry.pieces === pieces);
    const sourceField = 'effect' + pieces + 'Pc', description = setSource[id][sourceField];
    const value = Number(amountPattern.exec(description)?.[1]);
    const trigger = id + '.directEnergyTriggered', flags = { [trigger]: bool(true) };
    const recipient = id === 'scrolloftheheroofcindercity' ? 'actor' : 'peer';
    const probes = [{ label: '装备生效且本次触发', expected: value }, { label: '装备少一件', count: pieces - 1, expected: 0 },
      { label: '未发生本次触发', flags: { [trigger]: bool(false) }, expected: 0 },
      { label: '触发待确认', flags: { [trigger]: fact(null) }, expected: null }];
    if (id === 'scholar') probes.push(
      { label: '弓箭持有者也受益', recipient: 'actor', expected: value },
      { label: '弓箭队友受益', recipient: 'bow', expected: value },
      { label: '单手剑队友不受益', recipient: 'sword', expected: 0 });
    else if (id === 'theexile') probes.push(
      { label: '装备者本人不吃自己的回复', recipient: 'actor', expected: 0 },
      { label: '同时有两位装备者的回复也只计算一次', recipient: 'sword', second: true, expected: value });
    else probes.push({ label: '队员触发后只给装备者回复', recipient: 'peer', expected: 0 });
    check({ item, set: item, pieces, baseField: '/effects/' + index, buffs: metadata.effects[index]?.buffs ?? [], slot: 'directEnergy', output: restored,
      owner: characters.get(id === 'scholar' ? 'amber' : 'kaeya'),
      evidence: () => ({ valid: Number.isFinite(value) && triggerPattern.test(description), sources: [setPath + '#/' + id + '/' + sourceField] }),
      remaining: '跨事件的自动触发、冷却、排程和实际到账量待接入。', probes: probes.map(probe => ({ recipient, flags, ...probe })) });
  }

  return { rows, verified, resolved, gaps, summary: { equipmentEnergyCases: rows.length,
    equipmentEnergyMismatches: rows.filter(row => row.issue).length, equipmentEnergyClausesVerified: resolved.length } };
}
