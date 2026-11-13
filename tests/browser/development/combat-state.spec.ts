import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { AxisResponse, Project } from '@leyline/schema';

const source = '.references/enka/official-example-2026-11-13.json';

test('recorded showcase state annotations survive file parsing and the actual axis Worker', async ({ page }) => {
  test.skip(!existsSync(source), 'Requires the newly recorded official public showcase; no substitute.');
  const raw = JSON.parse(readFileSync(source, 'utf8'));
  await page.goto('/');
  const result = await page.evaluate(async response => {
    // @ts-expect-error Vite resolves browser-only source URLs.
    const { previewEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite resolves browser-only source URLs.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite resolves browser-only source URLs.
    const { createEmptyProject, importProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite resolves browser-only source URLs.
    const { addActorFromBuild } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite resolves browser-only source URLs.
    const { setCombatStateInterval, setDamageStateOverride } = await import('/src/domain/combat-state.ts');
    const account = createAccount();
    const before = JSON.stringify(account);
    const preview = await previewEnkaImport(response, '618285856', account);
    const build = preview.rows.find((row: { character: { showcase: { build: { character: { id: string } } } } }) => row.character.showcase.build.character.id === 'xingqiu').character.showcase.build;
    const project: Project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    // One explicit format query, not a claim that the showcase includes observed combat.
    project.timeline.push({ id: 'worker-state-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { skillId: 'xingqiu.skill', hitIndex: 0, crit: null, reaction: null } });
    setCombatStateInterval(project, { id: 'worker-hp-annotation', actor, startMs: 0, endMs: 1000, values: { hpRatio: 1, shielded: false } });
    setDamageStateOverride(project, 'worker-state-query', actor, { hpRatio: null });
    const reopened: Project = importProject(JSON.stringify(project));
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    try {
      const reply = await new Promise<AxisResponse>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Axis Worker timed out.')), 10000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage({ taskId: 1, session: 1, revision: 1, project: reopened });
      });
      return { reply, actor, original: project, reopened, accountUntouched: before === JSON.stringify(account) };
    } finally { worker.terminate(); }
  }, raw);
  expect(result.reopened).toEqual(result.original);
  expect(result.accountUntouched).toBe(true);
  expect(result.reply.result.status).toBe('partial');
  expect(result.reply.result.points[0].value).toBeNull();
  expect(result.reply.result.stateReads).toContainEqual({ actor: result.actor, field: 'hpRatio', timeMs: 0,
    recordId: 'worker-state-query', value: null, source: 'override', intervalId: 'worker-hp-annotation' });
});
