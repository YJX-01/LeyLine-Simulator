import { type LocalAccount } from '@leyline/schema';
import { readDocument } from '../../helpers/browser-document';
import { recordedJsonFile } from '../../helpers/recorded-reference';
import { existsSync, readFileSync } from 'node:fs';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { catalogInventory } from '../../../tools/lib/catalog-data.mjs';
import { prepareRecordedAmberConfiguration } from '../../helpers/recorded-amber-configuration';
import { auditDialog } from '../../helpers/ui-contract-audit';

test.describe('import-entry', () => {
  test('manual selection opens directly, preserves the list on return, and displays seven traveler forms',async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
    await expect(dialog.locator('.catalog-browser-item').first()).toBeVisible();
    await expect(dialog.getByRole('button',{name:'选择游戏角色',exact:true})).toHaveCount(0);
    await dialog.getByRole('button',{name:'排序',exact:true}).click();
    const sort=page.getByRole('dialog',{name:'角色排序',exact:true});await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await sort.getByRole('button',{name:'完成',exact:true}).click();
    await dialog.getByLabel('搜索游戏角色',{exact:true}).pressSequentially('安柏');await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();
    const role=page.getByRole('dialog',{name:'安柏',exact:true});
    await expect(role.locator('.talent-field')).toHaveCount(3);
    await role.getByRole('button',{name:'返回角色列表',exact:true}).click();await expect(dialog.getByLabel('搜索游戏角色',{exact:true})).toHaveValue('安柏');
    await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();await role.getByLabel('普攻',{exact:true}).fill('8');
    await role.getByRole('button',{name:'返回角色列表',exact:true}).click();await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'放弃修改',exact:true}).click();
    await dialog.getByLabel('搜索游戏角色',{exact:true}).fill('空');await expect(dialog.locator('.catalog-browser-item')).toHaveCount(7);await page.screenshot({path:'artifacts/manual-traveler-seven-forms.png',fullPage:true});
    for(const element of ['风','岩','雷','草','水','火','冰']){
      await dialog.getByRole('button',{name:`选择空（${element}）`,exact:true}).click();
      const traveler = page.getByRole('dialog',{name:`空（${element}）`,exact:true});
      await expect(traveler.locator('.talent-field')).toHaveCount(3);await expect(traveler.locator('.character-cultivation .element-badge')).toBeVisible();
      if(element==='冰')await page.screenshot({path:'artifacts/manual-traveler-cultivation.png',fullPage:true});
      await traveler.getByRole('button',{name:'返回角色列表',exact:true}).click();
    }
    await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/manual-character-list-mobile.png',fullPage:true});
    await page.keyboard.press('Escape');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0') ?? '{"characters":[]}').characters)).toEqual([]);expect(errors).toEqual([]);
  });

  test('account UID persists, prefills the showcase import, and the three entry dialogs share actions',async({page})=>{
    test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));
    await page.goto('/');await page.getByTestId('workspace-nav-account').click();await page.getByLabel('账号游戏 UID',{exact:true}).fill('618285856');await page.getByLabel('账号游戏 UID',{exact:true}).press('Enter');
    await page.reload();await page.getByTestId('workspace-nav-account').click();await expect(page.getByLabel('账号游戏 UID',{exact:true})).toHaveValue('618285856');
    await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'展柜导入',exact:true}).click();const showcase=page.getByRole('dialog',{name:'从角色展柜导入',exact:true});
    await expect(showcase.getByLabel('游戏 UID',{exact:true})).toHaveValue('618285856');await expect(showcase.locator('.enka-import > p')).toHaveCount(1);await expect(showcase.locator('.import-intro')).toHaveText('读取 UID 的公开角色展柜，无需登录。请在游戏中开启“显示角色详情”；未展示角色与背包库存无法通过此接口读取。');expect(await showcase.locator('.import-intro').evaluate(node=>getComputedStyle(node).fontSize)).toBe('16px');
    await page.screenshot({path:'artifacts/showcase-import-unified.png',fullPage:true});await showcase.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    const previousViewport=page.viewportSize();await page.setViewportSize({width:1280,height:900});
    await expect(showcase.locator('.import-row')).toHaveCount(4);await showcase.getByRole('button',{name:'清空选择',exact:true}).click();await expect(showcase.getByRole('button',{name:'确认导入 0 位角色',exact:true})).toBeDisabled();await showcase.getByRole('button',{name:'全选',exact:true}).click();await expect(showcase.locator('.import-row[aria-pressed=true]')).toHaveCount(4);
    await showcase.getByRole('button',{name:'导入安柏',exact:true}).click();await expect(showcase.getByRole('button',{name:'确认导入 3 位角色',exact:true})).toBeEnabled();await showcase.getByRole('button',{name:'全选',exact:true}).click();await page.screenshot({path:'artifacts/showcase-preview-unified.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});expect(await showcase.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/showcase-preview-unified-mobile.png',fullPage:true});if(previousViewport)await page.setViewportSize(previousViewport);
    await showcase.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();const mona=page.getByRole('dialog',{name:'导入莫娜圣遗物',exact:true});await expect(mona.getByRole('button',{name:'从穿戴备注整理角色',exact:true})).toHaveCount(0);
    await expect(mona.getByLabel('莫娜圣遗物 JSON',{exact:true})).toBeVisible();const bounds=await mona.evaluate(node=>{const a=node.querySelector('.file-entry')!.getBoundingClientRect(),b=node.querySelector('textarea')!.getBoundingClientRect();return [Math.abs(a.left-b.left),Math.abs(a.right-b.right)];});expect(bounds.every(value=>value<1)).toBe(true);
    await page.screenshot({path:'artifacts/mona-import-unified.png',fullPage:true});await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-account').click();await page.getByRole('button',{name:'新建账号',exact:true}).click();await expect(page.getByLabel('账号游戏 UID',{exact:true})).toHaveValue('');
  });

  test('actual Mona export accepts formatting above the former byte cap and still previews before writing',async({page})=>{
    test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual Mona inventory.');test.setTimeout(60000);
    await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
    // Only trailing JSON whitespace changes; item contents are the original recorded export.
    const bytes=Buffer.concat([readFileSync('.references/artifacts_mona.json'),Buffer.alloc(8*1024*1024,32)]);
    await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles({name:'recorded-export-with-whitespace.json',mimeType:'application/json',buffer:bytes});
    await expect(page.getByLabel('莫娜导入预览',{exact:true})).toContainText('新增 458 件');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0') ?? '{"artifacts":[]}').artifacts.length)).toBe(0);
    await page.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(458);
  });


  test('manual cultivation transcribes the recorded Amber and saves once before reopening details',async({page})=>{
    test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded cultivation.');
    // Recorded UID 618285856: Amber 90/6, C6, 10/10/10, Skyward Harp 90/6 R2.
    await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
    await dialog.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();
    const role=page.getByRole('dialog',{name:'安柏',exact:true});
    await expect(role.getByRole('button',{name:'保存',exact:true})).toBeEnabled();
    await role.getByRole('button',{name:'6命',exact:true}).click();await role.getByRole('button',{name:'更换武器',exact:true}).click();await role.getByLabel('搜索装备武器',{exact:true}).fill('天空之翼');await role.getByRole('button',{name:'天空之翼',exact:true}).click();await role.getByRole('button',{name:'精炼2阶',exact:true}).click();
    await role.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('dialog',{name:'安柏',exact:true})).toBeVisible();
    const characters=(await readDocument<LocalAccount>(page, 'account', (await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0')))!) ).characters;expect(characters).toHaveLength(1);expect(characters[0].build).toMatchObject({level:90,ascension:6,constellation:6,talents:{normal:10,skill:10,burst:10},weapon:{name:'天空之翼'},weaponLevel:90,weaponAscension:6,refinement:2});
  });

  test('an empty weapon slot survives save and reload and the open panel previews equip, unequip and restore', async ({ page }) => {
    const recording = '.references/enka/official-example.json';
    test.skip(!existsSync(recording), 'Requires the original Amber showcase.');
    const amber = JSON.parse(readFileSync(recording, 'utf8')).avatarInfoList.find((entry: { avatarId: number }) => entry.avatarId === 10000021);
    const bow = JSON.parse(readFileSync('src/game-data/data/weapons/skywardharp.json', 'utf8'));
    const bowAttack = bow.baseAttack * bow.attackCurve[90] + bow.promotion[6];
    // Recorded white ATK, removing only Skyward Harp. Both manual trials have Amber's 24% ascension stat and empty artifact slots.
    const attack = (withBow: boolean) => Math.round((amber.fightPropMap['4'] - (withBow ? 0 : bowAttack)) * 1.24).toLocaleString('zh-CN');
    const stored = () => page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'));
    await page.goto('/');
    await page.getByRole('button', { name: '手动添加角色', exact: true }).click();
    await page.getByLabel('搜索游戏角色', { exact: true }).fill('安柏');
    await page.getByRole('button', { name: '选择安柏', exact: true }).click();
    const role = page.getByRole('dialog', { name: '安柏', exact: true });
    const value = role.locator('[data-stat-value="attack"]');
    await role.getByRole('button', { name: '6命', exact: true }).click();
    await role.getByRole('button', { name: '展开面板', exact: true }).click();
    await expect(value).toHaveText(attack(false));
    await expect(role.locator('header')).not.toContainText('词条');
    await role.getByRole('button', { name: '保存', exact: true }).click();
    await expect(role.getByRole('button', { name: '选择安柏配置', exact: true })).toBeVisible();
    const saved = (await stored())!;
    const [local] = (await readDocument<LocalAccount>(page, 'account', saved)).characters;
    expect(local.build).toMatchObject({ weapon: null, constellation: 6, level: 90 });
    expect(Object.keys(JSON.parse(saved).content.weapons)).toHaveLength(0);
    await page.reload();
    await page.getByRole('button', { name: '查看安柏详情', exact: true }).click();
    await role.getByRole('button', { name: '展开面板', exact: true }).click();
    await expect(value).toHaveText(attack(false));
    const change = role.getByRole('button', { name: '更换武器', exact: true });
    const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
    const equip = async () => {
      await change.click();
      await weapons.getByLabel('搜索装备武器', { exact: true }).fill('天空之翼');
      await weapons.getByRole('button', { name: '天空之翼', exact: true }).click();
      await expect(value).toHaveText(attack(true));
    };
    await equip();
    await change.click();
    await weapons.getByRole('button', { name: '卸下', exact: true }).click();
    await expect(value).toHaveText(attack(false));
    await equip();
    await role.getByRole('button', { name: '还原', exact: true }).click();
    await expect(value).toHaveText(attack(false));
    expect(await stored()).toBe(saved);
    await role.getByRole('button', { name: '关闭安柏', exact: true }).click();
    await page.getByTestId('workspace-nav-team').click();
    await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
    const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
    await team.getByRole('button', { name: '选择队员1', exact: true }).click();
    await page.getByRole('button', { name: '选择安柏首选配置', exact: true }).click();
    await expect(team.locator('[data-slot="1"] .configuration-title')).toContainText('未配武器');
    await team.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '队伍详情', exact: true })).toBeVisible();
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-saved-teams-0.2.0')!));
    expect(snapshot.document[0].project.candidate.actors[0].build.weapon).toBeNull();
  });

  test('a showcase merge reuses all five scanned Vesna artifacts and their reference links from both views', async ({ page }) => {
    test.setTimeout(60000);
    const inventory = '.references/artifacts_mona.json', showcase = '.references/enka/uid-107590923.json';
    test.skip(!existsSync(inventory) || !existsSync(showcase), 'Requires the authorized inventory and showcase.');
    await page.route('**/api/enka/107590923', route => route.fulfill({ json: JSON.parse(readFileSync(showcase, 'utf8')) }));
    await page.goto('/');
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button', { name: '莫娜导入', exact: true }).click();
    await page.getByLabel('导入莫娜圣遗物文件', { exact: true }).setInputFiles(recordedJsonFile(inventory));
    await page.getByRole('button', { name: '确认导入 458 件圣遗物', exact: true }).click();
    await page.getByTestId('workspace-nav-characters').click();
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('107590923');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '清空选择', exact: true }).click();
    await page.getByRole('button', { name: '导入薇斯纳', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '圣遗物新增' })).toContainText('新增 0 件，匹配 5 件');
    await page.getByRole('button', { name: '确认导入 1 位角色', exact: true }).click();
    await page.getByRole('button', { name: '查看薇斯纳详情', exact: true }).click();
    const role = page.getByRole('dialog', { name: '薇斯纳', exact: true });
    const artifact = page.locator('.artifact-detail-dialog[open]');
    for (const view of ['本地','展柜']) {
      await role.getByRole('button', { name: view, exact: true }).click();
      await role.getByRole('button', { name: '查看生之花详情', exact: true }).click();
      const link = artifact.getByRole('group', { name: '角色', exact: true }).getByRole('button', { name: '薇斯纳', exact: true });
      await expect(link).toBeEnabled();
      await expect(artifact.getByRole('group', { name: '角色配置', exact: true }).getByRole('button')).toHaveCount(1);
      if (view === '展柜') {
        await link.click();
        await expect(artifact).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(link).toBeFocused();
      }
      await page.keyboard.press('Escape');
    }
    const saved = await readDocument<LocalAccount>(page, 'account', (await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0')))!);
    expect(saved.artifacts).toHaveLength(458);
    expect(saved.artifacts.find(item => item.id === saved.characters[0].equipment.flower)?.real?.source?.key).toBe('id:7356583031583997');
  });
});

