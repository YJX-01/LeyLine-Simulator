import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentSource } from './content-source.mjs';
import { monaCalculationInventory } from './mona-inventory-probes.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const monaRoot = resolve(root, '.references/mona-community');
const monaCommit = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
const specsRoot = resolve(root, 'tools/data/sources/mona-community', monaCommit, 'specs');

const readMonaAsset = rel => JSON.parse(
  readFileSync(resolve(monaRoot, rel), 'utf8').replace(/^(?:\s*\/\/[^\n]*\n)*\s*export default\s*/, ''),
);

const normLabel = text => String(text ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\(第(\d+)击\)/g, '$1')
  .replace(/[^\p{L}\p{N}]/gu, '');

const WEAPON_BUFF_ALIASES = {
  VodyanitsaSignature: 'hymnofthemaelstrom',
};

// Traveler-shared buffs in Mona apply across all Traveler forms; map to aether-anemo
// as the canonical representative Traveler entity so triage resolves them cleanly.
const CHARACTER_BUFF_ALIASES = {
  TravelerElements: 'aether-anemo',
  TravelerEnhancedAttribute: 'aether-anemo',
};

const monaAttrToLeylineTargets = attr => {
  if (typeof attr !== 'string') return [];
  const exact = {
    ATKFixed: ['attribute.flatAttack', 'attribute.attack'],
    ATKPercentage: ['attribute.attackPercent'],
    HPFixed: ['attribute.flatHp', 'attribute.hp'],
    HPPercentage: ['attribute.hpPercent'],
    DEFFixed: ['attribute.flatDefense', 'attribute.defense'],
    DEFPercentage: ['attribute.defensePercent'],
    ElementalMastery: ['attribute.elementalMastery'],
    ElementalMasteryExtra: ['attribute.elementalMastery'],
    Recharge: ['attribute.energyRecharge'],
    CriticalBase: ['attribute.critRate'],
    CriticalAttacking: ['attribute.critRate'],
    CriticalDamageBase: ['attribute.critDamage'],
    HealingBonus: ['attribute.healingBonus'],
    IncomingHealingBonus: ['attribute.incomingHealingBonus'],
    ShieldStrength: ['attribute.shieldStrength'],
    BonusBase: ['attribute.damageBonus'],
    BonusNormalAndElemental: ['attribute.damageBonus'],
    ResMinusBase: ['target.resistance.pyro', 'target.resistance.hydro', 'target.resistance.electro', 'target.resistance.cryo', 'target.resistance.anemo', 'target.resistance.geo', 'target.resistance.dendro', 'target.resistance.physical'],
    DefMinus: ['target.defenseReduction'],
    DefMinusBase: ['target.defenseReduction'],
    DefPenetration: ['attribute.defenseIgnore'],
    IndependentBaseMultiplier: ['attribute.baseMultiplier'],
    EnhanceVaporize: ['attribute.amplifyingReactionBonus'],
    EnhanceMelt: ['attribute.amplifyingReactionBonus'],
    EnhanceAggravate: ['attribute.additiveReactionBonus'],
    EnhanceSpread: ['attribute.additiveReactionBonus'],
    EnhanceBloom: ['attribute.reaction.transformative.damageBonus'],
    EnhanceHyperbloom: ['attribute.reaction.transformative.damageBonus'],
    EnhanceBurgeon: ['attribute.reaction.transformative.damageBonus'],
    EnhanceBurning: ['attribute.reaction.transformative.damageBonus'],
    EnhanceElectroCharged: ['attribute.reaction.transformative.damageBonus'],
    EnhanceSuperconduct: ['attribute.reaction.transformative.damageBonus'],
    EnhanceSwirlBase: ['attribute.reaction.transformative.damageBonus'],
    EnhanceSwirlCryo: ['attribute.reaction.transformative.damageBonus'],
    EnhanceSwirlHydro: ['attribute.reaction.transformative.damageBonus'],
    SwirlExtraDmg: ['attribute.reaction.transformative.baseDamageBonus', 'attribute.baseDamageBonus'],
    SwirlExpectedBonus: ['attribute.reaction.transformative.critRate', 'attribute.reaction.transformative.critDamage'],
    BloomFamilyFlat: ['attribute.reaction.transformative.baseDamageBonus', 'attribute.baseDamageBonus'],
    BloomFamilyCritRate: ['attribute.reaction.transformative.critRate'],
    BloomFamilyCritDamage: ['attribute.reaction.transformative.critDamage'],
    NahidaReactionCritRate: ['attribute.reaction.transformative.critRate'],
    EnhanceMoonReaction: ['attribute.reaction.lunar.damageBonus'],
    EnhanceMoonelectro: ['attribute.reaction.lunar.damageBonus'],
    EnhanceMoonbloom: ['attribute.reaction.lunar.damageBonus'],
    EnhanceMoonCrystallize: ['attribute.reaction.lunar.damageBonus'],
    EnhanceMoonelectroBase: ['attribute.reaction.lunar-charged.baseBonus', 'attribute.reaction.lunar.baseBonus'],
    EnhanceMoonbloomBase: ['attribute.reaction.lunar-bloom.baseBonus', 'attribute.reaction.lunar.baseBonus'],
    EnhanceMoonCrystallizeBase: ['attribute.reaction.lunar-crystallize.baseBonus', 'attribute.reaction.lunar.baseBonus'],
    ExtraDmgMoonbloom: ['attribute.reaction.lunar.baseDamageBonus', 'attribute.baseDamageBonus'],
    ElevateMoonelectro: ['attribute.reaction.lunar-charged.elevation', 'attribute.reaction.lunar.elevation'],
    ElevateMoonbloom: ['attribute.reaction.lunar-bloom.elevation', 'attribute.reaction.lunar.elevation'],
    ElevateMoonCrystallize: ['attribute.reaction.lunar-crystallize.elevation', 'attribute.reaction.lunar.elevation'],
    CriticalMoonbloom: ['attribute.reaction.lunar.critRate', 'attribute.critRate'],
    CriticalDamageMoonbloom: ['attribute.reaction.lunar.critDamage', 'attribute.critDamage'],
    EnhanceStellarSuperconduct: ['attribute.reaction.stellar-conduct.damageBonus'],
    StellarSwirlBonus: ['attribute.reaction.stellar-swirl.damageBonus'],
    StellarSwirlBaseBonus: ['attribute.reaction.stellar-swirl.baseBonus'],
    StellarSwirlElevation: ['attribute.reaction.stellar-swirl.elevation'],
    StellarSwirlCritRate: ['attribute.reaction.stellar-swirl.critRate'],
    StellarSwirlCritDamage: ['attribute.reaction.stellar-swirl.critDamage'],
    StellarConductBaseBonus: ['attribute.reaction.stellar-conduct.baseBonus'],
    base: ['attribute.reaction.stellar-conduct.baseBonus', 'attribute.reaction.stellar-swirl.baseBonus'],
    bonus: ['attribute.reaction.stellar-conduct.damageBonus', 'attribute.reaction.stellar-swirl.damageBonus'],
    flat: ['attribute.reaction.stellar-conduct.baseDamageBonus', 'attribute.reaction.stellar-swirl.baseDamageBonus', 'attribute.baseDamageBonus'],
    crit_damage: ['attribute.reaction.stellar-conduct.critDamage', 'attribute.reaction.stellar-swirl.critDamage', 'attribute.critDamage'],
    elevation: ['attribute.reaction.stellar-conduct.elevation', 'attribute.reaction.stellar-swirl.elevation'],
  };
  if (Object.hasOwn(exact, attr)) return exact[attr];
  if (/^Lunar(?:Electro|Bloom|Crystallize)Enabled$|^Stellar(?:Conduct|Swirl)Enabled$/.test(attr)) {
    return ['__enable_flag__'];
  }
  if (/^Critical(Pyro|Hydro|Electro|Cryo|Anemo|Geo|Dendro|Physical)$/.test(attr)) {
    return ['attribute.critRate'];
  }
  if (/^Bonus(NormalAttack|ChargedAttack|PlungingAttack|PlungingImpact|ElementalSkill|ElementalBurst)$/.test(attr)) {
    return ['attribute.damageBonus'];
  }
  if (/^CriticalDamage(Pyro|Hydro|Electro|Cryo|Anemo|Geo|Dendro|Physical)$/.test(attr)) {
    return ['attribute.critDamage'];
  }
  if (/^ExtraDmg/.test(attr) || /^ExtraDamage/.test(attr)) {
    return ['attribute.baseDamageBonus'];
  }
  const bonus = /^Bonus(Anemo|Cryo|Dendro|Electro|Geo|Hydro|Physical|Pyro)$/.exec(attr);
  if (bonus) return ['attribute.' + bonus[1].toLowerCase() + 'Bonus'];
  const res = /^ResMinus(Anemo|Cryo|Dendro|Electro|Geo|Hydro|Physical|Pyro)$/.exec(attr);
  if (res) return ['target.resistance.' + res[1].toLowerCase()];
  return [];
};

