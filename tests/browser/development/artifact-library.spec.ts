import { recordedJsonFile } from '../../helpers/recorded-reference';
import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { prepareRecordedAmberConfiguration } from '../../helpers/recorded-amber-configuration';
import { auditDialog } from '../../helpers/ui-contract-audit';
import { restoreRecordedNoteSetup } from '../../helpers/recorded-note-setup';

test.describe('artifact-default-release', () => {
  test('actual inventory starts and resets in newest release order',async({page})=>{
    test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual Mona inventory.');
    test.setTimeout(90000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));await page.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();
    const metadata=JSON.parse(readFileSync('src/game-data/data/tables/catalog-release-metadata.json','utf8')).artifacts;
    const source=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.map((item:{id:string;name:string;real:{setId:string}})=>({id:item.id,name:item.name,setId:item.real.setId})));
    // Independent comparison from canonical version tuples and game IDs, retaining source order for ties.
    const expected=[...source].sort((a,b)=>{const left=metadata[a.setId],right=metadata[b.setId];if(!left || !right)return left?-1:right?1:0;const lv=left.version.split('.').map(Number),rv=right.version.split('.').map(Number);return rv[0]-lv[0] || rv[1]-lv[1] || right.gameId-left.gameId;});
    await page.getByRole('button',{name:'排序',exact:true}).click();const sort=page.getByRole('dialog',{name:'圣遗物排序',exact:true});await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await expect(sort.getByRole('button',{name:'从高到低',exact:true})).toHaveAttribute('aria-pressed','true');await sort.getByRole('button',{name:'等级',exact:true}).click();await sort.getByRole('button',{name:'重置排序',exact:true}).click();await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await sort.getByRole('button',{name:'完成',exact:true}).click();
    const actual=await page.locator('.inventory-card').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
    expect(actual).toEqual(expected.slice(0,actual.length).map(item=>`查看 ${item.name} ${item.id.slice(-6)}`));
    await page.reload();await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'排序',exact:true}).click();await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');
  });
});

test.describe('artifact-redesign', () => {
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');
  test('recorded artifact: immutable identity, alias, three favorites, explicit copy, references and context removal',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(8000);await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await role.getByRole('button',{name:'5命',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await expect(page.getByRole('dialog',{name:'另存角色配装方案',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
    const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),amber=baseline.characters.find((item:{name:string})=>item.name==='安柏'),id=amber.equipment.flower,original=baseline.artifacts.find((item:{id:string})=>item.id===id);await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'生之花',exact:true}).click();const card=page.locator(`.inventory-card[data-artifact-id="${id}"]`);await card.focus();await card.press('Shift+F10');await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();const detail=page.locator('.artifact-detail-dialog');await auditDialog(detail,'editor');await expect(detail.getByLabel('圣遗物名称',{exact:true})).toHaveCount(0);await expect(detail.getByRole('button',{name:'选择套装',exact:true})).toHaveCount(0);await expect(detail.getByRole('combobox')).toHaveCount(0);
    const centered=await detail.locator('.artifact-portrait').evaluate(node=>{const a=node.getBoundingClientRect(),b=node.parentElement!.getBoundingClientRect();return Math.abs((a.left+a.right)/2-(b.left+b.right)/2);});expect(centered).toBeLessThan(1);await expect(detail.locator('.artifact-references button')).toHaveCount(4);
    const alias=detail.getByLabel('圣遗物别名',{exact:true});await alias.pressSequentially('安柏备用花');await detail.getByRole('button',{name:'保存',exact:true}).click();for(let count=0;count<3;count++)await detail.getByRole('button',{name:'设置圣遗物收藏',exact:true}).click();await expect(detail.locator('.artifact-favorite .favorite-mark')).toHaveAttribute('data-level','3');await alias.fill('尚未保存的别名');
    await detail.getByRole('group',{name:'角色',exact:true}).getByRole('button').first().click();
    await expect(role).toBeVisible();
    await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label','角色');
    await page.keyboard.press('Escape');
    await expect(alias).toHaveValue('尚未保存的别名');
    await page.keyboard.press('Escape');
    const warning=page.getByRole('dialog',{name:'有未保存的修改',exact:true});
    await warning.getByRole('button',{name:'继续编辑',exact:true}).click();
    await expect(alias).toHaveValue('尚未保存的别名');
    await page.keyboard.press('Escape');
    await warning.getByRole('button',{name:'放弃修改',exact:true}).click();
    await page.getByTestId('workspace-nav-artifacts').click();await card.click();await expect(alias).toHaveValue('安柏备用花');const input=detail.locator('.sub-row input').first(),stat=original.real.substats[0],percent=!['hp','attack','defense','elementalMastery'].includes(stat.stat),value=String(Number((stat.value*(percent?100:1)).toPrecision(12)));await input.fill('');await input.pressSequentially(value);await expect(input).toHaveValue(value);await alias.fill('复制的花');await detail.getByRole('button',{name:'另存',exact:true}).click();await expect(detail).toHaveCount(0);
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),copy=after.artifacts.find((item:{alias?:string})=>item.alias==='复制的花 · 副本1');expect(after.artifacts).toHaveLength(baseline.artifacts.length+1);expect(copy.id).not.toBe(id);expect(copy.real.id).toBe(copy.id);expect(copy.real.setId).toBe(original.real.setId);expect(copy.name).toBe(original.name);expect(copy.mona).toBeUndefined();expect(copy.real.source).toBeUndefined();expect(after.characters.find((item:{name:string})=>item.name==='安柏').equipment.flower).toBe(id);expect(after.artifacts.find((item:{id:string})=>item.id===id).alias).toBe('安柏备用花');
    await card.click();await detail.getByRole('group',{name:'圣遗物组合',exact:true}).getByRole('button').first().click();await expect(page.getByRole('dialog',{name:'编辑组合',exact:true})).toBeVisible();await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label','圣遗物组合');await page.keyboard.press('Escape');await expect(detail).toBeVisible();await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-artifacts').click();await card.click();await detail.locator('.artifact-references button').filter({hasText:'备选'}).first().click();await expect(role).toBeVisible();await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label','角色配置');await page.keyboard.press('Escape');await expect(detail).toBeVisible();await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-artifacts').click();await page.locator('#workspace-main .library-toolbar').getByRole('button',{name:/^筛选/}).click();const filter=page.getByRole('dialog',{name:'筛选圣遗物',exact:true});await filter.getByRole('group',{name:'圣遗物收藏等级',exact:true}).getByRole('button',{name:'3级收藏',exact:true}).click();await filter.getByRole('button',{name:'完成',exact:true}).click();await expect(page.locator('.inventory-card')).toHaveCount(1);await expect(card.locator('.artifact-favorite-mark')).toBeVisible();await page.getByRole('button',{name:'清除筛选和排序条件',exact:true}).click();
    await page.getByRole('button',{name:'紧凑',exact:true}).click();await expect(page.getByRole('button',{name:'紧凑',exact:true})).toHaveCSS('color','rgb(100, 69, 138)');await page.getByRole('button',{name:'疏松',exact:true}).click();await expect(page.getByRole('button',{name:'疏松',exact:true})).toHaveCSS('color','rgb(45, 96, 139)');
    await page.getByLabel('搜索圣遗物',{exact:true}).fill('复制的花');const copied=page.locator(`.inventory-card[data-artifact-id="${copy.id}"]`);await copied.focus();await copied.press('Shift+F10');await page.getByRole('menuitem',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除圣遗物？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(baseline.artifacts.length);
    await page.getByLabel('搜索圣遗物',{exact:true}).fill('安柏备用花');await card.click();await page.setViewportSize({width:390,height:844});await auditDialog(detail,'editor');await detail.getByLabel('主词条',{exact:true}).click();await page.keyboard.press('Escape');await expect(detail).toBeVisible();await page.screenshot({path:'artifacts/artifact-redesign-references-mobile.png',fullPage:true});
  });
});

