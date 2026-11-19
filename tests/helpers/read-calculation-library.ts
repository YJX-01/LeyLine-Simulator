import { readCalculationLibrary as assembleLibrary } from '../../tools/lib/calculation-library.mjs';
let cached: CalculationBundle | undefined;
import type { CalculationBundle } from '@leyline/schema';

/** The full catalog library is a tooling artifact. App reads use entity closures. */
export function readCalculationLibrary(): CalculationBundle {
  return structuredClone(cached ??= assembleLibrary());
}
