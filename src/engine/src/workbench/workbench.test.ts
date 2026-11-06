import { describe, expect, it } from 'vitest';
import { evaluateWorkbench } from '@leyline/engine';
import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import ordinary from '../../../../fixtures/workbench/ordinary.json';

const project = (): WorkbenchProject => workbenchProjectSchema.parse(structuredClone(ordinary));
const damageDefinition = (p: WorkbenchProject) => p.definitions.find(d => d.id === 'ordinary-hit')!;
const weapon = (p: WorkbenchProject) => p.definitions.find(d => d.id === 'weapon-a')!;
const codes = (input: unknown) => evaluateWorkbench(input).diagnostics.map(d => d.code);

describe('workbench v1 independent synthetic calculations', () => {
  it('treats inherited object names as missing conditions and inputs', () => {
    const p = project();
    weapon(p).effects[0].condition = 'toString';
    expect(evaluateWorkbench(p).status).toBe('partial');
    expect(codes(p)).toContain('unknown');
    delete weapon(p).effects[0].condition;
    const d = damageDefinition(p);
    d.nodes.push({ id: 'prototype-input', op: 'input', key: 'constructor', unit: 'attack' });
    d.damage = 'prototype-input';
    expect(codes(p)).toContain('unknown');
  });

  it('reports deep expression budgets and nonfinite totals without throwing or serializing infinity', () => {
    const p = project();
    const d = damageDefinition(p);
    for (let i = 0; i < 140; i++) d.nodes.push({ id: `deep-${i}`, op: 'add', left: i ? `deep-${i - 1}` : 'base', right: 'base' });
    d.damage = 'deep-139';
    expect(codes(p)).toContain('unsupported');
    const q = project();
    q.candidate.actors[0].weapon = 'weapon-b';
    q.candidate.actors[0].inputs.attack.value = 5e307;
    const result = evaluateWorkbench(q);
    expect(result.status).toBe('invalid');
    expect(result.totalValue).toBeNull();
    expect(codes(q)).toContain('arithmetic');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it('calculates A 4400, B 4000 and A with 1100 attack 4840 without retaining effects', () => {
    const p = project();
    expect(evaluateWorkbench(p).points.map(p => p.value)).toEqual([2400, 2000]);
    expect(evaluateWorkbench(p).objectiveValue).toBe(4400);
    p.candidate.actors[0].weapon = 'weapon-b';
    expect(evaluateWorkbench(p).objectiveValue).toBe(4000);
    p.candidate.actors[0].weapon = 'weapon-a';
    p.candidate.actors[0].inputs.attack.value = 1100;
    expect(evaluateWorkbench(p).objectiveValue).toBe(4840);
    expect(evaluateWorkbench(project()).objectiveValue).toBe(4400);
  });

  it('selects only the second damage while preserving the complete axis', () => {
    const p = project();
    p.objective.damageIds = ['hit-6'];
    const result = evaluateWorkbench(p);
    expect(result.objectiveValue).toBe(2000);
    expect(result.points).toHaveLength(2);
    expect(result.totalValue).toBe(4400);
    expect(p.timeline).toHaveLength(2);
  });

  it('uses the same definitions for presets, users and an additional fictional actor/weapon', () => {
    const p = project();
    for (const d of p.definitions) d.source.kind = 'preset';
    expect(evaluateWorkbench(p).objectiveValue).toBe(4400);
    const newCharacter = structuredClone(p.definitions[0]);
    newCharacter.id = 'fictional-character';
    const newWeapon = structuredClone(weapon(p));
    newWeapon.id = 'fictional-weapon';
    p.definitions.push(newCharacter, newWeapon);
    p.candidate.actors[0].character = newCharacter.id;
    p.candidate.actors[0].weapon = newWeapon.id;
    expect(evaluateWorkbench(p).objectiveValue).toBe(4400);
  });

  it('keeps input immutable and serializes both input and the saved calculation plan', () => {
    const p = project();
    const before = JSON.stringify(p);
    const first = evaluateWorkbench(p);
    expect(JSON.stringify(p)).toBe(before);
    expect(evaluateWorkbench(JSON.parse(before))).toEqual(first);
    expect(evaluateWorkbench(JSON.parse(JSON.stringify(first.plan)))).toEqual(first);
    expect(first.points[0].formula).toBeDefined();
    expect(first.points[0].sources.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('includes interval start and excludes interval end', () => {
    const p = project();
    p.timeline[0].timeMs = 0;
    p.timeline[1].timeMs = 5000;
    expect(evaluateWorkbench(p).points.map(p => p.value)).toEqual([2400, 2000]);
  });

  it('derives action effects only after the recorded trigger and recomputes relative intervals', () => {
    const p = project();
    p.definitions.push({ id: 'cast', version: '1', source: { kind: 'user', reference: 'synthetic', verified: true }, nodes: [], effects: [] });
    weapon(p).effects[0].action = 'cast';
    p.timeline[0].timeMs = 2000;
    p.timeline[0].order = 0;
    p.timeline[1].timeMs = 2000;
    p.timeline[1].order = 2;
    p.timeline.push({ id: 'cast-record', timeMs: 2000, order: 1, actor: 'actor', kind: 'action', definition: 'cast' });
    expect(evaluateWorkbench(p).points.map(p => p.value)).toEqual([2000, 2400]);
    p.timeline[1].timeMs = 7000;
    expect(evaluateWorkbench(p).points.map(p => p.value)).toEqual([2000, 2000]);
    p.timeline = p.timeline.filter(r => r.kind !== 'action');
    expect(evaluateWorkbench(p).objectiveValue).toBe(4000);
  });

  it('orders simultaneous records by explicit order with stable id tie breaking', () => {
    const p = project();
    p.timeline[0].timeMs = 2000;
    p.timeline[1].timeMs = 2000;
    p.timeline[0].order = 2;
    p.timeline[1].order = 1;
    const first = evaluateWorkbench(p);
    expect(first.points.map(p => p.id)).toEqual(['hit-6', 'hit-2']);
    p.timeline.reverse();
    const reversed = evaluateWorkbench(p);
    expect(reversed.points).toEqual(first.points);
    expect(reversed.objectiveValue).toEqual(first.objectiveValue);
    p.timeline.forEach(r => { r.order = 0; });
    expect(evaluateWorkbench(p).points.map(p => p.id)).toEqual(['hit-2', 'hit-6']);
  });

  it('distinguishes unknown effect conditions from explicit false', () => {
    const p = project();
    weapon(p).effects[0].condition = 'triggered';
    const unknown = evaluateWorkbench(p);
    expect(unknown.status).toBe('partial');
    expect(unknown.points.map(p => p.value)).toEqual([null, 2000]);
    expect(unknown.totalValue).toBeNull();
    expect(unknown.objectiveValue).toBeNull();
    expect(unknown.diagnostics.some(d => d.code === 'unknown' && d.path.length > 0)).toBe(true);
    p.conditions.triggered = false;
    expect(evaluateWorkbench(p).objectiveValue).toBe(4000);
    p.conditions.triggered = true;
    expect(evaluateWorkbench(p).objectiveValue).toBe(4400);
  });

  it('allows a complete selected objective alongside unknown unselected damage', () => {
    const p = project();
    weapon(p).effects[0].condition = 'triggered';
    p.objective.damageIds = ['hit-6'];
    const result = evaluateWorkbench(p);
    expect(result.objectiveValue).toBe(2000);
    expect(result.totalValue).toBeNull();
  });

  it('does not evaluate missing inputs in a known unselected expression branch', () => {
    const p = project();
    const d = damageDefinition(p);
    d.nodes.push({ id: 'missing', op: 'input', key: 'not-provided', unit: 'attack' });
    d.nodes.push({ id: 'branch', op: 'condition', key: 'use-base', yes: 'base', no: 'missing' });
    d.damage = 'branch';
    p.conditions['use-base'] = true;
    expect(evaluateWorkbench(p).objectiveValue).toBe(4400);
    expect(codes(p)).not.toContain('unknown');
    p.conditions['use-base'] = null;
    expect(evaluateWorkbench(p).objectiveValue).toBeNull();
    expect(codes(p)).toContain('unknown');
  });

  it('diagnoses missing definitions, missing nodes, cycles and duplicate ids', () => {
    const p = project();
    p.timeline[0].definition = 'missing-definition';
    expect(codes(p)).toContain('missing-reference');
    const q = project();
    damageDefinition(q).damage = 'missing-node';
    expect(codes(q)).toContain('missing-reference');
    const r = project();
    damageDefinition(r).nodes.push({ id: 'loop', op: 'add', left: 'loop', right: 'attack' });
    damageDefinition(r).damage = 'loop';
    expect(codes(r)).toContain('cycle');
    const duplicate = project();
    duplicate.definitions.push(structuredClone(duplicate.definitions[0]));
    expect(codes(duplicate)).toContain('duplicate-id');
  });

  it('rejects nonfinite values and unit mismatches and reports division by zero', () => {
    const p = project();
    p.candidate.actors[0].inputs.attack.value = Infinity;
    expect(codes(p)).toContain('invalid-input');
    p.candidate.actors[0].inputs.attack.value = NaN;
    expect(codes(p)).toContain('invalid-input');
    const q = project();
    q.candidate.actors[0].inputs.attack.unit = 'scalar';
    expect(codes(q)).toContain('unit');
    const r = project();
    damageDefinition(r).nodes.push({ id: 'invalid-unit', op: 'multiply', left: 'attack', right: 'attack' });
    damageDefinition(r).damage = 'invalid-unit';
    expect(codes(r)).toContain('unit');
    const s = project();
    damageDefinition(s).nodes.push({ id: 'zero', op: 'constant', quantity: { value: 0, unit: 'scalar' } });
    damageDefinition(s).nodes.push({ id: 'zero-division', op: 'divide', left: 'base', right: 'zero' });
    damageDefinition(s).damage = 'zero-division';
    expect(codes(s)).toContain('arithmetic');
  });

  it.each(['snapshot', 'history', 'probability'] as const)('reports unsupported %s explicitly', capability => {
    const p = project();
    damageDefinition(p).nodes.push({ id: 'future', op: 'unsupported', capability });
    damageDefinition(p).damage = 'future';
    expect(codes(p)).toContain('unsupported');
    expect(evaluateWorkbench(p).objectiveValue).toBeNull();
  });
});
