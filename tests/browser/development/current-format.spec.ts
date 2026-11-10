import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('recorded showcase files use the current contract and retired local accounts are ignored',async({page})=>{
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires the original public showcase in .references.');
  const raw=JSON.parse(readFileSync('.references/enka/official-example.json','utf8'));
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:raw}));
  await page.goto('/');
  await page.getByRole('button',{name:'展柜导入',exact:true}).click();
  await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
  await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
  await page.keyboard.press('Escape');
  const current=await page.evaluate(()=>localStorage.getItem('leyline-account-v2')!);
  // A version-tag derivative of the recorded showcase, not an original player export.
  const retired=JSON.stringify({...JSON.parse(current),schemaVersion:1});
  await page.evaluate(content=>{localStorage.setItem('leyline-account-v1',content);localStorage.removeItem('leyline-account-v2');},retired);
  await page.reload();
  await expect(page.locator('.character-card-header > strong')).toHaveCount(0);
  await page.getByRole('button',{name:'导航 账号',exact:true}).click();
  const input=page.getByLabel('导入账号资料文件',{exact:true});
  await input.setInputFiles({name:'recorded-current.account.json',mimeType:'application/json',buffer:Buffer.from(current)});
  await expect(page.getByRole('region',{name:'账号管理',exact:true})).toContainText('4 位角色');
  await input.setInputFiles({name:'unsupported.account.json',mimeType:'application/json',buffer:Buffer.from(retired)});
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(current);
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v1'))).toBe(retired);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('base traveler and Manekin metadata expose real texts, parameters and element-specific files',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByTestId('workspace-nav-definitions').click();
  const panel=page.getByRole('region',{name:'自定义角色元数据',exact:true});
  for(const id of ['aether','lumine','manekin','manekina','manekin-pyro','manekina-hydro']) {
    await panel.getByLabel('角色定义来源',{exact:true}).selectOption(id);
    await panel.getByRole('button',{name:'复制角色元数据',exact:true}).click();
    const details=panel.locator('.character-metadata-panel');
    if(!await details.evaluate(node=>node.hasAttribute('open')))await details.locator('summary').click();
    await expect(details.getByRole('heading',{name:new RegExp(id.startsWith('manekin')?'外域剑术·安谨守望':'故去的追忆')})).toBeVisible();
    if(id.includes('-')) {
      await expect(details.getByRole('heading',{name:/戒惩轰击/})).toBeVisible();
      await expect(details.getByRole('heading',{name:/禁入限区/})).toBeVisible();
    } else await expect(details).toContainText('未元素化的基础形态');
    if(id.startsWith('manekin')) {
      for(const name of ['战域重划','交战持备','灵巧战姿'])await expect(details.getByRole('heading',{name,exact:true})).toBeVisible();
    }
  }
  const downloading=page.waitForEvent('download');
  await panel.getByRole('button',{name:'导出角色定义',exact:true}).click();
  const file=JSON.parse(readFileSync((await (await downloading).path())!,'utf8'));
  expect(file.derivedFrom.id).toBe('manekina-hydro');
  expect(file.identity.element).toBe('hydro');
  expect(file.capabilities.text).toBe('complete');
  expect(file.constellations).toEqual([]);
  expect(file.talents.map((talent:{category:string})=>talent.category)).toEqual(['normal','skill','burst']);
  const before=await panel.getByLabel('角色元数据名称',{exact:true}).inputValue();
  await panel.getByLabel('导入角色定义文件',{exact:true}).setInputFiles({name:'unsupported.character.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...file,schemaVersion:1}))});
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByLabel('角色元数据名称',{exact:true})).toHaveValue(before);
  // Catalog-only cultivation preview; no player build, equipment or combat evidence is invented.
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByRole('button',{name:'手动添加',exact:true}).click();
  const manual=page.getByRole('dialog',{name:'手动添加角色',exact:true});
  await manual.getByLabel('搜索游戏角色',{exact:true}).fill('奇偶·女性（水）');
  await manual.getByRole('button',{name:'选择奇偶·女性（水）',exact:true}).click();
  await expect(manual.getByRole('button',{name:'1命',exact:true})).toBeEnabled();
  await expect(manual.getByText('角色介绍与技能说明',{exact:true})).toHaveCount(0);
  await expect(manual.locator('.talent-field')).toHaveCount(3);
});
