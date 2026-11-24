import { officialShowcase } from '../../helpers/recorded-reference';
import { readDocument } from '../../helpers/browser-document';
import { catalogSnapshotFields } from '../../helpers/catalog-snapshot-fields';
import { createRuntimeCatalog } from '../../../tools/lib/runtime-catalog.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { chooseDamageCard, revealDamageCard, test } from '../../helpers/calculator-browser';
import { expect, type Locator, type Page } from '@playwright/test';
import type { AxisResponse, Build, DamageCalculatorDocument, LocalAccount, Project } from '@leyline/schema';
import { recordedVaresaPlunge, recordedVesnaDamage, vesnaRecording } from '../../helpers/recorded-vesna';

const buildEditor = (calculator: Locator) => calculator.locator('dialog.character-detail-dialog');
const editBuild = (calculator: Locator) => calculator.locator('.calculator-selections').getByRole('button', { name: /^查看.+详情$/ }).click();
const saveBuild = (calculator: Locator) => buildEditor(calculator).getByRole('button', { name: '保存', exact: true }).click();
const saveCatalogCharacter = (calculator: Locator, name: string) => calculator.getByRole('dialog', { name, exact: true }).getByRole('button', { name: '保存', exact: true }).click();

async function openSingleBuild(page: Page, build: Build, castSkill?: string) {
  await page.goto('/');
  const content = await page.evaluate(async ({ build, castSkill }) => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy, addSkillAction } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const { id, namespace, revision } = build.character;
    const hit = { definition: { group: 'characters', id, namespace, revision }, hitId: build.character.talents[0].hits[0].id };
    const file = createDamageCalculation(build, { hit, crit: 'noncritical', reaction: 'none' }, defaultEnemy());
    if (castSkill) {
      file.project.timeline[0].timeMs = 1000;
      addSkillAction(file.project, file.actorId, castSkill, 0);
    }
    return JSON.stringify(packDocument('damage-calculator', file));
  }, { build, castSkill });
  await page.getByTestId('workspace-nav-calculator').click();
  const calc = page.getByRole('region', { name: '伤害计算', exact: true });
  const open = calc.getByLabel('打开伤害计算文件', { exact: true });
  await open.setInputFiles({ name: build.character.id + '.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  return { calc, open };
}

async function selectHit(calculator: Locator, skill: string, index = 0) {
  await calculator.getByRole('button', { name: '选择伤害', exact: true }).click();
  const dialog = calculator.getByRole('dialog', { name: '选择伤害', exact: true });
  await chooseDamageCard(dialog.locator('button[data-skill-id="' + skill + '"][data-hit-id]').nth(index));
}

test('damage cards fit their contents and applied buff icons retain searchable names', async ({ page }, info) => {
  test.setTimeout(60000);
  const build: Build = { ...await catalogSnapshotFields('bennett', 'blackclifflongsword'), level: 80, ascension: 5, constellation: 1,
    weaponLevel: 80, weaponAscension: 5, refinement: 1, talents: { normal: 3, skill: 5, burst: 7 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  const damage = calc.getByRole('button', { name: '选择伤害', exact: true });
  const buffs = calc.getByRole('button', { name: '选择增益', exact: true });
  const border = await damage.evaluate(node => getComputedStyle(node).borderTopColor);
  await damage.hover();
  await expect(damage).toHaveCSS('border-top-color', border);
  await damage.click();
  const picker = page.getByRole('dialog', { name: '选择伤害' });
  await expect.poll(() => picker.locator('.hit-options button').first().locator('img').evaluateAll(images =>
    images.some(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const cards = picker.locator('.hit-options button');
    expect(await cards.evaluateAll(nodes => nodes.every(card => card.scrollHeight <= card.clientHeight + 1
      && card.scrollWidth <= card.clientWidth + 1))).toBe(true);
    await picker.screenshot({ path: info.outputPath('damage-' + width + '.png') });
  }
  await picker.getByRole('textbox', { name: '搜索伤害', exact: true }).fill('美妙旅程');
  const burst = picker.locator('[data-hit-id="bennett.burst.param1"]');
  const skillToggle = picker.getByRole('region', { name: '元素战技' }).getByRole('heading').getByRole('button');
  const burstToggle = picker.getByRole('region', { name: '元素爆发' }).getByRole('heading').getByRole('button');
  await expect(burst).toBeVisible();
  await picker.getByRole('textbox', { name: '搜索伤害', exact: true }).fill('');
  await expect(picker.getByRole('region', { name: '常用', exact: true })).toHaveCount(0);
  await expect(skillToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(burstToggle).toHaveAttribute('aria-expanded', 'false');
  await skillToggle.click();
  await burstToggle.click();
  await picker.getByRole('textbox', { name: '搜索伤害', exact: true }).fill('元素战技');
  await expect(skillToggle).toHaveAttribute('aria-expanded', 'true');
  await picker.getByRole('textbox', { name: '搜索伤害', exact: true }).fill('');
  await expect(skillToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(burstToggle).toHaveAttribute('aria-expanded', 'true');
  const ratio = build.character.talents.find(t => t.category === 'burst')!.parameters.find(p => p.id === 'param1')!.values[6];
  await expect(burst).toContainText(new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 4 }).format(ratio));
  const picked = await burst.locator('.choice-card').innerText();
  const note = burst.locator('.note');
  await expect(note).toBeEmpty();
  expect((await note.boundingBox())!.height).toBeGreaterThan(12);
  await burst.click();
  await expect(damage.locator('.choice-card')).toBeVisible();
  expect(await damage.locator('.choice-card').innerText()).toBe(picked);
  await buffs.click();
  const dialog = page.getByRole('dialog', { name: '选择增益' });
  const search = dialog.getByRole('textbox', { name: '搜索增益', exact: true });
  await search.fill('班尼特加攻');
  const inspiration = dialog.getByRole('checkbox', { name: /班尼特加攻（美妙旅程）/ });
  await inspiration.check();
  await search.fill('');
  await dialog.getByRole('checkbox', { name: /黑岩长剑/ }).check();
  await expect.poll(() => dialog.locator('.buff-entry .game-icon').evaluateAll(icons => icons.every(icon =>
    (icon.querySelector('img')?.naturalWidth ?? 0) > 0))).toBe(true);
  await search.scrollIntoViewIfNeeded();
  await dialog.screenshot({ path: info.outputPath('buff-390.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await dialog.screenshot({ path: info.outputPath('buff-1280.png') });
  await dialog.getByRole('button', { name: '应用增益' }).click();
  await expect(buffs.locator('.buff-icon[title*="班尼特加攻"]')).toHaveCount(1);
  await expect(buffs.locator('.buff-icon[title*="黑岩长剑"]')).toHaveCount(1);
  const firstTwo = await buffs.locator('.buff-icon').evaluateAll(nodes => nodes.slice(0, 2).map(node => node.getBoundingClientRect().y));
  expect(firstTwo[0]).toBe(firstTwo[1]);
  await damage.focus();
  await page.keyboard.press('Tab');
  await expect(buffs).toBeFocused();
  await expect(buffs.getByRole('tooltip')).toContainText('班尼特加攻');
});

test('Xinyan’s two burst hits keep their own crit rules through the buff picker and Worker replay', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('xinyan', 'blackcliffslasher'), level: 1, ascension: 0, constellation: 2,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const burst = build.character.metadata.talents.find(talent => talent.id === 'xinyan.burst')!;
  const crit = calc.getByRole('combobox', { name: '暴击', exact: true });
  const check = (parameter: string, rate: number) => {
    const talentRatio = burst.parameters.find(p => p.id === parameter)!.values[0];
    const attack = build.character.attributes.base.attack + build.weapon!.baseAttack;
    const expected = attack * talentRatio * (101 / 291) * .9 * (1 + rate * .62);
    return expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  };
  await selectHit(calc, 'xinyan.burst');
  await crit.selectOption('expected');
  for (const enabled of [false, true]) {
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择增益' });
    await picker.getByRole('checkbox', { name: /开场即兴段/ }).setChecked(enabled);
    await picker.getByRole('button', { name: '应用增益' }).click();
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await check('param1', enabled ? 1 : .05);
  }
  const downloading = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('xinyan-crit.json');
  await (await downloading).saveAs(file);
  await open.setInputFiles(file);
  await expect(crit).toHaveValue('expected');
  await check('param1', 1);
  await selectHit(calc, 'xinyan.burst', 1);
  await check('param2', .05);
});

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
  const common = hits.getByRole('region', { name: '常用', exact: true });
  await expect(common.locator('.hit-options button').first()).toContainText('小q');
  await expect(common.locator('.hit-options button').first()).toContainText('攻击力 ×');
  await expect(hits.getByRole('region',{name:'元素爆发'})).toContainText('大q');
  await expect(hits.locator('section').first()).toHaveAttribute('aria-label', '常用');
  await expect(hits.locator('section').nth(1)).toHaveAttribute('aria-label', '下落攻击');
  await expect(hits.locator('[data-hit-id="varesa.burst.param5"]')).toHaveCount(1);
  await expect(common.locator('.hit-options button').first()).toContainText('按下落攻击伤害计算');
  await hits.screenshot({ path: info.outputPath('varesa-damage.png') });
  await hits.getByLabel('搜索伤害').pressSequentially('小q');
  await expect(hits.locator('.hit-options button')).toHaveCount(1);
  await expect(hits.locator('.hit-options button')).toContainText('大火山崩落');
  await hits.getByRole('button', { name: /大火山崩落/ }).click();
  await button('选择伤害').screenshot({ path: info.outputPath('varesa-home-card.png') });
  await button('保存伤害').click();
  const calculatorFactValue = () => expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', '')));
  const expectedValue = () => expect.poll(async () => Number((await calculator.getByTestId('calculator-expected').textContent())?.replaceAll(',', '')));
  await calculatorFactValue().toBeCloseTo(recordedVaresaPlunge('critical'), 5);
  await expectedValue().toBe(Number(recordedVaresaPlunge('expected').toFixed(1)));
  await expect(calculator.getByText('模型估算', { exact: false }).first()).toBeVisible();
  await button('更换瓦雷莎').click();
  await roles.getByRole('button',{name:'选择薇斯纳'}).click();
  await button('选择伤害').click();
  const normal = hits.getByRole('region',{name:'普通攻击'});
  await expect(normal).toContainText('a1');
  await page.screenshot({path:info.outputPath('damage-picker.png')});
  await chooseDamageCard(hits.locator('button[data-hit-id="vesna.skill.param5"]'));
  await button('选择增益').click();
  for (const option of await page.getByRole('dialog', { name: '选择增益' }).getByRole('checkbox').all()) await option.check();
  await button('应用增益').click();
  const critical = recordedVesnaDamage(1, 1, true, 'critical', 3);
  await calculatorFactValue().toBeCloseTo(critical, 5);
  await expectedValue().toBe(Number(recordedVesnaDamage(1, 1, true, 'expected', 3).toFixed(1)));
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
  await button('更换薇斯纳').click();
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
  await expectedValue().toBe(Number(recordedVaresaPlunge('expected').toFixed(1)));
  await button('伤害列表').click();
  await list.getByRole('button', { name: /^删除 瓦雷莎/ }).click();
  await page.getByRole('dialog', { name: '删除已保存的伤害？' }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(list).toContainText('还没有保存的伤害');
});

test.describe('calculator character card on a touch-capable device', () => {
  test.use({ hasTouch: true });

  test('calculator uses the shared catalog character editor and saves to the local library', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(any-hover: hover)').matches)).toBe(false);
    await page.getByRole('button', { name: '打开功能导航' }).click();
    await page.getByTestId('workspace-nav-calculator').click();
    const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
    const button = (name: string) => calculator.getByRole('button', { name, exact: true });
    const editor = buildEditor(calculator);
    const stored = () => page.evaluate(async () => {
      // @ts-expect-error Vite browser source URL.
      const { useAccountStore } = await import('/src/stores/account.ts');
      // @ts-expect-error Vite browser source URL.
      const { useCharacterLoadoutsStore } = await import('/src/stores/character-loadouts.ts');
      return {
        preferred: useAccountStore().account.characters.map((entry: { build?: Build }) => entry.build?.constellation),
        alternates: useCharacterLoadoutsStore().loadouts.map((entry: { snapshot: { characters: { build?: Build }[] } }) => entry.snapshot.characters[0].build?.constellation),
      };
    });
    await button('选择角色').click();
    const catalogSearch = calculator.getByLabel('搜索游戏角色', { exact: true });
    await catalogSearch.pressSequentially('凯亚');
    const kaeya = button('选择凯亚');
    await kaeya.click();
    const creation = calculator.getByRole('dialog', { name: '凯亚', exact: true });
    await expect(creation.getByRole('button', { name: '展开面板' })).toBeVisible();
    await expect(creation.getByRole('button', { name: '应用组合' })).toBeVisible();
    await expect(creation.getByRole('button', { name: '保存到本地库' })).toHaveCount(0);
    expect(await stored()).toEqual({ preferred: [], alternates: [] });
    await creation.getByRole('button', { name: '返回角色列表' }).click();
    await expect(kaeya).toBeFocused();
    await expect(catalogSearch).toHaveValue('凯亚');
    await kaeya.click();
    await saveCatalogCharacter(calculator, '凯亚');
    await expect(creation).toHaveCount(0);
    await expect(calculator.getByRole('dialog', { name: '选择角色', exact: true })).toHaveCount(0);
    expect(await stored()).toEqual({ preferred: [0], alternates: [] });
    const details = button('查看凯亚详情');
    const card = calculator.locator('.calculator-selections .configuration-row');
    const portrait = button('更换凯亚');
    const strip = card.locator('.configuration-portraits');
    await expect(card.getByText('临时角色', { exact: true })).toHaveCount(0);
    await expect(strip).toHaveAttribute('aria-label', '更换凯亚');
    await expect(strip.locator(':scope > .game-icon.characters')).toHaveCount(1);
    await expect(strip.locator(':scope > .card-sets')).toHaveCount(1);
    let calculatorSize: { width: number; height: number } | undefined;
    for (const width of [1280, 451, 320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await portrait.hover({ position: { x: 3, y: 6 } });
      const layer = portrait.locator('.card-replace-layer');
      await expect(layer).toBeVisible();
      const target = await portrait.boundingBox();
      expect(await layer.boundingBox()).toEqual(target);
      if (width === 1280) calculatorSize = { width: target!.width, height: target!.height };
      expect(await strip.evaluate(node => node.getBoundingClientRect().right <= node.closest('.configuration-row')!.getBoundingClientRect().right)).toBe(true);
    }
    await details.hover({ position: { x: 10, y: 8 } });
    await expect(portrait.locator('.card-replace-layer')).toBeHidden();
    await details.press('Enter');
    await expect(editor.getByRole('button', { name: '0命' })).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByRole('button', { name: '展开面板' })).toBeVisible();
    await expect(editor.getByRole('button', { name: '保存到本地库' })).toHaveCount(0);
    expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
    await portrait.click({ position: { x: 3, y: 6 } });
    await expect(calculator.getByRole('dialog', { name: '选择角色', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(portrait).toBeFocused();
    const setBounds = await card.locator('.card-sets').boundingBox();
    await page.mouse.click(setBounds!.x + setBounds!.width / 2, setBounds!.y + setBounds!.height / 2);
    await expect(calculator.getByRole('dialog', { name: '选择角色', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(calculator.locator('.calculator-build .effective-roll-summary')).toBeVisible();
    const titleBounds = (await card.locator('.configuration-title').boundingBox())!;
    await page.mouse.click(titleBounds.x + titleBounds.width / 2, titleBounds.y + titleBounds.height / 2);
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: '3命', exact: true }).click();
    await saveBuild(calculator);
    await expect.poll(stored).toEqual({ preferred: [3], alternates: [] });
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await details.press('Enter');
    await expect(editor.getByRole('button', { name: '3命' })).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: '4命', exact: true }).click();
    await editor.getByRole('button', { name: '另存', exact: true }).click();
    await calculator.getByRole('dialog', { name: '另存角色配装方案' }).getByRole('button', { name: '确认另存' }).click();
    await expect.poll(stored).toEqual({ preferred: [3], alternates: [4] });
    await page.keyboard.press('Escape');
    await details.press('Enter');
    await expect(editor.getByRole('button', { name: '4命' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.getByTestId('workspace-nav-team').click();
    await page.getByRole('dialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
    const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
    await team.getByRole('button', { name: '选择队员1', exact: true }).click();
    await page.getByRole('button', { name: '选择凯亚首选配置', exact: true }).click();
    await team.getByRole('button', { name: '保存', exact: true }).click();
    const teamDetail = page.getByRole('dialog', { name: '队伍详情', exact: true });
    const teamPortraits = teamDetail.getByRole('button', { name: '选择凯亚的角色配置', exact: true });
    await expect(teamPortraits.locator('.card-sets')).toHaveCount(1);
    await teamPortraits.hover({ position: { x: 3, y: 6 } });
    const teamLayer = teamPortraits.locator('.card-replace-layer');
    await expect(teamLayer).toBeVisible();
    const teamBounds = (await teamPortraits.boundingBox())!;
    expect(teamBounds.width).toBeCloseTo(calculatorSize!.width, 0);
    expect(teamBounds.height).toBeCloseTo(calculatorSize!.height, 0);
    expect(await teamLayer.boundingBox()).toEqual(teamBounds);
    await teamPortraits.click();
    await expect(page.getByRole('dialog', { name: '选择角色配置', exact: true })).toBeVisible();
  });
});

test('character library and calculator show equipped attack and crit without combat facts', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByRole('button', { name: '手动添加', exact: true }).click();
  const catalog = page.getByRole('dialog', { name: '手动添加角色', exact: true });
  await catalog.getByLabel('搜索游戏角色').fill('诺艾尔');
  await catalog.getByRole('button', { name: '选择诺艾尔', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '诺艾尔', exact: true });
  const action = (name: string) => detail.getByRole('button', { name, exact: true });
  await action('更换武器').click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器').fill('焚曜千阳');
  await weapons.getByRole('button', { name: '焚曜千阳', exact: true }).click();
  for (const label of ['角色等级', '武器等级']) {
    await detail.getByLabel(label, { exact: true }).click();
    const level = detail.getByRole('spinbutton', { name: `自定义${label}`, exact: true });
    await level.fill('1');
    await level.blur();
    await level.press('Escape');
  }
  await action('保存').click();
  await action('关闭诺艾尔').click();
  await expect(detail).toHaveCount(0);
  await page.getByRole('button', { name: '查看诺艾尔详情', exact: true }).click();
  const stat = (key: string) => detail.locator(`[data-stat-value="${key}"]`);
  const expectPanel = async () => {
    await action('展开面板').click();
    await expect(stat('attack')).toHaveText('65'); // 16.0272 + 49.1377 at level 1.
    await expect(stat('critRate')).toHaveText('7.4%');
    await expect(stat('critDamage')).toHaveText('50.0%');
    await expect(detail.locator('[data-stat-value]')).toHaveCount(8);
  };
  await expectPanel();
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-calculator').click();
  const calc = page.getByRole('region', { name: '伤害计算', exact: true });
  await calc.getByRole('button', { name: '选择角色', exact: true }).click();
  await calc.getByRole('button', { name: '选择诺艾尔', exact: true }).click();
  await editBuild(calc);
  await expectPanel();
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
  await saveCatalogCharacter(calculator, '北斗');
  await selectHit(calculator, 'beidou.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const uncharged = (18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7) * 2.0672 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(uncharged, 5);
  const charge = calculator.getByRole('combobox', { name: '反击档位', exact: true });
  await expect(charge).toHaveValue('0');
  await expect(charge.getByText('待确认')).toHaveCount(0);
  await calculator.getByRole('combobox', { name: '反击档位', exact: true }).selectOption('2');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
  const expected = attack * 7.5072 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  const critical = calculator.getByTestId('calculator-critical');
  const mean = calculator.getByTestId('calculator-expected');
  const expectedLabel = (expected * (1 + 0.05 * 0.5)).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  await expect(critical).toHaveText(Math.round(expected * 1.5).toLocaleString('zh-CN'));
  await expect(mean).toHaveText(expectedLabel);
  await calculator.getByRole('button', { name: '收起伤害结果' }).click();
  await expect(calculator.getByRole('region', { name: '伤害乘区' })).toBeHidden();
  await expect(critical).toBeVisible();
  await expect(mean).toBeVisible();
  await calculator.getByRole('button', { name: '展开伤害结果' }).click();
  const checkTiles = async () => {
    const [team, role, damage, buff] = await calculator.locator('.calculator-selections > *').evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(new Set([team, role, damage, buff].map(box => box.height)).size).toBe(1);
    expect(team.x).toBe(damage.x);
    expect(role.x).toBe(buff.x);
    expect(team.y).toBe(role.y);
    expect(damage.y).toBe(buff.y);
    expect(damage.y).toBeGreaterThan(team.y);
  };
  await checkTiles();
  const grid = calculator.locator('.factor-grid');
  const bounds = await grid.locator('details').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  expect(bounds[0].width).toBe((await grid.boundingBox())!.width);
  expect(bounds[1].y).toBe(bounds[2].y);
  await expect(calculator.locator('.calculator-build .equipment-list > article')).toHaveCount(5);
  const base = calculator.locator('.factor-card').filter({ hasText: '属性 × 倍率区' });
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
  const candidateAttack = 18.87648 * 8.349 + 67.54129 + 32.93 * 5.968 + 46.7;
  await expect(calculator.locator('.calculator-build [data-stat-value="attack"]')).toHaveText(String(Math.round(candidateAttack)));
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
  await checkTiles();
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
  await saveCatalogCharacter(calculator, '凯亚');
  await selectHit(calculator, 'kaeya.burst');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByLabel('命中时刻（秒）', { exact: true }).fill('1');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByTestId('calculator-value')).toHaveText(/^[\d,.]+$/);
  await expect(calculator.getByRole('combobox', { name: '捕获时点', exact: true })).toHaveValue('before');
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
  await saveCatalogCharacter(calculator, '凯亚');
  await selectHit(calculator, 'kaeya.skill');
  await calculator.getByRole('combobox', { name: '暴击', exact: true }).selectOption('noncritical');
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 3.824 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByRole('button', { name: '选择增益', exact: true }).click();
  await calculator.getByLabel('生命比例（%）', { exact: true }).click();
  await expect(calculator.getByLabel('生命比例（%）', { exact: true })).toBeFocused();
  await calculator.getByLabel('生命比例（%）', { exact: true }).fill('90');
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
  await expect(calculator.locator('.damage-totals')).toContainText('模型估算');
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
    return { characterId: next.characters[0].id, equipment: next.characters[0].equipment };
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
  const storedAccount = await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0')!);
  const linked = (await readDocument<LocalAccount>(page, 'account', storedAccount)).characters[0];
  expect(linked.id).toBe(before.characterId);
  expect(linked.equipment).toEqual(before.equipment);
  expect(linked.build?.weapon?.id).toBe('dullblade');
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
  await expect(calculator.locator('.damage-totals')).toContainText('模型估算');
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await calculator.getByText('角色定义', { exact: true }).click();
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  const review = page.getByRole('dialog', { name: '更新计算副本内容', exact: true });
  await expect(review).toContainText('角色定义（4 → 6）');
  await review.getByRole('button', { name: '关闭更新计算副本内容', exact: true }).click();
  await expect(calculator.locator('.damage-totals')).toContainText('模型估算');
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  await review.getByRole('button', { name: '采用当前内容并重算', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await expect(calculator.locator('.damage-totals')).not.toContainText('模型估算');
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
  await saveCatalogCharacter(calculator, entry.name);
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
      { subject: { kind: 'actor', id: dealer }, values: { onField: flag(true), 'nicole.blessedDirection': flag(false) } },
      { subject: { kind: 'event' }, values: { 'nicole.projectionReady': flag(true) } },
    ];
    return JSON.stringify(packDocument('damage-calculator', file));
  }, { nicole, kaeya });
  await page.getByTestId('workspace-nav-calculator').click();
  const calculator = page.getByRole('region', { name: '伤害计算', exact: true });
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '造影.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  const expected = (kaeya.character.attributes.base.attack + kaeya.weapon!.baseAttack) * 1.8 * .5 * .65;
  const shown = () => calculator.getByTestId('calculator-value').textContent();
  await expect.poll(async () => Number((await shown())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  const reactions = calculator.getByRole('combobox', { name: '反应', exact: true });
  await expect(reactions.locator('option[value="melt"]')).toHaveCount(1);
  await expect(reactions.locator('option[value="vaporize"]')).toHaveCount(0);
  await calculator.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await expect(picker.getByRole('combobox', { name: '凯亚 · 站场', exact: true }).first()).toHaveValue('true');
  await picker.getByRole('combobox', { name: '本击 · 本次奥迹造影可触发', exact: true }).selectOption('false');
  await picker.getByRole('button', { name: '应用增益' }).click();
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect.poll(shown).toMatch(/^0(?:\.0+)?$/);
});

test('party infusion changes Kaeya’s resistance and reaction choices and survives Worker replay', async ({ page }, info) => {
  const levelOne = { artifacts: [], sets: [], level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0,
    refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const members: Build[] = await Promise.all([['kaeya', 'dullblade'], ['candace', 'beginnersprotector'], ['chongyun', 'wastergreatsword']]
    .map(async ([id, weapon]) => ({ ...await catalogSnapshotFields(id, weapon), ...levelOne })));
  await page.goto('/');
  const content = await page.evaluate(async ([kaeya, ...party]) => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy, addActorFromBuild } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const enemy = defaultEnemy();
    enemy.level = 1;
    Object.assign(enemy.resistances, { physical: .1, hydro: .3, cryo: .4 });
    const { id, namespace, revision } = kaeya.character;
    const doc = createDamageCalculation(kaeya, { hit: { definition: { group: 'characters', id, namespace, revision },
      hitId: 'kaeya.normal.param1' }, crit: 'noncritical', reaction: 'none' }, enemy);
    for (const member of party) addActorFromBuild(doc.project, member);
    return JSON.stringify(packDocument('damage-calculator', doc));
  }, members);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc = page.getByRole('region', { name: '伤害计算', exact: true });
  const open = calc.getByLabel('打开伤害计算文件', { exact: true });
  await open.setInputFiles({ name: '队伍附魔.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  const infusion = calc.getByLabel('本击队伍附魔');
  const reaction = calc.getByRole('combobox', { name: '反应', exact: true });
  const baseDamage = (members[0].character.attributes.base.attack + members[0].weapon!.baseAttack) * .5375 * .5;
  const verify = (factor: number) => expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', '')))
    .toBeCloseTo(baseDamage * factor, 5);
  for (const [element, factor] of [['none', .9], ['hydro', .7], ['cryo', .6]] as const) {
    await infusion.selectOption(element);
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await verify(factor);
    await expect(reaction.locator('option[value="vaporize"]')).toHaveCount(element === 'hydro' ? 1 : 0);
    await expect(reaction.locator('option[value="melt"]')).toHaveCount(element === 'cryo' ? 1 : 0);
  }
  const waiting = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('infusion.json');
  await (await waiting).saveAs(file);
  await open.setInputFiles(file);
  await expect(infusion).toHaveValue('cryo');
  await verify(.6);
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
  const swirl = calc.locator('button[data-reaction="swirl"]');
  const reactionGroup = calc.getByRole('region', { name: '剧变反应', exact: true });
  await revealDamageCard(swirl);
  const ingredients = {
    shatter: ['cryo','physical'], superconduct: ['cryo','electro'], swirl: ['anemo','pyro'],
    burning: ['dendro','pyro'], overloaded: ['pyro','electro'], 'electro-charged': ['hydro','electro'],
    bloom: ['hydro','dendro'], burgeon: ['hydro','dendro','pyro'], hyperbloom: ['hydro','dendro','electro'],
  };
  for (const [family, elements] of Object.entries(ingredients)) {
    const card = reactionGroup.locator('[data-reaction="' + family + '"]');
    await card.scrollIntoViewIfNeeded();
    expect(await card.locator('[data-element]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-element')))).toEqual(elements);
    await expect.poll(() => card.locator('img').evaluateAll(images => images.filter(image => image instanceof HTMLImageElement && image.naturalWidth > 0).length)).toBe(elements.length);
  }
  const picker = calc.getByRole('dialog', { name: '选择伤害' });
  const search = picker.getByRole('textbox', { name: '搜索伤害' });
  await page.setViewportSize({ width: 1280, height: 1080 });
  await search.fill('剧变反应');
  await search.scrollIntoViewIfNeeded();
  await picker.screenshot({ path: info.outputPath('reaction-cards.png') });
  await chooseDamageCard(swirl);
  const element = calc.getByRole('combobox', { name: '扩散元素', exact: true });
  await expect(element).toHaveValue('pyro');
  await element.selectOption('hydro');
  const homeCard = calc.getByRole('button', { name: '选择伤害', exact: true });
  await expect(homeCard.locator('[data-element="hydro"]')).toBeVisible();
  await expect(homeCard.locator('.value')).toContainText('等级系数');
  await homeCard.click();
  await revealDamageCard(swirl);
  await expect(swirl.locator('[data-element="hydro"]')).toBeVisible();
  await swirl.click();
  await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(17.165606 * .6 * .9, 5);
  await element.selectOption('pyro');
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

test('Nahida C2 marked Bloom keeps its target condition and expected crit in a reopened calculator', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('nahida', 'apprenticesnotes'), artifacts: [], sets: [], level: 1,
    ascension: 0, constellation: 2, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  await page.goto('/');
  const content = await page.evaluate(async build => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    const { id, namespace, revision } = build.character;
    const enemy = defaultEnemy();
    enemy.resistances.dendro = .1;
    const doc = createDamageCalculation(build, { hit: { definition: { group: 'characters', id, namespace, revision }, hitId: build.character.talents[0].hits[0].id }, crit: 'noncritical', reaction: 'none' }, enemy);
    return JSON.stringify(packDocument('damage-calculator', doc));
  }, build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc = page.getByRole('region', { name: '伤害计算', exact: true });
  const open = calc.getByLabel('打开伤害计算文件', { exact: true });
  await open.setInputFiles({ name: '纳西妲.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(calc.locator('button[data-reaction="bloom"]'));
  const critical = calc.getByRole('combobox', { name: '暴击', exact: true });
  for (const [mark, mode, factor] of [['false', 'expected', 1], ['true', 'critical', 2], ['true', 'expected', 1.2]] as const) {
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择增益' });
    const marks = dialog.getByRole('combobox', { name: /目标被纳西妲施加蕴种印/ });
    await marks.first().selectOption(mark);
    for (const field of await marks.all()) await expect(field).toHaveValue(mark);
    await dialog.getByRole('button', { name: '应用增益' }).click();
    await critical.selectOption(mode);
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(17.165606 * 2 * .9 * factor, 4);
  }
  const waiting = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('marked-bloom.json');
  await (await waiting).saveAs(file);
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', readFileSync(file, 'utf8'));
  const reaction = saved.project.timeline.find(row => row.id === saved.recordId)?.reactionEvent;
  expect(reaction?.facts?.find(row => row.subject.kind === 'target')?.values['nahida.seedMark']?.value?.value).toBe(true);
  expect(reaction?.contributors[0].crit).toBe('expected');
  await open.setInputFiles(file);
  await expect(critical).toHaveValue('expected');
  await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(17.165606 * 2 * .9 * 1.2, 4);
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
  const check=(layers:number, critFactor = 1)=>expect.poll(async()=>Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(base*(1+.12*layers)*critFactor,5);
  await check(0);
  await calc.getByRole('button',{name:'选择增益',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'选择增益'});
  await dialog.getByRole('checkbox',{name:/黑岩长剑/}).check();
  await dialog.getByLabel('第1层剩余时间（秒）').fill('2');
  await dialog.getByRole('button',{name:'增加一层'}).click();
  await dialog.getByLabel('第2层剩余时间（秒）').fill('4');
  await dialog.getByRole('button',{name:'应用增益'}).click();
  await check(2);
  const mode = calc.getByRole('combobox', { name: '暴击', exact: true });
  await mode.selectOption('expected');
  await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expectedCrit = 1 + .05 * (.5 + .08);
  await check(2, expectedCrit);
  const downloading=page.waitForEvent('download');
  await calc.getByRole('button',{name:'导出计算文件',exact:true}).click();
  const file=info.outputPath('黑岩剩余时间.json');await (await downloading).saveAs(file);
  await open.setInputFiles(file);
  await expect(mode).toHaveValue('expected');
  await check(2, expectedCrit);
  for(const [time,layers] of [[2,1],[4,0]]) {
    await calc.getByLabel('命中时刻（秒）',{exact:true}).fill(String(time));
    await calc.getByRole('button',{name:'计算伤害',exact:true}).click();
    await check(layers, expectedCrit);
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

test('Gaming C1 records confirmed reunion healing in the calculator and reopens the recipient in the Worker', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('gaming','wastergreatsword'), level:1, ascension:0, constellation:1,
    weaponLevel:1, weaponAscension:0, refinement:1, talents:{normal:1,skill:1,burst:1}, artifacts:[], sets:[] };
  const { calc, open } = await openSingleBuild(page, build);
  const form = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText:/^技能治疗$/ }) });
  await form.locator('summary').click();
  const choice = form.getByLabel('治疗来源');
  await expect(choice.locator('option')).toContainText(['通明庇佑']);
  await expect(choice.locator('option').filter({hasText:'踏云献瑞命中后每次恢复'})).toHaveCount(0);
  await choice.selectOption({ label: '嘉明 · 通明庇佑 · 猊兽·文仔会合恢复' });
  await form.getByLabel('本次猊兽·文仔成功与嘉明会合').selectOption('true');
  await form.getByRole('button',{name:'记录一次治疗'}).click();
  const expected = (957.38055 * .15).toLocaleString('zh-CN', { maximumFractionDigits:4 });
  const changes = calc.locator('details').filter({has:page.locator('summary').filter({hasText:/^战斗触发与回能$/})});
  await expect(changes).toContainText(expected + ' 点治疗');
  const pending = page.waitForEvent('download');
  await calc.getByRole('button', {name:'导出计算文件',exact:true}).click();
  const file = info.outputPath('gaming-heal.json');
  await (await pending).saveAs(file);
  await open.setInputFiles(file);
  await expect(changes).toContainText(expected + ' 点治疗');
});

for (const weapon of [
  { id: 'ultimateoverlordsmegamagicsword', character: 'noelle', state: /美露莘声援当次进度/, mode: '按任务进度',
    amount: /已完成的魔剑声援任务检查项/, inputs: [['3', '6%'], ['4', '8%']] },
  { id: 'hereticsmoltenblade', character: 'kaeya', state: /初光当次状态/, mode: '按上一秒移动距离',
    amount: /初光记录的上一秒移动距离/, inputs: [['3.5', '27%'], ['1.75', '22.5%']] },
]) {
  test(`variable weapon condition for ${weapon.id} replays its entered value in the calculator Worker`, async ({ page }, info) => {
    const build: Build = { ...await catalogSnapshotFields(weapon.character, weapon.id), level: 1, ascension: 0, constellation: 0,
      weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
    const { calc, open } = await openSingleBuild(page, build);
    const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
    for (const [input, expected] of weapon.inputs) {
      await calc.getByRole('button', { name: '选择增益', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '选择增益' });
      await picker.getByRole('combobox', { name: weapon.state }).first().selectOption(weapon.mode);
      await picker.getByRole('spinbutton', { name: weapon.amount }).first().fill(input);
      await picker.getByRole('combobox', { name: '站场', exact: true }).first().selectOption('true');
      await picker.getByRole('button', { name: '应用增益' }).click();
      await expect(values.locator('dd', { hasText: expected })).toHaveText(expected);
    }
    const downloading = page.waitForEvent('download');
    await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
    const file = info.outputPath(weapon.id + '.json');
    await (await downloading).saveAs(file);
    await open.setInputFiles(file);
    await expect(values.locator('dd', { hasText: weapon.inputs[1][1] })).toHaveText(weapon.inputs[1][1]);
  });
}

test('Kaveh retains his burst attack speed when applying another condition and reopening the calculation', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('kaveh', 'wastergreatsword'), level: 1, ascension: 0, constellation: 2,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build, 'kaveh.burst');
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  const speed = values.locator('dl > div').filter({ has: page.locator('dt', { hasText: '御驿的径迹' }) }).locator('dd');
  await expect(speed).toHaveText('15%');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await expect(picker.getByRole('checkbox', { name: /御驿的径迹/ })).toBeChecked();
  await picker.getByRole('combobox', { name: '护盾存在', exact: true }).first().selectOption('true');
  await picker.getByRole('button', { name: '应用增益' }).click();
  await expect(speed).toHaveText('15%');
  const downloading = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const path = info.outputPath('kaveh-burst-speed.json');
  await (await downloading).saveAs(path);
  await open.setInputFiles(path);
  await expect(speed).toHaveText('15%');
});

test('Sword of Descension grants its platform bonus to both Travelers across forms', async ({ page }) => {
  for (const character of ['aether-anemo', 'lumine-hydro', 'kaeya']) {
    const build: Build = { ...await catalogSnapshotFields(character, 'swordofdescension'), level: 1, ascension: 0, constellation: 0,
      weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
    const { calc } = await openSingleBuild(page, build);
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择增益' });
    const option = picker.getByRole('checkbox', { name: /降临之剑/ });
    if (character === 'kaeya') {
      await expect(option).toHaveCount(0);
      continue;
    }
    await option.check();
    await picker.getByRole('button', { name: '应用增益' }).click();
    const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
    await expect(values.locator('dl > div').filter({ has: page.locator('dt', { hasText: '固定攻击力' }) }).locator('dd')).toHaveText('66');
  }
});

for (const item of [
  { weapon: 'amenomakageuchi', actor: 'kaeya', rank: 3, option: /天目影打刀.*本次直接恢复的元素能量/, trigger: /元素爆发消耗胤种后已满2秒/,
    amount: /本次爆发消耗的胤种/, label: '本次直接恢复的元素能量', expected: 2 * 9 },
  { weapon: 'thebell', actor: 'noelle', rank: 1, option: /钟剑.*护盾初始吸收量/, trigger: /持有者承伤后本次已生成钟剑护盾/,
    label: '护盾初始吸收量', expected: 1012.088 * 1.09 * .2 },
  { weapon: 'aquilafavonia', actor: 'kaeya', rank: 1, option: /风鹰剑.*本次装备治疗量/, trigger: /承伤后西风鹰之魂已触发/,
    label: '本次装备治疗量', expected: (18.6984 + 47.537) * 1.2 },
]) {
  test(`confirmed equipment output for ${item.weapon} is available in a saved calculation`, async ({ page }, info) => {
    const build: Build = { ...await catalogSnapshotFields(item.actor, item.weapon), level: 1, ascension: 0, constellation: 0,
      weaponLevel: 1, weaponAscension: 0, refinement: item.rank, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
    const { calc, open } = await openSingleBuild(page, build);
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择增益' });
    await picker.getByRole('checkbox', { name: item.option }).check();
    await picker.getByRole('combobox', { name: item.trigger }).selectOption('true');
    if (item.amount) await picker.getByRole('spinbutton', { name: item.amount }).fill('2');
    await picker.getByRole('button', { name: '应用增益' }).click();
    const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
    const value = values.locator('dl > div').filter({ has: page.locator('dt', { hasText: item.label }) }).locator('dd');
    const expected = item.expected.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
    await expect(value).toHaveText(expected);
    const download = page.waitForEvent('download');
    await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
    const path = info.outputPath(item.weapon + '.json');
    await (await download).saveAs(path);
    await open.setInputFiles(path);
    await expect(value).toHaveText(expected);
  });
}

test('Alhaitham C1 saves the current projection hit and its one-second trigger interval', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('alhaitham', 'dullblade'), level: 1, ascension: 0, constellation: 1,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(page.getByRole('dialog', { name: '选择伤害' }).locator('button[data-hit-id="alhaitham.skill.param4"]'));
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  await picker.getByRole('checkbox', { name: /直观.*元素战技冷却减少量/ }).check();
  await picker.getByRole('combobox', { name: /自己的光幕攻击本次命中敌人/ }).selectOption('true');
  const interval = picker.getByRole('combobox', { name: /距上次触发此冷却缩减至少1秒/ });
  await interval.selectOption('true');
  await picker.getByRole('button', { name: '应用增益' }).click();
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  const reduction = values.locator('dl > div').filter({ has: page.locator('dt', { hasText: '元素战技冷却减少量' }) }).locator('dd');
  await expect(reduction).toHaveText('1.2 秒');
  const downloading = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const path = info.outputPath('alhaitham-c1.json');
  await (await downloading).saveAs(path);
  await open.setInputFiles(path);
  await expect(reduction).toHaveText('1.2 秒');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  await expect(interval).toHaveValue('true');
  await interval.selectOption('false');
  await picker.getByRole('button', { name: '应用增益' }).click();
  await expect(reduction.filter({ hasText: '1.2 秒' })).toHaveCount(0);
});

test('Yanfei selects a seal count for one charged hit and needs C6 for the fourth seal', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('yanfei', 'apprenticesnotes'), level: 1, ascension: 0, constellation: 5,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  for (const constellation of [5, 6]) {
    const { calc } = await openSingleBuild(page, { ...build, constellation });
    await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择伤害' });
    await expect(picker.locator('button[data-hit-id="yanfei.normal.param4"]')).toContainText('消耗0枚丹火印');
    const fourSeals = picker.locator('button[data-hit-id="yanfei.normal.param8"]');
    await revealDamageCard(fourSeals);
    await expect(fourSeals).toContainText('消耗4枚丹火印');
    if (constellation === 5) {
      await expect(fourSeals).toBeDisabled();
      await expect(fourSeals).toContainText('需要命座 6');
      await chooseDamageCard(picker.locator('button[data-hit-id="yanfei.normal.param5"]'));
      const cost = calc.locator('dl > div').filter({ has: page.locator('dt', { hasText: '本次重击体力消耗（点）' }) }).locator('dd');
      await expect(cost).toHaveText('37.5');
    } else {
      await chooseDamageCard(fourSeals);
      await expect(calc.getByRole('button', { name: '选择伤害', exact: true })).toHaveAttribute('data-hit-id', 'yanfei.normal.param8');
      await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeGreaterThan(0);
      const cost = calc.locator('dl > div').filter({ has: page.locator('dt', { hasText: '本次重击体力消耗（点）' }) }).locator('dd');
      await expect(cost).toHaveText('0');
      await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
      await chooseDamageCard(picker.locator('button[data-hit-id="yanfei.normal.param1"]'));
      await expect(cost).toHaveCount(0);
    }
  }
});

test('Freminet clears the recorded remaining cooldown once when the burst cast is confirmed', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('freminet', 'wastergreatsword'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(page.getByRole('dialog', { name: '选择伤害' }).locator('button[data-hit-id="freminet.burst.param1"]'));
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /本次清除的元素战技冷却/ }).check();
  const cast = picker.getByRole('combobox', { name: /本次已施放猎影潜袭/ });
  await cast.selectOption('true');
  await picker.getByRole('spinbutton', { name: /重置前正在恢复的战技剩余冷却/ }).fill('3500');
  await picker.getByRole('button', { name: '应用增益' }).click();
  const reduction = calc.locator('dl > div').filter({ has: page.locator('dt', { hasText: '本次清除的元素战技冷却' }) }).locator('dd');
  await expect(reduction).toHaveText('3.5 秒（重置后 0 秒）');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  await cast.selectOption('false');
  await picker.getByRole('button', { name: '应用增益' }).click();
  await expect(reduction).toHaveCount(0);
});

test('Cool Steel reads either aura on the current enemy and applies the damage bonus once', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('kaeya', 'coolsteel'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  const picker = page.getByRole('dialog', { name: '选择增益' });
  const value = calc.getByTestId('calculator-value');
  async function setTargetAura(hydro: boolean, cryo: boolean) {
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    await picker.getByRole('combobox', { name: /水元素附着/ }).selectOption(String(hydro));
    await picker.getByRole('combobox', { name: /冰元素附着/ }).selectOption(String(cryo));
    await picker.getByRole('button', { name: '应用增益' }).click();
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await expect(value).toHaveText(/^[\d,.]+$/);
    return Number((await value.textContent())?.replaceAll(',', ''));
  }
  const baseline = await setTargetAura(false, false);
  expect(baseline).toBeGreaterThan(0);
  for (const [hydro, cryo] of [[true, false], [false, true], [true, true]]) {
    expect(await setTargetAura(hydro, cryo)).toBeCloseTo(baseline * 1.12, 3);
  }
});

test('Xiangling saves the ordinal of a repeated hit and replays its single-hit amount', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('xiangling', 'beginnersprotector'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const choose = async (id: string) => {
    await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
    await chooseDamageCard(page.getByRole('dialog', { name: '选择伤害' }).locator('button[data-hit-id="' + id + '"]'));
  };
  await choose('xiangling.normal.param4');
  const ordinal = calc.getByRole('combobox', { name: '本次命中序号' });
  await ordinal.selectOption('1');
  const calculate = calc.getByRole('button', { name: '计算伤害', exact: true });
  await calculate.click();
  const value = calc.getByTestId('calculator-value');
  await expect.poll(async () => Number((await value.textContent())?.replaceAll(',', ''))).toBeGreaterThan(0);
  const first = (await value.textContent())!;
  await ordinal.selectOption('4');
  await calculate.click();
  await expect(value).toHaveText(first);
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const path = info.outputPath('xiangling-fourth-strike.json');
  await (await download).saveAs(path);
  await open.setInputFiles(path);
  await expect(ordinal).toHaveValue('4');
  await expect(value).toHaveText(first);
  await choose('xiangling.normal.param3');
  await expect(ordinal).toHaveValue('1');
  await expect(ordinal.getByRole('option')).toHaveCount(3);
  await choose('xiangling.normal.param1');
  await expect(ordinal).toHaveCount(0);
});

test('Amber shows the range and crit rate of Fiery Rain on its own hit', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('amber', 'huntersbow'), level: 20, ascension: 1, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  await selectHit(calc, 'amber.burst');
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  const row = (label: string) => values.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
  await expect(row('影响范围加成')).toHaveText('30%');
  await expect(row('暴击率')).toHaveText('10%');
  await selectHit(calc, 'amber.normal');
  await expect(row('影响范围加成')).toHaveCount(0);
});

test('Ganyu can confirm the first Frostflake Arrow and keep its charge requirement on replay', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('ganyu', 'huntersbow'), level: 1, ascension: 0, constellation: 6,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const choose = async (id: string) => {
    await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
    await chooseDamageCard(page.getByRole('dialog', { name: '选择伤害' }).locator('button[data-hit-id="' + id + '"]'));
  };
  await choose('ganyu.normal.param9');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /履虫/ }).check();
  await picker.getByRole('button', { name: '应用增益' }).click();
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  await expect(values).toContainText('本次免蓄力');
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const path = info.outputPath('ganyu-aim-charge.json');
  await (await download).saveAs(path);
  await open.setInputFiles(path);
  await expect(values).toContainText('本次免蓄力');
  await choose('ganyu.normal.param10');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  await expect(picker.getByRole('checkbox', { name: /履虫/ })).toHaveCount(0);
});

test('Sigewinne refunds fractional energy from the actual Bond of Life cleared', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('sigewinne', 'huntersbow'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /弹跳水疗法.*本次直接恢复的元素能量/ }).check();
  await picker.getByRole('combobox', { name: /本次触发希格雯战技的生命之契完全清除回能/ }).selectOption('true');
  await picker.getByRole('spinbutton', { name: /本次清除前累计实际偿还的生命之契/ }).fill('2500');
  await picker.getByRole('button', { name: '应用增益' }).click();
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  const energy = values.locator('dl > div').filter({ has: page.locator('dt', { hasText: '本次直接恢复的元素能量' }) }).locator('dd');
  await expect(energy).toHaveText('1.25');
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const path = info.outputPath('sigewinne-energy.json');
  await (await download).saveAs(path);
  await open.setInputFiles(path);
  await expect(energy).toHaveText('1.25');
});

test('Vodyanitsa heals from the recorded recipient HP and her stacks before that heal', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('vodyanitsa', 'apprenticesnotes'), level: 1, ascension: 0, constellation: 4,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const form = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^技能治疗$/ }) });
  await form.locator('summary').click();
  const heal = form.getByLabel('治疗来源');
  await heal.selectOption(await heal.locator('option').filter({ hasText: '遥久之歌治疗量' }).getAttribute('value') as string);
  await form.getByRole('combobox', { name: '站场', exact: true }).selectOption('true');
  const hp = form.getByLabel(/受治疗队员生命比例/);
  const stacks = form.getByLabel(/本次治疗前的四命生命加成层数/);
  const record = form.getByRole('button', { name: '记录一次治疗' });
  const changes = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^战斗触发与回能$/ }) });
  const expected = (layers: number, low: boolean) => ((357.27 + 1153.5172 * (1 + .2 * layers) * .035) * (low ? 1.5 : 1))
    .toLocaleString('zh-CN', { maximumFractionDigits: 4 }) + ' 点治疗';
  await stacks.fill('0');
  await hp.fill('39');
  await record.click();
  await expect(changes).toContainText(expected(0, true));
  await stacks.fill('2');
  await hp.fill('40');
  await record.click();
  await expect(changes).toContainText(expected(2, false));
  const downloaded = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const path = info.outputPath('vodyanitsa-healing.json');
  await (await downloaded).saveAs(path);
  await open.setInputFiles(path);
  await expect(changes).toContainText(expected(0, true));
  await expect(changes).toContainText(expected(2, false));
});