test.describe('import-draft-regressions', () => {
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
});

test.describe('import-filter-consistency', () => {
  test.skip(!existsSync('.references/enka/official-example.json') || !existsSync('.references/artifacts_mona.json'),'Requires recorded showcase and Mona inventory.');

  test('fixed and percentage substats retain the same numeric column at desktop and narrow widths',async({page})=>{
    test.setTimeout(45000);await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    const account=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),id=account.characters.find((item:{name:string})=>item.name==='安柏').equipment.flower;
    const item=account.artifacts.find((item:{id:string})=>item.id===id);expect(item.real.substats.some((sub:{stat:string})=>['hp','attack','defense','elementalMastery'].includes(sub.stat))).toBe(true);expect(item.real.substats.some((sub:{stat:string})=>!['hp','attack','defense','elementalMastery'].includes(sub.stat))).toBe(true);
    await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'生之花',exact:true}).click();await page.locator(`.inventory-card[data-artifact-id="${id}"]`).click();const detail=page.locator('.artifact-detail-dialog');
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});await auditDialog(detail,'editor');const boxes=await detail.locator('.stat-value input').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,width:box.width};}));expect(Math.max(...boxes.map(box=>box.left))-Math.min(...boxes.map(box=>box.left))).toBeLessThan(.5);expect(Math.max(...boxes.map(box=>box.width))-Math.min(...boxes.map(box=>box.width))).toBeLessThan(.5);
      await expect(detail.locator('.stat-unit')).toHaveText(item.real.substats.map((sub:{stat:string})=>['hp','attack','defense','elementalMastery'].includes(sub.stat)?'':'%'));await page.screenshot({path:`artifacts/substat-unit-aligned-${width}.png`,fullPage:true});
    }
    for(let index=0;index<item.real.substats.length;index++){const sub=item.real.substats[index],value=Number((sub.value*(['hp','attack','defense','elementalMastery'].includes(sub.stat)?1:100)).toPrecision(12)),input=detail.getByLabel(`副词条 ${index+1} 数值`,{exact:true});await input.fill('');await input.pressSequentially(String(value));await expect(input).toHaveValue(String(value));}
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document)).toEqual(account);
  });

  test('Mona and showcase imports share readable typography and preserve their source colors',async({page})=>{
    test.setTimeout(45000);await page.setViewportSize({width:1440,height:1000});await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));await page.goto('/');const before=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await expect(page.getByRole('button',{name:'莫娜导入',exact:true})).toHaveCount(0);await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();const mona=page.getByRole('dialog',{name:'导入莫娜圣遗物',exact:true});await auditDialog(mona,'content');await expect(mona.locator('.import-intro')).toHaveCSS('font-size','16px');await expect(mona.locator('.import-intro')).toHaveCSS('color','rgb(40, 58, 54)');await expect(mona.locator('.import-field')).toHaveCSS('font-weight','700');await expect(mona.getByRole('button',{name:'选择莫娜文件',exact:true})).toHaveCSS('color','rgb(45, 96, 139)');await expect(mona.getByRole('button',{name:'选择莫娜文件',exact:true})).toHaveCSS('background-color','rgb(229, 240, 250)');await page.screenshot({path:'artifacts/import-shared-mona-entry.png',fullPage:true});await mona.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles({name:'artifacts_mona.json',mimeType:'application/json',buffer:readFileSync('.references/artifacts_mona.json')});await expect(mona.locator('.preview-item')).toHaveCount(6);await expect(mona.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true})).toHaveCSS('background-color','rgb(45, 96, 139)');await page.screenshot({path:'artifacts/import-shared-mona-preview.png',fullPage:true});await mona.getByLabel('搜索待导入圣遗物',{exact:true}).fill('没有匹配的实际套装');await expect(mona.getByRole('button',{name:'清除搜索',exact:true})).toHaveCSS('color','rgb(45, 96, 139)');await mona.getByRole('button',{name:'清除搜索',exact:true}).click();await mona.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'展柜导入',exact:true}).click();const enka=page.getByRole('dialog',{name:'从角色展柜导入',exact:true});await auditDialog(enka,'content');await expect(enka.locator('.import-intro')).toHaveCSS('font-size','16px');await expect(enka.locator('.import-intro')).toHaveCSS('color','rgb(40, 58, 54)');await expect(enka.locator('.import-field')).toHaveCSS('font-weight','700');await expect(enka.getByRole('button',{name:'查询角色展柜',exact:true})).toHaveCSS('border-color','rgb(100, 69, 138)');await expect(enka.getByRole('button',{name:'查询角色展柜',exact:true})).toHaveCSS('color','rgb(100, 69, 138)');await expect(enka.getByRole('button',{name:'查询角色展柜',exact:true})).toHaveCSS('background-color','rgb(239, 232, 248)');await enka.getByLabel('游戏 UID',{exact:true}).pressSequentially('618285856');await page.screenshot({path:'artifacts/import-shared-showcase-entry.png',fullPage:true});await enka.getByRole('button',{name:'查询角色展柜',exact:true}).click();await expect(enka.locator('.import-row')).toHaveCount(4);await expect(enka.getByRole('button',{name:'确认导入 4 位角色',exact:true})).toHaveCSS('background-color','rgb(100, 69, 138)');await page.setViewportSize({width:390,height:844});await auditDialog(enka,'content');await page.screenshot({path:'artifacts/import-shared-showcase-narrow.png',fullPage:true});await enka.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(before);
  });

  test('library filters share sections and triangle favorites; artifact levels remain multi-select',async({page})=>{
    test.setTimeout(45000);await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    for(const [tab,title] of [['characters','筛选角色'],['loadouts','筛选角色配置'],['combinations','筛选组合'],['artifacts','筛选圣遗物']]){
      await page.getByTestId('workspace-nav-'+tab).click();await page.locator('#workspace-main .library-toolbar').first().getByRole('button',{name:'筛选',exact:true}).click();const filter=page.getByRole('dialog',{name:title,exact:true});await auditDialog(filter,'filter');await expect(filter.locator('.filter-panel')).toHaveCSS('gap','20px');const headings=await filter.locator('.filter-panel h3').evaluateAll(nodes=>nodes.map(node=>({font:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight})));expect(headings.every(heading=>heading.font==='16px' && heading.weight==='700')).toBe(true);if(tab==='characters')expect(await filter.locator('.favorite-filter .favorite-mark').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-level')))).toEqual(['0','1','2','3']);await page.screenshot({path:`artifacts/filter-shared-${tab}.png`,fullPage:true});if(tab!=='artifacts')await page.keyboard.press('Escape');
    }
    const filter=page.getByRole('dialog',{name:'筛选圣遗物',exact:true}),levels=filter.getByRole('group',{name:'常用强化等级',exact:true});await expect(levels.getByRole('button')).toHaveText(['+16','+20']);await levels.getByRole('button',{name:'+20',exact:true}).click();await levels.getByRole('button',{name:'+16',exact:true}).click();await expect(levels.getByRole('button').first()).toHaveAttribute('aria-pressed','true');await expect(levels.getByRole('button').last()).toHaveAttribute('aria-pressed','true');const expected=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.filter((item:{real:{level:number}})=>[16,20].includes(item.real.level)).length);await expect(page.locator('#workspace-main .library-result-count')).toContainText(`${expected} 件圣遗物`);await filter.getByRole('button',{name:'重置筛选',exact:true}).click();expect(await filter.getByRole('group',{name:'圣遗物收藏等级',exact:true}).locator('.favorite-mark').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-level')))).toEqual(['0','1','2','3']);await filter.getByRole('group',{name:'圣遗物收藏等级',exact:true}).getByRole('button',{name:'1级收藏',exact:true}).click();await expect(page.locator('#workspace-main .inventory-card')).toHaveCount(0);await filter.getByRole('button',{name:'重置筛选',exact:true}).click();await page.setViewportSize({width:390,height:844});await filter.getByLabel('筛选强化等级',{exact:true}).click();const menu=filter.getByRole('group',{name:'筛选强化等级选项',exact:true});await menu.getByRole('button',{name:'+20',exact:true}).click();await filter.getByRole('button',{name:'完成选择',exact:true}).click();await auditDialog(filter,'filter');await filter.locator('.favorite-filter').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/filter-shared-artifacts-narrow.png',fullPage:true});await filter.getByLabel('筛选强化等级',{exact:true}).click();await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();await expect(filter).toBeVisible();await page.keyboard.press('Escape');await expect(filter).toHaveCount(0);
  });
});

