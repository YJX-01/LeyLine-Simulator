import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { computed, isReactive } from 'vue';
import { afterEach, expect, it } from 'vitest';
import { useLibraryViewStore } from '../../../../src/web/src/stores/library-view';

const pinia = createPinia();
afterEach(() => disposePinia(pinia));

it('returns reactive navigation state on the first visit and isolates accounts', () => {
  setActivePinia(pinia);
  const views = useLibraryViewStore();
  const first = views.forAccount('first');
  const offset = computed(() => first.characterOffset);
  expect(isReactive(first)).toBe(true);
  expect(offset.value).toBe(0);
  first.characterOffset = 10;
  expect(offset.value).toBe(10);
  expect(views.forAccount('first')).toBe(first);
  expect(views.forAccount('second').characterOffset).toBe(0);
});
