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

async function openSingleBuild(page: Page, build: Build, castSkill?: string, observedRadiance = false) {
  await page.goto('/');
  const content = await page.evaluate(async ({ build, castSkill, observedRadiance }) => {
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
    if (observedRadiance) {
      const current = file.project.timeline[0];
      current.timeMs = 1000;
      const prior = structuredClone(current);
      prior.id = 'prior-radiance';
      prior.timeMs = 0;
      prior.damage!.facts = [{ subject: { kind: 'actor', id: file.actorId }, values: {
        radiance: { value: { kind: 'enum', value: 'stellar-swirl' }, provenance: 'explicit', sourceRefs: [] },
      } }];
      file.project.timeline.unshift(prior);
    }
    return JSON.stringify(packDocument('damage-calculator', file));
  }, { build, castSkill, observedRadiance });
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

for (const id of ['odette', 'sandrone']) test(id + ' shows the active radiance hit and talent scaling', async ({ page }) => {
  test.setTimeout(90000);
  const odette = id === 'odette';
  const build: Build = { ...await catalogSnapshotFields(id, odette ? 'dullblade' : 'wolfsgravestone'), level: 80, ascension: 5,
    constellation: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  if (odette) await selectHit(calc, 'odette.skill', 2);
  if (!odette) {
    await selectHit(calc, 'sandrone.burst', 1);
    const ordinary = calc.locator('.factor-card').filter({ has: page.locator('summary', { hasText: '属性 × 倍率区' }) });
    await ordinary.locator('summary').click();
    await expect(ordinary.locator('.rate-box')).toContainText('330.8%');
  }
  for (const [mode, hitIndex] of [['stellar-conduct', odette ? 6 : 2], ['stellar-swirl', odette ? 7 : 3]] as const) {
    await selectHit(calc, odette ? 'odette.skill' : 'sandrone.burst', hitIndex);
    if (odette) {
      await expect(calc.getByTestId('calculator-radiance')).toHaveText('星辉状态：' + (mode === 'stellar-swirl' ? '星扩散' : '星超导'));
      await expect(calc.getByTestId('calculator-critical')).toHaveText(/[1-9]/);
    }
    const card = calc.locator('.factor-card').filter({ has: page.locator('summary', { hasText: '反应基础伤害' }) });
    await expect(card).toBeVisible();
    if (await card.getAttribute('open') === null) await card.locator('summary').click();
    const ratio = mode === 'stellar-swirl' ? (odette ? 0.40528 : 3.308) : (odette ? 0.27024 : 2.205333);
    await expect(card.locator('.rate-box')).toContainText((ratio * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '%');
    const number = (s: string) => Number(s.replace(/[×,\s]/g, ''));
    const attack = number(await card.locator('.stat-box .scaling-term strong').innerText());
    const factors = await card.locator('.factor-chip dd').allTextContents();
    const product = factors.filter(value => value.startsWith('×')).reduce((total, value) => total * number(value), attack * ratio);
    expect(number(await card.locator('summary strong').innerText())).toBeCloseTo(product, 4);
    if (!odette) {
      await expect(card.locator('.stat-box')).toContainText('狼的末路');
      const factor = calc.locator('.factor-card').filter({ has: page.locator('summary', { hasText: '反应基础倍率区' }) });
      if (await factor.getAttribute('open') === null) await factor.locator('summary').click();
      await expect(factor).not.toContainText('狼的末路');
      // Sandrone's talent grants 0.7% per 100 ATK, capped at 14%.
      expect(number(await factor.locator('summary strong').innerText())).toBeCloseTo(1 + Math.min(attack * 0.00007, 0.14), 5);
    }
    await expect(calc.getByText('需要辉映·星超导或辉映·星扩散')).toHaveCount(0);
  }
  if (odette) {
    await selectHit(calc, 'odette.skill', 8);
    await expect(calc.getByTestId('calculator-radiance')).toHaveText('星辉状态：星超导');
    await selectHit(calc, 'odette.skill', 9);
    await expect(calc.getByTestId('calculator-radiance')).toHaveText('星辉状态：星扩散');
    await selectHit(calc, 'odette.skill', 4);
    await expect(calc.getByRole('combobox', { name: '星辉状态', exact: true })).toHaveValue('none');
    await expect(calc.getByTestId('calculator-radiance')).toHaveCount(0);
    await expect(calc.getByTestId('calculator-critical')).toHaveText(/[1-9]/);
    await calc.getByRole('combobox', { name: '星辉状态', exact: true }).selectOption('stellar-conduct');
    await expect(calc.getByTestId('calculator-radiance')).toHaveText('星辉状态：星超导');
    const downloadPromise = page.waitForEvent('download');
    await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
    const content = readFileSync((await (await downloadPromise).path())!, 'utf8');
    const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', content);
    expect(saved.project.timeline.find(entry => entry.id === saved.recordId)?.damage?.facts).toBeDefined();
    await calc.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: 'radiance.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(calc.getByTestId('calculator-radiance')).toHaveText('星辉状态：星超导');
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await expect(calc.getByTestId('calculator-critical')).toHaveText(/[1-9]/);
    await expect(calc.getByText('需要辉映·星超导或辉映·星扩散')).toHaveCount(0);
  }
});

test('radiance selection does not inherit a prior hit fact', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('odette', 'dullblade'), level: 80, ascension: 5,
    constellation: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build, undefined, true);
  await selectHit(calc, 'odette.skill', 6);
  await expect(calc.getByTestId('calculator-radiance')).toHaveText('星辉状态：星超导');
  await expect(calc.getByRole('combobox', { name: '星辉状态', exact: true })).toHaveValue('stellar-conduct');
  await expect(calc.getByText('需要辉映·星超导或辉映·星扩散')).toHaveCount(0);
});

test('personal infusion switches directly on the main page without opening the buff picker', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('noelle', 'wastergreatsword'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  const infusion = calc.getByRole('combobox', { name: '自身附魔', exact: true });
  await expect(infusion).toHaveValue('false');
  const monster = calc.getByRole('region', { name: '怪物属性' });
  await expect(monster.getByLabel('物理基础抗性（%）')).toBeVisible();
  const baseDamage = () => expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', '')));
  await baseDamage().toBeGreaterThan(0);
  const physicalDamage = Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''));

  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await expect(picker.getByLabel(/大扫除的武器岩元素转化持续中/)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await infusion.selectOption('true');
  await expect(monster.getByLabel('岩基础抗性（%）')).toBeVisible();
  await baseDamage().toBeGreaterThan(physicalDamage);
});

