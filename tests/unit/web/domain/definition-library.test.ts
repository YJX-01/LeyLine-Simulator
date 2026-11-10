import { describe, expect, it } from 'vitest';
import { recordedProject } from '../../../helpers/recorded-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { copyDefinitionToProject, parseDefinitionLibrary } from '../../../../src/web/src/domain/definition-library';

describe('current definition snapshots', () => {
  it('copies recorded definitions without later edits changing the installed snapshot', async () => {
    const source = await recordedProject();
    const project = createEmptyProject();
    const definition = source.definitions[0];
    copyDefinitionToProject(project, definition, source.definitions);
    expect(project.definitions[0]).toEqual(definition);
    definition.name = 'Edited snapshot name';
    expect(project.definitions[0].name).not.toBe(definition.name);
    expect(() => copyDefinitionToProject(project, definition, source.definitions)).toThrow('已有');
  });

  it('rejects missing references and duplicate IDs in derivatives of recorded definitions', async () => {
    const source = await recordedProject();
    const file = { schemaVersion: 2, kind: 'definition-library', id: source.id, name: 'Recorded definitions', definitions: source.definitions };
    expect(parseDefinitionLibrary(file).definitions).toEqual(source.definitions);
    const duplicate = structuredClone(file);
    duplicate.definitions.push(structuredClone(duplicate.definitions[0]));
    expect(() => parseDefinitionLibrary(duplicate)).toThrow('重复');
    const invalid = structuredClone(file);
    invalid.definitions.find(definition => definition.damage)!.damage = 'missing';
    expect(() => parseDefinitionLibrary(invalid)).toThrow('不存在');
  });
});
