import {expect,type Locator} from '@playwright/test';

/** Reviewed visual contract: read computed layout, including page-specific overrides. */
export async function auditActions(root:Locator) {
  const issues=await root.locator('button.ui-action,button.library-filter,button.configuration-title-button,.choice-group:not(.joined) > button').evaluateAll(buttons=>buttons.filter(button=>!!button.getClientRects().length).flatMap(button=>{
    const style=getComputedStyle(button),size=(button as HTMLElement).dataset.size,height=size==='md' || button.matches('.configuration-title-button,.choice-group.small > button')?32:size==='sm'?24:40,font=size==='sm'?14:16;
    const prefix=(button.textContent ?? '').trim(),issues:string[]=[];
    if(Math.abs(button.getBoundingClientRect().height-height)>.6)issues.push(`${prefix}: height ${button.getBoundingClientRect().height}, expected ${height}`);
    if(parseFloat(style.fontSize)!==font)issues.push(`${prefix}: font ${style.fontSize}, expected ${font}px`);
    if(Number(style.fontWeight)<700)issues.push(`${prefix}: weight ${style.fontWeight}, expected bold`);
    if(Math.abs(parseFloat(style.borderRadius)-7)>.2)issues.push(`${prefix}: radius ${style.borderRadius}, expected 7px`);
    return issues;
  }));
  expect(issues,'Action dimensions and type must match docs/design/visual-language.md').toEqual([]);
}

export async function auditDialog(dialog:Locator,kind:'editor'|'content'|'filter'|'confirm') {
  await expect(dialog).toBeVisible();
  const issues=await dialog.evaluate((node,kind)=>{
    // With a stable root scrollbar gutter, CSS viewport units can exclude the
    // reserved gutter while innerWidth still includes it (Windows Chromium).
    const viewportProbe=document.createElement('div');
    viewportProbe.style.cssText='position:fixed;width:100vw;height:0;visibility:hidden;pointer-events:none';
    document.body.append(viewportProbe);
    const viewportWidth=viewportProbe.getBoundingClientRect().width;
    viewportProbe.remove();
    const width={editor:1000,content:920,filter:560,confirm:420}[kind],expected=Math.min(width,viewportWidth-40),issues:string[]=[];
    if(Math.abs(node.getBoundingClientRect().width-expected)>.7)issues.push(`width ${node.getBoundingClientRect().width}, expected ${expected}`);
    const title=node.querySelector(':scope > header > h2');
    if(title){const box=title.getBoundingClientRect();for(const button of node.querySelectorAll(':scope > header button')){const b=button.getBoundingClientRect();if(b.width && Math.min(b.right,box.right)-Math.max(b.left,box.left)>1 && Math.min(b.bottom,box.bottom)-Math.max(b.top,box.top)>1)issues.push(`Header button overlaps title: ${button.getAttribute('aria-label') ?? button.textContent?.trim()}`);}}
    if(!title || getComputedStyle(title).fontSize!=='20px' || Number(getComputedStyle(title).fontWeight)<700)issues.push('Title must be 20px bold');
    const close=node.querySelector(':scope > header .ui-close');
    if(!close || Math.abs(close.getBoundingClientRect().width-32)>.6 || Math.abs(close.getBoundingClientRect().height-32)>.6)issues.push('Close must be 32px square');
    if(close?.textContent?.trim())issues.push('Close must contain only the cross icon');
    if(node.scrollWidth>node.clientWidth+1)issues.push('Dialog overflows horizontally');
    if(!node.contains(document.activeElement))issues.push('Focus escaped the modal');
    return issues;
  },kind);
  expect(issues,`${kind} dialog contract`).toEqual([]);
  await auditActions(dialog);
}

export async function auditListHeader(root:Locator) {
  const header=root.locator('.library-list-header');await expect(header).toBeVisible();
  await expect(header.locator('.library-result-count')).toHaveCSS('font-size','16px');
  await expect(header.locator('.library-result-count')).toHaveCSS('font-weight','700');
  for(const position of ['顶部','底部']){
    const pager=root.getByRole('navigation',{name:position+'列表分页',exact:true});
    await expect(pager.getByRole('spinbutton',{name:position+'页码',exact:true})).toBeVisible();
    await expect(pager.getByRole('button',{name:'上一页',exact:true})).toBeVisible();
    await expect(pager.getByRole('button',{name:'下一页',exact:true})).toBeVisible();
    await auditActions(pager);
  }
  expect(await root.getByRole('spinbutton',{name:'顶部页码',exact:true}).inputValue()).toBe(await root.getByRole('spinbutton',{name:'底部页码',exact:true}).inputValue());
}
