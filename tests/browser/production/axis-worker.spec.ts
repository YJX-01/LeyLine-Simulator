import { expect, test } from '@playwright/test';

for (const address of ['http://127.0.0.1:5175/', 'http://127.0.0.1:5176/leyline/']) {
  test(`${address} serves the axis Worker under the build base`, async ({ page, request }) => {
    const axisWorker = page.waitForEvent('worker', worker => /\/axis\.worker-[^/]+\.js$/.test(new URL(worker.url()).pathname));
    await page.goto(address);
    await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('workspace-nav-timeline').click();
    await expect(page.getByLabel('剪辑式时间轴编辑', { exact: true })).toBeVisible();
    const base = new URL(address);
    const workerUrl = new URL((await axisWorker).url());
    expect(workerUrl.origin).toBe(base.origin);
    expect(workerUrl.pathname.startsWith(base.pathname + 'assets/')).toBe(true);
    const response = await request.get(workerUrl.href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('javascript');
  });
}
