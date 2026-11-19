import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDamage, evaluateTimeline } from '@leyline/engine';
import type { CalculationFact, DamageRequest, Value } from '@leyline/schema';
import { createAccount } from '../../src/web/src/domain/account';
import { confirmEnkaImport, previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { calculatorRequest, createDamageCalculation, parseDamageCalculator, readCalculatorSource } from '../../src/web/src/domain/damage-calculator';
import { defaultEnemy } from '../../src/web/src/domain/real-project';
import { compareTimelineLoadouts } from '@leyline/engine';
import { applyCharacterDefinition, copyCharacterDefinition, parseCharacterDefinition } from '../../src/web/src/domain/character-definition';
import { exportCharacterSnapshot } from '../../src/web/src/domain/structured-character-import';

const path = '.references/enka/uid-107590923.json';
const fact = (value: Value): CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const request = (): DamageRequest => ({ skillId: 'vesna.skill', hitId: 'vesna.skill.param5', outputId: 'vesna.skill.param5.stellar-swirl', crit: 'expected', reaction: 'none',
  facts: { radiance: fact({ kind: 'enum', value: 'stellar-swirl' }), 'vesna.stance': fact({ kind: 'boolean', value: true }),
    'vesna.disciplineStacks': fact({ kind: 'quantity', unit: 'count', value: 6 }),
    'beyondthechrysalis.loyalWind': fact({ kind: 'boolean', value: true }), 'beyondthechrysalis.betrayalWind': fact({ kind: 'boolean', value: true }),
    'scarletproof.stellarWindow': fact({ kind: 'boolean', value: true }) } });

// Gear/cultivation are from the original public response. Battle conditions above are
// explicit calculator inputs, not recorded battle events, party or damage observations.
describe.skipIf(!existsSync(path))('recorded Vesna through the production calculator', () => {
  it('confirms the actual showcase, copies independently, evaluates and reopens current JSON', async () => {
    const raw = JSON.parse(readFileSync(path, 'utf8')), account = createAccount();
    const preview = await previewEnkaImport(raw, String(raw.uid), account);
    const row = preview.rows.find(row => row.character.build?.character.id === 'vesna');
    expect(row, JSON.stringify(preview.skipped)).toBeDefined(); if (!row) return;
    expect(account.characters).toHaveLength(0);
    expect(row.character.showcase!.build).toMatchObject({ level: 90, constellation: 2, weapon: { id: 'beyondthechrysalis' }, refinement: 1, talents: { normal: 8, skill: 10, burst: 10 } });
    confirmEnkaImport(account, preview, [row.character.id], true);
    expect(account.artifacts).toHaveLength(5);
    const before = JSON.stringify(account), source = await readCalculatorSource(account, row.character.id, 'showcase'), build = source.character.build!;
    const damage = request(), direct = evaluateDamage(build, damage, defaultEnemy());
    expect(direct.status, JSON.stringify(direct.issues)).toBe('complete');
    expect(direct.value).toBeGreaterThan(0);
    // Independent arithmetic from the pinned original growth/talent records and
    // actual artifact values. This explicit query has one actor, not twelve showcase members.
    const read = (name: string) => JSON.parse(readFileSync('tools/data/sources/' + name, 'utf8'));
    const character = read('catalog/genshin-db/characters.json').vesna.stats, weapon = read('catalog/genshin-db/weapons.json').beyondthechrysalis.stats;
    const curves = read('catalog/genshin-db/character-curves.json'), weaponCurves = read('catalog/genshin-db/weapon-curves.json');
    const params = read('genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json').vesna.combat2.param5;
    const stats: Record<string, number> = {};
    for (const artifact of build.artifacts) {
      stats[artifact.mainStat] = (stats[artifact.mainStat] ?? 0) + build.artifactMain[artifact.rarity][artifact.mainStat][artifact.level];
      for (const sub of artifact.substats) stats[sub.stat] = (stats[sub.stat] ?? 0) + sub.value;
    }
    const white = character.base.attack * curves[90][character.curve.attack] + character.promotion[6].attack
      + weapon.base.attack * weaponCurves[90][weapon.curve.attack] + weapon.promotion[6].attack;
    const attack = white * (1 + (stats.attackPercent ?? 0) + 0.18 + 0.06 + 0.4) + (stats.attack ?? 0);
    const mastery = stats.elementalMastery ?? 0;
    const critRate = Math.min(1, 0.05 + 0.192 + (stats.critRate ?? 0) + 0.16);
    const critDamage = 0.5 + weapon.base.specialized * weaponCurves[90][weapon.curve.specialized] + (stats.critDamage ?? 0) + 0.56;
    const expected = attack * params[9] * 1.6 * (1 + Math.min(attack * 0.00007, 0.14))
      * (1 + 6 * mastery / (mastery + 2000) + 0.2 + 0.36 + 0.4) * (1 + critRate * critDamage) * 0.9;
    expect(direct.value).toBeCloseTo(expected, 7);
    const document = createDamageCalculation(build, damage, defaultEnemy()), result = evaluateTimeline(calculatorRequest(document, 1).project);
    expect(result.status, JSON.stringify(result.diagnostics)).toBe('complete');
    expect(result.points[0].value).toBeCloseTo(direct.value!, 8);
    const reopened = parseDamageCalculator(JSON.stringify(document)), recomputed = evaluateTimeline(calculatorRequest(reopened, 2).project);
    expect(recomputed.points[0].value).toBe(direct.value);
    document.baseline = structuredClone(document.project);
    document.project.candidate.actors[0].build!.refinement = 2;
    const comparison = compareTimelineLoadouts(calculatorRequest(document, 3).project, calculatorRequest(document, 3).candidates!);
    expect(comparison.baseline.totalValue).toBe(direct.value);
    expect(comparison.candidates[0].delta).toBeGreaterThan(0);
    delete document.baseline;
    // Edit the exported common metadata contract, then reopen it without a code change.
    const custom = copyCharacterDefinition(build.character, build.dataVersion);
    custom.talents.find(skill => skill.id === damage.skillId)!.parameters.find(parameter => parameter.id === 'param5')!.values[9] *= 1.1;
    const imported = parseCharacterDefinition(exportCharacterSnapshot(custom), [build.character]);
    document.project = applyCharacterDefinition(document.project, document.actorId, imported);
    const changed = evaluateTimeline(parseDamageCalculator(JSON.stringify(document)).project);
    expect(changed.totalValue).toBeCloseTo(comparison.candidates[0].result.totalValue! * 1.1, 7);
    const unknown = request(); delete unknown.facts!['beyondthechrysalis.betrayalWind'];
    expect(evaluateDamage(build, unknown, defaultEnemy()).value).toBeNull();
    expect(JSON.stringify(account)).toBe(before);
  });
});
