import { catalogInventory, readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '@leyline/schema';
import { collectCalculationRoots, compileCharacterActions, describeCalculationTemplate } from '@leyline/engine';
import { getCharacterActions } from '@leyline/game-data';
import { createContentLinker } from '../../../../tools/lib/content-linking.mjs';
import { applyActionsImport, exportActionsSnapshot, prepareActionsImport, preparedActionsSnapshot } from '../../../../src/web/src/domain/structured-actions-import';

const read = (path: string) => readCalculationData(path);
const format = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

describe('current optional action companion transactions from actual Vesna metadata', () => {
  let character: schemas.StructuredCharacterDefinition, original: schemas.CharacterActionsDefinition;
  beforeAll(async () => {
    const prepare = createContentLinker({ schemas, collectCalculationRoots, describeCalculationTemplate, library: readCalculationLibrary(), manifest: catalogInventory(),
      hitReviews: read('tools/data/sources/calculation-hits/ordinary-bindings.json'), retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'), textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
    character = await prepare.character(read('src/game-data/data/characters/vesna.json'));
    original = (await getCharacterActions({ namespace: character.namespace, id: character.id, revision: character.revision }))!;
  });
  function custom() { const file = structuredClone(original); file.identity.namespace = 'custom:vesna-actions-json-check'; return file; }

  it('exports a closed separate companion and reopens with the supplied character alone', () => {
    const text = exportActionsSnapshot(original, character), file = JSON.parse(text);
    expect(compileCharacterActions(file, JSON.parse(format(character))).ok).toBe(true);
    expect(file.calculation.bundle.stateMachines).toHaveLength(1);
    expect(file.calculation.bundle.effects).toHaveLength(0);
    expect(file.calculation.bundle.coverage).toHaveLength(0);
    expect(text.endsWith('\n')).toBe(true); expect(text.includes('\r')).toBe(false);
    expect(file.actions).toEqual(original.actions);
  });

  it('prepares, previews and applies owned values without changing the character or current actions', () => {
    const characterBefore = format(character), originalBefore = format(original), result = prepareActionsImport(format(custom()), character, original);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.prepared.disposition).toBe('replace'); expect(result.prepared.conflicts).toEqual([]);
    const preview = preparedActionsSnapshot(result.prepared); preview.actions.length = 0;
    const next = applyActionsImport(character, original, result.prepared);
    expect(next.actions).toHaveLength(15); expect(next.identity.namespace).toBe('custom:vesna-actions-json-check');
    next.actions.length = 0;
    expect(format(character)).toBe(characterBefore); expect(format(original)).toBe(originalBefore);
    expect(preparedActionsSnapshot(result.prepared).actions).toHaveLength(15);
  });

  it('requires authority for builtin claims, reuses exact content and preserves immutable identities', () => {
    const claim = prepareActionsImport(format(original), character, null);
    expect(claim.ok).toBe(true); if (claim.ok) { expect(claim.prepared.disposition).toBe('conflict'); expect(() => applyActionsImport(character, null, claim.prepared)).toThrow('冲突'); }
    const reuse = prepareActionsImport(format(original), character, original);
    expect(reuse.ok).toBe(true); if (reuse.ok) expect(reuse.prepared.disposition).toBe('reuse');
    const derivative = custom(); derivative.calculation.bundle.stateMachines[0].states[1].overflow = 'retain-latest';
    const conflict = prepareActionsImport(format(derivative), character, original);
    expect(conflict.ok).toBe(true); if (conflict.ok) { expect(conflict.prepared.conflicts.some(message => message.includes('计算定义'))).toBe(true); expect(() => applyActionsImport(character, original, conflict.prepared)).toThrow('冲突'); }
  });

  it('rejects old formats, stale character or output references and malformed JSON before application', () => {
    const version = custom(); Object.assign(version, { schemaVersion: 0 });
    expect(prepareActionsImport(format(version), character, original).ok).toBe(false);
    const stale = custom(); stale.character.revision = 'missing';
    expect(prepareActionsImport(format(stale), character, original).ok).toBe(false);
    const output = custom(); output.actions[0].hits[0].outputIds[0] = 'absent-output';
    expect(prepareActionsImport(format(output), character, original).ok).toBe(false);
    expect(prepareActionsImport(format(custom()).slice(0, -8), character, original).ok).toBe(false);
  });

  it('rejects stale preparation after either owned snapshot changes', () => {
    const result = prepareActionsImport(format(custom()), character, original);
    expect(result.ok).toBe(true); if (!result.ok) return;
    const changedCharacter = structuredClone(character); changedCharacter.revision = 'next';
    expect(() => applyActionsImport(changedCharacter, original, result.prepared)).toThrow('已变化');
    const changedActions = structuredClone(original); changedActions.identity.revision = 'next';
    expect(() => applyActionsImport(character, changedActions, result.prepared)).toThrow('已变化');
    expect(() => applyActionsImport(character, original, { ...result.prepared })).toThrow('已变化');
  });
});
