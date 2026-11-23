import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, novice, setGateFacts } from './roster-audit-settings.mjs';

const configPath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/remaining-energy-facts.json';
const textPath = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const ratesPath = textPath + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const output = 'attribute.directEnergyRestored';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const binding = { kind: 'attribute', actor: { role: 'recipient' }, key: ref(output), at: { kind: 'current', phase: 'same' } };
const impactRemainder = '固定配置尚缺一命从实际消耗换算额外回能的动作表达式。消耗超过40且不足100点时，需确认非整10点的余量是否计入回能，或观测消耗45点时的实际能量变化。';
const text = (group, entity) => textPath + 'ChineseSimplified/' + group + '/' + entity + '.json';
const facts = (values, keys) => Object.fromEntries(keys.flatMap((key, index) => values[index] === null ? [] : [[key, values[index]]]));

/** Compare confirmed single-event grants to fixed text and independent action and parameter records. */
export function auditRemainingEnergyFacts(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peer = characters.get('barbara');
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  const configured = read(configPath);

  function clause({ entity, group, index, hit, effect, sources, evidence, description, timeline, unavailable, probes }) {
    const owner = characters.get(entity);
    if (!owner || !peer || !starter(owner) || !starter(peer)) return;
    const field = '/' + group + '/' + index;
    const buffs = owner.metadata[group][index].buffs;
    const buffIndex = buffs?.findIndex(buff => buff.id === effect) ?? -1;
    const buffField = field + '/buffs/' + buffIndex;
    const modifierIndex = buffs?.[buffIndex]?.modifiers.findIndex(modifier => modifier.target === output) ?? -1;
    const modifierField = buffField + '/modifiers/' + modifierIndex;
    const talent = owner.talents.find(talent => talent.hits.some(candidate => candidate.id === hit));
    const teams = new Map();
    const start = rows.length;

    for (const { label, facts: input, expected, expectedStatus = expected === null ? 'unknown' : 'known',
      recipient = 'actor', rank = 0, ascension = 0, application = true, diagnostic } of probes) {
      const probe = { label, owner: entity, recipient, rank, ascension, application, facts: input };
      const row = { entity, field: modifierField, effect, output, sources, probe, expected, expectedStatus, value: null, status: 'missing' };
      rows.push(row);
      const key = rank + ':' + ascension;
      let prepared = teams.get(key);
      if (!prepared) {
        prepared = engine.prepareStructuredBuilds([
          { id: 'actor', build: { ...auditBuild(owner, starter(owner)), constellation: rank, ascension, ...(ascension ? { level: 20 } : {}) } },
          { id: 'peer', build: auditBuild(peer, starter(peer)) },
        ]);
        teams.set(key, prepared);
      }
      if (!prepared.ok || !talent) {
        row.issue = '本次回能用例的角色配装或事件无法建立';
        row.diagnostics = prepared.diagnostics;
        continue;
      }
      const { setup, request: { frame } } = auditHit(owner, talent, talent.hits.find(candidate => candidate.id === hit));
      Object.assign(frame, { ownerId: 'actor', recipientId: recipient, contributorId: null, hit: null, facts: {}, factOverrides: [] });
      setGateFacts(owner, frame, input);
      const { team } = prepared;
      const context = engine.createStructuredCombatContext(team, setup);
      const receiver = context.actors.find(actor => actor.id === recipient);
      for (const [actor, character] of [[context.actors[0], owner], [context.actors[1], peer]]) {
        const activeEffects = new Set(actor.effects.map(reference => reference.id));
        const ids = new Set(character.calculation.bundle.effects.filter(rule => rule.target.kind === 'attribute'
          && rule.target.attribute.id === output && activeEffects.has(rule.identity.id)
          && engine.effectRecipientMatches(rule.recipient, actor.id, recipient, receiver.identity) === true).map(rule => (rule.buff ?? rule.identity).id));
        for (const id of ids) {
          const selected = actor.id === 'actor' && id === effect;
          if (selected && application === null) continue;
          frame.applications.push({ instanceId: engine.calculationEffectInstanceId(actor.id, ref(id), null), active: selected && application });
        }
      }
      const result = engine.evaluateCombatBindings(team.program, context, { energy: binding }, frame);
      const value = result.outputs.energy ?? result.outputs.invalid;
      row.status = value?.state ?? 'missing';
      if (value?.state === 'known' && value.value.kind === 'quantity' && value.value.unit === 'energy') row.value = value.value.value;
      if (buffIndex < 0 || modifierIndex < 0 || !evidence || row.status !== expectedStatus
        || (expected !== null && (row.value === null || Math.abs(row.value - expected) > 1e-9))
        || (diagnostic && !result.diagnostics.some(entry => entry.code === diagnostic))) {
        row.issue = '本次回能输出或来源与预期不符';
        row.diagnostics = result.diagnostics;
      }
    }
    if (rows.length === start || rows.slice(start).some(row => row.issue)) return;
    verified.add(entity + buffField);
    verified.add(entity + modifierField);
    resolved.push({ entity, field, resolved: description, remaining: [timeline, unavailable].filter(Boolean).join(' ') });
    gaps.push({ entity, field, reason: timeline, status: 'timeline-only', sources });
    if (unavailable) gaps.push({ entity, field: modifierField, reason: unavailable, status: 'unavailable', sources });
  }

  if (characters.has('sethos')) {
    const constellations = text('constellations', 'sethos'), talents = text('talents', 'sethos');
    const { ability: { excerpt: shot }, passive: { record: passive }, talent: { record: constellation } } = configured.sethos;
    const trigger = shot.modifiers.Avatar_Sethos_Constellation_6_Handler.onHittingOther[0];
    const cooldown = shot.modifiers.Avatar_Sethos_Constellation_6_CD;
    const [revive, startCooldown] = trigger.successActions;
    const [interval] = constellation.paramList, [maxSpent] = passive.paramList;
    const predicates = trigger.targetPredicates;
    const desc = read(constellations).c6.description;
    const evidence = trigger.target === 'Other' && revive.$type === 'ReviveElemEnergy' && revive.target === undefined
      && shot.onAbilityStart[0].globalValueKey === '_Enchanted_UsedEnergy' && shot.onAbilityStart[0].overrideMapKey === revive.value
      && shot.onAbilityStart[2].successActions[0].value[1] === revive.value && shot.onAbilityStart[2].successActions[0].value[2] === 'SUB'
      && predicates.some(rule => rule.attackTags?.includes('ExtraAttack')) && predicates.some(rule => rule.attackType === 'Range')
      && predicates.some(rule => rule.entityTypes?.includes('Monster')) && predicates.some(rule => rule.key === cooldown.onAdded[0].key && rule.value === 0)
      && predicates.some(rule => rule.talentParam === constellation.openConfig) && predicates.some(rule => rule.talentParam === passive.openConfig)
      && predicates.some(rule => rule.targetKey === revive.value && rule.targetValue === 0)
      && startCooldown.modifierName === 'Avatar_Sethos_Constellation_6_CD' && cooldown.duration === 'Constellation_6_CD'
      && desc.includes('每' + interval + '秒') && read(talents).passive1.description.includes('计入' + maxSpent + '点元素能量');
    const keys = ['sethos.shadowpiercingArrowHit', 'sethos.shadowpiercingRefundReady', 'sethos.shadowpiercingEnergySpent'];
    function probe(label, expected, values = [true, true, maxSpent], extra = {}) {
      return { label, expected, rank: 6, ascension: passive.breakLevel, facts: facts(values, keys), ...extra };
    }
    clause({ entity: 'sethos', group: 'constellations', index: 5, hit: 'sethos.normal.param7', effect: 'sethos.directEnergy.c6', evidence,
      sources: [constellations + '#c6', talents + '#passive1', configPath + '#/sethos/ability/excerpt', configPath + '#/sethos/passive/record', configPath + '#/sethos/talent/record'],
      description: '六命与突破天赋已解锁且贯影箭符合十五秒资格时，向赛索斯返还该发因天赋实际消耗的元素能量。',
      timeline: '贯影箭蓄力扣能、命中与十五秒计时仍需从时间轴事件自动推导。',
      probes: [
        ...[0, maxSpent / 4, maxSpent / 2 + 0.5, maxSpent].map(spent => probe('本发实际消耗 ' + spent, spent, [true, true, spent])),
        probe('队友未受益', 0, undefined, { recipient: 'peer' }),
        probe('五命未解锁', 0, undefined, { rank: 5 }),
        probe('突破天赋未解锁', 0, undefined, { ascension: 0 }),
        probe('贯影箭未命中', 0, [false, true, null]),
        probe('十五秒限制尚未解除', 0, [true, false, null]),
        probe('命中未知', null, [null, true, maxSpent]),
        probe('十五秒资格未知', null, [true, null, maxSpent]),
        probe('实际消耗未知', null, [true, true, null]),
        ...[-1, maxSpent + 1].map(spent => probe('非法消耗 ' + spent, null, [true, true, spent], { expectedStatus: 'invalid', diagnostic: 'invalid-range' })),
        probe('应用未确认', null, undefined, { application: null }),
        probe('未应用', 0, undefined, { application: false }),
      ],
    });
  }

  if (characters.has('sigewinne')) {
    const skill = text('talents', 'sigewinne');
    const { ability: { excerpt: core }, cast: { record: cast } } = configured.sigewinne;
    const [debts] = core.modifiers.Avatar_Sigewinne_Can_Trigger_Water_Core_Mark.modifierMixins;
    const [paid, scale, limit, apply] = debts.IIHEAEEODAI;
    const [revive] = core.modifiers.Sigewinne_Debts_Recover_Energy.onAdded;
    const { param10: ratios, param11: caps } = read(ratesPath).sigewinne.combat2;
    const [, perText, energyText, capText] = /每清除(\d+)点生命之契将为她恢复(\d+)点元素能量，至多通过这种方式为希格雯自己恢复(\d+)点元素能量/.exec(read(skill).combat2.description) ?? [];
    const per = Number(perText), rate = Number(energyText) / per, cap = Number(capText);
    const evidence = cast.onAbilityStart[0].abilityName === core.abilityName
      && core.onAdded.some(action => action.modifierName === 'Avatar_Sigewinne_Can_Trigger_Water_Core_Mark')
      && debts.$type === 'HPDebtsMixin' && paid.$type === 'GetHPPaidDebts' && paid.overrideMapKey === scale.value[0]
      && scale.value[1] === 'DebtsToEnergyRatio' && scale.value[2] === 'MUL' && scale.overrideMapKey === revive.value
      && limit.overrideMapKey === revive.value && limit.value === 'MaxEnergyRecover' && limit.predicates[0].targetKey === revive.value
      && apply.target === 'Caster' && apply.modifierName === 'Sigewinne_Debts_Recover_Energy' && revive.$type === 'ReviveElemEnergy'
      && ratios.length === 15 && caps.length === 15 && ratios.every(value => value === rate) && caps.every(value => value === cap);
    const keys = ['sigewinne.bondOfLifeCleared', 'sigewinne.bondOfLifeRepaid'];
    const capBasis = cap / rate;
    function probe(label, expected, values = [true, per], extra = {}) {
      return { label, expected, facts: facts(values, keys), ...extra };
    }
    clause({ entity: 'sigewinne', group: 'talents', index: 1, hit: 'sigewinne.skill.param1', effect: 'sigewinne.directEnergy.t1', evidence,
      sources: [skill + '#combat2', ratesPath + '#/sigewinne/combat2/param10', ratesPath + '#/sigewinne/combat2/param11', configPath + '#/sigewinne/ability/excerpt', configPath + '#/sigewinne/cast/record'],
      description: '按希格雯完全清除生命之契时累计的实际偿还量，以每2000点回1点线性换算，单次上限5点。',
      timeline: '生命之契的建立、累计偿还与最终清除仍需从时间轴事件自动推导。',
      probes: [
        ...[0, per / 2 - 1, per / 2, per / 2 + 1, per, per + per / 4, capBasis - 1, capBasis, capBasis + 1]
          .map(repaid => probe('完全清除契值 ' + repaid, Math.min(cap, repaid * rate), [true, repaid])),
        probe('部分偿还尚未完全清除', 0, [false, per * 0.75]),
        probe('随后完全清除时按累计偿还量', per * 1.25 * rate, [true, per * 1.25]),
        probe('队友未受益', 0, undefined, { recipient: 'peer' }),
        probe('完全清除与否未知', null, [null, per]),
        probe('累计偿还量未知', null, [true, null]),
        probe('偿还量不能为负', null, [true, -1], { expectedStatus: 'invalid', diagnostic: 'invalid-range' }),
        probe('应用未确认', null, undefined, { application: null }),
        probe('未应用', 0, undefined, { application: false }),
      ],
    });
  }

  if (characters.has('valeriy')) {
    const constellations = text('constellations', 'valeriy'), talents = text('talents', 'valeriy');
    const { talent: { record: c1 }, skill: { record: mortar }, impactText: { record: impact } } = configured.valeriy;
    const source = read(constellations), desc = source.c1.description;
    const [base, interval, bonus] = c1.paramList;
    const [, thresholdText, stepText, capText] = /超过(\d+)点的部分，每消耗(\d+)点，.*?至多通过这种方式为瓦列里恢复(\d+)点元素能量/.exec(desc) ?? [];
    const threshold = Number(thresholdText), step = Number(stepText), cap = Number(capText);
    const baseLimit = Number(/初始上限为(\d+)点/.exec(impact['4228876817'])?.[1]);
    const raisedLimit = baseLimit + Number(/上限提升(\d+)点/.exec(source.c4.description)?.[1]);
    const capBasis = threshold + (cap - base) / bonus * step;
    const keys = ['valeriy.impactEnergyTrigger', 'valeriy.impactEnergyCooldownReady', 'valeriy.spentImpactPotential'];
    const evidence = c1.openConfig === 'Valeriy_Constellation_1' && mortar.abilityName === 'Avatar_Valeriy_ExtraAttack'
      && read(talents).combat1.description.includes('至少' + threshold + '点') && impact['4228876817'].includes('至少' + threshold + '点')
      && desc.includes('恢复' + base + '点元素能量') && desc.includes('额外恢复' + bonus + '点元素能量') && desc.includes('每' + interval + '秒')
      && Number.isFinite(capBasis) && Number.isFinite(raisedLimit);
    function probe(label, expected, values = [true, true, baseLimit], extra = {}) {
      return { label, expected, rank: 1, facts: facts(values, keys), ...extra };
    }
    clause({ entity: 'valeriy', group: 'constellations', index: 0, hit: 'valeriy.normal.param5', effect: 'valeriy.directEnergy.c1', evidence,
      sources: [constellations + '#c1', constellations + '#c4', talents + '#combat1', configPath + '#/valeriy/talent/record',
        configPath + '#/valeriy/skill/record', configPath + '#/valeriy/impactText/record/4228876817',
        configPath + '#/valeriy/ability', configPath + '#/valeriy/constellationAbility', configPath + '#/valeriy/questAbility'],
      description: '确认一命特殊重击和十五秒资格后，核验40点消耗的基础6点、后续完整10点档位及15点能量总上限。',
      timeline: '冲击势能自动累计与扣除、十五秒资格仍需从时间轴事件推导。', unavailable: impactRemainder,
      probes: [
        ...Array.from({ length: (capBasis - threshold) / step + 1 }, (_, index) =>
          probe('已核实完整档位 ' + (threshold + step * index), Math.min(cap, base + index * bonus), [true, true, threshold + step * index])),
        ...[capBasis + step / 2, raisedLimit].map(spent => probe('四命后回能已达上限 ' + spent, cap, [true, true, spent], { rank: 4 })),
        ...[threshold + step / 2, threshold + step * 1.5, threshold + step * 3.5, threshold + step * 4.5, capBasis - 1].map(spent =>
          probe('中间档位未确认 ' + spent, null, [true, true, spent], { diagnostic: 'unreviewed-mechanism' })),
        probe('普通重击未达到特殊重击门槛', 0, [true, true, threshold - 1]),
        probe('未完成特殊重击', 0, [false, true, null]),
        probe('十五秒限制尚未解除', 0, [true, false, null]),
        probe('未解锁一命', 0, undefined, { rank: 0 }),
        probe('队友未受益', 0, undefined, { recipient: 'peer' }),
        probe('特殊重击触发未知', null, [null, true, baseLimit]),
        probe('十五秒资格未知', null, [true, null, baseLimit]),
        probe('实际消耗未知', null, [true, true, null]),
        probe('消耗不能为负', null, [true, true, -1], { expectedStatus: 'invalid', diagnostic: 'invalid-range' }),
        probe('超过零至三命的势能上限', null, [true, true, baseLimit + 1], { expectedStatus: 'invalid', diagnostic: 'invalid-range' }),
        probe('超过四命的势能上限', null, [true, true, raisedLimit + 1], { rank: 4, expectedStatus: 'invalid', diagnostic: 'invalid-range' }),
        probe('应用未确认', null, undefined, { application: null }),
        probe('未应用', 0, undefined, { application: false }),
      ],
    });
  }

  return { rows, verified, resolved, gaps, summary: { remainingEnergyCases: rows.length,
    remainingEnergyMismatches: rows.filter(row => row.issue).length, remainingEnergyClausesVerified: resolved.length } };
}
