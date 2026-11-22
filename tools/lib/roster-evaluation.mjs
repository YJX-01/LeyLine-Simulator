import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { readContentSource } from './content-source.mjs';
import { auditSceneTrigger } from './scene-trigger-audit.mjs';

const read = path => readContentSource(new URL('../../src/game-data/data/' + path + '.json', import.meta.url));
const fact = value => ({ value, provenance: 'explicit', sourceRefs: [] });
const number = (unit, value) => fact({ kind: 'quantity', unit, value });
const bool = value => fact({ kind: 'boolean', value });
const novice = { WEAPON_SWORD_ONE_HAND: 'dullblade', WEAPON_CATALYST: 'apprenticesnotes', WEAPON_CLAYMORE: 'wastergreatsword',
  WEAPON_BOW: 'huntersbow', WEAPON_POLE: 'beginnersprotector' };
const elements = ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];
const main = read('tables/artifact-main');
const commonTemplates = new Map(read('calculation/common').formulas.map(f => [f.identity.id, f.template]));
const subject = { kind: 'actor', id: 'actor' };

/** Independent, legal level-one calculation settings, with no inventory or combat recording. */
export function auditBuild(character, weapon, sets = []) {
  return { schemaVersion: character.schemaVersion, kind: 'calculation-build', dataVersion: character.dataVersion, character, weapon, sets, artifacts: [],
    artifactMain: main, artifactMainSourceRefs: ['content.artifact-main'], sources: [{ id: 'content.artifact-main', kind: 'definition' }],
    level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
}
export function auditHit(character, talent, hit, level = 1) {
  const event = { id: 'hit', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: 1, order: 1, skillId: talent.id, hitId: hit.id,
    category: hit.category, sourceEventIds: [], facts: {} };
  const rate = Object.fromEntries((talent.inputs ?? []).map(input => [input.id, number(input.type.unit, input.min)]));
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
    setup.events.unshift({ id: slot.id, kind: 'capture', actorId: 'actor', targetIds: [], timeMs: 0, order: 0, skillId: slot.sourceSkillId, sourceEventIds: [], facts: {} });
    frame.captures[slot.id] = { eventId: slot.id, phase: slot.allowedPhases[0] };
  }
  return { setup, request: { actorId: 'actor', hit: { definition: { group: 'characters', namespace: character.namespace, id: character.id, revision: character.revision }, hitId: hit.id },
    critMode: 'noncritical', reactionMode: 'none', frame } };
}
const reactionConstants = readContentSource(new URL('../data/sources/kqm-web/2026-11-15/reaction-formulas.json', import.meta.url)).constants;
const lifecycle = readContentSource(new URL('../data/sources/catalog/combat-lifecycle.json', import.meta.url));
const attachmentRates = lifecycle.stellarConduct.coefficients;
const blessings = new Map(lifecycle.reactionBlessings.map(row => {
  const match = row.text.match(/每(\d*)点(攻击力|防御力|生命值上限|元素精通)都将提升([\d.]+)%[^。]*?至多通过这种方式提升([\d.]+)%/);
  if (!match) throw new Error(row.entity + ': 无法读取祝赐的属性、倍率或上限');
  const scope = row.text.slice(0, match.index), names = { 月感电: 'lunar-charged', 月绽放: 'lunar-bloom', 月结晶: 'lunar-crystallize', 星超导: 'stellar-conduct', 星扩散: 'stellar-swirl' };
  const families = scope.includes('月曜反应的基础伤害') ? ['lunar-charged','lunar-bloom','lunar-crystallize']
    : Object.entries(names).filter(([label]) => scope.includes(label)).map(([, family]) => family);
  const stat = { 攻击力: 'attack', 防御力: 'defense', 生命值上限: 'hp', 元素精通: 'elementalMastery' }[match[2]];
  return [row.entity, { stat, rate: Number(match[3]) / 100 / Number(match[1] || 1), cap: Number(match[4]) / 100, families }];
}));
function referenceDamage(build, talent, hit, frame, withBuffs = true) {
  const { character, weapon } = build;
  const stats = { elementalMastery: 0 };
  for (const stat of ['hp', 'attack', 'defense']) stats[stat] = character.attributes.base[stat] * character.progression.curves[stat][build.level] + character.progression.promotion[build.ascension][stat];
  stats.attack += weapon.baseAttack * weapon.attackCurve[build.weaponLevel] + weapon.promotion[build.weaponAscension];
  const specialized = character.attributes.specialized, bonus = character.progression.promotion[build.ascension].specialized;
  if (specialized === 'elementalMastery') stats.elementalMastery += bonus;
  for (const key of ['hp', 'attack', 'defense']) if (specialized === key + 'Percent') stats[key] *= 1 + bonus;
  function parameter(skillId, key) {
    const source = skillId ? character.talents.find(entry => entry.id === skillId) : talent;
    if (!source) return NaN;
    const bonus = character.id === 'tartaglia' && source.category === 'normal' ? 1 : 0;
    return source.parameters.find(p => p.id === key)?.values[build.talents[source.category] + bonus - 1] ?? NaN;
  }
  function valueOfFact(key) {
    if(talent.inputs?.some(input=>input.id===key) && Object.hasOwn(frame.facts,key)) return frame.facts[key].value?.value;
    const scope = combatFactDeclaration(character.metadata.facts, key)?.scope;
    const row = frame.factOverrides.find(r => scope === 'team' ? r.subject.kind === 'team' : scope === 'target'
      ? r.subject.kind === 'target' && r.subject.id === 'enemy' : r.subject.kind === 'actor' && r.subject.id === 'actor');
    return (scope === 'query' || !scope ? frame.facts[key] : row?.facts[key])?.value?.value;
  }
  function termValue(term) {
    if (typeof term === 'number') return term;
    if (term.stat) return stats[term.stat];
    if (term.fact) return valueOfFact(term.fact);
    if (term.parameter) return parameter(term.skill, term.parameter);
    const name = term.template ?? term.call, input = term.inputs;
    if (name === 'product.scalar') return termValue(input.basis) * termValue(input.rate);
    if (name === 'stellar.radiance-ratio') {
      const mode = termValue(input.mode);
      return termValue(input[mode === 'stellar-swirl' ? 'swirl' : mode === 'stellar-conduct' ? 'conduct' : 'ordinary']);
    }
    if (name?.startsWith('damage-sum-')) return Object.values(input).reduce((sum, item) => sum + termValue(item), 0);
    if (name?.endsWith('-damage-base')) return termValue(input.attribute) * termValue(input.ratio) * (input.count ? termValue(input.count) : 1);
    return NaN;
  }
  const base = Array.isArray(hit.base) ? hit.base.reduce((sum, term) => {
    if (term.formula && term.formula !== 'raidenshogun.resolve-damage-base') return NaN;
    return sum + stats[term.stat] * (term.ratio ?? parameter(term.skill, term.parameter)) * (term.count ? valueOfFact(term.count) : 1);
  }, 0) : termValue(hit.base);
  const family = typeof hit.family === 'object' ? hit.family.cases[valueOfFact(hit.family.by)] : hit.family ?? 'ordinary';
  if (family === 'ordinary') {
    let flat = 0, multiplier = 1;
    if (withBuffs && ['aether-hydro.skill.param1', 'lumine-hydro.skill.param1'].includes(hit.id) && valueOfFact('hpRatio') > .5) flat += stats.hp * parameter(talent.id, 'param6');
    if (withBuffs && character.id === 'yoimiya' && hit.id.endsWith('.pyro')) multiplier *= parameter('yoimiya.skill', 'param4');
    if (withBuffs && ['lohen.skill.param17', 'lohen.burst.param1'].includes(hit.id)) multiplier *= 1 + valueOfFact('lohen.will') * parameter(talent.id, talent.category === 'skill' ? 'param18' : 'param2');
    return (base * multiplier + flat) * .5 * .9 * (1 + (specialized === (hit.element ?? talent.element) + 'Bonus' ? bonus : 0));
  }
  const coefficient = family === 'stellar-conduct' ? attachmentRates[valueOfFact('stellarAttachments')]
    : reactionConstants.find(entry => entry.formula === family + '-direct' && entry.node === 'reactionCoefficient')?.value;
  const mastery = stats.elementalMastery;
  const blessing = blessings.get(character.id);
  const passive = withBuffs && blessing?.families.includes(family) ? Math.min(blessing.cap, stats[blessing.stat] * blessing.rate) : 0;
  return base * (1 + passive) * coefficient * (1 + 6 * mastery / (2000 + mastery)) * .9;
}

