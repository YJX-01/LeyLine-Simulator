import {existsSync,readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
test('actual inventory starts and resets in newest release order',async({page})=>{
  test.skip(!existsSync('.references/artifacts_mona.json'),'Requires actual Mona inventory.');
  await page.goto('/');await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'莫娜导入',exact:true}).click();await page.getByLabel('导入莫娜圣遗物文件',{exact:true}).setInputFiles('.references/artifacts_mona.json');await page.getByRole('button',{name:'确认导入 458 件五星圣遗物',exact:true}).click();
  const metadata=JSON.parse(readFileSync('docs/constant/catalog-release-metadata.json','utf8')).artifacts;
  const source=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v1')!).artifacts.map((item:{id:string;name:string;real:{setId:string}})=>({id:item.id,name:item.name,setId:item.real.setId})));
  // Independent comparison from canonical version tuples and game IDs, retaining source order for ties.
  const expected=[...source].sort((a,b)=>{const left=metadata[a.setId],right=metadata[b.setId];if(!left || !right)return left?-1:right?1:0;const lv=left.version.split('.').map(Number),rv=right.version.split('.').map(Number);return rv[0]-lv[0] || rv[1]-lv[1] || right.gameId-left.gameId;});
  await page.getByRole('button',{name:'排序',exact:true}).click();const sort=page.getByRole('dialog',{name:'圣遗物排序',exact:true});await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await expect(sort.getByRole('button',{name:'从高到低',exact:true})).toHaveAttribute('aria-pressed','true');await sort.getByRole('button',{name:'等级',exact:true}).click();await sort.getByRole('button',{name:'重置排序',exact:true}).click();await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');await sort.getByRole('button',{name:'完成',exact:true}).click();
  const actual=await page.locator('.inventory-card').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
  expect(actual).toEqual(expected.slice(0,actual.length).map(item=>`查看 ${item.name} ${item.id.slice(-6)}`));
  await page.reload();await page.getByTestId('workspace-nav-artifacts').click();await page.getByRole('button',{name:'排序',exact:true}).click();await expect(sort.getByRole('button',{name:'实装版本',exact:true})).toHaveAttribute('aria-pressed','true');
});