test('damage cards fit their contents and applied buff icons retain searchable names', async ({ page }, info) => {
  test.setTimeout(60000);
  const build: Build = { ...await catalogSnapshotFields('bennett', 'blackclifflongsword'), level: 80, ascension: 5, constellation: 1,
    weaponLevel: 80, weaponAscension: 5, refinement: 1, talents: { normal: 3, skill: 5, burst: 7 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  const damage = calc.getByRole('button', { name: '选择伤害', exact: true });
  const buffs = calc.getByRole('button', { name: '选择增益', exact: true });
  const face = damage.locator('.choice-card');
  await face.scrollIntoViewIfNeeded();
  await expect.poll(() => face.locator('.portrait img').evaluateAll(images =>
    images.some(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.mouse.move(0, 0);
  const rest = await face.evaluate(node => {
    const css = getComputedStyle(node);
    return { image: css.backgroundImage, color: css.backgroundColor, border: css.borderTopColor };
  });
  const box = await face.boundingBox();
  await face.screenshot({ path: info.outputPath('damage-home-rest.png') });
  for (const part of ['.portrait', '.details strong', '.note', '.value']) {
    await face.locator(part).hover();
    await expect(face).not.toHaveCSS('background-color', rest.color);
    await expect(face).toHaveCSS('border-top-color', rest.border);
    expect(await face.boundingBox()).toEqual(box);
  }
  await face.screenshot({ path: info.outputPath('damage-home-hover.png') });
  await page.mouse.move(0, 0);
  await expect(face).toHaveCSS('background-image', rest.image);
  await expect(face).toHaveCSS('background-color', rest.color);
  await face.locator('.note').click();
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
  const blackcliff = dialog.getByRole('checkbox', { name: /黑岩长剑/ });
  await expect(blackcliff).not.toBeChecked();
  await expect(dialog.getByText(/第1层剩余时间|增加一层/)).toHaveCount(0);
  await blackcliff.check();
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
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const slots = calc.locator('.calculator-selections');
    const heights = await slots.locator(':scope > *, .damage-slot .choice-card').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(heights).toEqual(Array(5).fill(width > 600 ? 140 : 114));
    expect(await slots.locator(':scope > *').evaluateAll(nodes => nodes.every(node => node.scrollHeight <= node.clientHeight + 1))).toBe(true);
    const lines = await damage.locator('.details > span').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(lines[0].bottom).toBeLessThanOrEqual(lines[1].top);
    expect(lines[1].height).toBeGreaterThan(12);
    expect(lines[1].bottom).toBeLessThanOrEqual(lines[2].top);
    await slots.screenshot({ path: info.outputPath('filled-slots-' + width + '.png') });
  }
  await damage.focus();
  await page.keyboard.press('Tab');
  await expect(buffs).toBeFocused();
  await expect(buffs.getByRole('tooltip')).toContainText('班尼特加攻');
  await page.keyboard.press('Shift+Tab');
  await expect(damage).toBeFocused();
  await expect(damage).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await calc.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await expect(damage).toBeDisabled();
  await face.hover();
  await expect(face).toHaveCSS('background-image', rest.image);
  await expect(face).toHaveCSS('background-color', rest.color);
});

test('Xinyan’s two burst hits keep their own crit rules through the buff picker and Worker replay', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('xinyan', 'blackcliffslasher'), level: 1, ascension: 0, constellation: 2,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const burst = build.character.metadata.talents.find(talent => talent.id === 'xinyan.burst')!;
  await expect(calc.getByRole('combobox', { name: '暴击', exact: true })).toHaveCount(0);
  const attack = build.character.attributes.base.attack + build.weapon!.baseAttack;
  const hitExpected = (parameter: string, rate: number) => {
    const talentRatio = burst.parameters.find(p => p.id === parameter)!.values[0];
    return attack * talentRatio * (101 / 291) * .9 * (1 + rate * .62);
  };
  const check = async (parameter: string, rate: number) => {
    const talentRatio = burst.parameters.find(p => p.id === parameter)!.values[0];
    const critDamage = attack * talentRatio * (101 / 291) * .9 * 1.62;
    const expectedDamage = hitExpected(parameter, rate);
    await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(critDamage, 5);
    await expect.poll(async () => Number((await calc.getByTestId('calculator-expected').textContent())?.replaceAll(',', ''))).toBe(
      Number(new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(expectedDamage).replaceAll(',', '')),
    );
  };
  const critCard = calc.locator('.factor-card').filter({ has: page.getByText('暴击区', { exact: true }) });
  const factor = critCard.locator('summary strong');
  await expect(factor).toHaveText('× 1.031');
  await critCard.locator('summary').click();
  await expect(critCard.locator('.subtotal strong')).toHaveText('1 + 5% × 62% = 1.031');
  await selectHit(calc, 'xinyan.burst');
  for (const enabled of [false, true]) {
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择增益' });
    await picker.getByRole('checkbox', { name: /开场即兴段/ }).setChecked(enabled);
    await picker.getByRole('button', { name: '应用增益' }).click();
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await check('param1', enabled ? 1 : .05);
    await expect(factor).toHaveText(enabled ? '× 1.62' : '× 1.031');
    await expect(critCard.locator('.column-heading strong')).toHaveText([enabled ? '100%' : '5%', '62%']);
    await expect(critCard.locator('.stat-box .factor-chip').filter({ hasText: '基础面板' }).locator('dd')).toHaveText('5%');
    await expect(critCard.locator('.stat-box .factor-chip').filter({ hasText: '开场即兴段' })).toHaveCount(enabled ? 1 : 0);
    await expect(critCard.locator('.rate-box .factor-chip').filter({ hasText: '开场即兴段' })).toHaveCount(0);
    if (enabled) await expect(critCard.locator('.stat-box .conversion')).toHaveText('合计 105%，按 100% 计算');
  }
  if (!await critCard.locator('.subtotal').isVisible()) await critCard.locator('summary').click();
  await critCard.screenshot({ path: info.outputPath('critical-breakdown.png') });
  const downloading = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('xinyan-crit.json');
  await (await downloading).saveAs(file);
  await open.setInputFiles(file);
  await check('param1', 1);
  await selectHit(calc, 'xinyan.burst', 1);
  await check('param2', .05);
});

test('Messenger’s weak-point hit uses its guaranteed crit in the expectation breakdown', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('amber', 'messenger'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  await selectHit(calc, 'messenger');
  await calc.getByRole('button', { name: '选择增益', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('combobox', { name: /重击命中要害/ }).selectOption('true');
  await picker.getByRole('button', { name: '应用增益' }).click();
  const card = calc.locator('.factor-card').filter({ has: page.locator('summary', { hasText: '暴击区' }) });
  const cd = .5 + build.weapon!.baseStat * build.weapon!.statCurve[1];
  const n = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  await expect(card.locator('summary strong')).toHaveText('× ' + n(1 + cd));
  await card.locator('summary').click();
  await expect(card.locator('.stat-box')).toContainText('本击必定暴击');
  await expect(card.locator('.subtotal strong')).toHaveText('1 + 100% × ' + n(cd * 100) + '% = ' + n(1 + cd));
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
  const portraits = await button('选择队伍').locator('.team-row-members > .game-icon').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  const teamBox = (await button('选择队伍').boundingBox())!;
  expect(teamBox.height).toBe(114);
  expect(portraits).toHaveLength(4);
  expect(portraits.every(box => box.y === portraits[0].y && box.width === box.height && box.right <= teamBox.x + teamBox.width)).toBe(true);
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
  await expect(calculator.getByText(/模型估算|计算条件与支持范围|补充增益条件|复制当前轴|独立捕获时刻|技能治疗|场景效果|角色元素附着|反应记录与微粒拾取/)).toHaveCount(0);
  await expect(calculator.getByRole('combobox', { name: '暴击', exact: true })).toHaveCount(0);
  await expect(calculator.getByLabel('命中时刻（秒）')).toHaveCount(0);
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
  const expected = recordedVesnaDamage(1, 1, true, 'expected', 3);
  await calculatorFactValue().toBeCloseTo(critical, 5);
  await expectedValue().toBe(Number(expected.toFixed(1)));
  await button('设为比较基准').click();
  await editBuild(calculator);
  await button('精炼2阶').click();
  await saveBuild(calculator);
  const critDifference = recordedVesnaDamage(2, 1, true, 'critical', 3) - critical;
  const expDifference = recordedVesnaDamage(2, 1, true, 'expected', 3) - expected;
  const critDelta = calculator.getByTestId('calculator-critical-delta');
  const expDelta = calculator.getByTestId('calculator-expected-delta');
  await expect.poll(async () => Number((await critDelta.textContent())?.replaceAll(',', ''))).toBe(Math.round(critDifference));
  await expect.poll(async () => Number((await expDelta.textContent())?.replaceAll(',', ''))).toBe(Number(expDifference.toFixed(1)));
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
  const star = calculator.locator('.factor-card').filter({ has: page.locator('summary', { hasText: '星反应增伤区' }) });
  const multiplier = star.locator('summary strong');
  expect(await multiplier.evaluate(node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set(Array.from(range.getClientRects(), rect => rect.top)).size;
  })).toBe(1);
  await star.locator('summary').click();
  await expect(star.locator('.stat-box .factor-chip dd')).toHaveText(['159', '84', '75']);
  await expect(star.locator('.rate-box .column-heading strong')).toHaveText('96%');
  await star.screenshot({ path: info.outputPath('team-stellar-mobile.png') });
  await page.screenshot({path:info.outputPath('team-calculator-mobile.png')});
  expect(await storage()).toEqual(before);
  await page.reload();
  await page.getByRole('button', { name: '打开功能导航' }).click();
  await page.getByTestId('workspace-nav-calculator').click();
  await button('伤害列表').click();
  const list = page.getByRole('dialog', { name: '伤害列表' });
  const plunge = list.getByRole('button', { name: /^瓦雷莎/ });
  await expect(plunge).toContainText('暴击 ' + Math.round(recordedVaresaPlunge('critical')).toLocaleString('zh-CN'));
  await expect(plunge).toContainText('期望 ' + recordedVaresaPlunge('expected').toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  await expect(list.getByText('模型估算伤害')).toHaveCount(0);
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
    const damage = button('选择伤害');
    const damagePicker = calculator.getByRole('dialog', { name: '选择伤害', exact: true });
    await damage.tap();
    await chooseDamageCard(damagePicker.locator('button[data-hit-id]').first());
    await damage.locator('.choice-card').tap();
    await expect(damagePicker).toBeVisible();
    await page.keyboard.press('Escape');
    const details = button('查看凯亚详情');
    const card = calculator.locator('.calculator-selections .configuration-row');
    const portrait = button('更换凯亚');
    const strip = card.locator('.configuration-portraits');
    await expect(card.getByText('临时角色', { exact: true })).toHaveCount(0);
    await expect(strip).toHaveAttribute('aria-label', '更换凯亚');
    await expect(strip.locator(':scope > .game-icon.characters')).toHaveCount(1);
    await expect(strip.locator(':scope > .card-sets')).toHaveCount(1);
    let desktopStripWidth = 0;
    for (const width of [1280, 451, 320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await portrait.hover({ position: { x: 3, y: 6 } });
      const layer = portrait.locator('.card-replace-layer');
      await expect(layer).toBeVisible();
      const target = await portrait.boundingBox();
      expect(await layer.boundingBox()).toEqual(target);
      if (width === 1280) desktopStripWidth = target!.width;
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
    expect(teamBounds.width).toBeCloseTo(desktopStripWidth, 0);
    expect(teamBounds.height).toBeGreaterThanOrEqual(48);
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
  await expect(calculator.getByRole('combobox', { name: '暴击', exact: true })).toHaveCount(0);
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const uncharged = (18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7) * 2.0672 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(uncharged * 1.5, 5);
  const charge = calculator.getByRole('combobox', { name: '反击档位', exact: true });
  await expect(charge).toHaveValue('0');
  await expect(charge.getByText('待确认')).toHaveCount(0);
  await calculator.getByRole('combobox', { name: '反击档位', exact: true }).selectOption('2');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
  const expected = attack * 7.5072 * 1.24 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected * 1.5, 5);
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
  const gridWidth = (await grid.boundingBox())!.width;
  expect(bounds.every((box, index) => box.width === gridWidth && (!index || box.y >= bounds[index - 1].bottom))).toBe(true);
  await expect(calculator.locator('.calculator-build .equipment-list > article')).toHaveCount(5);
  const base = calculator.locator('.factor-card').filter({ hasText: '属性 × 倍率区' });
  await base.locator('summary').hover();
  await expect(base).toHaveCSS('border-top-width', '3px');
  await expect(base).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
  await base.locator('summary').click();
  await expect(base.locator('.scaling-term').first()).toContainText('攻击力');
  await expect(base).toContainText('基础伤害小计');
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
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-critical-delta').textContent())?.replaceAll(',', ''))).toBe(Math.round((expectedAfter - expected) * 1.5));
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-expected-delta').textContent())?.replaceAll(',', ''))).toBe(Number(((expectedAfter - expected) * 1.025).toFixed(1)));
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const download = await downloadPromise;
  const content = readFileSync((await download.path())!, 'utf8');
  const savedDocument: DamageCalculatorDocument = await readDocument(page, 'damage-calculator', content);
  expect(savedDocument.project.candidate.actors[0].build!.weapon?.id).toBe('oldmercspal');
  expect(savedDocument.baseline!.candidate.actors[0].build!.weapon?.id).toBe('wastergreatsword');
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '伤害计算.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expectedAfter * 1.5, 5);
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

test('snapshot hits like Kaeya burst and Xiangling burst compute directly with zero capture UI shown', async ({ page }) => {
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
  await expect(calculator.getByLabel('命中时刻（秒）')).toHaveCount(0);
  await expect(calculator.getByLabel('独立捕获时刻（秒）')).toHaveCount(0);
  await expect(calculator.getByRole('button', { name: '添加属性捕获点' })).toHaveCount(0);
  await expect(calculator.getByRole('combobox', { name: /捕获时点|属性捕获来源|暴击/ })).toHaveCount(0);
  await expect(calculator.getByText(/模型估算|计算条件与支持范围|补充增益条件|复制当前轴|技能治疗|场景效果|角色元素附着|反应记录与微粒拾取/)).toHaveCount(0);
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 1.3192 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected * 1.5, 5);
  await expect(calculator.getByTestId('calculator-critical')).toHaveText(Math.round(expected * 1.5).toLocaleString('zh-CN'));
  await expect(calculator.getByTestId('calculator-expected')).toHaveText((expected * 1.025).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await editBuild(calculator);
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('银剑');
  await weapons.getByRole('button', { name: '银剑', exact: true }).click();
  await saveBuild(calculator);
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  const changed = (18.6984 * 8.349 + 66.90411 + 32.93 * 5.968 + 46.7) * 1.3192 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-critical-delta').textContent())?.replaceAll(',', ''))).toBe(Math.round((changed - expected) * 1.5));
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-expected-delta').textContent())?.replaceAll(',', ''))).toBe(Number(((changed - expected) * 1.025).toFixed(1)));
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const savedFile = readFileSync((await (await downloadPromise).path())!, 'utf8');
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', savedFile);
  expect(saved.project.timeline.filter(record => record.kind === 'action')).toHaveLength(0);
  expect(saved.project.timeline.filter(record => record.kind === 'capture')).toHaveLength(1);
  expect(saved.project.timeline.filter(record => record.kind === 'damage')).toHaveLength(1);
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: '独立捕获计算.json', mimeType: 'application/json', buffer: Buffer.from(savedFile) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(changed * 1.5, 5);

  // Xiangling Pyronado (capture-only snapshot) computes directly with zero capture UI.
  const xianglingBuild: Build = { ...await catalogSnapshotFields('xiangling', 'beginnersprotector'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  await openSingleBuild(page, xianglingBuild);
  await selectHit(calculator, 'xiangling.burst', 3);
  await expect(calculator.getByLabel('命中时刻（秒）')).toHaveCount(0);
  await expect(calculator.getByLabel('独立捕获时刻（秒）')).toHaveCount(0);
  await expect(calculator.getByRole('combobox', { name: /捕获时点|属性捕获来源|暴击/ })).toHaveCount(0);
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeGreaterThan(0);
  await expect(calculator.getByTestId('calculator-critical')).toHaveText(/^[1-9][\d,]*$/);
  await expect(calculator.getByTestId('calculator-expected')).toHaveText(/^[1-9][\d,]*\.\d$/);
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
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = (18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7) * 3.824 * 0.45;
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected * 1.5, 5);
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
  await expect(calculator.getByRole('combobox', { name: '暴击', exact: true })).toHaveCount(0);
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByText(/模型估算|计算条件与支持范围|补充增益条件|复制当前轴/)).toHaveCount(0);
  await expect(calculator.getByTestId('calculator-critical')).toHaveText(/^[1-9][\d,]*$/);
  await expect(calculator.getByTestId('calculator-expected')).toHaveText(/^[1-9][\d,]*\.\d$/);
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
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect(calculator.getByTestId('calculator-critical')).toHaveText(/^[1-9][\d,]*$/);
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
  await expect(calculator.getByText(/模型估算|计算条件与支持范围/)).toHaveCount(0);
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected * 1.5, 5);
  await calculator.getByText('角色定义', { exact: true }).click();
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  const review = page.getByRole('dialog', { name: '更新计算副本内容', exact: true });
  await expect(review).toContainText('角色定义（4 → 6）');
  await review.getByRole('button', { name: '关闭更新计算副本内容', exact: true }).click();
  await expect(calculator.getByText(/模型估算|计算条件与支持范围/)).toHaveCount(0);
  await calculator.getByRole('button', { name: '检查当前内容', exact: true }).click();
  await review.getByRole('button', { name: '采用当前内容并重算', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(expected * 1.5, 5);
  await expect(calculator.getByText(/模型估算|计算条件与支持范围/)).toHaveCount(0);
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
  await expect(calculator.getByRole('combobox', { name: '暴击', exact: true })).toHaveCount(0);
  await calculator.getByRole('combobox', { name: '反应', exact: true }).selectOption('none');
  await calculator.getByRole('button', { name: '计算伤害', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(entry.expected * 1.5, 5);
  await calculator.getByRole('button', { name: '设为比较基准', exact: true }).click();
  await editBuild(calculator);
  await calculator.getByRole('button', { name: '更换武器', exact: true }).click();
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially(entry.candidate);
  await weapons.getByRole('button', { name: entry.candidate, exact: true }).click();
  await saveBuild(calculator);
  await calculator.getByRole('button', { name: '重算候选', exact: true }).click();
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-critical-delta').textContent())?.replaceAll(',', ''))).toBe(Math.round(entry.delta * 1.5));
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-expected-delta').textContent())?.replaceAll(',', ''))).toBe(Number((entry.delta * 1.025).toFixed(1)));
  const downloadPromise = page.waitForEvent('download');
  await calculator.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const content = readFileSync((await (await downloadPromise).path())!, 'utf8');
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', content);
  expect(saved.project.timeline).toHaveLength(1);
  expect(saved.project.candidate.actors[0].build!.character.calculation.bundle.coverage.some(proof => proof.scope.kind === 'context' && proof.resolution === 'unavailable')).toBe(true);
  await calculator.getByLabel('打开伤害计算文件', { exact: true }).setInputFiles({ name: `${entry.name}单次计算.json`, mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo((entry.expected + entry.delta) * 1.5, 5);
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
  await expect.poll(async () => Number((await shown())?.replaceAll(',', ''))).toBeCloseTo(expected * 1.5, 5);
  await expect.poll(async () => Number((await calculator.getByTestId('calculator-expected').textContent())?.replaceAll(',', ''))).toBe(Number((expected * 1.025).toFixed(1)));
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
  const verify = async (factor: number) => {
    await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', '')))
      .toBeCloseTo(baseDamage * factor * 1.5, 5);
    await expect.poll(async () => Number((await calc.getByTestId('calculator-expected').textContent())?.replaceAll(',', '')))
      .toBe(Number((baseDamage * factor * 1.025).toFixed(1)));
  };
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
  const monster = calc.getByRole('region', { name: '怪物属性' });
  await expect(monster.getByLabel('火基础抗性（%）')).toHaveValue('20');
  await element.selectOption('hydro');
  await expect(monster.getByLabel('水基础抗性（%）')).toBeVisible();
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

test('single-contributor Lunar and Stellar reactions compute critical and expected Worker damage after reopening', async ({ page }) => {
  test.setTimeout(60000);
  const build: Build = { ...await catalogSnapshotFields('kaeya', 'dullblade'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const levelMultiplier = 17.165606;
  const recalculate = calc.getByRole('button', { name: '计算伤害', exact: true });
  const output = calc.getByTestId('calculator-value');
  const expectedOutput = calc.getByTestId('calculator-expected');
  await expect(calc.getByRole('combobox', { name: '暴击', exact: true })).toHaveCount(0);
  const check = async (coefficient: number) => {
    // The sole qualified contribution takes the first weight in the adopted Lunar formula.
    const base = levelMultiplier * coefficient * 0.9 * 0.6;
    await expect.poll(async () => Number(await output.textContent())).toBeCloseTo(base * 1.5, 1);
    await expect.poll(async () => Number((await expectedOutput.textContent())?.replaceAll(',', ''))).toBe(Number((base * 1.025).toFixed(1)));
  };
  for (const [family, coefficient] of [['lunar-charged', 3], ['lunar-crystallize', 1.6]] as const) {
    await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
    const group = calc.getByRole('region', { name: '月曜反应', exact: true });
    await chooseDamageCard(group.locator(`button[data-reaction="${family}"]`));
    await check(coefficient);
  }
  const download = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const saved = readFileSync((await (await download).path())!);
  await open.setInputFiles({ name: 'lunar-crystallize.json', mimeType: 'application/json', buffer: saved });
  await recalculate.click();
  await check(1.6);
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(calc.locator('button[data-reaction="stellar-swirl"]'));
  const stage = calc.getByRole('combobox', { name: '星扩散伤害段' });
  await expect(stage).toHaveValue('initialAnemo');
  await check(0.75);
  await stage.selectOption('cryoLevel1');
  await check(2);
  await stage.selectOption('cryoLevel2');
  await check(3);
  const stellarDownload = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const stellar = readFileSync((await (await stellarDownload).path())!);
  await open.setInputFiles({ name: 'stellar.json', mimeType: 'application/json', buffer: stellar });
  await expect(stage).toHaveValue('cryoLevel2');
  await recalculate.click();
  await check(3);
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
    const doc = createDamageCalculation(build, { hit: { definition: { group: 'characters', id, namespace, revision }, hitId: build.character.talents[0].hits[0].id }, crit: 'critical', reaction: 'none' }, enemy);
    return JSON.stringify(packDocument('damage-calculator', doc));
  }, build);
  await page.getByTestId('workspace-nav-calculator').click();
  const calc = page.getByRole('region', { name: '伤害计算', exact: true });
  const open = calc.getByLabel('打开伤害计算文件', { exact: true });
  await open.setInputFiles({ name: '纳西妲.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
  await chooseDamageCard(calc.locator('button[data-reaction="bloom"]'));
  for (const [mark, critFactor, expFactor] of [['false', 1, 1], ['true', 2, 1.2]] as const) {
    await calc.getByRole('button', { name: '选择增益', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择增益' });
    const marks = dialog.getByRole('combobox', { name: /目标被纳西妲施加蕴种印/ });
    await marks.first().selectOption(mark);
    for (const field of await marks.all()) await expect(field).toHaveValue(mark);
    await dialog.getByRole('button', { name: '应用增益' }).click();
    await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
    await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(17.165606 * 2 * .9 * critFactor, 4);
    await expect.poll(async () => Number((await calc.getByTestId('calculator-expected').textContent())?.replaceAll(',', ''))).toBe(Number((17.165606 * 2 * .9 * expFactor).toFixed(1)));
    const card = calc.locator('.factor-card').filter({ has: page.locator('summary', { hasText: '暴击区' }) });
    await expect(card.locator('summary strong')).toHaveText(mark === 'true' ? '× 1.2' : '× 1');
    await expect(card.locator('.column-heading strong')).toHaveText(mark === 'true' ? ['20%', '100%'] : ['0%', '0%']);
    await expect(card.locator('.subtotal strong')).toHaveText(mark === 'true' ? '1 + 20% × 100% = 1.2' : '1 + 0% × 0% = 1');
  }
  const waiting = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('marked-bloom.json');
  await (await waiting).saveAs(file);
  const saved = await readDocument<DamageCalculatorDocument>(page, 'damage-calculator', readFileSync(file, 'utf8'));
  const reaction = saved.project.timeline.find(row => row.id === saved.recordId)?.reactionEvent;
  expect(reaction?.facts?.find(row => row.subject.kind === 'target')?.values['nahida.seedMark']?.value?.value).toBe(true);
  await open.setInputFiles(file);
  await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeCloseTo(17.165606 * 2 * .9 * 2, 4);
  await expect.poll(async () => Number((await calc.getByTestId('calculator-expected').textContent())?.replaceAll(',', ''))).toBe(Number((17.165606 * 2 * .9 * 1.2).toFixed(1)));
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
    const values = calc.locator('#calculator-buff-summary');
    for (const [input, expected] of weapon.inputs) {
      await calc.getByRole('button', { name: '选择增益', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '选择增益' });
      await picker.getByRole('combobox', { name: weapon.state }).first().selectOption(weapon.mode);
      await picker.getByRole('spinbutton', { name: weapon.amount }).first().fill(input);
      await picker.getByRole('combobox', { name: '站场', exact: true }).first().selectOption('true');
      await picker.getByRole('button', { name: '应用增益' }).click();
      await expect(values.locator('b', { hasText: expected })).toHaveText(expected);
    }
    const downloading = page.waitForEvent('download');
    await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
    const file = info.outputPath(weapon.id + '.json');
    await (await downloading).saveAs(file);
    await open.setInputFiles(file);
    await expect(values.locator('b', { hasText: weapon.inputs[1][1] })).toHaveText(weapon.inputs[1][1]);
  });
}

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
    const values = calc.locator('#calculator-buff-summary');
    await expect(values.locator('.buff-readout').filter({ has: page.locator('span', { hasText: '固定攻击力' }) }).locator('b')).toHaveText('66');
  }
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
    const cost = calc.locator('.buff-readout').filter({ has: page.locator('span', { hasText: '本次重击体力消耗（点）' }) });
    if (constellation === 5) {
      await expect(fourSeals).toBeDisabled();
      await expect(fourSeals).toContainText('需要命座 6');
      await chooseDamageCard(picker.locator('button[data-hit-id="yanfei.normal.param5"]'));
      await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeGreaterThan(0);
      await expect(cost).toHaveCount(0);
    } else {
      await chooseDamageCard(fourSeals);
      await expect(calc.getByRole('button', { name: '选择伤害', exact: true })).toHaveAttribute('data-hit-id', 'yanfei.normal.param8');
      await expect.poll(async () => Number((await calc.getByTestId('calculator-value').textContent())?.replaceAll(',', ''))).toBeGreaterThan(0);
      await expect(cost).toHaveCount(0);
      await calc.getByRole('button', { name: '选择伤害', exact: true }).click();
      await chooseDamageCard(picker.locator('button[data-hit-id="yanfei.normal.param1"]'));
      await expect(cost).toHaveCount(0);
    }
  }
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

test('Amber includes the crit rate of Fiery Rain while excluding non-damage range modifiers', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('amber', 'huntersbow'), level: 20, ascension: 1, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc } = await openSingleBuild(page, build);
  await selectHit(calc, 'amber.burst');
  const values = calc.locator('#calculator-buff-summary');
  const row = (label: string) => values.locator('.buff-readout').filter({ has: page.locator('span', { hasText: label }) }).locator('b');
  await expect(row('影响范围加成')).toHaveCount(0);
  await expect(row('暴击率')).toHaveText('10%');
  await selectHit(calc, 'amber.normal');
  await expect(row('暴击率')).toHaveCount(0);
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
  await expect.poll(async()=>Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(base*1.18*1.5,5);
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
  expect(result.result.totalValue).toBeCloseTo(base*1.1*1.5,8);
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
  await expect.poll(async()=>Number((await calculator.getByTestId('calculator-value').textContent())?.replaceAll(',',''))).toBeCloseTo(expected*1.5,5);
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
  expect(results.first).toBeNull();expect(results.firstMissing).toBe(true);expect(results.second).toBeCloseTo(expected*1.5,8);
  expect(results.third).toBe(0);expect(results.all).toBeCloseTo(results.subtotal!+expected*1.5,8);
});

test('monster settings and Shenhe’s quill feed separate parts of the same saved hit', async ({ page }, info) => {
  const build: Build = { ...await catalogSnapshotFields('shenhe', 'beginnersprotector'), level: 1, ascension: 0, constellation: 0,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const { calc, open } = await openSingleBuild(page, build);
  const monster = calc.getByRole('region', { name: '怪物属性' });
  await expect(monster.getByLabel('物理基础抗性（%）')).toBeVisible();
  await selectHit(calc, 'shenhe.skill');
  await expect(monster.getByLabel('冰基础抗性（%）')).toBeVisible();
  expect(await monster.evaluate(node => node.nextElementSibling?.tagName)).toBe('FOOTER');
  const base = calc.locator('.factor-card').filter({ hasText: '属性 × 倍率区' });
  await base.locator('summary').click();
  await expect(base.getByText('附加基础伤害（羽毛）')).toHaveCount(0);
  const buffs = calc.getByRole('button', { name: '选择增益', exact: true });
  await buffs.click();
  const picker = page.getByRole('dialog', { name: '选择增益' });
  await picker.getByRole('combobox', { name: /点按冰翎尚能生效/ }).first().selectOption('true');
  await picker.getByRole('button', { name: '应用增益' }).click();
  const attack = build.character.attributes.base.attack + build.weapon!.baseAttack;
  const formatted = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  await expect(base.locator('.subtotal strong')).toHaveText(formatted(attack * 1.392));
  const quill = base.locator('.factor-chip').filter({ hasText: '申鹤' });
  await expect(quill.locator('dd')).toHaveText('+' + formatted(attack * .45656));
  await expect(base.locator('summary strong')).toHaveText(formatted(attack * (1.392 + .45656)));
  await monster.getByLabel('怪物等级').fill('100');
  const ice = monster.getByLabel('冰基础抗性（%）');
  await ice.fill('-20');
  await ice.press('Tab');
  await calc.getByRole('button', { name: '计算伤害', exact: true }).click();
  const expected = attack * (1.392 + .45656) * 101 / 301 * 1.1;
  const value = calc.getByTestId('calculator-value');
  await expect(value).toHaveText(formatted(expected * 1.5));
  await expect(calc.getByText('本次增益数值', { exact: true })).toHaveCount(0);
  const defense = calc.locator('.factor-card').filter({ hasText: '防御区' });
  await defense.locator('summary').click();
  await expect(defense.getByText('减防比例')).toHaveCount(0);
  const colors = await defense.locator('.factor-chip').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(new Set(colors).size).toBe(colors.length);
  const res = calc.locator('.factor-card').filter({ hasText: '抗性区' });
  await res.locator('summary').click();
  await expect(res.locator('.factor-chip dd')).toHaveText('-20%');
  await base.locator('summary').click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const grid = calc.getByRole('region', { name: '伤害乘区' });
    expect(await grid.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const cards = await grid.locator('.factor-card').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    const widthAvailable = (await grid.boundingBox())!.width;
    expect(cards.every((box, index) => box.width === widthAvailable && (!index || box.y >= cards[index - 1].bottom))).toBe(true);
    const [attribute, rate] = await base.locator('.scaling-box').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(attribute.y).toBe(rate.y);
    expect(attribute.right).toBeLessThan(rate.left);
    await expect(base.locator('.stat-box')).toContainText(formatted(attack));
    await expect(base.locator('.rate-box')).toContainText('139.2%');
    await grid.screenshot({ path: info.outputPath('factors-' + width + '.png') });
  }
  const downloading = page.waitForEvent('download');
  await calc.getByRole('button', { name: '导出计算文件', exact: true }).click();
  const file = info.outputPath('shenhe-negative-resistance.json');
  await (await downloading).saveAs(file);
  await open.setInputFiles(file);
  await expect(ice).toHaveValue('-20');
  await expect(monster.getByLabel('怪物等级')).toHaveValue('100');
  await expect(value).toHaveText(formatted(expected * 1.5));
});

test('calculator and party member slots use the new artifact combination card finish', async ({ page }, info) => {
  await page.goto('/');
  const finish = (slots: Locator) => slots.evaluateAll(nodes => nodes.map(node => {
    const css = getComputedStyle(node);
    return [css.backgroundImage, css.borderRadius, css.borderTopWidth, css.borderTopStyle, css.paddingTop, css.boxShadow];
  }));
  await page.getByTestId('workspace-nav-combinations').click();
  await page.getByRole('button', { name: '新建组合', exact: true }).first().click();
  const reference = page.getByRole('dialog', { name: '新建组合' });
  const [style] = await finish(reference.locator('.equipment-list article').first());
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-team').click();
  await page.getByRole('button', { name: '新建队伍', exact: true }).first().click();
  const team = page.getByRole('dialog', { name: '新建队伍' });
  await expect(team.locator('.team-slot > button')).toHaveCount(4);
  expect(await finish(team.locator('.team-slot > button'))).toEqual(Array(4).fill(style));
  await expect(team.locator('.team-add-slot .library-nav-icon')).toHaveCount(4);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const heights = await team.locator('.team-add-slot').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(heights).toEqual(Array(4).fill(heights[0]));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-calculator').click();
  const slots = page.locator('.calculator-selections');
  await expect(slots.locator(':scope > button')).toHaveCount(4);
  expect(await finish(slots.locator(':scope > button'))).toEqual(Array(4).fill(style));
  await expect(slots.locator('.slot-placeholder :is(svg,img)')).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await slots.locator(':scope > button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height)))
      .toEqual(Array(4).fill(width > 600 ? 140 : 114));
  }
  await slots.screenshot({ path: info.outputPath('selection-slots.png') });
});
