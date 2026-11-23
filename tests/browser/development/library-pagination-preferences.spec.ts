import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const pages = [
  ['characters', '角色'], ['loadouts', '角色配置'], ['artifacts', '圣遗物'],
  ['combinations', '圣遗物组合'], ['team', '队伍'],
] as const;
const recordedShowcase = '.references/enka/uid-107590923.json';

async function navigate(page: Page, target: string, width = 1440) {
  if (width <= 700) await page.getByRole('button', { name: '打开功能导航', exact: true }).click();
  await page.getByTestId(`workspace-nav-${target}`).click();
}

test('empty library pages align shared controls without reserving a shortcut row for combinations or teams', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  for (const width of [1440, 1000, 900, 800, 701, 700, 601, 550, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    type Bounds = { toolbarBottom: number; header: number; title: number; action: number; center: number; bottom: number };
    let reference: Bounds | undefined;
    let simpleReference: Bounds | undefined;
    for (const [target, label] of pages) {
      await navigate(page, target, width);
      const main = page.locator('#workspace-main');
      await expect(main).toHaveAttribute('aria-label', label);
      const empty = main.locator('.library-empty');
      await expect(empty).toBeVisible();
      await expect(main.getByRole('navigation', { name: '顶部列表分页' })).toBeVisible();
      await expect(main.getByRole('navigation', { name: '底部列表分页' })).toBeVisible();
      const bounds = await main.evaluate(root => {
        const rect = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
        const panel = rect('.library-page');
        const toolbar = rect('.library-toolbar');
        const header = rect('.library-list-header');
        const title = rect('.library-empty h3');
        const action = rect('.library-empty button');
        const bottom = rect('[aria-label="底部列表分页"]');
        return {
          toolbarBottom: toolbar.bottom - panel.top, header: header.top - panel.top, title: title.top - panel.top, action: action.top - panel.top,
          center: action.left + action.width / 2 - panel.left, bottom: bottom.top - panel.top,
        };
      });
      const simple = target === 'combinations' || target === 'team';
      const expected = simple ? simpleReference : reference;
      if (expected) {
        for (const key of ['header', 'title', 'action', 'center', 'bottom'] as const) expect(bounds[key], `${width}px ${label}: ${key}`).toBeCloseTo(expected[key], 0);
      } else if (simple) simpleReference = bounds;
      else reference = bounds;
      if (simple) expect(bounds.header - bounds.toolbarBottom, `${width}px ${label}: toolbar gap`).toBeCloseTo(12, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (target === 'characters' && (width === 1440 || width === 390)) {
        await page.screenshot({ path: info.outputPath(`empty-characters-${width}.png`), fullPage: true });
      }
    }
  }
});

test('row settings persist independently, normalize input and restore defaults without touching account data', async ({ page }, info) => {
  await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'));
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  const values = [
    ['角色每页行数', '5', '2'], ['角色配置疏松每页行数', '5', '3'], ['角色配置紧凑每页行数', '5', '4'],
    ['圣遗物疏松每页行数', '5', '6'], ['圣遗物紧凑每页行数', '8', '7'],
    ['圣遗物组合每页行数', '5', '9'], ['队伍每页行数', '5', '10'],
  ] as const;
  for (const [label, initial, value] of values) {
    const input = page.getByRole('spinbutton', { name: label, exact: true });
    await expect(input).toHaveValue(initial);
    await input.fill(value);
    await input.blur();
  }
  await page.screenshot({ path: info.outputPath('library-settings-desktop.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  for (const [label, , value] of values) await expect(page.getByRole('spinbutton', { name: label, exact: true })).toHaveValue(value);
  const characterRows = page.getByRole('spinbutton', { name: '角色每页行数', exact: true });
  await characterRows.fill('0');
  await characterRows.blur();
  await expect(characterRows).toHaveValue('1');
  await characterRows.fill('999');
  await characterRows.blur();
  await expect(characterRows).toHaveValue('50');
  await page.getByRole('button', { name: '恢复默认行数', exact: true }).click();
  for (const [label, initial] of values) await expect(page.getByRole('spinbutton', { name: label, exact: true })).toHaveValue(initial);
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('library-settings-mobile.png'), fullPage: true });
});

test('an empty library does not apply its reserved header space inside a selection dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await navigate(page, 'team', 390);
  await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
  await page.getByRole('dialog', { name: '新建队伍', exact: true }).getByRole('button', { name: '选择队员1', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
  await picker.getByRole('button', { name: '本地', exact: true }).click();
  await expect(picker.getByText('还没有本地角色配置', { exact: true })).toBeVisible();
  await expect(picker.locator('.library-toolbar')).not.toHaveCSS('min-height', '140px');
  expect(await picker.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test('invalid stored row preferences fall back without replacing the saved bytes', async ({ page }) => {
  const invalid = '{"characters":0,"configurationRelaxed":3.5,"artifactCompact":51,"teams":4}';
  await page.addInitScript(value => localStorage.setItem('leyline-library-page-rows-0.2.0', value), invalid);
  await page.goto('/');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: '角色每页行数', exact: true })).toHaveValue('5');
  await expect(page.getByRole('spinbutton', { name: '角色配置疏松每页行数', exact: true })).toHaveValue('5');
  await expect(page.getByRole('spinbutton', { name: '圣遗物紧凑每页行数', exact: true })).toHaveValue('8');
  await expect(page.getByRole('spinbutton', { name: '队伍每页行数', exact: true })).toHaveValue('4');
  expect(await page.evaluate(() => localStorage.getItem('leyline-library-page-rows-0.2.0'))).toBe(invalid);
});

test('recorded library respects each page and density setting while retaining pagination behavior', async ({ page }) => {
  test.skip(!existsSync(recordedShowcase), 'Requires the original 12-character public showcase.');
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 800, height: 900 });
  await page.route('**/api/enka/107590923', route => route.fulfill({ json: JSON.parse(readFileSync(recordedShowcase, 'utf8')) }));
  await page.goto('/');
  await page.getByRole('button', { name: '展柜导入', exact: true }).click();
  await page.getByLabel('游戏 UID', { exact: true }).fill('107590923');
  await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
  await page.getByRole('button', { name: '同时导入本地库', exact: true }).click();
  await page.getByRole('button', { name: '确认导入 12 位角色', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.character-card')).toHaveCount(5);
  await expect(page.locator('.library-result-count')).toHaveText('12 名角色');
  const top = page.getByRole('navigation', { name: '顶部列表分页' });
  const bottom = page.getByRole('navigation', { name: '底部列表分页' });
  await top.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.character-card')).toHaveCount(5);
  await expect(page.getByLabel('底部页码', { exact: true })).toHaveValue('2');
  await bottom.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.character-card')).toHaveCount(2);
  await expect(page.getByLabel('顶部页码', { exact: true })).toHaveValue('3');
  const accountBeforeSettings = await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  for (const [label, value] of [
    ['角色每页行数', '2'], ['角色配置疏松每页行数', '3'], ['角色配置紧凑每页行数', '2'],
    ['圣遗物疏松每页行数', '2'], ['圣遗物紧凑每页行数', '3'], ['圣遗物组合每页行数', '2'], ['队伍每页行数', '2'],
  ]) {
    await page.getByRole('spinbutton', { name: label, exact: true }).fill(value);
  }
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(accountBeforeSettings);
  await navigate(page, 'characters');
  await expect(page.locator('.character-card')).toHaveCount(6);
  await top.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByLabel('底部页码', { exact: true })).toHaveValue('2');
  const firstOnSecondPage = await page.locator('.character-card').first().getAttribute('aria-label');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '角色每页行数', exact: true }).fill('3');
  await navigate(page, 'characters');
  await expect(page.locator('.character-card')).toHaveCount(9);
  await expect(page.getByRole('button', { name: firstOnSecondPage!, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '角色每页行数', exact: true }).fill('2');
  await navigate(page, 'characters');
  await expect(page.getByLabel('顶部页码', { exact: true })).toHaveValue('2');
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.locator('.character-card')).toHaveCount(2);
  await expect(page.getByLabel('顶部页码', { exact: true })).toHaveValue('4');
  await expect(page.locator('.character-card').first()).toHaveAttribute('aria-label', firstOnSecondPage!);
  await page.getByLabel('搜索账号角色', { exact: true }).fill('没有这名角色');
  await expect(page.locator('.library-result-count')).toHaveText('0 名角色 / 共 12 名角色');
  await expect(page.getByLabel('顶部页码', { exact: true })).toHaveValue('1');
  await page.locator('.library-empty').getByRole('button', { name: '清除搜索与筛选', exact: true }).click();
  await expect(page.locator('.character-card')).toHaveCount(2);

  await page.setViewportSize({ width: 1440, height: 900 });
  await navigate(page, 'loadouts');
  await expect(page.locator('.configuration-row')).toHaveCount(4);
  await page.getByRole('group', { name: '卡片密度' }).getByRole('button', { name: '疏松', exact: true }).click();
  await expect(page.locator('.configuration-row')).toHaveCount(3);
  await top.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByLabel('底部页码', { exact: true })).toHaveValue('2');
  const configurationAnchor = await page.locator('.configuration-row').first().getAttribute('data-configuration-id');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '角色配置疏松每页行数', exact: true }).fill('4');
  await navigate(page, 'loadouts');
  await expect(page.locator('.configuration-row')).toHaveCount(4);
  await expect(page.locator(`.configuration-row[data-configuration-id="${configurationAnchor}"]`)).toBeVisible();

  await navigate(page, 'artifacts');
  const grid = page.locator('.inventory-cards');
  const columns = () => grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
  await expect.poll(async () => page.locator('.inventory-card').count()).toBe((await columns()) * 3);
  await page.getByRole('group', { name: '卡片密度' }).getByRole('button', { name: '疏松', exact: true }).click();
  await expect.poll(async () => page.locator('.inventory-card').count()).toBe((await columns()) * 2);
  await top.getByRole('button', { name: '下一页', exact: true }).click();
  const artifactAnchor = await page.locator('.inventory-card').first().getAttribute('data-artifact-id');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '圣遗物疏松每页行数', exact: true }).fill('3');
  await navigate(page, 'artifacts');
  await expect.poll(async () => page.locator('.inventory-card').count()).toBe((await columns()) * 3);
  await expect(page.locator(`.inventory-card[data-artifact-id="${artifactAnchor}"]`)).toBeVisible();

  // Reuse one recorded inventory piece for independent pagination copies.
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser source URL.
    const { useAccountStore } = await import('/src/stores/account.ts');
    // @ts-expect-error Vite browser source URL.
    const { useArtifactCombinationsStore } = await import('/src/stores/artifact-combinations.ts');
    const account = useAccountStore().account;
    const store = useArtifactCombinationsStore();
    for (let index = 0; index < 5; index++) store.save(account, [account.artifacts[0]], ['critRate'], '', '', undefined, `分页组合 ${index}`, undefined, true);
  });
  await navigate(page, 'combinations');
  await expect(page.locator('.combination-row')).toHaveCount(2);
  await bottom.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.combination-row')).toHaveCount(2);
  await expect(page.getByLabel('顶部页码', { exact: true })).toHaveValue('2');
  const combinationAnchor = await page.locator('.combination-row').first().getAttribute('data-combination-id');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '圣遗物组合每页行数', exact: true }).fill('3');
  await navigate(page, 'combinations');
  await expect(page.locator('.combination-row')).toHaveCount(3);
  await expect(page.locator(`.combination-row[data-combination-id="${combinationAnchor}"]`)).toBeVisible();

  await navigate(page, 'team');
  await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
  const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
  await team.getByRole('button', { name: '选择队员1', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
  await picker.getByRole('button', { name: /^选择.*首选配置$/ }).first().click();
  await team.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog', { name: '队伍详情', exact: true }).getByRole('button', { name: '关闭队伍详情', exact: true }).click();
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser source URL.
    const { useSavedTeamsStore } = await import('/src/stores/saved-teams.ts');
    const store = useSavedTeamsStore();
    const original = store.teams[0];
    for (let index = 0; index < 4; index++) store.save(`分页队伍 ${index}`, original.project);
  });
  await expect(page.locator('.team-row')).toHaveCount(2);
  await top.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByLabel('底部页码', { exact: true })).toHaveValue('2');
  await expect(page.locator('.team-row')).toHaveCount(2);
  const teamAnchor = await page.locator('.team-row').first().getAttribute('data-team-id');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '队伍每页行数', exact: true }).fill('3');
  await navigate(page, 'team');
  await expect(page.locator('.team-row')).toHaveCount(3);
  await expect(page.locator(`.team-row[data-team-id="${teamAnchor}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});
