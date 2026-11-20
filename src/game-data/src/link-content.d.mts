import type * as Schemas from '@leyline/schema';
export function createContentLinker(options: {
  schemas: Pick<typeof Schemas, 'definitionKey' | 'structuredCharacterDefinitionSchema' | 'structuredWeaponDefinitionSchema' | 'structuredArtifactSetDefinitionSchema'>;
  collectCalculationRoots: (library: Schemas.CalculationBundle, request: unknown) =>
    { ok: true; bundle: Schemas.CalculationBundle } | { ok: false; diagnostics: Schemas.CalculationDiagnostic[] };
  library: Schemas.CalculationBundle;
}): {
  character(input: unknown): Schemas.StructuredCharacterDefinition;
  weapon(input: unknown): Schemas.StructuredWeaponDefinition;
  set(input: unknown): Schemas.StructuredArtifactSetDefinition;
};