function loadEntityMap(folder) {
  const dir = resolve(root, 'src/game-data/data', folder);
  const map = new Map();
  for (const name of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const doc = JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
    map.set(doc.id, doc);
  }
  return map;
}

function loadCoveredSpecKeys() {
  const coveredBuffs = new Set();
  const coveredHits = new Set();
  const coveredSets4pc = new Set(['GladiatorsFinale', 'WanderersTroupe']);
  const groups = ['characters', 'weapons', 'sets'];
  for (const group of groups) {
    const dir = resolve(specsRoot, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const spec = JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
      for (const b of spec.buffScenarios ?? []) coveredBuffs.add(b.key);
      for (const h of spec.hitScenarios ?? []) coveredHits.add(`${spec.monaKey}:${h.monaSkillIndex}`);
      if (spec.fourPieceScenarios?.length) coveredSets4pc.add(spec.monaKey);
    }
  }
  return { coveredBuffs, coveredHits, coveredSets4pc };
}

function buildIdentityMaps() {
  const catalog = readContentSource(resolve(root, 'tools/data/sources/catalog/mona-community/catalog.json'));
  const forms = readContentSource(resolve(root, 'tools/data/sources/character-text/base-and-manekin.json')).bindings;
  const enka = readContentSource(resolve(root, 'tools/data/sources/catalog/enka/catalog.json')).mapping.characters;
  const travelers = new Set(Object.values(enka).map(v => v.id));

  const resolveCharId = entry => {
    if (entry.canonicalId) return entry.canonicalId;
    const m = /^(Aether|Lumine|Manekina)(Anemo|Cryo|Dendro|Electro|Geo|Hydro|Pyro)$/.exec(entry.monaKey);
    if (!m) return null;
    const formId = `${m[1]}-${m[2]}`.toLowerCase();
    return Object.hasOwn(forms, formId) || travelers.has(formId) ? formId : null;
  };

  const charByMona = new Map();
  const charPrefixes = [];
  for (const entry of catalog.characters) {
    const entity = resolveCharId(entry);
    for (const key of [entry.monaKey, entry.exportName].filter(Boolean)) {
      charByMona.set(key, { ...entry, entity });
      if (entity) charPrefixes.push([key, entity]);
    }
  }
  charPrefixes.sort(([a], [b]) => b.length - a.length || a.localeCompare(b, 'en'));

  const weaponByMona = new Map();
  const weaponPrefixes = [];
  for (const entry of catalog.weapons) {
    for (const key of [entry.monaKey, entry.exportName].filter(Boolean)) {
      weaponByMona.set(key, { ...entry, entity: entry.canonicalId });
      if (entry.canonicalId) weaponPrefixes.push([key, entry.canonicalId]);
    }
  }
  weaponPrefixes.sort(([a], [b]) => b.length - a.length || a.localeCompare(b, 'en'));

  const setByMona = new Map();
  const setPrefixes = [];
  for (const entry of catalog.sets) {
    for (const key of [entry.monaKey, entry.exportName].filter(Boolean)) {
      setByMona.set(key, { ...entry, entity: entry.canonicalId });
      if (entry.canonicalId) setPrefixes.push([key, entry.canonicalId]);
    }
  }
  setPrefixes.sort(([a], [b]) => b.length - a.length || a.localeCompare(b, 'en'));

  return { catalog, charByMona, charPrefixes, weaponByMona, weaponPrefixes, setByMona, setPrefixes };
}

