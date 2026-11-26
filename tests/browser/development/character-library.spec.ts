import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readDocument } from '../../helpers/browser-document';
import { type LocalAccount, type Project } from '@leyline/schema';
import { prepareRecordedAmberConfiguration } from '../../helpers/recorded-amber-configuration';
import { chooseConfigurationRole } from '../../helpers/choose-configuration-role';

test.describe('character-cards', () => {
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
  async function expectPortraitAlignment(page:import('@playwright/test').Page) {
    const issues=await page.locator('.character-card').evaluateAll(cards=>cards.flatMap(card=>{
      const name=card.querySelector('.character-card-header > strong')!.getBoundingClientRect();
      const sets=card.querySelector('.card-sets')!.getBoundingClientRect();
      const portrait=card.querySelector('.card-portraits > .characters')!.getBoundingClientRect();
      const weapon=card.querySelector('.card-weapon')!.getBoundingClientRect();
      const weaponBadge=card.querySelector('.card-weapon .rank-badge')!;
      const centerX=(box:DOMRect)=>box.left+box.width/2;
      const centerY=(box:DOMRect)=>box.top+box.height/2;
      const errors:string[]=[];
      if([sets,weapon].some(box=>Math.abs(centerY(box)-centerY(portrait))>.5))errors.push('Portraits lack a shared horizontal center');
      if(Math.abs(centerX(name)-centerX(portrait))>.5 || Math.abs(centerX(sets)+centerX(weapon)-2*centerX(portrait))>.5)errors.push('Portraits lack a centered character column');
      if(sets.right>portrait.left || portrait.right>weapon.left || Math.abs(sets.width-weapon.width)>.5)errors.push('Equipment frames overlap or have different sizes');
      const tiles=Array.from(card.querySelectorAll('.card-set'));
      const paired=card.querySelector('.card-sets')!.classList.contains('paired');
      for(const [index,tile] of tiles.entries()){
        const box=tile.getBoundingClientRect(), badge=tile.querySelector('.set-badge')!;
        const badgeBox=badge.getBoundingClientRect();
        const size=paired?sets.width/2:sets.width;
        if(Math.abs(box.left-sets.left-index*size)>.5 || Math.abs(box.top-sets.top-index*size)>.5 || Math.abs(box.width-size)>.5)errors.push('Set images are out of position');
        if(Math.abs(badgeBox.top-box.top)>.5 || Math.abs(badgeBox.left-box.left)>.5)errors.push('Set badge is out of its upper-left corner');
        if(getComputedStyle(badge).fontSize!==getComputedStyle(weaponBadge).fontSize || badgeBox.height!==weaponBadge.getBoundingClientRect().height)errors.push('Set badge and refinement badge have different sizes');
      }
      return errors;
    }));
    expect(issues).toEqual([]);
  }
  test.skip(!existsSync(source), 'Requires the recorded actual public Enka showcase; no synthetic substitute.');

  test('Character cards preserve actual showcase set composition and source isolation', async ({ page }) => {
    const raw = JSON.parse(await readFile(source, 'utf8'));
    await page.route('**/api/enka/618285856', route => route.fulfill({ json: raw }));
    await page.goto('/');
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button',{name:'仅保存展柜',exact:true}).click();
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
    await expectPortraitAlignment(page);
    await expect.poll(() => page.locator('.card-set img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(0);
    await page.screenshot({ path: 'artifacts/character-card-redesign-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expectStatusAlignment(page);
    await expectPortraitAlignment(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'artifacts/character-card-redesign-narrow.png', fullPage: true });
    await page.setViewportSize({ width: 360, height: 844 });
    await expectStatusAlignment(page);
    await expectPortraitAlignment(page);
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
    const beforeEdit = await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'));
    await page.getByRole('button', { name:'降低普攻', exact:true }).click();
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(beforeEdit);
    await page.getByRole('dialog').getByRole('button', { name:'保存', exact:true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name:'保存', exact:true })).toBeDisabled();
    const savedCharacter = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((entry:{name:string}) => entry.name==='安柏'));
    expect(savedCharacter.build.talents.normal).toBe(9);
    expect(savedCharacter.showcase.build.talents.normal).toBe(10);
    await page.screenshot({ path: 'artifacts/character-card-detail-narrow.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: 'artifacts/character-card-detail-desktop.png', fullPage: true });
    const savedAccount = await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'));
    await page.getByRole('button',{name:'降低普攻',exact:true}).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog',{name:'有未保存的修改',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'继续编辑',exact:true}).click();
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(savedAccount);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'放弃修改',exact:true}).click();
    await expect(card).toBeFocused();
    await card.click();
    await expect(page.getByRole('button',{name:'有效词条攻击力',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('group',{name:'有效词条',exact:true}).getByRole('button')).toHaveCount(7);
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.getByRole('button',{name:'确认清除',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true})).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(savedAccount);
    await page.getByRole('dialog').getByRole('button',{name:'还原',exact:true}).click();
    await page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true}).click();
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.getByRole('dialog',{name:'清除展柜信息？',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true})).toBeVisible();
    await page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true}).click();
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.getByRole('button',{name:'确认清除',exact:true}).click();
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(savedAccount);
    await expect(page.getByRole('dialog',{name:'安柏',exact:true}).getByRole('button',{name:'展柜',exact:true})).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
    const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((entry:{name:string})=>entry.name==='安柏'));
    expect(cleared.showcase).toBeUndefined();
    expect(cleared.build.talents.normal).toBe(9);
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'清除本地配装？',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'确认清除',exact:true}).click();
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).not.toBeNull();
    await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
    const localCleared = await page.evaluate(() => JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((entry:{name:string})=>entry.name==='安柏'));
    expect(localCleared).toBeUndefined();
    await expect(card).toHaveCount(0);
    await expect(page.getByLabel('搜索账号角色',{exact:true})).toBeFocused();
  });


  test('clearing preferred promotes a real saved alternative, then removes the last source',async({page})=>{
    const raw=JSON.parse(await readFile(source,'utf8'));
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:raw}));await page.goto('/');
    await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
    await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'仅保存展柜',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
    const card=page.getByRole('button',{name:'查看安柏详情',exact:true});await card.click();
    const role=page.getByRole('dialog',{name:'安柏',exact:true});
    await role.getByRole('button',{name:'精炼3阶',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();
    await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();await page.getByRole('dialog',{name:'安柏的配置',exact:true}).getByRole('button',{name:'选择安柏首选配置',exact:true}).click();
    await role.getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByRole('dialog',{name:'清除本地配装？',exact:true})).toContainText('备选接替首选');
    await page.getByRole('button',{name:'确认清除',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();
    const promoted=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((item:{name:string})=>item.name==='安柏'));
    expect(promoted.build.refinement).toBe(3);expect(promoted.showcase.build.refinement).toBe(2);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-character-loadouts-0.2.0')!).document.length)).toBe(0);
    await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认清除',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();
    await expect(role).toBeVisible();await expect(role.getByRole('button',{name:'展柜',exact:true})).toHaveCount(0);
    await role.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认清除',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();
    await expect(card).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();await expect(page.locator('.character-card')).toHaveCount(3);await expect(card).toHaveCount(0);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(0);
  });
});

