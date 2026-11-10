import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { getArtifactMain, loadCatalog } from '@leyline/game-data';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewMonaImport, confirmMonaImport } from '../../../../src/web/src/domain/mona-import';

const path = '.references/artifacts_mona.json';
const slots = ['flower', 'feather', 'sand', 'cup', 'head'] as const;
interface RawArtifact {
  id?: number;
  contentHash?: string;
  star: number;
  level: number;
  mainTag: { name: string; value: number };
  normalTags: { name: string; value: number }[];
}
type RawFile = Record<(typeof slots)[number], RawArtifact[]> & { version: string | number };
// Negative/format derivatives of the actual local inventory; never saved as player exports.
describe.skipIf(!existsSync(path))('Mona import boundaries derived from the actual local inventory', () => {
  let original: string;
  let sets: Awaited<ReturnType<typeof loadCatalog>>['sets'];
  let main: Awaited<ReturnType<typeof getArtifactMain>>;
  const input = (): RawFile => JSON.parse(original);
  beforeAll(async () => {
    original = readFileSync(path, 'utf8');
    [sets, main] = await Promise.all([loadCatalog().then(catalog => catalog.sets), getArtifactMain()]);
  });

  it('detects a locally edited physical item without silently overwriting it', async () => {
    const account = createAccount();
    confirmMonaImport(account, await previewMonaImport(original, account, sets, main));
    const substat = account.artifacts[0].real!.substats[0];
    substat.value += 0.001;
    const edited = substat.value;
    const preview = await previewMonaImport(original, account, sets, main);
    expect(preview.duplicates).toBe(457);
    expect(preview.conflicts).toHaveLength(1);
    expect(() => confirmMonaImport(account, preview)).toThrow('实例冲突');
    expect(substat.value).toBe(edited);
  });

  it('preserves the observed rounded mastery display separately from the canonical main-stat table', async () => {
    const source = slots.flatMap(slot => input()[slot]).find(item => item.level === 20 && item.mainTag.name === 'elementalMastery');
    expect(source).toBeDefined();
    expect(source!.mainTag.value).toBe(187);
    const preview = await previewMonaImport(original, createAccount(), sets, main);
    const item = preview.additions.find(item => item.real?.source?.key === `id:${source!.id}`)!;
    expect(item.mona?.mainValue).toBe(187);
    expect(item.real?.mainStat).toBe('elementalMastery');
    expect(main.elementalMastery[20]).toBe(186.5);
  });

  it('keeps same-file identity when source IDs are absent without fabricating inventory items', async () => {
    const file = input();
    for (const slot of slots) for (const item of file[slot]) { delete item.id; delete item.contentHash; }
    const content = JSON.stringify(file);
    const account = createAccount();
    const preview = await previewMonaImport(content, account, sets, main);
    expect(preview.additions).toHaveLength(458);
    expect(new Set(preview.additions.map(item => item.id)).size).toBe(458);
    confirmMonaImport(account, preview);
    expect((await previewMonaImport(content, account, sets, main)).duplicates).toBe(458);
  });

  it('rejects malformed ratios, slots, IDs and substats before changing inventory', async () => {
    const account = createAccount();
    const variants = [input(), input(), input(), input()];
    variants[0].flower[0].normalTags[0].value = 3.11;
    variants[1].flower[0].mainTag.name = 'critical';
    variants[2].flower[1].id = variants[2].flower[0].id;
    variants[3].flower[0].normalTags[1].name = variants[3].flower[0].normalTags[0].name;
    for (const file of variants) await expect(previewMonaImport(JSON.stringify(file), account, sets, main)).rejects.toThrow();
    await expect(previewMonaImport('{', account, sets, main)).rejects.toThrow('JSON');
    await expect(previewMonaImport('{"version":"1"}', account, sets, main)).rejects.toThrow('部位列表');
    const version = input(); version.version = 2;
    await expect(previewMonaImport(JSON.stringify(version), account, sets, main)).rejects.toThrow('字符串');
    expect(account.artifacts).toEqual([]);
    expect(readFileSync(path, 'utf8')).toBe(original);
  });

  it('reports unsupported rarity derivatives and rejects confirmation after switching accounts', async () => {
    const account = createAccount();
    const file = input(); file.flower[0].star = 4;
    const preview = await previewMonaImport(JSON.stringify(file), account, sets, main);
    expect(preview.skipped).toHaveLength(1);
    expect(preview.additions).toHaveLength(457);
    const next = createAccount();
    expect(() => confirmMonaImport(next, preview)).toThrow('账号已切换');
    expect(next.artifacts).toEqual([]);
  });
});
