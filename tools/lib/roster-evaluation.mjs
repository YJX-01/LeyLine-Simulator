import { auditBuild, auditHit, bool, elements, fact, number, subject, novice, setGateFacts, setAuditDefaults, projectQuery, projectFacts } from './roster-audit-settings.mjs';
export { rosterEquipmentEvaluation } from './roster-equipment-evaluation.mjs';
export { auditBuild, auditHit } from './roster-audit-settings.mjs';
import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { readContentSource } from './content-source.mjs';
import { auditSceneTrigger } from './scene-trigger-audit.mjs';
import { auditCurrentScene } from './scene-current-facts-audit.mjs';

const read = path => readContentSource(new URL('../../src/game-data/data/' + path + '.json', import.meta.url));
const commonTemplates = new Map(read('calculation/common').formulas.map(f => [f.identity.id, f.template]));

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
function referenceDamage(build, talent, hit, setup, request, party, withBuffs = true) {
  const { character, weapon } = build;
  const { frame } = request;
  const stats = { elementalMastery: weapon.stat === 'elementalMastery' ? weapon.baseStat * weapon.statCurve[build.weaponLevel] : 0 };
  for (const stat of ['hp', 'attack', 'defense']) stats[stat] = character.attributes.base[stat] * character.progression.curves[stat][build.level] + character.progression.promotion[build.ascension][stat];
  stats.attack += weapon.baseAttack * weapon.attackCurve[build.weaponLevel] + weapon.promotion[build.weaponAscension];
  const specialized = character.attributes.specialized, bonus = character.progression.promotion[build.ascension].specialized;
  if (specialized === 'elementalMastery') stats.elementalMastery += bonus;
  if (withBuffs && character.id === 'citlali' && build.constellation >= 2) stats.elementalMastery += 125;
  for (const key of ['hp', 'attack', 'defense']) if (specialized === key + 'Percent') stats[key] *= 1 + bonus;
  function parameter(skillId, key) {
    const source = skillId ? character.talents.find(entry => entry.id === skillId) : talent;
    if (!source) return NaN;
    const constellation = character.constellations.filter(c => c.rank <= build.constellation)
      .flatMap(c => c.talentBonuses ?? []).filter(b => b.category === source.category).reduce((sum, b) => sum + b.levels, 0);
    const bonus = constellation + (character.id === 'tartaglia' && source.category === 'normal' ? 1 : 0);
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
    if (term.amount !== undefined) return term.amount;
    if (term.stat) return stats[term.stat];
    if (term.fact) return valueOfFact(term.fact);
    if (term.parameter) return parameter(term.skill, term.parameter);
    const name = term.template ?? term.call, input = term.inputs;
    if (name === 'product.scalar' || name === 'product.damage') return termValue(input.basis) * termValue(input.rate);
    // Nefer, talent and C1: each Veil stack increases the Phantasm terms by 8%.
    if (name === 'nefer.phantasm-veil-multiplier') return 1 + .08 * termValue(input.basis);
    if (name === 'stellar.radiance-ratio') {
      const mode = termValue(input.mode);
      return termValue(input[mode === 'stellar-swirl' ? 'swirl' : mode === 'stellar-conduct' ? 'conduct' : 'ordinary']);
    }
    if (name?.startsWith('damage-sum-')) return Object.values(input).reduce((sum, item) => sum + termValue(item), 0);
    // Zibai C4 scales the skill's fourth-hit DEF ratio by the declared 250%.
    if (name?.endsWith('-damage-base') || name === 'zibai.lunar-flourish-base') {
      return termValue(input.attribute) * termValue(input.ratio) * (input.count ? termValue(input.count) : 1);
    }
    return NaN;
  }
  // Wanderer A1 reads ATK from the source E hit with the declared snapshot phase.
  const capture = hit.snapshot && setup.events.find(event => event.id === Object.values(frame.captures)[0]?.eventId);
  if (withBuffs && hit.id === 'wanderer.a1.descent-arrow') {
    const owner = capture?.subjectFacts?.find(row => row.subject.kind === 'actor' && row.subject.id === 'actor')?.values;
    if (owner?.['wanderer.windfavored']?.value?.value && owner?.['wanderer.jadeClaimed-pyro']?.value?.value) stats.attack *= 1.3;
  }
  // Mavuika C2 gains 200 base ATK in Nightsoul. Her C6 motorcycle also carries the ring's DEF reduction.
  const ring = character.id === 'mavuika' && valueOfFact('mavuika.ringActive');
  const riding = character.id === 'mavuika' && valueOfFact('mavuika.flamestrider');
  if (withBuffs && build.constellation >= 2 && (ring || riding || character.id === 'mavuika' && valueOfFact('mavuika.nightsoulActive'))) {
    stats.attack += 200 * (specialized === 'attackPercent' ? 1 + bonus : 1);
  }
  const base = Array.isArray(hit.base) ? hit.base.reduce((sum, term) => {
    if (term.formula && term.formula !== 'raidenshogun.resolve-damage-base') return NaN;
    return sum + stats[term.stat] * (term.ratio ?? parameter(term.skill, term.parameter)) * (term.count ? valueOfFact(term.count) : 1);
  }, 0) : termValue(hit.base);
  const family = typeof hit.family === 'object' ? hit.family.cases[valueOfFact(hit.family.by)] : hit.family ?? 'ordinary';
  const id = hit.id;
  const steadyCore = withBuffs && build.constellation >= 6 && valueOfFact('mitya.stable') === true
    && ['mitya.skill.param3', 'mitya.skill.param4', 'mitya.skill.param5', 'mitya.c4.beacon-consumption'].includes(id) ? 1.15 : 1;
  const absorbed = hit.elementBy === 'absorbedElement' ? valueOfFact('absorbedElement') : undefined;
  if (absorbed === 'none') return 0;
  const priority = (hit.elementBy === 'partyPriorityElement' || hit.elementBy === 'strikingHand' && valueOfFact('strikingHand') === 'right')
    ? ['pyro', 'hydro', 'electro', 'cryo'].find(element => party.includes(element)) : undefined;
  const element = absorbed ?? priority ?? hit.element ?? talent.element;
  const target = setup.targets[0].inputs;
  const resistance = target['resistance.' + element]?.value?.value;
  const resistanceFactor = resistance < 0 ? 1 - resistance / 2 : resistance >= .75 ? 1 / (1 + 4 * resistance) : 1 - resistance;
  const c6 = withBuffs && build.constellation >= 6;
  const stride = id === 'zibai.skill.param1' || id === 'zibai.skill.param2';
  const strideWindow = family === 'lunar-crystallize' && valueOfFact('zibai.strideElevationWindow');
  const strideFactor = c6 && character.id === 'zibai' && (stride || strideWindow)
    ? 1 + .016 * Math.max(0, valueOfFact('zibai.strideRadianceConsumed') - 70) : 1;
  if (family === 'ordinary') {
    let flat = 0, multiplier = 1, damageBonus = specialized === element + 'Bonus' ? bonus : 0;
    // Clause ratios come from the captured talent and constellation text, with the supporting cases
    // in character-clause-grants-audit and talent-condition-grants-audit. Resolve talent curves at this build's rank.
    if (withBuffs) {
      if (['aether-hydro.skill.param1', 'lumine-hydro.skill.param1'].includes(id) && valueOfFact('hpRatio') > .5) flat += stats.hp * parameter(talent.id, 'param6');
      if (id.startsWith('aloy.normal.ice-')) damageBonus += parameter('aloy.skill', 'param8');
      if (id.startsWith('amber.normal.c1-')) multiplier *= .2;
      if (id.startsWith('chasca.a1.covering-fire')) multiplier *= 1.5;
      if (id === 'chiori.c2.kinu') multiplier *= 1.7;
      if (id.startsWith('emilie.normal.c6-fragrance-')) flat += 3 * stats.attack;
      if (id === 'eula.a0.shattered-lightfall') multiplier *= .5;
      if (id === 'fischl.a0.stellar-predator') multiplier *= 1.527;
      if (id.startsWith('furina.normal.c6-param')) flat += .18 * stats.hp;
      if (id.startsWith('kamisatoayaka.c2.smaller-frostflake-')) multiplier *= .2;
      if (id === 'klee.c1.chained-reactions') multiplier *= 1.2;
      if (id === 'lanyan.a0.absorbed-ring') multiplier *= .5;
      if (id === 'linnea.normal.ultra-convenient-quick-arrow') multiplier *= .2;
      if (['lohen.skill.param17', 'lohen.burst.param1'].includes(id)) multiplier *= 1 + valueOfFact('lohen.will') * parameter(talent.id, talent.category === 'skill' ? 'param18' : 'param2');
      if (id === 'lyney.c6.reprised-strike') multiplier *= .8;
      if (id === 'mavuika.burst.param1') flat += stats.attack * valueOfFact('mavuika.fightingSpirit') * parameter(talent.id, 'param3');
      if (id === 'mona.skill.illusory-torrent') multiplier *= .5;
      if (['mualani.skill.param1', 'mualani.skill.shark-missile'].includes(id) && valueOfFact('mualani.waveMomentum') === 3) flat += stats.hp * parameter(talent.id, 'param3');
      if (id === 'shikanoinheizou.skill.param1' && valueOfFact('shikanoinheizou.declension') === 4) flat += stats.attack * parameter(talent.id, 'param3');
      if (id.startsWith('wanderer.c6.kuugo-param')) multiplier *= .4 * parameter('wanderer.skill', 'param2');
      if (id === 'wriothesley.a0.rebuke-vaulting-fist') damageBonus += build.constellation >= 1 ? 2 : .5;
      if (id === 'wriothesley.c6.gracious-icicle') damageBonus += 2;
      if (id === 'yelan.c6.mastermind-barb') multiplier *= 1.56;
      if (id.startsWith('yoimiya.c6.kindling-arrow-')) multiplier *= .6 * parameter('yoimiya.skill', 'param4');
      if (character.id === 'yoimiya' && id.endsWith('.pyro')) multiplier *= parameter('yoimiya.skill', 'param4');
    }
    const attackLevel = build.level + 100, enemyLevel = target.level.value.value + 100;
    const defenseReduction = target.defenseReduction.value.value + (withBuffs && build.constellation >= 2 && (ring || riding && build.constellation >= 6) ? .2 : 0);
    // Shark Bite and its missile share the target-count reduction after flat base additions.
    const biteFactor = withBuffs && ['mualani.skill.param1', 'mualani.skill.shark-missile'].includes(id)
      ? 1 - .14 * (valueOfFact('mualani.biteTargets') - 1) : 1;
    return (base * multiplier * steadyCore + flat) * attackLevel / (attackLevel + enemyLevel * (1 - defenseReduction)) * resistanceFactor * (1 + damageBonus) * strideFactor * biteFactor;
  }
  const coefficient = family === 'stellar-conduct' ? attachmentRates[valueOfFact('stellarAttachments')]
    : reactionConstants.find(entry => entry.formula === family + '-direct' && entry.node === 'reactionCoefficient')?.value;
  const mastery = stats.elementalMastery;
  const blessing = blessings.get(character.id);
  const passive = withBuffs && blessing?.families.includes(family) ? Math.min(blessing.cap, stats[blessing.stat] * blessing.rate) : 0;
  const lunarBloom = family === 'lunar-bloom';
  const neferC6 = id.startsWith('nefer.skill.c6-phantasm-');
  const flat = withBuffs && lunarBloom && character.id === 'nefer' && build.constellation >= 1
    ? .6 * mastery * (1 + .08 * valueOfFact('nefer.phantasmVeil')) : 0;
  const stellarC6 = build.constellation >= 6 && (character.id === 'sandrone' || character.id === 'vesna' && family === 'stellar-swirl');
  let elevation = withBuffs && stellarC6 ? 1.2
    : withBuffs && neferC6 && valueOfFact('fullMoonsign') ? 1.15 : 1;
  if (c6 && character.id === 'flins' && family === 'lunar-charged') elevation = valueOfFact('fullMoonsign') ? 1.45 : 1.35;
  if (c6 && character.id === 'mitya' && family === 'stellar-conduct') elevation = 1.2;
  if (c6 && character.id === 'odette' && ['stellar-conduct', 'stellar-swirl'].includes(family)) elevation = valueOfFact('odette.splendorStacks') > 0 ? 1.45 : 1.2;
  const lunarBonus = (withBuffs && character.id === 'zibai' && family === 'lunar-crystallize' && build.constellation >= 2 && valueOfFact('zibai.lunarPhase') ? .3 : 0)
    + (withBuffs && character.id === 'wriothesley' && family === 'stellar-conduct' && valueOfFact('radiance') === 'stellar-conduct' ? .3 : 0);
  return (base * steadyCore * (1 + passive) * coefficient * (1 + 6 * mastery / (2000 + mastery) + lunarBonus) + flat) * resistanceFactor * elevation * strideFactor;
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
  if (/伤害/.test(label) && !/减免|加成|提升|提高|增加|吸收|转化|降低/.test(label)) return '伤害';
  if (/次数|层数|数量|个数|攻击段数/.test(label)) return '计数';
  if (/能量|体力|消耗|获取|恢复|回复|生命流失|损失生命值|赋予生命之契|空居力|夜魂值上限|引力值上限|战意上限|气氛值上限|蛇之狡谋上限|赤鬃之血上限/.test(label)) return '资源';
  if (/提升|提高|降低|加成|增加|减少|减免|减伤|转化|强化|抗性|攻速|攻击速度|继承生命|触发几率/.test(label)) return '属性或机制';
  return '其他技能说明';
}
function gateCases(character, talent, declaration, owner, defaultParty) {
  const gates = [...declaration.when ?? [], ...declaration.coordinated ? [declaration.coordinated.readyFact] : []];
  if (!gates.length) return [];
  const facts = new Map(), states = new Map(), teams = [];
  const template = id => character.metadata.formulas?.find(f => f.id === id)?.template ?? commonTemplates.get(id);
  function collect(node, condition) {
    const key = typeof node === 'string' ? node : node.fact ?? node.state;
    if (key) {
      const fields = node.state ? states : facts;
      const thresholds = fields.get(key) ?? [];
      if (condition) thresholds.push(condition);
      fields.set(key, thresholds);
    } else if (node.teamCount) teams.push({ ...node.teamCount, threshold: condition?.threshold ?? 0 });
    else if (node.call) {
      const definition = template(node.call);
      for (const [input, child] of Object.entries(node.inputs)) {
        collect(child, definition?.id === 'quantity-condition' && definition.input === input ? definition : undefined);
      }
    }
  }
  for (const gate of gates) collect(gate);
  function test(node, testCase) {
    if (typeof node === 'number') return node;
    if (typeof node === 'string' || node.fact) return testCase.values[typeof node === 'string' ? node : node.fact];
    if (node.amount !== undefined) return node.amount;
    if (node.state) return testCase.ranks[node.state] ?? owner[node.state];
    if (node.teamCount) {
      const { elements, match, excludeOwner, cap, distinctElements } = node.teamCount;
      const party = excludeOwner ? testCase.party : [character.identity.element, ...testCase.party];
      const eligible = elements === 'owner' ? [character.identity.element] : elements;
      const matches = party.filter(element => eligible.includes(element) === (match === 'include'));
      return Math.min(cap ?? Infinity, distinctElements ? new Set(matches).size : matches.length);
    }
    const definition = template(node.call);
    if (definition?.id === 'quantity-condition') {
      const a = test(node.inputs[definition.input], testCase), b = definition.threshold;
      if (!Number.isFinite(a)) return undefined;
      return ({ gt: a > b, gte: a >= b, eq: a === b, lt: a < b, lte: a <= b })[definition.relation];
    }
    if (definition?.id === 'enum-condition') return test(node.inputs[definition.input], testCase) === definition.equals;
    const args = Object.values(node.inputs ?? {}).map(child => test(child, testCase));
    if (definition?.id !== 'condition-group' || args.some(arg => arg === undefined)) return undefined;
    const value = definition.operator === 'all' ? args.every(Boolean) : args.some(Boolean);
    return definition.negate ? !value : value;
  }
  const parties = [defaultParty];
  if (teams.length) parties.push([]);
  for (const team of teams) {
    const eligible = team.elements === 'owner' ? [character.identity.element] : team.elements;
    const matching = (team.match === 'include' ? eligible : elements.filter(element => !eligible.includes(element)))
      .filter(element => element !== 'physical');
    for (let count = 1; count <= Math.min(3, team.threshold + 1); count++) {
      if (team.distinctElements && matching.length < count) continue;
      if (matching.length) parties.push(Array.from({ length: count }, (_, index) => matching[index % matching.length]));
    }
  }
  let cases = Array.from(new Map(parties.map(party => [JSON.stringify(party), party])).values(), party => ({ values: {}, ranks: {}, party }));
  for (const [key, thresholds] of facts) {
    const field = combatFactDeclaration(character.metadata.facts, key);
    if (!field || field.type.kind === 'quantity' && !thresholds.length) return [];
    const input = talent.inputs?.find(input => input.id === key);
    const step = field.type.unit === 'scalar' ? .01 : 1;
    const options = field.type.kind === 'quantity' ? [...new Set(thresholds.flatMap(({ threshold, maxInput }) =>
      [threshold - step, threshold, threshold + step].filter(value => value >= (input?.min ?? 0) && value <= (input?.max ?? maxInput ?? Infinity))))]
      : field.type.kind === 'boolean' ? [false, true] : field.type.values;
    cases = cases.flatMap(test => options.map(value => ({ ...test, values: { ...test.values, [key]: value } })));
  }
  for (const [state, thresholds] of states) {
    const minimum = owner[state], maximum = state === 'refinement' ? 5 : 6;
    const options = [...new Set([minimum, ...thresholds.flatMap(({ threshold }) => [threshold - 1, threshold, threshold + 1])])]
      .filter(value => value >= minimum && value <= maximum).sort((a, b) => a - b);
    cases = cases.flatMap(test => options.map(value => ({ ...test, ranks: { ...test.ranks, [state]: value } })));
  }
  cases.sort((a, b) => (a.ranks.ascension ?? owner.ascension) - (b.ranks.ascension ?? owner.ascension)
    || (a.ranks.constellation ?? owner.constellation) - (b.ranks.constellation ?? owner.constellation)
    || (a.ranks.refinement ?? owner.refinement) - (b.ranks.refinement ?? owner.refinement));
  return cases.map(testCase => ({ ...testCase, active: gates.every(gate => test(gate, testCase) === true) }));
}