test.describe('artifact-reference-actions', () => {
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded public showcase.');
  test('shared triangle favorites, one favorite action, unique copies, return links and deletion preserve detached equipment',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(8000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);
    await role.getByRole('button',{name:'查看生之花详情',exact:true}).press('Shift+F10');await expect(page.getByRole('menuitem')).toHaveText(['查看详情','替换','卸下']);await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();const detail=page.locator('.artifact-detail-dialog[open]');await expect(detail).toBeVisible();await page.keyboard.press('Escape');await expect(role).toBeVisible();
    await role.getByRole('button',{name:'查看生之花详情',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'卸下',exact:true}).click();await expect(role.getByRole('button',{name:'装备生之花',exact:true})).toBeVisible();await role.getByRole('button',{name:'还原',exact:true}).click();
    await role.getByRole('button',{name:'5命',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await expect(page.getByRole('dialog',{name:'另存角色配装方案',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),amber=before.characters.find((item:{name:string})=>item.name==='安柏'),id=amber.equipment.flower;
    await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'生之花',exact:true}).click();const card=page.locator(`.inventory-card[data-artifact-id="${id}"]`);await card.click({button:'right'});await expect(page.getByRole('menuitem')).toHaveText(['查看详情','收藏','删除']);await page.getByRole('menuitem',{name:'收藏',exact:true}).click();await expect(card.locator('.favorite-mark')).toHaveAttribute('data-level','1');await card.click();await detail.getByRole('button',{name:'设置圣遗物收藏',exact:true}).click();await expect(detail.locator('.favorite-mark')).toHaveAttribute('data-level','2');await expect(detail.locator('.artifact-favorite .corner-badge')).toHaveCount(0);await auditDialog(detail,'editor');
    for(const kind of ['组合','角色','备选']){await detail.getByRole('group',{name:kind==='组合'?'圣遗物组合':kind==='角色'?'角色':'角色配置',exact:true}).getByRole('button').first().click();await expect(detail).toHaveCount(0);await expect(page.getByRole('dialog',{name:kind==='组合'?'编辑组合':'安柏',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label','圣遗物');await expect(detail).toBeVisible();}
    const originalAlias=await detail.getByLabel('圣遗物别名',{exact:true}).inputValue();for(let index=0;index<2;index++){await detail.getByRole('button',{name:'另存',exact:true}).click();await card.click();}const copies=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.filter((item:{alias?:string})=>item.alias?.includes('副本')));expect(copies.length).toBe(2);expect(new Set(copies.map((item:{alias:string})=>item.alias)).size).toBe(2);await expect(detail.getByLabel('圣遗物别名',{exact:true})).toHaveValue(originalAlias);
    await detail.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除圣遗物？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();await expect(detail).toHaveCount(0);const group=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!)[0]);const detached=group.items.find((item:{inventoryId?:null})=>item.inventoryId===null);expect(detached).toBeTruthy();expect(detached.id).not.toBe(id);expect(detached.real.source).toBeUndefined();
    await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.unstored-badge')).toHaveText('未入库');await page.locator('.combination-open').click();const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});await expect(editor.locator('.unstored-badge')).toHaveText('未入库');await editor.getByRole('button',{name:'有效词条暴击伤害',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);await page.screenshot({path:'artifacts/artifact-detached-combination.png',fullPage:true});expect(errors).toEqual([]);
  });
  test('showcase import defaults to merging, snapshot-only stays available, and context imports one slot',async({page})=>{
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await expect(page.getByRole('button',{name:'同时导入本地库',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'仅保存展柜',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.length)).toBe(0);
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'查看生之花详情',exact:true}).click({button:'right'});await expect(page.getByRole('menuitem')).toHaveText(['查看详情','入库']);await page.getByRole('menuitem',{name:'入库',exact:true}).click();await page.getByRole('dialog',{name:'入库圣遗物？',exact:true}).getByRole('button',{name:'入库',exact:true}).click();const account=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document);expect(account.artifacts).toHaveLength(1);expect(account.artifacts[0].slot).toBe('flower');expect(account.artifacts[0].rollSource).toBe('showcase');expect(account.characters.find((item:{name:string})=>item.name==='安柏').equipment).toEqual({});
  });

  test('reference links keep the latest five origins and protect an evicted draft',async({page})=>{
    test.setTimeout(60000);
    await page.setViewportSize({width:1280,height:760});
    const role=await prepareRecordedAmberConfiguration(page);
    const account=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0')!);
    const itemId=JSON.parse(account).document.characters.find((entry:{name:string})=>entry.name==='安柏').equipment.flower;
    await page.keyboard.press('Escape');
    const main=page.locator('#workspace-main');
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button',{name:'生之花',exact:true}).click();
    const search=page.getByLabel('搜索圣遗物',{exact:true});
    await search.pressSequentially('安柏');
    const inventoryCard=page.locator(`.inventory-card[data-artifact-id="${itemId}"]`);
    await inventoryCard.click();
    const artifact=page.locator('.artifact-detail-dialog[open]');
    const alias=artifact.getByLabel('圣遗物别名',{exact:true});
    const originalAlias=await alias.inputValue();
    await alias.press('ControlOrMeta+A');
    await alias.pressSequentially('安柏花的草稿');
    const destinations=['圣遗物组合','角色配置','角色','圣遗物组合','角色配置','角色','圣遗物组合'] as const;
    const link=(destination:typeof destinations[number])=>artifact.getByRole('group',{name:destination,exact:true}).getByRole('button').first();
    const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});
    const follow=async(destination:typeof destinations[number])=>{
      const target=link(destination);
      await expect(target).toBeEnabled();
      await target.click();
      await expect(artifact).toHaveCount(0);
      await expect(main).toHaveAttribute('aria-label',destination);
      if(destination==='圣遗物组合'){
        await editor.getByRole('button',{name:'查看生之花详情',exact:true}).click();
      }else{
        await role.getByRole('button',{name:'查看生之花详情',exact:true}).press('Shift+F10');
        await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();
      }
      await expect(artifact).toBeVisible();
    };
    for(const destination of destinations.slice(0,5))await follow(destination);

    const sixth=link(destinations[5]);
    await sixth.click();
    const confirmation=page.getByRole('dialog',{name:'有未保存的修改',exact:true});
    await expect(alias).toHaveValue('安柏花的草稿');
    await confirmation.getByRole('button',{name:'继续编辑',exact:true}).click();
    await expect(main).toHaveAttribute('aria-label',destinations[4]);
    await expect(sixth).toBeFocused();
    await expect(alias).toHaveValue(originalAlias);
    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(account);
    await sixth.click();
    await confirmation.getByRole('button',{name:'保存',exact:true}).click();
    await expect(main).toHaveAttribute('aria-label',destinations[5]);
    await role.getByRole('button',{name:'查看生之花详情',exact:true}).press('Shift+F10');
    await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();
    await follow(destinations[6]);

    const linkedEditors=page.locator('.character-detail-dialog, dialog[aria-label="编辑组合"]');
    await expect(linkedEditors).toHaveCount(6);
    for(let index=destinations.length-1;index>=destinations.length-5;index--){
      await page.keyboard.press('Escape');
      await expect(artifact).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(main).toHaveAttribute('aria-label',destinations[index-1]);
      await expect(artifact).toBeVisible();
      await expect(link(destinations[index])).toBeEnabled();
      await expect(link(destinations[index])).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(main).toHaveAttribute('aria-label','圣遗物');
    await expect(artifact).toHaveCount(0);
    await expect(linkedEditors).toHaveCount(0);
    await expect(search).toHaveValue('安柏');
    await inventoryCard.click();
    await expect(alias).toHaveValue('安柏花的草稿');
  });
});

