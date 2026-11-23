import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { auditBuild, auditHit, bool, elements, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalogue = 'tools/data/sources/catalog/genshin-db/';
const ratesPath = sourceRoot + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const growth = read(catalogue + 'characters.json');
const curves = read(catalogue + 'character-curves.json');
const rates = read(ratesPath);
const equipment = read(catalogue + 'sets.json');
const levelAtAscension = [1, 20, 40, 50, 60, 70, 80];
const owner = 'actor', peer = 'peer';
const subject = id => ({ kind: 'actor', id });
const flag = value => value === null ? fact(null) : bool(value);
const quantity = (unit, value) => value === null ? fact(null) : number(unit, value);
const incoming = 'attribute.incomingDamageReduction', enemyReduction = 'target.ordinaryDamageReduction';
const pyro = 'attribute.resistance.pyro', enemyPyro = 'target.resistance.pyro';
const raw = 'attribute.shieldAbsorption', effective = 'attribute.effectiveShieldAbsorption', strength = 'attribute.shieldStrength';
const healingBonus = 'attribute.healingBonus', incomingHealing = 'attribute.incomingHealingBonus';
const mainCurtain = 'layla.curtainOfSlumberActive', coopCurtain = 'layla.curtainOfSlumberCoopShield';
const bond = 'sigewinne.partyBondOfLife';
const kaeya = 'kaeya';

function num(text, pattern) {
  const value = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(value)) throw new Error('固定资料缺少数值：' + pattern.source);
  return value;
}
const percent = (text, pattern) => num(text, pattern) / 100;
const sourcePath = (group, id) => sourceRoot + 'ChineseSimplified/' + group + '/' + id + '.json';
const reference = id => ({ namespace: 'builtin', id, revision: '1' });

function panel(build, stat) {
  const id = build.character.id, stats = growth[id].stats, promoted = stats.promotion[build.ascension];
  const known = stat === 'hp'
    ? (stats.base.hp * curves[build.level][stats.curve.hp] + promoted.hp) * (1 + (stats.specialized === 'FIGHT_PROP_HP_PERCENT' ? promoted.specialized : 0))
    : stats.specialized === 'FIGHT_PROP_ELEMENT_MASTERY' ? promoted.specialized : 0;
  return { value: known, sources: [catalogue + 'characters.json#' + id, catalogue + 'character-curves.json#' + build.level] };
}

export const remainingPartyDefenseIds = ['dehya', 'emilie', 'layla', 'lauma', 'sigewinne'];

