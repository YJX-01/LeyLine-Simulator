import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit } from './roster-evaluation.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const libraryRoot = 'kqm-theorycrafting-library@7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5:';
const monaRoot = 'mona@589ac6919057709924c0c20d5a9d673fe9b0be1a:';
const talentSource = id => sourceRoot + 'ChineseSimplified/talents/' + id + '.json';
const constellationSource = id => sourceRoot + 'ChineseSimplified/constellations/' + id + '.json';
const rates = readContentSource(new URL('../data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json', import.meta.url));
const growth = readContentSource(new URL('../data/sources/catalog/genshin-db/characters.json', import.meta.url));
const curves = readContentSource(new URL('../data/sources/catalog/genshin-db/character-curves.json', import.meta.url));
const weaponsByType = { WEAPON_BOW: 'huntersbow', WEAPON_CATALYST: 'apprenticesnotes', WEAPON_CLAYMORE: 'wastergreatsword',
  WEAPON_POLE: 'beginnersprotector', WEAPON_SWORD_ONE_HAND: 'dullblade' };
const fact = value => ({ value, provenance: 'explicit', sourceRefs: [] });
const quantity = (unit, value) => fact({ kind: 'quantity', unit, value });
const boolean = value => fact({ kind: 'boolean', value });
const selected = (value, declaration) => declaration.kind === 'quantity' ? quantity(declaration.unit, value ?? 0)
  : declaration.kind === 'enum' ? fact({ kind: 'enum', value: value ?? declaration.values[0] }) : boolean(value ?? false);
const number = output => output.totals.all.state === 'known' ? output.totals.all.value.value : null;
const close = (value, expected) => typeof value === 'number' && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const current = { kind: 'current', phase: 'same' };

