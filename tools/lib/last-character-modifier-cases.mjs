import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, elements, novice, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const tablePath = capture + 'stats/talents.json';
const growthPath = 'tools/data/sources/catalog/genshin-db/characters.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const rates = read(tablePath);
const growth = read(growthPath);
const attribute = key => 'attribute.' + key;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-9);
const caseOf = (expected, settings = {}) => ({ expected, settings });
const fact = (key, value = true) => ({ [key]: value });
const casts = (cast, timeMs = 1) => ({ cast, timeMs });
const scopes = {
  owner: '同一持有者的实际命中或属性与条件排除分支对照。',
  team: '对照正式队伍构成、实际受益角色及条件排除读数。',
};

/** Verify one compiled contributor at a time, using only calculator-listed fields. */
export function auditLastCharacterModifierCases(entities, engine, results) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const existing = new Set((results.registeredModifierEvidence ?? []).map(row => row.key));
  const choices = new Map();
  const teams = new Map(), output = [];
  for (const row of results.calculator?.buffs ?? []) {
    const key = row.entity + row.field;
    choices.set(key, choices.has(key) ? null : row);
  }

  function teamFor(entity, ascension, constellation, party) {
    const key = JSON.stringify([entity, ascension, constellation, party]);
    if (!teams.has(key)) {
      const actors = [entity, ...party].map((id, i) => {
        const character = characters.get(id);
        const weapon = character && weapons.get(novice[character.identity.weaponType]);
        if (!weapon) return;
        const build = auditBuild(character, weapon);
        if (i === 0) {
          build.ascension = ascension;
          build.level = ascension ? character.progression.promotion[ascension].maxLevel : 1;
          build.constellation = constellation;
        }
        return { id, build };
      });
      const prepared = actors.every(Boolean) && engine.prepareStructuredBuilds(actors);
      teams.set(key, prepared?.ok ? prepared.team : null);
    }
    return teams.get(key);
  }

  function measure(entity, rule, target, unlock, windowFact, probe) {
    const { party = [], recipient = entity, hit: hitId, family, reaction, reactionElement, values = {}, recipientValues = {},
      onField = true, cast, trigger, timeMs = 1, ascension = unlock.ascension, constellation = unlock.constellation } = probe;
    const team = teamFor(entity, ascension, constellation, party);
    if (!team || ![entity, ...party].includes(recipient)) return;
    const owner = characters.get(entity), dealer = characters.get(recipient);
    const talent = hitId ? dealer.talents.find(entry => entry.hits.some(hit => hit.id === recipient + '.' + hitId)) : dealer.talents[0];
    const hit = hitId ? talent?.hits.find(entry => entry.id === recipient + '.' + hitId) : talent?.hits[0];
    if (!hit) return;
    const families = Object.keys(hit.damage ?? {});
    if (family && !reaction && !families.includes(family)) return;
    const { setup, request } = auditHit(dealer, talent, hit);
    const frame = request.frame;
    const ownerRow = frame.factOverrides.find(row => row.subject.kind === 'actor');
    ownerRow.facts.onField = bool(recipient === entity && onField);
    setAuditDefaults(owner, frame);
    // Leave a cast-derived window unobserved unless the probe supplies its own observation.
    if (windowFact) delete ownerRow.facts[windowFact];
    setGateFacts(owner, frame, values);
    for (const row of frame.factOverrides) {
      if (row.subject.kind === 'actor') row.subject = { kind: 'actor', id: entity };
    }
    const recipientRow = recipient === entity ? ownerRow : { subject: { kind: 'actor', id: recipient }, facts: {} };
    if (recipient !== entity) frame.factOverrides.push(recipientRow);
    Object.assign(recipientRow.facts, { onField: bool(onField) },
      Object.fromEntries(Object.entries(recipientValues).map(([key, value]) => [key, bool(value)])));
    for (const row of setup.events) {
      row.actorId = recipient;
      for (const entry of row.subjectFacts ?? []) {
        if (entry.subject.kind === 'actor') entry.subject = { kind: 'actor', id: recipient };
      }
    }
    const event = setup.events.find(row => row.id === 'hit');
    event.timeMs = timeMs;
    if (cast || trigger) setup.events.unshift({
      id: 'trigger', actorId: entity, timeMs: 0, order: 0, targetIds: [], sourceEventIds: [], facts: {},
      ...(cast ? { kind: 'action', skillId: entity + '.' + cast, category: cast } : trigger),
    });
    const hitFrame = reaction ? { skillId: null, hitId: null, category: null, element: reactionElement,
      origin: 'reaction', family, reactionId: reaction } : {
      skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, origin: hit.origin,
      family: family ?? (families.length === 1 ? families[0] : 'ordinary'), reactionId: null,
    };
    Object.assign(frame, { ownerId: recipient, recipientId: recipient, contributorId: null, hit: hitFrame });
    const context = engine.createStructuredCombatContext(team, setup);
    const actor = context.actors.find(row => row.id === entity);
    const matched = actor.effects.filter(effect => effect.id === rule);
    for (const other of context.actors) other.effects = [];
    const binding = {
      kind: 'attribute', actor: { role: 'recipient' },
      key: { namespace: 'builtin', id: target, revision: '1' }, at: { kind: 'current', phase: 'same' },
    };
    const evaluate = () => {
      const reading = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame).outputs.value;
      return reading?.state === 'known' && reading.value.kind === 'quantity' ? reading.value.value : NaN;
    };
    const neutral = evaluate();
    actor.effects = matched;
    return { value: evaluate() - neutral, granted: matched.length === 1, hit: frame.hit };
  }

  function check(entity, clause, grant, index, target, role, refs, probes) {
    const character = characters.get(entity);
    if (!character) return;
    const group = clause[0] === 'c' ? 'constellations' : clause[0] === 'a' ? 'passives' : 'talents';
    const position = Number(clause.slice(1)) - Number(group === 'constellations');
    const piece = character.metadata[group][position];
    const id = entity + '.' + grant;
    const buff = piece?.buffs?.find(row => row.id === id);
    const modifier = buff?.modifiers[index];
    if (modifier?.target !== target || (modifier.recipient ?? buff.recipient ?? 'owner') !== role) return;
    const field = '/' + group + '/' + position + '/buffs/' + piece.buffs.indexOf(buff) + '/modifiers/' + index;
    const key = entity + field, choice = choices.get(key);
    if (!choice?.listed || choice.issue || choice.id !== id || choice.target !== target || choice.role !== role || existing.has(key)) return;
    const unlock = { ascension: group === 'passives' ? piece.unlockAscension ?? 0 : 0,
      constellation: group === 'constellations' ? position + 1 : 0 };
    const rule = index ? id + '.' + index : id;
    const cases = [];
    for (const { expected, settings } of probes) {
      const reading = measure(entity, rule, target, unlock, buff.windowFact, settings);
      if (!reading) return;
      if (!close(reading.value, expected) || expected !== 0 && !reading.granted) return;
      cases.push({ actual: reading.value, expected, settings: { supplier: entity, recipient: settings.recipient ?? entity,
        ...unlock, ...settings, hit: reading.hit.hitId, category: reading.hit.category, element: reading.hit.element, family: reading.hit.family,
        origin: reading.hit.origin } });
    }
    const active = cases[0];
    if (!active?.expected || !cases.some(row => row.expected === 0)) return;
    output.push({ key, entity, field, id, modifier: index, target, actual: active.actual, expected: active.expected, refs,
      scope: scopes[role], audit: 'lastCharacterModifiers', cases });
  }

  function original(entity, clause) {
    const group = clause[0] === 'c' ? 'constellations' : 'talents';
    const key = group === 'constellations' ? clause : (clause[0] === 'a' ? 'passive' : 'combat') + (Number(clause.slice(1)) + 1);
    const id = entity.replace(/^(aether|lumine)-/, 'traveler');
    const path = capture + 'ChineseSimplified/' + group + '/' + id + '.json';
    return { text: read(path)[key].description.replaceAll('**', ''), ref: path + '#' + key };
  }

  function fromText(entity, clause, grant, index, target, role, phrase, makeCases, refs = []) {
    if (!characters.has(entity)) return;
    const { text, ref } = original(entity, clause);
    const values = phrase.exec(text)?.slice(1).map(Number);
    if (values?.length && values.every(Number.isFinite)) check(entity, clause, grant, index, target, role, [ref, ...refs], makeCases(values));
  }

  const charged = [
    ['aratakiitto', 'c6', 'c6.charged-crit', 'critDamage', /重击的暴击伤害提高(\d+)%/, 'normal.param6'],
    ['noelle', 'c2', 'c2.combat-maid', 'damageBonus', /伤害提升(\d+)%/, 'normal.param5'],
  ];
  for (const [entity, clause, grant, target, phrase, hit] of charged) {
    fromText(entity, clause, grant, 0, attribute(target), 'owner', phrase, ([amount]) =>
      [caseOf(amount / 100, { hit }), caseOf(0, { hit: 'normal.param1' })]);
  }

  for (const [entity, clause, grant, target, phrase, hits, excluded] of [
    ['durin', 'c6', 'c6.burst-defense-ignore', 'defenseIgnore', /元素爆发伤害将无视敌人(\d+)%/, ['burst.param7', 'burst.param8'], 'skill.param1'],
    ['durin', 'c6', 'c6.black-dragon-defense-ignore', 'defenseIgnore', /黑蚀之龙」造成的伤害将额外无视敌人(\d+)%/, ['burst.param4', 'burst.param8'], 'burst.param7'],
    ['kinich', 'c1', 'c1.cannon-crit', 'critDamage', /迴猎贯鳞炮的暴击伤害提升(\d+)%/, ['skill.param2'], 'skill.param1'],
    ['kinich', 'c4', 'c4.dragon-damage', 'damageBonus', /向伟大圣龙致意造成的伤害提升(\d+)%/, ['burst.param1', 'burst.param2'], 'skill.param2'],
    ['layla', 'c6', 'c6.stellar-stars', 'damageBonus', /飞星造成的伤害提升(\d+)%，星流摇床之梦的星光弹造成的伤害提升(\d+)%/, ['skill.param2', 'burst.param1'], 'skill.param1'],
  ]) {
    fromText(entity, clause, grant, 0, attribute(target), 'owner', phrase, amounts =>
      [...hits.map((hit, i) => caseOf((amounts[i] ?? amounts[0]) / 100, { hit })), caseOf(0, { hit: excluded })]);
  }

  fromText('kinich', 'c2', 'c2.first-cannon', 0, attribute('damageBonus'), 'owner', /首次迴猎贯鳞炮[^。]*造成的伤害提升(\d+)%/, ([amount]) => [
    caseOf(amount / 100, { hit: 'skill.param2', values: fact('kinich.firstCannon') }),
    caseOf(0, { hit: 'skill.param2', values: fact('kinich.firstCannon', false) }),
    caseOf(0, { hit: 'skill.param1', values: fact('kinich.firstCannon') }),
  ]);
  fromText('amber', 'c4', 'doll-cooldown', 0, attribute('elementalSkillCooldownReduction'), 'owner', /冷却时间减少(\d+)%/, ([amount]) =>
    [caseOf(amount / 100), caseOf(0, { constellation: 3 })]);
  fromText('citlali', 'c2', 'c2.mastery', 0, attribute('elementalMastery'), 'owner', /茜特菈莉的元素精通提升(\d+)点/, ([amount]) =>
    [caseOf(amount), caseOf(0, { constellation: 1 }), caseOf(0, { recipient: 'kaeya', party: ['kaeya'] })]);
  fromText('citlali', 'c2', 'c2.shield-mastery', 0, attribute('elementalMastery'), 'team', /其他角色的元素精通提升(\d+)点/, ([amount]) => [
    caseOf(amount, { recipient: 'kaeya', party: ['kaeya'], recipientValues: fact('citlali.whiteShieldOrItzpapa') }),
    caseOf(0, { recipient: 'kaeya', party: ['kaeya'], recipientValues: fact('citlali.whiteShieldOrItzpapa', false) }),
  ]);
  fromText('barbara', 'c2', 'c2.melody-loop-hydro', 0, attribute('hydroBonus'), 'team', /当前场上自己的角色获得(\d+)%水元素伤害加成/, ([amount]) => [
    caseOf(amount / 100, { recipient: 'mona', party: ['mona'], values: fact('barbara.melodyLoop') }),
    caseOf(0, { recipient: 'mona', party: ['mona'], values: fact('barbara.melodyLoop'), onField: false }),
    caseOf(0, { recipient: 'mona', party: ['mona'], values: fact('barbara.melodyLoop', false) }),
  ]);

  fromText('aino', 'c1', 'c1.field-mastery', 1, attribute('elementalMastery'), 'team',
    /当前场上其他角色的元素精通提升(\d+)点，持续(\d+)秒/, ([amount, seconds]) => {
      const peer = { party: ['kaeya'], recipient: 'kaeya' };
      return [caseOf(amount, { ...peer, ...casts('skill') }), caseOf(amount, { ...peer, ...casts('burst') }),
        caseOf(0, { ...peer, ...casts('skill', seconds * 1000) }), caseOf(0, { ...peer, ...casts('skill'), onField: false }),
        caseOf(0, casts('skill'))];
    });
  fromText('ifa', 'a1', 'a1.nightsoul-burst-mastery', 0, attribute('elementalMastery'), 'owner',
    /伊法的元素精通提升(\d+)点，持续(\d+)秒/, ([amount, seconds]) => {
      const trigger = { kind: 'state-change', actorId: 'kinich', facts: fact('nightsoulBurst', bool(true)) };
      const party = ['kinich'];
      return [caseOf(amount, { trigger, party }), caseOf(0, { trigger, party, timeMs: seconds * 1000 }), caseOf(0, { party })];
    });
  fromText('ifa', 'c4', 'c4.sedation-mastery', 0, attribute('elementalMastery'), 'owner',
    /伊法的元素精通提升(\d+)点，持续(\d+)秒/, ([amount, seconds]) =>
      [caseOf(amount, casts('burst')), caseOf(0, casts('burst', seconds * 1000)), caseOf(0, casts('skill'))]);

  const oni = fact('aratakiitto.oniKingActive');
  const noOni = fact('aratakiitto.oniKingActive', false);
  for (const [index, element] of elements.entries()) {
    fromText('aratakiitto', 't2', 't2.oni-king', index + 2, attribute('resistance.' + element), 'owner',
      /所有元素抗性与物理抗性降低(\d+)%/, ([amount]) =>
        [caseOf(-amount / 100, { values: oni }), caseOf(0, { values: noOni })]);
  }
  check('aratakiitto', 't2', 't2.oni-king', 1, attribute('normalAttackSpeed'), 'owner',
    [tablePath + '#aratakiitto/combat3/param1', original('aratakiitto', 't2').ref],
    [caseOf(rates.aratakiitto.combat3.param1[0], { values: oni }), caseOf(0, { values: noOni })]);
  const defense = growth.aratakiitto.stats.base.defense;
  check('aratakiitto', 't2', 't2.oni-king', 0, attribute('attack'), 'owner',
    [tablePath + '#aratakiitto/combat3/param2', growthPath + '#aratakiitto/stats/base/defense', original('aratakiitto', 't2').ref],
    [caseOf(defense * rates.aratakiitto.combat3.param2[0], { values: { ...oni, 'aratakiitto.defenseAtOniKing': defense } }),
      caseOf(0, { values: { ...noOni, 'aratakiitto.defenseAtOniKing': defense } })]);

  const yelanTeams = [[], ['kaeya'], ['kaeya', 'amber'], ['kaeya', 'amber', 'noelle']];
  for (const index of [1, 2, 3]) {
    const party = yelanTeams[index];
    const duplicate = ['kaeya', 'kamisatoayaka', 'amber'];
    fromText('yelan', 'a0', 'a0.turn-control', index, attribute('hpPercent'), 'owner',
      /1\/2\/3\/4种元素类型[^。]*生命值上限提升(\d+)%\/(\d+)%\/(\d+)%\/(\d+)%/, amounts => [
        caseOf(amounts[index] / 100, { party }),
        caseOf(0, { party: index === 3 ? duplicate : yelanTeams[index + 1] }),
        caseOf(0, { party, ascension: 0 }),
      ]);
  }

  for (const [index, party, recipient] of [[0, ['kaeya'], 'gorou'], [1, ['noelle'], 'noelle'], [2, ['noelle', 'albedo'], 'noelle']]) {
    const geo = { party, recipient, hit: index === 0 ? 'skill.param1' : 'burst.param1' };
    const wrongParty = index === 0 ? { ...geo, party: ['noelle'] } : { ...geo, party: index === 1 ? ['noelle', 'albedo'] : ['noelle'] };
    fromText('gorou', 'c6', 'banner-c6-' + (index + 1), 0, attribute('critDamage'), 'team',
      /后的(\d+)秒内[^。]*「坚牢」：提高(\d+)%；\s*·「难破」：提高(\d+)%；\s*·「摧碎」：提高(\d+)%/, ([duration, ...amounts]) => [
        caseOf(amounts[index] / 100, { ...geo, ...casts('skill') }),
        caseOf(amounts[index] / 100, { ...geo, ...casts('burst') }),
        caseOf(0, { ...wrongParty, ...casts('skill') }),
        caseOf(0, { ...geo, ...casts('skill', duration * 1000) }),
        caseOf(0, { ...geo, ...casts('skill'), hit: 'normal.param1' }),
      ]);
  }

  const lunarHits = ['skill.param3', 'skill.param4', 'skill.param5'];
  const lunarFamilies = ['lunar-charged', 'lunar-bloom', 'lunar-crystallize'];
  for (const [index, hit] of lunarHits.entries()) {
    const hp = growth.columbina.stats.base.hp;
    const active = fact('columbina.interferenceC4');
    const glare = fact('columbina.' + lunarFamilies[index] + 'Interference');
    fromText('columbina', 'c4', 'c4-interference', index, attribute('reaction.lunar.flatBaseBonus'), 'owner',
      /生命值上限的([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, amounts => [
        caseOf(hp * amounts[index] / 100, { hit, values: { ...active, ...glare }, family: lunarFamilies[index] }),
        caseOf(0, { hit, values: { ...glare, 'columbina.interferenceC4': false }, family: lunarFamilies[index] }),
        caseOf(0, { hit: lunarHits[(index + 1) % lunarHits.length], values: active, family: lunarFamilies[(index + 1) % lunarHits.length] }),
      ], [growthPath + '#columbina/stats/base/hp']);
  }

  for (const rank of [1, 2, 3, 4, 5, 6]) {
    fromText('columbina', 'c' + rank, 'c' + rank + '-elevation', 0, attribute('reaction.lunar.elevationFactor'), 'team',
      /月曜反应伤害擢升([\d.]+)%/, ([amount]) => {
        const peer = { party: ['nefer'], recipient: 'nefer' };
        const lunar = { ...peer, hit: 'skill.phantasm-shadow-1', family: 'lunar-bloom' };
        return [caseOf(amount / 100, lunar), caseOf(0, { ...lunar, constellation: rank - 1 }),
          caseOf(0, { ...peer, hit: 'skill.param1', family: 'ordinary' })];
      });
  }

  for (const [index, key] of ['critRate', 'critDamage'].entries()) {
    fromText('lauma', 'a0', 'skill-first-moon', index, attribute('reaction.transformative.' + key), 'team',
      /后的(\d+)秒内[^。]*。[\s\S]*?暴击率固定为(\d+)%，暴击伤害固定为(\d+)%/, ([duration, ...amounts]) => {
        const probe = { ...casts('skill'), party: ['mona'], recipient: 'mona', family: 'transformative', reactionElement: 'dendro',
          values: { firstMoonsign: true } };
        return [...['bloom', 'hyperbloom', 'burgeon'].map(reaction => caseOf(amounts[index] / 100, { ...probe, reaction,
          ...(reaction === 'hyperbloom' ? { party: ['mona', 'lisa'], recipient: 'lisa' } : {}),
          ...(reaction === 'burgeon' ? { party: ['mona', 'amber'], recipient: 'amber' } : {}),
        })), caseOf(0, { ...probe, reaction: 'electro-charged', reactionElement: 'electro', party: ['mona', 'lisa'], recipient: 'lisa' }),
        caseOf(0, { ...probe, reaction: 'bloom', timeMs: duration * 1000 }),
        caseOf(0, { ...probe, reaction: 'bloom', party: ['mona', 'nefer'], values: { firstMoonsign: true, fullMoonsign: true } })];
      });
    fromText('lauma', 'a0', 'skill-full-moon', index, attribute(key), 'team',
      /后的(\d+)秒内[\s\S]*?月绽放反应伤害，暴击率提升(\d+)%，暴击伤害提升(\d+)%/, ([duration, ...amounts]) => {
        const probe = { ...casts('skill'), party: ['nefer'], recipient: 'nefer', hit: 'skill.phantasm-shadow-1',
          family: 'lunar-bloom', values: { firstMoonsign: true, fullMoonsign: true } };
        return [caseOf(amounts[index] / 100, probe), caseOf(0, { ...probe, timeMs: duration * 1000 }),
          caseOf(0, { ...probe, values: { firstMoonsign: true, fullMoonsign: false } }),
          caseOf(0, { ...probe, hit: 'skill.param1', family: 'ordinary' })];
      });
  }

  const hp = growth.furina.stats.base.hp;
  const center = fact('furina.c6Center');
  const pneuma = fact('furina.pneuma');
  const attack = { hit: 'normal.c6-param1', values: { ...center, ...pneuma } };
  for (const [grant, phrase, tests] of [
    ['c6-center', /提升值相当于芙宁娜生命值上限的(\d+)%/, [{ ...attack, values: { 'furina.c6Center': false, ...pneuma } }]],
    ['c6-pneuma', /伤害进一步提高，提升值相当于芙宁娜生命值上限的(\d+)%/,
      [{ ...attack, values: { ...center, 'furina.pneuma': false } }, { ...attack, hit: 'normal.c6-param7' }]],
  ]) {
    fromText('furina', 'c6', grant, 0, attribute('baseDamageBonus'), 'owner', phrase, ([amount]) =>
      [caseOf(hp * amount / 100, attack), ...tests.map(probe => caseOf(0, probe))], [growthPath + '#furina/stats/base/hp']);
  }
  return output;
}
