import { getArtifactMain, getReactionRules, loadCatalog } from '@leyline/game-data';
import type { Build, StatKey } from '@leyline/schema';
import type { AccountArtifact, LocalAccount } from './account';
import { parseAccount } from './account';
import { ratioStat } from './account-real';

type AccountGameData = { catalog: Awaited<ReturnType<typeof loadCatalog>>; main: Build['artifactMain']; reactions: Awaited<ReturnType<typeof getReactionRules>> };
let gameData: Promise<AccountGameData> | undefined;
export function loadAccountGameData(): Promise<AccountGameData> {
  gameData ??= Promise.all([loadCatalog(), getArtifactMain(), getReactionRules()]).then(([catalog, main, reactions]) => ({ catalog, main, reactions })).catch(error => { gameData = undefined; throw error; });
  return gameData;
}
export function artifactMainValue(item: AccountArtifact, main?: Build['artifactMain']): number | undefined {
  return item.real ? main?.[item.real.mainStat]?.[item.real.level] : item.attack;
}
export function formatGameStat(stat: StatKey, value: number | undefined, useGrouping = true): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const percent=ratioStat(stat);
  return `${(value*(percent?100:1)).toLocaleString('zh-CN',{useGrouping,minimumFractionDigits:percent?1:0,maximumFractionDigits:percent?1:0})}${percent?'%':''}`;
}
export function formatAccountStat(stat: StatKey, value: number | undefined, maximumFractionDigits = 1): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * (ratioStat(stat) ? 100 : 1)).toLocaleString('zh-CN', { maximumFractionDigits })}${ratioStat(stat) ? '%' : ''}`;
}
/** Validate a complete detached edit before replacing anything in the inventory. */
export function applyAccountArtifact(account: LocalAccount, item: AccountArtifact, existingId?: string): void {
  const next = JSON.parse(JSON.stringify(account)) as LocalAccount;
  if (existingId) {
    const index = next.artifacts.findIndex(entry => entry.id === existingId);
    if (index < 0 || item.id !== existingId) throw new Error('原物品已变化，请重新打开详情。');
    next.artifacts[index] = item;
  } else {
    if (next.artifacts.some(entry => entry.id === item.id)) throw new Error('物品身份已存在，请重新录入。');
    next.artifacts.push(item);
  }
  account.artifacts = parseAccount(next).artifacts;
}
