import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const source = '.references/enka/official-example.json';
async function expectStatusAlignment(page:import('@playwright/test').Page) {
  const issues=await page.locator('.character-card').evaluateAll(cards=>cards.flatMap(card=>{
    const status=card.querySelector('.character-card-status')!,picture=card.querySelector('.card-sets')!,name=card.querySelector('.character-card-header > strong')!;
    const bounds=status.getBoundingClientRect(),image=picture.getBoundingClientRect(),title=name.getBoundingClientRect();
    const errors:string[]=[];
    if(Math.abs(bounds.left-image.left)>.5 || Math.abs(bounds.width-image.width)>.5)errors.push('Status is not aligned with the artifact image');
    if(bounds.right>title.left-3)errors.push('Status overlaps character name');
    for(const badge of status.querySelectorAll('.status-badge')) {
      const text=document.createRange();text.selectNodeContents(badge);const rect=text.getBoundingClientRect(),box=badge.getBoundingClientRect();
      if(rect.left<box.left || rect.right>box.right)errors.push('Status text spills outside badge');
    }
    return errors;
  }));
  expect(issues).toEqual([]);
}
test.skip(!existsSync(source), 'Requires the recorded actual public Enka showcase; no synthetic substitute.');

test('U1 character cards preserve actual showcase set composition and source isolation', async ({ page }) => {
  const raw = JSON.parse(await readFile(source, 'utf8'));
  await page.route('**/api/enka/618285856', route => route.fulfill({ json: raw }));
  await page.goto('/');
  await page.getByRole('button', { name: '展柜导入', exact: true }).click();
  await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
  await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
  await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
  await page.keyboard.press('Escape');
  // Independent expectations from the recorded equipment: Amber 2+2,
  // Bennett five of one set, Ganyu 4+1, Xingqiu 2+2. No game damage claim.
  for (const [name, badges] of [['安柏', ['2', '2']], ['班尼特', ['4']], ['甘雨', ['4']], ['行秋', ['2', '2']]] as const) {
    const card = page.getByRole('button', { name: `查看${name}详情`, exact: true });
    await expect(card.locator('.set-badge')).toHaveText([...badges]);
    await expect(card.locator('.card-set img')).toHaveCount(badges.length);
    await expect(card.getByLabel('本地配置缺失', { exact: true })).toBeVisible();
    await expect(card.getByLabel('有展柜信息', { exact: true })).toBeVisible();
    await expect(card.locator('.character-card-status .status-badge')).toHaveText(['缺失','展柜']);
    await expect(card.locator('.character-card-status svg')).toHaveCount(0);
  }
  await expectStatusAlignment(page);
  await expect.poll(() => page.locator('.card-set img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-v1')!).artifacts.length)).toBe(0);
  await page.screenshot({ path: 'artifacts/character-card-redesign-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectStatusAlignment(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/character-card-redesign-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 844 });
  await expectStatusAlignment(page);
  const overlapping = await page.locator('.card-portraits').evaluateAll(cards => cards.some(card => {
    const boxes = Array.from(card.querySelectorAll(':scope > .characters, :scope > .card-sets, :scope > .card-weapon')).map(node => node.getBoundingClientRect());
    return boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)));
  }));
  expect(overlapping).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/character-card-360.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.getByRole('button', { name: '查看安柏详情', exact: true });
  await card.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const skillInput=page.getByLabel('战技',{exact:true});
  await expect(skillInput).toHaveValue('13');
  await skillInput.focus();await skillInput.press('ControlOrMeta+A');await skillInput.pressSequentially('12',{delay:60});
  await expect(skillInput).toHaveValue('12');
  await page.getByRole('dialog').getByRole('button',{name:'还原',exact:true}).click();
  await expect(page.getByLabel('战技',{exact:true})).toHaveValue('13');
  const beforeEdit = await page.evaluate(() => localStorage.getItem('leyline-account-v1'));
  await page.getByRole('button', { name:'降低普攻', exact:true }).click();
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-v1'))).toBe(beforeEdit);
  await page.getByRole('dialog').getByRole('button', { name:'保存', exact:true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name:'保存', exact:true })).toBeDisabled();
  const savedCharacter = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-v1')!).characters.find((entry:{name:string}) => entry.name==='安柏'));
  expect(savedCharacter.realBuild.talents.normal).toBe(9);
  expect(savedCharacter.showcase.build.talents.normal).toBe(10);
  await page.screenshot({ path: 'artifacts/character-card-detail-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'artifacts/character-card-detail-desktop.png', fullPage: true });
  const savedAccount = await page.evaluate(() => localStorage.getItem('leyline-account-v1'));
  await page.getByRole('button',{name:'降低普攻',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'放弃未保存的修改？',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'继续编辑',exact:true}).click();
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-v1'))).toBe(savedAccount);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'放弃修改并退出',exact:true}).click();
  await expect(card).toBeFocused();
  await card.click();
  await expect(page.getByRole('button',{name:'有效词条攻击力',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('group',{name:'有效词条',exact:true}).getByRole('button')).toHaveCount(7);
  await page.getByRole('button',{name:'删除',exact:true}).click();
  await page.getByRole('button',{name:'确认清除',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-v1'))).toBe(savedAccount);
  await page.getByRole('dialog').getByRole('button',{name:'还原',exact:true}).click();
  await page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true}).click();
  await page.getByRole('button',{name:'删除',exact:true}).click();
  await page.getByRole('dialog',{name:'清除展柜信息？',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true})).toBeVisible();
  await page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true}).click();
  await page.getByRole('button',{name:'删除',exact:true}).click();
  await page.getByRole('button',{name:'确认清除',exact:true}).click();
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-v1'))).toBe(savedAccount);
  await expect(page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true})).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-v1')!).characters.find((entry:{name:string})=>entry.name==='安柏'));
  expect(cleared.showcase).toBeUndefined();
  expect(cleared.realBuild.talents.normal).toBe(9);
  await page.getByRole('button',{name:'删除',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'清除本地配装？',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'确认清除',exact:true}).click();
  expect(await page.evaluate(() => localStorage.getItem('leyline-account-v1'))).not.toBeNull();
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  const localCleared = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-v1')!).characters.find((entry:{name:string})=>entry.name==='安柏'));
  expect(localCleared).toBeUndefined();
  await expect(card).toHaveCount(0);
  await expect(page.getByLabel('搜索账号角色',{exact:true})).toBeFocused();
});


