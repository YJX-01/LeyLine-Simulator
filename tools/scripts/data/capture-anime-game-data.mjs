import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCalculationData } from '../../lib/catalog-data.mjs';
import { readContentSource, writeContentSource } from '../../lib/content-source.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const DEFAULT_REVISION = 'bd35e243fa436f141f015cf221a6e19d0c34b7ca';
const REPO_URL = 'https://github.com/DimbreathBot/AnimeGameData';
const OUTPUT_ROOT = resolve(root, 'tools/data/sources/anime-game-data');

const RAW_FILES = [
  'ExcelBinOutput/AvatarExcelConfigData.json',
  'ExcelBinOutput/AvatarCurveExcelConfigData.json',
  'ExcelBinOutput/AvatarPromoteExcelConfigData.json',
  'ExcelBinOutput/AvatarSkillDepotExcelConfigData.json',
  'ExcelBinOutput/AvatarSkillExcelConfigData.json',
  'ExcelBinOutput/AvatarTalentExcelConfigData.json',
  'ExcelBinOutput/FetterInfoExcelConfigData.json',
  'ExcelBinOutput/ProudSkillExcelConfigData.json',
  'ExcelBinOutput/WeaponExcelConfigData.json',
  'ExcelBinOutput/WeaponCurveExcelConfigData.json',
  'ExcelBinOutput/WeaponPromoteExcelConfigData.json',
  'ExcelBinOutput/EquipAffixExcelConfigData.json',
  'ExcelBinOutput/ReliquarySetExcelConfigData.json',
  'ExcelBinOutput/ReliquaryCodexExcelConfigData.json',
  'ExcelBinOutput/ReliquaryExcelConfigData.json',
  'ExcelBinOutput/ReliquaryAffixExcelConfigData.json',
  'ExcelBinOutput/ReliquaryLevelExcelConfigData.json',
  'ExcelBinOutput/ElementCoeffExcelConfigData.json',
  'TextMap/TextMapCHS.json',
  'TextMap/TextMap_MediumCHS.json',
  'TextMap/TextMapEN.json',
  'TextMap/TextMap_MediumEN.json',
];

const BASE_STAT_PROPS = new Set([
  'FIGHT_PROP_BASE_HP',
  'FIGHT_PROP_BASE_DEFENSE',
  'FIGHT_PROP_BASE_ATTACK',
]);

const CURVE_STAT_NAMES = {
  FIGHT_PROP_BASE_HP: 'hp',
  FIGHT_PROP_BASE_ATTACK: 'attack',
  FIGHT_PROP_BASE_DEFENSE: 'defense',
};

const REGION_BY_ASSOC = {
  ASSOC_TYPE_MONDSTADT: '蒙德',
  ASSOC_TYPE_LIYUE: '璃月',
  ASSOC_TYPE_NODKRAI_ZIBAI: '璃月',
  ASSOC_TYPE_INAZUMA: '稻妻',
  ASSOC_TYPE_SUMERU: '须弥',
  ASSOC_TYPE_FONTAINE: '枫丹',
  ASSOC_TYPE_NATLAN: '纳塔',
  ASSOC_TYPE_NODKRAI: '挪德卡莱',
  ASSOC_TYPE_SNEZHNAYA: '至冬',
  ASSOC_TYPE_SNEZHNAYA_STAR: '至冬',
  ASSOC_TYPE_FATUI: '至冬',
};

const SLOT_ORDER = ['flower', 'plume', 'sands', 'goblet', 'circlet'];
const EQUIP_TO_SLOT = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
};

const TRAVELER_DEPOT_ELEMENTS = new Map([
  [501, 'physical'],
  [502, 'pyro'],
  [503, 'hydro'],
  [504, 'anemo'],
  [505, 'cryo'],
  [506, 'geo'],
  [507, 'electro'],
  [508, 'dendro'],
  [701, 'physical'],
  [702, 'pyro'],
  [703, 'hydro'],
  [704, 'anemo'],
  [705, 'cryo'],
  [706, 'geo'],
  [707, 'electro'],
  [708, 'dendro'],
]);

const MANEKIN_DEPOT_ELEMENTS = new Map([
  [11701, 'physical'],
  [11702, 'pyro'],
  [11703, 'hydro'],
  [11704, 'electro'],
  [11705, 'cryo'],
  [11706, 'anemo'],
  [11707, 'geo'],
  [11708, 'dendro'],
  [11801, 'physical'],
  [11802, 'pyro'],
  [11803, 'hydro'],
  [11804, 'electro'],
  [11805, 'cryo'],
  [11806, 'anemo'],
  [11807, 'geo'],
  [11808, 'dendro'],
]);

function parseOptions(argv) {
  let revision = DEFAULT_REVISION;
  let fetchOnly = false;
  let offline = false;
  let refresh = false;
  let verify = false;
  let concurrency = 4;
  for (const arg of argv) {
    if (arg === '--fetch-only') fetchOnly = true;
    else if (arg === '--offline') offline = true;
    else if (arg === '--refresh') refresh = true;
    else if (arg === '--verify') verify = true;
    else if (arg.startsWith('--revision=')) revision = arg.slice('--revision='.length).trim();
    else if (arg.startsWith('--concurrency=')) {
      concurrency = Number(arg.slice('--concurrency='.length));
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
        throw new Error('Invalid --concurrency value (expected 1..16).');
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!/^[0-9a-f]{40}$/i.test(revision)) {
    throw new Error(`Invalid --revision commit SHA: ${revision}`);
  }
  return { revision: revision.toLowerCase(), fetchOnly, offline, refresh, verify, concurrency };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function portable(filePath) {
  return relative(root, filePath).replaceAll('\\', '/');
}

function normalizeNewlines(value) {
  return typeof value === 'string' ? value.replaceAll('\\n', '\n') : '';
}

function stripRichTags(value) {
  return value
    .replace(/^#/, '')
    .replace(/\{TIMEZONE\}/g, '')
    .replace(/\{LINK#[^}]+\}|\{\/LINK\}/g, '')
    .replace(/<\/?(?:color|i)(?:=[^>]*)?>/gi, '');
}

function splitFlavorAndDescription(raw) {
  const withNewlines = normalizeNewlines(raw);
  const flavorMatches = [...withNewlines.matchAll(/<i>([\s\S]*?)<\/i>/gi)];
  const withoutFlavorRaw = flavorMatches.length ? withNewlines.replace(/\n*<i>[\s\S]*?<\/i>\n*/gi, '\n') : withNewlines;
  const description = withoutFlavorRaw.replace(/\n{3,}/g, '\n\n').trim();
  const flavorText = flavorMatches.length
    ? flavorMatches.map(match => stripRichTags(match[1]).trim()).filter(Boolean).join('\n')
    : undefined;
  return { description, flavorText };
}

function cleanInlineText(raw) {
  return stripRichTags(normalizeNewlines(raw)).trim();
}

async function fetchBytes(url) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'LeyLine-Simulator/0.2 (offline AnimeGameData reference capture)' },
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
          await new Promise(timer => setTimeout(timer, attempt * 1500));
          continue;
        }
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt < attempts) {
        await new Promise(timer => setTimeout(timer, attempt * 1500));
        continue;
      }
      throw error;
    }
  }
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

