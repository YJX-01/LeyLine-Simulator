import { buildSetCounts, definitionKey, type Build, type DefinitionRef, type EffectDefinition } from '@leyline/schema';
import { effectUnlocked } from './effects';

type Entity = Build['character'] | NonNullable<Build['weapon']> | Build['sets'][number];
export interface Grant {
  entity: Entity;
  effect: EffectDefinition;
  resonance?: string;
  gleam?: string;
  scene?: { id:string; name:string };
  passive?: Build['character']['passives'][number];
  constellation?: Build['character']['constellations'][number];
  talent?: Build['character']['talents'][number];
  set?: Build['sets'][number]['effects'][number];
}

type Buff = NonNullable<Build['character']['metadata']['buffs']>[number];
type Owner = Pick<Grant, 'entity' | 'passive' | 'constellation' | 'talent' | 'set'> & { refs: DefinitionRef[]; buffs?: Buff[] };
function contentOwners(build: Build, counts?: Record<string, number>) {
  const setCounts = counts ?? buildSetCounts(build);
  const owners: Owner[] = [];
  for (const entity of [build.character, build.weapon, ...build.sets]) {
    if (!entity) continue;
    owners.push({ entity, refs: entity.calculation.ruleIds, buffs: entity.metadata.buffs });
    if (entity.kind === 'character-definition') {
      for (const talent of entity.talents) owners.push({ entity, talent, refs: talent.ruleIds, buffs: entity.metadata.talents.find(t => t.id === talent.id)?.buffs });
      for (const passive of entity.passives) if (build.ascension >= (passive.unlockAscension ?? 0)) owners.push({ entity, passive, refs: passive.ruleIds, buffs: entity.metadata.passives.find(p => p.id === passive.id)?.buffs });
      for (const constellation of entity.constellations) if (build.constellation >= constellation.rank) owners.push({ entity, constellation, refs: constellation.ruleIds, buffs: entity.metadata.constellations.find(c => c.rank === constellation.rank)?.buffs });
    }
    if (entity.kind === 'artifact-set-definition') for (const set of entity.effects) {
      if ((setCounts[entity.id] ?? 0) >= set.pieces) owners.push({ entity, set, refs: set.ruleIds, buffs: entity.metadata.effects.find(e => e.pieces === set.pieces)?.buffs });
    }
  }
  return { owners, state: { ...build, identity: build.character.identity, setCounts } };
}
export function grantedBuildEffects(build: Build, counts?: Record<string, number>): Grant[] {
  const { owners, state } = contentOwners(build, counts);
  const definitions = new Map<Entity, Map<string, EffectDefinition>>();
  return owners.flatMap(({ refs, buffs, ...owner }) => {
    let effects = definitions.get(owner.entity);
    if (!effects) { effects = new Map(owner.entity.calculation.bundle.effects.map(effect => [definitionKey(effect.identity), effect])); definitions.set(owner.entity, effects); }
    return refs.flatMap(ref => {
      const effect = effects.get(definitionKey(ref));
      return effect && effectUnlocked(effect.activation, state) ? [{ ...owner, effect }] : [];
    });
  });
}
export function grantedDamageChanges(build: Build) {
  return contentOwners(build).owners.flatMap(({ entity, buffs }) => (buffs ?? []).flatMap(buff => buff.onDamage
    ? [{ entity, id: buff.id, rule: buff.onDamage }] : []));
}
export function grantedPeriodicEnergy(build:Build) {
  return contentOwners(build).owners.flatMap(({buffs})=>(buffs??[]).flatMap(buff=>buff.periodicEnergy ? [{ id:buff.id,rule:buff.periodicEnergy }] : []));
}

export function suppliesMoonsign(build:Build) {
  return build.character.passives.some(p=>p.moonsignLevel===1 && build.ascension>=(p.unlockAscension??0));
}

export function grantedGleamEffects(members:readonly {id:string;build?:Build}[]) {
  const grants=new Map<string,Grant[]>();
  if(members.filter(m=>!m.build || suppliesMoonsign(m.build)).length<2) return grants;
  for(const {id,build} of members) {
    if(!build || suppliesMoonsign(build)) continue;
    const entity=build.character, rule=entity.calculation.gleam;
    if(!rule) continue;
    const keys=new Set(rule.ruleIds.map(definitionKey));
    grants.set(id,entity.calculation.bundle.effects.filter(effect=>keys.has(definitionKey(effect.identity))).map(effect=>({entity,effect,gleam:rule.name})));
  }
  return grants;
}

export function grantedResonances(members: readonly { id: string; build?: Build; element?: string }[]) {
  if (members.length !== 4) return;
  const owner = members.find(actor => actor.build);
  if (!owner?.build) return;
  const entity = owner.build.character;
  const elements = members.map(actor => actor.build?.character.identity.element ?? actor.element);
  const available = new Map(entity.calculation.bundle.effects.map(effect => [definitionKey(effect.identity), effect]));
  const grants: Grant[] = [];
  const particles: NonNullable<NonNullable<Build['character']['calculation']['resonances']>[number]['particles']>[] = [];
  for (const rule of entity.calculation.resonances ?? []) {
    const qualifies = rule.element === 'distinct' ? elements.every(element => element && element !== 'physical') && new Set(elements).size === 4
      : elements.filter(element => element === rule.element).length >= 2;
    if (!qualifies) continue;
    if (rule.particles) particles.push(rule.particles);
    for (const reference of rule.ruleIds) {
      const effect = available.get(definitionKey(reference));
      if (effect) grants.push({ entity, effect, resonance: rule.name });
    }
  }
  return { ownerId: owner.id, grants, particles };
}
