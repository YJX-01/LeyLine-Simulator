import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const sourceRoot = 'tools/data/sources/catalog/genshin-db/';
const weaponsSource = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const setsSource = readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json', import.meta.url));
const charactersSource = readContentSource(new URL('../data/sources/catalog/genshin-db/characters.json', import.meta.url));
const charactersCurves = readContentSource(new URL('../data/sources/catalog/genshin-db/character-curves.json', import.meta.url));
const sword = { anemo: 'jean', geo: 'albedo', electro: 'keqing', hydro: 'xingqiu', pyro: 'bennett', cryo: 'kaeya', dendro: 'kirara' };
const catalyst = { anemo: 'sucrose', geo: 'ningguang', electro: 'lisa', hydro: 'barbara', pyro: 'klee', cryo: 'charlotte', dendro: 'nahida' };
const defaultHolder = { WEAPON_SWORD_ONE_HAND: 'kaeya', WEAPON_CATALYST: 'lisa', WEAPON_CLAYMORE: 'noelle',
  WEAPON_BOW: 'amber', WEAPON_POLE: 'xiangling' };
const byUnit = { hp: 'FIGHT_PROP_HP_PERCENT', attack: 'FIGHT_PROP_ATTACK_PERCENT', defense: 'FIGHT_PROP_DEFENSE_PERCENT',
  elementalMastery: 'FIGHT_PROP_ELEMENT_MASTERY' };
const attribute = stat => 'attribute.' + stat;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-9);
const scalar = (text, pattern, index = 1) => Number(pattern.exec(text)?.[index]) / 100;
const amount = (text, pattern, index = 1) => Number(pattern.exec(text)?.[index]);
const weaponReference = (entity, rank) => sourceRoot + 'weapons.json#/' + entity + '/metadata/r' + rank + '/description';
const setReference = (entity, pieces) => sourceRoot + 'sets.json#/' + entity + '/effect' + pieces + 'Pc';

function whiteStat(holder, stat) {
  const source = charactersSource[holder].stats;
  return source.base[stat] * charactersCurves[1][source.curve[stat]] + source.promotion[0][stat];
}

function weaponStat(weapon, stat) {
  const { stats } = weaponsSource[weapon];
  return stats.specialized === byUnit[stat] ? stats.base.specialized : 0;
}

function caseWithFacts(facts, expected, settings = {}) {
  return { facts, expected, ...settings };
}

function factRecord(frame, kind, id) {
  let row = frame.factOverrides.find(entry => entry.subject.kind === kind && entry.subject.id === id);
  if (!row) frame.factOverrides.push(row = { subject: { kind, id }, facts: {} });
  return row.facts;
}

