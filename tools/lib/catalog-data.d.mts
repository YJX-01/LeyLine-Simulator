export interface CatalogInventory { dataVersion: string; characters: string[]; weapons: string[]; sets: string[]; actions: string[] }
export function catalogInventory(): CatalogInventory;
/** Raw tool inputs have independent validated schemas selected by path. */
export function readCalculationData(path: string | URL): any;
