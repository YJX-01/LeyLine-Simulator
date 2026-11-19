import {existsSync} from 'node:fs';
import {test,expect,type Locator} from '@playwright/test';
import {chooseConfigurationRole} from '../../helpers/choose-configuration-role';
import {prepareRecordedAmberConfiguration} from '../../helpers/recorded-amber-configuration';
test.skip(!existsSync('.references/enka/official-example.json'),'Requires the recorded public showcase.');
async function compactGeometry(root:Locator){
  await expect(root.locator('.artifact-summary.compact').first()).toBeVisible();
  const geometry=await root.locator('.artifact-summary.compact').evaluateAll(cards=>cards.map(card=>{
    const image=card.querySelector('.artifact-art')!.getBoundingClientRect(),text=card.querySelector('.compact-substats')!.getBoundingClientRect();
    return {aligned:Math.abs(image.top-text.top)<.5 && Math.abs(image.bottom-text.bottom)<.5,overflow:card.scrollWidth>card.clientWidth,rows:card.querySelectorAll('.compact-entry').length,font:getComputedStyle(card.querySelector('.compact-entry')!).fontSize};
  }));expect(geometry.length).toBeGreaterThan(0);expect(geometry.every(item=>item.aligned && !item.overflow && item.rows===4 && item.font==='14px')).toBe(true);
  await expect(root.locator('.average-count,.roll-count,.artifact-wearers,.summary-main')).toHaveCount(0);
}
test('recorded Amber uses shared text compact cards in combinations, three-row configurations and selection',async({page})=>{
  test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1920,height:1080});
  const role = await prepareRecordedAmberConfiguration(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-combinations').click();const combination=page.locator('.combination-row');await expect(combination.locator('.artifact-summary.compact')).toHaveCount(5);await compactGeometry(combination);await page.screenshot({path:'artifacts/compact-combination-library.png',fullPage:true});
  await page.getByTestId('workspace-nav-loadouts').click();await chooseConfigurationRole(page,'安柏');const configuration=page.locator('.configuration-row');await compactGeometry(configuration);
  const order=await configuration.evaluate(node=>{const rows=Array.from(node.children).flatMap(row=>row.classList.contains('configuration-body')?Array.from(row.children):[row]);const equipment=node.querySelector('.equipment-strip-items')!;return {rows:rows.map(row=>row.className),leading:Array.from(equipment.querySelector('.equipment-strip-leading')!.children).map(child=>child.className),tops:Array.from(equipment.children).map(child=>child.getBoundingClientRect().top),buttons:Array.from(node.querySelectorAll('.configuration-actions button')).map(button=>button.getBoundingClientRect().height)};});
  expect(order.rows).toEqual(['configuration-top','equipment-strip','effective-roll-summary readonly inline','configuration-open']);expect(order.leading[0]).toContain('characters');expect(order.leading[1]).toContain('weapons');expect(order.buttons.every(height=>height===32)).toBe(true);expect(Math.max(...order.tops)-Math.min(...order.tops)).toBeLessThan(10);await page.screenshot({path:'artifacts/compact-character-configurations.png',fullPage:true});await page.setViewportSize({width:1440,height:900});await compactGeometry(configuration);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-character-configurations-1440.png',fullPage:true});await page.setViewportSize({width:1920,height:1080});
  await page.getByRole('button',{name:'查看安柏首选配置',exact:true}).click();await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();const selector=page.getByRole('dialog',{name:'安柏的配置',exact:true});await compactGeometry(selector);await page.keyboard.press('Escape');
  // Sequential typing and label focus still operate on recorded C6 bonus talents.
  const skill=role.getByLabel('战技',{exact:true});await skill.click();await skill.press('ControlOrMeta+A');await skill.pressSequentially('12');await skill.press('Tab');await expect(skill).toHaveValue('12');await role.getByRole('button',{name:'还原',exact:true}).click();await expect(skill).toHaveValue('13');await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-loadouts').click();await page.setViewportSize({width:390,height:844});await compactGeometry(configuration);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-character-configurations-mobile.png',fullPage:true});
  await configuration.getByRole('button',{name:'查看安柏首选配置',exact:true}).focus();await page.keyboard.press('Enter');await expect(role).toBeVisible();await role.getByRole('button',{name:'选择安柏配置',exact:true}).click();await compactGeometry(selector);expect(await selector.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-configuration-selector-mobile.png',fullPage:true});await page.keyboard.press('Escape');await expect(role).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'打开功能导航',exact:true}).click();await page.getByTestId('workspace-nav-combinations').click();await compactGeometry(combination);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:'artifacts/compact-combination-library-mobile.png',fullPage:true});expect(errors).toEqual([]);
});
