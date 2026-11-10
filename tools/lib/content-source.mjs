import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const maximumBytes = 16 * 1024 * 1024;
function validateValue(value, path, depth = 0) {
  if (depth > 128) throw new Error(`${path}: content nesting exceeds 128 levels`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach((item, index) => validateValue(item, `${path}[${index}]`, depth + 1)); return; }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) validateValue(item, `${path}.${key}`, depth + 1);
    return;
  }
  throw new Error(`${path}: expected finite JSON content`);
}
export function parseContentSource(text, filename = 'content.json') {
  if (Buffer.byteLength(text) > maximumBytes) throw new Error(`${filename}: source exceeds 16 MiB`);
  let value;
  try { value = JSON.parse(text); } catch (cause) { throw new Error(`${filename}: ${cause.message}`); }
  validateValue(value, filename);
  return value;
}
export function readContentSource(path) {
  if (extname(String(path)) !== '.json') throw new Error(`${path}: content sources must use strict JSON`);
  return parseContentSource(readFileSync(path, 'utf8'), String(path));
}
export function writeContentSource(path, value) {
  if (extname(String(path)) !== '.json') throw new Error(`${path}: content sources must use strict JSON`);
  validateValue(value, String(path));
  const text = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(text) > maximumBytes) throw new Error(`${path}: source exceeds 16 MiB`);
  writeFileSync(path, text);
}
