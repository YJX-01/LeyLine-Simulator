import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const source = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const table = source + 'stats/talents.json';
const rates = read(table);
const growth = read(catalog + 'characters.json');
const curves = read(catalog + 'character-curves.json');
const weaponGrowth = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const lifecyclePath = 'tools/data/sources/catalog/combat-lifecycle.json';
const attachmentRates = read(lifecyclePath).stellarConduct.coefficients;
const categories = ['normal', 'skill', 'burst'];
const attr = key => ({ kind: key.startsWith('target.') ? 'enemy' : 'attribute',
  ...!key.startsWith('target.') && { actor: { role: 'recipient' } },
  key: { namespace: 'builtin', id: key, revision: '1' }, at: { kind: 'current', phase: 'same' } });
const actor = id => ({ kind: 'actor', id });
const baseDamage = 'attribute.baseDamageBonus';
const damageBonus = 'attribute.damageBonus';
const attack = 'attribute.attack';
const receivers = ['actor', 'peer'];

function rawTalent(id, slot, detail) {
  const upstreamId = id.replace(/^(?:aether|lumine)-/, 'traveler');
  const group = 'combat' + (slot + 1);
  const talentPath = source + 'ChineseSimplified/talents/' + upstreamId + '.json';
  const constellationPath = source + 'ChineseSimplified/constellations/' + upstreamId + '.json';
  const talent = read(talentPath)[group], constellations = read(constellationPath);
  const [label, template] = talent.attributes.labels[detail].split('|');
  const parameters = [...template.matchAll(/\{(param\d+):/g)].map(match => match[1]);
  const bonus = [3, 5].find(rank => constellations['c' + rank]?.description.includes(talent.name));
  const sources = [talentPath + '#' + group + '/attributes/labels/' + detail, talentPath + '#' + group + '/description',
    ...parameters.map(parameter => table + '#' + upstreamId + '/' + group + '/' + parameter),
    ...bonus ? [constellationPath + '#c' + bonus] : []];
  return { label, parameters, sources, talent, constellations, constellationPath, bonus,
    rate: (parameter, rank) => rates[upstreamId][group][parameter][rank - 1] };
}

function panel(build, stat) {
  const charId = build.character.id.replace(/^(aether|lumine)-.*/, '$1');
  const id = build.weapon.id, c = growth[charId].stats, w = weaponGrowth[id].stats;
  const cp = c.promotion[build.ascension], wp = w.promotion[build.weaponAscension];
  const specialized = (name) => (c.specialized === name ? cp.specialized : 0)
    + (w.specialized === name ? w.base.specialized * weaponCurves[build.weaponLevel][w.curve.specialized] + (wp.specialized ?? 0) : 0);
  const charBase = key => c.base[key] * curves[build.level][c.curve[key]] + cp[key];
  const whiteAttack = charBase('attack') + w.base.attack * weaponCurves[build.weaponLevel][w.curve.attack] + wp.attack;
  const values = {
    hp: () => charBase('hp') * (1 + specialized('FIGHT_PROP_HP_PERCENT')),
    defense: () => charBase('defense') * (1 + specialized('FIGHT_PROP_DEFENSE_PERCENT')),
    attack: () => whiteAttack * (1 + specialized('FIGHT_PROP_ATTACK_PERCENT')),
    whiteAttack: () => whiteAttack,
    elementalMastery: () => specialized('FIGHT_PROP_ELEMENT_MASTERY'),
    healingBonus: () => specialized('FIGHT_PROP_HEAL_ADD'),
    hydroBonus: () => specialized('FIGHT_PROP_WATER_ADD_HURT'),
  };
  return values[stat]();
}

const targets = [
  ['aloy', 1, 2, 'aloy.frozenWildsAttackReduction', ['target.attackReduction'], 1, 0],
  ['eula', 1, 5, 'eula.grimheartShredApplied', ['target.resistance.physical'], -1, .1],
  ['eula', 1, 6, 'eula.grimheartShredApplied', ['target.resistance.cryo'], -1, .1],
  ['vodyanitsa', 1, 6, 'vodyanitsa.hornShred', ['target.resistance.hydro', 'target.resistance.cryo'], -1, .1],
];

/** Runs current calculation probes against the captured source talent rates and conditions. */
export function auditRemainingAttributeDetails(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const rows = [], resolved = [], gaps = [], verified = new Set(), teams = new Map();
  const kaeya = characters.get('kaeya');
  const finish = () => ({ rows, resolved, gaps, verified, summary: {
    remainingAttributeDetailCases: rows.length, remainingAttributeDetailMismatches: rows.filter(row => row.issue).length,
    verifiedRemainingAttributeDetails: verified.size, remainingAttributeDetailGaps: gaps.length,
  } });
  if (!kaeya || !starter(kaeya)) return finish();

  function scenario(character, slot, configuration, peer = kaeya) {
    const { level = 1, ascension = 0, talent = 1, constellation = 0, weapon, weaponLevel = 1 } = configuration;
    const key = JSON.stringify([character.id, slot, configuration, peer.id]);
    if (!teams.has(key)) {
      const build = { ...auditBuild(character, weapon ? weapons.get(weapon) : starter(character)), level, ascension, constellation, weaponLevel,
        weaponAscension: weaponLevel === 90 ? 6 : 0, talents: { normal: 1, skill: 1, burst: 1, [categories[slot]]: talent } };
      const peerBuild = auditBuild(peer, starter(peer));
      const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: peerBuild }]);
      if (!prepared.ok) throw new Error(character.id + ': ' + JSON.stringify(prepared.diagnostics));
      teams.set(key, { team: prepared.team, build, peerBuild });
    }
    return teams.get(key);
  }

  function measure(character, scenario, probe, output) {
    const { team, build, peerBuild } = scenario;
    const { recipient = 'actor', hit: suffix, values = {}, recipientValues = {}, peerValues = {}, ownerOnField = recipient === 'actor',
      onField = true, otherTarget = false, targetFacts = {}, application, cast, timeMs = 1000 } = probe;
    const dealer = recipient === 'actor' ? character : peerBuild.character;
    const talent = suffix ? dealer.talents.find(entry => entry.hits.some(hit => hit.id === dealer.id + '.' + suffix)) : dealer.talents[0];
    const hit = suffix ? talent.hits.find(entry => entry.id === dealer.id + '.' + suffix) : talent.hits[0];
    const { setup, request } = auditHit(dealer, talent, hit);
    const event = setup.events.at(-1), targetId = otherTarget ? 'other' : 'enemy';
    event.actorId = recipient;
    event.targetIds = [targetId];
    event.timeMs = timeMs;
    if (otherTarget) setup.targets.push({ ...setup.targets[0], id: targetId });
    if (cast) setup.events.unshift({ id: 'cast', kind: 'action', actorId: 'actor', targetIds: [], timeMs: 0, order: 0,
      skillId: character.id + '.' + cast, category: cast, sourceEventIds: [], facts: {} });
    const frame = request.frame;
    setAuditDefaults(character, frame);
    if (character !== dealer) setAuditDefaults(dealer, frame);
    setAuditDefaults(build.weapon, frame);
    const scoped = {};
    for (const [key, value] of Object.entries(values)) {
      const input = talent.inputs?.find(row => row.id === key);
      if (input) frame.facts[key] = number(input.type.unit, value);
      if (!input || character.metadata.facts?.[key]) scoped[key] = value;
    }
    setGateFacts(character, frame, scoped);
    const convertFacts = (input, definitions) => Object.fromEntries(Object.entries(input).map(([key, value]) => {
      const kind = definitions[key]?.type.kind;
      const unit = definitions[key]?.type.unit ?? 'scalar';
      return [key, typeof value === 'boolean' ? bool(value) : typeof value === 'number' ? number(unit, value)
        : kind === 'enum' ? fact({ kind: 'enum', value }) : fact(null)];
    }));
    const dealerFacts = convertFacts(recipientValues, character.metadata.facts);
    const peerFacts = convertFacts(peerValues, peerBuild.character.metadata.facts);
    const actorOverride = frame.factOverrides.find(row => row.subject.kind === 'actor').facts;
    Object.assign(actorOverride, { onField: bool(ownerOnField) });
    const peerDefaults = Object.fromEntries(Object.entries(character.metadata.facts ?? {})
      .filter(([, field]) => field.scope === 'recipient')
      .map(([key, field]) => [key, field.type.kind === 'quantity' ? number(field.type.unit, 0)
        : field.type.kind === 'boolean' ? bool(false) : actorOverride[key]]));
    const currentRecipientFacts = { ...dealerFacts, onField: bool(onField), hpRatio: number('scalar', probe.hpRatio ?? 1) };
    if (recipient === 'actor') {
      Object.assign(actorOverride, currentRecipientFacts);
      if (Object.keys(peerFacts).length) frame.factOverrides.push({ subject: actor('peer'), facts: { ...peerDefaults, ...peerFacts } });
    } else frame.factOverrides.push({ subject: actor(recipient), facts: { ...peerDefaults, ...peerFacts, ...currentRecipientFacts } });
    if (otherTarget) frame.factOverrides.push({ subject: { kind: 'target', id: targetId },
      facts: Object.fromEntries(Object.entries(targetFacts).map(([key, value]) => [key, bool(value)])) });
    if (application) frame.applications.push({ instanceId: engine.calculationEffectInstanceId('actor',
      { namespace: 'builtin', id: application, revision: '1' }, 'cast'), active: true });
    for (const target of setup.targets) {
      target.facts.targetHpRatio = number('scalar', .4);
      target.facts['aura.pyro'] = bool(false);
    }
    frame.targetId = targetId;
    const combatFrame = { ...frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: probe.family ?? 'ordinary', origin: hit.origin,
        element: hit.element, reactionId: probe.reaction ?? null } };
    const context = engine.createStructuredCombatContext(team, setup);
    if (output === 'hit.base') {
      const result = engine.evaluateStructuredHit(team, setup, { ...request, actorId: recipient, frame });
      const final = result.outputs.find(row => row.id === hit.id)?.value ?? result.totals.all;
      const root = result.outputs[0];
      const stage = root?.stages.find(row => ['skill-base', 'reaction-base'].includes(row.id))?.value;
      const node = result.trace.findLast(row => row.nodeId === 'skillBase' && row.definition.id === root?.computation.definition.id) ?? stage;
      return { status: node?.state ?? final.state, value: node?.state === 'known' && node.value?.kind === 'quantity' ? node.value.value : null,
        diagnostics: result.diagnostics };
    }
    const result = engine.evaluateCombatBindings(team.program, context, { [output]: attr(output) }, combatFrame);
    const evaluated = result.outputs[output], status = evaluated?.state ?? 'missing';
    return { status, value: status === 'known' && evaluated.value.kind === 'quantity' ? evaluated.value.value : null, diagnostics: result.diagnostics };
  }

  function detail(id, slot, index, scope, run, options = {}) {
    const character = characters.get(id), peer = characters.get(options.peer ?? 'kaeya');
    if (!character || !peer || !starter(character) || !starter(peer)) return;
    const field = '/talents/' + slot + '/details/' + index;
    const reference = rawTalent(id, slot, index);
    const { label, parameters, sources, bonus } = reference;
    const authored = character.metadata.talents[slot].details[index];
    if (label !== authored.label || !parameters.length || parameters.some(parameter => !authored.template.includes('{' + parameter + ':'))) {
      throw new Error(id + field + ': 详情与固定来源的标签或参数未对齐。');
    }
    const start = rows.length;
    const legal = [{}, { level: 90, ascension: 6, talent: 10 },
      ...bonus && !options.withoutConstellation ? [{ level: 90, ascension: 6, talent: 10, constellation: bonus }] : []];
    for (const configuration of [...legal, ...options.configurations ?? []]) {
      const prepared = scenario(character, slot, configuration, peer), { build, peerBuild } = prepared;
      const rank = build.talents[categories[slot]] + (bonus && build.constellation >= bonus ? 3 : 0);
      const rate = parameter => reference.rate(parameter ?? parameters[0], rank);
      const stat = (key, recipient = 'actor') => panel(recipient === 'actor' ? build : peerBuild, key);
      const check = (output, expected, probe = {}, details = {}) => {
        const result = measure(character, prepared, probe, output);
        const base = details.baseline ? measure(character, prepared, { ...probe, ...details.baseline }, output) : null;
        const value = result.value === null || base?.value === null ? null : result.value - (base?.value ?? 0);
        const expectedStatus = expected === null ? 'unknown' : 'known';
        const correct = result.status === expectedStatus && (expected === null ? value === null : value !== null
          && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9));
        rows.push({ entity: id, field, output, label, parameters, rank, constellation: build.constellation, level: build.level, weapon: build.weapon.id,
          recipient: probe.recipient ?? 'actor', probe, scope, value, expected, status: result.status, ...base && { baseline: base.value, total: result.value },
          sources: [...sources, ...(details.sources ?? []), ...options.panel ? [catalog + 'characters.json#' + id.replace(/^(aether|lumine)-.*/, '$1'),
            catalog + 'character-curves.json#' + build.level, catalog + 'weapons.json#' + build.weapon.id, catalog + 'weapon-curves.json#' + build.weaponLevel] : []],
          ...correct ? {} : { issue: '当前贡献值或适用范围与固定资料不符。', diagnostics: result.diagnostics } });
      };
      run({ check, rate, stat, build, peerBuild, reference });
    }
    const trials = rows.slice(start);
    if (trials.length && trials.every(row => !row.issue) && trials.some(row => row.expected !== null && row.expected !== 0)) {
      verified.add(id + field);
      resolved.push({ entity: id, field, resolved: scope, remaining: options.remaining ?? '',
        sources: [...new Set(trials.flatMap(row => row.sources))] });
    } else gaps.push({ entity: id, field, status: 'needs-review', reason: '已有参数绑定，当次计算的数值或适用范围仍需复核。', sources });
  }

  for (const [id, slot, index, gate, outputs, sign, baseline] of targets) {
    detail(id, slot, index, '只对已命中的目标降低对应属性，施放者与队友读取相同目标效果。', ({ check, rate }) => {
      for (const output of outputs) for (const recipient of receivers) {
        check(output, baseline + sign * rate(), { recipient, values: { [gate]: true } });
        check(output, baseline, { recipient, values: { [gate]: false } });
        check(output, baseline, { recipient, values: { [gate]: true }, otherTarget: true, targetFacts: { [gate]: false } });
      }
    });
  }

  detail('aratakiitto', 2, 0, '怒目鬼王期间按一斗自身在施放时的防御力提高攻击力，退场后由状态解除。', ({ check, rate, stat }) => {
    for (const recipient of receivers) for (const active of [false, true]) {
      const defense = stat('defense');
      check(attack, stat('attack', recipient) + (active && recipient === 'actor' ? rate() * defense : 0),
        { recipient, values: { 'aratakiitto.oniKingActive': active, 'aratakiitto.defenseAtOniKing': defense } });
    }
  }, { panel: true });

  detail('aratakiitto', 2, 1, '怒目鬼王只提高一斗的普通攻击速度。', ({ check, rate }) => {
    for (const recipient of receivers) for (const active of [false, true]) check('attribute.normalAttackSpeed',
      active && recipient === 'actor' ? rate() : 0, { recipient, values: { 'aratakiitto.oniKingActive': active } });
  });

  detail('arlecchino', 0, 0, '红死之宴状态下，普通攻击增加攻击力与生命之契百分比的乘积；重击及队友不受益。', ({ check, rate, stat }) => {
    for (const ratio of [.3, .6]) for (const [recipient, hit, active] of [
      ['actor', 'normal.param1', true], ['actor', 'normal.param7', true], ['actor', 'normal.param1', false], ['peer', 'normal.param1', true],
    ]) check(baseDamage, recipient === 'actor' && hit === 'normal.param1' && active ? stat('attack') * ratio * rate() : 0,
      { recipient, hit, values: { 'arlecchino.masqueRedDeath': active, 'arlecchino.bondOfLifeRatio': ratio } });
  }, { panel: true });

  for (const [index, output] of [[3, damageBonus], [4, 'attribute.incomingHealingBonus']]) {
    detail('furina', 2, index, '普世欢腾期间按当前气氛值提升附近队伍成员对应属性，效果随爆发窗口结束。', ({ check, rate }) => {
      for (const recipient of receivers) for (const [points, cast, timeMs] of [[0, true, 1000], [150, true, 1000],
        [300, true, 1000], [150, false, 1000], [150, true, 20000]]) {
        check(output, cast && timeMs < 18000 ? rate() * points : 0,
          { recipient, cast: cast ? 'burst' : undefined, timeMs, values: { 'furina.fanfarePoints': points } });
      }
    });
  }

  detail('gorou', 1, 1, '旗指物和大将威仪各按战技等级为领域内的当前场上角色提高防御力，两者不叠加。', ({ check, rate }) => {
    for (const recipient of receivers) for (const [banner, burst, onField] of [[false, false, true], [true, false, true],
      [false, true, true], [true, true, true], [true, false, false], [false, true, false]]) {
      check('attribute.flatDefense', onField && (banner || burst) ? rate() : 0,
        { recipient, onField, values: { 'gorou.bannerDomain': banner, 'gorou.burstDomain': burst } });
    }
  });

  for (const [index, branch] of [[1, 'high'], [2, 'low'], [3, 'cap']]) {
    detail('iansan', 2, index, '以伊安珊攻击力和当次夜魂值为基准，按42点切换档位并对场上队员施加同一上限。', ({ check, rate, stat, build, reference }) => {
      const threshold = Number(reference.talent.description.match(/至少(\d+)点夜魂值/)?.[1]);
      if (threshold !== 42) throw new Error('伊安珊的夜魂阈值缺少固定来源。');
      const highCap = branch === 'cap' && build.weaponLevel === 90;
      const counts = branch === 'low' ? [15, threshold - 1, threshold] : [threshold - 1, threshold, 54];
      for (const recipient of receivers) for (const [active, onField] of [[true, true], [false, true], [true, false]]) {
        for (const points of counts) {
          const rateValue = points >= threshold ? rate('param2') : points * rate('param3');
          const delta = active && onField ? Math.min(rate('param4'), stat('attack') * rateValue) : 0;
          if (highCap && points >= threshold && active && onField && delta !== rate('param4')) throw new Error('伊安珊上限算例未达到上限。');
          check(attack, stat('attack', recipient) + delta, { recipient, onField, values: {
            'iansan.kineticMarkerActive': active, 'iansan.kineticNightsoul': points,
          } });
        }
      }
    }, { panel: true, configurations: [{ level: 90, ascension: 6, constellation: 0, weapon: 'vortexvanquisher', weaponLevel: 90 }],
      remaining: '动能标示距离恢复、夜魂值逐秒变化及退出战斗时机单独验收。' });
  }

  detail('kamisatoayato', 2, 1, '清净之园囿仅提高其中队员的普通攻击伤害，包括瞬水剑。', ({ check, rate }) => {
    for (const recipient of receivers) for (const [inside, cast, normal] of [[true, true, true], [false, true, true],
      [true, false, true], [true, true, false]]) {
      const hit = recipient === 'actor' && normal ? 'skill.param1' : normal ? 'normal.param1' : 'burst.param1';
      check(damageBonus, normal && inside && cast ? rate() : 0,
        { recipient, hit, cast: cast ? 'burst' : undefined, recipientValues: { 'kamisatoayato.inGarden': inside } },
        { baseline: { cast: undefined } });
    }
  });

  detail('kujousara', 1, 1, '已获天狗咒雷的施放者或队友按九条裟罗基础攻击力获得攻击力提升。', ({ check, rate, stat }) => {
    for (const recipient of receivers) for (const inside of [false, true]) check(attack,
      stat('attack', recipient) + (inside ? stat('whiteAttack') * rate() : 0),
      { recipient, recipientValues: { 'kujousara.tenguJuuraiRecipient': inside } });
  }, { panel: true });

  detail('noelle', 2, 2, '大扫除按诺艾尔施放时的防御力提高其攻击力，其他队员及窗口外排除。', ({ check, rate, stat }) => {
    for (const recipient of receivers) for (const active of [false, true]) {
      const defense = stat('defense');
      check(attack, stat('attack', recipient) + (recipient === 'actor' && active ? defense * rate() : 0),
        { recipient, values: { 'noelle.sweepingTime': active, 'noelle.defenseAtSweeping': defense } });
    }
  }, { panel: true });

  for (const [index, ownHit, otherHit] of [[3, 'skill.param4', 'skill.param10'], [4, 'skill.param10', 'skill.param4']]) {
    detail('mavuika', 2, index, '死生之炉内仅给规定的驰轮车攻击添加以施放时战意、玛薇卡攻击力为基准的伤害。', ({ check, rate, stat }) => {
      for (const points of [100, 200]) for (const [hit, active, recipient] of [[ownHit, true, 'actor'], [otherHit, false, 'actor'],
        [ownHit, false, 'actor'], ['skill.param12', true, 'actor'], ['normal.param1', true, 'peer']]) {
        const expected = recipient === 'actor' && hit === ownHit && active ? stat('attack') * points * rate() : 0;
        check(baseDamage, expected, { recipient, hit, values: { 'mavuika.ancientName': active, 'mavuika.fightingSpirit': points } },
          { baseline: { values: { 'mavuika.ancientName': false, 'mavuika.fightingSpirit': points } } });
      }
    }, { panel: true });
  }

  detail('mualani', 1, 2, '仅满3层浪势充能时给玛拉妮的鲨鲨撕咬增加这一项生命倍率。', ({ check, rate, stat }) => {
    for (const [recipient, hit, stacks] of [['actor', 'skill.param1', 0], ['actor', 'skill.param1', 2], ['actor', 'skill.param1', 3],
      ['actor', 'normal.param1', 3], ['peer', 'normal.param1', 3]]) {
      check(baseDamage, recipient === 'actor' && hit === 'skill.param1' && stacks === 3 ? stat('hp') * rate() : 0,
        { recipient, hit, values: { 'mualani.waveMomentum': stacks } });
    }
  }, { panel: true });

  for (const [index, hit, excluded] of [[1, 'normal.param1', 'normal.param4'], [2, 'normal.param4', 'normal.param1']]) {
    detail('sangonomiyakokomi', 2, index, '仪来羽衣按心海自身生命上限为规定攻击类别加算基础伤害；对应类别独立计量。', ({ check, rate, stat, build, reference }) => {
      const passive = read(reference.sources[0].split('#')[0]).passive2.description;
      const conversion = Number(passive.match(/治疗加成的(\d+)%/)?.[1]) / 100;
      if (!Number.isFinite(conversion)) throw new Error('心海的治疗加成转化缺少固定来源。');
      const ownContribution = () => stat('hp') * (rate() + (build.ascension >= 4 ? (stat('healingBonus') + .25) * conversion : 0));
      for (const [recipient, categoryHit, active] of [['actor', hit, true], ['actor', hit, false], ['actor', excluded, false],
        ['peer', 'normal.param1', true]]) check(baseDamage, recipient === 'actor' && active ? ownContribution() : 0,
        { recipient, hit: categoryHit, values: { 'sangonomiyakokomi.garment': active } });
    }, { panel: true });
  }

  detail('shenhe', 1, 2, '冰翎在点按或长按确认后，以申鹤当前攻击力为所有合资格队员的冰元素命中加算伤害。', ({ check, rate, stat }) => {
    for (const recipient of receivers) for (const [tap, hold, cryo] of [[false, false, true], [true, false, true],
      [false, true, true], [true, false, false]]) check(baseDamage, cryo && (tap || hold) ? stat('attack') * rate() : 0,
      { recipient, hit: cryo ? 'skill.param1' : 'normal.param1', values: { 'shenhe.quillTap': tap, 'shenhe.quillHold': hold } });
  }, { panel: true, remaining: '每人独立次数和多目标扣次数仍需事件驱动验证。' });

  detail('xiao', 2, 0, '夜叉傩面提高魈的普通、重击及下落攻击伤害。', ({ check, rate }) => {
    for (const [recipient, hit, qualifies] of [['actor', 'normal.param1', true], ['actor', 'normal.param9', true],
      ['actor', 'normal.param11', true], ['actor', 'skill.param1', false], ['peer', 'normal.param1', false]]) {
      for (const active of [false, true]) check(damageBonus, qualifies && active ? rate() : 0,
        { recipient, hit, values: { 'xiao.mask': active } });
    }
  });

  detail('yanfei', 2, 2, '灼灼仅增加烟绯的重击伤害。', ({ check, rate }) => {
    for (const [recipient, hit, qualifies] of [['actor', 'normal.param5', true], ['actor', 'normal.param1', false],
      ['peer', 'normal.param6', false]]) for (const active of [false, true]) check(damageBonus, qualifies && active ? rate() : 0,
      { recipient, hit, values: { 'yanfei.brilliance': active } });
  });

  detail('yaoyao', 2, 3, '桂子仙机只在瑶瑶仍站场时提高她自己的草元素抗性。', ({ check, rate }) => {
    for (const recipient of receivers) for (const [active, onField] of [[false, true], [true, true], [true, false]]) {
      check('attribute.resistance.dendro', recipient === 'actor' && active && onField ? rate() : 0,
        { recipient, onField, values: { 'yaoyao.adeptalLegacy': active } });
    }
  });

  for (const traveler of ['aether', 'lumine']) {
    const electro = traveler + '-electro', hydro = traveler + '-hydro';
    detail(electro, 1, 2, '丰穰勾玉只提高实际拾取者的微粒充能效率；突破天赋额外转化旅行者充能。', ({ check, rate, build, reference }) => {
      const rawPath = reference.sources[0].split('#')[0];
      const passive = Number(read(rawPath).passive2.description.match(/元素充能效率的(\d+)%/)?.[1]) / 100;
      if (!Number.isFinite(passive)) throw new Error('旅行者勾玉的充能转化缺少固定来源。');
      for (const recipient of receivers) for (const active of [false, true]) check('attribute.particleEnergyRecharge',
        active ? rate() + (build.ascension >= 4 ? passive : 0) : 0,
        { recipient, recipientValues: { [electro + '.abundanceAmuletWindow']: active } }, { sources: [rawPath + '#passive2'] });
    });
    detail(hydro, 1, 5, '长按露滴只在旅行者生命高于50%时按生命上限增加伤害。', ({ check, rate, stat }) => {
      for (const [recipient, hit, hpRatio] of [['actor', 'skill.param1', .5], ['actor', 'skill.param1', .51],
        ['actor', 'skill.param2', .75], ['peer', 'normal.param1', .75]]) {
        check(baseDamage, recipient === 'actor' && hit === 'skill.param1' && hpRatio > .5 ? stat('hp') * rate() : 0,
          { recipient, hit, hpRatio });
      }
    }, { panel: true });
  }

  detail('xingqiu', 1, 1, '有效雨帘剑为场上队员提供固定减伤，额外转换的是行秋的水伤加成。', ({ check, rate, stat, build, reference }) => {
    const hydroShare = Number(reference.talent.description.match(/水元素伤害加成的(\d+)%/)?.[1]) / 100;
    const cap = Number(reference.talent.description.match(/最多通过这种方式获得(\d+)%/)?.[1]) / 100;
    const rawPath = reference.sources[0].split('#')[0];
    const ascensionBonus = Number(read(rawPath).passive2.description.match(/(\d+)%水元素伤害加成/)?.[1]) / 100;
    if (![hydroShare, cap, ascensionBonus].every(Number.isFinite)) throw new Error('行秋的水伤减伤转化缺少固定来源。');
    for (const recipient of receivers) for (const [active, onField] of [[false, true], [true, false], [true, true]]) {
      const converted = Math.min(cap, (stat('hydroBonus') + (build.ascension >= 4 ? ascensionBonus : 0)) * hydroShare);
      check('attribute.incomingDamageReduction', active && onField ? rate() + converted : 0,
        { recipient, onField, values: { 'xingqiu.rainSwordActive': active } }, { sources: [rawPath + '#passive2'] });
    }
  }, { panel: true });

  detail('raidenshogun', 1, 3, '雷罚恶曜之眼持续期间，仅按实际受益角色的元素爆发能量消耗提高爆发伤害。', ({ check, rate }) => {
    for (const recipient of receivers) {
      const energy = recipient === 'actor' ? 90 : 60;
      for (const [hit, cast] of [['burst.param1', true], ['burst.param1', false], ['normal.param1', true]]) check(damageBonus,
        hit.startsWith('burst.') && cast ? rate() * energy : 0, { recipient, hit, cast: cast ? 'skill' : undefined },
        { sources: [source + 'ChineseSimplified/talents/raidenshogun.json#combat3', source + 'ChineseSimplified/talents/kaeya.json#combat3'] });
    }
  }, { remaining: '协同攻击的触发及冷却由对应事件验收。' });

  detail('odette', 2, 2, '雪鹄之梦只提升奥黛塔自己的星超导及星扩散反应伤害。', ({ check, rate }) => {
    for (const family of ['stellar-conduct', 'stellar-swirl']) for (const recipient of receivers) for (const cast of [false, true]) {
      check('attribute.reaction.' + family + '.damageBonus', cast && recipient === 'actor' ? rate() : 0,
        { recipient, cast: cast ? 'burst' : undefined, family, hit: recipient === 'actor' ? 'skill.param3' : 'normal.param1', reaction: family });
    }
  });

  for (const [slot, index, hit] of [[1, 11, 'skill.param17'], [2, 1, 'burst.param1']]) {
    detail('lohen', slot, index, '已确定的争胜点数以每点倍率提高对应命中的原本伤害，四命奇谋爆发按上限。', ({ check, rate, build, reference }) => {
      const multiplier = Number(reference.constellations.c1.description.match(/上限提升至原来的(\d+)%/)?.[1]) / 100;
      const probes = [['actor', hit, true], ['actor', 'normal.param1', true], ['peer', 'normal.param1', true]];
      if (slot === 2) probes.push(['actor', hit, false]);
      for (const [recipient, hitId, active] of probes) for (const points of [0, 40, 100]) {
        const amount = slot === 2 && build.constellation >= 4 ? 100 * multiplier : points;
        check('attribute.baseMultiplier', recipient === 'actor' && hitId === hit && active ? 1 + amount * rate() : 1,
          { recipient, hit: hitId, values: { 'lohen.masterstroke': active, 'lohen.will': points } },
          { sources: [reference.constellationPath + '#c1', reference.constellationPath + '#c4'] });
      }
    }, { remaining: '只核验已给定争胜点数的当次计算。' });
  }

  detail('skirk', 2, 2, '丝柯克的普通元素爆发按超过50点的蛇之狡谋追加伤害，零命至多12点，二命额外10点。', ({ check, rate, stat, build, reference }) => {
    const minimum = Number(reference.talent.description.match(/至少(\d+)点蛇之狡谋/)?.[1]);
    const limit = Number(reference.talent.description.match(/至多通过这种方式计入(\d+)点/)?.[1]);
    const extra = Number(reference.constellations.c2.description.match(/至多额外计入(\d+)点/)?.[1]);
    if (![minimum, limit, extra].every(Number.isFinite)) throw new Error('蛇之狡谋的门槛或上限缺少固定来源。');
    for (const [recipient, hit] of [['actor', 'burst.param1'], ['actor', 'burst.param2'], ['actor', 'skill.param1'], ['peer', 'normal.param1']]) {
      for (const points of [50, 57, 62, 80]) {
        const delta = recipient === 'actor' && hit.startsWith('burst.') ? Math.min(points - minimum, limit + (build.constellation >= 2 ? extra : 0)) * stat('attack') * rate() : 0;
        check(baseDamage, delta, { recipient, hit, values: { 'skirk.serpentGuile': points } }, { sources: [reference.constellationPath + '#c2'] });
      }
    }
  }, { panel: true, configurations: [{ level: 90, ascension: 6, talent: 10, constellation: 2 }] });

  detail('yunjin', 2, 1, '确认飞云旗阵本次生效后，给施放者或队友的普通攻击增加云堇的防御力乘倍率。', ({ check, rate, stat, build, reference }) => {
    const rawPath = reference.sources[0].split('#')[0];
    const rateByElements = read(rawPath).passive2.description.match(/(\d+(?:\.\d+)?)%\/(\d+(?:\.\d+)?)%\/(\d+(?:\.\d+)?)%\/(\d+(?:\.\d+)?)%/);
    const extra = build.ascension >= 4 ? Number(rateByElements[2]) / 100 : 0;
    for (const recipient of receivers) for (const [cast, active, hit] of [[true, true, 'normal.param1'], [false, false, 'normal.param1'],
      [true, false, 'burst.param1']]) check(baseDamage, cast && active && hit.startsWith('normal.') ? (rate() + extra) * stat('defense') : 0,
      { recipient, hit, cast: cast ? 'burst' : undefined, recipientValues: { 'yunjin.flagFormation': cast },
        application: active ? 'yunjin.flying-cloud-base.base' : undefined }, { sources: [rawPath + '#passive2'] });
  }, { panel: true, remaining: '多元素突破被动及每名队员独立剩余次数单独验证。' });

  detail('lauma', 2, 2, '有可用祷歌时，绽放、超绽放和烈绽放按菈乌玛的元素精通提高基础反应伤害。', ({ check, rate, stat, build, reference }) => {
    const extra = Number(reference.constellations.c2.description.match(/精通的(\d+)%/)?.[1]) / 100;
    for (const recipient of receivers) for (const reaction of ['bloom', 'hyperbloom', 'burgeon', 'overloaded']) for (const active of [false, true]) {
      check('attribute.reaction.transformative.flatBaseBonus', reaction !== 'overloaded' && active ? (rate() + (build.constellation >= 2 ? extra : 0)) * stat('elementalMastery') : 0,
        { recipient, family: 'transformative', reaction, values: { 'lauma.paleHymn': active } }, { sources: [reference.constellationPath + '#c2'] });
    }
  }, { panel: true, configurations: [{ level: 90, ascension: 6, talent: 10, weapon: 'sacrificialfragments', weaponLevel: 90 }],
    remaining: '苍色祷歌逐层消耗及累计持续时间由反应事件单独验收。' });

  detail('kaveh', 2, 2, '爆发强化期间，确认普通绽放草原核迸发的当次伤害加成，排除已转化为超绽放或烈绽放的反应。', ({ check, rate }) => {
    for (const recipient of receivers) for (const reaction of ['bloom', 'hyperbloom', 'burgeon']) for (const active of [false, true]) {
      check('attribute.reaction.transformative.damageBonus', reaction === 'bloom' && active ? rate() : 0,
        { recipient, family: 'transformative', reaction, values: { 'kaveh.painting': active } });
    }
  }, { remaining: '原文还覆盖月绽放产生的草原核迸发。仍需对照它与月绽放直伤、绽放原核及其他队伍原核的边界。' });

  for (const [index, attribute, family, hit] of [[1, baseDamage, 'ordinary', 'skill.param1'],
    [2, 'attribute.reaction.lunar.flatBaseBonus', 'lunar-crystallize', 'skill.param2']]) {
    detail('illuga', 2, index, '夜莺之歌消耗时为合资格场上队员提供以叶洛亚精通为基准的伤害，岩直伤与月结晶分开量测。', ({ check, rate, stat, build, reference }) => {
      const rawPath = reference.sources[0].split('#')[0], passive = read(rawPath).passive2.description;
      const scale = [...passive.matchAll(/(\d+)%\/(\d+)%\/(\d+)%/g)][index - 1];
      const probes = [['peer', hit, family, true, true, true], ['peer', hit, family, false, true, true], ['peer', hit, family, true, false, true],
        ['peer', hit, family, true, true, false], ['peer', 'normal.param1', 'ordinary', true, true, true]];
      if (index === 1) probes.push(['actor', 'skill.param1', 'ordinary', true, true, true]);
      for (const [recipient, hitId, familyId, song, spend, onField] of probes) {
        const eligible = hitId !== 'normal.param1' && song && spend && onField;
        const extra = build.ascension >= 4 ? Number(scale[2]) / 100 : 0;
        check(attribute, eligible ? (rate() + extra) * stat('elementalMastery') : 0, { recipient, hit: hitId, family: familyId, onField,
          values: { 'illuga.nightingaleSong': song, 'illuga.nightingaleSpend': spend } }, { sources: [rawPath + '#passive2'] });
      }
    }, { panel: true, peer: 'linnea', configurations: [{ level: 90, ascension: 6, talent: 10, weapon: 'dragonsbane', weaponLevel: 90 }],
      remaining: '岩造物加层、逐目标消耗和过期时间由状态事件单独验收。' });
  }

  const countedHits = [
    ['beidou', 1, 2, ['skill.param3'], 'counterCharge', [0, 1, 2], 'attack', {}, '长按期间每次受击加算一档，至多两档。'],
    ['kamisatoayato', 1, 4, ['skill.param1', 'skill.param2', 'skill.param3'], 'namisen', [0, 1, 4], 'hp',
      { 'kamisatoayato.stance': true }, '三段瞬水剑分别按浪闪层数与当前生命上限加算。'],
    ['lyney', 1, 1, ['skill.param1'], 'lyney.propSurplus', [0, 1, 5], 'attack', {}, '按清除的隐具余数逐层增加战技伤害。'],
    ['mualani', 1, 1, ['skill.param1'], 'mualani.waveMomentum', [0, 1, 2, 3], 'hp', {}, '每层浪势充能按生命上限增加鲨鲨撕咬的基础伤害。'],
    ['raidenshogun', 2, 1, ['burst.param1', 'burst.param5', 'burst.param12', 'burst.param16'], 'resolve', [0, 17, 60], 'attack', {},
      '按消耗的愿力层数区分梦想一刀和梦想一心的基础伤害倍率。'],
    ['shikanoinheizou', 1, 1, ['skill.param1'], 'shikanoinheizou.declension', [0, 1, 3, 4], 'attack', {}, '每层变格加算基础伤害，第四层的独立正论加成另外核验。'],
  ];
  for (const [id, slot, index, hits, key, counts, statName, values, scope] of countedHits) {
    detail(id, slot, index, scope, ({ check, rate, stat, build, reference }) => {
      for (const [hitIndex, hit] of hits.entries()) for (const count of counts) {
        const parameter = reference.parameters[hitIndex > 0 && reference.parameters.length > 1 ? 1 : 0];
        const usesSecondConstellation = id === 'kamisatoayato' && build.constellation >= 2;
        const buff = usesSecondConstellation ? reference.constellations.c2.description.match(/至少(\d+)层浪闪.*提升(\d+)%生命值上限/) : null;
        const hpBonus = buff && count >= Number(buff[1]) ? Number(buff[2]) / 100 : 0;
        check('hit.base', count * stat(statName) * rate(parameter) * (1 + hpBonus), { hit, values: { ...values, [key]: count } },
          { baseline: { values: { ...values, [key]: 0 } }, sources: usesSecondConstellation ? [reference.constellationPath + '#c2'] : [] });
      }
    }, { panel: true });
  }

  detail('shikanoinheizou', 1, 2, '只有四层变格的勠心拳获得独立正论加成，普通攻击及队友不适用。', ({ check, rate, stat }) => {
    for (const [recipient, hit, count] of [['actor', 'skill.param1', 0], ['actor', 'skill.param1', 3], ['actor', 'skill.param1', 4],
      ['actor', 'normal.param1', 4], ['peer', 'normal.param1', 4]]) {
      check(baseDamage, recipient === 'actor' && hit === 'skill.param1' && count === 4 ? rate() * stat('attack') : 0,
        { recipient, hit, values: { 'shikanoinheizou.declension': count } });
    }
  }, { panel: true });

  for (const traveler of ['aether', 'lumine']) {
    const id = traveler + '-cryo';
    for (const [index, mode] of [[1, 'none'], [3, 'stellar-conduct'], [5, 'stellar-swirl']]) {
      detail(id, 2, index, '冰元素爆发按消耗的寒辉层数增加本模式每段伤害，分别核对普通、星超导、星扩散系数。', ({ check, rate, stat }) => {
        for (const count of [0, 4, 8]) {
          const values = { frostglow: count, radiance: mode, ...(mode === 'stellar-conduct' ? { stellarAttachments: 1 } : {}) };
          const reactionRate = mode === 'stellar-conduct' ? attachmentRates[1] : 1;
          check('hit.base', stat('attack') * count * rate() * reactionRate, { hit: 'burst.param1', values },
            { baseline: { values: { ...values, frostglow: 0 } }, sources: mode === 'stellar-conduct' ? [lifecyclePath + '#stellarConduct'] : [] });
        }
      }, { panel: true, remaining: '仅核验单段系数。满8层所增加的命中次数单独验收。' });
    }
  }

  detail('nicole', 1, 3, '零命时按尼可施放战技时的非额外攻击力为队伍成员计算虚己之赐。', ({ check, rate, stat }) => {
    for (const recipient of receivers) for (const [cast, timeMs] of [[false, 1000], [true, 1000], [true, 30000]]) {
      const active = cast && timeMs < 30000;
      const contribution = stat('attack') * rate();
      check(attack, active ? contribution : 0, { recipient, cast: cast ? 'skill' : undefined, timeMs,
        recipientValues: { 'nicole.blessedDirection': false } }, { baseline: { cast: undefined },
        sources: ['tools/data/sources/catalog/nicole-kenosis.json#castOrder'] });
    }
  }, { panel: true, withoutConstellation: true,
    remaining: '封顶、二命与重施放顺序使用独立配装用例核验。' });

  for (const [index, mode, output] of [[6, 'none', baseDamage], [7, 'stellar-conduct', 'attribute.reaction.stellar-conduct.flatBaseBonus']]) {
    detail('valeriy', 0, index, '已确认消耗攻斥指令时，按辉映状态将瓦列里攻击力的对应倍率加给合资格命中。', ({ check, rate, stat, build, reference }) => {
      const rawPath = reference.sources[0].split('#')[0], passive = read(rawPath).passive2.description;
      const bonus = [...passive.matchAll(/瓦列里攻击力的(\d+(?:\.\d+)?)%/g)].map(match => Number(match[1]) / 100);
      for (const [recipient, radiance, eligible, active] of [['actor', mode, true, true], ['peer', mode, true, true],
        ['actor', mode, false, true], ['actor', mode, true, false], ['actor', mode === 'none' ? 'stellar-conduct' : 'none', true, true]]) {
        const added = build.ascension >= 4 ? 40 * bonus[mode === 'none' ? 1 : 0] : 0;
        const hit = recipient === 'actor' ? eligible ? 'normal.param5' : 'normal.param1'
          : eligible ? index === 6 ? 'skill.param1' : 'skill.second' : 'normal.param1';
        const family = index === 7 && eligible ? 'stellar-conduct' : 'ordinary';
        check(output, radiance === mode && eligible && active ? stat('attack') * (rate() + added) : 0,
          { recipient, hit, family, values: { radiance, 'valeriy.assaultOrder': active, 'valeriy.assaultOrderWindow': true, 'valeriy.spentImpactPotential': 40 },
            ...(index === 6 ? { peerValues: { 'fischl.hexereiSecretRite': false,
              'fischl.hexereiOverloadActive': false, 'fischl.hexereiCoordinationActive': false } } : {}) },
          { sources: [rawPath + '#passive2'] });
      }
    }, { panel: true, peer: index === 6 ? 'fischl' : 'sandrone', remaining: '按已确认消耗的当次命中验算，层数授予及扣除另验。' });
  }

  return finish();
}