function parameterRefs(value, skill, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (value.parameter && (!value.skill || value.skill === skill)) out.add(value.parameter);
  for (const child of Object.values(value)) parameterRefs(child, skill, out);
  return out;
}
function talentDetailKind(label) {
  if (/治疗量|持续治疗$|^回复量$|恢复生命值|回复生命值/.test(label)) return '治疗量';
  if (/护盾.*吸收量|^吸收量$/.test(label)) return '护盾吸收量';
  if (/总伤害/.test(label)) return '子段总计';
  if (/间隔|时间|时长|时限|冷却/.test(label)) return '时间';
  if (/伤害/.test(label) && !/减免|加成|提升|提高|增加|吸收|转化/.test(label)) return '伤害';
  if (/能量|体力|消耗|获取|恢复|回复/.test(label)) return '资源';
  if (/次数|层数|数量|个数/.test(label)) return '计数';
  if (/提升|提高|加成|增加|减少|减免|转化|强化|抗性/.test(label)) return '属性或机制';
  return '其他技能说明';
}
function gateCases(character, declaration) {
  const gates = [...declaration.when ?? [], ...declaration.coordinated ? [declaration.coordinated.readyFact] : []];
  if (!gates.length) return [];
  const facts = new Set(), thresholds = new Map();
  const template = id => character.metadata.formulas?.find(f => f.id === id)?.template ?? commonTemplates.get(id);
  function collect(node) {
    if (typeof node === 'string') facts.add(node);
    else if (node.fact) facts.add(node.fact);
    else {
      const definition = template(node.call);
      if (definition?.id === 'quantity-condition') {
        const key = node.inputs?.[definition.input]?.fact;
        if (key) thresholds.set(key, definition.threshold);
      }
      Object.values(node.inputs ?? {}).forEach(collect);
    }
  }
  gates.forEach(collect);
  function test(node, values) {
    if (typeof node === 'string' || node.fact) return values[typeof node === 'string' ? node : node.fact];
    const definition = template(node.call);
    const args = Object.values(node.inputs ?? {}).map(child => test(child, values));
    if (node.teamCount) return node.teamCount.elements.includes('pyro') ? 1 : 0;
    if (definition?.id === 'quantity-condition') {
      const a = args[0], b = definition.threshold;
      return ({ gt: a > b, gte: a >= b, eq: a === b, lt: a < b, lte: a <= b })[definition.relation];
    }
    if (definition?.id === 'enum-condition') return args[0] === definition.equals;
    if (definition?.id !== 'condition-group' || args.some(arg => arg === undefined)) return undefined;
    const value = definition.operator === 'all' ? args.every(Boolean) : args.some(Boolean);
    return definition.negate ? !value : value;
  }
  let cases = [{}];
  for (const key of facts) {
    const field = combatFactDeclaration(character.metadata.facts, key);
    if (!field || field.type.kind === 'quantity' && !thresholds.has(key)) return [];
    const threshold = thresholds.get(key), step = field.type.unit === 'scalar' ? 0.01 : 1;
    const options = field.type.kind === 'quantity' ? [Math.max(0, threshold - step), threshold, threshold + step]
      : field.type.kind === 'boolean' ? [false, true] : field.type.values;
    cases = cases.flatMap(values => options.map(value => ({ ...values, [key]: value })));
  }
  return cases.map(values => ({ values, active: gates.every(gate => test(gate, values) === true) }));
}
function setGateFacts(character, frame, values) {
  for (const [key, value] of Object.entries(values)) {
    const field = combatFactDeclaration(character.metadata.facts, key);
    const input = typeof value === 'number' ? number(field.type.unit, value) : typeof value === 'boolean' ? bool(value) : fact({ kind: 'enum', value });
    if (field.scope === 'query') { frame.facts[key] = input; continue; }
    const subject = field.scope === 'team' ? { kind: 'team' } : field.scope === 'target' ? { kind: 'target', id: 'enemy' } : { kind: 'actor', id: 'actor' };
    let row = frame.factOverrides.find(row => row.subject.kind === subject.kind && row.subject.id === subject.id);
    if (!row) frame.factOverrides.push(row = { subject, facts: {} });
    row.facts[key] = input;
  }
}

