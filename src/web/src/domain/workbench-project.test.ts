import { describe, expect, it } from 'vitest';
import { evaluateWorkbench } from '@leyline/engine';
import { acceptanceCases, createWorkbenchProject, importWorkbenchProject, nextRecordId, removeTimelineRecord, removeProjectActor, setDamageSelected } from './workbench-project';

describe('workbench editing and project files', () => {
  it('removes a team member and dependent records and targets without dangling references', () => {
    const project = createWorkbenchProject();
    project.objective.damageIds = ['hit-2'];
    removeProjectActor(project, 'actor');
    expect(project.candidate.actors).toEqual([]);
    expect(project.timeline).toEqual([]);
    expect(project.objective.damageIds).toEqual([]);
    expect(evaluateWorkbench(project).totalValue).toBe(0);
    expect(evaluateWorkbench(project).diagnostics).toEqual([]);
  });
  it('preserves optional user names without changing stable identities or evaluation', () => {
    const project = createWorkbenchProject();
    project.definitions[0].name = '虚构旅人';
    project.candidate.actors[0].name = '本地角色';
    const reopened = importWorkbenchProject(JSON.stringify(project));
    expect(reopened.definitions[0].name).toBe('虚构旅人');
    expect(reopened.candidate.actors[0].id).toBe('actor');
    expect(evaluateWorkbench(reopened).totalValue).toBe(4400);
  });
  it('retains equipment identities in files and rejects duplicate real inventory occupancy', () => {
    const project = createWorkbenchProject();
    project.candidate.actors[0].accountSnapshot = { accountId: 'local-account', characterId: 'local-character', weapon: '本地武器',
      artifacts: [{ id: 'physical-flower', name: '实物花冠', slot: 'flower', attack: 100 }] };
    const reopened = importWorkbenchProject(JSON.stringify(project));
    expect(reopened.candidate.actors[0].accountSnapshot?.artifacts[0].id).toBe('physical-flower');
    project.candidate.actors.push({ ...structuredClone(project.candidate.actors[0]), id: 'another-actor' });
    expect(() => importWorkbenchProject(JSON.stringify(project))).toThrow('当前项目保持不变');
    expect(evaluateWorkbench(project).status).toBe('invalid');
  });
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
