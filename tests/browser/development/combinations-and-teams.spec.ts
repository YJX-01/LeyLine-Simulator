import { existsSync, readFileSync } from 'node:fs';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { recordedJsonFile } from '../../helpers/recorded-reference';
import { chooseConfigurationRole } from '../../helpers/choose-configuration-role';
import { type LocalAccount } from '@leyline/schema';
import { type SavedTeam } from '../../../src/web/src/stores/saved-teams';
import { readDocument } from '../../helpers/browser-document';

test.describe('combination-favorites-and-sets', () => {
  const source='.references/enka/official-example.json';
  test.skip(!existsSync(source),'Requires the recorded actual four-character showcase.');

  async function readCombinations(page:Page) {
    return page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0') ?? '[]') as {id:string;favorite?:number;name?:string}[]);
  }

  test('recorded showcase combinations preserve favorite grades; both set filters share rarity and release order',async({page})=>{
    test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
    for(const name of ['安柏','班尼特']){
      await page.getByRole('button',{name:`查看${name}详情`,exact:true}).click();
      const role=page.getByRole('dialog',{name,exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();
      await role.getByRole('button',{name:'保存组合',exact:true}).click();
      await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
      await role.getByRole('button',{name:`关闭${name}`,exact:true}).click();
    }
    const inventory=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.locator('#workspace-main .library-toolbar').getByRole('button',{name:'筛选',exact:true}).click();
    const artifacts=page.getByRole('dialog',{name:'筛选圣遗物',exact:true});
    await artifacts.getByLabel('筛选套装',{exact:true}).click();
    const inventorySets=artifacts.locator('.artifact-set-filter .picker-options button');
    await expect(inventorySets.first()).toHaveAttribute('data-option-id','heartofthefurnace');
    await expect(inventorySets.nth(1)).toHaveAttribute('data-option-id','scarletproof');
    const setOrder=await inventorySets.evaluateAll(nodes=>nodes.map(node=>({id:node.getAttribute('data-option-id'),rarity:Number(node.getAttribute('data-rarity'))})));
    expect(setOrder.findIndex(item=>item.id==='gladiatorsfinale')).toBeLessThan(setOrder.findIndex(item=>item.id==='instructor'));
    expect(setOrder.every((item,index)=>index===0 || setOrder[index-1].rarity>=item.rarity)).toBe(true);
    const instructor=artifacts.getByRole('button',{name:'教官',exact:true});
    await instructor.scrollIntoViewIfNeeded();await expect(instructor.locator('.game-icon')).toHaveAttribute('data-rarity','4');
    await expect(instructor.locator('.game-icon')).toHaveCSS('background-color','rgb(239, 232, 248)');
    await page.screenshot({path:'artifacts/combination-favorites-set-filter.png',fullPage:true});
    await page.keyboard.press('Escape');await artifacts.getByRole('button',{name:'完成',exact:true}).click();
    await page.getByTestId('workspace-nav-combinations').click();
    const rows=page.locator('.combination-row');await expect(rows).toHaveCount(2);
    const firstId=(await readCombinations(page))[0].id,first=page.locator(`.combination-row[data-combination-id="${firstId}"]`);
    await first.click({button:'right'});await page.getByRole('menuitem',{name:'收藏',exact:true}).click();
    await expect(first.locator('.favorite-mark')).toHaveAttribute('data-level','1');
    await first.locator('.combination-open').click();const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});
    const favorite=editor.getByRole('button',{name:'设置组合收藏',exact:true});
    await favorite.click();await expect(favorite.locator('.favorite-mark')).toHaveAttribute('data-level','2');
    await favorite.click();await expect(favorite.locator('.favorite-mark')).toHaveAttribute('data-level','3');
    await editor.getByLabel('组合名称',{exact:true}).fill('安柏收藏配装');await editor.getByRole('button',{name:'保存',exact:true}).click();
    expect((await readCombinations(page)).find(item=>item.id===firstId)?.favorite).toBe(3);
    await page.reload();await page.getByTestId('workspace-nav-combinations').click();await expect(first.locator('.favorite-mark')).toHaveAttribute('data-level','3');
    const secondId=(await readCombinations(page)).find(item=>item.id!==firstId)!.id;
    const second=page.locator(`.combination-row[data-combination-id="${secondId}"]`);
    await second.click({button:'right'});await page.getByRole('menuitem',{name:'收藏',exact:true}).click();
    await page.locator('#workspace-main .library-toolbar').getByRole('button',{name:'筛选',exact:true}).click();
    const filter=page.getByRole('dialog',{name:'筛选组合',exact:true});await expect(filter).not.toContainText('完整度');
    await filter.getByLabel('组合套装',{exact:true}).click();
    expect(await filter.locator('.artifact-set-filter .picker-options button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-option-id')))).toEqual(setOrder.map(item=>item.id));
    await page.keyboard.press('Escape');const grades=filter.getByRole('group',{name:'组合收藏等级',exact:true});
    await grades.getByRole('button',{name:'3级收藏',exact:true}).click();await expect(rows).toHaveCount(1);await expect(first).toBeVisible();
    await grades.getByRole('button',{name:'1级收藏',exact:true}).click();await expect(rows).toHaveCount(2);
    await filter.getByRole('button',{name:'重置筛选',exact:true}).click();await filter.getByRole('button',{name:'完成',exact:true}).click();
    await page.locator('#workspace-main .library-toolbar').getByRole('button',{name:'排序',exact:true}).click();
    const sorting=page.getByRole('dialog',{name:'组合排序',exact:true});await sorting.getByRole('button',{name:'收藏等级',exact:true}).click();await sorting.getByRole('button',{name:'完成',exact:true}).click();
    await expect(rows.first()).toHaveAttribute('data-combination-id',firstId);
    await page.screenshot({path:'artifacts/combination-favorites-list.png',fullPage:true});
    await first.click({button:'right'});await page.getByRole('menuitem',{name:'取消收藏',exact:true}).click();
    expect((await readCombinations(page)).find(item=>item.id===firstId)?.favorite).toBe(0);
    await second.locator('.combination-open').click();
    const combinationName=editor.getByLabel('组合名称',{exact:true}),automatic=editor.getByRole('button',{name:'自动命名',exact:true});
    const generated=await combinationName.inputValue();
    await expect(automatic).toHaveCSS('height','40px');
    await combinationName.press('ControlOrMeta+A');await combinationName.pressSequentially('临时名称');
    await automatic.click();await expect(combinationName).toHaveValue(generated);
    const remove=editor.getByRole('button',{name:'删除',exact:true}),confirmation=page.getByRole('dialog',{name:'删除组合？',exact:true});
    await remove.click();await confirmation.getByRole('button',{name:'取消',exact:true}).click();
    await expect(remove).toBeFocused();expect(await readCombinations(page)).toHaveLength(2);
    await remove.click();await confirmation.getByRole('button',{name:'删除',exact:true}).click();
    await expect(editor).toHaveCount(0);await expect(rows).toHaveCount(1);
    expect((await readCombinations(page)).map(item=>item.id)).toEqual([firstId]);
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(inventory);
    for(const tab of ['characters','loadouts','artifacts','combinations']){
      await page.getByTestId(`workspace-nav-${tab}`).click();await expect(page.locator('#workspace-main .library-page .library-corner-ornaments i')).toHaveCount(4);
      await page.screenshot({path:`artifacts/library-corners-${tab}.png`,fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'artifacts/combination-favorites-mobile.png',fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
  });
});

test.describe('combination-reference-copy', () => {
  const source='.references/enka/uid-107590923.json';
  test.skip(!existsSync(source),'Requires recorded Flins showcase.');
  test('reference portrait is independent of wearers, clear is explicit, Save As preserves the original and auto name stays available',async({page})=>{
    test.setTimeout(45000);page.setDefaultTimeout(8000);await page.setViewportSize({width:1440,height:1000});
    await page.route('**/api/enka/107590923',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('107590923');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.getByRole('button',{name:'导入菲林斯',exact:true}).click();await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await page.getByRole('button',{name:'确认导入 1 位角色',exact:true}).click();
    const inventory=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));await page.getByRole('button',{name:'查看菲林斯详情',exact:true}).click();const role=page.getByRole('dialog',{name:'菲林斯',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-combinations').click();const rows=page.locator('.combination-row');await expect(rows).toHaveCount(1);await expect(rows.first().getByRole('img',{name:'参考角色：菲林斯',exact:true})).toBeVisible();await expect(rows.first()).not.toContainText('5/5');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters[0].equipment)).toEqual(JSON.parse(inventory!).document.characters[0].equipment);
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!));const original=(await read())[0],originalJson=JSON.stringify(original);await rows.first().locator('.combination-open').click();const editor=page.getByRole('dialog',{name:'编辑组合',exact:true}),automatic=editor.getByRole('button',{name:'自动命名',exact:true});await expect(automatic).toBeEnabled();await expect(automatic).toHaveCSS('opacity','1');const name=editor.getByLabel('组合名称',{exact:true}),autoName=await name.inputValue();await name.fill('手动试配名称');await automatic.click();await expect(name).toHaveValue(autoName);await editor.getByRole('button',{name:'另存',exact:true}).click();await expect(editor).toHaveCount(0);await expect(rows).toHaveCount(2);let saved=await read();expect(JSON.stringify(saved.find((entry:{id:string})=>entry.id===original.id))).toBe(originalJson);
    const copy=saved.find((entry:{id:string})=>entry.id!==original.id),copyRow=page.locator(`.combination-row[data-combination-id="${copy.id}"]`);await copyRow.locator('.combination-open').click();const beforeStats=copy.stats;await editor.getByRole('button',{name:'菲林斯',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择参考角色',exact:true});await picker.getByRole('button',{name:'不选参考角色',exact:true}).click();await expect(editor.getByRole('button',{name:'选择参考角色',exact:true})).toBeVisible();await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);await expect(copyRow.locator('.combination-reference')).toHaveCount(0);saved=await read();const cleared=saved.find((entry:{id:string})=>entry.id===copy.id);expect(cleared.stats).toEqual(beforeStats);expect(cleared.referenceName).toBe('');expect(cleared.basis).toEqual({hp:14000,attack:750,defense:700,source:'default'});expect(JSON.stringify(saved.find((entry:{id:string})=>entry.id===original.id))).toBe(originalJson);
    await copyRow.locator('.combination-open').click();await editor.getByRole('button',{name:'选择参考角色',exact:true}).click();await picker.getByLabel('搜索参考角色',{exact:true}).pressSequentially('琴');await picker.getByRole('button',{name:'选择琴',exact:true}).click();await editor.getByRole('button',{name:'另存',exact:true}).click();await expect(rows).toHaveCount(3);const jean=rows.filter({has:page.getByRole('img',{name:'参考角色：琴',exact:true})});await expect(jean).toHaveCount(1);await expect.poll(()=>jean.locator('.combination-reference img:not(.element-badge)').evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(inventory);
    await page.screenshot({path:'artifacts/reference-combinations-copy-clear.png',fullPage:true});
  });
});

test.describe('independent-combinations', () => {
  const showcase='.references/enka/official-example.json';
  test.skip(!existsSync(showcase),'Requires the recorded public showcase.');
  async function importShowcase(page:Page,local=false){
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(showcase,'utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    if(local){await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await expect(page.getByRole('dialog',{name:'从角色展柜导入',exact:true})).toContainText('圣遗物新增 20 件');}else await page.getByRole('button',{name:'仅保存展柜',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
  }
  async function combos(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0') ?? '[]'));}

  test('recorded items: explicit standalone save, duplicate reuse, draft application, comparison and independent edits',async({page})=>{
    test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});await importShowcase(page,true);
    expect(await combos(page)).toHaveLength(0);
    const importedEquipment=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((item:{name:string})=>item.name==='安柏').equipment);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(20);
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});
    await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();
    const initialDraft=page.getByRole('dialog',{name:'保存组合',exact:true});await expect(initialDraft).toBeVisible();expect(await combos(page)).toHaveLength(0);await expect(initialDraft.getByRole('button',{name:'保存',exact:true})).toBeEnabled();await expect(initialDraft.getByLabel('组合名称',{exact:true})).toHaveValue(/^2染血\+2苍白-攻物爆/);await initialDraft.getByRole('button',{name:'保存',exact:true}).click();
    expect(await combos(page)).toHaveLength(1);
    await role.getByRole('button',{name:'本地',exact:true}).click();await role.getByRole('button',{name:'应用组合',exact:true}).click();
    const picker=page.getByRole('dialog',{name:'选择圣遗物组合',exact:true});await picker.getByRole('button',{name:'应用组合',exact:true}).click();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((item:{name:string})=>item.name==='安柏').equipment)).toEqual(importedEquipment);
    await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    const adopted=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));expect(Object.values(JSON.parse(adopted!).document.characters.find((item:{name:string})=>item.name==='安柏').equipment)).toHaveLength(5);
    await role.getByRole('button',{name:'保存组合',exact:true}).click();await expect(page.getByRole('dialog',{name:'编辑组合',exact:true})).toBeVisible();
    expect(await combos(page)).toHaveLength(1);await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-heading .combination-reference .characters')).toHaveCount(1);await page.getByRole('button',{name:/^查看组合：/}).click();
    const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});await editor.getByRole('button',{name:'有效词条生命值',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(adopted);
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
    await role.getByRole('button',{name:'替换生之花',exact:true}).click();await page.getByRole('dialog',{name:'选择生之花',exact:true}).getByRole('button',{name:'卸下',exact:true}).click();
    await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-loadouts').click();
    await chooseConfigurationRole(page,'安柏');
    await expect(page.locator('.configuration-row')).toHaveCount(2);
    await page.getByRole('button',{name:'查看安柏首选配置',exact:true}).click();const configurationCompare=role.getByLabel('选择对比配置',{exact:true});await configurationCompare.selectOption((await configurationCompare.locator('option').nth(1).getAttribute('value'))!);await expect(role.locator('.comparison-slot').first()).toContainText('未装备');
    await page.screenshot({path:'artifacts/character-configuration-comparison.png',fullPage:true});await page.keyboard.press('Escape');
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(adopted);expect(await combos(page)).toHaveLength(2);
  });

  test('showcase combination stays a draft until Save, confirmation cancel and discard create nothing',async({page})=>{
    await importShowcase(page);await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});
    await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'保存组合',exact:true});await expect(editor).toBeVisible();expect(await combos(page)).toHaveLength(0);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(0);
    await editor.getByRole('button',{name:'保存',exact:true}).click();const confirm=page.getByRole('dialog',{name:'入库并保存组合？',exact:true});await expect(confirm).toContainText('圣遗物新增 5 件');await confirm.getByRole('button',{name:'取消',exact:true}).click();
    expect(await combos(page)).toHaveLength(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(0);
    await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();expect(await combos(page)).toHaveLength(0);
    await role.getByRole('button',{name:'保存组合',exact:true}).click();const automatic=await editor.getByLabel('组合名称',{exact:true}).inputValue();
    await editor.getByLabel('组合名称',{exact:true}).fill('安柏试配');await expect(editor.getByRole('button',{name:'还原',exact:true})).toBeEnabled();await editor.getByRole('button',{name:'还原',exact:true}).click();await expect(editor.getByLabel('组合名称',{exact:true})).toHaveValue(automatic);
    await editor.getByLabel('组合名称',{exact:true}).fill('安柏物伤组合');await page.screenshot({path:'artifacts/combination-save-draft.png',fullPage:true});await editor.getByRole('button',{name:'保存',exact:true}).click();await confirm.getByRole('button',{name:'保存组合',exact:true}).click();
    await expect(editor).toHaveCount(0);expect(await combos(page)).toHaveLength(1);expect((await combos(page))[0].name).toBe('安柏物伤组合');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(5);
    await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-heading h3')).toHaveText('安柏物伤组合');await page.reload();await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.combination-heading h3')).toHaveText('安柏物伤组合');
  });

  test('actual Mona items: independent creation, restore, discard and deletion never equip or auto-create',async({page})=>{
    test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual Mona inventory.');test.setTimeout(60000);
    await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button',{name:'莫娜导入',exact:true}).click();await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));
    await page.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();const before=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await page.getByTestId('workspace-nav-combinations').click();await expect(page.getByRole('heading',{name:'还没有保存的组合',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'新建组合',exact:true}).first().click();const editor=page.getByRole('dialog',{name:'新建组合',exact:true});
    await editor.getByRole('button',{name:'选择参考角色',exact:true}).click();const reference=page.getByRole('dialog',{name:'选择参考角色',exact:true});await reference.getByLabel('搜索参考角色',{exact:true}).fill('琴');await reference.getByRole('button',{name:'选择琴',exact:true}).click();
    // A trial assembled through the UI from five traceable inventory items, not a player export.
    for(const slot of ['生之花','死之羽','时之沙','空之杯','理之冠']){
      await editor.getByRole('button',{name:`装备${slot}`,exact:true}).click();const picker=page.getByRole('dialog',{name:`选择${slot}`,exact:true});await picker.locator('.inventory-card').first().click();
    }
    await page.screenshot({path:'artifacts/independent-combination-editor.png',fullPage:true});await editor.getByRole('button',{name:'保存',exact:true}).click();expect(await combos(page)).toHaveLength(1);
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(before);
    await page.getByRole('button',{name:/^查看组合：/}).click();const editing=page.getByRole('dialog',{name:'编辑组合',exact:true});
    await editing.getByRole('button',{name:'查看生之花详情',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'替换',exact:true}).click();await page.getByRole('dialog',{name:'选择生之花',exact:true}).getByRole('button',{name:'卸下',exact:true}).click();await editing.getByRole('button',{name:'还原',exact:true}).click();await expect(editing.getByRole('button',{name:'查看生之花详情',exact:true})).toBeVisible();
    await editing.getByRole('button',{name:'有效词条生命值',exact:true}).click();const saved=JSON.stringify(await combos(page));await page.keyboard.press('Escape');
    await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();expect(JSON.stringify(await combos(page))).toBe(saved);
    const openCombination=page.locator('.combination-open').first();await openCombination.focus();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await openCombination.press('Shift+F10');await page.getByRole('menuitem',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除组合？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();expect(await combos(page)).toHaveLength(0);
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(before);
  });
});

