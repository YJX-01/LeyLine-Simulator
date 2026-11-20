import { readFile } from 'node:fs/promises';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';

const path = process.argv[2];
if (!path) throw new Error('Provide a current Project JSON file.');
const input = JSON.parse(await readFile(path, 'utf8'));
const { evaluateTimeline } = await loadContentSchema('/src/engine/src/timeline/index.ts');
const result = evaluateTimeline(input);
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'complete') process.exitCode = 1;
