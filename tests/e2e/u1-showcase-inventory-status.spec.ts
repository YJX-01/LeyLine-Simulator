import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const source='.references/enka/official-example.json';
test.skip(!existsSync(source),'Requires the recorded actual showcase.');

test('showcase missing-inventory badges replace portraits after deletion, and importing one slot updates only its status',async({page})=>{
  test.setTimeout(60000);page.setDefaultTimeout(8000);await page.setViewportSize({width:1440,height:1000});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
  await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();
  await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.getByRole('button',{name:'导入安柏',exact:true}).click();
  await page.getByRole('button',{name:'确认导入 1 位角色',exact:true}).click();
  const showcase=await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('leyline-account-v1')!).characters[0].showcase));
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
  const role=page.getByRole('dialog',{name:'安柏',exact:true}),grid=role.locator('.detail-artifacts .equipment-grid');
  await role.getByRole('button',{name:'展柜',exact:true}).click();
  await expect(grid.locator('.unstored-badge')).toHaveCount(0);await expect(grid.locator('.artifact-wearers')).toHaveCount(5);
  await role.getByRole('button',{name:'保存组合',exact:true}).click();
  await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
  await role.getByRole('button',{name:'本地',exact:true}).click();await role.getByRole('button',{name:'应用组合',exact:true}).click();
  await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();
  await role.getByRole('button',{name:'保存',exact:true}).click();await role.getByRole('button',{name:'关闭安柏',exact:true}).click();
  await page.getByTestId('workspace-nav-artifacts').click();
  for(let index=0;index<5;index++){
    await page.locator('.inventory-card').first().click({button:'right'});await page.getByRole('menuitem',{name:'删除',exact:true}).click();
    await page.getByRole('dialog',{name:'删除圣遗物？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();
  }
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  const equipment=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v1')!).characters[0].equipment);
  expect(Object.values(equipment)).toHaveLength(5);
  await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
  await expect(grid.locator('.unstored-badge')).toHaveCount(5);
  await role.getByRole('button',{name:'展柜',exact:true}).click();
  await expect(grid.locator('.unstored-badge')).toHaveCount(5);await expect(grid.locator('.artifact-wearers')).toHaveCount(0);
  await role.locator('.detail-artifacts').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/showcase-inventory-missing.png',fullPage:true});
  await role.getByRole('button',{name:'管理生之花',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'入库',exact:true}).click();
  await page.getByRole('dialog',{name:'入库圣遗物？',exact:true}).getByRole('button',{name:'入库',exact:true}).click();
  await expect(grid.locator('.unstored-badge')).toHaveCount(4);await expect(grid.locator('.artifact-wearers')).toHaveCount(1);
  const flower=grid.locator('.artifact-item-card').first();await expect(flower.locator('.unstored-badge')).toHaveCount(0);
  await role.getByRole('button',{name:'本地',exact:true}).click();await expect(grid.locator('.unstored-badge')).toHaveCount(5);
  await role.getByRole('button',{name:'展柜',exact:true}).click();await page.screenshot({path:'artifacts/showcase-inventory-imported.png',fullPage:true});
  await role.getByRole('button',{name:'管理死之羽',exact:true}).click();const detail=page.locator('.artifact-detail-dialog');
  await expect(detail.locator('.unstored-badge')).toHaveText('未入库');await detail.getByRole('button',{name:/^关闭/}).click();
  expect(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('leyline-account-v1')!).characters[0].showcase))).toBe(showcase);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v1')!).characters[0].equipment)).toEqual(equipment);
  await role.getByRole('button',{name:'关闭安柏',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await role.getByRole('button',{name:'展柜',exact:true}).click();
  await expect(grid.locator('.unstored-badge')).toHaveCount(4);await expect(grid.locator('.artifact-wearers')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});await role.locator('.detail-artifacts').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/showcase-inventory-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
