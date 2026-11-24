import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import type { DesktopBridge } from '../../../../src/web/src/platform/desktop';
import { useAccountStore } from '../../../../src/web/src/stores/account';
import { createAccount } from '../../../../src/web/src/domain/account';

const adapters = vi.hoisted(() => ({ bridge: undefined as DesktopBridge | undefined, download: vi.fn() }));
vi.mock('../../../../src/web/src/platform/desktop', () => ({ getDesktopBridge: () => adapters.bridge }));
vi.mock('../../../../src/web/src/domain/download', () => ({ downloadJson: adapters.download }));
let pinia: ReturnType<typeof createPinia>;
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); adapters.bridge = undefined; adapters.download.mockReset(); });
afterEach(() => { disposePinia(pinia); vi.unstubAllGlobals(); });
describe('account repository', () => {
  it('uses only the current namespace and preserves unsupported old document bytes', () => {
    const old = JSON.stringify({ ...createAccount(), schemaVersion: 2 });
    const memory = new Map([['leyline-account-v2', old]]);
    const getItem = vi.fn((key: string) => memory.get(key) ?? null);
    vi.stubGlobal('localStorage', { getItem, setItem: (key: string, value: string) => memory.set(key, value) });
    const store = useAccountStore();
    expect(store.account.schemaVersion).toBe('0.2.0');
    expect(getItem.mock.calls.some(([key]) => key === 'leyline-account-v2')).toBe(false);
    expect(() => store.importContent(old)).toThrow();
    store.create('当前账号');
    expect(memory.get('leyline-account-v2')).toBe(old);
    expect(JSON.parse(memory.get('leyline-account-0.2.0')!).schemaVersion).toBe('0.2.0');
  });
  it('protects an unreadable empty-document derivative until an explicit replacement is backed up', () => {
    // File-version boundary derived from the app's empty document; no player data is invented.
    const raw = JSON.stringify({...createAccount(), schemaVersion:1});
    const memory = new Map([['leyline-account-0.2.0', raw]]);
    let failBackup = false;
    vi.stubGlobal('localStorage', {
      getItem: (key:string) => memory.get(key) ?? null,
      setItem: (key:string,value:string) => {
        if (failBackup && key==='leyline-account-0.2.0-previous') throw new Error('backup failed');
        memory.set(key,value);
      },
    });
    const store = useAccountStore();
    expect(store.error).toContain('本地账号草稿无法读取');
    store.account.name = '尚未载入的编辑';
    expect(memory.get('leyline-account-0.2.0')).toBe(raw);
    expect(() => store.commitEdit(store.account)).toThrow('未覆盖原始草稿');
    expect(() => store.importContent('{')).toThrow();
    expect(memory.get('leyline-account-0.2.0')).toBe(raw);
    failBackup = true;
    store.create('新账号');
    expect(memory.get('leyline-account-0.2.0')).toBe(raw);
    failBackup = false;
    store.create('新账号');
    expect(memory.get('leyline-account-0.2.0-previous')).toBe(raw);
    expect(JSON.parse(memory.get('leyline-account-0.2.0')!).document.name).toBe('新账号');
    store.account.name = '继续编辑';
    expect(JSON.parse(memory.get('leyline-account-0.2.0')!).document.name).toBe('继续编辑');
  });
  it('writes a committed replacement once and still autosaves later edits', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    const store = useAccountStore();
    store.commitEdit({ ...store.account, name: '已提交的账号' });
    expect(setItem).toHaveBeenCalledTimes(1);
    store.account.name = '继续编辑';
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(setItem.mock.lastCall![1]).document.name).toBe('继续编辑');
  });
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
