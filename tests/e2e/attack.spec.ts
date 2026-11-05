import { expect, test } from '@playwright/test';

test('calculates through the worker and accepts another configuration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '地脉模拟器', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：2,025' })).toBeVisible();
  await page.getByLabel('暴击模式').selectOption('critical');
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：2,700' })).toBeVisible();
  await page.getByRole('checkbox', { name: '计算敌人防御与抗性' }).uncheck();
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：6,000' })).toBeVisible();
  await page.getByLabel('攻击力', { exact: true }).fill('0');
  await page.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公式伤害：0', exact: true })).toBeVisible();
});

test('runs an editable rotation and explains buff expiry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '序列总伤害：6,000' })).toBeVisible();
  await expect(page.getByText('DPS：3,000 · 窗口 2000 毫秒')).toBeVisible();
  await page.getByText('查看事件日志（7 条）').click();
  await expect(page.getByText('1000 ms · expiry · 命中 1000 · 生效增益：无')).toBeVisible();
  await page.getByLabel('增益 1 持续', { exact: true }).fill('501');
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '序列总伤害：6,500' })).toBeVisible();
  await page.getByLabel('模拟时长（毫秒）', { exact: true }).fill('1500');
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('事件超出模拟时长');
  await expect(page.getByRole('heading', { name: '序列总伤害：6,500' })).toHaveCount(0);
  await page.getByLabel('模拟时长（毫秒）', { exact: true }).fill('2000');
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '序列总伤害：6,500' })).toBeVisible();
});

test('can cancel a pending worker and run again', async ({ page }) => {
  await page.goto('/');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/attack.worker.ts*', async route => {
    await gate;
    await route.continue().catch(() => {});
  });
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await page.getByRole('button', { name: '取消模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('已取消本次模拟，可重新运行。');
  await expect(page.getByRole('heading', { name: /序列总伤害/ })).toHaveCount(0);
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '序列总伤害：6,000' })).toBeVisible();
});

test('recovers when worker loading fails', async ({ page }) => {
  await page.goto('/');
  await page.route('**/src/attack.worker.ts*', route => route.abort());
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('模拟进程异常，请重新运行。');
  await page.unrouteAll();
  await page.getByRole('button', { name: '运行动作模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '序列总伤害：6,000' })).toBeVisible();
});

test('simulates Jean casts, rejects early commands and resolves attack stats', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '运行琴战技', exact: true }).click();
  await expect(page.getByRole('heading', { name: '琴战技总伤害：5,840' })).toBeVisible();
  const log = page.getByRole('list', { name: '琴战技事件日志' });
  await expect(log.getByText('100 ms · locked · 拒绝：动作锁定')).toBeVisible();
  await expect(log.getByText('6299 ms · early · 拒绝：技能冷却')).toBeVisible();
  await expect(log.getByText('7067 ms · ready · 风元素命中 2,920')).toBeVisible();
  await page.getByLabel('攻击加成（0.5 = 50%）', { exact: true }).fill('0.5');
  await expect(page.getByRole('heading', { name: '琴战技总伤害：5,840' })).toHaveCount(0);
  await page.getByRole('button', { name: '运行琴战技', exact: true }).click();
  await expect(page.getByRole('heading', { name: '琴战技总伤害：8,760' })).toBeVisible();
  await page.getByRole('checkbox', { name: '角色模拟计算敌人减免' }).check();
  await page.getByRole('button', { name: '运行琴战技', exact: true }).click();
  await expect(page.getByRole('heading', { name: '琴战技总伤害：3,942' })).toBeVisible();
});
