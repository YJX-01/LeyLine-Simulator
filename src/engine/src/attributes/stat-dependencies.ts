import type { AttackType, AttributePanel, QuantityUnit, StatKey, ReactionBonusKey, HitDamageKey } from '@leyline/schema';

const percentages = { hp: 'hpPercent', attack: 'attackPercent', defense: 'defensePercent' } as const;
export const percentStat = (stat: string): StatKey | undefined => Object.hasOwn(percentages, stat) ? percentages[stat as keyof typeof percentages] : undefined;
export function statUnit(stat: StatKey | ReactionBonusKey | HitDamageKey): QuantityUnit {
  if (stat === 'baseDamageBonus') return 'damage';
  return stat === 'hp' || stat === 'attack' || stat === 'defense' || stat === 'elementalMastery' ? stat : 'scalar';
}

/** A missing condition only invalidates attributes actually consumed by this read. */
export function relevantPanelIssues(panel: AttributePanel, stats: readonly StatKey[], category?: AttackType) {
  const required = new Set<StatKey>(stats);
  for (const stat of stats) { const percent = percentStat(stat); if (percent) required.add(percent); }
  return panel.issues.filter(issue => !issue.affects || issue.affects.some(scope => required.has(scope.stat)
    && (scope.category === undefined || scope.category === category)));
}
