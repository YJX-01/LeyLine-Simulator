import { existsSync, readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const source='.references/enka/official-example.json';
test.skip(!existsSync(source),'Requires the recorded actual four-character showcase.');

async function readCombinations(page:Page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-v1') ?? '[]') as {id:string;favorite?:number;name?:string}[]);
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
  const inventory=await page.evaluate(()=>localStorage.getItem('leyline-account-v1'));
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
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v1'))).toBe(inventory);
  for(const tab of ['characters','loadouts','artifacts','combinations']){
    await page.getByTestId(`workspace-nav-${tab}`).click();await expect(page.locator('#workspace-main .library-page .library-corner-ornaments i')).toHaveCount(4);
    await page.screenshot({path:`artifacts/library-corners-${tab}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/combination-favorites-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
