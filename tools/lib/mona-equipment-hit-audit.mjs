import { readContentSource } from './content-source.mjs';

const source = '.references/mona-community/beta-data/equipment-damage-events.mjs';
const weapons = [
  ['Messenger', 'messenger', 'Amber', 'charged'], ['SkywardSpine', 'skywardspine', 'Xiangling', 'normal'],
  ['Frostbearer', 'frostbearer', 'Lisa', 'normal'], ['DragonspineSpear', 'dragonspinespear', 'Xiangling', 'normal'],
  ['Halberd', 'halberd', 'Xiangling', 'normal'], ['PrizedIsshinBlade', 'prizedisshinblade', 'Bennett', 'normal'],
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
