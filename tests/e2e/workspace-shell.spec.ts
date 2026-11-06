import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { evaluateWorkbench } from '../../src/engine/src/workbench';

test('opens the integrated workbench by default and preserves candidate changes between views', async ({ page }, testInfo) => {
  await page.goto('/#compatibility');
  await expect(page.getByRole('heading', { name: '时间轴', exact: true })).toBeVisible();
  await expect(page.getByText('设计预览 · 演示数据', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,400');
  // Built-in English identifiers remain in saved data, but not in the normal UI.
  for (const view of ['timeline', 'team', 'analysis', 'definitions', 'characters', 'artifacts', 'projects']) {
    await page.getByTestId(`workspace-nav-${view}`).click();
    const visibleText = await page.locator('.workspace-design').innerText();
    expect(visibleText).not.toMatch(/AXIS WORKSPACE|RECORD INSPECTOR|ACCOUNT LIBRARY|DEFINITION LIBRARY|ordinary-example|weapon-[ab]|hit-[26]|\bscalar\b|\btriggered\b|\bcomplete\b/);
  }
  await page.getByTestId('workspace-nav-team').click();
  await page.getByRole('combobox', { name: '候选武器', exact: true }).selectOption('weapon-b');
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,000');
  await page.getByRole('combobox', { name: '候选武器', exact: true }).selectOption('weapon-a');
  await page.getByRole('spinbutton', { name: '候选攻击力', exact: true }).fill('1100');
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,840');
  await page.getByTestId('workspace-nav-analysis').click();
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,840');
  await page.getByTestId('workspace-nav-timeline').click();
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,840');
  await page.getByTestId('workspace-nav-team').click();
  await expect(page.getByRole('spinbutton', { name: '候选攻击力', exact: true })).toHaveValue('1100');
  await page.getByTestId('workspace-nav-timeline').click();
  await page.screenshot({ path: testInfo.outputPath('workspace-timeline.png'), fullPage: true });
});

test('loads the four independent acceptance samples through the project view', async ({ page }) => {
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-projects').click();
  for (const [label, expected] of [
    ['武器甲 · 区间加成', '4,400'], ['武器乙 · 无加成', '4,000'],
    ['武器甲 · 攻击 1100', '4,840'], ['只选第二次命中', '2,000'],
  ]) {
    await page.getByTestId('workspace-nav-projects').click();
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await expect(page.getByTestId('workspace-objective')).toHaveText(expected);
  }
});

test('adds and removes recorded hits and actions without generating other damage', async ({ page }) => {
  await page.goto('/#compatibility');
  await page.getByRole('button', { name: '添加伤害点', exact: true }).click();
  await expect(page.getByRole('button', { name: /^选择伤害点 / })).toHaveCount(3);
  const added = page.locator('button[data-record-id^="record-"]').last();
  await added.click();
  await page.getByRole('spinbutton', { name: '命中时间（毫秒）', exact: true }).fill('0');
  await expect(page.getByTestId('workspace-total')).toHaveText('6,800');
  await page.getByRole('button', { name: '删除所选记录', exact: true }).click();
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
  await expect(page.getByRole('button', { name: /^选择伤害点 / })).toHaveCount(2);
  await page.getByRole('button', { name: '添加动作', exact: true }).click();
  await expect(page.getByRole('button', { name: /^选择动作 / })).toHaveCount(1);
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
  await page.getByRole('button', { name: /^选择动作 / }).click();
  await page.getByRole('button', { name: '删除所选记录', exact: true }).click();
  await expect(page.getByRole('button', { name: /^选择动作 / })).toHaveCount(0);
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
});

test('keeps the complete axis when changing the objective and locates analysis records', async ({ page }) => {
  await page.goto('/#compatibility');
  await page.locator('button[data-record-id="hit-2"]').click();
  await page.getByRole('checkbox', { name: '计入当前目标', exact: true }).uncheck();
  await expect(page.getByTestId('workspace-objective')).toHaveText('2,000');
  await expect(page.getByRole('button', { name: /^选择伤害点 / })).toHaveCount(2);
  await page.getByTestId('workspace-nav-analysis').click();
  await page.locator('button[data-analysis-id="hit-2"]').click();
  await expect(page.getByRole('checkbox', { name: '计入当前目标', exact: true })).not.toBeChecked();
  await expect(page.getByRole('complementary', { name: '所选记录详情', exact: true })).toContainText('命中1');
  await expect(page.getByTestId('workspace-objective')).toHaveText('2,000');
});

test('reads dynamic interval boundaries without rewriting the axis', async ({ page }) => {
  await page.goto('/#compatibility');
  await page.locator('button[data-record-id="hit-2"]').click();
  await page.getByRole('spinbutton', { name: '命中时间（毫秒）', exact: true }).fill('0');
  await page.locator('button[data-record-id="hit-6"]').click();
  await page.getByRole('spinbutton', { name: '命中时间（毫秒）', exact: true }).fill('5000');
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,400');
  await page.locator('button[data-record-id="hit-2"]').click();
  await page.getByRole('spinbutton', { name: '命中时间（毫秒）', exact: true }).fill('5000');
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,000');
});

test('distinguishes an unknown trigger from false and permits saving incomplete projects', async ({ page }, testInfo) => {
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-team').click();
  await page.getByRole('checkbox', { name: '此效果需要额外触发条件', exact: true }).check();
  await expect(page.getByTestId('workspace-objective')).toHaveText('待确认');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存轴项目', exact: true }).click();
  const download = await downloaded;
  const path = testInfo.outputPath('unknown-axis.json');
  await download.saveAs(path);
  const incomplete = JSON.parse(await readFile(path, 'utf8'));
  expect(evaluateWorkbench(incomplete).status).toBe('partial');
  expect(incomplete.conditions.triggered).toBeNull();
  await page.getByRole('combobox', { name: '条件 触发条件', exact: true }).selectOption('false');
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,000');
  await page.getByRole('combobox', { name: '条件 触发条件', exact: true }).selectOption('true');
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,400');
});

test('saves and reopens a full project using the same input contract as the agent evaluator', async ({ page }, testInfo) => {
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-team').click();
  await page.getByRole('spinbutton', { name: '候选攻击力', exact: true }).fill('1100');
  await page.getByTestId('workspace-nav-timeline').click();
  await page.locator('button[data-record-id="hit-2"]').click();
  await page.getByRole('checkbox', { name: '计入当前目标', exact: true }).uncheck();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存轴项目', exact: true }).click();
  const download = await downloaded;
  const path = testInfo.outputPath('saved-axis.json');
  await download.saveAs(path);
  const content = await readFile(path, 'utf8');
  const evaluated = evaluateWorkbench(JSON.parse(content));
  expect(evaluated.status).toBe('complete');
  expect(evaluated.objectiveValue).toBe(2200);
  expect(evaluated.totalValue).toBe(4840);
  expect(evaluated.points.map(point => point.id)).toEqual(['hit-2', 'hit-6']);
  await page.getByTestId('workspace-nav-projects').click();
  await page.getByRole('button', { name: /^武器乙 · 无加成/ }).click();
  await expect(page.getByTestId('workspace-objective')).toHaveText('4,000');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开轴项目', exact: true }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByTestId('workspace-objective')).toHaveText('2,200');
  await page.getByLabel('导入轴项目文件', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('当前项目保持不变');
  await expect(page.getByTestId('workspace-objective')).toHaveText('2,200');
  const incompatible = { ...JSON.parse(content), schemaVersion: 99 };
  await page.getByLabel('导入轴项目文件', { exact: true }).setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incompatible)) });
  await expect(page.getByRole('alert')).toContainText('当前项目保持不变');
  await expect(page.getByTestId('workspace-objective')).toHaveText('2,200');
  await page.getByTestId('workspace-nav-team').click();
  await expect(page.getByRole('spinbutton', { name: '候选攻击力', exact: true })).toHaveValue('1100');
});