const ascensionLevels = [1, 20, 40, 50, 60, 70, 80];
const convertedElements = ['pyro', 'hydro', 'electro', 'cryo'];
const elementRepresentatives = { anemo: 'jean', geo: 'noelle', electro: 'lisa', hydro: 'barbara', pyro: 'amber', cryo: 'kaeya', dendro: 'collei' };

function withRanks(build, ranks) {
  return { ...build, ...ranks, level: Math.max(build.level, ascensionLevels[ranks.ascension ?? build.ascension]) };
}

function agrees(actual, expected) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
}

export function rosterEvaluation(entities, engine, onQuery) {
  const rows = [], gaps = [], otherDetails = [], talentDetails = [];
  const pending = lifecycle.pendingHits;
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  for (const character of entities.characters) {
    const build = auditBuild(character, weapons.get(novice[character.identity.weaponType]));
    const preparedTeams = new Map();
    function prepare(candidate, party) {
      const key = JSON.stringify([candidate.weapon.id, candidate.ascension, candidate.constellation, candidate.refinement, party]);
      if (!preparedTeams.has(key)) {
        const members = [{ id: 'actor', build: candidate }, ...party.map((element, i) => ({ id: 'party-element-' + i, element }))];
        const prepared = engine.prepareStructuredBuilds(members);
        if (!prepared.ok) throw new Error(character.id + ': ' + JSON.stringify(prepared.diagnostics));
        preparedTeams.set(key, prepared.team);
      }
      return preparedTeams.get(key);
    }
    for (const [i, talent] of character.talents.entries()) {
      const meta = character.metadata.talents[i], entries = authoredHitEntries(character.metadata, talent.id);
      const parameters = parameterRefs([entries.map(row => row.hit.base), ...character.metadata.talents.map(t => t.buffs), ...character.metadata.passives.map(p => p.buffs), ...character.metadata.constellations.map(c => c.buffs)], talent.id);
      for (const [j, detail] of meta.details.entries()) {
        const keys = [...new Set([...detail.template.matchAll(/\{(param\d+)(?:[:}])/g)].map(match => match[1]))];
        const kind = talentDetailKind(detail.label);
        const field = '/talents/' + i + '/details/' + j;
        const detailRow = { entity: character.id, skill: talent.id, field,
          name: detail.label, kind, template: detail.template, parameters: keys };
        if (kind === '属性或机制') {
          detailRow.boundContributionParameters = keys.filter(key => parameters.has(key));
          detailRow.missingContributionParameters = keys.filter(key => !parameters.has(key));
          const source = 'src/game-data/data/characters/' + character.id + '.json#' + field;
          const interpretation = lifecycle.interpretations.find(row => row.entity === character.id && row.fields.includes(field));
          otherDetails.push({ ...detailRow, kind: '属性或机制贡献', source, ...(interpretation ? { reason: interpretation.reason } : {}) });
        } else if (kind === '子段总计' || kind === '时间' || kind === '资源') {
          otherDetails.push({ ...detailRow, kind: kind === '时间' ? '时间参数' : kind === '资源' ? '资源参数' : kind });
        }
        talentDetails.push(detailRow);
        if (kind !== '伤害') continue;
        if (keys.some(key => !parameters.has(key))) {
          const remaining = pending.find(row => row.entity === character.id && row.field === field);
          gaps.push({ entity: character.id, field, name: detail.label, parameters: keys, issue: remaining?.reason ?? '详情倍率尚需判定独立命中或机制归属',
            ...(remaining ? { classification: remaining.classification, missingFields: remaining.missingFields } : {}) });
        }
      }
      for (const [j, hit] of talent.hits.entries()) {
        const { hit: declaration, field, unlock } = entries[j];
        const masteryOnly = declaration.base?.inputs?.basis?.inputs?.attribute?.stat === 'elementalMastery' && character.id === 'nefer';
        const baseline = masteryOnly ? { ...build, weapon: weapons.get('sacrificialfragments') } : build;
        const owner = withRanks(baseline, unlock?.rank ? { [unlock.state]: unlock.rank } : {});
        const defaultParty = ['partyPriorityElement', 'strikingHand'].includes(hit.elementBy) ? ['pyro'] : [];
        const cases = gateCases(character, talent, declaration, owner, defaultParty);
        const enabled = cases.find(test => test.active);
        const party = enabled?.party ?? defaultParty;
        const gateBuild = withRanks(owner, enabled?.ranks ?? {});
        const activeTeam = prepare(gateBuild, party);
        const { setup, request } = auditHit(character, talent, hit);
        setAuditDefaults(character, request.frame);
        setup.targets[0].facts.targetHpRatio = number('scalar', 1);
        if (enabled) setGateFacts(character, request.frame, enabled.values);
        const family = declaration.family;
        if (hit.elementBy === 'absorbedElement') request.frame.facts[hit.elementBy] = fact({ kind: 'enum', value: party.find(e => convertedElements.includes(e)) ?? 'pyro' });
        if (hit.elementBy === 'strikingHand') request.frame.facts.strikingHand = fact({ kind: 'enum', value: 'right' });
        if (typeof family === 'object') setGateFacts(character, request.frame, { [family.by]: enabled?.values[family.by] ?? Object.keys(family.cases)[0] });
        if (family === 'stellar-conduct' || typeof family === 'object' && Object.values(family.cases).includes('stellar-conduct')) request.frame.facts.stellarAttachments = number('count', 1);
        setup.targets[0].inputs.level = number('count', gateBuild.level);
        const evaluated = engine.evaluateStructuredHit(activeTeam, setup, request);
        const expected = referenceDamage(gateBuild, talent, declaration, setup, request, party);
        if (onQuery) {
          const anchor = setup.events.find(event => event.kind === 'capture');
          const teammates = party.map(element => {
            const member = characters.get(elementRepresentatives[element]);
            return auditBuild(member, weapons.get(novice[member.identity.weaponType]));
          });
          onQuery({ label: character.id + '/' + hit.id, build: gateBuild, damage: projectQuery(request, setup.targets[0].facts), expected: Number.isFinite(expected) ? expected : null,
            ...(teammates.length ? { teammate: teammates[0] } : {}),
            ...(teammates.length > 1 ? { additionalMembers: teammates.slice(1) } : {}),
            ...(anchor ? { capture: { skillId: anchor.skillId, phase: request.frame.captures[anchor.id].phase,
              ...(anchor.subjectFacts?.length ? { facts: projectFacts(anchor.subjectFacts, anchor.facts) } : {}) } } : {}) });
        }
        const applied = [...new Set(evaluated.trace.filter(node => node.kind === 'effect' && node.value?.kind === 'quantity' && node.value.value !== 0)
          .map(node => node.context?.effectInstanceId).filter(Boolean))];
        const value = evaluated.totals.all.state === 'known' ? evaluated.totals.all.value.value : null;
        const row = { entity: character.id, field, ...(unlock ? { unlock } : {}), hit: hit.id, value, status: evaluated.execution };
        if (Number.isFinite(expected) && value !== null) {
          row.expected = expected;
          if (!agrees(value, expected)) row.issue = '独立基础伤害不符';
          if (applied.length) {
            const context = engine.createStructuredCombatContext(activeTeam, setup);
            context.effectRevisions = applied.map(instanceId => ({ instanceId, disabled: true }));
            const neutral = engine.evaluateStructuredHit(activeTeam, setup, request, { context }).totals.all.value?.value ?? null;
            const expectedBase = referenceDamage(gateBuild, talent, declaration, setup, request, party, false);
            row.baseComparison = { excludedInstances: applied, value: neutral, expected: expectedBase };
            if (!agrees(neutral, expectedBase)) row.issue = '独立基础伤害不符';
          }
        }
        if (unlock?.rank) {
          const locked = withRanks(gateBuild, { [unlock.state]: unlock.rank - 1 });
          locked.level = ascensionLevels[locked.ascension];
          row.lockedValue = engine.evaluateStructuredHit(prepare(locked, party), setup, request).totals.all.value?.value ?? null;
          if (row.lockedValue !== 0) row.issue = '未解锁命中仍有贡献或缺值';
        }
        if (enabled && Object.keys(enabled.values).length) row.activeFacts = enabled.values;
        if (gateBuild.ascension || gateBuild.constellation) row.activeRanks = { ascension: gateBuild.ascension, constellation: gateBuild.constellation };
        if (party.length) row.party = party;
        if (masteryOnly) row.weapon = gateBuild.weapon.id;
        if (typeof family === 'object') row.branches = Object.entries(family.cases).map(([choice, expectedFamily]) => {
          const probe = structuredClone(request);
          setGateFacts(character, probe.frame, { [family.by]: choice });
          const result = engine.evaluateStructuredHit(activeTeam, setup, probe);
          const gate = cases.find(test => Object.hasOwn(test.values, family.by) && test.values[family.by] === choice && test.party === party
            && Object.entries(test.ranks).every(([key, rank]) => gateBuild[key] === rank)
            && Object.entries(test.values).every(([key, value]) => key === family.by || enabled?.values[key] === value));
          const branch = { choice, family: expectedFamily, value: result.totals.all.value?.value ?? null,
            expected: gate?.active === false ? 0 : referenceDamage(gateBuild, talent, declaration, setup, probe, party) };
          if (!agrees(branch.value, branch.expected) || result.outputs.length !== 1 || result.outputs[0].family !== expectedFamily) row.issue = '条件分支缺失或重复';
          return branch;
        });
        if (hit.elementBy === 'absorbedElement') row.elementCases = ['none', ...convertedElements].map(element => {
          const probe = structuredClone(request);
          probe.frame.facts[hit.elementBy] = fact({ kind: 'enum', value: element });
          const input = structuredClone(setup);
          if (element !== 'none') input.targets[0].inputs['resistance.' + element] = number('scalar', .3);
          const variant = declaration.id === 'chasca.a1.covering-fire-converted' && element !== 'none' ? [element] : party;
          const output = engine.evaluateStructuredHit(prepare(gateBuild, variant), input, probe);
          const result = output.totals.all.value?.value ?? null;
          const expected = referenceDamage(gateBuild, talent, declaration, input, probe, variant);
          if (!agrees(result, expected) || output.outputs.length !== 1) row.issue = '元素转化分支不符';
          return { element, value: result, expected };
        });
        if (hit.elementBy === 'partyPriorityElement') row.elementCases = [['anemo'], ['cryo'], ['cryo', 'electro'], ['cryo', 'hydro', 'electro'], ['hydro', 'pyro']].map(party => {
          const input = structuredClone(setup);
          const converted = convertedElements.find(element => party.includes(element));
          const chosen = converted ?? hit.element;
          input.targets[0].inputs['resistance.' + chosen] = number('scalar', .3);
          const output = engine.evaluateStructuredHit(prepare(gateBuild, party), input, request);
          const result = output.totals.all.value?.value ?? null;
          const expected = !converted && declaration.when?.some(gate => gate.call === 'varka.has-element') ? 0
            : referenceDamage(gateBuild, talent, declaration, input, request, party);
          if (!agrees(result, expected) || output.outputs.length !== 1) row.issue = '元素转化分支不符';
          return { elements: party, chosen, value: result, expected };
        });
        if (hit.elementBy === 'strikingHand') {
          row.elementCases = [];
          for (const party of [[], ['electro', 'hydro'], ['pyro', 'cryo']]) {
            const input = structuredClone(setup);
            input.targets[0].inputs['resistance.anemo'] = number('scalar', .4);
            for (const hand of ['left', 'right', null]) {
              const probe = structuredClone(request);
              probe.frame.facts.strikingHand = fact(hand ? { kind: 'enum', value: hand } : null);
              const output = engine.evaluateStructuredHit(prepare(gateBuild, party), input, probe);
              const actual = output.totals.all.value?.value ?? null;
              const unknown = hand === null && party.length > 0;
              const expected = unknown ? null : referenceDamage(gateBuild, talent, declaration, input, probe, party);
              const matches = unknown ? actual === null && output.requiredInputs.some(input => input.key === 'strikingHand' && input.scope === 'query')
                : agrees(actual, expected) && output.outputs.length === 1;
              if (!matches) row.issue = '重击的出手侧或缺项判定不符';
              row.elementCases.push({ elements: party, hand, value: actual, expected });
            }
          }
        }
        if (hit.id === 'wanderer.a1.descent-arrow') {
          const input = structuredClone(setup);
          const capture = input.events.find(event => event.kind === 'capture');
          capture.subjectFacts[0].values['wanderer.jadeClaimed-pyro'] = bool(true);
          const captured = engine.evaluateStructuredHit(activeTeam, input, request).totals.all.value?.value ?? null;
          const expected = referenceDamage(gateBuild, talent, declaration, input, request, party);
          const missing = engine.evaluateStructuredHit(activeTeam, setup, { ...request, frame: { ...request.frame, captures: {} } });
          const inputs = missing.requiredInputs.map(input => ({ key: input.key, scope: input.scope }));
          row.captureComparison = { captured, expected, missing: missing.totals.all.value?.value ?? null, inputs };
          if (!agrees(captured, expected) || row.captureComparison.missing !== null || !inputs.some(input => input.key === capture.id && (input.scope === 'capture' || input.scope.endsWith(':capture')))) {
            row.issue = '捕获点属性或缺项判定不符';
          }
        }
        if (Array.isArray(declaration.base)) {
          const counts = [...new Set(declaration.base.map(term => term.count).filter(Boolean))];
          const mastery = declaration.base.some(term => term.stat === 'elementalMastery');
          if (counts.length || mastery) {
            const counting = { request: structuredClone(request), setup: structuredClone(setup) };
            if (enabled) setGateFacts(character, counting.request.frame, enabled.values);
            if (family === 'stellar-conduct') counting.request.frame.facts.stellarAttachments = number('count', 1);
            if (typeof family === 'object') setGateFacts(character, counting.request.frame, { [family.by]: enabled?.values[family.by] ?? Object.keys(family.cases)[0] });
            const gear = mastery ? entities.weapons.find(w => w.id === 'sacrificialfragments' && w.weaponType === character.identity.weaponType) : undefined;
            const countBuild = gear ? { ...gateBuild, weapon: gear } : gateBuild;
            const countTeam = prepare(countBuild, party);
            row.countCases = [];
            for (const key of counts.length ? counts : [null]) {
              const input = talent.inputs?.find(i => i.id === key);
              const values = input ? [...new Set([input.min, Math.min(input.min + 1, input.max), input.max])] : [null];
              for (const count of values) {
                if (input) counting.request.frame.facts[key] = number(input.type.unit, count);
                const calc = engine.evaluateStructuredHit(countTeam, counting.setup, counting.request);
                const test = { input: key, count, ...(gear ? { weapon: gear.id } : {}), value: calc.totals.all.value?.value ?? null };
                if (test.value === null) row.issue = '合法计数或精通配装缺少数值';
                test.expected = referenceDamage(countBuild, talent, declaration, counting.setup, counting.request, party);
                if (test.value !== null && !agrees(test.value, test.expected)) row.issue = '计数或精通缩放数值不符';
                row.countCases.push(test);
              }
            }
          }
        }

        if (enabled) row.exclusions = cases.filter(test => !test.active).map(test => {
          const probe = structuredClone(request);
          setGateFacts(character, probe.frame, test.values);
          const variant = withRanks(owner, test.ranks);
          const result = engine.evaluateStructuredHit(prepare(variant, test.party), setup, probe);
          const value = result.totals.all.value?.value ?? null;
          if (value !== 0) row.issue = '不满足单项门槛仍有贡献或缺值';
          return { facts: test.values, ...(Object.keys(test.ranks).length ? { ranks: test.ranks } : {}), ...(test.party !== party ? { party: test.party } : {}), value };
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
  return { settings: '默认角色与对应一星武器均为一级零突破、零命、精一、天赋一级、无圣遗物。敌人与角色同级、各抗性10%，不暴击，不另加反应。默认计数取技能下界。受门槛约束的命中按授予条件设置突破、命座、队伍和明确事实。奈芙尔纯精通虚影段使用一级祭礼残章。保留增益生效时的独立数值对照，并逐项记录关闭实例后的基础值。', rows, gaps, otherDetails, talentDetails,
    summary: { talents: entities.characters.reduce((count, character) => count + character.talents.length, 0), talentDetails: talentDetails.length,
      healingDetails: talentDetails.filter(row => row.kind === '治疗量').length, shieldDetails: talentDetails.filter(row => row.kind === '护盾吸收量').length,
      evaluated: rows.length, numeric: rows.filter(row => row.value !== null).length, compared: rows.filter(row => row.expected !== undefined).length, neutralComparisons: rows.filter(row => row.baseComparison).length,
      mismatches: rows.filter(row => row.issue === '独立基础伤害不符').length, duplicate: rows.filter(row => row.issue === '同一命中重复结算').length,
      missingBindings: rows.filter(row => row.issue === '伤害族或求值公式未绑定').length, missingValues: rows.filter(row => row.issue === '缺少求值输入或公式').length,
      conditionFailures: rows.filter(row => ['不满足单项门槛仍有贡献或缺值', '条件分支缺失或重复', '元素转化分支不符', '未解锁命中仍有贡献或缺值',
        '重击的出手侧或缺项判定不符', '捕获点属性或缺项判定不符'].includes(row.issue)).length,
      elementCases: rows.reduce((sum, row) => sum + (row.elementCases?.length ?? 0), 0),
      countCases: rows.reduce((sum, row) => sum + (row.countCases?.length ?? 0), 0),
      countFailures: rows.filter(row => row.issue === '合法计数或精通配装缺少数值' || row.issue === '计数或精通缩放数值不符').length,
      positiveHits: rows.filter(row => row.value > 0 || [...row.branches ?? [], ...row.countCases ?? []].some(test => test.value > 0)).length,
      familyCases: rows.reduce((sum, row) => sum + (row.branches?.length ?? 0), 0),
      conditionExclusions: rows.reduce((sum, row) => sum + (row.exclusions?.length ?? 0), 0), detailCandidates: gaps.filter(row => !row.hit).length, contextualDetails: otherDetails.length, contextualContributionsPending: otherDetails.filter(row => row.kind === '属性或机制贡献' && row.missingContributionParameters.length).length } };
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

export function auditPublicScenes(entities, engine, verified = new Set()) {
  const c = entities.characters.find(c => c.id === 'kaeya'), w = entities.weapons.find(w => w.id === 'dullblade'), build = auditBuild(c, w);
  const definitions = read('calculation/battle-scenes'), sources = readContentSource(new URL('../data/sources/catalog/battle-scenes.json', import.meta.url));
  const rows = [], gaps = [], branches = [], triggers = [];
  const sourceById = new Map(sources.map(row => [row.entity, row]));
  const labels = { flatAttack:'攻击力',flatDefense:'防御力',critRate:'暴击率',critDamage:'暴击伤害',hpPercent:'生命值上限',energyRecharge:'元素充能效率',
    elementalMastery:'元素精通',healingBonus:'治疗(?:加成|效果)',shieldStrength:'护盾强效',physicalBonus:'物理伤害',pyroBonus:'火元素伤害',cryoBonus:'冰元素伤害',geoBonus:'岩元素伤害',
    hydroBonus:'水元素伤害',anemoBonus:'风元素伤害',electroBonus:'雷元素伤害',dendroBonus:'草元素伤害' };
  function sourceAmount(text, target) {
    if (text.includes(' Bonus ')) return Number(text.split(' Bonus ')[1]);
    if (target === 'attribute.reaction.electro-charged.rangeBonus') return Number(text.match(/影响范围扩大([\d.]+)%/)?.[1]) / 100;
    if (target.startsWith('attribute.reaction.')) return Number([...text.matchAll(/([\d.]+)%/g)][target.includes('.transformative.') ? 0 : 1]?.[1]) / 100;
    const key = target.slice(10), name = labels[key];
    const match = text.match(new RegExp(name + '(?:提高|提升)([\\d.]+)(点|%)')) ?? text.match(new RegExp('获得([\\d.]+)(%)' + name));
    return match ? Number(match[1]) / (match[2] === '%' ? 100 : 1) : NaN;
  }
  const ids = new Set(definitions.map(d => d.id));
  for (const definition of definitions) {
    if (!definition.buffs.length) continue;
    const localText = sourceById.get(definition.id)?.text ?? '';
    const currentScene = auditCurrentScene(definition, sourceById.get(definition.id), entities, engine);
    if (currentScene) {
      rows.push(...currentScene.rows);
      gaps.push(...currentScene.gaps);
      continue;
    }
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
        const matches = !reaction || (target === 'attribute.reaction.electro-charged.rangeBonus' ? probe === 'electro-charged'
          : target.includes('.transformative.') ? (text.includes('感电反应') ? probe === 'electro-charged' : text.includes('星扩散') ? probe === 'swirl' : ['bloom','burgeon','hyperbloom'].includes(probe))
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
    if (verified.has(source.entity + source.field)) { observed.add(source.entity); continue; }
    if (ids.has(source.entity) && observed.has(source.entity) && !source.issue) continue;
    gaps.push({entity:source.entity,field:source.field,text:source.text,
      ...(source.missingFields ? {missingFields:source.missingFields} : {}),
      ...(source.evidence ? {evidence: source.evidence} : {}),
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
    const grantCache = new Map();
    function grants(ascension, constellation) {
      const key = ascension + '/' + constellation;
      if (!grantCache.has(key)) {
        const effects = engine.grantedBuildEffects({ ...base, ascension, constellation });
        grantCache.set(key, new Set(effects.map(grant => grant.effect.identity.id)));
      }
      return grantCache.get(key);
    }
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
        const rules = new Map();
        for (const buff of character.metadata[group][i].buffs ?? []) {
          for (const [index, modifier] of buff.modifiers.entries()) {
            const id = index ? buff.id + '.' + index : buff.id;
            const ascension = Math.max(branch.unlockAscension ?? 0, buff.activation?.ascension ?? 0);
            const constellation = Math.max(branch.rank ?? 0, buff.activation?.constellation ?? 0, modifier.constellation ?? 0);
            rules.set(id, grants(ascension, constellation).has(id)
              && (ascension === 0 || !grants(ascension - 1, constellation).has(id))
              && (constellation === 0 || !grants(ascension, constellation - 1).has(id)));
          }
        }
        row.grantGate = rules.size === row.grantIds.length && row.grantIds.every(id => rules.get(id));
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
