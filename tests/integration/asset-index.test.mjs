import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAssetIndex, missingCharacterIcons } from '../../tools/lib/asset-index.mjs';

const root = new URL('../../',import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('assets/manifest.json',root),'utf8'));
const directory = new URL('src/game-data/data/characters/',root);
const characters = readdirSync(directory).filter(file=>file.endsWith('.json')).map(file=>JSON.parse(readFileSync(new URL(file,directory),'utf8')));

test('actual catalog forms resolve to the same shared artwork as their declared base identities',()=>{
  const index = createAssetIndex(manifest,characters,{});
  assert.deepEqual(missingCharacterIcons(index,characters),[]);
  assert.equal(index.skills['aether-combat1'].file,index.skills['normal-skill_a_01'].file);
  assert.equal(index.skills['lumine-cryo-combat2'].file,index.skills['travelercryo-combat2'].file);
  assert.equal(index.constellations['aether-anemo-c6'].file,index.constellations['traveleranemo-c6'].file);
  assert.equal(index.skills['manekina-hydro-combat2'].file,index.skills['manekin-combat2'].file);
  assert.equal(index.characters['manekina-hydro'].file,index.characters.manekina.file);
  assert.equal(index.characters['manekina-hydro'].element,'hydro');
});

test('removing the actual Manekin skill reports every affected form instead of a successful file-only check',()=>{
  const derived = {...manifest,assets:manifest.assets.filter(asset=>asset.key!=='manekin-combat2')};
  const missing = missingCharacterIcons(createAssetIndex(derived,characters,{}),characters);
  assert.equal(missing.length,14);
  assert.ok(missing.some(item=>item.key==='manekina-hydro-combat2'));
  assert.ok(missing.some(item=>item.key==='manekin-pyro-combat2'));
});
