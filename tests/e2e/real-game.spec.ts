import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { evaluateWorkbench } from '../../src/engine/src/workbench';

async function empty(page: import('@playwright/test').Page) {
  await page.getByTestId('workspace-nav-projects').click();
  await page.getByRole('button', { name: '新建空轴', exact: true }).click();
  await page.getByTestId('workspace-nav-team').click();
}

test('uses three independent real-skill references in the actual Worker and preserves snapshots', async ({ page }, info) => {
  await page.goto('/#compatibility');
  for (const [character, expected, hits] of [['jean',1549.2330752985004,1],['kaeya',990.790476932988,1],['xingqiu',2682.857029682754,2]] as const) {
    await empty(page);
    await page.getByLabel('游戏角色', { exact: true }).selectOption(character);
    await page.getByRole('button', { name: '添加真实角色到当前轴', exact: true }).click();
    await expect(page.getByTestId('real-stat-attack')).not.toHaveText('0');
    await page.getByRole('button', { name: '添加技能全部独立命中', exact: true }).click();
    await expect.poll(async () => Number((await page.getByTestId('workspace-total').innerText()).replaceAll(',',''))).toBeCloseTo(expected, 3);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存轴项目', exact: true }).click();
    const path = info.outputPath(`${character}-real.json`);
    await (await downloadEvent).saveAs(path);
    await expect(page.locator('.design-statusbar')).toContainText('当前无未保存修改');
    const saved = JSON.parse(await readFile(path,'utf8'));
    expect(evaluateWorkbench(saved).totalValue).toBeCloseTo(expected,8);
    expect(saved.timeline).toHaveLength(hits);
    expect(saved.timeline.map((entry: {realDamage:{hitIndex:number}}) => entry.realDamage.hitIndex)).toEqual(Array.from({length:hits},(_,i)=>i));
    const initial = saved.candidate.actors[0].realBuild.character.base.attack;
    await page.getByLabel('真实战技天赋', { exact: true }).fill('8');
    await page.getByLabel('真实战技天赋', { exact: true }).press('Tab');
    await expect.poll(async () => Number((await page.getByTestId('workspace-total').innerText()).replaceAll(',',''))).toBeLessThan(expected);
    await page.getByLabel('导入轴项目文件', { exact: true }).setInputFiles(path);
    await expect.poll(async () => Number((await page.getByTestId('workspace-total').innerText()).replaceAll(',',''))).toBeCloseTo(expected,3);
    expect(saved.candidate.actors[0].realBuild.character.base.attack).toBe(initial);
  }
});

test('keeps unknown facts partial, exposes multipliers, and changes weapon and enemy inputs', async ({ page }) => {
  await page.goto('/#compatibility'); await empty(page);
  await page.getByRole('button', { name: '添加真实角色到当前轴', exact: true }).click();
  await page.getByRole('button', { name: '添加技能全部独立命中', exact: true }).click();
  await expect(page.getByTestId('workspace-total')).toHaveText('1,549.2331');
  await page.getByLabel('所选真实命中暴击', { exact: true }).selectOption({label:'未知，待确认'});
  await expect(page.getByTestId('workspace-total')).toHaveText('待确认');
  await page.getByLabel('所选真实命中暴击', { exact: true }).selectOption('critical');
  await expect(page.getByTestId('workspace-total')).toHaveText('2,323.8496');
  await page.getByLabel('所选真实命中反应', { exact: true }).selectOption({label:'未知，待确认'});
  await expect(page.getByTestId('workspace-total')).toHaveText('待确认');
  await page.getByLabel('所选真实命中反应', { exact: true }).selectOption('none');
  await page.getByLabel('真实候选武器', { exact: true }).selectOption('dullblade');
  await expect(page.getByLabel('真实武器等级', { exact: true })).toHaveValue('70');
  await expect(page.getByTestId('workspace-total')).not.toHaveText('待确认');
  await page.getByLabel('真实角色命座', { exact: true }).fill('1');
  await page.getByLabel('真实角色命座', { exact: true }).press('Tab');
  await expect(page.getByTestId('workspace-total')).toHaveText('待确认');
});

