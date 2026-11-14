import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { AxisResponse, Build, Project } from '@leyline/schema';

const source = '.references/enka/official-example-2026-11-13.json';

test('Cinnabar flat damage recalculates through actual Worker and file round-trip with an explicit application', async ({ page }) => {
  // Source-derived legal single-point calculation, not a player build or game observation.
  const build: Build = {
    dataVersion: 'genshin-db-8e5badd-content-v2',
    character: JSON.parse(readFileSync('src/game-data/data/characters/jean.json', 'utf8')),
    weapon: JSON.parse(readFileSync('src/game-data/data/weapons/cinnabarspindle.json', 'utf8')),
    artifactMain: JSON.parse(readFileSync('src/game-data/data/tables/artifact-main.json', 'utf8')),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1,
  };
  await page.goto('/');
  const result = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createEmptyProject, importProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { addActorFromBuild, addSkillHit, setDamageEffectApplication, defaultEnemy } = await import('/src/domain/real-project.ts');
    const project: Project = createEmptyProject();
    project.enemy = defaultEnemy();
    const actor = addActorFromBuild(project, build);
    const hit = addSkillHit(project, actor, 'jean.skill', 0, 0, { crit: 'noncritical', reaction: 'none' });
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    const evaluate = (input: Project, taskId: number) => new Promise<AxisResponse>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Axis Worker timed out.')), 10000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage({ taskId, session: 1, revision: taskId, project: input });
    });
    try {
      const unknown = await evaluate(project, 1);
      const instance = unknown.result.effectInstances!.find(instance => instance.content?.entity === 'cinnabarspindle')!;
      setDamageEffectApplication(project, hit, instance.id, true);
      const reopened: Project = importProject(JSON.stringify(project));
      const complete = await evaluate(reopened, 2);
      return { unknown, complete, reopened, original: project };
    } finally { worker.terminate(); }
  }, build);
  const attack = 18.62 * 8.739 + 76.4582 + 41.0671 * 7.275 + 155.6;
  const defense = (59.83 * 8.739 + 245.7) * (1 + 0.150133 * 4.594);
  expect(result.unknown.result.status).toBe('partial');
  expect(result.unknown.result.totalValue).toBeNull();
  expect(result.complete.result.status).toBe('complete');
  expect(result.complete.result.points).toHaveLength(1);
  expect(result.complete.result.points[0].real?.baseDamageBonus).toBeCloseTo(defense * 0.4, 8);
  expect(result.complete.result.totalValue).toBeCloseTo((attack * 4.964 + defense * 0.4) * 0.45, 8);
  expect(result.reopened).toEqual(result.original);
});

test('R1 counter coverage survives files and Worker while a missing tier stays unknown', async ({ page }) => {
  // A legal C0 calculation query, not a player export or recorded combat sequence.
  const build: Build = {
    dataVersion: 'genshin-db-8e5badd-content-v2',
    character: JSON.parse(readFileSync('src/game-data/data/characters/beidou.json', 'utf8')),
    weapon: JSON.parse(readFileSync('src/game-data/data/weapons/wastergreatsword.json', 'utf8')),
    artifactMain: JSON.parse(readFileSync('src/game-data/data/tables/artifact-main.json', 'utf8')),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 9, burst: 9 },
    weaponLevel: 70, weaponAscension: 4, refinement: 1,
  };
  await page.goto('/');
  const result = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createEmptyProject, importProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { addActorFromBuild } = await import('/src/domain/real-project.ts');
    const project: Project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.enemy = { level: 90, resistances: { physical: 0.1, anemo: 0.1, geo: 0.1, electro: 0.1, hydro: 0.1, pyro: 0.1, cryo: 0.1, dendro: 0.1 }, defenseReduction: 0, defenseIgnore: 0 };
    project.timeline.push({ id: 'counter-input-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { skillId: 'beidou.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none', inputs: { counterCharge: 2 } } });
    const reopened: Project = importProject(JSON.stringify(project));
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    const evaluate = (input: Project, taskId: number) => new Promise<AxisResponse>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Axis Worker timed out.')), 10000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage({ taskId, session: 1, revision: taskId, project: input });
    });
    try {
      const known = await evaluate(reopened, 1);
      const unknownProject = importProject(JSON.stringify(reopened));
      unknownProject.timeline[0].damage!.inputs!.counterCharge = null;
      const unknown = await evaluate(unknownProject, 2);
      return { known, unknown, reopened, original: project };
    } finally { worker.terminate(); }
  }, build);
  expect(result.reopened).toEqual(result.original);
  expect(result.known.result.points).toHaveLength(1);
  expect(result.known.result.points[0].real?.scaling[1].count).toEqual({ input: 'counterCharge', value: 2 });
  expect(result.known.result.status).toBe('complete');
  const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
  expect(result.known.result.totalValue).toBeCloseTo(attack * 7.5072 * 1.24 * 0.45, 8);
  expect(result.known.result.diagnostics.some(issue => issue.message.includes('技能输入尚未确认'))).toBe(false);
  expect(result.unknown.result.diagnostics.some(issue => issue.message.includes('技能输入尚未确认：counterCharge'))).toBe(true);
  expect(result.unknown.result.points[0].real?.scaling[1].count?.value).toBeNull();
});

