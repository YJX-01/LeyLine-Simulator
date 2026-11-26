import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { catalogInventory } from '../../lib/catalog-data.mjs';
import { readContentSource } from '../../lib/content-source.mjs';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import {
  leylineSingleHitInventory,
  monaCalculationInventory,
  probeMonaSkills,
} from '../../lib/mona-inventory-probes.mjs';
import { singleHitCandidates } from '../../lib/mona-single-hit-comparison.mjs';
import {
  auditMonaOrdinaryBatch,
  auditMonaOrdinaryC6,
  compareMonaOrdinaryScaling,
  ordinaryHitName,
  ordinaryInactiveWindows,
  ordinaryPanel,
  soloTalentGrants,
} from '../../lib/mona-ordinary-audit.mjs';
import { runMonaTriage } from '../../lib/mona-triage.mjs';
import {
  collectBuffSpecDependencies,
  runSpecBuffScenarios,
  runSpecFourPieceScenarios,
} from '../../lib/mona-spec-runner.mjs';
import { auditBuild, auditHit, novice, setGateFacts } from '../../lib/roster-audit-settings.mjs';
import { combatFactDeclaration, conditionFactInputs } from '../../../src/schema/src/calculation/buffs.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const VALID_MODES = ['scaling', 'damage-c0', 'damage-c6', 'buffs', 'weapons', 'sets4pc', 'all'];
const ALL_SUBMODES = ['scaling', 'damage-c0', 'damage-c6', 'buffs', 'weapons', 'sets4pc'];
const REL_TOLERANCE = 0.0001; // 0.01%

const ELEMENT_RECIPIENT = {
  cryo: 'kaeya',
  electro: 'lisa',
  pyro: 'amber',
  hydro: 'barbara',
  geo: 'noelle',
  anemo: 'sucrose',
  dendro: 'collei',
  physical: 'kaeya',
};

const WEAPON_RECIPIENT = {
  WEAPON_SWORD_ONE_HAND: 'kaeya',
  WEAPON_BOW: 'amber',
  WEAPON_CATALYST: 'lisa',
  WEAPON_CLAYMORE: 'noelle',
  WEAPON_POLE: 'xiangling',
};

const ELEMENT_MONA_NAME = {
  pyro: 'Pyro',
  hydro: 'Hydro',
  electro: 'Electro',
  cryo: 'Cryo',
  anemo: 'Anemo',
  geo: 'Geo',
  dendro: 'Dendro',
  physical: 'Physical',
};

const MONA_PROBE_FIELDS = [
  { leylineTarget: 'attribute.attackPercent', source: 'attribute', field: 'atk', sign: 1, base: 'attack' },
  { leylineTarget: 'attribute.hpPercent', source: 'attribute', field: 'hp', sign: 1, base: 'hp' },
  { leylineTarget: 'attribute.defensePercent', source: 'attribute', field: 'def', sign: 1, base: 'defense' },
  { leylineTarget: 'attribute.elementalMastery', source: 'attribute', field: 'elemental_mastery', sign: 1, base: null },
  { leylineTarget: 'attribute.energyRecharge', source: 'attribute', field: 'recharge', sign: 1, base: null },
  { leylineTarget: 'attribute.healingBonus', source: 'attribute', field: 'healing_bonus', sign: 1, base: null },
  { leylineTarget: 'attribute.incomingHealingBonus', source: 'attribute', field: 'incoming_healing_bonus', sign: 1, base: null },
  { leylineTarget: 'attribute.shieldStrength', source: 'attribute', field: 'shield_strength', sign: 1, base: null },
  { leylineTarget: 'attribute.pyroBonus', source: 'attribute', field: 'bonus_pyro', sign: 1, base: null },
  { leylineTarget: 'attribute.hydroBonus', source: 'attribute', field: 'bonus_hydro', sign: 1, base: null },
  { leylineTarget: 'attribute.electroBonus', source: 'attribute', field: 'bonus_electro', sign: 1, base: null },
  { leylineTarget: 'attribute.cryoBonus', source: 'attribute', field: 'bonus_cryo', sign: 1, base: null },
  { leylineTarget: 'attribute.anemoBonus', source: 'attribute', field: 'bonus_anemo', sign: 1, base: null },
  { leylineTarget: 'attribute.geoBonus', source: 'attribute', field: 'bonus_geo', sign: 1, base: null },
  { leylineTarget: 'attribute.dendroBonus', source: 'attribute', field: 'bonus_dendro', sign: 1, base: null },
  { leylineTarget: 'attribute.physicalBonus', source: 'attribute', field: 'bonus_physical', sign: 1, base: null },
  { leylineTarget: 'attribute.critRate', source: 'damage', field: 'critical', sign: 1, base: null },
  { leylineTarget: 'attribute.critDamage', source: 'damage', field: 'critical_damage', sign: 1, base: null },
  { leylineTarget: 'attribute.damageBonus', source: 'damage', field: 'bonus', sign: 1, base: null },
  { leylineTarget: 'attribute.baseDamageBonus', source: 'damage', field: 'extra_damage', sign: 1, base: null },
  { leylineTarget: 'target.defenseReduction', source: 'damage', field: 'def_minus', sign: 1, base: null },
  { leylineTarget: 'attribute.defenseIgnore', source: 'damage', field: 'def_penetration', sign: 1, base: null },
  { leylineTarget: 'target.resistance', source: 'damage', field: 'res_minus', sign: -1, base: null },
];

const SUPPORTED_RUNNER_TARGETS = new Set([
  'attribute.attackPercent',
  'attribute.flatAttack',
  'attribute.attack',
  'attribute.hpPercent',
  'attribute.flatHp',
  'attribute.hp',
  'attribute.defensePercent',
  'attribute.flatDefense',
  'attribute.defense',
  'attribute.elementalMastery',
  'attribute.energyRecharge',
  'attribute.critRate',
  'attribute.critDamage',
  'attribute.healingBonus',
  'attribute.incomingHealingBonus',
  'attribute.shieldStrength',
  'attribute.damageBonus',
  'attribute.baseDamageBonus',
  'attribute.defenseIgnore',
  'target.defenseReduction',
  'attribute.pyroBonus',
  'attribute.hydroBonus',
  'attribute.electroBonus',
  'attribute.cryoBonus',
  'attribute.anemoBonus',
  'attribute.geoBonus',
  'attribute.dendroBonus',
  'attribute.physicalBonus',
]);

const isSupportedRunnerTarget = target =>
  SUPPORTED_RUNNER_TARGETS.has(target) || (typeof target === 'string' && target.startsWith('target.resistance.'));

const sum = obj => Object.values(obj ?? {}).reduce((a, b) => a + b, 0);
const relError = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) / Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)));
};
const isNear = (a, b, relTol = REL_TOLERANCE, absTol = 1e-5) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(absTol, Math.max(Math.abs(a), Math.abs(b)) * relTol);

const toSnakeCase = name =>
  String(name ?? '').replace(/([A-Z])/g, (m, p, offset) => (offset ? '_' : '') + p.toLowerCase());

function parseCsvList(list) {
  if (!list?.length) return [];
  return [...new Set(list.flatMap(item => String(item).split(',')).map(s => s.trim().toLowerCase()).filter(Boolean))];
}

function readMonaAsset(rel) {
  return JSON.parse(
    readFileSync(resolve(ROOT, '.references/mona-community', rel), 'utf8')
      .replace(/^(?:\s*\/\/[^\n]*\n)*\s*export default\s*/, ''),
  );
}

function buildCharacterMonaMaps() {
  const catalog = readContentSource(resolve(ROOT, 'tools/data/sources/catalog/mona-community/catalog.json'));
  const forms = readContentSource(resolve(ROOT, 'tools/data/sources/character-text/base-and-manekin.json')).bindings;
  const enka = readContentSource(resolve(ROOT, 'tools/data/sources/catalog/enka/catalog.json')).mapping.characters;
  const travelers = new Set(Object.values(enka).map(v => v.id));

  const entityToMona = new Map();
  const monaToEntity = new Map();
  for (const entry of catalog.characters) {
    let entity = entry.canonicalId;
    if (!entity) {
      const m = /^(Aether|Lumine|Manekina)(Anemo|Cryo|Dendro|Electro|Geo|Hydro|Pyro)$/.exec(entry.monaKey);
      if (m) {
        const formId = `${m[1]}-${m[2]}`.toLowerCase();
        if (Object.hasOwn(forms, formId) || travelers.has(formId)) entity = formId;
      }
    }
    if (entity) {
      if (!entityToMona.has(entity)) entityToMona.set(entity, entry.monaKey);
      monaToEntity.set(entry.monaKey, entity);
      if (entry.exportName) monaToEntity.set(entry.exportName, entity);
    }
  }
  return { entityToMona, monaToEntity };
}

function resolveFilterIds(charList, entityList) {
  const combined = [...new Set([...charList, ...entityList])];
  return combined.length ? new Set(combined) : null;
}

