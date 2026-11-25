import { createHash } from 'node:crypto';
import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const folders = { character: 'characters', weapon: 'weapons', set: 'artifact-sets' };
const resonanceFile = 'src/game-data/data/calculation/resonances.json';
const reactionFile = 'src/game-data/data/calculation/reactions.json';
const readData = name => readContentSource(new URL('../../' + name, import.meta.url));

/** Enumerate authored definitions. Presence or a source label does not imply validation. */
export async function leylineSingleHitInventory(entities, clauseInventory) {
  const { isCalculatorCombatModifier } = await loadContentSchema();
  const rows = [];
  function add(kind, entity, revision, field, subject, binding, extra = {}) {
    const document = 'src/game-data/data/' + folders[kind] + '/' + entity + '.json';
    rows.push({ id: kind + ':' + entity + ':' + subject + ':' + field, kind, entity, revision, field,
      subject, source: document + '#' + field, binding, ...extra });
  }
  for (const [kind, group] of [['character', entities.characters], ['weapon', entities.weapons], ['set', entities.sets]]) {
    for (const entity of group) {
      const metadata = entity.metadata ?? entity;
      if (kind === 'character') {
        for (const talent of metadata.talents) for (const { hit, field, unlock } of authoredHitEntries(metadata, talent.id)) {
          const talentIndex = metadata.talents.indexOf(talent);
          const parameters = (Array.isArray(hit.base) ? hit.base : []).flatMap(term => {
            const index = (talent.parameters ?? []).findIndex(parameter => parameter.id === term.parameter);
            return index < 0 ? [] : [{ id: term.parameter, field: '/talents/' + talentIndex + '/parameters/' + index }];
          });
          add(kind, entity.id, entity.revision, field, 'hit', { hitId: hit.id, name: hit.name, skillId: talent.id, skillName: talent.name,
            skillField: '/talents/' + talentIndex, category: hit.category ?? talent.category, element: hit.element ?? talent.element,
            family: hit.family ?? 'ordinary', parameters, definition: hit,
            ref: { definition: { group: 'characters', namespace: metadata.namespace, id: entity.id, revision: entity.revision }, hitId: hit.id }, ...(unlock ? { unlock } : {}) });
        }
      } else {
        const owners = kind === 'weapon' ? [[metadata, '']] : metadata.effects.map((owner, index) => [owner, '/effects/' + index]);
        for (const [owner, field] of owners) for (const [index, hit] of (owner.hits ?? []).entries()) {
          add(kind, entity.id, entity.revision, field + '/hits/' + index, 'equipment-hit', { hitId: hit.id, definition: hit,
            ref: { definition: { group: kind === 'weapon' ? 'weapons' : 'sets', namespace: metadata.namespace, id: entity.id, revision: entity.revision }, hitId: hit.id }, ...(owner.pieces ? { pieces: owner.pieces } : {}) });
        }
      }
      const owners = [[metadata, ''], ...['talents', 'passives', 'constellations', 'effects'].flatMap(group =>
        (metadata[group] ?? []).map((owner, index) => [owner, '/' + group + '/' + index]))];
      for (const [owner, field] of owners) for (const [index, buff] of (owner.buffs ?? []).entries()) {
        for (const [modifierIndex, modifier] of buff.modifiers.entries()) {
          if (!isCalculatorCombatModifier(modifier.target, metadata.calculator?.buffs?.[buff.id])) continue;
          add(kind, entity.id, entity.revision, field + '/buffs/' + index + '/modifiers/' + modifierIndex, 'modifier',
            { buffId: buff.id, effectId: modifierIndex ? buff.id + '.' + modifierIndex : buff.id, modifier, buff,
              ...(kind === 'set' && owner.pieces ? { pieces: owner.pieces } : {}) });
        }
      }
    }
  }
  const resonances = readData(resonanceFile);
  for (const [field, owner] of [...resonances.resonances.map((owner, index) => ['/resonances/' + index, owner]), ['/gleam', resonances.gleam]]) {
    for (const [i, buff] of (owner.buffs ?? []).entries()) for (const [j, modifier] of buff.modifiers.entries()) {
      if (!isCalculatorCombatModifier(modifier.target)) continue;
      const pointer = field + '/buffs/' + i + '/modifiers/' + j;
      rows.push({ id: 'public:resonances:modifier:' + pointer, kind: 'resonance', entity: 'resonances', field: pointer,
        subject: 'modifier', source: resonanceFile + '#' + pointer, binding: { buffId: buff.id, effectId: j ? buff.id + '.' + j : buff.id, modifier, buff } });
    }
  }
  const reactions = readData(reactionFile);
  for (const [group, items] of Object.entries(reactions.calculation)) {
    if (!Array.isArray(items) || !['formulas', 'tables', 'attributes', 'effects', 'aggregates', 'damageFamilies'].includes(group)) continue;
    for (const [index, definition] of items.entries()) {
      const field = '/calculation/' + group + '/' + index;
      rows.push({ id: 'public:reactions:' + group + ':' + index, kind: 'reaction', entity: 'reactions', revision: reactions.rules?.revision,
        field, subject: 'reaction-' + group, source: reactionFile + '#' + field, binding: definition });
    }
  }
  const bindingRows = new Map(rows.map(row => [row.id, row]));
  const clauseCounts = new Map();
  for (const clause of clauseInventory?.rows ?? []) {
    const key = 'clause:' + clause.kind + ':' + clause.entity + ':' + createHash('sha256').update(JSON.stringify([clause.field, clause.subject, clause.text, clause.name, clause.scope])).digest('hex').slice(0, 20);
    const count = clauseCounts.get(key) ?? 0;
    clauseCounts.set(key, count + 1);
    const subject = clause.subject === 'hit' && clause.kind !== 'character' ? 'equipment-hit' : clause.subject;
    const binding = bindingRows.get(`${clause.kind}:${clause.entity}:${subject}:${clause.field}`);
    if (binding) binding.evidence = { status: clause.status, refs: clause.refs, inputs: clause.inputs,
      comparison: clause.comparison, proofs: clause.proofs };
    rows.push({ id: key + ':' + count, kind: clause.kind, entity: clause.entity,
      revision: clause.revision, field: clause.field, subject: 'clause', source: clause.refs?.[0], clause,
      ...(binding ? { bindingId: binding.id } : {}) });
  }
  const summary = { entities: Object.fromEntries(Object.entries(entities).map(([key, group]) => [key, group.length])),
    bySubject: {} };
  for (const row of rows) summary.bySubject[row.subject] = (summary.bySubject[row.subject] ?? 0) + 1;
  return { rows, summary };
}