test('Sigewinne takes the party Bond of Life from the healing form and keeps her underwater base amount on replay', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('sigewinne', 'huntersbow'), level: 70, ascension: 4, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const form = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^技能治疗$/ }) });
  await form.locator('summary').click();
  const heal = form.getByLabel('治疗来源');
  const selectHeal = async (name: string) => heal.selectOption(await heal.locator('option').filter({ hasText: name }).getAttribute('value') as string);
  const total = form.getByRole('spinbutton', { name: /队伍所有角色当前生命之契总值/ });
  const record = form.getByRole('button', { name: '记录一次治疗' });
  await selectHeal('弹跳结束治疗量');
  await total.fill('-1');
  await expect(record).toBeDisabled();
  await total.fill('5000');
  await record.click();
  // Captured Sigewinne growth at 70/4 and E talent rank 1. A4 contributes 15% at 5,000 party Bond.
  const base = (1039.1188 * 6.94 + 3001.0962) * 1.144 * .5;
  const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  const changes = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^战斗触发与回能$/ }) });
  await expect(changes).toContainText(format(base * 1.15) + ' 点治疗');
  await selectHeal('急性剂量2.5秒基础总回复');
  await form.getByLabel(/在水下，本次生命值刚降到阈值/).selectOption('true');
  await form.getByRole('combobox', { name: '站场', exact: true }).selectOption('true');
  await form.getByLabel(/受治疗队员生命比例/).fill('49');
  await total.fill('5000');
  await record.click();
  await expect(changes).toContainText('基础治疗量 ' + format(base) + ' 点，缺少记录：');
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('sigewinne-healing.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await expect(changes).toContainText(format(base * 1.15) + ' 点治疗');
  await expect(changes).toContainText('基础治疗量 ' + format(base) + ' 点，缺少记录：');
});

