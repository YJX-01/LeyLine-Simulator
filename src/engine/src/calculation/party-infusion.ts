import { partyInfusionFact, selectedPartyInfusion, type CombatContext, type CombatFrame, type StructuredBuild, type findBuildHit } from '@leyline/schema';
import { resolveHitElement } from '@leyline/schema/hit-bindings';
import { evaluateCombatBindings } from './context';
import type { CompiledCalculation } from './compile';

type Hit = NonNullable<ReturnType<typeof findBuildHit>>['hit'];

export function resolveCombatHitElement(program: CompiledCalculation, context: CombatContext, frame: CombatFrame,
  hit: Hit, family: string, normalTalent: boolean, build: StructuredBuild | undefined, builds: Iterable<StructuredBuild>) {
  let infused: boolean | undefined;
  if (hit.infusion?.minConstellation && (build?.constellation ?? 0) < hit.infusion.minConstellation) infused = false;
  else if (hit.infusion) {
    const read = evaluateCombatBindings(program, context, { infused: { kind: 'fact', scope: 'owner', key: hit.infusion.fact, type: { kind: 'boolean' } } }, frame).outputs.infused;
    if (read?.state === 'known' && read.value.kind === 'boolean') infused = read.value.value;
  }
  const observed = context.events.find(event => event.id === frame.eventId)?.facts;
  const readFact = (key: string) => (frame.facts[key] ?? observed?.[key])?.value;
  const partyElement = normalTalent && family === 'ordinary' ? selectedPartyInfusion(hit, build?.weapon?.weaponType, builds, readFact(partyInfusionFact), infused) : undefined;
  return { ...resolveHitElement(hit, hit.elementBy ? readFact(hit.elementBy) : undefined, context.actors.map(actor => actor.identity?.element), infused, partyElement),
    missingInfusion: infused === undefined ? hit.infusion?.fact : undefined };
}