function projectQuery(request, targetFacts={}) {
  const facts=request.frame.factOverrides.map(({subject,facts})=>({
    subject:subject.kind==='actor'?{kind:'actor',id:'owner'}:subject.kind==='target'?{kind:'target',id:'target'}:subject, values:structuredClone(facts),
  }));
  if (Object.keys(targetFacts).length) {
    const target=facts.find(row=>row.subject.kind==='target');
    if (target) target.values={...targetFacts,...target.values};
    else facts.push({subject:{kind:'target',id:'target'},values:structuredClone(targetFacts)});
  }
  if (Object.keys(request.frame.facts).length) facts.push({subject:{kind:'event'},values:structuredClone(request.frame.facts)});
  return {hit:request.hit,crit:request.critMode,reaction:request.reactionMode,facts};
}
export function rosterEvaluation(entities, engine, onQuery) {
  const rows = [], gaps = [], otherDetails = [], talentDetails = [];
  const pending = readContentSource(new URL('../data/sources/catalog/combat-lifecycle.json', import.meta.url)).pendingHits;
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  for (const character of entities.characters) {
    const build = auditBuild(character, weapons.get(novice[character.identity.weaponType]));
    const priority = character.talents.some(t => t.hits.some(h => h.elementBy === 'partyPriorityElement' || h.elementBy === 'strikingHand'));
    const members = [{ id: 'actor', build }, ...(priority ? [{ id: 'party-element', element: 'pyro' }] : [])];
    const prepared = engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(character.id + ': ' + JSON.stringify(prepared.diagnostics));
    for (const [i, talent] of character.talents.entries()) {
      const meta = character.metadata.talents[i], entries = authoredHitEntries(character.metadata, talent.id);
      const parameters = parameterRefs([entries.map(row => row.hit.base), ...character.metadata.talents.map(t => t.buffs), ...character.metadata.passives.map(p => p.buffs), ...character.metadata.constellations.map(c => c.buffs)], talent.id);
      for (const [j, detail] of meta.details.entries()) {
        const keys = [...detail.template.matchAll(/\{(param\d+)(?:[:}])/g)].map(match => match[1]);
        const kind = talentDetailKind(detail.label);
        const detailRow = { entity: character.id, skill: talent.id, field: '/talents/' + i + '/details/' + j,
          name: detail.label, kind, template: detail.template, parameters: [...new Set(keys)] };
        talentDetails.push(detailRow);
        if (!/伤害/.test(detail.label)) continue;
        if (/间隔|减免|伤害增加$|加成|提升|吸收|增加比例|伤害提高|转化|总伤害/.test(detail.label)) {
          otherDetails.push({ entity: character.id, field: '/talents/' + i + '/details/' + j, name: detail.label, template: detail.template,
            kind: /总伤害/.test(detail.label) ? '子段总计' : /间隔/.test(detail.label) ? '时间参数' : '属性或机制贡献',
            parameters: keys, missingContributionParameters: keys.filter(k => !parameters.has(k)) });
          continue;
        }
        if (keys.some(key => !parameters.has(key))) {
          const field = '/talents/' + i + '/details/' + j;
          const remaining = pending.find(row => row.entity === character.id && row.field === field);
          gaps.push({ entity: character.id, field, name: detail.label, parameters: keys, issue: remaining?.reason ?? '详情倍率尚需判定独立命中或机制归属',
            ...(remaining ? { classification: remaining.classification, missingFields: remaining.missingFields } : {}) });
        }
      }
      for (const [j, hit] of talent.hits.entries()) {
        const { setup, request } = auditHit(character, talent, hit);
        setup.targets[0].facts.targetHpRatio = number('scalar', 1);
        const { hit: declaration, field, unlock } = entries[j], cases = gateCases(character, declaration);
        const enabled = cases.find(test => test.active);
        if (enabled) setGateFacts(character, request.frame, enabled.values);
        const family = declaration.family;
        if (hit.elementBy === 'absorbedElement') request.frame.facts[hit.elementBy] = fact({ kind: 'enum', value: 'pyro' });
        if (hit.elementBy === 'strikingHand') request.frame.facts.strikingHand = fact({ kind: 'enum', value: 'right' });
        if (typeof family === 'object') setGateFacts(character, request.frame, { [family.by]: enabled?.values[family.by] ?? Object.keys(family.cases)[0] });
        if (family === 'stellar-conduct' || typeof family === 'object' && Object.values(family.cases).includes('stellar-conduct')) request.frame.facts.stellarAttachments = number('count', 1);
        const gateBuild = unlock?.rank ? { ...build, [unlock.state]: unlock.rank,
          ...(unlock.state === 'ascension' ? { level: [1, 20, 40, 50, 60, 70, 80][unlock.rank] } : {}) } : build;
        const activeTeam = gateBuild === build ? prepared.team : engine.prepareStructuredBuilds([{ id: 'actor', build: gateBuild }, ...members.slice(1)]).team;
        setup.targets[0].inputs.level = number('count', gateBuild.level);
        const evaluated = engine.evaluateStructuredHit(activeTeam, setup, request);
        const expected = referenceDamage(gateBuild, talent, declaration, request.frame);
        if (onQuery) {
          const anchor=setup.events.find(event=>event.kind==='capture');
          onQuery({label:character.id+'/'+hit.id,build:gateBuild,damage:projectQuery(request,setup.targets[0].facts),expected,
            ...(priority?{teammate:auditBuild(entities.characters.find(c=>c.id==='amber'),weapons.get('huntersbow'))}:{}),
            ...(anchor?{capture:{skillId:anchor.skillId,phase:request.frame.captures[anchor.id].phase}}:{})});
        }
        const applied = [...new Set(evaluated.trace.filter(node => node.kind === 'effect' && node.value?.kind === 'quantity' && node.value.value !== 0)
          .map(node => node.context?.effectInstanceId).filter(Boolean))];
        const value = evaluated.totals.all.state === 'known' ? evaluated.totals.all.value.value : null;
        const row = { entity: character.id, field, ...(unlock ? { unlock } : {}), hit: hit.id, value, status: evaluated.execution };
        if (Number.isFinite(expected) && value !== null) {
          row.expected = expected;
          if (Math.abs(expected - value) > Math.max(1e-8, Math.abs(expected) * 1e-9)) row.issue = '独立基础伤害不符';
          if (applied.length) {
            const context = engine.createStructuredCombatContext(activeTeam, setup);
            context.effectRevisions = applied.map(instanceId => ({ instanceId, disabled: true }));
            const neutral = engine.evaluateStructuredHit(activeTeam, setup, request, { context }).totals.all.value?.value ?? null;
            const expectedBase = referenceDamage(gateBuild, talent, declaration, request.frame, false);
            row.baseComparison = { excludedInstances: applied, value: neutral, expected: expectedBase };
            if (neutral === null || Math.abs(expectedBase - neutral) > Math.max(1e-8, Math.abs(expectedBase) * 1e-9)) row.issue = '独立基础伤害不符';
          }
        }
        if (unlock?.rank) {
          row.lockedValue = engine.evaluateStructuredHit(prepared.team, setup, request).totals.all.value?.value ?? null;
          if (row.lockedValue !== 0) row.issue = '未解锁命中仍有贡献或缺值';
        }
        if (enabled) row.activeFacts = enabled.values;
        if (typeof family === 'object') row.branches = Object.entries(family.cases).map(([choice, expectedFamily]) => {
          setGateFacts(character, request.frame, { [family.by]: choice });
          const result = engine.evaluateStructuredHit(activeTeam, setup, request);
          const branch = { choice, family: expectedFamily, value: result.totals.all.value?.value ?? null };
          if (branch.value === null || result.outputs.length !== 1 || result.outputs[0].family !== expectedFamily) row.issue = '条件分支缺失或重复';
          return branch;
        });
        if (hit.elementBy === 'absorbedElement') row.elementCases = ['none', 'pyro', 'hydro', 'electro', 'cryo'].map(element => {
          request.frame.facts[hit.elementBy] = fact({ kind: 'enum', value: element });
          const input = structuredClone(setup);
          if (element !== 'none') input.targets[0].inputs['resistance.' + element] = number('scalar', .3);
          const output = engine.evaluateStructuredHit(activeTeam, input, request);
          const result = output.totals.all.value?.value ?? null;
          const expected = element === 'none' ? 0 : value * .7 / .9;
          if (result === null || Math.abs(result - expected) > 1e-6 || output.outputs.length !== 1) row.issue = '元素转化分支不符';
          return { element, value: result, expected };
        });
        if (hit.elementBy === 'absorbedElement') request.frame.facts[hit.elementBy] = fact({ kind: 'enum', value: 'pyro' });
        if (hit.elementBy === 'partyPriorityElement') row.elementCases = [['anemo'], ['cryo'], ['cryo', 'electro'], ['cryo', 'hydro', 'electro'], ['hydro', 'pyro']].map(party => {
          const input = structuredClone(setup);
          const chosen = ['pyro', 'hydro', 'electro', 'cryo'].find(element => party.includes(element)) ?? 'anemo';
          input.targets[0].inputs['resistance.' + chosen] = number('scalar', .3);
          const altered = engine.prepareStructuredBuilds([{ id: 'actor', build }, ...party.map((element, i) => ({ id: 'other-' + i, element }))]);
          const output = engine.evaluateStructuredHit(altered.team, input, request);
          const result = output.totals.all.value?.value ?? null;
          const expected = chosen === 'anemo' && declaration.when?.some(gate => gate.call === 'varka.has-element') ? 0 : value * .7 / .9;
          if (result === null || Math.abs(result - expected) > 1e-6 || output.outputs.length !== 1) row.issue = '元素转化分支不符';
          return { elements: party, chosen, value: result, expected };
        });
        if (hit.elementBy === 'strikingHand') {
          row.elementCases = [];
          for (const party of [[], ['electro', 'hydro'], ['pyro', 'cryo']]) {
            const altered = engine.prepareStructuredBuilds([{ id: 'actor', build }, ...party.map((element, i) => ({ id: 'other-' + i, element }))]);
            const input = structuredClone(setup);
            input.targets[0].inputs['resistance.anemo'] = number('scalar', .4);
            for (const hand of ['left', 'right', null]) {
              const probe = structuredClone(request);
              probe.frame.facts.strikingHand = fact(hand ? { kind: 'enum', value: hand } : null);
              const output = engine.evaluateStructuredHit(altered.team, input, probe);
              const actual = output.totals.all.value?.value ?? null;
              const unknown = hand === null && party.length > 0;
              const expected = unknown ? null : hand === 'left' || !party.length ? value * .6 / .9 : value;
              const agrees = unknown ? actual === null && output.requiredInputs.some(input => input.key === 'strikingHand' && input.scope === 'query')
                : Number.isFinite(actual) && Math.abs(actual - expected) < 1e-6 && output.outputs.length === 1;
              if (!agrees) row.issue = '重击的出手侧或缺项判定不符';
              row.elementCases.push({ elements: party, hand, value: actual, expected });
            }
          }
        }
        if (Array.isArray(declaration.base)) {
          const counts = [...new Set(declaration.base.map(term => term.count).filter(Boolean))];
          const mastery = declaration.base.some(term => term.stat === 'elementalMastery');
          if (counts.length || mastery) {
            const counting = auditHit(character, talent, hit);
            if (enabled) setGateFacts(character, counting.request.frame, enabled.values);
            if (family === 'stellar-conduct') counting.request.frame.facts.stellarAttachments = number('count', 1);
            if (typeof family === 'object') setGateFacts(character, counting.request.frame, { [family.by]: enabled?.values[family.by] ?? Object.keys(family.cases)[0] });
            const gear = mastery ? entities.weapons.find(w => w.id === 'sacrificialfragments' && w.weaponType === character.identity.weaponType) : undefined;
            const countTeam = gear ? engine.prepareStructuredBuilds([{ id: 'actor', build: { ...gateBuild, weapon: gear } }]).team : activeTeam;
            row.countCases = [];
            for (const key of counts.length ? counts : [null]) {
              const input = talent.inputs?.find(i => i.id === key);
              const values = input ? [...new Set([input.min, Math.min(input.min + 1, input.max), input.max])] : [null];
              for (const count of values) {
                if (input) counting.request.frame.facts[key] = number(input.type.unit, count);
                const calc = engine.evaluateStructuredHit(countTeam, counting.setup, counting.request);
                const test = { input: key, count, ...(gear ? { weapon: gear.id } : {}), value: calc.totals.all.value?.value ?? null };
                if (test.value === null) row.issue = '合法计数或精通配装缺少数值';
                if (gear && declaration.base.every(term => term.stat === 'elementalMastery') && ['stellar-conduct','lunar-bloom'].includes(family)) {
                  const em = gear.baseStat * gear.statCurve[1];
                  const sum = declaration.base.reduce((sum, term) => sum + em * talent.parameters.find(p => p.id === term.parameter).values[0] * (term.count ? count : 1), 0);
                  const factor = family === 'stellar-conduct' ? 1.45 : 1;
                  const blessing = blessings.get(character.id);
                  const extra = blessing?.stat === 'elementalMastery' && blessing.families.includes(family) ? Math.min(blessing.cap, blessing.rate * em) : 0;
                  test.expected = sum * factor * (1 + extra) * (1 + 6 * em / (2000 + em)) * .9;
                  if (Math.abs(test.expected - test.value) > 1e-7) row.issue = '计数或精通缩放数值不符';
                }
                row.countCases.push(test);
              }
            }
          }
        }

        if (enabled) row.exclusions = cases.filter(test => !test.active).map(test => {
          setGateFacts(character, request.frame, test.values);
          const result = engine.evaluateStructuredHit(activeTeam, setup, request);
          const value = result.totals.all.value?.value ?? null;
          if (value !== 0) row.issue = '不满足单项门槛仍有贡献或缺值';
          return { facts: test.values, value };
        });
        if (evaluated.outputs.length > 1) row.issue = '同一命中重复结算';
        else if (!Object.keys(hit.damage).length) row.issue = '伤害族或求值公式未绑定';
        else if (value === null) {
          row.issue = '缺少求值输入或公式'; row.inputs = evaluated.requiredInputs.map(input => ({ key: input.key, scope: input.scope }));
          row.diagnostics = [...new Set(evaluated.diagnostics.map(d => d.message))];
        }
        const positive = row.value > 0 || [...row.branches ?? [], ...row.countCases ?? []].some(test => test.value > 0);
        if (!positive) row.issue ??= '有效设定下未得到正伤害';
        if (!Number.isFinite(expected)) row.issue ??= '缺少独立数值对照';
        rows.push(row);
        if (row.issue) gaps.push(row);
      }
    }
  }
  return { settings: '角色与对应一星武器均为一级零突破、零命、精一、天赋一级、无圣遗物。敌人一级、各抗性10%，不暴击，无反应。默认计数取技能下界。受门槛约束的段采用明确有效的条件。被动和命座命中按授予门槛装配。基础值对照若关闭增益，逐项保留关闭的实例、对照结果及独立期望。', rows, gaps, otherDetails, talentDetails,
    summary: { talents: entities.characters.reduce((count, character) => count + character.talents.length, 0), talentDetails: talentDetails.length,
      healingDetails: talentDetails.filter(row => row.kind === '治疗量').length, shieldDetails: talentDetails.filter(row => row.kind === '护盾吸收量').length,
      evaluated: rows.length, numeric: rows.filter(row => row.value !== null).length, compared: rows.filter(row => row.expected !== undefined).length, neutralComparisons: rows.filter(row => row.baseComparison).length,
      mismatches: rows.filter(row => row.issue === '独立基础伤害不符').length, duplicate: rows.filter(row => row.issue === '同一命中重复结算').length,
      missingBindings: rows.filter(row => row.issue === '伤害族或求值公式未绑定').length, missingValues: rows.filter(row => row.issue === '缺少求值输入或公式').length,
      conditionFailures: rows.filter(row => row.issue === '不满足单项门槛仍有贡献或缺值' || row.issue === '条件分支缺失或重复' || row.issue === '元素转化分支不符' || row.issue === '未解锁命中仍有贡献或缺值').length,
      elementCases: rows.reduce((sum, row) => sum + (row.elementCases?.length ?? 0), 0),
      countCases: rows.reduce((sum, row) => sum + (row.countCases?.length ?? 0), 0),
      countFailures: rows.filter(row => row.issue === '合法计数或精通配装缺少数值' || row.issue === '计数或精通缩放数值不符').length,
      positiveHits: rows.filter(row => row.value > 0 || [...row.branches ?? [], ...row.countCases ?? []].some(test => test.value > 0)).length,
      familyCases: rows.reduce((sum, row) => sum + (row.branches?.length ?? 0), 0),
      conditionExclusions: rows.reduce((sum, row) => sum + (row.exclusions?.length ?? 0), 0), detailCandidates: gaps.filter(row => !row.hit).length, contextualDetails: otherDetails.length, contextualContributionsPending: otherDetails.filter(row => row.kind === '属性或机制贡献' && row.missingContributionParameters.length).length } };
}

