import { commonCombatFacts } from '../../src/schema/src/calculation/buffs.mjs';
// Convert authored fields from a 0.1.0 snapshot. The caller owns the returned copy.
export function convertPreviousCharacter(input, version) {
  const character = structuredClone(input);
  if (character.schemaVersion !== '0.1.0' || character.kind !== 'character-definition') throw new Error('旧版角色格式无效。');
  character.schemaVersion = version;
  for (const key of Object.keys(character.facts ?? {})) if (Object.hasOwn(commonCombatFacts, key)) {
    const old = character.facts[key], current = commonCombatFacts[key];
    if (old.scope !== current.scope || JSON.stringify(old.type) !== JSON.stringify(current.type)) throw new Error('旧版事实与公共定义冲突：' + key);
    delete character.facts[key];
  }
  const effects = new Map((character.effects ?? []).map(effect => [effect.id, effect]));
  function moveBuffs(owner, ids, unlock = {}) {
    if (!ids?.length) return;
    owner.buffs = ids.map(id => {
      if (!effects.has(id)) throw new Error('旧版授予缺少定义：' + id);
      const { target, value, activation = {}, ...buff } = effects.get(id);
      effects.delete(id);
      const extra = Object.fromEntries(Object.entries(activation).filter(([key, value]) => unlock[key] !== value));
      return { ...buff, ...(Object.keys(extra).length ? { activation: extra } : {}), modifiers: [{ target, value }] };
    });
  }
  moveBuffs(character, character.innateEffects);
  for (const item of character.passives) { moveBuffs(item, item.effects, { ascension: item.unlockAscension }); delete item.effects; }
  for (const item of character.constellations) { moveBuffs(item, item.effects, { constellation: item.rank }); delete item.effects; }
  if (effects.size) throw new Error('旧版效果缺少授予：' + [...effects.keys()].join(', '));
  delete character.effects;
  delete character.innateEffects;
  for (const talent of character.talents) {
    const rows = talent.details.map(row => ({ ...row, keys: [...new Set([...row.template.matchAll(/\{([^}:]+)(?::[^}]*)?\}/g)].map(match => match[1]))] }));
    const firstParams = new Set(talent.hits.map(hit => hit.scaling[0].parameter));
    talent.hits = talent.hits.flatMap(({ id, parameter, scaling, element, category, outputs, ...rest }) => {
      const key = parameter ?? scaling[0].parameter;
      const row = rows.find(row => row.keys.includes(key));
      let name = row?.label.trim() || talent.name;
      if (row && row.keys.length > 1 && row.keys.every(key => firstParams.has(key))) {
        const index = row.keys.indexOf(key);
        name = name === '低空/高空坠地冲击伤害' ? ['低空坠地冲击伤害', '高空坠地冲击伤害'][index] : name + '（第' + (index + 1) + '击）';
      }
      const base = { ...(element === talent.element ? {} : { element }), ...(category === talent.category ? {} : { category }), base: scaling };
      if (outputs.length > 1) {
        if (id !== 'vesna.skill.c6.spirit' || outputs.length !== 2 || outputs[0].family !== 'ordinary' || outputs[1].family !== 'stellar-swirl'
          || outputs[0].condition?.inputs?.term1?.inputs?.term0?.call !== 'vesna.radiance' || outputs[1].condition?.inputs?.term1?.call !== 'vesna.radiance'
          || JSON.stringify(outputs[0].condition.inputs.term0) !== JSON.stringify(outputs[1].condition.inputs.term0)) throw new Error('无法唯一转换旧版多输出：' + id);
        return [
          { id, name: '六命翔风剑灵剑', ...base, ...(outputs[0]?.origin ? { origin: outputs[0].origin } : {}), when: [outputs[0].condition], ...rest },
          { id: id + '.stellar', name: '六命翔风剑灵剑·星扩散', ...base, family: 'stellar-swirl', ...(outputs[1]?.origin ? { origin: outputs[1].origin } : {}),
            when: [outputs[1].condition], ...rest, ...(rest.coverageId ? { coverageId: rest.coverageId + '.stellar' } : {}) },
        ];
      }
      const family = outputs[0]?.family ?? 'unresolved';
      const when = outputs[0]?.condition ? [outputs[0].condition] : undefined;
      if (id === 'vesna.skill.c6.slash') name = '六命翔风剑斩击';
      if (id === 'vesna.skill.c6.spirit') name = '六命翔风剑灵剑';
      return [{ id, name, ...base, ...(family === 'ordinary' ? {} : { family }), ...(outputs[0]?.origin ? { origin: outputs[0].origin } : {}), ...(when ? { when } : {}), ...rest }];
    });
  }
  return character;
}

