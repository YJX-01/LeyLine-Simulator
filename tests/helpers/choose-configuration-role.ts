import { expect, type Page } from '@playwright/test';

export async function chooseConfigurationRole(page: Page, name: string) {
  await page.getByRole('button', { name: '选择角色', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择角色', exact: true });
  await picker.getByLabel('搜索账号角色', { exact: true }).pressSequentially(name);
  await picker.getByRole('button', { name: `选择${name}`, exact: true }).click();
  await expect(picker).toHaveCount(0);
}
