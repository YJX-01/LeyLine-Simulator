import { storageKeyFor } from '@leyline/schema/version';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const libraryPageRowDefaults = {
  characters: 5,
  configurationRelaxed: 5,
  configurationCompact: 5,
  artifactRelaxed: 5,
  artifactCompact: 8,
  combinations: 5,
  teams: 5,
} as const;

export type LibraryPageRows = { -readonly [Key in keyof typeof libraryPageRowDefaults]: number };
export const maximumLibraryPageRows = 50;

function readRows(): LibraryPageRows {
  const rows: LibraryPageRows = { ...libraryPageRowDefaults };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKeyFor('library-page-rows')) ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return rows;
    for (const key of Object.keys(rows) as (keyof LibraryPageRows)[]) {
      const value = (saved as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maximumLibraryPageRows) rows[key] = value;
    }
  } catch {
    // Unavailable or invalid display preferences do not affect account data.
  }
  return rows;
}

export const useLibraryPreferencesStore = defineStore('library-preferences', () => {
  const rows = ref<LibraryPageRows>(readRows());
  watch(rows, value => {
    try { localStorage.setItem(storageKeyFor('library-page-rows'), JSON.stringify(value)); } catch { /* Keep the in-memory preference. */ }
  }, { deep: true, flush: 'sync' });
  function resetRows() { rows.value = { ...libraryPageRowDefaults }; }
  return { rows, resetRows };
});
