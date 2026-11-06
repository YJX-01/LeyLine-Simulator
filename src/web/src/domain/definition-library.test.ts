import { describe, expect, it } from 'vitest';
import { evaluateWorkbench } from '@leyline/engine';
import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { createDefinition, createSyntheticTeam, copyDefinitionToProject, parseDefinitionLibrary } from './definition-library';

function empty(): WorkbenchProject {
  return workbenchProjectSchema.parse({ schemaVersion: 1, rulesVersion: 'workbench-v1', id: 'empty', revision: '1', definitions: [], candidate: { id: 'candidate', actors: [] }, conditions: {}, timeline: [], objective: {} });
}
describe('independent content definitions', () => {
  it('creates a synthetic team from empty input and keeps a three-hit independent calculation', () => {
    const project = empty();
    const actor = createSyntheticTeam(project, '合成角色', 1100);
    const damage = project.definitions.find(definition => definition.damage)!;
    const multiplier = damage.nodes.find(node => node.op === 'constant');
    if (multiplier?.op === 'constant') multiplier.quantity.value = 3;
    const weapon = project.definitions[1];
    weapon.nodes.push({ id: 'bonus', op: 'constant', quantity: { value: 0.2, unit: 'scalar' } });
    weapon.effects.push({ id: 'effect', value: 'bonus', startMs: 0, endMs: 5000 });
    project.timeline = [2000, 6000, 10000].map((timeMs, order) => ({ id: `hit-${order}`, kind: 'damage', actor, definition: damage.id, timeMs, order }));
    // 1100 × 3 × 1.2 + 1100 × 3 + 1100 × 3 = 10560.
    expect(evaluateWorkbench(project).totalValue).toBe(10560);
    expect(evaluateWorkbench(workbenchProjectSchema.parse(JSON.parse(JSON.stringify(project)))).totalValue).toBe(10560);
  });
  it('copies definitions and action dependencies without spreading future updates into old axes', () => {
    const character = createDefinition('虚构角色', 'character');
    const weapon = createDefinition('武器', 'equipment');
    const damage = createDefinition('伤害');
    weapon.nodes.push({ id: 'bonus', op: 'constant', quantity: { value: 0.2, unit: 'scalar' } });
    weapon.effects.push({ id: 'effect', value: 'bonus', startMs: 0, endMs: 5000, action: character.id });
    const library = parseDefinitionLibrary({ schemaVersion: 1, kind: 'definition-library', id: 'library', name: '定义库', definitions: [character, weapon, damage] });
    const project = empty();
    copyDefinitionToProject(project, weapon, library.definitions);
    copyDefinitionToProject(project, damage, library.definitions);
    project.candidate.actors.push({ id: 'actor', character: character.id, weapon: weapon.id, inputs: { attack: { value: 1000, unit: 'attack' } } });
    project.timeline = [{ id: 'action', kind: 'action', actor: 'actor', definition: character.id, timeMs: 0, order: 0 }, { id: 'hit', kind: 'damage', actor: 'actor', definition: damage.id, timeMs: 1000, order: 1 }];
    expect(evaluateWorkbench(project).totalValue).toBe(2400);
    weapon.version = '2';
    const node = weapon.nodes[0];
    if (node.op === 'constant') node.quantity.value = 0.5;
    expect(evaluateWorkbench(project).totalValue).toBe(2400);
    expect(() => copyDefinitionToProject(project, weapon, library.definitions)).toThrow('已有');
    expect(evaluateWorkbench(project).totalValue).toBe(2400);
  });
  it('validates references, cycles, and versions before accepting a library', () => {
    const definition = createDefinition('公式');
    const file = { schemaVersion: 1, kind: 'definition-library', id: 'library', name: '库', definitions: [definition] };
    expect(parseDefinitionLibrary(JSON.parse(JSON.stringify(file))).definitions[0]).toEqual(definition);
    expect(() => parseDefinitionLibrary({ ...file, schemaVersion: 2 })).toThrow('版本');
    definition.damage = 'absent';
    expect(() => parseDefinitionLibrary(file)).toThrow('不存在');
    definition.damage = 'base';
    const base = definition.nodes.find(node => node.op === 'multiply');
    if (base?.op === 'multiply') base.left = 'base';
    expect(() => parseDefinitionLibrary(file)).toThrow('循环');
  });
  it('saves P3 definitions independently and requires an explicit rule choice before copying them', () => {
    const definition = createDefinition('捕获公式');
    definition.nodes.push({ id: 'capture', op: 'capture', at: 'cast', value: 'base' });
    definition.damage = 'capture';
    const file = { schemaVersion: 1, kind: 'definition-library', id: 'p3-library', name: '捕获库', definitions: [definition] };
    expect(parseDefinitionLibrary(JSON.parse(JSON.stringify(file))).definitions[0]).toEqual(definition);
    const project = empty();
    expect(() => copyDefinitionToProject(project, definition)).toThrow('明确采用 P3');
    expect(project.definitions).toEqual([]);
    expect(project.rulesVersion).toBe('workbench-v1');
    project.rulesVersion = 'workbench-p3';
    copyDefinitionToProject(project, definition);
    definition.version = '2';
    expect(project.definitions[0].version).toBe('1');
  });
  it('retains unknown conditions and unsupported capability nodes as partial input', () => {
    const project = empty();
    const actor = createSyntheticTeam(project, '角色', 1000);
    const definition = project.definitions.find(entry => entry.damage)!;
    definition.nodes.push({ id: 'conditional', op: 'condition', key: '触发条件', yes: 'base', no: 'base' });
    definition.damage = 'conditional';
    project.conditions['触发条件'] = null;
    project.timeline.push({ id: 'hit', kind: 'damage', actor, definition: definition.id, timeMs: 0, order: 0 });
    expect(evaluateWorkbench(project).status).toBe('partial');
    expect(evaluateWorkbench(project).totalValue).toBeNull();
    project.conditions['触发条件'] = false;
    expect(evaluateWorkbench(project).totalValue).toBe(2000);
  });
});
