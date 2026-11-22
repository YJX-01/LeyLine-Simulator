import { auditBuild } from './roster-evaluation.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const weapons = {
  favoniussword: 'kaeya', favoniuscodex: 'lisa', favoniusgreatsword: 'noelle', favoniuslance: 'xiangling', favoniuswarbow: 'amber',
  sacrificialsword: 'kaeya', sacrificialfragments: 'sucrose', sacrificialgreatsword: 'chongyun', sacrificialbow: 'diona',
};
const quantity = (unit, value) => ({ value: { kind: 'quantity', unit, value }, provenance: 'explicit', sourceRefs: [] });
const flag = value => ({ value: { kind: 'boolean', value }, provenance: 'explicit', sourceRefs: [] });

/** Compare each family/rank with the local passive's stated single-target chance, cooldown and release. */
export async function auditWeaponTriggers(catalog, engine) {
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addSkillHit, addParticlePickup, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const rows = [];
  for (const [weapon, character] of Object.entries(weapons)) {
    const favonius = weapon.startsWith('favonius');
    const base = auditBuild(await catalog.get('characters', character), await catalog.get('weapons', weapon));
    for (let rank = 1; rank <= 5; rank++) {
      const chance = (favonius ? [60,70,80,90,100] : [40,50,60,70,80])[rank - 1] / 100;
      const cooldown = (favonius ? [12000,10500,9000,7500,6000] : [30000,26000,22000,19000,16000])[rank - 1];
      const p = createEmptyProject(), build = { ...base, refinement: rank };
      p.enemy = defaultEnemy();
      const owner = addActorFromBuild(p, build), skill = character + (favonius ? '.normal' : '.skill');
      function hit(time, targets, roll, active, critical = true) {
        const event = { targetsDamaged: quantity('count', targets), ...(roll === undefined ? {} : { triggerRoll: quantity('scalar', roll) }) };
        return addSkillHit(p, owner, skill, 0, time, { crit: critical ? 'critical' : 'noncritical', reaction: 'none',
          facts: [{ subject: { kind: 'actor', id: owner }, values: { onField: flag(active), skillCooldownRemaining: quantity('milliseconds', 700) } },
            { subject: { kind: 'event' }, values: event }] });
      }
      const checks = [];
      checks.push([hit(0, 1, 0, false), 'excluded']);
      checks.push([hit(1, 0, 0, true), 'excluded']);
      if (favonius) checks.push([hit(2, 1, 0, true, false), 'excluded']);
      if (chance < 1) checks.push([hit(3, 1, chance + .001, true), 'excluded', chance]);
      const combined = 1 - (1 - chance) ** 2;
      const source = hit(4, 2, chance === 1 ? undefined : (chance + combined) / 2, true);
      checks.push([source, 'applied', combined]);
      const pickup = favonius ? addParticlePickup(p, owner, source, 5) : undefined;
      checks.push([hit(4 + cooldown - 1, 1, 0, true), 'excluded']);
      checks.push([hit(4 + cooldown, 1, 0, true), 'applied', chance]);
      const outcome = engine.evaluateTimeline(p);
      for (const [id, status, probability] of checks) {
        const actual = outcome.combatChanges?.find(row => row.source === id);
        const ok = actual?.status === status && (probability === undefined || Math.abs(actual.probability - probability) < 1e-9)
          && (status !== 'applied' || actual.nextTriggerMs === actual.timeMs + cooldown && (favonius ? actual.particles === 3 : actual.cooldownAfterMs === 0));
        rows.push({ weapon, rank, source: id, expectedStatus: status, expectedChance: probability, actual, ...(!ok ? { issue: '概率、排除条件、冷却或触发结果不符' } : {}) });
      }
      if (pickup) {
        const actual = outcome.combatChanges?.find(row => row.source === pickup);
        const expected = 6 * (1 + (base.weapon.stat === 'energyRecharge' ? base.weapon.baseStat * base.weapon.statCurve[1] : 0));
        rows.push({ weapon, rank, expectedEnergy: expected, actual, ...(actual?.status !== 'applied' || Math.abs(expected - actual.energyGain) > 1e-9 ? { issue: '无元素微粒的回能不符' } : {}) });
      }
    }
  }
  return { rows, summary: { weaponTriggerScenarios: rows.length, weaponTriggerFailures: rows.filter(row => row.issue).length } };
}
