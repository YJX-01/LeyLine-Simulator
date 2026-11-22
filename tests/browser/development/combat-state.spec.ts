import { officialShowcase } from '../../helpers/recorded-reference';
import { catalogSnapshotFields } from '../../helpers/catalog-snapshot-fields';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { AxisResponse, Build, Project } from '@leyline/schema';
import { vesnaRecording } from '../../helpers/recorded-vesna';

test('timeline saves a pending hit and evaluates its selected character damage', async ({ page }) => {
  test.skip(!existsSync(vesnaRecording), 'Requires the original authorized showcase.');
  test.setTimeout(90000);
  await page.goto('/');
  const material = await page.evaluate(async raw => {
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { createEmptyProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { addActorFromBuild, defaultEnemy } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const preview = await previewEnkaImport(raw, String(raw.uid), createAccount());
    const builds: Build[] = preview.rows.map((row: { character: { showcase: { build: Build } } }) => row.character.showcase.build);
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    addActorFromBuild(project, builds.find(build => build.character.id === 'varesa'));
    const burst = builds.find(build => build.character.id === 'varesa')!.character.talents.find(talent => talent.category === 'burst')!;
    return { document: packDocument('axis', project), burst: burst.name, hitIndex: String(burst.hits.findIndex(hit => hit.id === 'varesa.burst.param5')) };
  }, JSON.parse(readFileSync(vesnaRecording, 'utf8')));
  await page.getByTestId('workspace-nav-timeline').click();
  await page.getByLabel('导入轴项目文件').setInputFiles({ name: 'showcase-calculation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(material.document)) });
  const editor = page.getByRole('region', { name: '剪辑式时间轴编辑' });
  const inspector = page.getByRole('complementary', { name: '所选记录详情' });
  await editor.getByRole('button', { name: '伤害层', exact: true }).click();
  await editor.getByRole('button', { name: material.burst, exact: true }).click();
  await editor.getByLabel('标注技能段数').selectOption(material.hitIndex);
  await editor.getByRole('button', { name: '在光标处记录伤害点' }).click();
  await inspector.getByLabel('所选真实命中暴击').selectOption('critical');
  await inspector.getByLabel('所选真实命中反应').selectOption('none');
  await expect(inspector.locator('.inspector-damage')).toContainText(/\d[\d,]*\.\d/);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-axis-recovery-0.2.0')!).document.project as Project);
  expect(saved.timeline).toHaveLength(1);
  expect(saved.timeline[0].damage).toMatchObject({ hit: { hitId: 'varesa.burst.param5' }, crit: 'critical', reaction: 'none' });
});

test('Cinnabar flat damage recalculates through actual Worker and file round-trip with an explicit application', async ({ page }) => {
  // Source-derived legal single-point calculation, not a player build or game observation.
  const build: Build = {
    ...await catalogSnapshotFields('jean', 'cinnabarspindle'),
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
      const automatic = await evaluate(project, 1);
      const instance = automatic.result.effectInstances!.find(instance => instance.content?.entity === 'cinnabarspindle')!;
      setDamageEffectApplication(project, hit, instance.id, null);
      const unknown = await evaluate(project, 2);
      setDamageEffectApplication(project, hit, instance.id, true);
      // @ts-expect-error Vite browser source URL.
      const { packDocument } = await import('/src/domain/content-document.ts');
      const reopened: Project = importProject(JSON.stringify(packDocument('axis', project)));
      const complete = await evaluate(reopened, 3);
      return { automatic, unknown, complete, reopened, original: project };
    } finally { worker.terminate(); }
  }, build);
  const attack = 18.62 * 8.739 + 76.4582 + 41.0671 * 7.275 + 155.6;
  const defense = (59.83 * 8.739 + 245.7) * (1 + 0.150133 * 4.594);
  expect(result.unknown.result.status).toBe('partial');
  expect(result.unknown.result.totalValue).toBeNull();
  expect(result.automatic.result.totalValue).toBeCloseTo((attack * 4.964 + defense * .4) * .45, 8);
  expect(result.complete.result.status).toBe('complete');
  expect(result.complete.result.points).toHaveLength(1);
  expect(result.complete.result.points[0].real?.baseDamageBonus).toBeCloseTo(defense * 0.4, 8);
  expect(result.complete.result.totalValue).toBeCloseTo((attack * 4.964 + defense * 0.4) * 0.45, 8);
  expect(result.reopened).toEqual(result.original);
});

test('R1 counter coverage survives files and Worker while a missing tier stays unknown', async ({ page }) => {
  // A legal C0 calculation query, not a player export or recorded combat sequence.
  const build: Build = {
    ...await catalogSnapshotFields('beidou', 'wastergreatsword'),
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
      damage: { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'beidou', revision: '5' }, hitId: 'beidou.skill.param3' }, crit: 'noncritical', reaction: 'none', facts: [{ subject: { kind: 'event' }, values: { counterCharge: { value: { kind: 'quantity', unit: 'count', value: 2 }, provenance: 'explicit', sourceRefs: [] } } }] } });
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const reopened: Project = importProject(JSON.stringify(packDocument('axis', project)));
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    const evaluate = (input: Project, taskId: number) => new Promise<AxisResponse>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Axis Worker timed out.')), 10000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage({ taskId, session: 1, revision: taskId, project: input });
    });
    try {
      const known = await evaluate(reopened, 1);
      const unknownProject: Project = importProject(JSON.stringify(packDocument('axis', reopened)));
      unknownProject.timeline[0].damage!.facts!.find(row => row.subject.kind === 'event')!.values.counterCharge.value = null;
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
  expect(result.unknown.result.diagnostics.some(issue => issue.code === 'unknown' && issue.message.includes('counterCharge'))).toBe(true);
  expect(result.unknown.result.points[0].real?.scaling[1].count?.value).toBeNull();
});

