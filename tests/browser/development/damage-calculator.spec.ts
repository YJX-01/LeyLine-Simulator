import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { AxisResponse, Build, DamageCalculatorDocument } from '@leyline/schema';

// Source-based legal single-point calculations, separate from player records/game observations.
test('calculator uses formal Beidou damage, isolated candidates and saved-file Worker recomputation', async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(8000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByRole('button', { name: '选择游戏角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('北斗');
  await calculator.getByRole('button', { name: '北斗', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('训练大剑');
  await weapons.getByRole('button', { name: '训练大剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('spinbutton', { name: '战技', exact: true }).clear();
  await calculator.getByRole('spinbutton', { name: '战技', exact: true }).pressSequentially('9');
  // Skill selection and calculation prepare the edited build directly; Apply is optional.
  await calculator.getByRole('combobox', { name: '技能', exact: true }).selectOption('beidou.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveText('待确认');
  await expect(calculator.getByRole('list', { name: '未完成的计算条件' })).toContainText('counterCharge');
  await calculator.getByRole('combobox', { name: '反击档位', exact: true }).selectOption('2');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
  const expected = attack * 7.5072 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await expect(calculator.getByRole('combobox', { name: '反击档位', exact: true })).toBeDisabled();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('佣兵重剑');
  await weapons.getByRole('button', { name: '佣兵重剑', exact: true }).click();
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  const expectedAfter = (18.87648 * 8.349 + 67.54129 + 32.93 * 5.968 + 46.7) * 7.5072 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-delta').textContent())?.replaceAll(',', ''))).toBeCloseTo(expectedAfter - expected, 5);
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '保存计算', exact: true }).click();
  const download = await downloadPromise;
  const content = readFileSync((await download.path())!, 'utf8');
  const savedDocument: DamageCalculatorDocument = JSON.parse(content);
  expect(savedDocument.project.candidate.actors[0].build!.weapon.id).toBe('oldmercspal');
  expect(savedDocument.baseline!.candidate.actors[0].build!.weapon.id).toBe('wastergreatsword');
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '伤害计算.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expectedAfter, 5);
  await expect(calculator.getByText('已保存', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/r1-calculator-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'artifacts/r1-calculator-mobile.png', fullPage: true });
  expect(await page.evaluate(() => {
    const root = document.querySelector('.damage-calculator')!;
    return Array.from(root.querySelectorAll('p,th,td,label,select,summary')).filter(node => node.getClientRects().length).every(node => parseFloat(getComputedStyle(node).fontSize) >= 14);
  })).toBe(true);
  expect(errors).toEqual([]);
});

test('calculator creates a named independent Kaeya capture, saves it and recomputes the candidate in the Worker', async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(8000);
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByRole('button', { name: '选择游戏角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('凯亚');
  await calculator.getByRole('button', { name: '凯亚', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('button', { name: '1命', exact: true }).click();
  const talent = calculator.getByRole('spinbutton', { name: '爆发', exact: true });
  await talent.clear(); await talent.pressSequentially('9');
  await calculator.getByRole('combobox', { name: '技能', exact: true }).selectOption('kaeya.burst');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByLabel('命中时刻（秒）', { exact: true }).fill('1');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveText('待确认');
  await calculator.getByLabel('独立捕获时刻（秒）', { exact: true }).fill('0.2');
  await calculator.getByRole('button', { name: '添加属性捕获点', exact: true }).click();
  await expect(calculator.getByRole('combobox', { name: '属性捕获来源', exact: true }).locator('option').last()).toContainText('凯亚 · 凛冽轮舞 · 属性捕获 · 0.2秒');
  await calculator.getByRole('combobox', { name: '捕获时点', exact: true }).selectOption('before');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 1.3192 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('银剑');
  await weapons.getByRole('button', { name: '银剑', exact: true }).click();
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  const changed = (18.6984 * 8.349 + 66.90411 + 32.93 * 5.968 + 46.7) * 1.3192 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-delta').textContent())?.replaceAll(',', ''))).toBeCloseTo(changed - expected, 5);
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '保存计算', exact: true }).click();
  const saved = JSON.parse(readFileSync((await (await downloadPromise).path())!, 'utf8')) as DamageCalculatorDocument;
  expect(saved.project.timeline.filter(record => record.kind === 'action')).toHaveLength(0);
  expect(saved.project.timeline.filter(record => record.kind === 'capture')).toHaveLength(1);
  expect(saved.project.timeline.filter(record => record.kind === 'damage')).toHaveLength(1);
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '独立捕获计算.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(changed, 5);
  await page.screenshot({ path: 'artifacts/r2-calculator-capture.png', fullPage: true });
});

test('Kaeya C3 sequential talent editing, dirty navigation and formal Worker result remain consistent', async ({ page }) => {
  test.setTimeout(45000);
  page.setDefaultTimeout(8000);
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByRole('button', { name: '选择游戏角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('凯亚');
  await calculator.getByRole('button', { name: '凯亚', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('button', { name: '3命', exact: true }).click();
  const talent = calculator.getByRole('spinbutton', { name: '战技', exact: true });
  await talent.clear(); await talent.pressSequentially('12');
  await expect(talent).toHaveValue('12');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('dialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(talent).toHaveValue('12');
  await calculator.getByRole('button', { name: '应用配装', exact: true }).click();
  await calculator.getByRole('combobox', { name: '技能', exact: true }).selectOption('kaeya.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 3.824 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByLabel('生命比例（%）', { exact: true }).click();
  await expect(calculator.getByLabel('生命比例（%）', { exact: true })).toBeFocused();
  await page.keyboard.type('90');
  await expect(calculator.getByTestId('calculator-value')).toHaveCount(0); // Never leave a stale previous result visible.
});

test('actual comparison Worker recomputes Kaeya C3 after current document serialization', async ({ page }) => {
  const build: Build = {
    dataVersion: 'genshin-db-8e5badd-content-v2', character: JSON.parse(readFileSync('src/game-data/data/characters/kaeya.json', 'utf8')),
    weapon: JSON.parse(readFileSync('src/game-data/data/weapons/dullblade.json', 'utf8')), artifactMain: JSON.parse(readFileSync('src/game-data/data/tables/artifact-main.json', 'utf8')),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 3, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1,
  };
  await page.goto('/');
  const output = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation, calculatorRequest, parseDamageCalculator } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    const document = createDamageCalculation(build, { skillId: 'kaeya.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none' }, defaultEnemy());
    document.baseline = JSON.parse(JSON.stringify(document.project));
    const candidate = document.project.candidate.actors[0].build;
    candidate.talents.skill = 8;
    const reopened = parseDamageCalculator(JSON.stringify(document));
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    try {
      return await new Promise<AxisResponse>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Comparison Worker timeout')), 10000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage(calculatorRequest(reopened, 1));
      });
    } finally { worker.terminate(); }
  }, build);
  expect(output.comparison?.baseline.status).toBe('complete');
  expect(output.comparison?.candidates[0].result.status).toBe('complete');
  const attack = 18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7;
  expect(output.comparison!.baseline.totalValue).toBeCloseTo(attack * 3.824 * 0.45, 8);
  expect(output.comparison!.candidates[0].result.totalValue).toBeCloseTo(attack * 3.6328 * 0.45, 8);
});

test('calculator reads the recorded public showcase explicitly without writing local equipment or the original axis', async ({ page }) => {
  const source = '.references/enka/official-example-2026-11-13.json';
  test.skip(!existsSync(source), 'Requires the authorized original public showcase response; no substitute.');
  page.setDefaultTimeout(8000);
  await page.goto('/');
  const before = await page.evaluate(async raw => {
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport, confirmEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAxisWorkspaceStore } = await import('/src/stores/axis-workspace.ts');
    const next = createAccount();
    const preview = await previewEnkaImport(raw, '618285856', next);
    const selected = preview.rows.find((row: { character: { showcase: { build: Build } } }) => row.character.showcase.build.character.id === 'xingqiu');
    confirmEnkaImport(next, preview, [selected.character.id], false);
    const store = useAccountStore();
    store.importContent(JSON.stringify(next));
    return { account: JSON.stringify(store.account), axis: JSON.stringify(useAxisWorkspaceStore().project), build: selected.character.showcase.build as Build };
  }, JSON.parse(readFileSync(source, 'utf8')));
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByLabel('资料来源', { exact: true }).selectOption({ label: '展柜 · 行秋' });
  await calculator.getByRole('button', { name: '读取配装', exact: true }).click();
  await calculator.getByRole('combobox', { name: '技能', exact: true }).selectOption('xingqiu.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveText('待确认');
  await expect(calculator.getByRole('list', { name: '未完成的计算条件' })).toContainText('命座');
  const after = await page.evaluate(async () => {
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAxisWorkspaceStore } = await import('/src/stores/axis-workspace.ts');
    return { account: JSON.stringify(useAccountStore().account), axis: JSON.stringify(useAxisWorkspaceStore().project) };
  });
  expect(after.account).toBe(before.account);
  expect(after.axis).toBe(before.axis);
  expect(before.build.constellation).toBe(6);
  expect(before.build.artifacts).toHaveLength(5);
});

test('missing-build derivative of the original account stays selectable and carries real wearing into the calculator copy', async ({ page }) => {
  const source = '.references/enka/official-example-2026-11-13.json';
  test.skip(!existsSync(source), 'Requires the original public showcase; no substitute.');
  test.setTimeout(45000);
  await page.goto('/');
  const before = await page.evaluate(async raw => {
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport, confirmEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    const next = createAccount();
    const preview = await previewEnkaImport(raw, '618285856', next);
    const row = preview.rows.find((row: { character: { showcase: { build: Build } } }) => row.character.showcase.build.character.id === 'xingqiu');
    confirmEnkaImport(next, preview, [row.character.id], true);
    // Missing-field format derivative, never a claim about the recorded player's missing cultivation.
    delete next.characters[0].build;
    useAccountStore().importContent(JSON.stringify(next));
    return { account: JSON.stringify(useAccountStore().account), equipment: next.characters[0].equipment };
  }, JSON.parse(readFileSync(source, 'utf8')));
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByLabel('资料来源', { exact: true }).selectOption({ label: '本地 · 行秋（待补全培养与武器）' });
  await calculator.getByRole('button', { name: '读取配装', exact: true }).click();
  await expect(calculator.getByRole('button', { name: '更换武器', exact: true })).toBeVisible();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('combobox', { name: '技能', exact: true }).selectOption('xingqiu.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '保存计算', exact: true }).click();
  const saved: DamageCalculatorDocument = JSON.parse(readFileSync((await (await downloadPromise).path())!, 'utf8'));
  const copied = saved.project.candidate.actors[0].build!;
  expect(copied.artifacts.map(item => item.id)).toEqual(Object.values(before.equipment));
  expect(copied.artifacts).toHaveLength(5);
  expect(copied.weapon.id).toBe('dullblade');
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-v2'))).toBe(before.account);
});

test('old saved content changes only after review and explicit adoption in the calculator copy', async ({ page }) => {
  const build: Build = {
    dataVersion: 'genshin-db-8e5badd-content-v2', character: JSON.parse(readFileSync('src/game-data/data/characters/kaeya.json', 'utf8')),
    weapon: JSON.parse(readFileSync('src/game-data/data/weapons/dullblade.json', 'utf8')), artifactMain: JSON.parse(readFileSync('src/game-data/data/tables/artifact-main.json', 'utf8')),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 3, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1,
  };
  // Explicit pre-R1 revision4 missing-proof derivative; not a player file.
  build.character.revision = '4'; delete build.character.damageCoverage;
  await page.goto('/');
  const content = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    return JSON.stringify(createDamageCalculation(build, { skillId: 'kaeya.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none' }, defaultEnemy()));
  }, build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '内容快照.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(calculator.getByTestId('calculator-value')).toHaveText('待确认');
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  const review = page.getByRole('dialog', { name: '更新计算副本内容', exact: true });
  await expect(review).toContainText('角色定义（4 → 6）');
  await review.getByRole('button', { name: '关闭更新计算副本内容', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveText('待确认');
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  await review.getByRole('button', { name: '采用当前内容并重算', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 3.824 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
});

for (const entry of [
  { id: 'noelle', name: '诺艾尔', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 3, hitIndex: 0,
    expected: (66.95325 * 8.349 + 239.5575) * 1.3 * 2.4 * 0.45, delta: 0 },
  { id: 'xinyan', name: '辛焱', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 3, hitIndex: 0,
    expected: (20.83536 * 8.349 + 74.55029 + 23.245 * 5.968 + 46.7) * 1.24 * 3.392 * 0.45, delta: (32.93 - 23.245) * 5.968 * 1.24 * 3.392 * 0.45 },
  { id: 'razor', name: '雷泽', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 0, hitIndex: 1,
    expected: (19.5888 * 8.349 + 70.09002 + 23.245 * 5.968 + 46.7) * 5.0184 * 0.45, delta: (32.93 - 23.245) * 5.968 * 5.0184 * 0.45 },
  { id: 'barbara', name: '芭芭拉', weapon: '学徒笔记', candidate: '口袋魔导书', skill: 'normal', constellation: 1, hitIndex: 4,
    expected: (13.356 * 8.349 + 47.78865 + 23.245 * 5.968 + 46.7) * 2.82608 * 0.45, delta: (32.93 - 23.245) * 5.968 * 2.82608 * 0.45 },
]) test(`${entry.name}: selectable calculator query, actual Worker, candidate and saved file`, async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算器', exact: true });
  await calculator.getByRole('button', { name: '选择游戏角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially(entry.name);
  await calculator.getByRole('button', { name: entry.name, exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially(entry.weapon);
  await weapons.getByRole('button', { name: entry.weapon, exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('button', { name: `${entry.constellation}命`, exact: true }).click();
  const talent = calculator.getByRole('spinbutton', { name: entry.skill === 'normal' ? '普攻' : '战技', exact: true });
  await talent.clear(); await talent.pressSequentially(entry.constellation === 3 ? '12' : '9');
  // Mid-width panels must keep both stepper buttons visible and the whole value editable.
  expect(await talent.evaluate(input => {
    const stepper = input.closest('.number-stepper')!;
    const bounds = stepper.getBoundingClientRect();
    return Array.from(stepper.querySelectorAll('button,input')).every(node => { const box = node.getBoundingClientRect(); return box.left >= bounds.left && box.right <= bounds.right + 1; });
  })).toBe(true);
  await calculator.getByRole('combobox', { name: '技能', exact: true }).selectOption(`${entry.id}.${entry.skill}`);
  await calculator.getByRole('combobox', { name: '命中类型', exact: true }).selectOption(String(entry.hitIndex));
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.expected, 5);
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially(entry.candidate);
  await weapons.getByRole('button', { name: entry.candidate, exact: true }).click();
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-delta').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.delta, 5);
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '保存计算', exact: true }).click();
  const content = readFileSync((await (await downloadPromise).path())!, 'utf8');
  const saved = JSON.parse(content) as DamageCalculatorDocument;
  expect(saved.project.timeline).toHaveLength(1);
  expect(saved.project.candidate.actors[0].build!.character.capabilities.calculation.supported).toBe(false);
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: `${entry.name}单次计算.json`, mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.expected + entry.delta, 5);
  if (entry.id === 'barbara') {
    await page.screenshot({ path: 'artifacts/r3-calculator-medium.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: 'artifacts/r3-calculator-mobile.png', fullPage: true });
  }
});
