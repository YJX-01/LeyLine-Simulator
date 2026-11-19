import {existsSync,readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
import {prepareRecordedAmberConfiguration} from '../../helpers/recorded-amber-configuration';
import {auditDialog} from '../../helpers/ui-contract-audit';
test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded public showcase.');
test('shared triangle favorites, one favorite action, unique copies, return links and deletion preserve detached equipment',async({page})=>{
  test.setTimeout(60000);page.setDefaultTimeout(8000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1000});const role=await prepareRecordedAmberConfiguration(page);
  await role.getByRole('button',{name:'管理生之花',exact:true}).press('Shift+F10');await expect(page.getByRole('menuitem')).toHaveText(['查看详情','替换','卸下']);await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();const detail=page.locator('.artifact-detail-dialog[open]');await expect(detail).toBeVisible();await page.keyboard.press('Escape');await expect(role).toBeVisible();
  await role.getByRole('button',{name:'管理生之花',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'卸下',exact:true}).click();await expect(role.getByRole('button',{name:'装备生之花',exact:true})).toBeVisible();await role.getByRole('button',{name:'还原',exact:true}).click();
  await role.getByRole('button',{name:'5命',exact:true}).click();await role.getByRole('button',{name:'另存',exact:true}).click();await page.getByRole('button',{name:'确认另存',exact:true}).click();await expect(page.getByRole('dialog',{name:'另存角色配装方案',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(role).toHaveCount(0);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.1.0')!).document),amber=before.characters.find((item:{name:string})=>item.name==='安柏'),id=amber.equipment.flower;
  await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'生之花',exact:true}).click();const card=page.locator(`.inventory-card[data-artifact-id="${id}"]`);await card.click({button:'right'});await expect(page.getByRole('menuitem')).toHaveText(['查看详情','收藏','删除']);await page.getByRole('menuitem',{name:'收藏',exact:true}).click();await expect(card.locator('.favorite-mark')).toHaveAttribute('data-level','1');await card.click();await detail.getByRole('button',{name:'设置圣遗物收藏',exact:true}).click();await expect(detail.locator('.favorite-mark')).toHaveAttribute('data-level','2');await expect(detail.locator('.artifact-favorite .corner-badge')).toHaveCount(0);await auditDialog(detail,'editor');
  for(const kind of ['组合','角色','备选']){await detail.getByRole('group',{name:kind==='组合'?'圣遗物组合':kind==='角色'?'角色':'角色配置',exact:true}).getByRole('button').first().click();await expect(detail).toHaveCount(0);await expect(page.getByRole('dialog',{name:kind==='组合'?'编辑组合':'安柏',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#workspace-main')).toHaveAttribute('aria-label','圣遗物');await expect(detail).toBeVisible();}
  const originalAlias=await detail.getByLabel('圣遗物别名',{exact:true}).inputValue();for(let index=0;index<2;index++){await detail.getByRole('button',{name:'另存',exact:true}).click();await card.click();}const copies=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.1.0')!).document.artifacts.filter((item:{alias?:string})=>item.alias?.includes('副本')));expect(copies.length).toBe(2);expect(new Set(copies.map((item:{alias:string})=>item.alias)).size).toBe(2);await expect(detail.getByLabel('圣遗物别名',{exact:true})).toHaveValue(originalAlias);
  await detail.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除圣遗物？',exact:true}).getByRole('button',{name:'删除',exact:true}).click();await expect(detail).toHaveCount(0);const group=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-artifact-combinations-0.1.0')!)[0]);const detached=group.items.find((item:{inventoryId?:null})=>item.inventoryId===null);expect(detached).toBeTruthy();expect(detached.id).not.toBe(id);expect(detached.real.source).toBeUndefined();
  await page.getByTestId('workspace-nav-combinations').click();await expect(page.locator('.unstored-badge')).toHaveText('未入库');await page.locator('.combination-open').click();const editor=page.getByRole('dialog',{name:'编辑组合',exact:true});await expect(editor.locator('.unstored-badge')).toHaveText('未入库');await editor.getByRole('button',{name:'有效词条暴击伤害',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);await page.screenshot({path:'artifacts/artifact-detached-combination.png',fullPage:true});expect(errors).toEqual([]);
});
test('showcase import defaults to merging, snapshot-only stays available, and context imports one slot',async({page})=>{
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync('.references/enka/official-example.json','utf8'))}));await page.goto('/');await page.getByRole('button',{name:'展柜导入',exact:true}).click();await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();await expect(page.getByRole('button',{name:'同时导入本地库',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'仅保存展柜',exact:true}).click();await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.1.0')!).document.artifacts.length)).toBe(0);
  await page.getByRole('button',{name:'查看安柏详情',exact:true}).click();const role=page.getByRole('dialog',{name:'安柏',exact:true});await role.getByRole('button',{name:'展柜',exact:true}).click();await role.getByRole('button',{name:'管理生之花',exact:true}).click({button:'right'});await expect(page.getByRole('menuitem')).toHaveText(['查看详情','入库']);await page.getByRole('menuitem',{name:'入库',exact:true}).click();await page.getByRole('dialog',{name:'入库圣遗物？',exact:true}).getByRole('button',{name:'入库',exact:true}).click();const account=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.1.0')!).document);expect(account.artifacts).toHaveLength(1);expect(account.artifacts[0].slot).toBe('flower');expect(account.artifacts[0].rollSource).toBe('showcase');expect(account.characters.find((item:{name:string})=>item.name==='安柏').equipment).toEqual({});
});

test('reference links keep the latest five origins and protect an evicted draft',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:1280,height:760});
  const role=await prepareRecordedAmberConfiguration(page);
  const account=await page.evaluate(()=>localStorage.getItem('leyline-account-0.1.0')!);
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
      await editor.getByRole('button',{name:'管理生之花',exact:true}).click();
    }else{
      await role.getByRole('button',{name:'管理生之花',exact:true}).press('Shift+F10');
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
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.1.0'))).toBe(account);
  await sixth.click();
  await confirmation.getByRole('button',{name:'保存',exact:true}).click();
  await expect(main).toHaveAttribute('aria-label',destinations[5]);
  await role.getByRole('button',{name:'管理生之花',exact:true}).press('Shift+F10');
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
