import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getCharacter, loadBattleScenes } from '@leyline/game-data';
import { grantBuffs } from '@leyline/schema/buffs';
import { characterHitRef, subjectFacts, talentInputIssues, valueMatchesType, type Build, type CalculationBinding,
  type DamageRequest, type FactSubject } from '@leyline/schema';
import { catalogInventory, readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { calculatorBuffChecked, calculatorEffectControls, calculatorLayerSeconds, enableCalculatorBuff, resolveBuffSelection } from '../../../../src/web/src/domain/calculator-buffs';
import { calculatorFactPreset, calculatorHitFactFields, missingCalculatorPresets, presetCalculatorHitInputs,
  setCalculatorFact, type CalculatorFactField } from '../../../../src/web/src/domain/calculator-conditions';
import { calculatorSupportText } from '../../../../src/web/src/domain/calculator-factors';

// Inspect the bindings independently of the picker's field collector. A dropped field must fail the audit.
function editableFacts(binding?: CalculationBinding, owner = 'owner'): CalculatorFactField[] {
  if (binding?.kind === 'formula') return Object.values(binding.inputs).flatMap(input => editableFacts(input, owner));
  if (binding?.kind !== 'fact' || binding.at === 'source-event' || binding.scope === 'source-event') return [];
  const subjects: Record<typeof binding.scope, FactSubject> = {
    owner: { kind: 'actor', id: owner }, recipient: { kind: 'actor', id: 'recipient' },
    'event-actor': { kind: 'actor', id: 'recipient' }, contributor: { kind: 'actor', id: 'contributor' },
    query: { kind: 'event' }, team: { kind: 'team' }, target: { kind: 'target', id: 'target' },
  };
  return [{ key: binding.key, type: binding.type, subject: subjects[binding.scope] }];
}

function checkField(field: CalculatorFactField, source: string) {
  const value = calculatorFactPreset(field, 'owner');
  expect(valueMatchesType(value, field.type), source + '/' + field.key).toBe(true);
  if (value.kind === 'quantity') {
    const initial = ['hpRatio', 'targetHpRatio', 'nearbyEnemies', 'targetsHit', 'targetsDamaged', 'reactionCoefficient'].includes(field.key) ? 1 : 0;
    expect(value.value, source + '/' + field.key).toBe(initial);
  }
  if (field.type.kind === 'enum' && field.type.values.includes('none')) expect(value.value, source).toBe('none');
  if (field.type.kind === 'boolean') {
    expect(value.value, source).toBe(field.key === 'onField' && field.subject?.kind === 'actor' && field.subject.id === 'owner');
  }
}

it('provides initial and enabled card values for every modifier in the calculation library and every battle scene', async () => {
  const library = readCalculationLibrary();
  const effects = [...library.effects];
  for (const scene of await loadBattleScenes()) grantBuffs(scene, effects, [scene.id], scene.facts ?? {});
  const character = await getCharacter('kaeya');
  const hit = characterHitRef(character, character.talents[0].hits[0].id);

  for (const effect of effects) {
    const id = effect.identity.id;
    const damage: DamageRequest = { hit, crit: 'critical', reaction: 'none' };
    const controls = calculatorEffectControls(effect, library, 'owner', 'recipient', 'contributor');
    const card = { ...controls, id, ownerId: 'owner', disabled: false, checked: false,
      explicit: effect.application === 'explicit', confirmTrigger: effect.trigger.kind === 'event' };
    expect(calculatorBuffChecked(card, damage), id).toBe(!card.explicit && !card.confirmTrigger
      && !controls.requirements.length && !controls.hp && !controls.stacks);
    for (const binding of [effect.predicate, effect.value]) {
      for (const expected of editableFacts(binding)) expect(controls.fields, id).toContainEqual(expected);
    }
    for (const field of controls.fields) checkField(field, id);
    const initial = resolveBuffSelection([card], damage, {}, 'owner', new Map());
    if (card.explicit && !card.confirmTrigger) {
      expect(initial.get(id), id).toBe(false);
      const reopened = { ...damage, effectApplications: [{ instanceId: id, active: null }] };
      expect(resolveBuffSelection([card], reopened, {}, 'owner', new Map()).get(id), id).toBe(false);
    }
    if (card.confirmTrigger) expect(initial.has(id), id).toBe(false);
    enableCalculatorBuff(card, damage, {}, 'owner');
    for (const field of controls.fields) {
      if (field.fromTrigger) continue;
      const saved = subjectFacts(damage.facts, field.subject!)?.[field.key]?.value;
      expect(saved && valueMatchesType(saved, field.type), id + '/' + field.key).toBe(true);
    }
    expect(calculatorBuffChecked(card, damage, true), id).toBe(true);
    if (card.stacks) expect(subjectFacts(damage.facts, { kind: 'actor', id: 'owner' })?.[card.stacks.key]?.value?.value, id).toBe(card.stacks.max);
    if (effect.lifetime.kind === 'interval') {
      const seconds = calculatorLayerSeconds({ durationMs: effect.lifetime.durationMs, maxLayers: effect.stacking.maxStacks });
      expect(seconds * 1000, id).toBeCloseTo(effect.lifetime.durationMs);
      expect(seconds, id).toBeGreaterThan(0);
    }
  }
  expect(effects.length).toBeGreaterThan(library.effects.length);
}, 60000);

it('checks every catalog hit and validates talent input defaults against its limits at every constellation', () => {
  const inventory = catalogInventory();
  const modifierIds = new Set(readCalculationLibrary().effects.map(effect => effect.identity.id));
  for (const group of ['characters', 'weapons', 'sets'] as const) {
    for (const id of inventory[group]) {
      const folder = group === 'sets' ? 'artifact-sets' : group;
      const entity: Build['character'] | NonNullable<Build['weapon']> | Build['sets'][number] = readCalculationData('src/game-data/data/' + folder + '/' + id + '.json');
      const owners = entity.kind === 'character-definition' ? [...entity.metadata.talents, ...entity.metadata.passives, ...entity.metadata.constellations]
        : entity.kind === 'artifact-set-definition' ? entity.metadata.effects : [];
      for (const owner of [entity.metadata, ...owners]) for (const buff of owner.buffs ?? []) {
        for (const index of buff.modifiers.keys()) expect(modifierIds.has(index ? buff.id + '.' + index : buff.id), id + '/' + buff.id).toBe(true);
      }
      const rows = entity.kind === 'character-definition' ? entity.talents.flatMap(talent => talent.hits.map(hit => ({ entity, talent, hit })))
        : (entity.kind === 'weapon-definition' ? entity.hits ?? [] : entity.effects.flatMap(piece => piece.hits ?? [])).map(hit => ({ entity, hit, talent: undefined }));
      for (const row of rows) {
        const hitId = row.hit.id;
        const fields = calculatorHitFactFields(row, 'contributor', 'recipient');
        const bindings = [...Object.values(row.hit.base.bindings), ...Object.values(row.hit.damage)
          .flatMap(branch => [...Object.values(branch.bindings), branch.predicate])];
        for (const binding of bindings) for (const field of editableFacts(binding, 'recipient')) {
          expect(fields, hitId).toContainEqual(expect.objectContaining(field));
        }
        for (const field of fields) checkField(field, hitId);
        if (!row.talent?.inputs?.length) continue;
        const damage: DamageRequest = { hit: characterHitRef(entity, hitId), crit: 'critical', reaction: 'none' };
        const inputs = row.talent.inputs.filter(input => input.usage !== 'healing');
        presetCalculatorHitInputs(damage, inputs);
        const facts = subjectFacts(damage.facts, { kind: 'event' });
        const values = Object.fromEntries(inputs.map(input => {
          const value = facts?.[input.id]?.value;
          expect(value?.kind === 'quantity' && value.value, hitId + '/' + input.id).toBe(input.min);
          return [input.id, value?.kind === 'quantity' ? value.value : NaN];
        }));
        for (let rank = 0; rank <= 6; rank++) expect(talentInputIssues(row.talent, values, rank), hitId).toEqual([]);
      }
    }
  }
}, 60000);

it('fills only a requested missing fact, once, and preserves explicit zero and false', async () => {
  const character = await getCharacter('kaeya');
  const damage: DamageRequest = { hit: characterHitRef(character, character.talents[0].hits[0].id), crit: 'critical', reaction: 'none' };
  const subject = { kind: 'actor', id: 'owner' } as const;
  const fields: CalculatorFactField[] = [{ key: 'hpRatio', type: { kind: 'quantity', unit: 'scalar' }, subject },
    { key: 'onField', type: { kind: 'boolean' }, subject }];
  const inputs = fields.map(({ key, type }) => ({ key, type, scope: 'owner', requiredBy: ['hit'], sourceRefs: [] }));
  const resolve = () => missingCalculatorPresets(damage.facts, fields, inputs, 'owner');
  expect(resolve().map(setting => setting.value.value)).toEqual([1, true]);
  expect(missingCalculatorPresets(undefined, fields, inputs.map(input => ({ ...input, scope: 'peer' })), 'owner')).toEqual([]);
  for (const preset of resolve()) setCalculatorFact(damage, preset, 'owner');
  expect(resolve()).toEqual([]);
  setCalculatorFact(damage, { ...fields[0], value: { kind: 'quantity', unit: 'scalar', value: 0 } }, 'owner');
  setCalculatorFact(damage, { ...fields[1], value: { kind: 'boolean', value: false } }, 'owner');
  expect(resolve()).toEqual([]);
});

it('guards calculator copy in the page and its imported Vue components, including conditional dialogs', () => {
  const visited = new Set<string>();
  function check(component: URL) {
    if (visited.has(component.href)) return;
    visited.add(component.href);
    const source = readFileSync(component, 'utf8');
    expect(source.match(/待核实|待核验|待确认|需补充条件/), component.pathname).toBeNull();
    for (const match of source.matchAll(/from ['"](\.[^'"]+\.vue)['"]/g)) check(new URL(match[1], component));
  }
  check(new URL('../../../../src/web/src/pages/DamageCalculator.vue', import.meta.url));
  expect([...visited].some(url => url.endsWith('/CalculatorBuffPicker.vue'))).toBe(true);
});

it('presents current catalog evidence and older calculator notes without pending-status placeholders', () => {
  const forbidden = /待核实|待核验|待确认|需补充条件/;
  const notes = readCalculationLibrary().coverage.flatMap(record => [record.reason, ...record.mechanisms.map(mechanism => mechanism.reason)]);
  for (const note of new Set(notes)) expect(calculatorSupportText(note)).not.toMatch(forbidden);
  for (const wording of ['待核实', '待核验', '待确认']) {
    expect(calculatorSupportText('伤害元素' + wording)).toBe('伤害元素尚无验证结论');
  }
  expect(calculatorSupportText('需补充条件')).not.toMatch(forbidden);
});
