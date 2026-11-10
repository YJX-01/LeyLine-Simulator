import { cloneAccount, parseAccount, type LocalAccount } from './account';

/** Explicitly organize actual export notes; never infer levels, weapons or talents. */
export function organizeMonaWearNotes(account: LocalAccount): { added: number; conflicts: string[] } {
  const next = cloneAccount(account);
  const names = [...new Set(next.artifacts.flatMap(item => item.mona?.equippedBy ? [item.mona.equippedBy] : []))];
  const conflicts: string[] = [];
  let added = 0;
  for (const name of names) {
    if (next.characters.some(character => character.name === name)) continue;
    const character = { id: crypto.randomUUID(), name, attack: 0, weapon: '待选择武器', equipment: {} as LocalAccount['characters'][number]['equipment'] };
    const items = next.artifacts.filter(item => item.mona?.equippedBy === name);
    for (const item of items) {
      if (items.filter(other => other.slot === item.slot).length !== 1) { conflicts.push(`${name} · ${item.name}：同部位备注冲突，未自动装备。`); continue; }
      character.equipment[item.slot] = item.id;
    }
    next.characters.push(character);
    added++;
  }
  const validated = parseAccount(next);
  account.characters = validated.characters;
  return { added, conflicts };
}
