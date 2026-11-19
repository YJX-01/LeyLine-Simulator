import type * as Schemas from '@leyline/schema';
import type { collectCalculationRoots, describeCalculationTemplate } from '@leyline/engine';
export function createContentLinker(options: {
  schemas: typeof Schemas; collectCalculationRoots: typeof collectCalculationRoots; library: Schemas.CalculationBundle;
  describeCalculationTemplate?: typeof describeCalculationTemplate; manifest?: { dataVersion: string };
  hitReviews?: Record<string, unknown>; retainedRules?: Record<string, unknown>; textBindings?: Record<string, unknown>;
}): {
  character(input: Schemas.CharacterDefinition): Promise<Schemas.StructuredCharacterDefinition>;
  weapon(input: Schemas.WeaponDefinition): Promise<Schemas.StructuredWeaponDefinition>;
  set(input: Schemas.ArtifactSetDefinition & { rarity: number }): Promise<Schemas.StructuredArtifactSetDefinition>;
};
