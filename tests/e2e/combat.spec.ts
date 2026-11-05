import { expect, test } from '@playwright/test';
import scenario from '../../fixtures/scenarios/combat-stage-3.json' with { type: 'json' };
import { combatSchema } from '../../src/schema/src';

test('runs the integrated mechanics fixture and compares dynamic to snapshot', async ({ page }) => {
  await page.goto('/#combat');
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：9,300' })).toBeVisible();
  await expect(page.getByText('综合 DPS：2,325 · 命中 6 次 · 种子 42')).toBeVisible();
  await expect(page.getByText('已触发反应：蒸发、反向融化')).toBeVisible();
  const table = page.getByRole('table', { name: '综合战斗角色结果' });
  await expect(table.getByRole('row').filter({ hasText: '水 · 测试面板' })).toContainText('7');
  await page.getByLabel('筛选综合日志').selectOption('energy');
  await expect(page.getByRole('list', { name: '综合事件日志' }).getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button', { name: '加载动态示例', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：9,300' })).toHaveCount(0);
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：8,200' })).toBeVisible();
});

test('reports malformed input, unsupported reactions and restores valid state', async ({ page }) => {
  await page.goto('/#combat');
  const editor = page.getByLabel('综合战斗配置（JSON）', { exact: true });
  await editor.fill('{');
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('JSON 格式错误');
  const unsupported = combatSchema.parse(structuredClone(scenario));
  unsupported.skills[0].effect = { type: 'hit', hit: { element: 'hydro', multiplier: 1, gauge: 1, icdTag: 'wet', icdRule: 'none' } };
  unsupported.commands = [
    { type: 'cast', id: 'wet', timeMs: 0, skillId: 'turret' },
    { type: 'switch', id: 'switch', timeMs: 1000, actorId: 'cryo' },
    { type: 'cast', id: 'freeze', timeMs: 1000, skillId: 'frost' },
  ];
  await editor.fill(JSON.stringify(unsupported));
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unsupported reaction');
  await editor.fill(JSON.stringify({ ...scenario, maxLogEvents: 1 }));
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('log budget exceeded');
  await page.getByRole('button', { name: '加载快照示例', exact: true }).click();
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：9,300' })).toBeVisible();
});

test('reproduces seeded random runs and supports summary output', async ({ page }) => {
  await page.goto('/#combat');
  await page.getByRole('button', { name: '加载种子随机示例', exact: true }).click();
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  const heading = page.getByRole('heading', { name: /综合总伤害：/ });
  await expect(heading).toBeVisible();
  const first = await heading.textContent();
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(heading).toHaveText(first!);
  await page.getByLabel('综合战斗配置（JSON）', { exact: true }).fill(JSON.stringify({ ...scenario, logMode: 'summary', maxLogEvents: 1 }));
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(heading).toHaveText('综合总伤害：9,300');
  await expect(page.getByText('摘要模式保留统计与最终状态，不保存逐事件日志。')).toBeVisible();
});

test('cancels a pending combat worker and can run again', async ({ page }) => {
  await page.goto('/#combat');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/attack.worker.ts*', async route => { await gate; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await page.getByRole('button', { name: '取消综合战斗', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('已取消综合战斗');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：9,300' })).toBeVisible();
});

test('recovers from a combat worker load failure', async ({ page }) => {
  await page.goto('/#combat');
  await page.route('**/src/attack.worker.ts*', route => route.abort());
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('综合战斗进程异常，可重新运行。');
  await page.unrouteAll();
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：9,300' })).toBeVisible();
});

test('paginates a larger event log and resets the page when filtered', async ({ page }) => {
  const config = combatSchema.parse(structuredClone(scenario));
  config.durationMs = 100;
  config.buffs = []; config.pickups = [];
  const skill = config.skills[2];
  skill.energyCost = 0; skill.cooldownMs = 0; skill.actionLockMs = 0;
  config.skills = [skill];
  config.commands = Array.from({ length: 60 }, (_, i) => ({ type: 'cast', id: `hit-${i}`, timeMs: i, skillId: skill.id }));
  await page.goto('/#combat');
  await page.getByLabel('综合战斗配置（JSON）', { exact: true }).fill(JSON.stringify(config));
  await page.getByRole('button', { name: '运行综合战斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '综合总伤害：60,000' })).toBeVisible();
  const rows = page.getByRole('list', { name: '综合事件日志' }).getByRole('listitem');
  await expect(rows).toHaveCount(50);
  await page.getByRole('button', { name: '下一页日志' }).click();
  await page.getByRole('button', { name: '下一页日志' }).click();
  await expect(rows).toHaveCount(20);
  await page.getByLabel('筛选综合日志').selectOption('hit');
  await expect(rows).toHaveCount(50);
  await page.getByRole('button', { name: '下一页日志' }).click();
  await expect(rows).toHaveCount(10);
});