test.describe('import-refinements', () => {
  test('catalog keeps traveler forms above the final Manekin group in either direction',async({page})=>{
    await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});
    await expect(dialog.locator('.catalog-browser-item').first()).toBeVisible();
    async function checkGroups(){
      const names=await dialog.locator('.catalog-browser-item strong').allTextContents();
      const firstTraveler=names.findIndex(name=>/^[空荧]（/.test(name));
      const firstManekin=names.findIndex(name=>name.startsWith('奇偶'));
      expect(firstTraveler).toBeGreaterThan(0);expect(firstManekin).toBeGreaterThan(firstTraveler);
      expect(names.slice(firstTraveler,firstManekin).every(name=>/^[空荧]（/.test(name))).toBe(true);
      expect(names.slice(firstManekin).every(name=>name.startsWith('奇偶'))).toBe(true);
      await dialog.locator('.catalog-browser-item').last().scrollIntoViewIfNeeded();
    }
    await checkGroups();await page.screenshot({path:'artifacts/character-special-groups.png'});
    await dialog.getByRole('button',{name:'排序',exact:true}).click();
    const sort=page.getByRole('dialog',{name:'角色排序',exact:true});
    await sort.getByRole('button',{name:'从低到高',exact:true}).click();
    await sort.getByRole('button',{name:'完成',exact:true}).click();await checkGroups();
    await dialog.getByLabel('搜索游戏角色',{exact:true}).pressSequentially('空');
    await expect(dialog.locator('.catalog-browser-item')).toHaveCount(7);
  });
});