test.describe('character-definition', () => {
  test('recorded Xingqiu candidate retains custom metadata through cultivation editing', async ({ page }) => {
    const source = '.references/enka/official-example.json';
    test.skip(!existsSync(source), 'Requires the recorded public showcase; no synthetic substitute.');
    await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
    await page.goto('/');
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '清空选择', exact: true }).click();
    await page.getByRole('button', { name: '导入行秋', exact: true }).click();
    await page.getByRole('button', { name: '确认导入 1 位角色', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Confirmed import-and-merge already equips the selected character; no independent combination is created.
    const account = await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'));
    const imported = await readDocument<LocalAccount>(page, 'account', account!);
    const recorded = JSON.parse(readFileSync(source, 'utf8')).avatarInfoList.find((avatar: { avatarId: number }) => avatar.avatarId === 10000025);
    const importedCharacter = imported.characters.find(character => character.build?.character.id === 'xingqiu')!;
    expect(Object.keys(importedCharacter.equipment)).toHaveLength(recorded.equipList.filter((item: { reliquary?: unknown }) => item.reliquary).length);
    for (const id of Object.values(importedCharacter.equipment)) expect(imported.artifacts.some((artifact: { id: string }) => artifact.id === id)).toBe(true);
    await page.getByTestId('workspace-nav-timeline').click();
    await page.getByRole('button', { name: '前往队伍', exact: true }).click();
    await page.getByRole('button', { name: '从账号选择队员', exact: true }).click();
    await page.getByRole('dialog', { name: '从账号选择队员', exact: true }).getByRole('button').filter({ has: page.getByText('行秋', { exact: true }) }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Apply a custom copy of the actual showcase build as a current-format axis file.
    const content = await page.evaluate(async () => {
      const [{ useAxisWorkspaceStore }, { applyCharacterDefinition, copyCharacterDefinition }, { packDocument }] = await Promise.all([
        // @ts-expect-error Vite browser source URL.
        import('/src/stores/axis-workspace.ts'),
        // @ts-expect-error Vite browser source URL.
        import('/src/domain/character-definition.ts'),
        // @ts-expect-error Vite browser source URL.
        import('/src/domain/content-document.ts'),
      ]);
      const axis = useAxisWorkspaceStore();
      const { character, dataVersion } = axis.actor!.build!;
      const next = applyCharacterDefinition(axis.project, axis.actorId, copyCharacterDefinition(character, dataVersion));
      return JSON.stringify(packDocument('axis', next));
    });
    await page.getByTestId('workspace-nav-timeline').click();
    const timeline = page.getByRole('region', { name: '时间轴', exact: true });
    const file = timeline.getByLabel('导入轴项目文件', { exact: true });
    await file.setInputFiles({ name: 'recorded-showcase-custom-axis.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(timeline.getByRole('group', { name: '时间轴队员' })).toContainText('行秋 · 自定义');

    const axisName = timeline.getByLabel('轴名称', { exact: true });
    await axisName.pressSequentially('行秋试配');
    const download = page.waitForEvent('download');
    await timeline.getByRole('button', { name: '保存轴', exact: true }).click();
    const saved = readFileSync((await (await download).path())!, 'utf8');
    expect((await readDocument<Project>(page, 'axis', saved)).name).toBe('行秋试配');
    await timeline.getByText('更多', { exact: true }).click();
    await timeline.getByRole('button', { name: '新建空轴', exact: true }).click();
    await expect(page.getByRole('region', { name: '队伍', exact: true })).toContainText('还没有队员');
    await page.getByTestId('workspace-nav-timeline').click();
    await file.setInputFiles({ name: 'recorded-showcase-custom-axis.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
    await expect(axisName).toHaveValue('行秋试配');
    const recovered = async () => {
      const text = await page.evaluate(() => localStorage.getItem('leyline-axis-recovery-0.2.0'));
      return text ? (await readDocument<{ project: Project }>(page, 'axis-recovery', text)).project : undefined;
    };
    const before = await readDocument<Project>(page, 'axis', saved);
    expect(before.candidate.actors[0].build!.character.id).toMatch(/^custom-/);
    await page.getByTestId('workspace-nav-analysis').click();
    await page.getByRole('button', { name: '调整候选配装', exact: true }).click();
    await page.getByRole('button', { name: '查看与修改配装', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '修改所选队员配装', exact: true });
    // A declared candidate trial, not a claim about the player's original refinement.
    const refinement = before.candidate.actors[0].build!.refinement === 1 ? 2 : 1;
    await editor.getByRole('button', { name: `精炼${refinement}阶`, exact: true }).click();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    const after = (await recovered())!;
    expect(after.candidate.actors[0].build!.character).toEqual(before.candidate.actors[0].build!.character);
    expect(after.candidate.actors[0].build!.refinement).toBe(refinement);
    expect(after.candidate.actors[0].build!.artifacts).toEqual(before.candidate.actors[0].build!.artifacts);
    expect(await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0'))).toBe(account);

    // Record a hit for the UI round-trip without supplying unrecorded combat conditions.
    await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-timeline').click();
    await timeline.getByRole('button', { name: '伤害层', exact: true }).click();
    await timeline.locator('.skill-palette').getByRole('button', { name: /古华剑·画雨笼山/ }).click();
    await timeline.getByRole('button', { name: '在光标处记录伤害点', exact: true }).click();
    const record = timeline.locator('.desk-record.damage').last();
    await record.hover();
    await expect(record).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await page.getByTestId('workspace-nav-analysis').click();
    const analysis = page.getByRole('region', { name: '逐点贡献', exact: true });
    const target = analysis.getByRole('checkbox', { name: /^目标 / });
    await expect(target).toBeChecked();
    await target.uncheck();
    await expect(target).not.toBeChecked();
    const row = analysis.locator('.analysis-row');
    const details = row.getByRole('button', { name: /^分析定位 / });
    await target.hover();
    await expect(row).not.toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await details.hover();
    await expect(row).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await details.click();
    await expect(timeline.getByRole('complementary', { name: '所选记录详情' })).toContainText('古华剑·画雨笼山');
  });
});

test.describe('character-favorites', () => {
  const source='.references/enka/official-example.json';
  test.skip(!existsSync(source),'Requires the recorded public showcase.');
  test('real showcase: character favorites persist, filter and sort independently of equipment',async({page})=>{
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
    await page.goto('/');
    await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
    await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
    const iconTreatments=await page.locator('.character-card .level-badge').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor===getComputedStyle(node.parentElement!).backgroundColor && getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)'));
    expect(iconTreatments).toBe(true);
    expect(await page.locator('.character-card .element-badge').first().evaluate(node=>getComputedStyle(node).filter)).toContain('drop-shadow');
    const baseline=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    await page.getByRole('button',{name:'查看甘雨详情',exact:true}).click();
    const role=page.getByRole('dialog',{name:'甘雨',exact:true});
    const favorite=role.getByRole('button',{name:'设置甘雨收藏',exact:true});
    for(const level of [1,2,3]) { await favorite.click();await expect(favorite).toHaveAttribute('aria-description',`${level}级收藏`); }
    await expect(role.getByRole('button',{name:'设为首选',exact:true})).toHaveCount(0);
    const alignment=await role.evaluate(node=>{
      const header=node.querySelector('header')!.getBoundingClientRect(),title=node.querySelector('header h2')!.getBoundingClientRect();
      return {horizontal:Math.abs((header.left+header.right)-(title.left+title.right))/2,vertical:Math.abs((header.top+header.bottom)-(title.top+title.bottom))/2};
    });
    expect(alignment.horizontal).toBeLessThan(.5);expect(alignment.vertical).toBeLessThanOrEqual(.5);
    const picker=role.getByRole('button',{name:'选择甘雨配置',exact:true});
    await expect(picker).toHaveText(/词条/);
    await expect(picker).toHaveAttribute('title', (await picker.innerText()).trim());
    await expect(picker.locator('span')).toHaveCSS('text-overflow', 'ellipsis');
    expect(await picker.evaluate(button => button.getBoundingClientRect().width)).toBeLessThanOrEqual(240);
    await expect(page.locator('.character-card-open')).toHaveCount(0);
    for(const width of [900,760,390]) {
      await page.setViewportSize({width,height:900});
      await expect.poll(()=>role.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);
      const centered=await role.evaluate(node=>{const header=node.querySelector('header')!.getBoundingClientRect(),title=node.querySelector('header h2')!.getBoundingClientRect();return Math.abs((header.left+header.right)-(title.left+title.right))/2;});
      expect(centered).toBeLessThan(.5);
      const overlap=await role.locator('header').evaluate(header=>{
        const boxes=Array.from(header.querySelectorAll('.character-header-tools,.configuration-title,.configuration-title-button,.character-favorite,.ui-close')).map(node=>node.getBoundingClientRect());
        return boxes.flatMap((a,i)=>boxes.flatMap((b,j)=>i<j && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1 ? [{i,j,a:a.toJSON(),b:b.toJSON()}] : []));
      });
      expect(overlap,`width ${width}`).toEqual([]);
    }
    await page.screenshot({path:'artifacts/character-header-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});
    await role.getByRole('button',{name:'展柜',exact:true}).click();
    await expect(role.getByRole('button',{name:'展柜',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:'artifacts/character-header-switch.png',fullPage:true});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await page.getByRole('button',{name:'设置安柏收藏',exact:true}).click();await page.keyboard.press('Escape');
    await expect(page.locator('.character-card-header > strong')).toHaveText(['甘雨','班尼特','行秋','安柏']);
    const decoration=await page.getByRole('button',{name:'查看甘雨详情',exact:true}).evaluate(card=>{const title=card.querySelector('.character-card-header > strong')!.getBoundingClientRect(),image=card.querySelector('.card-portraits > .characters')!.getBoundingClientRect(),favorite=card.querySelector('.card-favorite')!.getBoundingClientRect();return {center:Math.abs((title.left+title.right)-(image.left+image.right))/2,right:favorite.left>=title.right};});
    expect(decoration.center).toBeLessThan(.5);expect(decoration.right).toBe(true);
    await page.screenshot({path:'artifacts/character-favorites-home.png',fullPage:true});
    for(const width of [390,360]) {
      await page.setViewportSize({width,height:844});
      const geometry=await page.getByRole('button',{name:'查看甘雨详情',exact:true}).evaluate(card=>{const header=card.querySelector('.character-card-header')!.getBoundingClientRect(),name=card.querySelector('.character-card-header > strong')!.getBoundingClientRect(),favorite=card.querySelector('.card-favorite')!.getBoundingClientRect();return {center:Math.abs((header.left+header.right)-(name.left+name.right))/2,right:favorite.left>=name.right,contained:favorite.right<=header.right};});
      expect(geometry.center).toBeLessThan(.5);expect(geometry.right).toBe(true);expect(geometry.contained).toBe(true);
    }
    await page.screenshot({path:'artifacts/character-favorites-home-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});
    await page.getByRole('button',{name:'排序',exact:true}).click();const sortWidth=await page.getByRole('dialog',{name:'角色排序',exact:true}).evaluate(node=>node.getBoundingClientRect().width);await expect(page.getByRole('button',{name:'收藏等级',exact:true})).toHaveCSS('font-size','16px');await page.getByRole('button',{name:'收藏等级',exact:true}).click();await page.getByRole('button',{name:'从低到高',exact:true}).click();await expect(page.locator('.character-card').last()).toHaveAttribute('aria-label','查看甘雨详情');await page.getByRole('button',{name:'从高到低',exact:true}).click();await page.screenshot({path:'artifacts/character-sort-redesign.png',fullPage:true});await page.getByRole('dialog',{name:'角色排序',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
    await expect(page.locator('.character-card').first()).toHaveAttribute('aria-label','查看甘雨详情');
    await expect(page.locator('.character-card').nth(1)).toHaveAttribute('aria-label','查看安柏详情');
    await page.getByRole('button',{name:/^筛选/}).click();const filterDialog=page.getByRole('dialog',{name:'筛选角色',exact:true});expect(await filterDialog.evaluate(node=>node.getBoundingClientRect().width)).toBe(sortWidth);expect(sortWidth).toBeLessThanOrEqual(562);await expect(filterDialog.getByRole('region')).toHaveCount(4);await expect(filterDialog.getByRole('region',{name:'武器类型',exact:true}).locator('.weapons')).toHaveCount(5);await page.screenshot({path:'artifacts/character-filter-redesign.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await filterDialog.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);const overflow=await filterDialog.locator('.filter-options button').evaluateAll(nodes=>nodes.filter(node=>node.scrollWidth>node.clientWidth).map(node=>node.textContent));expect(overflow).toEqual([]);await page.screenshot({path:'artifacts/character-filter-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});for(const label of ['重置筛选','完成']) {await expect(filterDialog.getByRole('button',{name:label,exact:true})).toHaveCSS('width','104px');await expect(filterDialog.getByRole('button',{name:label,exact:true})).toHaveCSS('height','40px');await expect(filterDialog.getByRole('button',{name:label,exact:true})).toHaveCSS('font-size','16px');}const filter=page.getByRole('region',{name:'收藏',exact:true});
    await filter.getByRole('button',{name:'3级收藏',exact:true}).click();await page.getByRole('button',{name:'完成',exact:true}).click();
    await expect(page.locator('.character-card')).toHaveCount(1);
    await page.reload();await page.getByRole('button',{name:'查看甘雨详情',exact:true}).click();
    await expect(page.getByRole('button',{name:'设置甘雨收藏',exact:true})).toHaveAttribute('aria-description','3级收藏');
    await page.getByRole('button',{name:'设置甘雨收藏',exact:true}).click();
    await expect(page.getByRole('button',{name:'设置甘雨收藏',exact:true})).toHaveAttribute('aria-description','未收藏');
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline);
  });

  test('preferred and alternate configurations keep separate ratings across sorting, filtering and promotion', async ({ page }) => {
    await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
    await page.goto('/');
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
    const nav = page.getByTestId('workspace-nav-loadouts');
    await nav.click();
    const first = page.getByRole('button', { name: '查看安柏首选配置', exact: true });
    const alternate = page.getByRole('button', { name: '查看安柏备选配置', exact: true });
    const role = page.getByRole('dialog', { name: '安柏', exact: true });
    const rating = role.getByRole('button', { name: '设置配置收藏', exact: true });
    await first.click();
    await rating.click();
    // Try the recorded loadout with its flower removed, preserving the five-piece preferred configuration.
    await role.getByRole('button', { name: '替换生之花', exact: true }).click();
    await page.getByRole('dialog', { name: '选择生之花' }).getByRole('button', { name: '卸下', exact: true }).click();
    await role.getByRole('button', { name: '另存', exact: true }).click();
    await page.getByRole('button', { name: '确认另存', exact: true }).click();
    await expect(rating).toHaveAccessibleDescription('未收藏');
    await rating.click();
    await rating.click();
    await role.getByRole('button', { name: '关闭安柏', exact: true }).click();
    await page.reload();
    await nav.click();
    const rows = page.locator('.configuration-cards > article');
    const preferredRow = rows.filter({ has: first });
    const alternateRow = rows.filter({ has: alternate });
    await expect(preferredRow.getByRole('img', { name: '1级收藏' })).toBeVisible();
    await expect(alternateRow.getByRole('img', { name: '2级收藏' })).toBeVisible();
    await page.getByRole('button', { name: '排序', exact: true }).click();
    const sort = page.getByRole('dialog', { name: '配置排序' });
    await sort.getByRole('button', { name: '收藏等级', exact: true }).click();
    await sort.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows.first()).toHaveAttribute('data-preset-id', /.+/);
    await page.getByRole('button', { name: '排序', exact: true }).click();
    await sort.getByRole('button', { name: '从低到高', exact: true }).click();
    await sort.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows.last()).toHaveAttribute('data-preset-id', /.+/);
    await page.getByRole('button', { name: '筛选', exact: true }).click();
    const filter = page.getByRole('dialog', { name: '筛选角色配置' });
    await filter.getByRole('button', { name: '2级收藏', exact: true }).click();
    await filter.getByRole('button', { name: '完成', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(alternate).toBeVisible();
    await page.getByRole('button', { name: '清除筛选和排序条件', exact: true }).click();
    await first.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: '已是首选' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await first.click();
    const switchButton = role.getByRole('button', { name: '选择安柏配置', exact: true });
    await switchButton.press('Shift+F10');
    await expect(page.getByRole('menuitem', { name: '已是首选' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await switchButton.click();
    const chooser = page.getByRole('dialog', { name: '安柏的配置' });
    const selected = chooser.locator('article[data-current="true"]');
    await expect(selected).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    expect(await selected.evaluate(node => {
      const style = getComputedStyle(node);
      return style.borderLeftColor === style.borderRightColor && style.borderLeftColor === style.borderBottomColor &&
        style.borderLeftColor !== style.borderTopColor;
    })).toBe(true);
    await expect(selected.getByText('当前', { exact: true })).toHaveCount(0);
    await chooser.screenshot({ path: 'artifacts/character-configuration-choice.png' });
    await page.setViewportSize({ width: 360, height: 844 });
    const alternateCard = chooser.locator('article[data-preset-id]:not([data-preset-id=""])');
    const popupName = alternateCard.locator('.configuration-name');
    await expect(popupName).toHaveCSS('text-overflow', 'ellipsis');
    expect(await popupName.evaluate(node => node.clientWidth < node.scrollWidth && node.clientWidth <= 240)).toBe(true);
    await expect(alternateCard.locator('.configuration-open')).toHaveAttribute('title', await popupName.innerText());
    expect(await chooser.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const pinBounds = (await alternateCard.locator('.preferred-pin').boundingBox())!;
    const cardBounds = (await alternateCard.boundingBox())!;
    expect(pinBounds.x + pinBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width);
    await chooser.screenshot({ path: 'artifacts/character-configuration-choice-mobile.png' });
    await selected.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: '已是首选' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 900 });
    const chooseAlternate = chooser.getByRole('button', { name: '选择安柏备选配置', exact: true });
    const pin = (container: typeof role) => container.getByRole('button', { name: '设安柏此配置为首选', exact: true });
    await pin(chooser).hover();
    await expect(pin(chooser)).toHaveCSS('color', 'rgb(36, 107, 88)');
    await expect(pin(chooser)).toHaveCSS('background-color', 'rgb(229, 244, 237)');
    await chooseAlternate.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '设为首选' }).click();
    await expect(chooser).toHaveCount(0);
    await expect(rating).toHaveAccessibleDescription('2级收藏');
    await switchButton.click();
    await pin(chooser).click();
    await expect(chooser).toHaveCount(0);
    await expect(rating).toHaveAccessibleDescription('1级收藏');
    await switchButton.click();
    await chooseAlternate.click();
    for (const width of [1280, 760, 360]) {
      await page.setViewportSize({ width, height: 844 });
      const favoriteBox = (await rating.boundingBox())!, pinBox = (await pin(role).boundingBox())!, switchBox = (await switchButton.boundingBox())!;
      expect(favoriteBox.x + favoriteBox.width).toBeLessThanOrEqual(pinBox.x + 1);
      expect(pinBox.x + pinBox.width).toBeLessThanOrEqual(switchBox.x + 1);
      expect(Math.abs(pinBox.y + pinBox.height / 2 - switchBox.y - switchBox.height / 2)).toBeLessThan(1);
      expect(switchBox.width).toBeLessThanOrEqual(240);
    }
    expect(await switchButton.locator('span').evaluate(node => node.clientWidth < node.scrollWidth)).toBe(true);
    await role.locator('header').screenshot({ path: 'artifacts/character-configuration-header.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await role.getByRole('button', { name: '选择安柏配置' }).press('Shift+F10');
    await page.getByRole('menuitem', { name: '设为首选' }).click();
    await expect(pin(role)).toHaveCount(0);
    await expect(rating).toHaveAccessibleDescription('2级收藏');
    // Promote twice from the detail header, returning to the two-star preferred configuration.
    for (const level of [1, 2]) {
      await switchButton.click();
      await chooseAlternate.click();
      await pin(role).click();
      await expect(pin(role)).toHaveCount(0);
      await expect(rating).toHaveAccessibleDescription(`${level}级收藏`);
    }
    await role.getByRole('button', { name: '关闭安柏', exact: true }).click();
    await expect(preferredRow.getByRole('img', { name: '2级收藏' })).toBeVisible();
    await expect(alternateRow.getByRole('img', { name: '1级收藏' })).toBeVisible();
    await page.getByRole('button', { name: '筛选', exact: true }).click();
    await filter.getByRole('button', { name: '2级收藏', exact: true }).click();
    await filter.getByRole('button', { name: '完成', exact: true }).click();
    await first.click();
    await rating.click();
    await role.getByRole('button', { name: '关闭安柏', exact: true }).click();
    await expect(rows).toHaveCount(0);
    await expect(page.getByLabel('搜索角色配置', { exact: true })).toBeFocused();
    await page.getByTestId('workspace-nav-characters').click();
    const amber = page.getByRole('button', { name: '查看安柏详情', exact: true });
    await expect(amber.locator('.card-favorite')).toHaveAttribute('aria-label', '3级收藏');
    await page.reload();
    await expect(amber.locator('.card-favorite')).toHaveAttribute('aria-label', '3级收藏');
    await amber.click();
    await role.getByRole('button', { name: '设置安柏收藏' }).click();
    await role.getByRole('button', { name: '关闭安柏' }).click();
    await nav.click();
    await expect(preferredRow.locator('.configuration-favorite')).toHaveCount(0);
    await alternate.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '设为首选' }).click();
    await expect(preferredRow.getByRole('img', { name: '1级收藏' })).toBeVisible();
    await page.getByTestId('workspace-nav-characters').click();
    await expect(amber.locator('.card-favorite')).toHaveAttribute('aria-label', '1级收藏');
  });
});

test.describe('character-filters', () => {
  const source = '.references/enka/official-example.json';
  test.skip(!existsSync(source), 'Requires the saved actual Enka example showcase.');

  test('actual showcase: element shortcuts, combined selections and separate sorting', async ({ page }) => {
    test.setTimeout(90000); // Full cultivation and manual re-entry walkthrough across two viewport sizes.
    await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
    await page.goto('/');
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '仅保存展柜', exact: true }).click();
    await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
    await page.keyboard.press('Escape');
    const account = async () => readDocument<LocalAccount>(page, 'account', (await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0')))!);
    const cards = page.locator('.character-card-header > strong');
    const shortcuts = page.getByRole('group', { name: '按元素筛选' });
    await expect(cards).toHaveText(['甘雨', '班尼特', '行秋', '安柏']);
    await page.getByRole('button', { name: /^筛选/ }).click();
    const rarity = page.getByRole('dialog', { name: '筛选角色' }).getByRole('region', { name: '星级' });
    await rarity.getByRole('button', { name: '五星', exact: true }).click();
    await page.getByRole('dialog', { name: '筛选角色' }).getByRole('button', { name: '完成', exact: true }).click();
    await expect(cards).toHaveText(['甘雨']);
    await page.getByRole('button', { name: /^筛选/ }).click();
    await rarity.getByRole('button', { name: '四星', exact: true }).click();
    await page.getByRole('dialog', { name: '筛选角色' }).getByRole('button', { name: '完成', exact: true }).click();
    await expect(cards).toHaveCount(4);
    await shortcuts.getByRole('button', { name: '全部元素', exact: true }).click();
    await page.getByRole('button', { name: '排序', exact: true }).click();
    await page.getByRole('dialog', { name: '角色排序' }).getByRole('button', { name: '名称', exact: true }).click();
    await page.getByRole('dialog',{name:'角色排序',exact:true}).getByRole('button',{name:'完成',exact:true}).click();

    await expect(shortcuts.locator('.elements')).toHaveCount(7);
    await shortcuts.getByRole('button', { name: '火元素', exact: true }).click();
    await expect(cards).toHaveText(['安柏', '班尼特']);
    await shortcuts.getByRole('button', { name: '冰元素', exact: true }).click();
    await expect(cards).toHaveText(['安柏', '班尼特', '甘雨']);
    await page.getByRole('button', { name: /^筛选/ }).click();
    const dialog = page.getByRole('dialog', { name: '筛选角色' });
    const elements = dialog.getByRole('region', { name: '元素', exact: true });
    await expect(elements.getByRole('button', { name: '火', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await elements.getByRole('button', { name: '水', exact: true }).click();
    const weapons = dialog.getByRole('region', { name: '武器类型' });
    await weapons.getByRole('button', { name: '单手剑', exact: true }).click();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(cards).toHaveText(['班尼特', '行秋']);
    await page.getByRole('button', { name: /^筛选/ }).click();
    await weapons.getByRole('button', { name: '弓', exact: true }).click();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(cards).toHaveCount(4);
    await page.getByRole('button', { name: '排序', exact: true }).click();
    await page.getByRole('dialog', { name: '角色排序' }).getByRole('button', { name: '等级', exact: true }).click();
    await page.getByRole('dialog',{name:'角色排序',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
    await shortcuts.getByRole('button', { name: '全部元素', exact: true }).click();
    await expect(cards).toHaveCount(4);
    await page.getByRole('button', { name: '排序', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '角色排序' }).getByRole('button', { name: '等级', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '查看甘雨详情', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '甘雨', exact: true });
    await expect(detail.locator('header h2')).toHaveText('甘雨');
    await detail.getByRole('button',{name:'选择甘雨配置',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'甘雨的配置',exact:true}).getByRole('heading',{level:3})).toContainText('0.0词条|未配圣遗物|阿莫斯之弓');
    await page.keyboard.press('Escape');
    await expect(detail.locator('.cultivation-group legend')).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '展开面板', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(detail.locator('.character-stats')).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '本地', exact: true })).toHaveAttribute('aria-pressed','true');
    await expect(detail.getByLabel('角色等级', { exact: true })).toHaveAttribute('aria-disabled','false');
    await detail.getByRole('button', { name: '本地', exact: true }).click();
    await expect(detail.getByLabel('角色等级', { exact: true })).toHaveAttribute('aria-disabled','false');
    const beforePanel=await detail.locator('.character-cultivation > .characters').evaluate(node=>node.getBoundingClientRect().left);
    await detail.getByRole('button', { name: '展开面板', exact: true }).click();
    await expect(detail.locator('.character-stats')).toBeVisible();
    expect(await detail.locator('.character-cultivation > .characters').evaluate(node=>node.getBoundingClientRect().left)).toBeCloseTo(beforePanel,1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name:'查看班尼特详情',exact:true }).click();
    const bennett=page.getByRole('dialog',{name:'班尼特',exact:true});
    const skill=bennett.locator('.character-form:visible [data-talent="skill"] input'), burst=bennett.locator('.character-form:visible [data-talent="burst"] input');
    await expect(skill).toHaveValue('11');await expect(burst).toHaveValue('13');
    await bennett.getByRole('button',{name:'0命',exact:true}).click();await expect(skill).toHaveValue('8');await expect(burst).toHaveValue('10');
    await bennett.getByRole('button',{name:'3命',exact:true}).click();await expect(skill).toHaveValue('11');await expect(burst).toHaveValue('10');
    await bennett.getByRole('button',{name:'提高战技',exact:true}).click();await expect(skill).toHaveValue('12');
    await bennett.getByRole('button',{name:'降低战技',exact:true}).click();await expect(skill).toHaveValue('11');
    await bennett.getByLabel('角色等级',{exact:true}).click();await bennett.getByRole('button',{name:'角色等级 80突破',exact:true}).click();await expect(bennett.getByLabel('角色等级',{exact:true})).toContainText('80突破');
    await bennett.getByRole('button',{name:'还原',exact:true}).click();await expect(bennett.getByLabel('角色等级',{exact:true})).toContainText('90');await expect(burst).toHaveValue('13');
    await bennett.getByRole('button',{name:'0命',exact:true}).click();await bennett.getByRole('button',{name:'保存',exact:true}).click();
    await expect(bennett.getByRole('button',{name:'0命',exact:true})).toHaveAttribute('aria-pressed','true');
    await bennett.getByRole('button',{name:'展柜',exact:true}).click();await expect(bennett.getByRole('button',{name:'6命',exact:true})).toHaveAttribute('aria-pressed','true');await expect(burst).toHaveValue('13');
    await bennett.getByRole('button',{name:'本地',exact:true}).click();await expect(burst).toHaveValue('10');
    await bennett.getByRole('button',{name:'展柜',exact:true}).click();
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'查看班尼特详情',exact:true}).click();
    await expect(bennett.getByRole('button',{name:'本地',exact:true})).toHaveAttribute('aria-pressed','true');
    await bennett.getByRole('button',{name:'精炼2阶',exact:true}).click();
    await expect(bennett.getByRole('button',{name:'精炼2阶',exact:true})).toHaveAttribute('aria-pressed','true');
    await bennett.getByLabel('角色等级',{exact:true}).click();
    const levelMenu=bennett.locator('.character-cultivation .level-menu');
    await expect(levelMenu.getByText('自定义等级',{exact:true})).toBeVisible();
    await expect(levelMenu.getByRole('button',{name:'角色等级 1',exact:true})).toHaveCount(0);
    await bennett.getByRole('button',{name:'角色等级 95',exact:true}).click();await bennett.getByRole('button',{name:'保存',exact:true}).click();
    const { character } = (await account()).characters.find(entry => entry.name === '班尼特')!.build!;
    const expectedHp = (level: number) => Math.round(character.attributes.base.hp * character.progression.curves.hp[level] + character.progression.promotion[6].hp).toLocaleString('zh-CN');
    await bennett.getByRole('button',{name:'展开面板',exact:true}).click();await expect(bennett.locator('[data-stat-value="hp"]')).toHaveText(expectedHp(95));
    await bennett.getByLabel('角色等级',{exact:true}).click();await bennett.getByRole('button',{name:'提高自定义角色等级',exact:true}).click();await expect(bennett.getByLabel('自定义角色等级',{exact:true})).toHaveValue('100');
    await expect(bennett.locator('[data-stat-value="hp"]')).toHaveText(expectedHp(100));
    expect((await account()).characters.find(entry => entry.name === '班尼特')!.build!.level).toBe(95);
    await bennett.getByRole('button',{name:'保存',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((entry:{name:string})=>entry.name==='班尼特').build.level)).toBe(100);
    await page.setViewportSize({width:900,height:460});
    await bennett.evaluate(node => {
      const header=node.querySelector('header')!.getBoundingClientRect();
      const badge=node.querySelector('.character-cultivation .level-badge')!.getBoundingClientRect();
      node.scrollTop+=badge.top-header.top-header.height/2;
    });
    await expect.poll(() => bennett.evaluate(node => {
      const badge=node.querySelector('.character-cultivation .level-badge')!.getBoundingClientRect();
      return node.querySelector('header')!.contains(document.elementFromPoint(badge.left+badge.width/2,badge.top+badge.height/2));
    })).toBe(true);
    await page.setViewportSize({width:390,height:860});
    await page.screenshot({path:'artifacts/cultivation-refined-mobile.png',fullPage:true});
    await expect.poll(() => bennett.evaluate(node => node.scrollWidth<=node.clientWidth)).toBe(true);
    // Re-enter the recorded actual showcase cultivation through the manual-add flow.
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:1440,height:1080});
    await page.getByRole('button', { name: '展柜导入', exact: true }).click();
    await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
    await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
    await page.getByRole('button', { name: '全选', exact: true }).click();
    await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
    const recorded = (await account()).characters.find(entry => entry.name === '班尼特')!;
    const original = recorded.showcase!.build;
    await page.getByRole('button', { name: '查看班尼特详情', exact: true }).click({button:'right'});
    await page.getByRole('menuitem', { name: '彻底删除', exact: true }).click();
    await page.getByRole('dialog', { name: '彻底删除角色？' }).getByRole('button', { name: '彻底删除', exact: true }).click();
    await page.getByRole('button',{name:'手动添加',exact:true}).click();
    const adding=page.getByRole('dialog',{name:'手动添加角色',exact:true});
    await adding.getByLabel('搜索游戏角色',{exact:true}).fill('班尼特');await adding.getByRole('button',{name:'选择班尼特',exact:true}).click();
    for(const key of ['normal','skill','burst'] as const)await bennett.locator(`[data-talent="${key}"] input`).fill(String(original.talents[key]));
    await bennett.getByRole('button',{name:'更换武器',exact:true}).click();await bennett.getByLabel('搜索装备武器',{exact:true}).fill(original.weapon.name);await bennett.locator('.catalog-browser-options').getByRole('button',{name:original.weapon.name,exact:true}).click();
    await bennett.getByRole('button',{name:`${original.constellation}命`,exact:true}).click();
    for (const [slot, label] of [['flower','生之花'],['plume','死之羽'],['sands','时之沙'],['goblet','空之杯'],['circlet','理之冠']] as const) {
      await bennett.getByRole('button', { name: `装备${label}`, exact: true }).click();
      await page.getByRole('dialog', { name: `选择${label}`, exact: true }).locator(`[data-artifact-id="${recorded.equipment[slot]}"]`).click();
    }
    await bennett.getByRole('button', { name: '查看生之花详情', exact: true }).click();
    const flower = page.locator('.artifact-detail-dialog[open]');
    const alias = flower.getByLabel('圣遗物别名', { exact: true });
    await alias.fill('');
    await alias.pressSequentially('班尼特生之花');
    await flower.getByRole('button', { name: '保存', exact: true }).click();
    await flower.getByRole('button', { name: /^关闭/ }).click();
    await expect(bennett.getByRole('button', { name: '替换生之花', exact: true })).toBeVisible();
    expect((await account()).characters.some(entry => entry.name === '班尼特')).toBe(false);
    expect((await account()).artifacts.find(item => item.id === recorded.equipment.flower)?.alias).not.toBe('班尼特生之花');
    await bennett.getByRole('button',{name:'保存',exact:true}).click();
    expect((await account()).characters.find(entry => entry.name === '班尼特')!.equipment).toEqual(recorded.equipment);
    expect((await account()).artifacts.find(item => item.id === recorded.equipment.flower)?.alias).toBe('班尼特生之花');
    await expect(page.getByRole('dialog',{name:'班尼特',exact:true})).toBeVisible();
    const manual = (await account()).characters.find(entry => entry.name === '班尼特')!.build!;
    expect({id:manual.character.id,level:manual.level,ascension:manual.ascension,constellation:manual.constellation,talents:manual.talents,weapon:manual.weapon?.id,weaponLevel:manual.weaponLevel,refinement:manual.refinement}).toEqual({id:original.character.id,level:original.level,ascension:original.ascension,constellation:original.constellation,talents:original.talents,weapon:original.weapon.id,weaponLevel:original.weaponLevel,refinement:original.refinement});
    await page.screenshot({path:'artifacts/cultivation-manual-add.png',fullPage:true});


  });
});

test.describe('character-menu', () => {
  test('recorded role context menu: view, cancel, failed deletion rollback and complete removal',async({page})=>{
    test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');test.setTimeout(60000);
    await page.setViewportSize({width:1280,height:900});await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    const imported=page.getByRole('dialog',{name:'从角色展柜导入',exact:true});
    await expect(imported.locator('.import-row')).toHaveCount(4);
    const geometry=await imported.locator('.import-row').evaluateAll(rows=>rows.map(row=>({top:row.getBoundingClientRect().top,image:row.querySelector('.characters')!.getBoundingClientRect().width,text:row.querySelector('.showcase-portrait > strong')?.textContent?.trim()})));
    expect(geometry.slice(0,3).every(row=>row.top===geometry[0].top)).toBe(true);expect(geometry.every(row=>row.image===104)).toBe(true);expect(geometry.map(row=>row.text)).toEqual(['安柏','班尼特','甘雨','行秋']);await page.screenshot({path:'artifacts/showcase-three-column-preview.png',fullPage:true});
    await imported.getByRole('button',{name:'同时导入本地库',exact:true}).click();await imported.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
    const card=page.getByRole('button',{name:'查看安柏详情',exact:true});await card.click();const role=page.getByRole('dialog',{name:'安柏',exact:true});await role.getByRole('button',{name:'设置安柏收藏',exact:true}).click();await role.getByRole('button',{name:'有效词条生命值',exact:true}).click();
    await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();const editor=page.getByRole('dialog',{name:'保存组合',exact:true});
    const layout=await editor.evaluate(node=>{const reference=node.querySelector('.effective-reference')!,label=reference.querySelector('span')!.getBoundingClientRect(),button=reference.querySelector('button')!.getBoundingClientRect(),heading=node.querySelector('.combination-rolls h3')!.getBoundingClientRect(),rolls=node.querySelector('.effective-roll-summary')!.getBoundingClientRect();return {sameRow:Math.abs((label.top+label.bottom)/2-(button.top+button.bottom)/2),gap:rolls.top-heading.bottom};});expect(layout.sameRow).toBeLessThan(1);expect(layout.gap).toBe(8);await page.screenshot({path:'artifacts/combination-reference-inline.png',fullPage:true});await editor.getByRole('button',{name:'保存',exact:true}).click();
    await role.getByRole('button',{name:'本地',exact:true}).click();await role.getByRole('button',{name:'应用组合',exact:true}).click();await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    // A transparent trial from the same recorded build, changing only the equipped flower.
    await role.getByRole('button',{name:'替换生之花',exact:true}).click();await page.getByRole('dialog',{name:'选择生之花',exact:true}).getByRole('button',{name:'卸下',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await page.keyboard.press('Escape');
    await card.click({button:'right'});const menu=page.getByRole('menu',{name:'角色操作',exact:true});await expect(menu.getByRole('menuitem')).toHaveText(['查看详情','彻底删除']);await page.screenshot({path:'artifacts/character-context-menu.png',fullPage:true});await menu.getByRole('menuitem',{name:'查看详情',exact:true}).click();await expect(role).toBeVisible();await page.keyboard.press('Escape');
    const baseline=await page.evaluate(()=>({account:localStorage.getItem('leyline-account-0.2.0'),loadouts:localStorage.getItem('leyline-character-loadouts-0.2.0'),favorites:localStorage.getItem('leyline-character-favorites-0.2.0'),effective:localStorage.getItem('leyline-effective-stats-0.2.0'),combos:localStorage.getItem('leyline-artifact-combinations-0.2.0')}));
    await card.click({button:'right'});await menu.getByRole('menuitem',{name:'彻底删除',exact:true}).click();const confirm=page.getByRole('dialog',{name:'彻底删除角色？',exact:true});await confirm.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline.account);
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='leyline-account-0.2.0'){Storage.prototype.setItem=original;throw new Error('recorded account write boundary');}return original.call(this,key,value);};});
    await card.click({button:'right'});await menu.getByRole('menuitem',{name:'彻底删除',exact:true}).click();await confirm.getByRole('button',{name:'彻底删除',exact:true}).click();await expect(card).toBeVisible();
    const failed=await page.evaluate(()=>({account:localStorage.getItem('leyline-account-0.2.0'),loadouts:localStorage.getItem('leyline-character-loadouts-0.2.0'),favorites:localStorage.getItem('leyline-character-favorites-0.2.0'),effective:localStorage.getItem('leyline-effective-stats-0.2.0'),combos:localStorage.getItem('leyline-artifact-combinations-0.2.0')}));expect(failed).toEqual(baseline);
    await card.click({button:'right'});await menu.getByRole('menuitem',{name:'彻底删除',exact:true}).click();await confirm.getByRole('button',{name:'彻底删除',exact:true}).click();await expect(card).toHaveCount(0);
    const after=await page.evaluate(()=>({account:JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document,loadouts:JSON.parse(localStorage.getItem('leyline-character-loadouts-0.2.0')!).document,favorites:JSON.parse(localStorage.getItem('leyline-character-favorites-0.2.0')!),effective:JSON.parse(localStorage.getItem('leyline-effective-stats-0.2.0')!),combos:localStorage.getItem('leyline-artifact-combinations-0.2.0')}));const original=JSON.parse(baseline.account!).document,removed=original.characters.find((character:{name:string})=>character.name==='安柏');
    expect(after.account.characters).toHaveLength(3);expect(after.account.artifacts).toEqual(original.artifacts);expect(after.loadouts.some((item:{characterId:string})=>item.characterId===removed.id)).toBe(false);expect(after.favorites[`${original.id}/${removed.id}`]).toBeUndefined();expect(after.effective[`${original.id}/${removed.id}`]).toBeUndefined();expect(after.combos).toBe(baseline.combos);
    await page.reload();await expect(card).toHaveCount(0);
  });
});

test.describe('character-tools-shared', () => {
  const path='.references/enka/official-example.json';
  test.skip(!existsSync(path),'Requires the recorded four-character showcase.');
  test('owned and catalog character pickers share controls while keeping data and filters independent',async({page})=>{
    await page.setViewportSize({width:1440,height:1000});await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(path,'utf8'))}));await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await expect(page.locator('.character-cards > button')).toHaveCount(4);
    await page.getByRole('button',{name:'筛选',exact:true}).click();const filter=page.getByRole('dialog',{name:'筛选角色',exact:true});await filter.getByRole('region',{name:'星级',exact:true}).getByRole('button',{name:'四星',exact:true}).click();await filter.getByRole('button',{name:'完成',exact:true}).click();await expect(page.locator('.character-cards > button')).toHaveCount(3);await expect(page.getByRole('button',{name:'查看安柏详情',exact:true})).toBeVisible();await page.getByRole('button',{name:'清除筛选和排序条件',exact:true}).click();
    await page.getByTestId('workspace-nav-team').click();
    await page.locator('.team-library .library-toolbar').getByRole('button', { name: '新建队伍', exact: true }).click();
    await page.getByRole('button', { name: '选择队员1', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
    await expect(picker.locator('.configuration-row')).toHaveCount(4);
    await picker.getByRole('group', { name: '角色资料来源' }).getByRole('button', { name: '全部角色', exact: true }).click();
    const metrics = await picker.locator('.library-toolbar').evaluate(node => ({
      inputHeight: node.querySelector('input')!.getBoundingClientRect().height,
      inputFont: getComputedStyle(node.querySelector('input')!).fontSize,
      filterFont: getComputedStyle(node.querySelector('.library-filter')!).fontSize,
    }));
    await picker.getByRole('button', { name: '筛选', exact: true }).click();
    await filter.getByRole('region', { name: '武器类型', exact: true }).getByRole('button', { name: '弓', exact: true }).click();
    await filter.getByRole('button', { name: '完成', exact: true }).click();
    await expect(picker.getByRole('button', { name: '选择安柏', exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: '选择行秋', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-characters').click();
    await expect(page.locator('.character-cards > button')).toHaveCount(4);
    await page.getByRole('button',{name:'手动添加',exact:true}).click();const catalog=page.getByRole('dialog',{name:'手动添加角色',exact:true});expect(await catalog.locator('.library-toolbar').evaluate(node=>({inputHeight:node.querySelector('input')!.getBoundingClientRect().height,inputFont:getComputedStyle(node.querySelector('input')!).fontSize,filterFont:getComputedStyle(node.querySelector('.library-filter')!).fontSize}))).toEqual(metrics);await catalog.getByRole('button',{name:'筛选',exact:true}).click();await expect(filter.getByRole('region',{name:'收藏',exact:true})).toHaveCount(0);await filter.getByRole('region',{name:'星级',exact:true}).getByRole('button',{name:'四星',exact:true}).click();await filter.getByRole('region',{name:'武器类型',exact:true}).getByRole('button',{name:'弓',exact:true}).click();await filter.getByRole('button',{name:'完成',exact:true}).click();await catalog.getByLabel('搜索游戏角色',{exact:true}).fill('安柏');await expect(catalog.getByRole('button',{name:'选择安柏',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.character-cards > button')).toHaveCount(4);
  });
});

test.describe('configuration-browser', () => {
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');
  test('configurations paginate by row, open in place, compare inside details, and clear safely',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(10000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1920,height:1080});const role=await prepareRecordedAmberConfiguration(page);
    // Five explicit UI trials vary recorded C6 cultivation; they are not claimed player configurations.
    for(const rank of [5,4,3,2,1]){
      await role.getByRole('button',{name:`${rank}命`,exact:true}).click();
      await role.getByRole('button',{name:'另存',exact:true}).click();
      const save=page.getByRole('dialog',{name:'另存角色配装方案',exact:true});
      await expect(save.getByLabel('配装方案名称',{exact:true})).toHaveValue(/\|2染血\+2苍白\|天空之翼$/);
      await save.getByRole('button',{name:'确认另存',exact:true}).click();
      await expect(save).toHaveCount(0);
      await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    }
    await page.keyboard.press('Escape');const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document);const inventory=JSON.stringify(original.artifacts),showcase=JSON.stringify(original.characters.find((item:{name:string})=>item.name==='安柏').showcase);
    await page.getByTestId('workspace-nav-loadouts').click();const main=page.locator('#workspace-main');await expect(main).toHaveAttribute('aria-label','角色配置');await expect(page.getByRole('heading',{name:'角色配置',exact:true,level:2})).toHaveCount(0);await expect(page.locator('.configuration-row')).toHaveCount(9);await expect(page.getByRole('button',{name:'全部角色',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.configuration-kind').first()).toHaveText('首选');await expect(page.getByRole('button',{name:'前往角色库',exact:true})).toHaveCount(0);await expect(page.locator('.configuration-row .configuration-actions')).toHaveCount(0);await expect(page.getByRole('button',{name:/加入对比/})).toHaveCount(0);
    const first = page.locator('.configuration-row').filter({ has: page.getByRole('button', { name: '查看安柏首选配置', exact: true }) });
    const totals=(await page.locator('.configuration-title').allTextContents()).map(title=>Number(title.match(/([\d.]+)词条\|/)?.[1]));
    expect(totals.every(Number.isFinite)).toBe(true);
    expect(totals).toEqual([...totals].sort((a,b)=>b-a));
    await expect(first.locator('.configuration-title')).toContainText('安柏');await expect(first.locator('.configuration-title')).toContainText('首选');
    await expect(first.locator('.configuration-title')).toContainText('|2染血+2苍白|天空之翼');
    expect((await first.locator('.configuration-title').innerText()).split('|')).toHaveLength(3);
    const summary=first.locator('.effective-roll-summary.stacked');const summaryInfo=await summary.evaluate(node=>{const rows=Array.from(node.children);return {selected:rows.map(row=>row.classList.contains('effective')),tops:rows.map(row=>row.getBoundingClientRect().top),fonts:rows.map(row=>getComputedStyle(row).fontSize),colors:rows.map(row=>getComputedStyle(row).color)};});expect(summaryInfo.selected.slice(0,summaryInfo.selected.filter(Boolean).length).every(Boolean)).toBe(true);expect(new Set(summaryInfo.tops).size).toBeGreaterThan(1);expect(summaryInfo.fonts.every(value=>parseFloat(value)>=14)).toBe(true);expect(new Set(summaryInfo.colors).size).toBe(2);
    const side = await first.evaluate(node => getComputedStyle(node).borderInlineStartColor);
    await first.getByRole('button', { name:'查看安柏首选配置', exact:true }).hover();
    await expect(first).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await expect(first).toHaveCSS('border-inline-start-color', side);
    await page.screenshot({path:'artifacts/configuration-browser-all.png',fullPage:true});
    await page.getByRole('group',{name:'卡片密度'}).getByRole('button',{name:'疏松'}).click();
    await expect(page.locator('.configuration-row')).toHaveCount(5);
    await page.getByRole('navigation',{name:'底部列表分页',exact:true}).getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.configuration-row')).toHaveCount(4);await page.getByRole('button',{name:'查看安柏备选配置',exact:true}).first().click();await expect(role).toBeVisible();await expect(main).toHaveAttribute('aria-label','角色配置');await page.keyboard.press('Escape');await expect(page.locator('.configuration-row')).toHaveCount(4);await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('2');
    const search=page.getByLabel('搜索角色配置',{exact:true});await search.pressSequentially('没有这套配置');await expect(page.locator('.configuration-row')).toHaveCount(0);await page.getByRole('button',{name:'清除搜索角色配置',exact:true}).click();await expect(search).toBeFocused();await expect(search).toHaveValue('');await expect(page.locator('.configuration-row')).toHaveCount(5);
    await search.pressSequentially('染血的骑士道');
    await expect(first).toBeVisible();
    await page.getByRole('button',{name:'清除搜索角色配置',exact:true}).click();
    const open=page.getByRole('button',{name:'查看安柏首选配置',exact:true});await open.focus();await open.press('Shift+F10');const menu=page.getByRole('menu',{name:'配置操作',exact:true});await menu.getByRole('menuitem',{name:'查看详情',exact:true}).click();await expect(role).toBeVisible();const presets=await page.evaluate(()=>localStorage.getItem('leyline-character-loadouts-0.2.0'));const select=role.getByLabel('选择对比配置',{exact:true});const candidates=await select.locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value).filter(Boolean));expect(candidates).toHaveLength(5);await select.selectOption(candidates[0]);await expect(role.locator('.comparison-stats tbody tr')).toHaveCount(7);await expect(page.getByRole('dialog')).toHaveCount(1);expect(await page.evaluate(()=>localStorage.getItem('leyline-character-loadouts-0.2.0'))).toBe(presets);await page.screenshot({path:'artifacts/configuration-detail-inline-comparison.png',fullPage:true});
    await role.getByRole('button',{name:'5命',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'有未保存的修改',exact:true}).getByRole('button',{name:'继续编辑',exact:true}).click();await expect(role.locator('.comparison-stats')).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改',exact:true}).click();await expect(main).toHaveAttribute('aria-label','角色配置');
    await page.getByRole('button',{name:'查看安柏首选配置',exact:true}).click();await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();const chooser=page.getByRole('dialog',{name:'安柏的配置',exact:true});await chooser.getByRole('button',{name:'选择安柏备选配置',exact:true}).first().click({button:'right'});await expect(page.getByRole('menu',{name:'配置操作',exact:true})).toBeVisible();await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();await expect(chooser).toHaveCount(0);await expect(role.getByRole('button',{name:'5命',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
    await expect(role).toHaveCount(0);
    const deleteFromMenu=async(button:Locator)=>{
      await button.scrollIntoViewIfNeeded();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await button.click({button:'right'});
      await page.getByRole('menuitem',{name:'删除',exact:true}).click();
    };
    const alternate=page.getByRole('button',{name:'查看安柏备选配置',exact:true}).first();
    await deleteFromMenu(alternate);const confirmation=page.getByRole('dialog',{name:'清除配置？',exact:true});await confirmation.getByRole('button',{name:'取消',exact:true}).click();expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('leyline-character-loadouts-0.2.0')))! ).document).toHaveLength(5);
    await deleteFromMenu(alternate);await confirmation.getByRole('button',{name:'确认清除',exact:true}).click();await expect(page.locator('.configuration-row')).toHaveCount(5);await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('1');expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('leyline-character-loadouts-0.2.0')))! ).document).toHaveLength(4);
    await deleteFromMenu(open);await expect(confirmation).toContainText('下一份备选将接替首选。');await confirmation.getByRole('button',{name:'确认清除',exact:true}).click();await expect(page.locator('.configuration-row')).toHaveCount(5);const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document);expect(JSON.stringify(after.artifacts)).toBe(inventory);expect(JSON.stringify(after.characters.find((item:{name:string})=>item.name==='安柏').showcase)).toBe(showcase);expect(after.characters.find((item:{name:string})=>item.name==='安柏').build.constellation).toBe(4);
    await chooseConfigurationRole(page,'甘雨');
    await expect(page.locator('.configuration-title')).toContainText('|4乐团|阿莫斯之弓');
    await chooseConfigurationRole(page,'安柏');await expect(page.locator('.configuration-kind').first()).toHaveText('首选');await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/configuration-browser-mobile.png',fullPage:true});await page.getByRole('button',{name:'查看安柏首选配置',exact:true}).click();await expect(role).toBeVisible();await expect(main).toHaveAttribute('aria-label','角色配置');await page.keyboard.press('Escape');await expect(page.locator('.configuration-row')).toHaveCount(4);
    await page.getByRole('button',{name:'全部角色',exact:true}).click();
    // Compare tied scores, then count Amber's recorded crit damage while the other scores stay at zero.
    const selectEffectiveStats=(amber:boolean)=>page.evaluate(async(amber)=>{
      // @ts-expect-error Vite browser source URL.
      const { useAccountStore }=await import('/src/stores/account.ts');
      // @ts-expect-error Vite browser source URL.
      const { useCharacterLoadoutsStore }=await import('/src/stores/character-loadouts.ts');
      const { account }=useAccountStore();
      const loadouts=useCharacterLoadoutsStore();
      for(const character of account.characters)loadouts.setEffectiveStats(account.id,character.id,amber && character.name==='安柏'?['critDamage']:[]);
    },amber);
    await selectEffectiveStats(false);
    await expect(page.locator('.configuration-kind')).toHaveText(['首选','首选','首选','首选','备选']);
    await selectEffectiveStats(true);
    await expect(page.locator('.configuration-kind')).toHaveText(['首选','备选','备选','备选','首选']);
    expect(errors).toEqual([]);
  });

  test('combination comparison is embedded, uses draft items and does not save implicitly',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(10000);await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);const account=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    // UI trial removes only one recorded item from the draft; actual wearing stays intact.
    await role.getByRole('button',{name:'替换生之花',exact:true}).click();await page.getByRole('dialog',{name:'选择生之花',exact:true}).getByRole('button',{name:'卸下',exact:true}).click();await role.getByRole('button',{name:'保存组合',exact:true}).click();const editor=page.getByRole('dialog',{name:'保存组合',exact:true});const before=await page.evaluate(()=>localStorage.getItem('leyline-artifact-combinations-0.2.0'));const compare=editor.getByLabel('选择对比组合',{exact:true});const target=await compare.locator('option').nth(1).getAttribute('value');await compare.selectOption(target!);await expect(editor.locator('.comparison-stats tbody tr')).toHaveCount(7);await expect(editor.locator('.comparison-slot').first()).toContainText('左侧未装备');expect(await page.evaluate(()=>localStorage.getItem('leyline-artifact-combinations-0.2.0'))).toBe(before);expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(account);await editor.getByRole('button',{name:'保存',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改',exact:true}).click();
    await page.getByTestId('workspace-nav-combinations').click();await expect(page.getByRole('heading',{name:'圣遗物组合',exact:true,level:2})).toHaveCount(0);await expect(page.getByRole('button',{name:/加入对比|对比 2\/2/})).toHaveCount(0);await page.locator('.combination-row').first().getByRole('button',{name:/^查看组合：/}).click();const editing=page.getByRole('dialog',{name:'编辑组合',exact:true});const selector=editing.getByLabel('选择对比组合',{exact:true});await selector.selectOption((await selector.locator('option').nth(1).getAttribute('value'))!);await expect(editing.locator('.comparison-stats tbody tr')).toHaveCount(7);await expect(page.getByRole('dialog')).toHaveCount(1);await page.setViewportSize({width:390,height:844});expect(await editing.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/combination-detail-comparison-mobile.png',fullPage:true});await editing.getByRole('button',{name:'结束对比',exact:true}).click();await expect(editing.locator('.comparison-stats')).toHaveCount(0);await page.keyboard.press('Escape');expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(account);
  });
});

test.describe('compact-configurations', () => {
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded public showcase.');
  async function compactGeometry(root:Locator){
    await expect(root.locator('.artifact-summary.compact').first()).toBeVisible();
    const geometry=await root.locator('.artifact-summary.compact').evaluateAll(cards=>cards.map(card=>{
      const image=card.querySelector('.artifact-art')!.getBoundingClientRect(),text=card.querySelector('.compact-substats')!.getBoundingClientRect();
      return {aligned:Math.abs(image.top-text.top)<.5 && Math.abs(image.bottom-text.bottom)<.5,overflow:card.scrollWidth>card.clientWidth,rows:card.querySelectorAll('.compact-entry').length,font:getComputedStyle(card.querySelector('.compact-entry')!).fontSize};
    }));expect(geometry.length).toBeGreaterThan(0);expect(geometry.every(item=>item.aligned && !item.overflow && item.rows===4 && item.font==='14px')).toBe(true);
    await expect(root.locator('.average-count,.roll-count,.artifact-wearers,.summary-main')).toHaveCount(0);
  }
  async function compactConfiguration(root:Locator){
    const card = root.locator('.configuration-row.compact').first();
    await expect(card.locator('.card-sets .card-set')).toHaveCount(2);
    await expect(card.locator('.effective-roll-summary.stacked')).toBeVisible();
    await expect(card.locator('.artifact-summary')).toHaveCount(0);
  }
  test('recorded Amber uses detailed artifacts in combinations and relaxed configurations, and set summaries in compact selections',async({page})=>{
    test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1920,height:1080});
    const role = await prepareRecordedAmberConfiguration(page);
    await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-combinations').click();const combination=page.locator('.combination-row');await expect(combination.locator('.artifact-summary.compact')).toHaveCount(5);await compactGeometry(combination);await page.screenshot({path:'artifacts/compact-combination-library.png',fullPage:true});
    await page.getByTestId('workspace-nav-loadouts').click();await chooseConfigurationRole(page,'安柏');const configuration=page.locator('.configuration-row');
    await compactConfiguration(page.locator('#workspace-main'));
    await page.getByRole('group',{name:'卡片密度'}).getByRole('button',{name:'疏松',exact:true}).click();
    await compactGeometry(configuration);
    const order=await configuration.evaluate(node=>{const rows=Array.from(node.children).flatMap(row=>row.classList.contains('configuration-body')?Array.from(row.children):[row]);const equipment=node.querySelector('.equipment-strip-items')!;return {rows:rows.map(row=>row.classList[0]),leading:Array.from(equipment.querySelector('.equipment-strip-leading')!.children).map(child=>child.className),tops:Array.from(equipment.children).map(child=>child.getBoundingClientRect().top),buttons:Array.from(node.querySelectorAll('.configuration-actions button')).map(button=>button.getBoundingClientRect().height)};});
    expect(order.rows).toEqual(['configuration-top','equipment-strip','effective-roll-summary','configuration-open']);expect(order.leading[0]).toContain('characters');expect(order.leading[1]).toContain('weapons');expect(order.buttons.every(height=>height===32)).toBe(true);expect(Math.max(...order.tops)-Math.min(...order.tops)).toBeLessThan(10);await page.screenshot({path:'artifacts/compact-character-configurations.png',fullPage:true});await page.setViewportSize({width:1440,height:900});await compactGeometry(configuration);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-character-configurations-1440.png',fullPage:true});await page.setViewportSize({width:1920,height:1080});
    await page.getByRole('button',{name:'查看安柏首选配置',exact:true}).click();await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();const selector=page.getByRole('dialog',{name:'安柏的配置',exact:true});await compactConfiguration(selector);await page.keyboard.press('Escape');
    // Sequential typing and label focus still operate on recorded C6 bonus talents.
    const skill=role.getByLabel('战技',{exact:true});await skill.click();await skill.press('ControlOrMeta+A');await skill.pressSequentially('12');await skill.press('Tab');await expect(skill).toHaveValue('12');await role.getByRole('button',{name:'还原',exact:true}).click();await expect(skill).toHaveValue('13');await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-loadouts').click();await page.setViewportSize({width:390,height:844});await compactGeometry(configuration);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-character-configurations-mobile.png',fullPage:true});
    await configuration.getByRole('button',{name:'查看安柏首选配置',exact:true}).focus();await page.keyboard.press('Enter');await expect(role).toBeVisible();await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();await compactConfiguration(selector);expect(await selector.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-configuration-selector-mobile.png',fullPage:true});await page.keyboard.press('Escape');await expect(role).toBeVisible();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'打开功能导航',exact:true}).click();await page.getByTestId('workspace-nav-combinations').click();await compactGeometry(combination);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-combination-library-mobile.png',fullPage:true});expect(errors).toEqual([]);
  });
});