function applyLimit(items, limit) {
  if (!limit || limit <= 0) return items;
  return items.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Shared runtime context cache (avoids re-linking catalog across modes)
// ---------------------------------------------------------------------------
function createSharedCache() {
  let monaRuntimePromise = null;
  let triagePromise = null;
  let enginePromise = null;
  let monaCharsCache = null;
  let monaBuffsCache = null;
  let monaArtifactsCache = null;
  const fixtureCache = new Map();

  return {
    async getMonaRuntime() {
      monaRuntimePromise ??= import('../../../.references/mona-community/beta-tools/runtime-7106.mjs');
      return monaRuntimePromise;
    },
    async getTriage() {
      triagePromise ??= runMonaTriage();
      return triagePromise;
    },
    async getEngine() {
      enginePromise ??= loadContentSchema('/src/engine/src/index.ts');
      return enginePromise;
    },
    getMonaChars() {
      monaCharsCache ??= readMonaAsset('src/assets/_gen_character.js');
      return monaCharsCache;
    },
    getMonaBuffs() {
      monaBuffsCache ??= readMonaAsset('src/assets/_gen_buff.js');
      return monaBuffsCache;
    },
    getMonaArtifacts() {
      monaArtifactsCache ??= readMonaAsset('src/assets/_gen_artifact.js');
      return monaArtifactsCache;
    },
    async getMonaFixture(monaCharName, skillIndex = 0) {
      const key = `${monaCharName}:${skillIndex}`;
      if (!fixtureCache.has(key)) {
        const probe = (await probeMonaSkills({ characters: [monaCharName], indices: [skillIndex], constellations: [0] })).rows[0];
        if (!probe || probe.status !== 'ok') return null;
        fixtureCache.set(key, probe.input);
      }
      return structuredClone(fixtureCache.get(key));
    },
  };
}

async function loadScopedEntities(scope) {
  const catalog = await createRuntimeCatalog({
    characters: [...new Set(scope.characters ?? [])],
    weapons: [...new Set([...(scope.weapons ?? []), ...Object.values(novice)])],
    sets: [...new Set(scope.sets ?? [])],
    actions: [],
  });
  const entities = { characters: [], weapons: [], sets: [] };
  for (const group of ['characters', 'weapons', 'sets']) {
    for (const id of catalog.inventory[group]) {
      entities[group].push(await catalog.get(group, id));
    }
  }
  return { catalog, entities };
}

// ---------------------------------------------------------------------------
// Known Mona simplification & artifact annotators
// ---------------------------------------------------------------------------
function annotateScalingArtifact(levelEntry, binding, skillLabel) {
  if (!levelEntry || levelEntry.error) return null;
  const { actual, expected, extraDamage, element } = levelEntry;
  const expectedElem = String(binding?.element ?? '').toLowerCase();
  const elemMatch = String(element ?? '').toLowerCase() === expectedElem;
  const axes = ['atk_ratio', 'def_ratio', 'hp_ratio', 'em_ratio'];
  let maxAbsDiff = 0;
  let actualSum = 0;
  let expectedSum = 0;
  let activeTerms = 0;
  for (const axis of axes) {
    const a = actual?.[axis] ?? 0;
    const e = expected?.[axis] ?? 0;
    actualSum += a;
    expectedSum += e;
    if (e > 0) activeTerms++;
    maxAbsDiff = Math.max(maxAbsDiff, Math.abs(a - e));
  }
  const relDiff = expectedSum > 0 ? Math.abs(actualSum - expectedSum) / expectedSum : null;
  const ratioMultiple = expectedSum > 0 ? actualSum / expectedSum : null;

  if (!elemMatch) {
    return { kind: 'element-mismatch', note: `Mona element=${element} vs LeyLine element=${expectedElem}` };
  }
  if (Math.abs(extraDamage ?? 0) > 1e-6) {
    return { kind: 'mona-extra-damage-baked', note: `Mona default C0 includes extra_damage=${extraDamage.toFixed(4)}` };
  }
  const termCount = Math.max(1, binding?.definition?.base?.length ?? activeTerms);
  if (maxAbsDiff <= 0.00055 * termCount && (relDiff == null || relDiff <= 0.001)) {
    return {
      kind: 'mona-4-decimal-rounding',
      note: `maxAbsDiff=${maxAbsDiff.toFixed(6)} within Mona 4-decimal rounding bound (terms=${termCount})`,
    };
  }
  if (Number.isFinite(ratioMultiple) && ratioMultiple > 1.5) {
    const rounded = Math.round(ratioMultiple);
    if (rounded >= 2 && Math.abs(ratioMultiple - rounded) <= 0.01) {
      return {
        kind: 'mona-multi-hit-aggregate',
        note: `Mona scaling is ~${rounded}x LeyLine single-hit (${actualSum.toFixed(4)} vs ${expectedSum.toFixed(4)}, label="${skillLabel}")`,
      };
    }
  }
  if (Number.isFinite(ratioMultiple) && ratioMultiple > 0 && ratioMultiple < 0.6) {
    const inv = Math.round(1 / ratioMultiple);
    if (inv >= 2 && Math.abs(1 / ratioMultiple - inv) <= 0.01) {
      return {
        kind: 'leyline-multi-hit-aggregate',
        note: `LeyLine scaling is ~${inv}x Mona (${expectedSum.toFixed(4)} vs ${actualSum.toFixed(4)}, label="${skillLabel}")`,
      };
    }
  }
  return null;
}

function annotateBuffMonaArtifact({ key, entity, target, monaDelta, leylineDelta, usedInjectStat, monaConfig }) {
  if (key === 'SongOfDaysPast4' || entity === 'songofdayspast') {
    return {
      kind: 'mona-songofdayspast-15000-cap',
      note: 'Mona SongOfDaysPast4 uses a fixed recorded healing input / 15,000 cap simplification.',
    };
  }
  if ((key === 'FurinaQ' || entity === 'furina') && (target === 'attribute.healingBonus' || target === 'attribute.incomingHealingBonus')) {
    return {
      kind: 'mona-furina-q-healing-bonus-bug',
      note: 'Known Mona bug: FurinaQ writes healing_bonus instead of incoming_healing_bonus.',
    };
  }
  if (Number.isFinite(monaDelta) && Number.isFinite(leylineDelta) && Math.abs(leylineDelta) > 1e-9) {
    const absDiff = Math.abs(monaDelta - leylineDelta);
    const rel = absDiff / Math.max(Math.abs(monaDelta), Math.abs(leylineDelta));
    if (absDiff <= 0.00055 || rel <= 0.0006) {
      return {
        kind: 'mona-4-decimal-rounding',
        note: `Small numeric drift (abs=${absDiff.toFixed(6)}, rel=${(rel * 100).toFixed(4)}%), consistent with Mona 4-decimal rounding.`,
      };
    }
  }
  if (!usedInjectStat && (monaConfig ?? []).some(f => ['atk', 'base_atk', 'hp', 'max_hp', 'def', 'em', 'elemental_mastery', 'recharge', 'er'].includes(f.name))) {
    return {
      kind: 'mona-fixed-stat-input-mismatch',
      note: 'Mona buff takes a manual stat parameter (atk/hp/def/em/recharge) that was not aligned with LeyLine owner panel.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mode 1: scaling
// ---------------------------------------------------------------------------
async function runScalingMode(options, shared) {
  const started = Date.now();
  const { entityToMona } = buildCharacterMonaMaps();
  const filter = resolveFilterIds(options.characters, options.entities);
  const allChars = catalogInventory().characters.filter(id => entityToMona.has(id));
  const targetChars = applyLimit(filter ? allChars.filter(id => filter.has(id)) : allChars, options.limit);
  const monaNames = [...new Set(targetChars.map(id => entityToMona.get(id)).filter(Boolean))];

  if (!targetChars.length) {
    return {
      mode: 'scaling',
      elapsedMs: Date.now() - started,
      summary: { characters: 0, total: 0, matched: 0, exactLabelMismatch: 0, trueSuspectMismatch: 0, knownArtifactMismatch: 0, nonLabelMismatch: 0, probeError: 0, unavailable: 0 },
      highPriority: [],
      knownArtifacts: [],
      probeErrors: [],
      _internal: null,
    };
  }

  const [{ entities }, probes] = await Promise.all([
    loadScopedEntities({ characters: targetChars }),
    probeMonaSkills({ characters: monaNames, constellations: [0] }),
  ]);
  const [monaInv, leylineInv] = await Promise.all([
    monaCalculationInventory({ probes }),
    leylineSingleHitInventory(entities),
  ]);

  const monaNameSet = new Set(monaNames);
  const menus = monaInv.rows.filter(r => r.kind === 'skill' && monaNameSet.has(r.character));
  const candidates = singleHitCandidates(menus, leylineInv.rows).candidates;
  const scaling = await compareMonaOrdinaryScaling(monaInv.rows, leylineInv.rows, candidates, probes.rows);

  const skillById = new Map(menus.map(s => [s.id, s]));
  const leylineById = new Map(leylineInv.rows.map(r => [r.id, r]));

  const exactMismatches = [];
  const probeErrors = [];
  let matched = 0;
  let nonLabelMismatch = 0;
  let unavailable = 0;

  for (const row of scaling.rows) {
    if (row.status === 'scaling-match') {
      matched++;
      continue;
    }
    if (row.status === 'unavailable') {
      unavailable++;
      continue;
    }
    if (row.status === 'probe-error') {
      probeErrors.push({
        mona: row.mona,
        leyline: row.leyline,
        entity: row.entity,
        error: row.levels?.[0]?.error ?? row.error ?? 'probe-error',
      });
      continue;
    }
    if (row.status === 'scaling-mismatch') {
      const skill = skillById.get(row.mona);
      const hit = leylineById.get(row.leyline);
      const labels = (skill?.occurrences ?? []).map(o => o.label).filter(Boolean);
      const hitNorm = ordinaryHitName(hit?.binding?.name);
      const exactLabel = Boolean(row.labelMatch) || labels.some(l => ordinaryHitName(l) === hitNorm && hitNorm.length > 0);
      if (!exactLabel) {
        nonLabelMismatch++;
        continue;
      }
      const firstDiff = row.levels?.[0] ?? null;
      const artifact = annotateScalingArtifact(firstDiff, hit?.binding, labels.join(' / '));
      exactMismatches.push({
        entity: row.entity,
        mona: row.mona,
        leyline: row.leyline,
        skillLabels: labels,
        leylineName: hit?.binding?.name ?? null,
        element: { mona: firstDiff?.element ?? null, leyline: hit?.binding?.element ?? null },
        firstDiffLevel: firstDiff?.level ?? null,
        actual: firstDiff?.actual ?? null,
        expected: firstDiff?.expected ?? null,
        extraDamage: firstDiff?.extraDamage ?? 0,
        knownMonaArtifact: artifact,
      });
    }
  }

  const highPriority = exactMismatches.filter(m => !m.knownMonaArtifact);
  const knownArtifacts = exactMismatches.filter(m => Boolean(m.knownMonaArtifact));

  return {
    mode: 'scaling',
    elapsedMs: Date.now() - started,
    summary: {
      characters: targetChars.length,
      total: scaling.rows.length,
      matched,
      exactLabelMismatch: exactMismatches.length,
      trueSuspectMismatch: highPriority.length,
      knownArtifactMismatch: knownArtifacts.length,
      nonLabelMismatch,
      probeError: probeErrors.length,
      unavailable,
    },
    highPriority,
    knownArtifacts,
    probeErrors,
    _internal: { targetChars, monaNames, entities, probes, monaInv, leylineInv, candidates, scaling },
  };
}

// ---------------------------------------------------------------------------
// Mode 2: damage-c0
// ---------------------------------------------------------------------------
async function runDamageC0Mode(options, shared, scalingInternal = null) {
  const started = Date.now();
  const engine = await shared.getEngine();
  let ctx = scalingInternal;
  if (!ctx) {
    const scalingResult = await runScalingMode(options, shared);
    ctx = scalingResult._internal;
  }
  if (!ctx) {
    return {
      mode: 'damage-c0',
      elapsedMs: Date.now() - started,
      summary: { eligible: 0, matched: 0, mismatch: 0, unexpectedUnknown: 0, monaAdditionalEffect: 0, probeError: 0, unavailable: 0 },
      mismatches: [],
      unexpectedUnknowns: [],
      monaAdditionalEffects: [],
      probeErrors: [],
      _internal: null,
    };
  }

  const { entities, monaInv, leylineInv, candidates, scaling } = ctx;
  const c0 = await auditMonaOrdinaryBatch(monaInv.rows, leylineInv.rows, candidates, scaling, entities, engine);

  const mismatches = [];
  const unexpectedUnknowns = [];
  const monaAdditionalEffects = [];
  const probeErrors = [];
  let matched = 0;
  let unavailable = 0;

  for (const row of c0.rows) {
    if (row.status === 'matched') {
      matched++;
      continue;
    }
    if (row.status === 'unavailable') {
      unavailable++;
      continue;
    }
    const entity = row.leyline?.split(':')[1] ?? null;
    const lastCase = row.cases?.at(-1) ?? null;
    const reason = row.reason ?? 'unknown';

    if (reason === 'LeyLine damage is unknown') {
      const req = lastCase?.leyline?.requiredInputs ?? [];
      unexpectedUnknowns.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        level: lastCase?.level ?? null,
        reason,
        requiredInputs: req,
        missingInactiveWindows: req.filter(r => r.kind === 'fact' || r.fact).map(r => r.key ?? r.fact ?? r),
        knownInactiveWindowsApplied: Object.keys(row.leylineInactiveWindows ?? {}),
      });
    } else if (reason === 'Mona panel contains an additional effect') {
      monaAdditionalEffects.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        reason,
      });
    } else if (
      reason === 'LeyLine damage differs from baseline equation'
      || reason === 'Damage differs on common panel'
      || reason === 'Mona damage differs from baseline equation'
    ) {
      const leyRel = relError(lastCase?.leyline?.expected, lastCase?.leyline?.actual);
      const cpRel = relError(lastCase?.commonPanel?.expected, lastCase?.commonPanel?.actual);
      const monaRel = relError(lastCase?.mona?.expected, lastCase?.mona?.actual);
      mismatches.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        level: lastCase?.level ?? null,
        reason,
        leylineExpected: lastCase?.leyline?.expected ?? null,
        leylineActual: lastCase?.leyline?.actual ?? null,
        leylineRelError: leyRel,
        commonPanelExpected: lastCase?.commonPanel?.expected ?? null,
        commonPanelActual: lastCase?.commonPanel?.actual ?? null,
        commonPanelRelError: cpRel,
        monaExpected: lastCase?.mona?.expected ?? null,
        monaActual: lastCase?.mona?.actual ?? null,
        monaRelError: monaRel,
      });
    } else {
      probeErrors.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        reason,
      });
    }
  }

  return {
    mode: 'damage-c0',
    elapsedMs: Date.now() - started,
    summary: {
      eligible: c0.rows.length,
      matched,
      mismatch: mismatches.length,
      unexpectedUnknown: unexpectedUnknowns.length,
      monaAdditionalEffect: monaAdditionalEffects.length,
      probeError: probeErrors.length,
      unavailable,
    },
    mismatches,
    unexpectedUnknowns,
    monaAdditionalEffects,
    probeErrors,
    _internal: { ...ctx, c0 },
  };
}