/** Fixed-source spot checks use catalog loadouts and explicit conditions, with no recorded player state. */
export function auditTalentConditionGrants(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], verified = new Set();

  function query(id, hitId, { rank = 0, ascension = 0, values = {}, critMode = 'noncritical', reactionMode = 'none', party = [], weaponId,weaponLevel=1,weaponAscension=0,
    measure, cast, element, family, measureOther } = {}) {
    const character = characters.get(id), weapon = weapons.get(weaponId ?? weaponsByType[character.identity.weaponType]);
    const build = auditBuild(character, weapon), level = [1, 20, 40, 50, 60, 70, 80][ascension];
    Object.assign(build, { level, ascension, constellation: rank,weaponLevel,weaponAscension });
    const matches = character.talents.flatMap(talent => talent.hits.filter(hit => hit.id === id + '.' + hitId).map(hit => ({ talent, hit })));
    if (matches.length !== 1) throw new Error(id + ': 预期存在唯一可选命中 ' + hitId);
    const { talent, hit } = matches[0], { setup, request } = auditHit(character, talent, hit, level);
    request.critMode = critMode;
    request.reactionMode = reactionMode;
    const owner = request.frame.factOverrides.find(row => row.subject.kind === 'actor').facts;
    const target = setup.targets[0].facts, team = setup.team.facts, event = request.frame.facts;
    const scopes = { owner, recipient: owner, target, team, query: event, contributor: owner, 'source-event': event };
    const otherTalentInputs = new Set(character.talents.flatMap(skill => skill.inputs?.map(input => input.id) ?? []));
    const currentTalentInputs = new Map((talent.inputs ?? []).filter(input => input.usage !== 'healing').map(input => [input.id, input]));
    for (const [key, declaration] of Object.entries(character.metadata.facts ?? {})) {
      if (declaration.scope === 'query' && otherTalentInputs.has(key) && !currentTalentInputs.has(key)) continue;
      scopes[declaration.scope][key] = selected(values[key] ?? currentTalentInputs.get(key)?.min, declaration.type);
    }
    if ('onField' in values) owner.onField = boolean(values.onField);
    team.firstMoonsign = boolean(values.firstMoonsign ?? false);
    team.fullMoonsign = boolean(values.fullMoonsign ?? false);
    event.stellarAttachments = quantity('count', 1);
    event.strikingHand = fact({ kind: 'enum', value: 'left' });
    owner.radiance = fact({ kind: 'enum', value: values.radiance ?? 'none' });
    target['aura.hydro'] = boolean(false);
    target['aura.electro'] = boolean(false);
    target['aura.pyro'] = boolean(false);
    if (cast) setup.events.unshift({ id:'cast',kind:'action', actorId:'actor',targetIds:[],timeMs:0, order:0,skillId:id+'.'+cast,sourceEventIds:[],facts:{} });
    const members = [{ id: 'actor', build }, ...party.map((entry, index) => {
      const id = 'party-' + index;
      if (typeof entry === 'string') return { id, element: entry };
      const member = characters.get(entry.character);
      return { id, build: auditBuild(member, weapons.get(weaponsByType[member.identity.weaponType])) };
    })];
    const prepared = engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
    let value, diagnostics;
    if (measure) {
      const recipient = measureOther ? 'party-0' : 'actor';
      const context = engine.createStructuredCombatContext(prepared.team, setup);
      const binding = measure.startsWith('target.') ? { kind:'enemy',key:ref(measure),at:current }
        : { kind:'attribute',actor:{ role:'recipient' },key:ref(measure),at:current };
      const evaluated = engine.evaluateCombatBindings(prepared.team.program, context, { measured:binding }, {
        ...request.frame, ownerId:'actor', recipientId:recipient, contributorId:recipient,
        ...(measureOther ? { factOverrides:[...request.frame.factOverrides,{subject:{kind:'actor',id:recipient}, facts:{onField:boolean(true)}}] } : {}),
        hit:{ skillId:talent.id, hitId:hit.id, category:hit.category, element:element??hit.element, family:family??'ordinary', origin:hit.origin, reactionId: reactionMode==='none'?null:reactionMode },
      });
      const output = evaluated.outputs.measured;
      value = output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
      diagnostics = evaluated.diagnostics;
    } else {
      const result = engine.evaluateStructuredHit(prepared.team, setup, request);
      value = number(result);
      diagnostics = result.diagnostics;
    }
    const stats = growth[id].stats;
    const raw = stat => stats.base[stat] * curves[level][stats.curve[stat]] + stats.promotion[ascension][stat];
    const bonus = property => stats.specialized === 'FIGHT_PROP_' + property ? stats.promotion[ascension].specialized : 0;
    const em = bonus('ELEMENT_MASTERY')
      + (weapon.stat === 'elementalMastery' ? weapon.baseStat * weapon.statCurve[weaponLevel] : 0);
    return { value, diagnostics: diagnostics.filter(diagnostic => diagnostic.code !== 'unreviewed-mechanism'),
      attack: raw('attack') + weapon.baseAttack * weapon.attackCurve[weaponLevel] + weapon.promotion[weaponAscension], hp: raw('hp') * (1 + bonus('HP_PERCENT')), defense: raw('defense'), em, bonus };
  }

  function check(entity, field, probe, sources, result, expected) {
    const passed = typeof expected === 'number' ? close(result.value, expected) && !result.diagnostics.length
      : result.value === null && result.diagnostics.some(diagnostic=>diagnostic.code==='invalid-range' && diagnostic.jsonPointer==='/frame/facts');
    rows.push({ entity, field, probe, sources, expected, value: result.value, status: passed ? '符合独立对照' : '数值或条件不符',
      ...(!passed && result.diagnostics.length ? {diagnostics:result.diagnostics} : {}) });
    return passed;
  }

  function clause(entity, field, sources, cases, whole = false) {
    if (!characters.has(entity)) return;
    for (const [descriptor, hitId, options, expected] of cases) {
      const result = query(entity, hitId, options);
      check(entity, field, descriptor, sources, result, typeof expected === 'function' ? expected(result) : expected);
    }
    if (whole && rows.filter(row => row.entity === entity && row.field === field).every(row => row.status === '符合独立对照')) verified.add(entity + field);
  }

  const rush = { 'aloy.rushingIce': true, 'aloy.coilStacks': 3 };
  clause('aloy', '/talents/1/details/4', [talentSource('aloy') + '#combat2'], [
    ...[0,1,2,3].map(count => [`${count}层线圈`, 'normal.param1', { values: { 'aloy.coilStacks': count } },
      hit => hit.attack * rates.aloy.combat1.param1[0] * 0.45 * (1 + (count ? rates.aloy.combat2['param' + (4 + count)][0] : 0))]),
    ['线圈不加成重击', 'normal.param7', { values: { 'aloy.coilStacks': 3 } }, hit => hit.attack * rates.aloy.combat1.param7[0] * 0.45],
  ], true);
  clause('aloy', '/talents/1/details/5', [talentSource('aloy') + '#combat2'], [
    ['冰驰冰伤倍率', 'normal.ice-1', { values: rush }, hit => hit.attack * rates.aloy.combat1.param1[0] * 0.45 * (1 + rates.aloy.combat2.param8[0])],
    ['冰驰排除物理版本', 'normal.param1', { values: rush }, 0], ['未进冰驰', 'normal.ice-1', {}, 0],
  ], true);

  clause('amber', '/constellations/0', [constellationSource('amber') + '#c1'], [
    ['零命', 'normal.c1-full', {}, 0],
    ['一命未蓄满第二支箭', 'normal.c1-aimed', { rank: 1 }, hit => hit.attack * rates.amber.combat1.param6[0] * 0.2 * 0.45],
    ['一命满蓄第二支箭', 'normal.c1-full', { rank: 1 }, hit => hit.attack * rates.amber.combat1.param7[0] * 0.2 * 0.45],
  ], true);

  const retaliation = { 'beidou.c4RetaliationWindow': true };
  clause('beidou', '/constellations/3', [constellationSource('beidou') + '#c4', libraryRoot + 'docs/characters/electro/beidou.md:211-220'], [
    ['三命无附加雷伤', 'normal.c4-retaliation', { rank: 3, values: retaliation }, 0],
    ['四命受击窗口', 'normal.c4-retaliation', { rank: 4, values: retaliation }, hit => hit.attack * 0.2 * 0.45],
    ['受击窗口外', 'normal.c4-retaliation', { rank: 4 }, 0],
  ]);
  clause('beidou', '/passives/0', [talentSource('beidou') + '#passive1'], [
    ['突破一即时反击', 'skill.perfect-counter', { ascension: 1, values: {'beidou.instantCounter': true} }, hit => hit.attack * (rates.beidou.combat2.param3[0] + rates.beidou.combat2.param4[0] * 2) * 0.45],
    ['未突破', 'skill.perfect-counter', { values: {'beidou.instantCounter': true} }, 0],
    ['未能即时反击', 'skill.perfect-counter', { ascension: 1 }, 0],
  ], true);
  const stormbreaker = { measure:'attribute.incomingDamageReduction', values:{'beidou.stormbreaker':true} };
  clause('beidou', '/talents/2/details/2', [talentSource('beidou')+'#combat3'], [
    ['零命斫雷减伤', 'burst.param2', stormbreaker, rates.beidou.combat3.param3[0]],
    ['五命爆发加级后的减伤', 'burst.param2', {...stormbreaker,rank:5}, rates.beidou.combat3.param3[3]],
    ['当下不在场', 'burst.param2', {...stormbreaker,values:{...stormbreaker.values,onField:false}},0],
    ['尚未获得雷兽之盾', 'burst.param2',{measure:stormbreaker.measure},0],
    ['对敌人的目标伤害减免不变', 'burst.param2',{...stormbreaker,measure:'target.ordinaryDamageReduction'},0],
  ],true);

  const c6Wave = { 'candace.c6Wave': true };
  clause('candace', '/constellations/5', [constellationSource('candace') + '#c6'], [
    ['符合队友普攻触发条件', 'burst.c6-wave', { rank: 6, values: c6Wave }, hit => hit.hp * .15 * .45],
    ['不符合触发条件', 'burst.c6-wave', { rank: 6 }, 0], ['五命锁定', 'burst.c6-wave', { rank: 5, values: c6Wave }, 0],
  ]);

  const lunarBloom = { 'columbina.lunar-bloomInterference': true };
  const lunarDomain = { ...lunarBloom, 'columbina.moonDomain': true };
  clause('columbina', '/talents/2/details/1', [talentSource('columbina') + '#combat3', libraryRoot + 'src/data/characters/Columbina.json:263'], [
    ['当前角色位于月之领域', 'skill.param4', { values: lunarDomain }, hit => hit.hp * rates.columbina.combat2.param4[0] * (1 + Math.min(.07, hit.hp * .000002)) * 1.13 * .9],
    ['当前角色位于领域外', 'skill.param4', { values: lunarBloom }, hit => hit.hp * rates.columbina.combat2.param4[0] * (1 + Math.min(.07, hit.hp * .000002)) * .9],
    ['普通水元素战技伤害排除', 'skill.param1', { values: lunarDomain }, hit => hit.hp * rates.columbina.combat2.param1[0] * .45],
  ], true);

  const faruzanPrayer = { 'faruzan.prayer': true };
  clause('faruzan', '/talents/2/details/1', [talentSource('faruzan') + '#combat3'], [
    ['风伤祈风之赐', 'skill.param1', { values: faruzanPrayer }, hit => hit.attack * rates.faruzan.combat2.param1[0] * .45 * (1 + rates.faruzan.combat3.param2[0])],
    ['离开祈风之赐', 'skill.param1', {}, hit => hit.attack * rates.faruzan.combat2.param1[0] * .45],
    ['物理命中排除', 'normal.param1', { values: faruzanPrayer }, hit => hit.attack * rates.faruzan.combat1.param1[0] * .45],
  ], true);

  clause('furina', '/talents/1', [talentSource('furina') + '#combat2'], [
    ...[0,1,2,3,4].map(count => [`${count}名生命高于半数的角色`, 'skill.param3', { values: { 'furina.salonAllies': count } },
      hit => hit.hp * rates.furina.combat2.param3[0] * .45 * (1 + .1 * count)]),
    ['战技施放伤害排除', 'skill.param1', { values: { 'furina.salonAllies': 4 } }, hit => hit.hp * rates.furina.combat2.param1[0] * .45],
    ['非法大于四人', 'skill.param3', { values: { 'furina.salonAllies': 5 } }, null],
  ]);

  const banner = { 'gorou.bannerDomain': true };
  clause('gorou', '/talents/1/details/2', [talentSource('gorou') + '#combat2'], [
    ['队伍共两名岩元素角色', 'skill.param1', { party: ['geo'], values: banner }, hit => hit.attack * rates.gorou.combat2.param1[0] * .45],
    ['队伍共三名岩元素角色', 'skill.param1', { party: ['geo','geo'], values: banner }, hit => hit.attack * rates.gorou.combat2.param1[0] * .45 * 1.15],
    ['不在场的角色排除', 'skill.param1', { party: ['geo','geo'], values: { ...banner, onField: false } }, hit => hit.attack * rates.gorou.combat2.param1[0] * .45],
  ], true);

  const adong = { 'illuga.nightingaleSong': true, 'illuga.adongs': true };
  clause('illuga', '/constellations/1', [constellationSource('illuga') + '#c2', libraryRoot + 'src/data/characters/Illuga.json:315'], [
    ['达到七层的单次协同攻击', 'burst.c2-adong', { rank: 2, values: adong }, () => growth.illuga.stats.base.defense * curves[1][growth.illuga.stats.curve.defense] * 2 * .45],
    ['没有达到触发条件', 'burst.c2-adong', { rank: 2 }, 0], ['一命锁定', 'burst.c2-adong', { rank: 1, values: adong }, 0],
  ]);

  clause('kukishinobu', '/constellations/3', [constellationSource('kukishinobu') + '#c4', libraryRoot + 'docs/characters/electro/kuki-shinobu.md:171-179'], [
    ['符合击中条件', 'skill.c4-mark', { rank: 4, values: {'kukishinobu.c4GrassMark': true} }, hit => hit.hp * 0.097 * 0.45],
    ['命座未到', 'skill.c4-mark', { rank: 3, values: {'kukishinobu.c4GrassMark': true} }, 0],
    ['本次未触发', 'skill.c4-mark', { rank: 4 }, 0],
  ]);

  const fightingSpirit = point => ({ values: { 'mavuika.fightingSpirit': point } });
  clause('mavuika', '/talents/2/details/2', [talentSource('mavuika') + '#combat3'], [
    ...[50,200].map(point => [`燃烧战意 ${point}`, 'burst.param1', fightingSpirit(point),
      hit => hit.attack * (rates.mavuika.combat3.param1[0] + point * rates.mavuika.combat3.param3[0]) * .45]),
    ['不足50点战意拒绝', 'burst.param1', fightingSpirit(49), null],
  ], true);

  const omen = { 'mona.omen': true };
  clause('mona', '/talents/2/details/2', [talentSource('mona') + '#combat3'], [
    ['星异命中', 'burst.param2', { values: omen }, hit => hit.attack * rates.mona.combat3.param2[0] * .45 * (1 + rates.mona.combat3.param10[0])],
    ['目标无星异', 'burst.param2', {}, hit => hit.attack * rates.mona.combat3.param2[0] * .45],
  ], true);
  clause('mona', '/constellations/3', [constellationSource('mona') + '#c4'], [
    ['四命星异目标', 'burst.param2', { rank: 4, critMode: 'expected', values: omen }, hit => hit.attack * rates.mona.combat3.param2[3] * .45 * (1 + rates.mona.combat3.param10[3]) * 1.1],
    ['无星异排除', 'burst.param2', { rank: 4, critMode: 'expected' }, hit => hit.attack * rates.mona.combat3.param2[3] * .45 * 1.025],
    ['三命排除', 'burst.param2', { rank: 3, critMode: 'expected', values: omen }, hit => hit.attack * rates.mona.combat3.param2[3] * .45 * (1 + rates.mona.combat3.param10[3]) * 1.025],
  ], true);

  const shrine = { 'nahida.inShrine': true };
  clause('nahida', '/talents/2/details/0', [talentSource('nahida') + '#combat3'], [
    ['队伍一名火元素角色', 'skill.param3', { values: shrine, party: ['pyro'] }, hit => hit.attack * rates.nahida.combat2.param3[0] * .45 * (1 + rates.nahida.combat3.param1[0])],
    ['一命加算一名', 'skill.param3', { rank: 1, values: shrine }, hit => hit.attack * rates.nahida.combat2.param3[0] * .45 * (1 + rates.nahida.combat3.param1[0])],
    ['领域外排除', 'skill.param3', { party: ['pyro'] }, hit => hit.attack * rates.nahida.combat2.param3[0] * .45],
  ], true);
  clause('nahida', '/talents/2/details/1', [talentSource('nahida') + '#combat3', constellationSource('nahida') + '#c1'], [
    ['一命加算达到两名', 'skill.param3', { rank: 1, values: shrine, party: ['pyro'] }, hit => hit.attack * rates.nahida.combat2.param3[0] * .45 * (1 + rates.nahida.combat3.param2[0])],
    ['非灭净三业命中排除', 'skill.param1', { rank: 1, values: shrine, party: ['pyro'] }, hit => hit.attack * rates.nahida.combat2.param1[0] * .45],
  ], true);

  if (characters.has('nefer') && weapons.has('magicguide')) {
    const field = '/constellations/0', sources = [constellationSource('nefer') + '#c1', libraryRoot + 'src/data/characters/Nefer.json:161,289,386',
      'tools/data/sources/kqm-web/2026-11-15/reaction-formulas.json#/constants/lunar-bloom-direct'];
    const start = rows.length;
    for (const [i, ratio] of [[1, 'param9'], [2, 'param10'], [3, 'param11']]) for (const stacks of [0, 3]) {
      const skill = 'skill.phantasm-shadow-' + i, values = {'nefer.phantasm': true, 'nefer.phantasmVeil': stacks};
      const neutral = query('nefer', skill, { ascension: 6, values, weaponId: 'magicguide' });
      const active = query('nefer', skill, { ascension: 6, rank: 1, values, weaponId: 'magicguide' });
      const veil = 1 + 0.08 * stacks;
      const blessing = 1 + Math.min(0.14, neutral.em * 0.000175);
      const mastery = 1 + 6 * neutral.em / (2000 + neutral.em);
      const raw = rates.nefer.combat2[ratio][0] * neutral.em;
      check('nefer', field, `虚影第${i}段 ${stacks}层零命`, sources, neutral, raw * blessing * mastery * veil * 0.9);
      check('nefer', field, `虚影第${i}段 ${stacks}层一命`, sources, active, (raw * blessing * mastery + 0.6 * neutral.em) * veil * 0.9);
    }
    if (rows.slice(start).every(row => row.status === '符合独立对照')) verified.add('nefer' + field);
  }

  const veilSource = [talentSource('nefer') + '#combat3', libraryRoot + 'src/data/characters/Nefer.json:289,391'];
  clause('nefer', '/talents/2/details/2', veilSource, [
    ...[[0,0],[0,3],[2,5]].map(([rank, count]) => [`命座${rank}消耗${count}层`, 'burst.param1', { rank, values: { 'nefer.consumedVeil': count } },
      hit => hit.attack * rates.nefer.combat3.param1[0] * .45 * (1 + rates.nefer.combat3.param5[0] * count)]),
    ['零命消耗超过上限拒绝', 'burst.param1', { values: { 'nefer.consumedVeil': 5 } }, null],
  ], true);

  const garment = { 'sangonomiyakokomi.garment': true };
  clause('sangonomiyakokomi', '/talents/2/details/3', [talentSource('sangonomiyakokomi') + '#combat3'], [
    ['仪来羽衣中的化海月', 'skill.param3', { values: garment }, hit => (hit.attack * rates.sangonomiyakokomi.combat2.param3[0] + hit.hp * rates.sangonomiyakokomi.combat3.param9[0]) * .45],
    ['未获得仪来羽衣', 'skill.param3', {}, hit => hit.attack * rates.sangonomiyakokomi.combat2.param3[0] * .45],
  ], true);

  clause('sethos', '/constellations/0', [constellationSource('sethos') + '#c1'], [
    ['一命贯影箭期望暴击', 'normal.param7', { rank: 1, critMode: 'expected' }, hit => hit.attack * rates.sethos.combat1.param7[0] * .45 * 1.1],
    ['零命贯影箭', 'normal.param7', { critMode: 'expected' }, hit => hit.attack * rates.sethos.combat1.param7[0] * .45 * 1.025],
    ['第一段蓄力不会获得命座加成', 'normal.param6', { rank: 1, critMode: 'expected' }, hit => hit.attack * rates.sethos.combat1.param6[0] * .45 * 1.025],
  ], true);

  if (weapons.has('ravenbow')) {
    const values = { 'sethos.twilightMeditation':true };
    clause('sethos', '/talents/2/details/0', [talentSource('sethos') + '#combat3', monaRoot + 'mona_core/src/character/characters/electro/sethos.rs:178-194'], [
      ...[[1,['param1']],[2,['param2','param3']],[3,['param4']]].map(([index,parameters])=>[
        `第${index}段瞑弦矢`, 'burst.dusk-bolt-'+index, { values, weaponId:'ravenbow' },
        hit => (hit.attack*parameters.reduce((sum,key)=>sum+rates.sethos.combat1[key][0],0) + hit.em*rates.sethos.combat3.param1[0]) * .45,
      ]),
      ['未进入寂想瞑影', 'burst.dusk-bolt-1', { weaponId:'ravenbow' },0],
      ['寂想瞑影排除普通版本', 'normal.param1', { values, weaponId:'ravenbow' },0],
      ['寂想瞑影排除瞄准射击', 'normal.param7', { values, weaponId:'ravenbow' },0],
    ], true);
  }

  clause('shenhe', '/talents/1/details/2', [talentSource('shenhe') + '#combat2', libraryRoot + 'docs/characters/cryo/shenhe.md'], [
    ...['quillTap','quillHold'].map(mode => [mode === 'quillTap' ? '点按冰翎' : '长按冰翎', 'skill.param1', { values: { ['shenhe.' + mode]: true } },
      hit => (hit.attack * rates.shenhe.combat2.param1[0] + hit.attack * rates.shenhe.combat2.param3[0]) * .45]),
    ['物理普攻排除', 'normal.param1', { values: { 'shenhe.quillHold': true } }, hit => hit.attack * rates.shenhe.combat1.param1[0] * .45],
  ]);

  const skirk = { 'skirk.sevenfold': true, 'skirk.withering': true };
  clause('skirk', '/talents/2/details/3', [talentSource('skirk') + '#combat3', libraryRoot + 'src/data/characters/Skirk.json:337'], [
    ...[0,1,2,3].map(count => [`汲取${count}枚裂隙`, 'skill.param1', { ascension: 1, values: { ...skirk, 'skirk.consumedRifts': count } },
      hit => hit.attack * rates.skirk.combat2.param1[0] * .45 * (1 + rates.skirk.combat3['param' + (count + 4)][0])]),
    ['普通态排除该普攻', 'skill.param1', { ascension: 1 }, 0],
  ], true);

  clause('valeriy', '/constellations/5', [constellationSource('valeriy') + '#c6'], [
    ['六命雷霰重弹', 'burst.param2', { rank: 6 }, hit => hit.attack * rates.valeriy.combat3.param2[0] * .45 * 2],
    ['初始爆发命中排除', 'burst.param1', { rank: 6 }, hit => hit.attack * rates.valeriy.combat3.param1[0] * .45],
    ['五命雷霰重弹', 'burst.param2', { rank: 5 }, hit => hit.attack * rates.valeriy.combat3.param2[0] * .45],
  ]);

  clause('vodyanitsa', '/talents/2/details/1', [talentSource('vodyanitsa') + '#combat3'], [
    ['遥久之歌', 'burst.param1', { values: { 'vodyanitsa.longSong': true } }, hit => hit.hp * rates.vodyanitsa.combat3.param1[0] * 0.45 * (1 + rates.vodyanitsa.combat3.param2[0])],
    ['未触发遥久之歌', 'burst.param1', {}, hit => hit.hp * rates.vodyanitsa.combat3.param1[0] * 0.45],
  ], true);

  const snack = hp => ({ values: { 'yumemizukimizuki.snackCollected': true, 'yumemizukimizuki.snackCollectorHp': hp } });
  clause('yumemizukimizuki', '/talents/2', [talentSource('yumemizukimizuki') + '#combat3', constellationSource('yumemizukimizuki') + '#c4'], [
    ['正好七成生命不爆炸', 'burst.param2', snack(.70), 0],
    ['超过七成生命爆炸', 'burst.param2', snack(.701), hit => hit.attack * rates.yumemizukimizuki.combat3.param2[0] * .45],
    ['四命无视拾取血量同时爆炸', 'burst.param2', { rank: 4, ...snack(.70) }, hit => hit.attack * rates.yumemizukimizuki.combat3.param2[0] * .45],
  ]);

  const stance = { 'varka.stance': true };
  clause('varka', '/passives/0', [talentSource('varka') + '#passive1'], [
    ['没有符合条件的组合', 'skill.param3', { ascension: 1, values: stance }, hit => hit.attack * rates.varka.combat2.param3[0] * .45],
    ['含两名风元素角色', 'skill.param3', { ascension: 1, values: stance, party: ['anemo'] }, hit => hit.attack * rates.varka.combat2.param3[0] * .45 * 1.4],
    ['未突破排除倍率', 'skill.param3', { values: stance, party: ['anemo'] }, hit => hit.attack * rates.varka.combat2.param3[0] * .45],
  ]);

  function grant(entity, field, hit, property, options, expected, whole = false) {
    const isConstellation = field.startsWith('/constellations/');
    const index = Number(field.split('/')[2]) + 1;
    const source = isConstellation ? constellationSource(entity) + '#c' + index : talentSource(entity) + '#passive' + index;
    const measure = property.startsWith('target.') ? property : 'attribute.' + property;
    const cases = [['条件成立', hit, { ...options, measure }, expected]];
    if (options.values && Object.keys(options.values).length) {
      const target = property.startsWith('target.');
      const neutral = options.neutral ?? (target ? property === 'target.defenseReduction' ? 0 : .1
        : property === 'critRate' ? .05 : property === 'critDamage' ? .5 : ['baseMultiplier','reaction.lunar.elevationFactor'].includes(property) ? 1 : 0);
      cases.push(['条件不成立', hit, { ...options, values: {}, measure }, neutral]);
    }
    clause(entity, field, [source], cases, whole);
  }

  const coilWindow = { 'aloy.coilAttackWindow': true };
  grant('aloy', '/passives/0', 'normal.param1', 'attackPercent', { ascension:1, values:coilWindow }, .16);
  grant('aloy', '/passives/0', 'normal.param1', 'attackPercent', { ascension:1, values:coilWindow, party:[{character:'amber'}], measureOther:true }, .08);
  grant('aloy', '/passives/1', 'normal.ice-1', 'cryoBonus', { ascension:4, values:{'aloy.rushingIce':true,'aloy.iceSeconds':10}, neutral:hit=>hit.bonus('ICE_ADD_HURT') }, hit=>hit.bonus('ICE_ADD_HURT')+.35, true);
  grant('amber', '/passives/0', 'burst.param1', 'critRate', { ascension:1 }, .15);
  grant('amber', '/passives/1', 'normal.param7', 'attackPercent', { ascension:4, values:{'amber.weakPointWindow':true}, neutral:hit=>hit.bonus('ATTACK_PERCENT') }, hit=>hit.bonus('ATTACK_PERCENT')+.15, true);
  grant('amber', '/constellations/1', 'skill.param2', 'damageBonus', { rank:2, values:{'amber.manualDetonation':true} }, 2);
  grant('amber', '/constellations/3', 'skill.param2', 'elementalSkillCooldownReduction', { rank:4 }, .2);
  const counter = { 'beidou.perfectCounterWindow':true };
  grant('beidou', '/passives/1', 'normal.param1', 'damageBonus', { ascension:4, values:counter }, .15);
  grant('beidou', '/passives/1', 'normal.param1', 'normalAttackSpeed', { ascension:4, values:counter }, .15);
  grant('beidou', '/constellations/5', 'burst.param2', 'target.resistance.electro', { rank:6, values:{'beidou.stormbreaker':true,'beidou.stormbreakerNear':true} }, -.05, true);
  grant('candace', '/passives/1', 'normal.param1', 'damageBonus', { ascension:4, element:'hydro', values:{'candace.prayer':true} }, hit => .2 + hit.hp * .000005, true);
  grant('candace', '/constellations/1', 'normal.param1', 'hpPercent', { rank:2, values:{'candace.c2Guard':true} }, .2, true);
  grant('charlotte', '/passives/1', 'skill.param1', 'cryoBonus', { ascension:4, party:[{character:'amber'},{character:'mona'},{character:'furina'}] }, .10);
  grant('charlotte', '/passives/1', 'skill.param1', 'healingBonus', { ascension:4, party:[{character:'amber'},{character:'mona'},{character:'furina'}] }, .05, true);
  grant('charlotte', '/constellations/1', 'skill.param1', 'attackPercent', { rank:2, values:{'charlotte.cameraTargets':3} }, .30, true);
  grant('charlotte', '/constellations/3', 'burst.param3', 'damageBonus', { rank:4, values:{'charlotte.photographicMark':true} }, .10);
  clause('charlotte', '/constellations/5', [constellationSource('charlotte') + '#c6'], [
    ['六命协同冰伤', 'burst.c6-coordinated', { rank:6, values:{'charlotte.c6-focus':true} }, hit => hit.attack * 1.8 * .45],
    ['未触发协同', 'burst.c6-coordinated', { rank:6 }, 0], ['五命锁定', 'burst.c6-coordinated', { rank:5, values:{'charlotte.c6-focus':true} }, 0],
  ]);
  grant('columbina', '/passives/0', 'skill.param4', 'critRate', { ascension:1, values:{'columbina.moonTemptation':3} }, .20);
  grant('columbina', '/constellations/1', 'skill.param4', 'hpPercent', { rank:2, values:{'columbina.light':true} }, .40);
  for (const [key, property, rate] of [['charged','flatAttack',.01], ['bloom','elementalMastery',.0035], ['crystallize','flatDefense',.01]]) {
    grant('columbina', '/constellations/1', 'skill.param4', property, { rank:2, values:{'columbina.light':true,['columbina.c2Light.lunar-'+key]:true,fullMoonsign:true} }, hit => hit.hp * 1.4 * rate);
  }
  for (const [mode, param, rate] of [['lunar-charged',3,.125], ['lunar-bloom',4,.025], ['lunar-crystallize',5,.125]]) {
    grant('columbina', '/constellations/3', 'skill.param' + param, 'reaction.lunar.flatBaseBonus', { rank:4, family:mode, values:{'columbina.interferenceC4':true} }, hit => hit.hp * rate);
  }
  grant('faruzan', '/passives/1', 'skill.param1', 'baseDamageBonus', { ascension:4, values:{'faruzan.prayer':true,'faruzan.hurricaneGuard':true} }, hit => hit.attack * .32);
  grant('faruzan', '/constellations/5', 'skill.param1', 'critDamage', { rank:6, values:{'faruzan.prayer':true} }, .90);
  grant('furina', '/passives/1', 'skill.param3', 'damageBonus', { ascension:4 }, hit => Math.min(.28,hit.hp * .000007));
  const spotlight = { 'furina.c6Center':true, 'furina.pneuma':true };
  grant('furina', '/constellations/5', 'normal.c6-param1', 'baseDamageBonus', { rank:6, values:spotlight }, hit => hit.hp * .43);
  grant('furina', '/constellations/5', 'normal.c6-param7', 'baseDamageBonus', { rank:6, values:spotlight }, hit => hit.hp * .18);
  grant('gorou', '/passives/1', 'skill.param1', 'baseDamageBonus', { ascension:4 }, hit => hit.defense * 1.56);
  grant('gorou', '/passives/1', 'burst.param2', 'baseDamageBonus', { ascension:4 }, hit => hit.defense * .156, true);
  grant('gorou', '/constellations/5', 'skill.param1', 'critDamage', { rank:6, cast:'skill', party:['geo','geo'] }, .90);
  const oath = { 'illuga.lampOath':true, fullMoonsign:true };
  grant('illuga', '/passives/0', 'skill.param1', 'elementalMastery', { ascension:1, values:oath, party:[{character:'gorou'}], measureOther:true }, 50);
  grant('illuga', '/passives/0', 'skill.param1', 'critRate', { ascension:1, values:oath, party:[{character:'gorou'}], measureOther:true }, .10);
  grant('illuga', '/constellations/5', 'skill.param1', 'critDamage', { rank:6, ascension:1, values:oath, party:[{character:'gorou'}], measureOther:true }, .80);
  grant('illuga', '/constellations/3', 'skill.param1', 'flatDefense', { rank:4, values:{'illuga.nightingaleSong':true} }, 200, true);
  grant('kukishinobu', '/constellations/5', 'skill.param4', 'elementalMastery', { rank:6, values:{'kukishinobu.c6Resolve':true} }, 150);
  grant('lauma', '/passives/1', 'skill.param1', 'damageBonus', { ascension:6 }, hit => Math.min(.32,hit.em * .0004));
  grant('mavuika', '/constellations/0', 'burst.param1', 'attackPercent', { rank:1, values:{'mavuika.c1Fuel':true} }, .40);
  grant('mavuika', '/constellations/1', 'skill.param1', 'target.defenseReduction', { rank:2, values:{'mavuika.ringActive':true} }, .20);
  grant('mavuika', '/constellations/1', 'burst.param1', 'whiteAttack', { rank:2, values:{'mavuika.nightsoulActive':true}, neutral:hit=>hit.attack }, hit => hit.attack + 200);
  grant('mavuika', '/constellations/3', 'skill.param1', 'damageBonus', { rank:4, ascension:4, values:{'mavuika.kiongozi':true,'mavuika.initialKiongoziSpirit':200} }, .50, true);
  clause('mona', '/passives/0', [talentSource('mona') + '#passive1'], [
    ['虚实流动虚影破裂', 'skill.illusory-torrent', { ascension:1, values:{'mona.illusoryTorrent':true} }, hit=>hit.attack * rates.mona.combat2.param2[0] * .5 * .45],
    ['没有虚影', 'skill.illusory-torrent', { ascension:1 }, 0], ['未到突破', 'skill.illusory-torrent', { values:{'mona.illusoryTorrent':true} }, 0],
  ]);
  for (const [count, em] of [[1,100],[2,120],[3,140],[4,160]]) grant('nahida','/constellations/3','skill.param3','elementalMastery',{ rank:4, values:{'nahida.markedTargets':count} },em);
  grant('nefer', '/constellations/3', 'skill.param1', 'target.resistance.dendro', { rank:4, values:{'nefer.shadowDanceShred':true} }, -.10);
  grant('nefer', '/constellations/5', 'skill.c6-phantasm-second', 'reaction.lunar.elevationFactor', { rank:6, family:'lunar-bloom', values:{fullMoonsign:true} }, 1.15);
  clause('sangonomiyakokomi','/constellations/0',[constellationSource('sangonomiyakokomi')+'#c1'],[
    ['仪来羽衣最后一段的游鱼', 'normal.c1-fish', { rank:1, values:{...garment,'sangonomiyakokomi.c1FinalAttack':true} }, hit=>hit.hp * .30 * .45],
    ['零命锁定', 'normal.c1-fish', { values:{...garment,'sangonomiyakokomi.c1FinalAttack':true} },0], ['不是最后一段', 'normal.c1-fish', { rank:1, values:garment },0],
  ]);
  grant('sangonomiyakokomi', '/constellations/3', 'normal.param3', 'normalAttackSpeed', { rank:4, values:garment }, .10);
  grant('sangonomiyakokomi', '/constellations/5', 'normal.param3', 'hydroBonus', { rank:6, values:{...garment,'sangonomiyakokomi.c6Healing':true} }, .40, true);
  grant('sethos', '/constellations/1', 'normal.param7', 'electroBonus', { rank:2, values:{'sethos.c2ArcaneStacks':2} }, .30);
  grant('sethos', '/constellations/3', 'normal.param7', 'elementalMastery', { rank:4, values:{'sethos.c4PiercedEnemies':true} }, 80, true);
  grant('shenhe', '/passives/0', 'skill.param1', 'cryoBonus', { ascension:1, values:{'shenhe.burstField':true} }, .15, true);
  grant('shenhe', '/passives/1', 'skill.param1', 'damageBonus', { ascension:4, values:{'shenhe.tapTalisman':true} }, .15);
  grant('shenhe', '/passives/1', 'normal.param1', 'damageBonus', { ascension:4, values:{'shenhe.holdTalisman':true} }, .15, true);
  grant('shenhe', '/constellations/1', 'skill.param1', 'critDamage', { rank:2, values:{'shenhe.burstField':true} }, .65);
  grant('shenhe', '/constellations/3', 'skill.param1', 'damageBonus', { rank:4, values:{'shenhe.frostStacks':50} }, 2.5);
  grant('skirk', '/passives/1', 'skill.param1', 'baseMultiplier', { ascension:4, values:{...skirk,'skirk.deathCrossingStacks':3} }, 1.7);
  grant('skirk', '/constellations/3', 'skill.param1', 'attackPercent', { ascension:4, rank:4, values:{...skirk,'skirk.deathCrossingStacks':3} }, .40, true);
  grant('valeriy', '/constellations/1', 'skill.param1', 'elementalMastery', { rank:2, values:{'valeriy.c2Bastion':true} }, 100);
  for (const [i, property, probe, value] of [[7,'baseDamageBonus','普通雷伤', {radiance:'none'}], [8,'reaction.stellar-conduct.flatBaseBonus','星超导', {radiance:'stellar-conduct'}]]) {
    const family = i === 7 ? 'ordinary' : 'stellar-conduct';
    const settings = {family,measure:'attribute.'+property, values:{...value,'valeriy.assaultOrder':true,'valeriy.assaultOrderWindow':true}};
    const source = [talentSource('valeriy')+'#combat1',monaRoot+'mona_core/src/character/characters/electro/valeriy.rs:43-49'];
    clause('valeriy', '/talents/0/details/'+(i-1), source, [
      [probe+'指令生效', 'skill.param1', settings, hit=>hit.attack*rates.valeriy.combat1['param'+i][0]],
      [probe+'指令不生效', 'skill.param1',{...settings,values:value},0],
      [probe+'不是前台成员', 'skill.param1',{...settings,values:{...settings.values,onField:false}},0],
    ]);
  }
  grant('vodyanitsa', '/passives/0', 'skill.param1', 'target.resistance.anemo', { ascension:1, values:{'vodyanitsa.wanderingVortex':true} }, -.25);
  grant('vodyanitsa', '/constellations/0', 'skill.param1', 'flatAttack', { rank:1, values:{'vodyanitsa.c1Healed':true} }, hit=>hit.hp * .008, true);
  grant('vodyanitsa', '/constellations/3', 'skill.param1', 'hpPercent', { rank:4, values:{'vodyanitsa.c4HealthStacks':3} }, .60);
  grant('vodyanitsa', '/constellations/5', 'skill.param1', 'damageBonus', { rank:6, values:{'vodyanitsa.longSong':true} }, .60);
  grant('yumemizukimizuki', '/passives/1', 'skill.param1', 'elementalMastery', { ascension:4, values:{'yumemizukimizuki.dreamdrifter':true,'yumemizukimizuki.a4Mastery':true}, neutral:hit=>hit.em }, hit=>hit.em+100);
  grant('yumemizukimizuki', '/constellations/1', 'skill.param1', 'pyroBonus', { rank:2, ascension:6, element:'pyro', values:{'yumemizukimizuki.dreamdrifter':true}, party:[{character:'amber'}], measureOther:true }, hit=>hit.em*.0004, true);
  grant('varka', '/passives/1', 'skill.param3', 'damageBonus', { ascension:4, values:{...stance,'varka.azureOath':4} }, .30);
  grant('varka', '/constellations/3', 'skill.param3', 'anemoBonus', { rank:4, values:{'varka.c4Gift':true} }, .20);
  grant('varka', '/constellations/5', 'skill.param3', 'critDamage', { rank:6, ascension:4, values:{'varka.azureOath':4}, neutral:hit=>.50+hit.bonus('CRITICAL_HURT') }, hit=>1.30+hit.bonus('CRITICAL_HURT'));

  const scarlet = { measure:'attribute.damageBonus',values:{'candace.prayer':true} };
  clause('candace','/talents/2/details/2',[talentSource('candace')+'#combat3'],[
    ['零命元素普攻', 'normal.param1', {...scarlet,element:'hydro'},.20],
    ['一命元素普攻', 'normal.param1', {...scarlet,rank:1,element:'hydro'},.20],
    ['物理普攻排除', 'normal.param1', scarlet,0],
    ['元素重击排除', 'normal.param6', {...scarlet,element:'hydro'},0],
  ],true);
  for (const [rank,elevation] of [[1,.015],[2,.07],[3,.015],[4,.015],[5,.015],[6,.07]]) {
    const property='attribute.reaction.lunar.elevationFactor', family='lunar-charged';
    clause('columbina','/constellations/'+(rank-1),[constellationSource('columbina')+'#c'+rank],[
      ['命座的月曜擢升', 'skill.param3',{measure:property,family,rank},ratesElevated(rank)],
      ['普通伤害排除擢升', 'skill.param1',{measure:property,rank},1],
    ]);
    function ratesElevated(rank) { return [1.015,1.07,1.015,1.015,1.015].slice(0,rank-1).reduce((value,rate)=>value*rate,1+elevation); }
  }
  const hurricane = { 'faruzan.hurricaneArrow':true };
  clause('faruzan','/talents/1',[talentSource('faruzan')+'#combat2'],[
    ['疾风示现飓烈箭', 'skill.hurricane-arrow',{values:hurricane},hit=>hit.attack*rates.faruzan.combat1.param6[0]*.45],
    ['普通满蓄排除', 'normal.param6',{values:hurricane},0],
    ['未进入疾风示现', 'skill.hurricane-arrow',{},0],
  ]);
  const bane = { measure:'target.resistance.anemo',values:{'faruzan.windBane':true} };
  clause('faruzan','/talents/2/details/3',[talentSource('faruzan')+'#combat3'],[
    ['诡风之祸目标风抗减少', 'skill.param1',bane,.1-rates.faruzan.combat3.param4[0]],
    ['目标没有诡风之祸', 'skill.param1',{measure:bane.measure},.1],
  ],true);
  clause('gorou','/talents/2',[talentSource('gorou')+'#combat3'],[
    ['大将威仪沿用旗指物防御加成', 'burst.param1',{measure:'attribute.flatDefense',values:{'gorou.burstDomain':true}},rates.gorou.combat2.param2[0]],
    ['未获得旗指物与大将威仪', 'burst.param1',{measure:'attribute.flatDefense'},0],
  ]);
  if (weapons.has('kitaincrossspear')) {
    const useSong = { 'illuga.nightingaleSong':true,'illuga.nightingaleSpend':true };
    const slots = [[3,'baseDamageBonus','ordinary'],[4,'reaction.lunar.flatBaseBonus','lunar-crystallize']];
    for (const [parameter,property,family] of slots) {
      const settings={measure:'attribute.'+property,family,values:useSong,weaponId:'kitaincrossspear'};
      clause('illuga','/talents/2/details/'+(parameter-2),[talentSource('illuga')+'#combat3'],[
        ['夜莺之歌生效', 'skill.param1',settings,hit=>hit.em*rates.illuga.combat3['param'+parameter][0]],
        ['本次未消耗夜莺之歌', 'skill.param1',{...settings,values:{}},0],
        ['角色退场排除', 'skill.param1',{...settings,values:{...useSong,onField:false}},0],
      ]);
      const scaling = parameter===3?[.07,.14,.24]:[.48,.96,1.60];
      clause('illuga','/passives/1',[talentSource('illuga')+'#passive2'],scaling.map((rate,index)=>[
        `${index+1}名水或岩角色`, 'skill.param1', {...settings,ascension:4,party:['geo','hydro'].slice(0,index)},
        hit=>hit.em*(rates.illuga.combat3['param'+parameter][0]+rate),
      ]));
    }
  }
  grant('kukishinobu','/passives/1','skill.param4','baseDamageBonus',{ascension:4,weaponId:'ironsting'},hit=>hit.em*.25);
  const securedHymn = { measure:'attribute.reaction.lunar.flatBaseBonus', family:'lunar-bloom',ascension:6,values:{'lauma.paleHymn':true} };
  clause('lauma','/talents/2/details/3',[talentSource('lauma')+'#combat3'],[
    ['苍色祷歌加成月绽放', 'skill.param3',securedHymn,hit=>hit.em*rates.lauma.combat3.param4[0]],
    ['无苍色祷歌', 'skill.param3',{...securedHymn,values:{}},0],
    ['二命的附加祷歌倍率', 'skill.param3',{...securedHymn,rank:2},hit=>hit.em*(rates.lauma.combat3.param4[0]+4)],
  ],true);
  const nascent = { 'lauma.skillMoonWindow':true,firstMoonsign:true };
  grant('lauma','/passives/0','skill.param1','reaction.transformative.critRate',{ascension:1,values:nascent,family:'transformative',reactionMode:'bloom'},.15);
  grant('lauma','/passives/0','skill.param1','reaction.transformative.critDamage',{ascension:1,values:nascent,family:'transformative',reactionMode:'bloom'},1);
  grant('lauma','/passives/0','skill.param3','critRate',{ascension:1,values:{'lauma.skillMoonWindow':true,fullMoonsign:true},family:'lunar-bloom'},.15);
  grant('lauma','/passives/0','skill.param3','critDamage',{ascension:1,values:{'lauma.skillMoonWindow':true,fullMoonsign:true},family:'lunar-bloom'},.70,true);
  grant('lauma','/constellations/1','skill.param3','reaction.lunar.damageBonus',{rank:2,values:{fullMoonsign:true},family:'lunar-bloom'},.40);
  grant('lauma','/constellations/5','skill.param3','reaction.lunar.elevationFactor',{rank:6,values:{fullMoonsign:true},family:'lunar-bloom'},1.25);
  grant('mavuika','/passives/0','skill.param1','attackPercent',{ascension:1,values:{'mavuika.nightsoulBurstWindow':true}},.30,true);
  grant('mavuika','/passives/1','skill.param1','damageBonus',{ascension:4,values:{'mavuika.kiongozi':true,'mavuika.remainingSpiritBonus':100}},.20);
  grant('mona','/constellations/0','burst.param2','amplifyingReactionBonus',{rank:1,values:{'mona.c1Prophecy':true},reactionMode:'vaporize'},.15);
  grant('mona','/constellations/0','burst.param2','reaction.transformative.damageBonus',{rank:1,values:{'mona.c1Prophecy':true},family:'transformative',reactionMode:'swirl',element:'hydro'},.15);
  grant('mona','/constellations/5','normal.param5','damageBonus',{rank:6,values:{'mona.c6SlideSeconds':3}},1.80);
  const seedMark = { 'nahida.seedMark':true };
  grant('nahida','/constellations/1','skill.param3','target.defenseReduction',{rank:2,values:{...seedMark,'nahida.seedQuicken':true}},.30);
  grant('nahida','/constellations/1','skill.param3','reaction.transformative.critRate',{rank:2,values:seedMark,family:'transformative',reactionMode:'hyperbloom'},.20);
  grant('nahida','/constellations/1','skill.param3','critRate',{rank:2,values:seedMark,family:'lunar-bloom'},.15);
  clause('nahida','/constellations/5',[constellationSource('nahida')+'#c6'],[
    ['业障除单段', 'skill.c6-remedy',{rank:6,values:{'nahida.c6Remedy':true},weaponId:'magicguide'},hit=>(2*hit.attack+4*hit.em)*.45],
    ['五命锁定', 'skill.c6-remedy',{rank:5,values:{'nahida.c6Remedy':true}},0],
    ['本次未触发', 'skill.c6-remedy',{rank:6},0],
  ]);
  grant('nefer','/passives/0','skill.param5','baseMultiplier',{ascension:1,values:{'nefer.phantasmVeil':3}},1.24);
  grant('nefer','/passives/0','skill.param5','elementalMastery',{ascension:1,values:{'nefer.veilMastery':true,fullMoonsign:true}},100);
  grant('nefer','/constellations/1','skill.param5','elementalMastery',{rank:2,ascension:1,values:{'nefer.veilMastery':true,fullMoonsign:true}},200);
  grant('sethos','/passives/1','normal.param7','baseDamageBonus',{ascension:4,values:{'sethos.desertShadow':true},weaponId:'ravenbow'},hit=>hit.em*7);
  clause('shenhe','/talents/2/details/1',[talentSource('shenhe')+'#combat3'],['cryo','physical'].map(element=>[
    `领域降低${element==='cryo'?'冰':'物理'}抗性`, 'burst.param1',{measure:'target.resistance.'+element,values:{'shenhe.burstField':true}},.1-rates.shenhe.combat3.param2[0],
  ]),true);
  clause('skirk','/constellations/0',[constellationSource('skirk')+'#c1',libraryRoot+'src/data/characters/Skirk.json:442'],[
    ['晶刃视为重击', 'skill.c1-crystal-blade',{rank:1,ascension:1,values:{'skirk.c1Rift':true}},hit=>hit.attack*5*.45],
    ['突破未达', 'skill.c1-crystal-blade',{rank:1,values:{'skirk.c1Rift':true}},0],
  ]);
  grant('skirk','/constellations/1','skill.param1','attackPercent',{rank:2,values:{'skirk.c2Withering':true,'skirk.sevenfold':true}},.70);
  const directMortar = {'valeriy.assaultOrder':true,'valeriy.assaultOrderWindow':true,'valeriy.spentImpactPotential':100};
  clause('valeriy','/passives/1',[talentSource('valeriy')+'#passive2',monaRoot+'mona_core/src/character/characters/electro/valeriy.rs:43-49'],[
    ['普通版每点0.3%', 'skill.param1',{ascension:4,values:directMortar,measure:'attribute.baseDamageBonus'},hit=>hit.attack*(rates.valeriy.combat1.param7[0]+.30)*(1+hit.bonus('ATTACK_PERCENT'))],
    ['辉映版每点0.9%', 'skill.param1',{ascension:4,values:{...directMortar,radiance:'stellar-conduct'},measure:'attribute.reaction.stellar-conduct.flatBaseBonus',family:'stellar-conduct'},hit=>hit.attack*(rates.valeriy.combat1.param8[0]+.90)*(1+hit.bonus('ATTACK_PERCENT'))],
  ]);
  clause('vodyanitsa','/talents/1',[talentSource('vodyanitsa')+'#combat2'],['hydro','cryo'].map(element=>[
    `角笛降低${element==='hydro'?'水':'冰'}抗性`, 'skill.param4',{measure:'target.resistance.'+element,values:{'vodyanitsa.hornShred':true}},.1-rates.vodyanitsa.combat2.param8[0],
  ]));
  const duet = {'vodyanitsa.c2Duet':true};
  grant('vodyanitsa','/constellations/1','skill.param4','critDamage',{rank:2,values:duet},1);
  grant('vodyanitsa','/constellations/1','skill.param4','critDamage',{rank:2,values:{...duet,'vodyanitsa.c2VortexDuet':true},family:'stellar-swirl',element:'anemo'},1.10);
  const drifting = {'yumemizukimizuki.dreamdrifter':true};
  const mizuki = 'yumemizukimizuki';
  if (weapons.has('magicguide')) {
    for (const [number, property, family] of [[2,'reaction.transformative.damageBonus','transformative'],[6,'reaction.stellar-swirl.damageBonus','stellar-swirl']]) {
      clause(mizuki,'/talents/1/details/'+(number===2?3:4),[talentSource(mizuki)+'#combat2'],[
        ['梦浮精通换算', 'skill.param1',{values:drifting,weaponId:'magicguide',measure:'attribute.'+property,family,reactionMode:'swirl'},hit=>hit.em*rates[mizuki].combat2['param'+number][0]/100],
        ['退出梦浮排除', 'skill.param1',{weaponId:'magicguide',measure:'attribute.'+property,family,reactionMode:'swirl'},0],
      ],true);
    }
    grant(mizuki,'/constellations/0','skill.param1','reaction.transformative.flatBaseBonus',{rank:1,weaponId:'magicguide',values:{[mizuki+'.c1Night']:true},family:'transformative',reactionMode:'swirl'},hit=>hit.em*11);
    grant(mizuki,'/constellations/0','skill.param1','reaction.stellar-swirl.flatBaseBonus',{rank:1,weaponId:'magicguide',values:{[mizuki+'.c1Night']:true},family:'stellar-swirl'},hit=>hit.em*5.5);
  }
  grant(mizuki,'/constellations/5','skill.param1','reaction.transformative.critRate',{rank:6,values:drifting,family:'transformative',reactionMode:'swirl'},.30);
  grant(mizuki,'/constellations/5','skill.param1','critDamage',{rank:6,values:drifting,family:'stellar-swirl'},.70);
  grant('varka','/constellations/0','skill.param14','baseMultiplier',{rank:1,values:{'varka.kingWine':true}},2);

  grant('faruzan','/passives/0','skill.param2','target.resistance.anemo',{ascension:1,values:{'faruzan.collapseBane':true}},.1-rates.faruzan.combat3.param4[0]);
  clause('lauma','/talents/1/details/6',[talentSource('lauma')+'#combat2'],['hydro','dendro'].flatMap(element=>[
    ['被霜林圣域击中', 'skill.param1',{measure:'target.resistance.'+element,values:{'lauma.frostgroveShred':true}},.1-rates.lauma.combat2.param8[0]],
    ['未被击中', 'skill.param1',{measure:'target.resistance.'+element},.1],
  ]),true);
  const automaticCharged = {'mona.c2Charged':true};
  clause('mona','/constellations/1',[constellationSource('mona')+'#c2'],[
    ['自动重击的倍率', 'normal.c2-charged',{rank:2,values:automaticCharged},hit=>hit.attack*rates.mona.combat1.param5[0]*.45],
    ['未触发排除', 'normal.c2-charged',{rank:2},0], ['一命锁定', 'normal.c2-charged',{rank:1,values:automaticCharged},0],
  ]);
  if (weapons.has('sacrificialfragments')) {
    const weapon={weaponId:'sacrificialfragments',weaponLevel:90,weaponAscension:6};
    const effect = {ascension:4,...weapon};
    const excess = hit=>Math.max(hit.em-200,0);
    clause('nahida','/passives/1',[talentSource('nahida')+'#passive2'],[
      ['普通灭净三业增加伤害', 'skill.param3',{...effect,measure:'attribute.damageBonus'},hit=>Math.min(.80,excess(hit)*.001)],
      ['普通灭净三业增加暴击率', 'skill.param3',{...effect,measure:'attribute.critRate'},hit=>.05+Math.min(.24,excess(hit)*.0003)],
      ['未到突破排除', 'skill.param3',{...weapon,measure:'attribute.damageBonus'},0],
      ['只作用于灭净三业', 'skill.param1',{...effect,measure:'attribute.damageBonus'},0],
    ],true);
  }
  const enhancedC6 = {'skirk.sevenfold':true,'skirk.c6NormalSlash':true,'skirk.c6Retaliation':true};
  clause('skirk','/constellations/5',[constellationSource('skirk')+'#c6',libraryRoot+'src/data/characters/Skirk.json:467'],[
    ['三层极恶技·灭协同', 'burst.c6-slash',{ascension:1,rank:6,values:{'skirk.c6SlashStacks':3}},hit=>hit.attack*7.5*3*.45],
    ['零层极恶技·灭协同', 'burst.c6-slash',{ascension:1,rank:6},0],
    ['五命锁定', 'skill.c6-slash',{ascension:1,rank:5,values:enhancedC6},0],
    ['一突破门槛', 'skill.c6-slash',{rank:6,values:enhancedC6},0],
    ['七相一闪普攻协同单次', 'skill.c6-slash',{ascension:1,rank:6,values:enhancedC6},hit=>hit.attack*1.8*.45],
    ['七相一闪受伤协同单次', 'skill.c6-retaliation',{ascension:1,rank:6,values:enhancedC6},hit=>hit.attack*1.8*.45],
  ]);

  return { rows, verified, summary: { cases: rows.length, verified: verified.size, failures: rows.filter(row => row.status !== '符合独立对照').length } };
}