test('Zhongli C6 uses the entered Jade Shield damage and recipient cap in a saved calculator', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('zhongli', 'beginnersprotector'), level: 1, ascension: 0, constellation: 6,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const form = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^技能治疗$/ }) });
  await form.locator('summary').click();
  await expect(form.getByLabel('治疗来源')).toContainText('玉璋护盾受击回复');
  await form.getByLabel(/本次为钟离的玉璋护盾有效受击/).selectOption('true');
  await form.getByRole('combobox', { name: '站场', exact: true }).selectOption('true');
  const damage = form.getByRole('spinbutton', { name: '本次玉璋护盾触发回复所采用的伤害量' });
  const record = form.getByRole('button', { name: '记录一次治疗' });
  await damage.fill('-1');
  await expect(record).toBeDisabled();
  for (const value of ['100', '1000']) {
    await damage.fill(value);
    await record.click();
  }
  const changes = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^战斗触发与回能$/ }) });
  const capped = (1143.984 * .08).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  await expect(changes).toContainText('40 点治疗');
  await expect(changes).toContainText(capped + ' 点治疗');
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('zhongli-healing.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await expect(changes).toContainText('40 点治疗');
  await expect(changes).toContainText(capped + ' 点治疗');
});

test('Nicole takes Memory of Dust stacks from her skill cast and replays the recorded attack bonus', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('nicole', 'memoryofdust'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build, 'nicole.skill');
  const source = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /圣言默示.*施放时的增益条件/ }) });
  await source.locator('summary').click();
  const layers = source.getByRole('spinbutton', { name: /命中后的当前攻击层数/ });
  await layers.fill('4');
  await layers.press('Tab');
  await source.getByRole('combobox', { name: /护盾存在/ }).selectOption('true');
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  await values.locator('summary').click();
  const bonus = values.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: /圣言默示.* · 攻击力$/ }) }).locator('dd');
  const expected = (count: number) => ((26.6266 + 45.9364) * (1 + .108 + count * .04 * 2) * .0825).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  await expect(bonus).toHaveText(expected(4));
  await layers.fill('5');
  await layers.press('Tab');
  await expect(bonus).toHaveText(expected(5));
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('nicole-kenosis.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await expect(bonus).toHaveText(expected(5));
});