const equipmentChecks = readContentSource(new URL('../data/sources/catalog/equipment-modifier-checks.json', import.meta.url));
const evidence = group => readContentSource(new URL('../data/sources/catalog/genshin-db/' + group + '.json', import.meta.url));

function conditionFacts(effect, entity, frame, enabled, build, sourceEvent) {
  function apply(binding, active = enabled) {
    if (!binding) return;
    if (binding.kind === 'formula') {
      const definition = entity.calculation.bundle.formulas.find(f => f.identity.id === binding.formula.id);
      const operator = definition?.template;
      if (operator?.id === 'energy-full') {
        const burst=build.character.talents.find(t=>t.category==='burst');
        const capacity=burst.parameters.find(p=>p.id===burst.energyCapacity?.parameter)?.values[build.talents.burst-1] ?? 0;
        assign(binding.inputs.energy,number('energy',active?capacity:0));
        return;
      }
      const desired = operator?.id === 'condition-group' && operator.negate ? !active : active;
      for (const value of Object.values(binding.inputs)) {
        if (value.kind === 'fact' && value.type.kind === 'quantity' && operator && 'threshold' in operator) {
          const small = value.type.unit === 'count' ? Math.max(0, operator.threshold - 1) : operator.threshold / 2;
          const large = value.type.unit === 'count' ? operator.threshold + 1 : (operator.threshold + 1) / 2;
          assign(value, number(value.type.unit, (operator.relation === 'gt' || operator.relation === 'gte') === desired ? large : small));
        } else apply(value, desired);
      }
    } else if (binding.kind === 'fact' && binding.type.kind === 'boolean') assign(binding, bool(active));
  }
  function assign(binding, fact) {
    if (binding.scope==='source-event') { if(sourceEvent) sourceEvent.facts[binding.key]=fact; return; }
    if (binding.scope === 'query') { frame.facts[binding.key] = fact; return; }
    const subject = binding.scope === 'team' ? { kind: 'team' } : binding.scope === 'target' ? { kind: 'target', id: 'enemy' } : { kind: 'actor', id: 'actor' };
    if (binding.at==='source-event') {
      if(!sourceEvent)return;
      const subjects=sourceEvent.subjectFacts??=[];
      let row=subjects.find(r=>r.subject.kind===subject.kind && r.subject.id===subject.id);
      if(!row)subjects.push(row={subject,values:{}});
      row.values[binding.key]=fact;
      return;
    }
    let row = frame.factOverrides.find(entry => entry.subject.kind === subject.kind && entry.subject.id === subject.id);
    if (!row) frame.factOverrides.push(row = { subject, facts: {} });
    row.facts[binding.key] = fact;
  }
  apply(effect.predicate);
}
function evaluateEquipmentCase(engine, build, owner, row, expectedWhite, holderCases, observationUnits, onQuery) {
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
  if (!prepared.ok) return { ...row, issue: '配装无法装配', diagnostics: prepared.diagnostics.map(d => d.message) };
  const talent = build.character.talents[0], hit = talent.hits[0];
  const { setup, request } = auditHit(build.character, talent, hit);
  const allGrants = engine.grantedBuildEffects(build);
  for (const grant of allGrants) conditionFacts(grant.effect, grant.entity, request.frame, false, build);
  const context = engine.createStructuredCombatContext(prepared.team, setup);
  const result = engine.evaluateStructuredHit(prepared.team, setup, request, { context });
  const white = context.actors[0].inputs.whiteAttack.value?.value;
  const grants = allGrants.filter(grant => grant.entity.id === owner.id);
  if (result.totals.all.state !== 'known') row.missingHitFields = result.requiredInputs.map(input => ({ key: input.key, scope: input.scope }));
  row.whiteAttack = white;
  row.expectedWhiteAttack = expectedWhite;
  row.hit = hit.id;
  row.value = result.totals.all.state === 'known' ? result.totals.all.value.value : null;
  if (onQuery) {
    onQuery({label:[row.entity,row.refinement??row.pieces,row.count].filter(value=>value!==undefined).join('/'),
      build,damage:projectQuery(request),expected:row.value});
  }
  row.grants = grants.map(grant => grant.effect.identity.id);
  row.modifiers = [];
  if (!Number.isFinite(white) || Math.abs(expectedWhite - white) > 1e-8) row.issue = '白值与来源不符';
  for (const { effect } of grants) {
    const id = effect.identity.id;
    if (effect.target.kind !== 'attribute') { row.modifiers.push({ id, issue: '乘区端口待逐项核验' }); continue; }
    const selector = effect.appliesTo;
    const frame = { ...request.frame, ownerId: 'actor', recipientId: 'actor', contributorId: null,
      hit: { skillId: selector.skillIds?.[0] ?? talent.id, hitId: selector.hitIds?.[0] ?? hit.id, element: selector.elements?.[0] ?? hit.element,
        category: selector.categories?.[0] ?? hit.category, family: selector.families?.[0] ?? 'ordinary', origin: selector.origins?.[0] ?? 'talent', reactionId: selector.reactionIds?.[0] ?? null } };
    const target = effect.recipient.role === 'target';
    const input = { kind: target ? 'enemy' : 'attribute', key: effect.target.attribute, at: { kind: 'current', phase: 'same' }, ...(target ? {} : { actor: { role: 'owner' } }) };
    const evaluate = (world, applications, active = true) => {
      const current = { ...frame, facts: { ...frame.facts }, factOverrides: structuredClone(frame.factOverrides), applications };
      const trigger=world.events.find(event=>event.id==='trigger'),source=trigger && structuredClone(trigger);
      if(source)world={...world,events:world.events.map(event=>event===trigger?source:event)};
      conditionFacts(effect, owner, current, active, build,source);
      const sample=holderCases?.get(id)?.[active?'included':'excluded'];
      if(sample) {
        if(sample.useBurst) {
          const burst=sample.build.character.talents.find(t=>t.category==='burst'),hit=burst.hits[0];
          current.hit={...current.hit,skillId:burst.id,hitId:hit.id,element:hit.element};
        }
        const real=engine.createStructuredCombatContext(sample.team,setup);
        return engine.evaluateCombatBindings(sample.team.program,{...real,events:world.events,effectRevisions:world.effectRevisions},{value:input},current);
      }
      return engine.evaluateCombatBindings(prepared.team.program, world, { value: input }, current);
    };
    const trigger = effect.trigger.kind === 'event' ? effect.trigger.selector : undefined;
    let activeContext = context, sourceId = null;
    if (trigger) {
      const skill = build.character.talents.find(t => trigger.categories?.includes(t.category) || trigger.skillIds?.includes(t.id));
      const event = { id: 'trigger', kind: trigger.kinds[0], actorId: 'actor', targetIds: ['enemy'], timeMs: 0, order: 0,
        category: trigger.categories?.[0] ?? skill?.category, skillId: trigger.skillIds?.[0] ?? skill?.id,
        sourceEventIds: [], ...(trigger.reactionIds ? { reactionId: trigger.reactionIds[0] } : {}),
        facts: trigger.observation ? { [trigger.observation.key]: trigger.observation.test === 'true' ? bool(true) : number(observationUnits[trigger.observation.key] ?? 'scalar', trigger.observation.test === 'decrease' ? -.1 : .1) } : {} };
      activeContext = { ...context, events: [event, ...context.events] };
      sourceId = event.id;
    }
    const instanceId = engine.calculationEffectInstanceId('actor', effect.buff ?? effect.identity, sourceId);
    const on = evaluate(activeContext, effect.application === 'explicit' ? [{ instanceId, active: true }] : []);
    const off = evaluate(trigger ? context : { ...context, effectRevisions: [{ instanceId, disabled: true }] }, []);
    const contribution = on.trace.findLast(node => node.kind === 'effect' && node.nodeId === id);
    const excluded = off.outputs.value?.state === 'known' && !off.trace.some(node => node.kind === 'effect' && node.nodeId === id);
    const amount = contribution?.value?.kind === 'quantity' ? contribution.value.value : null;
    const expected = effect.value.kind === 'constant' ? effect.value.value.value
      : effect.value.kind === 'refinement-parameter' ? effect.value.values[build.refinement - 1] : undefined;
    const disabledCondition = effect.predicate ? evaluate(activeContext, [], false) : null;
    const inactive = disabledCondition ? disabledCondition.outputs.value?.state === 'known' && !disabledCondition.trace.some(node => node.kind === 'effect' && node.nodeId === id) : undefined;
    const record = { id, target: effect.target.attribute.id, amount, excluded, ...(inactive === undefined ? {} : { conditionExcluded: inactive }), ...(expected === undefined ? {} : { declaredValue: expected }) };
    const holders=holderCases?.get(id);
    if(holders) record.holders={included:holders.included.build.character.id,excluded:holders.excluded.build.character.id};
    const source = equipmentChecks[id];
    if (source && row.kind === 'weapon') {
      const matches = [...row.description.matchAll(new RegExp(source.pattern, 'g'))];
      record.sourceValue = matches.length === 1 ? (source.sign ?? 1) * Number(matches[0][1]) / source.divisor : null;
      if (source.entity !== row.entity || source.stat !== effect.target.attribute.id.slice('attribute.'.length)
        || record.sourceValue === null || amount === null || Math.abs(amount - record.sourceValue) > 1e-8) record.issue = '实际贡献与采用值不符';
    } else if (row.kind === 'weapon' && expected !== undefined) record.issue = '数值贡献缺少精炼原文的独立对照';
    if (trigger && effect.lifetime.kind === 'interval') {
      const shifted = { ...activeContext, events: activeContext.events.map(event => event.id === request.frame.eventId
        ? { ...event, timeMs: effect.lifetime.durationMs } : event) };
      const timed = evaluate(shifted, []);
      record.expired = !timed.trace.some(node => node.kind === 'effect' && node.nodeId === id);
      if (!record.expired) record.issue = '排除后仍然生效';
    }
    if (amount !== null && expected !== undefined && Math.abs(amount - expected) > 1e-9) record.issue = '实际贡献与采用值不符';
    if (off.trace.some(node => node.kind === 'effect' && node.nodeId === id)) record.issue = '排除后仍然生效';
    else if (!excluded) record.issue = '排除场景缺少其他输入';
    if (inactive === false) record.issue = '排除条件尚待核验';
    if (amount === null) record.issue = '此条件场景未观察到数值贡献';
    row.modifiers.push(record);
  }
  return row;
}

