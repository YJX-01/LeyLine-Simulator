import type { CalculationBundle } from '@leyline/schema';
import type { CatalogInventory } from './catalog-data.mjs';
export function readCalculationLibrary(read?: (path: string) => unknown, manifest?: Omit<CatalogInventory, 'dataVersion'>): CalculationBundle;
export function assembleCalculationLibrary(common: unknown, reactions: unknown, entities: unknown[]): CalculationBundle;
