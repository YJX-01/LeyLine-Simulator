import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getArtifactMain, loadRealCatalog } from '../../src/game-data/src/real';
import { createAccount, parseAccount } from '../../src/web/src/domain/account';
import { confirmMonaImport, previewMonaImport } from '../../src/web/src/domain/mona-import';
import { organizeMonaWearNotes } from '../../src/web/src/domain/mona-wear-notes';

// User-provided actual inventory, deliberately not copied into committed fixtures.
const path = resolve('.references/artifacts_mona.json');
describe.skipIf(!existsSync(path))('user-provided Mona inventory (local evidence)', () => {
  it('imports every original physical item and preserves its raw values and source identity', async () => {
    const content = readFileSync(path, 'utf8');
    const raw = JSON.parse(content);
    const source = ['flower', 'feather', 'sand', 'cup', 'head'].flatMap(key => raw[key]);
    expect(source).toHaveLength(458); // Independently counted by source groups: 86+92+101+84+95.
    const [catalog, main] = await Promise.all([loadRealCatalog(), getArtifactMain()]);
    const account = createAccount();
    const preview = await previewMonaImport(content, account, catalog.sets, main);
    expect(preview.additions).toHaveLength(458);
    expect(preview.skipped).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    expect(account.artifacts).toHaveLength(0);
    confirmMonaImport(account, preview);
    for (const original of source) {
      const item = account.artifacts.find(item => item.real?.source?.key === `id:${original.id}`)!;
      expect(item).toBeDefined();
      expect(item.real?.substats.map(sub => sub.value)).toEqual(original.normalTags.map((sub: { value: number }) => sub.value));
      expect(item.mona?.mainValue).toBe(original.mainTag.value);
      expect(item.mona?.sourceSetName).toBe(original.setName);
      expect(item.mona?.equippedBy ?? null).toBe(original.equip ?? null);
      expect(item.real?.level).toBe(original.level);
    }
    expect(parseAccount(account)).toEqual(account);
    const unresolved = account.artifacts.filter(item => item.mona?.setIdentityPending);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].real?.source?.key).toBe('id:3648921719734070');
    expect(unresolved[0].mona?.sourceSetName).toBe('HeavensGift');
    expect(unresolved[0].real?.setId).not.toBe('celestialgift');
    const again = await previewMonaImport(content, account, catalog.sets, main);
    expect(again.duplicates).toBe(458);
    expect(again.additions).toEqual([]);
    const expectedNames = new Set(source.map(item => item.equip).filter(Boolean));
    const organized = organizeMonaWearNotes(account);
    expect(organized.added).toBe(expectedNames.size);
    expect(account.characters.map(character => character.name).sort()).toEqual([...expectedNames].sort());
    expect(account.characters.every(character => !character.realBuild && character.weapon === '待选择武器')).toBe(true);
    for (const character of account.characters) for (const id of Object.values(character.equipment)) {
      expect(account.artifacts.find(item => item.id === id)?.mona?.equippedBy).toBe(character.name);
    }
    expect(organizeMonaWearNotes(account).added).toBe(0);
  });
});
