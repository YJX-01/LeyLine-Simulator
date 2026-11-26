import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeCatalog } from './runtime-catalog.mjs';
import { probeMonaSkills } from './mona-inventory-probes.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';
import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REL_TOLERANCE = 0.0001; // 0.01%
const ABS_TOLERANCE = 1e-5;
const ENEMY_BASE_RES = 0.1;
const ENEMY_BASE_RES_FACTOR = 1 - ENEMY_BASE_RES; // 0.9

const sum = obj => Object.values(obj ?? {}).reduce((a, b) => a + b, 0);
const relError = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) / Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)));
};
const isNear = (a, b, relTol = REL_TOLERANCE, absTol = ABS_TOLERANCE) =>
  Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= Math.max(absTol, Math.max(Math.abs(a), Math.abs(b)) * relTol);

const TRANSFORMATIVE_KEYS = [
  'bloom', 'hyperbloom', 'burgeon', 'burning', 'overload', 'electro_charged',
  'superconduct', 'shatter', 'swirl_cryo', 'swirl_hydro', 'swirl_pyro', 'swirl_electro',
];

const WEAPON_DEFAULT_CARRIER = {
  WEAPON_SWORD_ONE_HAND: 'kaeya',
  WEAPON_BOW: 'amber',
  WEAPON_CATALYST: 'lisa',
  WEAPON_CLAYMORE: 'noelle',
  WEAPON_POLE: 'xiangling',
};

const RECIPIENT_MONA_HIT = {
  'kaeya:physical': { monaChar: 'Kaeya', skillIndex: 0, element: 'physical', category: 'normal', hitId: 'kaeya.normal.param1' },
  'kaeya:cryo': { monaChar: 'Kaeya', skillIndex: 10, element: 'cryo', category: 'skill', hitId: 'kaeya.skill.param1' },
  'amber:pyro': { monaChar: 'Amber', skillIndex: 6, element: 'pyro', category: 'charged', hitId: 'amber.normal.param7' },
  'barbara:hydro': { monaChar: 'Barbara', skillIndex: 0, element: 'hydro', category: 'normal', hitId: 'barbara.normal.param1' },
  'lisa:electro': { monaChar: 'Lisa', skillIndex: 0, element: 'electro', category: 'normal', hitId: 'lisa.normal.param1' },
  'noelle:geo': { monaChar: 'Noelle', skillIndex: 7, element: 'geo', category: 'skill', hitId: 'noelle.skill.param1' },
  'sucrose:anemo': { monaChar: 'Sucrose', skillIndex: 0, element: 'anemo', category: 'normal', hitId: 'sucrose.normal.param1' },
  'collei:dendro': { monaChar: 'Collei', skillIndex: 9, element: 'dendro', category: 'skill', hitId: 'collei.skill.param1' },
  'aether-cryo:cryo': { monaChar: 'AetherCryo', skillIndex: 0, element: 'physical', category: 'normal' },
  'vesna:stellarswirl': { monaChar: 'Vesna', skillIndex: 17, element: 'anemo', category: 'skill', hitId: 'vesna.skill.param5', monaCharParams: { radiance: true, stance: true } },
};

// ---------------------------------------------------------------------------
// Helpers: LeyLine context & attribute evaluation
// ---------------------------------------------------------------------------
function setSubjectFacts(frame, subject, values, factsDecl) {
  if (!values || !Object.keys(values).length) return;
  let row = frame.factOverrides.find(r => r.subject.kind === subject.kind && r.subject.id === subject.id);
  if (!row) frame.factOverrides.push(row = { subject, facts: {} });
  for (const [key, val] of Object.entries(values)) {
    const decl = combatFactDeclaration(factsDecl, key);
    if (typeof val === 'boolean') row.facts[key] = bool(val);
    else if (typeof val === 'number') row.facts[key] = number(decl?.type?.unit ?? 'scalar', val);
    else row.facts[key] = { value: { kind: 'enum', value: String(val) }, provenance: 'explicit', sourceRefs: [] };
  }
}

function makeSyntheticArtifacts(spec, placeholderSet) {
  if (!spec || !placeholderSet) return { sets: [], artifacts: [] };
  const slots = ['flower', 'plume', 'sands', 'goblet', 'circlet'];
  const artifacts = [];
  if (spec.em) {
    // Spread synthetic EM across 5-star sands/goblet/circlet or flower substats
    artifacts.push({
      id: 'synth-em',
      setId: placeholderSet.id,
      slot: 'sands',
      rarity: 5,
      level: 20,
      mainStat: 'elementalMastery',
      inventory: null,
      sourceRefs: [],
      substats: spec.em > 187 ? [{ stat: 'elementalMastery', value: spec.em - 186.5 }] : [],
    });
    if (spec.em > 350) {
      artifacts.push({
        id: 'synth-em-2',
        setId: placeholderSet.id,
        slot: 'goblet',
        rarity: 5,
        level: 20,
        mainStat: 'elementalMastery',
        inventory: null,
        sourceRefs: [],
        substats: [],
      });
      artifacts[0].substats = [];
    }
    if (spec.em > 550) {
      artifacts.push({
        id: 'synth-em-3',
        setId: placeholderSet.id,
        slot: 'circlet',
        rarity: 5,
        level: 20,
        mainStat: 'elementalMastery',
        inventory: null,
        sourceRefs: [],
        substats: [],
      });
    }
  }
  if (spec.hp) {
    // 5-star flower (4780) + 3x hpPercent main stats (+139.8% HP) + flat HP substats
    const mainStats = ['hp', 'attack', 'hpPercent', 'hpPercent', 'hpPercent'];
    for (let i = 0; i < slots.length; i++) {
      artifacts.push({
        id: `synth-hp-${i}`,
        setId: placeholderSet.id,
        slot: slots[i],
        rarity: 5,
        level: 20,
        mainStat: mainStats[i],
        inventory: null,
        sourceRefs: [],
        substats: mainStats[i] === 'hpPercent' ? [{ stat: 'hp', value: 1000 }] : [{ stat: 'hpPercent', value: 0.3 }],
      });
    }
  }
  return { sets: artifacts.length ? [placeholderSet] : [], artifacts };
}

function readLeylineBinding(engine, team, setup, frame, targetId) {
  const context = engine.createStructuredCombatContext(team, setup);
  const binding = targetId.startsWith('target.')
    ? { kind: 'enemy', key: { namespace: 'builtin', id: targetId, revision: '1' }, at: { kind: 'current', phase: 'same' } }
    : { kind: 'attribute', actor: { role: 'recipient' }, key: { namespace: 'builtin', id: targetId, revision: '1' }, at: { kind: 'current', phase: 'same' } };
  const evaluated = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame);
  const out = evaluated.outputs.value;
  return {
    value: out?.state === 'known' ? out.value.value : null,
    state: out?.state ?? 'missing',
    diagnostics: evaluated.diagnostics ?? [],
  };
}

function buildHitFrame(recipientChar, actorId, hitSpec) {
  let talent = recipientChar.talents[0];
  let hit = talent.hits[0];
  if (hitSpec.hitId) {
    for (const t of recipientChar.talents) {
      const found = t.hits.find(h => h.id === hitSpec.hitId);
      if (found) { talent = t; hit = found; break; }
    }
  } else if (hitSpec.category) {
    for (const t of recipientChar.talents) {
      const found = t.hits.find(h => (h.category ?? t.category) === hitSpec.category);
      if (found) { talent = t; hit = found; break; }
    }
  } else if (hitSpec.element) {
    for (const t of recipientChar.talents) {
      const found = t.hits.find(h => (h.element ?? t.element) === hitSpec.element);
      if (found) { talent = t; hit = found; break; }
    }
  }
  const { setup, request } = auditHit(recipientChar, talent, hit, 90);
  setup.events.find(e => e.id === 'hit').actorId = actorId;
  Object.assign(request.frame, {
    ownerId: actorId,
    recipientId: actorId,
    contributorId: null,
    hit: {
      skillId: hitSpec.skillId ?? talent.id,
      hitId: hitSpec.hitId ?? hit.id,
      category: hitSpec.category ?? hit.category ?? talent.category,
      element: hitSpec.element ?? hit.element ?? talent.element,
      origin: hitSpec.origin ?? hit.origin ?? 'talent',
      family: hitSpec.family ?? hit.family ?? 'ordinary',
      reactionId: hitSpec.reactionId ?? null,
    },
  });
  return { setup, request };
}

// ---------------------------------------------------------------------------
// Helpers: Mona probing across attribute, damage_analysis, and transformative
// ---------------------------------------------------------------------------
function readMonaBaseStat(attrPanel, baseKind) {
  if (baseKind === 'attack') return (attrPanel.atk?.['角色基础攻击'] ?? 0) + (attrPanel.atk?.['武器基础攻击'] ?? 0);
  if (baseKind === 'hp') return attrPanel.hp?.['角色基础生命'] ?? 0;
  if (baseKind === 'defense') return attrPanel.def?.['角色基础防御'] ?? 0;
  return 1;
}

function sampleMonaAll(api, input) {
  const attr = api.CommonInterface.get_attribute(input);
  const dmg = api.CalculatorInterface.get_damage_analysis(input, null);
  const trRaw = api.CalculatorInterface.get_transformative_damage(input);
  const tr = {};
  for (const k of TRANSFORMATIVE_KEYS) tr[k] = trRaw[k];
  trRaw.free?.();
  return { attr, dmg, tr };
}

