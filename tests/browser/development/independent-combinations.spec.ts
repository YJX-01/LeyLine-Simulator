import { recordedJsonFile } from '../../helpers/recorded-reference';
import { existsSync,readFileSync } from 'node:fs';
import { test,expect,type Page } from '@playwright/test';
const showcase='.references/enka/official-example.json';
test.skip(!existsSync(showcase),'Requires the recorded public showcase.');
async function importShowcase(page:Page,local=false){
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(showcase,'utf8'))}));
  await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();
  await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  if(local){await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await expect(page.getByRole('dialog',{name:'从角色展柜导入',exact:true})).toContainText('圣遗物新增 20 件');}else await page.getByRole('button',{name:'仅保存展柜',exact:true}).click();
  await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
}
async function combos(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-v1') ?? '[]'));}

test('recorded items: explicit standalone save, duplicate reuse, draft application, comparison and independent edits',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});await importShowcase(page,true);
  expect(await combos(page)).toHaveLength(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).artifacts.length)).toBe(20);
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});
  await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();
  const initialDraft=page.getByRole('dialog',{name:'保存组合',exact:true});await expect(initialDraft).toBeVisible();expect(await combos(page)).toHaveLength(0);await expect(initialDraft.getByRole('button',{name:'保存',exact:true})).toBeEnabled();await expect(initialDraft.getByLabel('组合名称',{exact:true})).toHaveValue(/^2染血\+2苍白-攻物爆/);await initialDraft.getByRole('button',{name:'保存',exact:true}).click();
  expect(await combos(page)).toHaveLength(1);
  await role.getByRole('button',{name:'本地',exact:true}).click();await role.getByRole('button',{name:'应用组合',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'选择圣遗物组合',exact:true});await picker.getByRole('button',{name:'应用组合',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).characters.find((item:{name:string})=>item.name==='安柏').equipment)).toEqual({});
  await role.getByRole('button',{name:'保存',exact:true}).click();
  const adopted=await page.evaluate(()=>localStorage.getItem('leyline-account-v2'));expect(Object.values(JSON.parse(adopted!).characters.find((item:{name:string})=>item.name==='安柏').equipment)).toHaveLength(5);
  await role.getByRole('button',{name:'保存组合',exact:true}).click();await expect(page.getByRole('dialog',{name:'编辑组合',exact:true})).toBeVisible();
  expect(await combos(page)).toHaveLength(1);await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-heading .combination-reference .characters')).toHaveCount(1);await page.getByRole('button',{name:/^查看组合：/}).click();
  const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});await editor.getByRole('button',{name:'有效词条生命值',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(adopted);
  await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
  await role.getByRole('button',{name:'保存组合',exact:true}).click();await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await page.keyboard.press('Escape');
  expect(await combos(page)).toHaveLength(2);
  await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-row')).toHaveCount(2);await page.screenshot({path:'artifacts/independent-combination-library.png',fullPage:true});
  await page.locator('.combination-row').first().getByRole('button',{name:/^查看组合：/}).click();const comparisonEditor=page.getByRole('dialog',{name:'编辑组合',exact:true});
  const compareSelect=comparisonEditor.getByLabel('选择对比组合',{exact:true});await compareSelect.selectOption((await compareSelect.locator('option').nth(1).getAttribute('value'))!);
  await expect(comparisonEditor.locator('.comparison-stats tbody tr')).toHaveCount(7);await page.screenshot({path:'artifacts/independent-combination-comparison.png',fullPage:true});
  const savedBefore=JSON.stringify(await combos(page));await comparisonEditor.getByRole('button',{name:'结束对比',exact:true}).click();expect(JSON.stringify(await combos(page))).toBe(savedBefore);
  await compareSelect.selectOption((await compareSelect.locator('option').nth(1).getAttribute('value'))!);await page.setViewportSize({width:390,height:844});expect(await comparisonEditor.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/independent-combination-comparison-mobile.png',fullPage:true});
  await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:900});await page.reload();await page.getByTestId('workspace-nav-combinations').click();expect(await combos(page)).toHaveLength(2);
  // Trial derived by unequipping one recorded item; it is not presented as a player export.
  await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
  await role.getByRole('button',{name:'管理生之花',exact:true}).click();await page.getByRole('dialog',{name:'选择生之花',exact:true}).getByRole('button',{name:'卸下',exact:true}).click();
  await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-loadouts').click();await page.getByRole('button',{name:'筛选配置角色',exact:true}).click();
  await page.getByRole('dialog',{name:'选择角色',exact:true}).getByRole('button',{name:'选择安柏',exact:true}).click();
  await expect(page.locator('.configuration-row')).toHaveCount(2);
  await page.getByRole('button',{name:'查看安柏首选配置',exact:true}).click();const configurationCompare=role.getByLabel('选择对比配置',{exact:true});await configurationCompare.selectOption((await configurationCompare.locator('option').nth(1).getAttribute('value'))!);await expect(role.locator('.comparison-slot').first()).toContainText('未装备');
  await page.screenshot({path:'artifacts/character-configuration-comparison.png',fullPage:true});await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(adopted);expect(await combos(page)).toHaveLength(2);
});

