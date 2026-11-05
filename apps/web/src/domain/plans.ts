import { teamSchema, type TeamInput } from '@leyline/schema';

export interface Plan { id: string; name: string; input: TeamInput }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const plansKey = 'leyline.plans.v1';
const maxBytes = 1_000_000;

export function parsePlanInput(source: string): TeamInput {
  if (source.length > maxBytes) throw new Error('方案超过 1 MB 限制。');
  const value: unknown = JSON.parse(source);
  return teamSchema.parse(value);
}

export function readPlans(storage: StoragePort): Plan[] {
  const raw = storage.getItem(plansKey);
  if (!raw) return [];
  if (raw.length > maxBytes) throw new Error('本地方案库超过读取限制，请先备份。');
  const value = JSON.parse(raw) as { version?: unknown; plans?: unknown };
  if (value?.version !== 1 || !Array.isArray(value.plans) || value.plans.length > 50) throw new Error('无法识别本地方案库版本。');
  const ids = new Set<string>();
  return value.plans.map((item: unknown) => {
    const plan = item as Partial<Plan>;
    if (!plan || typeof plan.id !== 'string' || !plan.id || ids.has(plan.id) || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 80) throw new Error('本地方案记录损坏。');
    ids.add(plan.id);
    return { id: plan.id, name: plan.name, input: teamSchema.parse(plan.input) };
  });
}

export function writePlans(storage: StoragePort, plans: Plan[]): void {
  if (plans.length > 50) throw new Error('最多保存 50 个方案，请先导出或删除旧方案。');
  const raw = JSON.stringify({ version: 1, plans });
  if (raw.length > maxBytes) throw new Error('本地方案库已达 1 MB，请先导出或删除旧方案。');
  storage.setItem(plansKey, raw);
}
