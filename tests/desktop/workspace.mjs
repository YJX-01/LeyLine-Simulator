import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { desktopExecutable } from '../../tools/lib/desktop-location.mjs';
import { sourceFingerprint } from '../../tools/lib/source-fingerprint.mjs';

const directory=resolve('artifacts/workspace-desktop-validation');
await mkdir(directory,{recursive:true});
const userData=await mkdtemp(resolve(tmpdir(),'leyline-workspace-'));
const executable=await desktopExecutable(true);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:executable,args:['--smoke',`--user-data-dir=${userData}`],env,timeout:30000});
try {
  const page=await app.firstWindow(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current','page');
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button',{name:'莫娜导入',exact:true}).click();
  await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles(resolve('.references/artifacts_mona.json'));
  await expect(page.getByLabel('莫娜导入预览',{exact:true})).toContainText('新增 458 件');
  await page.getByRole('button',{name:'确认导入 458 件五星圣遗物',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')));
  if(before.artifacts.length!==458 || before.characters.length)throw new Error('Actual inventory import changed source counts or invented characters.');
  await expect.poll(()=>page.locator('.inventory-card .game-icon > img').first().evaluate(image=>image.complete && image.naturalWidth>0 && image.src.startsWith('leyline://app/assets/game/'))).toBe(true);
  await page.screenshot({path:resolve(directory,'actual-inventory.png'),fullPage:true});

  const file=resolve(directory,'actual-account.json');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.getByRole('button',{name:'导航 账号',exact:true}).click();
  await page.getByRole('button',{name:'保存账号资料',exact:true}).click();
  await expect.poll(async()=>JSON.parse(await readFile(file,'utf8').catch(()=>'{}')).artifacts?.length).toBe(458);
  const content=await readFile(file,'utf8');
  if(!content.endsWith('\n') || JSON.stringify(JSON.parse(content))!==JSON.stringify(before))throw new Error('Native account export changed the actual snapshot or JSON formatting.');
  await page.getByRole('button',{name:'打开 / 切换账号',exact:true}).click();
  await expect(page.getByLabel('账号管理',{exact:true})).toContainText('458 件圣遗物');
  if(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('leyline-account-v2'))))!==JSON.stringify(before))throw new Error('Native account round-trip changed inventory IDs or values.');
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
  await page.getByRole('button',{name:'保存账号资料',exact:true}).click();
  await expect(page.getByLabel('账号管理',{exact:true}).getByRole('status')).toContainText('已取消');

  // The public showcase is a separate account, never combined with the private Mona inventory.
  await page.getByRole('button',{name:'新建账号',exact:true}).click();
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByRole('button',{name:'展柜导入',exact:true}).click();
  const enka=page.getByRole('dialog',{name:'从角色展柜导入',exact:true});
  await enka.getByLabel('游戏 UID',{exact:true}).fill('618285856');
  await enka.getByRole('button',{name:'查询角色展柜',exact:true}).click();
  await expect.poll(()=>enka.locator('.import-row').count(),{timeout:25000}).toBeGreaterThan(0);
  const imported=await enka.locator('.import-row[aria-pressed=true]').count();
  await enka.getByRole('button',{name:'仅保存展柜',exact:true}).click();
  if(await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')).characters.length)!==0)throw new Error('Showcase preview wrote before confirmation.');
  await enka.getByRole('button',{name:`确认导入 ${imported} 位角色`,exact:true}).click();
  await expect(enka).toHaveCount(0);
  const publicAccount=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v2')));
  if(publicAccount.id===before.id || publicAccount.artifacts.length || publicAccount.characters.length!==imported)throw new Error('Showcase snapshots crossed account or physical-inventory boundaries.');
  await page.screenshot({path:resolve(directory,'enka-showcase.png'),fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  await writeFile(resolve(directory,'report.json'),JSON.stringify({status:'passed',sourceFingerprint:sourceFingerprint(),executable,userData,actualInventory:458,enkaProfiles:imported,
    rawHashes:[...new Set(publicAccount.characters.map(character=>character.showcase.rawHash))],
    checks:['actual-inventory-preview-confirm','packaged-offline-image','native-account-save-open','native-save-cancel','live-enka-ipc','preview-does-not-write','explicit-snapshot-only','account-isolation'],
    gap:'No recorded combat timeline or game damage observation.'},null,2)+'\n');
  console.log('Packaged desktop account files, assets and separate live showcase checks passed.');
} finally {await app.close();}