test.describe('artifact-slots-and-return', () => {
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded four-character showcase.');
  test('fixed substat rows, shared portrait, full return, combination actions and deletion preserve wearing',async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(8000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'查看生之花详情',exact:true}).click({button:'right'});await expect(page.getByRole('menuitem',{name:'入库',exact:true})).toHaveCSS('color','rgb(36, 107, 88)');await page.keyboard.press('Escape');await role.getByRole('button',{name:'本地',exact:true}).click();const offsets=await role.locator('.number-stepper').evaluateAll(nodes=>nodes.map(node=>{const input=node.querySelector('input')!.getBoundingClientRect();return Array.from(node.querySelectorAll('button svg')).map(svg=>{const box=svg.getBoundingClientRect();return Math.abs((input.top+input.bottom-box.top-box.bottom)/2);});}).flat());expect(offsets.every(value=>value<.5)).toBe(true);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
    const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),amber=initial.characters.find((item:{name:string})=>item.name==='安柏'),id=amber.equipment.flower,values=initial.artifacts.find((item:{id:string})=>item.id===id).real.substats;
    const bounds=[];
    for(const tab of ['characters','artifacts','loadouts','combinations']){
      await page.getByTestId('workspace-nav-'+tab).click();
      const tools=page.locator('#workspace-main > .library-page .library-toolbar').first();
      const reset=tools.getByRole('button',{name:'清除筛选和排序条件',exact:true});
      bounds.push(await reset.evaluate(node=>{const b=node.getBoundingClientRect();return {right:b.right,top:b.top+scrollY,height:b.height};}));
      const input=tools.locator('input');await input.fill('没有这个结果');await reset.click();await expect(input).toHaveValue('');
    }
    for(const key of ['right','top','height'] as const)expect(Math.max(...bounds.map(box=>box[key]))-Math.min(...bounds.map(box=>box[key]))).toBeLessThan(.5);
    await expect(page.getByRole('button',{name:'新建组合',exact:true}).first().locator('svg')).toBeVisible();
    await page.locator('.combination-open').click();const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});const manage=editor.getByRole('button',{name:'查看生之花详情',exact:true});await manage.click();let detail=page.locator('.artifact-detail-dialog');await expect(detail).toBeVisible();await expect(page.getByRole('dialog',{name:'选择生之花',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await manage.press('Shift+F10');await expect(page.getByRole('menuitem')).toHaveText(['查看详情','替换']);await page.getByRole('menuitem',{name:'替换',exact:true}).click();await expect(page.getByRole('dialog',{name:'选择生之花',exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
    await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'生之花',exact:true}).click();const card=page.locator(`.inventory-card[data-artifact-id="${id}"]`);await card.click();await auditDialog(detail,'editor');await expect(detail.locator('.sub-row')).toHaveCount(4);await expect(detail.getByRole('button',{name:'添加副词条',exact:true})).toHaveCount(0);await expect(detail.locator('.artifact-identity-panel')).toHaveCount(0);const rows=detail.locator('.sub-row');await expect(rows.first().getByLabel('副词条 1 数值',{exact:true})).toBeVisible();expect(await detail.getByLabel('圣遗物别名',{exact:true}).evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThan(await rows.last().evaluate(node=>node.getBoundingClientRect().bottom));await page.screenshot({path:'artifacts/artifact-fixed-slots-desktop.png',fullPage:true});
    for(const kind of ['角色','组合']){await detail.getByRole('group',{name:kind==='角色'?'角色':'圣遗物组合',exact:true}).getByRole('button').first().click();await expect(page.getByRole('dialog',{name:kind==='角色'?'安柏':'编辑组合',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(detail).toBeVisible();await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label','圣遗物');await expect(detail.locator('.artifact-portrait')).toHaveAttribute('aria-label',initial.artifacts.find((item:{id:string})=>item.id===id).name);}
    await page.setViewportSize({width:390,height:844});await auditDialog(detail,'editor');await page.screenshot({path:'artifacts/artifact-fixed-slots-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await detail.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除圣遗物？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),wearer=after.characters.find((item:{name:string})=>item.name==='安柏'),worn=after.artifacts.find((item:{id:string})=>item.id===wearer.equipment.flower);expect(worn.inventoryId).toBeNull();expect(worn.real.substats).toEqual(values);expect(after.artifacts.some((item:{id:string})=>item.id===id)).toBe(false);await page.getByTestId('workspace-nav-characters').click();await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();await expect(role.getByRole('button',{name:'查看生之花详情',exact:true})).toBeVisible();await expect(role.locator('.unstored-badge')).toHaveText('未入库');expect(errors).toEqual([]);
  });
  test('observed 34.2% crit damage cycles legal histories and merge targets the original',async({page})=>{
    test.skip(!existsSync('.references/enka/uid-107590923.json'),'Requires the recorded 12-character showcase.');test.setTimeout(45000);await page.setViewportSize({width:1440,height:1000});await page.route('**/api/enka/107590923',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/uid-107590923.json','utf8'))}));await page.goto('/');
    async function importObserved(){await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('107590923');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();if(await page.getByRole('button',{name:'全选',exact:true}).isEnabled())await page.getByRole('button',{name:'全选',exact:true}).click();await page.getByRole('button',{name:'确认导入 12 位角色',exact:true}).click();}
    await importObserved();const item=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.find((item:{real:{substats:{stat:string;value:number}[]}})=>item.real.substats.some(sub=>sub.stat==='critDamage' && Math.abs(sub.value-.342)<1e-8)));await page.getByTestId('workspace-nav-artifacts').click();await page.getByLabel('搜索圣遗物',{exact:true}).fill(item.name);const card=page.locator(`.inventory-card[data-artifact-id="${item.id}"]`);await card.click();const detail=page.locator('.artifact-detail-dialog');await detail.getByRole('button',{name:'另存',exact:true}).click();await card.click();const index=item.real.substats.findIndex((sub:{stat:string})=>sub.stat==='critDamage'),count=detail.getByRole('button',{name:`调整副词条 ${index+1} 强化次数`,exact:true});await expect(count).toHaveText('4');await count.click();await expect(count).toHaveText('5');await expect(detail.getByLabel(`副词条 ${index+1} 数值`,{exact:true})).toHaveValue('34.2');await detail.getByRole('button',{name:'保存',exact:true}).click();await page.keyboard.press('Escape');let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts);expect(saved.find((piece:{id:string})=>piece.id===item.id).rollSource).toBe('manual');await page.getByTestId('workspace-nav-characters').click();await importObserved();saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts);expect(saved.find((piece:{id:string})=>piece.id===item.id).real.substats[index].rolls).toBe(5);expect(saved.find((piece:{id:string})=>piece.id===item.id).rollSource).toBe('showcase');expect(saved.find((piece:{isCopy?:boolean})=>piece.isCopy).rollSource).toBe('inferred');
  });
});

test.describe('shared-artifact-references', () => {
  const source='.references/enka/official-example.json';
  test.skip(!existsSync(source),'Requires the recorded public showcase.');

  test('shared local equipment survives combination use and selected showcase sync',async({page})=>{
    test.setTimeout(60000);
    await page.setViewportSize({width:1440,height:1000});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(source,'utf8'))}));
    const account=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document);
    const combinations=()=>page.evaluate(()=>localStorage.getItem('leyline-artifact-combinations-0.2.0'));
    await page.goto('/');
    await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).pressSequentially('618285856');
    await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
    const imported=await account(),amber=imported.characters.find((role:{name:string})=>role.name==='安柏'),bennett=imported.characters.find((role:{name:string})=>role.name==='班尼特');
    expect(Object.keys(amber.equipment)).toHaveLength(5);expect(imported.artifacts).toHaveLength(20);
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();
    const role=page.getByRole('dialog',{name:'安柏',exact:true});
    await role.getByRole('button',{name:'本地',exact:true}).click();
    await role.getByRole('button',{name:'保存组合',exact:true}).click();
    await page.getByRole('dialog',{name:'保存组合',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
    const saved=await combinations();await page.keyboard.press('Escape');
    // Explicit UI trial of the recorded Amber set on Bennett, not an observed player build.
    await page.getByRole('button',{name:'查看班尼特详情',exact:true}).click();
    const target=page.getByRole('dialog',{name:'班尼特',exact:true});
    await target.getByRole('button',{name:'本地',exact:true}).click();
    await target.getByRole('button',{name:'应用组合',exact:true}).click();
    await page.getByRole('dialog',{name:'选择圣遗物组合',exact:true}).getByRole('button',{name:'应用组合',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'应用圣遗物组合？',exact:true})).toHaveCount(0);
    expect((await account()).characters.find((item:{id:string})=>item.id===bennett.id).equipment).toEqual(bennett.equipment);
    await target.getByRole('button',{name:'保存',exact:true}).click();await page.keyboard.press('Escape');
    const shared=await account();
    expect(shared.characters.find((item:{id:string})=>item.id===amber.id).equipment).toEqual(amber.equipment);
    expect(shared.characters.find((item:{id:string})=>item.id===bennett.id).equipment).toEqual(amber.equipment);
    await page.getByTestId('workspace-nav-artifacts').click();
    await page.locator(`.inventory-card[data-artifact-id="${amber.equipment.flower}"]`).click();
    const detail=page.locator('.artifact-detail-dialog');
    const references=detail.getByRole('group',{name:'角色',exact:true});
    await expect(references.getByRole('button')).toHaveCount(2);
    await expect(references).toContainText('安柏');await expect(references).toContainText('班尼特');
    await page.screenshot({path:'artifacts/shared-artifact-references.png',fullPage:true});
    await page.keyboard.press('Escape');await page.getByTestId('workspace-nav-characters').click();
    await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'导入班尼特',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'从角色展柜导入',exact:true})).toContainText('圣遗物新增 0 件，匹配 5 件');
    expect(await account()).toEqual(shared);
    await page.getByRole('button',{name:'确认导入 1 位角色',exact:true}).click();
    const synced=await account();
    expect(synced.characters.find((item:{id:string})=>item.id===amber.id).equipment).toEqual(amber.equipment);
    expect(synced.characters.find((item:{id:string})=>item.id===bennett.id).equipment).toEqual(bennett.equipment);
    expect(synced.artifacts).toEqual(shared.artifacts);expect(await combinations()).toBe(saved);
    await page.reload();await page.getByTestId('workspace-nav-characters').click();
    expect((await account()).characters.find((item:{id:string})=>item.id===bennett.id).equipment).toEqual(bennett.equipment);
    expect(errors).toEqual([]);
  });
});