test('source-backed Kaeya burst capture survives file parsing and the actual Worker', async ({ page }) => {
  // An independent legal calculation setting from pinned source numbers, not a player export or observed combat.
  const build: Build = {
    dataVersion: 'genshin-db-8e5badd-content-v2',
    character: JSON.parse(readFileSync('src/game-data/data/characters/kaeya.json', 'utf8')),
    weapon: JSON.parse(readFileSync('src/game-data/data/weapons/favoniussword.json', 'utf8')),
    artifactMain: JSON.parse(readFileSync('src/game-data/data/tables/artifact-main.json', 'utf8')),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1,
  };
  await page.goto('/');
  const result = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createEmptyProject, importProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { addActorFromBuild, addSkillAction, addSkillHit } = await import('/src/domain/real-project.ts');
    const project: Project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.enemy = { level: 90, resistances: { physical: 0.1, anemo: 0.1, geo: 0.1, electro: 0.1, hydro: 0.1, pyro: 0.1, cryo: 0.1, dendro: 0.1 }, defenseReduction: 0, defenseIgnore: 0 };
    const source = addSkillAction(project, actor, 'kaeya.burst', 0);
    addSkillHit(project, actor, 'kaeya.burst', 0, 1000, { crit: 'noncritical', reaction: 'none', capture: { recordId: source, phase: 'before' } });
    const reopened: Project = importProject(JSON.stringify(project));
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    try {
      const reply = await new Promise<AxisResponse>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Axis Worker timed out.')), 10000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage({ taskId: 1, session: 1, revision: 1, project: reopened });
      });
      return { reply, source, reopened, original: project };
    } finally { worker.terminate(); }
  }, build);
  const attack = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6;
  expect(result.reply.result.status).toBe('complete');
  expect(result.reply.result.totalValue).toBeCloseTo(attack * 1.3192 * 0.5 * 0.9, 7);
  expect(result.reply.result.points).toHaveLength(1);
  expect(result.reply.result.points[0].real?.capture).toMatchObject({ recordId: result.source, phase: 'before' });
  expect(result.reopened).toEqual(result.original);
});