function readMonaChannelDelta(before, after, monaRead) {
  if (monaRead.kind === 'attribute') {
    const raw = sum(after.attr[monaRead.field]) - sum(before.attr[monaRead.field]);
    if (monaRead.base) {
      const base = readMonaBaseStat(before.attr, monaRead.base);
      return base > 0 ? raw / base : 0;
    }
    return raw * (monaRead.sign ?? 1);
  }
  if (monaRead.kind === 'damage') {
    const fields = Array.isArray(monaRead.fields) ? monaRead.fields : [monaRead.field];
    let total = 0;
    for (const f of fields) {
      total += sum(after.dmg[f]) - sum(before.dmg[f]);
    }
    return total * (monaRead.sign ?? 1);
  }
  if (monaRead.kind === 'echoes-atk-ratio') {
    const ratioDelta = sum(after.dmg.atk_ratio) - sum(before.dmg.atk_ratio);
    const atkBefore = sum(before.attr.atk);
    return ratioDelta * atkBefore;
  }
  if (monaRead.kind === 'transformative-bonus') {
    const b = before.tr[monaRead.trKey];
    const a = after.tr[monaRead.trKey];
    if (!Number.isFinite(b) || b <= 0 || !Number.isFinite(a)) return null;
    const emBefore = sum(before.attr.elemental_mastery);
    const emBonus = (16 * emBefore) / (2000 + emBefore);
    return (a / b - 1) * (1 + emBonus);
  }
  if (monaRead.kind === 'transformative-flat') {
    const b = before.tr[monaRead.trKey];
    const a = after.tr[monaRead.trKey];
    if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
    return (a - b) / ENEMY_BASE_RES_FACTOR;
  }
  if (monaRead.kind === 'transformative-expected-crit') {
    const b = before.tr[monaRead.trKey];
    const a = after.tr[monaRead.trKey];
    if (!Number.isFinite(b) || b <= 0 || !Number.isFinite(a)) return null;
    return a / b - 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Known Mona artifacts annotator (reaction & blind-spot domain)
// ---------------------------------------------------------------------------
function annotateReactionArtifact({ key, entity, channel, monaDelta, leylineDelta, customArtifact, usedRoundInt }) {
  if (customArtifact) return customArtifact;
  if (key === 'FurinaQ' && channel.includes('HealingBonus')) {
    return {
      kind: 'mona-furina-q-healing-bonus-bug',
      note: 'Known Mona bug: FurinaQ writes healing_bonus instead of incoming_healing_bonus.',
    };
  }
  if (key === 'BaizhuTalent2') {
    if (channel.includes('transformative')) {
      return {
        kind: 'mona-baizhu-talent2-10x-bug',
        note: 'Known Mona bug: BaizhuTalent2 uses 0.002/1000 HP (0.2%) instead of official 0.02/1000 HP (2%) for Burning/Bloom/Hyperbloom/Burgeon.',
      };
    }
    if (channel.includes('lunar-bloom')) {
      return {
        kind: 'mona-baizhu-talent2-wrong-lunar-channel',
        note: 'Known Mona bug: BaizhuTalent2 writes EnhanceMoonelectro instead of EnhanceMoonbloom.',
      };
    }
  }
  if (key === 'NilouTalent2') {
    return {
      kind: 'mona-nilou-a4-floor-bug',
      note: 'Confirmed Mona bug: NilouTalent2 uses floor((hp - 30000) / 1000) * 0.09 (mona_core nilou.rs:48), whereas in-game Genshin Nilou A4 scales continuously (0.009% per HP above 30,000, reaching 400% cap at 74,444.44 HP).',
    };
  }
  if (key === 'DionaC6StellarConduct' && channel.includes('stellar-conduct')) {
    return {
      kind: 'mona-diona-c6-stellar-conduct-field',
      note: 'Mona DionaC6StellarConduct declares StellarSwirlBonus and writes direct_stellarconduct_compose + direct_stellarswirl_compose unconditionally without radiance split.',
    };
  }
  if (usedRoundInt && Number.isFinite(monaDelta) && Number.isFinite(leylineDelta) && Math.abs(leylineDelta) > 1e-9) {
    const rel = Math.abs(monaDelta - leylineDelta) / Math.max(Math.abs(monaDelta), Math.abs(leylineDelta));
    if (rel <= 0.005) {
      return {
        kind: 'mona-int-param-rounding',
        note: `Mona parameter is integer-typed (rel=${(rel * 100).toFixed(4)}%), rounding owner stat by <=0.5.`,
      };
    }
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
  return null;
}

// ---------------------------------------------------------------------------
// Declarative Audit Catalog (all reaction, lunar, stellar, & Stage-2 blind spots)
// ---------------------------------------------------------------------------
function buildReactionCases() {
  const cases = [];
  const add = spec => cases.push(spec);

  // =========================================================================
  // 1. Character Reaction / Lunar / Stellar Buffs (~35 reaction-or-flag items)
  // =========================================================================
  add({
    key: 'AetherCryoC6', kind: 'character', entity: 'aether-cryo', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { cold_glow_consumed: 8, effect_active: true },
    gates: { 'aether-cryo.frostglowSpent': 8 },
    event: { kind: 'action', actorId: 'actor', skillId: 'aether-cryo.burst', targetIds: [] },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'AetherCryoTalent1', kind: 'character', entity: 'aether-cryo', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { radiance_mode: 1 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.baseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_base_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.baseBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaParamsOverride: { radiance_mode: 2 },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_base_compose' },
      },
    ],
  });

  add({
    key: 'AinoC6', kind: 'character', entity: 'aino', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    extraCharacters: ['flins'], // fullMoonsign active (aino + flins)
    monaParams: { full_moon: true, recipient_on_field: true },
    event: { kind: 'action', actorId: 'actor', skillId: 'aino.burst', targetIds: [] },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[electro-charged]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'electro-charged', element: 'electro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'electro_charged' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'bloom' },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['direct_moonelectro_compose', 'enhance_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['direct_moonbloom_compose', 'enhance_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', fields: ['direct_mooncrystallize_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'BaizhuTalent2', kind: 'character', entity: 'baizhu', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    ownerArtifacts: { hp: true },
    injectOwnerStat: { stat: 'hp', monaParam: 'hp', cap: 50000 },
    monaParams: { rate: 1 },
    recipientGates: { 'baizhu.gossamerShieldTreated': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'bloom' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[hyperbloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'hyperbloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'hyperbloom' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[burning]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'burning', element: 'pyro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'burning' },
      },
      {
        channel: 'attribute.additiveReactionBonus[spread]',
        leylineTarget: 'attribute.additiveReactionBonus',
        hit: { family: 'ordinary', reactionId: 'spread', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'spread_compose' },
      },
      {
        channel: 'attribute.additiveReactionBonus[aggravate]',
        leylineTarget: 'attribute.additiveReactionBonus',
        hit: { family: 'ordinary', reactionId: 'aggravate', element: 'electro' },
        monaRead: { kind: 'damage', field: 'aggravate_compose' },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['direct_moonbloom_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'ColumbinaConstellation', kind: 'character', entity: 'columbina', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'constellation-0',
    monaParams: { constellation: 6 },
    channels: [
      {
        channel: 'attribute.reaction.lunar.elevationFactor[lunar-charged,C6]',
        leylineTarget: 'attribute.reaction.lunar.elevationFactor',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['elevate_moonelectro_compose', 'elevate_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.elevationFactor[lunar-bloom,C6]',
        leylineTarget: 'attribute.reaction.lunar.elevationFactor',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['elevate_moonbloom_compose', 'elevate_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.elevationFactor[lunar-crystallize,C6]',
        leylineTarget: 'attribute.reaction.lunar.elevationFactor',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', fields: ['elevate_mooncrystallize_compose', 'elevate_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'ColumbinaP1', kind: 'character', entity: 'columbina', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    ownerArtifacts: { hp: true },
    injectOwnerStat: { stat: 'hp', monaParam: 'hp', cap: 35000 },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', field: 'moonelectro_base_compose' },
      },
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'moonbloom_base_compose' },
      },
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', field: 'mooncrystallize_base_compose' },
      },
    ],
  });

  add({
    key: 'ColumbinaQ', kind: 'character', entity: 'columbina', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    talentLevel: 10,
    monaParams: { level: 10, domain_active: true },
    gates: { 'columbina.moonDomain': true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['direct_moonelectro_compose', 'enhance_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['direct_moonbloom_compose', 'enhance_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', fields: ['direct_mooncrystallize_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'CynoC2StellarConduct', kind: 'character', entity: 'cyno', group: 'reaction-buff',
    rank: 2, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { stack: 5, effect_active: true },
    gates: { radiance: 'stellar-conduct' },
    recipientGates: { 'cyno.togetherWeRise': true, 'cyno.c2StellarConductStacks': 5 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
    ],
  });

  add({
    key: 'DionaC6StellarConduct', kind: 'character', entity: 'diona', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: {},
    gates: { 'diona.revelationUnlocked': true },
    recipientGates: { 'diona.signatureMixArea': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[superconduct]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        gatesOverride: { radiance: 'stellar-conduct' },
        hit: { family: 'transformative', reactionId: 'superconduct', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'superconduct' },
      },
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        gatesOverride: { radiance: 'stellar-conduct' },
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[swirl_cryo]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        gatesOverride: { radiance: 'stellar-swirl' },
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'swirl_cryo' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        gatesOverride: { radiance: 'stellar-swirl' },
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'FlinsC6', kind: 'character', entity: 'flins', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    extraCharacters: ['aino'],
    beforeMode: 'constellation-0',
    monaParams: { full_moon: true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.elevationFactor[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.elevationFactor',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['elevate_moonelectro_compose', 'elevate_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'FlinsTalent1', kind: 'character', entity: 'flins', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', field: 'moonelectro_base_compose' },
      },
    ],
  });

  add({
    key: 'IfaTalent2', kind: 'character', entity: 'ifa', group: 'reaction-buff',
    rank: 2, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { rescue_essentials: 200, effect_active: true },
    gates: { 'ifa.rescueNightsoulBlessing': true },
    recipientGates: { 'ifa.rescueRecipient': true },
    teamGates: { 'ifa.rescueTeamNightsoul': 200 },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[swirl]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'swirl_cryo' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[electro-charged]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'electro-charged', element: 'electro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'electro_charged' },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['direct_moonelectro_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'IneffaMoonelectroRelay', kind: 'character', entity: 'ineffa', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', field: 'moonelectro_base_compose' },
      },
    ],
  });

  add({
    key: 'KavehQ', kind: 'character', entity: 'kaveh', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    talentLevel: 10,
    monaParams: { q_level: 10, rate: 1 },
    gates: { 'kaveh.painting': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'bloom' },
      },
    ],
  });

  add({
    key: 'LaumaC6', kind: 'character', entity: 'lauma', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    extraCharacters: ['aino'],
    beforeMode: 'constellation-0',
    monaParams: { full_moon: true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.elevationFactor[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.elevationFactor',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['elevate_moonbloom_compose', 'elevate_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'LaumaTalent1', kind: 'character', entity: 'lauma', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em', cap: 800 },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'moonbloom_base_compose' },
      },
    ],
  });

  add({
    key: 'LinneaC1', kind: 'character', entity: 'linnea', group: 'reaction-buff',
    rank: 1, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'defense', monaParam: 'def' },
    monaParams: { c6: false, stacks_available: 18, hit_mode: 0, nuke_stacks: 5 },
    queryFacts: { 'linnea.catalogueConsumeReady': true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.flatBaseBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.flatBaseBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', field: 'direct_mooncrystallize_extra_fixed' },
      },
    ],
  });

  add({
    key: 'LinneaC6', kind: 'character', entity: 'linnea', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    extraCharacters: ['aino'],
    beforeMode: 'constellation-0',
    monaParams: { full_moon: true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.elevationFactor[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.elevationFactor',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', fields: ['elevate_mooncrystallize_compose', 'elevate_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'LinneaTalent1', kind: 'character', entity: 'linnea', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'defense', monaParam: 'def' },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', field: 'mooncrystallize_base_compose' },
      },
    ],
  });

  add({
    key: 'MonaC1', kind: 'character', entity: 'mona', group: 'reaction-buff',
    rank: 1, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { off_field: false },
    gates: { 'mona.c1Prophecy': true },
    channels: [
      {
        channel: 'attribute.amplifyingReactionBonus[vaporize]',
        leylineTarget: 'attribute.amplifyingReactionBonus',
        hit: { family: 'ordinary', reactionId: 'vaporize', element: 'hydro' },
        monaRead: { kind: 'damage', field: 'vaporize_enhance' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[electro-charged]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'electro-charged', element: 'electro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'electro_charged' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[swirl_hydro]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'swirl', element: 'hydro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'swirl_hydro' },
      },
    ],
  });

  add({
    key: 'MonaMagusGlow', kind: 'character', entity: 'mona', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { stack: 3 },
    gates: { 'mona.hexereiSecretRite': true, 'mona.magusGlowStacks': 3 },
    channels: [
      {
        channel: 'attribute.amplifyingReactionBonus[vaporize]',
        leylineTarget: 'attribute.amplifyingReactionBonus',
        hit: { family: 'ordinary', reactionId: 'vaporize', element: 'hydro' },
        monaRead: { kind: 'damage', field: 'vaporize_enhance' },
      },
    ],
  });

  add({
    key: 'NeferTalent1', kind: 'character', entity: 'nefer', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em', cap: 800 },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'moonbloom_base_compose' },
      },
    ],
  });

  add({
    key: 'NilouTalent2', kind: 'character', entity: 'nilou', group: 'reaction-buff',
    recipient: 'collei', recipientHit: 'collei:dendro',
    ownerArtifacts: { hp: true },
    injectOwnerStat: { stat: 'hp', monaParam: 'hp' },
    recipientGates: { 'nilou.goldenChalice': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'bloom' },
      },
    ],
  });

  add({
    key: 'OdetteC4SnowSwanDream', kind: 'character', entity: 'odette', group: 'reaction-buff',
    rank: 4, talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { burst_level: 10 },
    gates: { 'odette.swanDream': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'OdetteC6MarvelousSplendor', kind: 'character', entity: 'odette', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: {},
    recipientGates: { 'odette.splendorStacks': 1 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.elevation',
        leylineTarget: 'attribute.reaction.stellar-conduct.elevation',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', fields: ['elevate_stellarconduct_compose', 'elevate_stellar_glimmer_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.elevation',
        leylineTarget: 'attribute.reaction.stellar-swirl.elevation',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', fields: ['elevate_stellarswirl_compose', 'elevate_stellar_glimmer_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'OdetteMarvelousSplendor', kind: 'character', entity: 'odette', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { stacks: 4 },
    recipientGates: { 'odette.splendorStacks': 4 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'OdetteTalent1', kind: 'character', entity: 'odette', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { radiance_mode: 1 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.baseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_base_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.baseBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaParamsOverride: { radiance_mode: 2 },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_base_compose' },
      },
    ],
  });

  add({
    key: 'QiqiTalent2StellarConduct', kind: 'character', entity: 'qiqi', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: {},
    gates: { 'qiqi.heraldActive': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[superconduct]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        gatesOverride: { radiance: 'stellar-conduct' },
        hit: { family: 'transformative', reactionId: 'superconduct', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'superconduct' },
      },
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        gatesOverride: { radiance: 'stellar-conduct' },
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[swirl_cryo]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        gatesOverride: { radiance: 'stellar-swirl' },
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'swirl_cryo' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        gatesOverride: { radiance: 'stellar-swirl' },
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'SandroneC1', kind: 'character', entity: 'sandrone', group: 'reaction-buff',
    rank: 1, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: {},
    gates: { 'sandrone.analysisMode': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'SandroneTalent1', kind: 'character', entity: 'sandrone', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.baseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_base_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.baseBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_base_compose' },
      },
    ],
  });

  add({
    key: 'VesnaTalent1', kind: 'character', entity: 'vesna', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    gates: { radiance: 'none' },
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { coverage: 1 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-swirl.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.baseBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_base_compose' },
      },
    ],
  });

  add({
    key: 'YumemizukiMizukiC6', kind: 'character', entity: 'yumemizukimizuki', group: 'reaction-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: {},
    gates: { 'yumemizukimizuki.dreamdrifter': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.expectedCrit[swirl]',
        leylineTarget: '__transformative_expected_crit__',
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-expected-crit', trKey: 'swirl_cryo' },
      },
      {
        channel: 'attribute.critRate[stellar-swirl]',
        leylineTarget: 'attribute.critRate',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'critical_stellarswirl' },
      },
      {
        channel: 'attribute.critDamage[stellar-swirl]',
        leylineTarget: 'attribute.critDamage',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'critical_damage_stellarswirl' },
      },
    ],
  });

  add({
    key: 'YumemizukiMizukiE', kind: 'character', entity: 'yumemizukimizuki', group: 'reaction-buff',
    talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    monaParams: { skill_level: 10 },
    gates: { 'yumemizukimizuki.dreamdrifter': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[swirl]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'swirl_cryo' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'ZibaiC2', kind: 'character', entity: 'zibai', group: 'reaction-buff',
    rank: 2, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { lunar_phase_active: true },
    gates: { 'zibai.lunarPhase': true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', fields: ['direct_mooncrystallize_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'ZibaiTalent1', kind: 'character', entity: 'zibai', group: 'reaction-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'defense', monaParam: 'def' },
    channels: [
      {
        channel: 'attribute.reaction.lunar.baseBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.baseBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', field: 'mooncrystallize_base_compose' },
      },
    ],
  });

  // =========================================================================
  // 2. Remaining ~18 Incomplete Character Buffs (params / element / runner fixes)
  // =========================================================================
  add({
    key: 'DurinTalent2', kind: 'character', entity: 'durin', group: 'incomplete-buff',
    recipient: 'collei', recipientHit: 'collei:dendro',
    monaParams: { hexerei_secret_rite: true, effect_active: true, white_flame: true, reaction_element: 1 },
    gates: { 'durin.whiteDragonActive': true, 'durin.hexereiSecretRite': true },
    targetGates: { 'durin.whiteDragonShred-dendro': true, 'durin.whiteDragonShred-pyro': true },
    channels: [
      {
        channel: 'target.resistance.dendro',
        leylineTarget: 'target.resistance.dendro',
        hit: { family: 'ordinary', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
      {
        channel: 'target.resistance.pyro',
        leylineTarget: 'target.resistance.pyro',
        recipientOverride: 'amber',
        recipientHitOverride: 'amber:pyro',
        hit: { family: 'ordinary', element: 'pyro' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
    ],
  });

  add({
    key: 'EmilieC2', kind: 'character', entity: 'emilie', group: 'incomplete-buff',
    rank: 2, recipient: 'collei', recipientHit: 'collei:dendro',
    monaParams: { rate: 1 },
    event: { kind: 'hit', actorId: 'actor', skillId: 'emilie.skill', hitId: 'emilie.skill.param1', category: 'skill', targetIds: ['enemy'] },
    channels: [
      {
        channel: 'target.resistance.dendro',
        leylineTarget: 'target.resistance.dendro',
        hit: { family: 'ordinary', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
    ],
  });

  add({
    key: 'LaumaBurst', kind: 'character', entity: 'lauma', group: 'incomplete-buff',
    talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    monaParams: { skill_level: 10, constellation: 0, full_moon: false, stacks_available: 1 },
    queryFacts: { 'lauma.paleHymn': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.flatBaseBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.flatBaseBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-flat', trKey: 'bloom' },
      },
      {
        channel: 'attribute.reaction.lunar.flatBaseBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.flatBaseBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'direct_moonbloom_extra_fixed' },
      },
    ],
  });

  add({
    key: 'LaumaTalent2', kind: 'character', entity: 'lauma', group: 'incomplete-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    gates: { 'lauma.skillMoonWindow': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.expectedCrit[bloom,firstMoonsign]',
        leylineTarget: '__transformative_expected_crit__',
        monaParamsOverride: { mode: 1 },
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-expected-crit', trKey: 'bloom' },
      },
      {
        channel: 'attribute.critRate[lunar-bloom,fullMoonsign]',
        leylineTarget: 'attribute.critRate',
        extraCharactersOverride: ['aino'],
        monaParamsOverride: { mode: 2 },
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['critical_moonbloom', 'critical_moon_reaction'] },
      },
      {
        channel: 'attribute.critDamage[lunar-bloom,fullMoonsign]',
        leylineTarget: 'attribute.critDamage',
        extraCharactersOverride: ['aino'],
        monaParamsOverride: { mode: 2 },
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['critical_damage_moonbloom', 'critical_damage_moon_reaction'] },
      },
    ],
  });

  add({
    key: 'LumineCryoC6', kind: 'character', entity: 'lumine-cryo', group: 'incomplete-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { cold_glow_consumed: 8, effect_active: true },
    gates: { 'lumine-cryo.frostglowSpent': 8 },
    event: { kind: 'action', actorId: 'actor', skillId: 'lumine-cryo.burst', targetIds: [] },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'LumineCryoTalent1', kind: 'character', entity: 'lumine-cryo', group: 'incomplete-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { radiance_mode: 1 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.baseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_base_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.baseBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaParamsOverride: { radiance_mode: 2 },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_base_compose' },
      },
    ],
  });

  add({
    key: 'MityaA1', kind: 'character', entity: 'mitya', group: 'incomplete-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { constellation: 0, ascension: 6, core_mode: 1, beacons: 4 },
    gates: { 'mitya.stable': true, 'mitya.heldBeacons': 4 },
    channels: [
      {
        channel: 'attribute.elementalMastery',
        leylineTarget: 'attribute.elementalMastery',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'elemental_mastery' },
      },
    ],
  });

  add({
    key: 'MityaC6', kind: 'character', entity: 'mitya', group: 'incomplete-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'constellation-0',
    monaParams: { constellation: 6 },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.elevation',
        leylineTarget: 'attribute.reaction.stellar-conduct.elevation',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', fields: ['elevate_stellarconduct_compose', 'elevate_stellar_glimmer_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'MityaStellarBlessing', kind: 'character', entity: 'mitya', group: 'incomplete-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.baseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_base_compose' },
      },
    ],
  });

  add({
    key: 'MityaSupport', kind: 'character', entity: 'mitya', group: 'incomplete-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    beforeMode: 'remove-owner',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em', withActiveGates: true },
    monaParams: { constellation: 6, ascension: 6, core_mode: 2, beacons: 4, polestar: true, recipient_on_field: true },
    gates: { 'mitya.overload': true, 'mitya.detectionCorePresent': true, 'mitya.createdBeaconStacks': 4 },
    targetGates: { 'mitya.polarFieldEnemy': true },
    channels: [
      {
        channel: 'attribute.elementalMastery[C2-overload]',
        leylineTarget: 'attribute.elementalMastery',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'elemental_mastery' },
      },
      {
        channel: 'attribute.critDamage[C1]',
        leylineTarget: 'attribute.critDamage',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'critical_damage' },
      },
      {
        channel: 'target.resistance.cryo[C2]',
        leylineTarget: 'target.resistance.cryo',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
      {
        channel: 'attribute.reaction.stellar-conduct.baseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.baseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_base_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-conduct.elevation[C6]',
        leylineTarget: 'attribute.reaction.stellar-conduct.elevation',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', fields: ['elevate_stellarconduct_compose', 'elevate_stellar_glimmer_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'QiqiC6StellarConduct', kind: 'character', entity: 'qiqi', group: 'incomplete-buff',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    gates: { 'qiqi.c6DongxuanActive': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.flatBaseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.flatBaseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo', origin: 'talent' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_extra_fixed' },
      },
    ],
  });

  add({
    key: 'ValeriyDirective', kind: 'character', entity: 'valeriy', group: 'incomplete-buff',
    talentLevel: 10, recipient: 'lisa', recipientHit: 'lisa:electro',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { talent_level: 10, ascended: true, momentum: 130, radiance: true, recipient_on_field: true, active: true },
    gates: { 'valeriy.assaultOrderWindow': true, 'valeriy.spentImpactPotential': 130, radiance: 'stellar-conduct' },
    queryFacts: { 'valeriy.assaultOrder': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.flatBaseBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.flatBaseBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'electro' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_extra_fixed' },
      },
      {
        channel: 'attribute.baseDamageBonus[ordinary-electro]',
        leylineTarget: 'attribute.baseDamageBonus',
        monaParamsOverride: { radiance: false },
        gatesOverride: { radiance: 'none' },
        hit: { family: 'ordinary', element: 'electro' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
    ],
  });

  add({
    key: 'XianglingC1', kind: 'character', entity: 'xiangling', group: 'incomplete-buff',
    rank: 1, recipient: 'amber', recipientHit: 'amber:pyro',
    monaParams: {},
    event: { kind: 'hit', actorId: 'actor', skillId: 'xiangling.skill', hitId: 'xiangling.skill.param1', category: 'skill', targetIds: ['enemy'] },
    channels: [
      {
        channel: 'target.resistance.pyro',
        leylineTarget: 'target.resistance.pyro',
        hit: { family: 'ordinary', element: 'pyro' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
    ],
  });

  add({
    key: 'YumemizukiMizukiC1', kind: 'character', entity: 'yumemizukimizuki', group: 'incomplete-buff',
    rank: 1, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    targetGates: { 'yumemizukimizuki.c1Night': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.flatBaseBonus[swirl]',
        leylineTarget: 'attribute.reaction.transformative.flatBaseBonus',
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-flat', trKey: 'swirl_cryo' },
      },
    ],
  });

  add({
    key: 'CandaceQ', kind: 'character', entity: 'candace', group: 'incomplete-buff',
    level: 20, ascension: 0, talentLevel: 1, // Isolates Q (20% NA elemental) from A4 (ascension 4)
    recipient: 'barbara', recipientHit: 'barbara:hydro',
    monaParams: {},
    gates: { 'candace.prayer': true },
    channels: [
      {
        channel: 'attribute.damageBonus[NA-elemental]',
        leylineTarget: 'attribute.damageBonus',
        hit: { family: 'ordinary', category: 'normal', element: 'hydro' },
        monaRead: { kind: 'damage', field: 'bonus' },
      },
    ],
  });

  add({
    key: 'FaruzanQ', kind: 'character', entity: 'faruzan', group: 'incomplete-buff',
    rank: 6, talentLevel: 10, recipient: 'sucrose', recipientHit: 'sucrose:anemo',
    injectOwnerStat: { stat: 'whiteAttack', monaParam: 'base_atk', roundInt: true },
    monaParams: { q_level: 13, rate_q1: 1, rate_q2: 1, rate_talent2: 1, enable_c6: true },
    gates: { 'faruzan.prayer': true, 'faruzan.windBane': true },
    queryFacts: { 'faruzan.hurricaneGuard': true },
    channels: [
      {
        channel: 'attribute.anemoBonus',
        leylineTarget: 'attribute.anemoBonus',
        hit: { family: 'ordinary', element: 'anemo', category: 'normal' },
        monaRead: { kind: 'attribute', field: 'bonus_anemo' },
      },
      {
        channel: 'target.resistance.anemo',
        leylineTarget: 'target.resistance.anemo',
        hit: { family: 'ordinary', element: 'anemo', category: 'normal' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
      {
        channel: 'attribute.baseDamageBonus[A4]',
        leylineTarget: 'attribute.baseDamageBonus',
        hit: { family: 'ordinary', element: 'anemo', category: 'normal' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
      {
        channel: 'attribute.critDamage[C6]',
        leylineTarget: 'attribute.critDamage',
        hit: { family: 'ordinary', element: 'anemo', category: 'normal' },
        monaRead: { kind: 'damage', field: 'critical_damage' },
      },
    ],
  });

  add({
    key: 'VodyanitsaA4', kind: 'character', entity: 'vodyanitsa', group: 'incomplete-buff',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    ownerArtifacts: { hp: true },
    injectOwnerStat: { stat: 'hp', monaParam: 'hp' },
    monaParams: { hp: 50000, on_field: true, ordinary_mode: true },
    gates: { 'vodyanitsa.a4LeadVocal': true, 'vodyanitsa.a4VortexMode': false },
    channels: [
      {
        channel: 'attribute.baseDamageBonus[ordinary-hydro-cryo]',
        leylineTarget: 'attribute.baseDamageBonus',
        hit: { family: 'ordinary', element: 'cryo', category: 'skill' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
    ],
  });

  add({
    key: 'VodyanitsaA4', kind: 'character', entity: 'vodyanitsa', group: 'incomplete-buff',
    recipient: 'vesna', recipientHit: 'vesna:stellarswirl',
    ownerArtifacts: { hp: true },
    injectOwnerStat: { stat: 'hp', monaParam: 'hp' },
    monaParams: { hp: 50000, on_field: true, ordinary_mode: false },
    gates: { 'vodyanitsa.a4LeadVocal': true, 'vodyanitsa.a4VortexMode': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-swirl.flatBaseBonus[vortex-mode]',
        leylineTarget: 'attribute.reaction.stellar-swirl.flatBaseBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'anemo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_extra_fixed' },
      },
    ],
  });

  add({
    key: 'TravelerElements', kind: 'character', entity: 'aether-cryo', group: 'incomplete-buff',
    selfRecipient: true, recipient: 'aether-cryo', recipientHit: 'aether-cryo:cryo',
    monaParams: { anemo: true, geo: true, electro: true, dendro: true, hydro: true, pyro: true, cryo: true },
    gates: {
      'traveler.enhancedResonance.anemo': true,
      'traveler.enhancedResonance.geo': true,
      'traveler.enhancedResonance.electro': true,
      'traveler.enhancedResonance.dendro': true,
      'traveler.enhancedResonance.hydro': true,
      'traveler.enhancedResonance.pyro': true,
      'traveler.enhancedResonance.cryo': true,
    },
    channels: [
      { channel: 'attribute.critRate', leylineTarget: 'attribute.critRate', hit: { family: 'ordinary' }, monaRead: { kind: 'damage', field: 'critical' } },
      { channel: 'attribute.defensePercent', leylineTarget: 'attribute.defensePercent', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'def', base: 'defense' } },
      { channel: 'attribute.energyRecharge', leylineTarget: 'attribute.energyRecharge', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'recharge' } },
      { channel: 'attribute.elementalMastery', leylineTarget: 'attribute.elementalMastery', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'elemental_mastery' } },
      { channel: 'attribute.hpPercent', leylineTarget: 'attribute.hpPercent', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'hp', base: 'hp' } },
      { channel: 'attribute.attackPercent', leylineTarget: 'attribute.attackPercent', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'atk', base: 'attack' } },
      { channel: 'attribute.critDamage', leylineTarget: 'attribute.critDamage', hit: { family: 'ordinary' }, monaRead: { kind: 'damage', field: 'critical_damage' } },
    ],
  });

  add({
    key: 'TravelerEnhancedAttribute', kind: 'character', entity: 'aether-cryo', group: 'incomplete-buff',
    selfRecipient: true, recipient: 'aether-cryo', recipientHit: 'aether-cryo:cryo',
    monaParams: { first: true, second: true },
    gates: {
      'traveler.enhancedAttribute.first': true,
      'traveler.enhancedAttribute.second': true,
    },
    channels: [
      { channel: 'attribute.attack[base+10]', leylineTarget: 'attribute.attack', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'atk' } },
      { channel: 'attribute.hp[base+50]', leylineTarget: 'attribute.hp', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'hp' } },
      { channel: 'attribute.elementalMastery', leylineTarget: 'attribute.elementalMastery', hit: { family: 'ordinary' }, monaRead: { kind: 'attribute', field: 'elemental_mastery' } },
    ],
  });

  // =========================================================================
  // 3. Incomplete & zeroOnLeyline Weapons (5 items)
  // =========================================================================
  add({
    key: 'BreezeborneRefrainSupport', kind: 'weapon', entity: 'breezebornerefrain', group: 'weapon',
    carrier: 'amber', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { refine: 1, rate: 1 },
    gates: { 'breezebornerefrain.snakeVenom': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'FracturedHalo', kind: 'weapon', entity: 'fracturedhalo', group: 'weapon',
    carrier: 'xiangling', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { refine: 1, rate: 1, edict_active: true },
    gates: { 'fracturedhalo.electro-edictActive': true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['direct_moonelectro_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'NightweaversLookingGlass', kind: 'weapon', entity: 'nightweaverslookingglass', group: 'weapon',
    carrier: 'lisa', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { refine: 1, northernmost_runo_active: true, crescent_verse_active: true, overlap_rate: 1 },
    gates: { 'nightweaverslookingglass.skillWindow': true, 'nightweaverslookingglass.lunarWindow': true },
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'bloom' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[hyperbloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'hyperbloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'hyperbloom' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[burgeon]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'burgeon', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'burgeon' },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['direct_moonbloom_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'VodyanitsaSignature', kind: 'weapon', entity: 'hymnofthemaelstrom', group: 'weapon',
    carrier: 'vodyanitsa', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    ownerArtifacts: { hp: true },
    gates: { 'hymnofthemaelstrom.meadLayers': 3, 'hymnofthemaelstrom.reactionBuff': true },
    injectOwnerStat: { stat: 'hp', monaParam: 'hp', withActiveGates: true },
    monaParams: { on_field: true, refine: 1, stacks: 3, boosted: true },
    channels: [
      {
        channel: 'attribute.attackPercent[team-onField]',
        leylineTarget: 'attribute.attackPercent',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'atk', base: 'attack' },
      },
    ],
  });

  add({
    key: 'PeakPatrolSong', kind: 'weapon', entity: 'peakpatrolsong', group: 'weapon',
    carrier: 'kaeya', recipient: 'amber', recipientHit: 'amber:pyro',
    gates: { 'peakpatrolsong.odeLayers': 2 },
    injectOwnerStat: { stat: 'defense', monaParam: 'def', roundInt: true, withActiveGates: true },
    monaParams: { refine: 1, rate: 1 },
    event: {
      kind: 'hit', actorId: 'actor', skillId: 'kaeya.normal', hitId: 'kaeya.normal.param1',
      category: 'normal', targetIds: ['enemy'],
      facts: { 'peakpatrolsong.fullTriggered': bool(true) },
      subjectFacts: [{ subject: { kind: 'actor', id: 'actor' }, values: { 'peakpatrolsong.odeLayers': number('count', 2) } }],
    },
    channels: [
      {
        channel: 'attribute.damageBonus[elemental-pyro]',
        leylineTarget: 'attribute.damageBonus',
        hit: { family: 'ordinary', element: 'pyro' },
        monaRead: { kind: 'attribute', field: 'bonus_pyro' },
      },
    ],
  });

  // =========================================================================
  // 4. Artifact Sets: Reaction 4pc, State-Change 4pc, & Team-Set Buffs
  // =========================================================================
  add({
    key: 'FlowerOfParadiseLost', kind: 'set4pc', entity: 'flowerofparadiselost', group: 'set-reaction',
    monaExportName: 'FlowerOfParadiseLost',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaArtifactConfig: { config_flower_of_paradise_lost: { stack: 4 } },
    events: [0, 1, 2, 3].map(i => ({
      id: `bloom-${i}`, kind: 'reaction', actorId: 'actor', timeMs: i * 1100, order: i,
      reactionId: 'bloom', targetIds: ['enemy'], sourceEventIds: [], facts: {},
    })),
    hitTimeMs: 5000,
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[bloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'bloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'bloom' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[hyperbloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'hyperbloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'hyperbloom' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[burgeon]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'burgeon', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'burgeon' },
      },
    ],
  });

  add({
    key: 'ThunderingFury', kind: 'set4pc', entity: 'thunderingfury', group: 'set-reaction',
    monaExportName: 'ThunderingFury',
    recipient: 'lisa', recipientHit: 'lisa:electro',
    monaArtifactConfig: null,
    channels: [
      {
        channel: 'attribute.additiveReactionBonus[aggravate]',
        leylineTarget: 'attribute.additiveReactionBonus',
        hit: { family: 'ordinary', reactionId: 'aggravate', element: 'electro' },
        monaRead: { kind: 'damage', field: 'aggravate_compose' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[overloaded]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'overloaded', element: 'pyro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'overload' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[electro-charged]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'electro-charged', element: 'electro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'electro_charged' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[superconduct]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'superconduct', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'superconduct' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[hyperbloom]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'hyperbloom', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'hyperbloom' },
      },
    ],
  });

  add({
    key: 'CrimsonWitchOfFlames', kind: 'set4pc', entity: 'crimsonwitchofflames', group: 'set-reaction',
    monaExportName: 'CrimsonWitchOfFlames',
    recipient: 'amber', recipientHit: 'amber:pyro',
    monaArtifactConfig: null,
    channels: [
      {
        channel: 'attribute.amplifyingReactionBonus[vaporize]',
        leylineTarget: 'attribute.amplifyingReactionBonus',
        hit: { family: 'ordinary', reactionId: 'vaporize', element: 'pyro' },
        monaRead: { kind: 'damage', field: 'vaporize_enhance' },
      },
      {
        channel: 'attribute.amplifyingReactionBonus[melt]',
        leylineTarget: 'attribute.amplifyingReactionBonus',
        hit: { family: 'ordinary', reactionId: 'melt', element: 'pyro' },
        monaRead: { kind: 'damage', field: 'melt_enhance' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[overloaded]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'overloaded', element: 'pyro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'overload' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[burning]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'burning', element: 'pyro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'burning' },
      },
      {
        channel: 'attribute.reaction.transformative.damageBonus[burgeon]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'burgeon', element: 'dendro' },
        monaRead: { kind: 'transformative-bonus', trKey: 'burgeon' },
      },
    ],
  });

  add({
    key: 'ViridescentVenerer', kind: 'set4pc', entity: 'viridescentvenerer', group: 'set-reaction',
    monaExportName: 'ViridescentVenerer',
    recipient: 'sucrose', recipientHit: 'sucrose:anemo',
    monaArtifactConfig: null,
    channels: [
      {
        channel: 'attribute.reaction.transformative.damageBonus[swirl]',
        leylineTarget: 'attribute.reaction.transformative.damageBonus',
        hit: { family: 'transformative', reactionId: 'swirl', element: 'cryo' },
        monaRead: { kind: 'transformative-bonus', trKey: 'swirl_cryo' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'AubadeOfMorningstarAndMoon', kind: 'set4pc', entity: 'aubadeofmorningstarandmoon', group: 'set-reaction',
    monaExportName: 'AubadeOfMorningstarAndMoon',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    extraCharacters: ['aino', 'flins'],
    monaArtifactConfig: { config_aubade_of_morningstar_and_moon: { rate: 1, is_ascendant_gleam: true } },
    gates: { 'aubadeofmorningstarandmoon.offFieldWindow': true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['direct_moonelectro_compose', 'enhance_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-bloom]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-bloom', reactionId: 'lunar-bloom', element: 'dendro' },
        monaRead: { kind: 'damage', fields: ['direct_moonbloom_compose', 'enhance_moon_reaction_compose'] },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo' },
        monaRead: { kind: 'damage', fields: ['direct_mooncrystallize_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'DeepwoodMemories', kind: 'set4pc', entity: 'deepwoodmemories', group: 'set-incomplete',
    monaExportName: 'DeepwoodMemories',
    recipient: 'collei', recipientHit: 'collei:dendro',
    monaArtifactConfig: { config_deepwood_memories: { rate: 1 } },
    events: [{
      id: 'dw-hit', kind: 'hit', actorId: 'actor', timeMs: 0, order: 0,
      skillId: 'collei.skill', hitId: 'collei.skill.param1', category: 'skill',
      targetIds: ['enemy'], sourceEventIds: [], facts: {},
    }],
    channels: [
      {
        channel: 'target.resistance.dendro',
        leylineTarget: 'target.resistance.dendro',
        hit: { family: 'ordinary', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
    ],
  });

  add({
    key: 'DeepwoodMemories4', kind: 'set', entity: 'deepwoodmemories', group: 'set-team',
    carrier: 'kaeya', recipient: 'collei', recipientHit: 'collei:dendro',
    monaParams: { rate: 1 },
    event: { kind: 'hit', actorId: 'actor', skillId: 'kaeya.skill', hitId: 'kaeya.skill.param1', category: 'skill', targetIds: ['enemy'] },
    channels: [
      {
        channel: 'target.resistance.dendro',
        leylineTarget: 'target.resistance.dendro',
        hit: { family: 'ordinary', element: 'dendro' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
    ],
  });

  add({
    key: 'HeartOfTheFurnace4', kind: 'set', entity: 'heartofthefurnace', group: 'set-team',
    carrier: 'amber', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { rate: 1 },
    gates: { 'heartofthefurnace.stellarWindow': true },
    channels: [
      {
        channel: 'attribute.reaction.stellar-conduct.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-conduct.damageBonus',
        hit: { family: 'stellar-conduct', reactionId: 'stellar-conduct', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarconduct_compose' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.damageBonus',
        leylineTarget: 'attribute.reaction.stellar-swirl.damageBonus',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'direct_stellarswirl_compose' },
      },
    ],
  });

  add({
    key: 'RealmMirrorNight', kind: 'set', entity: 'nightoftheskysunveiling', group: 'set-team',
    carrier: 'amber', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { rate: 0.1, effect_active: true },
    gates: { 'nightoftheskysunveiling.moonlightWindow': true },
    channels: [
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', fields: ['direct_moonelectro_compose', 'enhance_moon_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'SpinMoonSerenade', kind: 'set', entity: 'silkenmoonsserenade', group: 'set-team',
    carrier: 'amber', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    extraCharacters: ['aino', 'flins'],
    monaParams: { rate: 0.1, mode: 2, effect_active: true },
    gates: { 'silkenmoonsserenade.moonlightWindow': true },
    channels: [
      {
        channel: 'attribute.elementalMastery[fullMoonsign]',
        leylineTarget: 'attribute.elementalMastery',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'elemental_mastery' },
      },
      {
        channel: 'attribute.reaction.lunar.damageBonus[lunar-charged]',
        leylineTarget: 'attribute.reaction.lunar.damageBonus',
        hit: { family: 'lunar-charged', reactionId: 'lunar-charged', element: 'electro' },
        monaRead: { kind: 'damage', field: 'enhance_moon_reaction_compose' },
      },
    ],
  });

  add({
    key: 'ScrollOfTheHeroOfCinderCity', kind: 'set4pc', entity: 'scrolloftheheroofcindercity', group: 'set-incomplete',
    monaExportName: 'ScrollOfTheHeroOfCinderCity',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaArtifactConfig: { config_scroll_of_the_hero_of_cinder_city: { elements: ['Cryo'], rate1: 1, rate2: 1 } },
    gates: {
      'scrolloftheheroofcindercity.cryoReactionWindow': true,
      'scrolloftheheroofcindercity.cryoNightsoulWindow': true,
    },
    channels: [
      {
        channel: 'attribute.cryoBonus',
        leylineTarget: 'attribute.cryoBonus',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'bonus_cryo' },
      },
    ],
  });

  add({
    key: 'MarechausseeHunter', kind: 'set4pc', entity: 'marechausseehunter', group: 'set-incomplete',
    monaExportName: 'MarechausseeHunter',
    recipient: 'kaeya', recipientHit: 'kaeya:physical',
    monaArtifactConfig: { config_marechaussee_hunter: { stack: 3 } },
    events: [0, 1, 2].map(i => ({
      id: `mh-${i}`, kind: 'state-change', actorId: 'actor', timeMs: i * 100, order: i,
      targetIds: [], sourceEventIds: [],
      facts: { hpRatioChange: number('scalar', -0.2) },
      subjectFacts: [{ subject: { kind: 'actor', id: 'actor' }, values: { onField: bool(true) } }],
    })),
    hitTimeMs: 500,
    channels: [
      {
        channel: 'attribute.critRate',
        leylineTarget: 'attribute.critRate',
        hit: { family: 'ordinary' },
        monaRead: { kind: 'attribute', field: 'critical' },
      },
    ],
  });

  add({
    key: 'VourukashasGlow', kind: 'set4pc', entity: 'vourukashasglow', group: 'set-incomplete',
    monaExportName: 'VourukashasGlow',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaArtifactConfig: { config_vourukashas_glow: { stack: 5 } },
    events: [0, 1, 2, 3, 4].map(i => ({
      id: `vg-${i}`, kind: 'state-change', actorId: 'actor', timeMs: i * 100, order: i,
      targetIds: [], sourceEventIds: [],
      facts: { damageTaken: number('hp', 20) },
    })),
    hitTimeMs: 600,
    channels: [
      {
        channel: 'attribute.damageBonus[skill]',
        leylineTarget: 'attribute.damageBonus',
        hit: { family: 'ordinary', category: 'skill', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'bonus' },
      },
    ],
  });

  add({
    key: 'FragmentOfHarmonicWhimsy', kind: 'set4pc', entity: 'fragmentofharmonicwhimsy', group: 'set-incomplete',
    monaExportName: 'FragmentOfHarmonicWhimsy',
    recipient: 'kaeya', recipientHit: 'kaeya:physical',
    monaArtifactConfig: { config_fragment_of_harmonic_whimsy: { level: 3 } },
    events: [0, 1, 2].map(i => ({
      id: `whimsy-${i}`, kind: 'state-change', actorId: 'actor', timeMs: i * 100, order: i,
      targetIds: [], sourceEventIds: [],
      facts: { bondOfLifeChange: number('hp', 100) },
    })),
    hitTimeMs: 500,
    channels: [
      {
        channel: 'attribute.damageBonus',
        leylineTarget: 'attribute.damageBonus',
        hit: { family: 'ordinary' },
        monaRead: { kind: 'damage', field: 'bonus' },
      },
    ],
  });

  add({
    key: 'EchoesOfAnOffering', kind: 'set4pc', entity: 'echoesofanoffering', group: 'set-incomplete',
    monaExportName: 'EchoesOfAnOffering',
    recipient: 'kaeya', recipientHit: 'kaeya:physical',
    monaArtifactConfig: { config_echoes_of_an_offering: { rate: 1 } },
    gates: { 'echoesofanoffering.valley-riteActive': true },
    channels: [
      {
        channel: 'attribute.baseDamageBonus[NA-ATK-ratio]',
        leylineTarget: 'attribute.baseDamageBonus',
        leylineDivideByOwnerStat: 'attack',
        hit: { family: 'ordinary', category: 'normal', element: 'physical' },
        monaRead: { kind: 'damage', field: 'atk_ratio' },
      },
    ],
  });

  add({
    key: 'HeavensGift4', kind: 'set', entity: 'celestialgift', group: 'set-zero-on-ll',
    carrier: 'kaeya', recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    selfRecipient: true,
    monaParams: {
      elements1: ['Pyro', 'Electro', 'Dendro', 'Cryo', 'Anemo', 'Geo', 'Hydro'],
      elements2: ['Pyro', 'Electro', 'Dendro', 'Cryo', 'Anemo', 'Geo', 'Hydro'],
      is_secret_arts: true,
      rate: 1,
    },
    gates: { 'celestialgift.songWindow': true, 'celestialgift.hexerei': true },
    channels: [
      ['pyro', 'bonus_pyro'],
      ['hydro', 'bonus_hydro'],
      ['electro', 'bonus_electro'],
      ['cryo', 'bonus_cryo'],
      ['anemo', 'bonus_anemo'],
      ['geo', 'bonus_geo'],
      ['dendro', 'bonus_dendro'],
    ].map(([elem, monaField]) => ({
      channel: `attribute.${elem}Bonus`,
      leylineTarget: `attribute.${elem}Bonus`,
      gatesOverride: { 'celestialgift.onFieldElement': elem },
      hit: { family: 'ordinary', element: elem },
      monaRead: { kind: 'attribute', field: monaField },
    })),
  });

  // =========================================================================
  // 5. Remaining zeroOnLeyline Character Buffs (~16 keys from Stage 2)
  // =========================================================================
  add({
    key: 'EscoffierC1', kind: 'character', entity: 'escoffier', group: 'zero-on-ll',
    rank: 1, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    teamElements: ['hydro', 'hydro'], // 4 Cryo/Hydro total (escoffier + kaeya + 2 hydro)
    monaParams: {},
    event: { kind: 'action', actorId: 'actor', skillId: 'escoffier.skill', targetIds: [] },
    channels: [
      {
        channel: 'attribute.critDamage[cryo]',
        leylineTarget: 'attribute.critDamage',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'critical_damage' },
      },
    ],
  });

  add({
    key: 'EscoffierC2', kind: 'character', entity: 'escoffier', group: 'zero-on-ll',
    rank: 2, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { rate: 1 },
    queryFacts: { 'escoffier.coldDishStacksRemaining': true },
    channels: [
      {
        channel: 'attribute.baseDamageBonus[cryo]',
        leylineTarget: 'attribute.baseDamageBonus',
        hit: { family: 'ordinary', element: 'cryo', category: 'skill' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
    ],
  });

  add({
    key: 'FurinaQ', kind: 'character', entity: 'furina', group: 'zero-on-ll',
    talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { skill_level: 10, fanfare_value: 300 },
    gates: { 'furina.fanfarePoints': 300 },
    event: { kind: 'action', actorId: 'actor', skillId: 'furina.burst', targetIds: [] },
    channels: [
      {
        channel: 'attribute.incomingHealingBonus[vs-Mona-healing_bonus]',
        leylineTarget: 'attribute.incomingHealingBonus',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'healing_bonus' },
      },
    ],
  });

  add({
    key: 'GorouE3', kind: 'character', entity: 'gorou', group: 'zero-on-ll',
    recipient: 'noelle', recipientHit: 'noelle:geo',
    teamElements: ['geo'], // 3 Geo total (gorou + noelle + extra geo)
    monaParams: {},
    gates: { 'gorou.bannerDomain': true },
    channels: [
      {
        channel: 'attribute.geoBonus',
        leylineTarget: 'attribute.geoBonus',
        hit: { family: 'ordinary', element: 'geo' },
        monaRead: { kind: 'attribute', field: 'bonus_geo' },
      },
    ],
  });

  add({
    key: 'IllugaQ', kind: 'character', entity: 'illuga', group: 'zero-on-ll',
    talentLevel: 10, recipient: 'noelle', recipientHit: 'noelle:geo',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    monaParams: { skill_level: 10, team_hydro_geo_count: 2, stacks_available: 1, recipient_on_field: true },
    gates: { 'illuga.nightingaleSong': true },
    queryFacts: { 'illuga.nightingaleSpend': true },
    channels: [
      {
        channel: 'attribute.baseDamageBonus[ordinary-geo]',
        leylineTarget: 'attribute.baseDamageBonus',
        hit: { family: 'ordinary', element: 'geo', category: 'skill' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
      {
        channel: 'attribute.reaction.lunar.flatBaseBonus[lunar-crystallize]',
        leylineTarget: 'attribute.reaction.lunar.flatBaseBonus',
        hit: { family: 'lunar-crystallize', reactionId: 'lunar-crystallize', element: 'geo', category: 'skill' },
        monaRead: { kind: 'damage', field: 'direct_mooncrystallize_extra_fixed' },
      },
    ],
  });

  add({
    key: 'Mika', kind: 'character', entity: 'mika', group: 'zero-on-ll',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:physical',
    monaParams: { stack_talent2: 3, rate_c6: 1 },
    recipientGates: { 'mika.soulwindActive': true, 'mika.detectorStacks': 3 },
    channels: [
      {
        channel: 'attribute.physicalBonus',
        leylineTarget: 'attribute.physicalBonus',
        hit: { family: 'ordinary', element: 'physical' },
        monaRead: { kind: 'attribute', field: 'bonus_physical' },
      },
      {
        channel: 'attribute.critDamage[physical-C6]',
        leylineTarget: 'attribute.critDamage',
        hit: { family: 'ordinary', element: 'physical' },
        monaRead: { kind: 'damage', field: 'critical_damage' },
      },
    ],
  });

  add({
    key: 'NilouTalent1', kind: 'character', entity: 'nilou', group: 'zero-on-ll',
    recipient: 'collei', recipientHit: 'collei:dendro',
    monaParams: {},
    gates: { 'nilou.goldenChaliceDendroHit': true },
    channels: [
      {
        channel: 'attribute.elementalMastery',
        leylineTarget: 'attribute.elementalMastery',
        hit: { family: 'ordinary', element: 'dendro' },
        monaRead: { kind: 'attribute', field: 'elemental_mastery' },
      },
    ],
  });

  add({
    key: 'PruneTalent2', kind: 'character', entity: 'prune', group: 'zero-on-ll',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { prune_atk: 4000, rate: 1 },
    recipientGates: { 'prune.inspirationWindow': true, 'prune.inspirationAttack': 4000 },
    channels: [
      {
        channel: 'attribute.damageBonus',
        leylineTarget: 'attribute.damageBonus',
        hit: { family: 'ordinary', element: 'cryo', category: 'skill' },
        monaRead: { kind: 'damage', field: 'bonus' },
      },
    ],
  });

  add({
    key: 'ShenheE', kind: 'character', entity: 'shenhe', group: 'zero-on-ll',
    talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'attack', monaParam: 'atk' },
    monaParams: { skill2: 10 },
    gates: { 'shenhe.quillTap': true },
    channels: [
      {
        channel: 'attribute.baseDamageBonus[cryo]',
        leylineTarget: 'attribute.baseDamageBonus',
        hit: { family: 'ordinary', element: 'cryo', category: 'skill' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
    ],
  });

  add({
    key: 'SucroseTalent1', kind: 'character', entity: 'sucrose', group: 'zero-on-ll',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: {},
    event: { kind: 'reaction', actorId: 'actor', reactionId: 'swirl', reactionElement: 'cryo', targetIds: ['enemy'] },
    channels: [
      {
        channel: 'attribute.elementalMastery',
        leylineTarget: 'attribute.elementalMastery',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'elemental_mastery' },
      },
    ],
  });

  add({
    key: 'SucroseTalent2', kind: 'character', entity: 'sucrose', group: 'zero-on-ll',
    recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    ownerArtifacts: { em: 500 },
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    event: { kind: 'hit', actorId: 'actor', skillId: 'sucrose.skill', hitId: 'sucrose.skill.param1', category: 'skill', targetIds: ['enemy'] },
    channels: [
      {
        channel: 'attribute.elementalMastery',
        leylineTarget: 'attribute.elementalMastery',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'elemental_mastery' },
      },
    ],
  });

  add({
    key: 'VodyanitsaC2', kind: 'character', entity: 'vodyanitsa', group: 'zero-on-ll',
    rank: 2, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { constellation: 2, on_field: true, ordinary_mode: true },
    gates: { 'vodyanitsa.c2Duet': true, 'vodyanitsa.c2VortexDuet': false },
    channels: [
      {
        channel: 'attribute.critDamage[cryo]',
        leylineTarget: 'attribute.critDamage',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'critical_damage' },
      },
      {
        channel: 'attribute.critDamage[stellar-swirl]',
        leylineTarget: 'attribute.critDamage',
        monaParamsOverride: { ordinary_mode: false },
        gatesOverride: { 'vodyanitsa.c2VortexDuet': true },
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'critical_damage_stellarswirl' },
      },
    ],
  });

  add({
    key: 'VodyanitsaC6', kind: 'character', entity: 'vodyanitsa', group: 'zero-on-ll',
    rank: 6, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    monaParams: { constellation: 6 },
    gates: { 'vodyanitsa.longSong': true },
    channels: [
      {
        channel: 'attribute.damageBonus[cryo]',
        leylineTarget: 'attribute.damageBonus',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'bonus_cryo' },
      },
      {
        channel: 'attribute.damageBonus[hydro]',
        leylineTarget: 'attribute.damageBonus',
        recipientOverride: 'barbara',
        recipientHitOverride: 'barbara:hydro',
        hit: { family: 'ordinary', element: 'hydro' },
        monaRead: { kind: 'attribute', field: 'bonus_hydro' },
      },
      {
        channel: 'attribute.reaction.stellar-swirl.elevation',
        leylineTarget: 'attribute.reaction.stellar-swirl.elevation',
        hit: { family: 'stellar-swirl', reactionId: 'stellar-swirl', element: 'cryo' },
        monaRead: { kind: 'damage', fields: ['elevate_stellarswirl_compose', 'elevate_stellar_glimmer_reaction_compose'] },
      },
    ],
  });

  add({
    key: 'XilonenE', kind: 'character', entity: 'xilonen', group: 'zero-on-ll',
    talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    teamElements: ['pyro'], // 2 PECH teammates (kaeya Cryo + extra Pyro)
    monaParams: { elements: ['Cryo', 'Pyro'], skill_level: 10 },
    gates: { 'xilonen.sourceSamplesActive': true },
    targetGates: { 'xilonen.targetInSamplerRange': true },
    channels: [
      {
        channel: 'target.resistance.cryo',
        leylineTarget: 'target.resistance.cryo',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'damage', field: 'res_minus', sign: -1 },
      },
    ],
  });

  add({
    key: 'YumemizukiMizukiC2', kind: 'character', entity: 'yumemizukimizuki', group: 'zero-on-ll',
    rank: 2, recipient: 'kaeya', recipientHit: 'kaeya:cryo',
    injectOwnerStat: { stat: 'elementalMastery', monaParam: 'em' },
    gates: { 'yumemizukimizuki.dreamdrifter': true },
    channels: [
      {
        channel: 'attribute.cryoBonus',
        leylineTarget: 'attribute.cryoBonus',
        hit: { family: 'ordinary', element: 'cryo' },
        monaRead: { kind: 'attribute', field: 'bonus_cryo' },
      },
      {
        channel: 'attribute.pyroBonus',
        leylineTarget: 'attribute.pyroBonus',
        recipientOverride: 'amber',
        recipientHitOverride: 'amber:pyro',
        hit: { family: 'ordinary', element: 'pyro' },
        monaRead: { kind: 'attribute', field: 'bonus_pyro' },
      },
      {
        channel: 'attribute.hydroBonus',
        leylineTarget: 'attribute.hydroBonus',
        recipientOverride: 'barbara',
        recipientHitOverride: 'barbara:hydro',
        hit: { family: 'ordinary', element: 'hydro' },
        monaRead: { kind: 'attribute', field: 'bonus_hydro' },
      },
      {
        channel: 'attribute.electroBonus',
        leylineTarget: 'attribute.electroBonus',
        recipientOverride: 'lisa',
        recipientHitOverride: 'lisa:electro',
        hit: { family: 'ordinary', element: 'electro' },
        monaRead: { kind: 'attribute', field: 'bonus_electro' },
      },
    ],
  });

  add({
    key: 'YunjinQ', kind: 'character', entity: 'yunjin', group: 'zero-on-ll',
    talentLevel: 10, recipient: 'kaeya', recipientHit: 'kaeya:physical',
    teamElements: ['pyro', 'hydro'], // 4 distinct elements (yunjin Geo + kaeya Cryo + Pyro + Hydro)
    injectOwnerStat: { stat: 'defense', monaParam: 'def' },
    monaParams: { skill3: 10, talent2: true, ele_count: 4 },
    recipientGates: { 'yunjin.flagFormation': true },
    event: { kind: 'action', actorId: 'actor', skillId: 'yunjin.burst', targetIds: [] },
    explicitApplications: [{ ownerId: 'actor', effectId: 'yunjin.flying-cloud-base.base', sourceEventId: 'trigger' }],
    channels: [
      {
        channel: 'attribute.baseDamageBonus[NA]',
        leylineTarget: 'attribute.baseDamageBonus',
        hit: { family: 'ordinary', category: 'normal', element: 'physical' },
        monaRead: { kind: 'damage', field: 'extra_damage' },
      },
    ],
  });

  // =========================================================================
  // 6. Explicitly accounted non-damage / unmodeled-in-Mona 4pc sets
  // =========================================================================
  const skipped4pcSets = [
    ['MaidenBeloved', 'maidenbeloved', 'mona-4pc-incoming-healing-not-exposed-on-panel'],
    ['Adventurer', 'adventurer', 'non-damage-4pc-exploration-healing'],
    ['DefendersWill', 'defenderswill', 'non-damage-4pc-elemental-res'],
    ['Gambler', 'gambler', 'non-damage-4pc-skill-cd-reset'],
    ['LuckyDog', 'luckydog', 'non-damage-4pc-mora-healing'],
    ['OceanHuedClam', 'oceanhuedclam', 'non-panel-4pc-bubble-proc'],
    ['Scholar', 'scholar', 'non-damage-4pc-energy-restore'],
    ['TheExile', 'theexile', 'non-damage-4pc-energy-restore'],
    ['TinyMiracle', 'tinymiracle', 'non-damage-4pc-elemental-res'],
    ['TravelingDoctor', 'travelingdoctor', 'non-damage-4pc-burst-healing'],
  ];
  for (const [key, entity, skipReason] of skipped4pcSets) {
    add({ key, kind: 'set4pc', entity, group: 'set-non-damage', skipReason, channels: [] });
  }

  return cases;
}

// ---------------------------------------------------------------------------
// Scoped catalog loader
// ---------------------------------------------------------------------------
async function loadEntitiesForCases(cases) {
  const characters = new Set(['kaeya', 'amber', 'barbara', 'lisa', 'noelle', 'sucrose', 'collei', 'xiangling']);
  const weapons = new Set(Object.values(novice));
  const sets = new Set(['gladiatorsfinale']);

  for (const c of cases) {
    if (c.skipReason) continue;
    if (c.kind === 'character') characters.add(c.entity);
    if (c.kind === 'weapon') weapons.add(c.entity);
    if (c.kind === 'set' || c.kind === 'set4pc') sets.add(c.entity);
    if (c.carrier) characters.add(c.carrier);
    if (c.recipient) characters.add(c.recipient);
    for (const extra of c.extraCharacters ?? []) characters.add(extra);
    for (const ch of c.channels ?? []) {
      if (ch.recipientOverride) characters.add(ch.recipientOverride);
      for (const extra of ch.extraCharactersOverride ?? []) characters.add(extra);
    }
  }

  const catalog = await createRuntimeCatalog({
    characters: [...characters],
    weapons: [...weapons],
    sets: [...sets],
    actions: [],
  });
  const charMap = new Map();
  const weaponMap = new Map();
  const setMap = new Map();
  for (const id of catalog.inventory.characters) charMap.set(id, await catalog.get('characters', id));
  for (const id of catalog.inventory.weapons) weaponMap.set(id, await catalog.get('weapons', id));
  for (const id of catalog.inventory.sets) setMap.set(id, await catalog.get('sets', id));
  return { charMap, weaponMap, setMap };
}

function createFallbackShared() {
  let monaRuntimePromise = null;
  let enginePromise = null;
  const fixtureCache = new Map();
  return {
    async getMonaRuntime() {
      monaRuntimePromise ??= import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
      return monaRuntimePromise;
    },
    async getEngine() {
      enginePromise ??= (await import('./load-content-schema.mjs')).loadContentSchema('/src/engine/src/index.ts');
      return enginePromise;
    },
    async getMonaFixture(monaCharName, skillIndex = 0) {
      const k = `${monaCharName}:${skillIndex}`;
      if (!fixtureCache.has(k)) {
        const probe = (await probeMonaSkills({ characters: [monaCharName], indices: [skillIndex], constellations: [0] })).rows[0];
        if (!probe || probe.status !== 'ok') return null;
        fixtureCache.set(k, probe.input);
      }
      return structuredClone(fixtureCache.get(k));
    },
  };
}

// ---------------------------------------------------------------------------
// Single case evaluator
// ---------------------------------------------------------------------------
async function evaluateReactionCase(spec, { api, engine, shared, charMap, weaponMap, setMap }) {
  const results = [];
  const placeholderSet = setMap.get('gladiatorsfinale');

  if (spec.skipReason) {
    return {
      skipped: [{
        key: spec.key,
        entity: spec.entity,
        kind: spec.kind,
        group: spec.group,
        reason: spec.skipReason,
      }],
      rows: [],
    };
  }

  for (const ch of spec.channels) {
    try {
      const recipientId = ch.recipientOverride ?? spec.recipient ?? 'kaeya';
      const hitKey = ch.recipientHitOverride ?? spec.recipientHit ?? 'kaeya:cryo';
      const hitPreset = RECIPIENT_MONA_HIT[hitKey] ?? RECIPIENT_MONA_HIT['kaeya:cryo'];
      const selfRecipient = Boolean(spec.selfRecipient) || spec.kind === 'set4pc';
      const extraChars = ch.extraCharactersOverride ?? spec.extraCharacters ?? [];

      const recipientChar = charMap.get(recipientId);
      if (!recipientChar) throw new Error(`Missing recipient character: ${recipientId}`);
      const recipientWeapon = weaponMap.get(novice[recipientChar.identity.weaponType]);

      // Assemble owner build(s) for active & baseline phases
      let ownerChar;
      let ownerWeapon;
      let ownerSets = [];
      let ownerEntity;
      if (spec.kind === 'character') {
        ownerChar = charMap.get(spec.entity);
        if (!ownerChar) throw new Error(`Missing character: ${spec.entity}`);
        ownerWeapon = weaponMap.get(novice[ownerChar.identity.weaponType]);
        ownerEntity = ownerChar;
      } else if (spec.kind === 'weapon') {
        ownerWeapon = weaponMap.get(spec.entity);
        if (!ownerWeapon) throw new Error(`Missing weapon: ${spec.entity}`);
        const carrierId = spec.carrier ?? WEAPON_DEFAULT_CARRIER[ownerWeapon.weaponType] ?? 'kaeya';
        ownerChar = charMap.get(carrierId);
        ownerEntity = ownerWeapon;
      } else if (spec.kind === 'set' || spec.kind === 'set4pc') {
        const setDoc = setMap.get(spec.entity);
        if (!setDoc) throw new Error(`Missing set: ${spec.entity}`);
        ownerChar = charMap.get(spec.kind === 'set4pc' ? recipientId : (spec.carrier ?? 'kaeya'));
        ownerWeapon = weaponMap.get(novice[ownerChar.identity.weaponType]);
        ownerSets = [setDoc];
        ownerEntity = setDoc;
      }

      const synth = makeSyntheticArtifacts(spec.ownerArtifacts, placeholderSet);
      const ownerSetsCombined = [...ownerSets, ...synth.sets.filter(s => !ownerSets.some(x => x.id === s.id))];
      const tLevel = spec.talentLevel ?? 10;
      const baseOwnerBuild = {
        ...auditBuild(ownerChar, ownerWeapon, ownerSetsCombined),
        level: spec.level ?? 90,
        ascension: spec.ascension ?? 6,
        weaponLevel: 1,
        weaponAscension: 0,
        constellation: spec.rank ?? 0,
        refinement: spec.refinement ?? 1,
        talents: { normal: tLevel, skill: tLevel, burst: tLevel },
        artifacts: synth.artifacts,
        ...(ownerSets.length ? {
          theoreticalSetSlots: ownerSets[0].slots.slice(0, 4).map(slot => ({ slot, setId: ownerSets[0].id })),
        } : {}),
      };

      const recipientBuild = selfRecipient ? baseOwnerBuild : {
        ...auditBuild(recipientChar, recipientWeapon),
        level: 90,
        ascension: 6,
      };

      const extraMembers = [
        ...extraChars.map((id, i) => {
          const ec = charMap.get(id);
          const ew = weaponMap.get(novice[ec.identity.weaponType]);
          return { id: `ally${i}`, build: { ...auditBuild(ec, ew), level: 90, ascension: 6 } };
        }),
        ...(spec.teamElements ?? []).map((element, i) => ({ id: `stub${i}`, element })),
      ];

      const activeMembers = [
        { id: 'actor', build: baseOwnerBuild },
        ...(!selfRecipient ? [{ id: 'peer', build: recipientBuild }] : []),
        ...extraMembers,
      ];

      let beforeMembers = activeMembers;
      let neutralChar = null;
      if (spec.kind === 'set4pc') {
        const build3pc = {
          ...baseOwnerBuild,
          theoreticalSetSlots: ownerSets[0].slots.slice(0, 3).map(slot => ({ slot, setId: ownerSets[0].id })),
        };
        beforeMembers = [{ id: 'actor', build: build3pc }, ...extraMembers];
      } else if (spec.kind === 'set' && !spec.gates && !spec.event) {
        const build3pc = {
          ...baseOwnerBuild,
          theoreticalSetSlots: ownerSets[0].slots.slice(0, 3).map(slot => ({ slot, setId: ownerSets[0].id })),
        };
        beforeMembers = [{ id: 'actor', build: build3pc }, ...activeMembers.slice(1)];
      } else if (spec.kind === 'weapon' && !spec.gates && !spec.event) {
        const buildNovice = { ...baseOwnerBuild, weapon: weaponMap.get(novice[ownerChar.identity.weaponType]), refinement: 1 };
        beforeMembers = [{ id: 'actor', build: buildNovice }, ...activeMembers.slice(1)];
      } else if (spec.beforeMode === 'constellation-0') {
        beforeMembers = [{ id: 'actor', build: { ...baseOwnerBuild, constellation: 0 } }, ...activeMembers.slice(1)];
      } else if (spec.beforeMode === 'remove-owner') {
        neutralChar = charMap.get(recipientId === 'amber' ? 'kaeya' : 'amber');
        const neutralWep = weaponMap.get(novice[neutralChar.identity.weaponType]);
        beforeMembers = [
          { id: 'actor', build: { ...auditBuild(neutralChar, neutralWep), level: 90, ascension: 6 } },
          ...activeMembers.slice(1),
        ];
      }

      const activePrepared = engine.prepareStructuredBuilds(activeMembers);
      if (!activePrepared.ok) throw new Error(`prepareStructuredBuilds(active) failed: ${JSON.stringify(activePrepared.diagnostics)}`);
      const beforePrepared = beforeMembers === activeMembers
        ? activePrepared
        : engine.prepareStructuredBuilds(beforeMembers);
      if (!beforePrepared.ok) throw new Error(`prepareStructuredBuilds(before) failed: ${JSON.stringify(beforePrepared.diagnostics)}`);

      const recipientActor = selfRecipient ? 'actor' : 'peer';
      const hitSpec = {
        element: ch.hit?.element ?? hitPreset.element,
        category: ch.hit?.category ?? hitPreset.category,
        hitId: ch.hit?.hitId ?? hitPreset.hitId,
        family: ch.hit?.family ?? 'ordinary',
        reactionId: ch.hit?.reactionId ?? null,
        origin: ch.hit?.origin ?? 'talent',
      };

      const mergedGates = { ...(spec.gates ?? {}), ...(ch.gatesOverride ?? {}) };
      const mergedRecipientGates = { ...(spec.recipientGates ?? {}), ...(ch.recipientGatesOverride ?? {}) };
      const mergedTargetGates = { ...(spec.targetGates ?? {}), ...(ch.targetGatesOverride ?? {}) };
      const mergedTeamGates = { ...(spec.teamGates ?? {}), ...(ch.teamGatesOverride ?? {}) };
      const mergedQueryFacts = { ...(spec.queryFacts ?? {}), ...(ch.queryFactsOverride ?? {}) };

      // Helper to build phase setup + frame for LeyLine
      const buildPhaseState = (active, teamForPhase, isRemovedOwner = false) => {
        const { setup, request } = buildHitFrame(recipientChar, recipientActor, hitSpec);
        const frame = request.frame;
        if (spec.hitTimeMs != null) {
          const hitEv = setup.events.find(e => e.id === 'hit');
          if (hitEv) hitEv.timeMs = spec.hitTimeMs;
        }

        if (isRemovedOwner && neutralChar) {
          setAuditDefaults(neutralChar, frame);
        } else {
          setAuditDefaults(ownerChar, frame);
          if (spec.kind === 'weapon') setAuditDefaults(ownerWeapon, frame);
          if (spec.kind === 'set' || spec.kind === 'set4pc') setAuditDefaults(ownerSets[0], frame);
          if (spec.event || spec.events?.length) {
            const eventWindowFacts = new Set();
            const meta = ownerEntity.metadata ?? ownerEntity;
            for (const g of [meta, ...(meta.talents ?? []), ...(meta.passives ?? []), ...(meta.constellations ?? []), ...(meta.effects ?? [])]) {
              for (const b of g.buffs ?? []) if (b.windowFact && b.trigger) eventWindowFacts.add(b.windowFact);
            }
            if (eventWindowFacts.size) {
              for (const row of frame.factOverrides) {
                for (const wfKey of eventWindowFacts) {
                  if (!Object.hasOwn(mergedGates, wfKey)) delete row.facts[wfKey];
                }
              }
            }
          }
        }
        if (!selfRecipient) {
          frame.factOverrides = frame.factOverrides.filter(r => r.subject.id !== recipientActor);
        }

        const combinedFactsDecl = {
          ...(ownerChar?.metadata?.facts ?? {}),
          ...(spec.kind === 'weapon' ? (ownerWeapon?.metadata?.facts ?? {}) : {}),
          ...((spec.kind === 'set' || spec.kind === 'set4pc') ? (ownerSets[0]?.metadata?.facts ?? {}) : {}),
          ...(recipientChar?.metadata?.facts ?? {}),
        };
        const resetVal = v => (typeof v === 'boolean' ? false : typeof v === 'string' ? 'none' : 0);

        // Recipient defaults & overrides
        const recDefaults = {};
        if (!selfRecipient && !isRemovedOwner) {
          for (const [k, decl] of Object.entries(combinedFactsDecl)) {
            if (decl.scope !== 'recipient') continue;
            recDefaults[k] = decl.type.kind === 'quantity' ? 0
              : decl.type.kind === 'boolean' ? false
                : (decl.type.values?.includes('none') ? 'none' : decl.type.values?.[0]);
          }
        }
        setSubjectFacts(frame, { kind: 'actor', id: recipientActor }, {
          ...recDefaults,
          onField: spec.recipientOnField ?? true,
          hpRatio: 1,
          ...Object.fromEntries(Object.entries(mergedRecipientGates).map(([k, v]) => [k, active ? v : resetVal(v)])),
        }, combinedFactsDecl);

        if (!isRemovedOwner) {
          const ownerValues = {
            onField: spec.ownerOnField ?? true,
            ...Object.fromEntries(Object.entries(mergedGates).map(([k, v]) => [k, active ? v : resetVal(v)])),
          };
          setGateFacts(ownerEntity, frame, ownerValues);
        }

        if (Object.keys(mergedTargetGates).length) {
          setSubjectFacts(frame, { kind: 'target', id: 'enemy' },
            Object.fromEntries(Object.entries(mergedTargetGates).map(([k, v]) => [k, active ? v : resetVal(v)])),
            combinedFactsDecl);
        }
        if (Object.keys(mergedTeamGates).length) {
          setSubjectFacts(frame, { kind: 'team' },
            Object.fromEntries(Object.entries(mergedTeamGates).map(([k, v]) => [k, active ? v : resetVal(v)])),
            combinedFactsDecl);
        }
        if (Object.keys(mergedQueryFacts).length) {
          for (const [k, v] of Object.entries(mergedQueryFacts)) {
            const val = active ? v : resetVal(v);
            frame.facts[k] = typeof val === 'boolean' ? bool(val) : number('scalar', val);
          }
        }

        if (active) {
          if (spec.event) {
            setup.events.push({
              id: 'trigger',
              actorId: 'actor',
              timeMs: 0,
              order: 0,
              sourceEventIds: [],
              facts: {},
              ...spec.event,
            });
          }
          if (spec.events?.length) {
            for (const ev of spec.events) setup.events.push(structuredClone(ev));
          }
          if (spec.explicitApplications?.length) {
            frame.applications = spec.explicitApplications.map(a => ({
              instanceId: engine.calculationEffectInstanceId(
                a.ownerId,
                { namespace: 'builtin', id: a.effectId, revision: '1' },
                a.sourceEventId,
              ),
              active: true,
            }));
          }
        }
        return { setup, frame, team: teamForPhase };
      };

      // Optional: read owner live stat from LeyLine and inject into Mona params
      const monaParams = { ...(spec.monaParams ?? {}), ...(ch.monaParamsOverride ?? {}) };
      if (spec.injectOwnerStat) {
        const { stat, monaParam, cap, roundInt, withActiveGates } = spec.injectOwnerStat;
        const ownerState = buildPhaseState(Boolean(withActiveGates), activePrepared.team, false);
        ownerState.frame.ownerId = 'actor';
        ownerState.frame.recipientId = 'actor';
        const readStat = readLeylineBinding(engine, ownerState.team, ownerState.setup, ownerState.frame, `attribute.${stat}`);
        if (readStat.value == null) throw new Error(`Failed to read owner stat attribute.${stat}`);
        let injected = readStat.value;
        if (cap != null) injected = Math.min(cap, injected);
        if (roundInt) injected = Math.round(injected);
        monaParams[monaParam] = injected;
      }

      // Evaluate LeyLine before & after
      const llBeforeState = buildPhaseState(false, beforePrepared.team, spec.beforeMode === 'remove-owner');
      const llAfterState = buildPhaseState(true, activePrepared.team, false);

      let leylineBefore;
      let leylineAfter;
      let llDiagnostics = [];
      if (ch.leylineTarget === '__transformative_expected_crit__') {
        const crB = readLeylineBinding(engine, llBeforeState.team, llBeforeState.setup, llBeforeState.frame, 'attribute.reaction.transformative.critRate');
        const cdB = readLeylineBinding(engine, llBeforeState.team, llBeforeState.setup, llBeforeState.frame, 'attribute.reaction.transformative.critDamage');
        const crA = readLeylineBinding(engine, llAfterState.team, llAfterState.setup, llAfterState.frame, 'attribute.reaction.transformative.critRate');
        const cdA = readLeylineBinding(engine, llAfterState.team, llAfterState.setup, llAfterState.frame, 'attribute.reaction.transformative.critDamage');
        leylineBefore = (crB.value != null && cdB.value != null) ? crB.value * cdB.value : null;
        leylineAfter = (crA.value != null && cdA.value != null) ? crA.value * cdA.value : null;
        llDiagnostics = [...crA.diagnostics, ...cdA.diagnostics];
      } else {
        const rBefore = readLeylineBinding(engine, llBeforeState.team, llBeforeState.setup, llBeforeState.frame, ch.leylineTarget);
        const rAfter = readLeylineBinding(engine, llAfterState.team, llAfterState.setup, llAfterState.frame, ch.leylineTarget);
        if (rBefore.value == null && spec.beforeMode === 'remove-owner' && ch.leylineTarget.startsWith('attribute.reaction.')) {
          leylineBefore = (ch.leylineTarget.endsWith('.elevationFactor') || ch.leylineTarget.endsWith('.baseMultiplier')) ? 1 : 0;
        } else {
          leylineBefore = rBefore.value;
        }
        leylineAfter = rAfter.value;
        llDiagnostics = rAfter.diagnostics;
      }
      let leylineDelta = (leylineBefore != null && leylineAfter != null) ? leylineAfter - leylineBefore : null;
      if (ch.leylineDivideByOwnerStat && leylineDelta != null) {
        const ownerState = buildPhaseState(true, activePrepared.team, false);
        ownerState.frame.ownerId = 'actor';
        ownerState.frame.recipientId = 'actor';
        const divRead = readLeylineBinding(engine, ownerState.team, ownerState.setup, ownerState.frame, `attribute.${ch.leylineDivideByOwnerStat}`);
        if (divRead.value && divRead.value > 0) {
          leylineDelta /= divRead.value;
        }
      }

      // Evaluate Mona before & after
      const monaInput = await shared.getMonaFixture(hitPreset.monaChar, hitPreset.skillIndex);
      if (!monaInput) throw new Error(`Missing Mona fixture for ${hitPreset.monaChar}:${hitPreset.skillIndex}`);
      Object.assign(monaInput.character, { level: 90, ascend: false, constellation: 0, skill1: 0, skill2: 0, skill3: 0 });
      if (hitPreset.monaCharParams && monaInput.character.params && typeof monaInput.character.params === 'object') {
        const paramBucket = monaInput.character.params[hitPreset.monaChar];
        if (paramBucket && typeof paramBucket === 'object') Object.assign(paramBucket, hitPreset.monaCharParams);
      }
      Object.assign(monaInput.weapon, { level: 1, ascend: false, refine: 1 });

      let monaBefore;
      let monaAfter;
      if (spec.kind === 'set4pc') {
        const setExport = spec.monaExportName ?? spec.key;
        const otherSet = setExport === 'GladiatorsFinale' ? 'NoblesseOblige' : 'GladiatorsFinale';
        const arts3 = monaInput.artifacts.slice(0, 4).map((a, i) => ({
          ...a,
          set_name: i === 3 ? otherSet : setExport,
          sub_stats: [],
        }));
        const arts4 = arts3.map(a => ({ ...a, set_name: setExport }));
        monaBefore = sampleMonaAll(api, { ...structuredClone(monaInput), artifacts: arts3, artifact_config: spec.monaArtifactConfig ?? null, buffs: [] });
        monaAfter = sampleMonaAll(api, { ...structuredClone(monaInput), artifacts: arts4, artifact_config: spec.monaArtifactConfig ?? null, buffs: [] });
      } else {
        monaInput.artifacts = [];
        const monaBuff = {
          name: spec.key,
          config: Object.keys(monaParams).length ? { [spec.key]: monaParams } : 'NoConfig',
        };
        monaBefore = sampleMonaAll(api, { ...structuredClone(monaInput), buffs: [] });
        monaAfter = sampleMonaAll(api, { ...structuredClone(monaInput), buffs: [monaBuff] });
      }

      const monaDelta = readMonaChannelDelta(monaBefore, monaAfter, ch.monaRead);
      const monaNonZero = Number.isFinite(monaDelta) && Math.abs(monaDelta) > 1e-9;
      const leyNonZero = Number.isFinite(leylineDelta) && Math.abs(leylineDelta) > 1e-9;

      if (!monaNonZero && !leyNonZero) {
        results.push({
          status: 'skipped',
          key: spec.key,
          entity: spec.entity,
          kind: spec.kind,
          group: spec.group,
          channel: ch.channel,
          recipient: recipientId,
          reason: 'both-zero-on-channel',
          monaDelta,
          leylineDelta,
        });
      } else if (!monaNonZero && leyNonZero) {
        const artifact = annotateReactionArtifact({
          key: spec.key,
          entity: spec.entity,
          channel: ch.channel,
          monaDelta,
          leylineDelta,
          customArtifact: ch.knownMonaArtifact,
        });
        results.push({
          status: 'numericMismatch',
          key: spec.key,
          entity: spec.entity,
          kind: spec.kind,
          group: spec.group,
          channel: ch.channel,
          recipient: recipientId,
          monaDelta,
          leylineDelta,
          absDiff: Math.abs(leylineDelta - (monaDelta ?? 0)),
          relError: 1,
          knownMonaArtifact: artifact,
        });
      } else if (!leyNonZero) {
        const artifact = annotateReactionArtifact({
          key: spec.key,
          entity: spec.entity,
          channel: ch.channel,
          monaDelta,
          leylineDelta,
          customArtifact: ch.knownMonaArtifact,
        });
        results.push({
          status: 'zeroOnLeyline',
          key: spec.key,
          entity: spec.entity,
          kind: spec.kind,
          group: spec.group,
          channel: ch.channel,
          recipient: recipientId,
          monaDelta,
          leylineDelta,
          leylineState: leylineDelta == null ? 'unknown' : 'zero',
          knownMonaArtifact: artifact,
          diagnostics: llDiagnostics.length ? llDiagnostics.slice(0, 3) : undefined,
        });
      } else if (isNear(monaDelta, leylineDelta, ch.relTolerance ?? REL_TOLERANCE, ch.absTolerance ?? ABS_TOLERANCE)) {
        results.push({
          status: 'matched',
          key: spec.key,
          entity: spec.entity,
          kind: spec.kind,
          group: spec.group,
          channel: ch.channel,
          recipient: recipientId,
          monaDelta,
          leylineDelta,
        });
      } else {
        const artifact = annotateReactionArtifact({
          key: spec.key,
          entity: spec.entity,
          channel: ch.channel,
          monaDelta,
          leylineDelta,
          customArtifact: ch.knownMonaArtifact,
          usedRoundInt: Boolean(spec.injectOwnerStat?.roundInt),
        });
        results.push({
          status: 'numericMismatch',
          key: spec.key,
          entity: spec.entity,
          kind: spec.kind,
          group: spec.group,
          channel: ch.channel,
          recipient: recipientId,
          monaDelta,
          leylineDelta,
          absDiff: Math.abs(monaDelta - leylineDelta),
          relError: relError(monaDelta, leylineDelta),
          knownMonaArtifact: artifact,
        });
      }
    } catch (error) {
      results.push({
        status: 'skipped',
        key: spec.key,
        entity: spec.entity,
        kind: spec.kind,
        group: spec.group,
        channel: ch.channel,
        reason: 'runner-error',
        error: String(error?.message ?? error),
      });
    }
  }

  return { skipped: [], rows: results };
}

// ---------------------------------------------------------------------------
// Public entry point: runReactionsMode(options, shared)
// ---------------------------------------------------------------------------
export async function runReactionsMode(options = {}, shared = null) {
  const started = Date.now();
  const ctx = shared ?? createFallbackShared();
  const [{ api }, engine] = await Promise.all([
    ctx.getMonaRuntime(),
    ctx.getEngine(),
  ]);

  const filterList = [
    ...(options.characters ?? []),
    ...(options.entities ?? []),
  ].map(s => String(s).trim().toLowerCase()).filter(Boolean);
  const filter = filterList.length ? new Set(filterList) : null;

  let cases = buildReactionCases();
  if (filter) {
    cases = cases.filter(c =>
      filter.has(c.key.toLowerCase())
      || (c.entity && filter.has(c.entity.toLowerCase()))
      || (c.group && filter.has(c.group.toLowerCase())),
    );
  }
  if (options.limit && options.limit > 0) {
    cases = cases.slice(0, options.limit);
  }

  const { charMap, weaponMap, setMap } = await loadEntitiesForCases(cases);

  const matched = [];
  const numericMismatch = [];
  const zeroOnLeyline = [];
  const skipped = [];
  let evaluatedEffects = 0;

  for (const spec of cases) {
    const out = await evaluateReactionCase(spec, { api, engine, shared: ctx, charMap, weaponMap, setMap });
    for (const s of out.skipped) skipped.push(s);
    for (const row of out.rows) {
      if (row.status === 'skipped') {
        const { status: _st, ...rest } = row;
        skipped.push(rest);
        continue;
      }
      evaluatedEffects++;
      const { status, ...rest } = row;
      if (status === 'matched') matched.push(rest);
      else if (status === 'numericMismatch') numericMismatch.push(rest);
      else if (status === 'zeroOnLeyline') zeroOnLeyline.push(rest);
    }
  }

  return {
    mode: 'reactions',
    elapsedMs: Date.now() - started,
    summary: {
      totalCases: cases.length,
      evaluatedEffects,
      matched: matched.length,
      numericMismatch: numericMismatch.length,
      trueSuspectNumericMismatch: numericMismatch.filter(x => !x.knownMonaArtifact).length,
      zeroOnLeyline: zeroOnLeyline.length,
      skipped: skipped.length,
    },
    numericMismatch,
    zeroOnLeyline,
    skipped,
    matched,
  };
}

// ---------------------------------------------------------------------------
// Public Markdown Summary Renderer
// ---------------------------------------------------------------------------
function fmtNum(v) {
  if (v == null || !Number.isFinite(v)) return 'null';
  if (Math.abs(v) >= 100) return v.toFixed(2);
  return v.toFixed(6);
}

export function renderReactionsSummaryMarkdown(report) {
  if (!report) return '';
  const s = report.summary ?? {};
  const lines = [
    `## 7. reactions — 反应 / 月曜 / 星烁 / 多人条件扫雷（numeric-mismatch: ${s.numericMismatch ?? 0}，疑似真 Bug: ${s.trueSuspectNumericMismatch ?? 0}，zero-on-leyline: ${s.zeroOnLeyline ?? 0}，matched: ${s.matched ?? 0}，skipped: ${s.skipped ?? 0}）`,
    '',
    `- 覆盖用例数：${s.totalCases ?? 0}，有效通道比对数：${s.evaluatedEffects ?? 0}，耗时：${report.elapsedMs ?? 0} ms`,
    '',
  ];

  if (report.numericMismatch?.length) {
    lines.push(
      '### Numeric Mismatches',
      '',
      '| Key | Entity | Kind | Channel | Mona Delta | LeyLine Delta | 相对误差 | 标注 |',
      '| --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    );
    for (const m of report.numericMismatch) {
      lines.push(
        `| \`${m.key}\` | \`${m.entity}\` | \`${m.kind}\` | \`${m.channel}\` | ${fmtNum(m.monaDelta)} | ${fmtNum(m.leylineDelta)} | ${((m.relError ?? 0) * 100).toFixed(2)}% | ${m.knownMonaArtifact ? m.knownMonaArtifact.kind : '**SUSPECT-BUG**'} |`,
      );
    }
    lines.push('');
  } else {
    lines.push('- 无数值差异。', '');
  }

  if (report.zeroOnLeyline?.length) {
    lines.push(`<details><summary>Zero on LeyLine (${report.zeroOnLeyline.length} 条)</summary>`, '');
    for (const z of report.zeroOnLeyline) {
      lines.push(`- \`${z.key}\` (\`${z.entity}\`, \`${z.channel}\`): mona=${fmtNum(z.monaDelta)}, leyline=${z.leylineState}${z.knownMonaArtifact ? ` [${z.knownMonaArtifact.kind}]` : ''}`);
    }
    lines.push('', '</details>', '');
  }

  if (report.skipped?.length) {
    lines.push(`<details><summary>Not Modeled / Skipped (${report.skipped.length} 条)</summary>`, '');
    for (const sk of report.skipped) {
      lines.push(`- \`${sk.key}\` (\`${sk.entity ?? ''}\`${sk.channel ? `, \`${sk.channel}\`` : ''}): ${sk.reason}${sk.error ? ` — ${sk.error}` : ''}`);
    }
    lines.push('', '</details>', '');
  }

  return lines.join('\n');
}
