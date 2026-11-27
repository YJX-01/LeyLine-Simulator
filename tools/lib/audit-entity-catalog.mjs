import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const normalizeLookup = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const reactionLabels = new Map([
  ['overload', { key: 'overload', name: '超载', kind: 'reaction' }],
  ['overloaded', { key: 'overload', name: '超载', kind: 'reaction' }],
  ['electrocharged', { key: 'electro_charged', name: '感电', kind: 'reaction' }],
  ['electro_charged', { key: 'electro_charged', name: '感电', kind: 'reaction' }],
  ['superconduct', { key: 'superconduct', name: '超导', kind: 'reaction' }],
  ['shatter', { key: 'shatter', name: '碎冰', kind: 'reaction' }],
  ['shattered', { key: 'shatter', name: '碎冰', kind: 'reaction' }],
  ['swirl', { key: 'swirl', name: '扩散', kind: 'reaction' }],
  ['swirlpyro', { key: 'swirl_pyro', name: '火扩散', kind: 'reaction' }],
  ['swirlhydro', { key: 'swirl_hydro', name: '水扩散', kind: 'reaction' }],
  ['swirlelectro', { key: 'swirl_electro', name: '雷扩散', kind: 'reaction' }],
  ['swirlcryo', { key: 'swirl_cryo', name: '冰扩散', kind: 'reaction' }],
  ['bloom', { key: 'bloom', name: '绽放', kind: 'reaction' }],
  ['hyperbloom', { key: 'hyperbloom', name: '超绽放', kind: 'reaction' }],
  ['burgeon', { key: 'burgeon', name: '烈绽放', kind: 'reaction' }],
  ['burning', { key: 'burning', name: '燃烧', kind: 'reaction' }],
  ['crystallize', { key: 'crystallize', name: '结晶', kind: 'reaction' }],
  ['vaporize', { key: 'vaporize', name: '蒸发', kind: 'reaction' }],
  ['melt', { key: 'melt', name: '融化', kind: 'reaction' }],
  ['aggravate', { key: 'aggravate', name: '超激化', kind: 'reaction' }],
  ['spread', { key: 'spread', name: '蔓激化', kind: 'reaction' }],
  ['lunarcharged', { key: 'lunar_charged', name: '月感电', kind: 'reaction' }],
  ['lunarbloom', { key: 'lunar_bloom', name: '月绽放', kind: 'reaction' }],
  ['lunarcrystallize', { key: 'lunar_crystallize', name: '月结晶', kind: 'reaction' }],
  ['reactions', { key: 'reactions', name: '元素反应', kind: 'reaction' }],
  ['resonances', { key: 'resonances', name: '元素共鸣', kind: 'resonance' }],
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadCanonicalEntries(rootDir) {
  const byLookup = new Map();
  const byCharacterLookup = new Map();
  const byName = new Map();

  const register = (aliases, entry) => {
    for (const alias of aliases) {
      const token = normalizeLookup(alias);
      if (token && !byLookup.has(token)) byLookup.set(token, entry);
      if (entry.kind === 'character' && token && !byCharacterLookup.has(token)) {
        byCharacterLookup.set(token, entry);
      }
    }
    if (entry.name && !byName.has(entry.name)) byName.set(entry.name, entry);
  };

  const directories = [
    ['characters', 'character'],
    ['weapons', 'weapon'],
    ['artifact-sets', 'set'],
  ];

  for (const [folder, kind] of directories) {
    const dir = resolve(rootDir, 'src/game-data/data', folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const data = readJson(resolve(dir, file));
      const id = String(data.id ?? file.replace(/\.json$/, ''));
      const rawName = kind === 'character' ? data.identity?.name : data.name;
      const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim().replaceAll('·', ' ') : id;
      const element = kind === 'character' && typeof data.identity?.element === 'string' ? data.identity.element : undefined;
      const entry = { key: id.toLowerCase(), name, kind, ...(element ? { element } : {}) };
      register([id, id.toLowerCase()], entry);
    }
  }

  const monaCatalogPath = resolve(rootDir, 'tools/data/sources/catalog/mona-community/catalog.json');
  if (existsSync(monaCatalogPath)) {
    const catalog = readJson(monaCatalogPath);
    const groups = [
      ['characters', 'character'],
      ['weapons', 'weapon'],
      ['sets', 'set'],
    ];
    for (const [group, kind] of groups) {
      for (const item of catalog[group] ?? []) {
        const canonical = item.canonicalId ? byLookup.get(normalizeLookup(item.canonicalId)) : null;
        const matchedByKey = byLookup.get(normalizeLookup(item.monaKey)) ?? byLookup.get(normalizeLookup(item.exportName));
        const target = canonical ?? matchedByKey;
        const cleanName = typeof item.name === 'string' && item.name.trim() ? item.name.trim().replaceAll('·', ' ') : '';
        if (target) {
          register([item.monaKey, item.exportName, item.canonicalId], target);
          if (cleanName && !byName.has(cleanName)) byName.set(cleanName, target);
        } else {
          const fallbackKey = String(item.canonicalId ?? item.monaKey ?? item.exportName ?? '').toLowerCase();
          if (!fallbackKey) continue;
          const entry = { key: fallbackKey, name: cleanName || fallbackKey, kind };
          register([item.monaKey, item.exportName, fallbackKey], entry);
        }
      }
    }
  }

  return { byLookup, byCharacterLookup, byName };
}

function inferKindFromId(id) {
  if (id.startsWith('character:') || id.startsWith('clause:character:')) return 'character';
  if (id.startsWith('weapon:') || id.startsWith('clause:weapon:') || id.startsWith('mona:equipment-event:')) return 'weapon';
  if (id.startsWith('set:') || id.startsWith('clause:set:') || id.startsWith('mona:set-')) return 'set';
  if (id.startsWith('mona:reaction:') || id.startsWith('public:reactions')) return 'reaction';
  if (id.startsWith('public:resonances')) return 'resonance';
  return 'other';
}

function resolveBuffEntityPrefix(rawEntity, byCharacterLookup) {
  const cleaned = String(rawEntity ?? '').trim();
  if (!cleaned) return null;
  const suffixStripped = cleaned.replace(/(?:C[1-6]|A[14]|P[1-4]|Talent\d+|Skill|Burst|[EQ])(?:_\d+)?$/i, '');
  if (suffixStripped && suffixStripped !== cleaned) {
    const hit = byCharacterLookup.get(normalizeLookup(suffixStripped));
    if (hit) return hit;
  }
  return null;
}

/** Build a canonical resolver that unifies Mona and LeyLine entity names and kinds. */
export function createEntityResolver(rootDir) {
  const { byLookup, byCharacterLookup, byName } = loadCanonicalEntries(rootDir);

  return function resolveEntity(row) {
    const id = String(row.id ?? '');
    const rawEntity = String(row.entity ?? '').trim();
    const rawName = String(row.entityName ?? '').trim().replaceAll('·', ' ');
    const lookupEntity = normalizeLookup(rawEntity);
    const lookupName = normalizeLookup(rawName);

    const direct = byLookup.get(lookupEntity)
      ?? byName.get(rawName)
      ?? byLookup.get(lookupName)
      ?? reactionLabels.get(lookupEntity)
      ?? reactionLabels.get(lookupName)
      ?? resolveBuffEntityPrefix(rawEntity, byCharacterLookup);

    if (direct) {
      return {
        entityKey: direct.key,
        entityName: direct.name,
        entityKind: direct.kind,
        ...(direct.element ? { element: direct.element } : {}),
      };
    }

    const fallbackKey = (rawEntity || id.split(':')[1] || 'other').toLowerCase();
    const fallbackName = rawName || rawEntity || fallbackKey;
    return {
      entityKey: fallbackKey,
      entityName: fallbackName,
      entityKind: inferKindFromId(id),
    };
  };
}
