import { test, expect } from '@playwright/test';
import { performanceScenarios } from '../../fixtures/performance/scenarios';

test('keeps large results paginated and releases cancelled workers', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#workbench');
  await page.getByText('高级：配置 JSON', { exact: true }).click();
  await page.getByLabel('工作区 JSON', { exact: true }).fill(JSON.stringify(performanceScenarios()['2000-commands']));
  const started = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总伤害：/ })).toBeVisible();
  await expect(page.getByRole('img', { name: '累计伤害曲线', exact: true }).locator('svg')).toBeVisible();
  const resultRenderMs = await page.evaluate(start => performance.now() - start, started);
  expect(resultRenderMs).toBeLessThan(10000);
  await page.getByText(/事件与单次结算/).click();
  const log = page.getByRole('list', { name: '工作区事件日志' });
  await expect(log.locator(':scope > li')).toHaveCount(40);
  const filterStart = await page.evaluate(() => performance.now());
  await page.getByLabel('筛选事件类型').selectOption('hit');
  await expect(log.locator(':scope > li')).toHaveCount(40);
  await page.getByRole('button', { name: '下一页事件', exact: true }).click();
  await expect(log).toHaveAttribute('start', '41');
  const filterAndPageMs = await page.evaluate(start => performance.now() - start, filterStart);
  expect(filterAndPageMs).toBeLessThan(2000);
  // Delay loading so cancellation is deterministic on fast and slow machines alike.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*attack.worker*', async route => { await gate; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: '运行模拟', exact: true }).click();
  const cancelStart = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '取消模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('已取消，可重新运行。');
  const cancelUiMs = await page.evaluate(start => performance.now() - start, cancelStart);
  expect(cancelUiMs).toBeLessThan(1000);
  release(); await page.unroute('**/*attack.worker*');
  for (let n = 0; n < 3; n++) {
    await page.getByRole('button', { name: '运行模拟', exact: true }).click();
    await expect(page.getByRole('button', { name: '设为对比 A', exact: true })).toBeEnabled();
  }
  expect(errors).toEqual([]);
  await testInfo.attach('browser-performance.json', { contentType: 'application/json', body: JSON.stringify({ browser: testInfo.project.name, resultRenderMs, filterAndPageMs, cancelUiMs, commands: 2000, retainedLogRows: 40 }) });
});