function summarizeLeylineBuffs(doc, kind) {
  const entries = [];
  const pushFrom = (buffs, basePath, meta = {}) => {
    for (const [bi, buff] of (buffs ?? []).entries()) {
      for (const [mi, mod] of (buff.modifiers ?? []).entries()) {
        entries.push({
          path: `${basePath}/buffs/${bi}/modifiers/${mi}`,
          buffId: buff.id,
          target: mod.target,
          value: mod.value,
          recipient: buff.recipient ?? 'owner',
          condition: buff.condition ?? mod.condition ?? null,
          trigger: buff.trigger ?? null,
          appliesTo: buff.appliesTo ?? null,
          ...meta,
        });
      }
    }
  };
  if (kind === 'character') {
    for (const [i, t] of (doc.talents ?? []).entries()) pushFrom(t.buffs, `/talents/${i}`, { group: 'talents', index: i });
    for (const [i, p] of (doc.passives ?? []).entries()) pushFrom(p.buffs, `/passives/${i}`, { group: 'passives', index: i });
    for (const [i, c] of (doc.constellations ?? []).entries()) pushFrom(c.buffs, `/constellations/${i}`, { group: 'constellations', index: i, rank: c.rank });
  } else if (kind === 'weapon') {
    pushFrom(doc.buffs, '', { group: 'weapon' });
  } else if (kind === 'set') {
    for (const [i, e] of (doc.effects ?? []).entries()) pushFrom(e.buffs, `/effects/${i}`, { group: 'effects', index: i, pieces: e.pieces });
  }
  return entries;
}

