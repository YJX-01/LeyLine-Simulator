import { expect, test } from '@playwright/test';

test('the workspace recovers after its page chunk fails to load', async ({ page }) => {
  const chunk = '**/src/pages/WorkspaceShell.vue*';
  await page.route(chunk, route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '页面未能加载', exact: true })).toBeVisible();
  await page.unroute(chunk);
  await page.getByRole('button', { name: '重新加载页面', exact: true }).click();
  await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current', 'page');
});
