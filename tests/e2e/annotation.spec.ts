import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { evaluateWorkbench } from '../../src/engine/src/workbench';

test('edits the shared workbench through controls and reproduces independent ordinary-damage expectations', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '伤害轴工作台', exact: true })).toBeVisible();
  await expect(page.getByTestId('objective-value')).toHaveText('4,400');
  await page.getByRole('combobox', { name: '武器方案', exact: true }).selectOption('weapon-b');
  await expect(page.getByTestId('objective-value')).toHaveText('4,000');
  await expect(page.getByText('此方案没有区间效果，换装后不会沿用旧武器加成。', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '武器方案', exact: true }).selectOption('weapon-a');
  await page.getByRole('spinbutton', { name: /^攻击力/ }).fill('1100');
  await expect(page.getByTestId('objective-value')).toHaveText('4,840');
  await page.getByRole('spinbutton', { name: /^攻击力/ }).fill('1000');
  await page.getByLabel('目标 hit-2', { exact: true }).uncheck();
  await expect(page.getByTestId('objective-value')).toHaveText('2,000');
  await expect(page.getByTestId('total-value')).toHaveText('4,400');
  await expect(page.getByRole('table', { name: '时间轴记录', exact: true }).getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^hit-2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^hit-6/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('annotation-objective-selection.png'), fullPage: true });
});

test('shows interval boundaries and the source of the damage calculation', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('时间 hit-2', { exact: true }).fill('0');
  await page.getByLabel('时间 hit-6', { exact: true }).fill('5000');
  await expect(page.getByTestId('total-value')).toHaveText('4,400');
  await expect(page.getByRole('button', { name: /^hit-2/ })).toContainText('2,400');
  await expect(page.getByRole('button', { name: /^hit-6/ })).toContainText('2,000');
  await page.getByRole('button', { name: /^hit-2/ }).click();
  await expect(page.getByText('weapon-a / opening-bonus', { exact: true })).toBeVisible();
  await page.getByText(/^来源轨迹（/).click();
  await expect(page.locator('.source-list')).toContainText('timeline.hit-2.definitions.weapon-a.nodes.bonus');
  await page.getByRole('button', { name: /^hit-6/ }).click();
  await expect(page.getByText('没有区间效果参与此命中', { exact: true })).toBeVisible();
  await page.getByLabel('时间 hit-2', { exact: true }).fill('5000');
  await expect(page.getByTestId('total-value')).toHaveText('4,000');
});

test('keeps unknown conditions distinct from false and preserves known selected damage', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('此效果需要额外触发条件', { exact: true }).check();
  await expect(page.getByTestId('objective-value')).toHaveText('待确认');
  await expect(page.getByTestId('total-value')).toHaveText('待确认');
  await expect(page.getByText('部分待确认', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '计算诊断', exact: true })).toContainText('unknown');
  await expect(page.getByRole('list', { name: '计算诊断', exact: true })).toContainText('timeline.hit-2');
  await page.getByLabel('目标 hit-2', { exact: true }).uncheck();
  await expect(page.getByTestId('objective-value')).toHaveText('2,000');
  await expect(page.getByTestId('total-value')).toHaveText('待确认');
  await page.getByLabel('目标 hit-2', { exact: true }).check();
  await page.getByRole('combobox', { name: '条件 triggered', exact: true }).selectOption('false');
  await expect(page.getByTestId('objective-value')).toHaveText('4,000');
  await expect(page.getByText('已完整计算', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '条件 triggered', exact: true }).selectOption('true');
  await expect(page.getByTestId('objective-value')).toHaveText('4,400');
});

test('saves the complete project for the agent evaluator and safely reopens it', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('spinbutton', { name: /^攻击力/ }).fill('1100');
  await page.getByLabel('目标 hit-2', { exact: true }).uncheck();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  const download = await downloaded;
  const path = testInfo.outputPath('saved-workbench.json');
  await download.saveAs(path);
  const content = await readFile(path, 'utf8');
  const input: unknown = JSON.parse(content);
  const evaluated = evaluateWorkbench(input);
  expect(evaluated.status).toBe('complete');
  expect(evaluated.objectiveValue).toBe(2200);
  expect(evaluated.totalValue).toBe(4840);
  expect(evaluated.points.map(point => point.id)).toEqual(['hit-2', 'hit-6']);
  await page.getByRole('button', { name: /^武器 B · 无加成/ }).click();
  await expect(page.getByTestId('objective-value')).toHaveText('4,000');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole('status')).toContainText('项目已打开');
  await expect(page.getByTestId('objective-value')).toHaveText('2,200');
  await expect(page.getByTestId('total-value')).toHaveText('4,840');
  await expect(page.getByRole('spinbutton', { name: /^攻击力/ })).toHaveValue('1100');
  await expect(page.getByLabel('目标 hit-2', { exact: true })).not.toBeChecked();
  await page.getByLabel('导入项目文件', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('当前项目保持不变');
  await expect(page.getByTestId('objective-value')).toHaveText('2,200');
  await expect(page.getByTestId('total-value')).toHaveText('4,840');
});

test('offers the same acceptance controls on a narrow browser viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '伤害轴工作台', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^武器 A · 攻击 1100/ }).click();
  await expect(page.getByTestId('objective-value')).toHaveText('4,840');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('annotation-narrow.png'), fullPage: true });
});
