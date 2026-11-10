import { existsSync,readFileSync } from 'node:fs';
import { test,expect } from '@playwright/test';

test('manual selection opens directly, preserves the list on return, and displays seven traveler forms',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
  await expect(dialog.locator('.catalog-browser-item').first()).toBeVisible();
  await expect(dialog.getByRole('button',{name:'选择游戏角色',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'排序',exact:true}).click();
  const sort=page.getByRole('dialog',{name:'角色排序',exact:true});await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await sort.getByRole('button',{name:'完成',exact:true}).click();
  await dialog.getByLabel('搜索游戏角色',{exact:true}).pressSequentially('安柏');await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();
  await expect(dialog.locator('.talent-field')).toHaveCount(3);
  await dialog.getByRole('button',{name:'返回角色列表',exact:true}).click();await expect(dialog.getByLabel('搜索游戏角色',{exact:true})).toHaveValue('安柏');
  await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();await dialog.getByLabel('普攻',{exact:true}).fill('8');
  await dialog.getByRole('button',{name:'返回角色列表',exact:true}).click();await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();
  await dialog.getByLabel('搜索游戏角色',{exact:true}).fill('空');await expect(dialog.locator('.catalog-browser-item')).toHaveCount(7);await page.screenshot({path:'artifacts/manual-traveler-seven-forms.png',fullPage:true});
  for(const element of ['风','岩','雷','草','水','火','冰']){
    await dialog.getByRole('button',{name:`选择空（${element}）`,exact:true}).click();
    await expect(dialog.locator('.talent-field')).toHaveCount(3);await expect(dialog.locator('.character-cultivation .element-badge')).toBeVisible();
    if(element==='冰')await page.screenshot({path:'artifacts/manual-traveler-cultivation.png',fullPage:true});
    await dialog.getByRole('button',{name:'返回角色列表',exact:true}).click();
  }
  await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/manual-character-list-mobile.png',fullPage:true});
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2') ?? '{"characters":[]}').characters)).toEqual([]);expect(errors).toEqual([]);
});

test('account UID persists, prefills the showcase import, and the three entry dialogs share actions',async({page})=>{
  test.skip(!existsSync('tests/fixtures/recordings/enka/official-example.json'),'Requires recorded public showcase.');
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('tests/fixtures/recordings/enka/official-example.json','utf8'))}));
  await page.goto('/');await page.getByTestId('workspace-nav-account').click();await page.getByLabel('账号游戏 UID',{exact:true}).fill('618285856');await page.getByLabel('账号游戏 UID',{exact:true}).press('Enter');
  await page.reload();await page.getByTestId('workspace-nav-account').click();await expect(page.getByLabel('账号游戏 UID',{exact:true})).toHaveValue('618285856');
  await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'展柜导入',exact:true}).click();const showcase=page.getByRole('dialog',{name:'从角色展柜导入',exact:true});
  await expect(showcase.getByLabel('游戏 UID',{exact:true})).toHaveValue('618285856');await expect(showcase.locator('.enka-import > p')).toHaveCount(1);await expect(showcase.locator('.import-intro')).toHaveText('读取 UID 的公开角色展柜，无需登录。请在游戏中开启“显示角色详情”；未展示角色与背包库存无法通过此接口读取。');expect(await showcase.locator('.import-intro').evaluate(node=>getComputedStyle(node).fontSize)).toBe('16px');
  await page.screenshot({path:'artifacts/showcase-import-unified.png',fullPage:true});await showcase.getByRole('button',{name:'查询角色展柜',exact:true}).click();await showcase.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'莫娜导入',exact:true}).click();const mona=page.getByRole('dialog',{name:'导入莫娜圣遗物',exact:true});await expect(mona.getByRole('button',{name:'从穿戴备注整理角色',exact:true})).toHaveCount(0);
  await expect(mona.getByLabel('莫娜圣遗物 JSON',{exact:true})).toBeVisible();const bounds=await mona.evaluate(node=>{const a=node.querySelector('.file-entry')!.getBoundingClientRect(),b=node.querySelector('textarea')!.getBoundingClientRect();return [Math.abs(a.left-b.left),Math.abs(a.right-b.right)];});expect(bounds.every(value=>value<1)).toBe(true);
  await page.screenshot({path:'artifacts/mona-import-unified.png',fullPage:true});await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-account').click();await page.getByRole('button',{name:'新建账号',exact:true}).click();await expect(page.getByLabel('账号游戏 UID',{exact:true})).toHaveValue('');
});

test('actual Mona export accepts formatting above the former byte cap and still previews before writing',async({page})=>{
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual Mona inventory.');test.setTimeout(60000);
  await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
  // Only trailing JSON whitespace changes; item contents are the original recorded export.
  const bytes=Buffer.concat([readFileSync('.references/artifacts_mona.json'),Buffer.alloc(8*1024*1024,32)]);
  await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles({name:'recorded-export-with-whitespace.json',mimeType:'application/json',buffer:bytes});
  await expect(page.getByLabel('莫娜导入预览',{exact:true})).toContainText('新增 458 件');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2') ?? '{"artifacts":[]}').artifacts.length)).toBe(0);
  await page.getByRole('button',{name:'确认导入 458 件五星圣遗物',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).artifacts.length)).toBe(458);
});


test('manual cultivation transcribes the recorded Amber and saves once before reopening details',async({page})=>{
  test.skip(!existsSync('tests/fixtures/recordings/enka/official-example.json'),'Requires the recorded cultivation.');
  // Recorded UID 618285856: Amber 90/6, C6, 10/10/10, Skyward Harp 90/6 R2.
  await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
  await dialog.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'保存角色资料',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'6命',exact:true}).click();await dialog.getByRole('button',{name:'更换武器',exact:true}).click();await dialog.getByLabel('搜索装备武器',{exact:true}).fill('天空之翼');await dialog.getByRole('button',{name:'天空之翼',exact:true}).click();await dialog.getByRole('button',{name:'精炼2阶',exact:true}).click();
  await dialog.getByRole('button',{name:'保存角色资料',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('dialog',{name:'安柏',exact:true})).toBeVisible();
  const characters=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')!).characters);expect(characters).toHaveLength(1);expect(characters[0].build).toMatchObject({level:90,ascension:6,constellation:6,talents:{normal:10,skill:10,burst:10},weapon:{name:'天空之翼'},weaponLevel:90,weaponAscension:6,refinement:2});
});
