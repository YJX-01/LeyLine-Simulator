import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { verifyImages } from '../../helpers/image-integrity';

const manifest=JSON.parse(readFileSync('assets/manifest.json','utf8')) as {assets:{file:string}[]};
test('every maintained catalog image decodes to a visible offline image',async({page})=>{
  test.setTimeout(120000);
  await verifyImages(page,manifest.assets.map(asset=>asset.file));
});

test('catalog forms and supplemented characters resolve skill and actual constellation artwork',async({page})=>{
  test.setTimeout(90000);
  for(const [id,name] of [['aether-anemo','空（风）'],['lumine-cryo','荧（冰）'],['manekin-pyro','奇偶·男性（火）'],['manekina-hydro','奇偶·女性（水）'],['mitya','米提亚'],['valeriy','瓦列里']]) {
    // Static catalog preview only; no player cultivation, equipment or damage observations are created.
    const character=JSON.parse(readFileSync(`src/game-data/data/characters/${id}.json`,'utf8'));
    await page.goto('/');
    await page.getByRole('button',{name:'手动添加',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
    await dialog.getByLabel('搜索游戏角色',{exact:true}).fill(name);
    const choice=dialog.getByRole('button',{name:`选择${name}`,exact:true});
    await expect.poll(()=>choice.locator('.game-icon.characters > img:not(.element-badge)').evaluate(image=>(image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth>0)).toBe(true);
    await choice.click();
    const icons=dialog.locator('.talent-field .game-icon.skills,.constellation-strip .game-icon.constellations');
    await expect(icons).toHaveCount(character.talents.length+character.constellations.length);
    await expect.poll(()=>icons.evaluateAll(nodes=>nodes.every(node=>!node.classList.contains('placeholder') && Array.from(node.querySelectorAll('img')).every(image=>image.complete && image.naturalWidth>0)))).toBe(true);
    if(!character.constellations.length)await expect(dialog.locator('.constellation-strip .game-icon')).toHaveCount(0);
  }
});
