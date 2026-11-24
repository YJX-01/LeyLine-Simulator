import { createPinia, setActivePinia } from 'pinia';
import { expect, it, vi } from 'vitest';
import { storageKeyFor } from '@leyline/schema/version';
import { useCharacterLoadoutsStore } from '../../../../src/web/src/stores/character-loadouts';

it.each([[1, 3], [3, 1]])('unifies a legacy character rating of %i with a preferred rating of %i', (role, preferred) => {
  const key = storageKeyFor('character-favorites');
  const data = new Map([[key, JSON.stringify({
    'account/role': role,
    [JSON.stringify(['account', 'role', ''])]: preferred,
    [JSON.stringify(['account', 'role', 'alternate'])]: 2,
  })]]);
  vi.stubGlobal('localStorage', {
    getItem: (id: string) => data.get(id) ?? null,
    setItem: (id: string, value: string) => data.set(id, value),
  });
  try {
    setActivePinia(createPinia());
    const store = useCharacterLoadoutsStore();
    expect(store.favoriteLevel('account', 'role')).toBe(3);
    expect(store.favoriteLevel('account', 'role', '')).toBe(3);
    store.setFavorite('account', 'role', 1);
    expect(store.favoriteLevel('account', 'role', '')).toBe(1);
    store.setFavorite('account', 'role', 0, '');
    setActivePinia(createPinia());
    const reloaded = useCharacterLoadoutsStore();
    expect(reloaded.favoriteLevel('account', 'role')).toBe(0);
    expect(reloaded.favoriteLevel('account', 'role', 'alternate')).toBe(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
