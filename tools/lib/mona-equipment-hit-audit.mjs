import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { readContentSource } from './content-source.mjs';

const source = '.references/mona-community/beta-data/equipment-damage-events.mjs';
const weapons = [
  ['Messenger', 'messenger', 'Amber', 'charged'], ['SkywardSpine', 'skywardspine', 'Xiangling', 'normal'],
  ['Frostbearer', 'frostbearer', 'Lisa', 'normal'], ['DragonspineSpear', 'dragonspinespear', 'Xiangling', 'normal'],
  ['Halberd', 'halberd', 'Xiangling', 'normal'], ['PrizedIsshinBlade', 'prizedisshinblade-01', 'Bennett', 'normal'],
  ['SwordOfNarzissenkreuz', 'swordofnarzissenkreuz', 'Bennett', 'normal'], ['SkywardAtlas', 'skywardatlas', 'Lisa', 'normal'],
  ['EyeOfPerception', 'eyeofperception', 'Lisa', 'normal'], ['FilletBlade', 'filletblade', 'Bennett', 'normal'],
  ['SwordOfDescension', 'swordofdescension', 'Bennett', 'normal'], ['SkywardBlade', 'skywardblade', 'Bennett', 'normal'],
  ['CursedBlade', 'kagotsurubeisshin', 'Bennett', 'normal'], ['AshGravenDrinkingHorn', 'ashgravendrinkinghorn', 'Lisa', 'normal'],
  ['TheFlute', 'theflute', 'Bennett', 'normal'],
];
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

