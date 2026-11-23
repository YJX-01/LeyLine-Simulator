import { effectReading } from './character-damage-modifier-numbers.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const target = 'attribute.physicalBonus';
const grimheart = 'eula.grimheartSpentWindow';
const soulwind = 'mika.soulwindActive';
const stacks = 'mika.detectorStacks';
const shield = 'xinyan.sweepingFervorShield';
const close = (actual, expected) => Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const sample = (expected, settings = {}) => ({ expected, settings });
const peer = 'kaeya';
const missing = (key, settings = {}) => ({ pending: { key }, settings });
const outOfRange = (settings, malformed = false) => ({ pending: { code: 'invalid-range', malformed }, settings });
const actor = id => ({ kind: 'actor', id });

function original(path, key, pattern) {
  const file = capture + path + '.json';
  const text = readContentSource(new URL('../../' + file, import.meta.url))[key]?.description?.replaceAll('**', '');
  return { numbers: text && pattern.exec(text)?.slice(1).map(Number), ref: file + '#/' + key + '/description' };
}

const typedFacts = values => Object.fromEntries(Object.entries(values).map(([key, value]) =>
  [key, typeof value === 'boolean' ? bool(value) : number('count', value)]));

/** Read the exact character grant from a physical hit and compare the full damage against a disabled baseline. */
export function physicalDamageModifierNumbers(entities, results, engine) {
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const weapons = new Map(entities.weapons.map(row => [row.id, row]));
  const occupied = new Set(results.registeredModifierEvidence?.map(row => row.key));
  const teams = new Map(), proofs = [];

  function teamFor(supplier, { recipient, ascension, constellation, recipientAscension = 0, recipientConstellation = 0 }) {
    const key = JSON.stringify([supplier, recipient, ascension, constellation, recipientAscension, recipientConstellation]);
    if (!teams.has(key)) {
      const actors = (supplier === recipient ? [supplier] : [supplier, recipient]).map(id => {
        const character = characters.get(id);
        const weapon = character && weapons.get(novice[character.identity.weaponType]);
        if (!weapon) return;
        const build = auditBuild(character, weapon);
        build.ascension = id === supplier ? ascension : recipientAscension;
        build.constellation = id === supplier ? constellation : recipientConstellation;
        build.level = build.ascension ? character.progression.promotion[build.ascension].maxLevel : 1;
        return { id, build };
      });
      const prepared = actors.every(Boolean) && engine.prepareStructuredBuilds(actors);
      teams.set(key, prepared?.ok ? prepared.team : null);
    }
    return teams.get(key);
  }

  function measure(supplier, definition, gate, settings, disabled = false) {
    const { recipient, skill = 'normal', timeMs = 1, onField = true, supplierFacts = {}, recipientFacts = {}, window } = settings;
    const team = teamFor(supplier, settings);
    const owner = characters.get(supplier), dealer = characters.get(recipient);
    const talent = dealer?.talents.find(entry => entry.id === recipient + '.' + skill);
    const hit = talent?.hits.find(entry => entry.id === talent.id + '.param1');
    if (!team || !hit) return;
    const { setup, request } = auditHit(dealer, talent, hit);
    const { frame } = request;
    const dealerRow = frame.factOverrides[0];
    setAuditDefaults(dealer, frame);
    dealerRow.subject = actor(recipient);
    let ownerRow = dealerRow;
    if (recipient !== supplier) {
      ownerRow = { subject: actor('actor'), facts: {} };
      frame.factOverrides.unshift(ownerRow);
      setAuditDefaults(owner, frame);
      ownerRow.subject = actor(supplier);
      ownerRow.facts.onField = bool(!onField);
    }
    for (const row of new Set([ownerRow, dealerRow])) {
      delete row.facts[gate];
      if (gate === soulwind) delete row.facts[stacks];
    }
    dealerRow.facts.onField = bool(onField);
    Object.assign(ownerRow.facts, typedFacts(supplierFacts));
    Object.assign(dealerRow.facts, typedFacts(recipientFacts));
    if (disabled) {
      const recipientGate = gate !== grimheart;
      (recipientGate ? dealerRow : ownerRow).facts[gate] = bool(false);
      if (gate === soulwind) delete dealerRow.facts[stacks];
    } else if (window) {
      setup.factIntervals.push({ id: 'grimheart-window', subject: actor(supplier), startMs: window.startMs, endMs: window.endMs,
        facts: { [gate]: bool(true) } });
    }
    frame.factOverrides.push({ subject: { kind: 'target', id: 'enemy' }, facts: {
      targetHpRatio: number('scalar', 1), 'aura.cryo': bool(false), 'aura.frozen': bool(false),
    } });
    request.actorId = recipient;
    Object.assign(setup.events[0], { actorId: recipient, timeMs });
    const context = engine.createStructuredCombatContext(team, setup);
    if (!disabled && window) context.actors.find(row => row.id === supplier).facts[gate] = bool(false);
    const reading = engine.evaluateStructuredHit(team, setup, request, { context });
    const value = reading.outputs[0]?.value;
    return { state: value?.state, execution: reading.execution, damage: value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : undefined,
      contribution: effectReading(reading, definition.identity, target, supplier, recipient), requiredInputs: reading.requiredInputs,
      diagnostics: reading.diagnostics, hit: hit.id, element: hit.element };
  }

  function check(entity, group, position, id, role, gate, refs, probes) {
    const character = characters.get(entity);
    const piece = character?.metadata[group][position];
    const index = piece?.buffs?.findIndex(row => row.id === id);
    const buff = piece?.buffs?.[index];
    const modifier = buff?.modifiers[0];
    if (modifier?.target !== target || (modifier.recipient ?? buff.recipient ?? 'owner') !== role) return;
    const field = '/' + group + '/' + position + '/buffs/' + index + '/modifiers/0';
    const key = entity + field;
    const choices = results.calculator.buffs.filter(row => row.entity === entity && row.field === field);
    const [choice] = choices;
    if (choices.length !== 1 || !choice.listed || choice.issue || choice.id !== id || choice.target !== target || choice.role !== role || occupied.has(key)) return;
    const definitions = character.calculation.bundle.effects.filter(effect => effect.identity.id === id && (effect.buff ?? effect.identity).id === id
      && effect.target.kind === 'attribute' && effect.target.attribute.id === target && effect.recipient.role === role);
    if (definitions.length !== 1) return;
    const cases = [];
    for (const { expected, pending, settings: input } of probes) {
      const settings = { supplier: entity, recipient: entity, ascension: piece.unlockAscension ?? 0,
        constellation: group === 'constellations' ? position + 1 : 0, ...input };
      const read = measure(entity, definitions[0], gate, settings);
      const baseline = measure(entity, definitions[0], gate, settings, true);
      const { actual, instances, usingTarget } = read?.contribution ?? {};
      const emptyStack = gate === soulwind && settings.recipientFacts?.[stacks] === 0;
      const valid = read && baseline?.state === 'known' && baseline.damage > 0 && (pending
        ? pending.key ? read.state === 'unknown' && read.requiredInputs.some(row => row.key === pending.key)
          : read.execution === 'invalid' && (pending.malformed ? read.state === undefined : read.state === 'invalid')
            && read.diagnostics.some(row => row.code === pending.code && (!pending.malformed || row.nodeId === 'query'))
        : read.state === 'known' && close(actual, expected) && close(read.damage, baseline.damage * (1 + expected))
          && (expected > 0 || emptyStack ? usingTarget && instances === 1 : instances === 0));
      if (!valid) {
        if (process.env.PHYSICAL_DAMAGE_AUDIT_DEBUG) process.stderr.write(JSON.stringify({ entity, expected, pending, settings, read, baseline }) + '\n');
        return;
      }
      if (!pending) cases.push({ actual, expected, settings: { ...settings, hit: read.hit, element: read.element } });
    }
    const primary = cases.find(row => row.expected > 0);
    if (!primary) return;
    proofs.push({ key, entity, field, id, modifier: 0, target, audit: 'physicalDamageModifierNumbers', actual: primary.actual, expected: primary.expected,
      refs, scope: '用正式命中的伤害及依赖追踪核对物伤授予、施加者与受益者。' + (gate === grimheart ? '冷酷之心以已给定的生效窗口为输入。' : ''), cases });
  }

  const eula = original('constellations/eula', 'c1', /优菈的物理伤害加成提高(\d+)%[，,]持续(\d+)秒[^。]*延长(\d+)秒[^。]*超过(\d+)秒/);
  if (eula.numbers?.every(Number.isFinite)) {
    const [amount, base, perStack, cap] = eula.numbers;
    check('eula', 'constellations', 0, 'eula.c1.grimheart-physical', 'owner', grimheart,
      [eula.ref, 'https://library.keqingmains.com/evidence/characters/cryo/eula#c1-tidal-illusion'], [
        ...[1, 2].flatMap(consumed => {
          const startMs = 1_000, endMs = startMs + 1000 * Math.min(cap, base + perStack * consumed);
          const window = { consumed, startMs, endMs };
          return [sample(0, { window, timeMs: startMs - 1 }), sample(amount / 100, { window, timeMs: startMs }),
            sample(amount / 100, { window, timeMs: endMs - 1 }), sample(0, { window, timeMs: endMs })];
        }),
        sample(0, { supplierFacts: { [grimheart]: false, 'eula.grimheartStacks': 2 } }),
        sample(0, { recipient: peer, supplierFacts: { [grimheart]: true }, recipientFacts: { [grimheart]: true } }),
        sample(0, { supplierFacts: { [grimheart]: true }, constellation: 0 }),
        sample(0, { supplierFacts: { [grimheart]: true }, skill: 'skill' }),
        missing(grimheart),
      ]);
  }

  const base = original('talents/mika', 'passive1', /造成的物理伤害提升(\d+)%[^]*侦明效果至多叠加(\d+)层/);
  const ascensionFour = original('talents/mika', 'passive2', /叠加层数上限提升(\d+)层。\s*需要解锁突破天赋「速射牵制」/);
  const constellationSix = original('constellations/mika', 'c6', /叠加层数上限提升(\d+)层。需要解锁突破天赋「速射牵制」/);
  if ([base, ascensionFour, constellationSix].every(source => source.numbers?.every(Number.isFinite))) {
    const [amount, baseCap] = base.numbers;
    const a4 = ascensionFour.numbers[0], c6 = constellationSix.numbers[0];
    const active = count => ({ recipient: peer, recipientFacts: { [soulwind]: true, [stacks]: count } });
    const absoluteCap = baseCap + a4 + c6;
    check('mika', 'passives', 0, 'mika.a0.detector-physical', 'team', soulwind,
      [base.ref, ascensionFour.ref, constellationSix.ref, 'https://keqingmains.com/mika/#Talents',
        'https://keqingmains.com/mika/#Constellations', 'https://library.keqingmains.com/evidence/characters/cryo/mika#synergiesinteractions'], [
        ...[[1, 0, baseCap], [3, 6, baseCap + c6], [4, 5, baseCap + a4], [4, 6, absoluteCap]].flatMap(([ascension, constellation, cap]) =>
          [0, 1, baseCap, baseCap + 1, absoluteCap].map(count => sample(amount / 100 * Math.min(count, cap), { ...active(count), ascension, constellation }))),
        sample(amount / 100, { recipientFacts: { [soulwind]: true, [stacks]: 1 } }),
        sample(amount / 100 * baseCap, { ...active(absoluteCap), recipientAscension: 4, recipientConstellation: 6 }),
        sample(0, { ...active(absoluteCap), ascension: 0, constellation: 6 }),
        sample(0, { ...active(1), skill: 'skill' }),
        sample(0, { ...active(1), onField: false, supplierFacts: { [soulwind]: true, [stacks]: 1 } }),
        sample(0, { recipient: peer, recipientFacts: { [soulwind]: false }, supplierFacts: { [soulwind]: true, [stacks]: 1 } }),
        missing(soulwind, { recipient: peer, recipientFacts: { [stacks]: 1 }, supplierFacts: { [soulwind]: true } }),
        missing(stacks, { recipient: peer, recipientFacts: { [soulwind]: true }, supplierFacts: { [stacks]: 1 } }),
        ...[-1, 1.5].map(count => outOfRange({ ...active(count), ascension: 4, constellation: 6 }, true)),
        outOfRange({ ...active(absoluteCap + 1), ascension: 4, constellation: 6 }),
      ]);
  }

  const xinyan = original('talents/xinyan', 'passive2', /处于热情拂扫的护盾保护下的角色造成的物理伤害提高(\d+)%/);
  if (xinyan.numbers?.every(Number.isFinite)) {
    const amount = xinyan.numbers[0] / 100;
    check('xinyan', 'passives', 1, 'xinyan.a1.sweeping-fervor-physical', 'team', shield,
      [xinyan.ref, 'https://keqingmains.com/xinyan/#Talents'], [
        sample(amount, { recipient: peer, supplierFacts: { [shield]: false }, recipientFacts: { [shield]: true } }),
        sample(amount, { recipientFacts: { [shield]: true } }),
        sample(0, { recipient: peer, supplierFacts: { [shield]: true }, recipientFacts: { [shield]: false, shielded: true } }),
        sample(0, { recipient: peer, recipientFacts: { [shield]: true }, ascension: 3 }),
        sample(0, { recipient: peer, recipientFacts: { [shield]: true }, skill: 'skill' }),
        missing(shield, { recipient: peer, supplierFacts: { [shield]: true } }),
      ]);
  }
  return proofs;
}
