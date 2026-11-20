import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CharacterMetadata } from '@leyline/schema';
import { verifyImages } from '../../helpers/image-integrity';

const manifest=JSON.parse(readFileSync('assets/manifest.json','utf8')) as {assets:{file:string}[]};
test('every maintained catalog image decodes to a visible offline image',async({page})=>{
  test.setTimeout(120000);
  await verifyImages(page,manifest.assets.map(asset=>asset.file));
});

test('original percentage glyphs preserve transparent holes and visible silhouette around the percent mark',async({page})=>{
  await page.goto('/');
  const samples=await page.evaluate(async()=>{
    const results=[];
    for(const stat of ['attackPercent','hpPercent','defensePercent']) {
      const image=new Image();image.src=new URL(`assets/game/stats/${stat}.svg`,location.href).href;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,128,128).data;
      // Landmarks from the site's original 128px rendering: both holes, the halo and two solid strokes.
      const points=[[74,78],[107,104],[66,91],[68,68],[102,77]] as const;
      results.push({stat,alpha:points.map(([x,y])=>pixels[(y*128+x)*4+3])});
    }
    return results;
  });
  for(const sample of samples)expect(sample.alpha,sample.stat).toEqual([0,0,0,255,255]);
});

test('attribute choices distinguish fixed and percentage icons and resolve both critical icons',async({page})=>{
  await page.goto('/');
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button',{name:'手动添加圣遗物',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'手动添加圣遗物',exact:true});
  await dialog.getByLabel('副词条 1',{exact:true}).click();
  const choices=dialog.getByRole('group',{name:'副词条 1选项',exact:true});
  for(const stat of ['attack','attackPercent','hp','hpPercent','defense','defensePercent','critRate','critDamage']) {
    // The default flower has fixed HP as its main stat, so that option is excluded from substats.
    const scope=stat==='hp'?dialog.getByLabel('主词条',{exact:true}):choices;
    const icon=scope.locator(`[data-stat="${stat}"] .game-icon.stats`);
    await expect(icon).not.toHaveClass(/placeholder/);
    await expect(icon.locator('> img')).toHaveAttribute('src',new RegExp(`/assets/game/stats/${stat}\\.svg\\?v=`));
    await expect.poll(()=>icon.locator('> img').evaluate(image=>(image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth===128)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
});

test('catalog forms and supplemented characters display their skill and constellation artwork', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '手动添加', exact: true }).click();
  const catalog = page.getByRole('dialog', { name: '手动添加角色', exact: true });
  for (const id of ['aether-anemo', 'lumine-cryo', 'manekin-pyro', 'manekina-hydro', 'mitya', 'valeriy']) {
    const character: CharacterMetadata = JSON.parse(readFileSync(`src/game-data/data/characters/${id}.json`, 'utf8'));
    const name = character.identity.name;
    await catalog.getByLabel('搜索游戏角色', { exact: true }).fill(name);
    const choice = catalog.getByRole('button', { name: `选择${name}`, exact: true });
    const decoded = (images: Element[]) => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
    const portrait = choice.locator('.game-icon.characters > img:not(.element-badge)');
    await expect(portrait).toHaveCount(1);
    await expect.poll(() => portrait.evaluateAll(decoded)).toBe(true);
    await choice.click();
    const editor = page.getByRole('dialog', { name, exact: true });
    const talents = editor.locator('.talent-field .game-icon.skills > img');
    const constellations = editor.locator('.constellation-strip .game-icon.constellations > img');
    await expect(talents).toHaveCount(character.talents.length);
    await expect(constellations).toHaveCount(character.constellations.length);
    await expect.poll(() => talents.or(constellations).evaluateAll(decoded)).toBe(true);
    await editor.getByRole('button', { name: '返回角色列表', exact: true }).click();
  }
});
