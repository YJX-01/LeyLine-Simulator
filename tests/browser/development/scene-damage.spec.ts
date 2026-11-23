import { test } from '../../helpers/calculator-browser';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DamageCalculatorDocument } from '@leyline/schema';
import { readDocument } from '../../helpers/browser-document';

test('scene shockwave uses the selected difficulty, explicit coefficient and enemy hit in the Worker and saved file', async ({ page }, info) => {
  const first = 'scene.field.domainofblessingmachinenesti.0', second = 'scene.field.domainofblessingmachinenestii.0';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开功能导航' }).click();
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  const button = (name: string) => calculator.getByRole('button', { name, exact: true });
  await button('选择角色').click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('凯亚');
  await button('选择凯亚').click();
  await button('更换武器').click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await button('武器等级 70').click();
  await page.getByRole('dialog', { name: '凯亚 · 角色配置' }).getByRole('button', { name: '保存', exact: true }).click();
  await calculator.getByText('场景效果', { exact: true }).click();
  const field = calculator.getByRole('combobox', { name: '场地', exact: true });
  await field.selectOption(first);

  const picker = page.getByRole('dialog', { name: '选择伤害', exact: true });
  async function chooseScene(id: string, excluded: string) {
    await button('选择伤害').click();
    await expect(picker.locator(`[data-scene-hit="${excluded}"]`)).toHaveCount(0);
    await picker.locator(`[data-scene-hit="${id}"]`).click();
  }
  const hitTime = calculator.getByLabel('命中时刻（秒）');
  const coefficient = calculator.getByRole('spinbutton', { name: 'ElementLevelCo 系数' });
  const trigger = calculator.getByRole('combobox', { name: '冲击触发' });
  const target = calculator.getByRole('combobox', { name: '当前敌人受到冲击' });
  const value = calculator.getByTestId('calculator-value');
  async function evaluate(expected: string) {
    await button('计算伤害').click();
    await expect(value).toHaveText(expected);
  }

  await chooseScene(first, second);
  await expect(hitTime).toHaveValue('0.05');
  await expect(value).toHaveText('4');
  await trigger.selectOption({ label: '已满足' });
  await target.selectOption({ label: '命中' });
  await coefficient.fill('125.5');
  await expect(coefficient).toHaveValue('125.5');
  await evaluate('502');
  await hitTime.fill('0.049');
  await evaluate('0');
  await hitTime.fill('0.05');
  await evaluate('502');

  await field.selectOption(second);
  await expect(value).toContainText('请选择与该冲击匹配的秘境难度');
  await chooseScene(second, first);
  await expect(coefficient).toHaveValue('1');
  await expect(value).toHaveText('4');
  await trigger.selectOption({ label: '已满足' });
  await target.selectOption({ label: '命中' });
  await coefficient.fill('0');
  await evaluate('0');
  await coefficient.fill('125.5');
  await target.selectOption({ label: '未命中' });
  await evaluate('0');
  await target.selectOption({ label: '命中' });
  await evaluate('502');

  await button('保存伤害').click();
  await expect(button('保存伤害')).toBeDisabled();
  await button('伤害列表').click();
  await page.getByRole('dialog', { name: '伤害列表' }).getByRole('button', { name: /祝圣秘境：机巢 II · 冲击波.*502/ }).click();
  await expect(value).toHaveText('502');
  await calculator.getByText('场景冲击倍率与来源', { exact: true }).click();
  await expect(calculator.locator('p').filter({ hasText: second + '/disorder/0' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const download = page.waitForEvent('download');
  await button('导出计算文件').click();
  const file = info.outputPath('scene-damage.json');
  await (await download).saveAs(file);
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', await readFile(file, 'utf8'));
  expect(saved.project.timeline).toHaveLength(1);
  expect(saved.project.timeline[0].sceneHit).toEqual({
    scene: { namespace: 'builtin', id: second, revision: '1' }, elementLevelCo: 125.5, triggered: true, targetHit: true,
  });
  await page.reload();
  await page.getByRole('button', { name: '打开功能导航' }).click();
  await page.getByTestId('workspace-nav-calculator').click();
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles(file);
  await expect(value).toHaveText('502');
  await expect(coefficient).toHaveValue('125.5');

  const energyBlast = 'scene.field.domainofblessingfiresofpurificationii.0';
  const penalty = 'scene.field.domainofblessingfiresofpurificationii.1';
  await calculator.getByText('场景效果', { exact: true }).click();
  await field.selectOption(energyBlast);
  await button('选择伤害').click();
  await expect(picker.locator(`[data-scene-hit="${energyBlast}"]`)).toBeVisible();
  await picker.locator(`[data-scene-hit="${penalty}"]`).click();
  await expect(hitTime).toHaveValue('0.1');
  await trigger.selectOption({ label: '已满足' });
  await calculator.getByRole('combobox', { name: '场上角色受到冲击' }).selectOption({ label: '命中' });
  await coefficient.fill('125.5');
  await evaluate('仅能计算减伤前基数');
  await expect(calculator.getByTestId('calculator-scene-base')).toHaveText('502');
  await expect(button('设为比较基准')).toHaveCount(0);
  await hitTime.fill('0.099');
  await evaluate('0');
  await expect(calculator.getByTestId('calculator-scene-base')).toHaveText('0');
});
