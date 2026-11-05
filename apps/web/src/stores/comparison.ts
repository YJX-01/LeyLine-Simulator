import { defineStore } from 'pinia';
import { shallowRef, computed } from 'vue';
import type { RunSnapshot } from '../domain/run';
import { compareRuns } from '../domain/comparison';
export const useComparisonStore = defineStore('comparison', () => {
  const a = shallowRef<RunSnapshot>(), b = shallowRef<RunSnapshot>();
  function pin(slot: 'a' | 'b', snapshot: RunSnapshot) {
    // Comparisons own detached inputs and results; editing or rerunning cannot mutate them.
    const copy: RunSnapshot = JSON.parse(JSON.stringify(snapshot));
    if (slot === 'a') a.value = copy; else b.value = copy;
  }
  const comparison = computed(() => a.value && b.value ? compareRuns(a.value, b.value) : undefined);
  function clear() { a.value = undefined; b.value = undefined; }
  return { a, b, comparison, pin, clear };
});
