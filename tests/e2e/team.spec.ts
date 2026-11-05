import { expect, test } from '@playwright/test';
import fixture from '../../fixtures/scenarios/first-team.json' with { type: 'json' };

test('runs two real four-character rotations with no rejected commands and enough repeat energy', async ({ page }) => {
  await page.goto('/#team');
  await page.getByRole('button', { name: '运行真实队伍', exact: true }).click();
  await expect(page.getByRole('heading', { name: /队伍总伤害：[\d,]+/ })).toBeVisible();
  await expect(page.getByText(/队伍 DPS：.*指令拒绝：0/)).toBeVisible();
  const table = page.getByRole('table', { name: '真实队伍结果' });
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table.getByRole('row').filter({ hasText: '行秋' }).getByRole('cell').nth(2)).toHaveText('80');
  await expect(page.getByText('规则 team-repo-v1 · 数据 repo-content-v1', { exact: false })).toBeVisible();
});

test('loads Raiden and Jean actual character profiles and clears stale results on edits', async ({ page }) => {
  await page.goto('/#team');
  await page.getByRole('button', { name: '加载雷电爆发示例', exact: true }).click();
  await page.getByRole('button', { name: '运行真实队伍', exact: true }).click();
  const table = page.getByRole('table', { name: '真实队伍结果' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('雷电将军');
  await expect(page.getByText(/队伍 DPS：.*指令拒绝：0/)).toBeVisible();
  await page.getByRole('button', { name: '加载琴技能示例', exact: true }).click();
  await expect(page.getByRole('heading', { name: /队伍总伤害/ })).toHaveCount(0);
  await page.getByRole('button', { name: '运行真实队伍', exact: true }).click();
  await expect(table).toContainText('琴');
  await expect(page.getByText(/队伍 DPS：.*指令拒绝：0/)).toBeVisible();
});

test('rejects incompatible actual equipment and recovers with the accepted fixture', async ({ page }) => {
  await page.goto('/#team');
  const input = structuredClone(fixture); input.actors[0].weapon.id = 'staff-of-homa';
  await page.getByLabel('真实队伍配置（JSON）', { exact: true }).fill(JSON.stringify(input));
  await page.getByRole('button', { name: '运行真实队伍', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('武器类型不匹配');
  await page.getByRole('button', { name: '加载四人循环', exact: true }).click();
  await page.getByRole('button', { name: '运行真实队伍', exact: true }).click();
  await expect(page.getByRole('heading', { name: /队伍总伤害/ })).toBeVisible();
});
