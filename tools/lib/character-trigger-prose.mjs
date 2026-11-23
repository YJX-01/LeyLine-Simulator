import { isDeepStrictEqual } from 'node:util';
import { readContentSource } from './content-source.mjs';

const sourceRoot = 'genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const compact = text => text.replaceAll('**', '').trim();
const valueMatches = row => !row.issue && (row.expected === null ? row.value === null
  : Number.isFinite(row.expected) && Number.isFinite(row.value)
    && Math.abs(row.value - row.expected) <= Math.max(1e-8, Math.abs(row.expected) * 1e-9));
const positive = row => row.expected > 0;
const zero = row => row.expected === 0;
const missing = key => row => row.expected === null && row.required?.includes(key);
const factIs = (key, value, outcome) => row => row.settings.facts?.[key] === value && outcome(row);
const has = (rows, predicates) => predicates.every(predicate => rows.some(predicate));
const damageScope = '按已确认的当次触发核对一击伤害的归属、倍率和元素。';
const spec = (entity, field, hit, stat, scale, element, category, phrases, options = {}) => ({
  entity, field, hit: entity + '.' + hit, base: [{ stat, ...(typeof scale === 'string' ? { parameter: scale } : { ratio: scale }) }],
  element, category, phrases, audit: 'triggerHits', ...options,
});