/** Every legal refinement and every set threshold is queried with the same evaluator as a project. */
export function rosterEquipmentEvaluation(entities, engine, observationUnits, onQuery) {
  const weapons = evidence('weapons'), sets = evidence('sets'), rows = [], gaps = [];
  const memberIds = { WEAPON_SWORD_ONE_HAND: 'kaeya', WEAPON_CLAYMORE: 'noelle', WEAPON_POLE: 'xiangling', WEAPON_BOW: 'amber', WEAPON_CATALYST: 'lisa' };
  const member = type => entities.characters.find(c => c.id === memberIds[type]);
  function whiteBase(c) { return c.attributes.base.attack * c.progression.curves.attack[1] + c.progression.promotion[0].attack; }
  for (const weapon of entities.weapons) {
    const c = member(weapon.weaponType), data = weapons[weapon.id];
    const refinements = Object.keys(data.metadata).filter(key => /^r[1-5]$/.test(key)).map(key => Number(key.slice(1))).sort((a, b) => a - b);
    if (!refinements.length) refinements.push(1);
    if (weapon.maxRefinement !== refinements.at(-1)) throw new Error(weapon.id + ': 正式精炼上限与本地档位不符。');
    for (const refinement of refinements) {
      const build = { ...auditBuild(c, weapon), refinement };
      const text = data.metadata['r' + refinement]?.description;
      let capacityCases;
      if(weapon.id==='moonweaversdawn') {
        const samples=['keqing','kaeya','kamisatoayaka'].map(id=>{
          const build={...auditBuild(entities.characters.find(c=>c.id===id),weapon),refinement};
          const prepared=engine.prepareStructuredBuilds([{id:'actor',build}]);
          if(!prepared.ok)throw Error(JSON.stringify(prepared.diagnostics));
          return {build,team:prepared.team,useBurst:true};
        });
        capacityCases=new Map([['moonweaversdawn.capacity',{included:samples[0],excluded:samples[2]}],['moonweaversdawn.capacity.1',{included:samples[1],excluded:samples[0]}]]);
      }
      const row = evaluateEquipmentCase(engine, build, weapon, { kind: 'weapon', entity: weapon.id, field: '/buffs', refinement, description: text ?? '' }, whiteBase(c) + data.stats.base.attack + data.stats.promotion[0].attack,capacityCases,observationUnits,onQuery);
      rows.push(row);
      if (row.issue || row.modifiers.some(m => m.issue) || weapon.metadata.support.resolution !== 'complete') gaps.push({ ...row, reason: row.issue ?? (weapon.metadata.support.resolution !== 'complete' ? weapon.metadata.support.reason : '仍有待验条件') });
    }
  }
  for (const set of entities.sets) for (const [i, piece] of set.metadata.effects.entries()) {
    const type = piece.buffs?.find(buff => buff.activation?.weaponTypes)?.activation.weaponTypes[0] ?? 'WEAPON_SWORD_ONE_HAND';
    const c = member(type), w = entities.weapons.find(weapon => weapon.id === novice[type]);
    const counts = [piece.pieces - 1, piece.pieces];
    const pair = counts.map(count => {
      const build = { ...auditBuild(c, w, [set]), theoreticalSetSlots: set.slots.slice(0, count).map(slot => ({ slot, setId: set.id })) };
      let holders;
      if(set.id==='defenderswill' && count===4) {
        const byElement = new Map(['amber','barbara','kaeya','lisa','noelle','sucrose','collei'].map(id=>{
          const character=entities.characters.find(c=>c.id===id);
          const weapon=entities.weapons.find(w=>w.id===novice[character.identity.weaponType]);
          const sample={...auditBuild(character,weapon,[set]),theoreticalSetSlots:build.theoreticalSetSlots};
          const prepared=engine.prepareStructuredBuilds([{id:'actor',build:sample}]);
          if(!prepared.ok)throw Error(JSON.stringify(prepared.diagnostics));
          return [character.identity.element,{build:sample,team:prepared.team}];
        }));
        holders=new Map([...byElement].map(([element,included])=>['defenderswill.resistance.'+element,{included,excluded:byElement.get(element==='cryo'?'hydro':'cryo')}]));
      }
      return evaluateEquipmentCase(engine, build, set, { kind: 'set', entity: set.id, pieces: piece.pieces, count, field: '/effects/' + i,
        description: sets[set.id]['effect' + piece.pieces + 'Pc'] ?? '' }, whiteBase(c) + weapons[w.id].stats.base.attack,holders,observationUnits,onQuery);
    });
    const ids = set.effects[i].ruleIds.map(ref => ref.id);
    if (ids.some(id => pair[0].grants?.includes(id) || !pair[1].grants?.includes(id))) pair[1].issue = '件数门槛的授予与排除不符';
    rows.push(...pair);
    if (pair.some(row => row.issue || row.modifiers.some(m => m.issue)) || piece.support.resolution !== 'complete') gaps.push({ ...pair[1], reason: pair[1].issue ?? piece.support.reason });
  }
  const modifiers = rows.flatMap(row => row.modifiers ?? []);
  return { rows, gaps, summary: { weaponRefinementsEvaluated: rows.filter(r => r.kind === 'weapon').length,
    weaponClausesPending: new Set(gaps.filter(row => row.kind === 'weapon').map(row => row.entity)).size,
    setClausesPending: gaps.filter(row => row.kind === 'set').length,
    setThresholdsEvaluated: rows.filter(r => r.kind === 'set').length / 2, equipmentScenarios: rows.length,
    weaponTextComparisons: modifiers.filter(m => Number.isFinite(m.sourceValue) && !m.issue).length,
    equipmentNumericHits: rows.filter(row => Number.isFinite(row.value)).length, equipmentMissingValues: rows.filter(row => !Number.isFinite(row.value)).length, equipmentMismatches: rows.filter(row => row.issue).length,
    modifierScenarios: modifiers.length, numericModifierContributions: modifiers.filter(m => m.amount !== null && !m.issue).length,
    modifierMismatches: modifiers.filter(m => m.issue === '实际贡献与采用值不符' || m.issue === '排除后仍然生效').length } };
}

