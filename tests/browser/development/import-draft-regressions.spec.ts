import { catalogInventory } from '../../../tools/lib/catalog-data.mjs';
import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';

test('the shared reference picker has the complete catalog',async({page})=>{
  // Compare UI membership against authored data, independently of generated browser projections.
  // The uninitialized traveler bases are intentionally not selectable reference forms.
  const manifest=catalogInventory() as {characters:string[]};
  const referenceNames=manifest.characters.filter(id=>!['aether','lumine'].includes(id)).map(id=>
    (JSON.parse(readFileSync(`src/game-data/data/characters/${id}.json`,'utf8')) as {identity:{name:string}}).identity.name);
  await page.setViewportSize({width:1280,height:900});await page.goto('/');
  await page.getByTestId('workspace-nav-combinations').click();await page.getByRole('button',{name:'新建组合',exact:true}).first().click();const editor=page.getByRole('dialog',{name:'新建组合',exact:true});await editor.getByRole('button',{name:'选择参考角色',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'选择参考角色',exact:true});await expect(picker.locator('.catalog-browser-item')).toHaveCount(referenceNames.length);expect((await picker.locator('.catalog-browser-item strong').allTextContents()).sort()).toEqual([...referenceNames].sort());await picker.getByRole('button',{name:'排序',exact:true}).click();await expect(page.getByRole('dialog',{name:'角色排序',exact:true}).getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
  await picker.getByLabel('搜索参考角色',{exact:true}).fill('空');await expect(picker.locator('.catalog-browser-item')).toHaveCount(7);await page.screenshot({path:'artifacts/reference-character-picker-reused.png',fullPage:true});await picker.getByRole('button',{name:'选择空（草）',exact:true}).click();await expect(editor.getByRole('button',{name:'空（草）',exact:true})).toBeVisible();
});
