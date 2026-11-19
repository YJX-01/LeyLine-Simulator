import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formulaDefinitionSchema, parseCalculationJson, calculationValueSchema } from '@leyline/schema';

const character = readCalculationData(new URL('../../../../src/game-data/data/characters/nahida.json', import.meta.url));
const document = JSON.stringify(character.calculation.bundle.formulas.find((item: { identity: { id: string } }) => item.identity.id === 'nahida.skill.tri-karma.base'), null, 2);
const definition = () => JSON.parse(document);

describe('data-only template configuration from adopted Nahida scaling', () => {
  it('keeps real parameters and scaling choices while the engine owns operations and signatures', () => {
    const skill = character.talents.find((talent: { id: string }) => talent.id === 'nahida.skill');
    expect(skill.parameters.find((parameter: { id: string }) => parameter.id === 'param3').values[0]).toBe(1.032);
    expect(skill.parameters.find((parameter: { id: string }) => parameter.id === 'param4').values[0]).toBe(2.064);
    const parsed = formulaDefinitionSchema.parse(definition());
    expect(parsed.template).toEqual({ id: 'scaled-damage', revision: '1', output: 'base', terms: [
      { stat: 'attack', attribute: 'attack', ratio: 'attackRate' }, { stat: 'elementalMastery', attribute: 'em', ratio: 'emRate' },
    ] });
    expect(Object.keys(parsed).sort()).toEqual(['identity', 'schemaVersion', 'sources', 'template']);
  });

  it.each(['nodes', 'inputs', 'outputs', 'stages', 'modifierPorts', 'code'])('rejects imported %s overrides on the actual recipe', field => {
    const derivative = definition(); derivative[field] = character.talents;
    expect(formulaDefinitionSchema.safeParse(derivative).success).toBe(false);
  });

  it.each(['unknown-template', 'unknown-revision', 'unknown-option', 'unit', 'duplicate-input', 'empty-terms', 'old-version'])('rejects the transparent %s derivative', change => {
    const derivative = definition();
    if (change === 'unknown-template') derivative.template.id = 'arbitrary-script';
    if (change === 'unknown-revision') derivative.template.revision = 'future';
    if (change === 'unknown-option') derivative.template.operations = [];
    if (change === 'unit') derivative.template.terms[0].stat = 'energy';
    if (change === 'duplicate-input') derivative.template.terms[1].attribute = 'attack';
    if (change === 'empty-terms') derivative.template.terms = [];
    if (change === 'old-version') derivative.schemaVersion = 1;
    expect(formulaDefinitionSchema.safeParse(derivative).success).toBe(false);
  });

  it('keeps typed numeric boundaries and rejects duplicate JSON members', () => {
    expect(calculationValueSchema.safeParse({ kind: 'quantity', unit: 'count', value: 1.5 }).success).toBe(false);
    expect(calculationValueSchema.safeParse({ kind: 'quantity', unit: 'damage', value: Infinity }).success).toBe(false);
    const duplicate = document.replace('"revision": "1"', '"revision": "1", "revis\\u0069on": "2"');
    const result = parseCalculationJson(duplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]).toMatchObject({ code: 'malformed-json', jsonPointer: '/identity/revision' });
    expect(parseCalculationJson(document).ok).toBe(true);
  });
});