/** Compare source-backed scenarios with the single calculation grant behind each listed equipment modifier. */
export function mixedEquipmentModifierNumbers(entities, results, engine) {
  const output = [];
  const occupied = new Set(results.registeredModifierEvidence?.map(row => row.key));
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map(entities.sets.map(set => [set.id, set]));
  const available = new Map();
  const teams = new Map();
  for (const row of results.calculator?.buffs ?? []) {
    if (!row.listed || row.issue || occupied.has(row.entity + row.field)) continue;
    const key = row.entity + row.field;
    available.set(key, available.has(key) ? null : row);
  }

  function replay(equipment, identity, target, { rank, holder, other = [], recipient = 'actor', onField = 'actor',
    category = 'normal', element, reactionId = null, family = 'ordinary', facts = {}, inputs = {},
    pieces, time = 1, events = [], targetFacts = {}, recipientFacts = {}, unset = [] }) {
    const character = characters.get(holder);
    const isWeapon = weapons.has(equipment.id);
    const starter = member => weapons.get(novice[member?.identity.weaponType]);
    const weapon = isWeapon ? equipment : starter(character);
    const teammates = other.map(id => characters.get(id));
    if (!character || !weapon || teammates.some(member => !starter(member))) return NaN;
    const key = JSON.stringify([equipment.id, rank, pieces, holder, other]);
    if (!teams.has(key)) {
      const build = { ...auditBuild(character, weapon, isWeapon ? [] : [equipment]), refinement: rank };
      if (!isWeapon) build.theoreticalSetSlots = equipment.slots.slice(0, pieces).map(slot => ({ slot, setId: equipment.id }));
      const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, ...teammates.map((member, index) => ({
        id: 'peer' + index, build: auditBuild(member, starter(member)),
      }))]);
      teams.set(key, prepared.ok ? prepared.team : null);
    }
    const team = teams.get(key);
    const dealer = recipient === 'actor' ? character : teammates[Number(recipient.slice(4))];
    const hitTalent = dealer?.talents.find(talent => talent.hits.some(hit => hit.category === category));
    const talent = hitTalent ?? dealer?.talents.find(talent => talent.hits.length);
    const hit = talent?.hits.find(row => row.category === category) ?? talent?.hits[0];
    if (!team || !hit) return NaN;
    const { setup, request } = auditHit(dealer, talent, hit);
    for (const source of [character, equipment]) setAuditDefaults(source, request.frame);
    setGateFacts(equipment, request.frame, facts);
    for (const key of unset) delete factRecord(request.frame, 'actor', 'actor')[key];
    Object.assign(factRecord(request.frame, 'target', 'enemy'), targetFacts);
    const recipientDefaults = Object.fromEntries(Object.entries(equipment.metadata.facts ?? {})
      .filter(([, field]) => field.scope === 'recipient' && field.type.kind === 'boolean')
      .map(([key]) => [key, bool(false)]));
    for (const id of ['actor', ...teammates.map((_, index) => 'peer' + index)]) {
      Object.assign(factRecord(request.frame, 'actor', id), {
        ...recipientDefaults,
        onField: bool(id === onField),
        ...(id === recipient ? recipientFacts : {}),
      });
    }
    const hitEvent = setup.events.find(event => event.id === request.frame.eventId);
    Object.assign(hitEvent, { actorId: recipient, timeMs: time, category });
    setup.events.unshift(...events);
    const context = engine.createStructuredCombatContext(team, setup);
    Object.assign(context.actors.find(actor => actor.id === 'actor').inputs, inputs);
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      hit: family === 'transformative' ? { skillId: null, hitId: null, category: null, family, origin: 'reaction', element, reactionId }
        : { skillId: talent.id, hitId: hit.id, category, family, origin: 'talent', element: element ?? hit.element, reactionId } };
    const reading = engine.evaluateCombatBindings(team.program, context, { value: {
      kind: 'attribute', key: target, actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' },
    } }, frame);
    const value = reading.outputs.value;
    if (value?.state !== 'known') return NaN;
    // Selection traces include candidates removed by stack limits. Follow the evaluated output to the retained contributions.
    const needed = new Set([value.traceId]);
    let contribution = 0;
    for (const node of reading.trace.toReversed()) {
      if (!needed.has(node.id)) continue;
      for (const dependency of node.dependencies) needed.add(dependency);
      if (node.kind !== 'effect' || node.definition.id !== identity.id || node.definition.namespace !== identity.namespace
        || node.definition.revision !== identity.revision || node.context?.actorId !== 'actor' || node.context.recipientId !== recipient) continue;
      if (node.state !== 'known' || node.value?.kind !== 'quantity') return NaN;
      contribution += node.value.value;
    }
    return contribution;
  }

  function check(entity, suffix, stat, options, probes) {
    const equipment = weapons.get(entity) ?? sets.get(entity);
    if (!equipment) return;
    const { role = 'owner', pieces, modifier: expectedPosition, sources = [] } = options;
    const groups = equipment.metadata.effects?.map((bonus, index) => ({ bonus, field: '/effects/' + index }))
      ?? [{ bonus: equipment.metadata, field: '' }];
    const target = attribute(stat), id = entity + '.' + suffix;
    const candidates = groups.filter(({ bonus }) => bonus.pieces === pieces).flatMap(({ bonus, field }) =>
      (bonus.buffs ?? []).flatMap((buff, index) => buff.id !== id ? [] : buff.modifiers.flatMap((modifier, position) =>
        modifier.target !== target || expectedPosition !== undefined && position !== expectedPosition ||
          (modifier.recipient ?? buff.recipient ?? 'owner') !== role ? [] :
          [{ field: field + '/buffs/' + index + '/modifiers/' + position, position }])));
    if (candidates.length !== 1) return;
    const [{ field, position }] = candidates;
    const key = entity + field;
    const choice = available.get(key);
    if (choice?.id !== id || choice.target !== target || choice.role !== role || occupied.has(key)) return;
    const definitions = equipment.calculation.bundle.effects.filter(effect => effect.identity.id === (position ? id + '.' + position : id)
      && (effect.buff ?? effect.identity).id === id && effect.target.kind === 'attribute' && effect.target.attribute.id === target
      && effect.recipient.role === role);
    if (definitions.length !== 1) return;
    const [{ identity, target: { attribute: targetRef } }] = definitions;
    const ranks = pieces ? [1] : Object.keys(weaponsSource[entity].metadata).filter(key => /^r[1-5]$/.test(key)).sort().map(key => Number(key.slice(1)));
    if (!ranks.length || !pieces && ranks.length !== equipment.maxRefinement) return;
    const refs = [...sources], cases = [];
    for (const rank of ranks) {
      const text = pieces ? setsSource[entity]['effect' + pieces + 'Pc'] : weaponsSource[entity].metadata['r' + rank].description;
      const selected = probes(text);
      if (!selected.some(caseData => caseData.expected !== 0 && Number.isFinite(caseData.expected)) ||
        !selected.some(caseData => caseData.expected === 0)) return;
      const rankCases = selected.map(({ expected, ...input }) => {
        const settings = { holder: options.holder ?? defaultHolder[equipment.weaponType] ?? 'kaeya', rank,
          ...(pieces ? { pieces } : {}), ...input };
        return { settings, expected, actual: replay(equipment, identity, targetRef, settings) };
      });
      if (!rankCases.every(row => close(row.actual, row.expected))) return;
      cases.push(...rankCases);
      refs.push(pieces ? setReference(entity, pieces) : weaponReference(entity, rank));
    }
    const [active] = cases.filter(row => row.expected !== 0);
    output.push({ key, entity, field, id, modifier: position, target, audit: 'mixedEquipmentModifierNumbers',
      actual: active.actual, expected: active.expected, refs: [...new Set(refs)],
      scope: '根据固定装备原文推导期望，使用明确给出的计算状态及事件核验单条授予贡献。', cases,
    });
    occupied.add(key);
  }

  function stacks(entity, suffix, stat, key, readNumbers, options = {}) {
    check(entity, suffix, stat, options, text => {
      const { rate, cap } = readNumbers(text);
      const { gates = {}, categories, elements, family = 'ordinary', reactionId = null, offField = false, party } = options;
      const picked = { category: categories?.[0], element: elements?.[0], family, reactionId };
      const maximum = Math.round(cap / rate);
      const testLayers = [...new Set([0, 1, 2, maximum, ...(options.checkOverCap === false ? [] : [maximum + 1])])];
      const scenarios = testLayers.map(value =>
        caseWithFacts({ [key]: value, ...gates }, Math.sign(rate) * Math.min(Math.abs(cap), value * Math.abs(rate)),
          { ...picked, ...(offField ? { onField: 'peer0', other: ['kaeya'] } : {}), ...(party ? { other: party.slice(0, value) } : {}) }));
      const active = { [key]: maximum, ...gates };
      const inactive = { ...active, ...Object.fromEntries(Object.entries(gates).map(([field, value]) => [field, !value])) };
      scenarios.push(...(categories ?? []).slice(1).map(category => caseWithFacts(active, cap, { ...picked, category })));
      if (categories) scenarios.push(caseWithFacts(active, 0, { ...picked, category: ['normal', 'skill', 'burst', 'plunge'].find(category => !categories.includes(category)) }));
      if (elements) scenarios.push(caseWithFacts(active, 0, { ...picked, element: 'physical' }));
      if (family !== 'ordinary') scenarios.push(caseWithFacts(active, 0, { ...picked, family: 'ordinary', reactionId: null }));
      if (Object.keys(gates).length) scenarios.push(caseWithFacts(inactive, 0, picked));
      if (offField) scenarios.push(caseWithFacts(active, 0, { ...picked, other: ['kaeya'] }));
      scenarios.push(caseWithFacts(active, 0, { ...picked, other: party ?? ['barbara'], recipient: 'peer0' }));
      if (options.pieces) scenarios.push(caseWithFacts(active, 0, { ...picked, pieces: options.pieces - 1 }));
      return scenarios;
    });
  }

  function layers(ratePattern, maximumPattern, multiplier = () => 1) {
    return text => {
      const rate = scalar(text, ratePattern) * multiplier(text);
      const maximum = maximumPattern.exec(text)?.[1];
      return { rate, cap: rate * (maximum === '三' ? 3 : Number(maximum)) };
    };
  }

  function exactLayers(entity, suffix, stat, key, count, read, options = {}) {
    check(entity, suffix, stat, options, text => {
      const value = read(text) * count;
      const { gates = {}, maximum = 3, party } = options;
      const cases = Array.from({ length: maximum + 1 }, (_, layers) =>
        caseWithFacts({ [key]: layers, ...gates }, layers === count ? value : 0, { other: party?.slice(0, layers) }));
      for (const gate of Object.keys(gates)) cases.push(caseWithFacts({ [key]: count, ...gates, [gate]: !gates[gate] }, 0, { other: party?.slice(0, count) }));
      cases.push(caseWithFacts({ [key]: count, ...gates }, 0, { other: party?.slice(0, count) ?? ['barbara'], recipient: 'peer0' }));
      return cases;
    });
  }

  function fixed(entity, suffix, stat, read, options = {}) {
    check(entity, suffix, stat, options, text => {
      const value = read(text);
      const { gates = {}, categories, reactions, recipient = 'actor', other, targetFacts, inputs, events, time, onField, recipientFacts } = options;
      const started = { recipient, other, targetFacts, inputs, events, time, onField, recipientFacts, category: categories?.[0], ...reactions?.[0] };
      const cases = [caseWithFacts(gates, value, started)];
      const absent = options.role === 'team' && recipient === 'actor' ? value : 0;
      cases.push(caseWithFacts(gates, absent, { ...started, recipient: recipient === 'actor' ? 'peer0' : 'actor', other: other ?? ['barbara'] }));
      for (const [gate, active] of Object.entries(gates)) cases.push(caseWithFacts({ ...gates, [gate]: typeof active === 'boolean' ? !active : options.inactive }, 0, started));
      if (categories) {
        for (const category of categories.slice(1)) cases.push(caseWithFacts(gates, value, { ...started, category }));
        cases.push(caseWithFacts(gates, 0, { ...started, category: ['normal', 'skill', 'plunge'].find(category => !categories.includes(category)) }));
      }
      if (reactions) {
        for (const reaction of reactions.slice(1)) cases.push(caseWithFacts(gates, value, { ...started, ...reaction }));
        cases.push(caseWithFacts(gates, 0, { ...started, family: 'ordinary', reactionId: null }));
        if (reactions[0].family === 'transformative') cases.push(caseWithFacts(gates, 0, { ...started, reactionId: 'swirl' }));
      }
      if (targetFacts) cases.push(caseWithFacts(gates, 0, { ...started, targetFacts: Object.fromEntries(Object.keys(targetFacts).map(key => [key, bool(false)])) }));
      if (events) cases.push(caseWithFacts(gates, 0, { ...started, events: [] }));
      if (options.offField) cases.push(caseWithFacts(gates, 0, { ...started, onField: 'actor' }));
      if (options.onFieldOnly) cases.push(caseWithFacts(gates, 0, { ...started, onField: 'peer0', other: ['barbara'] }));
      if (options.pieces) cases.push(caseWithFacts(gates, 0, { ...started, pieces: options.pieces - 1 }));
      return cases;
    });
  }

  const elements = Object.keys(sword);
  const buildStatsSources = (holder, weapon) => [
    sourceRoot + 'characters.json#/' + holder + '/stats', sourceRoot + 'character-curves.json',
    sourceRoot + 'weapons.json#/' + weapon + '/stats',
  ];
  for (const [element, holder] of Object.entries(sword)) for (const slot of [1, 2, 3]) {
    check('mistsplitterreforged', 'emblem-' + slot, element + 'Bonus', { holder }, text => {
      const value = scalar(text, /持有1\/2\/3层雾切之巴印时，获得([\d.]+)\/([\d.]+)\/([\d.]+)%自己的元素类型/, slot);
      const cases = [0, 1, 2, 3].map(layers => caseWithFacts({ 'mistsplitterreforged.emblemLayers': layers }, layers === slot ? value : 0));
      cases.push(caseWithFacts({ 'mistsplitterreforged.emblemLayers': slot }, 0, { holder: element === 'cryo' ? 'jean' : 'kaeya' }),
        caseWithFacts({ 'mistsplitterreforged.emblemLayers': slot }, 0, { other: ['amber'], recipient: 'peer0' }));
      return cases;
    });
  }
  for (const [element, holder] of Object.entries(catalyst)) {
    check('athousandfloatingdreams', 'different', element + 'Bonus', { holder }, text => {
      const value = scalar(text, /不同：装备者元素类型的元素伤害加成提升([\d.]+)%/);
      const limit = amount(text, /每种至多叠加(\d+)层/);
      const other = ['cryo', 'pyro', 'anemo', 'hydro'].filter(candidate => candidate !== element)
        .map(candidate => candidate === 'pyro' ? 'amber' : candidate === 'hydro' ? 'barbara' : sword[candidate]);
      return [0, 1, 2, limit].map(count => caseWithFacts({}, count * value, { other: other.slice(0, count) })).concat(
        caseWithFacts({}, 0, { holder: element === 'electro' ? 'sucrose' : 'lisa', other: other.slice(0, 2) }),
        caseWithFacts({}, 0, { other: other.slice(0, 2), recipient: 'peer0' }));
    });
    check('jadefallssplendor', 'regalia', element + 'Bonus', { holder, sources: buildStatsSources(holder, 'jadefallssplendor') }, text => {
      const active = 'jadefallssplendor.regaliaActive';
      const rate = scalar(text, /每1000点使其对应元素类型的元素伤害加成提高([\d.]+)%/);
      const cap = scalar(text, /至多提高([\d.]+)%/);
      const atHp = added => Math.min(cap, (whiteStat(holder, 'hp') * (1 + weaponStat('jadefallssplendor', 'hp')) + added) / 1000 * rate);
      return [0, 1000, 40000].map(added => caseWithFacts({ [active]: true }, atHp(added), { inputs: { flatHp: number('hp', added) } })).concat(
        caseWithFacts({ [active]: false }, 0),
        caseWithFacts({ [active]: true }, 0, { holder: element === 'electro' ? 'sucrose' : 'lisa' }),
        caseWithFacts({ [active]: true }, 0, { other: ['amber'], recipient: 'peer0' }));
    });
    for (const upgrade of [false, true]) {
      check('celestialgift', (upgrade ? 'hymn-owner-' : 'light-') + element, element + 'Bonus',
        { holder, pieces: 4, role: 'team' }, text => {
          const value = scalar(text, upgrade ? /上述两种元素伤害加成提升至([\d.]+)%/ : /所有角色获得([\d.]+)%对应元素伤害加成/);
          const fields = (window, hexerei) => ({ 'celestialgift.songWindow': window, 'celestialgift.hexerei': hexerei,
            'celestialgift.onFieldElement': element === 'pyro' ? 'cryo' : 'pyro' });
          const active = fields(true, upgrade);
          return [caseWithFacts(active, value), caseWithFacts(active, value, { other: ['amber'], recipient: 'peer0' }),
            caseWithFacts(fields(false, upgrade), 0), caseWithFacts(fields(true, !upgrade), 0),
            caseWithFacts(active, 0, { holder: element === 'electro' ? 'sucrose' : 'lisa' }),
            caseWithFacts(active, 0, { pieces: 3 })];
        });
    }
  }

  // Per-layer values, caps, and category restrictions come from the pinned equipment wording.
  stacks('alleyhunter', 'damage', 'damageBonus', 'alleyhunter.damageStacks', text => ({
    rate: scalar(text, /每1秒角色造成的伤害提升([\d.]+)%/), cap: scalar(text, /最多通过这种方式获得([\d.]+)%/),
  }));
  stacks('amosbow', 'flight-damage', 'damageBonus', 'amosbow.flightStacks',
    layers(/伤害还会提升([\d.]+)%/, /至多提升(\d+)次/), { categories: ['normal', 'charged'] });
  stacks('calamityqueller', 'consummation', 'attackPercent', 'calamityqueller.consummationLayers',
    layers(/攻击力每1秒提升([\d.]+)%/, /至多叠加(\d+)次/));
  stacks('calamityqueller', 'consummation-off-field', 'attackPercent', 'calamityqueller.consummationLayers',
    layers(/攻击力每1秒提升([\d.]+)%/, /至多叠加(\d+)次/), { offField: true });
  stacks('fangofthemountainking', 'canopy', 'damageBonus', 'fangofthemountainking.canopyLayers',
    layers(/元素战技伤害和元素爆发伤害提升([\d.]+)%/, /至多叠加(\d+)层/), { categories: ['skill', 'burst'] });
  stacks('flowerwreathedfeathers', 'aimed-damage', 'damageBonus', 'flowerwreathedfeathers.aimedLayers',
    layers(/提升重击造成的伤害([\d.]+)%/, /最多叠加(\d+)层/), { categories: ['charged'] });
  stacks('gestofthemightywolf', 'song-damage', 'damageBonus', 'gestofthemightywolf.songLayers',
    layers(/造成的伤害提升([\d.]+)%/, /至多叠加(\d+)次/));
  stacks('gestofthemightywolf', 'song-crit', 'critDamage', 'gestofthemightywolf.songLayers',
    layers(/暴击伤害提高([\d.]+)%/, /至多叠加(\d+)次/), { gates: { 'gestofthemightywolf.hexerei': true } });
  stacks('harangeppakufutsu', 'waves', 'damageBonus', 'harangeppakufutsu.consumedWaves',
    layers(/每层提升([\d.]+)%普通攻击伤害/, /至多叠加(\d+)层/), { categories: ['normal'] });
  stacks('hymnofthemaelstrom', 'mead-hp', 'hpPercent', 'hymnofthemaelstrom.meadLayers',
    layers(/生命值上限提升([\d.]+)%/, /至多叠加(\d+)层/));
  stacks('hymnofthemaelstrom', 'mead-hp-reaction', 'hpPercent', 'hymnofthemaelstrom.meadLayers',
    layers(/生命值上限提升([\d.]+)%/, /至多叠加(\d+)层/, text => scalar(text, /额外提高([\d.]+)%/)),
    { gates: { 'hymnofthemaelstrom.reactionBuff': true } });
  stacks('ironsting', 'elemental-damage', 'damageBonus', 'ironsting.elementalDamageLayers',
    layers(/角色造成的伤害提高([\d.]+)%/, /最多叠加(\d+)层/));
  stacks('kagurasverity', 'skill-dance', 'damageBonus', 'kagurasverity.danceLayers',
    layers(/元素战技造成的伤害提高([\d.]+)%/, /至多叠加(\d+)层/), { categories: ['skill'], checkOverCap: false });
  stacks('kagurasverity', 'stellar-dance', 'reaction.stellar-conduct.damageBonus', 'kagurasverity.danceLayers',
    layers(/星超导反应伤害提升([\d.]+)%/, /至多叠加(\d+)层/), { family: 'stellar-conduct', reactionId: 'stellar-conduct' });
  stacks('lostprayertothesacredwinds', 'battle-stacks', 'damageBonus', 'lostprayertothesacredwinds.battleLayers',
    layers(/获得([\d.]+)%元素伤害加成/, /最多叠加(\d+)层/), { elements });
  stacks('lumidouceelegy', 'burning-damage', 'damageBonus', 'lumidouceelegy.burningLayers',
    layers(/造成的伤害提高([\d.]+)%/, /至多叠加(\d+)层/));
  for (const entity of ['memoryofdust', 'summitshaper', 'theunforged', 'vortexvanquisher']) {
    const max = /至多可叠加(\d+)层/;
    const rate = /攻击力提升([\d.]+)%。该效果/;
    stacks(entity, 'stacked-attack', 'attackPercent', entity + '.attackLayers', layers(rate, max));
    stacks(entity, 'shielded-attack', 'attackPercent', entity + '.attackLayers',
      layers(rate, max, text => scalar(text, /攻击力提升效果提高([\d.]+)%/)), { gates: { shielded: true } });
  }
  stacks('peakpatrolsong', 'ode-defense', 'defensePercent', 'peakpatrolsong.odeLayers',
    layers(/防御力提高([\d.]+)%/, /至多叠加(\d+)层/));
  stacks('peakpatrolsong', 'ode-elements', 'damageBonus', 'peakpatrolsong.odeLayers',
    layers(/并获得([\d.]+)%所有元素伤害加成/, /至多叠加(\d+)层/), { elements });
  stacks('primordialjadewingedspear', 'eagle-attack', 'attackPercent', 'primordialjadewingedspear.eagleLayers',
    layers(/自身攻击力提高([\d.]+)%/, /最高可以叠加(\d+)层/));
  for (const entity of ['prospectorsdrill', 'rangegauge']) {
    stacks(entity, 'resistance-attack', 'attackPercent', entity + '.consumedMarks',
      layers(/每枚消耗的团结标记提高([\d.]+)%攻击力/, /至多拥有(三)枚/));
    stacks(entity, 'resistance-elements', 'damageBonus', entity + '.consumedMarks',
      layers(/与([\d.]+)%所有元素伤害加成/, /至多拥有(三)枚/), { elements });
  }
  stacks('splendoroftranquilwaters', 'teammate-hp-change', 'hpPercent', 'splendoroftranquilwaters.teammateHpLayers',
    layers(/装备者的生命值上限提升([\d.]+)%/, /至多叠加(\d+)次，每0\.2秒至多触发一次。装备者/));
  stacks('surfsup', 'scorching-summer', 'damageBonus', 'surfsup.summerLayers',
    layers(/每层使普通攻击造成的伤害提升([\d.]+)%/, /效果至多叠加(\d+)层/), { categories: ['normal'] });
  stacks('tulaytullahsremembrance', 'normal-boost', 'damageBonus', 'tulaytullahsremembrance.normalBoostSteps', text => ({
    rate: scalar(text, /普通攻击造成的伤害每1秒提升([\d.]+)%/), cap: scalar(text, /至多通过上述效果提升至([\d.]+)%/),
  }), { categories: ['normal'] });
  stacks('verdict', 'seals', 'damageBonus', 'verdict.sealLayers',
    layers(/使元素战技造成的伤害提升([\d.]+)%/, /至多同时持有(\d+)枚/), { categories: ['skill'] });
  for (const suffix of ['skill', 'burst']) {
    stacks('wolffang', suffix + '-crit', 'critRate', 'wolffang.' + suffix + 'CritLayers',
      layers(suffix === 'skill' ? /元素战技的暴击率提升([\d.]+)%/ : /元素爆发的暴击率提升([\d.]+)%/, /至多叠加(\d+)次/),
      { categories: [suffix] });
  }

  const gate = (...keys) => Object.fromEntries(keys.map(key => [key, true]));
  const reactionElements = { bloom: 'dendro', hyperbloom: 'dendro', burgeon: 'dendro', superconduct: 'cryo', 'electro-charged': 'electro', swirl: 'hydro' };
  const reaction = (family, reactionId = family) => ({ family, reactionId, element: reactionElements[reactionId] });
  const window = (entity, ...keys) => ({ gates: gate(...keys.map(key => entity + '.' + key)) });
  const lunar = ['lunar-charged', 'lunar-crystallize', 'lunar-bloom'].map(id => reaction(id));
  const blooms = ['bloom', 'hyperbloom', 'burgeon'].map(id => reaction('transformative', id));
  const stars = ['stellar-conduct', 'stellar-swirl'];
  const event = (id, kind, timeMs, details) => ({ id, kind, actorId: 'actor', targetIds: kind === 'hit' ? ['enemy'] : [],
    timeMs, order: 0, sourceEventIds: [], facts: {}, ...details });
  const cast = [event('cast', 'action', 0, { skillId: 'kaeya.skill', category: 'skill' })];

  for (const [stat, pattern] of [['critDamage', /暴击伤害提高([\d.]+)%/], ['attackPercent', /攻击力提升([\d.]+)%/]]) {
    fixed('athousandblazingsuns', 'scorching-brilliance', stat, text => scalar(text, pattern), window('athousandblazingsuns', 'scorchingBrilliance'));
    fixed('athousandblazingsuns', 'nightsoul-' + stat, stat,
      text => scalar(text, pattern) * scalar(text, /「焚光」效果提高([\d.]+)%/),
      { ...window('athousandblazingsuns', 'scorchingBrilliance', 'nightsoulBlessing'), holder: 'mavuika' });
  }
  for (const family of stars) fixed('breezebornerefrain', family, 'reaction.' + family + '.damageBonus',
    text => scalar(text, /所有角色造成的星烁反应伤害提升([\d.]+)%/),
    { ...window('breezebornerefrain', 'snakeVenom'), role: 'team', reactions: [reaction(family)] });
  fixed('clashofkings', 'chess-law', 'attackPercent', text => scalar(text, /攻击力提升([\d.]+)%/), window('clashofkings', 'chess-lawActive'));
  fixed('clashofkings', 'chess-law', 'elementalMastery', text => amount(text, /元素精通提升([\d.]+)点/), window('clashofkings', 'chess-lawActive'));
  for (const [name, pattern, categories] of [
    ['no-pardon', /普通攻击与重击伤害提升([\d.]+)%/, ['normal', 'charged']],
    ['no-healing', /元素战技与元素爆发伤害提升([\d.]+)%/, ['skill', 'burst']],
  ]) {
    fixed('disasterandremorse', name, 'damageBonus', text => scalar(text, pattern),
      { ...window('disasterandremorse', name + 'Window'), categories });
    fixed('disasterandremorse', name + '-hexerei', 'damageBonus',
      text => scalar(text, pattern) * scalar(text, /上述所有伤害提升效果提升([\d.]+)%/),
      { ...window('disasterandremorse', name + 'Window', 'hexerei'), categories });
  }
  fixed('fracturedhalo', 'cast-attack', 'attackPercent', text => scalar(text, /攻击力提升([\d.]+)%/),
    { events: [event('cast', 'action', 0, { skillId: 'xiangling.skill', category: 'skill' })] });
  fixed('fracturedhalo', 'electro-edict', 'reaction.lunar.damageBonus', text => scalar(text, /月感电反应造成的伤害提升([\d.]+)%/),
    { ...window('fracturedhalo', 'electro-edictActive'), role: 'team', reactions: [lunar[0]] });
  fixed('frostbreath', 'related-reaction', 'attackPercent', text => scalar(text, /装备者的攻击力提升([\d.]+)%/),
    window('frostbreath', 'related-reactionActive'));
  fixed('gestofthemightywolf', 'attack-speed', 'normalAttackSpeed', text => scalar(text, /^攻击速度提升([\d.]+)%/));
  for (const party of ['gift', 'mischief']) for (const [type, stat, pattern, reactions] of [
    ['geo', 'geoBonus', /岩元素伤害提升([\d.]+)%/],
    ['lunar', 'reaction.lunar.damageBonus', /月结晶反应伤害提升([\d.]+)%/, [lunar[1]]],
  ]) {
    const others = party === 'mischief';
    fixed('goldenfrostboundoath', party + '-' + type, stat,
      text => scalar(others ? text.split('恶戏」效果：')[1] : text.split('；')[0], pattern),
      { ...window('goldenfrostboundoath', 'frostFairyGift', ...(others ? ['moonCage'] : [])),
        reactions, ...(others ? { role: 'team', recipient: 'peer0', other: ['albedo'] } : {}) });
  }
  for (const [state, pattern] of [['minimum', /获得最低([\d.]+)%/], ['maximum', /最高([\d.]+)%的攻击力/]]) {
    fixed('hereticsmoltenblade', 'first-light-' + state, 'attackPercent', text => scalar(text, pattern),
      { gates: { 'hereticsmoltenblade.firstLightState': state === 'minimum' ? '最低加成' : '最高加成' },
        inactive: '无效果', onFieldOnly: true });
  }
  fixed('hymnofthemaelstrom', 'healing', 'healingBonus', text => scalar(text, /治疗加成提升([\d.]+)%/));
  fixed('kagotsurubeisshin', 'wind-attack', 'attackPercent', text => scalar(text, /并且使攻击力提升([\d.]+)%/),
    window('kagotsurubeisshin', 'wind-attackActive'));
  fixed('mountainbracingbolt', 'skill', 'damageBonus', text => scalar(text, /元素战技造成的伤害提升([\d.]+)%/),
    { categories: ['skill'] });
  fixed('mountainbracingbolt', 'others-skill', 'damageBonus', text => scalar(text, /元素战技造成的伤害还会提升([\d.]+)%/),
    { ...window('mountainbracingbolt', 'others-skillActive'), categories: ['skill'] });
  for (const [suffix, stat, pattern, keys, reactions] of [
    ['skill-mastery', 'elementalMastery', /「终北圣言」效果：元素精通提升([\d.]+)点/, ['skillWindow']],
    ['lunar-mastery', 'elementalMastery', /「朔月诗篇」效果：元素精通提升([\d.]+)点/, ['lunarWindow']],
    ['bloom', 'reaction.transformative.damageBonus', /所有角色触发的绽放反应造成的伤害提升([\d.]+)%/, ['skillWindow', 'lunarWindow'], [blooms[0]]],
    ['other-blooms', 'reaction.transformative.damageBonus', /超绽放、烈绽放反应造成的伤害提升([\d.]+)%/, ['skillWindow', 'lunarWindow'], blooms.slice(1)],
    ['lunar-bloom', 'reaction.lunar.damageBonus', /月绽放反应伤害提升([\d.]+)%/, ['skillWindow', 'lunarWindow'], [lunar[2]]],
  ]) fixed('nightweaverslookingglass', suffix, stat,
    text => reactions ? scalar(text, pattern) : amount(text, pattern),
    { ...window('nightweaverslookingglass', ...keys), ...(reactions ? { role: 'team', reactions } : {}) });
  fixed('nocturnescurtaincall', 'wine-hp', 'hpPercent', text => scalar(text, /生命值上限进一步提高([\d.]+)%/),
    window('nocturnescurtaincall', 'divineWine'));
  fixed('nocturnescurtaincall', 'wine-lunar-crit', 'critDamage', text => scalar(text, /月曜反应伤害的暴击伤害提升([\d.]+)%/),
    { ...window('nocturnescurtaincall', 'divineWine'), reactions: lunar });
  fixed('primordialjadewingedspear', 'eagle-damage', 'damageBonus', text => scalar(text, /满层状态时伤害提升([\d.]+)%/),
    { gates: { 'primordialjadewingedspear.eagleLayers': 7 }, inactive: 6 });
  fixed('prospectorsshovel', 'electro-charged', 'reaction.transformative.damageBonus', text => scalar(text, /^感电反应造成的伤害提升([\d.]+)%/),
    { reactions: [reaction('transformative', 'electro-charged')] });
  fixed('prospectorsshovel', 'lunar-charged', 'reaction.lunar.damageBonus', text => scalar(text, /，月感电反应造成的伤害提升([\d.]+)%/),
    { reactions: [lunar[0]] });
  fixed('prospectorsshovel', 'lunar-charged-full', 'reaction.lunar.damageBonus', text => scalar(text, /月感电反应造成的伤害额外提升([\d.]+)%/),
    { gates: { fullMoonsign: true }, reactions: [lunar[0]] });
  for (const [stat, pattern] of [['movementSpeed', /提升([\d.]+)%移动速度/], ['attackPercent', /与([\d.]+)%攻击力/]]) {
    fixed('prototypecrescent', 'weak-point', stat, text => scalar(text, pattern), window('prototypecrescent', 'weakPointWindow'));
  }
  for (const [suffix, stat, pattern, state] of [
    ['secret', 'elementalMastery', /元素精通提升([\d.]+)点/, 'secretWindow'],
    ['moon', 'critDamage', /暴击伤害提升([\d.]+)%/, 'truthfulMoonWindow'],
  ]) {
    const value = text => stat === 'elementalMastery' ? amount(text, pattern) : scalar(text, pattern);
    fixed('reliquaryoftruth', suffix, stat, value, window('reliquaryoftruth', state));
    fixed('reliquaryoftruth', 'simultaneous', stat, text => value(text) * scalar(text, /这些效果分别提升([\d.]+)%/),
      window('reliquaryoftruth', 'secretWindow', 'truthfulMoonWindow'));
  }
  fixed('starcallerswatch', 'mastery', 'elementalMastery', text => amount(text, /元素精通提升([\d.]+)点/));
  check('starcallerswatch', 'night-mirror', 'damageBonus', { role: 'team', holder: 'lanyan' }, text => {
    const value = scalar(text, /角色对附近的敌人造成的伤害提升([\d.]+)%/);
    const key = 'starcallerswatch.night-mirrorActive';
    const facts = { [key]: true };
    return [caseWithFacts(facts, value), caseWithFacts(facts, 0, { other: ['barbara'], recipient: 'peer0' }),
      caseWithFacts(facts, value, { other: ['barbara'], recipient: 'peer0', onField: 'peer0' }),
      caseWithFacts(facts, 0, { other: ['barbara'], onField: 'peer0' }), caseWithFacts({ [key]: false }, 0)];
  });
  fixed('starsealededict', 'crystal-mastery', 'elementalMastery', text => amount(text, /元素精通提升([\d.]+)点/),
    window('starsealededict', 'crystalWindow'));
  fixed('symphonistofscents', 'off-field-attack', 'attackPercent', text => scalar(text, /攻击力额外提升([\d.]+)%/),
    { other: ['barbara'], onField: 'peer0', offField: true });
  fixed('symphonistofscents', 'recital-owner', 'attackPercent', text => scalar(text, /攻击力提升([\d.]+)%，持续3秒/), window('symphonistofscents', 'recitalWindow'));
  check('symphonistofscents', 'recital-others', 'attackPercent', { role: 'team', holder: 'escoffier' }, text => {
    const value = scalar(text, /攻击力提升([\d.]+)%，持续3秒/), key = 'symphonistofscents.recitalRecipient';
    const other = ['barbara', 'amber'];
    return [caseWithFacts({}, value, { other, recipient: 'peer0', recipientFacts: { [key]: bool(true) } }),
      caseWithFacts({}, 0, { other, recipient: 'peer1' }), caseWithFacts({}, 0, { other, recipient: 'peer0' }),
      caseWithFacts({}, 0, { other, recipientFacts: { [key]: bool(true) } })];
  });
  fixed('thealleyflash', 'undamaged', 'damageBonus', text => scalar(text, /角色造成的伤害提升([\d.]+)%/), window('thealleyflash', 'undamagedActive'));
  fixed('toukaboushigure', 'cursed-target', 'damageBonus', text => scalar(text, /造成的伤害提升([\d.]+)%/),
    { targetFacts: { 'toukaboushigure.cursed': bool(true) } });
  fixed('ultimateoverlordsmegamagicsword', 'melusine-support', 'attackPercent', text => scalar(text, /攻击力至多进一步提升([\d.]+)%/),
    { gates: { 'ultimateoverlordsmegamagicsword.melusineSupportState': '满额声援' }, inactive: '无声援' });
  fixed('waveridingwhirl', 'whirl-hp', 'hpPercent', text => scalar(text, /生命值上限提升([\d.]+)%/), window('waveridingwhirl', 'whirlWindow'));
  check('waveridingwhirl', 'hydro-hp', 'hpPercent', { holder: 'lisa' }, text => {
    const cap = scalar(text, /至多通过这种方式提升([\d.]+)%/);
    const rate = scalar(text, /生命值上限将进一步提升([\d.]+)%/), active = 'waveridingwhirl.whirlWindow';
    return [[], ['barbara'], ['barbara', 'xingqiu'], ['barbara', 'xingqiu', 'mona']].map((other, count) =>
      caseWithFacts({ [active]: true }, Math.min(count * rate, cap), { other })).concat(
      caseWithFacts({ [active]: true }, rate, { holder: 'barbara' }),
      caseWithFacts({ [active]: false }, 0, { other: ['barbara'] }),
      caseWithFacts({ [active]: true }, 0, { other: ['barbara'], recipient: 'peer0' }));
  });
  fixed('wineandsong', 'dash', 'attackPercent', text => scalar(text, /攻击力提升([\d.]+)%/), window('wineandsong', 'dashActive'));
  fixed('wolfsgravestone', 'low-target-hit', 'attackPercent', text => scalar(text, /所有成员的攻击力提高([\d.]+)%/),
    { ...window('wolfsgravestone', 'low-target-hitActive'), role: 'team' });

  for (const slot of [1, 2, 3]) {
    check('jadevista', 'mastery' + slot, 'elementalMastery', { holder: 'amber' }, text => {
      const amountPerMember = amount(text, /元素精通提升([\d.]+)点/);
      const party = ['bennett', 'klee', 'xiangling'];
      return [0, 1, 2, 3].map(count => caseWithFacts({}, count === slot ? count * amountPerMember : 0,
        { other: party.slice(0, count) })).concat(caseWithFacts({}, 0, { other: party.slice(0, slot), recipient: 'peer0' }));
    });
    exactLayers('newbough', 'verdure-mastery-' + slot, 'elementalMastery', 'newbough.verdureLayers', slot,
      text => amount(text, /元素精通提升([\d.]+)点/), { gates: { 'newbough.stellarGleam': false } });
    for (const entity of ['portablepowersaw', 'thedockhandsassistant']) {
      exactLayers(entity, 'stoic-mastery-' + slot, 'elementalMastery', entity + '.consumedMarks', slot,
        text => amount(text, /每枚消耗的坚忍标记提高([\d.]+)点元素精通/));
    }
    exactLayers('starsealededict', 'torch-mastery-' + slot, 'elementalMastery', 'starsealededict.torchLayers', slot,
      text => amount(text, /元素精通进一步提升([\d.]+)点/), window('starsealededict', 'crystalWindow'));
  }
  check('jadevista', 'attack', 'attackPercent', { holder: 'amber' }, text => {
    const gain = scalar(text, /装备者的攻击力提升([\d.]+)%/);
    const party = ['barbara', 'kaeya', 'noelle'];
    return [0, 1, 2, 3].map(count => caseWithFacts({}, gain * count, { other: party.slice(0, count) }))
      .concat(caseWithFacts({}, 0, { other: party, recipient: 'peer0' }));
  });
  for (const [suffix, pattern, stellarGleam] of [
    ['verdure-atk', /攻击力提升([\d.]+)%，元素精通/, false], ['gleam-atk', /效果改为攻击力提升([\d.]+)%/, true],
  ]) stacks('newbough', suffix, 'attackPercent', 'newbough.verdureLayers',
    layers(pattern, /至多叠加(\d+)层/), { gates: { 'newbough.stellarGleam': stellarGleam }, checkOverCap: false });
  for (const family of stars) stacks('newbough', family, 'reaction.' + family + '.damageBonus', 'newbough.verdureLayers',
    layers(/星烁反应伤害提升([\d.]+)%/, /至多叠加(\d+)层/),
    { gates: { 'newbough.stellarGleam': true }, family, reactionId: family, checkOverCap: false });
  stacks('starsealededict', 'torch-crit', 'critDamage', 'starsealededict.torchLayers',
    layers(/暴击伤害提升([\d.]+)%。\n装备者/, /至多叠加(\d+)层/),
    { gates: gate('starsealededict.crystalWindow', 'starsealededict.stellarConduct'), family: 'stellar-conduct', reactionId: 'stellar-conduct' });
  stacks('fruitoffulfillment', 'wane-attack', 'attackPercent', 'fruitoffulfillment.waxAndWaneLayers',
    layers(/攻击力降低([\d.]+)%/, /至多叠加(\d+)层/, () => -1), { checkOverCap: false });
  for (const category of ['normal', 'skill', 'burst']) {
    stacks('thedaybreakchronicles', 'audience-' + category, 'damageBonus', 'thedaybreakchronicles.' + category + 'Layers', text => ({
      rate: scalar(text, /对应类别的伤害提升效果提升([\d.]+)%/),
      cap: scalar(text, /直到提升至([\d.]+)%/),
    }), { categories: [category] });
  }
  stacks('predator', 'cryo-damage', 'damageBonus', 'predator.playStationCryoLayers',
    layers(/普通攻击与重击造成的伤害提高([\d.]+)%/, /至多叠加(\d+)次/), { categories: ['normal', 'charged'], holder: 'aloy', checkOverCap: false });
  fixed('predator', 'aloy-platform', 'flatAttack', text => amount(text, /埃洛伊装备掠食者时，攻击力提升([\d.]+)点/),
    { holder: 'aloy', ...window('predator', 'aloy-platformActive') });

  for (const [entity, suffix, stat, factKey, division, readRate, readCap, family] of [
    ['finaleofthedeep', 'cleared-bond-attack', 'flatAttack', 'clearedBond', 1,
      /基于清除值的([\d.]+)%/, /提升至多([\d.]+)点攻击力/],
    ['flowingpurity', 'cleared-bond-elements', 'damageBonus', 'clearedBond', 1000,
      /每清除1000点将会提供([\d.]+)%/, /至多通过这种方式获得([\d.]+)%/, elements],
  ]) {
    check(entity, suffix, stat, {}, text => {
      const rate = scalar(text, readRate), cap = amount(text, readCap) * (stat === 'damageBonus' ? 0.01 : 1);
      const factKeyFull = entity + '.' + factKey;
      const upper = Math.ceil(cap * division / rate);
      const cases = [0, 1500, 3500, upper, upper + 2000].map(measured => caseWithFacts({ [factKeyFull]: measured },
        Math.min(cap, measured / division * rate), { element: family?.[0] }));
      cases.push(caseWithFacts({ [factKeyFull]: 1500 }, 0, { other: ['barbara'], recipient: 'peer0', element: family?.[0] }));
      if (family) cases.push(caseWithFacts({ [factKeyFull]: 1500 }, 0, { element: 'physical' }));
      return cases;
    });
  }
  for (const [entity, active, stat, ratio] of [
    ['makhairaaquamarine', 'desertLegacy', 'flatAttack', /元素精通的([\d.]+)%/],
    ['wanderingevenstar', 'evenstarActive', 'flatAttack', /元素精通的([\d.]+)%/],
    ['xiphosmoonlight', 'moonlightActive', 'energyRecharge', /提升([\d.]+)%元素充能效率/],
  ]) for (const others of [false, true]) {
    const suffix = (others ? 'team-' : 'owner-') + (stat === 'flatAttack' ? 'attack' : 'recharge');
    check(entity, suffix, stat, { role: others ? 'team' : 'owner' }, text => {
      const value = scalar(text, ratio) * (others ? scalar(text, /基于该提升的([\d.]+)%/) : 1);
      const build = { other: ['barbara'], recipient: others ? 'peer0' : 'actor' };
      const facts = (mastery, on) => ({ [entity + '.' + active]: on, [entity + '.masteryAtUpdate']: mastery });
      const cases = [0, 120, 640].map(mastery => caseWithFacts(facts(mastery, true), value * mastery, build));
      cases.push(caseWithFacts(facts(120, false), 0, build),
        caseWithFacts(facts(120, true), 0, { ...build, recipient: others ? 'actor' : 'peer0' }));
      return cases;
    });
  }
  for (const layers of [1, 2, 3, 'team']) {
    const team = layers === 'team';
    const entity = 'keyofkhajnisut', holder = 'kaeya';
    check(entity, team ? 'grand-hymn-team' : 'hymn-' + layers, 'elementalMastery',
      { holder, role: team ? 'team' : 'owner', sources: buildStatsSources(holder, entity) }, text => {
        const hp = whiteStat(holder, 'hp') * (1 + weaponStat(entity, 'hp') + scalar(text, /^生命值提升([\d.]+)%/));
        const percent = team ? /将基于装备者生命值上限的([\d.]+)%/ : /基于装备者生命值上限的([\d.]+)%/;
        const rate = scalar(text, percent) * (team ? 1 : layers);
        const facts = (slot, active) => ({ [entity + '.grandHymnLayers']: slot, [entity + '.grand-hymn-teamActive']: active });
        const cases = [0, 3000].flatMap(added => {
          const inputs = { flatHp: number('hp', added) };
          return team ? [
            caseWithFacts(facts(3, true), (hp + added) * rate, { inputs }),
            caseWithFacts(facts(3, true), (hp + added) * rate, { inputs, other: ['amber'], recipient: 'peer0' }),
            caseWithFacts(facts(2, false), 0, { inputs, other: ['amber'], recipient: 'peer0' }),
          ] : [0, 1, 2, 3].map(slot => caseWithFacts(facts(slot, false), slot === layers ? (hp + added) * rate : 0, { inputs }));
        });
        if (!team) cases.push(caseWithFacts(facts(layers, false), 0, { other: ['amber'], recipient: 'peer0' }));
        return cases;
      });
  }
  const leader = 'angelosheptades', wielder = 'lanyan';
  for (const frontline of [true, false]) {
    check(leader, frontline ? 'leading-light' : 'leading-light-backstage', 'damageBonus',
      { role: 'team', holder: wielder, sources: buildStatsSources(wielder, leader) }, text => {
        const attack = (whiteStat(wielder, 'attack') + weaponsSource[leader].stats.base.attack)
          * (1 + weaponStat(leader, 'attack') + scalar(text, /^攻击力提升([\d.]+)%/));
        const rate = scalar(text, /每1000点攻击力都会使队伍中自己的当前场上角色造成的伤害提升([\d.]+)%/);
        const cap = scalar(text, /至多提升([\d.]+)%/);
        const factor = frontline ? 1 : scalar(text, /也能获得「先导之光」中([\d.]+)%/);
        const active = leader + '.leading-lightActive', hexerei = leader + '.hexereiRecipient';
        const settings = { other: ['sucrose', 'barbara'], recipient: 'peer0', onField: frontline ? 'peer0' : 'actor',
          recipientFacts: { [hexerei]: bool(!frontline) } };
        const cases = [0, 1000, 3000].map(added => caseWithFacts({ [active]: true }, Math.min((attack + added) / 1000 * rate, cap) * factor,
          { ...settings, inputs: { flatAttack: number('attack', added) } }));
        cases.push(caseWithFacts({ [active]: false }, 0, settings), caseWithFacts({ [active]: true }, 0,
          { ...settings, onField: frontline ? 'actor' : 'peer0' }));
        if (!frontline) cases.push(caseWithFacts({ [active]: true }, 0, { ...settings, recipient: 'peer1', recipientFacts: { [hexerei]: bool(false) } }));
        else cases.push(caseWithFacts({ [active]: true }, Math.min(attack / 1000 * rate, cap)));
        return cases;
      });
  }
  check('peakpatrolsong', 'ode-team', 'damageBonus', { holder: 'albedo', role: 'team', sources: buildStatsSources('albedo', 'peakpatrolsong') }, text => {
    const entity = 'peakpatrolsong';
    const defense = whiteStat('albedo', 'defense') * (1 + weaponStat(entity, 'defense') + 2 * scalar(text, /防御力提高([\d.]+)%/));
    const rate = scalar(text, /所有元素伤害加成提高([\d.]+)%/), cap = scalar(text, /至多提高([\d.]+)%/);
    const facts = active => ({ [entity + '.odeLayers']: 2, [entity + '.ode-teamActive']: active });
    const cases = [0, 1500, 3250].flatMap(added => ['actor', 'peer0'].map(recipient => caseWithFacts(facts(true),
      Math.min(cap, (defense + added) / 1000 * rate),
      { inputs: { flatDefense: number('defense', added) }, element: 'geo', other: ['barbara'], recipient })));
    cases.push(caseWithFacts(facts(false), 0, { element: 'geo' }), caseWithFacts(facts(true), 0, { element: 'physical' }));
    return cases;
  });
  for (const [suffix, stat, read, wanted, gleam, family] of [
    ['cryo-mastery', 'elementalMastery', text => amount(text, /装备者的元素精通提升([\d.]+)点/), 'cryo', false],
    ['electro-attack', 'attackPercent', text => scalar(text, /装备者的攻击力提升([\d.]+)%/), 'electro', false],
    ['gleam-mastery', 'elementalMastery', text => amount(text, /装备者的元素精通提升([\d.]+)点/, 1), 'both', true],
    ...stars.map(family => [family, 'reaction.' + family + '.damageBonus', text => scalar(text, /造成的星烁反应伤害提升([\d.]+)%/), 'both', true, family]),
  ]) check('wintersheavyheart', suffix, stat, { holder: 'sucrose' }, text => {
    const value = read(suffix === 'gleam-mastery' ? text.split('辉映·星烁：')[1] : text);
    const key = 'wintersheavyheart.stellarGleam', hit = family ? reaction(family) : {};
    const parties = [[], ['kaeya'], ['fischl'], ['kaeya', 'fischl'], ['kaeya', 'charlotte', 'fischl']];
    const cases = parties.map(other => {
      const count = other.filter(id => (id === 'fischl' ? wanted !== 'cryo' : wanted !== 'electro')).length;
      return caseWithFacts({ [key]: gleam }, count * value, { ...hit, other });
    });
    cases.push(caseWithFacts({ [key]: !gleam }, 0, { ...hit, other: parties[3] }),
      caseWithFacts({ [key]: gleam }, 0, { ...hit, other: parties[3], recipient: 'peer0' }));
    if (family) cases.push(caseWithFacts({ [key]: gleam }, 0, { other: parties[3] }));
    return cases;
  });
  for (const [suffix, stat, read, min] of [
    ['eligible-attack', 'attackPercent', text => scalar(text, /获得([\d.]+)%攻击力提升/), false],
    ['three-members', 'elementalMastery', text => amount(text, /元素精通提升([\d.]+)点/), true],
  ]) check('chainbreaker', suffix, stat, { holder: 'amber' }, text => {
    const key = 'chainbreaker.eligibleMembers', rate = read(text), floor = amount(text, /不少于(\d+)名/);
    const others = ['kaeya', 'barbara', 'mavuika'];
    const cases = [0, 1, 2, 3].map(count => caseWithFacts({ [key]: count }, min ? (count >= floor ? rate : 0) : count * rate,
      { other: others.slice(0, count) }));
    cases.push(caseWithFacts({ [key]: 3 }, 0, { other: others, recipient: 'peer0' }));
    return cases;
  });
  check('staffofthescarletsands', 'mastery-attack', 'flatAttack', {}, text => {
    const rate = scalar(text, /基于装备者元素精通的([\d.]+)%/);
    const inputs = mastery => ({ elementalMastery: number('elementalMastery', mastery) });
    return [0, 160, 640].map(mastery => caseWithFacts({}, mastery * rate, { inputs: inputs(mastery) })).concat(
      caseWithFacts({}, 0, { inputs: inputs(160), other: ['barbara'], recipient: 'peer0' }));
  });

  for (const [entity, element] of [['lavawalker', 'pyro'], ['thundersoother', 'electro']]) {
    fixed(entity, '4', 'damageBonus', text => scalar(text, /敌人造成的伤害提升([\d.]+)%/),
      { pieces: 4, targetFacts: { ['aura.' + element]: bool(true) } });
  }
  fixed('disenchantmentindeepshadow', 'superconduct', 'reaction.transformative.damageBonus',
    text => scalar(text, /^超导反应造成的伤害提升([\d.]+)%/), { pieces: 4, reactions: [reaction('transformative', 'superconduct')] });
  fixed('disenchantmentindeepshadow', 'stellar-conduct', 'reaction.stellar-conduct.damageBonus',
    text => scalar(text, /星超导反应造成的伤害提升([\d.]+)%/), { pieces: 4, reactions: [reaction('stellar-conduct')] });
  fixed('disenchantmentindeepshadow', 'conditioned-crit', 'critRate', text => scalar(text, /本次攻击的暴击率提高([\d.]+)%/),
    { pieces: 4, ...window('disenchantmentindeepshadow', 'conductAffected') });
  fixed('flowerofparadiselost', 'bloom', 'reaction.transformative.damageBonus', text => scalar(text, /烈绽放反应造成的伤害提升([\d.]+)%/),
    { pieces: 4, reactions: blooms });
  fixed('flowerofparadiselost', 'lunar-bloom', 'reaction.lunar.damageBonus', text => scalar(text, /月绽放反应伤害提升([\d.]+)%/),
    { pieces: 4, reactions: [lunar[2]] });
  fixed('martialartist', 'after-cast', 'damageBonus', text => scalar(text, /普通攻击和重击造成的伤害提升([\d.]+)%/),
    { pieces: 4, categories: ['normal', 'charged'], events: cast });
  fixed('nighttimewhispersintheechoingwoods', 'skill-geo', 'geoBonus', text => scalar(text, /岩元素伤害加成提升([\d.]+)%/),
    { pieces: 4, ...window('nighttimewhispersintheechoingwoods', 'skillWindow') });
  fixed('nighttimewhispersintheechoingwoods', 'crystallize-geo', 'geoBonus',
    text => scalar(text, /岩元素伤害加成提升([\d.]+)%/) * scalar(text, /上述效果提高([\d.]+)%/),
    { pieces: 4, ...window('nighttimewhispersintheechoingwoods', 'skillWindow', 'crystallizeWindow') });
  fixed('shimenawasreminiscence', 'energy-spent', 'damageBonus', text => scalar(text, /下落攻击造成的伤害提高([\d.]+)%/),
    { pieces: 4, categories: ['normal', 'charged', 'plunge'], inactive: 14,
      gates: { 'shimenawasreminiscence.energy-spentActive': true, 'shimenawasreminiscence.energyAtCast': 15 } });
  fixed('vermillionhereafter', 'nascent-light', 'attackPercent', text => scalar(text, /攻击力提升([\d.]+)%/),
    { pieces: 4, modifier: 0, ...window('vermillionhereafter', 'nascentLight') });
  stacks('vermillionhereafter', 'nascent-light', 'attackPercent', 'vermillionhereafter.hpLossLayers',
    layers(/攻击力进一步提升([\d.]+)%/, /至多通过这种方式提升(\d+)次/),
    { pieces: 4, modifier: 1, gates: gate('vermillionhereafter.nascentLight'), checkOverCap: false });
  stacks('huskofopulentdreams', 'curiosity', 'defensePercent', 'huskofopulentdreams.curiosityLayers',
    layers(/每层能提供([\d.]+)%防御力/, /问答至多叠加(\d+)层/), { pieces: 4, holder: 'albedo', checkOverCap: false });
  stacks('huskofopulentdreams', 'curiosity', 'geoBonus', 'huskofopulentdreams.curiosityLayers',
    layers(/防御力与([\d.]+)%岩元素伤害加成/, /问答至多叠加(\d+)层/), { pieces: 4, holder: 'albedo', checkOverCap: false });
  stacks('longnightsoath', 'everlasting-radiance', 'damageBonus', 'longnightsoath.radianceLayers',
    layers(/下落攻击造成的伤害提升([\d.]+)%/, /至多叠加(\d+)层/), { pieces: 4, categories: ['plunge'], checkOverCap: false });
  stacks('unfinishedreverie', 'burning-context', 'damageBonus', 'unfinishedreverie.burningLayers', text => ({
    rate: scalar(text, /存在处于燃烧状态下的敌人时，每秒提升([\d.]+)%/),
    cap: scalar(text, /直到达到([\d.]+)%/),
  }), { pieces: 4, checkOverCap: false });
  fixed('obsidiancodex', 'damageBonus', 'damageBonus', text => scalar(text, /造成的伤害提高([\d.]+)%/),
    { pieces: 2, holder: 'mavuika', gates: { nightsoul: true }, onFieldOnly: true });
  for (const [stat, source, suffix] of [
    ['attackPercent', text => scalar(text, /攻击力提升([\d.]+)%/), 'sameElements'],
    ['elementalMastery', text => amount(text, /元素精通提升([\d.]+)点/), 'differentElements'],
  ]) check('gildeddreams', 'gilded', stat, { pieces: 4, holder: 'kaeya' }, text => {
    const gain = source(text);
    const max = amount(text, /每类效果至多计算(\d+)个角色/);
    const window = 'gildeddreams.reactionWindow';
    const members = suffix === 'sameElements' ? ['rosaria', 'diona', 'charlotte'] : ['amber', 'barbara', 'fischl'];
    const cases = [0, 1, 2, max].map(n => caseWithFacts({ [window]: true }, n * gain, { other: members.slice(0, n) }));
    cases.push(caseWithFacts({ [window]: false }, 0, { other: members.slice(0, 2) }),
      caseWithFacts({ [window]: true }, 0, { other: members.slice(0, 2), recipient: 'peer0' }),
      caseWithFacts({ [window]: true }, 0, { other: members.slice(0, 2), pieces: 3 }));
    return cases;
  });
  check('songofdayspast', 'waves', 'baseDamageBonus', { holder: 'kaeya', pieces: 4, role: 'team' }, text => {
    const value = scalar(text, /所记录的回复量的([\d.]+)%/), maximum = amount(text, /至多记录(\d+)点/);
    const key = 'songofdayspast.recordedHealing';
    const cases = [0, 6000, maximum].flatMap(healing => ['actor', 'peer0'].map(recipient =>
      caseWithFacts({ [key]: healing }, value * healing, { other: ['barbara'], recipient, onField: recipient })));
    cases.push(caseWithFacts({ [key]: 6000 }, 0, { other: ['barbara'], recipient: 'peer0' }),
      caseWithFacts({ [key]: 6000 }, 0, { pieces: 3 }));
    return cases;
  });

  function triggered(entity, suffix, stat, read, trigger, options = {}) {
    check(entity, suffix, stat, options, text => {
      const { gain, maximum = 1, spacing = 1000, duration } = read(text);
      const { categories, hit = {}, inputs = {}, unset, holder = defaultHolder[weapons.get(entity)?.weaponType] ?? 'kaeya' } = options;
      const settings = { category: categories?.[0], ...hit, inputs, unset };
      const eventsAt = count => Array.from({ length: count }, (_, i) => trigger('trigger' + i, i * spacing, holder));
      const cases = [...new Set([0, 1, 2, maximum, maximum + 1])].map(count => caseWithFacts({}, Math.min(count, maximum) * gain,
        { ...settings, events: eventsAt(count), time: Math.max(1, (count - 1) * spacing + 1) }));
      cases.push(caseWithFacts({}, 0, { ...settings, events: eventsAt(1), time: duration }),
        caseWithFacts({}, 0, { ...settings, events: eventsAt(1), other: ['barbara'], recipient: 'peer0' }));
      for (const category of categories?.slice(1) ?? []) cases.push(caseWithFacts({}, gain, { ...settings, events: eventsAt(1), category }));
      if (categories) cases.push(caseWithFacts({}, 0, { ...settings, events: eventsAt(1), category: ['normal', 'skill', 'plunge'].find(category => !categories.includes(category)) }));
      if (options.pieces) cases.push(caseWithFacts({}, 0, { ...settings, events: eventsAt(1), pieces: options.pieces - 1 }));
      return cases;
    });
  }
  const hpChange = (id, time) => event(id, 'state-change', time, { facts: { hpRatioChange: number('scalar', -.1) } });
  const talentCast = (id, time, holder) => event(id, 'action', time, { category: 'skill', skillId: holder + '.skill' });
  const talentHit = category => (id, time) => event(id, 'hit', time, { category });
  const react = reactionId => (id, time) => event(id, 'reaction', time, { reactionId, targetIds: ['enemy'] });
  const duration = (text, pattern) => 1000 * amount(text, pattern);
  const timeAndStacks = (text, pattern, capPattern, timePattern) => ({
    gain: scalar(text, pattern), maximum: amount(text, capPattern), duration: duration(text, timePattern),
  });
  triggered('prototypestarglitter', 'cast-stacks', 'damageBonus',
    text => timeAndStacks(text, /伤害提高([\d.]+)%/, /最多叠加(\d+)层/, /持续(\d+)秒/), talentCast, { categories: ['normal', 'charged'] });
  for (const [stat, pattern] of [['attackPercent', /攻击力提升([\d.]+)%/], ['energyRecharge', /元素充能效率提升([\d.]+)%/]]) {
    triggered('sacrificersstaff', 'skill-stacks', stat,
      text => timeAndStacks(text, pattern, /至多叠加(\d+)层/, /命中敌人后的(\d+)秒内/), talentHit('skill'));
  }
  triggered('skyridergreatsword', 'normal-charged-attack', 'attackPercent',
    text => timeAndStacks(text, /攻击力提高([\d.]+)%/, /最多叠加(\d+)层/, /持续(\d+)秒/), talentHit('normal'));
  triggered('songofthevigil', 'stellar-attack', 'attackPercent', text => ({
    gain: scalar(text, /装备者的攻击力提升([\d.]+)%/), duration: duration(text, /触发星烁反应的(\d+)秒内/),
  }), react('stellar-conduct'));
  triggered('splendoroftranquilwaters', 'owner-hp-change', 'damageBonus',
    text => timeAndStacks(text, /元素战技造成的伤害提升([\d.]+)%/, /至多叠加(\d+)次/, /持续(\d+)秒/),
    hpChange, { categories: ['skill'] });
  triggered('staffofthescarletsands', 'scarlet-dream', 'flatAttack', text => ({
    gain: 240 * scalar(text.split('「赤沙之梦」效果：')[1], /基于装备者元素精通的([\d.]+)%/), maximum: amount(text, /至多叠加(\d+)层/),
    duration: duration(text, /持续(\d+)秒/),
  }), talentHit('skill'), { inputs: { elementalMastery: number('elementalMastery', 240) } });
  triggered('tomeoftheeternalflow', 'hp-change-charged', 'damageBonus',
    text => timeAndStacks(text, /重击造成的伤害提升([\d.]+)%/, /至多叠加(\d+)次/, /持续(\d+)秒/),
    hpChange, { categories: ['charged'] });
  triggered('marechausseehunter', 'hp-change', 'critRate',
    text => timeAndStacks(text, /暴击率提升([\d.]+)%/, /至多叠加(\d+)次/, /持续(\d+)秒/), hpChange, { pieces: 4 });
  triggered('crimsonwitchofflames', 'skill-pyro', 'pyroBonus', text => ({
    gain: scalar(setsSource.crimsonwitchofflames.effect2Pc, /获得([\d.]+)%火元素伤害加成/)
      * scalar(text, /2件套的效果提高([\d.]+)%/),
    maximum: amount(text, /最多叠加(\d+)次/), duration: duration(text, /施放元素战技后的(\d+)秒内/),
  }), talentCast, { pieces: 4, sources: [setReference('crimsonwitchofflames', 2)] });
  for (const [stat, pattern, hit] of [
    ['critRate', /暴击率提升([\d.]+)%/], ['reaction.stellar-swirl.damageBonus', /星扩散反应伤害提升([\d.]+)%/, reaction('stellar-swirl')],
  ]) triggered('scarletproof', 'stellar', stat, text => ({
    gain: scalar(text, pattern), duration: duration(text, /触发星扩散反应后的(\d+)秒内/),
  }), react('stellar-swirl'), { pieces: 4, hit, unset: ['scarletproof.stellarWindow'] });
  for (const [suffix, stat, pattern, hit] of [
    ['bloom-stacks', 'reaction.transformative.damageBonus', /烈绽放反应造成的伤害提升([\d.]+)%/, blooms[0]],
    ['lunar-stacks', 'reaction.lunar.damageBonus', /月绽放反应伤害提升([\d.]+)%/, lunar[2]],
  ]) triggered('flowerofparadiselost', suffix, stat, text => ({
    gain: scalar(text, pattern) * scalar(text, /上述效果带来的加成提升([\d.]+)%/),
    maximum: amount(text, /至多叠加(\d+)次/), duration: duration(text, /该效果持续(\d+)秒/),
  }), react('bloom'), { pieces: 4, hit, holder: 'nahida' });

  return output;
}