function compactValue(binding, facts) {
  switch (binding.kind) {
    case 'constant': return binding.value.unit === 'scalar' ? binding.value.value : { amount: binding.value.value, unit: binding.value.unit };
    case 'refinement-parameter': return { refinement: binding.values, unit: binding.type.unit };
    case 'attribute': {
      if (binding.at.kind !== 'current' || binding.at.phase !== 'same' || binding.excludeCurrentEffect) throw new Error('无法转换装备属性读取时点。');
      return { stat: binding.key.id.slice('attribute.'.length), ...(binding.actor.role === 'owner' ? {} : { actor: binding.actor.role }) };
    }
    case 'fact':
      facts[binding.key] = { scope: binding.scope, type: binding.type };
      return { fact: binding.key };
    case 'formula':
      return { call: binding.formula.id, inputs: Object.fromEntries(Object.entries(binding.inputs).map(([k, v]) => [k, compactValue(v, facts)])),
        ...(binding.output === 'value' ? {} : { output: binding.output }) };
    default: throw new Error('无法转换装备表达式：' + binding.kind);
  }
}
export function convertPreviousEquipment(input, version) {
  const { calculation, sources, coverageRefs, effects, ...fields } = structuredClone(input);
  const bundle = calculation.bundle;
  const facts = {}, formulas = new Set();
  const select = (refs, selector) => refs.map(ref => {
    const selected = bundle[selector].find(d => d.identity.id === ref.id && d.identity.namespace === ref.namespace && d.identity.revision === ref.revision);
    if (!selected) throw new Error(fields.id + ' 缺少 ' + ref.id);
    return selected;
  });
  function grants(refs) {
    const buffs = select(refs, 'effects').map(e => {
      const mark = expr => { if (expr?.kind === 'formula') { formulas.add(expr.formula.id); Object.values(expr.inputs).forEach(mark); } };
      mark(e.predicate); mark(e.value);
      if (e.target.kind !== 'attribute') throw new Error(fields.id + ' 无法转换增益目标。');
      const defaults = { group: e.identity.id, scope: 'owner', policy: 'add', maxStacks: 1, retain: 'latest' };
      const stacking = Object.fromEntries(Object.entries(e.stacking).filter(([k,v]) => defaults[k] !== v));
      const { set, ...activation } = e.activation;
      return { id: e.identity.id, ...(e.recipient.role === 'owner' ? {} : { recipient: e.recipient.role }),
        ...(e.recipient.excludeOwner ? { excludeOwner: true } : {}), ...(e.predicate ? { condition: compactValue(e.predicate, facts) } : {}),
        ...(Object.keys(activation).length ? { activation } : {}), ...(Object.keys(e.appliesTo).length ? { appliesTo: e.appliesTo } : {}),
        ...(e.application === 'always' ? {} : { application: e.application }), ...(e.priority ? { priority: e.priority } : {}),
        ...(Object.keys(stacking).length ? { stacking } : {}),
        ...(e.trigger.kind === 'permanent' ? {} : { trigger: e.trigger, lifetime: e.lifetime }),
        modifiers: [{ target: e.target.attribute.id, value: compactValue(e.value, facts) }] };
    });
    return buffs.length ? { buffs } : {};
  }
  function support(refs) {
    const matches = select(refs, 'coverage');
    if (matches.length !== 1) throw new Error(fields.id + ' 无法还原装备覆盖范围。');
    const { resolution, evidence, reason, mechanisms } = matches[0];
    return { resolution, evidence, reason, mechanisms };
  }
  const result = { ...fields, schemaVersion: version, ...grants(calculation.ruleIds),
    ...(effects ? { effects: effects.map(e => ({ pieces: e.pieces, ...grants(e.ruleIds), support: support(e.coverageRefs) })) } : { support: support(coverageRefs) }) };
  if (Object.keys(facts).length) result.facts = facts;
  // The old portable bundle includes common dependencies. Keep only formulas owned by the equipment.
  const owned = bundle.formulas.filter(f => formulas.has(f.identity.id) && f.identity.id.startsWith(fields.id + '.'));
  if (owned.length) result.formulas = owned.map(f => ({ id: f.identity.id, template: f.template }));
  return result;
}


