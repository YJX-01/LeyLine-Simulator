import { test, expect } from '@playwright/test';

test('edits equipment through forms and restores the draft after reload', async ({ page }) => {
  await page.goto('/#workbench');
  await expect(page.getByRole('heading', { name: '配队与装备', exact: true })).toBeVisible();
  await page.getByLabel('命座', { exact: true }).fill('2');
  await page.getByLabel('武器精炼', { exact: true }).fill('3');
  await expect(page.getByLabel('配装预览')).toContainText('初始面板');
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
