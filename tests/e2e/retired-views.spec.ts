import { test,expect } from '@playwright/test';
test('retired URLs only open the current workspace and never load retired view chunks',async({page})=>{
 const requests:string[]=[];const errors:string[]=[];
 page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
 for(const hash of ['#compatibility','#annotation','#workbench','#tools','#combat','#team']){
  await page.goto('/'+hash);await expect(page.getByTestId('workspace-nav-characters')).toBeVisible();
  await expect.poll(()=>new URL(page.url()).hash).toBe('');
  await page.getByRole('button',{name:'导航 设置',exact:true}).click();
  await expect(page.locator('a[href^="#"]:not(.skip-link)')).toHaveCount(0);
 }
 await page.getByTestId('workspace-nav-projects').click();await expect(page.getByText('历史兼容样本（不作为真实案例验收）',{exact:true})).toHaveCount(0);
 await page.getByTestId('workspace-nav-team').click();await expect(page.locator('.advanced-workspace')).toHaveCount(0);
 await page.getByTestId('workspace-nav-timeline').click();await expect(page.getByLabel('剪辑式时间轴编辑',{exact:true})).toBeVisible();await expect(page.locator('.legacy-timeline')).toHaveCount(0);
 expect(requests.some(url=>/(?:LegacyWorkspaceShell|DeveloperTools|AnnotationWorkbench|\/Workbench(?:\.vue|[-.])|P3Panel|attack\.worker|charts\/runtime)/.test(url))).toBe(false);expect(errors).toEqual([]);
});
test('current workspace retains page-load recovery after a chunk failure',async({page})=>{
 await page.route('**/src/WorkspaceShell.vue*',route=>route.abort());await page.goto('/');await expect(page.getByRole('heading',{name:'页面未能加载',exact:true})).toBeVisible();
 await page.unroute('**/src/WorkspaceShell.vue*');await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'重新加载页面',exact:true}).click()]);await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current','page');
});
