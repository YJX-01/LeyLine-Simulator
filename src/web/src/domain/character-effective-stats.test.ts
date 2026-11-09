import {describe,it,expect} from 'vitest';
import {loadRealCatalog} from '@leyline/game-data/real';
import {defaultEffectiveStats} from './character-loadout-name';
describe('explicit character effective defaults',()=>{
  it('covers every catalog identity and uses the independently recorded traveler rules',async()=>{
    const catalog=await loadRealCatalog();
    expect(catalog.characters.filter(character=>!defaultEffectiveStats(character.name).length).map(character=>character.name)).toEqual([]);
    expect(defaultEffectiveStats('空（草）')).toContain('elementalMastery');
    expect(defaultEffectiveStats('荧（雷）')).toContain('elementalMastery');
    expect(defaultEffectiveStats('空（岩）')).not.toContain('elementalMastery');
    expect(defaultEffectiveStats('荧（冰）')).toContain('elementalMastery');
    expect(defaultEffectiveStats('空（水）')).toEqual(['critDamage','critRate','elementalMastery','attack','attackPercent','hp','hpPercent','energyRecharge']);
    expect(defaultEffectiveStats('奇偶·男性')).toEqual(['critDamage','critRate','elementalMastery','attack','attackPercent']);
    expect(defaultEffectiveStats('奇偶·女性')).toEqual(defaultEffectiveStats('奇偶·男性'));
    expect(defaultEffectiveStats('琴')).toEqual(['attack','attackPercent','energyRecharge']);
  });
});
