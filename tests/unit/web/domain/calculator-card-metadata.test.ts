import { expect, it } from 'vitest';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { characterMetadataSchema, weaponMetadataSchema } from '@leyline/schema';
import { calculatorHitChoices } from '../../../../src/web/src/domain/calculator-hits';

it('keeps the damage category independent of the casting talent and the curated pin order', async () => {
  const character = await getCharacter('varesa');
  const hits = calculatorHitChoices(character);
  expect(hits.filter(hit => hit.common).map(hit => hit.hitId)).toEqual(['varesa.burst.param5', 'varesa.normal.param16']);
  expect(hits[0]).toMatchObject({ code: '小q', group: 'plunge', source: '元素爆发' });
  const plunges = hits.filter(hit => hit.skillId === 'varesa.normal' && hit.group === 'plunge');
  expect(Object.fromEntries(plunges.map(hit => [hit.hitId, hit.code]))).toEqual({
    'varesa.normal.param6': 'x1', 'varesa.normal.param7': 'x2', 'varesa.normal.param8': 'x3',
    'varesa.normal.param14': 'x4', 'varesa.normal.param15': 'x5', 'varesa.normal.param16': 'x6',
  });
  const metadata = { ...character.metadata, calculator: undefined };
  expect(characterMetadataSchema.safeParse(metadata).success).toBe(true);
  const legacy = calculatorHitChoices({ ...character, metadata });
  expect(legacy.some(hit => hit.common)).toBe(false);
  expect(new Set(legacy.map(hit => hit.hitId))).toEqual(new Set(hits.map(hit => hit.hitId)));
});

it('rejects orphaned card references and repeated pins or types before adopting metadata', async () => {
  const { metadata } = await getCharacter('varesa');
  const id = 'varesa.burst.param5';
  const group = { type: 'plunge', expanded: true };
  for (const calculator of [{ pinnedHits: [id, id] }, { pinnedHits: ['missing'] }, { groups: [group, group] },
    { hits: { missing: { alias: '别名' } } }, { buffs: { [id]: { note: '伤害 ID' } } }]) {
    expect(characterMetadataSchema.safeParse({ ...metadata, calculator }).success).toBe(false);
  }
  const weapon = (await getWeapon('beyondthechrysalis')).metadata;
  expect(weapon.calculator?.buffs?.['beyondthechrysalis.loyalWind']?.alias).toBe('忠忱之风');
  expect(weaponMetadataSchema.safeParse({ ...weapon, calculator: { buffs: { [id]: { alias: '错用来源' } } } }).success).toBe(false);
});