test.describe('effective-consistency', () => {
  const path='.references/enka/uid-107590923.json';
  test.skip(!existsSync(path),'Requires the recorded showcase containing Flins.');
  async function importRecorded(page:Page,all=false){
    await page.route('**/api/enka/107590923',route=>route.fulfill({json:JSON.parse(readFileSync(path,'utf8'))}));await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('107590923');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    if(!all){await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.getByRole('button',{name:'导入菲林斯',exact:true}).click();}
    await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await page.getByRole('button',{name:/^确认导入 \d+ 位角色$/}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  test('recorded Flins shows 8.3 weighted attack, captures creation weapon and shares details everywhere',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(10000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});await importRecorded(page);
    // Normalized by the confirmed UI import for an isolated package check; not a player-provided export.
    writeFileSync('artifacts/u1-effective-recorded-account.json',await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0')!));
    await page.getByRole('button',{name:'查看菲林斯详情',exact:true}).click();const role=page.getByRole('dialog',{name:'菲林斯',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();
    const attack=role.locator('.effective-roll-summary [data-roll-stat=attack] dd');await expect(attack).toHaveText('8.3 条');expect(await role.locator('.effective-roll-summary > div').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-roll-stat')))).toEqual(['critDamage','critRate','elementalMastery','attack','defense','hp','energyRecharge']);
    expect(await role.locator('.effective-roll-summary > .effective').first().evaluate(node=>getComputedStyle(node).color)).toBe(await role.locator('.effective-substat').first().evaluate(node=>getComputedStyle(node).color));await expect(role.getByRole('region',{name:'配置对比',exact:true})).toBeVisible();
    await role.getByRole('button',{name:'保存组合',exact:true}).click();const save=page.getByRole('dialog',{name:'保存组合',exact:true});await expect(save.locator('.effective-roll-summary [data-roll-stat=attack] dd')).toHaveText('8.3 条');await page.screenshot({path:'artifacts/combination-save-ui-restored.png',fullPage:true});await save.getByRole('button',{name:'保存',exact:true}).click();await expect(save).toHaveCount(0);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!));expect(stored[0].basis.attack).toBeCloseTo(1025.9268,2);
    await role.getByRole('button',{name:'本地',exact:true}).click();await expect(role.getByRole('button',{name:'应用组合',exact:true})).toHaveAttribute('data-accent','hydro');await role.getByRole('button',{name:'应用组合',exact:true}).click();await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();await expect(attack).toHaveText('8.3 条');await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    // UI cultivation trial creates a comparison candidate; it is not a player configuration export.
    const source=JSON.parse(readFileSync(path,'utf8')).avatarInfoList.find((avatar:{avatarId:number})=>avatar.avatarId===10000120);const rank=(source.talentIdList ?? []).length;await role.getByRole('button',{name:`${rank===0?1:0}命`,exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await expect(page.getByRole('dialog',{name:'另存角色配装方案',exact:true})).toHaveCount(0);
    await role.getByRole('button',{name:'选择菲林斯配置',exact:true}).click();await page.getByRole('dialog',{name:'菲林斯的配置',exact:true}).getByRole('button',{name:'选择菲林斯首选配置',exact:true}).click();await role.getByRole('button',{name:'更换武器',exact:true}).click();await role.getByLabel('搜索装备武器',{exact:true}).fill('西风长枪');await role.getByRole('button',{name:'西风长枪',exact:true}).click();await role.getByRole('button',{name:'保存',exact:true}).click();await expect.poll(()=>page.evaluate(()=>{const file=JSON.parse(localStorage.getItem('leyline-account-0.2.0')!);return file.content.weapons[file.document.characters[0].build.weapon].name;})).toBe('西风长枪');await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    await page.getByTestId('workspace-nav-combinations').click();const combination=page.locator('.combination-row');await expect(combination.locator('[data-roll-stat=attack] dd')).toHaveText('8.3');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!)[0].basis)).toEqual(stored[0].basis);await expect(combination.locator('.compact-entry:has([data-stat=attack])').first()).toHaveClass(/effective-substat/);await page.screenshot({path:'artifacts/effective-flins-combination-frozen.png',fullPage:true});
    await page.getByTestId('workspace-nav-loadouts').click();await expect(page.locator('.configuration-row.compact')).toHaveCount(2);await page.getByRole('button',{name:'排序',exact:true}).click();await expect(page.getByRole('dialog',{name:'配置排序',exact:true}).getByRole('button',{name:'有效词条数',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'完成',exact:true}).click();await expect(page.locator('.configuration-kind').first()).toHaveCSS('font-size','16px');await expect(page.locator('.configuration-row .effective-roll-summary.stacked .effective').first()).toBeVisible();
    await page.getByRole('button',{name:'查看菲林斯首选配置',exact:true}).click();await expect(role.getByRole('region',{name:'配置对比',exact:true})).toBeVisible();await expect(role.getByRole('button',{name:'应用组合',exact:true})).toHaveAttribute('data-accent','hydro');await page.screenshot({path:'artifacts/effective-flins-unified-details.png',fullPage:true});await page.keyboard.press('Escape');expect(errors).toEqual([]);
  });

  test('recorded configurations filter in the character dialog, fit two compact cards per row, and reset to effective rolls',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(10000);await page.setViewportSize({width:1440,height:1000});await importRecorded(page,true);const bounds:{x:number;y:number;width:number;height:number}[]=[];
    for(const tab of ['characters','artifacts','loadouts','combinations']){
      await page.getByTestId(`workspace-nav-${tab}`).click();const toolbar=page.locator('#workspace-main > .library-page .library-toolbar').first();await expect(toolbar).toBeVisible();bounds.push(await toolbar.locator('input').evaluate(input=>{const box=input.getBoundingClientRect();return {x:box.x,y:box.y+scrollY,width:box.width,height:box.height};}));await expect(toolbar.getByRole('button',{name:'清除筛选和排序条件',exact:true})).toBeVisible();
      await toolbar.getByRole('button',{name:'排序',exact:true}).click();const sort=page.getByRole('dialog').last();
      if(tab!=='loadouts')await sort.getByRole('group',{name:'排序依据'}).getByRole('button').last().click();
      await sort.getByRole('button',{name:'从低到高',exact:true}).click();await sort.getByRole('button',{name:'完成',exact:true}).click();await toolbar.getByRole('button',{name:'清除筛选和排序条件',exact:true}).click();await expect(toolbar.getByRole('button',{name:'清除筛选和排序条件',exact:true})).toBeDisabled();
      await toolbar.getByRole('button',{name:'排序',exact:true}).click();const reset=page.getByRole('dialog').last();
      const defaultLabel=tab==='loadouts' || tab==='combinations'?'有效词条数':'实装版本';
      const choices=reset.getByRole('group',{name:'排序依据'}).getByRole('button');
      await expect(reset.getByRole('button',{name:defaultLabel,exact:true})).toHaveAttribute('aria-pressed','true');
      if(tab==='loadouts')await expect(choices.first()).toHaveText(defaultLabel);
      await expect(reset.getByRole('button',{name:'从高到低',exact:true})).toHaveAttribute('aria-pressed','true');
      await reset.getByRole('button',{name:'完成',exact:true}).click();
      if(tab==='artifacts'){
        const shortcuts=await page.locator('.inventory-options .slot-tabs > button, .inventory-options [aria-label="卡片密度"]').evaluateAll(nodes=>nodes.map(node=>{
          const { height, top }=node.getBoundingClientRect();return { height, top };
        }));
        expect(shortcuts).toHaveLength(7);
        expect(shortcuts.every(box=>box.height===40 && box.top===shortcuts[0].top)).toBe(true);
      }
    }
    expect(Math.max(...bounds.map(box=>box.x))-Math.min(...bounds.map(box=>box.x))).toBeLessThan(.5);expect(Math.max(...bounds.map(box=>box.y))-Math.min(...bounds.map(box=>box.y))).toBeLessThan(.5);expect(Math.max(...bounds.map(box=>box.width))-Math.min(...bounds.map(box=>box.width))).toBeLessThan(.5);expect(bounds.every(box=>box.height===40)).toBe(true);
    await page.getByTestId('workspace-nav-loadouts').click();
    const roleShortcuts=page.getByRole('group',{name:'按角色筛选',exact:true});
    const roles=roleShortcuts.getByRole('button',{name:'选择角色',exact:true});
    const allRoles=roleShortcuts.getByRole('button',{name:'全部角色',exact:true});
    const layout=page.getByRole('group',{name:'卡片密度',exact:true});
    const rows=page.locator('.configuration-row');
    const shortcutBoxes=await Promise.all([roles.boundingBox(),allRoles.boundingBox(),layout.boundingBox()]);
    expect(shortcutBoxes.every(box=>box?.height===40 && box.y===shortcutBoxes[0]?.y)).toBe(true);
    await roles.press('Enter');
    const picker=page.getByRole('dialog',{name:'选择角色',exact:true});
    await expect(picker.getByRole('button',{name:'关闭选择角色',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(roles).toBeFocused();
    await chooseConfigurationRole(page,'菲林斯');
    await expect(roles).toBeFocused();
    await expect(roles).toContainText('菲林斯');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('菲林斯');
    await allRoles.focus();await allRoles.press('Space');
    await expect(allRoles).toHaveAttribute('aria-pressed','true');
    await expect(rows).toHaveCount(10);
    await chooseConfigurationRole(page,'菲林斯');
    await page.getByRole('button',{name:'清除筛选和排序条件',exact:true}).click();
    await expect(roles).toHaveText('选择角色');

    await expect(layout.getByRole('button',{name:'紧凑',exact:true})).toHaveAttribute('aria-pressed','true');
    await layout.getByRole('button',{name:'疏松',exact:true}).click();
    await expect(rows).toHaveCount(5);
    const relaxed=await rows.first().boundingBox();
    const stats=rows.first().locator('.effective-roll-summary > div');
    const values=await stats.locator('dd').allTextContents();
    await layout.getByRole('button',{name:'紧凑',exact:true}).click();
    await expect(rows.first().locator('.card-set').first()).toBeVisible();
    await expect(rows.first().locator('.configuration-cultivation,.equipment-strip')).toHaveCount(0);
    expect(await stats.locator('dd').allTextContents()).toEqual(values);
    const [first,second]=await Promise.all([rows.nth(0).boundingBox(),rows.nth(1).boundingBox()]);
    expect(first!.y).toBeCloseTo(second!.y,1);
    expect(first!.x).toBeLessThan(second!.x);
    expect(first!.width).toBeLessThan(relaxed!.width);
    expect(first!.height).toBeLessThan(relaxed!.height);
    const statLayout=await stats.evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top, fits:node.scrollWidth<=node.clientWidth})));
    expect(new Set(statLayout.map(box=>box.top)).size).toBeGreaterThan(1);
    expect(statLayout.every(box=>box.fits)).toBe(true);
    const rowCount=()=>rows.evaluateAll(nodes=>new Set(nodes.map(node=>node.getBoundingClientRect().top)).size);
    await expect(rows).toHaveCount(10);
    expect(await rowCount()).toBe(5);
    await page.screenshot({path:'artifacts/effective-library-toolbars-aligned.png',fullPage:true});

    const topPager=page.getByRole('navigation',{name:'顶部列表分页'});
    await topPager.getByRole('button',{name:'下一页'}).click();
    await expect(rows).toHaveCount(2);
    const lastIds=()=>rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-configuration-id')));
    const lastPage=await lastIds();
    await page.setViewportSize({width:390,height:844});
    await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('3');
    expect(await lastIds()).toEqual(lastPage);
    await page.setViewportSize({width:1440,height:1000});
    await expect(page.getByLabel('顶部页码',{exact:true})).toHaveValue('2');
    expect(await lastIds()).toEqual(lastPage);
    await topPager.getByRole('button',{name:'上一页'}).click();
    await page.setViewportSize({width:390,height:844});
    await expect(rows).toHaveCount(5);
    expect(await rowCount()).toBe(5);
    await expect(allRoles).toBeInViewport();
    expect((await layout.boundingBox())!.y).toBeCloseTo((await allRoles.boundingBox())!.y,1);
    const [mobileFirst,mobileSecond]=await Promise.all([rows.nth(0).boundingBox(),rows.nth(1).boundingBox()]);
    expect(mobileFirst!.x).toBeCloseTo(mobileSecond!.x,1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:'artifacts/effective-all-roles-header-mobile.png',fullPage:true});
    await roles.click();
    expect(await picker.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    await page.screenshot({path:'artifacts/configuration-role-picker-mobile.png',fullPage:true});
    await picker.getByRole('button',{name:'全部角色',exact:true}).click();
    await expect(roles).toBeFocused();
  });
});
