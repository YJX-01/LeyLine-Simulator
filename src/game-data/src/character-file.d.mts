import type { CharacterMetadata, CharacterDefinition, CalculationBundle, CalculationDiagnostic } from '@leyline/schema';
export function linkCharacterFile(input: CharacterMetadata, version: string,
  collect: (library: unknown, input: unknown) => { ok: true; bundle: CalculationBundle; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] }, curves?: Record<string, unknown>): CharacterDefinition;

export function linkEquipmentFile<T extends import('@leyline/schema').WeaponDefinition | import('@leyline/schema').ArtifactSetDefinition>(input: T['metadata'], collect: Parameters<typeof linkCharacterFile>[2]): T;
