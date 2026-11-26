import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { type LocalAccount } from '@leyline/schema';
import { type SavedTeam } from '../../../src/web/src/stores/saved-teams';
import { readDocument } from '../../helpers/browser-document';
import { chooseConfigurationRole } from '../../helpers/choose-configuration-role';
import { recordedJsonFile } from '../../helpers/recorded-reference';
import { restoreRecordedNoteSetup } from '../../helpers/recorded-note-setup';

test.describe('library-empty-and-team-catalog', () => {
  test('all five empty library lists open their creation dialogs and restore focus on cancel', async ({ page }) => {
    await page.goto('/');
    for (const [nav, action, title] of [
      ['characters', '手动添加角色', '手动添加角色'],
      ['loadouts', '新建角色配置', '手动添加角色'],
      ['artifacts', '新建圣遗物', '手动添加圣遗物'],
      ['combinations', '新建组合', '新建组合'],
      ['team', '新建队伍', '新建队伍'],
    ]) {
      await page.getByTestId(`workspace-nav-${nav}`).click();
      const create = page.locator('#workspace-main .library-empty').getByRole('button', { name: action, exact: true });
      await create.click();
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: `关闭${title}`, exact: true }).click();
      await expect(create).toBeFocused();
    }
  });

  test('a team slot can create a recorded character from the catalog and reuse the local configuration', async ({ page }) => {
    const source = '.references/enka/official-example.json';
    test.skip(!existsSync(source), 'Requires the original public showcase with Amber and Skyward Harp.');
    const recording = JSON.parse(readFileSync(source, 'utf8')).avatarInfoList.find((avatar: { avatarId: number }) => avatar.avatarId === 10000021);
    const weapon = recording.equipList.find((item: { itemId: number }) => item.itemId === 15501).weapon;
    const constellation = recording.talentIdList.length;
    const refinement = Number(Object.values(weapon.affixMap)[0]) + 1;
    const state = (key: string) => page.evaluate(key => localStorage.getItem(key), key);
    const accountKey = 'leyline-account-0.2.0', teamKey = 'leyline-saved-teams-0.2.0';
    await page.goto('/');
    await page.getByTestId('workspace-nav-team').click();
    const initialAccount = await state(accountKey), initialTeams = await state(teamKey);
    await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
    const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
    await team.getByRole('button', { name: '选择队员3', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
    const sources = picker.getByRole('group', { name: '角色资料来源' });
    await expect(sources.getByRole('button', { name: '全部角色', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const search = picker.getByLabel('搜索游戏角色', { exact: true });
    await search.pressSequentially('安柏');
    await sources.getByRole('button', { name: '本地', exact: true }).click();
    await expect(picker.getByText('还没有本地角色配置')).toBeVisible();
    await sources.getByRole('button', { name: '全部角色', exact: true }).click();
    await expect(search).toHaveValue('安柏');
    const choice = picker.getByRole('button', { name: '选择安柏', exact: true });
    await choice.click();
    const setup = page.getByRole('dialog', { name: '安柏', exact: true });
    const saveAndSelect = setup.getByRole('button', { name: '保存', exact: true });
    await expect(saveAndSelect).toBeEnabled();
    await setup.getByRole('button', { name: `${constellation}命`, exact: true }).click();
    await page.keyboard.press('Escape');
    const guard = page.getByRole('dialog', { name: '有未保存的修改', exact: true });
    await guard.getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(setup).toHaveCount(0);
    await expect(choice).toBeFocused();
    await expect(search).toHaveValue('安柏');
    expect(await state(accountKey)).toBe(initialAccount);
    await choice.click();
    await setup.getByRole('button', { name: `${constellation}命`, exact: true }).click();
    await setup.getByRole('button', { name: '更换武器', exact: true }).click();
    const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
    await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('天空之翼');
    await weapons.getByRole('button', { name: '天空之翼', exact: true }).click();
    await setup.getByRole('button', { name: `精炼${refinement}阶`, exact: true }).click();
    await saveAndSelect.click();
    const member = team.getByRole('button', { name: '选择安柏的角色配置', exact: true });
    await expect(picker).toHaveCount(0);
    await expect(member).toBeFocused();
    const savedAccount = (await state(accountKey))!;
    const account = await readDocument<LocalAccount>(page, 'account', savedAccount);
    expect(account.characters).toHaveLength(1);
    const [amber] = account.characters;
    expect(amber.build).toMatchObject({ character: { id: 'amber' }, weapon: { id: 'skywardharp' }, level: Number(recording.propMap['4001'].val), constellation, refinement, weaponLevel: weapon.level });
    expect(await state(teamKey)).toBe(initialTeams);
    await team.getByRole('button', { name: '关闭新建队伍', exact: true }).click();
    await guard.getByRole('button', { name: '放弃修改', exact: true }).click();
    expect(await state(accountKey)).toBe(savedAccount);
    await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
    await team.getByRole('button', { name: '选择队员3', exact: true }).click();
    await picker.getByRole('button', { name: '选择安柏首选配置', exact: true }).click();
    await team.getByRole('button', { name: '保存', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '队伍详情', exact: true });
    await detail.getByRole('button', { name: '选择安柏的角色配置', exact: true }).click();
    const configurations = page.getByRole('dialog', { name: '选择角色配置', exact: true });
    await expect(configurations.getByRole('group', { name: '角色资料来源' })).toHaveCount(0);
    await expect(configurations.getByRole('button', { name: '选择安柏首选配置', exact: true })).toBeVisible();
    await configurations.getByRole('button', { name: '切换其他角色', exact: true }).click();
    await expect(sources.getByRole('button', { name: '本地', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await sources.getByRole('button', { name: '全部角色', exact: true }).click();
    await search.pressSequentially('安柏');
    await choice.click();
    const existing = page.getByRole('dialog', { name: '安柏', exact: true });
    await expect(existing.getByRole('button', { name: `精炼${refinement}阶`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await existing.getByRole('button', { name: '选用当前配置', exact: true }).click();
    await expect(picker).toHaveCount(0);
    expect(await state(accountKey)).toBe(savedAccount);
    const [saved] = await readDocument<SavedTeam[]>(page, 'saved-teams', (await state(teamKey))!);
    expect(saved.slots?.[2]?.configuration).toEqual({ accountId: account.id, characterId: amber.id, presetId: '' });
    await page.reload();
    await page.getByTestId('workspace-nav-characters').click();
    await expect(page.getByRole('button', { name: '查看安柏详情', exact: true })).toBeVisible();
    await page.getByTestId('workspace-nav-loadouts').click();
    await expect(page.getByRole('button', { name: '查看安柏首选配置', exact: true })).toBeVisible();
  });

  test('an equipment-only local configuration opens its own editor and returns to the same slot', async ({ page }) => {
    const source = '.references/enka/official-example.json';
    test.skip(!existsSync(source), 'Requires the original recorded showcase and its equipped flower.');
    await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
    await page.goto('/');
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
    const content = (await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0')))!;
    const account = await readDocument<LocalAccount>(page, 'account', content);
    const amber = account.characters.find(entry => entry.build?.character.id === 'amber')!;
    const role = page.getByRole('dialog', { name: '安柏', exact: true });
    // Use the library's own clear and equip operations to keep only her recorded flower.
    await page.getByRole('button', { name: '查看安柏详情', exact: true }).click();
    await role.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '确认清除', exact: true }).click();
    await role.getByRole('button', { name: '装备生之花', exact: true }).click();
    await page.getByRole('dialog', { name: '选择生之花', exact: true }).locator(`[data-artifact-id="${amber.equipment.flower}"]`).click();
    await role.getByRole('button', { name: '保存', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-team').click();
    await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
    const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
    await team.getByRole('button', { name: '选择队员4', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
    const select = picker.getByRole('button', { name: '选择安柏首选配置', exact: true });
    await select.click();
    await role.getByRole('button', { name: '更换武器', exact: true }).click();
    const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
    await weapons.getByRole('button', { name: amber.showcase!.build.weapon.name, exact: true }).click();
    await role.getByRole('button', { name: `${amber.build!.constellation}命`, exact: true }).click();
    await role.getByRole('button', { name: `精炼${amber.build!.refinement}阶`, exact: true }).click();
    await role.getByRole('button', { name: '保存', exact: true }).click();
    await role.getByRole('button', { name: '关闭安柏', exact: true }).click();
    await expect(select).toBeFocused();
    await select.click();
    await expect(team.locator('[data-slot="4"] .configuration-title')).toContainText(amber.showcase!.build.weapon.name);
    await expect(team.getByRole('button', { name: '选择安柏的角色配置', exact: true })).toBeFocused();
  });
});

test.describe('library-list-interactions', () => {
  const releases=JSON.parse(readFileSync('src/game-data/data/tables/catalog-release-metadata.json','utf8'));

  const source='.references/enka/uid-107590923.json';
  test.skip(!existsSync(source),'Requires the recorded 12-character showcase.');
  async function importRecorded(page:Page){
    await page.route('**/api/enka/107590923',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('107590923');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await page.getByRole('button',{name:'确认导入 12 位角色',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  test('six recorded sets paginate five, cards open directly or by keyboard menu, editing stays fixed and auto names update',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(10000);await page.setViewportSize({width:1440,height:1000});await importRecorded(page);
    const original=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    // Explicitly save six actual showcased sets; no automatic combinations or fabricated player records.
    for(let index=0;index<6;index++){
      await page.locator('.character-cards > button').nth(index).click();const role=page.getByRole('dialog').last();await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();const save=page.getByRole('dialog',{name:'保存组合',exact:true});await save.getByRole('button',{name:'保存',exact:true}).click();await expect(save).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-row')).toHaveCount(5);await expect(page.locator('.library-result-count')).toHaveText('6 组组合');const countStyle=await page.locator('.library-result-count').evaluate(node=>({font:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight}));expect(countStyle).toEqual({font:'16px',weight:'700'});
    const top=page.getByRole('navigation',{name:'顶部列表分页',exact:true}),bottom=page.getByRole('navigation',{name:'底部列表分页',exact:true});await expect(top).toBeVisible();await expect(bottom).toBeVisible();await top.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.combination-row')).toHaveCount(1);await expect(page.getByLabel('底部页码',{exact:true})).toHaveValue('2');await bottom.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.locator('.combination-row')).toHaveCount(5);await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('1');await expect(page.getByText('默认折算基准',{exact:true})).toHaveCount(0);await expect(page.locator('.combination-actions')).toHaveCount(0);
    const first=page.locator('.combination-open').first();
    await first.hover();
    await expect(page.locator('.combination-row').first()).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await first.click();const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});const name=editor.getByLabel('组合名称',{exact:true}),initialName=await name.inputValue();const order=()=>editor.locator('.effective-roll-summary > div').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-roll-stat')));const before=await order();expect(before).toEqual(['critDamage','critRate','elementalMastery','attack','defense','hp','energyRecharge']);
    const choice=editor.getByRole('button',{name:'有效词条暴击伤害',exact:true});await choice.focus();await choice.press('Space');await expect(choice).toBeFocused();expect(await order()).toEqual(before);await expect(name).not.toHaveValue(initialName);await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);
    await first.focus();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await first.press('Shift+F10');await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();await expect(editor).toBeVisible();await name.fill('手动命名的试配');await editor.getByRole('button',{name:'有效词条攻击力',exact:true}).click();await expect(name).toHaveValue('手动命名的试配');await editor.getByRole('button',{name:'自动命名',exact:true}).click();await expect(name).not.toHaveValue('手动命名的试配');await editor.getByRole('button',{name:'还原',exact:true}).click();await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
    await first.focus();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await first.press('Shift+F10');await page.getByRole('menuitem',{name:'删除',exact:true}).click();const deletion=page.getByRole('dialog',{name:'删除组合？',exact:true});await deletion.getByRole('button',{name:'取消',exact:true}).click();await expect(first).toBeFocused();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!).length)).toBe(6);expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(original);
    await page.screenshot({path:'artifacts/list-combinations-five.png',fullPage:true});await page.getByTestId('workspace-nav-loadouts').click();await expect(page.locator('.configuration-row')).toHaveCount(10);expect(await page.locator('.library-result-count').evaluate(node=>({font:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight}))).toEqual(countStyle);await top.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByLabel('底部页码',{exact:true})).toHaveValue('2');await bottom.getByRole('button',{name:'上一页',exact:true}).click();
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await expect(top).toBeVisible();await expect(bottom).toBeVisible();await page.screenshot({path:'artifacts/list-pagers-mobile.png',fullPage:true});
  });

  test('weapon choice uses a nested dialog, release order, shared controls and leaves cultivation untouched on cancel',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(10000);await page.setViewportSize({width:1440,height:1000});await importRecorded(page);await page.getByRole('button',{name:'查看菲林斯详情',exact:true}).click();const role=page.getByRole('dialog',{name:'菲林斯',exact:true}),account=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));const weapon = role.getByRole('button',{name:'更换武器',exact:true});
    await role.getByRole('heading', { name: '菲林斯', exact: true }).hover();
    await expect(weapon.locator('.card-replace-mark')).toBeHidden();
    await weapon.hover();
    await expect(weapon.locator('.card-replace-mark')).toBeVisible();
    await expect(weapon.locator('.card-replace-layer')).toHaveCSS('box-shadow', /rgb\(79, 145, 197\)/);
    await weapon.click();const weapons=page.getByRole('dialog',{name:'选择武器',exact:true});await expect(weapons).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(2);
    // Fixed catalog observation: Song of the Vigil is the newest polearm in the recorded catalog (7.0).
    await expect(weapons.locator('.catalog-browser-item').first()).toHaveText(releases.weapons.songofthevigil.name);await weapons.getByRole('button',{name:'排序',exact:true}).click();const sorting=page.getByRole('dialog',{name:'目录排序',exact:true});await expect(sorting.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');expect(await sorting.getByRole('button',{name:'完成',exact:true}).evaluate(node=>({font:getComputedStyle(node).fontSize,height:node.getBoundingClientRect().height}))).toEqual({font:'16px',height:40});await sorting.getByRole('button',{name:'完成',exact:true}).click();
    await weapons.getByRole('button',{name:'筛选',exact:true}).click();const filtering=page.getByRole('dialog',{name:'筛选目录',exact:true});await filtering.getByRole('button',{name:'五星',exact:true}).click();await filtering.getByRole('button',{name:'完成',exact:true}).click();await weapons.getByLabel('搜索装备武器',{exact:true}).pressSequentially('和璞鸢');await expect(weapons.locator('.catalog-browser-item')).toHaveCount(1);await page.screenshot({path:'artifacts/weapon-picker-shared-dialog.png',fullPage:true});await page.keyboard.press('Escape');await expect(weapons).toHaveCount(0);await expect(role.getByRole('button',{name:'更换武器',exact:true})).toBeFocused();expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(account);await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-loadouts').click();await page.setViewportSize({width:390,height:844});await chooseConfigurationRole(page,'菲林斯');await page.getByRole('button',{name:'查看菲林斯首选配置',exact:true}).click();await role.getByRole('button',{name:'更换武器',exact:true}).click();expect(await weapons.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);expect(await weapons.evaluate(node=>node.contains(document.activeElement))).toBe(true);await page.screenshot({path:'artifacts/weapon-picker-mobile.png',fullPage:true});
  });
});

test.describe('library-pagination-preferences', () => {
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
});

test.describe('library-review', () => {
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires the recorded actual Mona inventory.');
  test('actual inventory: isolated pickers, retained configurations, independent filters and responsive collections',async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
    await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));
    await page.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();
    await page.getByTestId('workspace-nav-characters').click();
    await restoreRecordedNoteSetup(page);
    await expect(page.locator('.library-result-count')).toHaveText('55 名角色');
    const columns=await page.locator('.character-cards').evaluate(node=>getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
    await expect(page.locator('.character-card')).toHaveCount(columns*5);
    const baseline=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await page.getByLabel('搜索账号角色',{exact:true}).fill('甘雨');
    await page.getByTestId('workspace-nav-loadouts').click();
    const chooseRole=page.getByRole('button',{name:'选择角色',exact:true});
    await chooseRole.click();
    const picker=page.getByRole('dialog',{name:'选择角色',exact:true});
    const pickerSearch=picker.getByLabel('搜索账号角色',{exact:true});
    await expect(pickerSearch).toHaveValue('');
    await pickerSearch.pressSequentially('琴');
    await picker.getByRole('button',{name:'选择琴',exact:true}).click();
    await expect(page.locator('.configuration-row')).toHaveCount(1);
    await expect(page.locator('.configuration-title')).toContainText('|');
    await expect(page.locator('.configuration-row.compact .card-sets')).toBeVisible();
    await page.getByRole('group',{name:'卡片密度'}).getByRole('button',{name:'疏松',exact:true}).click();
    await expect(page.locator('.configuration-row .equipment-strip-items > .artifact-item-card')).toHaveCount(5);
    await page.getByTestId('workspace-nav-characters').click();
    await expect(page.getByLabel('搜索账号角色',{exact:true})).toHaveValue('甘雨');
    await page.getByTestId('workspace-nav-loadouts').click();
    await expect(chooseRole).toContainText('琴');
    await expect(page.locator('.configuration-row .equipment-strip-items > .artifact-item-card')).toHaveCount(5);
    await page.screenshot({path:'artifacts/library-configurations-after.png',fullPage:true});
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button',{name:'排序',exact:true}).click();
    await page.getByRole('button',{name:'等级',exact:true}).click();
    await page.getByRole('button',{name:'完成',exact:true}).click();
    await page.getByRole('button',{name:'筛选',exact:true}).click();
    const filter=page.getByRole('dialog',{name:'筛选圣遗物',exact:true});
    await filter.getByRole('group',{name:'筛选副词条',exact:true}).getByRole('button',{name:'暴击率',exact:true}).click();
    await page.screenshot({path:'artifacts/library-artifact-filter-after.png',fullPage:true});
    await filter.getByRole('button',{name:'重置筛选',exact:true}).click();
    await filter.getByRole('button',{name:'完成',exact:true}).click();
    await page.getByRole('button',{name:'排序',exact:true}).click();
    await expect(page.getByRole('button',{name:'等级',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('button',{name:'从高到低',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-combinations').click();
    await page.getByLabel('搜索圣遗物组合',{exact:true}).fill('琴');
    await expect(page.locator('.combination-library .library-result-count')).toHaveText('0 组组合');
    await expect(page.locator('.combination-row')).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'还没有保存的组合',exact:true})).toBeVisible();
    await page.screenshot({path:'artifacts/library-combinations-after.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'artifacts/library-combinations-mobile-after.png',fullPage:true});
    await page.getByRole('button',{name:'打开功能导航',exact:true}).click();
    await page.getByTestId('workspace-nav-artifacts').click();
    const tabs=await page.locator('.slot-tabs > button').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent?.trim(),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,top:node.getBoundingClientRect().top})));
    expect(tabs).toHaveLength(6);expect(new Set(tabs.map(tab=>tab.top)).size).toBe(2);expect(tabs.every(tab=>Math.abs(tab.height-40)<.5)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:'artifacts/library-artifacts-mobile-after.png',fullPage:true});
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline);
    expect(errors).toEqual([]);
  });
});

test.describe('workspace-recovery', () => {
  test('the workspace recovers after its page chunk fails to load', async ({ page }) => {
    const chunk = '**/src/pages/WorkspaceShell.vue*';
    await page.route(chunk, route => route.abort());
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '页面未能加载', exact: true })).toBeVisible();
    await page.unroute(chunk);
    await page.getByRole('button', { name: '重新加载页面', exact: true }).click();
    await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current', 'page');
  });
});
