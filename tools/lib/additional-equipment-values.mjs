import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, number, setAuditDefaults } from './roster-audit-settings.mjs';

const weaponsSource = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const setsSource = readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json', import.meta.url));
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const percentages = text => [...text.matchAll(/([\d.]+)%/g)].map(([, value]) => Number(value) / 100);
const amount = (text, pattern) => Number(pattern.exec(text)?.[1]);
const white = (character, stat) =>
  character.attributes.base[stat] * character.progression.curves[stat][1] + character.progression.promotion[0][stat];
const specialized = (weapon, stat) => weapon.stat === stat ? weaponsSource[weapon.id].stats.base.specialized : 0;
const weaponAttack = (character, weapon) => white(character, 'attack') + weaponsSource[weapon.id].stats.base.attack;
const slotCounts = (set, pieces) => set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id }));
const categories = ['normal', 'charged', 'plunge', 'skill', 'burst'];

function sourceEvent(id, kind, actorId, timeMs, fields = {}) {
  return { id, kind, actorId, timeMs, order: 0, targetIds: kind === 'hit' ? ['enemy'] : [], sourceEventIds: [], facts: {}, ...fields };
}

/** Evaluate single-hit outputs and actor attributes against the pinned source values. */
export function auditAdditionalEquipment(entities, engine) {
  const rows = [], verified = new Set();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map(entities.sets.map(set => [set.id, set]));
  const kaeya = characters.get('kaeya'), dullBlade = weapons.get('dullblade');
  const peer = kaeya && dullBlade && auditBuild(kaeya, dullBlade);

  function check(id, field, run) {
    const start = rows.length;
    run();
    if (rows.length > start && rows.slice(start).every(row => !row.issue)) verified.add(id + field);
  }

  function record(entity, field, settings, value, expected) {
    const matches = Number.isFinite(value) && Number.isFinite(expected) && Math.abs(value - expected) < 1e-7;
    rows.push({ entity, field, ...settings, value, expected, ...(matches ? {} : { issue: '装备输出与来源算式不符' }) });
  }

  function scenario(build, otherBuild = peer) {
    const team = engine.prepareStructuredBuilds([{ id: 'actor', build }, ...(otherBuild ? [{ id: 'peer', build: otherBuild }] : [])]);
    if (!team.ok) throw new Error(build.weapon.id + ' ' + JSON.stringify(team.diagnostics));
    const talent = build.character.talents[0], hit = talent.hits[0];
    function prepare({ time = 1, events = [], facts = {}, targetFacts = {}, teamFacts = {}, eventFacts = {}, peerFacts = {}, inputs = {} } = {}) {
      const { setup, request } = auditHit(build.character, talent, hit);
      for (const item of [build.character, build.weapon, ...build.sets]) setAuditDefaults(item, request.frame);
      setup.events.find(event => event.id === request.frame.eventId).timeMs = time;
      setup.events.unshift(...events);
      Object.assign(request.frame.factOverrides.find(row => row.subject.kind === 'actor').facts, facts);
      const target = request.frame.factOverrides.find(row => row.subject.kind === 'target');
      if (target) Object.assign(target.facts, targetFacts);
      else if (Object.keys(targetFacts).length) request.frame.factOverrides.push({ subject: { kind: 'target', id: 'enemy' }, facts: targetFacts });
      const teamOverride = request.frame.factOverrides.find(row => row.subject.kind === 'team');
      if (teamOverride) Object.assign(teamOverride.facts, teamFacts);
      else if (Object.keys(teamFacts).length) request.frame.factOverrides.push({ subject: { kind: 'team' }, facts: teamFacts });
      if (otherBuild) request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: { onField: bool(false), ...peerFacts } });
      Object.assign(request.frame.facts, eventFacts);
      const context = engine.createStructuredCombatContext(team.team, setup);
      Object.assign(context.actors[0].inputs, inputs);
      return { setup, request, context };
    }
    return {
      attribute(stat, options = {}) {
        const { request, context } = prepare(options);
        const { recipient = 'actor', category = 'normal', element = 'physical', family = 'ordinary', reactionId = null, phase = 'before' } = options;
        const binding = { kind: 'attribute', key: ref('attribute.' + stat), actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' } };
        const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, phase,
          hit: { skillId: talent.id, hitId: hit.id, category, element, family, origin: 'talent', reactionId } };
        return engine.evaluateCombatBindings(team.team.program, context, { value: binding }, frame).outputs.value?.value?.value ?? null;
      },
      proc(id, options, critMode) {
        const { setup, request } = prepare(options);
        const weapon = build.weapon, query = setup.events.find(event => event.id === request.frame.eventId);
        request.hit = { definition: { group: 'weapons', namespace: weapon.namespace, id: weapon.id, revision: weapon.revision }, hitId: id };
        request.critMode = critMode;
        query.hitId = id;
        delete query.skillId;
        delete query.category;
        return engine.evaluateStructuredHit(team.team, setup, request);
      },
    };
  }

  const cases = [
    ['redhornstonethresher', 'noelle', { normal: true, charged: true }, null, 'defense', /防御力的([\d.]+)%/],
    ['hunterspath', 'amber', { charged: true }, 'tireless-huntActive', 'mastery', /元素精通数值的([\d.]+)%/],
    ['lightoffoliarincision', 'kaeya', { normal: true, skill: true }, 'foliar-incisionActive', 'mastery', /元素精通的([\d.]+)%/],
    ['sturdybone', 'kaeya', { normal: true }, 'dashActive', 'attack', /攻击力的([\d.]+)%/],
    ['everlastingmoonglow', 'lisa', { normal: true }, null, 'hp', /生命值上限的([\d.]+)%/],
  ];
  for (const [id, holder, included, switchKey, stat, pattern] of cases) check(id, '/buffs', () => {
    const character = characters.get(holder), weapon = weapons.get(id);
    if (!character || !weapon || !peer) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const original = weaponsSource[id].metadata['r' + rank].description;
      const ratio = amount(original, pattern) / 100;
      const damage = scenario({ ...auditBuild(character, weapon), refinement: rank });
      for (const inputs of [{}, {
        elementalMastery: number('elementalMastery', 240), flatAttack: number('attack', 240),
        flatDefense: number('defense', 240), flatHp: number('hp', 240),
      }]) for (const active of switchKey ? [false, true] : [true]) for (const category of categories) for (const recipient of ['actor', 'peer']) {
        const facts = switchKey ? { [id + '.' + switchKey]: bool(active) } : {};
        const options = { category, recipient, facts, inputs };
        const added = Object.keys(inputs).length ? 240 : 0;
        const basis = {
          defense: white(character, 'defense') * (1 + percentages(original)[0] + specialized(weapon, 'defensePercent')) + added,
          mastery: specialized(weapon, 'elementalMastery') + added,
          attack: weaponAttack(character, weapon) * (1 + specialized(weapon, 'attackPercent')) + added,
          hp: white(character, 'hp') * (1 + specialized(weapon, 'hpPercent')) + added,
        }[stat];
        record(id, '/buffs', { rank, category, active, recipient, added, stat: 'baseDamageBonus' },
          damage.attribute('baseDamageBonus', options), active && included[category] && recipient === 'actor' ? basis * ratio : 0);
      }
      if (id === 'hunterspath' || id === 'lightoffoliarincision' || id === 'redhornstonethresher') {
        const stat = { hunterspath: 'damageBonus', lightoffoliarincision: 'critRate', redhornstonethresher: 'defensePercent' }[id];
        for (const element of ['physical', 'pyro']) {
          const gain = id !== 'hunterspath' || element !== 'physical' ? percentages(original)[0] : 0;
          const base = stat === 'critRate' ? character.attributes.base.critRate + specialized(weapon, stat) : 0;
          record(id, '/buffs', { rank, element, stat }, damage.attribute(stat, { element }), base + gain);
        }
      }
    }
  });

  for (const [id, holder] of [['primordialjadecutter', 'kaeya'], ['staffofhoma', 'xiangling']]) check(id, '/buffs', () => {
    const character = characters.get(holder), weapon = weapons.get(id);
    if (!character || !weapon || !peer) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const original = weaponsSource[id].metadata['r' + rank].description;
      const [hpGain, rate] = percentages(original);
      const lowRate = id === 'staffofhoma' ? amount(original, /进一步获得([\d.]+)%/) / 100 : 0;
      const stats = scenario({ ...auditBuild(character, weapon), refinement: rank });
      for (const recipient of ['actor', 'peer']) for (const hpRatio of [.49, .5, .51, 1]) for (const flatHp of [0, 500]) {
        const options = { recipient, facts: { hpRatio: number('scalar', hpRatio) }, inputs: { flatHp: number('hp', flatHp) } };
        const hp = recipient === 'actor' ? white(character, 'hp') * (1 + hpGain) + flatHp : white(peer.character, 'hp');
        const attack = recipient === 'actor'
          ? weaponAttack(character, weapon) + hp * (rate + (hpRatio < .5 ? lowRate : 0))
          : weaponAttack(peer.character, peer.weapon);
        record(id, '/buffs', { rank, recipient, hpRatio, flatHp, stat: 'hp' }, stats.attribute('hp', options), hp);
        record(id, '/buffs', { rank, recipient, hpRatio, flatHp, stat: 'attack' }, stats.attribute('attack', options), attack);
      }
    }
  });

  check('exaiphanesblade', '/buffs', () => {
    const id = 'exaiphanesblade', weapon = weapons.get(id), traveler = characters.get('aether-anemo');
    if (!weapon || !traveler || !peer) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const original = weaponsSource[id].metadata['r' + rank].description;
      const attackRate = amount(original, /攻击力提升([\d.]+)%/) / 100;
      const critRate = original.includes('暴击伤害') ? amount(original, /暴击伤害就会提升([\d.]+)%/) / 100 : 0;
      for (const [character, eligible] of [[traveler, true], [kaeya, false]]) {
        const stats = scenario({ ...auditBuild(character, weapon), refinement: rank });
        for (const elements of [0, 1, 7]) for (const active of [false, true]) for (const recipient of ['actor', 'peer']) {
          const facts = { [id + '.traveler-attackActive']: bool(active),
            [id + '.resonatedElements']: number('count', elements) };
          const settings = { rank, eligible, elements, active, recipient };
          const inScope = eligible && recipient === 'actor';
          record(id, '/buffs/0', { ...settings, stat: 'attackPercent' }, stats.attribute('attackPercent', { facts, recipient }),
            (recipient === 'actor' ? specialized(weapon, 'attackPercent') : 0) + (inScope && active ? attackRate : 0));
          const baseCrit = recipient === 'actor' ? character.attributes.base.critDamage + specialized(weapon, 'critDamage') : peer.character.attributes.base.critDamage;
          record(id, '/buffs/1', { ...settings, stat: 'critDamage' }, stats.attribute('critDamage', { facts, recipient }),
            baseCrit + (inScope ? critRate * elements : 0));
        }
      }
    }
  });

  check('athameartis', '/buffs', () => {
    const id = 'athameartis', weapon = weapons.get(id);
    if (!weapon || !peer) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const [burst, owner, team, hexereiBonus] = percentages(weaponsSource[id].metadata['r' + rank].description);
      const stats = scenario({ ...auditBuild(kaeya, weapon), refinement: rank });
      for (const active of [false, true]) for (const hexerei of [false, true]) for (const onField of ['actor', 'peer']) for (const recipient of ['actor', 'peer']) {
        const facts = { onField: bool(onField === 'actor'), [id + '.daybreakWindow']: bool(active) };
        const teamFacts = { [id + '.hexerei']: bool(hexerei) }, peerFacts = { onField: bool(onField === 'peer') };
        const expected = !active ? 0 : (recipient === 'actor' ? owner : recipient === onField ? team : 0) * (1 + (hexerei ? hexereiBonus : 0));
        record(id, '/buffs', { rank, active, hexerei, onField, recipient, stat: 'attackPercent' },
          stats.attribute('attackPercent', { facts, teamFacts, peerFacts, recipient }), expected);
      }
      for (const recipient of ['actor', 'peer']) for (const category of categories) {
        record(id, '/buffs', { rank, category, recipient, stat: 'critDamage' }, stats.attribute('critDamage', { recipient, category }),
          kaeya.attributes.base.critDamage + (recipient === 'actor' && category === 'burst' ? burst : 0));
      }
    }
  });

  check('whitelakefrostfeather', '/buffs', () => {
    const id = 'whitelakefrostfeather', weapon = weapons.get(id);
    if (!weapon || !peer) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const original = weaponsSource[id].metadata['r' + rank].description;
      const [attack, crit] = percentages(original), maximum = amount(original, /至多叠加(\d+)层/);
      const stats = scenario({ ...auditBuild(kaeya, weapon), refinement: rank });
      for (const layers of [0, 1, maximum - 1, maximum]) for (const recipient of ['actor', 'peer']) {
        const facts = { [id + '.lakeLayers']: number('count', layers) };
        for (const family of ['ordinary', 'stellar-conduct', 'stellar-swirl', 'lunar-crystallize']) {
          record(id, '/buffs', { rank, layers, recipient, family, stat: 'critDamage' }, stats.attribute('critDamage', { facts, recipient, family }),
            kaeya.attributes.base.critDamage + (recipient === 'actor' && layers === maximum && family.startsWith('stellar-') ? crit : 0));
        }
        record(id, '/buffs', { rank, layers, recipient, stat: 'attackPercent' }, stats.attribute('attackPercent', { facts, recipient }),
          recipient === 'actor' ? layers * attack : 0);
      }
    }
  });

  const royalHolders = { royalbow: 'amber', royalgreatsword: 'noelle', royalgrimoire: 'lisa', royallongsword: 'kaeya', royalspear: 'xiangling' };
  for (const [id, holder] of Object.entries(royalHolders)) check(id, '/buffs', () => {
    const character = characters.get(holder), weapon = weapons.get(id);
    if (!character || !weapon || !peer) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const original = weaponsSource[id].metadata['r' + rank].description;
      const [rate] = percentages(original), maximum = amount(original, /最多堆叠(\d+)次/);
      const stats = scenario({ ...auditBuild(character, weapon), refinement: rank });
      for (const layers of [0, 1, maximum - 1, maximum]) for (const recipient of ['actor', 'peer']) {
        const facts = { [id + '.focusLayers']: number('count', layers) };
        const base = recipient === 'actor' ? character.attributes.base.critRate : peer.character.attributes.base.critRate;
        record(id, '/buffs', { rank, layers, recipient, stat: 'critRate' }, stats.attribute('critRate', { facts, recipient }),
          base + (recipient === 'actor' ? layers * rate : 0));
      }
    }
  });

  const procs = [
    ['aquilafavonia', 'kaeya', 'falcon', /造成([\d.]+)%攻击力的伤害/, /攻击力提高([\d.]+)%/],
    ['endoftheline', 'amber', 'net-snap', /造成([\d.]+)%攻击力/],
    ['eyeofperception', 'lisa', 'echo', /造成([\d.]+)%攻击力/],
    ['kagotsurubeisshin', 'kaeya', 'wind', /造成([\d.]+)%攻击力/],
    ['kingssquire', 'amber', 'forest-release', /造成([\d.]+)%攻击力/, undefined, 'teachingsExpired'],
    ['luxurioussealord', 'noelle', 'tuna', /造成([\d.]+)%攻击力/],
    ['scionoftheblazingsun', 'amber', 'sunfire-arrow', /造成攻击力([\d.]+)%/],
    ['skywardatlas', 'lisa', 'cloud', /等同于([\d.]+)%攻击力/],
    ['skywardblade', 'kaeya', 'piercing-strike', /额外造成([\d.]+)%攻击力/],
    ['skywardharp', 'amber', 'ballad', /造成([\d.]+)%攻击力/],
    ['skywardpride', 'noelle', 'vacuum-blade', /造成([\d.]+)%攻击力/],
    ['skywardspine', 'xiangling', 'vacuum-blade', /造成额外([\d.]+)%攻击力/],
  ];
  // The pinned KQM evidence confirms separate physical damage and critical hits for these Skyward procs.
  const criticalProcs = new Set(['skywardatlas', 'skywardblade', 'skywardharp', 'skywardpride']);
  for (const [id, holder, suffix, ratioPattern, attackPattern, factKey = suffix + 'Triggered'] of procs) check(id, '/buffs', () => {
    const character = characters.get(holder), weapon = weapons.get(id);
    if (!character || !weapon) return;
    for (let rank = 1; rank <= weapon.maxRefinement; rank++) {
      const original = weaponsSource[id].metadata['r' + rank].description;
      const [passive] = percentages(original);
      const ratio = amount(original, ratioPattern) / 100;
      const activeAttack = id === 'kagotsurubeisshin' ? amount(original, /攻击力提升([\d.]+)%/) / 100 : 0;
      const stats = scenario({ ...auditBuild(character, weapon), refinement: rank });
      for (const active of [false, true]) for (const boosted of ['kagotsurubeisshin', 'skywardblade'].includes(id) ? [false, true] : [false]) {
        const facts = id === 'kagotsurubeisshin' ? { [id + '.wind-attackActive']: bool(boosted) } : {};
        if (id === 'skywardblade') facts[id + '.piercingMight'] = bool(boosted);
        const eventFacts = { [id + '.' + factKey]: bool(active) };
        const attack = weaponAttack(character, weapon) * (1 + specialized(weapon, 'attackPercent')
          + (attackPattern ? amount(original, attackPattern) / 100 : 0) + (boosted ? activeAttack : 0));
        const damageBonus = specialized(weapon, 'physicalBonus') + (id === 'skywardpride' ? passive : 0);
        const critRate = character.attributes.base.critRate + specialized(weapon, 'critRate') + (id === 'skywardblade' ? passive : 0);
        const critDamage = character.attributes.base.critDamage + specialized(weapon, 'critDamage') + (id === 'skywardharp' ? passive : 0);
        for (const crit of criticalProcs.has(id) ? ['noncritical', 'critical', 'expected'] : ['noncritical']) {
          const multiplier = 1 + (crit === 'critical' ? critDamage : crit === 'expected' ? critRate * critDamage : 0);
          const result = stats.proc(id + '.' + suffix, { facts, eventFacts }, crit);
          const value = result.totals.all.value?.value ?? null;
          record(id, '/hits/' + id + '.' + suffix, { rank, active, boosted, crit,
            ...(value === null ? { diagnostics: result.diagnostics.map(diagnostic => diagnostic.message) } : {}) }, value,
            active && (id !== 'skywardblade' || boosted) ? attack * ratio * (1 + damageBonus) * multiplier * .5 * .9 : 0);
        }
      }
      for (const category of categories) {
        if (id === 'luxurioussealord') record(id, '/buffs', { rank, category, stat: 'damageBonus' },
          stats.attribute('damageBonus', { category }), category === 'burst' ? passive : 0);
        if (id === 'scionoftheblazingsun') for (const targeted of [false, true]) {
          const targetFacts = { [id + '.heartseared']: bool(targeted) };
          record(id, '/buffs', { rank, category, targeted, stat: 'damageBonus' }, stats.attribute('damageBonus', { category, targetFacts }),
            category === 'charged' && targeted ? amount(original, /伤害提升([\d.]+)%/) / 100 : 0);
        }
      }
      if (id === 'skywardblade') for (const active of [false, true]) for (const [stat, pattern] of [
        ['movementSpeed', /移动速度提升([\d.]+)%/], ['normalAttackSpeed', /攻击速度提升([\d.]+)%/],
      ]) record(id, '/buffs', { rank, active, stat }, stats.attribute(stat, { facts: { [id + '.piercingMight']: bool(active) } }),
        active ? amount(original, pattern) / 100 : 0);
      if (id === 'skywardspine') record(id, '/buffs', { rank, stat: 'normalAttackSpeed' }, stats.attribute('normalAttackSpeed'),
        amount(original, /普通攻击速度提升([\d.]+)%/) / 100);
      if (id === 'kingssquire') for (const active of [false, true]) record(id, '/buffs', { rank, active, stat: 'elementalMastery' },
        stats.attribute('elementalMastery', { facts: { [id + '.forest-teachingsActive']: bool(active) } }),
        specialized(weapon, 'elementalMastery') + (active ? amount(original, /元素精通提升(\d+)点/) : 0));
    }
  });

  for (const id of ['echoesofanoffering', 'emblemofseveredfate', 'paleflame', 'noblesseoblige']) check(id, '/effects/1', () => {
    const set = sets.get(id);
    if (!set || !peer) return;
    const [two] = percentages(setsSource[id].effect2Pc);
    const [first, second] = percentages(setsSource[id].effect4Pc);
    const windows = [[false, []], [true, [sourceEvent('owner-burst', 'action', 'actor', 0, { category: 'burst' })]]];
    for (const pieces of [1, 2, 3, 4, 5]) {
      const stats = scenario({ ...peer, sets: [set], theoreticalSetSlots: slotCounts(set, pieces) });
      const four = pieces >= 4;
      switch (id) {
        case 'echoesofanoffering':
          for (const active of [false, true]) for (const category of categories) for (const recipient of ['actor', 'peer']) {
            const facts = { [id + '.valley-riteActive']: bool(active) };
            const basis = weaponAttack(kaeya, dullBlade) * (1 + (pieces >= 2 ? two : 0));
            record(id, '/effects/1', { pieces, active, category, recipient, stat: 'baseDamageBonus' },
              stats.attribute('baseDamageBonus', { facts, category, recipient }),
              four && active && category === 'normal' && recipient === 'actor' ? basis * second : 0);
          }
          break;
        case 'emblemofseveredfate':
          for (const recharge of [1, 2.79, 2.8, 2.81, 4]) for (const category of categories) {
            const inputs = { energyRecharge: number('scalar', recharge) };
            const expected = four && category === 'burst' ? Math.min(second, (recharge + two) * first) : 0;
            record(id, '/effects/1', { pieces, recharge, category, stat: 'damageBonus' }, stats.attribute('damageBonus', { inputs, category }), expected);
          }
          break;
        case 'paleflame':
          for (const layers of [0, 1, 2]) for (const element of ['physical', 'cryo']) {
            const options = { element, facts: { [id + '.skillLayers']: number('count', layers) } };
            record(id, '/effects/1', { pieces, layers, element, stat: 'attackPercent' }, stats.attribute('attackPercent', options), four ? first * layers : 0);
            const stat = element === 'physical' ? 'physicalBonus' : 'cryoBonus';
            record(id, '/effects/1', { pieces, layers, element, stat }, stats.attribute(stat, options),
              element === 'physical' && pieces >= 2 ? two * (1 + (four && layers === 2 ? second : 0)) : 0);
          }
          break;
        case 'noblesseoblige':
          for (const [active, events] of windows) for (const time of [0, 11999, 12000]) for (const recipient of ['actor', 'peer']) {
            record(id, '/effects/1', { pieces, active, time, recipient, stat: 'attackPercent' },
              stats.attribute('attackPercent', { time, events, recipient }), four && active && time < 12000 ? first : 0);
          }
          for (const category of categories) record(id, '/effects/0', { pieces, category, stat: 'damageBonus' },
            stats.attribute('damageBonus', { category }), pieces >= 2 && category === 'burst' ? two : 0);
          break;
      }
    }
    if (id === 'noblesseoblige') {
      const wearing = { ...peer, sets: [set], theoreticalSetSlots: slotCounts(set, 4) };
      const team = scenario(wearing, wearing);
      const events = [sourceEvent('owner-burst', 'action', 'actor', 0, { category: 'burst' }),
        sourceEvent('peer-burst', 'action', 'peer', 100, { category: 'burst' })];
      for (const recipient of ['actor', 'peer']) for (const time of [99, 100, 12000, 12100]) record(id, '/effects/1',
        { twoWearers: true, recipient, time, stat: 'attackPercent' }, team.attribute('attackPercent', { events, recipient, time }), time < 12100 ? first : 0);
    }
  });
  if (verified.has('noblesseoblige/effects/1')) verified.add('noblesseoblige/effects/0');

  return { rows, verified, summary: { additionalEquipmentCases: rows.length,
    additionalEquipmentMismatches: rows.filter(row => row.issue).length, additionalVerifiedEquipmentClauses: verified.size } };
}