test.describe('mona-import', () => {
  const inventory = '.references/artifacts_mona.json';
  test.skip(!existsSync(inventory),'Requires the actual recorded Mona file.');
  test('actual Mona import: bounded preview, cancellation, recovery and duplicate handling',async({page})=>{
    const original = recordedJsonFile(inventory);
    await page.setViewportSize({width:1280,height:900});await page.goto('/');
    await expect(page.locator('.nav-group[data-domain=account] .library-nav-icon')).toHaveCount(5);
    await page.getByTestId('workspace-nav-artifacts').click();
    const baseline=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'导入莫娜圣遗物',exact:true});
    await expect(dialog.getByRole('heading',{name:'导入莫娜圣遗物',exact:true})).toHaveCount(1);
    const file=dialog.getByLabel('导入莫娜圣遗物文件',{exact:true});
    // File inputs emit a bubbling cancel event when the native chooser is dismissed.
    await file.dispatchEvent('cancel', { bubbles: true });
    await expect(dialog).toBeVisible();
    await file.setInputFiles(original);
    const preview = dialog.getByLabel('莫娜导入预览', { exact: true });
    await expect(preview).toContainText('新增 458 件');
    await file.dispatchEvent('cancel', { bubbles: true });
    await expect(dialog).toBeVisible();
    await expect(preview).toContainText('新增 458 件');
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline);
    await expect(dialog.locator('.preview-item')).toHaveCount(6);
    // Source item 8770563143816081: HP flower, with these four observed substats.
    const first=dialog.locator('.preview-item').first();
    const firstId=await first.getAttribute('data-artifact-id');
    await expect(first.locator('.compact-main')).toHaveAttribute('data-stat','hp');
    await expect(first.locator('.artifact-level')).toHaveText('20');
    await expect(first.locator('.compact-entry b')).toHaveText(['5.8%', '11.0%', '10.9%', '17.9%']);
    await expect(dialog.getByLabel('导入结果汇总',{exact:true})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('搜索待导入圣遗物',{exact:true})).toBeFocused();
    const topPager=dialog.getByRole('navigation',{name:'顶部列表分页',exact:true});
    const bottomPager=dialog.getByRole('navigation',{name:'底部列表分页',exact:true});
    await topPager.getByRole('button',{name:'下一页',exact:true}).click();
    await expect(topPager.getByRole('spinbutton',{name:'顶部页码',exact:true})).toHaveValue('2');
    await expect(bottomPager.getByRole('spinbutton',{name:'底部页码',exact:true})).toHaveValue('2');
    await expect(first).not.toHaveAttribute('data-artifact-id',firstId!);
    const slots=dialog.getByRole('group',{name:'预览部位筛选',exact:true});
    await slots.getByRole('button',{name:'死之羽',exact:true}).click();
    await expect(dialog.locator('.library-result-count')).toContainText('92 件圣遗物');
    await expect(topPager.getByRole('spinbutton',{name:'顶部页码',exact:true})).toHaveValue('1');
    await expect(dialog.locator('.preview-item-name').first()).toContainText('死之羽');
    await slots.getByRole('button',{name:'全部',exact:true}).click();
    await expect(first).toHaveAttribute('data-artifact-id',firstId!);
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline);
    await dialog.getByLabel('搜索待导入圣遗物',{exact:true}).pressSequentially('琴');
    await expect(dialog.locator('.preview-item')).toHaveCount(5);
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({path:'artifacts/mona-import-preview.png',fullPage:false});
    await page.setViewportSize({width:390,height:844});
    await first.scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);
    const confirm=dialog.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true});
    await expect(confirm).toBeInViewport();
    await page.screenshot({path:'artifacts/mona-import-mobile.png',fullPage:false});
    await dialog.getByRole('button',{name:'取消',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline);
    await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
    // An invalid-input boundary derived by truncating the recorded file, not invented player data.
    const bytes = original.buffer;
    await file.setInputFiles({name:'truncated-mona.json',mimeType:'application/json',buffer:bytes.subarray(0,Math.floor(bytes.length/2))});
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByLabel('莫娜圣遗物 JSON',{exact:true}).fill(bytes.toString('utf8'));
    await dialog.getByRole('button',{name:'预览莫娜导入',exact:true}).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByLabel('莫娜导入预览',{exact:true})).toContainText('新增 458 件');
    await dialog.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    const imported=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    expect(JSON.parse(imported!).document.artifacts).toHaveLength(458);
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
    await file.setInputFiles(original);
    await expect(dialog.getByLabel('莫娜导入预览',{exact:true})).toContainText('已存在 458 件');
    await expect(dialog.getByRole('button',{name:'确认导入 0 件圣遗物',exact:true})).toBeDisabled();
    await page.screenshot({path:'artifacts/mona-import-duplicates.png',fullPage:false});
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(imported);
    await page.screenshot({path:'artifacts/library-nav-icons.png',fullPage:false});
  });
});

