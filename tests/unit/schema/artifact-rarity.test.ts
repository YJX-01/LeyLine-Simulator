import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artifactItemSchema, artifactMainTableSchema, artifactSubstatLimits } from '@leyline/schema';
import { getArtifactMain, loadCatalog } from '@leyline/game-data';
import { createAccount } from '../../../src/web/src/domain/account';
import { previewMonaImport } from '../../../src/web/src/domain/mona-import';

describe('rarity-specific source tables and actual-inventory format derivatives', () => {
  it('retains both exact table lengths and rejects the previous single-rarity shape', async () => {
    const main = await getArtifactMain();
    expect(artifactMainTableSchema.safeParse(main).success).toBe(true);
    expect(Object.values(main[4]).every(values => values.length === 17)).toBe(true);
    expect(Object.values(main[5]).every(values => values.length === 21)).toBe(true);
    expect(main[4].elementalMastery[16]).toBe(139.3);
    expect(main[5].elementalMastery[20]).toBe(186.5);
    expect(artifactMainTableSchema.safeParse(main[5]).success).toBe(false);
    expect(artifactMainTableSchema.safeParse({ ...main, 4: main[5] }).success).toBe(false);
  });

  it('four-star input bounds independently cover the adopted pool without using five-star bounds', () => {
    const table = JSON.parse(readFileSync('src/game-data/data/tables/artifact-rolls.json', 'utf8')).affixes as Record<string, { stat: keyof typeof artifactSubstatLimits[4]; rarity: number; value: number }>;
    for (const stat of Object.keys(artifactSubstatLimits[4]) as (keyof typeof artifactSubstatLimits[4])[]) {
      const maximum = Math.max(...Object.values(table).filter(affix => affix.rarity === 4 && affix.stat === stat).map(affix => affix.value));
      const bound = artifactSubstatLimits[4][stat]!;
      expect(bound).toBeGreaterThanOrEqual(maximum * 4);
      expect(bound).toBeLessThan(artifactSubstatLimits[5][stat]!);
    }
  });

  it.skipIf(!existsSync('.references/artifacts_mona.json'))('checks level, substat count and roll boundaries on an explicit derivative of the original inventory', async () => {
    const catalog = await loadCatalog(), main = await getArtifactMain();
    const preview = await previewMonaImport(readFileSync('.references/artifacts_mona.json', 'utf8'), createAccount(), catalog.sets, main);
    const original = preview.additions.find(item => item.real?.slot === 'flower' && item.real.level === 20)!.real!;
    const derivative = structuredClone(original);
    derivative.rarity = 4;
    expect(artifactItemSchema.safeParse(derivative).success).toBe(false); // Recorded +20 is invalid for rank 4.
    derivative.level = 0;
    derivative.substats = derivative.substats.slice(0, 3).map(({ stat, value }) => ({ stat, value }));
    // Format validation only; these changed values are not a four-star player recording or history.
    expect(artifactItemSchema.safeParse(derivative).success).toBe(true);
    derivative.substats.push({ ...derivative.substats[0] });
    expect(artifactItemSchema.safeParse(derivative).success).toBe(false);
    derivative.level = 16; derivative.substats[0].rolls = 5;
    expect(artifactItemSchema.safeParse(derivative).success).toBe(false);
    derivative.substats = original.substats.map(({ stat, value }) => ({ stat, value, rolls: 1 }));
    expect(artifactItemSchema.safeParse(derivative).success).toBe(false); // Four total entries cannot describe +16.
    derivative.substats[0].rolls = 4;
    expect(artifactItemSchema.safeParse(derivative).success).toBe(true); // Format total 7 is allowed; not observed history.
    expect(original.rarity).toBe(5);
    expect(original.level).toBe(20);
  });
});