test.describe('rarity-and-fields', () => {
  test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded four-character showcase.');
  test('catalog rarity filters, field validation and shared dropdowns preserve the manual draft',async({page})=>{
    test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});await page.goto('/');
    await page.getByRole('button',{name:'手动添加角色',exact:true}).click();const characters=page.getByRole('dialog',{name:'手动添加角色',exact:true});await characters.getByRole('button',{name:'筛选',exact:true}).click();const characterFilter=page.getByRole('dialog',{name:'筛选角色',exact:true});await expect(characterFilter.locator('.rarity-option')).toHaveText(['五星','四星']);await expect(characterFilter.locator('.rarity-option').first()).toHaveCSS('color','rgb(120, 88, 24)');await expect(characterFilter.locator('.rarity-option').last()).toHaveCSS('color','rgb(100, 69, 138)');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-artifacts').click();const before=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));await page.getByRole('button',{name:'手动添加圣遗物',exact:true}).click();const form=page.getByRole('dialog',{name:'手动添加圣遗物',exact:true}),trigger=form.getByRole('button',{name:'选择套装',exact:true});await form.getByRole('button',{name:'预览词条',exact:true}).click();await expect(trigger).toHaveAttribute('aria-invalid','true');await expect(trigger).toBeFocused();await expect(trigger).toHaveCSS('border-color','rgb(203, 114, 91)');await expect(form.getByRole('alert')).toHaveCount(0);
    await trigger.click();const sets=page.getByRole('dialog',{name:'选择套装',exact:true});await sets.getByRole('button',{name:'筛选',exact:true}).click();const filter=page.getByRole('dialog',{name:'筛选目录',exact:true});await expect(filter.locator('.rarity-option')).toHaveText(['五星','四星']);await filter.getByRole('button',{name:'四星',exact:true}).click();await filter.getByRole('button',{name:'完成',exact:true}).click();const cards=sets.locator('.catalog-browser-item');expect(await cards.count()).toBeGreaterThan(1);await expect(cards.locator('.game-icon').first()).toHaveCSS('background-color','rgb(239, 232, 248)');expect(await cards.evaluateAll(nodes=>nodes.every(node=>node.getAttribute('data-rarity')==='4'))).toBe(true);const offsets=await cards.evaluateAll(nodes=>nodes.map(node=>node.querySelector('.game-icon')!.getBoundingClientRect().top-node.getBoundingClientRect().top));expect(Math.max(...offsets)-Math.min(...offsets)).toBeLessThan(.5);await page.screenshot({path:'artifacts/rarity-four-star-catalog.png',fullPage:true});await sets.getByLabel('搜索套装',{exact:true}).fill('教官');await sets.getByRole('button',{name:'教官',exact:true}).click();await expect(trigger).not.toHaveAttribute('aria-invalid','true');await expect(trigger).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(trigger).toHaveCSS('font-weight','700');await expect(trigger).toHaveCSS('font-size','16px');await expect(trigger.locator('.game-icon')).toHaveCSS('background-color','rgb(239, 232, 248)');
    await expect(form.getByLabel('星级',{exact:true})).toContainText('四星');await expect(form.getByLabel('强化等级',{exact:true})).toHaveValue('16');await expect(form.getByRole('button',{name:'提高强化等级',exact:true})).toBeDisabled();await expect(form.getByRole('status',{name:'主词条数值',exact:true})).toContainText('3571');await form.getByLabel('部位',{exact:true}).click();const slots=form.getByRole('group',{name:'部位选项',exact:true});await expect(slots.locator('.game-icon.artifactSlots')).toHaveCount(5);await slots.getByRole('button',{name:'空之杯',exact:true}).click();await expect(form.getByLabel('部位',{exact:true})).toContainText('空之杯');await form.getByLabel('副词条 1',{exact:true}).click();await form.getByRole('group',{name:'副词条 1选项',exact:true}).getByRole('button',{name:'暴击伤害',exact:true}).click();const value=form.getByLabel('副词条 1 数值',{exact:true});await value.focus();await expect(value).toHaveCSS('outline-style','none');await expect(value.locator('..')).toHaveCSS('outline-width','2px');await expect(value.locator('..')).toHaveCSS('height','40px');await form.getByLabel('强化等级',{exact:true}).focus();await expect(form.locator('.number-stepper')).toHaveCSS('outline-width','2px');await page.setViewportSize({width:390,height:844});await auditDialog(form,'content');expect(await form.getByLabel('部位',{exact:true}).locator('> span:not(.game-icon)').evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await form.getByLabel('部位',{exact:true}).click();const narrowMenu=form.getByRole('group',{name:'部位选项',exact:true});const menuBox=await narrowMenu.boundingBox(),dialogBox=await form.boundingBox();expect(menuBox!.x+menuBox!.width).toBeLessThanOrEqual(dialogBox!.x+dialogBox!.width);expect(menuBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);await page.keyboard.press('Escape');await page.screenshot({path:'artifacts/rarity-shared-fields-narrow.png',fullPage:true});await form.getByRole('button',{name:'取消',exact:true}).click();await expect(form).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(before);
  });
  test('artifact detail shares the relaxed portrait and groups references without empty prose',async({page})=>{
    test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),amber=initial.characters.find((item:{name:string})=>item.name==='安柏'),id=amber.equipment.flower;await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'生之花',exact:true}).click();const card=page.locator(`.inventory-card[data-artifact-id="${id}"]`);await card.click();const detail=page.locator('.artifact-detail-dialog');await expect(detail.locator('.artifact-portrait')).toHaveCSS('width','112px');await expect(detail.locator('.artifact-portrait')).toHaveCSS('height','112px');await expect(detail.getByText('来源与实物身份',{exact:true})).toHaveCount(0);await expect(detail.locator('.reference-row h4')).toHaveText(['角色','角色配置','圣遗物组合']);await expect(detail.getByRole('group',{name:'角色',exact:true}).getByRole('button')).toHaveCount(1);await page.screenshot({path:'artifacts/rarity-detail-grouped-references.png',fullPage:true});await detail.getByRole('button',{name:'另存',exact:true}).click();const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document),copy=current.artifacts.find((item:{isCopy?:boolean})=>item.isCopy);expect(copy.real.substats).toEqual(initial.artifacts.find((item:{id:string})=>item.id===id).real.substats);await page.locator(`.inventory-card[data-artifact-id="${copy.id}"]`).click();await expect(detail.locator('.artifact-references')).toHaveCount(0);await expect(detail).not.toContainText('暂无角色、配置或组合引用');await page.setViewportSize({width:390,height:844});await auditDialog(detail,'editor');
  });
});