test('showcase combination stays a draft until Save, confirmation cancel and discard create nothing',async({page})=>{
  await importShowcase(page);await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});
  await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'保存组合',exact:true});await expect(editor).toBeVisible();expect(await combos(page)).toHaveLength(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).artifacts.length)).toBe(0);
  await editor.getByRole('button',{name:'保存',exact:true}).click();const confirm=page.getByRole('dialog',{name:'入库并保存组合？',exact:true});await expect(confirm).toContainText('圣遗物新增 5 件');await confirm.getByRole('button',{name:'取消',exact:true}).click();
  expect(await combos(page)).toHaveLength(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).artifacts.length)).toBe(0);
  await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();expect(await combos(page)).toHaveLength(0);
  await role.getByRole('button',{name:'保存组合',exact:true}).click();const automatic=await editor.getByLabel('组合名称',{exact:true}).inputValue();
  await editor.getByLabel('组合名称',{exact:true}).fill('安柏试配');await expect(editor.getByRole('button',{name:'还原',exact:true})).toBeEnabled();await editor.getByRole('button',{name:'还原',exact:true}).click();await expect(editor.getByLabel('组合名称',{exact:true})).toHaveValue(automatic);
  await editor.getByLabel('组合名称',{exact:true}).fill('安柏物伤组合');await page.screenshot({path:'artifacts/combination-save-draft.png',fullPage:true});await editor.getByRole('button',{name:'保存',exact:true}).click();await confirm.getByRole('button',{name:'保存组合',exact:true}).click();
  await expect(editor).toHaveCount(0);expect(await combos(page)).toHaveLength(1);expect((await combos(page))[0].name).toBe('安柏物伤组合');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).artifacts.length)).toBe(5);
  await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-heading h3')).toHaveText('安柏物伤组合');await page.reload();await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-heading h3')).toHaveText('安柏物伤组合');
});

test('actual Mona items: independent creation, restore, discard and deletion never equip or auto-create',async({page})=>{
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual Mona inventory.');test.setTimeout(60000);
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button',{name:'莫娜导入',exact:true}).click();await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));
  await page.getByRole('button',{name:'确认导入 458 件五星圣遗物',exact:true}).click();const before=await page.evaluate(()=>localStorage.getItem('leyline-account-v2'));
  await page.getByTestId('workspace-nav-combinations').click();await expect(page.getByRole('heading',{name:'还没有保存的组合',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'新建组合',exact:true}).first().click();const editor=page.getByRole('dialog',{name:'新建组合',exact:true});
  await editor.getByRole('button',{name:'选择参考角色',exact:true}).click();const reference=page.getByRole('dialog',{name:'选择参考角色',exact:true});await reference.getByLabel('搜索参考角色',{exact:true}).fill('琴');await reference.getByRole('button',{name:'选择琴',exact:true}).click();
  // A trial assembled through the UI from five traceable inventory items, not a player export.
  for(const slot of ['生之花','死之羽','时之沙','空之杯','理之冠']){
    await editor.getByRole('button',{name:`装备${slot}`,exact:true}).click();const picker=page.getByRole('dialog',{name:`选择${slot}`,exact:true});await picker.locator('.inventory-card').first().click();
  }
  await page.screenshot({path:'artifacts/independent-combination-editor.png',fullPage:true});await editor.getByRole('button',{name:'保存',exact:true}).click();expect(await combos(page)).toHaveLength(1);
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(before);
  await page.getByRole('button',{name:/^查看组合：/}).click();const editing=page.getByRole('dialog',{name:'编辑组合',exact:true});
  await editing.getByRole('button',{name:'管理生之花',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'替换',exact:true}).click();await page.getByRole('dialog',{name:'选择生之花',exact:true}).getByRole('button',{name:'卸下',exact:true}).click();await editing.getByRole('button',{name:'还原',exact:true}).click();await expect(editing.getByRole('button',{name:'管理生之花',exact:true})).toBeVisible();
  await editing.getByRole('button',{name:'有效词条生命值',exact:true}).click();const saved=JSON.stringify(await combos(page));await page.keyboard.press('Escape');
  await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();expect(JSON.stringify(await combos(page))).toBe(saved);
  const openCombination=page.locator('.combination-open').first();await openCombination.focus();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await openCombination.press('Shift+F10');await page.getByRole('menuitem',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除组合？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();expect(await combos(page)).toHaveLength(0);
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(before);
});