test('recorded showcase state annotations survive file parsing and the actual axis Worker', async ({ page }) => {
  test.skip(!existsSync(source), 'Requires the newly recorded official public showcase; no substitute.');
  const raw = JSON.parse(readFileSync(source, 'utf8'));
  await page.goto('/');
  const weapon = JSON.parse(readFileSync('src/game-data/data/weapons/primordialjadecutter.json', 'utf8'));
  const result = await page.evaluate(async ({ response, weapon }) => {
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
    // Explicit theoretical weapon swap; retain the observed C6 and original artifacts.
    build.weapon = weapon;
    const project: Project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    // One explicit format query, not a claim that the showcase includes observed combat.
    project.timeline.push({ id: 'worker-state-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { skillId: 'xingqiu.skill', hitIndex: 0, crit: null, reaction: { type: 'vaporize', trigger: 'record-owner' } } });
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
  }, { response: raw, weapon });
  expect(result.reopened).toEqual(result.original);
  expect(result.accountUntouched).toBe(true);
  expect(result.reply.result.status).toBe('partial');
  expect(result.reply.result.points[0].value).toBeNull();
  expect(result.reply.result.points).toHaveLength(1);
  expect(result.reply.result.points[0].real?.reaction).toMatchObject({ type: 'vaporize', family: 'amplifying', rulesRevision: '1' });
  expect(result.reply.result.effectInstances?.some(instance => instance.content?.entity === 'primordialjadecutter')).toBe(true);
  expect(result.reply.result.reads?.some(read => read.key === 'hp' && read.unit === 'hp')).toBe(true);
  expect(result.reply.result.stateReads).toContainEqual({ actor: result.actor, field: 'hpRatio', timeMs: 0,
    recordId: 'worker-state-query', value: null, source: 'override', intervalId: 'worker-hp-annotation' });
});

test('recorded Xingqiu format project keeps actions and individually selected hits separate', async ({ page }) => {
  test.skip(!existsSync(source), 'Requires the newly recorded official showcase; no substitute.');
  await page.goto('/');
  const project = await page.evaluate(async response => {
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { createEmptyProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { addActorFromBuild } = await import('/src/domain/real-project.ts');
    const preview = await previewEnkaImport(response, '618285856', createAccount());
    const row = preview.rows.find((row: { character: { showcase: { build: { character: { id: string } } } } }) => row.character.showcase.build.character.id === 'xingqiu');
    const project = createEmptyProject();
    addActorFromBuild(project, row.character.showcase.build);
    return project;
  }, JSON.parse(readFileSync(source, 'utf8')));
  // A format derivative. Added UI records are test edits, not an observed gameplay sequence.
  await page.getByTestId('workspace-nav-projects').click();
  await page.getByLabel('导入轴项目文件', { exact: true }).setInputFiles({ name: 'recorded-showcase-format.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.getByTestId('workspace-nav-timeline').click();
  await page.locator('.skill-palette').getByRole('button').filter({ hasText: '古华剑·画雨笼山' }).click();
  await page.getByRole('button', { name: '在光标处记录动作', exact: true }).click();
  await expect(page.locator('.desk-record')).toHaveCount(1);
  await expect(page.locator('.desk-record.damage')).toHaveCount(0);
  await page.getByRole('button', { name: '伤害层', exact: true }).click();
  await page.getByLabel('标注技能段数', { exact: true }).selectOption('1');
  const time = page.getByLabel('标注光标时间', { exact: true });
  await time.clear();
  await time.pressSequentially('1234');
  await time.press('Tab');
  await expect(time).toHaveValue('1234');
  await page.getByRole('button', { name: '在光标处记录伤害点', exact: true }).click();
  await expect(page.locator('.desk-record')).toHaveCount(2);
  await expect(page.locator('.desk-record.damage')).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-axis-recovery-v2')!).project as Project);
  expect(saved.timeline[0]).toMatchObject({ kind: 'action', skillId: 'xingqiu.skill' });
  expect(saved.timeline[1]).toMatchObject({ kind: 'damage', timeMs: 1234, damage: { skillId: 'xingqiu.skill', hitIndex: 1, crit: null, reaction: null } });
  // The new ordinary-attack binding is another explicit format edit, never an inferred combat sequence.
  await page.locator('.skill-palette').getByRole('button').filter({ hasText: '古华剑法' }).click();
  await page.getByLabel('标注技能段数', { exact: true }).selectOption('2');
  await time.clear();
  await time.pressSequentially('1235');
  await time.press('Tab');
  await page.getByRole('button', { name: '在光标处记录伤害点', exact: true }).click();
  await expect(page.locator('.desk-record')).toHaveCount(3);
  await expect(page.locator('.desk-record.damage')).toHaveCount(2);
  const withNormal = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-axis-recovery-v2')!).project as Project);
  expect(withNormal.timeline[2]).toMatchObject({ kind: 'damage', timeMs: 1235,
    damage: { skillId: 'xingqiu.normal', hitIndex: 2, crit: null, reaction: null } });
});
