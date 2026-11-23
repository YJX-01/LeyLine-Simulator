import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, number, setAuditDefaults } from './roster-audit-settings.mjs';

const sources = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const categories = ['normal', 'charged', 'plunge', 'skill', 'burst'];
const recipients = ['actor', 'peer'];
const percentages = text => [...text.matchAll(/([\d.]+)%/g)].map(([, value]) => Number(value) / 100);
const amount = (text, pattern) => Number(pattern.exec(text)?.[1]);
const enumValue = value => fact({ kind: 'enum', value });
const whiteAttack = (character, source) => character.attributes.base.attack * character.progression.curves.attack[1]
  + character.progression.promotion[0].attack + source.stats.base.attack;
const attackWithWeaponStat = (character, source) => whiteAttack(character, source)
  * (1 + (source.stats.specialized === 'FIGHT_PROP_ATTACK_PERCENT' ? source.stats.base.specialized : 0));
const criticalStat = { critRate: 'FIGHT_PROP_CRITICAL', critDamage: 'FIGHT_PROP_CRITICAL_HURT' };
const statBonus = (character, weapon, stat) => character.attributes.base[stat]
  + (sources[weapon.id].stats.specialized === criticalStat[stat] ? sources[weapon.id].stats.base.specialized : 0);

/** Check present equipment states and separately queried weapon hits against the pinned text. */
export function auditRemainingEquipmentCases(entities, engine) {
  const rows = [], verified = new Set(), gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peer = characters.get('kaeya'), starter = weapons.get('dullblade');

  function record(entity, field, settings, value, expected) {
    const matches = expected === null ? value === null : Number.isFinite(value) && Math.abs(value - expected) < 1e-8;
    rows.push({ entity, field, ...settings, value, expected, ...(matches ? {} : { issue: '装备当次输出与来源算式不符' }) });
  }

  function check(entity, characterId, field, cases) {
    const weapon = weapons.get(entity), holder = characters.get(characterId);
    if (!weapon || !holder || !peer || !starter) return;
    const start = rows.length;
    const refinements = Object.keys(sources[entity].metadata).filter(key => /^r[1-5]$/.test(key));
    if (refinements.length !== weapon.maxRefinement) throw Error(entity + ' 的精炼档与固定来源不符');
    for (const [index, key] of refinements.sort().entries()) {
      const rank = index + 1;
      const prepared = engine.prepareStructuredBuilds([
        { id: 'actor', build: { ...auditBuild(holder, weapon), refinement: rank } },
        { id: 'peer', build: auditBuild(peer, starter) },
      ]);
      if (!prepared.ok) throw Error(entity + ' ' + JSON.stringify(prepared.diagnostics));
      const { team } = prepared;
      const talent = holder.talents[0], hit = talent.hits[0];
      function query(facts, onField) {
        const { setup, request } = auditHit(holder, talent, hit);
        for (const entity of [holder, weapon]) setAuditDefaults(entity, request.frame);
        Object.assign(request.frame.factOverrides[0].facts, { onField: bool(onField), ...facts });
        request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: { onField: bool(!onField) } });
        return { setup, request };
      }
      function attribute(stat, { facts = {}, onField = true, category = 'normal', recipient = 'actor' } = {}) {
        const { setup, request } = query(facts, onField);
        const context = engine.createStructuredCombatContext(team, setup);
        const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
          hit: { category, element: hit.element, family: 'ordinary', origin: 'talent', reactionId: null, skillId: talent.id, hitId: hit.id } };
        const key = { namespace: 'builtin', id: 'attribute.' + stat, revision: '1' };
        const binding = { kind: 'attribute', key, actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' } };
        const value = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame).outputs.value;
        return value?.state === 'known' ? value.value.value : null;
      }
      function weaponHit(hitId, trigger, active, facts) {
        const { setup, request } = query(facts, true);
        request.hit = { definition: { group: 'weapons', namespace: weapon.namespace, id: weapon.id, revision: weapon.revision }, hitId };
        if (active === null) delete request.frame.facts[trigger];
        else request.frame.facts[trigger] = bool(active);
        const event = setup.events.find(row => row.id === request.frame.eventId);
        event.hitId = hitId;
        delete event.skillId;
        delete event.category;
        return engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value ?? null;
      }
      const emit = (settings, value, expected) => record(entity, field, { holder: holder.id, rank, ...settings }, value, expected);
      cases({ holder, weapon, source: sources[entity], text: sources[entity].metadata[key].description, attribute, weaponHit, emit });
    }
    if (rows.length > start && rows.slice(start).every(row => !row.issue)) verified.add(entity + field);
  }

  check('absolution', 'kaeya', '/buffs', ({ holder, weapon, text, attribute, emit }) => {
    const [crit, rate] = percentages(text);
    const maximum = amount(text, /至多叠加(\d+)次/);
    for (const recipient of recipients) {
      for (const layers of [0, 1, 2, maximum, maximum + 1]) {
        const facts = { 'absolution.bondDamageLayers': number('count', layers) };
        emit({ recipient, layers, stat: 'damageBonus' }, attribute('damageBonus', { facts, recipient }),
          recipient === 'actor' ? Math.min(layers, maximum) * rate : 0);
      }
      const expected = recipient === 'actor' ? statBonus(holder, weapon, 'critDamage') + crit : peer.attributes.base.critDamage;
      emit({ recipient, stat: 'critDamage' }, attribute('critDamage', { recipient }), expected);
    }
  });

  check('crimsonmoonssemblance', 'xiangling', '/buffs', ({ text, attribute, emit }) => {
    const [, base, threshold, extra] = percentages(text);
    for (const recipient of recipients) for (const ratio of [0, .001, threshold - .001, threshold, threshold + .001, 1]) {
      const facts = { 'crimsonmoonssemblance.bondRatio': number('scalar', ratio) };
      const expected = recipient === 'actor' ? (ratio > 0 ? base : 0) + (ratio >= threshold ? extra : 0) : 0;
      emit({ recipient, ratio, stat: 'damageBonus' }, attribute('damageBonus', { facts, recipient }), expected);
    }
  });

  check('vividnotions', 'lisa', '/buffs', ({ holder, weapon, text, attribute, emit }) => {
    const [attack, dawn, twilight] = percentages(text);
    for (const recipient of recipients) {
      emit({ recipient, stat: 'attackPercent' }, attribute('attackPercent', { recipient }), recipient === 'actor' ? attack : 0);
      for (const category of categories) for (const dawnActive of [false, true]) for (const twilightActive of [false, true]) {
        const facts = { 'vividnotions.dawnActive': bool(dawnActive), 'vividnotions.twilightActive': bool(twilightActive) };
        const base = recipient === 'actor' ? statBonus(holder, weapon, 'critDamage') : peer.attributes.base.critDamage;
        const added = recipient === 'actor' && category === 'plunge' ? (dawnActive ? dawn : 0) + (twilightActive ? twilight : 0) : 0;
        emit({ recipient, category, dawnActive, twilightActive, stat: 'critDamage' }, attribute('critDamage', { facts, recipient, category }), base + added);
      }
    }
  });

  check('wolffang', 'kaeya', '/buffs', ({ holder, weapon, text, attribute, emit }) => {
    const [bonus, skillRate, burstRate] = percentages(text);
    const maximum = amount(text, /至多叠加(\d+)次/);
    // The evidence establishes where stacks are earned. Current inputs describe stacks that are still effective.
    for (const recipient of recipients) for (const category of categories) {
      const own = recipient === 'actor';
      emit({ recipient, category, stat: 'damageBonus' }, attribute('damageBonus', { recipient, category }),
        own && ['skill', 'burst'].includes(category) ? bonus : 0);
      for (const onField of [false, true]) for (const [skill, burst] of [[0, 0], [1, 0], [0, 2], [2, 3], [maximum, maximum], [maximum + 1, maximum + 1]]) {
        const facts = { 'wolffang.skillCritLayers': number('count', skill), 'wolffang.burstCritLayers': number('count', burst) };
        const base = own ? statBonus(holder, weapon, 'critRate') : peer.attributes.base.critRate;
        const added = own && category === 'skill' ? Math.min(skill, maximum) * skillRate
          : own && category === 'burst' ? Math.min(burst, maximum) * burstRate : 0;
        emit({ recipient, category, onField, skill, burst, stat: 'critRate' }, attribute('critRate', { facts, onField, recipient, category }), base + added);
      }
    }
  });

  check('hereticsmoltenblade', 'kaeya', '/buffs', ({ text, attribute, emit }) => {
    const [minimum, maximum] = percentages(text);
    for (const recipient of recipients) for (const onField of [false, true]) {
      for (const [state, rate] of [['无效果', 0], ['最低加成', minimum], ['最高加成', maximum]]) {
        const facts = { 'hereticsmoltenblade.firstLightState': enumValue(state) };
        emit({ recipient, onField, state, stat: 'attackPercent' }, attribute('attackPercent', { facts, recipient, onField }),
          recipient === 'actor' && onField ? rate : 0);
      }
    }
  });

  check('ultimateoverlordsmegamagicsword', 'noelle', '/buffs', ({ text, attribute, emit }) => {
    const [base, maximum] = percentages(text);
    for (const recipient of recipients) for (const [state, rate] of [['无声援', 0], ['满额声援', maximum]]) {
      const facts = { 'ultimateoverlordsmegamagicsword.melusineSupportState': enumValue(state) };
      emit({ recipient, state, stat: 'attackPercent' }, attribute('attackPercent', { facts, recipient }), recipient === 'actor' ? base + rate : 0);
    }
  });

  for (const id of ['prizedisshinblade', 'prizedisshinblade-01', 'prizedisshinblade-02']) {
    const hitId = id + '.curse';
    check(id, 'kaedeharakazuha', '/hits/' + hitId, ({ holder, source, text, weaponHit, emit }) => {
      const ratio = amount(text, /造成([\d.]+)%攻击力的范围伤害/) / 100;
      const reduction = amount(text, /造成的伤害降低([\d.]+)%/) / 100;
      const base = attackWithWeaponStat(holder, source) * ratio * (1 - reduction) * .5 * .9;
      for (const active of [null, false, true]) emit({ active, expectedSource: 'genshin-db 武器词条' },
        weaponHit(hitId, id + '.curseTriggered', active, {}), active === null ? null : active ? base : 0);
    });
    check(id, 'kaedeharakazuha', '/buffs', ({ text, attribute, emit }) => {
      const reduction = amount(text, /造成的伤害降低([\d.]+)%/) / 100;
      for (const recipient of recipients) emit({ recipient, stat: 'damageBonus' },
        attribute('damageBonus', { recipient }), recipient === 'actor' ? -reduction : 0);
    });
    // The aggregate equipment field requires both the penalty and the weapon hit to match.
    if (!verified.has(id + '/hits/' + hitId)) verified.delete(id + '/buffs');
  }

  const descent = 'swordofdescension';
  const descentHit = descent + '.descent';
  for (const [character, traveler] of [['kaeya', false], ['aether-anemo', true]]) {
    for (const field of ['/buffs', '/hits/' + descentHit]) check(descent, character, field, ({ holder, source, text, attribute, weaponHit, emit }) => {
      const ratio = amount(text, /造成([\d.]+)%攻击力的伤害/) / 100;
      const extra = amount(text, /攻击力提升([\d.]+)点/);
      for (const platform of [false, true]) {
        const facts = { 'swordofdescension.traveler-platformActive': bool(platform) };
        const attack = attackWithWeaponStat(holder, source) + (traveler && platform ? extra : 0);
        if (field === '/buffs') {
          for (const recipient of recipients) emit({ platform, recipient, stat: 'flatAttack' },
            attribute('flatAttack', { facts, recipient }), recipient === 'actor' && traveler && platform ? extra : 0);
        } else {
          for (const active of platform ? [null, false, true] : [false]) emit({ active, platform, expectedSource: 'genshin-db 武器词条' },
            weaponHit(descentHit, descent + '.descentTriggered', active, facts), active === null ? null : active ? attack * ratio * .5 * .9 : 0);
        }
      }
    });
  }
  if (rows.some(row => row.entity === descent && row.issue)) {
    verified.delete(descent + '/buffs');
    verified.delete(descent + '/hits/' + descentHit);
  }

  return { rows, verified, gaps, summary: { remainingEquipmentCases: rows.length,
    remainingEquipmentMismatches: rows.filter(row => row.issue).length, remainingVerifiedEquipmentClauses: verified.size } };
}