test('Columbina revives the selected local character using the entered friendship, including after replay', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('columbina', 'apprenticesnotes'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const form = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^技能治疗$/ }) });
  await form.locator('summary').click();
  const choice = form.getByLabel('治疗来源');
  await choice.selectOption(await choice.locator('option').filter({ hasText: '月的守望·复苏生命值' }).getAttribute('value') as string);
  for (const label of [/该受益角色本次倒下/, /倒下的是自己的场上角色/, /复苏的100秒限次已就绪/, /本次位于挪德卡莱或霜月区域/, /本次不在秘境/]) {
    await form.getByRole('combobox', { name: label }).selectOption('true');
  }
  const friendship = form.getByRole('spinbutton', { name: /复苏采样的哥伦比娅好感等级/ });
  const record = form.getByRole('button', { name: '记录一次治疗' });
  await friendship.fill('11');
  await expect(record).toBeDisabled();
  await friendship.fill('5');
  await record.click();
  const changes = calc.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^战斗触发与回能$/ }) });
  await expect(changes).toContainText('571.992 点治疗');
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('columbina-revival.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await expect(changes).toContainText('571.992 点治疗');
});

for (const [id, weapon, excluded] of [
  ['varesa', 'apprenticesnotes', /炽心，一往直前|夜域赐礼|食物.*燃素|非战斗冲刺/],
  ['iansan', 'beginnersprotector', /勉力传动|坠落伤害/],
  ['ifa', 'apprenticesnotes', /温敷战术包扎|受魂附的龙/],
] as const) test(id + ' omits exploration buffs and their controls', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields(id, weapon), level: 80, ascension: 5, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  const buffSlot = calc.getByRole('button', { name: '选择增益', exact: true });
  await buffSlot.click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await expect(picker).toBeVisible();
  await expect(picker).not.toContainText(excluded);
  if (id === 'varesa') await expect(picker.getByRole('checkbox', { name: /英雄，二度归来/ })).toHaveCount(1);
  await picker.getByRole('button', { name: '应用增益' }).click();
  await expect(buffSlot).not.toContainText(excluded);
});