const previous = '0.1.0';
const definitionKey = ({ namespace, id, revision }) => JSON.stringify([namespace, id, revision]);

/** Convert only the supplied file. An ambiguous hit keeps its timeline position for explicit reselection. */
export function convertPreviousDocument(input, version) {
  if (input.schemaVersion !== previous) throw new Error('只支持 0.1.0 文件。');
  const warnings = [];
  if (input.kind === 'character-definition') return { value: convertPreviousCharacter(input, version), warnings };
  if (input.kind === 'definition-library') return { value: { ...structuredClone(input), schemaVersion: version }, warnings };
  if (!input.content || !input.document) throw new Error('旧文件缺少内容表或正文。');
  const value = structuredClone(input), table = value.content;
  table.curves ??= {};
  const weaponKeys = new Map(), setKeys = new Map();
  for (const [key, character] of Object.entries(table.characters)) {
    if (definitionKey(character) !== key) throw new Error('旧角色修订与引用不符：' + key);
    table.characters[key] = convertPreviousCharacter(character, version);
  }
  for (const [group, keys] of [['weapons', weaponKeys], ['sets', setKeys]]) {
    const converted = {};
    for (const [key, old] of Object.entries(table[group])) {
      if (definitionKey(old) !== key) throw new Error('旧装备修订与引用不符：' + key);
      const item = convertPreviousEquipment(old, version);
      const suffix = /^([a-f0-9]{40})(?:[.-](\d+))?$/.exec(item.revision);
      if (suffix) item.revision = suffix[2] ?? '1';
      const next = definitionKey(item);
      if (Object.hasOwn(converted, next)) throw new Error('转换后装备修订出现冲突：' + next);
      converted[next] = item;
      keys.set(key, next);
    }
    table[group] = converted;
  }
  function convertHit(record, actors, path) {
    const damage = record.damage;
    const build = actors.find(actor => actor.id === record.actor)?.build;
    const character = build && input.content.characters[build.character];
    const skill = character?.talents.find(skill => skill.id === damage.skillId);
    const hit = skill?.hits.find(hit => hit.id === damage.hitId);
    const outputs = hit?.outputs ?? [];
    const selected = outputs.find(output => output.id === damage.outputId);
    const rows = [];
    function put(subject, key, fact) {
      let row = rows.find(row => JSON.stringify(row.subject) === JSON.stringify(subject));
      if (!row) { row = { subject, values: {} }; rows.push(row); }
      row.values[key] = fact;
    }
    const actor = id => ({ kind: 'actor', id });
    const explicit = value => ({ value, provenance: 'explicit', sourceRefs: [] });
    function conditions(id, values) {
      for (const [key, v] of Object.entries(values ?? {})) put(actor(id), key, explicit(v === null ? null : typeof v === 'boolean'
        ? { kind: 'boolean', value: v } : { kind: 'quantity', unit: 'scalar', value: v }));
    }
    for (const entry of damage.stateOverrides ?? []) conditions(entry.actor, entry.values);
    conditions(record.actor, damage.conditions);
    for (const [key, fact] of Object.entries({ ...record.facts, ...damage.facts })) put(actor(record.actor), key, fact);
    for (const [key, value] of Object.entries(damage.inputs ?? {})) {
      const field = skill?.inputs?.find(input => input.id === key);
      if (!field) throw new Error(path + ' 未声明计数 ' + key);
      put({ kind: 'event' }, key, explicit(value === null ? null : { kind: 'quantity', unit: field.type.unit, value }));
    }
    const single = outputs.length === 1 && (selected || damage.outputId === null);
    const radiance = rows.find(row => row.subject.kind === 'actor' && row.subject.id === record.actor)?.values.radiance?.value;
    const branch = hit?.id === 'vesna.skill.c6.spirit' && radiance?.kind === 'enum'
      && selected?.family === ({ none: 'ordinary', 'stellar-conduct': 'ordinary', 'stellar-swirl': 'stellar-swirl' })[radiance.value];
    if (!hit || !(single || branch)) {
      warnings.push({ path, recordId: record.id, skillId: damage.skillId, hitId: damage.hitId, outputId: damage.outputId, reason: '此记录须重新选取命中。' });
      delete record.damage;
      delete record.actionId;
      return;
    }
    const { skillId, hitId, outputId, conditions: oldConditions, facts, inputs, stateOverrides, ...rest } = damage;
    const { namespace, id, revision } = character;
    const targetHitId = branch && selected?.family === 'stellar-swirl' ? hitId + '.stellar' : hitId;
    record.damage = { ...rest, hit: { definition: { group: 'characters', namespace, id, revision }, hitId: targetHitId }, ...(rows.length ? { facts: rows } : {}) };
  }
  const recordingIds = new Map();
  function recordedId(id) {
    if (!/^enka\.showcase\..+\.[a-f0-9]{64}$/.test(id)) return id;
    if (!recordingIds.has(id)) recordingIds.set(id, id.replace(/\.[a-f0-9]{64}$/, '.snapshot-' + (recordingIds.size + 1)));
    return recordingIds.get(id);
  }
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    for (const key of ['schemaVersion', 'runtimeVersion', 'dataVersion']) if (node[key] === previous) node[key] = version;
    if ((node.kind === 'calculation-build' || node.runtimeVersion && node.requiredFeatures) && Array.isArray(node.sources)) node.sources = node.sources.map(({ id, kind }) => kind === 'recording' ? { id: recordedId(id), kind, reference: recordedId(id) } : { id, kind: 'definition' });
    if (node.kind === 'calculation-build') {
      if (node.weapon !== null) {
        if (!weaponKeys.has(node.weapon)) throw new Error(path + ' 未找到武器快照。');
        node.weapon = weaponKeys.get(node.weapon);
      }
      node.sets = node.sets.map(key => { if (!setKeys.has(key)) throw new Error(path + ' 未找到套装快照。'); return setKeys.get(key); });
      if (node.artifactMain === previous) node.artifactMain = version;
    }
    if (node.kind === 'character-actions' || node.stateMachine && Array.isArray(node.actions)) {
      for (const action of node.actions) for (const hit of action.hits) { delete hit.skillId; delete hit.outputIds; }
    }
    if (node.candidate?.actors && Array.isArray(node.timeline)) {
      node.timeline.forEach((record, i) => { if (record.damage) convertHit(record, node.candidate.actors, path + '/timeline/' + i + '/damage'); });
    }
    for (const [key, item] of Object.entries(node)) {
      if (typeof item === 'string' && /^enka\.showcase\./.test(item)) node[key] = recordedId(item);
      else visit(item, path + '/' + key);
    }
  }
  visit(value.document, '/document');
  if (Object.hasOwn(table.mainStats, previous)) { table.mainStats[version] = table.mainStats[previous]; delete table.mainStats[previous]; }
  value.schemaVersion = version;
  return { value, warnings };
}
