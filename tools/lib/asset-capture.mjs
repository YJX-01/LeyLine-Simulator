import { readFileSync } from 'node:fs';

const root = new URL('../data/sources/asset-capture/', import.meta.url);
export function readAssetCapture() {
  const [header, ...lines] = readFileSync(new URL('inputs.tsv', root), 'utf8').trimEnd().split('\n');
  const keys = header.split('\t');
  const inputs = new Map(lines.map(line => {
    const row = Object.fromEntries(line.split('\t').map((value, index) => [keys[index], value]));
    return [row.file, row];
  }));
  return { inputs, ...JSON.parse(readFileSync(new URL('settings.json', root), 'utf8')) };
}