test('shares one project with the retained formula acceptance interface', async ({ page }) => {
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-team').click();
  await page.getByRole('spinbutton', { name: '候选攻击力', exact: true }).fill('1100');
  await page.evaluate(() => { window.location.hash = '#annotation'; });
  await expect(page.getByTestId('objective-value')).toHaveText('4,840');
  await page.getByRole('spinbutton', { name: /^攻击力/ }).fill('1200');
  await page.evaluate(() => { window.location.hash = '#design'; });
  await expect(page.getByTestId('workspace-objective')).toHaveText('5,280');
});

test('keeps inventory empty until the user creates real account items', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-artifacts').click();
  await expect(page.getByText('库存共 0 件。相同属性的物品保留各自身份。', { exact: true })).toBeVisible();
  await page.getByLabel('圣遗物名称', { exact: true }).fill('本地花冠');
  await page.getByRole('button', { name: '添加实物圣遗物', exact: true }).click();
  await expect(page.getByText('库存共 1 件。相同属性的物品保留各自身份。', { exact: true })).toBeVisible();
  await expect(page.getByLabel('实物名称 本地花冠', { exact: true })).toHaveValue('本地花冠');
  await page.screenshot({ path: testInfo.outputPath('workspace-artifacts.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('collapses navigation and uses a drawer on narrow windows', async ({ page }, testInfo) => {
  await page.goto('/#compatibility');
  await page.getByRole('button', { name: '折叠侧栏', exact: true }).click();
  await expect(page.getByRole('button', { name: '展开侧栏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开功能导航', exact: true }).click();
  await page.getByTestId('workspace-nav-artifacts').click();
  await expect(page.getByRole('heading', { name: '圣遗物', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('workspace-narrow.png'), fullPage: true });
});