export function auditReactionBlessings(entities, engine) {
  const rows = [], caps = [];
  const receiving = entities.characters.find(c => c.id === 'kaeya'), sword = entities.weapons.find(w => w.id === 'dullblade');
  const recipient = auditBuild(receiving, sword);
  for (const [id, source] of blessings) {
    const c = entities.characters.find(entry => entry.id === id);
    const weaponId = source.stat === 'elementalMastery' ? 'sacrificialfragments' : novice[c.identity.weaponType];
    const weapon = entities.weapons.find(entry => entry.id === weaponId), owner = auditBuild(c, weapon);
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build: recipient }, { id: 'source', build: owner }]);
    if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
    const t = receiving.talents[0], h = t.hits[0], { setup, request } = auditHit(receiving, t, h);
    const context = engine.createStructuredCombatContext(prepared.team, setup);
    const basis = source.stat === 'attack' ? c.attributes.base.attack + weapon.baseAttack
      : source.stat === 'elementalMastery' ? weapon.baseStat * weapon.statCurve[1] : c.attributes.base[source.stat];
    const authored = c.metadata.passives.find(p => p.id === id + '.passive3')?.buffs?.[0];
    for (const family of ['ordinary','lunar-charged','lunar-bloom','lunar-crystallize','stellar-conduct','stellar-swirl']) {
      const channel = 'attribute.reaction.' + (family.startsWith('stellar-') ? family : 'lunar') + '.baseBonus';
      const key = authored?.modifiers.find(modifier => modifier.target === channel)?.target ?? authored?.modifiers[0]?.target ?? channel;
      const result = engine.evaluateCombatBindings(prepared.team.program, context, {
        amount: { kind: 'attribute', key: { namespace: 'builtin', id: key, revision: '1' }, actor: { role: 'owner' }, at: { kind: 'current', phase: 'same' } }
      }, { ...request.frame, ownerId: 'actor', recipientId: 'actor', contributorId: null,
        hit: { skillId: t.id, hitId: h.id, category: h.category, element: h.element, family, reactionId: null, origin: 'talent' } });
      const value = result.outputs.amount?.value?.value ?? null;
      const expected = source.families.includes(family) ? Math.min(source.cap, basis * source.rate) : 0;
      rows.push({ entity: id, field: '/passives/' + c.metadata.passives.findIndex(p => p.id === id + '.passive3') + '/buffs',
        recipient: 'kaeya', weapon: weaponId, family, target: key, stat: source.stat, basis, expected, value,
        ...(value === null || Math.abs(value - expected) > 1e-9 ? { issue: '祝赐的反应族、属性归属或倍率不符' } : {}) });
    }
    const expression = authored?.modifiers[0]?.value;
    const maximumBasis = source.cap / source.rate;
    for (const magnitude of [maximumBasis / 2, maximumBasis, maximumBasis * 1.5]) {
      const expected = Math.min(source.cap, magnitude * source.rate);
      const result = expression && engine.evaluateFormula(prepared.team.program, { namespace: 'builtin', id: expression.call, revision: '1' },
        { basis: { kind: 'quantity', unit: source.stat, value: magnitude } }, { outputs: ['value'] });
      const value = result?.outputs.value?.value?.value ?? null;
      caps.push({ entity: id, stat: source.stat, basis: magnitude, expected, value,
        ...(value === null || Math.abs(value - expected) > 1e-9 ? { issue: '祝赐属性换算或封顶不符' } : {}) });
    }
  }
  return { rows, caps, summary: { blessingScenarios: rows.length, blessingCapScenarios: caps.length,
    blessingMismatches: [...rows, ...caps].filter(row => row.issue).length } };
}

export function auditResonances(entities, engine) {
  const rows = [];
  const roles = { pyro: 'amber', hydro: 'barbara', cryo: 'kaeya', geo: 'ningguang', dendro: 'collei', anemo: 'sucrose' };
  for (const [element, id] of Object.entries(roles)) {
    const c = entities.characters.find(entry => entry.id === id);
    const w = entities.weapons.find(entry => entry.id === novice[c.identity.weaponType]);
    const build = auditBuild(c, w), talent = c.talents[0], hit = talent.hits[0];
    const other = elements.filter(type => type !== 'physical' && type !== element);
    for (const [pair, size] of [[true, 4], [false, 4], [true, 3]]) {
      const members = [{ id: 'actor', build }, { id: 'partner', element: pair ? element : other[2] },
        { id: 'third', element: other[0] }, { id: 'fourth', element: other[1] }].slice(0, size);
      const prepared = engine.prepareStructuredBuilds(members);
      if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
      const active = pair && size === 4;
      function check(key, baseline, delta, options = {}, qualifies = active, entity = 'resonance.' + element) {
        const { setup, request } = auditHit(c, talent, hit);
        const { events = [], shielded = false, aura = false, frozen = false, time = 1 } = options;
        setup.events[0].timeMs = time;
        setup.events.unshift(...events);
        request.frame.factOverrides[0].facts.shielded = bool(shielded);
        request.frame.factOverrides.push({ subject: { kind: 'target', id: 'enemy' }, facts: { 'aura.cryo': bool(aura), 'aura.frozen': bool(frozen) } });
        const target = key.startsWith('target.');
        const reference = { namespace: 'builtin', id: target ? key : 'attribute.' + key, revision: '1' };
        const binding = { kind: target ? 'enemy' : 'attribute', key: reference, at: { kind: 'current', phase: 'same' } };
        if (!target) binding.actor = { role: 'owner' };
        const result = engine.evaluateCombatBindings(prepared.team.program, engine.createStructuredCombatContext(prepared.team, setup), { amount: binding },
          { ...request.frame, ownerId: 'actor', recipientId: 'actor', contributorId: null, hit: null });
        const value = result.outputs.amount?.value?.value ?? null, expected = baseline + (qualifies ? delta : 0);
        rows.push({ entity, attribute: key, members: members.map(actor => actor.build?.character.identity.element ?? actor.element),
          ...options, expected, value, ...(value === null || Math.abs(expected - value) > 1e-8 ? { issue: '共鸣数值或生效条件不符' } : {}) });
      }
      if (element === 'pyro') check('attackPercent', 0, .25);
      if (element === 'hydro') check('hpPercent', 0, .25);
      if (element === 'anemo') {
        check('movementSpeed',0,.1);
        check('staminaCostReduction',0,.15);
        check('skillCooldownReduction',0,.05);
        for (const type of elements) check('resistance.' + type,0,.15,{},!pair && size === 4,'resonance.protectiveCanopy');
      }
      if (element === 'cryo') for (const [aura, frozen] of [[false, false], [true, false], [false, true], [true, true]]) check('critRate', .05, aura || frozen ? .15 : 0, { aura, frozen });
      if (element === 'dendro') {
        const reaction = (reactionId, timeMs) => ({ id: reactionId, kind: 'reaction', actorId: 'partner', targetIds: ['enemy'], timeMs, order: 0, sourceEventIds: [], facts: {}, reactionId });
        check('elementalMastery', 0, 50);
        for (const [reactionId, bonus] of [['burning',30],['quicken',30],['bloom',30],['lunar-bloom',30],['aggravate',20],['spread',20],['hyperbloom',20],['burgeon',20],['vaporize',0]]) {
          const events = [reaction(reactionId, 0)];
          for (const time of [1, 6000]) check('elementalMastery', 0, 50 + (time < 6000 ? bonus : 0), { events, time });
        }
        check('elementalMastery', 0, 100, { events: [reaction('bloom', 0), reaction('spread', 1)], time: 2 });
      }
      if (element === 'geo') {
        check('shieldStrength', 0, .15);
        for (const shielded of [false, true]) check('damageBonus', 0, shielded ? .15 : 0, { shielded });
        for (const field of [false, true]) for (const shielded of [false, true]) {
          const events = [{ id: 'shield-hit', kind: 'hit', actorId: 'partner', targetIds: ['enemy'], timeMs: 0, order: 0, sourceEventIds: [], facts: {},
            subjectFacts: [{ subject: { kind: 'actor', id: 'partner' }, values: { onField: bool(field), shielded: bool(shielded) } }] }];
          for (const time of [1, 15000]) check('target.resistance.geo', .1, field && shielded && time < 15000 ? -.2 : 0, { events, time });
        }
      }
    }
  }
  return { rows, summary: { publicResonanceScenarios: rows.length, publicResonanceMismatches: rows.filter(row => row.issue).length } };
}

