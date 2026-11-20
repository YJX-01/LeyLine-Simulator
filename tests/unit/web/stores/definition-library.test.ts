import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useDefinitionLibraryStore } from '../../../../src/web/src/stores/definition-library';
import { existsSync } from 'node:fs';
import { recordedProject } from '../../../helpers/recorded-project';
import { officialShowcase } from '../../../helpers/recorded-reference';
import type { DesktopBridge } from '../../../../src/web/src/platform/desktop';

const adapters = vi.hoisted(() => ({ bridge: undefined as DesktopBridge | undefined, download: vi.fn() }));
vi.mock('../../../../src/web/src/platform/desktop', () => ({ getDesktopBridge: () => adapters.bridge }));
vi.mock('../../../../src/web/src/domain/download', () => ({ downloadJson: adapters.download }));
let pinia: ReturnType<typeof createPinia>;
describe('definition library repository', () => {
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); adapters.bridge = undefined; adapters.download.mockReset(); });
  afterEach(() => disposePinia(pinia));
  it.skipIf(!existsSync(officialShowcase))('saves and reopens an independent file with definitions from the recorded showcase', async () => {
    const store = useDefinitionLibraryStore();
    const { definitions } = await recordedProject();
    store.library.definitions = definitions;
    expect(await store.save()).toBe(true);
    expect(store.dirty).toBe(false);
    const saved = JSON.stringify(adapters.download.mock.calls[0][0]);
    store.library.definitions = [];
    store.importContent(saved);
    expect(store.library.definitions).toEqual(definitions);
    expect(store.dirty).toBe(false);
    expect(() => store.importContent('{')).toThrow('保持不变');
    expect(store.library.definitions).toEqual(definitions);
  });
  it('keeps cancellation and failed writes dirty and marks only the written revision saved', async () => {
    const store = useDefinitionLibraryStore();
    adapters.bridge = { openProject: vi.fn(async () => null), saveProject: vi.fn(async () => false) };
    expect(await store.save()).toBe(false);
    expect(store.dirty).toBe(true);
    adapters.bridge.saveProject = vi.fn(async () => { throw new Error('写入失败'); });
    expect(await store.save()).toBe(false);
    expect(store.error).toBe('写入失败');
    let finish: (saved: boolean) => void = () => {};
    adapters.bridge.saveProject = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const pending = store.save();
    store.library.name = '更新后的定义库';
    finish(true);
    expect(await pending).toBe(true);
    expect(store.dirty).toBe(true);
  });
});
