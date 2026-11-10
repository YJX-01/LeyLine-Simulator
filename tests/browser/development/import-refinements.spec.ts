import {test,expect} from '@playwright/test';

test('catalog keeps traveler forms above the final Manekin group in either direction',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
  await expect(dialog.locator('.catalog-browser-item').first()).toBeVisible();
  async function checkGroups(){
    const names=await dialog.locator('.catalog-browser-item strong').allTextContents();
    const firstTraveler=names.findIndex(name=>/^[空荧]（/.test(name));
    const firstManekin=names.findIndex(name=>name.startsWith('奇偶'));
    expect(firstTraveler).toBeGreaterThan(0);expect(firstManekin).toBeGreaterThan(firstTraveler);
    expect(names.slice(firstTraveler,firstManekin).every(name=>/^[空荧]（/.test(name))).toBe(true);
    expect(names.slice(firstManekin).every(name=>name.startsWith('奇偶'))).toBe(true);
    await dialog.locator('.catalog-browser-item').last().scrollIntoViewIfNeeded();
  }
  await checkGroups();await page.screenshot({path:'artifacts/character-special-groups.png'});
  await dialog.getByRole('button',{name:'排序',exact:true}).click();
  const sort=page.getByRole('dialog',{name:'角色排序',exact:true});
  await sort.getByRole('button',{name:'从低到高',exact:true}).click();
  await sort.getByRole('button',{name:'完成',exact:true}).click();await checkGroups();
  await dialog.getByLabel('搜索游戏角色',{exact:true}).pressSequentially('空');
  await expect(dialog.locator('.catalog-browser-item')).toHaveCount(7);
});
