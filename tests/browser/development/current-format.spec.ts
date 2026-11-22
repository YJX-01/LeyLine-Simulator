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
  const current=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0')!);
  // A version-tag derivative of the recorded showcase, not an original player export.
  const retired=JSON.stringify({...JSON.parse(current),schemaVersion:1});
  await page.evaluate(content=>{localStorage.setItem('leyline-account-v1',content);localStorage.removeItem('leyline-account-0.2.0');},retired);
  await page.reload();
  await expect(page.locator('.character-card-header > strong')).toHaveCount(0);
  await page.getByRole('button',{name:'导航 账号',exact:true}).click();
  const input=page.getByLabel('导入账号资料文件',{exact:true});
  await input.setInputFiles({name:'recorded-current.account.json',mimeType:'application/json',buffer:Buffer.from(current)});
  await expect(page.getByRole('region',{name:'账号管理',exact:true})).toContainText('4 位角色');
  await input.setInputFiles({name:'unsupported.account.json',mimeType:'application/json',buffer:Buffer.from(retired)});
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(current);
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v1'))).toBe(retired);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Manekin elemental cultivation uses the shared character form',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'手动添加',exact:true}).click();
  const manual=page.getByRole('dialog',{name:'手动添加角色',exact:true});
  await manual.getByLabel('搜索游戏角色',{exact:true}).fill('奇偶·女性（水）');
  await manual.getByRole('button',{name:'选择奇偶·女性（水）',exact:true}).click();
  const role=page.getByRole('dialog',{name:'奇偶·女性（水）',exact:true});
  await expect(role.getByRole('button',{name:'1命',exact:true})).toBeEnabled();
  await expect(role.getByText('角色介绍与技能说明',{exact:true})).toHaveCount(0);
  await expect(role.locator('.talent-field')).toHaveCount(3);
});