test('Lisa hold resistance displays the sourced multiplier alongside unchanged outgoing damage', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('lisa', 'apprenticesnotes'), level: 1, ascension: 0, constellation: 2,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  await selectHit(calc, 'lisa.burst');
  const damage = calc.getByTestId('calculator-value');
  await expect(damage).toHaveText(/^\d/);
  const baseline = await damage.textContent();
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /空间电势结界/ }).check();
  await picker.getByRole('button', { name: '应用增益' }).click();
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  await values.locator('summary').click();
  const multiplier = values.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: '受到削韧倍率' }) }).locator('dd');
  await expect(multiplier).toHaveText('× 0.5');
  await expect(damage).toHaveText(baseline!);

  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('lisa-hold-resistance.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await expect(multiplier).toHaveText('× 0.5');
  await expect(damage).toHaveText(baseline!);
});

test('scene ranges and interruption resistance use the selected reaction and stack count in the Worker', async ({ page }, info) => {
  const snapshot = structuredClone(await catalogSnapshotFields('kaeya', 'dullblade'));
  const bundle = snapshot.character.calculation.bundle;
  bundle.attributes = bundle.attributes.filter(attribute => !['attribute.actorEndureDelta', 'attribute.reaction.electro-charged.rangeBonus'].includes(attribute.identity.id));
  const build: Build = { ...snapshot, level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  await calc.getByText('场景效果', { exact: true }).click();
  const scene = calc.getByRole('combobox', { name: '场地', exact: true });
  await scene.selectOption('scene.field.domainofblessingspringi.0');
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(page.getByRole('dialog', { name: '选择伤害' }).locator('button[data-reaction="electro-charged"]'));
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  await values.locator('summary').click();
  const amount = (label: string) => values.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: label }) }).locator('dd');
  await expect(amount('感电影响范围加成')).toHaveText('100%');
  await scene.selectOption('scene.field.domainofforgeryartisanshipi.0');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('spinbutton', { name: /当前水伤层数/ }).first().fill('5');
  await picker.getByRole('button', { name: '应用增益' }).click();
  await expect(amount('抗打断参数增量')).toHaveText('0.3');
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('scene-range-poise.json');
  await (await download).saveAs(file);
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', readFileSync(file, 'utf8'));
  expect(saved.project.sceneEffects?.some(scene => scene.definition.dependencies?.attributes.some(attribute => attribute.identity.id === 'attribute.actorEndureDelta'))).toBe(true);
  expect(saved.project.candidate.actors[0].build?.character.metadata).toEqual(snapshot.character.metadata);
  await open.setInputFiles(file);
  await expect(amount('抗打断参数增量')).toHaveText('0.3');
});

