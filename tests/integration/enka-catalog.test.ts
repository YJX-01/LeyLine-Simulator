import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { catalogInventory, readCalculationData as read } from '../../tools/lib/catalog-data.mjs';
import { createAccount, parseAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport, confirmEnkaImport } from '../../src/web/src/domain/enka-import';

const catalog = read('src/game-data/data/tables/enka-catalog.json');
const supplements = read('tools/data/sources/catalog/enka/skill-supplements.json').characters;
const pinned = read('tools/data/sources/catalog/enka/pinned-skill-orders.json');
const pinnedOrders: Record<string, number[]> = pinned.skillOrder;
const elementNames: Record<string, string> = { Fire: 'pyro', Water: 'hydro', Wind: 'anemo', Rock: 'geo', Electric: 'electro', Grass: 'dendro' };
const characterSource = read('tools/data/sources/catalog/genshin-db/characters.json');
const forms = read('tools/data/sources/character-text/base-and-manekin.json');
const originalPath = '.references/enka/characters.json';
const original = existsSync(originalPath) ? read(originalPath) : undefined;
const restricted = new Set(['aether', 'lumine', 'manekin', 'manekina']);
const weapons: Record<string, number> = {
  WEAPON_SWORD_ONE_HAND: 11101, WEAPON_CLAYMORE: 12101, WEAPON_POLE: 13101,
  WEAPON_CATALYST: 14101, WEAPON_BOW: 15101,
};

type Mapping = { id: string; skills: number[]; skillDepotId?: number };

it('imports every catalog identity with independently classified talent levels', async () => {
  const ids: string[] = catalogInventory().characters;
  expect(ids.filter(id => restricted.has(id)).sort()).toEqual([...restricted].sort());
  let imported = 0;
  for (const id of ids) {
    const identity = read(`src/game-data/data/characters/${id}.json`).identity;
    const matches = (Object.entries(catalog.characters) as [string, Mapping][])
      .filter(([key, entry]) => entry.id === id && (key.includes('-') || !restricted.has(id)));
    expect(matches, id).toHaveLength(1);
    const [key, entry] = matches[0];
    const [mappedAvatar, mappedDepot] = key.split('-').map(Number);
    const avatar: number = characterSource[id.split('-')[0]].metadata.id;
    expect(mappedAvatar, id).toBe(avatar);
    expect(identity.gameId, id).toBe(avatar);
    const supplement = supplements[key];
    const depot: number | undefined = forms.bindings[id]?.skillDepotId ?? supplement?.skillDepotId ?? mappedDepot;
    if (id.includes('-') && !forms.bindings[id]) {
      if (identity.element === 'cryo') {
        expect(supplement?.id, id).toBe(id);
        expect(supplement?.skillDepotId, id).toBe(mappedDepot);
      } else {
        expect(elementNames[pinned.formElement[key]], id).toBe(identity.element);
      }
    }
    // Compare the pinned extract with the original capture when it is available.
    const originalSkills: number[] | undefined = original?.[key]?.SkillOrder;
    if (originalSkills && pinnedOrders[key]) expect(originalSkills, id).toEqual(pinnedOrders[key]);
    let skills = pinnedOrders[key];
    if (supplement?.id === id) {
      skills = ['normal', 'skill', 'burst'].map(category => {
        const matches = supplement.talents.filter((talent: { category: string }) => talent.category === category);
        expect(matches, `${id} ${category}`).toHaveLength(1);
        return matches[0].id;
      });
    }
    if (forms.bindings[id]) {
      const binding = forms.bindings[id];
      expect(mappedDepot, id).toBe(binding.skillDepotId);
      expect(identity.element, id).toBe(binding.element);
      const raw = forms.skillDepots[String(depot)];
      skills = [...raw.skills.filter((skill: number) => skill !== 0), ...(raw.energySkill ? [raw.energySkill] : [])];
    }
    expect(skills, `${id}: no independent skill evidence`).toBeDefined();
    const weaponId = weapons[identity.weaponType];
    expect(weaponId, id).toBeDefined();
    const account = createAccount();
    const skillLevelMap = Object.fromEntries(skills.map((skill: number, index: number) => [String(skill), index + 2]));
    const input = { playerInfo: {}, avatarInfoList: [{ avatarId: avatar, ...(depot ? { skillDepotId: depot } : {}),
      propMap: { '4001': { val: '80' }, '1002': { val: '5' } }, skillLevelMap,
      equipList: [{ itemId: weaponId, flat: { rankLevel: 1, itemType: 'ITEM_WEAPON', icon: '' }, weapon: { level: 1, promoteLevel: 0 } }] }] };
    const preview = await previewEnkaImport(input, '123456789', account);
    if (restricted.has(id)) {
      expect(skills, id).toHaveLength(1);
      expect(preview.rows, id).toHaveLength(0);
      expect(preview.skipped, id).toEqual([expect.stringContaining('没有完整的三项战斗天赋')]);
      continue;
    }
    expect(skills, id).toHaveLength(3);
    expect(preview.skipped, id).toEqual([]);
    expect(preview.rows, id).toHaveLength(1);
    expect(confirmEnkaImport(account, preview, [preview.rows[0].character.id]), id).toBe(1);
    const saved = parseAccount(account).characters[0];
    expect(saved.build?.character.id, id).toBe(id);
    expect(saved.build?.talents, id).toEqual({ normal: 2, skill: 3, burst: 4 });
    imported++;
  }
  expect(imported).toBe(ids.length - restricted.size);
}, 120_000);
