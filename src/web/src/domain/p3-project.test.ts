import { describe, expect, it } from 'vitest';
import { workbenchProjectSchema } from '@leyline/schema';
import { reviseEffect } from '../../../../tests/helpers/p3-compatibility';
import snapshot from '../../../../fixtures/workbench/p3-snapshot.json';

describe('source revision editing', () => {
  it('preserves a manual quantity through disabling and restoring its exact source', () => {
    const project = workbenchProjectSchema.parse(snapshot);
    reviseEffect(project, 'source-a', false, { value: 240, unit: 'attack' });
    reviseEffect(project, 'source-a', true);
    expect(project.effectRevisions).toEqual([{ instanceId: 'source-a', disabled: true, value: { value: 240, unit: 'attack' } }]);
    reviseEffect(project, 'source-a', false);
    expect(project.effectRevisions).toEqual([{ instanceId: 'source-a', disabled: false, value: { value: 240, unit: 'attack' } }]);
    reviseEffect(project, 'source-b', false);
    expect(project.effectRevisions?.[1]).toEqual({ instanceId: 'source-b', disabled: false });
  });
});
