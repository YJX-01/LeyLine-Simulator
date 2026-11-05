import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
import { useWorkspaceStore, draftKey } from './workspace';
import type { StoragePort } from '../domain/plans';
function memory(): StoragePort { const data = new Map<string, string>(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }; }
let pinia: ReturnType<typeof createPinia>;
describe('workspace recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); pinia = createPinia(); setActivePinia(pinia); });
  afterEach(() => { disposePinia(pinia); vi.useRealTimers(); });
  it('persists valid drafts and never overwrites them with invalid edits', async () => {
    const port = memory(), store = useWorkspaceStore(); store.initialize(port);
    const input = store.input!; input.seed = 25; store.source = JSON.stringify(input);
    await nextTick(); vi.advanceTimersByTime(300);
    const saved = port.getItem(draftKey);
    expect(saved).toContain('"seed":25');
    store.source = '{'; await nextTick(); vi.advanceTimersByTime(500);
    expect(port.getItem(draftKey)).toBe(saved);
    disposePinia(pinia); pinia = createPinia(); setActivePinia(pinia);
    const restored = useWorkspaceStore(); restored.initialize(port);
    expect(restored.input?.seed).toBe(25);
  });
  it('retains damaged drafts without silently overwriting them', async () => {
    const port = memory(); port.setItem(draftKey, '{bad');
    const store = useWorkspaceStore(); store.initialize(port);
    store.source = JSON.stringify({ ...store.input!, seed: 42 });
    await nextTick(); vi.advanceTimersByTime(500);
    expect(port.getItem(draftKey)).toBe('{bad');
    expect(store.notice).toContain('未覆盖');
  });
  it('reports quota errors without losing the editor contents', async () => {
    const store = useWorkspaceStore(); store.initialize({ getItem: () => null, setItem: () => { throw new Error(); } });
    store.source = JSON.stringify({ ...store.input!, seed: 42 }); await nextTick(); vi.advanceTimersByTime(300);
    expect(store.input?.seed).toBe(42); expect(store.notice).toContain('保存失败');
  });
});
