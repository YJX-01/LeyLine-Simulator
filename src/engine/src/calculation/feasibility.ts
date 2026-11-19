import { inventoryAllocationsSchema, inspectCalculationStructure, type CalculationFeasibility } from '@leyline/schema';

/** Equipment claims are read-only facts. Detached snapshots never acquire inventory ownership here. */
export function checkInventoryFeasibility(input: unknown): CalculationFeasibility {
  const unknown: CalculationFeasibility = { category: 'inventory-allocation', status: 'unknown', actorIds: [], itemRefs: [], diagnostics: [] };
  if (input === undefined) return unknown;
  const structural = inspectCalculationStructure(input);
  const parsed = structural.length ? null : inventoryAllocationsSchema.safeParse(input);
  if (!parsed?.success) return { ...unknown, diagnostics: structural.length ? structural : [{ code: 'invalid-range', severity: 'error', jsonPointer: '/inventoryAllocations', affectedOutputIds: [], message: '装备占用事实结构无效。' }] };
  const claims = new Map<string, { accountId: string; itemId: string; actorIds: string[] }>();
  let missing = false;
  for (const allocation of parsed.data) for (const item of allocation.artifacts) {
    if (item.inventoryAccountId === null || item.inventoryItemId === null) { missing = true; continue; }
    const key = JSON.stringify([item.inventoryAccountId, item.inventoryItemId]);
    const claim = claims.get(key) ?? { accountId: item.inventoryAccountId, itemId: item.inventoryItemId, actorIds: [] };
    claim.actorIds.push(allocation.actorId); claims.set(key, claim);
  }
  const conflicts = [...claims.values()].filter(claim => claim.actorIds.length > 1);
  return { category: 'inventory-allocation', status: conflicts.length ? 'conflict' : missing ? 'unknown' : 'pass',
    actorIds: [...new Set(conflicts.length ? conflicts.flatMap(claim => claim.actorIds) : parsed.data.map(allocation => allocation.actorId))], itemRefs: conflicts,
    diagnostics: conflicts.map(claim => ({ code: 'inventory-conflict', severity: 'error', jsonPointer: '/inventoryAllocations', affectedOutputIds: [],
      message: `库存物品重复占用：${claim.accountId}/${claim.itemId}；队员：${claim.actorIds.join('、')}` })) };
}
