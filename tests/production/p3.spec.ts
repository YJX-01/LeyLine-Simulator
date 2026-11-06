import { expect, test } from '@playwright/test';
for (const address of ['http://127.0.0.1:5175/', 'http://127.0.0.1:5176/leyline/']) {
  test(`${address}: P3 capture and history use production chunks and Worker`, async ({ page, request }) => {
    const errors: string[] = [];
    const resources: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', resource => resources.push(resource.url()));
    await page.goto(address + '#compatibility');
    await page.getByTestId('workspace-nav-projects').click();
    await page.getByTestId('p3-load-snapshot').click();
    await expect(page.getByTestId('workspace-objective')).toHaveText('6,900');
    await page.getByTestId('workspace-nav-team').click();
    await page.getByRole('combobox', { name: /^当前轴角色/ }).selectOption('support');
    await page.getByLabel('候选攻击力', { exact: true }).fill('1200');
    await expect(page.getByTestId('workspace-objective')).toHaveText('7,020');
    await page.getByLabel('候选攻击力', { exact: true }).fill('1000');
    await page.getByLabel('编辑 P3 定义', { exact: true }).selectOption('support-character');
    await page.getByLabel('效果2读取方式', { exact: true }).selectOption('dynamic');
    await expect(page.getByTestId('workspace-objective')).toHaveText('6,600');
    await page.getByTestId('p3-load-history').click();
    await expect(page.getByTestId('workspace-objective')).toHaveText('150');
    await page.getByLabel('编辑 P3 定义', { exact: true }).selectOption('hit-one');
    await page.getByLabel('P3 节点1数值', { exact: true }).fill('120');
    await page.getByLabel('编辑 P3 定义', { exact: true }).selectOption('hit-four');
    await page.getByLabel('P3 节点1数值', { exact: true }).fill('240');
    await expect(page.getByTestId('workspace-objective')).toHaveText('180');
    const chunk = resources.find(url => /P3Panel-/.test(url));
    expect(chunk).toBeTruthy();
    expect(new URL(chunk!).pathname.startsWith(new URL(address).pathname + 'assets/')).toBe(true);
    expect((await request.get(chunk!)).headers()['content-type']).toContain('javascript');
    expect(resources.some(url => /axis.worker-/.test(url))).toBe(true);
    expect(errors).toEqual([]);
  });
}