test.describe('viewport-inventory', () => {
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires the user recorded Mona inventory.');
  test('actual inventory: fixed rows, multi-select matching, release order and transparent compact badges',async({page})=>{
    await page.setViewportSize({width:1440,height:900});
    await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();
    await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
    await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));
    await page.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();
    const baseline=await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'));
    const cards = page.locator('.inventory-card');
    await cards.first().hover();
    await expect(cards.first()).toHaveCSS('border-top-color', 'rgb(76, 169, 139)');
    await expect(cards.first().locator('.card-replace-mark')).toHaveCount(0);
    const rows = () => cards.evaluateAll(items => new Set(items.map(item => Math.round(item.getBoundingClientRect().top))).size);
    await expect.poll(rows).toBe(8);
    await page.getByRole('button', { name: '疏松', exact: true }).click();
    await expect.poll(rows).toBe(5);
    const relaxed = await cards.count();
    await page.setViewportSize({ width: 1440, height: 600 });
    await expect.poll(rows).toBe(5);
    await expect(cards).toHaveCount(relaxed);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    const first = await cards.first().getAttribute('aria-label');
    await page.getByRole('spinbutton',{name:'顶部页码',exact:true}).fill('2');
    const stepper=page.getByRole('navigation',{name:'顶部列表分页',exact:true}).locator('.number-stepper');
    await expect(stepper.getByRole('button',{name:'降低顶部页码',exact:true})).toBeVisible();await expect(stepper.getByRole('button',{name:'提高顶部页码',exact:true})).toBeVisible();
    await stepper.getByRole('button').first().click();
    await expect(page.getByRole('spinbutton',{name:'顶部页码',exact:true})).toHaveValue('1');
    await stepper.getByRole('button').last().click();
    await expect(page.getByRole('spinbutton',{name:'顶部页码',exact:true})).toHaveValue('2');
    await expect(page.getByRole('navigation',{name:'底部列表分页',exact:true}).getByRole('spinbutton')).toHaveCount(1);
    await expect(page.getByRole('navigation',{name:'顶部列表分页',exact:true}).getByRole('button',{name:'上一页',exact:true})).toHaveCount(1);
    await expect(cards.first()).not.toHaveAttribute('aria-label', first!);
    const anchor = await cards.first().getAttribute('data-artifact-id');
    await page.getByRole('button', { name: '紧凑', exact: true }).click();
    await expect.poll(rows).toBe(8);
    await expect(page.locator(`.inventory-card[data-artifact-id="${anchor}"]`)).toHaveCount(1);
    const compact = await cards.count();
    await page.setViewportSize({ width: 1440, height: 1150 });
    await expect.poll(rows).toBe(8);
    await expect(cards).toHaveCount(compact);
    await expect(page.locator('.inventory-card .artifact-level').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(page.locator('.inventory-card .compact-main').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await page.screenshot({path:'artifacts/inventory-viewport-compact.png',fullPage:true});
    await page.getByRole('button',{name:'筛选',exact:true}).click();
    const filter=page.getByRole('dialog',{name:'筛选圣遗物',exact:true});
    await expect(filter.getByText('同组满足任一项，不同分组同时满足。',{exact:true})).toHaveCount(0);
    await expect(filter.locator('.artifact-filter-panel section').last().getByRole('heading')).toHaveText('装备占用');
    await expect(filter.getByRole('group',{name:'常用强化等级',exact:true}).getByRole('button')).toHaveText(['+16','+20']);
    await expect(filter.getByRole('group',{name:'筛选主词条',exact:true})).toContainText('物理伤害加成');
    await expect(filter.getByRole('group',{name:'筛选主词条',exact:true})).toContainText('元素充能效率');
    await expect(filter.getByRole('group',{name:'筛选主词条',exact:true})).toContainText('风元素伤害加成');
    await filter.getByLabel('筛选强化等级',{exact:true}).click();
    await filter.getByRole('group',{name:'筛选强化等级选项',exact:true}).getByRole('button',{name:'+20',exact:true}).click();
    await filter.getByRole('button',{name:'完成选择',exact:true}).click();
    await expect(filter.getByLabel('筛选强化等级',{exact:true})).toContainText('+20');
    await filter.getByRole('button',{name:'重置筛选',exact:true}).click();

    const subs=filter.getByRole('group',{name:'筛选副词条',exact:true});
    for(const [label,icon] of [['生命值','hpPercent'],['攻击力','attackPercent'],['防御力','defensePercent']])await expect(subs.getByRole('button',{name:label,exact:true}).locator('.stat-label')).toHaveAttribute('data-stat',icon);
    await subs.getByRole('button',{name:'暴击率',exact:true}).click();await subs.getByRole('button',{name:'暴击伤害',exact:true}).click();
    const expected=await page.evaluate(()=>{
      const items=JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts;
      return {all:items.filter((item:any)=>['critRate','critDamage'].every(stat=>item.real.substats.some((sub:any)=>sub.stat===stat))).length,any:items.filter((item:any)=>item.real.substats.some((sub:any)=>['critRate','critDamage'].includes(sub.stat))).length};
    });
    await expect(page.locator('.artifact-browser .library-result-count')).toContainText(`${expected.all} 件圣遗物`);
    await filter.getByRole('group',{name:'副词条匹配方式',exact:true}).getByRole('button',{name:'任一',exact:true}).click();
    await expect(page.locator('.artifact-browser .library-result-count')).toContainText(`${expected.any} 件圣遗物`);
    await filter.getByRole('button',{name:'重置筛选',exact:true}).click();
    await filter.getByLabel('筛选套装',{exact:true}).click();
    const setChoices=filter.getByRole('group',{name:'筛选套装选项',exact:true}).getByRole('button');
    const names=[await setChoices.nth(0).getAttribute('aria-label'),await setChoices.nth(1).getAttribute('aria-label')];
    const releaseCatalog=JSON.parse(readFileSync('src/game-data/data/tables/catalog-release-metadata.json','utf8')).artifacts;
    const expectedFirst=await page.evaluate(meta=>{const ids=[...new Set(JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts.map((item:any)=>item.real.setId))] as string[];return ids.map(id=>meta[id]).filter(Boolean).sort((a:any,b:any)=>{const av=a.version.split('.').map(Number),bv=b.version.split('.').map(Number);return bv[0]-av[0] || bv[1]-av[1] || b.gameId-a.gameId;})[0].name;},releaseCatalog);
    expect(names[0]).toBe(expectedFirst);
    await setChoices.nth(0).click();await setChoices.nth(1).click();
    await expect(filter.getByLabel('筛选套装',{exact:true})).toContainText('已选 2 项');
    await filter.getByRole('button',{name:'完成选择',exact:true}).click();
    await page.screenshot({path:'artifacts/inventory-multi-filter.png',fullPage:true});
    await filter.getByRole('button',{name:'完成',exact:true}).click();
    expect(names.every(Boolean)).toBe(true);
    await page.getByRole('button',{name:'清除筛选',exact:true}).click();
    await page.getByRole('button',{name:'排序',exact:true}).click();
    await expect(page.getByRole('button',{name:'名称',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'实装版本',exact:true}).click();
    await page.getByRole('button',{name:'完成',exact:true}).click();
    const metadata=JSON.parse(readFileSync('src/game-data/data/tables/catalog-release-metadata.json','utf8')).artifacts;
    const expectedSet=await page.evaluate(meta=>{
      const items=JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.artifacts;
      return items.map((item:any)=>meta[item.real.setId]).filter(Boolean).sort((a:any,b:any)=>{
        const av=a.version.split('.').map(Number),bv=b.version.split('.').map(Number);
        return bv[0]-av[0] || bv[1]-av[1] || b.gameId-a.gameId;
      })[0].name;
    },metadata);
    expect(await page.locator('.inventory-card .artifact-summary').first().getAttribute('title')).toContain(expectedSet);
    await page.setViewportSize({width:390,height:844});
    await expect.poll(rows).toBe(8);
    await expect(cards).toHaveCount(8);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'artifacts/inventory-viewport-mobile.png',fullPage:true});
    await page.getByRole('spinbutton',{name:'顶部页码',exact:true}).fill('37');
    await expect(page.locator('.inventory-card')).not.toHaveCount(0);
    await page.getByRole('button',{name:'打开功能导航',exact:true}).click();await page.getByTestId('workspace-nav-combinations').click();
    await page.getByRole('button',{name:'打开功能导航',exact:true}).click();await page.getByTestId('workspace-nav-artifacts').click();
    await expect(page.getByRole('spinbutton',{name:'顶部页码',exact:true})).toHaveValue('37');
    await expect.poll(rows).toBe(8);
    const topPage = page.getByRole('spinbutton', { name: '顶部页码', exact: true });
    await topPage.fill((await topPage.getAttribute('max'))!);
    await topPage.press('Tab');
    await expect(cards).toHaveCount(458 % 8);
    await page.getByRole('button',{name:'打开功能导航',exact:true}).click();await page.getByTestId('workspace-nav-combinations').click();
    await page.setViewportSize({width:1440,height:900});await page.getByTestId('workspace-nav-artifacts').click();
    await expect.poll(()=>page.getByRole('spinbutton',{name:'顶部页码',exact:true}).evaluate((node:HTMLInputElement)=>Number(node.value)<=Number(node.max))).toBe(true);
    await expect(page.locator('.inventory-card')).not.toHaveCount(0);

    expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.2.0'))).toBe(baseline);
    await page.setViewportSize({width:1280,height:900});
    await page.getByTestId('workspace-nav-characters').click();
    await restoreRecordedNoteSetup(page);
    await page.getByRole('button',{name:'查看琴详情',exact:true}).click();
    const role=page.getByRole('dialog',{name:'琴',exact:true});
    const placeholder=role.locator('.weapon-placeholder.add');
    await expect(placeholder).toBeVisible();
    expect(await placeholder.locator('.weapon-placeholder-icon').evaluate(node=>getComputedStyle(node).maskImage)).toContain('crystal-link-generalattack.webp');
    await expect(placeholder.locator('svg')).toHaveCSS('width','36px');
    await page.screenshot({path:'artifacts/weapon-placeholder-detail.png',fullPage:true});
  });


  test('recorded showcase: shared effective attributes, weapon placeholder and role roll ordering',async({page})=>{
    test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');
    await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();
    await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
    await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
    await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();await page.keyboard.press('Escape');
    const characterCard = page.getByRole('button',{name:'查看安柏详情',exact:true});
    await characterCard.scrollIntoViewIfNeeded();
    const restingBox = await characterCard.boundingBox();
    const restingSurface = await characterCard.evaluate(node => [getComputedStyle(node).borderLeftColor, getComputedStyle(node).backgroundColor, getComputedStyle(node).boxShadow]);
    await characterCard.hover();
    await expect(characterCard).toHaveCSS('border-top-width','3px');
    await expect(characterCard).toHaveCSS('border-top-color','rgb(76, 169, 139)');
    await expect(characterCard).toHaveCSS('transform','none');
    expect(await characterCard.boundingBox()).toEqual(restingBox);
    expect(await characterCard.evaluate(node => [getComputedStyle(node).borderLeftColor, getComputedStyle(node).backgroundColor, getComputedStyle(node).boxShadow])).toEqual(restingSurface);
    await characterCard.click();
    const role=page.getByRole('dialog',{name:'安柏',exact:true});
    const localHeights=await role.locator('.equipment-list > article').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
    await role.getByRole('heading',{name:'安柏',exact:true}).hover();
    const sideColor=await role.locator('.equipment-list > article').first().evaluate(node=>getComputedStyle(node).borderLeftColor);
    const restingShadow=await role.locator('.equipment-list > article').first().evaluate(node=>getComputedStyle(node).boxShadow);
    const detailTarget=role.getByRole('button',{name:'查看生之花详情',exact:true});
    const replaceTarget=role.getByRole('button',{name:'替换生之花',exact:true});
    const replaceMark = replaceTarget.locator('.card-replace-mark');
    await expect(replaceMark).toBeHidden();
    await detailTarget.hover();
    await expect(role.locator('.equipment-list > article').first()).toHaveCSS('border-top-color','rgb(76, 169, 139)');
    await expect(detailTarget).toHaveCSS('box-shadow','none');
    await expect(detailTarget).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await role.getByRole('heading',{name:'安柏',exact:true}).hover();
    await replaceTarget.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(detailTarget).toBeFocused();
    await expect(detailTarget).toHaveCSS('outline-style','none');
    await expect(role.locator('.equipment-list > article').first()).toHaveCSS('border-top-color','rgb(76, 169, 139)');
    await replaceTarget.hover();
    await expect(replaceMark).toBeVisible();
    await expect(replaceMark).toHaveCSS('border-top-style','none');
    await expect(replaceMark).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(role.locator('.equipment-list > article').first()).toHaveCSS('border-top-color','rgb(79, 145, 197)');
    await expect(replaceTarget.locator('.card-replace-layer')).toHaveCSS('box-shadow',/rgb\(79, 145, 197\)/);
    await expect(role.locator('.equipment-list > article').first()).toHaveCSS('border-left-color',sideColor);
    await expect(role.locator('.equipment-list > article').first()).toHaveCSS('box-shadow',restingShadow);
    await detailTarget.hover();
    await expect(replaceMark).toBeHidden();
    await role.getByRole('button',{name:'展柜',exact:true}).click();
    await expect(role.locator('.equipment-list .card-replace-mark')).toHaveCount(0);
    expect(await role.locator('.equipment-list > article').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height))).toEqual(localHeights);
    const stats=role.getByRole('group',{name:'有效词条',exact:true});
    await expect(stats.locator('[data-roll-stat]')).toHaveCount(7);
    const counts=await stats.locator('dd').allTextContents();expect(counts.some(text=>parseFloat(text)>0)).toBe(true);
    const attack=stats.getByRole('button',{name:'有效词条攻击力',exact:true});
    await attack.click();const selected=await attack.getAttribute('aria-pressed');
    await role.getByRole('button',{name:'本地',exact:true}).click();
    await expect(stats.getByRole('button',{name:'有效词条攻击力',exact:true})).toHaveAttribute('aria-pressed',selected!);
    await role.getByRole('button',{name:'展柜',exact:true}).click();
    await page.screenshot({path:'artifacts/showcase-effective-attributes.png',fullPage:true});
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'排序',exact:true}).click();
    await expect(page.getByRole('button',{name:'装备数量',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'有效词条数',exact:true}).click();
  });
});

