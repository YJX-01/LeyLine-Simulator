import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import type { DesktopBridge } from '../platform/desktop';
import { useAccountStore } from './account';

const adapters = vi.hoisted(() => ({ bridge: undefined as DesktopBridge | undefined, download: vi.fn() }));
vi.mock('../platform/desktop', () => ({ getDesktopBridge: () => adapters.bridge }));
vi.mock('../domain/download', () => ({ downloadJson: adapters.download }));
let pinia: ReturnType<typeof createPinia>;
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); adapters.bridge = undefined; adapters.download.mockReset(); });
afterEach(() => { disposePinia(pinia); vi.unstubAllGlobals(); });
describe('account repository', () => {
  it('roundtrips an independent file and preserves existing account on invalid import', async () => {
    const store = useAccountStore();
    store.account.name = '测试账号';
    expect(await store.save()).toBe(true);
    const content = JSON.stringify(adapters.download.mock.calls[0][0]);
    store.create('其他账号');
    store.importContent(content);
    expect(store.account.name).toBe('测试账号');
    expect(store.dirty).toBe(false);
    expect(() => store.importContent('{')).toThrow();
    expect(store.account.name).toBe('测试账号');
    expect(() => store.importContent('{"schemaVersion":1,"kind":"axis"}')).toThrow();
  });
  it('preserves dirty edits on save cancellation, failure and edits during a save', async () => {
    const store = useAccountStore();
    adapters.bridge = { openProject: async () => null, saveProject: async () => false };
    expect(await store.save()).toBe(false);
    expect(store.dirty).toBe(true);
    adapters.bridge.saveProject = async () => { throw new Error('disk'); };
    expect(await store.save()).toBe(false);
    expect(store.error).toContain('保存失败');
    let finish!: (value: boolean) => void;
    adapters.bridge.saveProject = () => new Promise(resolve => { finish = resolve; });
    const pending = store.save();
    store.account.name = '保存期间编辑';
    finish(true);
    expect(await pending).toBe(true);
    expect(store.dirty).toBe(true);
    expect(store.account.name).toBe('保存期间编辑');
  });
  it('restores local account draft independently across store instances', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const first = useAccountStore();
    first.account.name = '草稿账号';
    disposePinia(pinia); pinia = createPinia(); setActivePinia(pinia);
    const restored = useAccountStore();
    expect(restored.account.name).toBe('草稿账号');
    expect(restored.dirty).toBe(true);
  });
});