export function auditPublicScenes(entities, engine) {
  const c = entities.characters.find(c => c.id === 'kaeya'), w = entities.weapons.find(w => w.id === 'dullblade'), build = auditBuild(c, w);
  const definitions = read('calculation/battle-scenes'), sources = readContentSource(new URL('../data/sources/catalog/battle-scenes.json', import.meta.url));
  const rows = [], gaps = [], branches = [], triggers = [];
  const sourceById = new Map(sources.map(row => [row.entity, row]));
  const labels = { flatAttack:'攻击力',flatDefense:'防御力',critRate:'暴击率',critDamage:'暴击伤害',hpPercent:'生命值上限',energyRecharge:'元素充能效率',
    elementalMastery:'元素精通',healingBonus:'治疗(?:加成|效果)',shieldStrength:'护盾强效',physicalBonus:'物理伤害',pyroBonus:'火元素伤害',cryoBonus:'冰元素伤害',geoBonus:'岩元素伤害',
    hydroBonus:'水元素伤害',anemoBonus:'风元素伤害',electroBonus:'雷元素伤害',dendroBonus:'草元素伤害' };
  function sourceAmount(text, target) {
    if (text.includes(' Bonus ')) return Number(text.split(' Bonus ')[1]);
    if (target.startsWith('attribute.reaction.')) return Number([...text.matchAll(/([\d.]+)%/g)][target.includes('.transformative.') ? 0 : 1]?.[1]) / 100;
    const key = target.slice(10), name = labels[key];
    const match = text.match(new RegExp(name + '(?:提高|提升)([\\d.]+)(点|%)')) ?? text.match(new RegExp('获得([\\d.]+)(%)' + name));
    return match ? Number(match[1]) / (match[2] === '%' ? 100 : 1) : NaN;
  }
  const ids = new Set(definitions.map(d => d.id));
  for (const definition of definitions) {
    const localText = sourceById.get(definition.id)?.text ?? '';
    if (/^「(?:炎祝|霜祝)」/.test(localText)) {
      const expectedElement = localText.includes('火元素') ? 'pyro' : 'cryo';
      const rate = Number(localText.match(/获得([\d.]+)%/)[1]) / 100;
      const peer = auditBuild(entities.characters.find(c=>c.id==='lisa'),entities.weapons.find(w=>w.id==='apprenticesnotes'));
      const team = engine.prepareStructuredBuilds([{id:'actor',build},{id:'peer',build:peer}],[],[{definition,startMs:100,endMs:300}]);
      if (!team.ok) { gaps.push({entity:definition.id,field:'/buffs',diagnostics:team.diagnostics}); continue; }
      const {setup,request} = auditHit(c,c.talents[0],c.talents[0].hits[0]);
      for (const timeMs of [99,100,299,300]) for (const platform of ['none','pyro','cryo',null]) for (const onField of [false,true]) {
        setup.events[0].timeMs = timeMs;
        const context = engine.createStructuredCombatContext(team.team,setup);
        const factOverrides = [
          {subject:{kind:'actor',id:'actor'},facts:{onField:bool(onField),autumnPlatform:fact(platform===null?null:{kind:'enum',value:platform})}},
          {subject:{kind:'actor',id:'peer'},facts:{onField:bool(!onField),autumnPlatform:fact({kind:'enum',value:expectedElement})}},
        ];
        for (const recipient of ['actor','peer']) for (const element of ['pyro','cryo']) {
          const target = 'attribute.'+element+'Bonus';
          const binding = {kind:'attribute',key:{namespace:'builtin',id:target,revision:'1'},actor:{role:'recipient'},at:{kind:'current',phase:'same'}};
          const output = engine.evaluateCombatBindings(team.team.program,context,{value:binding},{...request.frame,ownerId:recipient,recipientId:recipient,contributorId:null,factOverrides,hit:null}).outputs.value;
          const eligible = timeMs>=100 && timeMs<300 && element===expectedElement && (recipient==='actor'?onField:!onField);
          const expected = !eligible?0:recipient==='peer'?rate:platform===null?null:platform===expectedElement?rate:0;
          const value = output.state==='known'?output.value.value:null;
          const row = {entity:definition.id,field:'/buffs/0',probe:'所处平台',timeMs,platform,onField,recipient,target,value,expected};
          if (value!==expected) { row.issue='场景贡献或到期不符'; gaps.push(row); }
          triggers.push(row);
          if (timeMs===100 && platform===expectedElement && onField && recipient==='actor' && element===expectedElement) rows.push(row);
        }
      }
      continue;
    }
    if (definition.buffs.some(buff=>buff.trigger)) {
      const peer = auditBuild(entities.characters.find(c=>c.id==='lisa'),entities.weapons.find(w=>w.id==='apprenticesnotes'));
      const cases = auditSceneTrigger(definition,sourceById.get(definition.id)?.text ?? '',build,peer,engine,auditHit);
      triggers.push(...cases);
      rows.push(...cases.filter(row=>row.probe==='同刻触发后'));
      gaps.push(...cases.filter(row=>row.issue));
      continue;
    }
    const endMs = definition.durationMs ?? 1000;
    const sceneText = sourceById.get(definition.id)?.text ?? '';
    const moonField = sceneText.includes('月兆等级至少为初辉');
    const moon = entities.characters.find(c=>c.id==='aino');
    const members = [{id:'actor',build}];
    if (moonField) members.push({id:'moon',build:auditBuild(moon,entities.weapons.find(w=>w.id==='wastergreatsword'))});
    const selection = [{definition,startMs:0,endMs}];
    const prepared = engine.prepareStructuredBuilds(members, [], selection);
    if (!prepared.ok) { gaps.push({ entity: definition.id, field: '/buffs', diagnostics: prepared.diagnostics }); continue; }
    const t = c.talents[0], h = t.hits[0], { setup, request } = auditHit(c, t, h);
    const text = sourceById.get(definition.id)?.text ?? '';
    const times = [endMs - 1, endMs].map(time => { setup.events[0].timeMs = time; return engine.createStructuredCombatContext(prepared.team, setup); });
    for (const [b,buff] of definition.buffs.entries()) for (const [i,mod] of buff.modifiers.entries()) {
      const target = mod.target, expected = sourceAmount(text,target), field = '/buffs/' + b + '/modifiers/' + i;
      const binding = { kind:'attribute',key:{namespace:'builtin',id:target,revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'} };
      const reaction = target.startsWith('attribute.reaction.');
      const probes = reaction ? ['swirl','bloom','burgeon','hyperbloom','overloaded','electro-charged','stellar-swirl','lunar-bloom','lunar-charged','ordinary'] : ['ordinary'];
      let counted = false;
      for (const probe of probes) {
        const family = ['swirl','bloom','burgeon','hyperbloom','overloaded','electro-charged'].includes(probe) ? 'transformative' : probe;
        const matches = !reaction || (target.includes('.transformative.') ? (text.includes('感电反应') ? probe === 'electro-charged' : text.includes('星扩散') ? probe === 'swirl' : ['bloom','burgeon','hyperbloom'].includes(probe))
          : target.includes('.stellar-swirl.') ? probe === 'stellar-swirl' : probe === 'lunar-bloom');
        const hit = reaction ? { skillId:null,hitId:null,category:null,element:probe==='swirl'?'hydro':probe==='electro-charged'?'electro':'dendro',family,origin:'reaction',reactionId:probe } : null;
        const [active,expired] = times.map(context => engine.evaluateCombatBindings(prepared.team.program,context,{value:binding},
          { ...request.frame,ownerId:'actor',recipientId:'actor',contributorId:null,hit }).outputs.value?.value?.value ?? null);
        const row = {entity:definition.id,field,target,probe,active,expired,expectedDelta:matches ? expected : 0};
        if (moonField) {
          const alone = engine.prepareStructuredBuilds(members.slice(0,1), [], selection).team;
          setup.events[0].timeMs = 1;
          const context = engine.createStructuredCombatContext(alone,setup);
          row.withoutMoonsign = engine.evaluateCombatBindings(alone.program,context,{value:binding},{...request.frame,ownerId:'actor',recipientId:'actor',contributorId:null,hit}).outputs.value?.value?.value;
          if (row.withoutMoonsign !== expired) row.issue='场景贡献或到期不符';
        }
        const duration = text.match(/持续([\d.]+)秒/);
        if (!Number.isFinite(expected) || active === null || expired === null || Math.abs(active-expired-row.expectedDelta)>1e-8
          || duration && Number(duration[1])*1000 !== definition.durationMs) row.issue = '场景贡献或到期不符';
        if (reaction) branches.push(row);
        if (matches && !counted) { rows.push(row); counted = true; }
        if (row.issue) gaps.push(row);
      }
    }
  }
  const observed=new Set(rows.map(row=>row.entity));
  const failedCases=gaps.length;
  for (const source of sources) {
    if (ids.has(source.entity) && observed.has(source.entity) && !source.issue) continue;
    gaps.push({entity:source.entity,field:source.field,text:source.text,
      ...(source.missingFields ? {missingFields:source.missingFields} : {}),
      issue:source.issue ?? (ids.has(source.entity)?'已登记，尚无实际贡献用例':'尚未采用此条款')});
  }
  const incomplete=new Set(gaps.map(row=>row.entity));
  return { rows, gaps, branches, triggers, summary: { publicSceneSourceClauses:sourceById.size,
    completePublicSceneClauses:[...sourceById.keys()].filter(id=>observed.has(id)&&!incomplete.has(id)).length,
    publicSceneDefinitions: definitions.length, publicSceneContributions: rows.length, publicSceneReactionCases: branches.length, publicSceneTriggerCases:triggers.length,
    publicSceneChecksFailed:failedCases, publicSceneSourceGaps:gaps.filter(row=>row.text).length } };
}

// Each sentence must describe a noncombat outcome. A map marker can share a talent with healing or resource gain.
const noncombatPassiveSentences = [
  /^在小地图上显示周围(?:的[^，。]+区域特产的位置|能产出锻造用矿石的矿脉位置)(?:，在影域中亦能提供相同的佑助)?$/,
  /^在[^，。]+执行(?:时长为\d+小时的)?探索派遣任务时，(?:获得的奖励增加|消耗的时间缩短)\d+%$/,
  /^完美烹饪[^，。]*食物时，有\d+%概率(?:获得\d+倍产出|额外获得一个「奇怪的」品质的同种料理)$/,
  /^合成[^，。]+时，有\d+%的?概率(?:获得\d+倍产出|返还部分合成材料|额外产生一份地区相同的其他随机天赋素材，等阶与合成(?:后获得|所消耗)的素材相同)$/,
  /^锻造[^，。]+时，返还\d+%消耗的矿石$/,
  /^制作[^，。]+类摆设时，有\d+%概率返还部分材料$/,
  /^突破[^，。]+时，消耗的摩拉数量减少\d+%$/,
  /^[^，。]+在队伍中时，队伍中自己的角色接近(?:产出禽肉、兽肉与冷鲜肉的小动物|晶蝶等部分生物)时，不会(?:轻易)?惊动它们$/,
  /^有效对象可参考图鉴中「生物志 \/ 野生动物」的「其他」分类$/,
  /^队伍中自己的角色通过攻击树木获取木材时，有\d+%的几率获得额外的木材$/,
  /^旅行者在稻妻成功钓鱼时，因为托马的帮助，有\d+%概率获得\d+倍产出$/,
  /^[^，。]+使用食物时，有\d+%概率获得一个调味剂食材$/,
  /^(?:此外，)?(?:在挪德卡莱，)?[^，。]*通过某种途径来改变[^，。]+的外观…$/,
  /^此外，菲林斯似乎能听懂狂猎的低语…$/,
  /^此外，对受到月矩力影响的部分小动物，菈乌玛似乎有着特殊的亲和力…$/,
];

function hasOnlyNoncombatEffects(text) {
  const sentences = text.split(/[。！\n]+/).map(sentence => sentence.trim()).filter(Boolean);
  return sentences.length > 0 && sentences.every(sentence => noncombatPassiveSentences.some(pattern => pattern.test(sentence)));
}

/** Compare each granted talent-level change with the talent named by its local source clause. */
export function auditCharacterClauses(entities, engine, verifiedForms = new Set(), verifiedBuffs = new Set()) {
  const rows = [], weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  for (const character of entities.characters) {
    const base = { ...auditBuild(character, weapons.get(novice[character.identity.weaponType])), level: 90, ascension: 6 };
    const grants = build => new Set(engine.grantedBuildEffects(build).map(grant => grant.effect.identity.id));
    const cache = new Map();
    function levels(rank) {
      if (!cache.has(rank)) {
        const team = engine.prepareStructuredBuilds([{ id: 'actor', build: { ...base, constellation: rank } }]);
        if (!team.ok) throw new Error(character.id + ': invalid constellation build');
        const setup = { targets: [], team: { inputs: {}, facts: {}, actorFacts: {} }, events: [], factIntervals: [], sources: [] };
        const actor = engine.createStructuredCombatContext(team.team, setup).actors[0];
        cache.set(rank, new Map(actor.talents.map(t => [t.id, t.level])));
      }
      return cache.get(rank);
    }
    for (const group of ['passives', 'constellations']) for (const [i, branch] of character[group].entries()) {
      const row = { entity: character.id, field: '/' + group + '/' + i, name: branch.name, text: branch.description, grantIds: branch.ruleIds.map(r => r.id) };
      if (group === 'constellations' && branch.talentBonuses.length) {
        const text = branch.description.replaceAll('*', '');
        const named = character.talents.filter(t => text.includes(t.name) || t.category === 'normal' && text.includes('普通攻击'));
        const prior = levels(branch.rank - 1), current = levels(branch.rank);
        row.levelChanges = character.talents.map(t => ({ id: t.id, value: current.get(t.id) - prior.get(t.id), expected: named.includes(t) ? 3 : 0 }));
        row.verifiedLevels = named.length > 0 && row.levelChanges.every(change => change.value === change.expected) && /3级/.test(text);
        const clauses = named.reduce((line,talent) => line.replaceAll(talent.name,'天赋'),text);
        const bonusOnly = clauses.split(/[。！\n]+/).map(part => part.trim()).filter(Boolean).every(part => /技能等级提[高升]3级|至多提升至15级/.test(part));
        if (row.verifiedLevels && bonusOnly) row.status = '技能加级全条核对';
      }
      if (row.grantIds.length) {
        const gate = group === 'passives' ? branch.unlockAscension ?? 0 : branch.rank;
        const active = group === 'passives' ? { ...base, ascension: gate } : { ...base, constellation: gate };
        const before = group === 'passives' ? { ...base, ascension: gate - 1 } : { ...base, constellation: gate - 1 };
        const on = grants(active), off = gate > 0 ? grants(before) : null;
        row.grantGate = row.grantIds.every(id => on.has(id) && (!off || !off.has(id)));
      }
      if (group === 'passives' && !row.status && !row.grantIds.length && hasOnlyNoncombatEffects(row.text)) row.status = '生活用途';
      if (verifiedForms.has(character.id) && group === 'passives') row.status = i === 2 ? '生活用途' : '战斗贡献已按形态核对';
      if (verifiedBuffs.has(character.id+row.field)) row.status = '战斗贡献已逐条件核对';
      if (character.id==='aloy' && group==='constellations' && row.text==='点亮此人一方星空之刻尚未到来。' && !row.grantIds.length && !branch.talentBonuses?.length) row.status='未开放的命座';
      row.status ??= '战斗贡献待逐条件验收';
      rows.push(row);
    }
  }
  return { rows, summary: { passiveClauses: rows.filter(r => r.field.startsWith('/passives')).length,
    constellationClauses: rows.filter(r => r.field.startsWith('/constellations')).length, pureTalentLevelClauses: rows.filter(r => r.status === '技能加级全条核对').length,
    noncombatClauses: rows.filter(r => r.status === '生活用途').length, inactiveConstellations:rows.filter(r=>r.status==='未开放的命座').length, clauseGrantChecks: rows.filter(r => r.grantGate !== undefined).length,
    clauseGateFailures: rows.filter(r => r.grantGate === false).length, characterCombatClausesPending: rows.filter(r => r.status === '战斗贡献待逐条件验收').length } };
}
