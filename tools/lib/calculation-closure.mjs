import { loadContentSchema } from './load-content-schema.mjs';

/** Tool bridge to the same pure collector used by browser imports and exports. */
export async function collectFormulaClosure(roots, library, options = {}) {
  const collector = options.collector ?? (await loadContentSchema('/src/engine/src/index.ts')).collectCalculationRoots;
  const result = collector(library, { roots, sourceIds: options.sourceIds ?? [], families: options.families ?? [] });
  if (!result.ok) throw Object.assign(new Error('Calculation closure is invalid.'), { diagnostics: result.diagnostics });
  return result.bundle;
}