function summarizeLeylineHits(doc) {
  const hits = [];
  for (const [ti, talent] of (doc.talents ?? []).entries()) {
    for (const [hi, hit] of (talent.hits ?? []).entries()) {
      hits.push({
        field: `/talents/${ti}/hits/${hi}`,
        group: ti + 1,
        id: hit.id,
        name: hit.name,
        category: hit.category ?? talent.category,
        element: hit.element ?? talent.element,
        family: hit.family ?? 'ordinary',
        support: hit.support ?? null,
        stats: Array.isArray(hit.base) ? [...new Set(hit.base.map(t => t.stat))] : ['custom'],
        flags: {
          when: Boolean(hit.when),
          selection: Boolean(hit.selection),
          elementBy: Boolean(hit.elementBy),
          infusion: Boolean(hit.infusion),
          snapshot: Boolean(hit.snapshot),
          nonAtk: Array.isArray(hit.base) && hit.base.some(t => t.stat !== 'attack'),
          nonOrdinary: (hit.family ?? 'ordinary') !== 'ordinary',
        },
      });
    }
  }
  for (const bucket of ['passives', 'constellations']) {
    for (const [oi, owner] of (doc[bucket] ?? []).entries()) {
      for (const [hi, hit] of (owner.hits ?? []).entries()) {
        hits.push({
          field: `/${bucket}/${oi}/hits/${hi}`,
          group: bucket,
          id: hit.id,
          name: hit.name,
          category: hit.category ?? null,
          element: hit.element ?? null,
          family: hit.family ?? 'ordinary',
          support: hit.support ?? null,
          stats: Array.isArray(hit.base) ? [...new Set(hit.base.map(t => t.stat))] : ['custom'],
          flags: {
            when: Boolean(hit.when),
            selection: Boolean(hit.selection),
            elementBy: Boolean(hit.elementBy),
            infusion: Boolean(hit.infusion),
            snapshot: Boolean(hit.snapshot),
            nonAtk: Array.isArray(hit.base) && hit.base.some(t => t.stat !== 'attack'),
            nonOrdinary: (hit.family ?? 'ordinary') !== 'ordinary',
          },
        });
      }
    }
  }
  return hits;
}

