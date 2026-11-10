import { recordedJsonFile } from '../../helpers/recorded-reference';
import {existsSync,readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';

test('native file cancellation keeps the import dialog, preview and account unchanged',async({page})=>{
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual inventory.');
  await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'导入莫娜圣遗物',exact:true}),file=dialog.getByLabel('导入莫娜圣遗物文件',{exact:true});
  const before=await page.evaluate(()=>localStorage.getItem('leyline-account-v2'));
  // File inputs emit a bubbling cancel event when the native chooser is dismissed.
  await file.dispatchEvent('cancel',{bubbles:true});await expect(dialog).toBeVisible();
  await file.setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));await expect(dialog.getByLabel('莫娜导入预览',{exact:true})).toContainText('新增 458 件');
  await file.dispatchEvent('cancel',{bubbles:true});await expect(dialog).toBeVisible();await expect(dialog.getByLabel('莫娜导入预览',{exact:true})).toContainText('新增 458 件');
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(before);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('showcase preview has bulk selection and the shared reference picker has the complete catalog',async({page})=>{
  // Compare UI membership against authored data, independently of generated browser projections.
  // The uninitialized traveler bases are intentionally not selectable reference forms.
  const manifest=JSON.parse(readFileSync('src/game-data/data/manifest.json','utf8')) as {characters:string[]};
  const referenceNames=manifest.characters.filter(id=>!['aether','lumine'].includes(id)).map(id=>
    (JSON.parse(readFileSync(`src/game-data/data/characters/${id}.json`,'utf8')) as {identity:{name:string}}).identity.name);
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');
  await page.setViewportSize({width:1280,height:900});await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));
  await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();const dialog=page.getByRole('dialog',{name:'从角色展柜导入',exact:true});await dialog.getByLabel('游戏 UID',{exact:true}).fill('618285856');await dialog.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await expect(dialog.locator('.import-row')).toHaveCount(4);await dialog.getByRole('button',{name:'清空选择',exact:true}).click();await expect(dialog.getByRole('button',{name:'确认导入 0 位角色',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'全选',exact:true}).click();await expect(dialog.locator('.import-row[aria-pressed=true]')).toHaveCount(4);
  await dialog.getByRole('button',{name:'导入安柏',exact:true}).click();await expect(dialog.getByRole('button',{name:'确认导入 3 位角色',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'全选',exact:true}).click();await page.screenshot({path:'artifacts/showcase-preview-unified.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/showcase-preview-unified-mobile.png',fullPage:true});await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:900});
  await page.getByTestId('workspace-nav-combinations').click();await page.getByRole('button',{name:'新建组合',exact:true}).first().click();const editor=page.getByRole('dialog',{name:'新建组合',exact:true});await editor.getByRole('button',{name:'选择参考角色',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'选择参考角色',exact:true});await expect(picker.locator('.catalog-browser-item')).toHaveCount(referenceNames.length);expect((await picker.locator('.catalog-browser-item strong').allTextContents()).sort()).toEqual([...referenceNames].sort());await picker.getByRole('button',{name:'排序',exact:true}).click();await expect(page.getByRole('dialog',{name:'角色排序',exact:true}).getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
  await picker.getByLabel('搜索参考角色',{exact:true}).fill('空');await expect(picker.locator('.catalog-browser-item')).toHaveCount(7);await page.screenshot({path:'artifacts/reference-character-picker-reused.png',fullPage:true});await picker.getByRole('button',{name:'选择空（草）',exact:true}).click();await expect(editor.getByRole('button',{name:'空（草）',exact:true})).toBeVisible();
});
