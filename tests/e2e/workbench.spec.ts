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
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await page.getByRole('button', { name: '取消模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('已取消，可重新运行。');
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总伤害：/ })).toBeVisible();
  await expect(page.getByText('配置已修改，以下为上次运行结果，请重新运行。')).toHaveCount(0);
});
