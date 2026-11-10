import { describe, expect, it } from 'vitest';
import { loadCatalog, getCharacter, getWeapon, getArtifactSet, getArtifactMain, DATA_VERSION } from '../../../src/game-data/src/catalog';

describe('fixed real game snapshot', () => {
  it('exposes the complete fixed catalog with honest support and Chinese names', async () => {
    const catalog = await loadCatalog();
    expect(catalog.version).toBe(DATA_VERSION);
    expect([catalog.characters.length, catalog.weapons.length, catalog.sets.length]).toEqual([154, 256, 63]);
    expect(catalog.characters.filter(entry => entry.supported).map(entry => entry.id).sort()).toEqual(['jean', 'kaeya', 'xingqiu']);
    expect(catalog.characters.find(entry => entry.id === 'jean')?.name).toBe('琴');
    expect(catalog.weapons.find(entry => entry.id === 'favoniussword')?.name).toBe('西风剑');
    expect(new Set(catalog.characters.map(entry => entry.id)).size).toBe(154);
    expect(catalog.sets.find(entry=>entry.id==='instructor')?.rarity).toBe(4);
    expect(catalog.sets.find(entry=>entry.id==='gladiatorsfinale')?.rarity).toBe(5);
    expect(catalog.sets.find(entry=>entry.id==='adventurer')?.rarity).toBe(3);
  });
  it('keeps traveler and Manekin element forms separate without claiming supported mechanics', async () => {
    const catalog=await loadCatalog();
    for(const base of ['aether','lumine','manekin','manekina']) {
      const forms=catalog.characters.filter(entry=>entry.id.startsWith(base+'-'));
      expect(new Set(forms.map(entry=>entry.element))).toEqual(new Set(['anemo','geo','electro','dendro','hydro','pyro','cryo']));
      for(const form of forms) {
        const character=await getCharacter(form.id);
        expect(character.talents).toHaveLength(3);
        expect(character.talents[1].element).toBe(form.element);
        expect(character.capabilities.calculation.supported).toBe(false);
        expect(character.attributes.base).toEqual((await getCharacter(base)).attributes.base);
      }
    }
    expect((await getCharacter('aether-anemo')).talents.map(skill=>skill.name)).toEqual(['异邦铁风','风涡剑','风息激荡']);
    expect((await getCharacter('manekin-pyro')).talents.map(skill=>skill.name)).toEqual(['外域剑术·安谨守望','戒惩轰击','禁入限区']);
    for (const base of ['aether','lumine','manekin','manekina']) {
      const character=await getCharacter(base);
      expect(character.capabilities.text).toBe('complete');
      expect(character.talents.map(talent=>talent.category)).toEqual(['normal']);
      expect(character.constellations).toEqual([]);
      expect(character.talents[0].description).toContain('连续剑击');
    }
    expect((await getCharacter('manekina-hydro')).passives.map(passive=>passive.name)).toEqual(['战域重划','交战持备','灵巧战姿']);
    const catalogDefinitions=await Promise.all(catalog.characters.map(entry=>getCharacter(entry.id)));
    expect(catalogDefinitions.every(character=>character.capabilities.text==='complete' && character.identity.description.length>0 && character.talents.every(talent=>talent.description.length>0))).toBe(true);
  });
  it('keeps raw numeric curves and independent skill parameters and isolates mutable consumers', async () => {
    const jean = await getCharacter('jean');
    const kaeya = await getCharacter('kaeya');
    const xingqiu = await getCharacter('xingqiu');
    expect(jean.attributes.base.attack).toBe(18.62);
    expect(jean.progression.curves.attack[1]).toBe(1);
    expect(jean.progression.promotion[6].attack).toBe(76.4582);
    expect(jean.talents.find(skill => skill.id === 'jean.skill')?.parameters[0].values[0]).toBe(2.92);
    expect(kaeya.talents.find(skill => skill.id === 'kaeya.skill')?.parameters[0].values[0]).toBe(1.912);
    expect(xingqiu.talents.find(skill => skill.id === 'xingqiu.skill')?.hits.map(hit => xingqiu.talents.find(skill=>skill.category==='skill')!.parameters.find(parameter=>parameter.id===hit.parameter)!.values[0])).toEqual([1.68, 1.912]);
    expect(xingqiu.attributes.modifiers).toEqual([{ stat: 'hydroBonus', values: [0.2], minAscension: 4 }]);
    jean.attributes.base.attack = 999;
    expect((await getCharacter('jean')).attributes.base.attack).toBe(18.62);
    expect(jean.talents.find(skill => skill.category === 'burst')?.support.supported).toBe(false);
  });
  it('uses weapon-specific growth, conditional and category modifiers without claiming unknown effects', async () => {
    const weapon = await getWeapon('favoniussword');
    expect(weapon.baseAttack).toBe(41.0671);
    expect(weapon.promotion[6]).toBe(155.6);
    expect(weapon.support.supported).toBe(true);
    expect((await getWeapon('harbingerofdawn')).modifiers[0]).toEqual({ stat: 'critRate', values: [0.14, 0.175, 0.21, 0.245, 0.28], hpAbove: 0.9 });
    expect((await getWeapon('festeringdesire')).modifiers.find(entry => entry.stat === 'critRate')?.category).toBe('skill');
    expect((await getWeapon('staffofhoma')).support.supported).toBe(false);
    expect((await getArtifactSet('gladiatorsfinale')).effects[0].modifiers).toEqual([{ stat: 'attackPercent', values: [0.18] }]);
    expect((await getArtifactSet('gladiatorsfinale')).effects[1].support.supported).toBe(false);
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
    await expect(getCharacter('missing')).rejects.toThrow('不存在');
  });
});