test.describe('showcase-inventory-status', () => {
  const source='.references/enka/official-example.json';
  test.use({hasTouch:true});
  test.skip(!existsSync(source),'Requires the recorded actual showcase.');

  test('compact showcase keeps inventory status after deletion and supports single-slot touch import from details',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(8000);await page.setViewportSize({width:1440,height:1000});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.getByRole('button',{name:'导入安柏',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 1 位角色',exact:true}).click();
    const showcase=await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters[0].showcase));
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
    const role=page.getByRole('dialog',{name:'安柏',exact:true}),grid=role.locator('.detail-artifacts .equipment-grid');
    await role.getByRole('button',{name:'展柜',exact:true}).click();
    await expect(grid.locator('[data-density="compact"]')).toHaveCount(5);await expect(grid.locator('.unstored-badge')).toHaveCount(0);
    await role.getByRole('button',{name:'保存组合',exact:true}).click();
    await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
    await role.getByRole('button',{name:'本地',exact:true}).click();await role.getByRole('button',{name:'应用组合',exact:true}).click();
    await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();
    await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();await role.getByRole('button',{name:'关闭安柏',exact:true}).click();
    await page.getByTestId('workspace-nav-artifacts').click();
    for(let index=0;index<5;index++){
      await page.locator('.inventory-card').first().click({button:'right'});await page.getByRole('menuitem',{name:'删除',exact:true}).click();
      await page.getByRole('dialog',{name:'删除圣遗物？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();
    }
    await expect(page.locator('.inventory-card')).toHaveCount(0);
    const equipment=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters[0].equipment);
    expect(Object.values(equipment)).toHaveLength(5);
    await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
    await expect(grid.locator('.unstored-badge')).toHaveCount(5);
    await role.getByRole('button',{name:'展柜',exact:true}).click();
    await expect(grid.locator('.unstored-badge')).toHaveCount(5);await expect(grid.locator('.artifact-wearers')).toHaveCount(0);
    await role.locator('.detail-artifacts').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/showcase-inventory-missing.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await role.getByRole('button',{name:'查看生之花详情',exact:true}).tap();
    const piece=page.locator('.artifact-detail-dialog');
    await piece.getByRole('button',{name:'入库',exact:true}).tap();
    await page.getByRole('dialog',{name:'入库圣遗物？',exact:true}).getByRole('button',{name:'入库',exact:true}).tap();
    await piece.getByRole('button',{name:/^关闭/}).tap();
    await page.setViewportSize({width:1440,height:1000});
    await expect(grid.locator('.unstored-badge')).toHaveCount(4);
    const flower=grid.locator('.artifact-item-card').first();await expect(flower.locator('.unstored-badge')).toHaveCount(0);
    await role.getByRole('button',{name:'本地',exact:true}).click();await expect(grid.locator('.unstored-badge')).toHaveCount(5);
    await role.getByRole('button',{name:'展柜',exact:true}).click();await page.screenshot({path:'artifacts/showcase-inventory-imported.png',fullPage:true});
    await role.getByRole('button',{name:'查看死之羽详情',exact:true}).click();const detail=page.locator('.artifact-detail-dialog');
    await expect(detail.locator('.unstored-badge')).toHaveText('未入库');await detail.getByRole('button',{name:/^关闭/}).click();
    expect(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters[0].showcase))).toBe(showcase);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters[0].equipment)).toEqual(equipment);
    await role.getByRole('button',{name:'关闭安柏',exact:true}).click();await page.reload();
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await role.getByRole('button',{name:'展柜',exact:true}).click();
    await expect(grid.locator('.unstored-badge')).toHaveCount(4);await expect(grid.locator('.artifact-item-card').first().locator('.unstored-badge')).toHaveCount(0);
    await page.setViewportSize({width:390,height:844});await role.locator('.detail-artifacts').scrollIntoViewIfNeeded();
    await page.screenshot({path:'artifacts/showcase-inventory-mobile.png',fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
  });
});

