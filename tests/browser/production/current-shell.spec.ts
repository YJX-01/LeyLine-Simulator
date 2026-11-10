import { test,expect } from '@playwright/test';
for(const address of ['http://127.0.0.1:5175/','http://127.0.0.1:5176/leyline/']){
 test(`${address}: current workspace excludes retired entries`,async({page,request})=>{
  const resources:string[]=[];page.on('request',request=>resources.push(request.url()));await page.goto(address+'#workbench');
  await expect(page.getByTestId('workspace-nav-characters')).toHaveAttribute('aria-current','page');expect(new URL(page.url()).hash).toBe('');
  await page.getByTestId('workspace-nav-timeline').click();await expect(page.getByLabel('剪辑式时间轴编辑',{exact:true})).toBeVisible();
  const worker=resources.find(url=>/axis\.worker-/.test(url));expect(worker).toBeTruthy();expect(new URL(worker!).pathname.startsWith(new URL(address).pathname+'assets/')).toBe(true);expect((await request.get(worker!)).headers()['content-type']).toContain('javascript');
  expect(resources.some(url=>/(?:LegacyWorkspaceShell|DeveloperTools|AnnotationWorkbench|\/Workbench-|P3Panel|attack\.worker-|chart-library-)/.test(url))).toBe(false);
 });
}