const mappings = [
  spec('aino', '/constellations/1', 'c2.water-shot', 'attack', .25, 'hydro', 'burst', [
    '「冷静一下鸭」将对该敌人发射一枚额外的水弹，基于爱诺攻击力的25%与元素精通的100%，造成水元素范围伤害',
    '造成的伤害视为元素爆发伤害',
  ], { audit: 'characterGrants', gate: 'coolingFieldAllyHit', base: [
    { stat: 'attack', ratio: .25 }, { stat: 'elementalMastery', ratio: 1 },
  ], scope: '给定本次处于冷却域内的队友命中已触发额外水弹，按爱诺面板核对一击水元素爆发伤害。' }),
  spec('nicole', '/constellations/0', 'c1.unity', 'attack', 6, undefined, undefined, [
    '依据该角色的元素类型，造成对应元素范围伤害，该伤害相当于该角色攻击力的600%，并视为由该角色造成的伤害',
  ], { audit: 'evaluatedHits', gate: 'unityReady', coordinated: { dealer: 'on-field', readyFact: 'nicole.unityReady', cooldownMs: 6000 },
    scope: '采用当前场上角色的攻击力、元素和伤害归属。另有凯亚伤害数值及凯亚和丽莎的时间线测试。' }),
  spec('collei', '/passives/0', 'a0.sprout', 'attack', .4, 'dendro', 'skill', [
    '造成相当于柯莱攻击力40%的草元素伤害', '新叶效果造成的伤害视为元素战技伤害',
  ], { audit: 'additionalConstellationHits', gate: 'sproutWindow' }),
  spec('collei', '/constellations/1', 'a0.sprout', 'attack', .4, 'dendro', 'skill', [
    '造成相当于柯莱攻击力40%的草元素伤害', '新叶效果造成的伤害视为元素战技伤害',
  ], { audit: 'additionalConstellationHits', declaration: '/passives/0', gate: 'sproutWindow',
    scope: '解锁飞叶迴斜后，二命在飞叶轮返回时可以直接获得新叶。按同一声明核验新叶的一次伤害。' }),
  spec('collei', '/constellations/5', 'c6.mini-cuilein-anbar', 'attack', 2, 'dendro', 'other', [
    '会产生一个迷你柯里安巴，造成相当于柯莱攻击力200%的草元素伤害',
  ], { audit: 'characterGrants', gate: 'miniCuileinAnbarReady' }),
  spec('lynette', '/constellations/1', 'c2.second-vivid-shot', 'attack', 'param3', undefined, undefined, [
    '魔术·运变惊奇召唤的惊奇猫猫盒发射彩练术弹时，将额外发射一枚彩练术弹',
  ], { audit: 'additionalConstellationHits', gate: 'vividShotFired', elementBy: 'absorbedElement',
    scope: '给定已发射彩练术弹，二命追加一枚与原弹同倍率、同转化元素的爆发弹。' }),
  ...['aether-geo', 'lumine-geo'].map(entity => spec(entity, '/constellations/1', 'c2.rockcore-meltdown',
    'attack', 'param1', undefined, undefined, ['星陨剑的荒星被摧毁时会再度发生爆炸，造成等同于星陨剑伤害的额外岩元素范围伤害'],
    { audit: 'additionalConstellationHits', gate: 'rockcoreDestroyed', sourceId: 'travelergeo',
      scope: '给定完整生成的荒星被摧毁，二命按星陨剑的等级倍率计算一击岩元素战技伤害。' })),
  spec('charlotte', '/talents/0/description', 'normal.param9', 'attack', 'param9', 'cryo', 'charged', [
    '夏洛蒂施放重击后，将降下穿透敌人的灵息之刺，造成具有芒性的冰元素范围伤害',
  ], { gate: 'spiritbreathReady' }),
  spec('mavuika', '/constellations/5', 'c6.flamestrider-crash', 'attack', 2, 'pyro', 'skill', [
    '将会有一辆驰轮车撞向被命中的敌人，造成200%攻击力的具有夜魂性质的火元素范围伤害',
  ], { gate: 'c6CrashReady', extraGate: 'ringActive' }),
  spec('mavuika', '/constellations/5', 'c6.scorching-ring', 'attack', 5, 'pyro', 'skill', [
    '对周围的敌人造成一次500%攻击力的具有夜魂性质的火元素范围伤害',
  ], { gate: 'c6RidingRingReady', extraGate: 'flamestrider' }),
  spec('arlecchino', '/constellations/1', 'c2.balemoon-bloodfire', 'attack', 9, 'pyro', 'other', [
    '将在前方唤出厄月血火，造成相当于她的攻击力900%的火元素范围伤害',
  ], { gate: 'c2BloodfireReady', ascension: true }),
  spec('citlali', '/constellations/3', 'c4.obsidian-skull', 'elementalMastery', 18, 'cryo', 'other', [
    '会造成相当于茜特菈莉元素精通1800%的具有夜魂性质的冰元素范围伤害', '该伤害不被视为元素爆发伤害',
  ], { gate: 'c4SkullReady' }),
  spec('kachina', '/constellations/5', 'c6.shield-shockwave', 'defense', 2, 'geo', 'other', [
    '卡齐娜将造成相当于她的防御力200%的岩元素范围伤害',
  ], { gate: 'c6ShieldShockwaveReady' }),
  spec('ororon', '/passives/0', 'a0.hypersense', 'attack', 1.6, 'electro', 'other', [
    '造成具有夜魂性质的雷元素伤害',
  ], { gate: 'a1HypersenseReady', ascension: true }),
  spec('ororon', '/constellations/5', 'c6.hypersense', 'attack', 3.2, 'electro', 'other', [
    '将触发一次等同于「显象超感」的效果，造成原本200%的伤害',
  ], { gate: 'c6HypersenseReady', ascension: true }),
  spec('dori', '/constellations/1', 'c2.jinni-toop', 'attack', .5, 'electro', 'other', [
    '将从该角色处发射一枚镇灵炮，造成相当于多莉攻击力50%的伤害',
  ], { gate: 'c2JinniToopReady' }),
  spec('yaoyao', '/constellations/5', 'c6.mega-radish', 'attack', .75, 'dendro', 'other', [
    '基于瑶瑶攻击力的75%，造成草元素范围伤害',
  ], { gate: 'c6MegaRadishReady' }),
  spec('lohen', '/constellations/1', 'c2.evilsbane-blade', 'attack', 5, 'cryo', 'other', [
    '将会额外追加进行一次攻击，造成相当于洛恩攻击力500%的冰元素范围伤害',
  ], { gate: 'c2EvilsbaneBladeReady', extraGate: 'masterstroke' }),
];

const triggerFields = new Set(mappings.map(({ entity, field }) => entity + field));

export function ownsCharacterTriggerField(entity, field) {
  return triggerFields.has(entity + field);
}

