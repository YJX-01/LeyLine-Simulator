import type { CalculationBundle } from '@leyline/schema';
export function readCalculationLibrary(read?: (path: string) => unknown): CalculationBundle;
export function assembleCalculationLibrary(common: unknown, reactions: unknown, entities: unknown[]): CalculationBundle;
