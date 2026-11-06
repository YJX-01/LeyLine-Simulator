import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function inventoryTask(page: Page, info: TestInfo, url = '/') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('普通伤害示例轴', { exact: true })).toHaveCount(0);
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button', { name: '导入莫娜圣遗物', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导入莫娜圣遗物', exact: true });
  // Transfer the original bytes: WebKit on Windows can lose its native temporary file handle.
  await dialog.getByLabel('导入莫娜圣遗物文件', { exact: true }).setInputFiles({
    name: 'artifacts_mona.json', mimeType: 'application/json', buffer: await readFile('.references/artifacts_mona.json'),
  });
  await expect(dialog.getByLabel('莫娜导入预览', { exact: true })).toContainText('新增 458 件');
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await dialog.getByRole('button', { name: '确认导入 458 件五星圣遗物', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.inventory-card')).toHaveCount(30);
  await expect(page.locator('.inventory-count')).toContainText('共 458 件');
  await page.getByRole('button', { name: '生之花', exact: true }).click();
  await expect(page.locator('.inventory-count')).toContainText('筛选结果 86 件');
  await page.getByLabel('筛选主词条', { exact: true }).selectOption('critRate');
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await page.getByLabel('筛选主词条', { exact: true }).selectOption('');
  await page.locator('.inventory-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('炉火融炼之心');
  await page.getByRole('dialog').getByText('来源与实物身份', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('id:8770563143816081');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.inventory-card').first()).toBeFocused();
  await page.getByRole('button', { name: '全部部位', exact: true }).click();
  await page.getByLabel('搜索圣遗物', { exact: true }).fill('琴');
  await expect(page.locator('.inventory-count')).toContainText('筛选结果 5 件');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('u1-actual-inventory.png'), fullPage: true });
  await page.getByLabel('搜索圣遗物', { exact: true }).fill('');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存账号资料', exact: true }).click();
  const saved = info.outputPath('actual-account.json');
  await (await download).saveAs(saved);
  const account = JSON.parse(await readFile(saved, 'utf8'));
  expect(account.artifacts).toHaveLength(458);
  expect(account.characters).toHaveLength(0); // The inventory file cannot invent character builds.
  await page.reload();
  await page.getByTestId('workspace-nav-artifacts').click();
  await expect(page.locator('.inventory-count')).toContainText('共 458 件');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByLabel('导入账号资料文件', { exact: true }).setInputFiles(saved);
  await expect(page.getByLabel('账号管理', { exact: true })).toContainText('458 件圣遗物');
  await page.getByRole('button', { name: '新建账号', exact: true }).click();
  await expect(page.getByLabel('账号管理', { exact: true })).toContainText('0 件圣遗物');
  await page.getByRole('button', { name: '恢复替换前账号', exact: true }).click();
  await expect(page.getByLabel('账号管理', { exact: true })).toContainText('458 件圣遗物');
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByRole('button', { name: '从穿戴备注整理角色', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('55 个角色穿戴备注');
  await page.getByRole('button', { name: '确认按备注整理', exact: true }).click();
  await expect(page.locator('.character-cards > button')).toHaveCount(55);
  await page.getByLabel('搜索账号角色', { exact: true }).fill('琴');
  await page.locator('.character-cards > button').click();
  await expect(page.locator('.equipment-list')).toContainText('翠绿之影');
  await expect(page.getByText('培养资料待补全。请在下方选择真实角色与武器；旧版占位数值不作为账号面板展示或用于新队伍计算。', { exact: true })).toBeVisible();
  await expect(page.getByLabel('账号基础攻击力', { exact: true })).toHaveCount(0);
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('u1-narrow-inventory.png'), fullPage: true });
  expect(errors).toEqual([]);
}
