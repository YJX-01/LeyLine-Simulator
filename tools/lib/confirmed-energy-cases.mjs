import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number } from './roster-audit-settings.mjs';

const weaponPath = 'tools/data/sources/catalog/genshin-db/weapons.json';
const textPath = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const configPath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/confirmed-energy-facts.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const output = 'attribute.directEnergyRestored';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const binding = { kind: 'attribute', actor: { role: 'recipient' }, key: ref(output), at: { kind: 'current', phase: 'same' } };
const harvest = 'beyondthechrysalis.harvestWind';
const harvestReady = 'beyondthechrysalis.harvestWindCooldownReady';
const reaction = 'ineffa.lunarChargedEnergyTrigger';
const reactionReady = 'ineffa.lunarChargedEnergyCooldownReady';
const exit = 'razor.burstExitRefund';
const ticks = 'razor.burstRefundElapsedTicks';

/** Compare explicitly confirmed energy grants with the pinned game text and action configuration. */
export function auditConfirmedEnergyCases(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const configured = read(configPath);
  const peer = characters.get('barbara');
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const teams = new Map();

  function clause({ entity, owner, sourceGroups, field, effect, buffs, description, remaining, evidence, check }) {
    const holder = characters.get(owner);
    if (!holder || !peer || !starter(holder) || !starter(peer)) return;
    const buffIndex = buffs?.findIndex(buff => buff.id === effect) ?? -1;
    const buffField = field + '/' + buffIndex;
    const modifierIndex = buffs?.[buffIndex]?.modifiers.findIndex(modifier => modifier.target === output) ?? -1;
    const modifierField = buffField + '/modifiers/' + modifierIndex;
    const start = rows.length;
    function record(probe, expected, expectedStatus, value, status, matches, diagnostics, sources) {
      rows.push({ entity, field: modifierField, effect, output, sources: [...sourceGroups, ...sources], probe, expected, expectedStatus, value, status,
        ...(buffIndex >= 0 && modifierIndex >= 0 && evidence && matches ? {} : { issue: '当次回能输出或来源与预期不符', diagnostics }) });
    }
    function evaluate({ label, expected, rank = 0, refinement = 1, weapon, recipient = 'actor', triggerActor = 'actor', facts = [],
      application = true, expectedStatus = expected === null ? 'unknown' : 'known', sources = [] }) {
      const assignedWeapon = weapon ?? starter(holder);
      const teamKey = JSON.stringify([owner, assignedWeapon.id, rank, refinement]);
      let prepared = teams.get(teamKey);
      if (!prepared) {
        prepared = engine.prepareStructuredBuilds([
          { id: 'actor', build: { ...auditBuild(holder, assignedWeapon), constellation: rank, refinement } },
          { id: 'peer', build: auditBuild(peer, starter(peer)) },
        ]);
        teams.set(teamKey, prepared);
      }
      const probe = { label, owner, recipient, triggerActor, rank, refinement, weapon: assignedWeapon.id, facts, application };
      if (!prepared.ok || expectedStatus === 'rejected') {
        const rejected = !prepared.ok && prepared.diagnostics.some(diagnostic => diagnostic.code === 'invalid-range');
        record(probe, expected, expectedStatus, null, rejected ? 'rejected' : 'missing', expectedStatus === 'rejected' && rejected, prepared.diagnostics, sources);
        return;
      }
      const talent = holder.talents[0];
      const { setup, request: { frame } } = auditHit(holder, talent, talent.hits[0]);
      setup.events.find(event => event.id === frame.eventId).actorId = triggerActor;
      Object.assign(frame, { ownerId: 'actor', recipientId: recipient, contributorId: null, hit: null, facts: {}, factOverrides: [] });
      for (const [id, key, value] of facts) {
        const subject = id === 'team' ? { kind: 'team' } : { kind: 'actor', id };
        let override = frame.factOverrides.find(row => row.subject.kind === subject.kind && row.subject.id === subject.id);
        if (!override) frame.factOverrides.push(override = { subject, facts: {} });
        override.facts[key] = value;
      }

      const { team } = prepared;
      const context = engine.createStructuredCombatContext(team, setup);
      const receiver = context.actors.find(actor => actor.id === recipient);
      for (const [index, actor] of context.actors.entries()) {
        const definitions = index === 0 ? [holder, assignedWeapon] : [peer, starter(peer)];
        const effectIds = new Set(definitions.flatMap(definition => definition.calculation.bundle.effects)
          .filter(rule => rule.target.kind === 'attribute' && rule.target.attribute.id === output
            && actor.effects.some(reference => reference.id === rule.identity.id)
            && engine.effectRecipientMatches(rule.recipient, actor.id, recipient, receiver.identity) === true)
          .map(rule => (rule.buff ?? rule.identity).id));
        for (const id of effectIds) {
          const selected = index === 0 && id === effect;
          if (selected && application === null) continue;
          frame.applications.push({ instanceId: engine.calculationEffectInstanceId(actor.id, ref(id), null), active: selected && application });
        }
      }
      const result = engine.evaluateCombatBindings(team.program, context, { energy: binding }, frame);
      const evaluated = result.outputs.energy;
      const status = evaluated?.state ?? 'missing';
      const value = status === 'known' && evaluated.value.kind === 'quantity' && evaluated.value.unit === 'energy' ? evaluated.value.value : null;
      const matches = status === expectedStatus && (expected === null || value !== null && Math.abs(value - expected) < 1e-9)
        && (status !== 'invalid' || result.diagnostics.some(diagnostic => diagnostic.code === 'invalid-range'));
      record(probe, expected, expectedStatus, value, status, matches, result.diagnostics, sources);
    }
    check(evaluate);
    if (rows.length === start || rows.slice(start).some(row => row.issue)) return;
    verified.add(entity + buffField);
    verified.add(entity + modifierField);
    const clauseField = field === '/buffs' ? field : field.slice(0, -'/buffs'.length);
    resolved.push({ entity, field: clauseField, resolved: description, remaining });
    gaps.push({ entity, field: clauseField, reason: remaining, status: 'timeline-only' });
  }

  const weapon = weapons.get('beyondthechrysalis');
  if (weapon) {
    const source = read(weaponPath).beyondthechrysalis.metadata;
    const ranks = Object.keys(source).filter(key => /^r[1-5]$/.test(key)).sort();
    const amounts = ranks.map(key => {
      const text = source[key].description;
      const match = /丰获之风：为装备者恢复([\d.]+)点元素能量，每4秒至多通过这种方式恢复\1点元素能量/.exec(text);
      return Number(match?.[1]);
    });
    const facts = (stage, ready) => [
      ...(stage === null ? [] : [['actor', harvest, bool(stage)]]),
      ...(ready === null ? [] : [['actor', harvestReady, bool(ready)]]),
    ];
    clause({ entity: weapon.id, owner: 'kaeya', field: '/buffs', effect: harvest, buffs: weapon.metadata.buffs, sourceGroups: [],
      description: '丰获之风与四秒资格均已明确时，按精炼档恢复持有者的固定元素能量。',
      remaining: '三种效果轮换、持续时间、四秒资格与退场重置仍待由事件推导。',
      evidence: ranks.length === 5 && ranks.length === weapon.maxRefinement && amounts.every(Number.isFinite),
      check(evaluate) {
        const run = probe => evaluate({ weapon, facts: facts(true, true), sources: [weaponPath + '#' + weapon.id + '/metadata/' + (ranks[(probe.refinement ?? 1) - 1] ?? 'r1')], ...probe });
        for (const [index, expected] of amounts.entries()) run({ label: '持有者本次丰获之风', refinement: index + 1, expected });
        run({ label: '队友未受益', recipient: 'peer', expected: 0 });
        run({ label: '未装备蝶变', weapon: undefined, expected: 0 });
        run({ label: '本次轮到其他效果', facts: facts(false, true), expected: 0 });
        run({ label: '四秒限制尚未解除', facts: facts(true, false), expected: 0 });
        run({ label: '轮到的效果未知', facts: facts(null, true), expected: null });
        run({ label: '四秒资格未知', facts: facts(true, null), expected: null });
        run({ label: '应用未确认', application: null, expected: null });
        run({ label: '未应用', application: false, expected: 0 });
        for (const refinement of [0, 1.5, 6]) run({ label: '非法精炼档', refinement, expectedStatus: 'rejected', expected: null });
      },
    });
  }

  if (characters.has('ineffa')) {
    const source = textPath + 'constellations/ineffa.json';
    const { talent, ability } = configured.ineffa;
    const { modifiers, onAdded } = ability.record;
    const driver = modifiers.Ineffa_T4_Driver.modifierMixins[0];
    const listener = modifiers.Ineffa_T4_Avatar.modifierMixins[0];
    const actions = listener.actions[0].successActions;
    const revival = modifiers.IneffaT4_ReviveEnery.onAdded[0];
    const [amount, interval] = talent.record.paramList;
    const description = read(source).c4.description;
    const evidence = talent.record.openConfig === 'Ineffa_Constellation_4' && onAdded[0].target === 'Team'
      && onAdded[0].modifierName === 'Ineffa_T4_Driver' && driver.$type === 'LocalAvatarsMixin' && driver.modifierName === 'Ineffa_T4_Avatar'
      && listener.$type === 'DoActionByElementReactionMixin' && listener.reactionTypes.includes('MoonShock')
      && actions[0].modifierName === 'IneffaT4_ReviveEnery' && actions[0].target === undefined
      && revival.$type === 'ReviveElemEnergy' && revival.target === undefined && revival.value === 'ElemRevive'
      && actions[1].target === 'Team' && actions[1].modifierName === 'UNIQUE_Ineffa_T4_CD' && modifiers.UNIQUE_Ineffa_T4_CD.duration === 'CD'
      && description.includes(amount + '点元素能量') && description.includes('每' + interval + '秒');
    const facts = (actor, ready) => [
      ...(actor === null ? [] : ['actor', 'peer'].map(id => [id, reaction, bool(id === actor)])),
      ...(ready === null ? [] : [['team', reactionReady, bool(ready)]]),
    ];
    clause({ entity: 'ineffa', owner: 'ineffa', field: '/constellations/3/buffs', effect: 'ineffa.directEnergy.c4',
      buffs: characters.get('ineffa').metadata.constellations[3].buffs,
      sourceGroups: [source + '#c4', configPath + '#/ineffa/ability/record', configPath + '#/ineffa/talent/record'], evidence,
      description: '四命按明确的月感电触发归属和四秒资格为触发者恢复5点元素能量。',
      remaining: '月感电触发归属、队伍共享四秒计时和实际到账量仍需事件记录。',
      check(evaluate) {
        const run = probe => evaluate({ rank: 4, facts: facts('actor', true), ...probe });
        run({ label: '伊涅芙触发并受益', expected: amount });
        run({ label: '队友触发并受益', facts: facts('peer', true), triggerActor: 'peer', recipient: 'peer', expected: amount });
        run({ label: '队友在后台触发并受益', facts: [...facts('peer', true), ['peer', 'onField', bool(false)]], triggerActor: 'peer', recipient: 'peer', expected: amount });
        run({ label: '队友触发时伊涅芙不受益', facts: facts('peer', true), triggerActor: 'peer', expected: 0 });
        run({ label: '伊涅芙触发时队友不受益', recipient: 'peer', expected: 0 });
        run({ label: '本次未触发月感电', facts: facts('none', true), expected: 0 });
        run({ label: '共享四秒限制尚未解除', facts: facts('actor', false), expected: 0 });
        run({ label: '月感电触发归属未知', facts: facts(null, true), expected: null });
        run({ label: '共享四秒资格未知', facts: facts('actor', null), expected: null });
        run({ label: '应用未确认', application: null, expected: null });
        run({ label: '未应用', application: false, expected: 0 });
        run({ label: '命座未解锁', rank: 3, expected: 0 });
      },
    });
  }

  if (characters.has('razor')) {
    const source = textPath + 'talents/razor.json';
    const { abilitySpecials, modifiers, onAbilityStart } = configured.razor.ability.excerpt;
    const timer = modifiers.LycanMode_Timer;
    const initial = onAbilityStart.find(action => action.$type === 'AddGlobalValue');
    const decrement = timer.onThinkInterval[0];
    const feedback = modifiers.LycanMode_Energy_FeedBack;
    const revival = modifiers.LycanMode_Energy_Regain.onAdded[0];
    const [level, multiplier, operator] = revival.value;
    const cap = initial.value * multiplier;
    const evidence = initial.value === abilitySpecials[level] && decrement.key === initial.key && decrement.value < 0 && decrement.minValue === 0
      && decrement.useLimitRange === true && timer.thinkInterval === 3 && modifiers.LycanMode_Leave.onAvatarOut[0].modifierName === 'LycanMode_Timer'
      && timer.onRemoved[0].modifierName === 'LycanMode_Energy_FeedBack' && feedback.onAdded[0].globalValueKey === initial.key
      && feedback.onAdded[0].overrideMapKey === level && feedback.onRemoved[0].modifierName === 'LycanMode_Energy_Regain'
      && revival.$type === 'ReviveElemEnergy' && operator === 'MUL' && read(source).combat3.description.includes('返还至多' + cap + '点元素能量');
    const facts = (elapsed, active = true) => [
      ...(active === null ? [] : [['actor', exit, bool(active)]]),
      ...(elapsed === null ? [] : [['actor', ticks, number('count', elapsed)]]),
    ];
    clause({ entity: 'razor', owner: 'razor', field: '/talents/2/buffs', effect: 'razor.directEnergy.burstExit',
      buffs: characters.get('razor').metadata.talents[2].buffs,
      sourceGroups: [source + '#combat3', configPath + '#/razor/ability/excerpt'], evidence,
      description: '雷牙提前退场时，使用明确的三秒扣减次数求得雷泽的固定返还能量。',
      remaining: '雷牙计时起点、退场与扣减同刻的顺序及实际到账量仍需事件记录。',
      check(evaluate) {
        const run = probe => evaluate({ facts: facts(1), ...probe });
        for (let elapsed = 0; elapsed <= initial.value; elapsed++) {
          run({ label: '退场时已扣减 ' + elapsed + ' 次', facts: facts(elapsed), expected: Math.max(decrement.minValue, initial.value + elapsed * decrement.value) * multiplier });
        }
        run({ label: '队友未受益', recipient: 'peer', expected: 0 });
        run({ label: '提前退场未触发', facts: facts(1, false), expected: 0 });
        run({ label: '退场触发未知', facts: facts(1, null), expected: null });
        run({ label: '退场时的扣减次数未知', facts: facts(null), expected: null });
        run({ label: '超出计时器扣减上限', facts: facts(initial.value + 1), expectedStatus: 'invalid', expected: null });
        run({ label: '应用未确认', application: null, expected: null });
        run({ label: '未应用', application: false, expected: 0 });
      },
    });
  }

  return { rows, verified, resolved, gaps, summary: { confirmedEnergyCases: rows.length,
    confirmedEnergyMismatches: rows.filter(row => row.issue).length, confirmedEnergyClausesVerified: resolved.length } };
}
