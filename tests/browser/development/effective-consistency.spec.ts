import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {chooseConfigurationRole} from '../../helpers/choose-configuration-role';
const path='.references/enka/uid-107590923.json';
test.skip(!existsSync(path),'Requires the recorded showcase containing Flins.');
async function importRecorded(page:Page,all=false){
  await page.route('**/api/enka/107590923',route=>route.fulfill({json:JSON.parse(readFileSync(path,'utf8'))}));await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('107590923');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  if(!all){await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.getByRole('button',{name:'导入菲林斯',exact:true}).click();}
  await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await page.getByRole('button',{name:/^确认导入 \d+ 位角色$/}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('recorded Flins shows 8.3 weighted attack, captures creation weapon and shares details everywhere',async({page})=>{
  test.setTimeout(60000);page.setDefaultTimeout(10000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});await importRecorded(page);
  // Normalized by the confirmed UI import for an isolated package check; not a player-provided export.
  writeFileSync('artifacts/u1-effective-recorded-account.json',await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0')!));
  await page.getByRole('button',{name:'查看菲林斯详情',exact:true}).click();const role=page.getByRole('dialog',{name:'菲林斯',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();
  const attack=role.locator('.effective-roll-summary [data-roll-stat=attack] dd');await expect(attack).toHaveText('8.3 条');expect(await role.locator('.effective-roll-summary > div').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-roll-stat')))).toEqual(['critDamage','critRate','elementalMastery','attack','defense','hp','energyRecharge']);
  expect(await role.locator('.effective-roll-summary > .effective').first().evaluate(node=>getComputedStyle(node).color)).toBe(await role.locator('.effective-substat').first().evaluate(node=>getComputedStyle(node).color));await expect(role.getByRole('region',{name:'配置对比',exact:true})).toBeVisible();
  await role.getByRole('button',{name:'保存组合',exact:true}).click();const save=page.getByRole('dialog',{name:'保存组合',exact:true});await expect(save.locator('.effective-roll-summary [data-roll-stat=attack] dd')).toHaveText('8.3 条');await page.screenshot({path:'artifacts/combination-save-ui-restored.png',fullPage:true});await save.getByRole('button',{name:'保存',exact:true}).click();await expect(save).toHaveCount(0);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!));expect(stored[0].basis.attack).toBeCloseTo(1025.9268,2);
  await role.getByRole('button',{name:'本地',exact:true}).click();await expect(role.getByRole('button',{name:'应用组合',exact:true})).toHaveAttribute('data-accent','hydro');await role.getByRole('button',{name:'应用组合',exact:true}).click();await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();await expect(attack).toHaveText('8.3 条');await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
  // UI cultivation trial creates a comparison candidate; it is not a player configuration export.
  const source=JSON.parse(readFileSync(path,'utf8')).avatarInfoList.find((avatar:{avatarId:number})=>avatar.avatarId===10000120);const rank=(source.talentIdList ?? []).length;await role.getByRole('button',{name:`${rank===0?1:0}命`,exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await expect(page.getByRole('dialog',{name:'另存角色配装方案',exact:true})).toHaveCount(0);
  await role.getByRole('button',{name:'选择菲林斯配置',exact:true}).click();await page.getByRole('dialog',{name:'菲林斯的配置',exact:true}).getByRole('button',{name:'选择菲林斯首选配置',exact:true}).click();await role.getByRole('button',{name:'更换武器',exact:true}).click();await role.getByLabel('搜索装备武器',{exact:true}).fill('西风长枪');await role.getByRole('button',{name:'西风长枪',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();await expect.poll(()=>page.evaluate(()=>{const file=JSON.parse(localStorage.getItem('leyline-account-0.2.0')!);return file.content.weapons[file.document.characters[0].build.weapon].name;})).toBe('西风长枪');await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
  await page.getByTestId('workspace-nav-combinations').click();const combination=page.locator('.combination-row');await expect(combination.locator('[data-roll-stat=attack] dd')).toHaveText('8.3');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!)[0].basis)).toEqual(stored[0].basis);await expect(combination.locator('.compact-entry:has([data-stat=attack])').first()).toHaveClass(/effective-substat/);await page.screenshot({path:'artifacts/effective-flins-combination-frozen.png',fullPage:true});
  await page.getByTestId('workspace-nav-loadouts').click();await expect(page.locator('.configuration-row.compact')).toHaveCount(2);await page.getByRole('button',{name:'排序',exact:true}).click();await expect(page.getByRole('dialog',{name:'配置排序',exact:true}).getByRole('button',{name:'有效词条数',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'完成',exact:true}).click();await expect(page.locator('.configuration-kind').first()).toHaveCSS('font-size','16px');await expect(page.locator('.configuration-row .effective-roll-summary.stacked .effective').first()).toBeVisible();
  await page.getByRole('button',{name:'查看菲林斯首选配置',exact:true}).click();await expect(role.getByRole('region',{name:'配置对比',exact:true})).toBeVisible();await expect(role.getByRole('button',{name:'应用组合',exact:true})).toHaveAttribute('data-accent','hydro');await page.screenshot({path:'artifacts/effective-flins-unified-details.png',fullPage:true});await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test('recorded configurations filter in the character dialog, fit two compact cards per row, and reset to effective rolls',async({page})=>{
  test.setTimeout(60000);page.setDefaultTimeout(10000);await page.setViewportSize({width:1440,height:1000});await importRecorded(page,true);const bounds:{x:number;y:number;width:number;height:number}[]=[];
  for(const tab of ['characters','artifacts','loadouts','combinations']){
    await page.getByTestId(`workspace-nav-${tab}`).click();const toolbar=page.locator('#workspace-main > .library-page .library-toolbar').first();await expect(toolbar).toBeVisible();bounds.push(await toolbar.locator('input').evaluate(input=>{const box=input.getBoundingClientRect();return {x:box.x,y:box.y+scrollY,width:box.width,height:box.height};}));await expect(toolbar.getByRole('button',{name:'清除筛选和排序条件',exact:true})).toBeVisible();
    await toolbar.getByRole('button',{name:'排序',exact:true}).click();const sort=page.getByRole('dialog').last();
    if(tab!=='loadouts')await sort.getByRole('group',{name:'排序依据'}).getByRole('button').last().click();
    await sort.getByRole('button',{name:'从低到高',exact:true}).click();await sort.getByRole('button',{name:'完成',exact:true}).click();await toolbar.getByRole('button',{name:'清除筛选和排序条件',exact:true}).click();await expect(toolbar.getByRole('button',{name:'清除筛选和排序条件',exact:true})).toBeDisabled();
    await toolbar.getByRole('button',{name:'排序',exact:true}).click();const reset=page.getByRole('dialog').last();
    const defaultLabel=tab==='loadouts' || tab==='combinations'?'有效词条数':'实装版本';
    const choices=reset.getByRole('group',{name:'排序依据'}).getByRole('button');
    await expect(reset.getByRole('button',{name:defaultLabel,exact:true})).toHaveAttribute('aria-pressed','true');
    if(tab==='loadouts')await expect(choices.first()).toHaveText(defaultLabel);
    await expect(reset.getByRole('button',{name:'从高到低',exact:true})).toHaveAttribute('aria-pressed','true');
    await reset.getByRole('button',{name:'完成',exact:true}).click();
    if(tab==='artifacts'){
      const shortcuts=await page.locator('.inventory-options .slot-tabs > button, .inventory-options [aria-label="卡片密度"]').evaluateAll(nodes=>nodes.map(node=>{
        const { height, top }=node.getBoundingClientRect();return { height, top };
      }));
      expect(shortcuts).toHaveLength(7);
      expect(shortcuts.every(box=>box.height===40 && box.top===shortcuts[0].top)).toBe(true);
    }
  }
  expect(Math.max(...bounds.map(box=>box.x))-Math.min(...bounds.map(box=>box.x))).toBeLessThan(.5);expect(Math.max(...bounds.map(box=>box.y))-Math.min(...bounds.map(box=>box.y))).toBeLessThan(.5);expect(Math.max(...bounds.map(box=>box.width))-Math.min(...bounds.map(box=>box.width))).toBeLessThan(.5);expect(bounds.every(box=>box.height===40)).toBe(true);
  await page.getByTestId('workspace-nav-loadouts').click();
  const roleShortcuts=page.getByRole('group',{name:'按角色筛选',exact:true});
  const roles=roleShortcuts.getByRole('button',{name:'选择角色',exact:true});
  const allRoles=roleShortcuts.getByRole('button',{name:'全部角色',exact:true});
  const layout=page.getByRole('group',{name:'卡片密度',exact:true});
  const rows=page.locator('.configuration-row');
  const shortcutBoxes=await Promise.all([roles.boundingBox(),allRoles.boundingBox(),layout.boundingBox()]);
  expect(shortcutBoxes.every(box=>box?.height===40 && box.y===shortcutBoxes[0]?.y)).toBe(true);
  await roles.press('Enter');
  const picker=page.getByRole('dialog',{name:'选择角色',exact:true});
  await expect(picker.getByRole('button',{name:'关闭选择角色',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(roles).toBeFocused();
  await chooseConfigurationRole(page,'菲林斯');
  await expect(roles).toBeFocused();
  await expect(roles).toContainText('菲林斯');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('菲林斯');
  await allRoles.focus();await allRoles.press('Space');
  await expect(allRoles).toHaveAttribute('aria-pressed','true');
  await expect(rows).toHaveCount(10);
  await chooseConfigurationRole(page,'菲林斯');
  await page.getByRole('button',{name:'清除筛选和排序条件',exact:true}).click();
  await expect(roles).toHaveText('选择角色');

  await expect(layout.getByRole('button',{name:'紧凑',exact:true})).toHaveAttribute('aria-pressed','true');
  await layout.getByRole('button',{name:'疏松',exact:true}).click();
  await expect(rows).toHaveCount(5);
  const relaxed=await rows.first().boundingBox();
  const stats=rows.first().locator('.effective-roll-summary > div');
  const values=await stats.locator('dd').allTextContents();
  await layout.getByRole('button',{name:'紧凑',exact:true}).click();
  await expect(rows.first().locator('.card-set').first()).toBeVisible();
  await expect(rows.first().locator('.configuration-cultivation,.equipment-strip')).toHaveCount(0);
  expect(await stats.locator('dd').allTextContents()).toEqual(values);
  const [first,second]=await Promise.all([rows.nth(0).boundingBox(),rows.nth(1).boundingBox()]);
  expect(first!.y).toBeCloseTo(second!.y,1);
  expect(first!.x).toBeLessThan(second!.x);
  expect(first!.width).toBeLessThan(relaxed!.width);
  expect(first!.height).toBeLessThan(relaxed!.height);
  const statLayout=await stats.evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top, fits:node.scrollWidth<=node.clientWidth})));
  expect(new Set(statLayout.map(box=>box.top)).size).toBeGreaterThan(1);
  expect(statLayout.every(box=>box.fits)).toBe(true);
  const rowCount=()=>rows.evaluateAll(nodes=>new Set(nodes.map(node=>node.getBoundingClientRect().top)).size);
  await expect(rows).toHaveCount(10);
  expect(await rowCount()).toBe(5);
  await page.screenshot({path:'artifacts/effective-library-toolbars-aligned.png',fullPage:true});

  const topPager=page.getByRole('navigation',{name:'顶部列表分页'});
  await topPager.getByRole('button',{name:'下一页'}).click();
  await expect(rows).toHaveCount(2);
  const lastIds=()=>rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-configuration-id')));
  const lastPage=await lastIds();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('3');
  expect(await lastIds()).toEqual(lastPage);
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('2');
  expect(await lastIds()).toEqual(lastPage);
  await topPager.getByRole('button',{name:'上一页'}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(rows).toHaveCount(5);
  expect(await rowCount()).toBe(5);
  await expect(allRoles).toBeInViewport();
  expect((await layout.boundingBox())!.y).toBeCloseTo((await allRoles.boundingBox())!.y,1);
  const [mobileFirst,mobileSecond]=await Promise.all([rows.nth(0).boundingBox(),rows.nth(1).boundingBox()]);
  expect(mobileFirst!.x).toBeCloseTo(mobileSecond!.x,1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:'artifacts/effective-all-roles-header-mobile.png',fullPage:true});
  await roles.click();
  expect(await picker.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.screenshot({path:'artifacts/configuration-role-picker-mobile.png',fullPage:true});
  await picker.getByRole('button',{name:'全部角色',exact:true}).click();
  await expect(roles).toBeFocused();
});