test.describe('create-and-dialogs', () => {
  const statNames:Record<string,string>={hp:'生命值（固定）',hpPercent:'生命值（比例）',attack:'攻击力（固定）',attackPercent:'攻击力（比例）',defense:'防御力（固定）',defensePercent:'防御力（比例）',elementalMastery:'元素精通',energyRecharge:'充能效率',critRate:'暴击率',critDamage:'暴击伤害',physicalBonus:'物理伤害加成',pyroBonus:'火元素伤害加成',hydroBonus:'水元素伤害加成',electroBonus:'雷元素伤害加成',anemoBonus:'风元素伤害加成',cryoBonus:'冰元素伤害加成',dendroBonus:'草元素伤害加成',geoBonus:'岩元素伤害加成',healingBonus:'治疗加成'};
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded four-character showcase.');
  test('manual artifact transcribes recorded gear, derives its name, shares fields and has one red cancel per phase',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(8000);await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),piece=initial.artifacts.find((item:{slot:string})=>item.slot==='goblet'),setName=piece.name.split(' · ')[0];await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'手动添加圣遗物',exact:true}).click();const form=page.getByRole('dialog',{name:'手动添加圣遗物',exact:true});await auditDialog(form,'content');await expect(form.getByLabel('圣遗物名称',{exact:true})).toHaveCount(0);await expect(form).not.toContainText('录入五星实物词条');await expect(form.locator('.sub-row')).toHaveCount(4);const fields=await form.locator('.artifact-identity-fields > *').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));expect(fields[0].left).toBeLessThan(fields[1].left);expect(Math.abs(fields[0].top-fields[1].top)).toBeLessThan(1);
    await form.getByRole('button',{name:'选择套装',exact:true}).click();const sets=page.getByRole('dialog',{name:'选择套装',exact:true});await auditDialog(sets,'content');await sets.getByLabel('搜索套装',{exact:true}).fill(setName);await sets.getByRole('button',{name:setName,exact:true}).click();await form.getByLabel('部位',{exact:true}).click();await form.getByRole('group',{name:'部位选项',exact:true}).getByRole('button',{name:'空之杯',exact:true}).click();const level=form.getByLabel('强化等级',{exact:true});await level.fill('');await level.pressSequentially(String(piece.real.level));await form.getByLabel('主词条',{exact:true}).click();await form.getByRole('group',{name:'主词条选项',exact:true}).getByRole('button',{name:statNames[piece.real.mainStat],exact:true}).click();
    for(let index=0;index<piece.real.substats.length;index++){const sub=piece.real.substats[index];await form.getByLabel(`副词条 ${index+1}`,{exact:true}).click();await form.getByRole('group',{name:`副词条 ${index+1}选项`,exact:true}).getByRole('button',{name:statNames[sub.stat],exact:true}).click();const input=form.getByLabel(`副词条 ${index+1} 数值`,{exact:true}),percent=!['hp','attack','defense','elementalMastery'].includes(sub.stat);await input.pressSequentially(String(Number((sub.value*(percent?100:1)).toPrecision(12))));}
    await form.getByLabel('圣遗物别名',{exact:true}).pressSequentially('安柏杯');await expect(form.getByRole('button',{name:'取消',exact:true})).toHaveCount(1);await expect(form.getByRole('button',{name:'取消',exact:true})).toHaveCSS('color','rgb(151, 71, 53)');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(initial.artifacts.length);await page.screenshot({path:'artifacts/manual-artifact-shared-fields.png',fullPage:true});await page.setViewportSize({width:390,height:844});await auditDialog(form,'content');await page.screenshot({path:'artifacts/manual-artifact-narrow.png',fullPage:true});await form.getByRole('button',{name:'预览词条',exact:true}).click();await expect(form).not.toContainText('录入五星实物词条');await expect(form.getByRole('button',{name:'取消',exact:true})).toHaveCount(1);await expect(form.getByRole('button',{name:'取消',exact:true})).toHaveCSS('color','rgb(151, 71, 53)');await auditDialog(form,'content');await form.getByRole('button',{name:'返回修改',exact:true}).click();await expect(form.locator('.sub-row')).toHaveCount(4);await form.getByRole('button',{name:'预览词条',exact:true}).click();await form.getByRole('button',{name:'确认入库',exact:true}).click();await expect(form).toHaveCount(0);const account=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),saved=account.artifacts.find((item:{alias?:string})=>item.alias==='安柏杯');expect(account.artifacts.length).toBe(initial.artifacts.length+1);expect(saved.name).toBe(piece.name);expect(saved.real.mainStat).toBe(piece.real.mainStat);expect(saved.real.substats.map(({stat,value}:{stat:string;value:number})=>({stat,value}))).toEqual(piece.real.substats.map(({stat,value}:{stat:string;value:number})=>({stat,value})));
  });
  test('four library primary actions match; imports, selectors, filters, sorts and confirmations share centered headers',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(7000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await auditDialog(role,'editor');await role.getByRole('button',{name:'删除',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'清除本地配装？',exact:true});await auditDialog(confirmation,'confirm');await expect(confirmation.getByRole('button',{name:'取消',exact:true})).toHaveCSS('color','rgb(151, 71, 53)');await confirmation.getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    const boxes=[];for(const tab of ['characters','artifacts','team','combinations']){await page.getByTestId('workspace-nav-'+tab).click();const main=page.locator('#workspace-main'),tools=main.locator('.library-toolbar').first();boxes.push(await tools.locator('.library-primary-action').evaluate(node=>{const b=node.getBoundingClientRect();return {width:b.width,height:b.height,right:b.right,top:b.top+scrollY};}));await tools.getByRole('button',{name:'筛选',exact:true}).click();await auditDialog(page.getByRole('dialog').last(),'filter');await page.keyboard.press('Escape');await tools.getByRole('button',{name:'排序',exact:true}).click();await auditDialog(page.getByRole('dialog').last(),'filter');await page.keyboard.press('Escape');}
    for(const key of ['height','right','top'] as const)expect(Math.max(...boxes.map(box=>box[key]))-Math.min(...boxes.map(box=>box[key]))).toBeLessThan(.5);expect(boxes[0].height).toBe(40);await expect(page.getByRole('button',{name:'导出组合',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'新建组合',exact:true}).click();const combo=page.getByRole('dialog',{name:'新建组合',exact:true});await auditDialog(combo,'editor');await combo.getByRole('button',{name:'选择参考角色',exact:true}).click();const reference=page.getByRole('dialog',{name:'选择参考角色',exact:true});await auditDialog(reference,'content');await page.setViewportSize({width:390,height:844});await auditDialog(reference,'content');await page.keyboard.press('Escape');await auditDialog(combo,'editor');await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});await page.getByTestId('workspace-nav-loadouts').click();await expect(page.getByRole('button',{name:'前往角色库',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'选择角色',exact:true}).click();await auditDialog(page.getByRole('dialog',{name:'选择角色',exact:true}),'content');await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-characters').click();
    for(const [button,title] of [['莫娜导入','导入莫娜圣遗物'],['展柜导入','从角色展柜导入'],['手动添加','手动添加角色']]){await page.getByTestId(button==='莫娜导入'?'workspace-nav-artifacts':'workspace-nav-characters').click();await page.getByRole('button',{name:button,exact:true}).click();const modal=page.getByRole('dialog',{name:title,exact:true});await auditDialog(modal,'content');await expect(modal.getByRole('button',{name:'取消',exact:true})).toHaveCount(1);await expect(modal.getByRole('button',{name:'取消',exact:true})).toHaveCSS('color','rgb(151, 71, 53)');if(button==='手动添加'){await modal.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await modal.getByRole('button',{name:'选择安柏',exact:true}).click();const editor=page.getByRole('dialog',{name:'安柏',exact:true});await expect(editor.getByRole('button',{name:'返回角色列表',exact:true})).toHaveCSS('height','32px');await auditDialog(editor,'editor');await editor.getByRole('button',{name:'返回角色列表',exact:true}).click();}await modal.getByRole('button',{name:'取消',exact:true}).click();}expect(errors).toEqual([]);
  });
});