/** Probe published equipment event outputs; scaling agreement is not proof of trigger semantics. */
export async function auditMonaEquipmentHits(leylineRows) {
  const { equipmentDamageEvents } = await import('../../.references/mona-community/beta-data/equipment-damage-events.mjs');
  function ownerEvents(weapon, refinement, { owner, count, role, onField, category, weakpoint, enemyCount = 1 }, cryoTeammate) {
    const profiles = [{ character: { name: owner }, weapon: { name: weapon, refine: refinement } }];
    if (cryoTeammate) profiles.push({ character: { name: 'Kaeya' }, weapon: { name: 'DullBlade', refine: 1 } });
    const events = Array.from({ length: count }, (_, i) => ({ role, onField, category, weakpoint, time: 1 + i, rootOrder: i, order: i }));
    const rotation = { events, heals: [], duration: 30, endHit: 'include', lastCast: () => weapon === 'SkywardBlade' ? 0 : -Infinity };
    return equipmentDamageEvents(profiles, profiles.map(() => []), rotation, () => 0, { enemy_count: enemyCount, damage_scope: 'all' })
      .procs.filter(event => event.role === 0);
  }
  const rows = [], observations = [];
  for (const [monaWeapon, entity, owner, category] of weapons) {
    const document = readContentSource(new URL('../../src/game-data/data/weapons/' + entity + '.json', import.meta.url));
    const hits = leylineRows.filter(row => row.entity === entity && row.subject === 'equipment-hit');
    const cryoWeapon = ['Frostbearer', 'DragonspineSpear'].includes(monaWeapon);
    const scenarios = cryoWeapon ? [
      { name: 'no-cryo-teammate', cryo: false, enemyCryo: 'unspecified' },
      { name: 'cryo-teammate', cryo: true, enemyCryo: 'unspecified' },
    ] : [{ name: 'trigger', cryo: false, enemyCryo: 'unspecified' }];
    for (const scenario of scenarios) for (let refinement = 1; refinement <= document.maxRefinement; refinement++) {
      const count = monaWeapon === 'TheFlute' ? 5 : 1;
      const weakpoint = monaWeapon === 'Messenger';
      let procs;
      try { procs = ownerEvents(monaWeapon, refinement, { owner, count, role: 0, onField: true, category, weakpoint }, scenario.cryo); }
      catch (error) { rows.push({ entity, monaWeapon, scenario: scenario.name, refinement, status: 'probe-error', error: String(error?.message ?? error) }); continue; }
      const branch = cryoWeapon ? hits.find(hit => hit.binding.hitId.endsWith(scenario.cryo ? '.icicle-cryo' : '.icicle')) : hits[0];
      const ratio = branch?.binding.definition.base?.inputs?.ratio;
      const expected = typeof ratio === 'number' ? ratio : ratio?.refinement?.[refinement - 1];
      const expectedStat = branch?.binding.definition.base?.inputs?.attribute?.stat;
      const stat = expectedStat === 'attack' ? 'atk' : expectedStat;
      const numbersMatch = procs.length > 0 && procs.every(proc => close(proc.ratio, expected) && proc.stat === stat);
      rows.push({ entity, revision: document.revision, monaWeapon, refinement, scenario: scenario.name,
        input: { owner, category, onField: true, weakpoint, events: count,
          cryoTeammate: scenario.cryo, enemyCryo: scenario.enemyCryo, lastBurst: monaWeapon === 'SkywardBlade' ? 0 : null, enemy_count: 1, damage_scope: 'all' },
        mona: { source, events: procs.map(({ ratio, stat, probability, label, time, forceCritical, targetCount }) =>
          ({ ratio, stat, probability: probability ?? 1, label, time, forceCritical: forceCritical ?? false, targetCount: targetCount ?? null })) },
        leyline: branch ? { id: branch.id, source: branch.source, hitId: branch.binding.hitId, ratio: expected, stat: expectedStat,
          when: branch.binding.definition.when, critical: branch.binding.definition.critical ?? 'normal' } : null,
        status: !branch ? 'missing-leyline-hit' : !procs.length ? 'no-proc' : numbersMatch ? 'scaling-match' : 'scaling-mismatch',
        limitations: cryoWeapon ? ['Mona selects by Cryo team membership; LeyLine selects by target Cryo aura. These inputs are not equivalent.',
          'Enemy aura is unspecified in this probe; matching ratios do not validate the branch condition.']
          : ['Event ratio and stat only; proc probability, trigger, cooldown, timing and full damage require independent validation.'] });
    }
    const variants = [
      { name: 'repeated-owner-hits', owner, role: 0, onField: true, category, count: 5, weakpoint: true },
      { name: 'off-field-owner-hit', owner, role: 0, onField: false, category, count: 1, weakpoint: true },
      { name: 'other-character-hit', owner, role: 1, onField: true, category, count: 1, weakpoint: true },
      ...(monaWeapon === 'Messenger' ? [{ name: 'no-weakpoint', owner, role: 0, onField: true, category, count: 1, weakpoint: false }] : []),
      ...(monaWeapon === 'SwordOfNarzissenkreuz' ? [{ name: 'arkhe-owner', owner: 'Furina', role: 0, onField: true, category, count: 1, weakpoint: true }] : []),
      ...(monaWeapon === 'EyeOfPerception' ? [{ name: 'three-enemies', owner, role: 0, onField: true, category, count: 1, weakpoint: true, enemyCount: 3 }] : []),
    ];
    for (const variant of variants) {
      try {
        const procs = ownerEvents(monaWeapon, 1, variant, true);
        observations.push({ entity, monaWeapon, scenario: variant.name, input: variant, source,
          events: procs.map(({ time, ratio, stat, probability, targetCount, forceCritical }) =>
            ({ time, ratio, stat, probability: probability ?? 1, targetCount: targetCount ?? null, forceCritical: forceCritical ?? false })) });
      } catch (error) { observations.push({ entity, monaWeapon, scenario: variant.name, input: variant, source, error: String(error?.message ?? error) }); }
    }
  }
  const summary = { weapons: weapons.length, scenarios: rows.length, observations: observations.length };

  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;
  return { source, rows, observations, summary };
}