// ---------------------------------------------------------------------------
// Mode 3: damage-c6
// ---------------------------------------------------------------------------
async function runDamageC6Mode(options, shared) {
  const started = Date.now();
  const engine = await shared.getEngine();
  const { api } = await shared.getMonaRuntime();
  const { entityToMona } = buildCharacterMonaMaps();
  const filter = resolveFilterIds(options.characters, options.entities);
  const allChars = catalogInventory().characters.filter(id => entityToMona.has(id));
  const targetChars = applyLimit(filter ? allChars.filter(id => filter.has(id)) : allChars, options.limit);
  const monaNames = [...new Set(targetChars.map(id => entityToMona.get(id)).filter(Boolean))];

  if (!targetChars.length) {
    return {
      mode: 'damage-c6',
      elapsedMs: Date.now() - started,
      summary: { eligibleC0Pairs: 0, matched: 0, mismatch: 0, unexpectedUnknown: 0, monaC6AdditionalEffect: 0, c6DeltaDivergence: 0, unavailable: 0 },
      mismatches: [],
      unexpectedUnknowns: [],
      monaC6AdditionalEffects: [],
      probeErrors: [],
    };
  }

  const [{ entities }, probes] = await Promise.all([
    loadScopedEntities({ characters: targetChars }),
    probeMonaSkills({ characters: monaNames, constellations: [0, 6] }),
  ]);
  const [monaInv, leylineInv] = await Promise.all([
    monaCalculationInventory({ probes }),
    leylineSingleHitInventory(entities),
  ]);

  const monaNameSet = new Set(monaNames);
  const menus = monaInv.rows.filter(r => r.kind === 'skill' && monaNameSet.has(r.character));
  const candidates = singleHitCandidates(menus, leylineInv.rows).candidates;
  const scaling = await compareMonaOrdinaryScaling(monaInv.rows, leylineInv.rows, candidates, probes.rows);
  const c0 = await auditMonaOrdinaryBatch(monaInv.rows, leylineInv.rows, candidates, scaling, entities, engine);
  const c6 = await auditMonaOrdinaryC6(monaInv.rows, leylineInv.rows, c0, entities, engine);

  const charById = new Map(entities.characters.map(c => [c.id, c]));
  const weaponById = new Map(entities.weapons.map(w => [w.id, w]));
  const leylineById = new Map(leylineInv.rows.map(r => [r.id, r]));
  const baselinePanelLabel = /^(角色基础|武器基础|圣遗物词条|角斗士的终幕礼[24]|角色副属性|初始值)/;

  const mismatches = [];
  const unexpectedUnknowns = [];
  const monaC6AdditionalEffects = [];
  const probeErrors = [];
  let matched = 0;
  let unavailable = 0;
  let c6DeltaDivergence = 0;

  for (const row of c6.rows) {
    if (row.status === 'matched') {
      matched++;
      continue;
    }
    if (row.status === 'unavailable') {
      unavailable++;
      continue;
    }
    const entity = row.leyline?.split(':')[1] ?? null;
    const lastCase = row.cases?.at(-1) ?? null;
    const reason = row.reason ?? 'unknown';

    if (reason === 'C6 LeyLine damage is unknown') {
      const req = lastCase?.leyline?.requiredInputs ?? [];
      unexpectedUnknowns.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        level: lastCase?.level ?? null,
        reason,
        requiredInputs: req,
      });
    } else if (reason === 'Mona C6 panel contains an additional effect') {
      // Supplementary check: inspect which Mona C6 extra labels fired and compare LeyLine C6 at T10
      const hitRow = leylineById.get(row.leyline);
      const character = charById.get(entity);
      const extraLabels = [];
      let monaC6Damage = null;
      let leylineC6Damage = null;
      let leylineC6Neutral = null;
      let leylineC6Ratio = null;
      let monaC6Ratio = null;
      let leylineC6RequiredInputs = [];
      try {
        const input = structuredClone(row.monaInput);
        input.character.skill1 = 9;
        input.character.skill2 = 9;
        input.character.skill3 = 9;
        const analysis = api.CalculatorInterface.get_damage_analysis(input, null);
        const additionalRatioLabel = /(?:^C[1-6]|C[1-6]「|[1-6]命|命座|天赋)/;
        for (const key of ['atk', 'hp', 'def', 'em', 'bonus', 'atk_ratio', 'def_ratio', 'hp_ratio', 'em_ratio']) {
          const entries = Object.entries(analysis[key] ?? {}).filter(([, value]) => value !== 0);
          const isRatio = key.endsWith('_ratio');
          for (const [label, value] of entries) {
            if (!baselinePanelLabel.test(label) && (!isRatio || (label !== '技能倍率' && (additionalRatioLabel.test(label) || entries.length > 1)))) {
              extraLabels.push({ field: key, label, value });
            }
          }
        }
        monaC6Damage = analysis.normal?.non_critical ?? null;
        // Neutral Mona C0 at T10 with same artifacts/panel
        const inputC0 = structuredClone(input);
        inputC0.character.constellation = 0;
        const analysisC0 = api.CalculatorInterface.get_damage_analysis(inputC0, null);
        const monaC0Damage = analysisC0.normal?.non_critical ?? null;
        if (monaC6Damage != null && monaC0Damage != null && monaC0Damage > 0) {
          monaC6Ratio = monaC6Damage / monaC0Damage;
        }

        if (character && hitRow) {
          const weapon = weaponById.get(novice[character.identity.weaponType]);
          const talent = character.talents.find(t => t.id === hitRow.binding.skillId);
          const actualHit = talent?.hits.find(h => h.id === hitRow.binding.hitId);
          if (weapon && talent && actualHit) {
            const bonuses = row.talentBonuses ?? { normal: 0, skill: 0, burst: 0 };
            const grants = row.talentGrants ?? soloTalentGrants(character);
            const t10Talents = Object.fromEntries(['normal', 'skill', 'burst'].map(cat => [cat, Math.max(1, 10 - (bonuses[cat] ?? 0) - (grants[cat] ?? 0))]));
            const build = { ...auditBuild(character, weapon), level: 90, ascension: 6, constellation: 6, talents: t10Talents };
            const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
            if (prepared.ok) {
              const { setup, request } = auditHit(character, talent, actualHit, 90);
              setGateFacts(character, request.frame, row.leylineInactiveWindows ?? {});
              const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
              leylineC6Damage = evaluated.totals.all.value?.value ?? null;
              leylineC6RequiredInputs = evaluated.requiredInputs ?? [];
              const { panel, specialized, promotion } = ordinaryPanel(character, weapon);
              const elemBonus = specialized === hitRow.binding.element + 'Bonus' ? promotion : 0;
              leylineC6Neutral = hitRow.binding.definition.base.reduce((tot, term) => {
                const param = talent.parameters.find(p => p.id === term.parameter);
                return tot + panel[term.stat] * (param?.values[9] ?? 0);
              }, 0) * (1 + elemBonus) * 0.45;
              if (leylineC6Damage != null && leylineC6Neutral > 0) {
                leylineC6Ratio = leylineC6Damage / leylineC6Neutral;
              }
            }
          }
        }
      } catch {
        // Supplementary inspection is best-effort
      }
      const diverges = monaC6Ratio != null && leylineC6Ratio != null && !isNear(monaC6Ratio, leylineC6Ratio, 0.001, 0.001);
      if (diverges) c6DeltaDivergence++;
      monaC6AdditionalEffects.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        extraLabels,
        monaC6Ratio,
        leylineC6Ratio,
        diverges,
        leylineC6Unknown: leylineC6Damage == null,
        leylineC6RequiredInputs: leylineC6RequiredInputs.length ? leylineC6RequiredInputs : undefined,
      });
    } else if (
      reason.includes('differs')
      || reason.includes('scaling')
    ) {
      const leyRel = relError(lastCase?.leyline?.expected, lastCase?.leyline?.actual);
      const cpRel = relError(lastCase?.commonPanel?.expected, lastCase?.commonPanel?.actual);
      mismatches.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        level: lastCase?.level ?? null,
        reason,
        talentBonuses: row.talentBonuses ?? null,
        leylineExpected: lastCase?.leyline?.expected ?? null,
        leylineActual: lastCase?.leyline?.actual ?? null,
        leylineRelError: leyRel,
        commonPanelExpected: lastCase?.commonPanel?.expected ?? null,
        commonPanelActual: lastCase?.commonPanel?.actual ?? null,
        commonPanelRelError: cpRel,
      });
    } else {
      probeErrors.push({
        entity,
        mona: row.mona,
        leyline: row.leyline,
        reason,
      });
    }
  }

  return {
    mode: 'damage-c6',
    elapsedMs: Date.now() - started,
    summary: {
      eligibleC0Pairs: c0.mappings.length,
      matched,
      mismatch: mismatches.length,
      unexpectedUnknown: unexpectedUnknowns.length,
      monaC6AdditionalEffect: monaC6AdditionalEffects.length,
      c6DeltaDivergence,
      probeError: probeErrors.length,
      unavailable,
    },
    mismatches,
    unexpectedUnknowns,
    monaC6AdditionalEffects,
    probeErrors,
  };
}

// ---------------------------------------------------------------------------
// Auto-scenario inference helpers for buffs / weapons / sets4pc
// ---------------------------------------------------------------------------
function readMonaProbeBase(attrPanel, baseKind) {
  if (baseKind === 'attack') return (attrPanel.atk?.['角色基础攻击'] ?? 0) + (attrPanel.atk?.['武器基础攻击'] ?? 0);
  if (baseKind === 'hp') return attrPanel.hp?.['角色基础生命'] ?? 0;
  if (baseKind === 'defense') return attrPanel.def?.['角色基础防御'] ?? 0;
  return 1;
}

function inferMonaBuffParams(triageRow) {
  const params = {};
  let injectOwnerStat = null;
  let rank = 0;
  let refinement = 1;
  let talentLevel = 10;
  let ascension = 6;
  let preferredElement = null;

  const key = triageRow.key;
  const cm = /C([1-6])(?![0-9])/.exec(key);
  if (cm) rank = Number(cm[1]);

  for (const field of triageRow.monaConfig ?? []) {
    const name = field.name;
    let val = structuredClone(field.default);

    if (['rate', 'ratio', 'p', 'percent', 'rate1', 'rate2', 'full_rate'].includes(name) && typeof val === 'number') {
      val = typeof field.max === 'number' && field.max > 0 ? Math.min(1, field.max) : 1;
    } else if (['effect_active', 'active', 'use_buff', 'use_effect', 'is_effect', 'domain_active', 'has_shield', 'after_skill_burst', 'after_skill', 'is_magical_secret_rite_active', 'hexerei_secret_rite', 'polestar', 'stellar_triggered', 'stellar_conduct'].includes(name) && typeof val === 'boolean') {
      val = true;
    } else if (['recipient_on_field', 'on_field'].includes(name) && typeof val === 'boolean') {
      val = true;
    } else if (/^c([1-6])$/.test(name) && typeof val === 'boolean') {
      const cRank = Number(name.slice(1));
      val = rank >= cRank;
    } else if (name === 'constellation' && typeof val === 'number') {
      val = rank;
    } else if (['skill_level', 'skill1', 'skill2', 'skill3', 'e_level', 'q_level'].includes(name) && typeof val === 'number') {
      val = Math.min(field.max ?? 10, Math.max(field.min ?? 1, 10));
      talentLevel = val;
    } else if (name === 'ascended' && key === 'NicoleE' && typeof val === 'boolean') {
      val = false;
    } else if (name === 'refine' && typeof val === 'number') {
      val = 1;
      refinement = 1;
    } else if (name === 'ascension' && typeof val === 'number') {
      val = 6;
      ascension = 6;
    } else if (name === 'reaction_element' && field.type === 'option' && val === 0) {
      val = 1; // Select first valid reaction element (e.g. Durin)
    } else if (name === 'element' && typeof val === 'string') {
      preferredElement = val.toLowerCase();
    } else if (name === 'elements' && Array.isArray(val) && val.length === 0) {
      val = ['Cryo'];
      preferredElement = 'cryo';
    } else if (['stack', 'stacks', 'level', 'count', 'stacks_available', 'avg_level'].includes(name) && typeof val === 'number' && val === 0) {
      val = typeof field.max === 'number' && field.max > 0 ? Math.min(1, field.max) : 1;
    } else if (typeof val === 'number' && val === 0 && typeof field.max === 'number' && field.max > 0 && !['constellation', 'hit_mode', 'mode', 'rate_impact'].includes(name)) {
      val = field.max;
    }

    // Detect owner-stat injection candidates
    if (!injectOwnerStat) {
      if (name === 'atk' || name === 'nicole_atk') injectOwnerStat = { stat: 'attack', monaParam: name };
      else if (name === 'base_atk') injectOwnerStat = { stat: 'whiteAttack', monaParam: name };
      else if (name === 'hp' || name === 'max_hp') injectOwnerStat = { stat: 'hp', monaParam: name };
      else if (name === 'def') injectOwnerStat = { stat: 'defense', monaParam: name };
      else if (name === 'em' || name === 'elemental_mastery' || name === 'max_em') injectOwnerStat = { stat: 'elementalMastery', monaParam: name };
      else if (name === 'recharge' || name === 'er') injectOwnerStat = { stat: 'energyRecharge', monaParam: name };
      else if (name === 'crit') injectOwnerStat = { stat: 'critRate', monaParam: name, scale: field.type === 'floatPercentageInput' ? 100 : 1 };
    }

    params[name] = val;
  }

  return { params, injectOwnerStat, rank, refinement, talentLevel, ascension, preferredElement };
}

async function probeMonaBuffObservedEffects(api, shared, key, monaParams, recipientMonaName = 'Kaeya', skillIndex = 0) {
  const input = await shared.getMonaFixture(recipientMonaName, skillIndex);
  if (!input) return { ok: false, error: `Missing Mona fixture for ${recipientMonaName}:${skillIndex}`, effects: [] };
  Object.assign(input.character, { level: 90, ascend: false, constellation: 0, skill1: 0, skill2: 0, skill3: 0 });
  Object.assign(input.weapon, { level: 1, ascend: false, refine: 1 });
  input.artifacts = [];

  const monaBuff = {
    name: key,
    config: Object.keys(monaParams).length ? { [key]: monaParams } : 'NoConfig',
  };

  try {
    const beforeAttr = api.CommonInterface.get_attribute({ ...structuredClone(input), buffs: [] });
    const afterAttr = api.CommonInterface.get_attribute({ ...structuredClone(input), buffs: [monaBuff] });
    const beforeDmg = api.CalculatorInterface.get_damage_analysis({ ...structuredClone(input), buffs: [] }, null);
    const afterDmg = api.CalculatorInterface.get_damage_analysis({ ...structuredClone(input), buffs: [monaBuff] }, null);

    const observed = [];
    const recipientElem = String(beforeDmg.element ?? 'cryo').toLowerCase();
    let altWeaponAttrDelta = null;
    let altCharAttrDelta = null;
    const isFixedStatDelta = (field, rawDelta) => {
      if (field === 'atk') {
        if (!altWeaponAttrDelta) {
          const inp2 = structuredClone(input);
          inp2.weapon.level = 90;
          const b2 = api.CommonInterface.get_attribute({ ...inp2, buffs: [] });
          const a2 = api.CommonInterface.get_attribute({ ...inp2, buffs: [monaBuff] });
          altWeaponAttrDelta = sum(a2.atk) - sum(b2.atk);
        }
        return Math.abs(altWeaponAttrDelta - rawDelta) <= 1e-5;
      }
      if (field === 'def' || field === 'hp') {
        if (!altCharAttrDelta) {
          const inp2 = structuredClone(input);
          inp2.character.level = 20;
          const b2 = api.CommonInterface.get_attribute({ ...inp2, buffs: [] });
          const a2 = api.CommonInterface.get_attribute({ ...inp2, buffs: [monaBuff] });
          altCharAttrDelta = {
            def: sum(a2.def) - sum(b2.def),
            hp: sum(a2.hp) - sum(b2.hp),
          };
        }
        return Math.abs(altCharAttrDelta[field] - rawDelta) <= 1e-5;
      }
      return false;
    };

    for (const spec of MONA_PROBE_FIELDS) {
      const beforeObj = spec.source === 'damage' ? beforeDmg : beforeAttr;
      const afterObj = spec.source === 'damage' ? afterDmg : afterAttr;
      const rawDelta = sum(afterObj[spec.field]) - sum(beforeObj[spec.field]);
      if (Math.abs(rawDelta) <= 1e-9) continue;
      const isFixed = spec.base ? isFixedStatDelta(spec.field, rawDelta) : false;
      const baseStat = (spec.base && !isFixed) ? readMonaProbeBase(beforeAttr, spec.base) : 1;
      const normalized = (spec.base && !isFixed) ? rawDelta / baseStat : rawDelta * spec.sign;
      const leylineTarget = spec.leylineTarget === 'target.resistance'
        ? `target.resistance.${recipientElem}`
        : spec.leylineTarget;
      observed.push({
        leylineTarget,
        source: spec.source,
        field: spec.field,
        sign: spec.sign,
        base: isFixed ? null : spec.base,
        isFixed,
        rawDelta,
        normalized,
      });
    }
    return { ok: true, effects: observed, recipientElem, recipientMonaName, skillIndex };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), effects: [] };
  }
}

function dedupeRedundantDamageBonus(observed, leylineEntries) {
  const elemBonuses = observed.filter(e => /^attribute\.(pyro|hydro|electro|cryo|anemo|geo|dendro|physical)Bonus$/.test(e.leylineTarget));
  if (!elemBonuses.length) return observed;
  const hasLeylineDamageBonus = leylineEntries.some(e => e.modifier.target === 'attribute.damageBonus');
  if (hasLeylineDamageBonus) return observed;
  return observed.filter(e => {
    if (e.leylineTarget !== 'attribute.damageBonus') return true;
    return !elemBonuses.some(eb => Math.abs(eb.normalized - e.normalized) <= 1e-6);
  });
}

