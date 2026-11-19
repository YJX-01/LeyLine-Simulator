import { readFileSync } from 'node:fs';
import type { CalculationBundle } from '@leyline/schema';

/** The full catalog library is a tooling artifact. App reads use entity closures. */
export function readCalculationLibrary(): CalculationBundle {
  return JSON.parse(readFileSync('src/game-data/generated/calculation-formulas.json', 'utf8'));
}