test('Prototype Amber shows one confirmed healing and energy tick after reopening the calculator', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('lisa', 'prototypeamber'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, artifacts: [], sets: [], talents: { normal: 1, skill: 1, burst: 1 } };
  const { calc, open } = await openSingleBuild(page, build);
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /试作金珀/ }).check();
  await picker.getByRole('button', { name: '应用增益' }).click();
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  await values.locator('summary').click();
  const amount = (label: string) => values.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: label }) }).locator('dd');
  const healing = (802.3761 * 1.09 * .04).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  await expect(amount('本次装备治疗量')).toHaveText(healing);
  await expect(amount('本次直接恢复的元素能量')).toHaveText('4');
  const downloaded = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('prototype-amber.json');
  await (await downloaded).saveAs(file);
  await open.setInputFiles(file);
  await expect(amount('本次装备治疗量')).toHaveText(healing);
  await expect(amount('本次直接恢复的元素能量')).toHaveText('4');
});

test('Ifa sends the entered team Nightsoul and beneficiary to a saved Swirl reaction', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('ifa', 'apprenticesnotes'), level: 20, ascension: 1, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(calc.locator('button[data-reaction="swirl"]'));
  await calc.getByRole('combobox', { name: '扩散元素', exact: true }).selectOption('pyro');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /场中医者视野/ }).check();
  await picker.getByRole('combobox', { name: /伊法处于夜魂加持状态/ }).selectOption('true');
  await picker.getByRole('combobox', { name: /救援要义的有效受益者/ }).selectOption('true');
  await picker.getByRole('spinbutton', { name: /队伍当前夜魂值总和/ }).fill('80');
  await picker.getByRole('button', { name: '应用增益' }).click();
  const expected = 80.58478 * .6 * .9 * (1 + 80 * .015);
  const read = () => expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected, 5);
  await read();
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('ifa-swirl.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await read();
});