function collectEntityBuffEntries(doc, kind) {
  const entries = [];
  const pushFrom = (buffs, group, index, extra = {}) => {
    for (const [bi, buff] of (buffs ?? []).entries()) {
      for (const [mi, modifier] of (buff.modifiers ?? []).entries()) {
        entries.push({
          group,
          index,
          buffIndex: bi,
          modifierIndex: mi,
          buff,
          modifier,
          pointer: group === 'weapon'
            ? `/buffs/${bi}/modifiers/${mi}`
            : `/${group}/${index}/buffs/${bi}/modifiers/${mi}`,
          ...extra,
        });
      }
    }
  };
  if (kind === 'character') {
    for (const [i, t] of (doc.talents ?? []).entries()) pushFrom(t.buffs, 'talents', i, { talent: t });
    for (const [i, p] of (doc.passives ?? []).entries()) pushFrom(p.buffs, 'passives', i, { unlockAscension: p.unlockAscension ?? (i === 0 ? 1 : i === 1 ? 4 : 0) });
    for (const [i, c] of (doc.constellations ?? []).entries()) pushFrom(c.buffs, 'constellations', i, { rank: c.rank ?? i + 1 });
  } else if (kind === 'weapon') {
    pushFrom(doc.buffs, 'weapon', 0);
  } else if (kind === 'set') {
    for (const [i, e] of (doc.effects ?? []).entries()) pushFrom(e.buffs, 'effects', i, { pieces: e.pieces });
  }
  return entries;
}

function buildFormulaMap(doc) {
  const map = new Map();
  for (const f of doc?.formulas ?? []) {
    if (f?.id) map.set(f.id, f);
  }
  return map;
}

function hasSourceEventCondition(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.at === 'source-event') return true;
  return Object.values(node.inputs ?? {}).some(hasSourceEventCondition);
}

function extractConditionSatisfyingFacts(node, factsDecl, out, negated = false, formulaMap = null) {
  if (!node || typeof node !== 'object') return;
  if (node.fact) {
    if (node.at === 'source-event') return;
    const decl = combatFactDeclaration(factsDecl, node.fact);
    if (!decl) return;
    const scope = node.of ?? decl.scope;
    const key = node.fact;
    if (decl.type.kind === 'boolean') {
      out.push({ key, scope, value: !negated });
    } else if (decl.type.kind === 'quantity') {
      out.push({ key, scope, value: negated ? 0 : Math.min(decl.type.max ?? 1, Math.max(decl.type.min ?? 1, 1)) });
    } else if (decl.type.kind === 'enum') {
      const nonNone = (decl.type.values ?? []).find(v => v !== 'none') ?? decl.type.values?.[0];
      out.push({ key, scope, value: negated ? 'none' : nonNone });
    }
    return;
  }
  if (!node.call) return;
  const inputs = node.inputs ?? {};

  // Resolve entity-local formula templates (enum-condition, quantity-condition, etc.)
  const formula = formulaMap?.get(node.call);
  if (formula?.template) {
    const tpl = formula.template;
    const inputNode = inputs[tpl.input] ?? Object.values(inputs)[0];
    if (inputNode?.fact) {
      const decl = combatFactDeclaration(factsDecl, inputNode.fact);
      if (decl) {
        const scope = inputNode.of ?? decl.scope;
        if (tpl.id === 'enum-condition' && tpl.equals !== undefined) {
          const val = negated
            ? (decl.type.values ?? []).find(v => v !== tpl.equals) ?? 'none'
            : tpl.equals;
          out.push({ key: inputNode.fact, scope, value: val });
          return;
        }
        if (tpl.id === 'quantity-condition' && typeof tpl.threshold === 'number') {
          const thr = tpl.threshold;
          const isScalarRatio = tpl.unit === 'scalar' && thr <= 1 && (tpl.maxInput ?? 1) <= 1;
          const step = isScalarRatio ? 0.1 : 1;
          let targetVal = thr;
          if (tpl.relation === 'lt') targetVal = Math.max(0, thr - step);
          else if (tpl.relation === 'lte') targetVal = Math.max(0, thr);
          else if (tpl.relation === 'gt') targetVal = thr + step;
          else if (tpl.relation === 'gte') targetVal = thr;
          if (negated) targetVal = targetVal >= thr ? Math.max(0, thr - step) : thr + step;
          out.push({ key: inputNode.fact, scope, value: targetVal });
          return;
        }
      }
    }
  }

  if (node.call === 'condition.not') {
    extractConditionSatisfyingFacts(inputs.value ?? Object.values(inputs)[0], factsDecl, out, !negated, formulaMap);
    return;
  }
  if (node.call === 'condition.all') {
    for (const child of Object.values(inputs)) {
      extractConditionSatisfyingFacts(child, factsDecl, out, negated, formulaMap);
    }
    return;
  }
  if (node.call === 'condition.any') {
    const first = Object.values(inputs)[0];
    if (first) extractConditionSatisfyingFacts(first, factsDecl, out, negated, formulaMap);
    return;
  }
  // Comparisons: eq, neq, gt, gte, lt, lte
  const left = inputs.left ?? inputs.a;
  const right = inputs.right ?? inputs.b;
  const factSide = left?.fact ? left : right?.fact ? right : null;
  const constSide = left?.fact ? right : right?.fact ? left : null;
  if (factSide) {
    const decl = combatFactDeclaration(factsDecl, factSide.fact);
    if (!decl) return;
    const scope = factSide.of ?? decl.scope;
    const constVal = typeof constSide === 'number' ? constSide : constSide?.amount ?? constSide?.value;
    if (decl.type.kind === 'quantity' && typeof constVal === 'number') {
      let targetVal = constVal;
      if (node.call === 'condition.gt') targetVal = constVal + (decl.type.unit === 'scalar' && constVal < 1 ? 0.1 : 1);
      else if (node.call === 'condition.gte') targetVal = Math.max(constVal, decl.type.min ?? constVal);
      else if (node.call === 'condition.lt') targetVal = Math.max(0, constVal - (decl.type.unit === 'scalar' && constVal <= 1 ? 0.2 : 1));
      else if (node.call === 'condition.lte') targetVal = Math.max(0, constVal);
      if (negated) targetVal = targetVal === 0 ? 1 : 0;
      out.push({ key: factSide.fact, scope, value: targetVal });
      return;
    }
    if (decl.type.kind === 'enum' && typeof constVal === 'string') {
      const val = (node.call === 'condition.neq') !== negated
        ? (decl.type.values ?? []).find(v => v !== constVal) ?? constVal
        : constVal;
      out.push({ key: factSide.fact, scope, value: val });
      return;
    }
    if (decl.type.kind === 'boolean') {
      const bVal = typeof constVal === 'boolean' ? constVal : true;
      out.push({ key: factSide.fact, scope, value: ((node.call === 'condition.neq') !== negated) ? !bVal : bVal });
      return;
    }
  }
  for (const child of Object.values(inputs)) {
    extractConditionSatisfyingFacts(child, factsDecl, out, false, formulaMap);
  }
}

function extractValueStackFacts(valueNode, factsDecl, monaParams, out, formulaMap = null, preferFormulaMax = false, parentFormula = null) {
  if (!valueNode || typeof valueNode !== 'object') return;
  if (valueNode.fact) {
    const decl = combatFactDeclaration(factsDecl, valueNode.fact);
    if (!decl) return;
    const scope = valueNode.of ?? decl.scope;
    if (decl.type.kind === 'quantity') {
      const factKey = valueNode.fact;
      let explicitVal;
      if (/crit/i.test(factKey) && decl.type.unit === 'scalar' && typeof monaParams?.crit === 'number') {
        explicitVal = monaParams.crit > 1 ? monaParams.crit / 100 : monaParams.crit;
      } else if ((decl.type.unit === 'elementalMastery' || /mastery/i.test(factKey)) && typeof monaParams?.em === 'number') {
        explicitVal = monaParams.em;
      } else if (decl.type.unit === 'hp' && typeof monaParams?.regeneration === 'number') {
        explicitVal = monaParams.regeneration;
      } else {
        explicitVal = monaParams?.fanfare_value
          ?? monaParams?.fighting_spirit
          ?? monaParams?.secs
          ?? monaParams?.talent1_stack
          ?? monaParams?.stack_talent2
          ?? monaParams?.character_count
          ?? monaParams?.nightsoul
          ?? monaParams?.regeneration
          ?? monaParams?.stack
          ?? monaParams?.stacks
          ?? monaParams?.level
          ?? monaParams?.count
          ?? monaParams?.stacks_available
          ?? monaParams?.avg_level;
      }
      const formulaMax = preferFormulaMax && typeof parentFormula?.template?.maxInput === 'number'
        ? parentFormula.template.maxInput
        : null;
      const val = typeof explicitVal === 'number' && explicitVal > 0
        ? Math.min(decl.type.max ?? explicitVal, explicitVal)
        : formulaMax != null
          ? Math.min(decl.type.max ?? formulaMax, formulaMax)
          : Math.min(decl.type.max ?? 1, Math.max(decl.type.min ?? 1, 1));
      out.push({ key: factKey, scope, value: val });
    } else if (decl.type.kind === 'boolean') {
      out.push({ key: valueNode.fact, scope, value: true });
    }
    return;
  }
  const nextFormula = valueNode.call && formulaMap?.get(valueNode.call) ? formulaMap.get(valueNode.call) : parentFormula;
  for (const child of Object.values(valueNode.inputs ?? {})) {
    extractValueStackFacts(child, factsDecl, monaParams, out, formulaMap, preferFormulaMax, nextFormula);
  }
}

function synthesizeTriggerEvent(buff, entry, ownerDoc, kind) {
  const trigger = buff.trigger;
  if (!trigger || trigger === 'permanent' || trigger.kind === 'permanent') return null;
  if (trigger === 'cast' || trigger.cast) {
    const skillId = trigger.cast ?? entry.talent?.id ?? ownerDoc.talents?.[2]?.id ?? ownerDoc.talents?.[1]?.id ?? ownerDoc.talents?.[0]?.id;
    return { kind: 'action', skillId, targetIds: [], actorOnField: true };
  }
  if (trigger.kind !== 'event' || !trigger.selector) return null;
  const sel = trigger.selector;
  const evKind = sel.kinds?.[0] ?? 'action';
  const actorId = sel.actor === 'recipient' ? 'peer' : 'actor';
  const eventFacts = {};
  if (sel.observation?.key) {
    const obsKey = sel.observation.key;
    const obsVal = sel.observation.test === 'true' ? { value: { kind: 'boolean', value: true }, provenance: 'explicit', sourceRefs: [] }
      : sel.observation.test === 'false' ? { value: { kind: 'boolean', value: false }, provenance: 'explicit', sourceRefs: [] }
        : { value: { kind: 'quantity', unit: 'count', value: 1 }, provenance: 'explicit', sourceRefs: [] };
    eventFacts[obsKey] = obsVal;
  }
  if (evKind === 'action') {
    const cat = sel.categories?.[0];
    const skillId = sel.skillIds?.[0]
      ?? (kind === 'character' && cat ? ownerDoc.talents?.find(t => t.category === cat)?.id : null)
      ?? (kind === 'character' ? ownerDoc.talents?.[2]?.id : 'kaeya.burst');
    return { kind: 'action', actorId, skillId, ...(cat ? { category: cat } : {}), targetIds: [], actorOnField: true, ...(Object.keys(eventFacts).length ? { facts: eventFacts } : {}) };
  }
  if (evKind === 'hit') {
    const cat = sel.categories?.[0] ?? 'skill';
    const talent = kind === 'character' ? (ownerDoc.talents?.find(t => t.category === cat) ?? ownerDoc.talents?.[0]) : null;
    const hitId = sel.hitIds?.[0] ?? talent?.hits?.[0]?.id ?? 'kaeya.skill.param1';
    const skillId = sel.skillIds?.[0] ?? talent?.id ?? 'kaeya.skill';
    return {
      kind: 'hit',
      actorId,
      skillId,
      hitId,
      category: cat,
      actorOnField: true,
      ...(sel.elements?.[0] ? { element: sel.elements[0] } : {}),
      targetIds: ['enemy'],
      ...(Object.keys(eventFacts).length ? { facts: eventFacts } : {}),
    };
  }
  if (evKind === 'reaction') {
    const reactionId = sel.reactionIds?.[0] ?? 'swirl';
    const reactionElement = Array.isArray(sel.reactionElements)
      ? sel.reactionElements[0]
      : (sel.reactionElements?.[reactionId]?.[0] ?? (['swirl', 'crystallize'].includes(reactionId) ? 'cryo' : undefined));
    return {
      kind: 'reaction',
      actorId,
      reactionId,
      actorOnField: true,
      ...(reactionElement ? { reactionElement } : {}),
      targetIds: ['enemy'],
      ...(Object.keys(eventFacts).length ? { facts: eventFacts } : {}),
    };
  }
  return { kind: evKind, actorId, targetIds: ['enemy'], actorOnField: true, ...(Object.keys(eventFacts).length ? { facts: eventFacts } : {}) };
}

const FIXED_STAT_MAP = {
  atk: { monaFixed: 'ATKFixed', monaPct: 'ATKPercentage', flatTargets: ['attribute.flatAttack', 'attribute.attack'] },
  def: { monaFixed: 'DEFFixed', monaPct: 'DEFPercentage', flatTargets: ['attribute.flatDefense', 'attribute.defense'] },
  hp: { monaFixed: 'HPFixed', monaPct: 'HPPercentage', flatTargets: ['attribute.flatHp', 'attribute.hp'] },
};

function scopeEntityBuffEntries(allEntries, kind, triageRow) {
  let scoped = allEntries;
  if (kind === 'character') {
    const cm = /C([1-6])(?![0-9])/.exec(triageRow.key);
    const tm = /(?:Talent|P|A)([12])(?![0-9])/.exec(triageRow.key);
    if (cm) {
      const rank = Number(cm[1]);
      const byRank = allEntries.filter(e => e.group === 'constellations' && e.rank === rank);
      if (byRank.length) scoped = byRank;
    } else if (tm) {
      const idx = tm[1] === '1' ? 0 : 1;
      const byIdx = allEntries.filter(e => e.group === 'passives' && e.index === idx);
      const byPassives = allEntries.filter(e => e.group === 'passives');
      if (byIdx.length) scoped = byIdx;
      else if (byPassives.length) scoped = byPassives;
    } else if (/Q(?![a-z])/.test(triageRow.key)) {
      const byQ = allEntries.filter(e => e.group === 'talents' && e.index === 2);
      const byBurstWord = allEntries.filter(e => /burst|large/i.test(e.buff.windowFact ?? '') || /burst|large/i.test(e.buff.id ?? ''));
      if (/Talent|Magus/i.test(triageRow.key) && byBurstWord.length) scoped = byBurstWord;
      else if (byQ.length) scoped = byQ;
      else if (byBurstWord.length) scoped = byBurstWord;
    } else if (/E(?![a-z])/.test(triageRow.key)) {
      const byE = allEntries.filter(e => e.group === 'talents' && e.index === 1);
      const bySkillWord = allEntries.filter(e => /skill|small/i.test(e.buff.windowFact ?? '') || /skill|small/i.test(e.buff.id ?? ''));
      if (/Talent|Magus/i.test(triageRow.key) && bySkillWord.length) scoped = bySkillWord;
      else if (byE.length) scoped = byE;
      else if (bySkillWord.length) scoped = bySkillWord;
    }
  } else if (kind === 'set') {
    const fourPc = allEntries.filter(e => e.pieces === 4);
    if (fourPc.length) scoped = fourPc;
  }
  return scoped;
}

