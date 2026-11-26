import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentSource } from './content-source.mjs';
import { createRuntimeCatalog } from './runtime-catalog.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { probeMonaSkills } from './mona-inventory-probes.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHARACTERS_DIR = resolve(ROOT, 'src/game-data/data/characters');
const REL_TOLERANCE = 0.0002; // 0.02% for full direct damage (covers Mona 4-decimal ratio rounding)
const RATIO_REL_TOLERANCE = 0.0005;

const FAMILY_SPECS = {
  'lunar-charged': {
    family: 'lunar-charged',
    monaBranch: 'direct_moonelectro',
    monaRatioField: 'direct_moonelectro_ratio',
    monaBaseComposeField: 'moonelectro_base_compose',
    monaComposeField: 'direct_moonelectro_compose',
    monaExtraDamageField: null,
    monaExtraFixedField: 'direct_moonelectro_extra_fixed',
    monaBaseMultiplierField: null,
    monaElevateFields: ['elevate_moonelectro_compose', 'elevate_moon_reaction_compose'],
    leylinePrefix: 'attribute.reaction.lunar',
    elevationAttr: 'attribute.reaction.lunar.elevationFactor',
    elevationIsFactor: true,
    reactionCoeff: 3,
    isStellar: false,
  },
  'lunar-bloom': {
    family: 'lunar-bloom',
    monaBranch: 'direct_moonbloom',
    monaRatioField: 'direct_moonbloom_ratio',
    monaBaseComposeField: 'moonbloom_base_compose',
    monaComposeField: 'direct_moonbloom_compose',
    monaExtraDamageField: null,
    monaExtraFixedField: 'direct_moonbloom_extra_fixed',
    monaBaseMultiplierField: null,
    monaElevateFields: ['elevate_moonbloom_compose', 'elevate_moon_reaction_compose'],
    leylinePrefix: 'attribute.reaction.lunar',
    elevationAttr: 'attribute.reaction.lunar.elevationFactor',
    elevationIsFactor: true,
    reactionCoeff: 1,
    isStellar: false,
  },
  'lunar-crystallize': {
    family: 'lunar-crystallize',
    monaBranch: 'direct_mooncrystallize',
    monaRatioField: 'direct_mooncrystallize_ratio',
    monaBaseComposeField: 'mooncrystallize_base_compose',
    monaComposeField: 'direct_mooncrystallize_compose',
    monaExtraDamageField: null,
    monaExtraFixedField: 'direct_mooncrystallize_extra_fixed',
    monaBaseMultiplierField: null,
    monaElevateFields: ['elevate_mooncrystallize_compose', 'elevate_moon_reaction_compose'],
    leylinePrefix: 'attribute.reaction.lunar',
    elevationAttr: 'attribute.reaction.lunar.elevationFactor',
    elevationIsFactor: true,
    reactionCoeff: 1.6,
    isStellar: false,
  },
  'stellar-conduct': {
    family: 'stellar-conduct',
    monaBranch: 'direct_stellarconduct',
    monaRatioField: 'direct_stellarconduct_ratio',
    monaBaseComposeField: 'direct_stellarconduct_base_compose',
    monaComposeField: 'direct_stellarconduct_compose',
    monaExtraDamageField: 'direct_stellarconduct_extra_damage',
    monaExtraFixedField: 'direct_stellarconduct_extra_fixed',
    monaBaseMultiplierField: 'direct_stellarconduct_base_multiplier',
    monaElevateFields: ['elevate_stellarconduct_compose', 'elevate_stellar_glimmer_reaction_compose'],
    leylinePrefix: 'attribute.reaction.stellar-conduct',
    elevationAttr: 'attribute.reaction.stellar-conduct.elevation',
    elevationIsFactor: false,
    reactionCoeff: 1,
    isStellar: true,
  },
  'stellar-swirl': {
    family: 'stellar-swirl',
    monaBranch: 'direct_stellarswirl',
    monaRatioField: 'direct_stellarswirl_ratio',
    monaBaseComposeField: 'direct_stellarswirl_base_compose',
    monaComposeField: 'direct_stellarswirl_compose',
    monaExtraDamageField: 'direct_stellarswirl_extra_damage',
    monaExtraFixedField: 'direct_stellarswirl_extra_fixed',
    monaBaseMultiplierField: 'direct_stellarswirl_base_multiplier',
    monaElevateFields: ['elevate_stellarswirl_compose', 'elevate_stellar_glimmer_reaction_compose'],
    leylinePrefix: 'attribute.reaction.stellar-swirl',
    elevationAttr: 'attribute.reaction.stellar-swirl.elevation',
    elevationIsFactor: false,
    reactionCoeff: 1,
    isStellar: true,
  },
};

const DIRECT_BRANCH_KEYS = Object.values(FAMILY_SPECS).map(s => s.monaBranch);

const SCALING_AXES = {
  attack: { monaPanel: 'atk', monaBuff: 'ATKFixed', monaRatio: 'atk_ratio', traceId: 'attribute.attack' },
  hp: { monaPanel: 'hp', monaBuff: 'HPFixed', monaRatio: 'hp_ratio', traceId: 'attribute.hp' },
  defense: { monaPanel: 'def', monaBuff: 'DEFFixed', monaRatio: 'def_ratio', traceId: 'attribute.defense' },
  elementalMastery: { monaPanel: 'em', monaBuff: 'ElementalMastery', monaRatio: 'em_ratio', traceId: 'attribute.elementalMastery' },
};

const MONA_NOVICE = {
  Sword: 'DullBlade',
  Claymore: 'WasterGreatsword',
  Polearm: 'BeginnersProtector',
  Bow: 'HuntersBow',
  Catalyst: 'ApprenticesNotes',
};

// Explicit hit -> Mona skill index mapping ONLY where Mona's Chinese label or structure differs from LeyLine's hit name.
// Key format: `${characterId}:${hitId}:${family}` -> { monaIndex, note?, monaParamOverrides?, leylineFactOverrides? }
const EXPLICIT_HIT_MAPPINGS = {
  'aether-cryo:aether-cryo.burst.param1:stellar-conduct': { monaIndex: 13 },
  'aether-cryo:aether-cryo.burst.param1:stellar-swirl': { monaIndex: 14 },
  'lumine-cryo:lumine-cryo.burst.param1:stellar-conduct': { monaIndex: 13 },
  'lumine-cryo:lumine-cryo.burst.param1:stellar-swirl': { monaIndex: 14 },
  'columbina:columbina.normal.param6:lunar-bloom': { monaIndex: 4 },
  'columbina:columbina.skill.param4:lunar-bloom': { monaIndex: 11 },
  'flins:flins.burst.symphony:lunar-charged': { monaIndex: 19 },
  'flins:flins.c2.thunder-followup:lunar-charged': { monaIndex: 21 },
  'ineffa:ineffa.a0.thundercloud-discharge:lunar-charged': { monaIndex: 11 },
  'ineffa:ineffa.c2.edict-burst:lunar-charged': { monaIndex: 12 },
  'lauma:lauma.skill.param3:lunar-bloom': { monaIndex: 9 },
  'lauma:lauma.skill.c6-frostgrove:lunar-bloom': { monaIndex: 10 },
  'mitya:mitya.normal.param10:stellar-conduct': { monaIndex: 8, monaParamOverrides: { core_mode: 2 } },
  'mitya:mitya.skill.param4:stellar-conduct': { monaIndex: 12, monaParamOverrides: { core_mode: 1 } },
  'mitya:mitya.skill.param5:stellar-conduct': { monaIndex: 13, monaParamOverrides: { core_mode: 1, beacons: 1 } },
  'mitya:mitya.c4.beacon-consumption:stellar-conduct': { monaIndex: 15, monaParamOverrides: { core_mode: 1 } },
  'nefer:nefer.skill.phantasm-shadow-1:lunar-bloom': { monaIndex: 11 },
  'nefer:nefer.skill.phantasm-shadow-2:lunar-bloom': { monaIndex: 12 },
  'nefer:nefer.skill.phantasm-shadow-3:lunar-bloom': { monaIndex: 13 },
  'nefer:nefer.skill.c6-phantasm-second:lunar-bloom': { monaIndex: 16 },
  'nefer:nefer.skill.c6-phantasm-finish:lunar-bloom': { monaIndex: 17 },
  'odette:odette.skill.param3:stellar-conduct': { monaIndex: 12 },
  'odette:odette.skill.param3:stellar-swirl': { monaIndex: 13 },
  'odette:odette.skill.param6:stellar-conduct': { monaIndex: 15 },
  'odette:odette.skill.param6:stellar-swirl': { monaIndex: 16 },
  'odette:odette.skill.param9:stellar-conduct': { monaIndex: 18 },
  'odette:odette.skill.param9:stellar-swirl': { monaIndex: 19 },
  'odette:odette.c1.finale-conduct:stellar-conduct': { monaIndex: 22 },
  'odette:odette.c1.finale-swirl:stellar-swirl': { monaIndex: 23 },
  'odette:odette.c4.coordinated-conduct:stellar-conduct': { monaIndex: 24 },
  'odette:odette.c4.coordinated-swirl:stellar-swirl': { monaIndex: 25 },
  'qiqi:qiqi.burst.param7:stellar-conduct': { monaIndex: 19 },
  'sandrone:sandrone.normal.param5:stellar-conduct': { monaIndex: 5 },
  'sandrone:sandrone.normal.param5:stellar-swirl': { monaIndex: 18 },
  'sandrone:sandrone.skill.second:stellar-conduct': { monaIndex: 11 },
  'sandrone:sandrone.skill.second:stellar-swirl': { monaIndex: 19 },
  'sandrone:sandrone.burst.param2:stellar-conduct': { monaIndex: 14 },
  'sandrone:sandrone.burst.param2:stellar-swirl': { monaIndex: 20 },
  'sandrone:sandrone.c4.resonator-stellar-conduct:stellar-conduct': { monaIndex: 15 },
  'sandrone:sandrone.c4.resonator-stellar-swirl:stellar-swirl': { monaIndex: 21 },
  'sandrone:sandrone.c6.cluster-laser-stellar-conduct:stellar-conduct': { monaIndex: 17 },
  'sandrone:sandrone.c6.cluster-laser-stellar-swirl:stellar-swirl': { monaIndex: 22 },
  'vesna:vesna.skill.param5:stellar-swirl': { monaIndex: 13 },
  'vesna:vesna.skill.param7:stellar-swirl': { monaIndex: 14 },
  'vesna:vesna.skill.param9:stellar-swirl': { monaIndex: 15 },
  'vesna:vesna.burst.param2:stellar-swirl': { monaIndex: 17 },
  'vesna:vesna.skill.c6.spirit:stellar-swirl': { monaIndex: 19 },
  'wriothesley:wriothesley.normal.stellar-hit3:stellar-conduct': { monaIndex: 12 },
  'wriothesley:wriothesley.normal.stellar-hit5:stellar-conduct': { monaIndex: 13 },
  'wriothesley:wriothesley.normal.celestial-vaulting-fist-stellar:stellar-conduct': { monaIndex: 15 },
  'wriothesley:wriothesley.normal.stellar-hit5-icicle:stellar-conduct': { monaIndex: 17 },
  'wriothesley:wriothesley.normal.celestial-icicle-stellar:stellar-conduct': { monaIndex: 18 },
  'zibai:zibai.c4.lunar-flourish:lunar-crystallize': { monaIndex: 13, monaParamOverrides: { c4_rate: 1 } },
};

