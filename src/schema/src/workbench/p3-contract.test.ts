import { describe, expect, it } from 'vitest';
import { workbenchProjectSchema } from './index';
const base = { schemaVersion: 1, rulesVersion: 'workbench-v1', id: 'contract', revision: '1', definitions: [], candidate: { id: 'candidate', actors: [] }, conditions: {}, timeline: [], objective: {} };
describe('P3 version contract', () => {
  it('keeps strict v1 and requires explicit P3 selection', () => {
    expect(workbenchProjectSchema.safeParse(base).success).toBe(true);
    expect(workbenchProjectSchema.safeParse({ ...base, effectRevisions: [] }).success).toBe(false);
    expect(workbenchProjectSchema.safeParse({ ...base, rulesVersion: 'workbench-p3', effectRevisions: [] }).success).toBe(true);
    expect(workbenchProjectSchema.safeParse({ ...base, rulesVersion: 'workbench-p4' }).success).toBe(false);
    expect(workbenchProjectSchema.safeParse({ ...base, arbitraryScript: 'alert(1)' }).success).toBe(false);
  });
  it('accepts bounded, typed P3 nodes only under new rules', () => {
    const definitions = [{ id: 'd', version: '1', source: { kind: 'user', reference: 'local', verified: false }, effects: [], nodes: [
      { id: 'attack', op: 'attribute', actor: 'a', key: 'attack', unit: 'attack', phase: 'before' },
      { id: 'captured', op: 'capture', at: 'cast', value: 'attack' },
      { id: 'sum', op: 'history', mode: 'sum', startMs: 1000, endMs: 6000, resetAt: ['settle'] },
    ] }];
    expect(workbenchProjectSchema.safeParse({ ...base, definitions }).success).toBe(false);
    expect(workbenchProjectSchema.safeParse({ ...base, rulesVersion: 'workbench-p3', definitions }).success).toBe(true);
  });
});
