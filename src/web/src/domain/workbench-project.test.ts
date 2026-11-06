import { describe, expect, it } from 'vitest';
import { evaluateWorkbench } from '@leyline/engine';
import { acceptanceCases, createWorkbenchProject, importWorkbenchProject, nextRecordId, removeTimelineRecord, setDamageSelected } from './workbench-project';

describe('workbench editing and project files', () => {
  it('loads independently specified acceptance cases without shared mutable state', () => {
    for (const entry of acceptanceCases) expect(evaluateWorkbench(createWorkbenchProject(entry.id)).objectiveValue).toBe(entry.expected);
    const changed = createWorkbenchProject();
    changed.candidate.actors[0].inputs.attack.value = 1100;
    expect(evaluateWorkbench(createWorkbenchProject()).objectiveValue).toBe(4400);
  });

  it('keeps records when changing target and removes target references with deleted records', () => {
    const project = createWorkbenchProject();
    setDamageSelected(project, 'hit-2', false);
    expect(project.timeline).toHaveLength(2);
    expect(evaluateWorkbench(project).objectiveValue).toBe(2000);
    setDamageSelected(project, 'hit-6', false);
    expect(evaluateWorkbench(project).objectiveValue).toBe(0);
    setDamageSelected(project, 'hit-2', true);
    removeTimelineRecord(project, 'hit-2');
    expect(project.objective.damageIds).toEqual([]);
    expect(evaluateWorkbench(project).diagnostics).toEqual([]);
  });

  it('does not reuse an existing record id after deletion and insertion', () => {
    const project = createWorkbenchProject();
    project.timeline.push({ id: 'record-3', kind: 'damage', actor: 'actor', definition: 'ordinary-hit', timeMs: 0, order: 2 });
    removeTimelineRecord(project, 'hit-2');
    expect(nextRecordId(project)).toBe('record-4');
  });

  it('reopens full snapshots and preserves unknown conditions', () => {
    const project = createWorkbenchProject();
    project.definitions[1].effects[0].condition = 'triggered';
    project.conditions.triggered = null;
    const restored = importWorkbenchProject(JSON.stringify(project));
    expect(restored).toEqual(project);
    expect(evaluateWorkbench(restored).status).toBe('partial');
    expect(evaluateWorkbench(restored).totalValue).toBeNull();
  });

  it('rejects malformed or broken project files before callers replace their current project', () => {
    expect(() => importWorkbenchProject('{')).toThrow('当前项目保持不变');
    expect(() => importWorkbenchProject('{"schemaVersion":99}')).toThrow('当前项目保持不变');
    const project = createWorkbenchProject();
    project.timeline[0].definition = 'missing';
    expect(() => importWorkbenchProject(JSON.stringify(project))).toThrow('当前项目保持不变');
  });
});
