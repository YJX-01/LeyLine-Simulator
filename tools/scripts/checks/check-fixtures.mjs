import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../../..');
const recording = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/recordings/enka/manifest.json'), 'utf8'));
const actual = createHash('sha256').update(readFileSync(resolve(root, recording.file))).digest('hex');
if (actual !== recording.sha256) throw new Error('Recorded public response changed; do not regenerate evidence.');
console.log('Validated the immutable public Enka recording used by current tests.');
