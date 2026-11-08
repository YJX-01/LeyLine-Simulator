import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

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
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
  await page.goto('/');
  await expect(page.getByTestId('workspace-nav-characters')).toBeVisible();
  await expect(page.locator('.nav-group[data-domain=account] button')).toHaveText(['角色','角色配置','圣遗物','圣遗物组合']);
  await expect(page.locator('.nav-group > p')).toHaveText(['库','项目','自定义']);
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
  const account=await page.evaluate(()=>localStorage.getItem('leyline-account-v1'));
  await expectReadableText(page);
  // UI format harness derived from the recorded public snapshot; not a player export or physical inventory.
  const project=await page.evaluate(async raw=>{
    // These are Vite browser URLs inside page.evaluate, not Node module imports.
    const [{previewEnkaImport},{createAccount},{createEmptyWorkbenchProject},{addRealActor}]=await Promise.all([
      // @ts-expect-error Resolved by Vite in the browser.
      import('/src/domain/enka-import.ts'),
      // @ts-expect-error Resolved by Vite in the browser.
      import('/src/domain/account.ts'),
      // @ts-expect-error Resolved by Vite in the browser.
      import('/src/domain/workbench-project.ts'),
      // @ts-expect-error Resolved by Vite in the browser.
      import('/src/domain/real-project.ts'),
    ]);
    const preview=await previewEnkaImport(raw,'618285856',createAccount());
    const recorded=preview.rows.find((row:{character:{name:string}})=>row.character.name==='安柏').character.showcase.build;
    const project=createEmptyWorkbenchProject();addRealActor(project,recorded,'安柏');return project;
  },JSON.parse(readFileSync(source,'utf8')));
  writeFileSync('artifacts/recorded-showcase-ui-harness.json',JSON.stringify(project));
  await page.getByTestId('workspace-nav-projects').click();
  await page.getByLabel('导入轴项目文件',{exact:true}).setInputFiles({name:'recorded-showcase-ui-harness.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.getByTestId('workspace-nav-team').click();
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
  await expect(dialog.getByRole('button',{name:'更换生之花',exact:true})).toHaveCSS('height','24px');
  await dialog.getByRole('button',{name:'精炼3阶',exact:true}).click();
  await page.keyboard.press('Escape');
  const confirmation=page.getByRole('dialog',{name:'放弃未保存的修改？',exact:true});
  expect(await confirmation.evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(422);
  await page.getByRole('button',{name:'继续编辑',exact:true}).click();
  await dialog.getByRole('button',{name:'还原',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'精炼2阶',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'精炼3阶',exact:true}).click();
  await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v1'))).toBe(account);
  await page.screenshot({path:'artifacts/unified-team-editor.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);
  await page.screenshot({path:'artifacts/unified-team-editor-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:720});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'精炼3阶',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'精炼4阶',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'放弃修改并退出',exact:true}).click();
  await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'精炼3阶',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  for(const target of ['loadouts','combinations','account','settings','definitions','projects','timeline']) {
    await page.setViewportSize({width:1280,height:720});
    if(target==='settings')await page.getByRole('button',{name:'导航 设置',exact:true}).click();else await page.getByTestId(`workspace-nav-${target}`).click();
    if(target==='definitions')await expect(page.getByRole('heading',{name:'独立内容定义库',exact:true})).toBeVisible();
    if(target==='loadouts' || target==='combinations')await expect(page.getByRole('heading',{name:target==='loadouts'?'角色配置':'圣遗物组合',level:2,exact:true})).toBeVisible();
    if(target==='loadouts') {
      await page.getByRole('button',{name:'选择配置角色',exact:true}).click();
      const picker=page.getByRole('dialog',{name:'选择角色',exact:true});
      await expect(picker.locator('.character-card')).toHaveCount(4);
      await picker.getByRole('button',{name:'选择安柏',exact:true}).click();
      await expect(page.locator('.configuration-row')).toHaveCount(1);
      await page.getByRole('button',{name:'查看装备明细',exact:true}).click();
      await expect(page.locator('.configuration-row .equipment-list > article')).toHaveCount(5);
    }
    if(target==='settings')await page.getByText('界面配色 · 七元素三阶',{exact:true}).click();
    const clipped=await page.locator('input:not([type=checkbox]):not([type=file]),select').evaluateAll(nodes=>nodes.filter(node=>{
      if(!(node as HTMLElement).offsetWidth)return false;
      const style=getComputedStyle(node);
      return parseFloat(style.fontSize)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)>node.clientHeight+1;
    }).map(node=>node.getAttribute('aria-label')??node.tagName));
    expect(clipped).toEqual([]);
    await expectReadableText(page);
    await page.screenshot({path:`artifacts/unified-${target}.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await expectReadableText(page);
    await page.screenshot({path:`artifacts/unified-${target}-mobile.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