function triggerProbes(rows, mapping, rank) {
  const { entity, gate, ascension, extraGate, hit, category } = mapping;
  const gateCases = [positive, factIs(gate, false, zero), missing(entity + '.' + gate)];
  if (rank) gateCases.push(row => row.settings.rank === rank - 1 && zero(row));
  if (ascension) gateCases.push(row => row.settings.ascension === 0 && zero(row));
  if (extraGate) gateCases.push(factIs(extraGate, false, zero));
  const set = { skill: 'goldentroupe', burst: 'noblesseoblige', charged: 'wandererstroupe', other: 'noblesseoblige' }[category];
  gateCases.push(row => row.settings.set === set && positive(row));
  if (hit === 'yaoyao.c6.mega-radish') gateCases.push(missing('panel'),
    row => row.settings.captureRadish === true && positive(row),
    row => row.settings.captureRadish === false && positive(row));
  return has(rows, gateCases);
}

function additionalProbes(rows, allRows, mapping) {
  const { entity, gate } = mapping;
  const fact = entity + '.' + gate;
  const baseline = row => !row.settings.setId && !row.settings.omit && !row.settings.captureCase
    && row.settings.burstTime === undefined;
  const source = row => row.settings.case === 'source' && row.expected === 1;
  const cases = [source, row => baseline(row) && factIs(fact, false, zero)(row)];
  if (entity === 'collei') {
    const reaction = 'collei.reactionBeforeRingReturn';
    return has(rows, [...cases,
      row => baseline(row) && row.settings.rank === 1 && factIs(reaction, true, positive)(row),
      row => baseline(row) && row.settings.rank === 1 && factIs(reaction, false, zero)(row),
      row => baseline(row) && row.settings.rank === 2 && factIs(reaction, false, positive)(row),
      row => row.settings.rank === 1 && missing(reaction)(row),
      row => baseline(row) && row.settings.ascension === 0 && zero(row)]);
  }
  const lynette = entity === 'lynette';
  const originalId = entity + (lynette ? '.burst.param3' : '.skill.param1');
  const sameOriginal = row => rows.some(addition => baseline(addition) && positive(addition)
    && addition.settings.element === row.settings.element && addition.settings.talentLevel === undefined
    && addition.expected === row.expected);
  return allRows.some(row => row.settings.hit === originalId && valueMatches(row) && sameOriginal(row))
    && has(rows, [...cases, missing(fact), row => baseline(row) && row.settings.rank === 1 && zero(row),
      row => row.settings.talentLevel === 4 && positive(row),
      ...lynette ? [missing('absorbedElement'), factIs('absorbedElement', 'none', zero),
        ...['pyro', 'hydro', 'electro', 'cryo'].map(element => row =>
          baseline(row) && row.settings.element === element && row.settings.facts?.absorbedElement === element && positive(row))]
        : [missing('panel'), missing('captureOrder.panel')]]);
}

function declarationAt(character, field) {
  return field.split('/').filter(Boolean).reduce((value, key) => value?.[key], character);
}

function referenceFor(mapping) {
  const [, collection, idx] = mapping.field.split('/');
  const folder = collection === 'constellations' ? 'constellations' : 'talents';
  const key = { constellations: 'c', talents: 'combat', passives: 'passive' }[collection] + (Number(idx) + 1);
  const file = sourceRoot + folder + '/' + (mapping.sourceId ?? mapping.entity) + '.json';
  return { file, key, ref: file + '#/' + key + '/description' };
}

