import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useDefinitionLibraryStore } from './definition-library';
import { createDefinition } from '../domain/definition-library';
import type { DesktopBridge } from '../platform/desktop';

const adapters = vi.hoisted(() => ({ bridge: undefined as DesktopBridge | undefined, download: vi.fn() }));
vi.mock('../platform/desktop', () => ({ getDesktopBridge: () => adapters.bridge }));
vi.mock('../domain/download', () => ({ downloadJson: adapters.download }));
let pinia: ReturnType<typeof createPinia>;
describe('definition library repository', () => {
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); adapters.bridge = undefined; adapters.download.mockReset(); });
  afterEach(() => disposePinia(pinia));
  it('saves and reopens an independent file without changing the original on malformed input', async () => {
    const store = useDefinitionLibraryStore();
    store.library.definitions.push(createDefinition('自定义公式'));
    expect(await store.save()).toBe(true);
    const saved = JSON.stringify(adapters.download.mock.calls[0][0]);
    store.library.definitions = [];
    store.importContent(saved);
    expect(store.library.definitions[0].name).toBe('自定义公式');
    expect(store.dirty).toBe(false);
    expect(() => store.importContent('{')).toThrow('保持不变');
    expect(store.library.definitions).toHaveLength(1);
  });
  it('keeps cancellation and failed writes dirty and marks only the written revision saved', async () => {
    const store = useDefinitionLibraryStore();
    store.library.definitions.push(createDefinition('公式'));
    adapters.bridge = { openProject: vi.fn(async () => null), saveProject: vi.fn(async () => false) };
    expect(await store.save()).toBe(false);
    expect(store.dirty).toBe(true);
    adapters.bridge.saveProject = vi.fn(async () => { throw new Error('写入失败'); });
    expect(await store.save()).toBe(false);
    expect(store.error).toBe('写入失败');
    let finish: (saved: boolean) => void = () => {};
    adapters.bridge.saveProject = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const pending = store.save();
    store.library.definitions[0].version = '2';
    finish(true);
    expect(await pending).toBe(true);
    expect(store.dirty).toBe(true);
  });
});
