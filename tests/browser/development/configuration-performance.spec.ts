import { recordedJsonFile } from '../../helpers/recorded-reference';
import {existsSync,writeFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
import {restoreRecordedNoteSetup} from '../../helpers/recorded-note-setup';
test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual recorded Mona inventory.');
test('configuration navigation on the actual note-linked inventory records click-to-paint and CPU samples',async({page,context,browserName})=>{
  test.setTimeout(45000);await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(recordedJsonFile('.references/artifacts_mona.json'));await page.getByRole('button',{name:'确认导入 458 件五星圣遗物',exact:true}).click();await restoreRecordedNoteSetup(page);await page.getByTestId('workspace-nav-characters').click();await expect(page.locator('.character-cards > button').first()).toBeVisible();
  const original=await page.evaluate(()=>localStorage.getItem('leyline-account-v2')),session=browserName==='chromium'?await context.newCDPSession(page):undefined,timings:number[]=[];if(session){await session.send('Profiler.enable');await session.send('Profiler.start');}
  for(let index=0;index<3;index++){
    const start=await page.evaluate(()=>performance.now());await page.getByTestId('workspace-nav-loadouts').click();await expect(page.locator('.configuration-row')).toHaveCount(5);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));timings.push(await page.evaluate(()=>performance.now())-start);await page.getByTestId('workspace-nav-characters').click();
  }
  const profile=session?(await session.send('Profiler.stop')).profile:undefined;await session?.detach();const samples=profile?.nodes.map(node=>({name:node.callFrame.functionName,url:node.callFrame.url,hits:node.hitCount ?? 0})).sort((a,b)=>b.hits-a.hits).slice(0,35) ?? [];
  const report={source:'458 actual Mona items; characters restored only from recorded wear notes, no invented cultivation',timingsMs:timings,cpuProfile:session?'recorded':'CDP unavailable in this browser; navigation timing only',averageMs:timings.reduce((a,b)=>a+b,0)/timings.length,samples};writeFileSync(`artifacts/config-navigation-${process.env.LEYLINE_PROFILE_PHASE==='before'?'before':'after'}-${browserName}.json`,JSON.stringify(report,null,2));console.log('configuration click-to-paint ms',timings.map(Math.round));expect(await page.evaluate(()=>localStorage.getItem('leyline-account-v2'))).toBe(original);
});
