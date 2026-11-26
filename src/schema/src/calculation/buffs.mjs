import { absorbedElements } from './hit-bindings.mjs';
import { partyInfusionElements, partyInfusionFact } from './party-infusion.mjs';

const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const mapValues = (object, convert) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, convert(value)]));
const permanent = { kind: 'permanent' };

const actorFlag = { scope: 'owner', type: { kind: 'boolean' } };
const targetFlag = { scope: 'target', type: { kind: 'boolean' } };
export const commonCombatFacts = Object.freeze({ onField: actorFlag, shielded: actorFlag,
  incomingShieldElement: { scope: 'query', type: { kind: 'enum', values: ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'] } },
  autumnPlatform: {scope:'owner',type:{kind:'enum',values:['none','pyro','cryo']}},
  nearbyEnemies: { scope: 'owner', type: { kind: 'quantity', unit: 'count' } },
  'deathmatch.enemiesAtUpdate': {scope:'owner',type:{kind:'quantity',unit:'count'}},
  enemyDefeated: { scope: 'query', type: { kind: 'boolean' } },
  weaponTriggeredOffField: { scope: 'source-event', type: { kind:'boolean' } },
  targetsDamaged: { scope: 'query', type: { kind: 'quantity', unit: 'count' } },
  targetsHit: { scope: 'query', type: { kind: 'quantity', unit: 'count' } },
  criticalTargets: { scope: 'query', type: { kind: 'quantity', unit: 'count' } },
  triggerRoll: { scope: 'query', type: { kind: 'quantity', unit: 'scalar' } },
  currentEnergy: { scope: 'owner', type: { kind: 'quantity', unit: 'energy' } },
  skillCooldownRemaining: { scope: 'owner', type: { kind: 'quantity', unit: 'milliseconds' } },
  skillCooldownBeforeResetMs: { scope: 'query', type: { kind: 'quantity', unit: 'milliseconds' } },
  radiance: { scope: 'owner', type: { kind: 'enum', values: ['none', 'stellar-conduct', 'stellar-swirl'] } },
  fullMoonsign: { scope: 'team', type: { kind: 'boolean' } },
  firstMoonsign: { scope: 'team', type: { kind: 'boolean' } },
  threeTeamElements: {scope:'team', type:{kind:'boolean'}},
  frostglow: { scope: 'query', type: { kind: 'quantity', unit: 'count' } },
  absorbedElement: { scope: 'query', type: { kind: 'enum', values: ['none', ...absorbedElements] } },
  [partyInfusionFact]: { scope: 'query', type: { kind: 'enum', values: ['none', ...partyInfusionElements] } },
  strikingHand: { scope: 'query', type: { kind: 'enum', values: ['left', 'right'] } },
  stellarAttachments: { scope: 'query', type: { kind: 'quantity', unit: 'count' } },
  hpRatio: { scope: 'owner', type: { kind: 'quantity', unit: 'scalar' } },
  targetHpRatio: { scope:'target', type:{kind:'quantity',unit:'scalar'} },
  'aura.frozen': targetFlag, 'aura.hydro': targetFlag, 'aura.pyro': targetFlag, 'aura.electro': targetFlag, 'aura.cryo': targetFlag });
export function combatFactDeclaration(facts, key) {
  const field = Object.hasOwn(commonCombatFacts, key) ? commonCombatFacts[key] : facts && Object.hasOwn(facts, key) ? facts[key] : undefined;
  return field && { scope: field.scope, type: field.type };
}
export function conditionFactInputs(condition, facts) {
  if (!condition || typeof condition !== 'object') return [];
  if (condition.fact) {
    const field = combatFactDeclaration(facts, condition.fact);
    return field ? [{ key: condition.fact, scope: condition.of ?? field.scope, type: field.type }] : [];
  }
  return Object.values(condition.inputs ?? {}).flatMap(input => conditionFactInputs(input, facts));
}
export function expression(value, facts) {
  if (value?.refinement) return { kind: 'refinement-parameter', values: value.refinement, type: { kind: 'quantity', unit: value.unit } };
  if (value?.amount !== undefined) return { kind: 'constant', value: { kind: 'quantity', unit: value.unit, value: value.amount } };
  if (typeof value === 'number') return { kind: 'constant', value: { kind: 'quantity', unit: 'scalar', value } };
  if (value.call) return { kind: 'formula', formula: ref(value.call), inputs: mapValues(value.inputs, input => expression(input, facts)), output: value.output ?? 'value' };
  if (value.teamStat) return { kind: 'team-attribute', key: ref('attribute.' + value.teamStat), aggregate: value.aggregate, ...(value.at && { at: value.at }), ...(value.excludeNonConvertible && { excludeNonConvertible: true }) };
  if (value.fact) {
    const field = combatFactDeclaration(facts, value.fact);
    if (!field) throw new Error('Unknown combat fact: ' + value.fact);
    return { kind: 'fact', key: value.fact, ...field, ...(value.of ? { scope: value.of } : {}), ...(value.at ? { at: value.at } : {}) };
  }
  if (value.stat) return { kind: 'attribute', key: ref('attribute.' + value.stat), actor: { role: value.actor ?? 'owner' },
    at: value.at ?? { kind: 'current', phase: 'same' },
    ...(value.excludeCurrentEffect ? { excludeCurrentEffect: true } : {}),
    ...(value.excludeNonConvertible && { excludeNonConvertible: true }),
    ...(value.excludeExtraAttack ? { excludeExtraAttack: true } : {}),
    ...(value.excludeOwnerBuffs ? { excludeOwnerBuffs: value.excludeOwnerBuffs.map(id => ref(id)) } : {}) };
  if (value.state) return { kind: 'actor-state', actor: { role: value.actor ?? 'owner' }, property: value.state };
  if (value.parameter) return { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: value.skill, parameterId: value.parameter, type: { kind: 'quantity', unit: value.unit ?? 'scalar' } };
  if (value.teamCount) return { kind: 'team-count', ...value.teamCount };
  if (value.teamRegion) return {kind:'team-region',region:value.teamRegion,
    ...(value.excludeOwner && { excludeOwner: true }), ...(value.match && { match: value.match })};
  throw new Error('Unknown character value: ' + JSON.stringify(value));
}

export const all = nodes => nodes.reduce((previous, next) => previous ? { kind: 'formula', formula: ref('condition.all'),
  inputs: { term0: previous, term1: next }, output: 'active' } : next, undefined);
function eligibleHits(buff, modifier) {
  const eligible = { ...buff.appliesTo };
  for (const [key, values] of Object.entries(modifier.appliesTo ?? {})) {
    if (key === 'excludeHitIds') {
      eligible[key] = [...new Set([...(eligible[key] ?? []), ...values])];
      continue;
    }
    eligible[key] = eligible[key] ? eligible[key].filter(value => values.includes(value)) : values;
    if (!eligible[key].length) throw new Error(buff.id + ': 增益与贡献的命中范围没有交集。');
  }
  return eligible;
}
export function grantBuffs(owner, effects, sources, facts, unlock = {}, parentTalent, talents = []) {
  const ruleIds = [];
  for (const buff of owner.buffs ?? []) for (const [index, modifier] of buff.modifiers.entries()) {
    const key = index === 0 ? buff.id : buff.id + '.' + index;
    const predicate = all([buff.condition, modifier.condition].filter(v => v !== undefined).map(v => expression(v, facts)));
    let trigger = buff.trigger ?? permanent, lifetime = buff.lifetime ?? permanent;
    const talent = trigger.cast ? talents.find(t => t.id === trigger.cast) : parentTalent;
    if (trigger === 'cast' || trigger.cast) {
      const duration = talent?.parameters.find(p => p.id === buff.duration?.parameter);
      if (!duration || duration.unit !== 'seconds' || !duration.values.every(seconds => seconds === duration.values[0])) throw new Error(buff.id + ': 技能持续时间曲线缺失或随等级变化。');
      trigger = { kind: 'event', selector: { kinds: ['action'], skillIds: [talent.id], actor: 'owner', target: 'any' } };
      lifetime = { kind: 'interval', durationMs: Math.round(duration.values[0] * 1000), phase: 'after' };
    }
    let counter;
    if (buff.counter) {
      const cap = talent?.parameters.find(p => p.id === buff.counter.cap.parameter);
      if (trigger.kind !== 'event' || !cap || !cap.values.every(value => value > 0 && value === cap.values[0])) throw new Error(buff.id + ': 增益计数上限或触发无效。');
      counter = { ...buff.counter, cap: cap.values[0] };
    }
    let charges;
    if (buff.charges) {
      const parameter = talent?.parameters.find(p => p.id === buff.charges.parameter);
      if (!parameter || !parameter.values.every(value => Number.isSafeInteger(value) && value > 0 && value === parameter.values[0])) throw new Error(buff.id + ': 次数参数无效。');
      charges = { categories: buff.charges.categories, perRecipient: parameter.values[0] };
    }
    const recipient = modifier.recipient ?? buff.recipient ?? 'owner';
    const activation = { ...unlock, ...buff.activation, ...(modifier.ownerElements ? { elements: modifier.ownerElements } : {}) };
    if (modifier.constellation) activation.constellation = Math.max(activation.constellation ?? 0, modifier.constellation);
    ruleIds.push(ref(key));
    effects.push({
      identity: ref(key), ...(buff.modifiers.length > 1 ? { buff: ref(buff.id) } : {}), sources, activation, trigger, lifetime,
      ...(charges ? { charges } : {}), ...(counter ? { counter } : {}), ...(modifier.nonConvertible && { nonConvertible: true }), ...(modifier.extraAttack ? { extraAttack: true } : {}),
      ...(buff.windowFact ? { windowFact: buff.windowFact } : {}),
      recipient: recipient === 'team' ? { role: 'team', excludeOwner: buff.excludeOwner ?? false,
        ...(modifier.recipientElements && { elements: modifier.recipientElements }),
        ...(modifier.recipientWeaponTypes && { weaponTypes: modifier.recipientWeaponTypes }) } : { role: recipient },
      target: { kind: 'attribute', attribute: ref(modifier.target) }, value: expression(modifier.value, facts),
      ...(predicate ? { predicate } : {}), appliesTo: eligibleHits(buff,modifier), application: buff.application ?? 'always', priority: buff.priority ?? 0,
      stacking: { group: key, scope: 'owner', policy: 'add', maxStacks: 1, retain: 'latest', ...buff.stacking },
    });
  }
  return ruleIds;
}
