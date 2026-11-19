import type { CharacterMetadata, CharacterDefinition, CalculationBundle, CalculationDiagnostic } from '@leyline/schema';
export function describeCharacter(character: CharacterDefinition): CharacterMetadata;
export function linkCharacterFile(input: CharacterMetadata, version: string,
  collect: (library: unknown, input: unknown) => { ok: true; bundle: CalculationBundle; diagnostics: CalculationDiagnostic[] } | { ok: false; diagnostics: CalculationDiagnostic[] }): CharacterDefinition;