export function makeCharacterTriggerProse(entities, results) {
  const characters = new Map(entities.characters.map(character => [character.id, character.metadata ?? character]));
  const evidence = new Map();
  for (const mapping of mappings) {
    const { entity, field, hit, audit } = mapping;
    const character = characters.get(entity);
    const proseField = field.replace(/\/description$/, '');
    const owner = mapping.declaration ?? proseField;
    const description = declarationAt(character, proseField)?.description;
    const declarations = declarationAt(character, owner)?.hits ?? [];
    const hitIndex = declarations.findIndex(entry => entry.id === hit);
    const declaration = declarations[hitIndex];
    if (!description || !declaration || !isDeepStrictEqual(declaration.base, mapping.base)
      || declaration.element !== mapping.element || declaration.category !== mapping.category
      || declaration.elementBy !== mapping.elementBy || !isDeepStrictEqual(declaration.coordinated, mapping.coordinated)
      || (mapping.extraGate && !declaration.when?.includes(entity + '.' + mapping.extraGate))
      || (!mapping.coordinated && !declaration.when?.includes(entity + '.' + mapping.gate))) continue;

    const { file, key, ref } = referenceFor(mapping);
    const sourceDescription = readContentSource(new URL('../data/sources/' + file, import.meta.url))[key]?.description;
    if (!sourceDescription || compact(description) !== compact(sourceDescription)) continue;
    const hitField = owner + '/hits/' + hitIndex;
    const unlockField = owner.split('/');
    const unlockRank = unlockField[1] === 'constellations' ? Number(unlockField[2]) + 1 : undefined;
    const readings = results.evaluatedHits?.filter(row => row.entity === entity && row.field === hitField && row.hit === hit) ?? [];
    if (readings.length !== 1 || !valueMatches(readings[0]) || !positive(readings[0])) continue;
    const [reading] = readings;
    if (unlockRank !== undefined && (reading.unlock?.state !== 'constellation' || reading.unlock.rank !== unlockRank
      || reading.activeRanks?.constellation !== unlockRank || reading.lockedValue !== 0)) continue;

    const sourceField = audit === 'additionalConstellationHits' || audit === 'evaluatedHits' ? hitField : proseField;
    const allRows = results[audit]?.rows?.filter(row => row.entity === entity && row.field === sourceField) ?? [];
    const rows = audit === 'evaluatedHits' ? readings : allRows.filter(row => row.settings?.hit === hit);
    if (!rows.length || !rows.every(valueMatches)) continue;
    if (audit === 'triggerHits') {
      const upstream = results.triggerHitEvidence?.find(row => row.entity === entity && row.field === sourceField);
      if (upstream?.resolution !== 'complete' || !upstream.sources?.some(source => source.includes('genshin-db@'))
        || !upstream.sources.some(source => !source.includes('genshin-db@'))
        || rows.some(row => !upstream.sources.every(source => row.sources?.includes(source)))
        || !triggerProbes(rows, mapping, unlockRank)) continue;
      if (hit === 'ororon.c6.hypersense') {
        const base = results.triggerHits?.rows?.find(row => row.entity === entity && row.field === '/passives/0'
          && row.settings?.hit === 'ororon.a0.hypersense' && positive(row));
        if (!base || !valueMatches(base) || Math.abs(base.expected * 2 - rows.find(positive).expected) > 1e-8) continue;
      }
    } else if (audit === 'additionalConstellationHits') {
      if (rows.some(row => !row.sources?.length) || !additionalProbes(rows, allRows, mapping)) continue;
    } else {
      const fact = entity + '.' + mapping.gate;
      if (reading.activeFacts?.[fact] !== true || !reading.exclusions?.some(row => row.facts?.[fact] === false && row.value === 0)) continue;
      if (audit === 'characterGrants' && !has(rows, [
        row => row.settings.unlocked === true && row.settings.active === true && positive(row),
        row => row.settings.unlocked === true && row.settings.active === false && zero(row),
        row => row.settings.unlocked === false && row.settings.active === true && zero(row),
      ])) continue;
    }
    const proof = { audit, field: hitField, sourceField, cases: rows.length, scope: mapping.scope ?? damageScope,
      refs: [...new Set([
        'src/game-data/data/characters/' + entity + '.json#' + hitField, ref, 'evaluatedHits#' + entity + hitField,
        ...rows.flatMap(row => row.sources ?? []),
        ...entity === 'nicole' ? ['tests/integration/roster-mechanics.test.mjs'] : [],
      ])] };
    const id = entity + field;
    evidence.set(id, [...evidence.get(id) ?? [], { phrases: mapping.phrases, proof, sourceDescription: compact(sourceDescription) }]);
  }
  return (entity, field, statement) => {
    const proofs = [], parts = [];
    for (const { phrases, proof, sourceDescription } of evidence.get(entity + field) ?? []) {
      if (!sourceDescription.includes(statement)) continue;
      for (const text of phrases) {
        if (text === statement) proofs.push(proof);
        else if (statement.includes(text)) parts.push({ text, ...proof });
      }
    }
    return { proofs, parts };
  };
}
