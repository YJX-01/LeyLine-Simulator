import { test, expect } from '@playwright/test';

test('local plans survive reload, can be copied, renamed and removed', async ({ page }) => {
  await page.goto('/#team');
  await page.getByText('本地方案与导入导出', { exact: true }).click();
  await page.getByLabel('新方案名称').fill('回归队伍');
  await page.getByRole('button', { name: '保存为新方案' }).click();
  await expect(page.getByRole('button', { name: '载入 回归队伍', exact: true })).toBeVisible();
  await page.reload();
  await page.getByText('本地方案与导入导出', { exact: true }).click();
  await page.getByRole('button', { name: '复制 回归队伍', exact: true }).click();
  await page.getByLabel('回归队伍 副本的名称', { exact: true }).fill('备份');
  await page.getByLabel('回归队伍 副本的名称', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: '载入 备份', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除 回归队伍', exact: true }).click();
  await page.getByRole('button', { name: '载入 备份', exact: true }).click();
  await page.getByRole('button', { name: '运行真实队伍', exact: true }).click();
  await expect(page.getByRole('heading', { name: /队伍总伤害/ })).toBeVisible();
});
