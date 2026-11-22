import { officialShowcase } from '../../helpers/recorded-reference';
import { readDocument } from '../../helpers/browser-document';
import { catalogSnapshotFields } from '../../helpers/catalog-snapshot-fields';
import { createRuntimeCatalog } from '../../../tools/lib/runtime-catalog.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import type { AxisResponse, Build, DamageCalculatorDocument, Project } from '@leyline/schema';
import { recordedVaresaPlunge, recordedVesnaDamage, vesnaRecording } from '../../helpers/recorded-vesna';

const buildEditor = (calculator: Locator) => calculator.getByRole('dialog', { name: / · 角色配置$/ });
const editBuild = (calculator: Locator) => calculator.getByRole('button', { name: '编辑角色配置', exact: true }).click();
const saveBuild = (calculator: Locator) => buildEditor(calculator).getByRole('button', { name: '保存', exact: true }).click();

async function selectHit(calculator: Locator, skill: string, index = 0) {
  await calculator.getByRole('button', { name: '选择伤害', exact: true }).click();
  const dialog = calculator.getByRole('dialog', { name: '选择伤害', exact: true });
  await dialog.locator('button[data-skill-id="' + skill + '"][data-hit-id]').nth(index).click();
}

test('calculator shares the team and character pickers and retains a four-member selection in its own file', async ({ page }, info) => {
  test.skip(!existsSync(vesnaRecording), 'Requires the authorized original showcase.');
  test.setTimeout(90000);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const members = ['vesna','varesa','flins','raidenshogun'];
  // An explicitly selected calculation roster from one real showcase, without observed combat.
  const teamName = await page.evaluate(async ({ raw,members }) => {
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport,confirmEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { useSavedTeamsStore } = await import('/src/stores/saved-teams.ts');
    // @ts-expect-error Vite browser source URL.
    const { createEmptyProject } = await import('/src/domain/workbench-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { addActorFromBuild } = await import('/src/domain/real-project.ts');
    const account = createAccount();
    const preview = await previewEnkaImport(raw,String(raw.uid),account);
    const rows = preview.rows.filter((row: { character: { showcase: { build: Build } } }) =>
      [...members,'nahida'].includes(row.character.showcase.build.character.id));
    confirmEnkaImport(account,preview,rows.map((row: { character: { id: string } }) => row.character.id),true);
    useAccountStore().commitEdit(account);
    const project = createEmptyProject(), names = [];
    for (const id of members) {
      const build: Build = rows.find((row: { character: { showcase: { build: Build } } }) => row.character.showcase.build.character.id === id).character.showcase.build;
      addActorFromBuild(project,build);
      names.push(build.character.identity.name);
    }
    const name = names.join(' / ');
    useSavedTeamsStore().save(name,project);
    return name;
  }, { raw: JSON.parse(readFileSync(vesnaRecording,'utf8')), members });
  const storage = () => page.evaluate(() => ['leyline-account-0.2.0','leyline-saved-teams-0.2.0','leyline-axis-recovery-0.2.0'].map(key => localStorage.getItem(key)));
  const before = await storage();
  const sizes = (card: Locator) => card.locator('.team-row-members > .game-icon').evaluateAll(nodes =>
    nodes.map(node => [node.getBoundingClientRect().width, node.getBoundingClientRect().height]));
  await page.getByTestId('workspace-nav-team').click();
  const libraryCard = page.getByRole('region', { name: '队伍', exact: true }).locator('.team-row').first();
  await expect(libraryCard).toBeVisible();
  await libraryCard.hover();
  await expect(libraryCard).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
  await expect(libraryCard.locator('.card-replace-mark')).toHaveCount(0);
  const desktopSizes = await sizes(libraryCard);
  expect(desktopSizes).toEqual(Array.from({ length: 4 }, () => [64, 64]));
  await page.setViewportSize({width:390,height:844});
  const mobileSizes = await sizes(libraryCard);
  expect(mobileSizes).toEqual(Array.from({ length: 4 }, () => [56, 56]));
  await page.setViewportSize({width:1280,height:960});
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact:true });
  const button = (name:string) => calculator.getByRole('button',{ name,exact:true });
  const roles = page.getByRole('dialog',{ name:'选择角色',exact:true });
  await button('选择角色').click();
  await expect(roles.getByRole('button',{name:'选择纳西妲'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button('选择角色')).toBeFocused();
  await button('选择队伍').click();
  const team = page.getByRole('dialog',{ name:'选择队伍' }).getByRole('button',{ name:'选择队伍 ' + teamName });
  await expect(team.locator('.team-row-members .game-icon')).toHaveCount(4);
  await team.hover();
  await expect(team).toHaveCSS('border-top-color', 'rgb(79, 145, 197)');
  expect(await sizes(team)).toEqual(desktopSizes);
  await page.setViewportSize({width:390,height:844});
  expect(await sizes(team)).toEqual(mobileSizes);
  await team.click();
  await button('选择角色').hover();
  await expect(button('选择队伍').locator('.card-replace-mark')).toBeHidden();
  await button('选择队伍').hover();
  await expect(button('选择队伍').locator('.team-row-members > .card-replace-layer .card-replace-mark')).toBeVisible();
  expect(await sizes(button('选择队伍'))).toEqual(mobileSizes);
  await page.setViewportSize({width:1280,height:960});
  expect(await sizes(button('选择队伍'))).toEqual(desktopSizes);
  await expect(button('选择角色')).toHaveText(/选择角色/);
  await button('选择角色').click();
  await expect(roles.locator('.character-card')).toHaveCount(4);
  await expect(roles.getByRole('button',{name:'选择纳西妲'})).toHaveCount(0);
  await roles.getByRole('button',{name:'选择瓦雷莎'}).click();
  await button('选择伤害').click();
  const hits = page.getByRole('dialog',{name:'选择伤害',exact:true});
  await expect(hits.getByRole('region',{name:'元素爆发'})).toContainText('小q');
  await expect(hits.getByRole('region',{name:'元素爆发'})).toContainText('大Q');
  await hits.getByLabel('搜索伤害').pressSequentially('小q');
  await expect(hits.locator('.hit-options button')).toHaveCount(1);
  await expect(hits.locator('.hit-options button')).toContainText('大火山崩落');
  await hits.getByRole('button', { name: /大火山崩落/ }).click();
  await button('保存伤害').click();
  const calculatorFactValue = () => expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', '')));
  const expectedValue = () => expect.poll(async () => Number((await calculator.getByTestId('calculator-expected').textContent())?.replaceAll(',', '')));
  await calculatorFactValue().toBeCloseTo(recordedVaresaPlunge('critical'), 5);
  await expectedValue().toBeCloseTo(recordedVaresaPlunge('expected'), 5);
  await expect(calculator.getByText('模型伤害（待核验）', { exact: false }).first()).toBeVisible();
  await button('选择角色').click();
  await roles.getByRole('button',{name:'选择薇斯纳'}).click();
  await button('选择伤害').click();
  const normal = hits.getByRole('region',{name:'普通攻击'});
  await expect(normal).toContainText('a1');
  await page.screenshot({path:info.outputPath('damage-picker.png')});
  await hits.locator('button[data-hit-id="vesna.skill.param5"]').click();
  await button('选择增益').click();
  for (const option of await page.getByRole('dialog', { name: '选择增益' }).getByRole('checkbox').all()) await option.check();
  await button('应用增益').click();
  const critical = recordedVesnaDamage(1, 1, true, 'critical', 3);
  await calculatorFactValue().toBeCloseTo(critical, 5);
  await expectedValue().toBeCloseTo(recordedVesnaDamage(1, 1, true, 'expected', 3), 5);
  await calculator.getByText('计算条件与支持范围', { exact: true }).click();
  const gaps = calculator.getByRole('list', { name: '未完成的计算条件' });
  await expect(gaps).toContainText('瓦雷莎');
  await expect(gaps).not.toContainText('瓦雷莎的流浪乐章');
  await button('设为比较基准').click();
  await editBuild(calculator);
  await button('精炼2阶').click();
  await saveBuild(calculator);
  const difference = recordedVesnaDamage(2, 1, true, 'critical', 3) - critical;
  const delta = calculator.getByTestId('calculator-delta');
  await expect.poll(async () => Number((await delta.textContent())?.replaceAll(',', ''))).toBeCloseTo(difference, 5);
  await button('结束对照').click();
  await editBuild(calculator);
  await button('精炼1阶').click();
  await saveBuild(calculator);
  await button('保存伤害').click();
  await expect(button('保存伤害')).toBeDisabled();
  const download = page.waitForEvent('download');
  await button('导出计算文件').click();
  const content = readFileSync((await (await download).path())!, 'utf8');
  const file = await readDocument<DamageCalculatorDocument>(page,'damage-calculator',content);
  expect(file.team?.name).toBe(teamName);
  expect(file.project.candidate.actors.map(member => member.build!.character.id)).toEqual(members);
  expect(file.project.timeline.find(entry => entry.id === file.recordId)?.actor).toBe(file.actorId);
  await calculator.getByLabel('打开伤害计算文件').setInputFiles({name:'队伍计算.json',mimeType:'application/json',buffer:Buffer.from(content)});
  await calculatorFactValue().toBeCloseTo(critical, 5);
  await expect(button('选择队伍')).toContainText(teamName);
  await button('选择角色').click();
  await expect(roles.locator('.character-card')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await expect(button('选择伤害')).toBeVisible();
  expect(await calculator.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const multiplier = calculator.locator('.factor-card').filter({ hasText: '反应增伤区' }).locator('summary strong');
  expect(await multiplier.evaluate(node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set(Array.from(range.getClientRects(), rect => rect.top)).size;
  })).toBe(1);
  await page.screenshot({path:info.outputPath('team-calculator-mobile.png')});
  expect(await storage()).toEqual(before);
  await page.reload();
  await page.getByRole('button', { name: '打开功能导航' }).click();
  await page.getByTestId('workspace-nav-calculator').click();
  await button('伤害列表').click();
  const list = page.getByRole('dialog', { name: '伤害列表' });
  const plunge = list.getByRole('button', { name: /^瓦雷莎/ });
  await expect(plunge).toContainText('24,457.749657');
  await list.getByRole('button', { name: /^薇斯纳/ }).click();
  await calculatorFactValue().toBeCloseTo(critical, 5);
  await expect(button('选择队伍')).toContainText(teamName);
  await button('伤害列表').click();
  await list.getByRole('button', { name: /^删除 薇斯纳/ }).click();
  await page.getByRole('dialog', { name: '删除已保存的伤害？' }).getByRole('button', { name: '删除', exact: true }).click();
  await plunge.click();
  await expectedValue().toBeCloseTo(recordedVaresaPlunge('expected'), 5);
  await button('伤害列表').click();
  await list.getByRole('button', { name: /^删除 瓦雷莎/ }).click();
  await page.getByRole('dialog', { name: '删除已保存的伤害？' }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(list).toContainText('还没有保存的伤害');
});

// Source-based legal single-point calculations, separate from player records/game observations.
test('calculator uses formal Beidou damage, isolated candidates and saved-file Worker recomputation', async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(8000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByRole('button', { name: '选择角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('北斗');
  await calculator.getByRole('button', { name: '选择北斗', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('训练大剑');
  await weapons.getByRole('button', { name: '训练大剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('spinbutton', { name: '战技', exact: true }).clear();
  await calculator.getByRole('spinbutton', { name: '战技', exact: true }).pressSequentially('9');
  await saveBuild(calculator);
  await selectHit(calculator, 'beidou.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const uncharged = (18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7) * 2.0672 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(uncharged, 5);
  await calculator.getByRole('combobox', { name: '反击档位', exact: true }).selectOption('');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByRole('list', { name: '未完成的计算条件' })).toContainText('反击档位');
  await calculator.getByRole('combobox', { name: '反击档位', exact: true }).selectOption('2');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
  const expected = attack * 7.5072 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-expected').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected * (1 + 0.05 * 0.5), 5);
  const base = calculator.locator('.factor-card').filter({ hasText: '数值 × 倍率区' });
  await base.locator('summary').hover();
  await expect(base).toHaveCSS('border-top-width', '3px');
  await expect(base).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
  await base.locator('summary').click();
  await expect(base).toContainText('攻击力 × 倍率');
  const defense = calculator.locator('.factor-card').filter({ hasText: '防御区' });
  await defense.locator('summary').click();
  await expect(defense).toContainText('目标等级');
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await expect(calculator.getByRole('combobox', { name: '反击档位', exact: true })).toBeDisabled();
  await expect(calculator.locator('.calculator-selections .card-replace-mark')).toHaveCount(0);
  await editBuild(calculator);
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('佣兵重剑');
  await weapons.getByRole('button', { name: '佣兵重剑', exact: true }).click();
  await saveBuild(calculator);
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  const expectedAfter = (18.87648 * 8.349 + 67.54129 + 32.93 * 5.968 + 46.7) * 7.5072 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-delta').textContent())?.replaceAll(',', ''))).toBeCloseTo(expectedAfter - expected, 5);
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const download = await downloadPromise;
  const content = readFileSync((await download.path())!, 'utf8');
  const savedDocument: DamageCalculatorDocument = await readDocument(page, 'damage-calculator', content);
  expect(savedDocument.project.candidate.actors[0].build!.weapon?.id).toBe('oldmercspal');
  expect(savedDocument.baseline!.candidate.actors[0].build!.weapon?.id).toBe('wastergreatsword');
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '伤害计算.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expectedAfter, 5);
  await expect(calculator.getByText('已保存', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/r1-calculator-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'artifacts/r1-calculator-mobile.png', fullPage: true });
  expect(await page.evaluate(() => {
    const root = document.querySelector('.damage-calculator')!;
    return Array.from(root.querySelectorAll('p,th,td,label,select,summary')).filter(node => node.getClientRects().length).every(node => parseFloat(getComputedStyle(node).fontSize) >= 14);
  })).toBe(true);
  expect(errors).toEqual([]);
});

test('calculator creates a named independent Kaeya capture, saves it and recomputes the candidate in the Worker', async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(8000);
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByRole('button', { name: '选择角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('凯亚');
  await calculator.getByRole('button', { name: '选择凯亚', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('button', { name: '1命', exact: true }).click();
  const talent = calculator.getByRole('spinbutton', { name: '爆发', exact: true });
  await talent.clear(); await talent.pressSequentially('9');
  await saveBuild(calculator);
  await selectHit(calculator, 'kaeya.burst');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByLabel('命中时刻（秒）', { exact: true }).fill('1');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveText('需补充条件');
  await calculator.getByLabel('独立捕获时刻（秒）', { exact: true }).fill('0.2');
  await calculator.getByRole('button', { name: '添加属性捕获点', exact: true }).click();
  await expect(calculator.getByRole('combobox', { name: '属性捕获来源', exact: true }).locator('option').last()).toContainText('属性捕获 / 0.2秒');
  await calculator.getByRole('combobox', { name: '捕获时点', exact: true }).selectOption('before');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 1.3192 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await editBuild(calculator);
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('银剑');
  await weapons.getByRole('button', { name: '银剑', exact: true }).click();
  await saveBuild(calculator);
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  const changed = (18.6984 * 8.349 + 66.90411 + 32.93 * 5.968 + 46.7) * 1.3192 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-delta').textContent())?.replaceAll(',', ''))).toBeCloseTo(changed - expected, 5);
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const savedFile = readFileSync((await (await downloadPromise).path())!, 'utf8');
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', savedFile);
  expect(saved.project.timeline.filter(record => record.kind === 'action')).toHaveLength(0);
  expect(saved.project.timeline.filter(record => record.kind === 'capture')).toHaveLength(1);
  expect(saved.project.timeline.filter(record => record.kind === 'damage')).toHaveLength(1);
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '独立捕获计算.json', mimeType: 'application/json', buffer: Buffer.from(savedFile) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(changed, 5);
  await page.screenshot({ path: 'artifacts/r2-calculator-capture.png', fullPage: true });
});

test('Kaeya C3 sequential talent editing, dirty navigation and formal Worker result remain consistent', async ({ page }) => {
  test.setTimeout(45000);
  page.setDefaultTimeout(8000);
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByRole('button', { name: '选择角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially('凯亚');
  await calculator.getByRole('button', { name: '选择凯亚', exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('button', { name: '3命', exact: true }).click();
  const talent = calculator.getByRole('spinbutton', { name: '战技', exact: true });
  await talent.clear(); await talent.pressSequentially('12');
  await expect(talent).toHaveValue('12');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(talent).toHaveValue('12');
  await saveBuild(calculator);
  await selectHit(calculator, 'kaeya.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 3.824 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByRole('button', { name: '选择增益', exact: true }).click();
  await calculator.getByLabel('生命比例（%）', { exact: true }).click();
  await expect(calculator.getByLabel('生命比例（%）', { exact: true })).toBeFocused();
  await page.keyboard.type('90');
  await calculator.getByRole('button', { name: '应用增益', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveCount(0); // Never leave a stale previous result visible.
});

test('actual comparison Worker recomputes Kaeya C3 after current document serialization', async ({ page }) => {
  const build: Build = {
    ...await catalogSnapshotFields('kaeya', 'dullblade'),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 3, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1,
  };
  await page.goto('/');
  const output = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation, calculatorRequest, parseDamageCalculator } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    const document = createDamageCalculation(build, { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'kaeya', revision: build.character.revision }, hitId: 'kaeya.skill.param1' }, crit: 'noncritical', reaction: 'none' }, defaultEnemy());
    document.baseline = JSON.parse(JSON.stringify(document.project));
    const candidate = document.project.candidate.actors[0].build;
    candidate.talents.skill = 8;
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document)));
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    try {
      return await new Promise<AxisResponse>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Comparison Worker timeout')), 10000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage(calculatorRequest(reopened, 1));
      });
    } finally { worker.terminate(); }
  }, build);
  expect(output.comparison?.baseline.status).toBe('complete');
  expect(output.comparison?.candidates[0].result.status).toBe('complete');
  const attack = 18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7;
  expect(output.comparison!.baseline.totalValue).toBeCloseTo(attack * 3.824 * 0.45, 8);
  expect(output.comparison!.candidates[0].result.totalValue).toBeCloseTo(attack * 3.6328 * 0.45, 8);
});

test('calculator reads the recorded public showcase explicitly without writing local equipment or the original axis', async ({ page }) => {
  test.skip(!existsSync(officialShowcase), 'Requires the authorized original public showcase response; no substitute.');
  page.setDefaultTimeout(8000);
  await page.goto('/');
  const before = await page.evaluate(async raw => {
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport, confirmEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAxisWorkspaceStore } = await import('/src/stores/axis-workspace.ts');
    const next = createAccount();
    const preview = await previewEnkaImport(raw, '618285856', next);
    const selected = preview.rows.find((row: { character: { showcase: { build: Build } } }) => row.character.showcase.build.character.id === 'xingqiu');
    confirmEnkaImport(next, preview, [selected.character.id], false);
    const store = useAccountStore();
    store.commitEdit(next);
    return { account: JSON.stringify(store.account), axis: JSON.stringify(useAxisWorkspaceStore().project), build: selected.character.showcase.build as Build };
  }, JSON.parse(readFileSync(officialShowcase, 'utf8')));
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByRole('button', { name: '选择角色', exact: true }).click();
  await calculator.getByRole('button', { name: '展柜', exact: true }).click();
  await calculator.getByRole('button', { name: '选择行秋', exact: true }).click();
  await selectHit(calculator, 'xingqiu.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.locator('.damage-totals')).toContainText('模型伤害（待核验）');
  await calculator.getByText('计算条件与支持范围', { exact: true }).click();
  await expect(calculator.getByRole('list', { name: '未完成的计算条件' })).toContainText('命座');
  const after = await page.evaluate(async () => {
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAxisWorkspaceStore } = await import('/src/stores/axis-workspace.ts');
    return { account: JSON.stringify(useAccountStore().account), axis: JSON.stringify(useAxisWorkspaceStore().project) };
  });
  expect(after.account).toBe(before.account);
  expect(after.axis).toBe(before.axis);
  expect(before.build.constellation).toBe(6);
  expect(before.build.artifacts).toHaveLength(5);
});

test('missing-build derivative of the original account stays selectable and carries real wearing into the calculator copy', async ({ page }) => {
  test.skip(!existsSync(officialShowcase), 'Requires the original public showcase; no substitute.');
  test.setTimeout(45000);
  await page.goto('/');
  const before = await page.evaluate(async raw => {
    // @ts-expect-error Vite browser source URL.
    const { createAccount } = await import('/src/domain/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { previewEnkaImport, confirmEnkaImport } = await import('/src/domain/enka-import.ts');
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    const next = createAccount();
    const preview = await previewEnkaImport(raw, '618285856', next);
    const row = preview.rows.find((row: { character: { showcase: { build: Build } } }) => row.character.showcase.build.character.id === 'xingqiu');
    confirmEnkaImport(next, preview, [row.character.id], true);
    // Missing-field format derivative, never a claim about the recorded player's missing cultivation.
    delete next.characters[0].build;
    useAccountStore().commitEdit(next);
    return { account: localStorage.getItem('leyline-account-0.2.0'), equipment: next.characters[0].equipment };
  }, JSON.parse(readFileSync(officialShowcase, 'utf8')));
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByRole('button', { name: '选择角色', exact: true }).click();
  await calculator.getByRole('button', { name: '选择行秋', exact: true }).click();
  await expect(calculator.getByRole('button', { name: '更换武器', exact: true })).toBeVisible();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('无锋剑');
  await weapons.getByRole('button', { name: '无锋剑', exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await saveBuild(calculator);
  await selectHit(calculator, 'xingqiu.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const saved: DamageCalculatorDocument = await readDocument(page, 'damage-calculator', readFileSync((await (await downloadPromise).path())!, 'utf8'));
  const copied = saved.project.candidate.actors[0].build!;
  expect(copied.artifacts.map(item => item.id)).toEqual(Object.values(before.equipment));
  expect(copied.artifacts).toHaveLength(5);
  expect(copied.weapon?.id).toBe('dullblade');
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(before.account);
});

test('old saved content changes only after review and explicit adoption in the calculator copy', async ({ page }) => {
  const build: Build = {
    ...await catalogSnapshotFields('kaeya', 'dullblade'),
    sets: [], artifacts: [], level: 90, ascension: 6, constellation: 3, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1,
  };
  // An earlier proof scope carried in a current-format derivative.
  build.character.revision = '4';
  build.character.metadata.revision = '4';
  const profile = build.character.metadata.talents.find(skill => skill.id === 'kaeya.skill')!.hits[0].support;
  build.character.metadata.support[profile].maxConstellation = 0;
  for (const proof of build.character.calculation.bundle.coverage) {
    proof.entity.revision = '4';
    if (proof.scope.kind === 'hit' && proof.scope.skillId === 'kaeya.skill') proof.scope.maxConstellation = 0;
  }
  await page.goto('/');
  const content = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    return JSON.stringify(packDocument('damage-calculator', createDamageCalculation(build, { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'kaeya', revision: build.character.revision }, hitId: 'kaeya.skill.param1' }, crit: 'noncritical', reaction: 'none' }, defaultEnemy())));
  }, build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '内容快照.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 3.824 * 0.45;
  await expect(calculator.locator('.damage-totals')).toContainText('模型伤害（待核验）');
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByText('角色定义', { exact: true }).click();
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  const review = page.getByRole('dialog', { name: '更新计算副本内容', exact: true });
  await expect(review).toContainText('角色定义（4 → 6）');
  await review.getByRole('button', { name: '关闭更新计算副本内容', exact: true }).click();
  await expect(calculator.locator('.damage-totals')).toContainText('模型伤害（待核验）');
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  await review.getByRole('button', { name: '采用当前内容并重算', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await expect(calculator.locator('.damage-totals')).toContainText('最终伤害值');
});

for (const entry of [
  { id: 'noelle', name: '诺艾尔', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 3, hitIndex: 0,
    expected: (66.95325 * 8.349 + 239.5575) * 1.3 * 2.4 * 0.45, delta: 0 },
  { id: 'xinyan', name: '辛焱', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 3, hitIndex: 0,
    expected: (20.83536 * 8.349 + 74.55029 + 23.245 * 5.968 + 46.7) * 1.24 * 3.392 * 0.45, delta: (32.93 - 23.245) * 5.968 * 1.24 * 3.392 * 0.45 },
  { id: 'dehya', name: '迪希雅', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 1, hitIndex: 0,
    expected: ((20.6682 * 8.739 + 84.8686 + 23.245 * 5.968 + 46.7) * 1.91896
      + (1220.2496 * 8.739 + 5011.0044) * (1 + .288 + .2) * .036) * .45,
    delta: (32.93 - 23.245) * 5.968 * 1.91896 * .45 },
  { id: 'razor', name: '雷泽', weapon: '训练大剑', candidate: '佣兵重剑', skill: 'skill', constellation: 0, hitIndex: 1,
    expected: (19.5888 * 8.349 + 70.09002 + 23.245 * 5.968 + 46.7) * 5.0184 * 0.45, delta: (32.93 - 23.245) * 5.968 * 5.0184 * 0.45 },
  { id: 'barbara', name: '芭芭拉', weapon: '学徒笔记', candidate: '口袋魔导书', skill: 'normal', constellation: 1, hitIndex: 4,
    expected: (13.356 * 8.349 + 47.78865 + 23.245 * 5.968 + 46.7) * 2.82608 * 0.45, delta: (32.93 - 23.245) * 5.968 * 2.82608 * 0.45 },
]) test(`${entry.name}: selectable calculator query, actual Worker, candidate and saved file`, async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByRole('button', { name: '选择角色', exact: true }).click();
  await calculator.getByLabel('搜索游戏角色', { exact: true }).pressSequentially(entry.name);
  await calculator.getByRole('button', { name: '选择' + entry.name, exact: true }).click();
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially(entry.weapon);
  await weapons.getByRole('button', { name: entry.weapon, exact: true }).click();
  await calculator.getByLabel('武器等级', { exact: true }).click();
  await calculator.getByRole('button', { name: '武器等级 70', exact: true }).click();
  await calculator.getByRole('button', { name: `${entry.constellation}命`, exact: true }).click();
  const talent = calculator.getByRole('spinbutton', { name: entry.skill === 'normal' ? '普攻' : '战技', exact: true });
  await talent.clear(); await talent.pressSequentially(entry.constellation === 3 ? '12' : '9');
  // Mid-width panels must keep both stepper buttons visible and the whole value editable.
  expect(await talent.evaluate(input => {
    const stepper = input.closest('.number-stepper')!;
    const bounds = stepper.getBoundingClientRect();
    return Array.from(stepper.querySelectorAll('button,input')).every(node => { const box = node.getBoundingClientRect(); return box.left >= bounds.left && box.right <= bounds.right + 1; });
  })).toBe(true);
  await saveBuild(calculator);
  await selectHit(calculator, `${entry.id}.${entry.skill}`, entry.hitIndex);
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.expected, 5);
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await editBuild(calculator);
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially(entry.candidate);
  await weapons.getByRole('button', { name: entry.candidate, exact: true }).click();
  await saveBuild(calculator);
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-delta').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.delta, 5);
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const content = readFileSync((await (await downloadPromise).path())!, 'utf8');
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', content);
  expect(saved.project.timeline).toHaveLength(1);
  expect(saved.project.candidate.actors[0].build!.character.calculation.bundle.coverage.some(proof => proof.scope.kind === 'context' && proof.resolution === 'unavailable')).toBe(true);
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: `${entry.name}单次计算.json`, mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.expected + entry.delta, 5);
  if (entry.id === 'barbara') {
    await page.screenshot({ path: 'artifacts/r3-calculator-medium.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: 'artifacts/r3-calculator-mobile.png', fullPage: true });
  }
});

test('Nicole’s on-field dealer determines the projection damage, reaction choices and Worker output after reopening', async ({ page }) => {
  const levelOne = { artifacts: [], sets: [], level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const nicole: Build = { ...await catalogSnapshotFields('nicole', 'apprenticesnotes'), ...levelOne, level: 90, ascension: 6, talents: { normal: 1, skill: 1, burst: 10 } };
  const kaeya: Build = { ...await catalogSnapshotFields('kaeya', 'dullblade'), ...levelOne };
  await page.goto('/');
  const content = await page.evaluate(async ({ nicole, kaeya }) => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy, addActorFromBuild } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const enemy = defaultEnemy(); enemy.level = 1; enemy.resistances.cryo = .35; enemy.resistances.pyro = .7;
    const { id, revision, namespace } = nicole.character;
    const file = createDamageCalculation(nicole, { hit: { definition: { id, revision, namespace, group: 'characters' }, hitId: 'nicole.burst.projection' }, crit: 'noncritical', reaction: 'none' }, enemy);
    const dealer = addActorFromBuild(file.project, kaeya);
    const flag = (value: boolean) => ({ value: { kind: 'boolean', value }, provenance: 'explicit', sourceRefs: [] });
    file.project.timeline[0].damage.facts = [
      { subject: { kind: 'actor', id: file.actorId }, values: { onField: flag(false) } },
      { subject: { kind: 'actor', id: dealer }, values: { onField: flag(true) } },
      { subject: { kind: 'event' }, values: { 'nicole.projectionReady': flag(true) } },
    ];
    return JSON.stringify(packDocument('damage-calculator', file));
  }, { nicole, kaeya });
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '造影.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  const expected = (kaeya.character.attributes.base.attack + kaeya.weapon!.baseAttack) * 1.8 * .5 * .65;
  const shown = () => calculator.getByTestId('calculator-value').innerText();
  await expect.poll(async () => Number((await shown()).replaceAll(',', ''))).toBeCloseTo(expected, 5);
  const reactions = calculator.getByRole('combobox', { name: '反应', exact: true });
  await expect(reactions.locator('option[value="melt"]')).toHaveCount(1);
  await expect(reactions.locator('option[value="vaporize"]')).toHaveCount(0);
  await calculator.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await expect(picker.getByRole('combobox', { name: '凯亚 · 站场', exact: true })).toHaveValue('true');
  await picker.getByRole('combobox', { name: '本击 · 本次奥迹造影可触发', exact: true }).selectOption('false');
  await picker.getByRole('button', { name: '应用增益' }).click();
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect.poll(shown).toMatch(/^0(?:\.0+)?$/);
});

test('a standalone swirl replaces the selected hit and reopens as one Worker occurrence', async ({page},info) => {
  const build: Build={...await catalogSnapshotFields('sucrose','apprenticesnotes'),artifacts:[],sets:[],level:1,ascension:0,
    weaponLevel:1,weaponAscension:0,constellation:0,refinement:1,talents:{normal:1,skill:1,burst:1}};
  await page.goto('/');
  const content=await page.evaluate(async build=>{
    // @ts-expect-error Vite browser source URL.
    const {createDamageCalculation}=await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const {defaultEnemy}=await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const {packDocument}=await import('/src/domain/content-document.ts');
    const enemy=defaultEnemy();enemy.resistances.pyro=.2;enemy.level=1;
    const {id,namespace,revision}=build.character;
    const doc=createDamageCalculation(build,{hit:{definition:{group:'characters',id,namespace,revision},hitId:build.character.talents[0].hits[0].id},crit:'noncritical',reaction:'none'},enemy);
    return JSON.stringify(packDocument('damage-calculator',doc));
  },build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc=page.getByRole('region',{name:'伤害计算',exact:true});
  const open=calc.getByLabel('打开伤害计算文件',{exact:true});
  await open.setInputFiles({name:'砂糖.json',mimeType:'application/json',buffer:Buffer.from(content)});
  await calc.getByRole('button',{name:'选择伤害',exact:true}).click();
  await calc.locator('button[data-reaction="swirl"][data-element="pyro"]').click();
  const check=()=>expect.poll(async()=>Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(17.165606*.6*.8,5);
  await check();
  const waiting=page.waitForEvent('download');
  await calc.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file=info.outputPath('reaction-calculation.json');
  await (await waiting).saveAs(file);
  const saved=await readDocument<DamageCalculatorDocument>(page,'damage-calculator',readFileSync(file,'utf8'));
  expect(saved.project.timeline.filter(r=>r.kind==='damage')).toHaveLength(1);
  expect(saved.project.timeline[0].reactionEvent).toMatchObject({family:'swirl',element:'pyro',triggerActorId:saved.actorId});
  await open.setInputFiles(file);
  await check();
});

test('Blackcliff layers keep distinct expiry times in the calculator Worker after saving and reopening', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('kaeya','blackclifflongsword'), artifacts:[],sets:[],level:1,ascension:0,weaponLevel:1,weaponAscension:0,constellation:0,refinement:1,talents:{normal:1,skill:1,burst:1} };
  await page.goto('/');
  const original = await page.evaluate(async b => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const enemy = defaultEnemy(); enemy.level=1; enemy.resistances.physical=.1;
    const {id,namespace,revision}=b.character;
    const query={hit:{definition:{id,namespace,revision,group:'characters'},hitId:'kaeya.normal.param1'},crit:'noncritical',reaction:'none'};
    return JSON.stringify(packDocument('damage-calculator',createDamageCalculation(b,query,enemy)));
  },build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc=page.getByRole('region',{name:'伤害计算',exact:true}),open=calc.getByLabel('打开伤害计算文件',{exact:true});
  await open.setInputFiles({name:'黑岩试配.json',mimeType:'application/json',buffer:Buffer.from(original)});
  const base=(build.character.attributes.base.attack+build.weapon!.baseAttack)*.5375*.45;
  const check=(layers:number)=>expect.poll(async()=>Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(base*(1+.12*layers),5);
  await check(0);
  await calc.getByRole('button',{name:'选择增益',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'选择增益'});
  await dialog.getByRole('checkbox',{name:/黑岩长剑/}).check();
  await dialog.getByLabel('第1层剩余时间（秒）').fill('2');
  await dialog.getByRole('button',{name:'增加一层'}).click();
  await dialog.getByLabel('第2层剩余时间（秒）').fill('4');
  await dialog.getByRole('button',{name:'应用增益'}).click();
  await check(2);
  const downloading=page.waitForEvent('download');
  await calc.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file=info.outputPath('黑岩剩余时间.json');await (await downloading).saveAs(file);
  await open.setInputFiles(file);
  await check(2);
  for(const [time,layers] of [[2,1],[4,0]]) {
    await calc.getByLabel('命中时刻（秒）',{exact:true}).fill(String(time));
    await calc.getByRole('button',{name:'计算伤害',exact:true}).click();
    await check(layers);
  }
});

test('recorded Quicken, the actual particle collector and Hydro aura duration survive a calculator Worker replay', async ({page},info)=>{
  test.setTimeout(90000);
  const builds:Build[]=await Promise.all([['lisa','apprenticesnotes'],['fischl','huntersbow'],['kaeya','dullblade'],['barbara','apprenticesnotes']].map(async([id,weapon])=>({
    ...await catalogSnapshotFields(id,weapon),artifacts:[],sets:[],level:1,ascension:0,weaponLevel:1,weaponAscension:0,constellation:0,refinement:1,talents:{normal:1,skill:1,burst:1},
  })));
  await page.goto('/');
  const original=await page.evaluate(async members=>{
    // @ts-expect-error Vite browser source URL.
    const {createDamageCalculation}=await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const {defaultEnemy,addActorFromBuild}=await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const {packDocument}=await import('/src/domain/content-document.ts');
    const {id,namespace,revision}=members[0].character;
    const doc=createDamageCalculation(members[0],{hit:{definition:{id,namespace,revision,group:'characters'},hitId:'lisa.normal.param1'},crit:'noncritical',reaction:'none'},defaultEnemy());
    for(const member of members.slice(1))addActorFromBuild(doc.project,member);
    return JSON.stringify(packDocument('damage-calculator',doc));
  },builds);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc=page.getByRole('region',{name:'伤害计算',exact:true}),open=calc.getByLabel('打开伤害计算文件',{exact:true});
  await open.setInputFiles({name:'双雷队.json',mimeType:'application/json',buffer:Buffer.from(original)});
  await calc.getByText('角色元素附着',{exact:true}).click();
  await calc.getByRole('combobox',{name:'附着元素',exact:true}).selectOption('hydro');
  await calc.getByLabel('减时前的剩余时间（秒）',{exact:true}).fill('10');
  await calc.getByRole('button',{name:'记录附着',exact:true}).click();
  await calc.getByText('战斗触发与回能',{exact:true}).click();
  await expect(calc.getByText(/持续 6 秒，6 秒结束/)).toBeVisible();
  await calc.getByText('反应记录与微粒拾取',{exact:true}).click();
  await calc.getByRole('button',{name:'记录触发',exact:true}).click();
  const drops=calc.getByRole('combobox',{name:'微粒来源',exact:true});
  await expect(drops.locator('option')).toHaveCount(2);
  await drops.selectOption({index:1});
  await calc.getByRole('combobox',{name:'记录队员',exact:true}).selectOption({label:'菲谢尔'});
  await calc.getByRole('button',{name:'拾取微粒',exact:true}).click();
  await expect(calc.getByText(/菲谢尔 获得 3 点元素能量/)).toBeVisible();
  await expect(calc.getByText(/凯亚 获得 0.6 点元素能量/)).toBeVisible();
  const download=page.waitForEvent('download'),file=info.outputPath('双雷共鸣拾取.json');
  await calc.getByRole('button',{name:'导出计算文件',exact:true}).click();
  await (await download).saveAs(file);
  const saved=await readDocument<DamageCalculatorDocument>(page,'damage-calculator',readFileSync(file,'utf8'));
  expect(saved.project.timeline.filter(r=>r.kind==='damage')).toHaveLength(1);
  expect(saved.project.timeline.filter(r=>r.observedReaction==='quicken')).toHaveLength(1);
  const pickup=saved.project.timeline.find(r=>r.particleSource);
  expect(pickup?.actor).toBe(saved.project.candidate.actors[1].id);
  expect(pickup?.particleEffect).toBe('resonance.electro.particles');
  await open.setInputFiles(file);
  await expect(calc.getByText(/菲谢尔 获得 3 点元素能量/)).toBeVisible();
});

test('Gleam replaces the supplying actor on a direct Lunar hit and never restores an expired source after reopening', async ({ page },info) => {
  test.setTimeout(90000);
  const builds:Build[]=await Promise.all([['flins','beginnersprotector'],['aino','wastergreatsword'],['kaeya','dullblade'],['sucrose','apprenticesnotes']].map(async([id,weapon])=>({
    ...await catalogSnapshotFields(id,weapon),artifacts:[],sets:[],level:1,ascension:0,weaponLevel:1,weaponAscension:0,constellation:0,refinement:1,talents:{normal:1,skill:1,burst:1},
  })));
  await page.goto('/');
  const encoded = await page.evaluate(async members=>{
    // @ts-expect-error Vite browser source URL.
    const {createDamageCalculation}=await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const {defaultEnemy,addActorFromBuild,addSkillAction,addConfirmedBuff}=await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const {packDocument}=await import('/src/domain/content-document.ts');
    const {namespace,revision,id} = members[0].character;
    const doc = createDamageCalculation(members[0],{hit:{definition:{namespace,revision,id,group:'characters'},hitId:'flins.burst.symphony'},crit:'noncritical',reaction:'none',
      facts:[{subject:{kind:'actor',id:'owner'},values:{'flins.symphonyWindow':{value:{kind:'boolean',value:true},provenance:'explicit',sourceRefs:[]}}}]},defaultEnemy());
    const [,ice,wind]=members.slice(1).map(b=>addActorFromBuild(doc.project,b));
    addSkillAction(doc.project,ice,'kaeya.skill',1000);
    addConfirmedBuff(doc.project,wind,{namespace:'builtin',id:'public.gleam',revision:'1'},2000,1000);
    return JSON.stringify(packDocument('damage-calculator',doc));
  },builds);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc=page.getByRole('region',{name:'伤害计算',exact:true}), open=calc.getByLabel('打开伤害计算文件',{exact:true});
  await open.setInputFiles({name:'满辉.json',mimeType:'application/json',buffer:Buffer.from(encoded)});
  const value=async()=>Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',',''));
  await expect.poll(value).toBeGreaterThan(0);
  const baseline=await value(),holder=builds[2];
  const atk=holder.character.attributes.base.attack*holder.character.progression.curves.attack[1]+holder.weapon!.baseAttack*holder.weapon!.attackCurve[1];
  const query=async(seconds:string,expected:number)=>{
    await calc.getByLabel('命中时刻（秒）',{exact:true}).fill(seconds);
    await calc.getByRole('button',{name:'计算伤害',exact:true}).click();
    await expect.poll(value).toBeCloseTo(expected,5);
  };
  await query('1.5',baseline*(1+atk*.00009));
  await query('2.5',baseline);
  await calc.getByRole('button',{name:'选择增益',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'选择增益'});
  const options=dialog.getByRole('checkbox',{name:/月兆·满辉/});
  await expect(options).toHaveCount(2);
  await expect(dialog.getByRole('checkbox',{name:/砂糖.*月兆·满辉|月兆·满辉.*砂糖/})).toBeChecked();
  await expect(dialog.getByRole('checkbox',{name:/凯亚.*月兆·满辉|月兆·满辉.*凯亚/})).not.toBeChecked();
  await dialog.getByRole('button',{name:'应用增益'}).click();
  const download=page.waitForEvent('download'), file=info.outputPath('满辉覆盖.json');
  await calc.getByRole('button',{name:'导出计算文件',exact:true}).click(); await (await download).saveAs(file);
  await open.setInputFiles(file);
  await query('3',baseline);
});

test('calculator records zero and five Prop Surplus stacks from its talent healing control', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('lyney','huntersbow'), artifacts:[], sets:[], level:1, ascension:0,
    weaponLevel:1, weaponAscension:0, constellation:0, refinement:1, talents:{normal:1,skill:1,burst:1} };
  await page.goto('/');
  const content = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const { namespace,id,revision } = build.character;
    const damage = {hit:{definition:{group:'characters',namespace,id,revision},hitId:'lyney.normal.param1'},crit:'noncritical',reaction:'none'};
    return JSON.stringify(packDocument('damage-calculator',createDamageCalculation(build,damage,defaultEnemy())));
  },build);
  await page.getByTestId('workspace-nav-calculator').click();
  await page.getByLabel('打开伤害计算文件',{exact:true}).setInputFiles({name:'林尼.json',mimeType:'application/json',buffer:Buffer.from(content)});
  const details = page.locator('details').filter({has:page.locator('summary').filter({hasText:/^技能治疗$/})}).last();
  await details.locator('summary').click();
  const count = details.getByRole('spinbutton',{name:'清除的隐具余数'});
  const record = details.getByRole('button',{name:'记录一次治疗'});
  await count.fill('6');
  await expect(record).toBeDisabled();
  for (const n of ['0','5']) {
    await count.fill(n);
    await expect(record).toBeEnabled();
    await record.click();
  }
  const saving = page.waitForEvent('download');
  await page.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file = info.outputPath('林尼治疗.json');
  await (await saving).saveAs(file);
  const values = await page.evaluate(async encoded => {
    // @ts-expect-error Vite browser source URL.
    const { parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
    const doc = parseDamageCalculator(encoded);
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module',{type:'module'});
    try {
      const reply = await new Promise<AxisResponse>((resolve,reject) => {
        worker.onmessage = e => resolve(e.data);
        worker.onerror = e => reject(Error(e.message));
        worker.postMessage(calculatorWorkerRequest(doc,1));
      });
      return reply.result.combatChanges?.filter(r => r.kind === 'talent-healing').map(r => ({status:r.status,healing:r.healing}));
    } finally { worker.terminate(); }
  },readFileSync(file,'utf8'));
  expect(values).toHaveLength(2);
  expect(values?.[0]).toEqual({status:'excluded',healing:0});
  expect(values?.[1].status).toBe('applied');
  expect(values?.[1].healing).toBeCloseTo(857.988 * .2 * 5, 7);
});

test('scene food changes the selected hit in the calculator Worker and expires in the reopened timeline', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('kaeya', 'dullblade'), artifacts: [], sets: [], level: 1, ascension: 0,
    weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  await page.goto('/');
  const content = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const enemy = defaultEnemy(); enemy.level = 1; enemy.resistances.physical = .1;
    const { id, namespace, revision } = build.character;
    const query = { hit: { definition: { id, namespace, revision, group: 'characters' }, hitId: 'kaeya.normal.param1' }, crit: 'noncritical', reaction: 'none' };
    return JSON.stringify(packDocument('damage-calculator', createDamageCalculation(build, query, enemy)));
  }, build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '计算.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  const base = (build.character.attributes.base.attack + build.weapon!.baseAttack) * .5375 * .45;
  const read = () => expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', '')));
  await read().toBeCloseTo(base, 5);
  await calculator.getByText('场景效果', { exact: true }).click();
  await calculator.getByRole('combobox', { name: '攻击类料理', exact: true }).selectOption('scene.food.adeptustemptation.normal');
  await read().toBeCloseTo(base + 316 * .5375 * .45, 5);
  const saving = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('scene-calculation.json');
  await (await saving).saveAs(file);
  const reopened = await page.evaluate(async text => {
    // @ts-expect-error Vite browser source URL.
    const { parseDamageCalculator } = await import('/src/domain/damage-calculator.ts');
    const { project } = parseDamageCalculator(text);
    project.timeline[0].timeMs = 300000;
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    try {
      return await new Promise<AxisResponse>((resolve, reject) => {
        worker.onmessage = event => resolve(event.data); worker.onerror = event => reject(new Error(event.message));
        worker.postMessage({ taskId: 1, session: 1, revision: 1, project });
      });
    } finally { worker.terminate(); }
  }, readFileSync(file, 'utf8'));
  expect(reopened.result.totalValue).toBeCloseTo(base, 8);
});

test('Autumn Hunt uses the current actor’s platform in the calculator and reopened Worker', async ({page},info)=>{
  const build:Build = {...await catalogSnapshotFields('kaeya','dullblade'),sets:[],artifacts:[],level:1,ascension:0,constellation:0,
    weaponLevel:1,weaponAscension:0,refinement:1,talents:{normal:1,skill:1,burst:1}};
  await page.goto('/');
  const content = await page.evaluate(async build=>{
    // @ts-expect-error Vite browser source URL.
    const {createDamageCalculation} = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const {defaultEnemy} = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const {packDocument} = await import('/src/domain/content-document.ts');
    const {id,namespace,revision}=build.character, enemy=defaultEnemy();
    enemy.level=1; enemy.resistances.cryo=.1;
    const doc=createDamageCalculation(build,{hit:{definition:{group:'characters',id,namespace,revision},hitId:'kaeya.skill.param1'},crit:'noncritical',reaction:'none'},enemy);
    doc.project.timeline[0].damage.facts=[{subject:{kind:'actor',id:doc.actorId},values:{
      onField:{value:{kind:'boolean',value:true},provenance:'explicit',sourceRefs:[]},
      autumnPlatform:{value:{kind:'enum',value:'cryo'},provenance:'explicit',sourceRefs:[]}}}];
    return JSON.stringify(packDocument('damage-calculator',doc));
  },build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator=page.getByRole('region',{name:'伤害计算',exact:true});
  await calculator.getByLabel('打开伤害计算文件',{exact:true}).setInputFiles({name:'椛狩.json',mimeType:'application/json',buffer:Buffer.from(content)});
  const base=(18.6984+build.weapon!.baseAttack)*1.912*.45;
  await calculator.getByText('场景效果',{exact:true}).click();
  await calculator.getByRole('combobox',{name:'场地',exact:true}).selectOption('scene.field.domainofblessingautumnhunti.1');
  await expect.poll(async()=>Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(base*1.6,5);
  const saving=page.waitForEvent('download');
  await calculator.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file=info.outputPath('autumn-calculation.json');await (await saving).saveAs(file);
  const reopened=await page.evaluate(async text=>{
    // @ts-expect-error Vite browser source URL.
    const {parseDamageCalculator}=await import('/src/domain/damage-calculator.ts');
    const doc=parseDamageCalculator(text),project:Project=doc.project;
    const facts=project.timeline.find(row=>row.id===doc.recordId)!.damage!.facts!.find(row=>row.subject.kind==='actor' && row.subject.id===doc.actorId)!.values;
    const worker=new Worker('/src/workers/axis.worker.ts?worker_file&type=module',{type:'module'});
    const evaluate=(id:number)=>new Promise<AxisResponse>((resolve,reject)=>{
      worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));
      worker.postMessage({taskId:id,session:1,revision:id,project});
    });
    try {
      facts.autumnPlatform.value={kind:'enum',value:'pyro'};
      const pyro=(await evaluate(1)).result.totalValue;
      facts.autumnPlatform.value={kind:'enum',value:'cryo'}; facts.onField.value={kind:'boolean',value:false};
      return {zones:project.sceneEffects!.map(s=>s.definition.id),pyro,offField:(await evaluate(2)).result.totalValue};
    } finally {worker.terminate();}
  },readFileSync(file,'utf8'));
  expect(reopened.zones).toEqual(['scene.field.domainofblessingautumnhunti.1','scene.field.domainofblessingautumnhunti.2']);
  expect(reopened.pyro).toBeCloseTo(base,8);expect(reopened.offField).toBeCloseTo(base,8);
});

test('Vourukasha counts damage taken separately from an HP cost and expires in the reopened Worker', async ({page},info)=>{
  const set=await (await createRuntimeCatalog()).get('sets','vourukashasglow');
  const build:Build={...await catalogSnapshotFields('kaeya','dullblade'),sets:[set],artifacts:[],
    theoreticalSetSlots:set.slots.slice(0,4).map(slot=>({slot,setId:set.id})),
    level:1,ascension:0,constellation:0,weaponLevel:1,weaponAscension:0,refinement:1,talents:{normal:1,skill:1,burst:1}};
  await page.goto('/');
  const content=await page.evaluate(async build=>{
    // @ts-expect-error Vite browser source URL.
    const {createDamageCalculation}=await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const {addCombatObservation,defaultEnemy}=await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const {packDocument}=await import('/src/domain/content-document.ts');
    const {id,namespace,revision}=build.character,enemy=defaultEnemy();
    enemy.level=1;enemy.resistances.cryo=.1;
    const doc=createDamageCalculation(build,{hit:{definition:{group:'characters',id,namespace,revision},hitId:'kaeya.skill.param1'},crit:'noncritical',reaction:'none'},enemy);
    doc.project.timeline[0].timeMs=1000;
    addCombatObservation(doc.project,doc.actorId,0,'hpRatioChange',-.1);
    addCombatObservation(doc.project,doc.actorId,1,'damageTaken',20);
    return JSON.stringify(packDocument('damage-calculator',doc));
  },build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator=page.getByRole('region',{name:'伤害计算',exact:true});
  await calculator.getByLabel('打开伤害计算文件',{exact:true}).setInputFiles({name:'花海甘露.json',mimeType:'application/json',buffer:Buffer.from(content)});
  const base=(18.6984+build.weapon!.baseAttack)*1.912*.45;
  await expect.poll(async()=>Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(base*1.18,5);
  const saving=page.waitForEvent('download');
  await calculator.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file=info.outputPath('glow-calculation.json');await (await saving).saveAs(file);
  const result=await page.evaluate(async text=>{
    // @ts-expect-error Vite browser source URL.
    const {parseDamageCalculator}=await import('/src/domain/damage-calculator.ts');
    const {project,recordId}=parseDamageCalculator(text);
    project.timeline.find((row:Project['timeline'][number])=>row.id===recordId)!.timeMs=5001;
    const worker=new Worker('/src/workers/axis.worker.ts?worker_file&type=module',{type:'module'});
    try{return await new Promise<AxisResponse>((resolve,reject)=>{
      worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));
      worker.postMessage({taskId:1,session:1,revision:1,project});
    });}finally{worker.terminate();}
  },readFileSync(file,'utf8'));
  expect(result.result.totalValue).toBeCloseTo(base*1.1,8);
});

test('Ayato C6 keeps both independently timed slashes after reopening and excludes a third',async({page},info)=>{
  const build:Build={...await catalogSnapshotFields('kamisatoayato','dullblade'),sets:[],artifacts:[],level:1,ascension:0,constellation:6,
    weaponLevel:1,weaponAscension:0,refinement:1,talents:{normal:1,skill:1,burst:1}};
  await page.goto('/');
  const fileText=await page.evaluate(async build=>{
    // @ts-expect-error Vite browser source URL.
    const {createDamageCalculation}=await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const {addSkillAction,addSkillHit,defaultEnemy}=await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const {packDocument}=await import('/src/domain/content-document.ts');
    const enemy=defaultEnemy();enemy.level=1;enemy.resistances.hydro=.1;
    const c=build.character,skill=c.talents.find(t=>t.category==='skill')!,extra=skill.hits.findIndex(h=>h.id==='kamisatoayato.c6.shunsuiken');
    const query={hit:{definition:{group:'characters',id:c.id,namespace:c.namespace,revision:c.revision},hitId:skill.hits[extra].id},crit:'noncritical',reaction:'none',
      facts:[{subject:{kind:'target',id:'target'},values:{targetHpRatio:{value:{kind:'quantity',value:1,unit:'scalar'},sourceRefs:[],provenance:'explicit'}}}]};
    const doc=createDamageCalculation(build,query,enemy),p=doc.project;
    p.timeline[0].timeMs=300;
    addSkillAction(p,doc.actorId,skill.id,0);
    const primary=addSkillHit(p,doc.actorId,skill.id,0,100,{crit:query.crit,reaction:query.reaction,facts:query.facts});
    p.timeline[0].sourceEventIds=[primary];
    return JSON.stringify(packDocument('damage-calculator',doc));
  },build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator=page.getByRole('region',{name:'伤害计算',exact:true});
  await calculator.getByLabel('打开伤害计算文件',{exact:true}).setInputFiles({name:'瞬水剑.json',mimeType:'application/json',buffer:Buffer.from(fileText)});
  const expected=(build.character.attributes.base.attack+build.weapon!.baseAttack)*4.5*.45;
  await expect.poll(async()=>Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(expected,5);
  const download=page.waitForEvent('download');
  await calculator.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file=info.outputPath('ayato-follow-up.json');await(await download).saveAs(file);
  const results=await page.evaluate(async text=>{
    // @ts-expect-error Vite browser source URL.
    const {parseDamageCalculator}=await import('/src/domain/damage-calculator.ts');
    const doc=parseDamageCalculator(text),p:Project=doc.project;
    const saved=p.timeline.find(r=>r.id===doc.recordId)!;
    const worker=new Worker('/src/workers/axis.worker.ts?worker_file&type=module',{type:'module'});
    const evaluate=(taskId:number)=>new Promise<AxisResponse>((resolve,reject)=>{
      worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));
      worker.postMessage({taskId,session:1,revision:taskId,project:p});
    });
    try{
      const first=(await evaluate(1)).result;
      p.timeline.push({...saved,id:'second-slash',order:10,timeMs:350});
      p.timeline.push({...saved,id:'unearned-slash',order:11,timeMs:351});
      const all=(await evaluate(2)).result;
      return {first:first.totalValue,subtotal:first.knownSubtotal,firstMissing:first.diagnostics.some(d=>d.path.endsWith('.followUp')),
        all:all.totalValue,second:all.points.find(r=>r.id==='second-slash')?.value,third:all.points.find(r=>r.id==='unearned-slash')?.value};
    }finally{worker.terminate();}
  },readFileSync(file,'utf8'));
  expect(results.first).toBeNull();expect(results.firstMissing).toBe(true);expect(results.second).toBeCloseTo(expected,8);
  expect(results.third).toBe(0);expect(results.all).toBeCloseTo(results.subtotal!+expected,8);
});