// Minimal neutral Mona character params per character (turns off optional/stackable buffs while preserving unconditional passives & direct-hit activation).
function buildNeutralMonaCharParams(monaKey, monaChar, family, constellation, explicitOverrides = null, predFacts = null) {
  const fields = monaChar?.config ?? [];
  if (!fields.length) return 'NoConfig';
  const params = {};
  for (const field of fields) {
    if (field.type === 'bool') params[field.name] = false;
    else if (field.type === 'option') params[field.name] = 0;
    else if (typeof field.min === 'number') params[field.name] = field.min;
    else params[field.name] = 0;
  }

  // Character-specific alignment of unconditional passives / direct-hit triggers
  if (monaKey === 'AetherCryo' || monaKey === 'LumineCryo') {
    params.radiance_mode = family === 'stellar-swirl' ? 2 : 1;
    params.cold_glow_stacks = 0;
    params.c2_em_state = 0;
  } else if (monaKey === 'Columbina') {
    // Columbina's reaction-blessing (月兆祝赐·借汝月光) is p1_max_hp_stack and is unconditional in LeyLine
    params.p1_max_hp_stack = true;
    params.p3_active = false;
  } else if (monaKey === 'Flins') {
    // Flins's reaction-blessing (月兆祝赐·旧世潜藏) is talent1_active and is unconditional in LeyLine
    params.talent1_active = true;
    params.full_moon = Boolean(predFacts?.team?.fullMoonsign);
  } else if (monaKey === 'Ineffa') {
    // Ineffa's reaction-blessing (月兆祝赐·象拟中继) is unconditional in LeyLine
    params.moonelectro_relay_active = true;
    params.em_bonus_active = false;
  } else if (monaKey === 'Lauma') {
    // Lauma's reaction-blessing (月兆祝赐·千籁恩宠) is talent1_active and is unconditional in LeyLine
    params.grass_count = 1;
    params.talent1_active = true;
    params.talent2_mode = 0;
    params.skill_res_minus_active = false;
    params.pale_hymn_active = false;
  } else if (monaKey === 'Linnea') {
    // Linnea's reaction-blessing (月兆祝赐·栖地考察 = talent1_enabled) and A4 EM conversion (万类博物图鉴 = talent3_enabled) are unconditional in LeyLine
    params.talent1_enabled = true;
    params.talent3_enabled = true;
  } else if (monaKey === 'Mitya') {
    params.core_mode = 2;
    params.beacons = 1;
    params.crit_stacks = 0;
    params.on_field = true;
    params.polestar = false;
    params.field_hits = 0;
  } else if (monaKey === 'Nefer') {
    // Nefer's reaction-blessing (月兆祝赐·廊下暮影) is talent1_active and is unconditional in LeyLine
    params.talent1_active = true;
    params.full_moon = false;
    params.veil_stacks = 0;
    params.c4_shadow_dance_active = false;
  } else if (monaKey === 'Odette') {
    params.radiance_mode = family === 'stellar-swirl' ? 2 : 1;
    params.marvelous_splendor_stacks = 0;
    params.snow_swan_dream = false;
    params.solo_dance_double = false;
  } else if (monaKey === 'Qiqi') {
    params.stellar_conduct_state = false;
  } else if (monaKey === 'Sandrone') {
    // Sandrone's reaction-blessing, A1 attack->EM, and C6 elevation (at C6) are unconditional in LeyLine
    params.stellar_base_active = true;
    params.em_conversion_active = true;
    params.c1_team_stellar = false;
    params.c6_elevate_active = constellation >= 6;
  } else if (monaKey === 'Vesna') {
    params.stance = true;
    params.radiance = true;
    params.disciplinary_stacks = constellation >= 2 ? 6 : 0;
    params.anemo_cryo_count = 1;
    params.other_count = 0;
  } else if (monaKey === 'Wriothesley') {
    // Wriothesley's stellar_conduct_state corresponds to radiance === 'stellar-conduct' (+30% stellar-conduct bonus)
    params.talent2_stack = 0;
    params.stellar_conduct_state = true;
  } else if (monaKey === 'YaeMiko') {
    params.stellar_conduct_state = false;
    params.sakura_level = 1;
  } else if (monaKey === 'YumemizukiMizuki') {
    params.talent2_rate = 0;
    params.enhanced_state = false;
    params.c1_reaction_active = false;
  } else if (monaKey === 'Zibai') {
    // Zibai's reaction-blessing (浮明若流) is talent1_enabled; interval_mode aligns with zibai.lunarPhase
    params.interval_mode = Boolean(predFacts?.actor?.['zibai.lunarPhase']);
    params.talent1_enabled = true;
    params.other_geo = 0;
    params.hydro = 0;
    params.kick2_rate = 0;
    params.c1_rate = 0;
    params.c2_talent2_rate = 0;
    params.c4_rate = 0;
    params.c6_light_excess = 0;
  }

  if (explicitOverrides) Object.assign(params, explicitOverrides);
  return { [monaKey]: params };
}

function buildNeutralMonaSkillConfig(monaKey, monaChar) {
  const fields = monaChar?.configSkill ?? [];
  if (!fields.length) return 'NoConfig';
  const params = {};
  for (const field of fields) {
    if (field.name === 'grass_count') params[field.name] = 1;
    else if (field.type === 'bool') params[field.name] = false;
    else if (typeof field.min === 'number') params[field.name] = field.min;
    else params[field.name] = 0;
  }
  return { [monaKey]: params };
}

const sumObj = obj => Object.values(obj ?? {}).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

function relError(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) / Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)));
}