function resolveObservedFixedTargets(observed, triageRow, allEntityEntries, scopedEntries) {
  const monaAttrs = new Set((triageRow.monaEffects ?? []).map(e => e.attribute));
  return observed.map(obs => {
    const info = FIXED_STAT_MAP[obs.field];
    if (!info) return obs;
    const hasMonaFixed = monaAttrs.has(info.monaFixed);
    const hasMonaPct = monaAttrs.has(info.monaPct);
    const isFixed = Boolean(obs.isFixed) || (hasMonaFixed && !hasMonaPct);
    if (!isFixed) return obs;
    const pickedTarget = info.flatTargets.find(t => scopedEntries.some(e => e.modifier.target === t))
      ?? info.flatTargets.find(t => allEntityEntries.some(e => e.modifier.target === t))
      ?? info.flatTargets[0];
    return {
      ...obs,
      leylineTarget: pickedTarget,
      base: null,
      normalized: obs.rawDelta,
    };
  });
}

function conditionHasNegatedOnField(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.call === 'condition.not') {
    const inner = node.inputs?.value ?? Object.values(node.inputs ?? {})[0];
    if (inner?.fact === 'onField') return true;
  }
  return Object.values(node.inputs ?? {}).some(conditionHasNegatedOnField);
}

function entryMentionsPattern(entry, pattern) {
  const text = `${entry.buff.id ?? ''} ${entry.buff.windowFact ?? ''} ${JSON.stringify(entry.buff.condition ?? '')} ${JSON.stringify(entry.modifier.condition ?? '')}`;
  return pattern.test(text);
}

function selectCandidateLeylineEntries(doc, kind, triageRow, targetList, monaParams = {}) {
  const allEntries = collectEntityBuffEntries(doc, kind);
  if (!allEntries.length) return [];

  const scoped = scopeEntityBuffEntries(allEntries, kind, triageRow);
  const targetSet = new Set(targetList);
  let matching = scoped.filter(e => targetSet.has(e.modifier.target));
  if (!matching.length) {
    matching = allEntries.filter(e => targetSet.has(e.modifier.target));
  }
  if (!matching.length) return [];

  // Prefer team/target entries over owner-only entries for external buff panel comparisons
  const entryRecipient = e => e.modifier.recipient ?? e.buff.recipient ?? 'owner';
  const isTeamOrTarget = e => {
    const r = entryRecipient(e);
    return r === 'team' || r === 'target' || (typeof r === 'object' && r?.role === 'team');
  };
  const isExcludeOwner = e => Boolean(e.modifier.excludeOwner ?? e.buff.excludeOwner);
  if (monaParams.recipient_is_wielder !== true) {
    const teamMatching = matching.filter(isTeamOrTarget);
    if (teamMatching.length) {
      teamMatching.sort((a, b) => Number(isExcludeOwner(b)) - Number(isExcludeOwner(a)));
      matching = teamMatching;
    }
  }

  // Filter mutually exclusive / optional enhancement branches to align with Mona params
  if (typeof monaParams.secret_arts_offfield === 'boolean' && matching.length > 1) {
    const filtered = matching.filter(e => {
      const isOffField = conditionHasNegatedOnField(e.modifier.condition) || conditionHasNegatedOnField(e.buff.condition) || /backstage|offfield/i.test(e.buff.id ?? '');
      return monaParams.secret_arts_offfield ? isOffField : !isOffField;
    });
    if (filtered.length) matching = filtered;
  }
  if (monaParams.magus === false && matching.length > 1) {
    const nonHexerei = matching.filter(e => !entryMentionsPattern(e, /hexerei/i));
    if (nonHexerei.length) matching = nonHexerei;
  }
  if (monaParams.after_reaction === false && matching.length > 1) {
    const baseBranch = matching.filter(e => !entryMentionsPattern(e, /reaction-mastery/i) && !/^"[^"]*TriggeredReaction/.test(JSON.stringify(e.buff.condition?.fact ?? '')));
    const notNegated = matching.filter(e => JSON.stringify(e.buff.condition ?? '').includes('condition.not'));
    if (notNegated.length) matching = notNegated;
    else if (baseBranch.length) matching = baseBranch;
  }
  if (monaParams.levitating === false && matching.length > 1) {
    const nonAirborne = matching.filter(e => !entryMentionsPattern(e, /airborne/i));
    if (nonAirborne.length) matching = nonAirborne;
  }
  if (monaParams.rate_impact === 0 && matching.length > 1) {
    const nonImpact = matching.filter(e => !entryMentionsPattern(e, /impact|hexerei/i));
    if (nonImpact.length) matching = nonImpact;
  }
  if (triageRow.key === 'MityaC2' && matching.length > 1) {
    const wantOverload = (monaParams.core_mode ?? 2) === 2;
    const byMode = matching.filter(e => wantOverload
      ? entryMentionsPattern(e, /overload/i)
      : entryMentionsPattern(e, /steady|stable/i));
    if (byMode.length) matching = byMode;
  }
  if (triageRow.key === 'IansanTalent2' && matching.length > 1 && typeof monaParams.nightsoul === 'number') {
    const wantHigh = monaParams.nightsoul >= 42;
    const byKinetic = matching.filter(e => wantHigh
      ? /kinetic-high/i.test(e.buff.id ?? '')
      : /kinetic-low/i.test(e.buff.id ?? ''));
    if (byKinetic.length) matching = byKinetic;
  }
  if (kind === 'character' && matching.length > 1) {
    if (/Q(?![a-z])|Burst/i.test(triageRow.key)) {
      const burstOnly = matching.filter(e => /burst|large/i.test(e.buff.windowFact ?? '') || /burst|large/i.test(e.buff.id ?? ''));
      if (burstOnly.length) matching = burstOnly;
    } else if (/E(?![a-z])|Skill/i.test(triageRow.key)) {
      const skillOnly = matching.filter(e => /skill|small/i.test(e.buff.windowFact ?? '') || /skill|small/i.test(e.buff.id ?? ''));
      if (skillOnly.length) matching = skillOnly;
    }
  }
  // If entries for the same target come from distinct mutually-exclusive windowFacts (e.g. Gorou E vs Q), keep primary windowFact
  const primaryWf = matching[0]?.buff?.windowFact;
  if (primaryWf && matching.some(e => e.buff.windowFact && e.buff.windowFact !== primaryWf)) {
    matching = matching.filter(e => !e.buff.windowFact || e.buff.windowFact === primaryWf);
  }

  return matching;
}

const characterEnergyCache = new Map();
function readCharacterBurstEnergy(charId) {
  if (!charId) return null;
  if (characterEnergyCache.has(charId)) return characterEnergyCache.get(charId);
  const p = resolve(ROOT, 'src/game-data/data/characters', `${charId}.json`);
  if (!existsSync(p)) { characterEnergyCache.set(charId, null); return null; }
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  const burst = doc.talents?.find(t => t.category === 'burst') ?? doc.talents?.[2];
  const energyParam = burst?.parameters?.find(param => param.unit === 'energy');
  const val = energyParam?.values?.[0] ?? null;
  characterEnergyCache.set(charId, val);
  return val;
}

const characterElementCache = new Map();
function readCharacterElement(charId) {
  if (!charId) return null;
  if (characterElementCache.has(charId)) return characterElementCache.get(charId);
  const p = resolve(ROOT, 'src/game-data/data/characters', `${charId}.json`);
  if (!existsSync(p)) { characterElementCache.set(charId, null); return null; }
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  const elem = doc.identity?.element ?? null;
  characterElementCache.set(charId, elem);
  return elem;
}

function buildAutoBuffScenario(triageRow, doc, probed, inferred, entityById) {
  const allEntityEntries = collectEntityBuffEntries(doc, triageRow.kind);
  const scopedEntries = scopeEntityBuffEntries(allEntityEntries, triageRow.kind, triageRow);
  const resolvedObserved = resolveObservedFixedTargets(probed.effects, triageRow, allEntityEntries, scopedEntries);
  const observedEffects = dedupeRedundantDamageBonus(resolvedObserved, scopedEntries.length ? scopedEntries : allEntityEntries);
  const targetList = observedEffects.map(e => e.leylineTarget);
  const monaParams = structuredClone(inferred.params);
  const matchedEntries = selectCandidateLeylineEntries(doc, triageRow.kind, triageRow, targetList, monaParams);
  const primary = matchedEntries[0] ?? null;

  const factsDecl = doc?.metadata?.facts ?? doc?.facts ?? {};
  const formulaMap = buildFormulaMap(doc);
  const gates = {};
  const recipientGates = {};
  const targetGates = {};
  const teamGates = {};
  const queryFacts = {};
  let selfRecipient = false;
  let recipientOnField = true;
  let ownerOnField = true;
  let recipientHpRatio = 1;
  let hitCategory = null;
  let hitElement = inferred.preferredElement ?? null;
  let hitFamily = null;
  let event = null;
  let rank = inferred.rank;
  let ascension = inferred.ascension;
  let level = 90;
  let usedSnapshotFact = false;

  if (triageRow.key === 'CandaceQ') {
    // Isolate Q (20% NA elemental bonus) from A4 (unlockAscension: 4) which shares candace.prayer
    ascension = 0;
    level = 20;
  }

  if (primary) {
    const buff = primary.buff;
    const mod = primary.modifier;
    const rec = mod.recipient ?? buff.recipient ?? 'owner';
    if (rec === 'owner') {
      selfRecipient = true;
    } else if (rec === 'team' || (typeof rec === 'object' && rec.role === 'team')) {
      selfRecipient = false;
    }
    if (primary.group === 'constellations' && primary.rank) {
      rank = Math.max(rank, primary.rank);
    }
    if (primary.group === 'passives' && primary.unlockAscension) {
      ascension = Math.max(ascension, primary.unlockAscension);
    }
    if (mod.constellation) {
      rank = Math.max(rank, mod.constellation);
    }

    const appliesTo = { ...(buff.appliesTo ?? {}), ...(mod.appliesTo ?? {}) };
    if (appliesTo.categories?.length) hitCategory = appliesTo.categories[0];
    if (appliesTo.elements?.length) hitElement = appliesTo.elements[0];
    if (appliesTo.families?.length) hitFamily = appliesTo.families[0];
    if (mod.recipientElements?.length && !hitElement) hitElement = mod.recipientElements[0];

    const needsSourceEvent = hasSourceEventCondition(buff.condition) || hasSourceEventCondition(mod.condition);
    if (buff.windowFact && !needsSourceEvent) {
      const decl = combatFactDeclaration(factsDecl, buff.windowFact);
      if (decl?.scope === 'recipient') recipientGates[buff.windowFact] = true;
      else if (decl?.scope === 'target') targetGates[buff.windowFact] = true;
      else if (decl?.scope === 'team') teamGates[buff.windowFact] = true;
      else gates[buff.windowFact] = true;
    } else if (buff.trigger) {
      event = synthesizeTriggerEvent(buff, primary, doc, triageRow.kind);
    }

    // Extract condition and stack facts across all matched entries for this buff
    const extracted = [];
    for (const entry of matchedEntries) {
      extractConditionSatisfyingFacts(entry.buff.condition, factsDecl, extracted, false, formulaMap);
      extractConditionSatisfyingFacts(entry.modifier.condition, factsDecl, extracted, false, formulaMap);
      extractValueStackFacts(entry.modifier.value, factsDecl, monaParams, extracted, formulaMap);
    }
    for (const item of extracted) {
      if (/critAtBurst|masteryAtUpdate|recordedHealing/i.test(item.key)) {
        usedSnapshotFact = true;
      }
      if (item.key === 'onField') {
        if (item.scope === 'recipient') recipientOnField = Boolean(item.value);
        else ownerOnField = Boolean(item.value);
        continue;
      }
      if (item.key === 'hpRatio' && item.scope === 'recipient') {
        recipientHpRatio = Number(item.value);
        continue;
      }
      if (item.scope === 'recipient') recipientGates[item.key] = item.value;
      else if (item.scope === 'target') targetGates[item.key] = item.value;
      else if (item.scope === 'team') teamGates[item.key] = item.value;
      else if (item.scope === 'query') queryFacts[item.key] = item.value;
      else gates[item.key] = item.value;
    }
  }

  // Choose recipient character matching Mona probe or LeyLine constraints
  let recipient = null;
  let monaSkillIndex = probed.skillIndex ?? 0;
  if (!selfRecipient) {
    const reqWeapon = primary?.modifier?.recipientWeaponTypes?.[0];
    if (probed.recipientMonaName) {
      const probedId = probed.recipientMonaName.toLowerCase();
      if (['kaeya', 'lisa', 'amber', 'barbara', 'noelle', 'sucrose', 'collei', 'xiangling'].includes(probedId)) {
        recipient = probedId;
      }
    }
    if (!recipient && hitElement && ELEMENT_RECIPIENT[hitElement]) {
      recipient = ELEMENT_RECIPIENT[hitElement];
    } else if (!recipient && reqWeapon && WEAPON_RECIPIENT[reqWeapon]) {
      recipient = WEAPON_RECIPIENT[reqWeapon];
    } else if (!recipient) {
      recipient = 'kaeya';
    }
    if (triageRow.kind === 'character' && recipient === triageRow.entity) {
      recipient = recipient === 'kaeya' ? 'lisa' : 'kaeya';
      monaSkillIndex = 0;
    }
  } else {
    monaSkillIndex = 0;
  }

  // Align Mona energy parameter with recipient's real burst energy capacity (e.g. RaidenShogunE)
  const effectiveRecipientId = selfRecipient ? triageRow.entity : recipient;
  if (typeof monaParams.energy === 'number') {
    const realEnergy = readCharacterBurstEnergy(effectiveRecipientId);
    if (typeof realEnergy === 'number' && realEnergy > 0) {
      monaParams.energy = realEnergy;
    }
  }
  // Align GorouC6 level parameter with actual Geo character count in the LeyLine team
  if (triageRow.key === 'GorouC6' && typeof monaParams.level === 'number') {
    const ownerElem = readCharacterElement(triageRow.entity);
    const recElem = selfRecipient ? null : readCharacterElement(recipient);
    const geoCount = (ownerElem === 'geo' ? 1 : 0) + (recElem === 'geo' ? 1 : 0);
    if (geoCount >= 1) monaParams.level = Math.min(3, geoCount);
  }

  // Align hitCategory/hitElement if Mona needed a specific skill index (e.g. Plunge or Cryo skill)
  if (!hitCategory && recipient === 'kaeya') {
    if (monaSkillIndex === 7) hitCategory = 'plunge';
    else if (monaSkillIndex === 10) { hitCategory = 'skill'; hitElement ??= 'cryo'; }
    else if (monaSkillIndex === 11) { hitCategory = 'burst'; hitElement ??= 'cryo'; }
    else if (monaSkillIndex === 5) hitCategory = 'charged';
  }
  if (!hitCategory && recipient === 'collei' && monaSkillIndex === 7) {
    hitCategory = 'skill';
    hitElement ??= 'dendro';
  }

  // Check if injectOwnerStat would produce 0 on owner (e.g. EM=0) or if snapshot fact already aligns it
  let injectOwnerStat = usedSnapshotFact ? null : inferred.injectOwnerStat;
  if (injectOwnerStat && triageRow.kind !== 'character') {
    if (['elementalMastery', 'energyRecharge'].includes(injectOwnerStat.stat)) {
      injectOwnerStat = null;
    }
  }
  if (injectOwnerStat && triageRow.kind === 'character') {
    const ownerDoc = entityById?.get(triageRow.entity);
    if (injectOwnerStat.stat === 'elementalMastery' && ownerDoc?.attributes?.specialized !== 'elementalMastery') {
      injectOwnerStat = null;
    } else if (injectOwnerStat.stat === 'energyRecharge' && ownerDoc?.attributes?.specialized !== 'energyRecharge') {
      injectOwnerStat = null;
    }
  }

  const effects = observedEffects
    .filter(e => isSupportedRunnerTarget(e.leylineTarget))
    .map(obs => {
      const match = matchedEntries.find(m => m.modifier.target === obs.leylineTarget);
      return {
        leylineTarget: obs.leylineTarget,
        amount: obs.normalized,
        ...(match ? { leylineField: match.pointer, buffIndex: match.buffIndex, modifierIndex: match.modifierIndex } : {}),
      };
    });

  return {
    scenario: {
      key: triageRow.key,
      scenarioId: 'auto-sweep',
      kind: triageRow.kind,
      owner: triageRow.entity,
      selfRecipient,
      ...(recipient ? { recipient } : {}),
      monaSkillIndex,
      level,
      ascension,
      rank,
      refinement: inferred.refinement,
      talentLevel: inferred.talentLevel,
      ...(hitCategory ? { hitCategory } : {}),
      ...(hitElement ? { hitElement } : {}),
      ...(hitFamily ? { hitFamily } : {}),
      ...(Object.keys(gates).length ? { gates } : {}),
      ...(Object.keys(recipientGates).length ? { recipientGates } : {}),
      ...(Object.keys(targetGates).length ? { targetGates } : {}),
      ...(Object.keys(teamGates).length ? { teamGates } : {}),
      ...(Object.keys(queryFacts).length ? { queryFacts } : {}),
      ...(event ? { event } : {}),
      ...(injectOwnerStat ? { injectOwnerStat } : {}),
      ...(Object.keys(monaParams).length ? { monaParams } : {}),
      recipientOnField,
      ownerOnField,
      recipientHpRatio,
      specPath: 'tools/scripts/data/sweep-mona-mismatches.mjs',
      effects,
    },
    usedInjectStat: Boolean(injectOwnerStat),
    matchedEntryCount: matchedEntries.length,
  };
}

