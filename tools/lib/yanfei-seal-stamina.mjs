import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, number, setAuditDefaults } from './roster-audit-settings.mjs';

const entity = 'yanfei';
const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const talentsPath = capture + 'ChineseSimplified/talents/yanfei.json';
const constellationPath = capture + 'ChineseSimplified/constellations/yanfei.json';
const curvesPath = capture + 'stats/talents.json';
const resonanceParty = ['sucrose', 'xianyun', 'mona'];
const observation = 'https://library.keqingmains.com/evidence/characters/pyro/yanfei#c6-yanfei-stamina-consumed-reduction';
const sources = [talentsPath + '#combat1', constellationPath + '#c1', constellationPath + '#c6',
  curvesPath + '#yanfei/combat1', observation, 'https://library.keqingmains.com/evidence/characters/pyro/yanfei#basic-mechanics'];
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const general = 'attribute.staminaCostReduction';
const charged = general + '.charged';
const cost = 'attribute.chargedAttackStaminaCost';
const stamina = ['sprint', 'glide', 'swim', 'climb'].map(action => general + '.' + action);
const buffs = '/talents/0/buffs/';
const c1Buffs = '/constellations/0/buffs/';
const heldField = buffs + '0/modifiers/0';
const rankField = '/constellations/5';
const costField = locked => buffs + '2/modifiers/' + (locked ? 1 : 0);
const quantity = output => output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
const close = (actual, expected) => actual === expected || actual !== null && expected !== null && Math.abs(actual - expected) <= 1e-10;

function evidence() {
  const talent = read(talentsPath).combat1;
  const constellation = read(constellationPath);
  const curves = read(curvesPath).yanfei.combat1;
  const param = (label, pattern) => {
    const entry = talent.attributes.labels.find(row => row.startsWith(label + '|'));
    const key = entry?.match(pattern)?.[1];
    const values = key && curves[key];
    if (!values?.length || values.some(value => value !== values[0])) throw new Error('烟绯固定体耗曲线缺失：' + label);
    return values[0];
  };
  const base = param('重击体力消耗', /\{(param\d+):F1\}点/);
  const reduction = param('丹火印降低体力消耗', /每枚\{(param\d+):F1P\}/);
  const cap = { 三: 3 }[talent.description.match(/初始最多持有(.)枚丹火印/)?.[1]];
  const extra = Number(constellation.c1.description.match(/额外降低本次重击(\d+)%的体力消耗/)?.[1]) / 100;
  if (!cap || !extra || !talent.description.includes('每枚丹火印都会降低烟绯的体力消耗')
    || !talent.description.includes('消耗所有的丹火印') || !constellation.c6.description.includes('最大数量增加一枚')) {
    throw new Error('烟绯丹火印的固定原文与重击体耗规则不一致。');
  }
  const hitTemplate = talent.attributes.labels.find(label => label.startsWith('重击伤害|'));
  const hitIds = [...hitTemplate.matchAll(/\{(param\d+):P\}/g)].map(([, parameter]) => 'yanfei.normal.' + parameter);
  if (hitIds.length !== cap + 2) throw new Error('烟绯丹火印重击的固定档位数量不符。');
  return { base, reduction, cap, extra, hitIds };
}

