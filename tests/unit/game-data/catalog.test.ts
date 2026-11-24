import { describe, expect, it } from 'vitest';
import { loadCatalog, getCharacter, getWeapon, getArtifactSet, getArtifactMain, DATA_VERSION } from '../../../src/game-data/src/catalog';

describe('fixed real game snapshot', () => {
  it('exposes the complete fixed catalog with honest support and Chinese names', async () => {
    const catalog = await loadCatalog();
    expect(catalog.version).toBe(DATA_VERSION);
    expect([catalog.characters.length, catalog.weapons.length, catalog.sets.length]).toEqual([154, 256, 63]);
    const manekin = ['manekin','manekina'].flatMap(base => [base,...['anemo','cryo','dendro','electro','geo','hydro','pyro'].map(element=>base+'-'+element)]);
    expect(catalog.characters.filter(entry => entry.supported).map(entry => entry.id).sort()).toEqual(['aether', 'barbara', 'beidou', 'jean', 'kaeya', 'lumine', 'noelle', 'razor', 'vesna', 'xingqiu', 'xinyan',...manekin].sort());
    expect(catalog.characters.find(entry => entry.id === 'jean')?.name).toBe('琴');
    expect(catalog.weapons.find(entry => entry.id === 'favoniussword')?.name).toBe('西风剑');
    expect(new Set(catalog.characters.map(entry => entry.id)).size).toBe(154);
    expect(catalog.sets.find(entry=>entry.id==='instructor')?.rarity).toBe(4);
    expect(catalog.sets.find(entry=>entry.id==='gladiatorsfinale')?.rarity).toBe(5);
    expect(catalog.sets.find(entry=>entry.id==='adventurer')?.rarity).toBe(3);
  });
  it('keeps each traveler and Manekin form and its evaluated support scope distinct', async () => {
    const catalog=await loadCatalog();
    for(const base of ['aether','lumine','manekin','manekina']) {
      const baseCharacter = await getCharacter(base);
      const forms=catalog.characters.filter(entry=>entry.id.startsWith(base+'-'));
      expect(new Set(forms.map(entry=>entry.element))).toEqual(new Set(['anemo','geo','electro','dendro','hydro','pyro','cryo']));
      for(const form of forms) {
        const character=await getCharacter(form.id);
        expect(character.talents).toHaveLength(3);
        expect(character.talents[1].element).toBe(form.element);
        const resolution=base.startsWith('manekin')?'complete':'unavailable';
        expect(Object.values(character.metadata.support).every(scope => scope.resolution === resolution)).toBe(true);
        expect(character.attributes.base).toEqual(baseCharacter.attributes.base);
      }
    }
    expect((await getCharacter('aether-anemo')).talents.map(skill=>skill.name)).toEqual(['异邦铁风','风涡剑','风息激荡']);
    expect((await getCharacter('manekin-pyro')).talents.map(skill=>skill.name)).toEqual(['外域剑术·安谨守望','戒惩轰击','禁入限区']);
    for (const base of ['aether','lumine','manekin','manekina']) {
      const character=await getCharacter(base);
      expect(character.talents.map(talent=>talent.category)).toEqual(['normal']);
      expect(character.constellations).toEqual([]);
      expect(character.talents[0].description).toContain('连续剑击');
    }
    expect((await getCharacter('manekina-hydro')).passives.map(passive=>passive.name)).toEqual(['战域重划','交战持备','灵巧战姿']);
    const catalogDefinitions=await Promise.all(catalog.characters.map(entry=>getCharacter(entry.id)));
    expect(catalogDefinitions.every(character=>character.identity.description.length>0 && character.talents.every(talent=>talent.description.length>0))).toBe(true);
    // The ordinary-attack batch must include every form; this is a binding boundary, not full-character acceptance.
    expect(catalogDefinitions.every(character => character.talents.find(talent => talent.category === 'normal')!.hits.length > 0)).toBe(true);
    expect(catalogDefinitions.every(character => character.talents.every(talent => talent.hits.length > 0 || talent.noIndependentDamage))).toBe(true);
  }, 30_000);
  it('keeps raw numeric curves and independent skill parameters and isolates mutable consumers', async () => {
    const jean = await getCharacter('jean');
    const kaeya = await getCharacter('kaeya');
    const xingqiu = await getCharacter('xingqiu');
    expect(jean.attributes.base.attack).toBe(18.62);
    expect(jean.progression.curves.attack[1]).toBe(1);
    expect(jean.progression.promotion[6].attack).toBe(76.4582);
    expect(jean.talents.find(skill => skill.id === 'jean.skill')?.parameters[0].values[0]).toBe(2.92);
    expect(kaeya.talents.find(skill => skill.id === 'kaeya.skill')?.parameters[0].values[0]).toBe(1.912);
    expect(xingqiu.metadata.talents.find(skill => skill.id === 'xingqiu.skill')?.hits.map(hit => xingqiu.talents.find(skill=>skill.category==='skill')!.parameters.find(parameter=>Array.isArray(hit.base) && parameter.id===hit.base[0].parameter)!.values[0])).toEqual([1.68, 1.912]);
    expect(xingqiu.calculation.bundle.effects.find(effect => effect.identity.id === 'xingqiu.static-hydroBonus')).toMatchObject({ value: { value: { value: 0.2 } }, activation: { ascension: 4 } });
    jean.attributes.base.attack = 999;
    expect((await getCharacter('jean')).attributes.base.attack).toBe(18.62);
    expect(jean.talents.find(skill => skill.category === 'burst')?.hits.map(hit => hit.snapshot?.sourceSkillId ?? null)).toEqual([null, 'jean.burst']);
  });
  it('uses weapon-specific growth, conditional and category modifiers without claiming unknown effects', async () => {
    const weapon = await getWeapon('favoniussword');
    expect(weapon.baseAttack).toBe(41.0671);
    expect(weapon.promotion[6]).toBe(155.6);
    expect(weapon.calculation.bundle.coverage[0].resolution).toBe('complete');
    const harbinger = await getWeapon('harbingerofdawn');
    expect(harbinger.calculation.bundle.effects.find(effect => effect.identity.id === 'harbingerofdawn.static-critRate')?.value).toMatchObject({ values: [0.14, 0.175, 0.21, 0.245, 0.28] });
    const festering = await getWeapon('festeringdesire');
    expect(festering.calculation.bundle.effects.map(effect => [effect.target.kind === 'attribute' && effect.target.attribute.id, effect.appliesTo.categories])).toEqual([
      ['attribute.damageBonus', ['skill']], ['attribute.critRate', ['skill']],
    ]);
    const homa = await getWeapon('staffofhoma');
    expect(homa.calculation.bundle.coverage[0].resolution).toBe('complete');
    expect(homa.calculation.bundle.effects.some(effect => effect.identity.id === 'staffofhoma.hp-to-attack.attack')).toBe(true);
    const gladiator = await getArtifactSet('gladiatorsfinale');
    expect(gladiator.calculation.bundle.effects[0]?.value).toMatchObject({ value: { value: 0.18 } });
    expect(gladiator.calculation.bundle.coverage.find(proof => proof.scope.kind === 'equipment' && proof.scope.pieces === 4)?.resolution).toBe('complete');
    expect(gladiator.calculation.bundle.effects.find(effect => effect.identity.id === 'gladiatorsfinale.normal')).toMatchObject({
      activation: { weaponTypes: ['WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE'], set: { pieces: 4 } },
      appliesTo: { categories: ['normal'] }, value: { value: { value: 0.35 } },
    });
  });
  it('normalizes five-star main-stat units once and preserves source precision', async () => {
    const main = await getArtifactMain();
    expect(main[5].hp[20]).toBe(4780);
    expect(main[5].attack[20]).toBe(311);
    expect(main[5].attackPercent[20]).toBe(0.466);
    expect(main[5].critRate[20]).toBe(0.311);
    expect(main[5].hydroBonus[20]).toBe(0.466);
    expect(main[5].elementalMastery[20]).toBe(186.5);
    expect(Object.values(main[5]).every(values => values.length === 21 && values.every(Number.isFinite))).toBe(true);
    await expect(getCharacter('missing')).rejects.toThrow('不存在');
  });
});
