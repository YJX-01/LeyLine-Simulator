import {existsSync,readFileSync} from 'node:fs';
import {test,expect,type Page,type Locator} from '@playwright/test';
const recorded='.references/enka/official-example.json';
test.skip(!existsSync(recorded),'Requires the recorded public showcase.');
async function importShowcase(page:Page,local=true){
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(recorded,'utf8'))}));
  await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await page.getByRole('button',{name:local?'同时导入本地库':'仅保存展柜',exact:true}).click();
  await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
}
async function centered(picker:Locator){
  const offset=await picker.evaluate(node=>{const header=node.querySelector('header')!.getBoundingClientRect(),title=node.querySelector('header > h2')!.getBoundingClientRect();return Math.abs((header.left+header.right-title.left-title.right)/2);});
  expect(offset).toBeLessThan(1);
}
const warning=(page:Page)=>page.getByRole('dialog',{name:'有未保存的修改',exact:true});
const account=(page:Page)=>page.evaluate(()=>localStorage.getItem('leyline-account-v2'));

test('empty and occupied pickers center titles; role exit continues, rejects failed saves, saves or discards',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await importShowcase(page);const original=await account(page);
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});
  const badges=role.locator('.constellation-number');await expect(badges).toHaveCount(7);expect(await badges.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)'))).toBe(true);
  await role.getByRole('button',{name:'装备生之花',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择生之花',exact:true});await centered(picker);await picker.locator('.inventory-card').first().click();
  await role.getByRole('button',{name:'管理生之花',exact:true}).click();await centered(picker);await page.screenshot({path:'artifacts/unsaved-picker-centered.png',fullPage:true});const remove=await picker.getByRole('button',{name:'卸下',exact:true}).boundingBox();expect(remove!.width).toBe(64);expect(remove!.height).toBe(32);
  await page.setViewportSize({width:390,height:844});await centered(picker);await page.screenshot({path:'artifacts/unsaved-picker-centered-mobile.png',fullPage:true});await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});
  await page.keyboard.press('Escape');await expect(warning(page).getByRole('button',{name:'保存',exact:true})).toBeVisible();await expect(warning(page).getByRole('button',{name:'放弃修改',exact:true})).toBeVisible();await page.screenshot({path:'artifacts/unsaved-three-actions.png',fullPage:true});await warning(page).getByRole('button',{name:'继续编辑',exact:true}).click();await expect(role.getByRole('button',{name:'管理生之花',exact:true})).toBeVisible();expect(await account(page)).toBe(original);
  // A controlled storage failure on the real imported account must retain the same draft.
  await page.evaluate(()=>{const prototype=Storage.prototype as Storage & {originalSetItem?:Storage['setItem']};prototype.originalSetItem=prototype.setItem;prototype.setItem=function(key,value){if(key.startsWith('leyline-account'))throw new Error('test storage unavailable');prototype.originalSetItem!.call(this,key,value);};});
  await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(role).toBeVisible();await expect(role.locator('[role=alert]').first()).toBeVisible();expect(await account(page)).toBe(original);
  await page.evaluate(()=>{const prototype=Storage.prototype as Storage & {originalSetItem?:Storage['setItem']};prototype.setItem=prototype.originalSetItem!;delete prototype.originalSetItem;});
  await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(role).toHaveCount(0);const saved=await account(page);expect(saved).not.toBe(original);
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await role.getByRole('button',{name:'管理生之花',exact:true}).click();await picker.getByRole('button',{name:'卸下',exact:true}).click();await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'放弃修改',exact:true}).click();await expect(role).toHaveCount(0);expect(await account(page)).toBe(saved);
});

