import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { assembleCalculationLibrary } from './calculation-library.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, elements, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

export const confirmedReactionElevationIds = ['flins', 'zibai', 'mitya', 'odette'];
export const confirmedReactionElevationPeerIds = ['ineffa', 'sandrone', 'columbina', 'nefer'];
export const confirmedReactionElevationWeaponIds = ['dullblade', 'beginnersprotector', 'wastergreatsword', 'magicguide', 'apprenticesnotes'];

const field = '/constellations/5';
const genshin = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const guides = 'tools/data/sources/kqm-web/2026-11-22/constellation-elevation-facts.json';
const formulas = 'tools/data/sources/kqm-web/2026-11-15/reaction-formulas.json';
const crossElevation = 'tools/data/sources/kqm-web/2026-11-25/columbina-cross-owner-elevation.json';
const growthRoot = 'tools/data/sources/catalog/genshin-db/';
const talents = genshin + 'stats/talents.json';
const levelSource = 'tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/player.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const math = read(formulas);
const growth = read(growthRoot + 'characters.json');
const curves = read(growthRoot + 'character-curves.json');
const weaponGrowth = read(growthRoot + 'weapons.json');
const rates = read(talents);
const levelMultiplier = read(levelSource);
const reactionRules = assembleCalculationLibrary(read('src/game-data/data/calculation/common.json'), read('src/game-data/data/calculation/reactions.json'), []);
const captured = new Map(read(guides).sources.map(source => [source.id, source.facts]));
const clause = (id, group, key) => genshin + 'ChineseSimplified/' + group + '/' + id + '.json#' + key;
const description = pointer => {
  const [path, key] = pointer.split('#');
  return read(path)[key].description;
};
function amount(text, pattern) {
  const value = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(value)) throw new Error('擢升固定来源缺少公式参数 ' + pattern.source);
  return value;
}

const resistances = Object.fromEntries(elements.map(element => [element, element === 'cryo' ? .25 : .1]));
const levelOf = ascension => ascension === 1 ? 20 : 1;
const numeric = value => value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null;
const close = (actual, expected) => actual !== null && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const masteryFactor = em => 1 + 6 * em / (2000 + em);
const blessing = stat => 1 + Math.min(.14, .00007 * stat);
function whiteStat(id, stat, ascension = 0) {
  const { base, curve, promotion } = growth[id].stats;
  return base[stat] * curves[levelOf(ascension)][curve[stat]] + promotion[ascension][stat];
}
const atk = (id, weapon, ascension = 0) => whiteStat(id, 'attack', ascension) + weaponGrowth[weapon].stats.base.attack;