test.describe('team-library', () => {
  test.use({ hasTouch: true });

  test('recorded team library keeps slot positions and links saved character configurations', async ({ page }, info) => {
    const source = '.references/enka/official-example.json';
    test.skip(!existsSync(source), 'Requires the original saved public showcase.');
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
    await page.goto('/');
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
    const account = (await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0')))!;
    const loaded = await readDocument<LocalAccount>(page, 'account', account);
    const character = loaded.characters.find(entry => entry.build?.character.id === 'xingqiu')!;
    const build = character.build!;
    const axis = await page.evaluate(() => localStorage.getItem('leyline-axis-recovery-0.2.0'));
    const role = page.getByRole('dialog', { name: '行秋', exact: true });
    const refinement = build.refinement === 1 ? 2 : 1;
    // Save an explicit refinement trial using the recorded character and equipment.
    await page.getByRole('button', { name: '查看行秋详情', exact: true }).click();
    await role.getByRole('button', { name: `精炼${refinement}阶`, exact: true }).click();
    await role.getByRole('button', { name: '另存', exact: true }).click();
    const savePreset = page.getByRole('dialog', { name: '另存角色配装方案', exact: true });
    await savePreset.getByRole('button', { name: '确认另存', exact: true }).click();
    await expect(savePreset).toHaveCount(0);
    const presets = (await page.evaluate(() => localStorage.getItem('leyline-character-loadouts-0.2.0')))!;
    const presetId = (JSON.parse(presets) as { document: { id: string }[] }).document[0].id;
    await page.keyboard.press('Escape');
    const readTeams = async () => {
      const content = await page.evaluate(() => localStorage.getItem('leyline-saved-teams-0.2.0'));
      return content ? readDocument<SavedTeam[]>(page, 'saved-teams', content) : [];
    };

    const nav = page.getByTestId('workspace-nav-team');
    await nav.click();
    const library = page.getByRole('region', { name: '队伍', exact: true });
    const create = library.locator('.library-toolbar').getByRole('button', { name: '新建队伍', exact: true });
    await expect(library.getByText('还没有保存的队伍')).toBeVisible();
    await library.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
    const newDialog = page.getByRole('dialog', { name: '新建队伍', exact: true });
    const name = newDialog.getByLabel('队伍名称', { exact: true });
    const addMember = (slot: number) => newDialog.getByRole('button', { name: `选择队员${slot}`, exact: true });
    const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
    const save = newDialog.getByRole('button', { name: '保存', exact: true });
    await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label', '队伍');
    await expect(newDialog.locator('.team-slot')).toHaveCount(4);
    await expect(newDialog.getByRole('button', { name: /^选择队员[1-4]$/ })).toHaveCount(4);
    await expect(save).toBeDisabled();
    const widths = [320, 390, 1280];
    async function slotGeometry(dialog: Locator) {
      const layouts = [];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 760 });
        layouts.push(await dialog.locator('.team-slot > *').evaluateAll(cards => {
          const list = cards[0].closest('ol')!.getBoundingClientRect();
          return cards.map(card => {
            const rect = card.getBoundingClientRect();
            return { x: rect.x - list.x, y: rect.y - list.y, width: rect.width, height: rect.height };
          });
        }));
      }
      return layouts;
    }
    const emptyLayout = await slotGeometry(newDialog);
    await page.screenshot({ path: info.outputPath('team-new-slots.png') });
    await newDialog.getByText('队伍名称', { exact: true }).click();
    await expect(name).toBeFocused();
    await addMember(4).click();
    const sources = picker.getByRole('group', { name: '角色资料来源' });
    await expect(sources.getByRole('button', { name: '本地', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(picker.getByRole('button', { name: '选择行秋备选配置', exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '选择安柏首选配置', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(newDialog.getByRole('button', { name: '选择安柏的角色配置', exact: true })).toBeFocused();
    await expect(newDialog.locator('.team-slot[data-slot="4"] .configuration-title')).toContainText('安柏');
    await addMember(1).click();
    await picker.getByLabel('搜索角色配置', { exact: true }).pressSequentially('行秋');
    await picker.getByRole('button', { name: '选择行秋首选配置', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(newDialog.getByRole('button', { name: '选择行秋的角色配置', exact: true })).toBeFocused();
    await addMember(2).click();
    await picker.getByRole('button', { name: '选择行秋首选配置', exact: true }).click();
    await expect(picker.getByRole('alert')).toContainText('队伍已经有这位角色');
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(name).toHaveValue('行秋 / 安柏');
    expect(await slotGeometry(newDialog)).toEqual(emptyLayout);
    await name.press('ControlOrMeta+A');
    await name.pressSequentially('录存配装');
    expect(await readTeams()).toHaveLength(0);
    await page.screenshot({ path: info.outputPath('team-create.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await newDialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('team-create-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 760 });
    await save.click();

    const detail = page.getByRole('dialog', { name: '队伍详情', exact: true });
    const detailName = detail.getByLabel('队伍名称', { exact: true });
    const favorite = detail.getByRole('button', { name: '设置队伍收藏', exact: true });
    const close = detail.getByRole('button', { name: '关闭队伍详情', exact: true });
    const savedCards = detail.locator('.team-slot > .configuration-row.compact');
    await expect(newDialog).toHaveCount(0);
    await expect(detail.getByRole('heading', { name: '队伍详情', exact: true })).toBeVisible();
    await expect(detailName).toHaveValue('录存配装');
    await expect(close).toBeFocused();
    await expect(detail.locator('.team-slot')).toHaveCount(4);
    await expect(savedCards.locator('.configuration-title > span:first-child')).toHaveText(['行秋', '安柏']);
    await expect(savedCards.locator('.effective-roll-summary')).toHaveCount(2);
    await expect(savedCards.locator('.card-sets')).toHaveCount(2);
    await expect(savedCards.locator('.equipment-strip')).toHaveCount(0);
    await expect(savedCards.first().locator('.configuration-title')).toContainText(`|${build.weapon!.name}`);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 760 });
      for (const card of await savedCards.all()) {
        const portraits = card.locator('.configuration-portraits');
        const strip = (await portraits.boundingBox())!;
        const stats = (await card.locator('.effective-roll-summary').boundingBox())!;
        if (width === 1280) expect(stats.x).toBeGreaterThanOrEqual(strip.x + strip.width);
        else expect(stats.y).toBeGreaterThanOrEqual(strip.y + strip.height);
        const icons = await portraits.locator(':scope > :is(.game-icon, .card-sets)').evaluateAll(items =>
          items.map(item => [item.getBoundingClientRect().width, item.getBoundingClientRect().height]));
        expect(icons).toEqual(Array(3).fill([48, 48]));
        expect(await card.locator('[data-roll-stat] dt .game-icon:visible').count()).toBe(7);
        expect(await card.evaluate(node => {
          const box = node.getBoundingClientRect();
          return [...node.querySelectorAll('.configuration-title, .configuration-portraits, [data-roll-stat]')].every(item => {
            const rect = item.getBoundingClientRect();
            return rect.right <= box.right && rect.bottom <= box.bottom;
          });
        })).toBe(true);
      }
    }
    await expect(detail.getByRole('button', { name: '编辑队伍', exact: true })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '选择队员3', exact: true })).toBeEnabled();
    await expect(detail.getByRole('button', { name: '以此队伍新建轴', exact: true })).toHaveCount(0);
    const [original] = await readTeams();
    expect(Object.fromEntries(original.project.candidate.actors[0].build!.artifacts.map(piece => [piece.slot, piece.id]))).toEqual(character.equipment);
    expect(original.slots?.map(slot => slot?.actorId ?? null)).toEqual([
      original.project.candidate.actors[0].id, null, null, original.project.candidate.actors[1].id,
    ]);
    expect(original.slots?.[0]?.configuration).toEqual({ accountId: loaded.id, characterId: character.id, presetId: '' });

    const pickerConfig = page.getByRole('dialog', { name: '选择角色配置', exact: true });
    const xingqiu = detail.getByRole('button', { name: '选择行秋的角色配置', exact: true });
    const amber = detail.getByRole('button', { name: '选择安柏的角色配置', exact: true });
    const xingqiuDetails = detail.getByRole('button', { name: '查看行秋的配置详情', exact: true });
    const swapMark = xingqiu.locator('.card-replace-mark');
    await xingqiuDetails.hover({ position: { x: 12, y: 10 } });
    await expect(swapMark).toBeHidden();
    await expect(savedCards.first()).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await expect(xingqiuDetails).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(xingqiuDetails).toHaveCSS('box-shadow', 'none');
    await xingqiuDetails.focus();
    await xingqiuDetails.press('Shift+Tab');
    await expect(xingqiu).toBeFocused();
    await expect(swapMark).toBeVisible();
    await expect(savedCards.first()).toHaveCSS('border-top-color', 'rgb(79, 145, 197)');
    const hitBox = (await xingqiu.boundingBox())!;
    const statsBox = (await savedCards.first().locator('.effective-roll-summary').boundingBox())!;
    expect(hitBox.x + hitBox.width).toBeLessThan(statsBox.x);
    expect(hitBox.y).toBeCloseTo(statsBox.y, 0);
    expect(hitBox.height).toBeCloseTo(statsBox.height, 0);
    const arrow = (await swapMark.boundingBox())!;
    expect(arrow.x + arrow.width / 2).toBeCloseTo(hitBox.x + hitBox.width / 2, 0);
    expect(arrow.y + arrow.height / 2).toBeCloseTo(hitBox.y + hitBox.height / 2, 0);
    expect(arrow.height / arrow.width).toBeCloseTo(16 / 20, 2);
    await expect(swapMark).toHaveCSS('filter', 'none');
    // Hit-test over a real level badge to verify the overlay also paints above the badge.
    expect(await xingqiu.evaluate(button => {
      const badge = button.querySelector('.level-badge')!.getBoundingClientRect();
      const overlay = button.querySelector<HTMLElement>('.card-replace-layer')!;
      overlay.style.pointerEvents = 'auto';
      try { return overlay.contains(document.elementFromPoint(badge.x + badge.width / 2, badge.y + badge.height / 2)); }
      finally { overlay.style.removeProperty('pointer-events'); }
    })).toBe(true);
    await savedCards.first().screenshot({ path: info.outputPath('team-slot-replacement.png') });
    await xingqiu.click({ position: { x: 8, y: hitBox.height - 3 } });
    const pickerHeader = pickerConfig.locator(':scope > header');
    const switchRole = pickerHeader.getByRole('button', { name: '切换其他角色', exact: true });
    await expect(switchRole).toBeVisible();
    await expect(pickerConfig.getByRole('group', { name: '角色资料来源' })).toHaveCount(0);
    for (const width of [1280, 320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const title = (await pickerHeader.getByRole('heading', { name: '选择角色配置' }).boundingBox())!;
      const action = (await switchRole.boundingBox())!;
      expect(Math.abs(action.y + action.height / 2 - title.y - title.height / 2)).toBeLessThan(1);
      const remove = (await pickerHeader.getByRole('button', { name: '移除队员' }).boundingBox())!;
      const exit = (await pickerHeader.getByRole('button', { name: '关闭选择角色配置' }).boundingBox())!;
      expect(action.x + action.width).toBeLessThanOrEqual(remove.x);
      expect(remove.x + remove.width).toBeLessThanOrEqual(title.x);
      expect(title.x + title.width).toBeLessThanOrEqual(exit.x);
      expect(Math.abs(action.y - remove.y)).toBeLessThan(1);
    }
    await pickerHeader.screenshot({ path: info.outputPath('team-config-picker-header-mobile.png') });
    await page.keyboard.press('Escape');
    await close.focus();
    await close.hover();
    await expect(swapMark).toBeHidden();
    await xingqiu.tap({ position: { x: 8, y: 4 } });
    await expect(pickerConfig.locator('.configuration-title > span:first-child')).toHaveText(['行秋', '行秋']);
    await expect(pickerConfig.locator('.configuration-row.compact')).toHaveCount(2);
    await switchRole.tap();
    await expect(picker.getByRole('button', { name: '选择安柏首选配置', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(switchRole).toBeFocused();
    await expect(pickerConfig.getByRole('button', { name: /设为首选/ })).toHaveCount(0);
    const chosen = pickerConfig.locator(`[data-preset-id="${presetId}"]`);
    const chosenLabel = await chosen.locator('.configuration-title > span').last().innerText();
    await chosen.getByRole('button', { name: '选择行秋备选配置', exact: true }).click();
    await expect(pickerConfig).toHaveCount(0);
    await expect(xingqiu).toBeFocused();
    await expect(savedCards.first().locator('.configuration-title')).toContainText(chosenLabel);
    expect((await readTeams())[0].project.candidate.actors[0].build!.refinement).toBe(build.refinement);

    const menu = page.getByRole('menu', { name: '队员操作', exact: true });
    await xingqiu.click({ button: 'right' });
    await expect(menu.getByRole('menuitem')).toHaveText(['查看详情', '替换']);
    await page.keyboard.press('Escape');
    const statLabel = savedCards.first().locator('.effective-roll-summary dt').first();
    await statLabel.scrollIntoViewIfNeeded();
    const statLabelBox = (await statLabel.boundingBox())!;
    await page.touchscreen.tap(statLabelBox.x + statLabelBox.width / 2, statLabelBox.y + statLabelBox.height / 2);
    await expect(role.getByRole('button', { name: `精炼${refinement}阶`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label', '队伍');
    await role.getByRole('button', { name: '查看生之花详情', exact: true }).tap();
    const referenceItem = page.locator('.artifact-detail-dialog[open]');
    await referenceItem.getByRole('group', { name: '角色', exact: true }).getByRole('button').first().click();
    await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label', '角色');
    await expect(role.getByRole('button', { name: `精炼${build.refinement}阶`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(referenceItem).toBeVisible();
    await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label', '队伍');
    await page.keyboard.press('Escape');
    await expect(role.getByRole('button', { name: `精炼${refinement}阶`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(role).toHaveCount(0);
    await expect(xingqiuDetails).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 760 });
    await xingqiu.focus();
    await xingqiu.scrollIntoViewIfNeeded();
    // The context menu dismisses on resize or scroll. Open it in the settled desktop layout.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await xingqiu.press('Shift+F10');
    await menu.getByRole('menuitem', { name: '替换', exact: true }).click();
    await expect(pickerConfig.getByRole('button', { name: '选择行秋首选配置', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(xingqiu).toBeFocused();
    await amber.press('Shift+F10');
    await menu.getByRole('menuitem', { name: '替换', exact: true }).click();
    await switchRole.click();
    await picker.getByRole('button', { name: '选择班尼特首选配置', exact: true }).click();
    const fourth = detail.locator('.team-slot[data-slot="4"]');
    await expect(fourth.locator('.configuration-title')).toContainText('班尼特');
    expect(await slotGeometry(detail)).toEqual(emptyLayout);
    await fourth.getByRole('button', { name: '选择班尼特的角色配置', exact: true }).press('Shift+F10');
    await menu.getByRole('menuitem', { name: '替换', exact: true }).click();
    await switchRole.click();
    await picker.getByRole('button', { name: '选择安柏首选配置', exact: true }).click();
    await expect(fourth.locator('.configuration-title')).toContainText('安柏');

    await detailName.press('End');
    await detailName.pressSequentially('复核');
    await favorite.click();
    await expect(favorite).toHaveAccessibleDescription('1级收藏');
    expect((await readTeams())[0]).toEqual({ ...original, favorite: 1 });
    await page.keyboard.press('Escape');
    const unsaved = page.getByRole('dialog', { name: '有未保存的修改', exact: true });
    await unsaved.getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(detailName).toHaveValue('录存配装复核');
    await detail.getByRole('button', { name: '保存', exact: true }).click();
    await expect(detailName).toHaveValue('录存配装复核');
    await expect(detail.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    const edited = await readTeams();
    expect(edited).toHaveLength(1);
    expect(edited[0].id).toBe(original.id);
    expect(edited[0].favorite).toBe(1);
    expect(edited[0].project.candidate.actors[0].build!.refinement).toBe(refinement);
    expect(edited[0].slots?.[0]?.configuration?.presetId).toBe(presetId);
    await page.screenshot({ path: info.outputPath('team-detail.png') });

    await xingqiu.click();
    await pickerConfig.getByRole('button', { name: '移除队员', exact: true }).click();
    await expect(savedCards).toHaveCount(1);
    await expect(detail.getByRole('button', { name: '选择队员1', exact: true })).toBeFocused();
    expect(await slotGeometry(detail)).toEqual(emptyLayout);
    await detail.getByRole('button', { name: '还原', exact: true }).click();
    await expect(savedCards).toHaveCount(2);
    await detail.getByRole('button', { name: '选择队员2', exact: true }).click();
    await picker.getByRole('button', { name: '选择班尼特首选配置', exact: true }).click();
    await expect(savedCards.locator('.configuration-title > span:first-child')).toHaveText(['行秋', '班尼特', '安柏']);
    await detail.getByRole('button', { name: '选择队员3', exact: true }).click();
    await picker.getByRole('button', { name: '选择甘雨首选配置', exact: true }).click();
    await expect(savedCards).toHaveCount(4);
    expect(await slotGeometry(detail)).toEqual(emptyLayout);
    await close.click();
    await unsaved.getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(detail).toHaveCount(0);
    expect(await readTeams()).toEqual(edited);
    await expect(create).toBeFocused();

    // Repeat the same recorded loadouts up to the pagination boundary.
    await page.evaluate(async () => {
      // @ts-expect-error Vite browser source URL.
      const { useSavedTeamsStore } = await import('/src/stores/saved-teams.ts');
      const store = useSavedTeamsStore();
      const team = store.teams[0];
      for (let copy = 1; copy <= 4; copy++) store.save(`${team.name} ${copy}`, team.project);
    });
    const rows = library.locator('.team-row');
    await expect(rows).toHaveCount(5);
    await expect(rows.first().locator('.team-row-members > .game-icon.characters')).toHaveCount(2);
    await expect(rows.first().getByText('行秋', { exact: true })).toHaveCount(0);
    await expect(rows.first()).toHaveAccessibleDescription('行秋、安柏');
    await expect(rows.first().getByRole('img', { name: '1级收藏' })).toBeVisible();
    await library.getByRole('button', { name: '排序', exact: true }).click();
    const ratingSort = page.getByRole('dialog', { name: '队伍排序', exact: true });
    await ratingSort.getByRole('button', { name: '收藏等级', exact: true }).click();
    await ratingSort.getByRole('button', { name: '从低到高', exact: true }).click();
    await ratingSort.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows.last()).toHaveAttribute('data-team-id', original.id);
    await library.getByRole('button', { name: '筛选', exact: true }).click();
    const ratingFilter = page.getByRole('dialog', { name: '筛选队伍', exact: true });
    await ratingFilter.getByRole('button', { name: '1级收藏', exact: true }).click();
    await ratingFilter.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-team-id', original.id);
    await library.getByRole('button', { name: '清除筛选和排序条件', exact: true }).click();
    // Axis saves carry a roster snapshot without per-slot configuration links.
    await rows.last().click();
    await xingqiu.press('Shift+F10');
    await menu.getByRole('menuitem', { name: '查看详情', exact: true }).click();
    await expect(role.getByRole('button', { name: `精炼${refinement}阶`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await close.click();
    await rows.first().click();
    await amber.click();
    await pickerConfig.getByRole('button', { name: '移除队员', exact: true }).click();
    await detail.getByRole('button', { name: '自动命名', exact: true }).click();
    await expect(detailName).toHaveValue('行秋');
    await detailName.press('ControlOrMeta+A');
    await detailName.pressSequentially('录存配装复核 5');
    await detail.getByRole('button', { name: '另存', exact: true }).click();
    await expect(favorite).toHaveAccessibleDescription('未收藏');
    const copied = await readTeams();
    expect(copied).toHaveLength(6);
    expect(copied[0]).toEqual(edited[0]);
    expect(copied[5].id).not.toBe(original.id);
    expect(copied[5].project.candidate.actors).toEqual(edited[0].project.candidate.actors.slice(0, 1));
    await close.click();
    await expect(rows.first()).toBeFocused();
    await page.screenshot({ path: info.outputPath('team-list.png'), fullPage: true });
    const search = library.getByLabel('搜索队伍', { exact: true });
    const top = library.getByRole('navigation', { name: '顶部列表分页' });
    const bottom = library.getByRole('navigation', { name: '底部列表分页' });
    await bottom.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(top.getByRole('spinbutton', { name: '顶部页码', exact: true })).toHaveValue('2');
    await expect(rows).toHaveCount(1);
    await search.pressSequentially('没有这支队伍');
    await library.locator('.library-empty').getByRole('button', { name: '清除搜索与筛选' }).click();
    await expect(rows).toHaveCount(5);
    await search.pressSequentially('复核 5');
    await expect(rows).toHaveText(/录存配装复核 5/);
    await search.clear();
    await search.pressSequentially('行秋');
    await expect(top.getByRole('spinbutton', { name: '顶部页码', exact: true })).toHaveValue('1');
    await expect(rows).toHaveCount(5);
    await top.getByRole('button', { name: '下一页', exact: true }).click();
    await rows.first().press('Enter');
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('行秋');
    await expect(bottom.getByRole('spinbutton', { name: '底部页码', exact: true })).toHaveValue('2');
    await expect(rows.first()).toBeFocused();

    await library.getByRole('button', { name: '筛选', exact: true }).click();
    const filter = page.getByRole('dialog', { name: '筛选队伍', exact: true });
    const roleFilter = filter.getByLabel('包含角色', { exact: true });
    await expect(filter.getByText('队员人数', { exact: true })).toHaveCount(0);
    await roleFilter.click();
    await page.screenshot({ path: info.outputPath('team-filter.png') });
    await filter.getByRole('button', { name: '安柏', exact: true }).click();
    await expect(roleFilter).toHaveAccessibleDescription('安柏');
    await filter.getByRole('button', { name: '完成', exact: true }).click();
    await expect(top.getByRole('spinbutton', { name: '顶部页码', exact: true })).toHaveValue('1');
    await expect(rows).toHaveCount(5);
    await expect(rows.last().locator('strong')).toHaveText('录存配装复核 4');
    await expect(search).toHaveValue('行秋');
    await library.getByRole('button', { name: '排序', exact: true }).click();
    const sort = page.getByRole('dialog', { name: '队伍排序', exact: true });
    const orderChoices = sort.getByRole('group', { name: '排序依据' }).getByRole('button');
    await expect(orderChoices).toHaveText(['保存顺序', '队伍名称', '收藏等级']);
    await expect(orderChoices.first()).toHaveAttribute('aria-pressed', 'true');
    await sort.getByRole('button', { name: '队伍名称', exact: true }).click();
    await sort.getByRole('button', { name: '名称倒序', exact: true }).click();
    await sort.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows.first().locator('strong')).toHaveText('录存配装复核 4');
    await library.getByRole('button', { name: /^筛选/ }).click();
    await roleFilter.click();
    await filter.getByRole('button', { name: '行秋', exact: true }).click();
    await filter.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows.first().locator('strong')).toHaveText('录存配装复核 5');
    await expect(rows.first().locator('.team-row-members > .game-icon.characters')).toHaveCount(1);
    await expect(rows.nth(1).locator('.team-row-members > .game-icon.characters')).toHaveCount(2);
    await library.getByRole('button', { name: '清除筛选和排序条件', exact: true }).click();
    await expect(rows.first().locator('strong')).toHaveText('录存配装复核');
    await expect(search).toHaveValue('');
    await bottom.getByRole('button', { name: '下一页', exact: true }).click();

    await page.setViewportSize({ width: 390, height: 540 });
    await bottom.getByRole('button', { name: '上一页', exact: true }).click();
    await rows.last().scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    expect(scroll).toBeGreaterThan(0);
    await rows.last().click();
    await expect(detail).toBeVisible();
    expect(await detail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: info.outputPath('team-detail-mobile.png') });
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('team-list-mobile.png'), fullPage: true });

    await page.reload();
    await page.getByRole('button', { name: '打开功能导航', exact: true }).click();
    await nav.click();
    await expect(rows).toHaveCount(5);
    await rows.first().click();
    await expect(detailName).toHaveValue('录存配装复核');
    await expect(favorite).toHaveAccessibleDescription('1级收藏');
    await expect(detail.locator('.team-slot[data-slot="4"] .configuration-title')).toContainText('安柏');
    await expect(savedCards.first().locator('.configuration-title')).toContainText(chosenLabel);
    await detailName.press('End');
    await detailName.pressSequentially('确认');
    await close.click();
    await unsaved.getByRole('button', { name: '保存', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await expect(rows.first()).toBeFocused();
    expect((await readTeams())[0]).toEqual({ ...edited[0], name: '录存配装复核确认' });
    await bottom.getByRole('button', { name: '下一页', exact: true }).click();
    await rows.first().click();
    const deleteTeam = detail.getByRole('button', { name: '删除', exact: true });
    const confirmDelete = page.getByRole('dialog', { name: '删除队伍？', exact: true });
    await deleteTeam.click();
    await confirmDelete.getByRole('button', { name: '取消', exact: true }).click();
    await expect(detailName).toHaveValue('录存配装复核 5');
    expect(await readTeams()).toHaveLength(6);
    await deleteTeam.click();
    await confirmDelete.getByRole('button', { name: '删除', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect(top.getByRole('spinbutton', { name: '顶部页码', exact: true })).toHaveValue('1');
    expect((await readTeams()).map(team => team.id)).toEqual(copied.slice(0, 5).map(team => team.id));
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(account);
    expect(await page.evaluate(() => localStorage.getItem('leyline-character-loadouts-0.2.0'))).toBe(presets);
    expect(await page.evaluate(() => localStorage.getItem('leyline-axis-recovery-0.2.0'))).toBe(axis);
    expect(errors).toEqual([]);
  });
});

test.describe('design-language', () => {
  async function expectReadableText(page:import('@playwright/test').Page) {
    const tooSmall=await page.locator('.workspace-design').evaluate(root=>{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),failures:string[]=[];
      let text:Node|null;
      while((text=walker.nextNode())) {
        const parent=text.parentElement;
        if(!parent || !text.textContent?.trim() || parent.closest('[data-ui-badge],script,style,option'))continue;
        const style=getComputedStyle(parent),range=document.createRange();range.selectNodeContents(text);
        const box=range.getBoundingClientRect();
        if(box.width && box.height && style.visibility==='visible' && parseFloat(style.fontSize)<14)failures.push(`${text.textContent.trim().slice(0,35)}: ${style.fontSize}`);
      }
      return failures;
    });
    expect(tooSmall).toEqual([]);
    const wrongSizes=await page.locator('.ui-action,.ui-muted-button,.ui-close,.disclosure-arrow,.choice-group.joined').evaluateAll(nodes=>nodes.filter(node=>{
      const bounds=node.getBoundingClientRect();
      return bounds.width && bounds.height && ![24,32,40].some(height=>Math.abs(bounds.height-height)<.5);
    }).map(node=>`${node.textContent?.trim().slice(0,20)}: ${node.getBoundingClientRect().height}`));
    expect(wrongSizes).toEqual([]);
  }

  const source='.references/enka/official-example.json';
  test.skip(!existsSync(source),'Requires the saved actual Enka showcase.');

  test('shared real-character editor protects team drafts and keeps account independent',async({page})=>{
    test.setTimeout(90000);
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
    await page.goto('/');
    await expect(page.getByTestId('workspace-nav-characters')).toBeVisible();
    await expect(page.locator('.account-heading')).toHaveCount(0);
    const footer=await page.locator('.nav-utilities').evaluate(node=>({bottom:node.getBoundingClientRect().bottom,height:innerHeight,labels:Array.from(node.querySelectorAll('button')).map(button=>button.textContent?.trim())}));
    expect(footer.labels).toEqual(['账号','设置']);expect(footer.height-footer.bottom).toBeLessThanOrEqual(16);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link',{name:'跳至主要内容',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#workspace-main')).toBeFocused();
    await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
    await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
    const account=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await expectReadableText(page);
    // Derive an axis format case from the imported public showcase.
    const project=await page.evaluate(async accountText=>{
      const [{createEmptyProject},{addActorFromBuild},{packDocument,unpackDocument}]=await Promise.all([
        // @ts-expect-error Resolved by Vite in the browser.
        import('/src/domain/workbench-project.ts'),
        // @ts-expect-error Resolved by Vite in the browser.
        import('/src/domain/real-project.ts'),
        // @ts-expect-error Resolved by Vite in the browser.
        import('/src/domain/content-document.ts'),
      ]);
      const imported = unpackDocument('account', JSON.parse(accountText!)) as LocalAccount;
      const recorded = imported.characters.find(character => character.name === '安柏')!.showcase!.build;
      const project=createEmptyProject();addActorFromBuild(project,recorded,'安柏');return packDocument('axis',project);
    },account);
    await page.getByTestId('workspace-nav-timeline').click();
    await page.getByLabel('导入轴项目文件',{exact:true}).setInputFiles({name:'recorded-showcase-ui-harness.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await page.getByTestId('workspace-nav-analysis').click();
    await page.getByRole('button',{name:'调整候选配装',exact:true}).click();
    await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'修改所选队员配装',exact:true});
    const dialogBounds=await dialog.boundingBox();
    await page.mouse.click(dialogBounds!.x+.5,dialogBounds!.y+dialogBounds!.height/2);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    await expect(dialog.locator('.number-stepper').first()).toHaveCSS('height','40px');
    await expect(dialog.locator('.level-picker > summary').first()).toHaveCSS('height','40px');
    await expect(dialog.locator('.equipment-list > article')).toHaveCount(5);
    await expectReadableText(page);
    await expect(dialog.getByRole('button',{name:'保存',exact:true})).toHaveCSS('height','32px');
    const replace = dialog.getByRole('button', { name: '替换生之花', exact: true });
    await expect(replace).toBeVisible();
    const portrait = dialog.locator('.artifact-visual').filter({ has: page.getByRole('button', { name: '替换生之花', exact: true }) });
    expect(await replace.boundingBox()).toEqual(await portrait.boundingBox());
    await dialog.getByRole('button',{name:'精炼3阶',exact:true}).click();
    await page.keyboard.press('Escape');
    const confirmation=page.getByRole('dialog',{name:'有未保存的修改',exact:true});
    expect(await confirmation.evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(422);
    await page.getByRole('button',{name:'继续编辑',exact:true}).click();
    await dialog.getByRole('button',{name:'还原',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'精炼2阶',exact:true})).toHaveAttribute('aria-pressed','true');
    await dialog.getByRole('button',{name:'精炼3阶',exact:true}).click();
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(account);
    await page.setViewportSize({width:390,height:844});
    expect(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);
    await page.setViewportSize({width:1280,height:720});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'精炼3阶',exact:true})).toHaveAttribute('aria-pressed','true');
    await dialog.getByRole('button',{name:'精炼4阶',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'放弃修改',exact:true}).click();
    await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'精炼3阶',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.keyboard.press('Escape');
    for(const target of ['team','calculator','analysis','timeline','loadouts','combinations','account','settings']) {
      await page.setViewportSize({width:1280,height:720});
      if(target==='settings')await page.getByRole('button',{name:'导航 设置',exact:true}).click();else await page.getByTestId(`workspace-nav-${target}`).click();
      if (['team', 'calculator', 'analysis', 'timeline'].includes(target)) {
        const title = await page.getByTestId(`workspace-nav-${target}`).getAttribute('title');
        await expect(page.getByRole('region', { name: title!, exact: true })).toBeVisible();
      }
      if(target==='loadouts' || target==='combinations')await expect(page.getByRole('region',{name:target==='loadouts'?'角色配置':'圣遗物组合',exact:true})).toBeVisible();
      if(target==='loadouts') {
        await page.getByRole('button',{name:'选择角色',exact:true}).click();
        const picker=page.getByRole('dialog',{name:'选择角色',exact:true});
        await expect(picker.locator('.character-card')).toHaveCount(4);
        await picker.getByRole('button',{name:'选择安柏',exact:true}).click();
        await expect(page.locator('.configuration-row')).toHaveCount(1);
        await expect(page.locator('.configuration-row.compact .card-sets .card-set')).toHaveCount(2);
      }
      if(target==='settings')await page.getByText('界面配色 · 七元素三阶',{exact:true}).click();
      const clipped=await page.locator('input:not([type=checkbox]):not([type=file]),select').evaluateAll(nodes=>nodes.filter(node=>{
        if(!(node as HTMLElement).offsetWidth)return false;
        const style=getComputedStyle(node);
        return parseFloat(style.fontSize)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)>node.clientHeight+1;
      }).map(node=>node.getAttribute('aria-label')??node.tagName));
      expect(clipped).toEqual([]);
      await expectReadableText(page);
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await expectReadableText(page);
    }
  });
});
