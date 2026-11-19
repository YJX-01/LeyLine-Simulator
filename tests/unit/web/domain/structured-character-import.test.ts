import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '@leyline/schema';
import { collectCalculationRoots, describeCalculationTemplate, compileStructuredCharacter, evaluateStructuredHit, prepareStructuredBuilds } from '@leyline/engine';
import { getArtifactMain } from '@leyline/game-data';
import { createContentLinker } from '../../../../tools/lib/content-linking.mjs';
import { applyCharacterImport, exportCharacterSnapshot, prepareCharacterImport, preparedCharacterSnapshot } from '../../../../src/web/src/domain/structured-character-import';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const format = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

describe('current self-contained character import transactions', () => {
  let original: schemas.StructuredCharacterDefinition, weapon: schemas.StructuredWeaponDefinition, main: schemas.StructuredBuild['artifactMain'];
  let prepare: ReturnType<typeof createContentLinker>;
  beforeAll(async () => {
    prepare = createContentLinker({ schemas, collectCalculationRoots, describeCalculationTemplate, library: readCalculationLibrary(), manifest: read('src/game-data/data/manifest.json'),
      hitReviews: read('tools/data/sources/calculation-hits/ordinary-bindings.json'), retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'), textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
    original = await prepare.character(read('src/game-data/data/characters/kaeya.json'));
    weapon = await prepare.weapon(read('src/game-data/data/weapons/favoniussword.json')); main = await getArtifactMain();
  });
  // Actual catalog metadata under an explicitly local namespace, never an invented game character.
  function custom(source = original): schemas.StructuredCharacterDefinition {
    const value = structuredClone(source), namespace = 'custom:' + source.id + '-json-check'; value.origin = 'custom'; value.namespace = namespace;
    value.derivedFrom = { id: source.id, name: source.identity.name, revision: source.revision };
    for (const record of value.calculation.bundle.coverage) { record.identity.namespace = namespace; record.entity.namespace = namespace; }
    for (const reference of value.calculation.contextCoverageRefs) reference.namespace = namespace;
    for (const talent of value.talents) for (const hit of talent.hits) {
      for (const reference of hit.coverageRefs) reference.namespace = namespace;
      for (const output of hit.outputs) for (const reference of output.coverageRefs) reference.namespace = namespace;
    }
    return value;
  }

  it('prepares before writing, downgrades external evidence and returns an owned atomic registry', () => {
    const current = [original], before = format(current), file = custom();
    const result = prepareCharacterImport(format(file), current); expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.prepared.disposition).toBe('add'); expect(result.prepared.conflicts).toEqual([]);
    const preview = preparedCharacterSnapshot(result.prepared);
    expect(preview.calculation.bundle.coverage.every(record => record.evidence === 'declared')).toBe(true);
    preview.identity.name = 'edited preview copy';
    const next = applyCharacterImport(current, result.prepared);
    expect(next).toHaveLength(2); expect(next[1].identity.name).toBe(original.identity.name); expect(format(current)).toBe(before);
    next[0].identity.name = 'edited returned copy'; expect(format(current)).toBe(before);
    const again = prepareCharacterImport(format(file), applyCharacterImport(current, result.prepared)); expect(again.ok).toBe(true);
    if (again.ok) expect(again.prepared.disposition).toBe('reuse');
  });

  it('requires local authority for builtin claims and refuses exact-identity content conflicts', () => {
    const claim = prepareCharacterImport(format(original), []); expect(claim.ok).toBe(true);
    if (claim.ok) { expect(claim.prepared.conflicts.some(conflict => conflict.kind === 'builtin-claim')).toBe(true); expect(() => applyCharacterImport([], claim.prepared)).toThrow('冲突'); }
    const reuse = prepareCharacterImport(format(original), [original]); expect(reuse.ok).toBe(true);
    if (reuse.ok) { expect(reuse.prepared.disposition).toBe('reuse'); expect(applyCharacterImport([original], reuse.prepared)).toHaveLength(1); }
    const derivative = custom(), formula = derivative.calculation.bundle.formulas.find(formula => formula.identity.id === 'ordinary-hit')!;
    formula.sources.push('kqm.crit'); // Valid metadata change under the same immutable shared identity.
    const conflict = prepareCharacterImport(format(derivative), [original]); expect(conflict.ok).toBe(true);
    if (conflict.ok) { expect(conflict.prepared.conflicts.some(conflict => conflict.kind === 'calculation')).toBe(true); expect(() => applyCharacterImport([original], conflict.prepared)).toThrow('冲突'); }
  });

  it('refuses stale preparation and invalid current-format derivatives without mutating the registry', () => {
    const current = [structuredClone(original)], before = format(current), valid = prepareCharacterImport(format(custom()), current); expect(valid.ok).toBe(true); if (!valid.ok) return;
    current[0].identity.name += ' changed';
    expect(() => applyCharacterImport(current, valid.prepared)).toThrow('变化');
    const legacy = { ...original, schemaVersion: 2 };
    expect(prepareCharacterImport(format(legacy), [original]).ok).toBe(false);
    const duplicate = format(original).replace('"schemaVersion": 3', '"schemaVersion": 3, "schemaVersion": 3');
    expect(prepareCharacterImport(duplicate, [original]).ok).toBe(false);
    const missing = custom(); missing.calculation.bundle.formulas = missing.calculation.bundle.formulas.filter(formula => formula.identity.id !== 'ordinary-hit');
    expect(prepareCharacterImport(format(missing), [original]).ok).toBe(false);
    expect(format([original])).toBe(before);
  });

  it.each(['missing', 'unit'] as const)('rejects a %s Yun Jin effect parameter before import can be applied', async change => {
    const yunjin = await prepare.character(read('src/game-data/data/characters/yunjin.json'));
    const current = [yunjin], before = format(current), file = custom(yunjin);
    const burst = file.talents.find(talent => talent.id === 'yunjin.burst')!;
    // Transparent error derivatives of Flying Cloud's real param2 binding; no player data is constructed.
    if (change === 'missing') burst.parameters = burst.parameters.filter(parameter => parameter.id !== 'param2');
    else burst.parameters.find(parameter => parameter.id === 'param2')!.unit = 'seconds';
    for (const result of [compileStructuredCharacter(file), prepareCharacterImport(format(file), current)]) {
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: change === 'missing' ? 'missing-dependency' : 'unit-mismatch',
        jsonPointer: expect.stringMatching(/^\/calculation\/bundle\/effects\/\d+\/value\/inputs\/rate\//) }));
    }
    expect(format(current)).toBe(before);
  });

  it('validates parameter dependencies in attribute bases while deferring an effect recipient to its actual actor', async () => {
    const file = custom(), attribute = file.calculation.bundle.attributes.find(attribute => attribute.identity.id === 'attribute.critRate')!;
    // Misbind Kaeya's scalar attribute to a real parameter owned by another character.
    attribute.base = { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: 'yunjin.burst', parameterId: 'param2', type: { kind: 'quantity', unit: 'scalar' } };
    const invalid = compileStructuredCharacter(file);
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing-dependency', jsonPointer: expect.stringMatching(/^\/calculation\/bundle\/attributes\/\d+\/base\/parameterId$/) }));

    const yunjin = await prepare.character(read('src/game-data/data/characters/yunjin.json'));
    const effect = yunjin.calculation.bundle.effects.find(effect => effect.identity.id === 'yunjin.flying-cloud-base.base')!;
    if (effect.value.kind !== 'formula') throw new Error('Expected adopted Flying Cloud formula.');
    effect.value.inputs.rate = { kind: 'talent-parameter', actor: { role: 'recipient' }, skillId: 'kaeya.skill', parameterId: 'param1', type: { kind: 'quantity', unit: 'scalar' } };
    // This reference-error derivative belongs to the explicit recipient, not to Yun Jin's own parameter table.
    expect(compileStructuredCharacter(yunjin).ok).toBe(true);
  });

  it('recomputes a JSON-only parameter edit offline through the same v3 build evaluator', () => {
    const file = custom(), skill = file.talents.find(talent => talent.id === 'kaeya.skill')!, parameter = skill.parameters.find(parameter => parameter.id === 'param1')!;
    const previous = parameter.values[0]; parameter.values[0] *= 1.01;
    const imported = prepareCharacterImport(format(file), [original]); expect(imported.ok).toBe(true); if (!imported.ok) return;
    const next = applyCharacterImport([original], imported.prepared), reopened = JSON.parse(format(next[1]));
    const compiled = compileStructuredCharacter(reopened); expect(compiled.ok).toBe(true);
    const build: schemas.StructuredBuild = { schemaVersion: 3, kind: 'calculation-build', dataVersion: original.dataVersion, character: reopened, weapon, sets: [], artifacts: [], artifactMain: main,
      level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 }, weaponLevel: 90, weaponAscension: 6, refinement: 1,
      sources: [{ id: 'main', kind: 'repo', repository: 'Rafs-kk/LunaGC-6.6-res', commit: 'b0501c5d89767ead5f647869a2412521447f7682', path: 'ExcelBinOutput/ReliquaryLevelExcelConfigData.json' }], artifactMainSourceRefs: ['main'] };
    const prepared = prepareStructuredBuilds([{ id: 'kaeya-query', build }]); expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const fact = (value: schemas.Value): schemas.CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
    const input = { targets: [{ id: 'enemy', inputs: { level: fact({ kind: 'quantity', unit: 'count', value: 90 }), defenseReduction: fact({ kind: 'quantity', unit: 'scalar', value: 0 }), ordinaryDamageReduction: fact({ kind: 'quantity', unit: 'scalar', value: 0 }), 'resistance.cryo': fact({ kind: 'quantity', unit: 'scalar', value: 0.1 }) }, facts: {} }],
      team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [], events: [{ id: 'hit', kind: 'hit', actorId: 'kaeya-query', targetIds: ['enemy'], timeMs: 0, order: 0, skillId: 'kaeya.skill', hitId: 'kaeya.skill.param1', category: 'skill', sourceEventIds: [], facts: {} }] };
    const result = evaluateStructuredHit(prepared.team, input, { actorId: 'kaeya-query', skillId: 'kaeya.skill', hitId: 'kaeya.skill.param1', outputId: 'kaeya.skill.param1.damage',
      critMode: 'noncritical', reactionMode: 'none', frame: { targetId: 'enemy', eventId: 'hit', sourceEventId: null, phase: 'before', facts: {}, actorFacts: {}, captures: {}, applications: [], factOverrides: [] } });
    expect(result.execution).toBe('complete');
    const white = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6, value = result.totals.all;
    if (value.state === 'known') expect(value.value.value).toBeCloseTo(white * previous * 1.01 * 0.5 * 0.9, 8);
    expect(result.outputs[0].evidence).toBe('declared');
    expect(original.talents.find(talent => talent.id === 'kaeya.skill')!.parameters.find(parameter => parameter.id === 'param1')!.values[0]).toBe(previous);
  });

  it('exports only reachable dependencies and complete panel references as plain current JSON', async () => {
    const file = custom(), library = readCalculationLibrary(), unused = library.formulas.find(formula => formula.identity.id === 'nahida.skill.tri-karma.base')!;
    file.calculation.bundle.formulas.push(structuredClone(unused));
    for (const source of library.sources.filter(source => unused.sources.includes(source.id))) if (!file.calculation.bundle.sources.some(entry => entry.id === source.id)) file.calculation.bundle.sources.push(structuredClone(source));
    const before = format(file), exported = exportCharacterSnapshot(file), value = JSON.parse(exported);
    expect(exported.endsWith('\n')).toBe(true); expect(exported.includes('\r')).toBe(false); expect(exported.startsWith('{\n  "')).toBe(true);
    expect(value.calculation.bundle.formulas.some((formula: schemas.FormulaDefinition) => formula.identity.id === unused.identity.id)).toBe(false);
    expect(Object.keys(value.attributes.outputs)).toHaveLength(schemas.statKeys.length);
    expect(prepareCharacterImport(exported, [original]).ok).toBe(true);
    expect(format(file)).toBe(before);
  });
});
