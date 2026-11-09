import {persistArtifactRolls} from './artifact-rolls';
import { realArtifactSchema, type RealStat } from '@leyline/schema';
import { accountSlotLabels, cloneAccount, parseAccount, type AccountArtifact, type AccountSlot, type LocalAccount } from './account';
import { accountMainStats, validateAccountArtifact } from './account-real';

const slotMap = { flower: 'flower', feather: 'plume', plume: 'plume', sand: 'sands', sands: 'sands', cup: 'goblet', goblet: 'goblet', head: 'circlet', circlet: 'circlet' } as const;
const groups = ['flower', 'feather', 'sand', 'cup', 'head'] as const;
const aliases: Record<string, string> = { feather: 'plume', sand: 'sands', cup: 'goblet', head: 'circlet' };
const statMap: Record<string, RealStat> = { lifeStatic: 'hp', lifePercentage: 'hpPercent', attackStatic: 'attack', attackPercentage: 'attackPercent', defendStatic: 'defense', defendPercentage: 'defensePercent', critical: 'critRate', criticalDamage: 'critDamage', recharge: 'energyRecharge', elementalMastery: 'elementalMastery', windBonus: 'anemoBonus', rockBonus: 'geoBonus', thunderBonus: 'electroBonus', waterBonus: 'hydroBonus', fireBonus: 'pyroBonus', iceBonus: 'cryoBonus', dendroBonus: 'dendroBonus', physicalBonus: 'physicalBonus', cureEffect: 'healingBonus' };
// Identity mapping captured from TwiceDrop Mona 7.2.02, matched by exact Chinese catalog names.
import monaSetAliases from './data/mona-set-aliases.json';
const setAliases: Record<string, string> = monaSetAliases;