export function auditConfirmedReactionElevation(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const teams = new Map();
  const available = id => weapons.has(['mitya', 'nefer'].includes(id) ? 'magicguide' : novice[characters.get(id)?.identity.weaponType]);
  function build(id, constellation, ascension) {
    const character = characters.get(id);
    const weapon = weapons.get(['mitya', 'nefer'].includes(id) ? 'magicguide' : novice[character.identity.weaponType]);
    return { ...auditBuild(character, weapon), level: levelOf(ascension), ascension, constellation };
  }

  function team(entity, dealer, constellation, ascension, peerConstellation) {
    const key = JSON.stringify([entity, dealer, constellation, ascension, peerConstellation]);
    if (!teams.has(key)) {
      const builds = [{ id: 'actor', build: build(entity, constellation, ascension) }];
      if (dealer !== entity) builds.push({ id: 'peer', build: build(dealer, peerConstellation, ['ineffa', 'odette'].includes(dealer) ? 1 : 0) });
      const prepared = engine.prepareStructuredBuilds(builds);
      if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
      teams.set(key, prepared.team);
    }
    return teams.get(key);
  }

  function readHit(entity, constellation, { dealer = entity, hitId, ascension = 0, teamFacts = {}, dealerFacts = {}, ownerFacts = {}, peerConstellation = 0, disabledPeerEffect }) {
    const character = characters.get(dealer), source = characters.get(entity), actorId = dealer === entity ? 'actor' : 'peer';
    const talent = character.talents.find(entry => entry.hits.some(hit => hit.id === hitId));
    const hit = talent.hits.find(entry => entry.id === hitId);
    const { setup, request } = auditHit(character, talent, hit, levelOf(ascension));
    const frame = request.frame;
    setAuditDefaults(character, frame);
    setup.events.find(event => event.id === 'hit').actorId = actorId;
    request.actorId = actorId;
    frame.factOverrides.find(row => row.subject.kind === 'actor').subject = { kind: 'actor', id: actorId };
    for (const [element, resistance] of Object.entries(resistances)) setup.targets[0].inputs['resistance.' + element] = number('scalar', resistance);
    setup.targets[0].facts = { 'aura.hydro': bool(false), 'aura.electro': bool(false) };
    if (disabledPeerEffect) setup.effectRevisions = [{ instanceId: engine.calculationEffectInstanceId('peer',
      { namespace: 'builtin', id: disabledPeerEffect, revision: '1' }, null), disabled: true }];
    if (dealer !== entity) {
      const ownerDefaults = { facts: {}, factOverrides: [] };
      setAuditDefaults(source, ownerDefaults);
      frame.factOverrides.push(...ownerDefaults.factOverrides.filter(row => row.subject.kind === 'actor'));
      for (const row of ownerDefaults.factOverrides.filter(row => row.subject.kind === 'target')) {
        const active = frame.factOverrides.find(previous => previous.subject.kind === 'target');
        if (active) Object.assign(active.facts, row.facts);
        else frame.factOverrides.push(row);
      }
    }
    const assign = (definition, values, actor) => {
      for (const [key, value] of Object.entries(values)) {
        const factSpec = combatFactDeclaration(definition.metadata.facts, key) ?? combatFactDeclaration(character.metadata.facts, key);
        const row = value === null ? fact(null) : typeof value === 'number' ? number(factSpec.type.unit, value)
          : typeof value === 'boolean' ? bool(value) : fact({ kind: 'enum', value });
        if (factSpec.scope === 'query') frame.facts[key] = row;
        else {
          const subject = factSpec.scope === 'team' ? { kind: 'team' } : { kind: 'actor', id: actor };
          let target = frame.factOverrides.find(entry => entry.subject.kind === subject.kind && entry.subject.id === subject.id);
          if (!target) frame.factOverrides.push(target = { subject, facts: {} });
          target.facts[key] = row;
        }
      }
    };
    assign(source, teamFacts, 'actor');
    assign(source, ownerFacts, 'actor');
    assign(source, dealerFacts, actorId);
    return engine.evaluateStructuredHit(team(entity, dealer, constellation, ascension, peerConstellation), setup, request);
  }

  function verify(entity, other, changes, remainder, check) {
    if (![entity, ...other].every(available)) return;
    const start = rows.length, c6 = clause(entity, 'constellations', 'c6'), id = 'kqm.web.' + entity + '-c6';
    const source = captured.get(id), sources = [c6, formulas, ...(source ? [guides + '#' + id] : [])];
    function probe(options, factor, rank = 6, independent) {
      const result = readHit(entity, rank, options), output = result.outputs[0];
      const value = numeric(result.totals.all), status = result.totals.all.state;
      const stage = output?.stages.find(entry => ['elevation', 'ordinary-elevation'].includes(entry.id));
      const observedFactor = numeric(stage?.value);
      const baseline = factor === null ? null : numeric(readHit(entity, 5, options).totals.all);
      const expected = factor === null || baseline === null ? null : (independent?.damage ?? baseline / (options.baselineElevation ?? 1)) * factor;
      const matches = factor === null ? status === 'unknown' && (!options.stacking || result.diagnostics.some(issue =>
        issue.code === 'unreviewed-mechanism' && issue.nodeId === options.stacking))
        : baseline > 0 && close(value, expected) && close(observedFactor, factor) && (!independent || close(baseline, independent.damage));
      rows.push({ entity, field, output: 'damage', probe: { rank, ...options }, sources: [...sources, ...independent?.sources ?? []], expected, expectedFactor: factor, value, factor: observedFactor, status,
        ...matches ? {} : { issue: '伤害结果或最终擢升乘区与固定原文不符。', diagnostics: result.diagnostics } });
    }
    function reaction({ family, element, ascension = 0, coefficient, facts }, expected, rank = 6) {
      const sourceBuild = build(entity, rank, ascension);
      const actor = { id: 'actor', character: entity, weapon: sourceBuild.weapon.id, build: sourceBuild, inputs: {} };
      const definitions = [entity, sourceBuild.weapon.id].map(id => ({ id, name: id, version: '1',
        source: { kind: 'preset', reference: sourceBuild.dataVersion, verified: false }, nodes: [], effects: [] }));
      definitions.push({ id: 'reaction-query', name: 'reaction-query', version: '1', source: { kind: 'user', reference: 'reaction-elevation-audit', verified: false },
        nodes: [{ id: 'result', op: 'game-damage' }], damage: 'result', effects: [] });
      const event = { id: 'reaction', kind: 'damage', actor: actor.id, timeMs: 1, order: 1, definition: 'reaction-query',
        reactionEvent: { family, element, coefficient, facts, triggerActorId: actor.id,
          contributors: [{ actorId: actor.id, qualified: true, crit: 'noncritical' }] } };
      const project = { schemaVersion: sourceBuild.schemaVersion, rulesVersion: 'timeline-v1', id: 'reaction-elevation-audit', revision: '1',
        definitions, candidate: { id: 'team', actors: [actor] }, conditions: {}, reactionRules, enemy: { level: 1, defenseReduction: 0, defenseIgnore: 0, resistances },
        timeline: [event], objective: {} };
      const result = engine.evaluateTimeline(project), damage = result.points[0]?.real?.structured?.totals.all;
      const value = numeric(damage), status = damage?.state ?? result.status;
      const matches = expected === null ? status === 'unknown' : close(value, expected);
      rows.push({ entity, field, output: 'reaction-damage', probe: { rank, family, facts }, sources: [...sources, levelSource], expected, value, status,
        ...matches ? {} : { issue: '明确归属的反应贡献值与固定来源不符。', diagnostics: result.diagnostics } });
    }
    check(description(c6), source, probe, reaction);
    if (rows.length === start || rows.slice(start).some(row => row.issue)) return;
    for (const [index, buff] of characters.get(entity).metadata.constellations[5].buffs.entries()) {
      if (buff.modifiers.some(modifier => modifier.target.endsWith('.elevation') || modifier.target.endsWith('.elevationFactor'))) {
        verified.add(entity + field + '/buffs/' + index);
      }
    }
    resolved.push({ entity, field, resolved: changes, remaining: remainder });
    if (remainder) gaps.push({ entity, field, reason: remainder });
    else verified.add(entity + field);
  }

  verify('flins', ['ineffa'], '月感电的本人35%、满辉本人45%及满辉队友10%进入最终擢升区。',
    '除哥伦比娅外，其他角色对同一月感电贡献的跨来源擢升仍待核验。', (text, source, probe, reaction) => {
      const [self, party] = [...text.matchAll(/擢升(?:\*\*)?(\d+)%/g)].map(match => +match[1] / 100);
      if (!close(self + party, source.fullMoonsignPersonal)) throw new Error('菲林斯满辉两条擢升的固定依据不一致。');
      const attack = atk('flins', 'beginnersprotector') * (1 + amount(description(clause('flins', 'constellations', 'c4')), /攻击力提升(\d+)%/) / 100);
      const independent = { damage: attack * rates.flins.combat3.param2[3] * 3 * blessing(attack) * (1 - resistances.electro),
        sources: [growthRoot + 'characters.json#flins', growthRoot + 'weapons.json#beginnersprotector', talents + '#flins/combat3/param2', clause('flins', 'constellations', 'c4')] };
      for (const [dealer, hitId, dealerFacts] of [['flins', 'flins.burst.param2', {}],
        ['ineffa', 'ineffa.a0.thundercloud-discharge', { 'ineffa.birgittaNearThundercloud': true }]]) {
        for (const fullMoonsign of [false, true, null]) {
          const expected = fullMoonsign === null ? null : 1 + (dealer === 'flins' ? (fullMoonsign ? source.fullMoonsignPersonal : self) : fullMoonsign ? party : 0);
          probe({ dealer, hitId, dealerFacts, teamFacts: { fullMoonsign } }, expected, 6, dealer === 'flins' && fullMoonsign !== null ? independent : undefined);
        }
        probe({ dealer, hitId, dealerFacts, teamFacts: { fullMoonsign: true } }, 1, 5);
      }
      probe({ hitId: 'flins.burst.param1', teamFacts: { fullMoonsign: true } }, 1);
      if (available('columbina')) {
        const overlapping = { dealer: 'columbina', hitId: 'columbina.skill.param3', peerConstellation: 1,
          teamFacts: { fullMoonsign: true }, dealerFacts: { 'columbina.lunar-chargedInterference': true },
          stacking: 'attribute.reaction.lunar.elevationFactor', baselineElevation: 1.015 };
        probe(overlapping, 1 + party + .015);
        probe({ ...overlapping, disabledPeerEffect: 'columbina.c1-elevation', baselineElevation: 1 }, 1 + party);
      }
      const one = levelMultiplier[1] * 3 * blessing(attack) * (1 - resistances.electro) * math.rankedAggregation.weights[0];
      for (const fullMoonsign of [false, true, null]) reaction({ family: 'lunar-charged', element: 'electro',
        facts: [{ subject: { kind: 'team' }, values: { fullMoonsign: fullMoonsign === null ? fact(null) : bool(fullMoonsign) } }] },
      fullMoonsign === null ? null : one * (1 + (fullMoonsign ? source.fullMoonsignPersonal : self)));
    });

  verify('zibai', [], '本次灵驹飞踏两段与确认三秒窗口内的本人月结晶按实际消耗计算，达到70点时擢升为零。',
    '时隙浮光自动积攒、消耗、窗口续期或替换，以及莉奈娅或哥伦比娅亦提供同一月结晶贡献的擢升，需独立证据。', (text, source, probe, reaction) => {
      const threshold = amount(text, /超过(\d+)点/), rate = amount(text, /擢升\*\*(\d+(?:\.\d+)?)%/) / 100;
      if (!close((source.maxConsumed - threshold) * rate, source.maxElevation)) throw new Error('兹白擢升上界的固定依据不一致。');
      const defense = whiteStat('zibai','defense');
      function run(hitId, spent, window, factor, rank = 6) {
        const parameter = hitId.split('.').at(-1), strideHit = hitId.startsWith('zibai.skill.');
        const independent = !strideHit || factor === null ? undefined : {
          damage: defense * rates.zibai.combat2[parameter][3] * (parameter === 'param1' ? .5 : 1.6 * blessing(defense) * 1.3) * (1 - resistances.geo),
          sources: [growthRoot + 'characters.json#zibai', talents + '#zibai/combat2/' + parameter, clause('zibai', 'constellations', 'c2')],
        };
        probe({ hitId, teamFacts: { fullMoonsign: false }, dealerFacts: { 'zibai.spiritsteedStride': true, 'zibai.lunarPhase': true,
          'zibai.strideRadianceConsumed': spent, 'zibai.strideElevationWindow': window } }, factor, rank, independent);
      }
      for (const hitId of ['zibai.skill.param1', 'zibai.skill.param2']) {
        for (const spent of [threshold, 81.5, source.maxConsumed, null]) run(hitId, spent, true, spent === null ? null : 1 + (spent - threshold) * rate);
        run(hitId, source.maxConsumed, false, 1, 5);
      }
      for (const [spent, active] of [[source.maxConsumed, true], [source.maxConsumed, false], [source.maxConsumed, null], [null, true], [null, false]]) {
        const expected = active === false ? 1 : active === null || spent === null ? null : 1 + (spent - threshold) * rate;
        run('zibai.burst.param2', spent, active, expected);
      }
      run('zibai.burst.param1', source.maxConsumed, true, 1);
      const one = levelMultiplier[1] * 1.6 * blessing(defense) * 1.3 * (1 - resistances.geo) * math.rankedAggregation.weights[0];
      for (const active of [false, true]) reaction({ family: 'lunar-crystallize', element: 'geo', facts: [
        { subject: { kind: 'actor', id: 'actor' }, values: { 'zibai.lunarPhase': bool(true), 'zibai.strideElevationWindow': bool(active) } },
        { subject: { kind: 'event' }, values: { 'zibai.strideRadianceConsumed': number('scalar', source.maxConsumed) } },
      ] }, one * (1 + (active ? source.maxElevation : 0)));
    });

  verify('mitya', ['sandrone'], '队伍中米提亚与队友已绑定的直接星超导伤害乘以1.20。',
    '过载消耗时的概率返还，以及与奥黛塔、桑多涅等提供的同次星超导擢升重叠待核验。', (text, _, probe) => {
      const elevation = amount(text, /星超导反应伤害\*\*擢升\*\*(\d+)%/) / 100;
      const own = { hitId: 'mitya.normal.param10', dealerFacts: { stellarAttachments: 1, 'mitya.overloadedWithBeacon': true } };
      const em = (characters.get('mitya')?.attributes.base.elementalMastery ?? 0) + weaponGrowth.magicguide.stats.base.specialized;
      probe(own, 1 + elevation, 6, { damage: em * rates.mitya.combat1.param10[3] * 1.45 * (1 + Math.min(.14, .00028 * em))
        * masteryFactor(em) * (1 - resistances.electro), sources: [talents + '#mitya/combat1/param10', growthRoot + 'weapons.json#magicguide'] });
      probe(own, 1, 5);
      const peer = { dealer: 'sandrone', dealerFacts: { stellarAttachments: 1, radiance: 'stellar-conduct' } };
      probe({ ...peer, hitId: 'sandrone.burst.param2' }, 1 + elevation);
      probe({ hitId: 'mitya.normal.param1' }, 1);
      probe({ ...peer, hitId: 'sandrone.burst.param2', dealerFacts: { ...peer.dealerFacts, radiance: 'stellar-swirl' } }, 1);
      if (available('odette')) {
        const overlapping = { dealer: 'odette', hitId: 'odette.skill.param3', peerConstellation: 6,
          dealerFacts: { stellarAttachments: 1, radiance: 'stellar-conduct', 'odette.splendorStacks': 0 }, stacking: 'attribute.reaction.stellar-conduct.elevation' };
        probe(overlapping, null);
        probe({ ...overlapping, disabledPeerEffect: 'odette.c6-personal-elevation' }, 1 + elevation);
      }
    });

  verify('odette', ['sandrone'], '确认受益者华彩和已绑定星烁命中，队友25%、本人20%或45%进入最终擢升区。',
    '华彩自动授予、转移和到期，以及与米提亚、桑多涅、薇斯纳或沃佳尼查等提供的同次星烁擢升重叠待核验。', (text, source, probe, reaction) => {
      const teamElevation = amount(text, /伤害\*\*擢升\*\*(\d+)%/) / 100;
      const self = amount(text, /额外擢升(\d+)%/) / 100;
      if (!close(self + teamElevation, source.personalWithSplendor)) throw new Error('奥黛塔两条擢升的固定依据不一致。');
      for (const [dealer, hitId] of [['odette', 'odette.skill.param3'], ['sandrone', 'sandrone.burst.param2']]) {
        const base = { dealer, hitId, ascension: 1, ownerFacts: { 'odette.splendorStacks': 4 } };
        for (const stacks of [0, 2, null]) {
          const dealerFacts = { stellarAttachments: 1, radiance: 'stellar-conduct', 'odette.splendorStacks': stacks };
          probe({ ...base, dealerFacts }, stacks === null ? null : 1 + (dealer === 'odette' ? self : 0) + (stacks > 0 ? teamElevation : 0));
        }
        probe({ ...base, dealerFacts: { stellarAttachments: 1, radiance: 'stellar-conduct', 'odette.splendorStacks': 2 } }, 1, 5);
      }
      const splendorAtk = amount(description(clause('odette', 'constellations', 'c2')), /攻击力提升(\d+)%/) / 100;
      const attack = atk('odette', 'dullblade', 1) * (1 + 2 * splendorAtk);
      const splendorReactionBonus = 1 + 2 * 0.15;
      probe({ ascension: 1, hitId: 'odette.skill.param3', dealerFacts: { radiance: 'stellar-swirl', 'odette.splendorStacks': 2 } }, 1 + source.personalWithSplendor,
        6, { damage: attack * rates.odette.combat2.param4[3] * blessing(attack) * splendorReactionBonus * (1 - resistances.cryo),
          sources: [growthRoot + 'characters.json#odette', growthRoot + 'character-curves.json', growthRoot + 'weapons.json#dullblade',
            talents + '#odette/combat2/param4', clause('odette', 'constellations', 'c2'), clause('odette', 'talents', 'passive1')] });
      probe({ ascension: 1, hitId: 'odette.normal.param1', dealerFacts: { 'odette.splendorStacks': 2 } }, 1);
      const one = levelMultiplier[20] * 2 * blessing(attack) * splendorReactionBonus * (1 - resistances.cryo) * math.rankedAggregation.weights[0];
      reaction({ family: 'stellar-swirl', element: 'cryo', coefficient: 2, ascension: 1, facts: [
        { subject: { kind: 'actor', id: 'actor' }, values: { 'odette.splendorStacks': number('count', 2), 'odette.swanDream': bool(false) } },
        { subject: { kind: 'target', id: 'target' }, values: { 'odette.mirrorNearTarget': bool(false) } },
      ] }, one * (1 + source.personalWithSplendor));
    });

  if (['columbina', 'flins', 'nefer'].every(available)) {
    const source = read(crossElevation);
    for (const [dealer, hitId, dealerFacts, personal] of [
      ['flins', 'flins.burst.param2', {}, source.facts.flins.fullMoonsignPersonal],
      ['nefer', 'nefer.skill.phantasm-shadow-1', { 'nefer.phantasm': true }, source.facts.nefer.fullMoonsignPersonal],
    ]) {
      let added = 0;
      for (let rank = 0; rank <= 6; rank++) {
        if (rank) added += source.facts.columbina[rank - 1];
        const options = { dealer, hitId, peerConstellation: 6, teamFacts: { fullMoonsign: true }, dealerFacts };
        const result = readHit('columbina', rank, options);
        const value = numeric(result.totals.all), factor = numeric(result.outputs[0]?.stages.find(stage => stage.id === 'elevation')?.value);
        const expectedFactor = 1 + personal + added;
        rows.push({ entity: dealer, field: '/constellations/5', output: 'cross-owner-elevation', probe: { columbinaRank: rank, ...options },
          sources: [crossElevation, clause(dealer, 'constellations', 'c6'), ...Array.from({ length: rank }, (_, index) => clause('columbina', 'constellations', 'c' + (index + 1)))],
          expectedFactor, factor, value, status: result.totals.all.state,
          ...close(factor, expectedFactor) && value !== null ? {} : { issue: '跨角色月曜擢升未按已验证条款相加。', diagnostics: result.diagnostics } });
      }
    }
  }

  if (available('columbina') && available('zibai')) {
    const options = { dealer: 'zibai', hitId: 'zibai.skill.param2', peerConstellation: 6,
      teamFacts: { fullMoonsign: true }, dealerFacts: { 'zibai.spiritsteedStride': true, 'zibai.lunarPhase': true,
        'zibai.strideRadianceConsumed': 100 } };
    const result = readHit('columbina', 1, options);
    const status = result.totals.all.state;
    rows.push({ entity: 'zibai', field, output: 'unverified-cross-owner-elevation', probe: options, sources: [crossElevation], status,
      ...(status === 'unknown' && result.diagnostics.some(diagnostic => diagnostic.code === 'unreviewed-mechanism'
        && diagnostic.nodeId === 'attribute.reaction.lunar.elevationFactor') ? {} : { issue: '未核验角色的跨来源擢升不应被推定为已知。', diagnostics: result.diagnostics }) });
  }

  return { rows, verified, resolved, gaps, summary: { confirmedReactionElevationCases: rows.length,
    confirmedReactionElevationMismatches: rows.filter(row => row.issue).length, verifiedConfirmedReactionElevation: verified.size } };
}