test.describe('unsaved-actions', () => {
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
  const account=(page:Page)=>page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));

  test('empty and occupied pickers center titles; role exit continues, rejects failed saves, saves or discards',async({page})=>{
    await page.setViewportSize({width:1440,height:1000});await importShowcase(page);const original=await account(page);
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});
    const badges=role.locator('.constellation-number');await expect(badges).toHaveCount(7);expect(await badges.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)'))).toBe(true);
    const imported=await readDocument<LocalAccount>(page,'account',original!);
    const flowerId=imported.characters.find(entry=>entry.name==='安柏')!.equipment.flower;
    await role.getByRole('button',{name:'查看生之花详情',exact:true}).press('Shift+F10');
    await page.getByRole('menuitem',{name:'卸下',exact:true}).click();
    await role.getByRole('button',{name:'装备生之花',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择生之花',exact:true});await centered(picker);
    await picker.locator(`.inventory-card:not([data-artifact-id="${flowerId}"])`).first().click();
    await role.getByRole('button',{name:'替换生之花',exact:true}).click();await centered(picker);await page.screenshot({path:'artifacts/unsaved-picker-centered.png',fullPage:true});const remove=await picker.getByRole('button',{name:'卸下',exact:true}).boundingBox();expect(remove!.width).toBe(64);expect(remove!.height).toBe(32);
    await page.setViewportSize({width:390,height:844});await centered(picker);await page.screenshot({path:'artifacts/unsaved-picker-centered-mobile.png',fullPage:true});await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});
    await page.keyboard.press('Escape');await expect(warning(page).getByRole('button',{name:'保存',exact:true})).toBeVisible();await expect(warning(page).getByRole('button',{name:'放弃修改',exact:true})).toBeVisible();await page.screenshot({path:'artifacts/unsaved-three-actions.png',fullPage:true});await warning(page).getByRole('button',{name:'继续编辑',exact:true}).click();await expect(role.getByRole('button',{name:'查看生之花详情',exact:true})).toBeVisible();expect(await account(page)).toBe(original);
    // A controlled storage failure on the real imported account must retain the same draft.
    await page.evaluate(()=>{const prototype=Storage.prototype as Storage & {originalSetItem?:Storage['setItem']};prototype.originalSetItem=prototype.setItem;prototype.setItem=function(key,value){if(key.startsWith('leyline-account'))throw new Error('test storage unavailable');prototype.originalSetItem!.call(this,key,value);};});
    await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(role).toBeVisible();await expect(role.locator('[role=alert]').first()).toBeVisible();expect(await account(page)).toBe(original);
    await page.evaluate(()=>{const prototype=Storage.prototype as Storage & {originalSetItem?:Storage['setItem']};prototype.setItem=prototype.originalSetItem!;delete prototype.originalSetItem;});
    await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(role).toHaveCount(0);const saved=await account(page);expect(saved).not.toBe(original);
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await role.getByRole('button',{name:'替换生之花',exact:true}).click();await picker.getByRole('button',{name:'卸下',exact:true}).click();await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'放弃修改',exact:true}).click();await expect(role).toHaveCount(0);expect(await account(page)).toBe(saved);
  });

  test('artifact exit validation keeps draft; Save persists then closes',async({page})=>{
    await importShowcase(page);await page.getByTestId('workspace-nav-artifacts').click();await page.locator('.inventory-card').first().click();const detail=page.locator('.artifact-detail-dialog'),value=detail.locator('.sub-row input').first(),initial=await value.inputValue(),before=await account(page);
    await value.fill('');await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(detail).toBeVisible();await expect(detail.getByText('请核对强化等级与词条数值。',{exact:true})).toBeVisible();expect(await account(page)).toBe(before);
    await value.fill(initial);await detail.getByLabel('圣遗物别名',{exact:true}).fill('界面别名试改');await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(detail).toHaveCount(0);expect((await readDocument<LocalAccount>(page, 'account', (await account(page))!)).artifacts.some((item:{alias?:string})=>item.alias==='界面别名试改')).toBe(true);
  });

  test('manual Save on return records actual Amber and returns to the same character list',async({page})=>{
    await page.goto('/');await page.getByRole('button',{name:'手动添加角色',exact:true}).click();const dialog=page.getByRole('dialog',{name:'手动添加角色',exact:true});await dialog.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await dialog.getByRole('button',{name:'选择安柏',exact:true}).click();const editor=page.getByRole('dialog',{name:'安柏',exact:true});await editor.getByRole('button',{name:'6命',exact:true}).click();await editor.getByRole('button',{name:'更换武器',exact:true}).click();await editor.getByLabel('搜索装备武器',{exact:true}).fill('天空之翼');await editor.getByRole('button',{name:'天空之翼',exact:true}).click();await editor.getByRole('button',{name:'精炼2阶',exact:true}).click();
    await editor.getByRole('button',{name:'返回角色列表',exact:true}).click();await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(dialog.getByLabel('搜索游戏角色',{exact:true})).toBeVisible();await expect(dialog.getByLabel('搜索游戏角色',{exact:true})).toHaveValue('安柏');await expect(page.getByRole('dialog',{name:'安柏',exact:true})).toHaveCount(0);expect((await readDocument<LocalAccount>(page, 'account', (await account(page))!)).characters[0].build).toMatchObject({constellation:6,weapon:{name:'天空之翼'},refinement:2});
  });

  test('showcase Save on exit still requires import confirmation; cancel retains draft and writes nothing',async({page})=>{
    await importShowcase(page,false);await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();const editor=page.getByRole('dialog',{name:'保存组合',exact:true});const before=await account(page);
    await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'入库并保存组合？',exact:true});await expect(confirmation).toBeVisible();expect(await account(page)).toBe(before);await confirmation.getByRole('button',{name:'取消',exact:true}).click();await expect(editor).toBeVisible();expect(await account(page)).toBe(before);
    await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await confirmation.getByRole('button',{name:'保存组合',exact:true}).click();await expect(editor).toHaveCount(0);expect((await readDocument<LocalAccount>(page, 'account', (await account(page))!)).artifacts).toHaveLength(5);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!))).toHaveLength(1);await expect(role).toBeVisible();
  });

  test('team candidate Save on exit persists only the project and follows the requested close',async({page})=>{
    await importShowcase(page);const before=await account(page);
    // A UI-format project built from the recorded public snapshot, not a player project export.
    const project=await page.evaluate(async raw=>{
      const [{previewEnkaImport},{createAccount},{createEmptyProject},{addActorFromBuild},{packDocument}]=await Promise.all([
        // @ts-expect-error Vite browser URL.
        import('/src/domain/enka-import.ts'),
        // @ts-expect-error Vite browser URL.
        import('/src/domain/account.ts'),
        // @ts-expect-error Vite browser URL.
        import('/src/domain/workbench-project.ts'),
        // @ts-expect-error Vite browser URL.
        import('/src/domain/real-project.ts'),
        // @ts-expect-error Vite browser URL.
        import('/src/domain/content-document.ts'),
      ]);
      const preview=await previewEnkaImport(raw,'618285856',createAccount());
      const recorded=preview.rows.find((row:{character:{name:string}})=>row.character.name==='安柏').character.showcase.build;
      const result=createEmptyProject();addActorFromBuild(result,recorded,'安柏');return packDocument('axis',result);
    },JSON.parse(readFileSync(recorded,'utf8')));
    await page.getByTestId('workspace-nav-timeline').click();
    await page.getByLabel('导入轴项目文件',{exact:true}).setInputFiles({name:'recorded-showcase-ui-harness.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await page.getByTestId('workspace-nav-analysis').click();
    await page.getByRole('button',{name:'调整候选配装',exact:true}).click();
    await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'修改所选队员配装',exact:true});
    // Explicit refinement trial from the recorded R2 weapon, without claiming a new observation.
    await editor.getByRole('button',{name:'精炼3阶',exact:true}).click();await page.keyboard.press('Escape');await warning(page).getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);expect(await account(page)).toBe(before);
    await page.getByRole('button',{name:'查看与修改配装',exact:true}).click();await expect(editor.getByRole('button',{name:'精炼3阶',exact:true})).toHaveAttribute('aria-pressed','true');
  });
});

test.describe('current-format', () => {
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
});