/** Run full offline triage comparing fixed Mona baseline against current LeyLine JSONs. */
export async function runMonaTriage() {
  const [inventory, characterEffects, scopedEffects] = await Promise.all([
    monaCalculationInventory(),
    import('../../.references/mona-community/beta-data/character-effect-rules.mjs'),
    import('../../.references/mona-community/beta-data/scoped-character-effect-rules.mjs'),
  ]);
  const { CHARACTER_EFFECT_RULES } = characterEffects;
  const { STELLAR_SUPPORT_RULES, VODYANITSA_SUPPORT_RULES } = scopedEffects;
  const monaChars = readMonaAsset('src/assets/_gen_character.js');
  const monaBuffs = readMonaAsset('src/assets/_gen_buff.js');
  const monaArtifacts = readMonaAsset('src/assets/_gen_artifact.js');
  const monaLabels = readMonaAsset('src/i18n/generated/zh-cn.json');

  const characters = loadEntityMap('characters');
  const weapons = loadEntityMap('weapons');
  const sets = loadEntityMap('artifact-sets');
  const ids = buildIdentityMaps();
  const { coveredBuffs, coveredHits, coveredSets4pc } = loadCoveredSpecKeys();

  // Read inline covered character buff keys from mona-buff-audit.mjs for accurate accounting.
  const inlineBuffAudit = readFileSync(resolve(root, 'tools/lib/mona-buff-audit.mjs'), 'utf8');
  for (const match of inlineBuffAudit.matchAll(/key\s*:\s*'([A-Za-z0-9_]+)'/g)) {
    coveredBuffs.add(match[1]);
  }

  const buffRows = [];
  for (const row of inventory.rows.filter(r => r.kind === 'buff')) {
    const genre = row.genre;
    let entity = null;
    let kind = null;
    let wave = 'other';
    if (genre === 'Character') {
      kind = 'character';
      entity = CHARACTER_BUFF_ALIASES[row.key]
        ?? ids.charPrefixes.find(([prefix]) => row.key.startsWith(prefix))?.[1]
        ?? null;
      wave = row.structured ? 'wave2-character-structured' : 'wave4-character-legacy';
    } else if (genre === 'Weapon') {
      kind = 'weapon';
      entity = WEAPON_BUFF_ALIASES[row.key]
        ?? ids.weaponPrefixes.find(([prefix]) => row.key.startsWith(prefix))?.[1]
        ?? null;
      wave = 'wave1-weapons';
    } else if (genre === 'Artifact' || genre === 'ArtifactSet') {
      kind = 'set';
      entity = ids.setPrefixes.find(([prefix]) => row.key.startsWith(prefix))?.[1] ?? null;
      wave = 'wave1-sets';
    } else if (genre === 'Resonance') {
      kind = 'resonance';
      entity = 'resonances';
      wave = 'resonance';
    } else {
      kind = 'common';
      entity = 'common';
      wave = 'common';
    }

    const rule = CHARACTER_EFFECT_RULES[row.key]
      ?? STELLAR_SUPPORT_RULES[row.key]
      ?? VODYANITSA_SUPPORT_RULES[row.key]
      ?? null;
    const monaEffects = (rule?.effects ?? []).map((eff, idx) => ({
      index: idx,
      attribute: eff.attribute,
      value: eff.value,
      expectedTargets: monaAttrToLeylineTargets(eff.attribute),
    }));

    const doc = kind === 'character' ? characters.get(entity)
      : kind === 'weapon' ? weapons.get(entity)
      : kind === 'set' ? sets.get(entity)
      : null;
    const leylineModifiers = doc ? summarizeLeylineBuffs(doc, kind) : [];

    let triageClass = 'C-missing-in-leyline';
    let matchedTargets = [];
    let missingTargets = [];
    if (coveredBuffs.has(row.key)) {
      triageClass = 'covered';
    } else if (kind === 'common' || kind === 'resonance') {
      triageClass = 'reference-public';
    } else if (!doc) {
      triageClass = 'C-missing-entity';
    } else if (monaEffects.length > 0) {
      // Slot-level check when Mona key unambiguously names C1..C6 or Talent1/2/P1/P2
      let slotScope = leylineModifiers;
      let slotHint = null;
      if (kind === 'character') {
        const cm = /C([1-6])(?![0-9])/.exec(row.key);
        const tm = /(?:Talent|P|A)([12])(?![0-9])/.exec(row.key);
        if (cm) {
          const rank = Number(cm[1]);
          slotHint = 'constellations[' + (rank - 1) + ']';
          slotScope = leylineModifiers.filter(m => m.group === 'constellations' && m.rank === rank);
        } else if (tm) {
          const idx = tm[1] === '1' ? 0 : 1;
          slotHint = 'passives[' + idx + ']';
          const scoped = leylineModifiers.filter(m => m.group === 'passives' && m.index === idx);
          // Some Mona Talent1/Talent2 map to passives[2] (e.g. Moonsign/Stellar blessings) or swapped indices
          slotScope = scoped.length > 0 ? scoped : leylineModifiers.filter(m => m.group === 'passives');
        }
      }
      const leylineTargetSet = new Set(slotScope.map(m => m.target));
      const allTargetSet = new Set(leylineModifiers.map(m => m.target));
      for (const eff of monaEffects) {
        if (eff.expectedTargets.includes('__enable_flag__')) {
          matchedTargets.push(eff.attribute);
          continue;
        }
        if (!eff.expectedTargets.length) {
          missingTargets.push(typeof eff.attribute === 'string' ? eff.attribute : 'conditional-attribute');
        } else if (eff.expectedTargets.some(t => leylineTargetSet.has(t))) {
          matchedTargets.push(eff.attribute);
        } else if (slotScope.length > 0 && eff.expectedTargets.some(t => allTargetSet.has(t))) {
          // Present in another slot of the same character; keep as partial for human/subagent review
          missingTargets.push(`${eff.attribute}@${slotHint ?? 'slot'}`);
        } else {
          missingTargets.push(eff.attribute);
        }
      }
      if (missingTargets.length === 0 && matchedTargets.length > 0) {
        triageClass = 'A-ready-for-spec';
      } else if (matchedTargets.length > 0) {
        triageClass = 'B-partial-or-diff';
      } else {
        triageClass = 'C-missing-in-leyline';
      }
    } else {
      // Opaque/adapter/legacy buff: check if LeyLine entity has team/relevant buffs
      const relevant = kind === 'set'
        ? leylineModifiers.filter(m => m.pieces === 4)
        : leylineModifiers;
      triageClass = relevant.length > 0 ? 'B-opaque-needs-check' : 'C-missing-in-leyline';
    }

    buffRows.push({
      key: row.key,
      label: row.label,
      genre,
      kind,
      entity,
      wave,
      structured: row.structured,
      adapter: row.adapter,
      triageClass,
      monaConfig: row.config ?? [],
      monaEffects,
      matchedTargets,
      missingTargets,
      leylineModifierCount: leylineModifiers.length,
    });
  }

  // Artifact 4pc triage across all 63 sets
  const set4pcRows = [];
  const officialSets = readContentSource(resolve(root, 'tools/data/sources/catalog/genshin-db/sets.json'));
  for (const entry of ids.catalog.sets) {
    const entity = entry.canonicalId;
    const doc = entity ? sets.get(entity) : null;
    const monaMeta = monaArtifacts[entry.monaKey];
    const monaText4 = monaMeta?.effect4 != null ? monaLabels[monaMeta.effect4] ?? null : null;
    const officialText4 = officialSets[entity]?.effect4Pc ?? null;
    if (!monaText4 && !officialText4) continue;
    const leyline4 = doc ? summarizeLeylineBuffs(doc, 'set').filter(m => m.pieces === 4) : [];
    const leyline4Hits = doc ? (doc.effects ?? []).filter(e => e.pieces === 4).flatMap(e => e.hits ?? []) : [];
    const triageClass = coveredSets4pc.has(entry.exportName) || coveredSets4pc.has(entry.monaKey)
      ? 'covered'
      : (leyline4.length > 0 || leyline4Hits.length > 0) ? 'A-ready-for-spec' : 'C-missing-in-leyline';
    set4pcRows.push({
      entity,
      monaKey: entry.monaKey,
      exportName: entry.exportName,
      name: doc?.name ?? entry.exportName,
      triageClass,
      leyline4BuffCount: leyline4.length,
      leyline4HitCount: leyline4Hits.length,
      monaConfig4: monaMeta?.config4 ?? [],
      monaText4,
      officialText4,
    });
  }

  // Skill / Hit triage per character
  const skillRows = [];
  for (const [monaKey, mc] of Object.entries(monaChars).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const idEntry = ids.charByMona.get(monaKey);
    const entity = idEntry?.entity ?? null;
    const doc = entity ? characters.get(entity) : null;
    const leylineHits = doc ? summarizeLeylineHits(doc) : [];
    const hitsByNorm = new Map();
    for (const h of leylineHits) {
      const k = normLabel(h.name);
      const list = hitsByNorm.get(k) ?? [];
      list.push(h);
      hitsByNorm.set(k, list);
    }

    const skillIndexMap = new Map();
    for (const group of [1, 2, 3]) {
      for (const item of mc[`skillMap${group}`] ?? []) {
        const list = skillIndexMap.get(item.index) ?? [];
        list.push({ group, label: monaLabels[item.text] ?? '' });
        skillIndexMap.set(item.index, list);
      }
    }

    const skills = [];
    for (const [index, occs] of [...skillIndexMap].sort(([a], [b]) => a - b)) {
      const labels = occs.map(o => o.label).filter(Boolean);
      const combined = labels.join(' / ');
      const isHealOrShield = /治疗|回复量|回复生命值|护盾吸收量/.test(combined) && !/伤害/.test(combined);
      const matched = labels.flatMap(l => hitsByNorm.get(normLabel(l)) ?? []);
      const uniqueMatched = [...new Map(matched.map(h => [h.id, h])).values()];
      let triageClass = 'C-unmatched-skill';
      if (isHealOrShield) {
        triageClass = 'excluded-heal-shield';
      } else if (coveredHits.has(`${monaKey}:${index}`)) {
        triageClass = 'covered';
      } else if (uniqueMatched.length === 1) {
        const h = uniqueMatched[0];
        const complex = h.flags.when || h.flags.selection || h.flags.elementBy || h.flags.infusion
          || h.flags.snapshot || h.flags.nonAtk || h.flags.nonOrdinary;
        triageClass = complex ? 'B-conditional-or-special-hit' : 'A-ordinary-candidate';
      } else if (uniqueMatched.length > 1) {
        triageClass = 'B-ambiguous-name';
      }
      skills.push({
        index,
        groups: [...new Set(occs.map(o => o.group))],
        labels,
        triageClass,
        candidates: uniqueMatched.map(h => ({ id: h.id, field: h.field, stats: h.stats, family: h.family, flags: h.flags })),
      });
    }

    skillRows.push({
      monaKey,
      entity,
      name: doc?.identity?.name ?? monaKey,
      element: doc?.identity?.element ?? mc.element?.toLowerCase() ?? null,
      monaSkillCount: skills.length,
      leylineHitCount: leylineHits.length,
      counts: countBy(skills, s => s.triageClass),
      skills,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    monaCommit,
    buffs: {
      total: buffRows.length,
      byWave: groupCounts(buffRows, r => r.wave, r => r.triageClass),
      byClass: countBy(buffRows, r => r.triageClass),
    },
    sets4pc: {
      total: set4pcRows.length,
      byClass: countBy(set4pcRows, r => r.triageClass),
    },
    skills: {
      characters: skillRows.length,
      totalMonaSkills: skillRows.reduce((s, r) => s + r.monaSkillCount, 0),
      byClass: countBy(skillRows.flatMap(r => r.skills), s => s.triageClass),
    },
  };

  return { summary, buffRows, set4pcRows, skillRows };
}

function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const k = fn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function groupCounts(items, groupFn, subFn) {
  const out = {};
  for (const item of items) {
    const g = groupFn(item);
    const s = subFn(item);
    out[g] ??= { total: 0 };
    out[g].total++;
    out[g][s] = (out[g][s] ?? 0) + 1;
  }
  return out;
}

/** Build compact per-shard JSON work packets for parallel subagents. */
export function buildWorkPackets(triage, { wave, shardSize = 6 } = {}) {
  const textExcerpts = readContentSource(resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/text-excerpts.json'));
  const officialWeapons = readContentSource(resolve(root, 'tools/data/sources/catalog/genshin-db/weapons.json'));
  const officialSets = readContentSource(resolve(root, 'tools/data/sources/catalog/genshin-db/sets.json'));
  const characters = loadEntityMap('characters');
  const weapons = loadEntityMap('weapons');
  const sets = loadEntityMap('artifact-sets');

  const entities = new Map();
  const addItem = (kind, entityId, payload) => {
    if (!entityId) return;
    const key = `${kind}:${entityId}`;
    if (!entities.has(key)) entities.set(key, { kind, entity: entityId, buffs: [], skills: [], set4pc: null });
    const entry = entities.get(key);
    if (payload.buff) entry.buffs.push(payload.buff);
    if (payload.skills) entry.skills.push(...payload.skills);
    if (payload.set4pc) entry.set4pc = payload.set4pc;
  };

  if (wave === 'wave1') {
    for (const row of triage.buffRows.filter(r => ['wave1-weapons', 'wave1-sets'].includes(r.wave) && r.triageClass !== 'covered')) {
      addItem(row.kind, row.entity, { buff: row });
    }
    for (const row of triage.set4pcRows.filter(r => r.triageClass !== 'covered')) {
      addItem('set', row.entity, { set4pc: row });
    }
  } else if (wave === 'wave2') {
    for (const row of triage.buffRows.filter(r => r.wave === 'wave2-character-structured' && r.triageClass !== 'covered')) {
      addItem('character', row.entity, { buff: row });
    }
  } else if (wave === 'wave3') {
    for (const charRow of triage.skillRows) {
      const interesting = charRow.skills.filter(s => ['B-conditional-or-special-hit', 'B-ambiguous-name', 'C-unmatched-skill'].includes(s.triageClass));
      if (interesting.length && charRow.entity) addItem('character', charRow.entity, { skills: interesting });
    }
  } else if (wave === 'wave4') {
    for (const row of triage.buffRows.filter(r => r.wave === 'wave4-character-legacy' && r.triageClass !== 'covered')) {
      addItem('character', row.entity, { buff: row });
    }
  }

  const ordered = [...entities.values()].sort((a, b) => {
    const ae = a.kind === 'character' ? (characters.get(a.entity)?.identity?.element ?? '') : a.kind;
    const be = b.kind === 'character' ? (characters.get(b.entity)?.identity?.element ?? '') : b.kind;
    return ae.localeCompare(be, 'en') || a.entity.localeCompare(b.entity, 'en');
  });

  const enriched = ordered.map(item => {
    if (item.kind === 'character') {
      const doc = characters.get(item.entity);
      const excerpts = {
        talents: textExcerpts.talents?.[item.entity] ?? null,
        constellations: textExcerpts.constellations?.[item.entity] ?? null,
      };
      return {
        ...item,
        name: doc?.identity?.name ?? item.entity,
        element: doc?.identity?.element ?? null,
        productPath: `src/game-data/data/characters/${item.entity}.json`,
        specPath: `tools/data/sources/mona-community/${monaCommit}/specs/characters/${item.entity}.json`,
        leylineFacts: doc?.facts ?? {},
        leylineBuffs: doc ? summarizeLeylineBuffs(doc, 'character') : [],
        leylineHits: doc ? summarizeLeylineHits(doc) : [],
        officialExcerpts: excerpts,
      };
    }
    if (item.kind === 'weapon') {
      const doc = weapons.get(item.entity);
      return {
        ...item,
        name: doc?.name ?? item.entity,
        weaponType: doc?.weaponType ?? null,
        productPath: `src/game-data/data/weapons/${item.entity}.json`,
        specPath: `tools/data/sources/mona-community/${monaCommit}/specs/weapons/${item.entity}.json`,
        leylineFacts: doc?.facts ?? {},
        leylineBuffs: doc ? summarizeLeylineBuffs(doc, 'weapon') : [],
        officialWeapon: officialWeapons[item.entity] ?? null,
      };
    }
    const doc = sets.get(item.entity);
    return {
      ...item,
      name: doc?.name ?? item.entity,
      productPath: `src/game-data/data/artifact-sets/${item.entity}.json`,
      specPath: `tools/data/sources/mona-community/${monaCommit}/specs/sets/${item.entity}.json`,
      leylineFacts: doc?.facts ?? {},
      leylineBuffs: doc ? summarizeLeylineBuffs(doc, 'set') : [],
      officialSet: officialSets[item.entity] ?? null,
    };
  });

  const packets = [];
  for (let i = 0; i < enriched.length; i += shardSize) {
    const slice = enriched.slice(i, i + shardSize);
    const index = Math.floor(i / shardSize) + 1;
    packets.push({
      packetId: `${wave}-shard-${String(index).padStart(2, '0')}`,
      wave,
      entityCount: slice.length,
      entities: slice.map(x => `${x.kind}:${x.entity}`),
      writablePaths: slice.flatMap(x => [x.productPath, x.specPath]),
      items: slice,
    });
  }
  return packets;
}

/** Render a concise Markdown summary report of the triage matrix. */
export function renderTriageMarkdown(triage) {
  const { summary, buffRows, set4pcRows, skillRows } = triage;
  const lines = [
    '# Mona → LeyLine 离线分诊报告',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- Mona 基线：\`${summary.monaCommit}\``,
    '',
    '## 1. Buff 分诊总览（共 ' + summary.buffs.total + ' 个 Mona Buff）',
    '',
    '| 波次 | 总数 | 已覆盖 | A类（已有目标待建spec） | B类（部分/不透明待核） | C类（缺失） | 公共参考 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [wave, counts] of Object.entries(summary.buffs.byWave).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    lines.push(`| ${wave} | ${counts.total} | ${counts.covered ?? 0} | ${counts['A-ready-for-spec'] ?? 0} | ${(counts['B-partial-or-diff'] ?? 0) + (counts['B-opaque-needs-check'] ?? 0)} | ${(counts['C-missing-in-leyline'] ?? 0) + (counts['C-missing-entity'] ?? 0)} | ${counts['reference-public'] ?? 0} |`);
  }

  lines.push(
    '',
    '## 2. 圣遗物四件套分诊（共 ' + summary.sets4pc.total + ' 套）',
    '',
    `- 已覆盖：${summary.sets4pc.byClass.covered ?? 0}`,
    `- A类（LeyLine 已有4件套定义，待建双侧 spec）：${summary.sets4pc.byClass['A-ready-for-spec'] ?? 0}`,
    `- C类（LeyLine 缺4件套定义）：${summary.sets4pc.byClass['C-missing-in-leyline'] ?? 0}`,
    '',
    '## 3. 角色技能菜单分诊（共 ' + summary.skills.characters + ' 角色 / ' + summary.skills.totalMonaSkills + ' 技能项）',
    '',
  );
  for (const [cls, count] of Object.entries(summary.skills.byClass).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    lines.push(`- ${cls}：${count}`);
  }

  const missingBuffs = buffRows.filter(r => r.triageClass.startsWith('C-'));
  lines.push('', `## 4. C类缺失 Buff 清单（${missingBuffs.length} 条）`, '');
  for (const row of missingBuffs) {
    lines.push(`- \`${row.key}\` (${row.wave} / ${row.entity ?? 'unmapped'}): ${row.label ?? ''} — 缺失目标: ${row.missingTargets.join(', ') || 'opaque'}`);
  }

  const partialBuffs = buffRows.filter(r => r.triageClass === 'B-partial-or-diff');
  lines.push('', `## 5. B类部分匹配/疑似差异 Buff（${partialBuffs.length} 条）`, '');
  for (const row of partialBuffs) {
    lines.push(`- \`${row.key}\` (${row.entity}): 已匹配 ${row.matchedTargets.join(', ')}；缺失 ${row.missingTargets.join(', ')}`);
  }

  const topUnmatchedChars = skillRows
    .map(r => ({ ...r, unmatched: r.counts['C-unmatched-skill'] ?? 0, special: r.counts['B-conditional-or-special-hit'] ?? 0 }))
    .filter(r => r.unmatched > 0)
    .sort((a, b) => b.unmatched - a.unmatched)
    .slice(0, 30);
  lines.push('', '## 6. 未匹配技能最多的角色 Top 30', '', '| 角色 | Mona 技能数 | LeyLine 命中数 | 未匹配 | 条件/特殊段 |', '| --- | ---: | ---: | ---: | ---: |');
  for (const r of topUnmatchedChars) {
    lines.push(`| ${r.name} (\`${r.entity ?? r.monaKey}\`) | ${r.monaSkillCount} | ${r.leylineHitCount} | ${r.unmatched} | ${r.special} |`);
  }

  const missingSets = set4pcRows.filter(r => r.triageClass === 'C-missing-in-leyline');
  if (missingSets.length) {
    lines.push('', `## 7. 缺失四件套定义的圣遗物（${missingSets.length} 套）`, '');
    for (const s of missingSets) lines.push(`- \`${s.entity}\` (${s.name}): ${s.officialText4 ?? s.monaText4}`);
  }

  return lines.join('\n') + '\n';
}

export function writeTriageOutputs(outDir, triage, packets = []) {
  const dir = resolve(root, outDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'triage.json'), JSON.stringify(triage, null, 2) + '\n');
  writeFileSync(resolve(dir, 'summary.md'), renderTriageMarkdown(triage));
  if (packets.length) {
    const pDir = resolve(dir, 'packets');
    mkdirSync(pDir, { recursive: true });
    for (const packet of packets) {
      writeFileSync(resolve(pDir, `${packet.packetId}.json`), JSON.stringify(packet, null, 2) + '\n');
    }
  }
}
