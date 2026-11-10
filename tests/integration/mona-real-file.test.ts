import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getArtifactMain, loadCatalog } from '../../src/game-data/src/catalog';
import { accountSlotLabels, cloneAccount, createAccount, parseAccount } from '../../src/web/src/domain/account';
import { confirmMonaImport, previewMonaImport, previewMonaSetRepairs } from '../../src/web/src/domain/mona-import';
import { organizeMonaWearNotes } from '../../src/web/src/domain/mona-wear-notes';

// User-provided actual inventory, deliberately not copied into committed fixtures.
const path = resolve('.references/artifacts_mona.json');
describe.skipIf(!existsSync(path))('user-provided Mona inventory (local evidence)', () => {
  it('imports every original physical item and preserves its raw values and source identity', async () => {
    const content = readFileSync(path, 'utf8');
    const raw = JSON.parse(content);
    const source = ['flower', 'feather', 'sand', 'cup', 'head'].flatMap(key => raw[key]);
    expect(source).toHaveLength(458); // Independently counted by source groups: 86+92+101+84+95.
    const [catalog, main] = await Promise.all([loadCatalog(), getArtifactMain()]);
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
    expect(account.artifacts.filter(item => item.mona?.setIdentityPending)).toHaveLength(0);
    const heaven = account.artifacts.find(item => item.real?.source?.key === 'id:3648921719734070')!;
    expect(heaven.mona?.sourceSetName).toBe('HeavensGift');
    expect(heaven.real?.setId).toBe('celestialgift'); // Exact Chinese-name match in Mona 7.2.02.
    // Reproduce only the old unresolved identity on this actual item, without inventing an inventory.
    const previous = cloneAccount(account);
    const prior = previous.artifacts.find(item => item.id === heaven.id)!;
    prior.real!.setId = 'mona-unresolved-legacy-heavensgift';
    prior.mona!.setIdentityPending = true;
    prior.name = `HeavensGift（套装待核对） · ${accountSlotLabels[prior.slot]}`;
    prior.real!.source!.fingerprint = createHash('sha256').update(JSON.stringify({ setId: prior.real!.setId, slot: prior.slot, level: prior.real!.level, main: { stat: prior.real!.mainStat, value: prior.mona!.mainValue }, substats: prior.real!.substats })).digest('hex');
    const identityOnly = await previewMonaSetRepairs(previous, catalog.sets);
    expect(identityOnly.updates).toHaveLength(1);
    const repaired = cloneAccount(previous);
    confirmMonaImport(repaired, identityOnly, true);
    expect((await previewMonaImport(content, repaired, catalog.sets, main)).duplicates).toBe(458);
    // Construct the original import fingerprint from this same actual item's scanned values.
    // Inferred rolls are local annotations and never part of the scanner identity.
    const rawIdentity = cloneAccount(previous);
    const rawPrior = rawIdentity.artifacts.find(item => item.id === heaven.id)!;
    rawPrior.real!.source!.fingerprint = createHash('sha256').update(JSON.stringify({ setId: rawPrior.real!.setId, slot: rawPrior.slot, level: rawPrior.real!.level, main: { stat: rawPrior.real!.mainStat, value: rawPrior.mona!.mainValue }, substats: rawPrior.real!.substats.map(({ stat, value }) => ({ stat, value })) })).digest('hex');
    const rawRepair = await previewMonaSetRepairs(rawIdentity, catalog.sets);
    expect(rawRepair.updates).toHaveLength(1);
    confirmMonaImport(rawIdentity, rawRepair, true);
    expect(rawIdentity.artifacts.find(item => item.id === heaven.id)?.real?.substats).toEqual(heaven.real?.substats);
    expect((await previewMonaImport(content, rawIdentity, catalog.sets, main)).duplicates).toBe(458);
    const repair = await previewMonaImport(content, previous, catalog.sets, main);
    expect(repair.duplicates).toBe(457);
    expect(repair.updates).toHaveLength(1);
    expect(() => confirmMonaImport(previous, repair)).toThrow();
    confirmMonaImport(previous, repair, true);
    expect(previous.artifacts.find(item => item.id === heaven.id)?.real?.setId).toBe('celestialgift');
    expect(previous.artifacts.find(item => item.id === heaven.id)?.real?.substats).toEqual(heaven.real?.substats);
    const edited = cloneAccount(account);
    const editedItem = edited.artifacts.find(item => item.id === heaven.id)!;
    editedItem.real!.setId = 'mona-unresolved-legacy-heavensgift';
    editedItem.mona!.setIdentityPending = true;
    editedItem.real!.level -= 1;
    const blocked = await previewMonaImport(content, edited, catalog.sets, main);
    expect(blocked.updates).toHaveLength(0);
    expect(() => confirmMonaImport(edited, blocked, true)).toThrow();
    const again = await previewMonaImport(content, account, catalog.sets, main);
    expect(again.duplicates).toBe(458);
    expect(again.additions).toEqual([]);
    const expectedNames = new Set(source.map(item => item.equip).filter(Boolean));
    const organized = organizeMonaWearNotes(account);
    expect(organized.added).toBe(expectedNames.size);
    expect(account.characters.map(character => character.name).sort()).toEqual([...expectedNames].sort());
    expect(account.characters.every(character => !character.build && character.weapon === '待选择武器')).toBe(true);
    for (const character of account.characters) for (const id of Object.values(character.equipment)) {
      expect(account.artifacts.find(item => item.id === id)?.mona?.equippedBy).toBe(character.name);
    }
    expect(organizeMonaWearNotes(account).added).toBe(0);
  });
});