type SetEntry = { id: string; name: string };
type MainTable = Record<RealStat, number[]>;
function realContent(item: AccountArtifact['real']): string {
  return JSON.stringify(item && { id: item.id, setId: item.setId, slot: item.slot, rarity: item.rarity, level: item.level, mainStat: item.mainStat, substats: item.substats.map(({stat,value})=>({stat,value})) });
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
export interface MonaImportPreview {
  format: 'mona-v1'; accountId: string; additions: AccountArtifact[]; updates: { item: AccountArtifact; before: string }[]; duplicates: number; skipped: string[]; conflicts: string[];
}
/** Repair only proven, unedited legacy identities, without recreating a player export. */
export async function previewMonaSetRepairs(account: LocalAccount, sets: SetEntry[]): Promise<MonaImportPreview> {
  const preview: MonaImportPreview = { format: 'mona-v1', accountId: account.id, additions: [], updates: [], duplicates: 0, skipped: [], conflicts: [] };
  for (const item of account.artifacts) {
    if (!item.mona?.setIdentityPending || !item.real || item.real.source?.format !== 'mona-v1') continue;
    const name = item.mona.sourceSetName ?? '';
    const set = sets.find(set => set.id === setAliases[name]);
    if (!set) { preview.skipped.push(`${name}：仍没有经过核对的套装映射。`); continue; }
    const snapshot = JSON.stringify(item);
    const content = { setId: item.real.setId, slot: item.real.slot, level: item.real.level, main: { stat: item.real.mainStat, value: item.mona.mainValue }, substats: item.real.substats };
    if (await digest(JSON.stringify(content)) !== item.real.source.fingerprint) {
      preview.skipped.push(`${item.name}：导入后词条已修改，请保留现有物品并核对原文件。`); continue;
    }
    const fingerprint = await digest(JSON.stringify({ ...content, setId: set.id }));
    const originalName = `${name}（套装待核对） · ${accountSlotLabels[item.slot]}`;
    preview.updates.push({ before: snapshot, item: { ...item,
      name: item.name === originalName ? `${set.name} · ${accountSlotLabels[item.slot]}` : item.name,
      real: { ...item.real, setId: set.id, source: { ...item.real.source, fingerprint } }, mona: { ...item.mona, setIdentityPending: false } } });
  }
  return preview;
}
async function digest(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function stat(tag: unknown): { stat: RealStat; value: number } {
  if (!object(tag) || !text(tag.name) || !Object.hasOwn(statMap, tag.name) || typeof tag.value !== 'number' || !Number.isFinite(tag.value) || tag.value <= 0) throw new Error('莫娜文件包含未知或非法词条。百分比必须使用原格式的小数值。');
  return { stat: statMap[tag.name], value: tag.value };
}

/** Ratios in the pinned Mona v1 export are already decimals, never divide them by 100. */
export async function previewMonaImport(content: string, account: LocalAccount, sets: SetEntry[], main: MainTable): Promise<MonaImportPreview> {
  let input: unknown;
  try { input = JSON.parse(content); } catch { throw new Error('莫娜文件不是有效的 JSON，库存保持不变。'); }
  if (!object(input) || input.version !== '1') throw new Error('仅支持莫娜社区版第一版圣遗物导出文件，版本标记应为字符串“1”。');
  if (![...groups, ...Object.values(aliases)].some(key => Object.hasOwn(input, key))) throw new Error('莫娜文件缺少圣遗物部位列表。');
  const preview: MonaImportPreview = { format: 'mona-v1', accountId: account.id, additions: [], updates: [], duplicates: 0, skipped: [], conflicts: [] };
  const occurrences = new Map<string, number>();
  const seenIds = new Set<string>();
  const drafts: { path: string; item: Record<string, unknown>; set: SetEntry | undefined; slot: AccountSlot; primary: ReturnType<typeof stat>; substats: ReturnType<typeof stat>[]; level: number; setName: string }[] = [];
  let total = 0;
  for (const group of groups) {
    const alias = aliases[group];
    if (input[group] !== undefined && alias && input[alias] !== undefined) throw new Error('莫娜文件同时包含重复的部位别名，未导入。');
    const entries = input[group] ?? (alias ? input[alias] : undefined) ?? [];
    if (!Array.isArray(entries) || entries.length > 10000 || (total += entries.length) > 10000) throw new Error('莫娜文件的部位列表无效或超过一万件上限。');
    for (const [index, item] of entries.entries()) {
      const path = `${accountSlotLabels[slotMap[group]]}第${index + 1}件`;
      if (!object(item)) throw new Error(`${path}格式无效，库存保持不变。`);
      if (!Number.isInteger(item.star) || (item.star as number) < 1 || (item.star as number) > 5) throw new Error(`${path}星级无效。`);
      if (item.star !== 5) { preview.skipped.push(`${path}：本阶段仅导入五星圣遗物。`); continue; }
      if (!text(item.setName) || !text(item.position) || !Object.hasOwn(slotMap, item.position) || slotMap[item.position as keyof typeof slotMap] !== slotMap[group]) throw new Error(`${path}套装或部位无效。`);
      // Preserve an unresolved export identity as a namespaced ID, never guess a catalog set.
      const mappedSetId = setAliases[item.setName] ?? item.setName.toLowerCase();
      const set = sets.find(entry => entry.id === mappedSetId);
      const primary = stat(item.mainTag);
      if (!Array.isArray(item.normalTags) || item.normalTags.length > 4) throw new Error(`${path}副词条列表无效。`);
      const substats = item.normalTags.map(stat);
      const slot = slotMap[group];
      if (!accountMainStats[slot].includes(primary.stat)) throw new Error(`${path}主词条与部位不匹配。`);
      if (typeof item.level !== 'number' || !Number.isInteger(item.level) || item.level < 0 || item.level > 20) throw new Error(`${path}等级必须为 0 到 20 的整数。`);
      const expected = main[primary.stat]?.[item.level];
      // Mona scans may retain rounded display values: EM 187 represents canonical 186.5.
      const tolerance = ['hp', 'attack', 'defense', 'elementalMastery'].includes(primary.stat) ? 0.500000001 : 0.000500001;
      if (!Number.isFinite(expected) || Math.abs(primary.value - expected) > tolerance) throw new Error(`${path}主词条数值与五星等级表不符，请核对等级或百分比单位。`);
      if (item.id !== undefined && !(typeof item.id === 'number' && Number.isSafeInteger(item.id) && item.id >= 0) && !text(item.id)) throw new Error(`${path}实例标识无效。`);
      drafts.push({ path, item, set, slot, primary, substats, level: item.level, setName: item.setName });
    }
  }
  // Submit each hashing phase together. Serial native crypto round trips are slow in WebKit.
  // Promise.all preserves source order, including the identity of equal no-ID physical items.
  const fingerprinted = await Promise.all(drafts.map(async draft => {
    const setId = draft.set?.id ?? `mona-unresolved-${await digest(draft.setName)}`;
    const fingerprint = await digest(JSON.stringify({ setId, slot: draft.slot, level: draft.level, main: draft.primary, substats: draft.substats }));
    return { ...draft, setId, fingerprint };
  }));
  const identified = await Promise.all(fingerprinted.map(async draft => {
    const occurrence = (occurrences.get(draft.fingerprint) ?? 0) + 1;
    occurrences.set(draft.fingerprint, occurrence);
    const key = draft.item.id === undefined ? `content:${draft.fingerprint}:${occurrence}` : `id:${String(draft.item.id)}`;
    return { ...draft, key, id: `mona-${await digest(key)}` };
  }));
  for (const draft of identified) {
    const { path, item, set, slot, primary, substats, level, setName, setId, fingerprint, key, id } = draft;
    const setIdentityPending = !set;
    if (seenIds.has(id)) throw new Error(`${path}与本文件另一件圣遗物使用相同实例标识。`);
    seenIds.add(id);
    const real = realArtifactSchema.parse({ id, setId, slot, rarity: 5, level: level, mainStat: primary.stat, substats, source: { format: 'mona-v1', key, fingerprint } });
    validateAccountArtifact(real);
    const next: AccountArtifact = { id, name: `${set?.name ?? `${setName}（套装待核对）`} · ${accountSlotLabels[slot]}`, slot, attack: 0, real,
      mona: { mainValue: primary.value, omit: item.omit === true, sourceSetName: setName, ...(setIdentityPending ? { setIdentityPending: true } : {}), ...(text(item.equip) ? { equippedBy: item.equip } : {}), ...(typeof item.contentHash === 'string' ? { contentHash: item.contentHash } : {}) } };
    const existing = account.artifacts.find(entry => entry.id === id);
    if (existing) {
      const resolvedIdentity = existing.mona?.setIdentityPending && !setIdentityPending
        && existing.mona.sourceSetName === setName && existing.real?.source?.key === key
        && realContent({ ...existing.real, setId: real.setId }) === realContent(real);
      if (resolvedIdentity) {
        preview.conflicts.push(`${setName}：已核实为「${set!.name}」，确认更新后补全套装身份；词条与归属不变。`);
        const originalName = `${setName}（套装待核对） · ${accountSlotLabels[slot]}`;
        preview.updates.push({ item: { ...existing, name: existing.name === originalName ? next.name : existing.name,
          real: { ...existing.real!, setId: real.setId, source: real.source }, mona: { ...existing.mona!, setIdentityPending: false } }, before: JSON.stringify(existing) });
      } else if (existing.real?.source?.fingerprint === fingerprint && realContent(existing.real) === realContent(real)) preview.duplicates++;
      else {
        preview.conflicts.push(`${next.name}：相同来源标识的内容已经变化，默认不覆盖现有物品。`);
        if (existing.real?.source?.format === 'mona-v1' && existing.slot === next.slot && existing.real.setId === real.setId) preview.updates.push({ item: { ...next, name: existing.name, ...(existing.alias?{alias:existing.alias}:{}) }, before: JSON.stringify(existing) });
      }
    } else preview.additions.push(next);
  }
  return preview;
}

/** Confirmation rechecks the current account atomically, and never equips or transfers items. */
export function confirmMonaImport(account: LocalAccount, preview: MonaImportPreview, allowUpdates = false): number {
  if (account.id !== preview.accountId) throw new Error('账号已切换，请重新预览导入文件。');
  if (preview.conflicts.length && (!allowUpdates || preview.updates.length !== preview.conflicts.length)) throw new Error('导入存在实例冲突，请先处理来源文件，库存保持不变。');
  const next = cloneAccount(account);
  for (const item of preview.additions) {
    const existing = next.artifacts.find(entry => entry.id === item.id);
    if (existing) {
      if (existing.real?.source?.fingerprint === item.real?.source?.fingerprint && realContent(existing.real) === realContent(item.real)) continue;
      throw new Error('预览后库存已变化，请重新预览，现有物品保持不变。');
    }
    next.artifacts.push(JSON.parse(JSON.stringify(item)) as AccountArtifact);
  }
  if (allowUpdates) for (const update of preview.updates) {
    const index = next.artifacts.findIndex(item => item.id === update.item.id);
    if (index < 0 || JSON.stringify(next.artifacts[index]) !== update.before) throw new Error('预览后库存已变化，请重新预览，现有物品保持不变。');
    next.artifacts[index] = JSON.parse(JSON.stringify(update.item)) as AccountArtifact;
  }
  for(const item of next.artifacts)persistArtifactRolls(item);
  parseAccount(next);
  const added = next.artifacts.length - account.artifacts.length;
  account.artifacts = next.artifacts;
  return added;
}
