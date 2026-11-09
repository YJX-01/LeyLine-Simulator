import {readFileSync} from 'node:fs';
import {expect,type Page} from '@playwright/test';
/** UI transcription of recorded UID 618285856; no fabricated account export. Leaves Amber details open. */
export async function prepareRecordedAmberConfiguration(page:Page){
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));await page.goto('/');
  await page.getByRole('button',{name:'手动添加角色',exact:true}).click();const manual=page.getByRole('dialog',{name:'手动添加角色',exact:true});
  await manual.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await manual.getByRole('button',{name:'选择安柏',exact:true}).click();await manual.getByRole('button',{name:'6命',exact:true}).click();await manual.getByRole('button',{name:'更换武器',exact:true}).click();await manual.getByLabel('搜索装备武器',{exact:true}).fill('天空之翼');await manual.getByRole('button',{name:'天空之翼',exact:true}).click();await manual.getByRole('button',{name:'精炼2阶',exact:true}).click();await manual.getByRole('button',{name:'保存角色资料',exact:true}).click();
  const role=page.getByRole('dialog',{name:'安柏',exact:true});await expect(role).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'全选',exact:true}).click();await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
  await role.getByRole('button',{name:'本地',exact:true}).click();await role.getByRole('button',{name:'应用组合',exact:true}).click();await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();return role;
}
