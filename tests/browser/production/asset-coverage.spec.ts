import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { verifyImages } from '../../helpers/image-integrity';

const manifest=JSON.parse(readFileSync('assets/manifest.json','utf8')) as {assets:{file:string;sourceUrl?:string}[]};
const supplemented=manifest.assets.filter(asset=>asset.sourceUrl?.startsWith('https://enka.network/ui/') && ['skills','constellations'].some(kind=>asset.file.includes(`/game/${kind}/`))).map(asset=>asset.file);
for(const url of ['http://127.0.0.1:5175/','http://127.0.0.1:5176/leyline/']) {
  test(`${url}: supplemented real artwork loads from the production base`,async({page})=>{
    test.setTimeout(60000);
    await verifyImages(page,supplemented,url);
  });
}
