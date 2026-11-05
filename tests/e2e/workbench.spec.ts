import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../fixtures/scenarios/first-team.json';

test('edits equipment through forms and restores the draft after reload', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '配队与装备', exact: true })).toBeVisible();
  await page.getByLabel('命座', { exact: true }).fill('2');
  await page.getByLabel('武器精炼', { exact: true }).fill('3');
  await expect(page.getByLabel('配装预览')).toContainText('初始面板');
  await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png'), fullPage: true });
  await page.waitForFunction(() => localStorage.getItem('leyline.draft.v1')?.includes('"refinement":3'));
  await page.reload();
  await expect(page.getByLabel('命座', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('武器精炼', { exact: true })).toHaveValue('3');
  await expect(page.getByRole('status')).toContainText('已恢复');
  await page.getByRole('button', { name: '移除当前角色' }).click();
  await expect(page.getByRole('button', { name: '编辑行秋' })).toHaveCount(0);
  await page.getByRole('button', { name: '添加角色', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑行秋' })).toHaveCount(1);
});

test('keeps forms usable on a narrow viewport and explains summary output', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '配队与装备', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('workbench-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '动作循环', exact: true }).click();
  await page.getByRole('combobox', { name: '日志模式', exact: true }).selectOption('summary');
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByText(/摘要模式未记录逐事件数据/)).toBeVisible();
  await expect(page.getByRole('img', { name: '累计伤害曲线', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('recovers from invalid equipment and worker loading failures', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('元素战技天赋', { exact: true }).fill('11');
  await expect(page.getByRole('button', { name: '运行模拟', exact: true })).toBeDisabled();
  await page.getByLabel('元素战技天赋', { exact: true }).fill('8');
  await page.route('**/*attack.worker*', route => route.abort());
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('计算进程异常，请重新运行。');
  await page.unroute('**/*attack.worker*');
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总伤害：/ })).toBeVisible();
});

test('does not overwrite corrupt storage and still permits JSON export', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('leyline.plans.v1', '{broken'); localStorage.setItem('leyline.draft.v1', '{broken'); });
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: '草稿无法读取' })).toBeVisible();
  await page.getByRole('button', { name: '方案管理', exact: true }).click();
  await page.getByRole('button', { name: '保存为新方案', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本地存储不可用');
  expect(await page.evaluate(() => localStorage.getItem('leyline.plans.v1'))).toBe('{broken');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出方案 JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('leyline-team.json');
});

test('compares independent runs and round trips a saved configuration through JSON', async ({ page }, testInfo) => {
  await page.goto('/#workbench');
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await page.getByRole('button', { name: '设为对比 A', exact: true }).click();
  await page.getByRole('button', { name: '动作循环', exact: true }).click();
  await page.getByLabel('敌人抗性（%）').fill('90');
  await page.getByRole('button', { name: '计算结果', exact: true }).click();
  await expect(page.getByRole('button', { name: '设为对比 B', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await page.getByRole('button', { name: '设为对比 B', exact: true }).click();
  await expect(page.getByTestId('comparison-damage')).toContainText('总伤害差：-');
  await expect(page.getByRole('region', { name: '方案运行对比' })).toContainText('敌人条件');
  await expect(page.getByRole('table', { name: '角色对比' })).toBeVisible();
  await page.getByRole('button', { name: '方案管理', exact: true }).click();
  await page.getByLabel('新方案名称').fill('高抗测试');
  await page.getByRole('button', { name: '保存为新方案', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出方案 JSON', exact: true }).click();
  const download = await downloadPromise, path = testInfo.outputPath('team.json'); await download.saveAs(path);
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.enemy.resistance).toBe(0.9);
  await page.getByLabel('导入方案 JSON', { exact: true }).setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...example, schemaVersion: 99 })) });
  await expect(page.getByRole('status').filter({ hasText: '导入失败' })).toBeVisible();
  await page.getByLabel('导入方案 JSON', { exact: true }).setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await expect(page.getByRole('status').filter({ hasText: '已导入' })).toBeVisible();
  await page.getByRole('button', { name: '载入 高抗测试', exact: true }).click();
  await page.getByRole('button', { name: '动作循环', exact: true }).click();
  await expect(page.getByLabel('敌人抗性（%）')).toHaveValue('90');
});

test('edits a paginated rotation, explains stale results and recovers after cancellation', async ({ page }) => {
  await page.goto('/#workbench');
  await page.getByRole('button', { name: '动作循环', exact: true }).click();
  await expect(page.getByRole('table', { name: '动作编辑表' })).toBeVisible();
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总伤害：/ })).toBeVisible();
  await expect(page.getByText(/拒绝指令：0/)).toBeVisible();
  await page.getByRole('button', { name: '动作循环', exact: true }).click();
  await page.getByLabel('随机种子', { exact: true }).fill('2');
  await expect(page.getByText('配置已修改，以下为上次运行结果，请重新运行。')).toBeVisible();
  await page.getByRole('button', { name: '添加施放', exact: true }).click();
  await expect(page.getByText('共 44 条', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '删除动作', exact: true }).last().click();
  await page.getByRole('button', { name: '按时间稳定排序', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*attack.worker*', async route => { await gate; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await page.getByRole('button', { name: '取消模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('已取消，可重新运行。');
  release(); await page.unroute('**/*attack.worker*');
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总伤害：/ })).toBeVisible();
  await expect(page.getByText('配置已修改，以下为上次运行结果，请重新运行。')).toHaveCount(0);
  await expect(page.getByRole('img', { name: '累计伤害曲线', exact: true }).locator('svg')).toBeVisible();
  await expect(page.getByRole('table', { name: '工作区角色结果' })).toBeVisible();
  await page.getByText(/事件与单次结算/).click();
  await page.getByLabel('筛选事件角色').selectOption('hutao');
  await page.getByLabel('筛选事件类型').selectOption('hit');
  await page.getByText('伤害结算明细', { exact: true }).first().click();
  await expect(page.getByRole('list', { name: '工作区事件日志' })).toContainText('基础');
});