function normalizeLabel(label) {
  return String(label ?? '')
    .replace(/[\s·・:：\-—()（）/]/g, '')
    .replace(/伤害$/g, '')
    .replace(/第一段/g, '一段')
    .replace(/第二段/g, '二段')
    .replace(/第三段/g, '三段')
    .replace(/第四段/g, '四段')
    .replace(/第五段/g, '五段')
    .toLowerCase();
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

function createFallbackShared() {
  let monaRuntimePromise = null;
  let enginePromise = null;
  let monaCharsCache = null;
  return {
    async getMonaRuntime() {
      monaRuntimePromise ??= import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
      return monaRuntimePromise;
    },
    async getEngine() {
      enginePromise ??= loadContentSchema('/src/engine/src/index.ts');
      return enginePromise;
    },
    getMonaChars() {
      monaCharsCache ??= readMonaAsset('src/assets/_gen_character.js');
      return monaCharsCache;
    },
  };
}

function normalizeFilter(options) {
  const list = [...(options?.characters ?? []), ...(options?.entities ?? [])]
    .flatMap(v => String(v).split(','))
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? new Set(list) : null;
}

/** Dynamically discover all non-ordinary hits in src/game-data/data/characters/*.json. */
function discoverLeylineSpecialHits(filterSet, limit) {
  const files = readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json')).sort();
  const byChar = new Map();

  for (const file of files) {
    const doc = JSON.parse(readFileSync(resolve(CHARACTERS_DIR, file), 'utf8'));
    const charId = doc.id;
    if (filterSet && !filterSet.has(charId.toLowerCase())) continue;

    const hits = [];
    for (const bucket of ['talents', 'passives', 'constellations']) {
      for (const [ownerIndex, owner] of (doc[bucket] ?? []).entries()) {
        for (const [hitIndex, rawHit] of (owner.hits ?? []).entries()) {
          const fam = rawHit.family;
          if (!fam || fam === 'ordinary') continue;

          const families = [];
          if (typeof fam === 'string') {
            if (FAMILY_SPECS[fam]) families.push(fam);
          } else if (fam && typeof fam === 'object' && fam.cases) {
            const seen = new Set();
            for (const caseFam of Object.values(fam.cases)) {
              if (caseFam !== 'ordinary' && FAMILY_SPECS[caseFam] && !seen.has(caseFam)) {
                seen.add(caseFam);
                families.push(caseFam);
              }
            }
          }
          if (!families.length) continue;

          const skillId = rawHit.skill ?? (bucket === 'talents' ? owner.id : doc.talents?.[0]?.id);
          const talentIdx = (doc.talents ?? []).findIndex(t => t.id === skillId);
          const skillGroup = talentIdx >= 0 ? talentIdx + 1 : 1; // 1=normal, 2=skill, 3=burst
          const minConstellation = bucket === 'constellations'
            ? (owner.rank ?? 0)
            : (rawHit.selection?.minConstellation ?? 0);
          const minAscension = bucket === 'passives' ? (owner.unlockAscension ?? 0) : 0;

          hits.push({
            characterId: charId,
            hitId: rawHit.id,
            name: rawHit.name,
            field: `/${bucket}/${ownerIndex}/hits/${hitIndex}`,
            bucket,
            ownerIndex,
            hitIndex,
            skillId,
            skillGroup,
            element: rawHit.element ?? owner.element ?? doc.talents?.[talentIdx]?.element ?? doc.identity?.element,
            category: rawHit.category ?? owner.category ?? doc.talents?.[talentIdx]?.category,
            rawFamily: fam,
            families,
            minConstellation,
            minAscension,
            rawHit,
          });
        }
      }
    }

    if (hits.length) {
      byChar.set(charId, hits);
    }
  }

  let charIds = [...byChar.keys()].sort();
  if (limit && limit > 0) charIds = charIds.slice(0, limit);
  const discovered = [];
  for (const cid of charIds) discovered.push(...byChar.get(cid));
  return { charIds, hits: discovered };
}

/** Extract primary scaling axis (attack/hp/defense/elementalMastery) from raw hit definition or compiled trace. */
function inferScalingAxes(rawHit) {
  const axes = new Set();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node.stat === 'string' && SCALING_AXES[node.stat]) {
      axes.add(node.stat);
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(rawHit?.base);
  return [...axes];
}

/** Extract facts needed to satisfy a compiled LeyLine hit predicate. */
function collectPredicateFacts(pred, out = { actor: {}, query: {}, target: {}, team: {}, minConstellation: 0 }, negated = false) {
  if (!pred || typeof pred !== 'object') return out;
  if (pred.kind === 'fact') {
    const scope = pred.scope === 'team' ? 'team' : pred.scope === 'target' ? 'target' : pred.scope === 'query' ? 'query' : 'actor';
    if (pred.type?.kind === 'boolean') {
      out[scope][pred.key] = !negated;
    } else if (pred.type?.kind === 'quantity') {
      out[scope][pred.key] = negated ? 0 : 1;
    }
    return out;
  }
  if (pred.kind === 'formula') {
    const id = pred.formula?.id ?? '';
    if (id === 'condition.not' || id.endsWith('.not')) {
      collectPredicateFacts(pred.inputs?.term0, out, !negated);
      return out;
    }
    const rankMatch = /^rank\.at-least-(\d+)$/.exec(id);
    if (rankMatch && pred.inputs?.rank?.property === 'constellation' && !negated) {
      out.minConstellation = Math.max(out.minConstellation, Number(rankMatch[1]));
      return out;
    }
    if (id.includes('resonator-stellar-conduct') && pred.inputs?.value?.kind === 'fact') {
      out.query[pred.inputs.value.key] = 'stellar-conduct';
      return out;
    }
    if (id.includes('resonator-stellar-swirl') && pred.inputs?.value?.kind === 'fact') {
      out.query[pred.inputs.value.key] = 'stellar-swirl';
      return out;
    }
    if (id === 'lauma.has-dew' && pred.inputs?.count?.kind === 'fact') {
      out.query[pred.inputs.count.key] = 1;
      return out;
    }
    // Radiance checks are handled explicitly by target family
    if (id.includes('radiance') || id.includes('radiant')) return out;
    for (const v of Object.values(pred.inputs ?? {})) {
      collectPredicateFacts(v, out, negated);
    }
  }
  return out;
}

function setScopedFact(frame, scope, key, value, metadataFacts) {
  const decl = metadataFacts?.[key];
  let factVal;
  if (typeof value === 'boolean') factVal = bool(value);
  else if (typeof value === 'number') factVal = number(decl?.type?.unit ?? (key === 'stellarAttachments' ? 'count' : 'scalar'), value);
  else factVal = fact({ kind: 'enum', value: String(value) });

  if (scope === 'query') {
    frame.facts[key] = factVal;
    return;
  }
  const subject = scope === 'team'
    ? { kind: 'team' }
    : scope === 'target'
      ? { kind: 'target', id: 'enemy' }
      : { kind: 'actor', id: 'actor' };
  let row = frame.factOverrides.find(r => r.subject.kind === subject.kind && r.subject.id === subject.id);
  if (!row) {
    row = { subject, facts: {} };
    frame.factOverrides.push(row);
  }
  row.facts[key] = factVal;
}

/** Probe a character's Mona skill menu and detect every skill index that emits any direct_* branch. */
async function probeCharacterMonaDirectSkills(api, monaKey, monaChar, labels) {
  const skillMenu = [];
  const seenIdx = new Set();
  for (const group of [1, 2, 3]) {
    for (const item of (monaChar[`skillMap${group}`] ?? [])) {
      if (seenIdx.has(item.index)) continue;
      seenIdx.add(item.index);
      skillMenu.push({
        index: item.index,
        group,
        label: labels[item.text] ?? item.text,
        normLabel: normalizeLabel(labels[item.text] ?? item.text),
      });
    }
  }

  // Also call probeMonaSkills once at C0 for baseline verification & input template
  const baseProbe = await probeMonaSkills({ characters: [monaKey], constellations: [0] });
  const probeErrors = baseProbe.rows
    .filter(r => r.status !== 'ok')
    .map(r => ({ character: monaKey, index: r.index, constellation: r.constellation, error: r.error }));

  // Determine minimal param variants needed to uncover conditional direct branches
  const paramVariants = [{}];
  for (const field of (monaChar.config ?? [])) {
    if (field.name === 'radiance_mode' && Array.isArray(field.options)) {
      for (let i = 1; i < field.options.length; i++) paramVariants.push({ radiance_mode: i });
    } else if (field.name === 'radiance' && field.type === 'bool') {
      paramVariants.push({ radiance: true });
    } else if (field.name === 'core_mode' && Array.isArray(field.options)) {
      for (let i = 1; i < field.options.length; i++) paramVariants.push({ core_mode: i });
    } else if (field.name === 'stellar_conduct_state' && field.type === 'bool') {
      paramVariants.push({ stellar_conduct_state: true });
    } else if (field.name === 'enhanced_state' && field.type === 'bool') {
      paramVariants.push({ enhanced_state: true });
    }
  }
  const uniqueVariants = [...new Map(paramVariants.map(v => [JSON.stringify(v), v])).values()];

  const directSkills = []; // { index, group, label, normLabel, branch, family, element, activeAtC0, activeAtC6 }
  const seenSkillBranch = new Set();

  for (const item of skillMenu) {
    for (const cons of [0, 6]) {
      for (const variant of uniqueVariants) {
        const params = buildNeutralMonaCharParams(monaKey, monaChar, 'stellar-conduct', cons, variant);
        const input = {
          character: { name: monaKey, level: 90, ascend: false, constellation: cons, skill1: 9, skill2: 9, skill3: 9, params },
          weapon: { name: MONA_NOVICE[monaChar.weapon], level: 1, ascend: false, refine: 1, params: 'NoConfig' },
          skill: { index: item.index, config: buildNeutralMonaSkillConfig(monaKey, monaChar) },
          artifacts: [],
          enemy: null,
          buffs: [],
          artifact_config: null,
        };
        try {
          const analysis = api.CalculatorInterface.get_damage_analysis(input, null);
          for (const spec of Object.values(FAMILY_SPECS)) {
            const br = analysis[spec.monaBranch];
            if (br && Number.isFinite(br.non_critical)) {
              const key = `${item.index}:${spec.monaBranch}`;
              if (!seenSkillBranch.has(key)) {
                seenSkillBranch.add(key);
                directSkills.push({
                  ...item,
                  branch: spec.monaBranch,
                  family: spec.family,
                  element: String(analysis.element ?? '').toLowerCase(),
                });
              }
            }
          }
        } catch (error) {
          probeErrors.push({ character: monaKey, index: item.index, constellation: cons, variant, error: String(error?.message ?? error) });
        }
      }
    }
  }

  return { skillMenu, directSkills, probeErrors };
}

/** Match a (LeyLine hit, family) pair to its Mona skill index. */
function matchLeylineHitToMonaSkill(hitEntry, family, directSkills) {
  const explicitKey = `${hitEntry.characterId}:${hitEntry.hitId}:${family}`;
  const explicit = EXPLICIT_HIT_MAPPINGS[explicitKey];
  if (explicit) {
    const found = directSkills.find(s => s.index === explicit.monaIndex && s.family === family);
    if (found) {
      return {
        skill: found,
        matchMethod: 'explicit',
        monaParamOverrides: explicit.monaParamOverrides ?? null,
        leylineFactOverrides: explicit.leylineFactOverrides ?? null,
      };
    }
  }

  const normHit = normalizeLabel(hitEntry.name);
  const famCandidates = directSkills.filter(s => s.family === family);

  // 1. Exact normalized label match in same skill group
  const exactSameGroup = famCandidates.find(s => s.normLabel === normHit && s.group === hitEntry.skillGroup);
  if (exactSameGroup) return { skill: exactSameGroup, matchMethod: 'exact-label-group' };

  // 2. Exact normalized label match across any skill group
  const exactAnyGroup = famCandidates.find(s => s.normLabel === normHit);
  if (exactAnyGroup) return { skill: exactAnyGroup, matchMethod: 'exact-label' };

  // 3. Containment match (e.g., Mona appends "·星超导" / "伤害" or LeyLine adds suffix)
  const contains = famCandidates.filter(s =>
    s.group === hitEntry.skillGroup && (s.normLabel.includes(normHit) || normHit.includes(s.normLabel)),
  );
  if (contains.length === 1) return { skill: contains[0], matchMethod: 'substring-group' };

  return null;
}

/** Evaluate a LeyLine special-family hit at a specific talent level & constellation. */
function evaluateLeylineSpecialHit({ engine, character, weapon, hitEntry, family, talentLevel, constellation }) {
  const build = {
    ...auditBuild(character, weapon),
    level: 90,
    ascension: 6,
    constellation,
    talents: { normal: talentLevel, skill: talentLevel, burst: talentLevel },
  };
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
  if (!prepared.ok) {
    return { ok: false, error: `prepareStructuredBuilds failed: ${JSON.stringify(prepared.diagnostics)}` };
  }

  let talent = null;
  let compiledHit = null;
  for (const t of character.talents) {
    const h = t.hits.find(x => x.id === hitEntry.hitId);
    if (h) {
      talent = t;
      compiledHit = h;
      break;
    }
  }
  if (!talent || !compiledHit) {
    return { ok: false, error: `Compiled hit not found: ${hitEntry.hitId}` };
  }

  const { setup, request } = auditHit(character, talent, compiledHit, 90);
  setAuditDefaults(character, request.frame);
  setAuditDefaults(weapon, request.frame);

  // Apply predicate-required facts
  const damageBranch = compiledHit.damage?.[family];
  const predFacts = collectPredicateFacts(damageBranch?.predicate);
  const metaFacts = character.metadata?.facts ?? {};
  for (const [scope, entries] of [['actor', predFacts.actor], ['query', predFacts.query], ['target', predFacts.target], ['team', predFacts.team]]) {
    for (const [k, v] of Object.entries(entries)) {
      setScopedFact(request.frame, scope, k, v, metaFacts);
    }
  }

  // Set radiance & stellarAttachments for stellar hits
  const famSpec = FAMILY_SPECS[family];
  if (famSpec.isStellar) {
    setScopedFact(request.frame, 'actor', 'radiance', family, metaFacts);
    if (family === 'stellar-conduct') {
      setScopedFact(request.frame, 'query', 'stellarAttachments', 0, metaFacts);
    }
  }

  // Character-specific count / state alignment with neutral Mona baseline
  if (character.id === 'mitya') {
    if (hitEntry.hitId === 'mitya.skill.param4') {
      setScopedFact(request.frame, 'actor', 'mitya.heldBeacons', 1, metaFacts);
    } else if (hitEntry.hitId === 'mitya.skill.param5') {
      setScopedFact(request.frame, 'query', 'mitya.beacons', 1, metaFacts);
      setScopedFact(request.frame, 'actor', 'mitya.heldBeacons', 1, metaFacts);
    } else if (hitEntry.hitId === 'mitya.c4.beacon-consumption') {
      setScopedFact(request.frame, 'actor', 'mitya.stable', true, metaFacts);
      setScopedFact(request.frame, 'actor', 'mitya.heldBeacons', 1, metaFacts);
    }
  } else if (character.id === 'lauma') {
    if (hitEntry.hitId === 'lauma.skill.param3') {
      setScopedFact(request.frame, 'query', 'lauma.consumedDew', 1, metaFacts);
    }
  } else if (character.id === 'yumemizukimizuki') {
    // Mona's Mizuki E stellar-swirl bonus is always active on her E stellar hits (dreamdrifter active)
    setScopedFact(request.frame, 'actor', 'yumemizukimizuki.dreamdrifter', true, metaFacts);
  } else if (character.id === 'vesna') {
    setScopedFact(request.frame, 'actor', 'vesna.stance', true, metaFacts);
    // Vesna C2 automatically grants max (6) discipline stacks when entering stance (matches Mona co >= 2 && stance)
    setScopedFact(request.frame, 'actor', 'vesna.disciplineStacks', constellation >= 2 ? 6 : 0, metaFacts);
  }

  const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
  const damageVal = evaluated.totals?.all?.state === 'known' ? evaluated.totals.all.value?.value : null;

  const readTraceAttr = nodeId => {
    const n = evaluated.trace.find(t => t.kind === 'attribute' && t.nodeId === nodeId && (t.context?.actorId === 'actor' || !t.context?.actorId));
    return n?.state === 'known' ? n.value?.value : null;
  };
  const readTraceNode = nodeId => {
    const n = evaluated.trace.find(t => (t.kind === 'node' || t.kind === 'read') && t.nodeId === nodeId);
    return n?.state === 'known' ? n.value?.value : null;
  };

  const panel = {
    attack: readTraceAttr('attribute.attack'),
    hp: readTraceAttr('attribute.hp'),
    defense: readTraceAttr('attribute.defense'),
    elementalMastery: readTraceAttr('attribute.elementalMastery'),
  };

  const reactionBase = readTraceNode('reactionBase');
  const reactionCoeff = readTraceNode('reactionCoefficient') ?? famSpec.reactionCoeff;
  const baseBonus = readTraceAttr(`${famSpec.leylinePrefix}.baseBonus`) ?? 0;
  const damageBonus = readTraceAttr(`${famSpec.leylinePrefix}.damageBonus`) ?? 0;
  const flatBaseBonus = readTraceAttr(`${famSpec.leylinePrefix}.flatBaseBonus`) ?? 0;
  const baseMultiplier = famSpec.isStellar
    ? (readTraceAttr(`${famSpec.leylinePrefix}.baseMultiplier`) ?? 1)
    : (readTraceAttr('attribute.baseMultiplier') ?? 1);
  const elevationRaw = readTraceAttr(famSpec.elevationAttr);
  const elevationFactor = famSpec.elevationIsFactor ? (elevationRaw ?? 1) : (1 + (elevationRaw ?? 0));
  const reactionFactor = readTraceNode('reactionFactor');

  // Effective scaling ratio = (reactionBase / reactionCoeff) / primaryStat
  // Fallback: if primaryStat === 0 (e.g., missing innate base EM in character JSON), extract directly from raw hit definition & talent parameters so scaling audit still runs cleanly.
  const axes = inferScalingAxes(hitEntry.rawHit);
  const primaryAxis = axes[0] ?? 'attack';
  const primaryStatVal = panel[primaryAxis];
  let effectiveRatio = (Number.isFinite(reactionBase) && Number.isFinite(primaryStatVal) && primaryStatVal > 0)
    ? (reactionBase / reactionCoeff) / primaryStatVal
    : null;
  if (effectiveRatio == null) {
    effectiveRatio = extractRawBaseRatio(character.metadata, hitEntry, talentLevel, constellation);
  }

  return {
    ok: true,
    damage: damageVal,
    requiredInputs: evaluated.requiredInputs ?? [],
    element: compiledHit.element ?? hitEntry.element,
    primaryAxis,
    axes,
    panel,
    effectiveRatio,
    predFacts,
    breakdown: {
      reactionBase,
      reactionCoeff,
      baseMultiplier,
      baseBonus,
      damageBonus,
      reactionFactor,
      flatBaseBonus,
      elevationFactor,
      em: panel.elementalMastery,
      primaryStat: primaryStatVal,
    },
  };
}

/** Fallback ratio extractor from raw hit definition + talent parameters when bare-panel scaling stat is 0. */
function extractRawBaseRatio(metadata, hitEntry, talentLevel, constellation) {
  const bonuses = computeConstellationTalentBonuses(metadata, constellation);
  const lookupParam = (skillId, paramId) => {
    const t = (metadata.talents ?? []).find(x => x.id === skillId);
    if (!t) return null;
    const p = (t.parameters ?? []).find(x => x.id === paramId);
    if (!p?.values) return null;
    const bonus = t.category === 'normal' ? bonuses.normal : t.category === 'skill' ? bonuses.skill : bonuses.burst;
    const idx = Math.min(p.values.length - 1, Math.max(0, talentLevel + bonus - 1));
    return p.values[idx];
  };
  const base = hitEntry.rawHit?.base;
  if (Array.isArray(base)) {
    let total = 0;
    for (const term of base) {
      if (typeof term.ratio === 'number') total += term.ratio;
      else if (term.parameter) {
        const val = lookupParam(term.skill ?? hitEntry.skillId, term.parameter);
        if (val == null) return null;
        total += val;
      }
    }
    return total;
  }
  if (base && typeof base === 'object' && base.template === 'product.damage') {
    const basis = base.inputs?.basis;
    const ratioSpec = basis?.inputs?.ratio;
    if (typeof ratioSpec === 'number') return ratioSpec;
    if (ratioSpec?.parameter) return lookupParam(ratioSpec.skill ?? hitEntry.skillId, ratioSpec.parameter);
  }
  return null;
}

/** Compute Mona talent bonus levels from constellations (matching Mona's skill1/2/3 indexing). */
function computeConstellationTalentBonuses(character, constellation) {
  const bonuses = { normal: 0, skill: 0, burst: 0 };
  for (const c of (character.constellations ?? [])) {
    if ((c.rank ?? 99) > constellation) continue;
    for (const tb of (c.talentBonuses ?? [])) {
      if (tb.category in bonuses) bonuses[tb.category] += tb.levels ?? 0;
    }
  }
  return bonuses;
}

/** Extract Mona's direct-branch ratio and breakdown from get_damage_analysis output. */
function extractMonaDirectBreakdown(analysis, famSpec, primaryAxis) {
  const branch = analysis[famSpec.monaBranch];
  const rawRatioObj = analysis[famSpec.monaRatioField];
  const ratioFromBranch = sumObj(rawRatioObj);
  const ratioFromStellarDetail = sumObj(analysis.stellar_detail?.ratio);
  const axisInfo = SCALING_AXES[primaryAxis];
  const ratioFromAxis = axisInfo ? sumObj(analysis[axisInfo.monaRatio]) : 0;

  // Prefer explicit direct_*_ratio if non-empty; else stellar_detail.ratio; else axis ratio
  const hasBranchRatio = rawRatioObj && Object.keys(rawRatioObj).length > 0;
  const baseRatio = hasBranchRatio
    ? ratioFromBranch
    : (analysis.stellar_detail?.ratio && Object.keys(analysis.stellar_detail.ratio).length > 0
      ? ratioFromStellarDetail
      : ratioFromAxis);

  const panel = {
    attack: sumObj(analysis.atk),
    hp: sumObj(analysis.hp),
    defense: sumObj(analysis.def),
    elementalMastery: sumObj(analysis.em),
  };
  // For JS beta models (Mitya/Vesna), stellar_detail.scaling has the actual scaling stat sum
  const detailScalingSum = analysis.stellar_detail?.scaling ? sumObj(analysis.stellar_detail.scaling) : null;
  if (detailScalingSum != null && analysis.stellar_detail?.scaling_name) {
    const sn = analysis.stellar_detail.scaling_name;
    if (sn.includes('精通') && panel.elementalMastery === 0) panel.elementalMastery = detailScalingSum;
    else if (sn.includes('攻击') && panel.attack === 0) panel.attack = detailScalingSum;
    else if (sn.includes('生命') && panel.hp === 0) panel.hp = detailScalingSum;
    else if (sn.includes('防御') && panel.defense === 0) panel.defense = detailScalingSum;
  }

  const baseMultiplier = famSpec.monaBaseMultiplierField
    ? (analysis[famSpec.monaBaseMultiplierField] ?? (sumObj(analysis.stellar_detail?.base_multiplier) || 1))
    : (sumObj(analysis.stellar_detail?.base_multiplier) || 1);

  const baseBonusObj = analysis[famSpec.monaBaseComposeField] ?? analysis.stellar_detail?.base_bonus ?? {};
  const baseBonus = sumObj(baseBonusObj);

  const composeObj = analysis[famSpec.monaComposeField] ?? analysis.stellar_detail?.bonus ?? {};
  const composeBonus = sumObj(composeObj);

  const extraDamageObj = famSpec.monaExtraDamageField ? (analysis[famSpec.monaExtraDamageField] ?? {}) : {};
  const extraDamage = sumObj(extraDamageObj);

  const extraFixedObj = famSpec.monaExtraFixedField ? (analysis[famSpec.monaExtraFixedField] ?? {}) : {};
  const extraFixed = sumObj(extraFixedObj) + sumObj(analysis.stellar_detail?.flat);

  const extraEmRatio = sumObj(analysis[`${famSpec.monaBranch}_extra_em_ratio`]);
  const extraDefRatio = sumObj(analysis[`${famSpec.monaBranch}_extra_def_ratio`]);

  let elevateSum = 0;
  const elevateSources = {};
  for (const ef of famSpec.monaElevateFields) {
    for (const [k, v] of Object.entries(analysis[ef] ?? {})) {
      if (Math.abs(v) > 1e-12) {
        elevateSources[k] = v;
        elevateSum += v;
      }
    }
  }
  if (!Object.keys(elevateSources).length && analysis.stellar_detail?.elevation) {
    for (const [k, v] of Object.entries(analysis.stellar_detail.elevation)) {
      if (Math.abs(v) > 1e-12) {
        elevateSources[k] = v;
        elevateSum += v;
      }
    }
  }

  const resMinus = sumObj(analysis.res_minus);
  const primaryStatVal = panel[primaryAxis] ?? 0;
  const extraRatioEquivalent = (primaryStatVal > 0 && extraDamage > 0) ? extraDamage / primaryStatVal : 0;

  return {
    damage: branch?.non_critical ?? null,
    element: String(analysis.element ?? '').toLowerCase(),
    ratio: baseRatio,
    effectiveRatioWithExtra: baseRatio * baseMultiplier + extraRatioEquivalent,
    baseMultiplier,
    baseBonus,
    baseBonusSources: baseBonusObj,
    composeBonus,
    composeSources: composeObj,
    extraDamage,
    extraDamageSources: extraDamageObj,
    extraFixed,
    extraFixedSources: extraFixedObj,
    extraEmRatio,
    extraDefRatio,
    elevationFactor: 1 + elevateSum,
    elevateSources,
    resMinus,
    resMinusSources: analysis.res_minus ?? {},
    panel,
  };
}

/** Run Mona evaluation at a given talent level, constellation, and optional panel alignment against LeyLine. */
function evaluateMonaDirectHit({ api, monaKey, monaChar, skillIndex, family, talentLevel, constellation, talentBonuses, monaParamOverrides, predFacts, alignToLeylinePanel }) {
  const famSpec = FAMILY_SPECS[family];
  const params = buildNeutralMonaCharParams(monaKey, monaChar, family, constellation, monaParamOverrides, predFacts);
  const input = {
    character: {
      name: monaKey,
      level: 90,
      ascend: false,
      constellation,
      skill1: talentLevel + talentBonuses.normal - 1,
      skill2: talentLevel + talentBonuses.skill - 1,
      skill3: talentLevel + talentBonuses.burst - 1,
      params,
    },
    weapon: { name: MONA_NOVICE[monaChar.weapon], level: 1, ascend: false, refine: 1, params: 'NoConfig' },
    skill: { index: skillIndex, config: buildNeutralMonaSkillConfig(monaKey, monaChar) },
    artifacts: [],
    enemy: null,
    buffs: [],
    artifact_config: null,
  };

  const neutralAnalysis = api.CalculatorInterface.get_damage_analysis(input, null);
  const neutralPanel = {
    attack: sumObj(neutralAnalysis.atk),
    hp: sumObj(neutralAnalysis.hp),
    defense: sumObj(neutralAnalysis.def),
    elementalMastery: sumObj(neutralAnalysis.em),
  };

  const panelAdjustments = {};
  const unalignedPanelDiffs = {};
  if (alignToLeylinePanel) {
    for (const [axis, info] of Object.entries(SCALING_AXES)) {
      const leyVal = alignToLeylinePanel[axis];
      const monaVal = neutralPanel[axis];
      if (!Number.isFinite(leyVal) || !Number.isFinite(monaVal)) continue;
      const diff = leyVal - monaVal;
      if (Math.abs(diff) <= 1e-9) continue;
      // Only auto-align small panel rounding drift (<= 5); report large stat discrepancies loudly!
      if (Math.abs(diff) <= 5) {
        input.buffs.push({ name: info.monaBuff, config: { [info.monaBuff]: { value: diff } } });
        panelAdjustments[axis] = diff;
      } else {
        unalignedPanelDiffs[axis] = { leyline: leyVal, mona: monaVal, diff };
      }
    }
  }

  const analysis = Object.keys(panelAdjustments).length
    ? api.CalculatorInterface.get_damage_analysis(input, null)
    : neutralAnalysis;

  return {
    analysis,
    famSpec,
    panelAdjustments,
    unalignedPanelDiffs,
    monaParamsUsed: params,
  };
}

/** Annotate verified known Mona simplifications/artifacts without hiding genuine bugs. */
function classifyKnownArtifact(ctx) {
  const {
    characterId,
    hitId,
    family,
    constellation,
    ratioT1,
    ratioT10,
    damageRelError,
    elementMatch,
    monaBreakdown,
    leylineBreakdown,
    unalignedPanelDiffs,
  } = ctx;

  if (!elementMatch) return null;

  // 1. Verified 4-decimal rounding in Mona's talent tables / panel precision:
  // Either tiny residual drift (<= 0.05%) or exact ratio rounding (|monaRatio - leyRatio| <= 0.000055) that accounts for the entire damage delta.
  if (!Object.keys(unalignedPanelDiffs ?? {}).length) {
    const mRatio = ratioT10?.monaRatio;
    const lRatio = ratioT10?.leylineRatio;
    if (Number.isFinite(mRatio) && Number.isFinite(lRatio) && mRatio > 0 && lRatio > 0) {
      const ratioAbsDiff = Math.abs(mRatio - lRatio);
      if (ratioAbsDiff > 1e-9 && ratioAbsDiff <= 0.000055) {
        const ratioAdjustedMona = monaBreakdown.damage * (lRatio / mRatio);
        const adjRel = relError(ratioAdjustedMona, leylineBreakdown.damage);
        if (adjRel != null && adjRel <= 0.0003) {
          return {
            kind: 'mona-4-decimal-rounding',
            note: `Mona 4-decimal talent ratio rounding (mona=${mRatio} vs leyline=${lRatio}, ratioDiff=${ratioAbsDiff.toFixed(6)}); damage relError=${(damageRelError * 100).toFixed(4)}%, after ratio alignment=${(adjRel * 100).toFixed(4)}%.`,
          };
        }
      }
    }
    if (damageRelError != null && damageRelError <= 0.0005) {
      return {
        kind: 'mona-4-decimal-rounding',
        note: `Damage relError=${(damageRelError * 100).toFixed(4)}% within Mona 4-decimal talent/panel rounding.`,
      };
    }
  }

  // 2. Mona unconditionally bakes character constellation/passive buff at C>=1/C>=6 that LeyLine gates behind an explicit fact
  if (characterId === 'ineffa' && constellation >= 1 && (monaBreakdown.composeSources?.['伊涅芙一命：循环整流引擎'] ?? 0) > 0) {
    const monaC1Bonus = monaBreakdown.composeSources['伊涅芙一命：循环整流引擎'];
    const adjustedMona = monaBreakdown.damage / (1 + monaC1Bonus);
    const adjRel = relError(adjustedMona, leylineBreakdown.damage);
    if (adjRel != null && adjRel <= 0.001) {
      return {
        kind: 'mona-baked-c1-buff',
        note: `Mona unconditionally applies Ineffa C1 (+${(monaC1Bonus * 100).toFixed(2)}% lunar bonus) at C${constellation}, whereas LeyLine gates it behind ineffa.carrierCompositeWindow. After removing C1 bonus, relError=${(adjRel * 100).toFixed(4)}%.`,
      };
    }
  }

  if (characterId === 'lauma' && constellation >= 6 && (monaBreakdown.composeSources?.['苍色祷歌·满辉'] ?? 0) > 0) {
    const c2Bonus = monaBreakdown.composeSources['苍色祷歌·满辉'];
    const emBonus = monaBreakdown.composeSources['精通'] ?? 0;
    const adjustedMona = monaBreakdown.damage * ((1 + emBonus) / (1 + emBonus + c2Bonus));
    const adjRel = relError(adjustedMona, leylineBreakdown.damage);
    if (adjRel != null && adjRel <= 0.001) {
      return {
        kind: 'mona-baked-c2-full-moonsign-buff',
        note: `Mona unconditionally applies Lauma C2/full-moon lunar-bloom bonus (+${(c2Bonus * 100).toFixed(1)}%) at C6 even with talent2_mode=0. After removing it, relError=${(adjRel * 100).toFixed(4)}%.`,
      };
    }
  }

  if (characterId === 'vesna' && constellation >= 6) {
    // Check if Mona bakes C1/C6 unconditional bonuses (薇斯纳一命 +0.2 bonus, 薇斯纳六命 +0.2 elevation, C4 atk, etc.)
    const hasC1 = (monaBreakdown.composeSources?.['薇斯纳一命'] ?? 0) > 0;
    const hasC6Elev = (monaBreakdown.elevateSources?.['薇斯纳六命'] ?? 0) > 0;
    if ((hasC1 || hasC6Elev) && ratioT10?.matched) {
      return {
        kind: 'mona-baked-constellation-buffs',
        note: `Mona unconditionally bakes Vesna C1 (+20% stellar-swirl bonus) / C2 / C6 (+20% elevation) at C6 even when LeyLine gates them behind explicit constellation conditions.`,
      };
    }
  }

  // 3. Flins: LeyLine's A1 (attack -> EM) and reaction-blessing are unconditional at A6, while Mona's Flins A1/blessing may differ slightly
  if (characterId === 'flins') {
    const baseBonusDiff = Math.abs((leylineBreakdown.baseBonus ?? 0) - (monaBreakdown.baseBonus ?? 0));
    if (baseBonusDiff > 1e-4 && ratioT10?.matched) {
      const adjustedLeyline = leylineBreakdown.damage / (1 + leylineBreakdown.baseBonus) * (1 + monaBreakdown.baseBonus);
      const adjRel = relError(monaBreakdown.damage, adjustedLeyline);
      if (adjRel != null && adjRel <= 0.0015) {
        return {
          kind: 'mona-unmodeled-reaction-blessing',
          note: `LeyLine applies Flins's passive reaction-blessing (baseBonus=${leylineBreakdown.baseBonus.toFixed(6)}) unconditionally; Mona has baseBonus=${monaBreakdown.baseBonus.toFixed(6)}. After aligning baseBonus, relError=${(adjRel * 100).toFixed(4)}%.`,
        };
      }
    }
  }

  // 4. Nefer / Lauma / Zibai: LeyLine's unconditional reaction-blessing (baseBonus) when Mona leaves baseBonus=0 under neutral config
  if (['lauma', 'nefer', 'zibai'].includes(characterId)) {
    const baseBonusDiff = Math.abs((leylineBreakdown.baseBonus ?? 0) - (monaBreakdown.baseBonus ?? 0));
    if (baseBonusDiff > 1e-4 && ratioT10?.matched && !Object.keys(unalignedPanelDiffs ?? {}).length) {
      const adjustedLeyline = leylineBreakdown.damage / (1 + leylineBreakdown.baseBonus) * (1 + monaBreakdown.baseBonus);
      const adjRel = relError(monaBreakdown.damage, adjustedLeyline);
      if (adjRel != null && adjRel <= 0.0015) {
        return {
          kind: 'mona-unmodeled-reaction-blessing',
          note: `LeyLine applies ${characterId}'s passive reaction-blessing (baseBonus=${leylineBreakdown.baseBonus.toFixed(6)}) unconditionally; Mona has baseBonus=${monaBreakdown.baseBonus.toFixed(6)}. After aligning baseBonus, relError=${(adjRel * 100).toFixed(4)}%.`,
        };
      }
    }
  }

  return null;
}

/**
 * Main sweep entry point for direct lunar & stellar hits.
 * Audits all non-ordinary LeyLine hits against Mona's get_damage_analysis direct_* branches.
 */
export async function runDirectSpecialHitsMode(options = {}, shared = null) {
  const started = Date.now();
  const ctx = shared ?? createFallbackShared();
  const [{ api, read }, engine] = await Promise.all([
    ctx.getMonaRuntime(),
    ctx.getEngine(),
  ]);
  const monaChars = ctx.getMonaChars ? ctx.getMonaChars() : read('src/assets/_gen_character.js');
  const labels = read('src/i18n/generated/zh-cn.json');
  const { entityToMona } = buildCharacterMonaMaps();

  const filterSet = normalizeFilter(options);
  const { charIds, hits } = discoverLeylineSpecialHits(filterSet, options?.limit ?? null);

  if (!charIds.length) {
    return {
      mode: 'direct-special-hits',
      elapsedMs: Date.now() - started,
      summary: {
        characters: 0,
        totalLeylineSpecialHits: 0,
        totalSpecialHitCases: 0,
        matchedPairs: 0,
        damageMatched: 0,
        damageMismatch: 0,
        trueSuspectMismatch: 0,
        knownArtifact: 0,
        unmatchedLeylineHits: 0,
        unknownOnLeyline: 0,
        probeErrors: 0,
      },
      mismatches: [],
      knownArtifacts: [],
      unmatchedLeylineHits: [],
      unknownOnLeyline: [],
      probeErrors: [],
      matched: [],
    };
  }

  // Load scoped LeyLine entities
  const catalog = await createRuntimeCatalog({
    characters: charIds,
    weapons: Object.values(novice),
    sets: [],
    actions: [],
  });
  const characterDocs = new Map();
  for (const cid of charIds) characterDocs.set(cid, await catalog.get('characters', cid));
  const weaponDocs = new Map();
  for (const wid of Object.values(novice)) weaponDocs.set(wid, await catalog.get('weapons', wid));

  const probeErrors = [];
  const unmatchedLeylineHits = [];
  const unknownOnLeyline = [];
  const mismatches = [];
  const knownArtifacts = [];
  const matched = [];

  // Probe Mona direct skills per character once
  const monaDirectByChar = new Map();
  for (const cid of charIds) {
    const monaKey = entityToMona.get(cid);
    const monaChar = monaKey ? monaChars[monaKey] : null;
    if (!monaKey || !monaChar) {
      probeErrors.push({ entity: cid, error: `Missing Mona character mapping for ${cid}` });
      monaDirectByChar.set(cid, { monaKey: null, monaChar: null, directSkills: [] });
      continue;
    }
    const probed = await probeCharacterMonaDirectSkills(api, monaKey, monaChar, labels);
    probeErrors.push(...probed.probeErrors.map(e => ({ entity: cid, ...e })));
    monaDirectByChar.set(cid, { monaKey, monaChar, directSkills: probed.directSkills });
  }

  let totalSpecialHitCases = 0;

  for (const hitEntry of hits) {
    const cid = hitEntry.characterId;
    const character = characterDocs.get(cid);
    const weapon = weaponDocs.get(novice[character.identity.weaponType]);
    const monaInfo = monaDirectByChar.get(cid);

    for (const family of hitEntry.families) {
      totalSpecialHitCases++;
      const famSpec = FAMILY_SPECS[family];

      if (!monaInfo?.monaKey || !monaInfo?.monaChar) {
        unmatchedLeylineHits.push({
          entity: cid,
          hitId: hitEntry.hitId,
          leylineField: hitEntry.field,
          name: hitEntry.name,
          family,
          reason: 'missing-mona-character',
        });
        continue;
      }

      const match = matchLeylineHitToMonaSkill(hitEntry, family, monaInfo.directSkills);
      if (!match) {
        unmatchedLeylineHits.push({
          entity: cid,
          monaKey: monaInfo.monaKey,
          hitId: hitEntry.hitId,
          leylineField: hitEntry.field,
          name: hitEntry.name,
          family,
          minConstellation: hitEntry.minConstellation,
          reason: 'no-matching-mona-direct-skill',
          availableMonaDirectSkills: monaInfo.directSkills
            .filter(s => s.family === family)
            .map(s => ({ index: s.index, label: s.label })),
        });
        continue;
      }

      const requiredConstellation = hitEntry.minConstellation;
      const talentBonuses = computeConstellationTalentBonuses(character, requiredConstellation);

      try {
        // 1. Scaling comparison at T1 and T10
        const scalingResults = {};
        for (const tLevel of [1, 10]) {
          const ley = evaluateLeylineSpecialHit({
            engine,
            character,
            weapon,
            hitEntry,
            family,
            talentLevel: tLevel,
            constellation: requiredConstellation,
          });
          if (!ley.ok) {
            scalingResults[`T${tLevel}`] = { ok: false, error: ley.error };
            continue;
          }
          const monaEval = evaluateMonaDirectHit({
            api,
            monaKey: monaInfo.monaKey,
            monaChar: monaInfo.monaChar,
            skillIndex: match.skill.index,
            family,
            talentLevel: tLevel,
            constellation: requiredConstellation,
            talentBonuses,
            monaParamOverrides: match.monaParamOverrides,
            predFacts: ley.predFacts,
            alignToLeylinePanel: ley.panel,
          });
          const monaBd = extractMonaDirectBreakdown(monaEval.analysis, famSpec, ley.primaryAxis);
          const monaRatio = monaBd.effectiveRatioWithExtra;
          const leyRatio = ley.effectiveRatio;
          const rErr = relError(monaRatio, leyRatio);
          const rMatch = Number.isFinite(monaRatio) && Number.isFinite(leyRatio)
            && (Math.abs(monaRatio - leyRatio) <= 0.0006 || (rErr != null && rErr <= RATIO_REL_TOLERANCE));
          scalingResults[`T${tLevel}`] = {
            ok: true,
            leylineRatio: leyRatio,
            monaRatio,
            monaBaseRatio: monaBd.ratio,
            monaBaseMultiplier: monaBd.baseMultiplier,
            monaExtraDamage: monaBd.extraDamage,
            relError: rErr,
            matched: rMatch,
            _ley: ley,
            _monaEval: monaEval,
            _monaBd: monaBd,
          };
        }

        const t10 = scalingResults.T10;
        const t1 = scalingResults.T1;
        if (!t10?.ok) {
          probeErrors.push({
            entity: cid,
            hitId: hitEntry.hitId,
            family,
            monaSkill: `mona:skill:${monaInfo.monaKey}:${match.skill.index}`,
            error: t10?.error ?? 'T10 evaluation failed',
          });
          continue;
        }

        const ley10 = t10._ley;
        const monaEval10 = t10._monaEval;
        const monaBd10 = t10._monaBd;

        if (ley10.damage == null || ley10.requiredInputs.length > 0) {
          unknownOnLeyline.push({
            entity: cid,
            monaKey: monaInfo.monaKey,
            monaSkill: `mona:skill:${monaInfo.monaKey}:${match.skill.index}`,
            monaLabel: match.skill.label,
            hitId: hitEntry.hitId,
            leylineField: hitEntry.field,
            name: hitEntry.name,
            family,
            constellation: requiredConstellation,
            requiredInputs: ley10.requiredInputs,
            monaDamage: monaBd10.damage,
          });
          continue;
        }

        const dmgErr = relError(monaBd10.damage, ley10.damage);
        const elementMatch = monaBd10.element === String(ley10.element ?? '').toLowerCase();
        const scalingAllMatched = Boolean(t1?.matched) && Boolean(t10?.matched);
        const dmgMatched = Number.isFinite(monaBd10.damage)
          && Number.isFinite(ley10.damage)
          && (Math.abs(monaBd10.damage - ley10.damage) <= 1e-4 || (dmgErr != null && dmgErr <= REL_TOLERANCE));
        const noLargePanelDiff = Object.keys(monaEval10.unalignedPanelDiffs).length === 0;

        const baseRecord = {
          entity: cid,
          monaKey: monaInfo.monaKey,
          monaSkill: `mona:skill:${monaInfo.monaKey}:${match.skill.index}`,
          monaIndex: match.skill.index,
          monaLabel: match.skill.label,
          matchMethod: match.matchMethod,
          hitId: hitEntry.hitId,
          leylineField: hitEntry.field,
          name: hitEntry.name,
          family,
          monaBranch: famSpec.monaBranch,
          constellation: requiredConstellation,
          element: { mona: monaBd10.element, leyline: String(ley10.element ?? '').toLowerCase(), matched: elementMatch },
          scaling: {
            T1: t1?.ok ? { leyline: t1.leylineRatio, mona: t1.monaRatio, relError: t1.relError, matched: t1.matched } : { error: t1?.error },
            T10: { leyline: t10.leylineRatio, mona: t10.monaRatio, relError: t10.relError, matched: t10.matched },
          },
          damage: {
            mona: monaBd10.damage,
            leyline: ley10.damage,
            absDiff: Number.isFinite(monaBd10.damage) && Number.isFinite(ley10.damage) ? Math.abs(monaBd10.damage - ley10.damage) : null,
            relError: dmgErr,
            matched: dmgMatched,
          },
          panelAdjustments: monaEval10.panelAdjustments,
          unalignedPanelDiffs: monaEval10.unalignedPanelDiffs,
          breakdown: {
            mona: {
              ratio: monaBd10.ratio,
              effectiveRatioWithExtra: monaBd10.effectiveRatioWithExtra,
              baseMultiplier: monaBd10.baseMultiplier,
              baseBonus: monaBd10.baseBonus,
              baseBonusSources: monaBd10.baseBonusSources,
              composeBonus: monaBd10.composeBonus,
              composeSources: monaBd10.composeSources,
              extraDamage: monaBd10.extraDamage,
              extraDamageSources: monaBd10.extraDamageSources,
              extraFixed: monaBd10.extraFixed,
              elevationFactor: monaBd10.elevationFactor,
              elevateSources: monaBd10.elevateSources,
              resMinus: monaBd10.resMinus,
              panel: monaBd10.panel,
            },
            leyline: {
              ...ley10.breakdown,
              panel: ley10.panel,
            },
          },
        };

        if (dmgMatched && elementMatch && scalingAllMatched && noLargePanelDiff) {
          matched.push(baseRecord);
        } else {
          const artifact = classifyKnownArtifact({
            characterId: cid,
            hitId: hitEntry.hitId,
            family,
            constellation: requiredConstellation,
            ratioT1: t1,
            ratioT10: t10,
            damageRelError: dmgErr,
            elementMatch,
            monaBreakdown: monaBd10,
            leylineBreakdown: { ...ley10.breakdown, damage: ley10.damage },
            unalignedPanelDiffs: monaEval10.unalignedPanelDiffs,
          });
          if (artifact) {
            knownArtifacts.push({ ...baseRecord, knownMonaArtifact: artifact });
          } else {
            mismatches.push({ ...baseRecord, knownMonaArtifact: null });
          }
        }
      } catch (error) {
        probeErrors.push({
          entity: cid,
          hitId: hitEntry.hitId,
          family,
          monaSkill: `mona:skill:${monaInfo.monaKey}:${match.skill.index}`,
          error: String(error?.stack ?? error?.message ?? error),
        });
      }
    }
  }

  const matchedPairs = matched.length + mismatches.length + knownArtifacts.length + unknownOnLeyline.length;
  return {
    mode: 'direct-special-hits',
    elapsedMs: Date.now() - started,
    summary: {
      characters: charIds.length,
      totalLeylineSpecialHits: hits.length,
      totalSpecialHitCases,
      matchedPairs,
      damageMatched: matched.length,
      damageMismatch: mismatches.length + knownArtifacts.length,
      trueSuspectMismatch: mismatches.length,
      knownArtifact: knownArtifacts.length,
      unmatchedLeylineHits: unmatchedLeylineHits.length,
      unknownOnLeyline: unknownOnLeyline.length,
      probeErrors: probeErrors.length,
    },
    mismatches,
    knownArtifacts,
    unmatchedLeylineHits,
    unknownOnLeyline,
    probeErrors,
    matched,
  };
}

function fmtNum(v) {
  if (v == null || !Number.isFinite(v)) return 'null';
  if (Math.abs(v) >= 100) return v.toFixed(2);
  return v.toFixed(6);
}

/** Render markdown summary for direct-special-hits report (for summary.md). */
export function renderDirectSpecialHitsSummaryMarkdown(report) {
  if (!report) return '';
  const s = report.summary;
  const lines = [
    `## direct-special-hits — 月曜/星辉直伤对账（角色: ${s.characters}，LeyLine 特殊段: ${s.totalLeylineSpecialHits}，展开家族用例: ${s.totalSpecialHitCases ?? s.matchedPairs}）`,
    '',
    `- 匹配对数：${s.matchedPairs}（完全一致: **${s.damageMatched}**，疑似真差异: **${s.trueSuspectMismatch}**，已知 Mona 误差/差异: ${s.knownArtifact}，LeyLine 未知: ${s.unknownOnLeyline}）`,
    `- 未匹配 LeyLine 特殊段：${s.unmatchedLeylineHits}，探针报错：${s.probeErrors}，耗时：${report.elapsedMs} ms`,
    '',
  ];

  if (report.mismatches?.length) {
    lines.push(
      '### 疑似真差异 (Suspect Mismatches)',
      '',
      '| 角色 | Hit ID | 家族 | 命座 | Mona Skill | T10 倍率 (M / LL) | T10 直伤 (M / LL) | 相对误差 | 关键分项差异 |',
      '| --- | --- | --- | ---: | --- | --- | --- | ---: | --- |',
    );
    for (const m of report.mismatches) {
      const notes = [];
      if (!m.element.matched) notes.push(`elem:${m.element.mona}!=${m.element.leyline}`);
      if (!m.scaling.T10.matched) notes.push('ratio-T10');
      if (m.scaling.T1 && !m.scaling.T1.matched) notes.push('ratio-T1');
      if (Object.keys(m.unalignedPanelDiffs ?? {}).length) {
        notes.push(`panel:${Object.keys(m.unalignedPanelDiffs).join(',')}`);
      }
      const mb = m.breakdown?.mona;
      const lb = m.breakdown?.leyline;
      if (mb && lb) {
        if (Math.abs((mb.baseBonus ?? 0) - (lb.baseBonus ?? 0)) > 1e-4) {
          notes.push(`baseBonus:${mb.baseBonus.toFixed(4)}/${lb.baseBonus.toFixed(4)}`);
        }
        if (Math.abs((mb.extraDamage ?? 0)) > 1e-4) {
          notes.push(`monaExtraDmg:${mb.extraDamage.toFixed(2)}`);
        }
        if (Math.abs((mb.extraFixed ?? 0) - (lb.flatBaseBonus ?? 0)) > 1e-4) {
          notes.push(`flat:${mb.extraFixed.toFixed(2)}/${lb.flatBaseBonus.toFixed(2)}`);
        }
        if (Math.abs((mb.elevationFactor ?? 1) - (lb.elevationFactor ?? 1)) > 1e-4) {
          notes.push(`elev:${mb.elevationFactor.toFixed(3)}/${lb.elevationFactor.toFixed(3)}`);
        }
      }
      lines.push(
        `| \`${m.entity}\` | \`${m.hitId}\` | \`${m.family}\` | C${m.constellation} | \`${m.monaSkill}\` (${m.monaLabel}) | ${fmtNum(m.scaling.T10.mona)} / ${fmtNum(m.scaling.T10.leyline)} | ${fmtNum(m.damage.mona)} / ${fmtNum(m.damage.leyline)} | ${m.damage.relError != null ? `${(m.damage.relError * 100).toFixed(3)}%` : 'n/a'} | ${notes.join('; ') || '-'} |`,
      );
    }
    lines.push('');
  } else {
    lines.push('- 无高优先级疑似真差异。', '');
  }

  if (report.knownArtifacts?.length) {
    lines.push(`<details><summary>已知 Mona 误差 / 简化差异 (${report.knownArtifacts.length} 条)</summary>`, '');
    for (const a of report.knownArtifacts) {
      lines.push(`- \`${a.entity}\` \`${a.hitId}\` (${a.family}, C${a.constellation}) vs \`${a.monaSkill}\`: [${a.knownMonaArtifact.kind}] ${a.knownMonaArtifact.note}`);
    }
    lines.push('', '</details>', '');
  }

  if (report.unmatchedLeylineHits?.length) {
    lines.push(`<details><summary>未匹配到 Mona 技能的 LeyLine 特殊段 (${report.unmatchedLeylineHits.length} 条)</summary>`, '');
    for (const u of report.unmatchedLeylineHits) {
      lines.push(`- \`${u.entity}\` \`${u.hitId}\` (${u.name}, \`${u.family}\`, C${u.minConstellation ?? 0}): ${u.reason}`);
    }
    lines.push('', '</details>', '');
  }

  if (report.unknownOnLeyline?.length) {
    lines.push(`<details><summary>LeyLine 评估为 Unknown (${report.unknownOnLeyline.length} 条)</summary>`, '');
    for (const u of report.unknownOnLeyline) {
      lines.push(`- \`${u.entity}\` \`${u.hitId}\` (${u.family}): requiredInputs=\`${JSON.stringify(u.requiredInputs)}\``);
    }
    lines.push('', '</details>', '');
  }

  if (report.probeErrors?.length) {
    lines.push(`<details><summary>探针 / 执行报错 (${report.probeErrors.length} 条)</summary>`, '');
    for (const e of report.probeErrors) {
      lines.push(`- \`${e.entity ?? e.character}\` ${e.hitId ?? e.monaSkill ?? `idx=${e.index}`}: ${e.error}`);
    }
    lines.push('', '</details>', '');
  }

  return lines.join('\n') + '\n';
}
