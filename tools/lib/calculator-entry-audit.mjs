import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { auditBuild } from './roster-audit-settings.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

/** Exercise the shipped selection and condition paths against the source inventory. */
export async function auditCalculatorEntries(entities, results) {
  const { calculatorHitChoices } = await loadContentSchema('/src/web/src/domain/calculator-hits.ts');
  const { calculatorHitFactFields } = await loadContentSchema('/src/web/src/domain/calculator-conditions.ts');
  const { calculatorBuffChoices } = await loadContentSchema('/src/web/src/domain/calculator-buffs.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const { findBuildHit } = await loadContentSchema();
  const hits = [], equipmentHits = [], buffs = [], clauses = [], failures = [];
  const readings = new Map(results.evaluatedHits.map(row => [row.entity + '/' + row.hit, row]));
  const equipmentChecks = [...results.currentEquipment.rows, ...results.additionalEquipment.rows, ...results.remainingEquipment.rows, ...results.triggeredStrikes.rows];
  const noviceIds = ['dullblade', 'wastergreatsword', 'huntersbow', 'apprenticesnotes', 'beginnersprotector'];
  const weapons = new Map(entities.weapons.filter(weapon => noviceIds.includes(weapon.id)).map(weapon => [weapon.weaponType, weapon]));
  for (const character of entities.characters) {
    const minimum = auditBuild(character, weapons.get(character.identity.weaponType));
    const maximum = { ...minimum, level: 90, ascension: 6, constellation: 6 };
    const available = new Map(calculatorHitChoices(character, maximum).map(choice => [choice.hitId, choice]));
    const initial = new Map(calculatorHitChoices(character, minimum).map(choice => [choice.hitId, choice.available]));
    for (const talent of character.talents) for (const { hit, field, unlock } of authoredHitEntries(character.metadata, talent.id)) {
      const choice = available.get(hit.id), found = choice && findBuildHit(maximum, choice.ref);
      const reading = readings.get(character.id + '/' + hit.id);
      const fields = calculatorHitFactFields(found, 'owner');
      const inputs = [...new Map(fields.map(({ key, type, subject, label }) => [key + '/' + JSON.stringify(subject), { key, type, subject, label }])).values()];
      const row = { entity: character.id, revision: character.revision, field, hit: hit.id, name: hit.name,
        category: found?.hit.category, element: found?.hit.element,
        selected: choice?.available === true && found?.hit.id === hit.id, unlock, inputs,
        comparison: reading && { value: reading.value, expected: reading.expected, issue: reading.issue },
        neutralComparison: reading?.baseComparison, source: hit.sources ?? character.sources,
        execution: reading?.status };
      if (!row.selected) row.issue = '正式命中未能从计算器菜单选中';
      else if (unlock?.rank && initial.get(hit.id) !== false) row.issue = '解锁前仍能选择此命中';
      hits.push(row);
      if (row.issue) failures.push(row);
    }
    // Talent prose and unbound table rows remain in the inventory even when no control exists.
    for (const [index, talent] of character.metadata.talents.entries()) {
      clauses.push({ entity: character.id, revision: character.revision, field: '/talents/' + index + '/description', text: talent.description,
        hitIds: talent.hits.map(hit => hit.id), buffIds: (talent.buffs ?? []).map(buff => buff.id) });
    }
  }
  const carriers = new Map(entities.characters.filter(c => ['kaeya','razor','amber','lisa','xiangling'].includes(c.id)).map(c => [c.identity.weaponType,c]));
  function probeEquipment(entity, part, field, build, below) {
    const choices = calculatorHitChoices(build.character, build);
    const locked = below && calculatorHitChoices(below.character, below);
    for (const [index, hit] of (part.hits ?? []).entries()) {
      const choice = choices.find(row => row.ref.definition.id === entity.id && row.hitId === hit.id);
      const found = choice && findBuildHit(build, choice.ref);
      const pointer = field + '/' + index;
      const checks = equipmentChecks.filter(check => check.entity === entity.id && (check.field === '/hits/' + hit.id || check.settings?.hit === hit.id));
      const sample = checks.find(check => check.value > 0 && !check.issue && Number.isFinite(check.expected) && Math.abs(check.value - check.expected) <= Math.max(1e-8, Math.abs(check.expected) * 1e-9));
      const accumulated = !sample && results.setHealing.rows.find(check => check.entity === entity.id && check.field.startsWith(pointer + '/')
        && !check.issue && check.actual?.[0]?.value > 0);
      const comparison = sample ? { value: sample.value, expected: sample.expected, rank: sample.rank ?? sample.settings?.refinement, field: sample.field }
        : accumulated ? { value: accumulated.actual[0].value, expected: accumulated.expected[0].value, field: accumulated.field } : undefined;
      const row = { entity: entity.id, revision: entity.revision, field: pointer, hit: hit.id, comparison,
        selected: !!found && !!choice.available, inputs: calculatorHitFactFields(found, 'owner'), source: entity.sources };
      if (!row.selected || locked?.some(row => row.ref.definition.id === entity.id && row.hitId === hit.id)) row.issue = '装备命中的配装授予或选择失败';
      equipmentHits.push(row);
      if (row.issue) failures.push(row);
    }
  }
  for (const w of entities.weapons) if (w.hits?.length) {
    const build = auditBuild(carriers.get(w.weaponType), w);
    probeEquipment(w, w, '/hits', build, { ...build, weapon: undefined });
  }
  const carrier = carriers.values().next().value;
  for (const set of entities.sets) for (const [index, part] of set.effects.entries()) if (part.hits?.length) {
    const slots = set.slots.slice(0, part.pieces).map(slot => ({ slot, setId: set.id }));
    const build = { ...auditBuild(carrier, weapons.get(carrier.identity.weaponType), [set]), theoreticalSetSlots: slots };
    probeEquipment(set, part, '/effects/' + index + '/hits', build, { ...build, theoreticalSetSlots: slots.slice(1) });
  }
  for (const entity of [...entities.characters, ...entities.weapons, ...entities.sets]) {
    const metadata = entity.metadata;
    const menus = new Map();
    function inspect(owner, field) {
      for (const [index, buff] of (owner.buffs ?? []).entries()) {
        const pointer = field + '/buffs/' + index;
        if (!buff.modifiers.length) {
          buffs.push({ entity: entity.id, revision: entity.revision, field: pointer, id: buff.id, operation: buff.onDamage ? '命中资源变化' : '定期资源变化' });
          continue;
        }
        for (const [i, modifier] of buff.modifiers.entries()) {
          const role = modifier.recipient ?? buff.recipient ?? 'owner';
          const allowed = metadata.kind === 'character-definition' ? [entity] : entities.characters;
          const supplier = allowed.find(c => (metadata.kind === 'character-definition' || c.talents.some(talent => talent.category === 'skill') && c.talents.some(talent => talent.category === 'burst'))
            && (metadata.kind !== 'weapon-definition' || entity.weaponType === c.identity.weaponType)
            && (!buff.activation?.weaponTypes || buff.activation.weaponTypes.includes(c.identity.weaponType))
            && (!buff.activation?.characterGameIds || buff.activation.characterGameIds.includes(c.identity.gameId))
            && (!(modifier.ownerElements ?? buff.activation?.elements) || (modifier.ownerElements ?? buff.activation.elements).includes(c.identity.element)));
          if (!supplier) {
            const row = { entity: entity.id, field: pointer, id: buff.id, issue: '未找到满足授予门槛的正式配装' };
            buffs.push(row); failures.push(row); continue;
          }
          const recipient = role === 'team' ? [supplier, ...entities.characters].find(c => (!buff.excludeOwner || c.id !== supplier.id)
            && (!modifier.recipientElements || modifier.recipientElements.includes(c.identity.element))
            && (!modifier.recipientWeaponTypes || modifier.recipientWeaponTypes.includes(c.identity.weaponType))) : supplier;
          const pieces = owner.pieces ?? 0;
          const key = JSON.stringify([supplier.id, recipient?.id, pieces]);
          if (recipient && !menus.has(key)) {
            const set = entity.kind === 'artifact-set-definition';
            const weapon = entity.kind === 'weapon-definition' ? entity : weapons.get(supplier.identity.weaponType);
            const build = { ...auditBuild(supplier, weapon, set ? [entity] : []), level: 90, ascension: 6, constellation: 6,
              refinement: weapon.maxRefinement, ...(set ? { theoreticalSetSlots: entity.slots.slice(0, pieces).map(slot => ({ slot, setId: entity.id })) } : {}) };
            const project = createEmptyProject();
            const sourceId = addActorFromBuild(project, build);
            const actorId = recipient.id === supplier.id ? sourceId : addActorFromBuild(project, auditBuild(recipient, weapons.get(recipient.identity.weaponType)));
            const damage = { hit: { definition: { group:'characters',namespace:'builtin',id:'',revision:'' }, hitId:'' }, crit:'noncritical', reaction:'none' };
            const options = calculatorBuffChoices(project, actorId, damage, 0);
            menus.set(key, new Map(options.filter(option => option.ownerId === sourceId).map(option => [option.effect.id, option])));
          }
          const option = menus.get(key)?.get(buff.id);
          const row = { entity: entity.id, revision: entity.revision, field: pointer + '/modifiers/' + i, id: buff.id,
            supplier: supplier.id, recipient: recipient?.id, role, target: modifier.target, appliesTo: { ...buff.appliesTo, ...modifier.appliesTo },
            listed: !!option?.modifiers.some(m => m.id === (i ? buff.id + '.' + i : buff.id)),
            inputs: (option?.fields ?? []).map(f => ({ key: f.key, type: f.type, subject: f.subject, label: f.label })),
            trigger: option?.triggerSkill ?? (option?.confirmTrigger ? '已确认触发' : undefined),
            layers: option?.stacks, duration: option?.timing?.durationMs, source: entity.sources };
          if (!row.listed) row.issue = '授予条款缺少计算器增益候选或合法受益对象';
          buffs.push(row);
          if (row.issue) failures.push(row);
        }
      }
    }
    inspect(metadata, '');
    for (const group of ['talents','passives','constellations','effects']) for (const [index, owner] of (metadata[group] ?? []).entries()) inspect(owner, '/' + group + '/' + index);
  }
  return { hits, equipmentHits, buffs, talentDescriptions: clauses, failures, summary: {
    calculatorCharacterHits: hits.length, calculatorSelectableHits: hits.filter(row => row.selected).length,
    calculatorEquipmentHits: equipmentHits.length, calculatorSelectableEquipmentHits: equipmentHits.filter(row => row.selected).length,
    calculatorEquipmentHitComparisons: equipmentHits.filter(row => row.selected && row.comparison).length,
    calculatorBuffModifiers: buffs.filter(row => row.target).length, calculatorListedBuffModifiers: buffs.filter(row => row.listed).length,
    calculatorEntryFailures: failures.length,
  } };
}
