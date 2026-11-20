import { recordedJsonFile } from '../../helpers/recorded-reference';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {restoreRecordedNoteSetup} from '../../helpers/recorded-note-setup';
test('configuration navigation on the actual note-linked inventory records click-to-paint and CPU samples',async({page,context,browserName})=>{
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual recorded Mona inventory.');
  test.setTimeout(45000);await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));await page.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();await restoreRecordedNoteSetup(page);await page.getByTestId('workspace-nav-characters').click();await expect(page.locator('.character-cards > button').first()).toBeVisible();
  const original=await page.evaluate(()=>localStorage.getItem('leyline-account-0.1.0')),session=browserName==='chromium'?await context.newCDPSession(page):undefined,timings:number[]=[];if(session){await session.send('Profiler.enable');await session.send('Profiler.start');}
  for(let index=0;index<3;index++){
    const start=await page.evaluate(()=>performance.now());await page.getByTestId('workspace-nav-loadouts').click();await expect(page.locator('.configuration-row')).toHaveCount(10);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));timings.push(await page.evaluate(()=>performance.now())-start);await page.getByTestId('workspace-nav-characters').click();
  }
  const profile=session?(await session.send('Profiler.stop')).profile:undefined;await session?.detach();const samples=profile?.nodes.map(node=>({name:node.callFrame.functionName,url:node.callFrame.url,hits:node.hitCount ?? 0})).sort((a,b)=>b.hits-a.hits).slice(0,35) ?? [];
  const report={source:'458 actual Mona items; characters restored only from recorded wear notes, no invented cultivation',timingsMs:timings,cpuProfile:session?'recorded':'CDP unavailable in this browser; navigation timing only',averageMs:timings.reduce((a,b)=>a+b,0)/timings.length,samples};writeFileSync(`artifacts/config-navigation-${process.env.LEYLINE_PROFILE_PHASE==='before'?'before':'after'}-${browserName}.json`,JSON.stringify(report,null,2));console.log('configuration click-to-paint ms',timings.map(Math.round));expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.1.0'))).toBe(original);
});

async function sampleCharacterDetail(page:Page,context:BrowserContext,browserName:string) {
  const card=page.locator('.character-cards > button').first();
  const detail=page.locator('.character-detail-dialog');
  await card.click();await expect(detail).toBeVisible();await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const samples:number[]=[];
    Object.assign(window,{characterDetailSamples:samples});
    document.addEventListener('click',event=>{
      if(!(event.target instanceof Element) || !event.target.closest('.character-cards > button'))return;
      const start=performance.now();
      requestAnimationFrame(()=>requestAnimationFrame(()=>samples.push(performance.now()-start)));
    },true);
  });
  const session=browserName==='chromium'?await context.newCDPSession(page):undefined;
  if(session){await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:250});await session.send('Profiler.start');}
  for(let index=0;index<10;index++){
    await card.click();await expect(detail).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'characterDetailSamples').length)).toBe(index+1);
    await page.keyboard.press('Escape');await expect(detail).toHaveCount(0);
  }
  const profile=session?(await session.send('Profiler.stop')).profile:undefined;
  await session?.detach();
  const timings=await page.evaluate(()=>Reflect.get(window,'characterDetailSamples') as number[]);
  const sorted=[...timings].sort((a,b)=>a-b);
  const midpoint=(sorted.length-1)/2;
  const medianPaintMs=(sorted[Math.floor(midpoint)]+sorted[Math.ceil(midpoint)])/2;
  const nodes=new Map(profile?.nodes.map(node=>[node.id,node]) ?? []);
  const parents=new Map(profile?.nodes.flatMap(node=>node.children?.map(child=>[child,node.id] as const) ?? []) ?? []);
  const cpu=new Map<string,number>();
  for(const id of profile?.samples ?? []) {
    let node=nodes.get(id);
    while(node){
      const {functionName,url}=node.callFrame;
      if(url.includes('/src/') && functionName){
        const name=functionName+' '+url.split('?')[0].split('/').slice(-2).join('/');
        cpu.set(name,(cpu.get(name) ?? 0)+1);
      }
      node=nodes.get(parents.get(node.id) ?? 0);
    }
  }
  return {timings,medianPaintMs,cpu:[...cpu.entries()].sort((a,b)=>b[1]-a[1]).slice(0,24)};
}

test('warm character detail opens on recorded Mona inventory and Enka builds',async({page,context,browserName},info)=>{
  const mona='.references/artifacts_mona.json',enka='.references/enka/official-example.json';
  test.skip(!existsSync(enka),'Requires the recorded public showcase.');
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:1000});
  const report:Record<string,unknown>={environment:{browser:browserName,viewport:page.viewportSize(),node:process.version},warmupOpens:1};
  if(existsSync(mona)){
    const inventoryPage=await context.browser()!.newPage({viewport:page.viewportSize()!});
    try{
      await inventoryPage.goto(new URL('/',String(info.project.use.baseURL)).href);
      await inventoryPage.getByTestId('workspace-nav-artifacts').click();
      await inventoryPage.getByRole('button',{name:'莫娜导入',exact:true}).click();
      await inventoryPage.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile(mona));
      await inventoryPage.getByRole('button',{name:'确认导入 458 件圣遗物',exact:true}).click();
      await restoreRecordedNoteSetup(inventoryPage);
      report.mona={source:mona,...await sampleCharacterDetail(inventoryPage,inventoryPage.context(),browserName)};
    }finally{await inventoryPage.close();}
  }else report.mona={status:'skipped',source:mona};
  await page.route('**/api/enka/618285856',route=>route.fulfill({json:JSON.parse(readFileSync(enka,'utf8'))}));
  await page.goto('/');
  await page.getByRole('button',{name:'展柜导入',exact:true}).click();
  await page.getByLabel('游戏 UID',{exact:true}).fill('618285856');
  await page.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await page.getByRole('button',{name:'确认导入 4 位角色',exact:true}).click();
  const original=await page.evaluate(()=>localStorage.getItem('leyline-account-0.1.0'));
  report.enka={source:enka,...await sampleCharacterDetail(page,context,browserName)};
  const phase=process.env.LEYLINE_PROFILE_PHASE==='before'?'before':'after';
  writeFileSync(`artifacts/character-detail-${phase}-${browserName}.json`,JSON.stringify(report,null,2));
  expect(await page.evaluate(()=>localStorage.getItem('leyline-account-0.1.0'))).toBe(original);
});