test('previews real Mona inventory and copies account equipment without linking the old axis', async ({ page }) => {
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByLabel('导入莫娜圣遗物文件', { exact: true }).setInputFiles('fixtures/mona/mona-v1.json');
  await page.getByRole('button', { name: '预览莫娜导入', exact: true }).click();
  await expect(page.getByLabel('莫娜导入预览', { exact: true })).toContainText('新增 3 件');
  await page.getByRole('button', { name: '确认导入 3 件五星圣遗物', exact: true }).click();
  await expect(page.getByText('库存共 3 件。相同属性的物品保留各自身份。', { exact:true })).toBeVisible();
  await page.getByLabel('导入莫娜圣遗物文件', { exact: true }).setInputFiles('fixtures/mona/mona-v1.json');
  await page.getByRole('button', { name: '预览莫娜导入', exact: true }).click();
  await expect(page.getByLabel('莫娜导入预览', { exact: true })).toContainText('新增 0 件；已存在 3 件');
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByLabel('新角色名称', { exact: true }).fill('验收账号角色');
  await page.getByRole('button', { name: '添加账号角色', exact:true }).click();
  await page.getByRole('button', { name: '设置账号真实角色', exact:true }).click();
  await page.getByLabel('库存圣遗物', { exact:true }).selectOption({index:1});
  await page.getByRole('button', { name: '装备所选圣遗物', exact:true }).click();
  await expect(page.getByTestId('real-stat-attack')).toHaveText('749.402464');
  await page.getByRole('button', { name: '复制真实配装到轴', exact:true }).click();
  await page.getByTestId('workspace-nav-team').click();
  await page.getByRole('button', { name: '添加技能全部独立命中', exact: true }).click();
  await expect(page.getByTestId('workspace-total')).toHaveText('6,074.0152');
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByLabel('选择账号角色', { exact:true }).selectOption({label:'琴'});
  await page.getByLabel('真实战技天赋', { exact:true }).fill('1');
  await page.getByLabel('真实战技天赋', { exact:true }).press('Tab');
  await expect(page.getByTestId('workspace-total')).toHaveText('6,074.0152');
});

test('requires explicit confirmation for updated Mona instances and preserves equipment ownership', async ({ page }) => {
  const original = JSON.parse(await readFile('fixtures/mona/mona-v1.json','utf8'));
  await page.goto('/#compatibility');
  await page.getByTestId('workspace-nav-artifacts').click();
  const input = page.getByLabel('导入莫娜圣遗物文件', { exact:true });
  await input.setInputFiles('fixtures/mona/mona-v1.json');
  await page.getByRole('button', { name:'预览莫娜导入', exact:true }).click();
  await page.getByRole('button', { name:'确认导入 3 件五星圣遗物', exact:true }).click();
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByLabel('新角色名称', { exact:true }).fill('装备持有人');
  await page.getByRole('button', { name:'添加账号角色', exact:true }).click();
  await page.getByLabel('库存圣遗物', { exact:true }).selectOption({index:1});
  await page.getByRole('button', { name:'装备所选圣遗物', exact:true }).click();
  await page.getByTestId('workspace-nav-artifacts').click();
  original.flower[0].normalTags[0].value = 0.07;
  await input.setInputFiles({name:'strengthened.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
  await page.getByRole('button', { name:'预览莫娜导入', exact:true }).click();
  await expect(page.getByLabel('莫娜导入预览', { exact:true })).toContainText('冲突 1 件');
  await expect(page.getByRole('button', {name:'确认导入 0 件五星圣遗物',exact:true})).toBeDisabled();
  await page.getByRole('checkbox', {name:'允许更新已存在的莫娜实物',exact:true}).check();
  await page.getByRole('button', {name:'确认新增 0 件并更新 1 件五星圣遗物',exact:true}).click();
  await page.getByTestId('workspace-nav-characters').click();
  await page.getByLabel('选择账号角色', { exact:true }).selectOption({label:'装备持有人'});
  await expect(page.getByText('生之花：角斗士的终幕礼 · 生之花', { exact:true })).toBeVisible();
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
});

test('does not insert an old asynchronous character selection into a replacement project', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/real-data/characters-*.json*', async route => { await gate; await route.continue(); });
  await page.goto('/#compatibility'); await empty(page);
  const [request] = await Promise.all([
    page.waitForRequest(request => /real-data\/characters-\d+\.json/.test(request.url())),
    page.getByRole('button', { name:'添加真实角色到当前轴', exact:true }).click(),
  ]);
  await empty(page);
  const loaded = page.waitForResponse(response => response.url() === request.url());
  release();
  await (await loaded).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByTestId('workspace-total')).toHaveText('0');
  await expect(page.getByText('0 位角色', {exact:true})).toBeVisible();
  await expect(page.locator('.team-role-card')).toHaveCount(0);
});
