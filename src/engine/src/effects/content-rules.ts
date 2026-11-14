import type { Build, CombatRule, Project, RuleDefinition } from '@leyline/schema';

export interface ContentRuleSource {
  slot: string;
  entity: string;
  rule: string;
  definition: RuleDefinition;
}

/** Rebuild from this candidate's snapshots; do not persist or modify derived definitions. */
export function contentRuleSources(actor: Project['candidate']['actors'][number], visit = () => true): ContentRuleSource[] {
  const build = actor.build;
  if (!build) return [];
  const sources: ContentRuleSource[] = [];
  const append = (slot: string, entity: string, revision: string, rules: CombatRule[] | undefined) => {
    for (const rule of rules ?? []) {
      if (!visit()) break;
      sources.push({ slot, entity, rule: rule.id, definition: {
      id: `content:${JSON.stringify([actor.id, slot, entity, rule.id])}`,
      version: JSON.stringify([build.dataVersion, revision, rule.revision]),
      name: entity,
      source: { kind: build.character.origin === 'custom' ? 'user' : 'preset', reference: `${entity}/${rule.id}`, verified: build.character.origin === 'builtin' },
      ...(rule.support ? { support: rule.support } : {}),
      nodes: rule.nodes, effects: rule.effects,
      } });
    }
  };
  append('character', build.character.id, build.character.revision, build.character.combatRules);
  for (const passive of build.character.passives) if (passive.unlockAscension !== null && build.ascension >= passive.unlockAscension) {
    append('passive', passive.id, build.character.revision, passive.combatRules);
  }
  for (const constellation of build.character.constellations) if (build.constellation >= constellation.rank) {
    append('constellation', `${build.character.id}.c${constellation.rank}`, build.character.revision, constellation.combatRules);
  }
  append('weapon', build.weapon.id, build.weapon.source.commit, build.weapon.combatRules);
  for (const set of build.sets) {
    const count = build.artifacts.filter(item => item.setId === set.id).length;
    for (const effect of set.effects) if (count >= effect.pieces) append('set', `${set.id}.${effect.pieces}`, set.source.commit, effect.combatRules);
  }
  return sources;
}

export function hasCombatRules(build: Build): boolean {
  return !!(build.character.combatRules?.length || build.character.passives.some(passive => passive.combatRules?.length)
    || build.character.constellations.some(constellation => constellation.combatRules?.length) || build.weapon.combatRules?.length
    || build.sets.some(set => set.effects.some(effect => effect.combatRules?.length)));
}
