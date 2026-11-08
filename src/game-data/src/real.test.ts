import { describe, expect, it } from 'vitest';
import { loadRealCatalog, getRealCharacter, getRealWeapon, getRealSet, getArtifactMain, REAL_DATA_VERSION } from './real';

describe('fixed real game snapshot', () => {
  it('exposes the complete fixed catalog with honest support and Chinese names', async () => {
    const catalog = await loadRealCatalog();
    expect(catalog.version).toBe(REAL_DATA_VERSION);
    expect([catalog.characters.length, catalog.weapons.length, catalog.sets.length]).toEqual([140, 256, 63]);
    expect(catalog.characters.filter(entry => entry.supported).map(entry => entry.id).sort()).toEqual(['jean', 'kaeya', 'xingqiu']);
    expect(catalog.characters.find(entry => entry.id === 'jean')?.name).toBe('琴');
    expect(catalog.weapons.find(entry => entry.id === 'favoniussword')?.name).toBe('西风剑');
    expect(new Set(catalog.characters.map(entry => entry.id)).size).toBe(140);
  });
  it('keeps seven traveler element forms separate without claiming supported mechanics', async () => {
    const catalog=await loadRealCatalog();
    for(const base of ['aether','lumine']) {
      const forms=catalog.characters.filter(entry=>entry.id.startsWith(base+'-'));
      expect(new Set(forms.map(entry=>entry.element))).toEqual(new Set(['anemo','geo','electro','dendro','hydro','pyro','cryo']));
      for(const form of forms) {
        const character=await getRealCharacter(form.id);
        expect(character.skills).toHaveLength(3);
        expect(character.skills[1].element).toBe(form.element);
        expect(character.support.supported).toBe(false);
        expect(character.base).toEqual((await getRealCharacter(base)).base);
      }
    }
    expect((await getRealCharacter('aether-anemo')).skills.map(skill=>skill.name)).toEqual(['异邦铁风','风涡剑','风息激荡']);
  });
  it('keeps raw numeric curves and independent skill parameters and isolates mutable consumers', async () => {
    const jean = await getRealCharacter('jean');
    const kaeya = await getRealCharacter('kaeya');
    const xingqiu = await getRealCharacter('xingqiu');
    expect(jean.base.attack).toBe(18.62);
    expect(jean.curves.attack[1]).toBe(1);
    expect(jean.promotion[6].attack).toBe(76.4582);
    expect(jean.skills.find(skill => skill.id === 'jean.skill')?.multipliers[0][0]).toBe(2.92);
    expect(kaeya.skills.find(skill => skill.id === 'kaeya.skill')?.multipliers[0][0]).toBe(1.912);
    expect(xingqiu.skills.find(skill => skill.id === 'xingqiu.skill')?.multipliers.map(hit => hit[0])).toEqual([1.68, 1.912]);
    expect(xingqiu.modifiers).toEqual([{ stat: 'hydroBonus', values: [0.2], minAscension: 4 }]);
    jean.base.attack = 999;
    expect((await getRealCharacter('jean')).base.attack).toBe(18.62);
    expect(jean.skills.find(skill => skill.category === 'burst')?.support.supported).toBe(false);
  });
  it('uses weapon-specific growth, conditional and category modifiers without claiming unknown effects', async () => {
    const weapon = await getRealWeapon('favoniussword');
    expect(weapon.baseAttack).toBe(41.0671);
    expect(weapon.promotion[6]).toBe(155.6);
    expect(weapon.support.supported).toBe(true);
    expect((await getRealWeapon('harbingerofdawn')).modifiers[0]).toEqual({ stat: 'critRate', values: [0.14, 0.175, 0.21, 0.245, 0.28], hpAbove: 0.9 });
    expect((await getRealWeapon('festeringdesire')).modifiers.find(entry => entry.stat === 'critRate')?.category).toBe('skill');
    expect((await getRealWeapon('staffofhoma')).support.supported).toBe(false);
    expect((await getRealSet('gladiatorsfinale')).effects[0].modifiers).toEqual([{ stat: 'attackPercent', values: [0.18] }]);
    expect((await getRealSet('gladiatorsfinale')).effects[1].support.supported).toBe(false);
  });
  it('normalizes five-star main-stat units once and preserves source precision', async () => {
    const main = await getArtifactMain();
    expect(main.hp[20]).toBe(4780);
    expect(main.attack[20]).toBe(311);
    expect(main.attackPercent[20]).toBe(0.466);
    expect(main.critRate[20]).toBe(0.311);
    expect(main.hydroBonus[20]).toBe(0.466);
    expect(main.elementalMastery[20]).toBe(186.5);
    expect(Object.values(main).every(values => values.length === 21 && values.every(Number.isFinite))).toBe(true);
    await expect(getRealCharacter('missing')).rejects.toThrow('不存在');
  });
});