export async function auditRemainingPartyDefense(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map((entities.sets ?? []).map(set => [set.id, set]));
  const starter = id => weapons.get(novice[characters.get(id)?.identity.weaponType]);
  const teams = new Map();

  function build(id, { ascension = 0, level = levelAtAscension[ascension], constellation = 0, skill = 1, set: setId } = {}) {
    const set = sets.get(setId);
    return { ...auditBuild(characters.get(id), starter(id), set ? [set] : []), ascension, level, constellation,
      talents: { normal: 1, skill, burst: 1 }, ...set && { theoreticalSetSlots: set.slots.slice(0, 2).map(slot => ({ slot, setId })) } };
  }

  function measure(id, settings, { recipient = owner, ownerOnField = recipient === owner, peerOnField = recipient === peer,
    actorFacts = {}, teamFacts = {}, eventFacts = {} }, keys) {
    const key = JSON.stringify([id, settings]);
    if (!teams.has(key)) {
      const prepared = engine.prepareStructuredBuilds([{ id: owner, build: build(id, settings) }, { id: peer, build: build(kaeya) }]);
      if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
      teams.set(key, prepared.team);
    }
    const team = teams.get(key), character = characters.get(id), dealer = recipient === owner ? character : characters.get(kaeya);
    const talent = dealer.talents[0], hit = talent.hits[0];
    const { setup, request } = auditHit(dealer, talent, hit);
    setup.events[0].actorId = recipient;
    setAuditDefaults(character, request.frame);
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      facts: { ...request.frame.facts, ...eventFacts },
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin, element: hit.element, reactionId: null } };
    for (const [subjectKey, values] of [[subject(owner), { onField: flag(ownerOnField), ...actorFacts[owner] }],
      [subject(peer), { onField: flag(peerOnField), ...actorFacts[peer] }], [{ kind: 'team' }, teamFacts]]) {
      let row = frame.factOverrides.find(entry => entry.subject.kind === subjectKey.kind && entry.subject.id === subjectKey.id);
      if (!row) frame.factOverrides.push(row = { subject: subjectKey, facts: {} });
      Object.assign(row.facts, values);
    }
    const bindings = Object.fromEntries(keys.map(id => [id, { ...id.startsWith('target.') ? { kind: 'enemy' }
      : { kind: 'attribute', actor: { role: 'recipient' } }, key: reference(id), at: { kind: 'current', phase: 'same' } }]));
    const context = engine.createStructuredCombatContext(team, setup);
    return engine.evaluateCombatBindings(team.program, context, bindings, frame);
  }

  function heal(id, settings, healId, input) {
    const { recipient = peer, onField = true, ownerFacts = {}, recipientFacts = {}, teamFacts = {}, eventFacts = {}, peerSet } = input;
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    const ownerBuild = build(id, settings), healer = addActorFromBuild(project, ownerBuild);
    const { namespace, revision } = ownerBuild.character;
    const friend = addActorFromBuild(project, build(kaeya, { set: peerSet }));
    const receiver = recipient === owner ? healer : friend;
    const receiverFacts = { onField: flag(onField), ...recipientFacts };
    const facts = [{ subject: subject(healer), values: receiver === healer ? { ...ownerFacts, ...receiverFacts } : ownerFacts },
      ...receiver !== healer ? [{ subject: subject(receiver), values: receiverFacts }] : [],
      { subject: { kind: 'team' }, values: teamFacts }, { subject: { kind: 'event' }, values: eventFacts }];
    project.timeline.push({ id: 'heal', kind: 'state-change', timeMs: 1000, order: 0, actor: healer, definition: project.candidate.actors[0].character,
      talentHeal: { definition: { namespace, id, revision }, healId, recipientId: receiver, facts } });
    const before = JSON.stringify(project);
    const result = engine.evaluateTimeline(project), changes = result.combatChanges?.filter(change => change.kind === 'talent-healing') ?? [];
    const [change] = changes;
    return { value: change?.healing ?? null, status: change?.status ?? 'missing', diagnostics: change?.missing ?? result.issues,
      valid: before === JSON.stringify(project) && changes.length === 1 && change.source === 'heal' && change.actor === healer
        && change.recipient === receiver && change.effect === healId };
  }

  function clause(entity, field, anchor, covered, remaining, run) {
    if (!starter(entity) || !starter(kaeya)) return;
    const path = sourcePath(field.startsWith('/passives') ? 'talents' : 'constellations', entity);
    const source = path + '#' + anchor, text = read(path)[anchor].description;
    const first = rows.length;
    function record(output, probe, sources, expected, expectedStatus, value, status, diagnostics, valid = true) {
      const matches = valid && status === expectedStatus && (expected === null ? value === null
        : value !== null && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9));
      rows.push({ entity, field, output, probe, sources: [source, ...sources], expected, expectedStatus, value, status,
        ...matches ? {} : { issue: '当次效果、受益人或来源算式不符', diagnostics } });
    }
    function attributes(settings, input, expected, sources = []) {
      const result = measure(entity, settings, input, Object.keys(expected));
      for (const [key, amount] of Object.entries(expected)) {
        const datum = result.outputs[key], status = datum?.state ?? 'missing';
        const value = status === 'known' && datum.value.kind === 'quantity' && datum.value.unit === ([raw, effective].includes(key) ? 'hp' : 'scalar')
          ? datum.value.value : null;
        record(key, { settings, input }, sources, amount, amount === null ? 'unknown' : 'known', value, status, result.diagnostics);
      }
    }
    function healing(settings, healId, input, amount, sources, expectedStatus = amount === null ? 'unknown' : amount === 0 ? 'excluded' : 'applied') {
      const { value, status, diagnostics, valid } = heal(entity, settings, healId, input);
      record(healId, { settings, input }, sources, amount, expectedStatus, value, status, diagnostics, valid);
    }
    run(text, attributes, healing);
    if (rows.length === first || rows.slice(first).some(row => row.issue)) return;
    verified.add(entity + field);
    resolved.push({ entity, field, resolved: covered, remaining });
    gaps.push({ entity, field, kind: '历史与特殊交互', sources: [source], needed: remaining, reason: remaining });
  }

  clause('dehya', '/passives/0', 'passive1', '确认赤鬃之血来伤与回收后的限次条件时，迪希雅自身获得60%当次减伤。',
    '仍需记录净焰剑狱回收、赤鬃之血分期伤害和6秒窗口内的2秒触发间隔。', (text, check) => {
      const reduction = percent(text, /受到的伤害降低(\d+)%/);
      for (const ascension of [0, 1]) for (const recipient of [owner, peer]) for (const [redmane, ready] of [
        [true, true], [true, false], [false, true], [true, null], [null, true], [null, false],
      ]) {
        const applies = ascension && recipient === owner && redmane !== false && ready !== false;
        check({ ascension }, { recipient, actorFacts: { [owner]: { 'dehya.redmaneBloodMitigationReady': flag(ready) },
          [peer]: { 'dehya.redmaneBloodMitigationReady': bool(true) } }, eventFacts: { 'dehya.incomingRedmaneBlood': flag(redmane) } },
        { [incoming]: !applies ? 0 : redmane === null || ready === null ? null : reduction, [enemyReduction]: 0 });
      }
    });

  clause('emilie', '/passives/2', 'passive3', '确认自身柔灯之匣在场时，附近队员仅对当次燃烧来伤获得85%火抗。',
    '需要独立记录柔灯之匣存续、来伤归属和受益者范围。', (text, check) => {
      const resistance = percent(text, /火元素抗性提升(\d+)%/);
      for (const recipient of [owner, peer]) for (const [burning, box, nearby] of [
        [true, true, true], [true, false, true], [false, true, true], [true, true, false], [true, null, true],
        [true, true, null], [null, true, true], [null, false, true],
      ]) {
        const amount = [burning, box, nearby].includes(false) ? 0 : [burning, box, nearby].includes(null) ? null : resistance;
        check({}, { recipient, actorFacts: {
          [owner]: { 'emilie.ownLumidouceCaseActive': flag(box), 'emilie.nearLumidouceCase': flag(recipient === owner ? nearby : nearby !== true) },
          [peer]: { 'emilie.nearLumidouceCase': flag(recipient === peer ? nearby : nearby !== true) },
        },
        eventFacts: { 'emilie.incomingBurningDamage': flag(burning) } }, { [pyro]: amount, [enemyPyro]: 0.1 });
      }
    });

  clause('layla', '/passives/0', 'passive1', '主护盾当前受益角色每层深眠获得6%护盾强效，最多4层。',
    '晚星生成、换人、护盾刷新和破裂决定层数历史。', (text, check) => {
      const rate = percent(text, /护盾强效提升(\d+)%/), cap = num(text, /至多叠加(\d+)次/);
      for (const ascension of [0, 1]) for (const recipient of [owner, peer]) for (const [active, onField, stacks] of [
        [true, true, 0], [true, true, 1], [true, true, 3], [true, true, cap], [true, true, cap + 1],
        [true, false, cap], [false, true, cap], [true, true, null], [null, true, cap],
      ]) {
        const applies = ascension && active !== false && onField;
        check({ ascension }, { recipient, ownerOnField: recipient === owner && onField, peerOnField: recipient === peer && onField,
          actorFacts: { [recipient]: { [mainCurtain]: flag(active), 'layla.deepSleepStacks': quantity('count', stacks) },
            [recipient === owner ? peer : owner]: { [mainCurtain]: bool(true), 'layla.deepSleepStacks': number('count', cap) } } },
        { [strength]: !applies ? 0 : stacks === null || active === null ? null : Math.min(stacks, cap) * rate });
      }
    });

  clause('layla', '/constellations/0', 'c1', '主护盾吸收量提高20%，符合条件的联机队友盾按主护盾吸收量35%计算，冰来伤按250%吸收。',
    '12秒到期、生成时的近距成员、主护盾归属和实例剩余量需独立记录。', (text, check) => {
      const increase = percent(text, /吸收量提高(\d+)%/), coopRate = percent(text, /安眠帷幕护盾(\d+)%/);
      const cryoRate = percent(text, /有(\d+)%的吸收效果/);
      const path = sourcePath('talents', 'layla'), skill = read(path).combat2;
      const [, ratio, flat] = skill.attributes.labels.find(label => label.startsWith('护盾基础吸收量|'))?.match(/\{(param\d+):[^}]+\}生命值上限\+\{(param\d+):I\}/) ?? [];
      if (!ratio || !flat) throw new Error('莱依拉固定资料缺少护盾基值倍率和固定值。');
      const c3 = sourcePath('constellations', 'layla');
      const rankBonus = num(read(c3).c3.description, /提高(\d+)级/);
      for (const settings of [{ constellation: 0 }, { constellation: 1 }, { constellation: 6, ascension: 6, level: 90, skill: 10 }]) {
        const hp = panel(build('layla', settings), 'hp');
        const index = (settings.skill ?? 1) + (settings.constellation >= 3 ? rankBonus : 0) - 1;
        const full = (hp.value * rates.layla.combat2[ratio][index] + rates.layla.combat2[flat][index]) * (1 + (settings.constellation ? increase : 0));
        for (const [recipient, main, coop, onField, element] of [
          [owner, true, false, true, 'cryo'], [owner, true, false, true, 'physical'], [owner, false, true, true, 'cryo'],
          [peer, false, true, true, 'cryo'], [peer, false, true, true, 'pyro'], [peer, false, true, true, null],
          [peer, true, true, true, 'cryo'], [peer, false, false, true, 'cryo'], [peer, false, null, true, 'cryo'],
          [peer, false, true, false, 'cryo'], [peer, null, false, true, 'cryo'],
        ]) {
          const amount = !onField ? 0 : main === null ? null : main ? full : recipient === peer && settings.constellation >= 1
            ? coop === null ? null : coop ? full * coopRate : 0 : 0;
          const other = recipient === owner ? peer : owner;
          check(settings, { recipient, ownerOnField: recipient === owner ? onField : true, peerOnField: recipient === peer ? onField : true,
            actorFacts: { [recipient]: { [mainCurtain]: flag(main), [coopCurtain]: flag(coop) },
              [other]: { [mainCurtain]: bool(other === owner), [coopCurtain]: bool(other === peer) } },
            eventFacts: { incomingShieldElement: fact(element ? { kind: 'enum', value: element } : null) } },
          { [raw]: amount, [effective]: amount === 0 ? 0 : amount === null || element === null ? null : amount * (element === 'cryo' ? cryoRate : 1) },
          [...hp.sources, path + '#combat2', c3 + '#c3', ratesPath + '#layla/combat2/' + ratio, ratesPath + '#layla/combat2/' + flat]);
        }
      }
    });

  clause('lauma', '/constellations/0', 'c1', '以菈乌玛精通500%计算确认有效的一次月绽放治疗，附近场上角色可以是她本人或队友。',
    '仍需根据战技或爆发、20秒存续、月绽放归属、距离与1.9秒限次自动识别该次触发；灵使形态仍需单独记录。', (text, _, check) => {
      const rate = percent(text, /菈乌玛元素精通的(\d+)%/);
      for (const settings of [{ constellation: 0, ascension: 4 }, { constellation: 1, ascension: 0 }, { constellation: 1, ascension: 4 }]) {
        const mastery = panel(build('lauma', settings), 'elementalMastery');
        for (const recipient of [owner, peer]) for (const [active, lunar, nearby, onField] of [
          [true, true, true, true], [false, true, true, true], [true, false, true, true], [true, true, false, true],
          [true, true, true, false], [true, null, true, true], [null, true, true, true], [true, true, null, true], [true, true, true, null],
        ]) {
          const gates = [active, lunar, nearby, onField];
          const amount = !settings.constellation || gates.includes(false) ? 0 : gates.includes(null) ? null : mastery.value * rate;
          check(settings, 'lauma.skill.heal.lifeweave', { recipient, onField, ownerFacts: { 'lauma.lifeweaveActive': flag(active) },
            recipientFacts: { 'lauma.lifeweaveNearby': flag(nearby) }, eventFacts: { 'lauma.lifeweaveLunarBloom': flag(lunar) } },
          amount, mastery.sources, amount === 0 && settings.constellation && gates.every(Boolean) ? 'applied' : undefined);
        }
      }
    });

  clause('sigewinne', '/passives/1', 'passive2', '按确认的队伍生命之契总值计算希格雯本次治疗加成，每1000点3%，上限30%。',
    '仍需逐角色生命之契记录来自动汇总本次治疗前的总值。', (text, check, checkHeal) => {
      const [, step, percentage] = text.match(/每(\d+)点生命之契都将提升(\d+)%治疗量/) ?? [];
      const rate = Number(percentage) / 100 / Number(step), cap = percent(text, /至多通过这种方式提升(\d+)%治疗量/);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('希格雯固定资料缺少生命之契治疗比例');
      const capBasis = Math.round(cap / rate);
      for (const ascension of [3, 4]) for (const value of [0, Number(step) / 2, Number(step), capBasis - 1, capBasis, capBasis + 1, null]) {
        const teamFacts = { [bond]: quantity('hp', value) };
        const bonus = ascension < 4 ? 0 : value === null ? null : Math.min(cap, value * rate);
        check({ ascension }, { teamFacts }, { [healingBonus]: bonus, [incomingHealing]: 0 });
        check({ ascension }, { recipient: peer, teamFacts }, { [healingBonus]: 0 });
        const hp = panel(build('sigewinne', { ascension }), 'hp'), skill = rates.sigewinne.combat2;
        const sources = [...hp.sources, ratesPath + '#sigewinne/combat2/param2', ratesPath + '#sigewinne/combat2/param3'];
        const base = hp.value * skill.param2[0] + skill.param3[0];
        checkHeal({ ascension }, 'sigewinne.skill.heal.param2', { teamFacts }, bonus === null ? null : base * (1 + bonus), sources);
        if (value === Number(step) || value === null) checkHeal({ ascension }, 'sigewinne.skill.heal.param4', { recipient: owner, teamFacts },
          bonus === null ? null : hp.value * skill.param4[0] * (1 + bonus), [...hp.sources, ratesPath + '#sigewinne/combat2/param4']);
        if (sets.has('maidenbeloved') && sets.has('travelingdoctor') && bonus !== null && value === Number(step)) {
          const outgoing = percent(equipment.maidenbeloved.effect2Pc, /提升(\d+)%/);
          const incoming = percent(equipment.travelingdoctor.effect2Pc, /提高(\d+)%/);
          checkHeal({ ascension, set: 'maidenbeloved' }, 'sigewinne.skill.heal.param2', { teamFacts, peerSet: 'travelingdoctor' },
            base * (1 + bonus + outgoing + incoming), [...sources, catalogue + 'sets.json#maidenbeloved', catalogue + 'sets.json#travelingdoctor']);
        }
      }
    });

  clause('sigewinne', '/passives/2', 'passive3', '水下确认触发后以受益者生命上限50%计算2.5秒总回复，并对有明确状态的同一角色应用-10%全元素和物理抗性。',
    '需水下生命变化、相邻触发间隔、各跳及其与治疗增益交互的独立记录。', (text, check, checkHeal) => {
      const threshold = percent(text, /降低至(\d+)%以下/), rate = percent(text, /生命值上限的(\d+)%/);
      const penalty = percent(text, /所有元素抗性和物理抗性下降(\d+)%/);
      for (const recipient of [owner, peer]) {
        const hp = panel(build(recipient === owner ? 'sigewinne' : kaeya), 'hp');
        for (const [eligible, onField, ratio] of [[true, true, threshold - .01], [true, true, threshold], [true, true, threshold + .01],
          [false, true, threshold - .01], [true, false, threshold - .01], [true, true, null], [null, true, threshold - .01], [true, null, threshold - .01]]) {
          const amount = eligible === false || onField === false || ratio >= threshold ? 0
            : eligible === null || onField === null || ratio === null ? null : hp.value * rate;
          checkHeal({}, 'sigewinne.skill.heal.acute-dosage-total', { recipient, onField, recipientFacts: { hpRatio: quantity('scalar', ratio),
            'sigewinne.acuteDosageEligible': flag(eligible) } }, amount, hp.sources);
        }
        for (const active of [true, false, null]) {
          const key = 'sigewinne.acuteDosageResistanceActive';
          check({}, { recipient, ownerOnField: false, peerOnField: false, actorFacts: { [recipient]: { [key]: flag(active) },
            [recipient === owner ? peer : owner]: { [key]: bool(active !== true) } } },
          { ...Object.fromEntries(elements.map(element => ['attribute.resistance.' + element, active === null ? null : active ? -penalty : 0])), [enemyPyro]: 0.1 });
        }
      }
      if (sets.has('travelingdoctor')) checkHeal({}, 'sigewinne.skill.heal.acute-dosage-total', { peerSet: 'travelingdoctor',
        recipientFacts: { hpRatio: number('scalar', threshold - .01), 'sigewinne.acuteDosageEligible': bool(true) } }, null,
      [catalogue + 'sets.json#travelingdoctor']);
    });

  return { rows, verified, resolved, gaps, summary: { remainingPartyDefenseCases: rows.length,
    remainingPartyDefenseMismatches: rows.filter(row => row.issue).length, verifiedRemainingPartyDefense: verified.size } };
}
