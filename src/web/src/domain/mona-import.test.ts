import { describe, expect, it } from 'vitest';
import fixture from '../../../../fixtures/mona/mona-v1.json';
import { realStatKeys, type RealStat, type RealBuild } from '@leyline/schema';
import { getRealCharacter, getRealWeapon, getRealSet, getArtifactMain, REAL_DATA_VERSION } from '@leyline/game-data/real';
import { resolveRealBuild } from '@leyline/engine';
import { createAccount, equipArtifact, parseAccount } from './account';
import { previewMonaImport, confirmMonaImport } from './mona-import';

const sets = [{ id: 'gladiatorsfinale', name: '角斗士的终幕礼' }, { id: 'heartofdepth', name: '沉沦之心' }];
const main = Object.fromEntries(realStatKeys.map(stat => [stat, Array.from({ length: 21 }, () => stat === 'hp' ? 4780 : stat === 'hydroBonus' ? 0.466 : 0)])) as Record<RealStat, number[]>;
const input = () => structuredClone(fixture);

describe('Mona community version 1 import', () => {
  it('does not mistake a manually edited inventory item for an unchanged duplicate', async () => {
    const account = createAccount();
    confirmMonaImport(account, await previewMonaImport(JSON.stringify(fixture), account, sets, main));
    account.artifacts[0].real!.substats[0].value = 0.12;
    const preview = await previewMonaImport(JSON.stringify(fixture), account, sets, main);
    expect(preview.duplicates).toBe(2);
    expect(preview.conflicts).toHaveLength(1);
    expect(() => confirmMonaImport(account, preview)).toThrow('实例冲突');
    expect(account.artifacts[0].real!.substats[0].value).toBe(0.12);
  });
  it('accepts rounded main-stat display 187 while calculating the canonical 186.5 mastery', async () => {
    const account = createAccount();
    const table = await getArtifactMain();
    expect(table.elementalMastery[20]).toBe(186.5);
    const file = input();
    const cup = { ...file.flower[0], position: 'cup', mainTag: { name: 'elementalMastery', value: 187 } };
    const preview = await previewMonaImport(JSON.stringify({ ...file, flower: [], cup: [cup] }), account, sets, table);
    expect(preview.additions[0].mona?.mainValue).toBe(187);
    const build: RealBuild = { dataVersion: REAL_DATA_VERSION, character: await getRealCharacter('jean'), weapon: await getRealWeapon('favoniussword'), artifactMain: table, sets: [await getRealSet('gladiatorsfinale')], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1, hpRatio: 1, artifacts: [preview.additions[0].real!] };
    const panel = resolveRealBuild(build);
    expect(panel.status).toBe('complete');
    expect(panel.stats.elementalMastery).toBe(186.5);
  });
  it('previews precise decimal stats, preserves different physical IDs and applies only after confirmation', async () => {
    const account = createAccount();
    const preview = await previewMonaImport(JSON.stringify(fixture), account, sets, main);
    expect(account.artifacts).toEqual([]);
    expect(preview.additions).toHaveLength(3);
    expect(preview.additions[0].real?.substats.map(stat => stat.value)).toEqual([0.0311, 0.0622, 0.0525, 19.450000762939453]);
    expect(preview.additions[0].id).not.toBe(preview.additions[1].id);
    expect(preview.additions[0].real?.source?.key).toBe('id:42');
    expect(preview.additions[2].real?.mainStat).toBe('hydroBonus');
    expect(preview.additions[2].mona?.omit).toBe(true);
    expect(confirmMonaImport(account, preview)).toBe(3);
    expect(parseAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('reimports idempotently without transferring equipped items and keeps changed instances as conflicts', async () => {
    const account = createAccount();
    confirmMonaImport(account, await previewMonaImport(JSON.stringify(fixture), account, sets, main));
    account.characters.push({ id: 'actor', name: '琴', attack: 1000, weapon: '西风剑', equipment: {} });
    equipArtifact(account, 'actor', account.artifacts[0].id);
    const before = JSON.stringify(account);
    // This is the same detached artifact payload carried by an already saved axis.
    const oldAxisSnapshot = structuredClone(account.artifacts[0].real!);
    const repeated = await previewMonaImport(JSON.stringify(fixture), account, sets, main);
    expect(repeated.duplicates).toBe(3);
    expect(repeated.additions).toEqual([]);
    expect(confirmMonaImport(account, repeated)).toBe(0);
    expect(JSON.stringify(account)).toBe(before);
    const changed = input();
    changed.flower[0].normalTags[0].value = 0.07;
    const conflict = await previewMonaImport(JSON.stringify(changed), account, sets, main);
    expect(conflict.conflicts).toHaveLength(1);
    expect(() => confirmMonaImport(account, conflict)).toThrow('实例冲突');
    expect(JSON.stringify(account)).toBe(before);
    expect(conflict.updates).toHaveLength(1);
    expect(confirmMonaImport(account, conflict, true)).toBe(0);
    expect(account.artifacts[0].real?.substats[0].value).toBe(0.07);
    expect(oldAxisSnapshot.substats[0].value).toBe(0.0311);
    expect(account.characters[0].equipment.flower).toBe(account.artifacts[0].id);
    expect(() => confirmMonaImport(account, conflict, true)).toThrow('预览后库存已变化');
  });
  it('keeps multiple identical no-ID items distinct while maintaining same-file repeat identity', async () => {
    const file = input();
    const withoutIds = file.flower.map(({ id: _id, contentHash: _hash, ...value }) => value);
    const content = JSON.stringify({ ...file, flower: withoutIds });
    const account = createAccount();
    const preview = await previewMonaImport(content, account, sets, main);
    expect(new Set(preview.additions.map(item => item.id)).size).toBe(3);
    confirmMonaImport(account, preview);
    expect((await previewMonaImport(content, account, sets, main)).duplicates).toBe(3);
  });
  it('rejects invalid ratios, slots, duplicated IDs and duplicate substats before modifying inventory', async () => {
    const account = createAccount();
    const variants = [input(), input(), input(), input()];
    variants[0].flower[0].normalTags[0].value = 3.11;
    variants[1].flower[0].mainTag.name = 'critical';
    variants[2].flower[1].id = 42;
    variants[3].flower[0].normalTags[1].name = 'critical';
    for (const file of variants) await expect(previewMonaImport(JSON.stringify(file), account, sets, main)).rejects.toThrow();
    await expect(previewMonaImport('{', account, sets, main)).rejects.toThrow('JSON');
    await expect(previewMonaImport('{"version":"1"}', account, sets, main)).rejects.toThrow('部位列表');
    await expect(previewMonaImport(JSON.stringify({ ...fixture, version: 2 }), account, sets, main)).rejects.toThrow('字符串');
    expect(account.artifacts).toEqual([]);
  });
  it('previews skipped low-rarity items explicitly and rechecks account changes at confirmation', async () => {
    const account = createAccount();
    const file = input(); file.flower[0].star = 4;
    const preview = await previewMonaImport(JSON.stringify(file), account, sets, main);
    expect(preview.skipped).toHaveLength(1);
    expect(preview.additions).toHaveLength(2);
    const next = createAccount();
    expect(() => confirmMonaImport(next, preview)).toThrow('账号已切换');
    expect(next.artifacts).toEqual([]);
  });
});
