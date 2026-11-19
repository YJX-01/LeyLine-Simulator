import type { CharacterDefinition, CharacterActionsDefinition, WeaponDefinition, ArtifactSetDefinition, CalculationBundle } from '@leyline/schema';
import type { CatalogInventory } from './catalog-data.mjs';
export function createRuntimeCatalog(): Promise<{ inventory: CatalogInventory; library: CalculationBundle;
  get<G extends keyof Entities>(group: G, id: string): Promise<Entities[G]> }>;
interface Entities { characters: CharacterDefinition; weapons: WeaponDefinition; sets: ArtifactSetDefinition; actions: CharacterActionsDefinition }
