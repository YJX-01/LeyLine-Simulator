import { resolve } from 'node:path';
import { damagePathAudit } from '../../lib/damage-path-audit.mjs';
import { catalogInventory, readCalculationData as read } from '../../lib/catalog-data.mjs';

if (process.argv.length > 2) throw new Error('This audit is read-only and no longer writes stage documents.');
const root = resolve(import.meta.dirname, '../../..');
const manifest = catalogInventory();
const audit = damagePathAudit(manifest, manifest.characters.map(id => read(`src/game-data/data/characters/${id}.json`)));
console.log(JSON.stringify(audit.summary));
