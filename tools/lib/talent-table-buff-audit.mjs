import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const genshinDb = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const kqm = 'KQM TCL@7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5:';
const ratesPath = genshinDb + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const sourceTalent = id => genshinDb + 'ChineseSimplified/talents/' + id + '.json';
const rates = read(ratesPath);
const growth = read(catalog + 'characters.json');
const curves = read(catalog + 'character-curves.json');
const weaponStats = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const converted = ['pyro', 'hydro', 'cryo', 'electro'];
const speed = 'attribute.normalAttackSpeed';
const incoming = 'attribute.incomingDamageReduction';
const sourceStat = (id, stat, level, ascension) => {
  const data = growth[id].stats;
  return data.base[stat] * curves[level][data.curve[stat]] + data.promotion[ascension][stat];
};
const weaponStat = (id, stat, level) => {
  const data = weaponStats[id].stats;
  return data.base[stat] * weaponCurves[level][data.curve[stat]];
};
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const current = { kind: 'current', phase: 'same' };
const actor = id => ({ kind: 'actor', id });
const target = id => ({ kind: 'target', id });
const ownerAndPeer = ['actor', 'peer'];
const toggles = [false, true];

/** Evaluates the compiled attribute effects against the upstream table and the source conditions. */
export function auditTalentTableBuffs(entities, engine) {
  const rows = [], verified = new Set();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peer = characters.get('kaeya');
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const finish = () => ({ rows, verified, summary: {
    talentTableBuffCases: rows.length, talentTableBuffMismatches: rows.filter(row => row.issue).length,
    verifiedTalentTableBuffDetails: verified.size,
  } });
  if (!peer || !starter(peer)) return finish();
  const peerBuild = auditBuild(peer, starter(peer));

  function scenario(character, category, talentRank, constellation, weapon = starter(character), weaponLevel = 1, elements = []) {
    const ascension = talentRank > 1 || constellation > 0 ? 6 : 0, level = ascension ? 90 : 1;
    const weaponAscension = weaponLevel > 1 ? 6 : 0;
    const build = { ...auditBuild(character, weapon), ascension, level, constellation, weaponLevel, weaponAscension,
      talents: { normal: 1, skill: 1, burst: 1, [category]: talentRank } };
    const source = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: peerBuild },
      ...elements.map((element, index) => ({ id: 'peer-' + index, element }))]);
    if (!source.ok) throw new Error(character.id + ': ' + JSON.stringify(source.diagnostics));
    return { team: source.team, character, build };
  }

  function measure({ team, character }, opts, attributes) {
    const recipient = opts.recipient ?? 'actor', dealer = recipient === 'actor' ? character : peer;
    const talent = dealer.talents.find(row => row.hits.some(hit => hit.id === opts.hit)) ?? dealer.talents[0];
    const hit = talent.hits.find(row => row.id === opts.hit) ?? talent.hits[0];
    const { setup, request } = auditHit(dealer, talent, hit);
    const targetId = opts.targetId ?? 'enemy';
    if (targetId !== 'enemy') setup.targets.push({ ...setup.targets[0], id: targetId });
    setup.events[0].actorId = recipient;
    setup.events[0].targetIds = [targetId];
    setAuditDefaults(character, request.frame);
    setGateFacts(character, request.frame, opts.owner ?? {});
    const actorOverride = request.frame.factOverrides.find(row => row.subject.kind === 'actor').facts;
    const targetOverride = request.frame.factOverrides.find(row => row.subject.kind === 'target');
    const facts = values => Object.fromEntries(Object.entries(values).map(([key, value]) =>
      [key, typeof value === 'boolean' ? bool(value) : number(character.metadata.facts[key].type.unit, value)]));
    const factOverrides = [
      { subject: actor('actor'), facts: { ...actorOverride, onField: bool(recipient === 'actor' && opts.onField !== false),
        ...facts(opts.actor ?? {}) } },
      { subject: actor('peer'), facts: { onField: bool(recipient === 'peer' && opts.onField !== false),
        ...facts(opts.peer ?? {}) } },
      { subject: target('enemy'), facts: { ...targetOverride?.facts, ...facts(opts.target ?? {}) } },
      ...(targetId === 'enemy' ? [] : [{ subject: target(targetId), facts: facts(opts.otherTarget ?? {}) }]),
    ];
    const context = engine.createStructuredCombatContext(team, setup);
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, targetId, factOverrides,
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin, element: hit.element, reactionId: null } };
    const bindings = Object.fromEntries(attributes.map(id => [id, {
      ...(id.startsWith('target.') ? { kind: 'enemy' } : { kind: 'attribute', actor: { role: 'recipient' } }), key: ref(id), at: current,
    }]));
    return engine.evaluateCombatBindings(team.program, context, bindings, frame);
  }

  function detail(id, index, row, label, extras, run) {
    const character = characters.get(id);
    if (!character || !starter(character)) return;
    const rawId = 'combat' + (index + 1), path = sourceTalent(id);
    const template = read(path)[rawId].attributes.labels.find(line => line.startsWith(label + '|'));
    const parameter = template?.match(/\{(param\d+):/)?.[1];
    const table = rates[id][rawId][parameter];
    if (!table) throw new Error(id + ': 固定来源缺少' + label);
    const field = '/talents/' + index + '/details/' + row;
    const sources = [path + '#' + rawId, ratesPath + '#' + id + '/' + rawId + '/' + parameter, ...extras];
    const start = rows.length;
    const check = (team, probe, expected, opts) => {
      const result = measure(team, opts, Object.keys(expected));
      for (const [attribute, wanted] of Object.entries(expected)) {
        const output = result.outputs[attribute];
        const value = output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
        const matches = Number.isFinite(value) && Number.isFinite(wanted) && Math.abs(value - wanted) <= Math.max(1e-9, Math.abs(wanted) * 1e-9);
        rows.push({ entity: id, field, sources, attribute, ...probe, expected: wanted, value,
          ...matches ? {} : { issue: '当前战斗属性与原文及等级曲线不符', diagnostics: result.diagnostics } });
      }
    };
    run(character, rank => table[rank - 1], check);
    if (rows.length > start && rows.slice(start).every(row => !row.issue)) verified.add(id + field);
  }

  detail('alyosha', 1, 4, '猎者之准攻击力提升', [kqm + 'src/data/characters/Alyosha.json', genshinDb + 'ChineseSimplified/constellations/alyosha.json#c6'], (character, rate, check) => {
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 6, 13]]) {
      const team = scenario(character, 'skill', talent, constellation);
      for (const recipient of ownerAndPeer) for (const onField of toggles) for (const active of toggles) {
        for (const stacks of constellation === 6 ? [1, 2] : [1]) {
          const facts = { 'alyosha.hunterPrecision': active, 'alyosha.hunterPrecisionStacks': stacks };
          check(team, { rank, constellation, recipient, onField, active, stacks },
            { 'attribute.attackPercent': active && onField ? rate(rank) * stacks : 0 }, { recipient, onField, [recipient]: facts });
        }
      }
    }
  });

  detail('cyno', 2, 9, '元素精通提升', [sourceTalent('cyno') + '#passive2'], (character, rate, check) => {
    const bonus = Number(read(sourceTalent('cyno')).passive2.description.match(/元素精通的(\d+)%；/)?.[1]) / 100;
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 3, 13]]) {
      const team = scenario(character, 'burst', talent, constellation);
      for (const recipient of ownerAndPeer) for (const onField of toggles) for (const active of toggles) {
        const mastery = recipient === 'actor' && active && onField ? rate(rank) : 0;
        const hit = 'cyno.burst.param1';
        const expected = { 'attribute.elementalMastery': mastery,
          ...(recipient === 'actor' ? { 'attribute.baseDamageBonus': team.build.ascension >= 4 ? mastery * bonus : 0 } : {}) };
        check(team, { rank, recipient, onField, active }, expected, { recipient, onField, hit, owner: { 'cyno.pactsworn': active } });
      }
    }
  });

  detail('dehya', 1, 3, '消解减免', [kqm + 'docs/characters/pyro/dehya.md'], (character, rate, check) => {
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 5, 13]]) {
      const team = scenario(character, 'skill', talent, constellation);
      for (const recipient of ownerAndPeer) for (const onField of toggles) {
        for (const [fieldActive, inRange, eligible] of [[false, true, true], [true, false, true], [true, true, false], [true, true, true]]) {
          check(team, { rank, recipient, onField, fieldActive, inRange, eligible },
            { [incoming]: fieldActive && inRange && eligible && onField ? rate(rank) : 0, 'target.ordinaryDamageReduction': 0 },
            { recipient, onField, owner: { 'dehya.fierySanctumActive': fieldActive, 'dehya.redmaneBloodCanTakeHit': eligible },
              [recipient]: { 'dehya.insideFierySanctum': inRange } });
        }
      }
    }
  });

  detail('eula', 1, 3, '防御力提升', [catalog + 'characters.json#eula', catalog + 'character-curves.json'], (character, rate, check) => {
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 5, 13]]) {
      const team = scenario(character, 'skill', talent, constellation);
      const base = sourceStat('eula', 'defense', team.build.level, team.build.ascension);
      for (const stacks of [0, 1, 2]) check(team, { rank, stacks },
        { 'attribute.defense': base * (1 + rate(rank) * stacks) }, { owner: { 'eula.grimheartStacks': stacks } });
    }
  });

  detail('hutao', 1, 1, '攻击力提高', [catalog + 'characters.json#hutao', catalog + 'character-curves.json', catalog + 'weapons.json',
    catalog + 'weapon-curves.json'], (character, rate, check) => {
    const maximum = Number(read(sourceTalent('hutao')).combat2.description.match(/基础攻击力的(\d+)%/)?.[1]) / 100;
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 3, 13]]) {
      for (const [weaponId, weaponLevel] of [['beginnersprotector', 1], ['blacktassel', 90]]) {
        const weapon = weapons.get(weaponId);
        if (!weapon) continue;
        const team = scenario(character, 'skill', talent, constellation, weapon, weaponLevel);
        const { level, ascension, weaponAscension } = team.build;
        const white = sourceStat('hutao', 'attack', level, ascension) + weaponStat(weaponId, 'attack', weaponLevel)
          + weaponStats[weaponId].stats.promotion[weaponAscension].attack;
        const hp = sourceStat('hutao', 'hp', level, ascension)
          * (1 + (weaponId === 'blacktassel' ? weaponStat(weaponId, 'specialized', weaponLevel) : 0));
        for (const onField of toggles) for (const active of toggles) {
          const expected = white + (active && onField ? Math.min(white * maximum, hp * rate(rank)) : 0);
          check(team, { rank, weaponId, weaponLevel, onField, active, hp }, { 'attribute.attack': expected },
            { onField, owner: { 'hutao.paramitaPapilio': active, 'hutao.hpAtParamita': hp } });
        }
      }
    }
  });

  detail('mika', 1, 3, '攻击速度提升', [], (character, rate, check) => {
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 5, 13]]) {
      const team = scenario(character, 'skill', talent, constellation);
      for (const recipient of ownerAndPeer) for (const onField of toggles) for (const active of toggles) {
        check(team, { rank, recipient, onField, active }, { [speed]: active && onField ? rate(rank) : 0 },
          { recipient, onField, [recipient]: { 'mika.soulwindActive': active } });
      }
    }
  });

  detail('razor', 1, 2, '雷之印充能效率提升', [kqm + 'docs/characters/electro/razor.md'], (character, rate, check) => {
    const hunger = Number(read(sourceTalent('razor')).passive2.description.match(/元素充能效率提高(\d+)%/)?.[1]) / 100;
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 5, 13]]) {
      const team = scenario(character, 'skill', talent, constellation);
      for (const recipient of ownerAndPeer) for (const stacks of [0, 1, 2, 3]) for (const energyBelowHalf of toggles) {
        const expected = recipient === 'actor' ? 1 + stacks * rate(rank) + (team.build.ascension >= 4 && energyBelowHalf ? hunger : 0) : 1;
        check(team, { rank, recipient, stacks, energyBelowHalf }, { 'attribute.energyRecharge': expected },
          { recipient, owner: { 'razor.electroSigils': stacks, 'razor.energyBelowHalf': energyBelowHalf } });
      }
    }
  });

  for (const [row, label, attribute] of [[2, '普通攻击速度提升', speed], [3, '雷元素抗性提升', 'attribute.resistance.electro']]) {
    detail('razor', 2, row, label, [kqm + 'docs/characters/electro/razor.md'], (character, rate, check) => {
      for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 3, 13]]) {
        const team = scenario(character, 'burst', talent, constellation);
        for (const recipient of ownerAndPeer) for (const onField of toggles) for (const active of toggles) {
          check(team, { rank, recipient, onField, active }, { [attribute]: recipient === 'actor' && active && onField ? rate(rank) : 0 },
            { recipient, onField, owner: { 'razor.wolfWithin': active } });
        }
      }
    });
  }

  detail('xilonen', 1, 1, '元素抗性降低', [kqm + 'src/data/characters/Xilonen.json'], (character, rate, check) => {
    for (const [talent, constellation, rank] of [[1, 0, 1], [10, 0, 10], [10, 3, 13]]) {
      for (const members of [[], ['pyro', 'geo'], ['pyro', 'pyro'], ['hydro', 'electro']]) {
        const team = scenario(character, 'skill', talent, constellation, starter(character), 1, members);
        for (const [active, nightsoul] of [[false, false], [false, true], [true, false], [true, true]]) {
          for (const [recipient, targetId, inRange] of [['actor', 'enemy', true], ['peer', 'enemy', true], ['peer', 'other', false]]) {
            const elements = [...converted, 'geo', 'physical', 'anemo', 'dendro'];
            const lineup = ['cryo', ...members];
            const switched = lineup.filter(element => converted.includes(element));
            const allActive = active && team.build.ascension >= 1 && switched.length >= 2;
            const matched = element => element === 'geo' ? switched.length < 3 && (allActive || nightsoul || constellation >= 2)
              : allActive && switched.includes(element);
            const expected = Object.fromEntries(elements.map(element => ['target.resistance.' + element, .1 - (inRange && matched(element) ? rate(rank) : 0)]));
            check(team, { rank, constellation, members, recipient, targetId, inRange, active, nightsoul }, expected,
              { recipient, targetId, owner: { 'xilonen.sourceSamplesActive': active, 'xilonen.nightsoul': nightsoul },
                target: { 'xilonen.targetInSamplerRange': true }, otherTarget: { 'xilonen.targetInSamplerRange': inRange } });
          }
        }
      }
    }
  });

  return finish();
}