test('clearing preferred promotes a real saved alternative, then removes the last source',async({page})=>{
  const raw=JSON.parse(await readFile(source,'utf8'));
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:raw}));await page.goto('/');
  await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
  await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
  const card=page.getByRole('button',{name:'查看安柏详情',exact:true});await card.click();
  const role=page.getByRole('dialog',{name:'安柏',exact:true});
  await role.getByRole('button',{name:'精炼3阶',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();
  await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();await page.getByRole('dialog',{name:'安柏的配置',exact:true}).getByRole('button',{name:'选择安柏首选配置',exact:true}).click();
  await role.getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByRole('dialog',{name:'清除本地配装？',exact:true})).toContainText('备选接替首选');
  await page.getByRole('button',{name:'确认清除',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();
  const promoted=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v1')!).characters.find((item:{name:string})=>item.name==='安柏'));
  expect(promoted.realBuild.refinement).toBe(3);expect(promoted.showcase.build.refinement).toBe(2);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-character-loadouts-v1')!).length)).toBe(0);
  await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认清除',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();
  await expect(role).toBeVisible();await expect(role.getByRole('button',{name:'展柜',exact:true})).toHaveCount(0);
  await role.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认清除',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();
  await expect(card).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await expect(page.locator('.character-card')).toHaveCount(3);await expect(card).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v1')!).artifacts.length)).toBe(0);
});