// ---------------------------------------------------------------------------
// Generic runner for `buffs` (character) and `weapons` (weapon) and set team buffs
// ---------------------------------------------------------------------------
async function runBuffFamilySweep({ modeName, kindFilter, triageRows, options, shared }) {
  const started = Date.now();
  const { api } = await shared.getMonaRuntime();
  const engine = await shared.getEngine();
  const filter = resolveFilterIds(options.characters, options.entities);

  let selected = triageRows.filter(r => r.kind === kindFilter);
  if (filter) {
    selected = selected.filter(r => (r.entity && filter.has(r.entity)) || filter.has(r.key.toLowerCase()));
  }
  selected = applyLimit(selected, options.limit);

  // Preload raw entity docs for auto-assembly and collect dependencies
  const folder = kindFilter === 'character' ? 'characters' : kindFilter === 'weapon' ? 'weapons' : 'artifact-sets';
  const rawDocs = new Map();
  const ownerIds = new Set();
  for (const row of selected) {
    if (!row.entity) continue;
    const p = resolve(ROOT, 'src/game-data/data', folder, `${row.entity}.json`);
    if (existsSync(p)) {
      rawDocs.set(row.entity, JSON.parse(readFileSync(p, 'utf8')));
      ownerIds.add(row.entity);
    }
  }

  // Probe Mona first for each buff to discover active effects & build scenarios
  const scenarios = [];
  const scenarioMeta = new Map();
  const autoIncomplete = [];

  for (const row of selected) {
    if (!row.entity || !rawDocs.has(row.entity)) {
      autoIncomplete.push({
        key: row.key,
        entity: row.entity ?? null,
        triageClass: row.triageClass,
        reason: 'missing-leyline-entity',
      });
      continue;
    }
    const inferred = inferMonaBuffParams(row);
    const probeCandidates = [
      ...(inferred.preferredElement === 'electro' ? [['Lisa', 0]] : []),
      ...(inferred.preferredElement === 'pyro' ? [['Amber', 5]] : []),
      ...(inferred.preferredElement === 'dendro' ? [['Collei', 7]] : []),
      ['Kaeya', 0],
      ['Kaeya', 10],
      ['Kaeya', 7],
      ['Kaeya', 11],
      ['Lisa', 0],
      ['Collei', 7],
      ['Amber', 5],
      ['Barbara', 0],
      ['Noelle', 7],
      ['Sucrose', 0],
    ];
    let probed = { ok: true, effects: [] };
    const tried = new Set();
    for (const [monaName, skillIdx] of probeCandidates) {
      const k = `${monaName}:${skillIdx}`;
      if (tried.has(k)) continue;
      tried.add(k);
      const attempt = await probeMonaBuffObservedEffects(api, shared, row.key, inferred.params, monaName, skillIdx);
      probed = attempt;
      if (!attempt.ok || attempt.effects.length > 0) break;
    }
    // If still zero and character buff, retry on the owner character itself (self-only buffs)
    if (probed.ok && !probed.effects.length && kindFilter === 'character') {
      const { entityToMona } = buildCharacterMonaMaps();
      const ownerMona = entityToMona.get(row.entity);
      if (ownerMona && !tried.has(`${ownerMona}:0`)) {
        probed = await probeMonaBuffObservedEffects(api, shared, row.key, inferred.params, ownerMona, 0);
      }
    }

    if (!probed.ok) {
      autoIncomplete.push({
        key: row.key,
        entity: row.entity,
        triageClass: row.triageClass,
        reason: 'mona-probe-error',
        error: probed.error,
        monaParams: inferred.params,
      });
      continue;
    }
    if (!probed.effects.length) {
      const hasReactionOnly = (row.monaEffects ?? []).length > 0
        && row.monaEffects.every(e => !e.expectedTargets.some(isSupportedRunnerTarget));
      autoIncomplete.push({
        key: row.key,
        entity: row.entity,
        triageClass: row.triageClass,
        reason: hasReactionOnly ? 'reaction-or-flag-target-not-in-panel' : 'mona-zero-delta-under-auto-params',
        monaParams: inferred.params,
        declaredMonaEffects: (row.monaEffects ?? []).map(e => e.attribute),
      });
      continue;
    }

    const doc = rawDocs.get(row.entity);
    const { scenario, usedInjectStat, matchedEntryCount } = buildAutoBuffScenario(row, doc, probed, inferred, rawDocs);
    if (!scenario.effects.length) {
      autoIncomplete.push({
        key: row.key,
        entity: row.entity,
        triageClass: row.triageClass,
        reason: 'no-supported-runner-target',
        observedTargets: probed.effects.map(e => e.leylineTarget),
      });
      continue;
    }
    scenarios.push(scenario);
    scenarioMeta.set(row.key, { row, usedInjectStat, matchedEntryCount, observedEffects: probed.effects });
  }

  // Load only the required entities into RuntimeCatalog
  const weaponCatalogMap = kindFilter === 'weapon' ? rawDocs : null;
  const deps = collectBuffSpecDependencies(scenarios, weaponCatalogMap);
  const baseRecipients = Object.values(ELEMENT_RECIPIENT);
  const { entities } = await loadScopedEntities({
    characters: [...new Set([...deps.characters, ...baseRecipients])],
    weapons: [...new Set([...deps.weapons, ...Object.values(novice)])],
    sets: [...new Set(deps.sets)],
  });

  const runnerResult = scenarios.length
    ? await runSpecBuffScenarios({ scenarios, entities, engine })
    : { rows: [], mappings: [], summary: { cases: 0, matched: 0, different: 0, open: 0 } };

  const matched = [];
  const numericMismatch = [];
  const zeroOnLeyline = [];

  for (const r of runnerResult.rows) {
    const meta = scenarioMeta.get(r.key);
    const triageClass = meta?.row?.triageClass ?? null;
    if (r.status === 'error') {
      autoIncomplete.push({
        key: r.key,
        entity: r.source ?? meta?.row?.entity ?? null,
        triageClass,
        reason: 'runner-error',
        error: r.error,
      });
      continue;
    }
    const monaVal = r.monaDeltaNormalized;
    const leyVal = r.leylineDelta;
    const monaNonZero = Number.isFinite(monaVal) && Math.abs(monaVal) > 1e-9;
    const leyNonZero = Number.isFinite(leyVal) && Math.abs(leyVal) > 1e-9;

    if (!monaNonZero) {
      autoIncomplete.push({
        key: r.key,
        entity: r.source,
        target: r.leylineTarget,
        triageClass,
        reason: 'mona-zero-on-aligned-recipient',
        monaDelta: monaVal,
        leylineDelta: leyVal,
      });
      continue;
    }

    if (!leyNonZero) {
      const artifact = annotateBuffMonaArtifact({
        key: r.key,
        entity: r.source,
        target: r.leylineTarget,
        monaDelta: monaVal,
        leylineDelta: leyVal,
        usedInjectStat: meta?.usedInjectStat,
        monaConfig: meta?.row?.monaConfig,
      });
      zeroOnLeyline.push({
        key: r.key,
        entity: r.source,
        target: r.leylineTarget,
        recipient: r.recipient,
        triageClass,
        matchedEntryCount: meta?.matchedEntryCount ?? 0,
        monaDelta: monaVal,
        leylineDelta: leyVal,
        leylineState: leyVal == null ? 'unknown' : 'zero',
        knownMonaArtifact: artifact,
        diagnostics: r.diagnostics?.enabled?.length ? r.diagnostics.enabled.slice(0, 3) : undefined,
      });
      continue;
    }

    if (isNear(monaVal, leyVal, REL_TOLERANCE, 1e-5)) {
      matched.push({
        key: r.key,
        entity: r.source,
        target: r.leylineTarget,
        recipient: r.recipient,
        monaDelta: monaVal,
        leylineDelta: leyVal,
      });
    } else {
      const artifact = annotateBuffMonaArtifact({
        key: r.key,
        entity: r.source,
        target: r.leylineTarget,
        monaDelta: monaVal,
        leylineDelta: leyVal,
        usedInjectStat: meta?.usedInjectStat,
        monaConfig: meta?.row?.monaConfig,
      });
      numericMismatch.push({
        key: r.key,
        entity: r.source,
        target: r.leylineTarget,
        recipient: r.recipient,
        triageClass,
        monaDelta: monaVal,
        leylineDelta: leyVal,
        absDiff: Math.abs(monaVal - leyVal),
        relError: relError(monaVal, leyVal),
        usedInjectStat: meta?.usedInjectStat ?? false,
        knownMonaArtifact: artifact,
      });
    }
  }

  return {
    mode: modeName,
    elapsedMs: Date.now() - started,
    summary: {
      totalBuffs: selected.length,
      evaluatedEffects: runnerResult.rows.length,
      matched: matched.length,
      numericMismatch: numericMismatch.length,
      trueSuspectNumericMismatch: numericMismatch.filter(x => !x.knownMonaArtifact).length,
      zeroOnLeyline: zeroOnLeyline.length,
      autoConfigIncomplete: autoIncomplete.length,
    },
    numericMismatch,
    zeroOnLeyline,
    autoConfigIncomplete: autoIncomplete,
    matched,
  };
}

// ---------------------------------------------------------------------------
// Mode 6: sets4pc (wearer-self 4pc + team set buffs)
// ---------------------------------------------------------------------------
function buildMonaArtifactConfig(setRow) {
  const cfgFields = setRow.monaConfig4 ?? [];
  if (!cfgFields.length) return { monaArtifactConfig: null, preferredElement: null, params: {} };
  const params = {};
  let preferredElement = null;
  const fieldNames = new Set(cfgFields.map(f => f.name));
  const hasTierWeights = fieldNames.has('w1') && fieldNames.has('w2') && fieldNames.has('w3');
  const hasPartyCounts = fieldNames.has('same_count') && fieldNames.has('diff_count');
  for (const field of cfgFields) {
    let val = structuredClone(field.default);
    if (field.type === 'element4' || field.type === 'element8') {
      preferredElement = String(val || 'Cryo').toLowerCase();
    } else if (hasTierWeights && ['w1', 'w2', 'w3'].includes(field.name)) {
      val = field.name === 'w3' ? 1 : 0;
    } else if (hasPartyCounts && field.name === 'same_count') {
      val = 1;
    } else if (hasPartyCounts && field.name === 'diff_count') {
      val = 2;
    } else if (typeof val === 'boolean') {
      val = true;
    } else if (typeof val === 'number') {
      if (typeof field.max === 'number' && field.max > 0) val = field.max;
      else if (val === 0) val = 1;
    }
    params[field.name] = val;
  }
  const configKey = 'config_' + toSnakeCase(setRow.exportName);
  return {
    monaArtifactConfig: { [configKey]: params },
    preferredElement,
    params,
  };
}

