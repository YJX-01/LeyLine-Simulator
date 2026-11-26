import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const MONA_BASELINE = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
export const MONA_SPECS_DIR = resolve(root, 'tools/data/sources/mona-community', MONA_BASELINE, 'specs');

const kindFolders = {
  character: 'characters',
  weapon: 'weapons',
  set: 'sets',
};

function validateSpec(doc, relPath, expectedKind) {
  if (!doc || typeof doc !== 'object') throw new Error(`Invalid spec JSON: ${relPath}`);
  if (doc.schemaVersion !== 1) throw new Error(`Unsupported spec schemaVersion in ${relPath}`);
  if (doc.kind !== expectedKind) throw new Error(`Spec kind mismatch in ${relPath}: expected ${expectedKind}, got ${doc.kind}`);
  if (typeof doc.entity !== 'string' || !doc.entity) throw new Error(`Missing entity in ${relPath}`);
  if (typeof doc.monaKey !== 'string' || !doc.monaKey) throw new Error(`Missing monaKey in ${relPath}`);
  if (doc.inactiveWindows && !Array.isArray(doc.inactiveWindows)) throw new Error(`inactiveWindows must be array in ${relPath}`);
  if (doc.buffScenarios && !Array.isArray(doc.buffScenarios)) throw new Error(`buffScenarios must be array in ${relPath}`);
  if (doc.hitScenarios && !Array.isArray(doc.hitScenarios)) throw new Error(`hitScenarios must be array in ${relPath}`);
  if (doc.fourPieceScenarios && !Array.isArray(doc.fourPieceScenarios)) throw new Error(`fourPieceScenarios must be array in ${relPath}`);
  return { ...doc, _path: relPath };
}

/** Load decentralized per-entity Mona audit specs without modifying shared runners. */
export function loadMonaEntitySpecs({ kinds = ['character', 'weapon', 'set'], entities } = {}) {
  const filter = entities ? new Set(entities) : null;
  const specs = [];
  for (const kind of kinds) {
    const folder = kindFolders[kind];
    if (!folder) throw new Error(`Unknown spec kind: ${kind}`);
    const dir = resolve(MONA_SPECS_DIR, folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
      const fullPath = resolve(dir, file);
      const relPath = relative(root, fullPath).replaceAll('\\', '/');
      const doc = JSON.parse(readFileSync(fullPath, 'utf8'));
      if (filter && !filter.has(doc.entity)) continue;
      specs.push(validateSpec(doc, relPath, kind));
    }
  }
  return specs;
}

/** Collect all extra inactive window fact keys declared across character specs. */
export function loadSpecInactiveWindows(entityId) {
  const specs = loadMonaEntitySpecs({ kinds: ['character'], entities: entityId ? [entityId] : undefined });
  const keys = new Set();
  for (const spec of specs) {
    for (const key of spec.inactiveWindows ?? []) keys.add(key);
  }
  return keys;
}

/** Collect buff scenarios from per-entity specs (character, weapon, or set). */
export function loadSpecBuffScenarios({ kinds = ['character', 'weapon', 'set'], entities, keys } = {}) {
  const keySet = keys ? new Set(keys) : null;
  const specs = loadMonaEntitySpecs({ kinds, entities });
  const rows = [];
  for (const spec of specs) {
    for (const scenario of spec.buffScenarios ?? []) {
      if (keySet && !keySet.has(scenario.key)) continue;
      rows.push({
        ...scenario,
        kind: spec.kind,
        owner: spec.entity,
        ownerMonaKey: spec.monaKey,
        specPath: spec._path,
      });
    }
  }
  return rows;
}

/** Collect conditional/non-ordinary/non-attack hit scenarios from character specs. */
export function loadSpecHitScenarios({ entities } = {}) {
  const specs = loadMonaEntitySpecs({ kinds: ['character'], entities });
  const rows = [];
  for (const spec of specs) {
    for (const scenario of spec.hitScenarios ?? []) {
      rows.push({
        ...scenario,
        entity: spec.entity,
        monaKey: spec.monaKey,
        specPath: spec._path,
      });
    }
  }
  return rows;
}

/** Collect 4-piece wearer-self scenarios from artifact-set specs. */
export function loadSpecFourPieceScenarios({ entities } = {}) {
  const specs = loadMonaEntitySpecs({ kinds: ['set'], entities });
  const rows = [];
  for (const spec of specs) {
    for (const scenario of spec.fourPieceScenarios ?? []) {
      rows.push({
        ...scenario,
        entity: spec.entity,
        key: spec.monaKey,
        specPath: spec._path,
      });
    }
  }
  return rows;
}
