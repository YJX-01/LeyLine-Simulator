import { expect, test } from '@playwright/test';

test('calculates through the worker and accepts another configuration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '地脉模拟器', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：4,500' })).toBeVisible();
  await page.getByLabel('暴击模式').selectOption('critical');
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：6,000' })).toBeVisible();
  await page.getByLabel('攻击力', { exact: true }).fill('0');
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：0', exact: true })).toBeVisible();
});
