import { test, expect } from '@playwright/test';
for (const { label, origin, base } of [
  { label: 'root', origin: 'http://127.0.0.1:5175', base: '/' },
  { label: 'subpath', origin: 'http://127.0.0.1:5176', base: '/leyline/' },
]) {
  test(`${label}: opens the integrated shell and shares its project with the formula tool`, async ({ page, request }) => {
    const errors: string[] = [];
    const resources: string[] = [];
    page.on('request', request => resources.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + base);
    await expect(page.getByRole('heading', { name: '时间轴', exact: true })).toBeVisible();
    await expect(page.getByTestId('workspace-objective')).toHaveText('4,400');
    const axisWorker = resources.find(url => /axis.worker-/.test(url));
    expect(axisWorker).toBeTruthy();
    expect(new URL(axisWorker!).pathname.startsWith(base + 'assets/')).toBe(true);
    expect((await request.get(axisWorker!)).headers()['content-type']).toContain('javascript');
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByLabel('圣遗物名称', { exact: true }).fill('生产实物花冠');
    await page.getByRole('button', { name: '添加实物圣遗物', exact: true }).click();
    const image = page.getByRole('img', { name: /图示$/ }).first();
    await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth === 96)).toBe(true);
    const imageSource = await image.getAttribute('src');
    expect((await request.get(new URL(imageSource!, page.url()).href)).headers()['content-type']).toContain('image/webp');
    await page.getByTestId('workspace-nav-team').click();
    await page.getByRole('combobox', { name: '候选武器', exact: true }).selectOption('weapon-b');
    await expect(page.getByTestId('workspace-objective')).toHaveText('4,000');
    await page.getByRole('button', { name: '导航 设置与帮助', exact: true }).click();
    await page.locator('a[href="#annotation"]').click();
    await expect(page.getByTestId('objective-value')).toHaveText('4,000');
    await page.getByRole('spinbutton', { name: /^攻击力/ }).fill('1100');
    await page.locator('a[href="#axis"]').click();
    await expect(page.getByTestId('workspace-objective')).toHaveText('4,400');
    expect(errors).toEqual([]);
  });

  test(`${label}: loads fixed real data and calculates a real skill through the production Worker`, async ({ page, request }) => {
    const resources: string[] = [], errors: string[] = [];
    page.on('request', request => resources.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + base);
    await page.getByTestId('workspace-nav-projects').click();
    await page.getByRole('button', { name: '新建空轴', exact: true }).click();
    await page.getByTestId('workspace-nav-team').click();
    await page.getByRole('button', { name: '添加真实角色到当前轴', exact: true }).click();
    await page.getByRole('button', { name: '添加技能全部独立命中', exact: true }).click();
    await expect(page.getByTestId('workspace-total')).toHaveText('1,549.2331');
    const chunk = resources.find(url => /characters-\d+-/.test(url));
    expect(chunk).toBeTruthy();
    expect(new URL(chunk!).pathname.startsWith(base + 'assets/')).toBe(true);
    expect((await request.get(chunk!)).headers()['content-type']).toContain('javascript');
    expect((await request.get(chunk!)).headers()['cache-control']).toContain('immutable');
    expect(errors).toEqual([]);
  });

  test(`${label}: loads only needed chunks and runs a production worker`, async ({ page, request }) => {
    const errors: string[] = [], resources: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', req => resources.push(req.url()));
    await page.goto(origin + base + '#workbench');
    await expect(page.getByRole('heading', { name: '配队与装备', exact: true })).toBeVisible();
    expect(resources.some(url => /DeveloperTools-|chart-library-|chart-renderer-|attack.worker-/.test(url))).toBe(false);
    await page.getByRole('button', { name: '运行模拟', exact: true }).click();
    await expect(page.getByRole('heading', { name: /总伤害：389,207.91/ })).toBeVisible();
    await expect(page.getByRole('img', { name: '累计伤害曲线', exact: true }).locator('svg')).toBeVisible();
    const worker = resources.find(url => /attack.worker-/.test(url)); expect(worker).toBeTruthy();
    expect(new URL(worker!).pathname.startsWith(base + 'assets/')).toBe(true);
    expect((await request.get(worker!)).headers()['content-type']).toContain('javascript');
    expect((await request.get(origin + base)).headers()['cache-control']).toBe('no-cache');
    expect((await request.get(worker!)).headers()['cache-control']).toContain('immutable');
    expect((await request.get(origin + base + 'assets/missing.js')).status()).toBe(404);
    expect((await request.get(origin + base + '.vite/manifest.json')).status()).toBe(404);
    expect((await request.get(origin + base + 'package.json')).status()).toBe(404);
    await page.getByRole('link', { name: '开发验证工具', exact: true }).click();
    await expect(page.getByRole('button', { name: '计算伤害', exact: true })).toBeVisible();
    expect(resources.some(url => /DeveloperTools-/.test(url))).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${label}: recovers from a stale cached chunk after reloading HTML`, async ({ page }) => {
    // Emulate an old entry referring to a removed hash, then serve the current entry on reload.
    await page.route('**/assets/index-*.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'cache-control': 'no-store' }, body: (await response.text()).replaceAll(/Workbench-[\w-]+\.js/g, 'Workbench-old-release.js') });
    });
    await page.goto(origin + base + '#workbench');
    await expect(page.getByRole('heading', { name: '页面未能加载', exact: true })).toBeVisible();
    await page.unroute('**/assets/index-*.js');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '重新加载页面', exact: true }).click()]);
    await expect(page.getByRole('heading', { name: '配队与装备', exact: true })).toBeVisible();
  });

  test(`${label}: remains usable when storage access is denied`, async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage denied', 'SecurityError'); } }); });
    await page.goto(origin + base + '#workbench');
    await expect(page.getByRole('status').filter({ hasText: '草稿无法读取' })).toBeVisible();
    await page.getByRole('button', { name: '运行模拟', exact: true }).click();
    await expect(page.getByRole('heading', { name: /总伤害：389,207.91/ })).toBeVisible();
  });
}
