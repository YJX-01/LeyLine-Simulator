import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { readContentSource } from './content-source.mjs';

const officialRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified';
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const sum = value => Object.values(value ?? {}).reduce((a, b) => a + b, 0);

/** Compare Aino's source descriptions and declared bindings with actual Mona release results. */
export async function auditMonaAino() {
  const aino = readContentSource('src/game-data/data/characters/aino.json');
  const original = readContentSource(`${officialRoot}/constellations/aino.json`);
  assert.match(original.c1.description, /自身的元素精通提升80点.*当前场上其他角色的元素精通提升80点/s);
  assert.match(original.c1.description, /无法叠加/);
  assert.match(original.c2.description, /后台.*当前场上角色的攻击命中附近的敌人/s);
  assert.match(original.c2.description, /攻击力的25%与元素精通的100%/);
  assert.match(original.c2.description, /每5秒至多触发一次.*视为元素爆发伤害/);
  assert.match(original.c6.description, /后的15秒内.*当前场上角色触发的感电、绽放、月感电、月绽放、月结晶/s);
  assert.match(original.c6.description, /提升15%.*额外提升20%/s);
  const hit = aino.constellations[1].hits[0], c1 = aino.constellations[0].buffs[0], c6 = aino.constellations[5].buffs[0];
  assert.deepEqual(hit.base.map(({ stat, ratio }) => [stat, ratio]), [['attack', .25], ['elementalMastery', 1]]);
  assert.equal(hit.category, 'burst'); assert.equal(hit.element, 'hydro');
  assert.deepEqual(hit.when, ['aino.coolingFieldAllyHit']);
  assert.equal(c1.stacking.policy, 'replace'); assert.equal(c1.lifetime.durationMs, 15000);
  assert.equal(c6.lifetime.durationMs, 15000); assert.equal(c6.condition.fact, 'onField');
  assert.deepEqual(c6.modifiers.map(m => m.value.amount), [.15, .15, .2, .2]);
  assert.deepEqual(c6.modifiers[0].appliesTo.reactionIds, ['electro-charged', 'bloom']);
  assert.deepEqual(c6.modifiers[1].appliesTo.families, ['lunar-charged', 'lunar-bloom', 'lunar-crystallize']);
  if (!existsSync(resolve('.references/mona-community/beta-tools/runtime-7106.mjs'))) return {
    status: 'unavailable', revision: aino.revision, reason: 'Optional Mona release checkout is missing.', ratios: [], buffCases: [],
  };
  const cases = [];
  const mapping = [[0,0,'param1',1],[1,0,'param2',1],[2,0,'param3',2],[3,0,'param4',1],[4,0,'param5',1],[5,0,'param8',1],[6,0,'param9',1],[7,0,'param10',1],[8,1,'param1',1],[9,1,'param2',1],[10,2,'param1',1]];
  for (let level = 1; level <= 15; level++) {
    const probe = await probeMonaSkills({ characters: ['Aino'], constellations: [0], configure(input) { input.character.skill1 = level - 1; input.character.skill2 = level - 1; input.character.skill3 = level - 1; } });
    for (const [index, talent, parameter, repetitions] of mapping) {
      const row = probe.rows.find(item => item.index === index); assert.equal(row?.status, 'ok');
      const expected = aino.talents[talent].parameters.find(item => item.id === parameter).values[level - 1] * repetitions;
      const actual = sum(row.analysis.atk_ratio);
      close(actual, expected, .00011);
      cases.push({ index, talent: aino.talents[talent].id, parameter, repetitions, level, expected, actual });
    }
  }
  const [{ api }, { EXTENSION_BUFF_REGISTRY }] = await Promise.all([
    import('../../.references/mona-community/beta-tools/runtime-7106.mjs'),
    import('../../.references/mona-community/beta-data/extension-buffs.mjs'),
  ]);
  const fixture = (await probeMonaSkills({ characters: ['Lisa'], indices: [0], constellations: [0] })).rows[0].input;
  const buffCases = [];
  for (const full of [false, true]) for (const onField of [false, true]) {
    const buff = { name: 'AinoC6', config: { AinoC6: { full_moon: full } } };
    const input = { ...fixture, team_effects: { recipient_on_field: onField }, buffs: [buff] };
    const compiled = EXTENSION_BUFF_REGISTRY.compile(buff, input);
    const values = compiled[0]?.config.ExtensionEffect.values ?? {};
    const expected = onField ? (full ? .35 : .15) : 0;
    for (const key of ['EnhanceElectroCharged', 'EnhanceBloom', 'EnhanceMoonelectro', 'EnhanceMoonbloom', 'EnhanceMoonCrystallize']) close(values[key] ?? 0, expected);
    assert.equal(values.EnhanceHyperbloom, undefined);
    const baseline = api.CalculatorInterface.get_transformative_damage({ ...input, buffs: [] });
    const actual = api.CalculatorInterface.get_transformative_damage(input);
    for (const key of ['hyperbloom', 'burgeon', 'overload']) close(actual[key], baseline[key], 1e-7);
    if (onField) for (const key of ['electro_charged', 'bloom']) assert.ok(actual[key] > baseline[key]);
    else for (const key of ['electro_charged', 'bloom']) close(actual[key], baseline[key], 1e-7);
    buffCases.push({ full, onField, values, baseline, actual });
  }
  return { status: 'available', revision: aino.revision, ratios: cases, buffCases, limitations: [
    'Mona observed normal ratio 0..10 only; its menu does not expose Aino C2 water shot.',
    'C2 is declared as one caller-supplied aggregate fact: the observed single-hit binding does not independently schedule the five-second cooldown or validate all trigger conditions.',
    'C6 runtime tests use explicit buff input and an on-field recipient, not cast history; trigger and duration require the LeyLine event replay evidence.',
    'Damage bonus rates are compared as native parameters, not as ratios of final transformative damage.',
  ] };
}
