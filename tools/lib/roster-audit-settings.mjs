import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { readContentSource } from './content-source.mjs';

export const fact = value => ({ value, provenance: 'explicit', sourceRefs: [] });
export const number = (unit, value) => fact({ kind: 'quantity', unit, value });
export const bool = value => fact({ kind: 'boolean', value });
export const elements = ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];
export const subject = { kind: 'actor', id: 'actor' };
const main = readContentSource(new URL('../../src/game-data/data/tables/artifact-main.json', import.meta.url));

/** Independent, legal level-one calculation settings, with no inventory or combat recording. */
export function auditBuild(character, weapon, sets = []) {
  return { schemaVersion: character.schemaVersion, kind: 'calculation-build', dataVersion: character.dataVersion, character, weapon, sets, artifacts: [],
    artifactMain: main, artifactMainSourceRefs: ['content.artifact-main'], sources: [{ id: 'content.artifact-main', kind: 'definition' }],
    level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
}
export function auditHit(character, talent, hit, level = 1) {
  const event = { id: 'hit', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: 1, order: 1, skillId: talent.id, hitId: hit.id,
    category: hit.category, sourceEventIds: [], facts: {} };
  const rate = Object.fromEntries((talent.inputs ?? []).filter(input => input.usage !== 'healing').map(input => [input.id, number(input.type.unit, input.min)]));
  const setup = { targets: [{ id: 'enemy', inputs: { level: number('count', level), defenseReduction: number('scalar', 0), ordinaryDamageReduction: number('scalar', 0),
    ...Object.fromEntries(elements.map(e => ['resistance.' + e, number('scalar', 0.1)])) }, facts: {} }],
    team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [], events: [event] };
  const frame = { eventId: 'hit', targetId: 'enemy', sourceEventId: null, phase: 'before', facts: rate, actorFacts: {}, applications: [], captures: {},
    factOverrides: [{ subject, facts: { onField: bool(true), shielded: bool(false), hpRatio: number('scalar', 1) } }] };
  if (hit.infusion) frame.factOverrides[0].facts[hit.infusion.fact] = bool(false);
  for (const {castWindow} of character.talents) if (castWindow) frame.factOverrides[0].facts[castWindow.fact] = bool(false);
  for (const key of ['vesna.stance', 'wanderer.windfavored', 'wriothesley.chillingPenalty']) {
    if (Object.hasOwn(character.metadata.facts ?? {}, key)) frame.factOverrides[0].facts[key] = bool(false);
  }
  for (const slot of hit.base.captures) {
    const capture = { id: slot.id, kind: 'capture', actorId: 'actor', targetIds: [], timeMs: 0, order: 0, skillId: slot.sourceSkillId, sourceEventIds: [], facts: {} };
    if (character.id === 'hutao') capture.subjectFacts = [{ subject, values: { onField: bool(true), 'hutao.paramitaPapilio': bool(false) } }];
    if (character.id === 'yaoyao') capture.subjectFacts = [{ subject, values: { onField: bool(true), 'yaoyao.radishBurstArea': bool(false) } }];
    if (character.id === 'fischl') capture.subjectFacts = [{ subject, values: {
      onField: bool(true), 'fischl.hexereiSecretRite': bool(false),
      'fischl.hexereiOverloadActive': bool(false), 'fischl.hexereiCoordinationActive': bool(false),
    } }];
    if (character.id === 'kujousara') capture.subjectFacts = [{ subject, values: {
      onField: bool(true), 'kujousara.tenguJuuraiRecipient': bool(false),
    } }];
    if (character.id === 'aether-geo' || character.id === 'lumine-geo') capture.subjectFacts = [{ subject, values: {
      onField: bool(true),
      'traveler.enhancedResonance.anemo': bool(false), 'traveler.enhancedResonance.geo': bool(false),
      'traveler.enhancedResonance.electro': bool(false), 'traveler.enhancedResonance.dendro': bool(false),
      'traveler.enhancedResonance.hydro': bool(false), 'traveler.enhancedResonance.pyro': bool(false),
      'traveler.enhancedResonance.cryo': bool(false), 'traveler.enhancedAttribute.first': bool(false),
      'traveler.enhancedAttribute.second': bool(false),
    } }];
    if (hit.id === 'wanderer.a1.descent-arrow') capture.subjectFacts = [{ subject, values: {
      'wanderer.windfavored': bool(true), 'wanderer.jadeClaimed-pyro': bool(false), 'wanderer.jadeClaimed-cryo': bool(false),
    } }];
    setup.events.unshift(capture);
    frame.captures[slot.id] = { eventId: slot.id, phase: slot.allowedPhases[0] };
  }
  return { setup, request: { actorId: 'actor', hit: { definition: { group: 'characters', namespace: character.namespace, id: character.id, revision: character.revision }, hitId: hit.id },
    critMode: 'noncritical', reactionMode: 'none', frame } };
}

export const novice = { WEAPON_SWORD_ONE_HAND: 'dullblade', WEAPON_CATALYST: 'apprenticesnotes', WEAPON_CLAYMORE: 'wastergreatsword',
  WEAPON_BOW: 'huntersbow', WEAPON_POLE: 'beginnersprotector' };

export function setGateFacts(character, frame, values) {
  for (const [key, value] of Object.entries(values)) {
    const field = combatFactDeclaration(character.metadata.facts, key);
    if (!field) throw new Error(character.id + ' 缺少门槛事实声明 ' + key);
    const input = typeof value === 'number' ? number(field.type.unit, value) : typeof value === 'boolean' ? bool(value) : fact({ kind: 'enum', value });
    if (field.scope === 'query') { frame.facts[key] = input; continue; }
    const subject = field.scope === 'team' ? { kind: 'team' } : field.scope === 'target' ? { kind: 'target', id: 'enemy' } : { kind: 'actor', id: 'actor' };
    let row = frame.factOverrides.find(row => row.subject.kind === subject.kind && row.subject.id === subject.id);
    if (!row) frame.factOverrides.push(row = { subject, facts: {} });
    row.facts[key] = input;
  }
}

// A fully specified single-hit baseline. Scenario-specific gates overwrite these settings.
export function setAuditDefaults(entity, frame) {
  const values = {};
  for (const [key, field] of Object.entries(entity.metadata.facts ?? {})) {
    if (['source-event', 'contributor'].includes(field.scope)) continue;
    if (field.scope === 'query' && entity.metadata.talents?.some(talent => talent.inputs?.some(input => input.id === key))) continue;
    const subject = field.scope === 'team' ? 'team' : field.scope === 'target' ? 'target' : 'actor';
    const previous = field.scope === 'query' ? frame.facts : frame.factOverrides.find(row => row.subject.kind === subject)?.facts;
    if (Object.hasOwn(previous ?? {}, key)) continue;
    values[key] = field.type.kind === 'quantity' ? 0 : field.type.kind === 'boolean' ? false
      : field.type.values.includes('none') ? 'none' : field.type.values[0];
  }
  setGateFacts(entity, frame, values);
}

export function projectFacts(rows, eventFacts = {}) {
  const facts = rows.map(({ subject, values }) => ({
    subject: subject.kind === 'actor' && subject.id === 'actor' ? { kind: 'actor', id: 'owner' }
      : subject.kind === 'target' && subject.id === 'enemy' ? { kind: 'target', id: 'target' } : subject,
    values: structuredClone(values),
  }));
  if (Object.keys(eventFacts).length) facts.push({ subject: { kind: 'event' }, values: structuredClone(eventFacts) });
  return facts;
}

export function projectQuery(request, targetFacts = {}) {
  const facts = projectFacts(request.frame.factOverrides.map(({ subject, facts }) => ({ subject, values: facts })), request.frame.facts);
  if (Object.keys(targetFacts).length) {
    const target = facts.find(row => row.subject.kind === 'target');
    if (target) target.values = { ...targetFacts, ...target.values };
    else facts.push({ subject: { kind: 'target', id: 'target' }, values: structuredClone(targetFacts) });
  }
  return { hit: request.hit, crit: request.critMode, reaction: request.reactionMode, facts };
}
