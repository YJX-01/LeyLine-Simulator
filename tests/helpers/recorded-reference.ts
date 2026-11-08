import { existsSync, readFileSync } from 'node:fs';

export const hasRecordedReference = existsSync;
export function readRecordedReference(path: string): string { return readFileSync(path, 'utf8'); }
