import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit } from './roster-audit-settings.mjs';

const weaponsSource = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const setsSource = readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json', import.meta.url));
const ref = id => ({ id, namespace: 'builtin', revision: '1' });
const explicit = value => ({ value, provenance: 'explicit', sourceRefs: [] });
const flag = value => explicit({ kind: 'boolean', value });
const quantity = (unit, value) => explicit({ kind: 'quantity', unit, value });
const percent = match => Number(match?.[1] + 'e-2');

export function auditEquipmentCurrentFacts(entities, engine) {
  const rows = [], verified = new Set();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map(entities.sets.map(set => [set.id, set]));
  function record(entity, field, settings, value, expected) {
    rows.push({ entity, field, ...settings, value, expected,
      ...Number.isFinite(value) && Math.abs(value - expected) < 1e-8 ? {} : { issue: '装备当次属性或伤害与来源算式不符' } });
  }
  function check(entity, field, run) {
    const start = rows.length;
    run();
    if (rows.length > start && rows.slice(start).every(row => !row.issue)) verified.add(entity + field);
  }
  function prepare(build, peers = []) {
    const result = engine.prepareStructuredBuilds([{ id: 'actor', build }, ...peers]);
    if (!result.ok) throw Error(build.weapon.id + ' / ' + build.sets.map(set => set.id).join(',') + ' ' + JSON.stringify(result.diagnostics));
    const talent = build.character.talents[0];
    return { team: result.team, query: () => auditHit(build.character, talent, talent.hits[0]) };
  }
  function attribute(prepared, id, { category = 'normal', family = 'ordinary', reactionId = null, element = 'physical', recipient = 'actor', facts = {}, overrides = [], flatAttack } = {}) {
    const { setup, request } = prepared.query();
    const factOverrides = request.frame.factOverrides;
    for (const override of overrides) {
      const prior = factOverrides.find(entry => entry.subject.kind === override.subject.kind && entry.subject.id === override.subject.id);
      if (prior) Object.assign(prior.facts, override.facts);
      else factOverrides.push(override);
    }
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, facts,
      factOverrides, hit: { skillId: setup.events[0].skillId, hitId: request.hit.hitId, category, family, origin: 'talent', element, reactionId } };
    const context = engine.createStructuredCombatContext(prepared.team, setup);
    if (flatAttack !== undefined) context.actors[0].inputs.flatAttack = quantity('attack', flatAttack);
    const binding = { kind: 'attribute', key: ref(id), actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' } };
    const result = engine.evaluateCombatBindings(prepared.team.program, context, { value: binding }, frame).outputs.value;
    return result?.state === 'known' ? result.value.value : null;
  }

  const procs = [
    { id: 'ashgravendrinkinghorn', character: 'lisa', suffix: 'impact', basis: 'hp', ratio: /生命值上限的(\d+(?:\.\d+)?)%/ },
    { id: 'sequenceofsolitude', character: 'amber', suffix: 'impact', basis: 'hp', ratio: /生命值上限的(\d+(?:\.\d+)?)%/ },
    { id: 'crescentpike', character: 'xiangling', suffix: 'infusion-needle', ratio: /额外造成(\d+(?:\.\d+)?)%攻击力/ },
    { id: 'debateclub', character: 'noelle', suffix: 'blunt-conclusion', ratio: /额外造成(\d+(?:\.\d+)?)%攻击力/ },
    { id: 'filletblade', character: 'kaeya', suffix: 'gash', ratio: /造成(\d+(?:\.\d+)?)%攻击力/ },
    { id: 'halberd', character: 'xiangling', suffix: 'heavy', ratio: /造成(\d+(?:\.\d+)?)%攻击力/ },
    { id: 'prototypearchaic', character: 'noelle', suffix: 'crush', fact: 'triggered', ratio: /造成(\d+(?:\.\d+)?)%攻击力/ },
    { id: 'messenger', character: 'amber', suffix: 'archers-message', fact: 'arrowTriggered', ratio: /额外造成(\d+(?:\.\d+)?)%攻击力/, critical: true },
    { id: 'theflute', character: 'kaeya', suffix: 'harmonic', ratio: /造成(\d+(?:\.\d+)?)%攻击力/ },
    { id: 'theviridescenthunt', character: 'amber', suffix: 'cyclone', ratio: /造成(\d+(?:\.\d+)?)%攻击的伤害/ },
  ];
  function proc(prepared, weapon, suffix, fact, active, critMode, targetFacts) {
    const { setup, request } = prepared.query();
    const hitId = weapon.id + '.' + suffix;
    request.hit = { definition: { group: 'weapons', namespace: weapon.namespace, id: weapon.id, revision: weapon.revision }, hitId };
    request.critMode = critMode;
    request.frame.facts = { [weapon.id + '.' + fact]: flag(active) };
    if (targetFacts) request.frame.factOverrides.push({ subject: { kind: 'target', id: 'enemy' }, facts: targetFacts });
    const query = setup.events.find(event => event.id === request.frame.eventId);
    query.hitId = hitId;
    delete query.skillId;
    delete query.category;
    return engine.evaluateStructuredHit(prepared.team, setup, request);
  }
  function scaling(character, weapon, source, basis) {
    const white = character.attributes.base[basis] * character.progression.curves[basis][1] + character.progression.promotion[0][basis]
      + (basis === 'attack' ? source.stats.base.attack : 0);
    const base = white * (1 + (weapon.stat === basis + 'Percent' ? source.stats.base.specialized : 0));
    const physicalBonus = weapon.stat === 'physicalBonus' ? source.stats.base.specialized : 0;
    return base * (1 + physicalBonus) * .5 * .9;
  }
  for (const { id, character: characterId, suffix, fact = suffix + 'Triggered', ratio, basis = 'attack', critical = false } of procs) check(id, '/buffs', () => {
    if (!weapons.has(id) || !characters.has(characterId)) return;
    const character = characters.get(characterId), weapon = weapons.get(id), source = weaponsSource[id];
    const base = scaling(character, weapon, source, basis);
    const crit = 1 + character.attributes.base.critDamage + (weapon.stat === 'critDamage' ? source.stats.base.specialized : 0);
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(character, weapon), refinement: rank });
      const text = source.metadata['r' + rank].description;
      for (const active of [false, true]) for (const critMode of critical ? ['noncritical', 'critical', 'expected'] : ['noncritical']) {
        const result = proc(prepared, weapon, suffix, fact, active, critMode);
        const value = result.totals.all.value?.value ?? null;
        // Equal level, physical proc against the standard 10% resistance setting.
        const expected = active ? base * percent(text.match(ratio)) * (critical ? crit : 1) : 0;
        record(id, '/hits/' + id + '.' + suffix, { rank, active, critMode, family: 'ordinary', category: null, element: 'physical',
          ...value === null && result.diagnostics.length ? { diagnostics: result.diagnostics } : {} }, value, expected);
      }
    }
  });

  for (const [id, characterId] of [['dragonspinespear','xiangling'], ['frostbearer','lisa'], ['snowtombedstarsilver','noelle']]) check(id, '/buffs', () => {
    if (!weapons.has(id) || !characters.has(characterId)) return;
    const character = characters.get(characterId), weapon = weapons.get(id), source = weaponsSource[id];
    const base = scaling(character, weapon, source, 'attack');
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(character, weapon), refinement: rank });
      const text = source.metadata['r' + rank].description;
      const normal = percent(text.match(/造成(\d+(?:\.\d+)?)%攻击力/));
      const cryo = percent(text.match(/则造成(\d+(?:\.\d+)?)%攻击力/));
      for (const active of [false, true]) for (const aura of [false, true]) for (const cryoBranch of [false, true]) {
        const suffix = cryoBranch ? 'icicle-cryo' : 'icicle';
        const result = proc(prepared, weapon, suffix, 'icicleTriggered', active, 'noncritical', { 'aura.cryo': flag(aura) });
        record(id, '/hits/' + id + '.' + suffix, { rank, active, aura, cryoBranch }, result.totals.all.value?.value ?? null,
          active && aura === cryoBranch ? base * (aura ? cryo : normal) : 0);
      }
    }
  });

  check('amosbow', '/buffs', () => {
    const weapon = weapons.get('amosbow'), amber = characters.get('amber');
    if (!weapon || !amber) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(amber, weapon), refinement: rank });
      const text = weaponsSource.amosbow.metadata['r' + rank].description;
      const base = percent(text.match(/普通攻击与重击造成的伤害提升(\d+(?:\.\d+)?)%/));
      const added = percent(text.match(/伤害还会提升(\d+(?:\.\d+)?)%/));
      const maximum = Number(text.match(/至多提升(\d+)次/)?.[1]);
      for (const category of ['normal', 'charged', 'plunge', 'skill', 'burst']) for (const layers of [0, 1, maximum - 1, maximum]) {
        const expected = ['normal', 'charged'].includes(category) ? base + added * layers : 0;
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { 'amosbow.flightStacks': quantity('count', layers) } }];
        record('amosbow', '/buffs', { rank, category, layers }, attribute(prepared, 'attribute.damageBonus', { category, overrides }), expected);
      }
    }
  });

  check('slingshot', '/buffs', () => {
    const weapon = weapons.get('slingshot'), character = characters.get('amber');
    if (!weapon || !character) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(character, weapon), refinement: rank });
      const text = weaponsSource[weapon.id].metadata['r' + rank].description;
      const threshold = Number(text.match(/发射后的([\d.]+)秒/)?.[1]) * 1000;
      const fast = percent(text.match(/伤害增加(\d+)%/));
      const slow = -percent(text.match(/伤害下降(\d+)%/));
      for (const category of ['normal','charged','skill']) for (const milliseconds of [threshold - 1, threshold, threshold + 1]) {
        const facts = { 'slingshot.flightMs': quantity('scalar', milliseconds) };
        const expected = category === 'skill' ? 0 : milliseconds <= threshold ? fast : slow;
        record(weapon.id, '/buffs', { rank, category, milliseconds }, attribute(prepared, 'attribute.damageBonus', { category, facts }), expected);
      }
    }
  });

  check('polarstar', '/buffs', () => {
    const weapon = weapons.get('polarstar'), character = characters.get('amber');
    if (!weapon || !character) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(character, weapon), refinement: rank });
      const text = weaponsSource[weapon.id].metadata['r' + rank].description;
      const attack = [0, ...text.match(/攻击力将提高([\d./]+)%/)?.[1].split('/').map(value => Number(value + 'e-2')) ?? []];
      const damage = percent(text.match(/元素战技和元素爆发造成的伤害提高(\d+)%/));
      for (const layers of [0, 1, 2, 3, 4]) {
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { 'polarstar.starLayers': quantity('count', layers) } }];
        record(weapon.id, '/buffs', { rank, layers }, attribute(prepared, 'attribute.attackPercent', { overrides }), attack[layers]);
      }
      for (const category of ['skill', 'burst', 'normal', 'charged', 'plunge']) {
        record(weapon.id, '/buffs', { rank, category }, attribute(prepared, 'attribute.damageBonus', { category }), ['skill', 'burst'].includes(category) ? damage : 0);
      }
    }
  });

  check('fadingtwilight', '/buffs', () => {
    const weapon = weapons.get('fadingtwilight'), character = characters.get('amber');
    if (!weapon || !character) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(character, weapon), refinement: rank });
      const text = weaponsSource[weapon.id].metadata['r' + rank].description;
      const modes = /具有(\p{Script=Han}+)、(\p{Script=Han}+)、(\p{Script=Han}+)三种状态/u.exec(text)?.slice(1) ?? [];
      const amounts = /伤害提升([\d.]+)%\/([\d.]+)%\/([\d.]+)%/.exec(text)?.slice(1).map(value => Number(value + 'e-2')) ?? [];
      for (const [index, mode] of modes.entries()) {
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { 'fadingtwilight.state': explicit({ kind: 'enum', value: mode }) } }];
        record(weapon.id, '/buffs', { rank, mode }, attribute(prepared, 'attribute.damageBonus', { overrides }), amounts[index]);
      }
    }
  });

  check('prospectorsshovel', '/buffs', () => {
    const weapon = weapons.get('prospectorsshovel'), character = characters.get('xiangling');
    if (!weapon || !character) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(character, weapon), refinement: rank });
      const text = weaponsSource.prospectorsshovel.metadata['r' + rank].description;
      const [electro, lunar, full] = [...text.matchAll(/提高(\d+(?:\.\d+)?)%|提升(\d+(?:\.\d+)?)%/g)].map(match => percent([null, match[1] ?? match[2]]));
      for (const fullMoonsign of [true, false]) for (const reactionId of ['electro-charged','superconduct','lunar-charged','lunar-bloom']) {
        const transformative = ['electro-charged','superconduct'].includes(reactionId);
        const attributeId = 'attribute.reaction.' + (transformative ? 'transformative' : 'lunar') + '.damageBonus';
        const family = transformative ? 'transformative' : reactionId;
        const overrides = [{ subject: { kind: 'team' }, facts: { fullMoonsign: flag(fullMoonsign) } }];
        const expected = reactionId === 'electro-charged' ? electro : reactionId === 'lunar-charged' ? lunar + (fullMoonsign ? full : 0) : 0;
        record('prospectorsshovel', '/buffs', { rank, fullMoonsign, family, reactionId }, attribute(prepared, attributeId, { family, reactionId, overrides }), expected);
      }
    }
  });

  check('starcallerswatch', '/buffs', () => {
    const weapon = weapons.get('starcallerswatch'), holder = characters.get('lisa'), peer = characters.get('kaeya');
    const starter = weapons.get('dullblade');
    if (!weapon || !holder || !peer || !starter) return;
    const source = weaponsSource[weapon.id];
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(holder, weapon), refinement: rank }, [{ id: 'peer', build: auditBuild(peer, starter) }]);
      const text = source.metadata['r' + rank].description;
      const mastery = Number(text.match(/元素精通提升(\d+)点/)?.[1]);
      const bonus = percent(text.match(/造成的伤害提升(\d+(?:\.\d+)?)%/));
      for (const active of [false, true]) for (const onField of ['actor', 'peer']) for (const recipient of ['actor', 'peer']) {
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { onField: flag(onField === 'actor'), 'starcallerswatch.night-mirrorActive': flag(active) } },
          { subject: { kind: 'actor', id: 'peer' }, facts: { onField: flag(onField === 'peer') } }];
        const options = { recipient, overrides };
        const settings = { rank, active, onField, recipient };
        record(weapon.id, '/buffs/0', settings, attribute(prepared, 'attribute.elementalMastery', options), recipient === 'actor' ? mastery + source.stats.base.specialized : 0);
        record(weapon.id, '/buffs/1', settings, attribute(prepared, 'attribute.damageBonus', options), active && onField === recipient ? bonus : 0);
      }
    }
  });

  const angel = weapons.get('angelosheptades'), holder = characters.get('lisa'), peer = characters.get('kaeya'), starter = weapons.get('dullblade');
  if (angel && holder && peer && starter) {
    const source = weaponsSource[angel.id];
    for (let rank = 1; rank <= angel.maxRefinement; rank++) {
      const prepared = prepare({ ...auditBuild(holder, angel), refinement: rank }, [{ id: 'peer', build: auditBuild(peer, starter) }]);
      const text = source.metadata['r' + rank].description;
      const passiveAttack = percent(text.match(/攻击力提升(\d+(?:\.\d+)?)%/));
      const cap = percent(text.match(/至多提升(\d+(?:\.\d+)?)%/));
      const bonus = percent(text.match(/每1000点攻击力都会使[^。]+?伤害提升(\d+(?:\.\d+)?)%/));
      const attack = (holder.attributes.base.attack * holder.progression.curves.attack[1] + source.stats.base.attack)
        * (1 + passiveAttack + (angel.stat === 'attackPercent' ? source.stats.base.specialized : 0));
      const atCap = 1000 * cap / bonus - attack;
      for (const flatAttack of [0, atCap - 1, atCap, atCap + 1]) for (const active of [false, true]) for (const recipient of ['actor', 'peer']) for (const hexerei of [false, true]) {
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { onField: flag(false), 'angelosheptades.leading-lightActive': flag(active), 'angelosheptades.hexereiRecipient': flag(hexerei) } },
          { subject: { kind: 'actor', id: 'peer' }, facts: { onField: flag(true), 'angelosheptades.hexereiRecipient': flag(hexerei) } }];
        const settings = { rank, active, recipient, flatAttack, hexerei };
        const expected = active ? Math.min(cap, (attack + flatAttack) * bonus / 1000) * (recipient === 'peer' ? 1 : hexerei ? .5 : 0) : 0;
        record(angel.id, '/buffs/1', settings, attribute(prepared, 'attribute.damageBonus', { recipient, overrides, flatAttack }), expected);
      }
    }
  }

  check('goldentroupe', '/effects/1', () => {
    const set = sets.get('goldentroupe'), character = characters.get('kaeya'), weapon = weapons.get('dullblade');
    if (!set || !character || !weapon) return;
    const text = setsSource.goldentroupe.effect4Pc;
    const [base, backstage] = [...text.matchAll(/提升(\d+)%/g)].map(percent);
    const twoPiece = percent(setsSource.goldentroupe.effect2Pc.match(/提升(\d+)%/));
    for (const count of [3, 4]) {
      const theoreticalSetSlots = set.slots.slice(0, count).map(slot => ({ slot, setId: set.id }));
      const prepared = prepare({ ...auditBuild(character, weapon, [set]), theoreticalSetSlots });
      for (const backstageActive of [false, true]) for (const category of ['normal', 'skill', 'burst']) {
        const expected = category === 'skill' ? twoPiece + (count >= 4 ? base + (backstageActive ? backstage : 0) : 0) : 0;
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { 'goldentroupe.backstageActive': flag(backstageActive) } }];
        record(set.id, '/effects/1', { count, category, backstageActive }, attribute(prepared, 'attribute.damageBonus', { category, overrides }), expected);
      }
    }
  });

  check('shimenawasreminiscence', '/effects/1', () => {
    const set = sets.get('shimenawasreminiscence'), character = characters.get('kaeya'), weapon = weapons.get('dullblade');
    if (!set || !character || !weapon) return;
    const text = setsSource[set.id].effect4Pc;
    const minimum = Number(text.match(/高于或等于(\d+)点/)?.[1]);
    const bonus = percent(text.match(/造成的伤害提高(\d+)%/));
    for (const count of [3, 4]) {
      const theoreticalSetSlots = set.slots.slice(0, count).map(slot => ({ slot, setId: set.id }));
      const prepared = prepare({ ...auditBuild(character, weapon, [set]), theoreticalSetSlots });
      for (const active of [false, true]) for (const energy of [0, minimum - 1, minimum, minimum + 1]) {
        for (const category of ['normal', 'charged', 'plunge', 'skill', 'burst']) {
          const expected = count === 4 && active && energy >= minimum && ['normal', 'charged', 'plunge'].includes(category) ? bonus : 0;
          const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: {
            'shimenawasreminiscence.energy-spentActive': flag(active), 'shimenawasreminiscence.energyAtCast': quantity('energy', energy),
          } }];
          record(set.id, '/effects/1', { count, category, active, energy }, attribute(prepared, 'attribute.damageBonus', { category, overrides }), expected);
        }
      }
    }
  });

  check('nymphsdream', '/effects/1', () => {
    const set = sets.get('nymphsdream'), character = characters.get('kaeya'), weapon = weapons.get('dullblade');
    if (!set || !character || !weapon) return;
    const text = setsSource[set.id].effect4Pc;
    const stages = pattern => [0, ...[...text.match(pattern)?.[1].matchAll(/(\d+)%/g) ?? []].map(percent)];
    const attack = stages(/攻击力将提高([^，]+)/), hydro = stages(/水元素伤害加成提升([^。]+)/);
    const twoPiece = percent(setsSource[set.id].effect2Pc.match(/获得(\d+)%水元素伤害加成/));
    for (const count of [3, 4]) {
      const theoreticalSetSlots = set.slots.slice(0, count).map(slot => ({ slot, setId: set.id }));
      const prepared = prepare({ ...auditBuild(character, weapon, [set]), theoreticalSetSlots });
      for (const layers of [0, 1, 2, 3]) {
        const overrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { 'nymphsdream.nymphLayers': quantity('count', layers) } }];
        record(set.id, '/effects/1', { count, layers, stat: 'attackPercent' }, attribute(prepared, 'attribute.attackPercent', { overrides }), count === 4 ? attack[layers] : 0);
        record(set.id, '/effects/1', { count, layers, stat: 'hydroBonus' }, attribute(prepared, 'attribute.hydroBonus', { overrides }), twoPiece + (count === 4 ? hydro[layers] : 0));
      }
    }
  });

  return { rows, verified, summary: { currentEquipmentCases: rows.length, currentEquipmentMismatches: rows.filter(row => row.issue).length, verifiedEquipmentClauses: verified.size } };
}