test('source-backed Kaeya burst capture survives file parsing and the actual Worker', async ({ page }) => {
  // An independent legal calculation setting from pinned source numbers, not a player export or observed combat.
  const build: Build = {
    ...await catalogSnapshotFields('kaeya', 'favoniussword'),
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
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const reopened: Project = importProject(JSON.stringify(packDocument('axis', project)));
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
  test.skip(!existsSync(officialShowcase), 'Requires the recorded official public showcase.');
  const raw = JSON.parse(readFileSync(officialShowcase, 'utf8'));
  await page.goto('/');
  const { weapon } = await catalogSnapshotFields('xingqiu', 'primordialjadecutter');
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
      damage: { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'xingqiu', revision: '3' }, hitId: 'xingqiu.skill.param1' }, crit: null, reaction: { type: 'vaporize', trigger: 'record-owner' } } });
    setCombatStateInterval(project, { id: 'worker-hp-annotation', actor, startMs: 0, endMs: 1000, values: { hpRatio: 1, shielded: false } });
    setDamageStateOverride(project, 'worker-state-query', actor, { hpRatio: null });
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const reopened: Project = importProject(JSON.stringify(packDocument('axis', project)));
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
  test.skip(!existsSync(officialShowcase), 'Requires the recorded official public showcase.');
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
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    return packDocument('axis', project);
  }, JSON.parse(readFileSync(officialShowcase, 'utf8')));
  // A format derivative. Added UI records are test edits, not an observed gameplay sequence.
  await page.getByTestId('workspace-nav-timeline').click();
  await page.getByLabel('导入轴项目文件', { exact: true }).setInputFiles({ name: 'recorded-showcase-format.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-axis-recovery-0.2.0')!).document.project as Project);
  expect(saved.timeline[0]).toMatchObject({ kind: 'action', skillId: 'xingqiu.skill' });
  expect(saved.timeline[1]).toMatchObject({ kind: 'damage', timeMs: 1234, damage: { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'xingqiu', revision: '3' }, hitId: 'xingqiu.skill.param2' }, crit: null, reaction: null } });
  // The new ordinary-attack binding is another explicit format edit, never an inferred combat sequence.
  await page.locator('.skill-palette').getByRole('button').filter({ hasText: '古华剑法' }).click();
  await page.getByLabel('标注技能段数', { exact: true }).selectOption('2');
  await time.clear();
  await time.pressSequentially('1235');
  await time.press('Tab');
  await page.getByRole('button', { name: '在光标处记录伤害点', exact: true }).click();
  await expect(page.locator('.desk-record')).toHaveCount(3);
  await expect(page.locator('.desk-record.damage')).toHaveCount(2);
  const withNormal = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-axis-recovery-0.2.0')!).document.project as Project);
  expect(withNormal.timeline[2]).toMatchObject({ kind: 'damage', timeMs: 1235,
    damage: { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'xingqiu', revision: '3' }, hitId: 'xingqiu.normal.param3' }, crit: null, reaction: null } });
});