test('Adventurer four-piece shows the full five-second base recovery and one tick on replay', async ({ page }, info) => {
  const catalog = await createRuntimeCatalog();
  const set = await catalog.get('sets', 'adventurer');
  const build: Build = { ...await catalogSnapshotFields('jean', 'dullblade'), level: 1, ascension: 0, constellation: 0, weaponLevel: 1,
    weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [set],
    theoreticalSetSlots: set.slots.slice(0, 4).map(slot => ({ slot, setId: set.id })) };
  const { calc, open } = await openSingleBuild(page, build);
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('checkbox', { name: /装备效果全程基础回复量/ }).check();
  await picker.getByRole('checkbox', { name: /装备效果单次基础回复量/ }).check();
  await picker.getByRole('button', { name: '应用增益' }).click();
  const values = calc.locator('details').filter({ has: page.getByText('本次增益数值', { exact: true }) });
  await values.locator('summary').click();
  const amount = (label: string) => values.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: label }) }).locator('dd');
  const expected = (rate: number) => ((1143.984 + 1000) * rate).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  await expect(amount('装备效果全程基础回复量')).toHaveText(expected(.3));
  await expect(amount('装备效果单次基础回复量')).toHaveText(expected(.06));
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('adventurer-recovery.json');
  await (await download).saveAs(file);
  await open.setInputFiles(file);
  await expect(amount('装备效果全程基础回复量')).toHaveText(expected(.3));
  await expect(amount('装备效果单次基础回复量')).toHaveText(expected(.06));
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