test('artifact exit validation keeps draft; Save persists then closes',async({page})=>{
  await importShowcase(page);await page.getByTestId('workspace-nav-artifacts').click();await page.locator('.inventory-card').first().click();const detail=page.locator('.artifact-detail-dialog'),value=detail.locator('.sub-row input').first(),initial=await value.inputValue(),before=await account(page);
  await value.fill('');await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(detail).toBeVisible();await expect(detail.getByText('圣遗物副词条无效，不能重复或与主词条相同。',{exact:true})).toBeVisible();expect(await account(page)).toBe(before);
  await value.fill(initial);await detail.getByLabel('圣遗物别名',{exact:true}).fill('界面别名试改');await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(detail).toHaveCount(0);expect(JSON.parse((await account(page))!).artifacts.some((item:{alias?:string})=>item.alias==='界面别名试改')).toBe(true);
});

test('manual Save on return records actual Amber and returns to the same character list',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});await dialog.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();await dialog.getByRole('button',{name:'6命',exact:true}).click();await dialog.getByRole('button',{name:'更换武器',exact:true}).click();await dialog.getByLabel('搜索装备武器',{exact:true}).fill('天空之翼');await dialog.getByRole('button',{name:'天空之翼',exact:true}).click();await dialog.getByRole('button',{name:'精炼2阶',exact:true}).click();
  await dialog.getByRole('button',{name:'返回角色列表',exact:true}).click();await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(dialog.getByLabel('搜索游戏角色',{exact:true})).toBeVisible();await expect(dialog.getByLabel('搜索游戏角色',{exact:true})).toHaveValue('安柏');await expect(page.getByRole('dialog',{name:'安柏',exact:true})).toHaveCount(0);expect(JSON.parse((await account(page))!).characters[0].build).toMatchObject({constellation:6,weapon:{name:'天空之翼'},refinement:2});
});

test('showcase Save on exit still requires import confirmation; cancel retains draft and writes nothing',async({page})=>{
  await importShowcase(page,false);await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();const editor=page.getByRole('dialog',{name:'保存组合',exact:true});const before=await account(page);
  await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'入库并保存组合？',exact:true});await expect(confirmation).toBeVisible();expect(await account(page)).toBe(before);await confirmation.getByRole('button',{name:'取消',exact:true}).click();await expect(editor).toBeVisible();expect(await account(page)).toBe(before);
  await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await confirmation.getByRole('button',{name:'保存组合',exact:true}).click();await expect(editor).toHaveCount(0);expect(JSON.parse((await account(page))!).artifacts).toHaveLength(5);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-v1')!))).toHaveLength(1);await expect(role).toBeVisible();
});

test('team candidate Save on exit persists only the project and follows the requested close',async({page})=>{
  await importShowcase(page);const before=await account(page);
  // A UI-format project built from the recorded public snapshot, not a player project export.
  const project=await page.evaluate(async raw=>{
    const [{previewEnkaImport},{createAccount},{createEmptyProject},{addActorFromBuild}]=await Promise.all([
      // @ts-expect-error Vite browser URL.
      import('/src/domain/enka-import.ts'),
      // @ts-expect-error Vite browser URL.
      import('/src/domain/account.ts'),
      // @ts-expect-error Vite browser URL.
      import('/src/domain/workbench-project.ts'),
      // @ts-expect-error Vite browser URL.
      import('/src/domain/real-project.ts'),
    ]);
    const preview=await previewEnkaImport(raw,'618285856',createAccount());
    const recorded=preview.rows.find((row:{character:{name:string}})=>row.character.name==='安柏').character.showcase.build;
    const result=createEmptyProject();addActorFromBuild(result,recorded,'安柏');return result;
  },JSON.parse(readFileSync(recorded,'utf8')));
  await page.getByTestId('workspace-nav-projects').click();await page.getByLabel('导入轴项目文件',{exact:true}).setInputFiles({name:'recorded-showcase-ui-harness.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.getByTestId('workspace-nav-team').click();await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();const editor=page.getByRole('dialog',{name:'修改所选队员配装',exact:true});
  // Explicit refinement trial from the recorded R2 weapon, without claiming a new observation.
  await editor.getByRole('button',{name:'精炼3阶',exact:true}).click();await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);expect(await account(page)).toBe(before);
  await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();await expect(editor.getByRole('button',{name:'精炼3阶',exact:true})).toHaveAttribute('aria-pressed','true');
});