async function probeMona4pcObservedEffects(api, shared, exportName, monaArtifactConfig, recipientMonaName = 'Kaeya', skillIndex = 0) {
  const input = await shared.getMonaFixture(recipientMonaName, skillIndex);
  if (!input) return { ok: false, error: `Missing fixture ${recipientMonaName}:${skillIndex}`, effects: [] };
  const otherSet = exportName === 'GladiatorsFinale' ? 'NoblesseOblige' : 'GladiatorsFinale';
  const arts3 = input.artifacts.slice(0, 4).map((a, i) => ({ ...a, set_name: i === 3 ? otherSet : exportName, sub_stats: [] }));
  const arts4 = arts3.map(a => ({ ...a, set_name: exportName }));
  try {
    const m3Attr = api.CommonInterface.get_attribute({ ...structuredClone(input), artifacts: arts3, artifact_config: monaArtifactConfig, buffs: [] });
    const m4Attr = api.CommonInterface.get_attribute({ ...structuredClone(input), artifacts: arts4, artifact_config: monaArtifactConfig, buffs: [] });
    const m3Dmg = api.CalculatorInterface.get_damage_analysis({ ...structuredClone(input), artifacts: arts3, artifact_config: monaArtifactConfig, buffs: [] }, null);
    const m4Dmg = api.CalculatorInterface.get_damage_analysis({ ...structuredClone(input), artifacts: arts4, artifact_config: monaArtifactConfig, buffs: [] }, null);
    const recipientElem = String(m3Dmg.element ?? 'physical').toLowerCase();
    const observed = [];
    for (const spec of MONA_PROBE_FIELDS) {
      const beforeObj = spec.source === 'damage' ? m3Dmg : m3Attr;
      const afterObj = spec.source === 'damage' ? m4Dmg : m4Attr;
      const rawDelta = sum(afterObj[spec.field]) - sum(beforeObj[spec.field]);
      if (Math.abs(rawDelta) <= 1e-9) continue;
      const baseStat = spec.base ? readMonaProbeBase(m3Attr, spec.base) : 1;
      const normalized = spec.base ? rawDelta / baseStat : rawDelta * spec.sign;
      const leylineTarget = spec.leylineTarget === 'target.resistance'
        ? `target.resistance.${recipientElem}`
        : spec.leylineTarget;
      observed.push({
        leylineTarget,
        source: spec.source,
        field: spec.field,
        sign: spec.sign,
        base: spec.base,
        rawDelta,
        normalized,
      });
    }
    return { ok: true, effects: observed, recipientElem };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), effects: [] };
  }
}

async function runSets4pcMode(options, shared) {
  const started = Date.now();
  const triage = await shared.getTriage();
  const { api } = await shared.getMonaRuntime();
  const engine = await shared.getEngine();
  const filter = resolveFilterIds(options.characters, options.entities);

  let selectedSets = triage.set4pcRows.filter(s => Boolean(s.entity));
  if (filter) {
    selectedSets = selectedSets.filter(s => filter.has(s.entity) || filter.has(s.exportName.toLowerCase()));
  }
  selectedSets = applyLimit(selectedSets, options.limit);

  const rawSets = new Map();
  for (const s of selectedSets) {
    const p = resolve(ROOT, 'src/game-data/data/artifact-sets', `${s.entity}.json`);
    if (existsSync(p)) rawSets.set(s.entity, JSON.parse(readFileSync(p, 'utf8')));
  }

  const fourPcScenarios = [];
  const fourPcMeta = new Map();
  const autoIncomplete = [];

  for (const setRow of selectedSets) {
    const doc = rawSets.get(setRow.entity);
    if (!doc) {
      autoIncomplete.push({ key: setRow.exportName, entity: setRow.entity, kind: '4pc', reason: 'missing-leyline-entity' });
      continue;
    }
    const { monaArtifactConfig, preferredElement, params } = buildMonaArtifactConfig(setRow);
    const entries4 = collectEntityBuffEntries(doc, 'set').filter(e => e.pieces === 4);

    // Choose recipient & hit category based on LeyLine 4pc appliesTo / weapon constraints
    let hitCategory = null;
    let hitElement = preferredElement;
    let recipient = 'kaeya';
    let recipientMonaKey = 'Kaeya';
    let monaSkillIndex = 0;

    const firstBuff = entries4[0]?.buff;
    const firstMod = entries4[0]?.modifier;
    const appliesTo = { ...(firstBuff?.appliesTo ?? {}), ...(firstMod?.appliesTo ?? {}) };
    if (appliesTo.categories?.length) hitCategory = appliesTo.categories[0];
    if (appliesTo.elements?.length && !hitElement) hitElement = appliesTo.elements[0];
    const reqWeapon = firstMod?.recipientWeaponTypes?.[0] ?? firstBuff?.activation?.weaponTypes?.[0];
    if (reqWeapon && WEAPON_RECIPIENT[reqWeapon]) {
      recipient = WEAPON_RECIPIENT[reqWeapon];
    } else if (hitElement && ELEMENT_RECIPIENT[hitElement]) {
      recipient = ELEMENT_RECIPIENT[hitElement];
    }
    recipientMonaKey = recipient[0].toUpperCase() + recipient.slice(1);

    // Pick matching Mona skill index on Kaeya/Amber/Lisa for category
    if (recipient === 'kaeya') {
      monaSkillIndex = ({ normal: 0, charged: 5, plunge: 7, skill: 10, burst: 11 })[hitCategory] ?? 0;
    } else if (recipient === 'amber') {
      monaSkillIndex = ({ normal: 0, charged: 5, plunge: 7, skill: 9, burst: 10 })[hitCategory] ?? 0;
    } else if (recipient === 'lisa') {
      monaSkillIndex = ({ normal: 0, charged: 4, plunge: 5, skill: 7, burst: 10 })[hitCategory] ?? 0;
    }

    let probed = await probeMona4pcObservedEffects(api, shared, setRow.exportName, monaArtifactConfig, recipientMonaKey, monaSkillIndex);
    // Fallback probe on Kaeya skill (index 10, Cryo) if physical normal gave 0
    if (probed.ok && !probed.effects.length && !(recipient === 'kaeya' && monaSkillIndex === 10)) {
      const retry = await probeMona4pcObservedEffects(api, shared, setRow.exportName, monaArtifactConfig, 'Kaeya', 10);
      if (retry.ok && retry.effects.length) {
        probed = retry;
        recipient = 'kaeya';
        recipientMonaKey = 'Kaeya';
        monaSkillIndex = 10;
        hitCategory = 'skill';
        hitElement = 'cryo';
      }
    }
    // Fallback probe on Amber charged (index 5, Pyro) if still 0
    if (probed.ok && !probed.effects.length) {
      const retry = await probeMona4pcObservedEffects(api, shared, setRow.exportName, monaArtifactConfig, 'Amber', 5);
      if (retry.ok && retry.effects.length) {
        probed = retry;
        recipient = 'amber';
        recipientMonaKey = 'Amber';
        monaSkillIndex = 5;
        hitCategory = 'charged';
        hitElement = 'pyro';
      }
    }

    if (!probed.ok) {
      autoIncomplete.push({ key: setRow.exportName, entity: setRow.entity, kind: '4pc', reason: 'mona-probe-error', error: probed.error });
      continue;
    }
    if (!probed.effects.length) {
      autoIncomplete.push({
        key: setRow.exportName,
        entity: setRow.entity,
        kind: '4pc',
        reason: 'mona-4pc-zero-delta-under-auto-config',
        monaConfig4: params,
      });
      continue;
    }

    // Build LeyLine gates & events from 4pc buffs
    const factsDecl = doc.facts ?? {};
    const formulaMap = buildFormulaMap(doc);
    const gates = {};
    const targetGates = {};
    const events = [];
    const dedupedEffects = dedupeRedundantDamageBonus(probed.effects, entries4);
    const targetSet = new Set(dedupedEffects.map(e => e.leylineTarget));
    const matchedEntries = entries4.filter(e => targetSet.has(e.modifier.target));
    const useEntries = matchedEntries.length ? matchedEntries : entries4;

    const seenTriggerKeys = new Set();
    for (const entry of useEntries) {
      const buff = entry.buff;
      const needsSourceEvent = hasSourceEventCondition(buff.condition) || hasSourceEventCondition(entry.modifier.condition);
      if (buff.windowFact && !needsSourceEvent) {
        const decl = combatFactDeclaration(factsDecl, buff.windowFact);
        if (decl?.scope === 'target') targetGates[buff.windowFact] = true;
        else gates[buff.windowFact] = true;
      } else if (buff.trigger) {
        const ev = synthesizeTriggerEvent(buff, entry, doc, 'set');
        const evKey = ev ? JSON.stringify(ev) : null;
        if (ev && !seenTriggerKeys.has(evKey)) {
          seenTriggerKeys.add(evKey);
          const maxStacks = Number(buff.stacking?.maxStacks ?? buff.maxStacks ?? 1);
          const desiredStacks = typeof params.level === 'number' && params.level > 0
            ? Math.min(maxStacks, Math.round(params.level))
            : maxStacks;
          for (let s = 0; s < Math.max(1, desiredStacks); s++) {
            events.push(structuredClone(ev));
          }
        }
      }
      const extracted = [];
      extractConditionSatisfyingFacts(buff.condition, factsDecl, extracted, false, formulaMap);
      extractConditionSatisfyingFacts(entry.modifier.condition, factsDecl, extracted, false, formulaMap);
      extractValueStackFacts(entry.modifier.value, factsDecl, params, extracted, formulaMap, true);
      for (const item of extracted) {
        if (item.scope === 'target') targetGates[item.key] = item.value;
        else gates[item.key] = item.value;
      }
    }

    const teamElements = [];
    if (typeof params.same_count === 'number' || typeof params.diff_count === 'number') {
      const recElem = readCharacterElement(recipient) ?? 'cryo';
      const diffElem = recElem === 'pyro' ? 'hydro' : 'pyro';
      for (let i = 0; i < (params.same_count ?? 0); i++) teamElements.push(recElem);
      for (let i = 0; i < (params.diff_count ?? 0); i++) teamElements.push(diffElem);
    }

    const effects = dedupedEffects
      .filter(e => isSupportedRunnerTarget(e.leylineTarget))
      .map(obs => {
        const match = matchedEntries.find(m => m.modifier.target === obs.leylineTarget);
        return {
          leylineTarget: obs.leylineTarget,
          amount: obs.normalized,
          ...(match ? { leylineField: match.pointer, buffIndex: match.buffIndex, modifierIndex: match.modifierIndex } : {}),
        };
      });

    if (!effects.length) {
      autoIncomplete.push({ key: setRow.exportName, entity: setRow.entity, kind: '4pc', reason: 'no-supported-runner-target' });
      continue;
    }

    const scenario = {
      entity: setRow.entity,
      key: setRow.exportName,
      scenarioId: 'auto-4pc',
      recipient,
      recipientMonaKey,
      monaSkillIndex,
      stripArtifactSubstats: true,
      ...(teamElements.length ? { teamElements } : {}),
      ...(hitCategory ? { hitCategory } : {}),
      ...(hitElement ? { hitElement } : {}),
      ...(Object.keys(gates).length ? { gates } : {}),
      ...(Object.keys(targetGates).length ? { targetGates } : {}),
      ...(events.length ? { events } : {}),
      ...(monaArtifactConfig ? { monaArtifactConfig } : {}),
      specPath: 'tools/scripts/data/sweep-mona-mismatches.mjs',
      effects,
    };
    fourPcScenarios.push(scenario);
    fourPcMeta.set(setRow.exportName, { setRow, matchedEntryCount: matchedEntries.length });
  }

  // Load sets + recipients and run 4pc scenarios
  const setIdsToLoad = [...new Set([...fourPcScenarios.map(s => s.entity), 'gladiatorsfinale'])];
  const charIdsToLoad = [...new Set([...Object.values(ELEMENT_RECIPIENT), ...fourPcScenarios.map(s => s.recipient)])];
  const { entities } = await loadScopedEntities({
    characters: charIdsToLoad,
    weapons: Object.values(novice),
    sets: setIdsToLoad,
  });

  const fourPcResult = fourPcScenarios.length
    ? await runSpecFourPieceScenarios({ scenarios: fourPcScenarios, entities, engine })
    : { rows: [], mappings: [], summary: { cases: 0, matched: 0, different: 0, open: 0 } };

  // Also sweep the 12 team-buff set entries from triage.buffRows
  const teamSetSweep = await runBuffFamilySweep({
    modeName: 'sets-team-buffs',
    kindFilter: 'set',
    triageRows: triage.buffRows,
    options,
    shared,
  });

  const matched = [...teamSetSweep.matched.map(x => ({ ...x, scope: 'team-buff' }))];
  const numericMismatch = [...teamSetSweep.numericMismatch.map(x => ({ ...x, scope: 'team-buff' }))];
  const zeroOnLeyline = [...teamSetSweep.zeroOnLeyline.map(x => ({ ...x, scope: 'team-buff' }))];
  for (const x of teamSetSweep.autoConfigIncomplete) {
    autoIncomplete.push({ ...x, scope: 'team-buff' });
  }

  for (const r of fourPcResult.rows) {
    const meta = fourPcMeta.get(r.key);
    if (r.status === 'error') {
      autoIncomplete.push({ key: r.key, entity: r.entity, scope: '4pc-wearer', reason: 'runner-error', error: r.error });
      continue;
    }
    const monaVal = r.monaDeltaNormalized;
    const leyVal = r.leylineDelta;
    const monaNonZero = Number.isFinite(monaVal) && Math.abs(monaVal) > 1e-9;
    const leyNonZero = Number.isFinite(leyVal) && Math.abs(leyVal) > 1e-9;

    if (!monaNonZero) {
      autoIncomplete.push({ key: r.key, entity: r.entity, target: r.leylineTarget, scope: '4pc-wearer', reason: 'mona-zero-on-4pc' });
      continue;
    }
    if (!leyNonZero) {
      const artifact = annotateBuffMonaArtifact({ key: r.key, entity: r.entity, target: r.leylineTarget, monaDelta: monaVal, leylineDelta: leyVal });
      zeroOnLeyline.push({
        key: r.key,
        entity: r.entity,
        target: r.leylineTarget,
        scope: '4pc-wearer',
        matchedEntryCount: meta?.matchedEntryCount ?? 0,
        monaDelta: monaVal,
        leylineDelta: leyVal,
        leylineState: leyVal == null ? 'unknown' : 'zero',
        knownMonaArtifact: artifact,
      });
      continue;
    }
    if (isNear(monaVal, leyVal, REL_TOLERANCE, 1e-5)) {
      matched.push({ key: r.key, entity: r.entity, target: r.leylineTarget, scope: '4pc-wearer', monaDelta: monaVal, leylineDelta: leyVal });
    } else {
      const artifact = annotateBuffMonaArtifact({ key: r.key, entity: r.entity, target: r.leylineTarget, monaDelta: monaVal, leylineDelta: leyVal });
      numericMismatch.push({
        key: r.key,
        entity: r.entity,
        target: r.leylineTarget,
        scope: '4pc-wearer',
        monaDelta: monaVal,
        leylineDelta: leyVal,
        absDiff: Math.abs(monaVal - leyVal),
        relError: relError(monaVal, leyVal),
        knownMonaArtifact: artifact,
      });
    }
  }

  return {
    mode: 'sets4pc',
    elapsedMs: Date.now() - started,
    summary: {
      totalSets4pc: selectedSets.length,
      totalTeamSetBuffs: teamSetSweep.summary.totalBuffs,
      matched: matched.length,
      numericMismatch: numericMismatch.length,
      trueSuspectNumericMismatch: numericMismatch.filter(x => !x.knownMonaArtifact).length,
      zeroOnLeyline: zeroOnLeyline.length,
      autoConfigIncomplete: autoIncomplete.length,
    },
    numericMismatch,
    zeroOnLeyline,
    autoConfigIncomplete: autoIncomplete,
    matched,
  };
}

