import { expect, test } from '@playwright/test';

test('overview drills down into differences and opens rich detail drawer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');

  const overview = page.getByRole('region', { name: '对齐总览' });
  await expect(overview).toBeVisible();
  await expect(overview).toContainText('可对照映射一致率');
  await expect(overview).toContainText('Mona 侧覆盖与对齐');
  await expect(overview).toContainText('LeyLine 侧覆盖与对齐');

  // Drill down into open differences from KPI card
  await overview.getByRole('button', { name: /差异条目与归因/ }).click();
  const inventory = page.getByRole('region', { name: '审计条目' });
  await expect(inventory).toBeVisible();
  await expect(inventory.locator('tbody tr').first()).toBeVisible();

  // Open detail drawer and inspect attribution & counterpart navigation
  await inventory.locator('tbody tr').first().locator('.row-trigger').first().click();
  const detail = page.getByRole('region', { name: '条目详情' });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: '差异归因' })).toBeVisible();
  await expect(detail.getByRole('heading', { name: '来源归属' })).toBeVisible();

  // Jump to counterpart if present and verify Back button works
  const counterpartBtn = detail.locator('.chip-btn').first();
  if (await counterpartBtn.isVisible()) {
    const firstUrl = page.url();
    await counterpartBtn.click();
    await expect(detail.getByRole('button', { name: '返回上一条' })).toBeVisible();
    await detail.getByRole('button', { name: '返回上一条' }).click();
    await expect(page).toHaveURL(firstUrl);
  }

  await detail.getByRole('button', { name: '关闭详情' }).click();
  await expect(detail).toBeHidden();
  expect(errors).toEqual([]);
});

test('entity matrix unifies Chinese entity names and shows Mona vs LeyLine side-by-side', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?view=entities');

  const entityView = page.getByRole('region', { name: '实体对照' });
  await expect(entityView).toBeVisible();

  const search = entityView.getByLabel('搜索实体');
  await search.fill('茜特菈莉');
  await entityView.getByRole('button', { name: /茜特菈莉/ }).first().click();

  const split = entityView.locator('[aria-label="双侧对照明细"]');
  await expect(split).toContainText('茜特菈莉');
  await expect(split).toContainText('Mona 侧');
  await expect(split).toContainText('LeyLine 侧');
  // Both sides should have rows unified under the single entity
  const monaCards = split.locator('.side-column').first().locator('.item-card');
  const leylineCards = split.locator('.side-column').nth(1).locator('.item-card');
  expect(await monaCards.count()).toBeGreaterThan(0);
  expect(await leylineCards.count()).toBeGreaterThan(0);

  // Mobile narrow viewport sanity check (no horizontal document overflow)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByRole('region', { name: '对齐总览' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
