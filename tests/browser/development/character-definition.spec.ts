import { readDocument } from '../../helpers/browser-document';
import type { LocalAccount, Project } from '@leyline/schema';
import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('recorded Xingqiu candidate retains custom metadata through cultivation editing', async ({ page }) => {
  const source = '.references/enka/official-example.json';
  test.skip(!existsSync(source), 'Requires the recorded public showcase; no synthetic substitute.');
  await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
  await page.goto('/');
  await page.getByRole('button', { name: '展柜导入', exact: true }).click();
  await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
  await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
  await page.getByRole('button', { name: '清空选择', exact: true }).click();
  await page.getByRole('button', { name: '导入行秋', exact: true }).click();
  await page.getByRole('button', { name: '确认导入 1 位角色', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Confirmed import-and-merge already equips the selected character; no independent combination is created.
  const account = await page.evaluate(() => localStorage.getItem('leyline-account-0.1.0'));
  const imported = await readDocument<LocalAccount>(page, 'account', account!);
  const recorded = JSON.parse(readFileSync(source, 'utf8')).avatarInfoList.find((avatar: { avatarId: number }) => avatar.avatarId === 10000025);
  const importedCharacter = imported.characters.find(character => character.build?.character.id === 'xingqiu')!;
  expect(Object.keys(importedCharacter.equipment)).toHaveLength(recorded.equipList.filter((item: { reliquary?: unknown }) => item.reliquary).length);
  for (const id of Object.values(importedCharacter.equipment)) expect(imported.artifacts.some((artifact: { id: string }) => artifact.id === id)).toBe(true);
  await page.getByTestId('workspace-nav-timeline').click();
  await page.getByRole('button', { name: '前往队伍', exact: true }).click();
  await page.getByRole('button', { name: '从账号选择队员', exact: true }).click();
  await page.getByRole('dialog', { name: '从账号选择队员', exact: true }).getByRole('button').filter({ has: page.getByText('行秋', { exact: true }) }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Apply a custom copy of the actual showcase build as a current-format axis file.
  const content = await page.evaluate(async () => {
    const [{ useAxisWorkspaceStore }, { applyCharacterDefinition, copyCharacterDefinition }, { packDocument }] = await Promise.all([
      // @ts-expect-error Vite browser source URL.
      import('/src/stores/axis-workspace.ts'),
      // @ts-expect-error Vite browser source URL.
      import('/src/domain/character-definition.ts'),
      // @ts-expect-error Vite browser source URL.
      import('/src/domain/content-document.ts'),
    ]);
    const axis = useAxisWorkspaceStore();
    const { character, dataVersion } = axis.actor!.build!;
    const next = applyCharacterDefinition(axis.project, axis.actorId, copyCharacterDefinition(character, dataVersion));
    return JSON.stringify(packDocument('axis', next));
  });
  await page.getByTestId('workspace-nav-timeline').click();
  const timeline = page.getByRole('region', { name: '时间轴', exact: true });
  const file = timeline.getByLabel('导入轴项目文件', { exact: true });
  await file.setInputFiles({ name: 'recorded-showcase-custom-axis.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(timeline.getByRole('group', { name: '时间轴队员' })).toContainText('行秋 · 自定义');

  const axisName = timeline.getByLabel('轴名称', { exact: true });
  await axisName.pressSequentially('行秋试配');
  const download = page.waitForEvent('download');
  await timeline.getByRole('button', { name: '保存轴', exact: true }).click();
  const saved = readFileSync((await (await download).path())!, 'utf8');
  expect((await readDocument<Project>(page, 'axis', saved)).name).toBe('行秋试配');
  await timeline.getByText('更多', { exact: true }).click();
  await timeline.getByRole('button', { name: '新建空轴', exact: true }).click();
  await expect(page.getByRole('region', { name: '队伍', exact: true })).toContainText('还没有队员');
  await page.getByTestId('workspace-nav-timeline').click();
  await file.setInputFiles({ name: 'recorded-showcase-custom-axis.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await expect(axisName).toHaveValue('行秋试配');
  const recovered = async () => {
    const text = await page.evaluate(() => localStorage.getItem('leyline-axis-recovery-0.1.0'));
    return text ? (await readDocument<{ project: Project }>(page, 'axis-recovery', text)).project : undefined;
  };
  const before = await readDocument<Project>(page, 'axis', saved);
  expect(before.candidate.actors[0].build!.character.id).toMatch(/^custom-/);
  await page.getByTestId('workspace-nav-analysis').click();
  await page.getByRole('button', { name: '调整候选配装', exact: true }).click();
  await page.getByRole('button', { name: '查看与修改配装', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '修改所选队员配装', exact: true });
  // A declared candidate trial, not a claim about the player's original refinement.
  const refinement = before.candidate.actors[0].build!.refinement === 1 ? 2 : 1;
  await editor.getByRole('button', { name: `精炼${refinement}阶`, exact: true }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  const after = (await recovered())!;
  expect(after.candidate.actors[0].build!.character).toEqual(before.candidate.actors[0].build!.character);
  expect(after.candidate.actors[0].build!.refinement).toBe(refinement);
  expect(after.candidate.actors[0].build!.artifacts).toEqual(before.candidate.actors[0].build!.artifacts);
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.1.0'))).toBe(account);

  // Record a hit for the UI round-trip without supplying unrecorded combat conditions.
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-timeline').click();
  await timeline.getByRole('button', { name: '伤害层', exact: true }).click();
  await timeline.locator('.skill-palette').getByRole('button', { name: /古华剑·画雨笼山/ }).click();
  await timeline.getByRole('button', { name: '在光标处记录伤害点', exact: true }).click();
  const record = timeline.locator('.desk-record.damage').last();
  await record.hover();
  await expect(record).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
  await page.getByTestId('workspace-nav-analysis').click();
  const analysis = page.getByRole('region', { name: '逐点贡献', exact: true });
  const target = analysis.getByRole('checkbox', { name: /^目标 / });
  await expect(target).toBeChecked();
  await target.uncheck();
  await expect(target).not.toBeChecked();
  const row = analysis.locator('.analysis-row');
  const details = row.getByRole('button', { name: /^分析定位 / });
  await target.hover();
  await expect(row).not.toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
  await details.hover();
  await expect(row).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
  await details.click();
  await expect(timeline.getByRole('complementary', { name: '所选记录详情' })).toContainText('古华剑·画雨笼山');
});
