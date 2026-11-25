import { expect, test } from '@playwright/test';

test('round counts drill down to scoped behaviors and their original evidence', async ({ page }) => {
  await page.goto('./?view=behaviors');
  const ledger = page.getByRole('region', { name: '行为缺口' });
  await ledger.getByRole('button', { name: /^Mona 伤害期末缺口/ }).click();
  const rows = ledger.locator('.behavior-list tbody tr');
  await expect(rows.first()).toBeVisible();
  await ledger.getByLabel('机制批次').selectOption('formula');
  await ledger.getByLabel('缺少的证据').selectOption('mapping');
  await expect(rows.first()).toContainText('单次伤害公式');
  await page.reload();
  await expect(ledger.getByLabel('来源范围')).toHaveValue('mona/damage');
  await expect(ledger.getByLabel('缺少的证据')).toHaveValue('mapping');
  await rows.first().getByRole('button').click();
  const detail = page.getByRole('region', { name: '条目详情' });
  await expect(detail.getByRole('heading', { name: '来源归属' })).toBeVisible();
  await expect(page).toHaveURL(/id=/);
});
