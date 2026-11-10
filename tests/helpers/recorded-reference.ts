import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

export const hasRecordedReference = existsSync;
export function readRecordedReference(path: string): string { return readFileSync(path, 'utf8'); }
// Transfer original bytes: Windows WebKit may lose the native temporary file handle.
export function recordedJsonFile(path: string) {
  return { name: basename(path), mimeType: 'application/json', buffer: readFileSync(path) };
}
