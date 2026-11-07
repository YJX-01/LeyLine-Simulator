import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function inventoryTask(page: Page, info: TestInfo, url = '/') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('普通伤害示例轴', { exact: true })).toHaveCount(0);
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button', { name: '导入莫娜圣遗物', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导入莫娜圣遗物', exact: true });
  // Transfer the original bytes: WebKit on Windows can lose its native temporary file handle.
  await dialog.getByLabel('导入莫娜圣遗物文件', { exact: true }).setInputFiles({
    name: 'artifacts_mona.json', mimeType: 'application/json', buffer: await readFile('.references/artifacts_mona.json'),
  });
  await expect(dialog.getByLabel('莫娜导入预览', { exact: true })).toContainText('新增 458 件');
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await dialog.getByRole('button', { name: '确认导入 458 件五星圣遗物', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.inventory-card')).toHaveCount(30);
  await expect(page.locator('.inventory-count')).toContainText('共 458 件');
  const initialCards=await page.locator('.inventory-card').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
  await page.getByRole('group',{name:'卡片密度'}).getByRole('button',{name:'紧凑',exact:true}).click();
  expect(await page.locator('.inventory-card').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).toEqual(initialCards);
  await page.getByRole('group',{name:'卡片密度'}).getByRole('button',{name:'疏松',exact:true}).click();
  await expect(page.locator('.inventory-card footer')).toHaveCount(0);

  // Derive the former unresolved representation from one actual item; never fabricate a player export.
  await page.evaluate(async () => {
    const account = JSON.parse(localStorage.getItem('leyline-account-v1')!);
    const item = account.artifacts.find((item: { mona?: {sourceSetName?: string} }) => item.mona?.sourceSetName === 'HeavensGift');
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2,'0')).join('');
    item.real.setId = `mona-unresolved-${await hash('HeavensGift')}`;
    item.mona.setIdentityPending = true;
    item.real.source.fingerprint = await hash(JSON.stringify({ setId: item.real.setId, slot: item.slot, level: item.real.level, main: {stat: item.real.mainStat, value: item.mona.mainValue}, substats: item.real.substats }));
    localStorage.setItem('leyline-account-v1', JSON.stringify(account));
  });
  await page.reload();
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button', { name: '核对已导入套装', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('天之美赐');
  await page.getByRole('button', { name: '确认补全 1 件套装身份', exact: true }).click();
  await expect(page.getByRole('button', { name: '核对已导入套装', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '生之花', exact: true }).click();
  await expect(page.locator('.inventory-count')).toContainText('筛选结果 86 件');
  await page.getByLabel('筛选主词条', { exact: true }).selectOption('critRate');
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await page.getByLabel('筛选主词条', { exact: true }).selectOption('');
  await page.locator('.inventory-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('炉火融炼之心');
  await expect(page.getByRole('dialog')).toContainText('4780');
  await expect(page.getByRole('dialog').locator('.roll-count')).toHaveText(['1','2','2']);
  await expect(page.getByRole('dialog').locator('dt > span:last-child')).toHaveText(['生命值','充能效率','暴击率','暴击伤害']);
  await page.getByRole('button', { name: '编辑圣遗物', exact: true }).click();
  await page.getByLabel('强化等级', { exact: true }).fill('16');
  await page.keyboard.press('Escape');
  await expect(page.locator('.inventory-card').first().locator('.artifact-level')).toHaveText('20');
  await page.locator('.inventory-card').first().click();
  await page.getByRole('button', { name: '编辑圣遗物', exact: true }).click();
  await page.getByLabel('强化等级', { exact: true }).fill('16');
  await page.getByRole('button', { name: '预览词条', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('3967');
  await page.getByRole('button', { name: '应用修改', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.artifact-level')).toHaveText('16');
  await expect(page.getByRole('dialog')).toContainText('3967');
  await page.getByRole('dialog').getByText('来源与实物身份', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('id:8770563143816081');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.inventory-card').first()).toBeFocused();
  await page.getByRole('button', { name: '全部部位', exact: true }).click();
  await page.getByLabel('搜索圣遗物', { exact: true }).fill('琴');
  await expect(page.locator('.inventory-count')).toContainText('筛选结果 0 件'); // Original wearer remarks are separate from current equipment.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('u1-actual-inventory.png'), fullPage: true });
  await page.getByLabel('搜索圣遗物', { exact: true }).fill('');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存账号资料', exact: true }).click();
  const saved = info.outputPath('actual-account.json');
  await (await download).saveAs(saved);
  const account = JSON.parse(await readFile(saved, 'utf8'));
  expect(account.artifacts).toHaveLength(458);
  expect(account.artifacts.every((item: { mona?: {setIdentityPending?: boolean} }) => !item.mona?.setIdentityPending)).toBe(true);
  expect(account.characters).toHaveLength(0); // The inventory file cannot invent character builds.
  await page.reload();
  await page.getByTestId('workspace-nav-artifacts').click();
  await expect(page.locator('.inventory-count')).toContainText('共 458 件');
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByLabel('导入账号资料文件', { exact: true }).setInputFiles(saved);
  await expect(page.getByLabel('账号管理', { exact: true })).toContainText('458 件圣遗物');
  await page.getByRole('button', { name: '新建账号', exact: true }).click();
  await expect(page.getByLabel('账号管理', { exact: true })).toContainText('0 件圣遗物');
  await page.getByRole('button', { name: '恢复替换前账号', exact: true }).click();
  await expect(page.getByLabel('账号管理', { exact: true })).toContainText('458 件圣遗物');
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByRole('button', { name: '莫娜 JSON', exact: true }).click();
  await page.getByRole('button', { name: '从穿戴备注整理角色', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('55 个角色穿戴备注');
  await page.getByRole('button', { name: '确认按备注整理', exact: true }).click();
  await expect(page.locator('.character-cards > button')).toHaveCount(55);
  await page.getByLabel('搜索账号角色', { exact: true }).fill('琴');
  await expect(page.locator('.character-cards .card-weapon')).toBeVisible();
  await page.locator('.character-cards > button').click();
  await expect(page.locator('.equipment-list .artifact-summary[title*="翠绿之影"]').first()).toBeVisible();
  await expect.poll(() => page.locator('.character-cultivation .characters > img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => page.locator('.equipment-list .game-icon > img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByLabel('角色等级', { exact: true })).toContainText('90');
  await expect(page.getByRole('button', { name: '选择游戏角色', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('账号基础攻击力', { exact: true })).toHaveCount(0);
  await expect(page.locator('.account-editor')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('u1-role-detail.png'), fullPage: true });
  await page.getByRole('button', { name: '更换生之花', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('圣遗物库存浏览')).toContainText('筛选结果 86 件');
  const sourceOwner = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-v1')!).characters.find((entry: {name: string; equipment: {flower?: string}}) => entry.name !== '琴' && entry.equipment.flower).id);
  await page.getByLabel('筛选装备占用', { exact: true }).selectOption(sourceOwner);
  await page.locator('.inventory-card').first().click();
  await page.getByRole('button', { name: '选择这件圣遗物', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认转移装备', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消转移', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.character-cards > button')).toBeFocused();
  await page.getByLabel('搜索账号角色', { exact: true }).fill('琴不存在');
  await expect(page.getByText('没有符合条件的角色，请调整搜索或筛选。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '手动添加', exact: true }).click();

  await expect(page.getByLabel('角色等级', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存角色资料', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择游戏角色', exact: true }).click();
  await page.getByLabel('搜索游戏角色', { exact: true }).fill('琴');
  await expect.poll(() => page.locator('.catalog-options .game-icon > img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath('u1-character-picker.png') });
  for (const name of ['芙宁娜', '丝柯克', '米提亚', '瓦列里']) {
    await page.getByLabel('搜索游戏角色', { exact: true }).fill(name);
    await expect.poll(() => page.locator('.catalog-options .game-icon > img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => page.locator('.catalog-options .game-icon > img').first().evaluate((image: HTMLImageElement) => {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
      const context = canvas.getContext('2d')!; context.drawImage(image,0,0,128,128);
      const pixels = context.getImageData(0,0,128,128).data;
      let opaque = false; for (let index = 3; index < pixels.length; index += 4) if (pixels[index] >= 128) { opaque = true; break; }
      return { width: image.naturalWidth, height: image.naturalHeight, opaque, versioned: image.src.includes('?v=') };
    })).toEqual({ width:128, height:128, opaque:true, versioned:true });
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('u1-narrow-inventory.png'), fullPage: true });
  // Manually transcribe one actual item into an empty temporary account; never duplicate it in the imported inventory.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '导航 设置', exact: true }).click();
  await page.getByRole('button', { name: '新建账号', exact: true }).click();
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button', { name: '手动添加圣遗物', exact: true }).click();
  const form = page.getByRole('dialog', { name: '手动添加圣遗物', exact: true });
  const actual = account.artifacts[0];
  await form.getByLabel('圣遗物名称', { exact: true }).fill(actual.name);
  await form.getByRole('button', { name: '选择套装', exact: true }).click();
  const setName = actual.name.split(' · ')[0];
  await page.getByLabel('搜索套装', { exact: true }).fill(setName);
  await page.getByRole('dialog', { name: '选择套装', exact: true }).getByRole('button', { name: setName, exact: true }).click();
  await form.getByLabel('强化等级', { exact: true }).fill(String(actual.real.level));
  for (let index = 0; index < actual.real.substats.length; index++) {
    const sub = actual.real.substats[index];
    await form.getByRole('button', { name: '添加副词条', exact: true }).click();
    await form.getByLabel(`副词条 ${index + 1}`, { exact: true }).selectOption(sub.stat);
    const percentage = !['hp','attack','defense','elementalMastery'].includes(sub.stat);
    await form.getByLabel(percentage ? '数值（%）' : '数值', { exact: true }).last().fill(String(sub.value * (percentage ? 100 : 1)));
  }
  await form.getByRole('button', { name: '预览词条', exact: true }).click();
  await expect(page.locator('.inventory-card')).toHaveCount(0);
  await expect(form).toContainText('3967');
  await form.getByRole('button', { name: '确认入库', exact: true }).click();
  await expect(page.locator('.inventory-card')).toHaveCount(1);
  await expect(page.locator('.inventory-card')).toContainText('3967');
  expect(errors).toEqual([]);
}