const baseline = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
const definitions = {
  'mona:equipment-event:AshGravenDrinkingHorn': { leyline: 'weapon:ashgravendrinkinghorn:equipment-hit:/hits/0',
    owner: 'Barbara', category: 'normal', stat: 'hp', cooldown: 15, values: [0.4, 0.8], critical: false },
  'mona:equipment-event:Messenger': { leyline: 'weapon:messenger:equipment-hit:/hits/0',
    owner: 'Amber', category: 'charged', stat: 'atk', cooldown: 10, values: [1, 2], critical: true },
};
const closeEvidenceValue = (a, b, epsilon = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
const sharedInputs = [
  'src/schema/src/calculation/event.ts', 'src/schema/src/calculation/context.ts', 'src/schema/src/calculation/binding.ts',
  'src/schema/src/calculation/buffs.mjs', 'src/schema/src/content/calculation.ts',
  'src/schema/src/content/character-metadata.ts', 'src/schema/src/content/equipment-metadata.ts', 'src/schema/src/project/project.ts',
  'src/schema/src/calculation/hit-bindings.mjs', 'src/game-data/src/character-metadata.mjs', 'src/game-data/src/character-hits.mjs',
  'src/game-data/data/calculation/common.json', 'src/game-data/data/calculation/resonances.json',
  'src/engine/src/attributes/build.ts', 'src/engine/src/attributes/queries.ts', 'src/engine/src/calculation/templates.ts',
  'src/engine/src/calculation/templates-common.ts', 'src/engine/src/calculation/template-builder.ts',
  'src/engine/src/calculation/interpret.ts', 'src/engine/src/calculation/formula-ir.ts', 'src/engine/src/calculation/build-context.ts',
  'src/engine/src/calculation/project.ts', 'src/engine/src/calculation/coordinated-hits.ts',
  'src/engine/src/calculation/context.ts', 'src/engine/src/calculation/effects.ts', 'src/engine/src/effects/graph.ts',
  'src/web/src/domain/real-project.ts', 'tools/lib/roster-audit-settings.mjs', 'tools/lib/runtime-catalog.mjs',
  '.references/mona-community/beta-data/equipment-damage-events.mjs', '.references/mona-community/beta-data/equipment-combat-facts.mjs',
  '.references/mona-community/beta-data/equipment-healing-damage-rules.mjs', '.references/mona-community/beta-data/team-dps-config.mjs',
  '.references/mona-community/beta-data/team-dps-numeric-rules.mjs', '.references/mona-community/src/assets/_gen_character.js',
  'artifacts/equipment-beta-timing-probe.mjs',
];
const subjectInputs = {
  'mona:equipment-event:AshGravenDrinkingHorn': ['src/game-data/data/weapons/ashgravendrinkinghorn.json',
    'src/game-data/data/characters/barbara.json', 'tests/integration/equipment-aura-prose.test.mjs'],
  'mona:equipment-event:Messenger': ['src/game-data/data/weapons/messenger.json',
    'src/game-data/data/characters/amber.json', 'tests/integration/equipment-aura-prose.test.mjs'],
};
/** Hash the precise shared implementation, entity data and executable comparison setup. */
export function equipmentEventInputSignature(id, reader = path => readFileSync(path)) {
  if (!subjectInputs[id]) return undefined;
  const hash = createHash('sha256');
  try {
    for (const path of [...sharedInputs, ...subjectInputs[id]]) {
      const bytes = reader(path);
      hash.update(path).update('\0').update(String(bytes.length)).update('\0').update(bytes);
    }
  } catch { return undefined; }
  return hash.digest('hex');
}

/** Optional scoped evidence: missing or stale artifacts never become positive proof. */
export function loadScopedEquipmentEvents(path = 'artifacts/equipment-scoped-ledger.json') {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(data.records) ? data.records : [];
  } catch { return []; }
}

/** Recognize only the explicitly reviewed beta-event samples, never the complete weapon behavior. */
export function scopedEquipmentEventEvidence(record, report, signature = equipmentEventInputSignature) {
  const rule = definitions[record?.mona];
  if (!rule || record.leyline !== rule.leyline || report.provenance?.mona !== baseline || record.monaRevision !== baseline
    || !record.leylineRevision || record.leylineRevision !== report.provenance?.leyline
    || !record.inputSignature || record.inputSignature !== signature(record.mona)
    || record.source !== source
    || record.owner !== rule.owner || record.category !== rule.category || record.onField !== true
    || record.confirmation !== 'explicit' || rule.critical && record.weakPoint !== true
    || record.targetResistance !== 0.1 || record.actorLevel !== 90 || record.enemyLevel !== 90
    || !Array.isArray(record.cases) || record.cases.length !== 2) return false;
  const samples = [...record.cases].sort((a, b) => a.refinement - b.refinement);
  return samples.every((sample, index) => {
    const beta = sample.beta, actual = sample.leyline;
    if (sample.refinement !== [1, 5][index] || !beta || !actual || beta.stat !== rule.stat
      || !closeEvidenceValue(beta.ratio, rule.values[index]) || beta.forceCritical !== rule.critical
      || !Array.isArray(beta.sourceTimes) || !Array.isArray(beta.procSourceTimes)
      || JSON.stringify(beta.sourceTimes) !== JSON.stringify([0, rule.cooldown - .001, rule.cooldown])
      || JSON.stringify(beta.procSourceTimes) !== JSON.stringify([0, rule.cooldown])
      || !Number.isFinite(actual.panel) || actual.panel <= 0 || !Number.isFinite(actual.first)
      || !closeEvidenceValue(actual.blocked, 0) || !closeEvidenceValue(actual.ready, actual.first)) return false;
    const critical = rule.critical ? 1 + actual.critDamage : 1;
    return Number.isFinite(critical) && closeEvidenceValue(actual.first, actual.panel * beta.ratio * .45 * critical, 1e-7);
  });
}
