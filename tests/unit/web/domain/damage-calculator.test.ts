import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport, confirmEnkaImport } from '../../../../src/web/src/domain/enka-import';
import { readCalculatorSource } from '../../../../src/web/src/domain/damage-calculator';

const recording = '.references/enka/official-example-2026-11-13.json';
describe.skipIf(!existsSync(recording))('calculator reads original public showcase and local inventory independently', () => {
  it('retains real wearing IDs when a format derivative lacks a local cultivation build', async () => {
    const account = createAccount();
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', account);
    const row = preview.rows.find(row => row.character.showcase!.build.character.id === 'xingqiu')!;
    confirmEnkaImport(account, preview, [row.character.id], true);
    const character = account.characters[0];
    const complete = await readCalculatorSource(account, character.id, 'local');
    expect(complete.character.build!.artifacts.map(item => item.id)).toEqual(Object.values(character.equipment));
    // Explicit missing-field derivative of the original import; not a reconstructed player export.
    delete character.build;
    const original = JSON.stringify(account);
    const pending = await readCalculatorSource(account, character.id, 'local');
    expect(pending.character.build).toBeUndefined(); // Existing showcase must not fill missing local fields.
    expect(pending.equipment!.artifacts.map(item => item.id)).toEqual(Object.values(character.equipment));
    expect(pending.equipment!.artifacts).toHaveLength(5);
    expect(pending.equipment!.artifacts.every(item => item.inventoryAccountId === account.id)).toBe(true);
    const showcase = await readCalculatorSource(account, character.id, 'showcase');
    expect(showcase.equipment).toBeUndefined();
    expect(showcase.character.equipment).toEqual({});
    expect(showcase.character.build).toEqual(character.showcase!.build);
    expect(JSON.stringify(account)).toBe(original);
    pending.equipment!.artifacts[0].substats[0].value = 0;
    expect(JSON.stringify(account)).toBe(original);
    account.artifacts = account.artifacts.filter(item => item.id !== Object.values(character.equipment)[0]);
    await expect(readCalculatorSource(account, character.id, 'local')).rejects.toThrow('待补全');
  });
});
