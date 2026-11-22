import { describe, expect, it } from 'vitest';
import { projectSchema } from '../../../../src/schema/src/project/project';
const base = { schemaVersion: '0.2.0', rulesVersion: 'timeline-v1', calculationProfile: 'direct', id: 'contract', revision: '1', definitions: [], candidate: { id: 'candidate', actors: [] }, conditions: {}, timeline: [], objective: {} };
describe('Project effect contract', () => {
  it('validates effect revisions with or without the previous profile field', () => {
    expect(projectSchema.safeParse(base).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, effectRevisions: [] }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, calculationProfile: undefined, effectRevisions: [] }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, rulesVersion: 'timeline-v1', calculationProfile: 'dependency', effectRevisions: [] }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, rulesVersion: 'workbench-p4' }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, arbitraryScript: 'alert(1)' }).success).toBe(false);
  });
  it('accepts typed dependency nodes directly', () => {
    const definitions = [{ id: 'd', version: '1', source: { kind: 'user', reference: 'local', verified: false }, effects: [], nodes: [
      { id: 'attack', op: 'attribute', actor: 'a', key: 'attack', unit: 'attack', phase: 'before' },
      { id: 'captured', op: 'capture', at: 'cast', value: 'attack' },
      { id: 'sum', op: 'history', mode: 'sum', startMs: 1000, endMs: 6000, resetAt: ['settle'] },
    ] }];
    expect(projectSchema.safeParse({ ...base, definitions }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, rulesVersion: 'timeline-v1', calculationProfile: 'dependency', definitions }).success).toBe(true);
  });
});