// ---------------------------------------------------------------------------
// Summary Markdown Renderer
// ---------------------------------------------------------------------------
function fmtNum(v) {
  if (v == null || !Number.isFinite(v)) return 'null';
  if (Math.abs(v) >= 100) return v.toFixed(2);
  return v.toFixed(6);
}

function renderSummaryMarkdown(reportsByMode) {
  const lines = [
    '# Mona 全量数值扫雷汇总报告',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 包含模式：${Object.keys(reportsByMode).join(', ')}`,
    '',
    '## 总览统计',
    '',
    '| 模式 | 耗时 (ms) | 核心计数 | 高优先级疑似真 Bug | 已知 Mona 误差 / 其他 |',
    '| --- | ---: | --- | ---: | --- |',
  ];

  for (const mode of ALL_SUBMODES) {
    const r = reportsByMode[mode];
    if (!r) continue;
    const s = r.summary;
    if (mode === 'scaling') {
      lines.push(`| \`scaling\` | ${r.elapsedMs} | matched=${s.matched}, exactMismatch=${s.exactLabelMismatch}, probeErr=${s.probeError} | **${s.trueSuspectMismatch}** | knownArtifact=${s.knownArtifactMismatch}, nonLabelNoise=${s.nonLabelMismatch} |`);
    } else if (mode === 'damage-c0') {
      lines.push(`| \`damage-c0\` | ${r.elapsedMs} | matched=${s.matched}/${s.eligible}, unknown=${s.unexpectedUnknown} | **${s.mismatch + s.unexpectedUnknown}** | monaAdditional=${s.monaAdditionalEffect}, probeErr=${s.probeError} |`);
    } else if (mode === 'damage-c6') {
      lines.push(`| \`damage-c6\` | ${r.elapsedMs} | matched=${s.matched}/${s.eligibleC0Pairs}, unknown=${s.unexpectedUnknown} | **${s.mismatch + s.unexpectedUnknown + s.c6DeltaDivergence}** | monaC6Additional=${s.monaC6AdditionalEffect} (diverges=${s.c6DeltaDivergence}) |`);
    } else {
      lines.push(`| \`${mode}\` | ${r.elapsedMs} | matched=${s.matched}, zeroOnLL=${s.zeroOnLeyline}, incomplete=${s.autoConfigIncomplete} | **${s.trueSuspectNumericMismatch}** (total numMismatch=${s.numericMismatch}) | knownArtifact=${s.numericMismatch - s.trueSuspectNumericMismatch} |`);
    }
  }

  // Detailed high-priority sections
  if (reportsByMode.scaling) {
    const r = reportsByMode.scaling;
    lines.push('', `## 1. scaling — 同名倍率差异（疑似真 Bug: ${r.highPriority.length}，已知 Mona 误差: ${r.knownArtifacts.length}）`, '');
    if (r.highPriority.length) {
      lines.push('| 角色 | Mona Skill | LeyLine Hit | 名称 | 首个差异等级 | Mona 倍率 | LeyLine 倍率 |');
      lines.push('| --- | --- | --- | --- | ---: | --- | --- |');
      for (const m of r.highPriority) {
        lines.push(`| \`${m.entity}\` | \`${m.mona}\` | \`${m.leyline}\` | ${m.leylineName ?? ''} | T${m.firstDiffLevel} | \`${JSON.stringify(m.actual)}\` | \`${JSON.stringify(m.expected)}\` |`);
      }
    } else {
      lines.push('- 无高优先级同名倍率差异。');
    }
    if (r.knownArtifacts.length) {
      lines.push('', `<details><summary>已知 Mona 误差 / 多段汇总差异 (${r.knownArtifacts.length} 条)</summary>`, '');
      for (const m of r.knownArtifacts) {
        lines.push(`- \`${m.entity}\` \`${m.mona}\` (${m.leylineName}): [${m.knownMonaArtifact.kind}] ${m.knownMonaArtifact.note}`);
      }
      lines.push('', '</details>');
    }
  }

  if (reportsByMode['damage-c0']) {
    const r = reportsByMode['damage-c0'];
    lines.push('', `## 2. damage-c0 — 零命普通伤害（mismatch: ${r.mismatches.length}, unexpected-unknown: ${r.unexpectedUnknowns.length}）`, '');
    if (r.mismatches.length) {
      lines.push('### Mismatches', '', '| 角色 | Mona | LeyLine | 原因 | Expected | Actual | 相对误差 |', '| --- | --- | --- | --- | ---: | ---: | ---: |');
      for (const m of r.mismatches) {
        const exp = m.leylineRelError > REL_TOLERANCE ? m.leylineExpected : m.commonPanelExpected;
        const act = m.leylineRelError > REL_TOLERANCE ? m.leylineActual : m.commonPanelActual;
        const err = Math.max(m.leylineRelError ?? 0, m.commonPanelRelError ?? 0, m.monaRelError ?? 0);
        lines.push(`| \`${m.entity}\` | \`${m.mona}\` | \`${m.leyline}\` | ${m.reason} | ${fmtNum(exp)} | ${fmtNum(act)} | ${(err * 100).toFixed(4)}% |`);
      }
    }
    if (r.unexpectedUnknowns.length) {
      lines.push('', '### Unexpected Unknowns', '');
      for (const u of r.unexpectedUnknowns) {
        lines.push(`- \`${u.entity}\` \`${u.leyline}\`: requiredInputs=\`${JSON.stringify(u.requiredInputs)}\``);
      }
    }
  }

  if (reportsByMode['damage-c6']) {
    const r = reportsByMode['damage-c6'];
    lines.push('', `## 3. damage-c6 — 六命自增益伤害（mismatch: ${r.mismatches.length}, unexpected-unknown: ${r.unexpectedUnknowns.length}, C6额外效果分歧: ${r.summary.c6DeltaDivergence}）`, '');
    if (r.mismatches.length) {
      lines.push('### C6 Mismatches', '', '| 角色 | Mona | LeyLine | 原因 | Expected | Actual |', '| --- | --- | --- | --- | ---: | ---: |');
      for (const m of r.mismatches) {
        lines.push(`| \`${m.entity}\` | \`${m.mona}\` | \`${m.leyline}\` | ${m.reason} | ${fmtNum(m.leylineExpected)} | ${fmtNum(m.leylineActual)} |`);
      }
    }
    if (r.unexpectedUnknowns.length) {
      lines.push('', '### C6 Unexpected Unknowns', '');
      for (const u of r.unexpectedUnknowns) {
        lines.push(`- \`${u.entity}\` \`${u.leyline}\`: requiredInputs=\`${JSON.stringify(u.requiredInputs)}\``);
      }
    }
    const diverged = r.monaC6AdditionalEffects.filter(x => x.diverges || x.leylineC6Unknown);
    if (diverged.length) {
      lines.push('', '### C6 Mona 额外效果与 LeyLine C6 分歧 / 未知', '');
      for (const d of diverged) {
        lines.push(`- \`${d.entity}\` \`${d.leyline}\`: monaC6Ratio=${fmtNum(d.monaC6Ratio)}, leylineC6Ratio=${fmtNum(d.leylineC6Ratio)}, extraLabels=\`${JSON.stringify(d.extraLabels)}\``);
      }
    }
  }

  for (const [idx, mode] of [['4', 'buffs'], ['5', 'weapons'], ['6', 'sets4pc']]) {
    const r = reportsByMode[mode];
    if (!r) continue;
    lines.push('', `## ${idx}. ${mode} — numeric-mismatch: ${r.numericMismatch.length} (疑似真 Bug: ${r.summary.trueSuspectNumericMismatch}), zero-on-leyline: ${r.zeroOnLeyline.length}, matched: ${r.matched.length}, incomplete: ${r.autoConfigIncomplete.length}`, '');
    if (r.numericMismatch.length) {
      lines.push('### Numeric Mismatches', '', '| Key | Entity | Target | Mona Delta | LeyLine Delta | 相对误差 | 标注 |', '| --- | --- | --- | ---: | ---: | ---: | --- |');
      for (const m of r.numericMismatch) {
        lines.push(`| \`${m.key}\` | \`${m.entity}\` | \`${m.target}\` | ${fmtNum(m.monaDelta)} | ${fmtNum(m.leylineDelta)} | ${((m.relError ?? 0) * 100).toFixed(2)}% | ${m.knownMonaArtifact ? m.knownMonaArtifact.kind : '**SUSPECT-BUG**'} |`);
      }
    }
    if (r.zeroOnLeyline.length) {
      lines.push('', `<details><summary>Zero on LeyLine (${r.zeroOnLeyline.length} 条)</summary>`, '');
      for (const z of r.zeroOnLeyline) {
        lines.push(`- \`${z.key}\` (\`${z.entity}\`, ${z.target}): mona=${fmtNum(z.monaDelta)}, leyline=${z.leylineState}, triage=${z.triageClass ?? z.scope ?? ''}${z.knownMonaArtifact ? ` [${z.knownMonaArtifact.kind}]` : ''}`);
      }
      lines.push('', '</details>');
    }
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main CLI Entry
// ---------------------------------------------------------------------------
async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'all' },
      character: { type: 'string', multiple: true },
      entity: { type: 'string', multiple: true },
      limit: { type: 'string' },
      out: { type: 'string', default: 'artifacts/mona-sweep' },
    },
  });

  if (!VALID_MODES.includes(values.mode)) {
    console.error(`Invalid --mode "${values.mode}". Expected one of: ${VALID_MODES.join('|')}`);
    process.exit(2);
  }

  const options = {
    mode: values.mode,
    characters: parseCsvList(values.character),
    entities: parseCsvList(values.entity),
    limit: values.limit ? Math.max(1, Number(values.limit)) : null,
    outDir: resolve(values.out),
  };

  mkdirSync(options.outDir, { recursive: true });
  const shared = createSharedCache();
  const modesToRun = options.mode === 'all' ? ALL_SUBMODES : [options.mode];
  const ranReports = {};
  let scalingInternal = null;

  for (const mode of modesToRun) {
    let result;
    if (mode === 'scaling') {
      result = await runScalingMode(options, shared);
      scalingInternal = result._internal;
      delete result._internal;
    } else if (mode === 'damage-c0') {
      result = await runDamageC0Mode(options, shared, scalingInternal);
      delete result._internal;
    } else if (mode === 'damage-c6') {
      result = await runDamageC6Mode(options, shared);
    } else if (mode === 'buffs') {
      const triage = await shared.getTriage();
      result = await runBuffFamilySweep({
        modeName: 'buffs',
        kindFilter: 'character',
        triageRows: triage.buffRows,
        options,
        shared,
      });
    } else if (mode === 'weapons') {
      const triage = await shared.getTriage();
      result = await runBuffFamilySweep({
        modeName: 'weapons',
        kindFilter: 'weapon',
        triageRows: triage.buffRows,
        options,
        shared,
      });
    } else if (mode === 'sets4pc') {
      result = await runSets4pcMode(options, shared);
    }

    ranReports[mode] = result;
    writeFileSync(resolve(options.outDir, `${mode}.json`), JSON.stringify(result, null, 2) + '\n', 'utf8');
  }

  // Merge any previously written sibling mode JSONs in outDir when generating summary.md
  const allReportsForSummary = {};
  for (const mode of ALL_SUBMODES) {
    if (ranReports[mode]) {
      allReportsForSummary[mode] = ranReports[mode];
    } else {
      const existing = resolve(options.outDir, `${mode}.json`);
      if (existsSync(existing)) {
        try {
          allReportsForSummary[mode] = JSON.parse(readFileSync(existing, 'utf8'));
        } catch {
          // Ignore malformed existing file
        }
      }
    }
  }
  writeFileSync(resolve(options.outDir, 'summary.md'), renderSummaryMarkdown(allReportsForSummary), 'utf8');

  const compact = Object.fromEntries(
    Object.entries(ranReports).map(([m, r]) => [m, { elapsedMs: r.elapsedMs, summary: r.summary }]),
  );
  console.log(JSON.stringify({ outDir: options.outDir, modes: compact }, null, 2));
}

main().catch(error => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