test.describe('single-pick', () => {
  test.use({hasTouch:true});
  test('recorded showcase stays in the library; shared artifact pickers select once and keep effective preferences scoped',async({page})=>{
    test.skip(!existsSync('.references/enka/official-example.json'),'Requires recorded public showcase.');test.setTimeout(60000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));
    await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await page.getByRole('button',{name:'同时导入本地库',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.character-card')).toHaveCount(4);
    await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});await role.getByRole('button',{name:'有效词条生命值',exact:true}).click();
    const flowerId=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.2.0')!).document.characters.find((c:{name:string})=>c.name==='安柏').equipment.flower);
    const picker=page.getByRole('dialog',{name:'选择生之花',exact:true});
    await page.setViewportSize({width:390,height:844});
    const body=role.getByRole('button',{name:'查看生之花详情',exact:true}),icon=role.getByRole('button',{name:'替换生之花',exact:true});
    await body.tap();
    await expect(page.locator('.artifact-detail-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await icon.tap();
    await expect(picker.locator('.inventory-card').first()).toHaveAttribute('data-density','compact');
    await picker.getByRole('button',{name:'卸下',exact:true}).tap();
    await role.getByRole('button',{name:'装备生之花',exact:true}).tap();
    await picker.locator(`.inventory-card:not([data-artifact-id="${flowerId}"])`).first().tap();
    await expect(picker).toHaveCount(0);await expect(body).toBeVisible();
    await page.setViewportSize({width:1440,height:1000});
    await role.getByRole('button',{name:'保存',exact:true}).click();await expect(role.getByText('已保存首选配置，展柜快照保持不变。',{exact:true})).toHaveCount(0);await expect(role.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
    await role.getByRole('button',{name:'替换生之花',exact:true}).click();const roleBounds=await picker.boundingBox();const roleRemove=await picker.getByRole('button',{name:'卸下',exact:true}).boundingBox();expect(roleRemove!.width).toBeLessThanOrEqual(80);await page.screenshot({path:'artifacts/role-single-click-picker.png',fullPage:true});await page.keyboard.press('Escape');await expect(role).toBeVisible();
    await role.getByRole('button',{name:'保存组合',exact:true}).click();const combo=page.getByRole('dialog',{name:'保存组合',exact:true});await combo.getByRole('button',{name:'查看生之花详情',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'替换',exact:true}).click();await expect(picker.locator('.inventory-card').first()).toBeVisible();const comboBounds=await picker.boundingBox();const comboRemove=await picker.getByRole('button',{name:'卸下',exact:true}).boundingBox();expect(comboBounds!.width).toBe(roleBounds!.width);expect(comboRemove!.width).toBe(roleRemove!.width);
    const columns=await picker.locator('.inventory-card').evaluateAll(cards=>cards.slice(0,3).map(card=>card.getBoundingClientRect().top));expect(new Set(columns).size).toBe(1);await page.screenshot({path:'artifacts/combination-single-click-picker.png',fullPage:true});await picker.locator('.inventory-card').first().click();await expect(picker).toHaveCount(0);await combo.getByRole('button',{name:'保存',exact:true}).click();
    const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!));expect(original[0].stats).toContain('hp');
    await role.getByRole('button',{name:'有效词条生命值',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!))).toEqual(original);
    // A transparent UI trial changes C6 to C5 from the same recorded character, without claiming a player export.
    await role.getByRole('button',{name:'5命',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await expect(role.getByRole('button',{name:'有效词条生命值',exact:true})).toHaveAttribute('aria-pressed','false');
    await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();await page.getByRole('dialog',{name:'安柏的配置',exact:true}).getByRole('button',{name:'选择安柏首选配置',exact:true}).click();await expect(role.getByRole('button',{name:'有效词条生命值',exact:true})).toHaveAttribute('aria-pressed','false');await page.keyboard.press('Escape');
    await page.getByTestId('workspace-nav-combinations').click();await page.getByRole('button',{name:/^查看组合：/}).click();const editing=page.getByRole('dialog',{name:'编辑组合',exact:true});await expect(editing.getByRole('button',{name:'有效词条生命值',exact:true})).toHaveAttribute('aria-pressed','true');await editing.getByRole('button',{name:'安柏',exact:true}).click();const reference=page.getByRole('dialog',{name:'选择参考角色',exact:true});await reference.getByLabel('搜索参考角色',{exact:true}).fill('安柏');await reference.getByRole('button',{name:'选择安柏',exact:true}).click();await expect(editing.getByRole('button',{name:'有效词条生命值',exact:true})).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!))).toEqual(original);
    await editing.getByRole('button',{name:'保存',exact:true}).click();expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.2.0')!)))[0].stats).not.toContain('hp');expect(errors).toEqual([]);
  });
});
