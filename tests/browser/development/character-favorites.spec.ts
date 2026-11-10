import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
const source='tests/fixtures/recordings/enka/official-example.json';
test.skip(!existsSync(source),'Requires the recorded public showcase.');
test('real showcase: character favorites persist, filter and sort independently of equipment',async({page})=>{
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
  await page.goto('/');
  await page.getByRole('button',{name:'展柜导入',exact:true}).click();
  await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
  await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
  const iconTreatments=await page.locator('.character-card .level-badge').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor===getComputedStyle(node.parentElement!).backgroundColor && getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)'));
  expect(iconTreatments).toBe(true);
  expect(await page.locator('.character-card .element-badge').first().evaluate(node=>getComputedStyle(node).filter)).toContain('drop-shadow');
  const baseline=await page.evaluate(()=>localStorage.getItem('leyline-account-v2'));
  await page.getByRole('button',{name:'查看甘雨详情',exact:true}).click();
  const role=page.getByRole('dialog',{name:'甘雨',exact:true});
  const favorite=role.getByRole('button',{name:'设置甘雨收藏',exact:true});
  for(const level of [1,2,3]) { await favorite.click();await expect(favorite).toHaveAttribute('aria-description',`${level}级收藏`); }
  await expect(role.getByRole('button',{name:'设为首选',exact:true})).toHaveCount(0);
  const alignment=await role.evaluate(node=>{
    const header=node.querySelector('header')!.getBoundingClientRect(),title=node.querySelector('header h2')!.getBoundingClientRect();
    return {horizontal:Math.abs((header.left+header.right)-(title.left+title.right))/2,vertical:Math.abs((header.top+header.bottom)-(title.top+title.bottom))/2};
  });
  expect(alignment.horizontal).toBeLessThan(.5);expect(alignment.vertical).toBeLessThanOrEqual(.5);
  const picker=role.getByRole('button',{name:'选择甘雨配置',exact:true});await expect(picker).toContainText('|');
  for(const width of [900,760,390]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>role.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);
    const centered=await role.evaluate(node=>{const header=node.querySelector('header')!.getBoundingClientRect(),title=node.querySelector('header h2')!.getBoundingClientRect();return Math.abs((header.left+header.right)-(title.left+title.right))/2;});
    expect(centered).toBeLessThan(.5);
    const overlap=await role.locator('header').evaluate(header=>{
      const boxes=Array.from(header.querySelectorAll('.character-header-tools,.configuration-title,.configuration-title-button,.character-favorite,.ui-close')).map(node=>node.getBoundingClientRect());
      return boxes.flatMap((a,i)=>boxes.flatMap((b,j)=>i<j && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1 ? [{i,j,a:a.toJSON(),b:b.toJSON()}] : []));
    });
    expect(overlap,`width ${width}`).toEqual([]);
  }
  await page.screenshot({path:'artifacts/character-header-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await role.getByRole('button',{name:'展柜',exact:true}).click();
  await expect(role.getByRole('button',{name:'展柜',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'artifacts/character-header-switch.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await page.getByRole('button',{name:'设置安柏收藏',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('.character-card-header > strong')).toHaveText(['甘雨','班尼特','行秋','安柏']);
  const decoration=await page.getByRole('button',{name:'查看甘雨详情',exact:true}).evaluate(card=>{const title=card.querySelector('.character-card-header > strong')!.getBoundingClientRect(),image=card.querySelector('.card-portraits > .characters')!.getBoundingClientRect(),favorite=card.querySelector('.card-favorite')!.getBoundingClientRect();return {center:Math.abs((title.left+title.right)-(image.left+image.right))/2,right:favorite.left>=title.right};});
  expect(decoration.center).toBeLessThan(.5);expect(decoration.right).toBe(true);
  await page.screenshot({path:'artifacts/character-favorites-home.png',fullPage:true});
  for(const width of [390,360]) {
    await page.setViewportSize({width,height:844});
    const geometry=await page.getByRole('button',{name:'查看甘雨详情',exact:true}).evaluate(card=>{const header=card.querySelector('.character-card-header')!.getBoundingClientRect(),name=card.querySelector('.character-card-header > strong')!.getBoundingClientRect(),favorite=card.querySelector('.card-favorite')!.getBoundingClientRect();return {center:Math.abs((header.left+header.right)-(name.left+name.right))/2,right:favorite.left>=name.right,contained:favorite.right<=header.right};});
    expect(geometry.center).toBeLessThan(.5);expect(geometry.right).toBe(true);expect(geometry.contained).toBe(true);
  }
  await page.screenshot({path:'artifacts/character-favorites-home-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'排序',exact:true}).click();const sortWidth=await page.getByRole('dialog',{name:'角色排序',exact:true}).evaluate(node=>node.getBoundingClientRect().width);await expect(page.getByRole('button',{name:'收藏等级',exact:true})).toHaveCSS('font-size','16px');await page.getByRole('button',{name:'收藏等级',exact:true}).click();await page.getByRole('button',{name:'从低到高',exact:true}).click();await expect(page.locator('.character-card').last()).toHaveAttribute('aria-label','查看甘雨详情');await page.getByRole('button',{name:'从高到低',exact:true}).click();await page.screenshot({path:'artifacts/character-sort-redesign.png',fullPage:true});await page.getByRole('dialog',{name:'角色排序',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
  await expect(page.locator('.character-card').first()).toHaveAttribute('aria-label','查看甘雨详情');
  await expect(page.locator('.character-card').nth(1)).toHaveAttribute('aria-label','查看安柏详情');
  await page.getByRole('button',{name:/^筛选/}).click();const filterDialog=page.getByRole('dialog',{name:'筛选角色',exact:true});expect(await filterDialog.evaluate(node=>node.getBoundingClientRect().width)).toBe(sortWidth);expect(sortWidth).toBeLessThanOrEqual(562);await expect(filterDialog.getByRole('region')).toHaveCount(4);await expect(filterDialog.getByRole('region',{name:'武器类型',exact:true}).locator('.weapons')).toHaveCount(5);await page.screenshot({path:'artifacts/character-filter-redesign.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await filterDialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);const overflow=await filterDialog.locator('.filter-options button').evaluateAll(nodes=>nodes.filter(node=>node.scrollWidth>node.clientWidth).map(node=>node.textContent));expect(overflow).toEqual([]);await page.screenshot({path:'artifacts/character-filter-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});for(const label of ['重置筛选','完成']) {await expect(filterDialog.getByRole('button',{name:label,exact:true})).toHaveCSS('width','104px');await expect(filterDialog.getByRole('button',{name:label,exact:true})).toHaveCSS('height','40px');await expect(filterDialog.getByRole('button',{name:label,exact:true})).toHaveCSS('font-size','16px');}const filter=page.getByRole('region',{name:'收藏',exact:true});
  await filter.getByRole('button',{name:'3级收藏',exact:true}).click();await page.getByRole('button',{name:'完成',exact:true}).click();
  await expect(page.locator('.character-card')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:'查看甘雨详情',exact:true}).click();
  await expect(page.getByRole('button',{name:'设置甘雨收藏',exact:true})).toHaveAttribute('aria-description','3级收藏');
  await page.getByRole('button',{name:'设置甘雨收藏',exact:true}).click();
  await expect(page.getByRole('button',{name:'设置甘雨收藏',exact:true})).toHaveAttribute('aria-description','未收藏');
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(baseline);
});
