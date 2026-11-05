import { test, expect } from '@playwright/test';

test('explains unavailable storage without preventing simulation or export', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage denied', 'SecurityError'); } }); });
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: '草稿无法读取' })).toBeVisible();
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总伤害：/ })).toBeVisible();
  await page.getByRole('button', { name: '方案管理', exact: true }).click();
  await page.getByRole('button', { name: '保存为新方案', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本地存储不可用');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出方案 JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('leyline-team.json');
});

test('offers a reload when a lazy page cannot load', async ({ page }) => {
  await page.route('**/src/Workbench.vue*', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '页面未能加载' })).toBeVisible();
  await page.unroute('**/src/Workbench.vue*');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '重新加载页面', exact: true }).click()]);
  await expect(page.getByRole('heading', { name: '配队与装备', exact: true })).toBeVisible();
});

test('preserves numeric results when optional chart resources fail', async ({ page }) => {
  await page.route('**/src/charts/runtime.ts*', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('table', { name: '工作区角色结果' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '图表无法加载' }).first()).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出本次结果与配置', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('leyline-result.json');
});