async function ensureRawFiles(options) {
  const rawRoot = resolve(root, '.references/anime-game-data', options.revision);
  const manifestPath = resolve(rawRoot, 'manifest.json');
  const prior = existsSync(manifestPath)
    ? new Map(JSON.parse(readFileSync(manifestPath, 'utf8')).files.map(entry => [entry.path, entry]))
    : new Map();
  const baseUrl = `https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/${options.revision}/`;
  const records = new Array(RAW_FILES.length);

  await runPool(RAW_FILES.map((file, index) => ({ file, index })), options.concurrency, async ({ file, index }) => {
    const target = resolve(rawRoot, file);
    if (!options.refresh && existsSync(target)) {
      const bytes = readFileSync(target);
      const old = prior.get(file);
      records[index] = {
        path: file,
        url: baseUrl + file,
        localPath: portable(target),
        bytes: bytes.length,
        sha256: sha256(bytes),
        fetchedAt: old?.fetchedAt ?? new Date().toISOString(),
        cached: true,
      };
      return;
    }
    if (options.offline) {
      throw new Error(`Missing cached raw file in --offline mode: ${portable(target)}`);
    }
    const url = baseUrl + file;
    const bytes = await fetchBytes(url);
    JSON.parse(bytes.toString('utf8'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    records[index] = {
      path: file,
      url,
      localPath: portable(target),
      bytes: bytes.length,
      sha256: sha256(bytes),
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  });

  const manifest = {
    formatVersion: 1,
    repository: REPO_URL,
    revision: options.revision,
    capturedAt: new Date().toISOString(),
    files: records.map(({ cached, ...entry }) => entry),
  };
  if (!options.offline || !existsSync(manifestPath)) {
    mkdirSync(rawRoot, { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { rawRoot, manifest };
}

function buildCurveTable(rows) {
  const result = {};
  for (const row of rows) {
    const levelEntry = {};
    for (const info of row.curveInfos) {
      levelEntry[info.type] = info.value;
    }
    result[String(row.level)] = levelEntry;
  }
  return result;
}

function buildTalentParamsForDepot(depot, skillById, proudByGroup, { keepZeroParams = false } = {}) {
  const slots = [
    ['combat1', depot.skills?.[0]],
    ['combat2', depot.skills?.[1]],
    ...(depot.skills?.[2] ? [['combatsp', depot.skills[2]]] : []),
    ...(depot.skills?.[3] ? [['combatju', depot.skills[3]]] : []),
    ['combat3', depot.energySkill],
  ];
  const params = {};
  const names = {};
  for (const [slotKey, skillId] of slots) {
    if (!skillId) continue;
    const skill = skillById.get(skillId);
    if (!skill?.proudSkillGroupId) continue;
    const rows = proudByGroup.get(skill.proudSkillGroupId);
    if (!rows?.length) continue;
    const count = rows[0].paramList.length;
    const slotParams = {};
    for (let index = 0; index < count; index++) {
      const series = rows.map(row => row.paramList[index]);
      if (!keepZeroParams && series.every(value => value === 0)) continue;
      slotParams[`param${index + 1}`] = series;
    }
    params[slotKey] = slotParams;
    names[slotKey] = skill.nameTextMapHash;
  }
  return { params, names };
}

function buildTalentTextRecord(id, name, depot, skillById, proudByGroup, textMap, options = {}) {
  const record = { id, name };
  const combatSlots = [
    ['combat1', depot.skills?.[0]],
    ['combat2', depot.skills?.[1]],
  ];
  if (depot.skills?.[2]) {
    combatSlots.push(['combatsp', depot.skills[2]]);
  }
  if (depot.skills?.[3]) {
    combatSlots.push(['combatju', depot.skills[3]]);
  }
  if (depot.energySkill) {
    combatSlots.push(['combat3', depot.energySkill]);
  }
  for (const [slotKey, skillId] of combatSlots) {
    if (!skillId) continue;
    const skill = skillById.get(skillId);
    if (!skill) continue;
    const rawDesc = textMap(skill.descTextMapHash);
    const { description, flavorText } = splitFlavorAndDescription(rawDesc);
    const labels = [];
    if (skill.proudSkillGroupId) {
      const firstLevel = proudByGroup.get(skill.proudSkillGroupId)?.[0];
      for (const hash of firstLevel?.paramDescList ?? []) {
        const line = cleanInlineText(textMap(hash));
        if (line) labels.push(line);
      }
    }
    const entry = {
      name: cleanInlineText(textMap(skill.nameTextMapHash)),
      description,
      ...(flavorText ? { flavorText } : {}),
      icon: skill.skillIcon ?? '',
      attributes: { labels },
    };
    record[slotKey] = entry;
  }

  let passiveIndex = 0;
  for (const item of depot.inherentProudSkillOpens ?? []) {
    if (!item?.proudSkillGroupId) continue;
    const row = proudByGroup.get(item.proudSkillGroupId)?.[0];
    if (!row || row.isHideLifeProudSkill) continue;
    passiveIndex++;
    const rawDesc = textMap(row.descTextMapHash);
    const { description, flavorText } = splitFlavorAndDescription(rawDesc);
    if (!options.includeEmptyPassives && !stripRichTags(description) && !cleanInlineText(textMap(row.nameTextMapHash))) continue;
    record[`passive${passiveIndex}`] = {
      name: cleanInlineText(textMap(row.nameTextMapHash)),
      description,
      ...(flavorText ? { flavorText } : {}),
      icon: row.icon ?? '',
    };
  }
  return record;
}

function buildConstellationTextRecord(id, name, depot, talentById, textMap) {
  const record = { id, name };
  (depot.talents ?? []).forEach((talentId, index) => {
    if (!talentId) return;
    const talent = talentById.get(talentId);
    if (!talent) return;
    const rawDesc = textMap(talent.descTextMapHash);
    const { description } = splitFlavorAndDescription(rawDesc);
    record[`c${index + 1}`] = {
      name: cleanInlineText(textMap(talent.nameTextMapHash)),
      description,
      icon: talent.icon ?? '',
    };
  });
  return record;
}

function writeStrictJson(relativePath, value) {
  const fullPath = resolve(OUTPUT_ROOT, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeContentSource(fullPath, value);
}

function normalizeSnapshot(rawRoot, manifest, options) {
  const loadRaw = file => JSON.parse(readFileSync(resolve(rawRoot, file), 'utf8'));

  const tmChsMerged = {
    ...loadRaw('TextMap/TextMap_MediumCHS.json'),
    ...loadRaw('TextMap/TextMapCHS.json'),
  };
  const tmEnMerged = {
    ...loadRaw('TextMap/TextMap_MediumEN.json'),
    ...loadRaw('TextMap/TextMapEN.json'),
  };
  const textChs = hash => tmChsMerged[String(hash)] ?? '';
  const textEn = hash => tmEnMerged[String(hash)] ?? '';

  const avatarRows = loadRaw('ExcelBinOutput/AvatarExcelConfigData.json');
  const avatarById = new Map(avatarRows.map(row => [row.id, row]));
  const avatarPromotes = new Map();
  for (const row of loadRaw('ExcelBinOutput/AvatarPromoteExcelConfigData.json')) {
    if (!avatarPromotes.has(row.avatarPromoteId)) avatarPromotes.set(row.avatarPromoteId, []);
    avatarPromotes.get(row.avatarPromoteId).push(row);
  }
  for (const list of avatarPromotes.values()) list.sort((a, b) => a.unlockMaxLevel - b.unlockMaxLevel);

  const depotById = new Map(loadRaw('ExcelBinOutput/AvatarSkillDepotExcelConfigData.json').map(row => [row.id, row]));
  const skillById = new Map(loadRaw('ExcelBinOutput/AvatarSkillExcelConfigData.json').map(row => [row.id, row]));
  const talentById = new Map(loadRaw('ExcelBinOutput/AvatarTalentExcelConfigData.json').map(row => [row.talentId, row]));
  const proudByGroup = new Map();
  for (const row of loadRaw('ExcelBinOutput/ProudSkillExcelConfigData.json')) {
    if (!proudByGroup.has(row.proudSkillGroupId)) proudByGroup.set(row.proudSkillGroupId, []);
    proudByGroup.get(row.proudSkillGroupId).push(row);
  }
  for (const list of proudByGroup.values()) list.sort((a, b) => a.level - b.level);

  const fetterByAvatarId = new Map(loadRaw('ExcelBinOutput/FetterInfoExcelConfigData.json').map(row => [row.avatarId, row]));
  const weaponById = new Map(loadRaw('ExcelBinOutput/WeaponExcelConfigData.json').map(row => [row.id, row]));
  const weaponPromotes = new Map();
  for (const row of loadRaw('ExcelBinOutput/WeaponPromoteExcelConfigData.json')) {
    if (!weaponPromotes.has(row.weaponPromoteId)) weaponPromotes.set(row.weaponPromoteId, []);
    weaponPromotes.get(row.weaponPromoteId).push(row);
  }
  for (const list of weaponPromotes.values()) list.sort((a, b) => a.unlockMaxLevel - b.unlockMaxLevel);

  const equipAffixById = new Map();
  for (const row of loadRaw('ExcelBinOutput/EquipAffixExcelConfigData.json')) {
    if (!equipAffixById.has(row.id)) equipAffixById.set(row.id, []);
    equipAffixById.get(row.id).push(row);
  }
  for (const list of equipAffixById.values()) list.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  const setById = new Map(loadRaw('ExcelBinOutput/ReliquarySetExcelConfigData.json').map(row => [row.setId, row]));
  const relicById = new Map(loadRaw('ExcelBinOutput/ReliquaryExcelConfigData.json').map(row => [row.id, row]));
  const codexRarities = new Map();
  for (const row of loadRaw('ExcelBinOutput/ReliquaryCodexExcelConfigData.json')) {
    if (!codexRarities.has(row.suitId)) codexRarities.set(row.suitId, []);
    codexRarities.get(row.suitId).push(row.level);
  }
  for (const list of codexRarities.values()) list.sort((a, b) => a - b);

  const enkaCatalog = readContentSource(resolve(root, 'src/game-data/data/tables/enka-catalog.json'));
  const canonCharMeta = id => readContentSource(resolve(root, `src/game-data/data/characters/${id}.json`));
  const canonSetMeta = id => readContentSource(resolve(root, `src/game-data/data/artifact-sets/${id}.json`));

  const baseCharacters = {};
  const enkaCharacters = {};
  const talentParams = {};
  const talentTexts = {};
  const constellationTexts = {};

  // Base unhyphenated character IDs + Enka derivation
  const baseIdPairs = [];
  for (const [key, entry] of Object.entries(enkaCatalog.characters)) {
    const [avatarIdText, depotIdText] = key.split('-');
    const avatarId = Number(avatarIdText);
    const avatar = avatarById.get(avatarId);
    if (!avatar) throw new Error(`Missing AvatarExcelConfigData row for ${key} (${entry.id})`);
    const depotId = depotIdText ? Number(depotIdText) : avatar.skillDepotId;
    const depot = depotById.get(depotId);
    if (!depot) throw new Error(`Missing AvatarSkillDepotExcelConfigData row ${depotId} for ${key} (${entry.id})`);

    const combatSkills = [depot.skills?.[0], depot.skills?.[1], depot.energySkill]
      .filter(skillId => Number.isInteger(skillId) && skillId > 0);
    const element = TRAVELER_DEPOT_ELEMENTS.get(depotId) ?? MANEKIN_DEPOT_ELEMENTS.get(depotId);
    enkaCharacters[key] = {
      id: entry.id,
      ...(depotIdText || entry.skillDepotId !== undefined ? { skillDepotId: depotId } : {}),
      ...(element && element !== 'physical' ? { element } : {}),
      skills: combatSkills,
    };

    if (!key.includes('-')) {
      baseIdPairs.push([entry.id, avatarId]);
    }
  }

  baseIdPairs.sort(([left], [right]) => left.localeCompare(right, 'en'));

  for (const [id, avatarId] of baseIdPairs) {
    const avatar = avatarById.get(avatarId);
    const depot = depotById.get(avatar.skillDepotId);
    const fetter = fetterByAvatarId.get(avatarId);
    const canon = canonCharMeta(id);
    const curves = {};
    for (const prop of avatar.propGrowCurves) {
      const short = CURVE_STAT_NAMES[prop.type];
      if (short) curves[short] = prop.growCurve;
    }
    const promotes = avatarPromotes.get(avatar.avatarPromoteId) ?? [];
    const specializedProp = promotes.at(-1)?.addProps.find(prop => !BASE_STAT_PROPS.has(prop.propType))?.propType;
    const promotion = promotes.map(row => {
      const prop = type => row.addProps.find(item => item.propType === type)?.value ?? 0;
      return {
        maxlevel: row.unlockMaxLevel,
        hp: prop('FIGHT_PROP_BASE_HP'),
        attack: prop('FIGHT_PROP_BASE_ATTACK'),
        defense: prop('FIGHT_PROP_BASE_DEFENSE'),
        specialized: specializedProp ? prop(specializedProp) : 0,
      };
    });

    const isRestrictedBase = ['aether', 'lumine', 'manekin', 'manekina'].includes(id);
    const { params, names } = isRestrictedBase ? { params: {}, names: {} } : buildTalentParamsForDepot(depot, skillById, proudByGroup);
    const localizedNames = Object.fromEntries(Object.entries(names).map(([slot, hash]) => [slot, cleanInlineText(textChs(hash))]));

    const rarity = avatar.qualityType === 'QUALITY_ORANGE' || avatar.qualityType === 'QUALITY_ORANGE_SP' ? 5 : 4;
    const region = fetter ? (REGION_BY_ASSOC[fetter.avatarAssocType] ?? '') : '';
    const title = fetter ? cleanInlineText(textChs(fetter.avatarTitleTextMapHash)) : '';
    const displayName = id === 'aether' || id === 'lumine' ? canon.identity.name : cleanInlineText(textChs(avatar.nameTextMapHash));
    const description = cleanInlineText(textChs(avatar.descTextMapHash));
    const elementType = canon.identity.element === 'physical' ? 'ELEMENT_NONE' : `ELEMENT_${canon.identity.element.toUpperCase()}`;

    baseCharacters[id] = {
      metadata: {
        id: avatar.id,
        name: displayName,
        title,
        description,
        elementType,
        weaponType: avatar.weaponType,
        rarity,
        region,
        iconName: avatar.iconName,
        sideIconName: avatar.sideIconName,
      },
      stats: {
        base: {
          hp: avatar.hpBase,
          attack: avatar.attackBase,
          defense: avatar.defenseBase,
          critrate: avatar.critical,
          critdmg: avatar.criticalHurt,
        },
        curve: curves,
        specialized: specializedProp ?? '',
        promotion,
      },
      talents: params,
      names: localizedNames,
    };

    if (!isRestrictedBase) {
      talentParams[id] = params;
      talentTexts[id] = buildTalentTextRecord(depot.id, displayName, depot, skillById, proudByGroup, textChs);
      constellationTexts[id] = buildConstellationTextRecord(depot.id, displayName, depot, talentById, textChs);
    }
  }

  // Traveler & Manekin base + elemental forms
  const travelerElements = ['pyro', 'hydro', 'anemo', 'cryo', 'geo', 'electro', 'dendro'];
  for (const element of travelerElements) {
    const aetherDepotId = [...TRAVELER_DEPOT_ELEMENTS.entries()].find(([did, el]) => did < 600 && el === element)?.[0];
    const lumineDepotId = [...TRAVELER_DEPOT_ELEMENTS.entries()].find(([did, el]) => did > 600 && el === element)?.[0];
    if (!aetherDepotId || !lumineDepotId) throw new Error(`Missing traveler depot for ${element}`);
    const travelerKey = `traveler${element}`;
    const lumineDepot = depotById.get(lumineDepotId);
    const aetherDepot = depotById.get(aetherDepotId);
    talentParams[travelerKey] = buildTalentParamsForDepot(lumineDepot, skillById, proudByGroup).params;
    talentParams[`lumine-${element}`] = talentParams[travelerKey];
    talentParams[`aether-${element}`] = buildTalentParamsForDepot(aetherDepot, skillById, proudByGroup).params;
    const travelerLabel = `旅行者（${{ pyro: '火', hydro: '水', anemo: '风', cryo: '冰', geo: '岩', electro: '雷', dendro: '草' }[element]}）`;
    talentTexts[travelerKey] = buildTalentTextRecord(lumineDepotId, travelerLabel, lumineDepot, skillById, proudByGroup, textChs);
    constellationTexts[travelerKey] = buildConstellationTextRecord(lumineDepotId, travelerLabel, lumineDepot, talentById, textChs);
  }

  // Restricted bases + Manekin elemental depots for base-and-manekin.json & talent-params.json
  const bindings = {};
  const recordedDepotIds = new Set();
  const recordedSkillIds = new Set();
  const recordedTextHashes = new Set();

  const registerDepotAndSkills = depotId => {
    const depot = depotById.get(depotId);
    if (!depot) throw new Error(`Missing depot ${depotId}`);
    recordedDepotIds.add(depotId);
    for (const skillId of [...(depot.skills ?? []), depot.energySkill].filter(n => Number.isInteger(n) && n > 0)) {
      recordedSkillIds.add(skillId);
      const skill = skillById.get(skillId);
      if (skill) {
        recordedTextHashes.add(skill.nameTextMapHash);
        recordedTextHashes.add(skill.descTextMapHash);
        const firstProud = proudByGroup.get(skill.proudSkillGroupId)?.[0];
        if (firstProud) {
          for (const hash of firstProud.paramDescList ?? []) {
            if (hash) recordedTextHashes.add(hash);
          }
        }
      }
    }
    for (const item of depot.inherentProudSkillOpens ?? []) {
      if (!item?.proudSkillGroupId) continue;
      const row = proudByGroup.get(item.proudSkillGroupId)?.[0];
      if (row) {
        recordedTextHashes.add(row.nameTextMapHash);
        recordedTextHashes.add(row.descTextMapHash);
      }
    }
  };

  for (const [id, depotId] of [['aether', 501], ['lumine', 701], ['manekin', 11701], ['manekina', 11801]]) {
    const depot = depotById.get(depotId);
    bindings[id] = { baseId: id, element: 'physical', skillDepotId: depotId };
    talentParams[id] = buildTalentParamsForDepot(depot, skillById, proudByGroup, { keepZeroParams: true }).params;
    registerDepotAndSkills(depotId);
  }
  for (const [depotId, element] of MANEKIN_DEPOT_ELEMENTS.entries()) {
    if (element === 'physical') continue;
    const baseId = depotId < 11800 ? 'manekin' : 'manekina';
    const id = `${baseId}-${element}`;
    const depot = depotById.get(depotId);
    bindings[id] = { baseId, element, skillDepotId: depotId };
    talentParams[id] = buildTalentParamsForDepot(depot, skillById, proudByGroup, { keepZeroParams: true }).params;
    registerDepotAndSkills(depotId);
  }
  for (const depotId of [504, 704]) registerDepotAndSkills(depotId);

  const skillDepots = Object.fromEntries(
    [...recordedDepotIds].sort((a, b) => a - b).map(id => {
      const d = depotById.get(id);
      const passives = (d.inherentProudSkillOpens ?? [])
        .filter(item => item?.proudSkillGroupId)
        .map(item => {
          const row = proudByGroup.get(item.proudSkillGroupId)?.[0];
          return row && !row.isHideLifeProudSkill ? {
            proudSkillGroupId: item.proudSkillGroupId,
            ...(item.needAvatarPromoteLevel !== undefined ? { needAvatarPromoteLevel: item.needAvatarPromoteLevel } : {}),
            nameTextMapHash: row.nameTextMapHash,
            descTextMapHash: row.descTextMapHash,
            icon: row.icon ?? '',
          } : null;
        })
        .filter(Boolean);
      return [String(id), {
        id: d.id,
        energySkill: d.energySkill ?? 0,
        skills: d.skills ?? [],
        inherentProudSkillOpens: d.inherentProudSkillOpens ?? [],
        passives,
        talents: d.talents ?? [],
      }];
    }),
  );
  const skills = Object.fromEntries(
    [...recordedSkillIds].sort((a, b) => a - b).map(id => {
      const s = skillById.get(id);
      const firstProud = s.proudSkillGroupId ? proudByGroup.get(s.proudSkillGroupId)?.[0] : undefined;
      return [String(id), {
        id: s.id,
        nameTextMapHash: s.nameTextMapHash,
        descTextMapHash: s.descTextMapHash,
        proudSkillGroupId: s.proudSkillGroupId,
        skillIcon: s.skillIcon ?? '',
        ...(firstProud?.paramDescList ? { paramDescList: firstProud.paramDescList } : {}),
      }];
    }),
  );
  const textMap = {};
  for (const hash of [...recordedTextHashes].filter(Boolean).sort((a, b) => a - b)) {
    const text = textChs(hash);
    if (text) textMap[String(hash)] = text;
  }

  // Traveler base normal units (replaces character-text/traveler-normal-units.json)
  const travelerNormalUnits = { textEntries: [], bindings: [] };
  for (const [id, depotId, indices] of [
    ['aether', 501, [[1, 0], [4, 3], [6, 5], [7, 5], [9, 7]]],
    ['lumine', 701, [[1, 0], [6, 5], [7, 5], [9, 7]]],
  ]) {
    const depot = depotById.get(depotId);
    const skill = skillById.get(depot.skills[0]);
    const proud = proudByGroup.get(skill.proudSkillGroupId)[0];
    const seenDesc = new Set();
    for (const [paramNum, descIdx] of indices) {
      const hash = proud.paramDescList[descIdx];
      const text = textChs(hash);
      if (!text) throw new Error(`Missing traveler normal paramDesc hash ${hash} for ${id}`);
      if (!seenDesc.has(descIdx)) {
        seenDesc.add(descIdx);
        travelerNormalUnits.textEntries.push({
          characterId: id,
          sourceTextKey: String(hash),
          text,
          sourceDescriptionIndex: descIdx,
        });
      }
      travelerNormalUnits.bindings.push({
        file: `src/game-data/data/characters/${id}.json`,
        parameter: `param${paramNum}`,
        unit: 'ratio',
        sourceTextKey: String(hash),
      });
    }
  }

  // Weapons
  const weaponsOut = {};
  const weaponPairs = Object.entries(enkaCatalog.weapons)
    .map(([wid, id]) => [id, Number(wid)])
    .sort(([a], [b]) => a.localeCompare(b, 'en'));
  for (const [id, weaponId] of weaponPairs) {
    const weapon = weaponById.get(weaponId);
    if (!weapon) throw new Error(`Missing WeaponExcelConfigData row ${weaponId} for ${id}`);
    const baseAttackProp = weapon.weaponProp.find(p => p.propType === 'FIGHT_PROP_BASE_ATTACK');
    const specProp = weapon.weaponProp.find(p => p.propType !== 'FIGHT_PROP_BASE_ATTACK');
    const promotes = weaponPromotes.get(weapon.weaponPromoteId) ?? [];
    const promotion = promotes.map(row => ({
      maxlevel: row.unlockMaxLevel,
      attack: row.addProps.find(p => p.propType === 'FIGHT_PROP_BASE_ATTACK')?.value ?? 0,
    }));
    const meta = {
      id: weapon.id,
      name: cleanInlineText(textChs(weapon.nameTextMapHash)),
      weaponType: weapon.weaponType,
      rarity: weapon.rankLevel,
      iconName: weapon.icon,
      awakenIconName: weapon.awakenIcon,
    };
    const affixId = weapon.skillAffix?.[0];
    if (affixId) {
      const rows = equipAffixById.get(affixId) ?? [];
      rows.slice(0, 5).forEach((row, index) => {
        const raw = normalizeNewlines(textChs(row.descTextMapHash));
        const values = [...raw.matchAll(/<color=#[0-9A-Fa-f]+>([^<]+)<\/color>/g)]
          .map(match => match[1])
          .filter(value => /\d/.test(value));
        meta[`r${index + 1}`] = {
          description: cleanInlineText(raw),
          values,
        };
      });
    }
    weaponsOut[id] = {
      metadata: meta,
      stats: {
        base: {
          attack: baseAttackProp?.initValue ?? 0,
          specialized: specProp?.initValue ?? 0,
        },
        curve: {
          attack: baseAttackProp?.type,
          ...(specProp?.type ? { specialized: specProp.type } : {}),
        },
        ...(specProp?.propType ? { specialized: specProp.propType } : {}),
        promotion,
      },
    };
  }

  // Sets
  const setsOut = {};
  const setPairs = Object.entries(enkaCatalog.sets)
    .map(([sid, id]) => [id, Number(sid)])
    .sort(([a], [b]) => a.localeCompare(b, 'en'));
  for (const [id, setId] of setPairs) {
    const row = setById.get(setId);
    if (!row) throw new Error(`Missing ReliquarySetExcelConfigData row ${setId} for ${id}`);
    const canon = canonSetMeta(id);
    const rarities = codexRarities.get(setId);
    if (!rarities?.length) throw new Error(`Missing ReliquaryCodexExcelConfigData rarities for ${id} (${setId})`);
    const slots = [];
    const icons = {};
    for (const relicId of row.containsList ?? []) {
      const relic = relicById.get(relicId);
      const slot = EQUIP_TO_SLOT[relic?.equipType];
      if (!slot) continue;
      if (!slots.includes(slot)) slots.push(slot);
      icons[slot] = relic.icon;
    }
    slots.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
    const entry = {
      id: row.setId,
      rarityList: rarities,
      slots,
      name: cleanInlineText(textChs(equipAffixById.get(row.equipAffixId)?.[0]?.nameTextMapHash) || canon.name),
      icons,
    };
    const affixes = equipAffixById.get(row.equipAffixId) ?? [];
    row.setNeedNum.forEach((needCount, index) => {
      const affix = affixes[index];
      if (affix) entry[`effect${needCount}Pc`] = cleanInlineText(textChs(affix.descTextMapHash));
    });
    setsOut[id] = entry;
  }

  // Curves, Reliquary, ElementCoeff
  const characterCurves = buildCurveTable(loadRaw('ExcelBinOutput/AvatarCurveExcelConfigData.json'));
  const weaponCurves = buildCurveTable(loadRaw('ExcelBinOutput/WeaponCurveExcelConfigData.json'));

  const reliquaryAffixes = {};
  for (const row of loadRaw('ExcelBinOutput/ReliquaryAffixExcelConfigData.json')) {
    reliquaryAffixes[String(row.id)] = {
      id: row.id,
      depotId: row.depotId,
      groupId: row.groupId,
      propType: row.propType,
      propValue: row.propValue,
    };
  }
  const reliquaryMainLevels = {};
  for (const row of loadRaw('ExcelBinOutput/ReliquaryLevelExcelConfigData.json')) {
    if (!Number.isInteger(row.rank)) continue;
    reliquaryMainLevels[`${row.rank}/${row.level}`] = {
      rank: row.rank,
      level: row.level,
      addProps: row.addProps,
    };
  }

  const elementCoeff = loadRaw('ExcelBinOutput/ElementCoeffExcelConfigData.json')
    .slice(0, 101)
    .map(row => row.playerElementLevelCo);

  // English excerpts (replaces the 3 English genshin-db files)
  const adventurerRow = setById.get(10010);
  const adventurerAffixes = equipAffixById.get(adventurerRow.equipAffixId) ?? [];
  const englishExcerpts = {
    sets: {
      adventurer: {
        id: 10010,
        name: cleanInlineText(textEn(adventurerAffixes[0]?.nameTextMapHash)),
        effect2Pc: cleanInlineText(textEn(adventurerAffixes[0]?.descTextMapHash)),
        effect4Pc: cleanInlineText(textEn(adventurerAffixes[1]?.descTextMapHash)),
      },
    },
    talents: {
      ifa: buildTalentTextRecord(11301, 'Ifa', depotById.get(11301), skillById, proudByGroup, textEn),
      varesa: buildTalentTextRecord(11101, 'Varesa', depotById.get(11101), skillById, proudByGroup, textEn),
    },
  };

  // Write unified normalized snapshot (12 compact root files); write text cache to gitignored .references/.
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  rmSync(resolve(OUTPUT_ROOT, 'text'), { recursive: true, force: true });
  rmSync(resolve(OUTPUT_ROOT, 'ability-facts'), { recursive: true, force: true });
  writeStrictJson('manifest.json', {
    formatVersion: 1,
    repository: REPO_URL,
    revision: options.revision,
    capturedAt: manifest.capturedAt,
    rawFiles: manifest.files.map(({ path: filePath, bytes, sha256: hash }) => ({
      path: filePath,
      bytes,
      sha256: hash,
    })),
  });
  writeStrictJson('characters.json', baseCharacters);
  writeStrictJson('weapons.json', weaponsOut);
  writeStrictJson('sets.json', setsOut);
  writeStrictJson('character-curves.json', characterCurves);
  writeStrictJson('weapon-curves.json', weaponCurves);
  writeStrictJson('talent-params.json', talentParams);
  writeStrictJson('reliquary.json', { affixes: reliquaryAffixes, mainLevels: reliquaryMainLevels });
  writeStrictJson('element-coeff.json', elementCoeff);
  writeStrictJson('enka-ids.json', { characters: enkaCharacters });
  writeStrictJson('base-and-manekin.json', {
    bindings,
    skillDepots,
    skills,
    textMap,
    travelerNormalUnits,
  });

  const pickIconSlots = (record, slots) => Object.fromEntries(
    slots
      .filter(slot => record[slot]?.icon && record[slot].icon !== 'None')
      .map(slot => [slot, { name: record[slot].name, icon: record[slot].icon }]),
  );
  const sortByKey = object => Object.fromEntries(
    Object.entries(object).sort(([left], [right]) => left.localeCompare(right, 'en')),
  );
  const skillIcons = {
    talents: sortByKey(Object.fromEntries(
      Object.entries(talentTexts).map(([key, record]) => [
        key,
        pickIconSlots(record, ['combat1', 'combat2', 'combat3', 'passive1', 'passive2', 'passive3', 'passive4']),
      ]),
    )),
    constellations: sortByKey(Object.fromEntries(
      Object.entries(constellationTexts).map(([key, record]) => [
        key,
        pickIconSlots(record, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']),
      ]),
    )),
  };
  writeStrictJson('skill-icons.json', skillIcons);

  const refTextRoot = resolve(rawRoot, '.normalized', 'text');
  rmSync(refTextRoot, { recursive: true, force: true });
  const writeRefText = (relativePath, value) => {
    const fullPath = resolve(refTextRoot, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeContentSource(fullPath, value);
  };
  for (const [key, value] of Object.entries(talentTexts)) {
    writeRefText(`talents/${key}.json`, value);
  }
  for (const [key, value] of Object.entries(constellationTexts)) {
    writeRefText(`constellations/${key}.json`, value);
  }
  writeRefText('english-excerpts.json', englishExcerpts);

  return {
    characters: baseCharacters,
    weapons: weaponsOut,
    sets: setsOut,
    characterCurves,
    weaponCurves,
    talentParams,
    reliquary: { affixes: reliquaryAffixes, mainLevels: reliquaryMainLevels },
    elementCoeff,
    enkaIds: enkaCharacters,
    skillIcons,
    talentTexts,
    constellationTexts,
    baseAndManekin: { bindings, skillDepots, skills, textMap, travelerNormalUnits },
    englishExcerpts,
  };
}

function verifyNormalizedSnapshot(snapshot) {
  const counts = {};
  const diffs = [];
  const check = (family, actual, expected, field) => {
    counts[family] = (counts[family] ?? 0) + 1;
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual !== expected) {
      diffs.push({ family, field, actual, expected });
    }
  };

  // 1. Cross-check all numeric tables in src/game-data/data/
  const charFiles = readdirSync(resolve(root, 'src/game-data/data/characters')).filter(f => f.endsWith('.json')).sort();
  const basePropKeys = { critRate: 'critrate', critDamage: 'critdmg' };
  const innateEm = readContentSource(resolve(root, 'tools/data/sources/catalog/innate-base-stats.json')).characters;

  for (const file of charFiles) {
    const ch = readCalculationData(resolve(root, 'src/game-data/data/characters', file));
    const binding = snapshot.baseAndManekin.bindings[ch.id];
    const baseId = binding?.baseId ?? (/^(aether|lumine)-/.test(ch.id) ? ch.id.split('-')[0] : ch.id);
    const src = snapshot.characters[baseId].stats;

    for (const [key, value] of Object.entries(ch.attributes.base)) {
      if (key === 'elementalMastery') {
        check('character-base', value, innateEm[ch.id]?.elementalMastery ?? 0, `${ch.id}/base/elementalMastery`);
        continue;
      }
      check('character-base', value, src.base[basePropKeys[key] ?? key], `${ch.id}/base/${key}`);
    }
    for (const [key, values] of Object.entries(ch.progression.curves)) {
      values.slice(1).forEach((value, index) => {
        check('character-curves', value, snapshot.characterCurves[String(index + 1)][src.curve[key]], `${ch.id}/curves/${key}/${index + 1}`);
      });
    }
    ch.progression.promotion.forEach((row, index) => {
      for (const [key, value] of Object.entries(row)) {
        check('character-promotion', value, src.promotion[index][key === 'maxLevel' ? 'maxlevel' : key], `${ch.id}/promotion/${index}/${key}`);
      }
    });
    ch.talents.forEach((talent, index) => {
      const slot = `combat${index + 1}`;
      const talentTable = snapshot.talentParams[ch.id]?.[slot]
        ?? snapshot.talentParams[baseId]?.[slot];
      for (const parameter of talent.parameters) {
        parameter.values.forEach((value, levelIndex) => {
          const expected = talentTable?.[parameter.id]?.[levelIndex];
          check('talent-parameters', value, expected, `${talent.id}/${parameter.id}/${levelIndex + 1}`);
        });
      }
    });
  }

  for (const file of readdirSync(resolve(root, 'src/game-data/data/weapons')).filter(f => f.endsWith('.json')).sort()) {
    const w = readContentSource(resolve(root, 'src/game-data/data/weapons', file));
    const src = snapshot.weapons[w.id]?.stats;
    if (!src) {
      diffs.push({ family: 'weapon-missing', field: w.id });
      continue;
    }
    check('weapon-base', w.baseAttack, src.base.attack, `${w.id}/attack`);
    check('weapon-base', w.baseStat, src.base.specialized, `${w.id}/specialized`);
    for (const [key, srcKey] of [['attackCurve', 'attack'], ['statCurve', 'specialized']]) {
      w[key].slice(1).forEach((value, index) => {
        if (src.curve[srcKey]) {
          check('weapon-curves', value, snapshot.weaponCurves[String(index + 1)][src.curve[srcKey]], `${w.id}/${key}/${index + 1}`);
        }
      });
    }
    w.promotion.forEach((value, index) => {
      check('weapon-promotion', value, src.promotion[index].attack, `${w.id}/promotion/${index}`);
    });
  }

  const rolls = readContentSource(resolve(root, 'src/game-data/data/tables/artifact-rolls.json')).affixes;
  for (const [id, item] of Object.entries(rolls)) {
    check('artifact-affixes', item.value, snapshot.reliquary.affixes[id]?.propValue, id);
  }

  const mainProps = {
    hp: 'HP', hpPercent: 'HP_PERCENT', attack: 'ATTACK', attackPercent: 'ATTACK_PERCENT',
    defense: 'DEFENSE', defensePercent: 'DEFENSE_PERCENT', critRate: 'CRITICAL',
    critDamage: 'CRITICAL_HURT', energyRecharge: 'CHARGE_EFFICIENCY', elementalMastery: 'ELEMENT_MASTERY',
    healingBonus: 'HEAL_ADD', physicalBonus: 'PHYSICAL_ADD_HURT', pyroBonus: 'FIRE_ADD_HURT',
    electroBonus: 'ELEC_ADD_HURT', hydroBonus: 'WATER_ADD_HURT', anemoBonus: 'WIND_ADD_HURT',
    geoBonus: 'ROCK_ADD_HURT', dendroBonus: 'GRASS_ADD_HURT', cryoBonus: 'ICE_ADD_HURT',
  };
  const mainTable = readContentSource(resolve(root, 'src/game-data/data/tables/artifact-main.json'));
  for (const [rarity, table] of Object.entries(mainTable)) {
    for (const [stat, values] of Object.entries(table)) {
      values.forEach((value, level) => {
        const row = snapshot.reliquary.mainLevels[`${rarity}/${level + 1}`];
        const expected = row?.addProps.find(prop => prop.propType === `FIGHT_PROP_${mainProps[stat]}`)?.value;
        check('artifact-main', value, expected, `${rarity}/${stat}/${level}`);
      });
    }
  }

  for (const file of readdirSync(resolve(root, 'src/game-data/data/artifact-sets')).filter(f => f.endsWith('.json')).sort()) {
    const s = readContentSource(resolve(root, 'src/game-data/data/artifact-sets', file));
    const src = snapshot.sets[s.id];
    check('artifact-set-rarities', s.rarities.length, src?.rarityList.length, `${s.id}/rarities/length`);
    s.rarities.forEach((r, idx) => check('artifact-set-rarities', r, src?.rarityList[idx], `${s.id}/rarities/${idx}`));
    check('artifact-set-slots', s.slots.length, src?.slots.length, `${s.id}/slots/length`);
    for (const slot of SLOT_ORDER) {
      check('artifact-set-slots', Number(s.slots.includes(slot)), Number(src?.slots.includes(slot)), `${s.id}/slots/${slot}`);
    }
  }

  const reactionLevels = readContentSource(resolve(root, 'src/game-data/data/calculation/reactions.json')).rules.levelMultipliers;
  reactionLevels.forEach((value, level) => {
    if (level > 0) check('reaction-levels', value, snapshot.elementCoeff[level], `reaction-level/${level}`);
  });

  // 2. Compare Enka skill IDs against enka-catalog.json
  const enkaCatalog = readContentSource(resolve(root, 'src/game-data/data/tables/enka-catalog.json'));
  const enkaDiffs = [];
  for (const [key, entry] of Object.entries(enkaCatalog.characters)) {
    const got = snapshot.enkaIds[key];
    const restrictedUnHyphenated = !key.includes('-') && ['aether', 'lumine', 'manekin', 'manekina'].includes(entry.id);
    if (!got || got.id !== entry.id) {
      enkaDiffs.push({ key, issue: 'missing/id mismatch', got, entry });
      continue;
    }
    if (!restrictedUnHyphenated && JSON.stringify(got.skills) !== JSON.stringify(entry.skills)) {
      enkaDiffs.push({ key, id: entry.id, got: got.skills, expected: entry.skills });
    }
  }

  // 3. Cross-compare against existing genshin-db snapshots when still present in workspace
  const weaponTextDiffs = [];
  const setTextDiffs = [];
  const fullTextDiffs = [];
  const talentParamDiffs = [];
  const enDiffs = [];

  const oldWeaponsPath = resolve(root, 'tools/data/sources/catalog/genshin-db/weapons.json');
  const oldSetsPath = resolve(root, 'tools/data/sources/catalog/genshin-db/sets.json');
  const oldTalentsPath = resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json');
  const oldTextDir = resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified');
  const oldEnAdvPath = resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/English/artifacts/adventurer.json');

  if (existsSync(oldWeaponsPath) && existsSync(oldSetsPath)) {
    const oldWeapons = readContentSource(oldWeaponsPath);
    for (const [id, oldEntry] of Object.entries(oldWeapons)) {
      const nw = snapshot.weapons[id];
      if (!nw) {
        weaponTextDiffs.push({ id, issue: 'missing' });
        continue;
      }
      for (let r = 1; r <= 5; r++) {
        const k = `r${r}`;
        if (!oldEntry.metadata[k]) continue;
        if (JSON.stringify(nw.metadata[k]?.values) !== JSON.stringify(oldEntry.metadata[k].values)) {
          weaponTextDiffs.push({ id, rank: k, got: nw.metadata[k]?.values, expected: oldEntry.metadata[k].values });
        }
        if (nw.metadata[k]?.description !== oldEntry.metadata[k].description) {
          weaponTextDiffs.push({ id, rank: `${k}.description`, got: nw.metadata[k]?.description, expected: oldEntry.metadata[k].description });
        }
      }
    }

    const oldSets = readContentSource(oldSetsPath);
    for (const [id, oldEntry] of Object.entries(oldSets)) {
      const ns = snapshot.sets[id];
      for (const k of ['name', 'effect1Pc', 'effect2Pc', 'effect4Pc']) {
        if (oldEntry[k] !== undefined && ns?.[k] !== oldEntry[k]) {
          setTextDiffs.push({ id, field: k, got: ns?.[k], expected: oldEntry[k] });
        }
      }
    }
  }

  if (existsSync(oldTextDir)) {
    for (const group of ['talents', 'constellations']) {
      const newGroup = group === 'talents' ? snapshot.talentTexts : snapshot.constellationTexts;
      for (const file of readdirSync(resolve(oldTextDir, group)).filter(f => f.endsWith('.json')).sort()) {
        const id = file.slice(0, -5);
        const oldDoc = readContentSource(resolve(oldTextDir, group, file));
        const newDoc = newGroup[id];
        if (!newDoc) {
          fullTextDiffs.push({ group, id, issue: 'missing' });
          continue;
        }
        for (const [slotKey, oldSlot] of Object.entries(oldDoc)) {
          if (slotKey === 'id' || slotKey === 'name' || slotKey === 'costs' || slotKey === 'version') continue;
          const newSlot = newDoc[slotKey];
          if (!newSlot) {
            fullTextDiffs.push({ group, id, slot: slotKey, issue: 'missing slot' });
            continue;
          }
          const cleanOld = (oldSlot.description ?? '').replaceAll('**', '');
          const cleanNew = stripRichTags(newSlot.description ?? '').trim();
          if (cleanNew !== cleanOld) {
            fullTextDiffs.push({ group, id, slot: `${slotKey}.description`, got: cleanNew, expected: cleanOld });
          }
          if (oldSlot.attributes?.labels && JSON.stringify(newSlot.attributes?.labels) !== JSON.stringify(oldSlot.attributes.labels)) {
            fullTextDiffs.push({ group, id, slot: `${slotKey}.labels`, got: newSlot.attributes?.labels, expected: oldSlot.attributes.labels });
          }
        }
      }
    }
  }

  if (existsSync(oldTalentsPath)) {
    const oldTalents = readContentSource(oldTalentsPath);
    for (const [key, slots] of Object.entries(oldTalents)) {
      const newSlots = snapshot.talentParams[key];
      if (!newSlots) {
        talentParamDiffs.push({ key, issue: 'missing' });
        continue;
      }
      for (const [slot, params] of Object.entries(slots)) {
        for (const [param, arr] of Object.entries(params)) {
          if (JSON.stringify(newSlots[slot]?.[param]) !== JSON.stringify(arr)) {
            talentParamDiffs.push({ key, slot, param });
          }
        }
      }
    }
  }

  if (existsSync(oldEnAdvPath)) {
    const oldEnAdv = readContentSource(oldEnAdvPath);
    const oldEnIfa = readContentSource(resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/English/talents/ifa.json'));
    const oldEnVaresa = readContentSource(resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/English/talents/varesa.json'));
    if (snapshot.englishExcerpts.sets.adventurer.effect4Pc !== oldEnAdv.effect4Pc) {
      enDiffs.push({ key: 'adventurer.effect4Pc', got: snapshot.englishExcerpts.sets.adventurer.effect4Pc, expected: oldEnAdv.effect4Pc });
    }
    for (const [id, oldDoc] of [['ifa', oldEnIfa], ['varesa', oldEnVaresa]]) {
      for (const slot of ['combat1', 'combat2', 'combat3', 'passive1', 'passive2']) {
        const cleanOld = oldDoc[slot].description.replaceAll('**', '');
        const cleanNew = stripRichTags(snapshot.englishExcerpts.talents[id][slot]?.description ?? '').trim();
        if (cleanNew !== cleanOld) {
          enDiffs.push({ key: `${id}.${slot}`, got: cleanNew, expected: cleanOld });
        }
      }
    }
  }

  // Output folder stats
  let totalFiles = 0;
  let totalBytes = 0;
  const walkStats = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walkStats(full);
      else {
        totalFiles++;
        totalBytes += readFileSync(full).length;
      }
    }
  };
  walkStats(OUTPUT_ROOT);

  return {
    outputRoot: portable(OUTPUT_ROOT),
    totalFiles,
    totalBytes,
    comparedValues: counts,
    numericDiffCount: diffs.length,
    numericDiffSample: diffs.slice(0, 10),
    enkaDiffCount: enkaDiffs.length,
    enkaDiffSample: enkaDiffs.slice(0, 10),
    weaponTextDiffCount: weaponTextDiffs.length,
    weaponTextDiffSample: weaponTextDiffs.slice(0, 10),
    setTextDiffCount: setTextDiffs.length,
    setTextDiffSample: setTextDiffs.slice(0, 10),
    fullTextDiffCount: fullTextDiffs.length,
    fullTextDiffSample: fullTextDiffs.slice(0, 10),
    talentParamDiffCount: talentParamDiffs.length,
    talentParamDiffSample: talentParamDiffs.slice(0, 10),
    enDiffCount: enDiffs.length,
    enDiffSample: enDiffs,
  };
}

const options = parseOptions(process.argv.slice(2));
const { rawRoot, manifest } = await ensureRawFiles(options);
if (options.fetchOnly) {
  console.log(JSON.stringify({
    mode: 'fetch-only',
    revision: options.revision,
    rawRoot: portable(rawRoot),
    fileCount: manifest.files.length,
    totalBytes: manifest.files.reduce((sum, item) => sum + item.bytes, 0),
  }, null, 2));
} else {
  const snapshot = normalizeSnapshot(rawRoot, manifest, options);
  const report = options.verify
    ? verifyNormalizedSnapshot(snapshot)
    : {
        mode: 'normalize',
        outputRoot: portable(OUTPUT_ROOT),
        characters: Object.keys(snapshot.characters).length,
        weapons: Object.keys(snapshot.weapons).length,
        sets: Object.keys(snapshot.sets).length,
      };
  console.log(JSON.stringify(report, null, 2));
}
