import { expect, type Page } from '@playwright/test';

/** Decode actual catalog files, including transparency, without constructing player data. */
export async function verifyImages(page:Page,files:string[],url='/') {
  await page.goto(url);
  const failures = await page.evaluate(async paths=>{
    const failures:string[]=[];
    for(let start=0;start<paths.length;start+=16) await Promise.all(paths.slice(start,start+16).map(async file=>{
      try {
        const image=new Image();image.src=new URL(file,location.href).href;await image.decode();
        if(image.naturalWidth!==128 || image.naturalHeight!==128)throw new Error('expected 128px canvas');
        const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
        const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,128,128).data;
        let visible=false;for(let index=3;index<pixels.length;index+=4)if(pixels[index]>=128){visible=true;break;}
        if(!visible)throw new Error('empty/transparent image');
      } catch(error) {failures.push(`${file}: ${String(error)}`);}
    }));
    return failures;
  },files);
  expect(failures).toEqual([]);
}