export function auditYanfeiSealStamina(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const { base, reduction, cap, extra, hitIds } = evidence();
  const characters = new Map(entities.characters.map(entry => [entry.id, entry]));
  const character = characters.get(entity);
  const weapon = entities.weapons.find(entry => entry.id === 'apprenticesnotes');
  if (character && weapon) {
    const hasResonance = resonanceParty.every(id => characters.has(id));
    const teams = new Map();
    const normal = character.talents[0];
    const allHits = character.talents.flatMap(talent => talent.hits.map(hit => ({ talent, hit })));
    const bindings = Object.fromEntries([general, charged, cost, ...stamina].map(key => [key, {
      kind: 'attribute', actor: { role: 'recipient' }, key: { namespace: 'builtin', id: key, revision: '1' }, at: { kind: 'current', phase: 'same' },
    }]));
    const teamFor = (constellation, resonance) => {
      const key = constellation + '/' + resonance;
      if (!teams.has(key)) {
        const builds = [{ id: 'actor', build: { ...auditBuild(character, weapon), constellation } }];
        if (resonance) for (const id of resonanceParty) builds.push({ id, build: auditBuild(characters.get(id), weapon) });
        const prepared = engine.prepareStructuredBuilds(builds);
        if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
        teams.set(key, prepared.team);
      }
      return teams.get(key);
    };
    function measure(output, effect, options) {
      const { constellation = 0, held = 0, hitId, resonance = false, recipient = 'actor' } = options;
      const selected = allHits.find(entry => entry.hit.id === hitId);
      const { talent, hit } = selected ?? { talent: normal, hit: normal.hits[0] };
      const team = teamFor(constellation, resonance);
      const { setup, request } = auditHit(character, talent, hit);
      setAuditDefaults(character, request.frame);
      setup.targets[0].facts.targetHpRatio = number('scalar', 1);
      request.frame.factOverrides[0].facts['yanfei.heldSealStacks'] = held === null
        ? { value: null, provenance: 'explicit', sourceRefs: [] } : number('count', held);
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
        hit: selected ? { skillId: talent.id, hitId, element: hit.element, category: hit.category, family: 'ordinary', origin: hit.origin, reactionId: null } : null };
      let value, status, diagnostics, amount = null;
      if (output === 'damage') {
        const result = engine.evaluateStructuredHit(team, setup, request);
        value = quantity(result.totals.all);
        status = result.totals.all.state;
        diagnostics = result.diagnostics;
      } else {
        const context = engine.createStructuredCombatContext(team, setup);
        const result = engine.evaluateCombatBindings(team.program, context, { [output]: bindings[output] }, frame);
        value = quantity(result.outputs[output]);
        status = result.outputs[output]?.state ?? 'missing';
        diagnostics = result.diagnostics;
        amount = quantity(result.trace.find(node => node.kind === 'effect' && node.definition.id === effect
          && node.context?.actorId === 'actor' && node.context.recipientId === recipient));
      }
      return { value, status, diagnostics, amount, probe: { constellation, held, hitId, resonance, recipient } };
    }
    function check(label, output, expected, field, effect, options = {}) {
      const { value, status, diagnostics, amount, probe } = measure(output, effect, options);
      const contribution = options.contribution ?? null;
      const expectedStatus = options.expectedStatus ?? 'known';
      const matches = status === expectedStatus && close(value, expected) && close(amount, contribution);
      rows.push({ entity, clause: field.startsWith(c1Buffs) ? '/constellations/0' : field === rankField ? rankField : '/talents/0',
        field, effect, output, probe: { label, ...probe }, sources: probe.resonance ? [...sources, 'src/game-data/data/calculation/resonances.json#anemo'] : sources, actual: value, value, status,
        expected, expectedStatus, expectedContribution: contribution, contribution: amount,
        ...(matches ? {} : { issue: '丹火印的体耗数值、适用动作或贡献来源与预期不符。', diagnostics }) });
    }
    const heldId = 'yanfei.scarlet-seals-held-stamina';
    const chargedId = 'yanfei.scarlet-seals-charged-stamina';
    const costId = 'yanfei.charged-stamina-cost';
    for (const constellation of [0, 1, 5, 6]) {
      const limit = cap + (constellation === 6 ? 1 : 0);
      for (let seals = 0; seals <= cap + 1; seals++) {
        const hitId = hitIds[seals];
        const active = seals <= limit;
        const basic = active ? reduction * seals : 0;
        const bonus = active && constellation >= 1 ? extra * seals : 0;
        const baseField = seals ? buffs + '1/modifiers/' + (seals - 1) : heldField;
        const baseId = seals > 1 ? chargedId + '.' + (seals - 1) : chargedId;
        const label = constellation + '命、' + seals + '枚印';
        const probe = { constellation, hitId, held: (seals + 2) % (cap + 2) };
        check(label, charged, basic + bonus, baseField, baseId, { ...probe, contribution: basic || null });
        if (seals) check(label, charged, basic + bonus, c1Buffs + (seals - 1) + '/modifiers/1',
          'yanfei.c1.charged-poise.' + seals + '.1', { ...probe, contribution: bonus || null });
        const expectedCost = active ? base * (1 - basic - bonus) : 0;
        check(label, cost, expectedCost, costField(seals > cap), seals > cap ? costId + '.1' : costId,
          { ...probe, contribution: active ? expectedCost : null });
        if (!active) check(label + '伤害档位锁定', 'damage', 0, rankField, '', probe);
      }
      const held = cap + 1;
      check(constellation + '命持印上限', general, reduction * limit, heldField, heldId, { constellation, held, contribution: reduction * limit });
    }
    check('未持有丹火印', general, 0, heldField, heldId, { contribution: 0 });
    check('持印数未知', general, null, heldField, heldId, { held: null, expectedStatus: 'unknown' });
    check('重击不依赖手填持印数', cost, base * (1 - reduction - extra), costField(false), costId,
      { constellation: 1, held: null, hitId: hitIds[1], contribution: base * (1 - reduction - extra) });
    for (const output of stamina) check('持两印时适用该通用降耗动作', output, 2 * reduction, heldField, heldId, { held: 2, contribution: 2 * reduction });
    const scope = [normal.hits[0].id, 'yanfei.a1.blazing-eye', ...character.talents.slice(1).map(talent => talent.hits[0].id)];
    for (const hitId of scope) {
      check('非主动重击的伤害查询不收重击体耗', cost, 0, costField(false), costId, { hitId, constellation: 6, held: 4 });
      check('非主动重击的伤害查询不收重击专属减免', charged, 0, buffs + '1/modifiers/3', chargedId + '.3', { hitId, constellation: 6, held: 4 });
    }
    const hitId = hitIds[2];
    const damage = measure('damage', '', { hitId, constellation: 0 }).value;
    check('同一二印重击开启一命并更换手填持印数，伤害不变', 'damage', damage, costField(false), '',
      { hitId, constellation: 1, held: 3 });
    if (hasResonance) {
      const resonance = { resonance: true, constellation: 1, held: 3, hitId, contribution: null };
      check('另一位队员仅获得双风通用降耗', general, 0.15, heldField, heldId, { ...resonance, recipient: 'sucrose' });
      check('本次二印重击叠加双风通用降耗', charged, (reduction + extra) * 2 + 0.15, buffs + '1/modifiers/1', chargedId + '.1',
        { ...resonance, contribution: reduction * 2 });
      const stackedCost = base * (1 - (reduction + extra) * 2 - 0.15);
      check('二印重击以原始50点为分母计算叠加实耗', cost, stackedCost, costField(false), costId,
        { ...resonance, contribution: stackedCost });
    }
    for (const field of new Set(rows.map(row => row.field))) {
      const checks = rows.filter(row => row.field === field);
      if (!checks.some(row => row.issue)) verified.add(entity + field);
    }
    if (rows.every(row => !row.issue)) {
      resolved.push({ entity, field: '/talents/0', sources, resolved: '通用降耗读取当前持印数，重击体耗读取本次所选丹火印档位并以50点为基准。' },
        { entity, field: '/constellations/0', sources, resolved: '一命仅对烟绯本次重击每枚丹火印追加10%降耗。' },
        { entity, field: rankField, sources, resolved: '六命开放四印档位，本次重击为零体耗。' });
    }
    const needed = '当前使用确认的持印数或所选重击档位。仍需可重放的丹火印获取、刷新、消耗与退场记录，以及外部多来源高减免组合的定量实测。';
    gaps.push({ entity, field: '/talents/0', kind: '历史与特殊交互', sources, needed, reason: needed });
  }
  return { rows, verified, resolved, gaps, summary: {
    yanfeiSealStaminaCases: rows.length, yanfeiSealStaminaMismatches: rows.filter(row => row.issue).length, verifiedYanfeiSealStamina: verified.size,
  } };
}
