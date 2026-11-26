import { readContentSource } from './content-source.mjs';
import { probeMonaSkills } from './mona-inventory-probes.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';
import { MONA_BASELINE } from './mona-entity-specs.mjs';

const sum = obj => Object.values(obj ?? {}).reduce((a, b) => a + b, 0);
const close = (a, b, tolerance = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;

const weaponDefaultCarrier = {
  WEAPON_SWORD_ONE_HAND: 'kaeya',
  WEAPON_BOW: 'amber',
  WEAPON_CATALYST: 'lisa',
  WEAPON_CLAYMORE: 'noelle',
  WEAPON_POLE: 'xiangling',
};

const monaFieldSpec = target => {
  if (target.startsWith('target.resistance.')) {
    return { source: 'damage', field: 'res_minus', sign: -1, base: null };
  }
  if (target === 'target.defenseReduction') {
    return { source: 'damage', field: 'def_minus', sign: 1, base: null };
  }
  if (target === 'attribute.defenseIgnore') {
    return { source: 'damage', field: 'def_penetration', sign: 1, base: null };
  }
  const map = {
    'attribute.attackPercent': { source: 'attribute', field: 'atk', sign: 1, base: 'attack' },
    'attribute.flatAttack': { source: 'attribute', field: 'atk', sign: 1, base: null },
    'attribute.attack': { source: 'attribute', field: 'atk', sign: 1, base: null },
    'attribute.hpPercent': { source: 'attribute', field: 'hp', sign: 1, base: 'hp' },
    'attribute.flatHp': { source: 'attribute', field: 'hp', sign: 1, base: null },
    'attribute.hp': { source: 'attribute', field: 'hp', sign: 1, base: null },
    'attribute.defensePercent': { source: 'attribute', field: 'def', sign: 1, base: 'defense' },
    'attribute.flatDefense': { source: 'attribute', field: 'def', sign: 1, base: null },
    'attribute.defense': { source: 'attribute', field: 'def', sign: 1, base: null },
    'attribute.elementalMastery': { source: 'attribute', field: 'elemental_mastery', sign: 1, base: null },
    'attribute.energyRecharge': { source: 'attribute', field: 'recharge', sign: 1, base: null },
    'attribute.critRate': { source: 'damage', field: 'critical', sign: 1, base: null },
    'attribute.critDamage': { source: 'damage', field: 'critical_damage', sign: 1, base: null },
    'attribute.healingBonus': { source: 'attribute', field: 'healing_bonus', sign: 1, base: null },
    'attribute.incomingHealingBonus': { source: 'attribute', field: 'incoming_healing_bonus', sign: 1, base: null },
    'attribute.shieldStrength': { source: 'attribute', field: 'shield_strength', sign: 1, base: null },
    'attribute.damageBonus': { source: 'damage', field: 'bonus', sign: 1, base: null },
    'attribute.baseDamageBonus': { source: 'damage', field: 'extra_damage', sign: 1, base: null },
  };
  if (Object.hasOwn(map, target)) return map[target];
  const elem = /^attribute\.(pyro|hydro|electro|cryo|anemo|geo|dendro|physical)Bonus$/.exec(target);
  if (elem) return { source: 'attribute', field: 'bonus_' + elem[1], sign: 1, base: null };
  return null;
};

function resolveRecipientHit(character, scenario, actorId) {
  let talent = character.talents[0];
  let hit = talent.hits[0];
  if (scenario.hitId) {
    for (const t of character.talents) {
      const found = t.hits.find(h => h.id === scenario.hitId);
      if (found) { talent = t; hit = found; break; }
    }
  } else if (scenario.hitCategory) {
    for (const t of character.talents) {
      const found = t.hits.find(h => (h.category ?? t.category) === scenario.hitCategory);
      if (found) { talent = t; hit = found; break; }
    }
  } else if (scenario.hitElement) {
    for (const t of character.talents) {
      const found = t.hits.find(h => (h.element ?? t.element) === scenario.hitElement);
      if (found) { talent = t; hit = found; break; }
    }
  }
  const { setup, request } = auditHit(character, talent, hit, 90);
  setup.events.find(e => e.id === 'hit').actorId = actorId;
  Object.assign(request.frame, {
    ownerId: actorId,
    recipientId: actorId,
    contributorId: null,
    hit: {
      skillId: talent.id,
      hitId: hit.id,
      category: hit.category ?? talent.category,
      element: hit.element ?? talent.element,
      origin: hit.origin ?? 'talent',
      family: scenario.hitFamily ?? hit.family ?? (hit.damage ? Object.keys(hit.damage)[0] : undefined) ?? 'ordinary',
      reactionId: scenario.reactionMode ?? null,
    },
  });
  return { setup, request, talent, hit };
}

function readLeylineTarget(engine, team, setup, frame, targetId) {
  const context = engine.createStructuredCombatContext(team, setup);
  const binding = targetId.startsWith('target.')
    ? { kind: 'enemy', key: { namespace: 'builtin', id: targetId, revision: '1' }, at: { kind: 'current', phase: 'same' } }
    : { kind: 'attribute', actor: { role: 'recipient' }, key: { namespace: 'builtin', id: targetId, revision: '1' }, at: { kind: 'current', phase: 'same' } };
  const evaluated = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame);
  const out = evaluated.outputs.value;
  return {
    value: out?.state === 'known' ? out.value.value : null,
    diagnostics: evaluated.diagnostics,
  };
}

function readMonaValue(sample, fieldInfo) {
  const obj = fieldInfo.source === 'damage' ? sample.damage : sample.attribute;
  return sum(obj[fieldInfo.field]);
}

function readMonaBaseStat(attrPanel, baseKind) {
  if (baseKind === 'attack') return (attrPanel.atk?.['角色基础攻击'] ?? 0) + (attrPanel.atk?.['武器基础攻击'] ?? 0);
  if (baseKind === 'hp') return attrPanel.hp?.['角色基础生命'] ?? 0;
  if (baseKind === 'defense') return attrPanel.def?.['角色基础防御'] ?? 0;
  return 1;
}

function setSubjectFacts(frame, subject, values, metadata) {
  if (!values || !Object.keys(values).length) return;
  let row = frame.factOverrides.find(r => r.subject.kind === subject.kind && r.subject.id === subject.id);
  if (!row) frame.factOverrides.push(row = { subject, facts: {} });
  for (const [key, val] of Object.entries(values)) {
    const decl = metadata?.facts?.[key];
    if (typeof val === 'boolean') row.facts[key] = bool(val);
    else if (typeof val === 'number') row.facts[key] = number(decl?.type?.unit ?? 'scalar', val);
    else row.facts[key] = { value: { kind: 'enum', value: String(val) }, provenance: 'explicit', sourceRefs: [] };
  }
}

/** Collect all character/weapon/set IDs needed to run a list of buff specs. */
export function collectBuffSpecDependencies(scenarios, weaponCatalog) {
  const characters = new Set(['kaeya', 'lisa', 'amber']);
  const weapons = new Set(Object.values(novice));
  const sets = new Set();
  for (const s of scenarios) {
    if (s.kind === 'character') characters.add(s.owner);
    if (s.kind === 'weapon') {
      weapons.add(s.owner);
      const wType = s.weaponType ?? weaponCatalog?.get(s.owner)?.weaponType;
      characters.add(s.carrier ?? weaponDefaultCarrier[wType] ?? 'kaeya');
    }
    if (s.kind === 'set') {
      sets.add(s.owner);
      characters.add(s.carrier ?? 'kaeya');
    }
    if (s.recipient) characters.add(s.recipient);
    if (s.carrier) characters.add(s.carrier);
  }
  return { characters: [...characters], weapons: [...weapons], sets: [...sets] };
}

/** Run declarative buff scenarios (character, weapon, or artifact set) across both engines. */
export async function runSpecBuffScenarios({ scenarios, entities, engine, leylineRows = [] }) {
  if (!scenarios.length) return { rows: [], mappings: [], summary: { cases: 0, matched: 0, different: 0, open: 0 } };
  const { api, read } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const monaChars = read('src/assets/_gen_character.js');
  const monaNameById = new Map(Object.keys(monaChars).map(name => [name.toLowerCase(), name]));
  const characters = new Map(entities.characters.map(c => [c.id, c]));
  const weapons = new Map(entities.weapons.map(w => [w.id, w]));
  const sets = new Map(entities.sets.map(s => [s.id, s]));
  const leylineById = new Map(leylineRows.map(r => [r.id, r]));

  const fixtureCache = new Map();
  async function monaFixture(recipientId, skillIndex = 0) {
    const cacheKey = `${recipientId}:${skillIndex}`;
    if (!fixtureCache.has(cacheKey)) {
      const monaName = monaNameById.get(recipientId.replaceAll('-', ''));
      if (!monaName) throw new Error(`Missing Mona character fixture for ${recipientId}`);
      const probe = (await probeMonaSkills({ characters: [monaName], indices: [skillIndex], constellations: [0] })).rows[0];
      if (!probe || probe.status !== 'ok') throw new Error(`Mona fixture failed for ${monaName}:${skillIndex}`);
      fixtureCache.set(cacheKey, probe.input);
    }
    return structuredClone(fixtureCache.get(cacheKey));
  }

  const rows = [];
  const mappings = [];

  for (const spec of scenarios) {
    const scenarioId = spec.scenarioId ?? 'default';
    try {
      let ownerChar;
      let ownerWeapon;
      let ownerSets = [];
      let ownerEntity;
      if (spec.kind === 'character') {
        ownerChar = characters.get(spec.owner);
        if (!ownerChar) throw new Error(`Missing character entity: ${spec.owner}`);
        ownerWeapon = weapons.get(novice[ownerChar.identity.weaponType]);
        ownerEntity = ownerChar;
      } else if (spec.kind === 'weapon') {
        ownerWeapon = weapons.get(spec.owner);
        if (!ownerWeapon) throw new Error(`Missing weapon entity: ${spec.owner}`);
        const carrierId = spec.carrier ?? weaponDefaultCarrier[ownerWeapon.weaponType] ?? 'kaeya';
        ownerChar = characters.get(carrierId);
        if (!ownerChar) throw new Error(`Missing carrier character: ${carrierId}`);
        ownerEntity = ownerWeapon;
      } else if (spec.kind === 'set') {
        const setDoc = sets.get(spec.owner);
        if (!setDoc) throw new Error(`Missing set entity: ${spec.owner}`);
        ownerChar = characters.get(spec.carrier ?? 'kaeya');
        ownerWeapon = weapons.get(novice[ownerChar.identity.weaponType]);
        ownerSets = [setDoc];
        ownerEntity = setDoc;
      }

      const selfRecipient = Boolean(spec.selfRecipient);
      const recipientId = selfRecipient ? ownerChar.id : (spec.recipient ?? (spec.hitElement === 'electro' ? 'lisa' : 'kaeya'));
      const recipientChar = characters.get(recipientId);
      if (!recipientChar) throw new Error(`Missing recipient character: ${recipientId}`);
      const recipientWeapon = weapons.get(novice[recipientChar.identity.weaponType]);

      const ownerBuild = {
        ...auditBuild(ownerChar, ownerWeapon, ownerSets),
        level: spec.level ?? (spec.ascension === 4 ? 60 : spec.ascension ? 20 : 90),
        ascension: spec.ascension ?? 6,
        weaponLevel: spec.weaponLevel ?? 1,
        weaponAscension: spec.weaponAscension ?? 0,
        constellation: spec.rank ?? 0,
        refinement: spec.refinement ?? 1,
        talents: {
          normal: spec.talentLevel ?? 10,
          skill: spec.talentLevel ?? 10,
          burst: spec.talentLevel ?? 10,
        },
        ...(ownerSets.length ? {
          theoreticalSetSlots: ownerSets[0].slots.slice(0, spec.pieces ?? 4).map(slot => ({ slot, setId: ownerSets[0].id })),
        } : {}),
      };
      const disabledOwnerBuild = spec.kind === 'weapon' && !spec.gates && !spec.event
        ? { ...ownerBuild, weapon: weapons.get(novice[ownerChar.identity.weaponType]), refinement: 1 }
        : spec.kind === 'set' && !spec.gates && !spec.event
          ? { ...ownerBuild, theoreticalSetSlots: ownerSets[0].slots.slice(0, (spec.pieces ?? 4) - 1).map(slot => ({ slot, setId: ownerSets[0].id })) }
          : spec.constellationParameter && (spec.rank ?? 0) > 0
            ? { ...ownerBuild, constellation: spec.rank - 1 }
            : null;

      const recipientBuild = selfRecipient ? ownerBuild : {
        ...auditBuild(recipientChar, recipientWeapon),
        level: 90,
        ascension: 6,
      };
      const teamMembers = [
        { id: 'actor', build: ownerBuild },
        ...(!selfRecipient ? [{ id: 'peer', build: recipientBuild }] : []),
        ...(spec.teamElements ?? []).map((element, i) => ({ id: 'extra' + i, element })),
      ];
      const prepared = engine.prepareStructuredBuilds(teamMembers);
      if (!prepared.ok) throw new Error(`prepareStructuredBuilds failed: ${JSON.stringify(prepared.diagnostics)}`);
      const disabledTeam = disabledOwnerBuild
        ? engine.prepareStructuredBuilds([{ id: 'actor', build: disabledOwnerBuild }, ...teamMembers.slice(1)])
        : null;
      if (disabledTeam && !disabledTeam.ok) throw new Error(`disabled build failed: ${JSON.stringify(disabledTeam.diagnostics)}`);

      const recipientActor = selfRecipient ? 'actor' : 'peer';
      const { setup, request } = resolveRecipientHit(recipientChar, spec, recipientActor);

      // Optional: read owner's live LeyLine attribute and inject it into monaParams
      const effectiveMonaParams = spec.monaParams ? { ...spec.monaParams } : {};
      let injectedOwnerStatValue = null;
      if (spec.injectOwnerStat) {
        const { stat: ownerStatName, monaParam, scale } = spec.injectOwnerStat;
        const ownerSetup = structuredClone(setup);
        const ownerFrame = structuredClone(request.frame);
        setAuditDefaults(ownerChar, ownerFrame);
        if (spec.kind === 'weapon') setAuditDefaults(ownerWeapon, ownerFrame);
        if (spec.kind === 'set') setAuditDefaults(ownerSets[0], ownerFrame);
        ownerFrame.ownerId = 'actor';
        ownerFrame.recipientId = 'actor';
        const ownerRead = readLeylineTarget(engine, prepared.team, ownerSetup, ownerFrame, 'attribute.' + ownerStatName);
        if (ownerRead.value == null) throw new Error(`Failed to read owner stat ${ownerStatName} for injection`);
        injectedOwnerStatValue = ownerRead.value;
        if (monaParam) effectiveMonaParams[monaParam] = injectedOwnerStatValue * (scale ?? 1);
      }

      const monaInput = await monaFixture(recipientId, spec.monaSkillIndex ?? 0);
      Object.assign(monaInput.character, { level: recipientBuild.level, ascend: false, constellation: recipientBuild.constellation, skill1: 0, skill2: 0, skill3: 0 });
      Object.assign(monaInput.weapon, { level: 1, ascend: false, refine: 1 });
      monaInput.artifacts = [];
      const monaBuff = {
        name: spec.key,
        config: Object.keys(effectiveMonaParams).length ? { [spec.key]: effectiveMonaParams } : 'NoConfig',
      };
      const monaDisabledBuff = spec.constellationParameter
        ? { name: spec.key, config: { [spec.key]: { ...effectiveMonaParams, [spec.constellationParameter]: false } } }
        : { ...monaBuff, lock: true };

      const sampleMona = buffs => {
        const input = { ...structuredClone(monaInput), buffs };
        return {
          attribute: api.CommonInterface.get_attribute(input),
          damage: api.CalculatorInterface.get_damage_analysis(input, null),
        };
      };
      const monaBefore = sampleMona([]);
      const monaAfter = sampleMona([monaBuff]);
      const monaDisabled = sampleMona([monaDisabledBuff]);

      for (const eff of spec.effects ?? []) {
        const fieldInfo = eff.monaField
          ? { source: eff.monaSource ?? 'attribute', field: eff.monaField, sign: eff.monaSign ?? 1, base: eff.monaBase ?? null }
          : monaFieldSpec(eff.leylineTarget);
        if (!fieldInfo) throw new Error(`Unsupported target for Mona mapping: ${eff.leylineTarget}`);

        const readings = {};
        for (const phase of ['before', 'enabled', 'disabled']) {
          const useDisabledTeam = (phase === 'before' || phase === 'disabled') && Boolean(disabledTeam);
          const active = phase === 'enabled' || (phase === 'disabled' && Boolean(disabledTeam));
          const phaseSetup = structuredClone(setup);
          const phaseFrame = structuredClone(request.frame);
          const eventWindowFacts = new Set();
          if (spec.event) {
            const meta = ownerEntity.metadata ?? ownerEntity;
            for (const g of [meta, ...(meta.talents ?? []), ...(meta.passives ?? []), ...(meta.constellations ?? []), ...(meta.effects ?? [])]) {
              for (const b of g.buffs ?? []) if (b.windowFact && b.trigger) eventWindowFacts.add(b.windowFact);
            }
          }
          setAuditDefaults(ownerChar, phaseFrame);
          if (spec.kind === 'weapon') setAuditDefaults(ownerWeapon, phaseFrame);
          if (spec.kind === 'set') setAuditDefaults(ownerSets[0], phaseFrame);
          if (eventWindowFacts.size) {
            for (const row of phaseFrame.factOverrides) {
              for (const key of eventWindowFacts) {
                if (!Object.hasOwn(spec.gates ?? {}, key) && !Object.hasOwn(spec.fixedGates ?? {}, key)) {
                  delete row.facts[key];
                }
              }
            }
          }
          if (!selfRecipient) {
            phaseFrame.factOverrides = phaseFrame.factOverrides.filter(r => r.subject.id !== recipientActor);
          }
          const recipientDefaults = {};
          if (!selfRecipient) {
            for (const srcEntity of [ownerChar, ...(spec.kind === 'weapon' ? [ownerWeapon] : []), ...(spec.kind === 'set' ? [ownerSets[0]] : [])]) {
              for (const [key, field] of Object.entries(srcEntity?.metadata?.facts ?? {})) {
                if (field.scope !== 'recipient' || eventWindowFacts.has(key)) continue;
                recipientDefaults[key] = field.type.kind === 'quantity' ? 0
                  : field.type.kind === 'boolean' ? false
                    : (field.type.values?.includes('none') ? 'none' : field.type.values?.[0]);
              }
            }
          }
          const resetVal = v => (typeof v === 'boolean' ? false : typeof v === 'string' ? 'none' : 0);
          setSubjectFacts(phaseFrame, { kind: 'actor', id: recipientActor }, {
            ...recipientDefaults,
            onField: spec.recipientOnField ?? true,
            hpRatio: spec.recipientHpRatio ?? 1,
            ...(spec.fixedRecipientGates ?? {}),
            ...Object.fromEntries(Object.entries(spec.recipientGates ?? {}).map(([k, v]) => [k, active ? v : resetVal(v)])),
          }, {
            facts: {
              ...(ownerChar?.metadata?.facts ?? {}),
              ...(spec.kind === 'weapon' ? (ownerWeapon?.metadata?.facts ?? {}) : {}),
              ...(spec.kind === 'set' ? (ownerSets[0]?.metadata?.facts ?? {}) : {}),
              ...(recipientChar?.metadata?.facts ?? {}),
            },
          });

          const ownerFacts = {
            onField: spec.ownerOnField ?? true,
            ...(spec.fixedGates ?? {}),
            ...Object.fromEntries(Object.entries(spec.gates ?? {}).map(([k, v]) => [k, active ? v : resetVal(v)])),
          };
          setGateFacts(ownerEntity, phaseFrame, ownerFacts);

          if (spec.targetGates) {
            setSubjectFacts(phaseFrame, { kind: 'target', id: 'enemy' },
              Object.fromEntries(Object.entries(spec.targetGates).map(([k, v]) => [k, active ? v : resetVal(v)])),
              ownerEntity.metadata);
          }
          if (spec.teamGates) {
            setSubjectFacts(phaseFrame, { kind: 'team' },
              Object.fromEntries(Object.entries(spec.teamGates).map(([k, v]) => [k, active ? v : resetVal(v)])),
              ownerEntity.metadata);
          }
          if (spec.queryFacts) {
            for (const [k, v] of Object.entries(spec.queryFacts)) {
              const val = active ? v : (typeof v === 'boolean' ? false : 0);
              phaseFrame.facts[k] = typeof val === 'boolean' ? bool(val) : number('scalar', val);
            }
          }

          if (active && spec.prerequisite) {
            phaseSetup.events.unshift({ id: 'prerequisite', actorId: 'actor', timeMs: 0, order: 0, sourceEventIds: [], facts: {}, ...spec.prerequisite });
          }
          if ((active || (spec.prerequisite && phase === 'disabled')) && spec.event) {
            const { actorOnField, ...eventBody } = spec.event;
            const subjectFacts = actorOnField !== undefined
              ? [{ subject: { kind: 'actor', id: eventBody.actorId ?? 'actor' }, values: { onField: bool(actorOnField) } }]
              : undefined;
            phaseSetup.events.push({
              id: 'trigger',
              actorId: 'actor',
              timeMs: 0,
              order: 1,
              sourceEventIds: [],
              facts: {},
              ...(subjectFacts ? { subjectFacts } : {}),
              ...eventBody,
            });
          }

          const read = readLeylineTarget(engine, useDisabledTeam ? disabledTeam.team : prepared.team, phaseSetup, phaseFrame, eff.leylineTarget);
          readings[phase] = read;
        }

        const leylineBefore = readings.before.value;
        const leylineAfter = readings.enabled.value;
        const leylineDisabled = readings.disabled.value;
        const leylineDelta = (leylineBefore != null && leylineAfter != null) ? leylineAfter - leylineBefore : null;

        const mBefore = readMonaValue(monaBefore, fieldInfo);
        const mAfter = readMonaValue(monaAfter, fieldInfo);
        const mDisabled = readMonaValue(monaDisabled, fieldInfo);
        const monaBaseStat = readMonaBaseStat(monaBefore.attribute, fieldInfo.base);
        const monaDeltaRaw = mAfter - mBefore;
        const monaDeltaNormalized = fieldInfo.base ? monaDeltaRaw / monaBaseStat : monaDeltaRaw * fieldInfo.sign;

        const computedAmount = (eff.ownerStatScale != null && injectedOwnerStatValue != null)
          ? Math.min(eff.ownerStatCap ?? Infinity, injectedOwnerStatValue * eff.ownerStatScale)
          : eff.amount;
        const expectedLeyline = eff.expectedLeyline ?? computedAmount;
        const expectedMonaRaw = eff.expectedMona != null
          ? (fieldInfo.base ? eff.expectedMona * monaBaseStat : eff.expectedMona)
          : (fieldInfo.base ? computedAmount * monaBaseStat : computedAmount * fieldInfo.sign);
        const tol = eff.tolerance ?? 1e-6;

        const leylineOk = close(leylineDelta, expectedLeyline, tol) && close(leylineDisabled, leylineBefore, tol);
        const monaOk = close(monaDeltaRaw, expectedMonaRaw, Math.max(tol, Math.abs(expectedMonaRaw) * 1e-6))
          && close(mDisabled, mBefore, Math.max(tol, 1e-7));
        const isDifferent = eff.disposition === 'different';
        const bilateralOk = isDifferent
          ? (leylineOk && monaOk)
          : (leylineOk && monaOk && close(monaDeltaNormalized, leylineDelta, Math.max(tol, Math.abs(expectedLeyline) * 1e-6)));

        const status = bilateralOk ? (isDifferent ? 'different' : 'matched') : 'open';

        const leylinePointer = eff.leylineField
          ?? (spec.kind === 'character'
            ? `/${spec.group}/${spec.index}/buffs/${eff.buffIndex ?? 0}/modifiers/${eff.modifierIndex ?? 0}`
            : spec.kind === 'weapon'
              ? `/buffs/${eff.buffIndex ?? 0}/modifiers/${eff.modifierIndex ?? 0}`
              : `/effects/${spec.effectIndex ?? 1}/buffs/${eff.buffIndex ?? 0}/modifiers/${eff.modifierIndex ?? 0}`);
        const targetId = `${spec.kind}:${spec.owner}:modifier:${leylinePointer}`;
        const monaId = eff.monaEffectId ?? (eff.monaEffectIndex != null ? `mona:effect:character:${spec.key}:${eff.monaEffectIndex}` : `mona:buff:${spec.key}`);
        const statName = eff.leylineTarget.startsWith('attribute.') ? eff.leylineTarget.slice('attribute.'.length) : eff.leylineTarget;

        const row = {
          key: spec.key,
          scenarioId,
          kind: spec.kind,
          effectId: monaId,
          stat: statName,
          leylineTarget: eff.leylineTarget,
          amount: expectedLeyline,
          source: spec.owner,
          recipient: recipientId,
          targetId,
          monaDelta: monaDeltaRaw,
          monaDeltaNormalized,
          monaExpected: expectedMonaRaw,
          leylineBefore,
          leylineAfter,
          leylineDelta,
          status,
          disposition: isDifferent ? 'different' : 'matched',
          explanation: eff.explanation ?? spec.explanation ?? `${spec.key} (${scenarioId}) bilateral buff scenario`,
          diagnostics: status === 'open' ? {
            before: readings.before.diagnostics,
            enabled: readings.enabled.diagnostics,
            disabled: readings.disabled.diagnostics,
          } : undefined,
          behaviorEvidence: {
            source: spec.owner,
            recipient: recipientId,
            attribute: statName,
            targetId,
            ...(fieldInfo.base ? { monaBaseStat } : {}),
            mona: {
              before: mBefore,
              enabled: mAfter,
              disabled: mDisabled,
              disabledCondition: spec.constellationParameter ? `${spec.constellationParameter}=false` : 'buff locked',
            },
            leyline: {
              before: leylineBefore,
              enabled: leylineAfter,
              disabled: leylineDisabled,
              disabledCondition: disabledTeam ? 'owner below unlock/unequipped' : 'gates/event inactive',
            },
          },
          evidence: [
            spec.specPath,
            `src/game-data/data/${spec.kind === 'character' ? 'characters' : spec.kind === 'weapon' ? 'weapons' : 'artifact-sets'}/${spec.owner}.json#${leylinePointer}`,
            ...(spec.evidence ?? []),
          ],
        };
        rows.push(row);

        const targetRow = leylineById.get(targetId);
        if ((status === 'matched' || status === 'different') && targetRow) {
          mappings.push({
            id: `spec-buff:${spec.kind}:${spec.key}:${scenarioId}:${eff.leylineTarget}`,
            disposition: status,
            coverage: 'scenario',
            mona: [monaId],
            leyline: [{ id: targetRow.id, revision: targetRow.revision }],
            explanation: row.explanation,
            sources: row.evidence,
            comparisons: [
              { name: `Mona ${spec.key} ${fieldInfo.field} delta`, expected: expectedMonaRaw, actual: monaDeltaRaw, tolerance: Math.max(tol, Math.abs(expectedMonaRaw) * 1e-6) },
              { name: `LeyLine ${eff.leylineTarget} delta`, expected: expectedLeyline, actual: leylineDelta, tolerance: tol },
            ],
          });
        }
      }
    } catch (error) {
      rows.push({
        key: spec.key,
        scenarioId,
        kind: spec.kind,
        source: spec.owner,
        status: 'error',
        error: String(error?.message ?? error),
      });
    }
  }

  return {
    rows,
    mappings,
    summary: {
      cases: rows.length,
      matched: rows.filter(r => r.status === 'matched').length,
      different: rows.filter(r => r.status === 'different').length,
      open: rows.filter(r => !['matched', 'different'].includes(r.status)).length,
    },
  };
}

const scalingMap = {
  attack: { monaPanel: 'atk', monaBuff: 'ATKFixed', traceId: 'attribute.attack' },
  hp: { monaPanel: 'hp', monaBuff: 'HPFixed', traceId: 'attribute.hp' },
  defense: { monaPanel: 'def', monaBuff: 'DEFFixed', traceId: 'attribute.defense' },
  elementalMastery: { monaPanel: 'em', monaBuff: 'ElementalMastery', traceId: 'attribute.elementalMastery' },
};

/** Run declarative conditional / non-ordinary / multi-stat hit scenarios across both engines. */
export async function runSpecHitScenarios({ scenarios, entities, engine, leylineRows = [] }) {
  if (!scenarios.length) return { rows: [], mappings: [], summary: { cases: 0, matched: 0, different: 0, open: 0 } };
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const characters = new Map(entities.characters.map(c => [c.id, c]));
  const weapons = new Map(entities.weapons.map(w => [w.id, w]));
  const leylineById = new Map(leylineRows.map(r => [r.id, r]));

  const rows = [];
  const mappings = [];

  for (const spec of scenarios) {
    const scenarioId = spec.scenarioId ?? 'default';
    const record = {
      entity: spec.entity,
      mona: `mona:skill:${spec.monaKey}:${spec.monaSkillIndex}`,
      leyline: `character:${spec.entity}:hit:${spec.leylineHitField}`,
      scenarioId,
      status: 'open',
      cases: [],
    };
    rows.push(record);
    try {
      const character = characters.get(spec.entity);
      if (!character) throw new Error(`Missing character: ${spec.entity}`);
      const weapon = weapons.get(spec.weapon ?? novice[character.identity.weaponType]);
      const targetRow = leylineById.get(record.leyline);
      let talent;
      let hit;
      const hitMatch = /^\/(talents|passives|constellations)\/(\d+)\/hits\/(\d+)$/.exec(spec.leylineHitField);
      if (!hitMatch) throw new Error(`Invalid leylineHitField: ${spec.leylineHitField}`);
      const [, bucket, ownerIdx, hitIdx] = hitMatch;
      const ownerObj = character[bucket]?.[Number(ownerIdx)];
      hit = ownerObj?.hits?.[Number(hitIdx)];
      talent = bucket === 'talents'
        ? ownerObj
        : character.talents.find(t => t.id === hit?.skill) ?? character.talents[0];
      if (!hit || !talent) throw new Error(`Missing hit at ${spec.leylineHitField}`);

      const constellation = spec.constellation ?? 0;
      const level = spec.level ?? 90;
      const ascension = spec.ascension ?? 6;
      const talentLevels = spec.talentLevels ?? [1, 6, 10];
      const probe = (await probeMonaSkills({
        characters: [spec.monaKey],
        indices: [spec.monaSkillIndex],
        constellations: [constellation],
      })).rows[0];
      if (!probe || probe.status !== 'ok') throw new Error(`Mona probe failed for ${spec.monaKey}:${spec.monaSkillIndex}`);

      const bonuses = Object.fromEntries(['normal', 'skill', 'burst'].map(cat => [cat,
        (character.constellations ?? []).filter(c => c.rank <= constellation).flatMap(c => c.talentBonuses ?? [])
          .filter(b => b.category === cat).reduce((n, b) => n + b.levels, 0)]));

      for (const tLevel of talentLevels) {
        const build = {
          ...auditBuild(character, weapon),
          level,
          ascension,
          constellation,
          talents: { normal: tLevel, skill: tLevel, burst: tLevel },
        };
        const teamMembers = [
          { id: 'actor', build },
          ...(spec.teamElements ?? []).map((element, i) => ({ id: 'extra' + i, element })),
        ];
        const prepared = engine.prepareStructuredBuilds(teamMembers);
        if (!prepared.ok) throw new Error(`prepareStructuredBuilds failed: ${JSON.stringify(prepared.diagnostics)}`);

        const { setup, request } = auditHit(character, talent, hit, 90);
        setAuditDefaults(character, request.frame);
        setAuditDefaults(weapon, request.frame);
        if (spec.leylineFacts) setGateFacts(character, request.frame, spec.leylineFacts);
        if (spec.queryFacts) {
          for (const [k, v] of Object.entries(spec.queryFacts)) {
            request.frame.facts[k] = typeof v === 'boolean' ? bool(v) : number('count', v);
          }
        }
        if (spec.targetFacts) setSubjectFacts(request.frame, { kind: 'target', id: 'enemy' }, spec.targetFacts, character.metadata);
        if (spec.reactionMode) request.reactionMode = spec.reactionMode;
        if (spec.critMode) request.critMode = spec.critMode;

        const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
        const leylineVal = evaluated.totals.all.value?.value ?? null;

        const monaInput = structuredClone(probe.input);
        Object.assign(monaInput.character, {
          level,
          ascend: false,
          constellation,
          skill1: tLevel + bonuses.normal - 1,
          skill2: tLevel + bonuses.skill - 1,
          skill3: tLevel + bonuses.burst - 1,
        });
        Object.assign(monaInput.weapon, { level: 1, ascend: false, refine: 1 });
        monaInput.artifacts = [];
        monaInput.buffs = [];
        if (spec.monaCharParams && monaInput.character.params !== 'NoConfig') {
          Object.assign(monaInput.character.params[spec.monaKey], spec.monaCharParams);
        }
        if (spec.monaSkillConfig && monaInput.skill.config !== 'NoConfig') {
          Object.assign(monaInput.skill.config[spec.monaKey], spec.monaSkillConfig);
        }

        // Align Mona panel rounding on active scaling axes (ATK / HP / DEF / EM)
        const rawOwner = character.metadata?.[bucket]?.[Number(ownerIdx)];
        const rawHit = rawOwner?.hits?.[Number(hitIdx)];
        const baseTerms = Array.isArray(rawHit?.base) ? rawHit.base : (Array.isArray(hit.base) ? hit.base : []);
        let ratioRoundingBound = 0;
        if (spec.alignPanel !== false) {
          const neutral = api.CalculatorInterface.get_damage_analysis(monaInput, null);
          const axes = [...new Set(baseTerms.map(t => t.stat).filter(s => scalingMap[s]))];
          for (const axis of axes) {
            const info = scalingMap[axis];
            const traceNode = evaluated.trace.find(n => n.kind === 'attribute' && n.nodeId === info.traceId && n.context?.actorId === 'actor');
            const leyStat = traceNode?.state === 'known' ? traceNode.value?.value : null;
            const monaStat = sum(neutral[info.monaPanel]);
            if (Number.isFinite(leyStat) && Number.isFinite(monaStat)) {
              const adj = leyStat - monaStat;
              if (Math.abs(adj) > 1e-9 && Math.abs(adj) <= 5) {
                monaInput.buffs.push({ name: info.monaBuff, config: { [info.monaBuff]: { value: adj } } });
              }
              const termCount = baseTerms.filter(t => t.stat === axis).length;
              ratioRoundingBound += leyStat * 0.000051 * Math.max(1, termCount);
            }
          }
        }

        const analysis = api.CalculatorInterface.get_damage_analysis(monaInput, null);
        const branchKey = spec.monaBranch ?? 'normal';
        const critKey = spec.critMode === 'critical' ? 'critical' : spec.critMode === 'expected' ? 'expectation' : 'non_critical';
        const monaVal = analysis[branchKey]?.[critKey] ?? null;
        const tol = Math.max(1e-5, Math.abs(monaVal ?? 0) * (spec.relativeTolerance ?? 0.0002), ratioRoundingBound);
        const matched = Number.isFinite(monaVal) && Number.isFinite(leylineVal) && Math.abs(monaVal - leylineVal) <= tol;

        record.cases.push({
          talentLevel: tLevel,
          constellation,
          mona: monaVal,
          leyline: leylineVal,
          tolerance: tol,
          element: { mona: String(analysis.element ?? '').toLowerCase(), leyline: hit.element ?? talent.element },
          matched,
          requiredInputs: evaluated.requiredInputs,
        });
      }

      const allMatched = record.cases.length > 0 && record.cases.every(c => c.matched && !c.requiredInputs?.length);
      const isDifferent = spec.disposition === 'different';
      record.status = allMatched ? 'matched' : (isDifferent && record.cases.every(c => Number.isFinite(c.leyline) && Number.isFinite(c.mona)) ? 'different' : 'open');

      if ((record.status === 'matched' || record.status === 'different') && targetRow) {
        mappings.push({
          id: `spec-hit:${spec.monaKey}:${spec.monaSkillIndex}:${scenarioId}`,
          disposition: record.status,
          coverage: 'scenario',
          mona: [record.mona],
          leyline: [{ id: targetRow.id, revision: targetRow.revision }],
          explanation: spec.explanation ?? `${spec.monaKey} skill #${spec.monaSkillIndex} (${scenarioId}) bilateral scenario`,
          sources: [spec.specPath, targetRow.source, '.references/mona-community/beta-tools/runtime-7106.mjs', ...(spec.evidence ?? [])],
          comparisons: record.cases.map(c => ({
            name: `C${c.constellation} T${c.talentLevel} ${scenarioId}`,
            expected: c.mona,
            actual: c.leyline,
            tolerance: c.tolerance,
          })),
        });
      }
    } catch (error) {
      record.status = 'error';
      record.error = String(error?.message ?? error);
    }
  }

  return {
    rows,
    mappings,
    summary: {
      cases: rows.length,
      matched: rows.filter(r => r.status === 'matched').length,
      different: rows.filter(r => r.status === 'different').length,
      open: rows.filter(r => !['matched', 'different'].includes(r.status)).length,
    },
  };
}

/** Run declarative 4-piece wearer-self artifact set scenarios across both engines. */
export async function runSpecFourPieceScenarios({ scenarios, entities, engine, leylineRows = [] }) {
  if (!scenarios.length) return { rows: [], mappings: [], summary: { cases: 0, matched: 0, different: 0, open: 0 } };
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const characters = new Map(entities.characters.map(c => [c.id, c]));
  const weapons = new Map(entities.weapons.map(w => [w.id, w]));
  const sets = new Map(entities.sets.map(s => [s.id, s]));
  const leylineById = new Map(leylineRows.map(r => [r.id, r]));

  const rows = [];
  const mappings = [];

  for (const spec of scenarios) {
    const scenarioId = spec.scenarioId ?? 'default';
    try {
      const setDoc = sets.get(spec.entity);
      const recipientId = spec.recipient ?? 'kaeya';
      const character = characters.get(recipientId);
      if (!setDoc || !character) throw new Error(`Missing set ${spec.entity} or character ${recipientId}`);
      const weapon = weapons.get(novice[character.identity.weaponType]);

      const buildFor = pieces => ({
        ...auditBuild(character, weapon, [setDoc]),
        level: 90,
        ascension: 6,
        theoreticalSetSlots: setDoc.slots.slice(0, pieces).map(slot => ({ slot, setId: setDoc.id })),
      });
      const extraMembers = (spec.teamElements ?? []).map((element, i) => ({ id: 'extra' + i, element }));
      const team3 = engine.prepareStructuredBuilds([{ id: 'actor', build: buildFor(3) }, ...extraMembers]);
      const team4 = engine.prepareStructuredBuilds([{ id: 'actor', build: buildFor(4) }, ...extraMembers]);
      if (!team3.ok || !team4.ok) throw new Error('Failed to prepare 3pc/4pc builds');

      const { setup, request } = resolveRecipientHit(character, spec, 'actor');
      const fourPcEvents = spec.events ?? (spec.event ? [spec.event] : []);
      const eventWindowFacts = new Set();
      if (fourPcEvents.length) {
        const meta = setDoc.metadata ?? setDoc;
        for (const g of [meta, ...(meta.effects ?? [])]) {
          for (const b of g.buffs ?? []) if (b.windowFact && b.trigger) eventWindowFacts.add(b.windowFact);
        }
      }
      setAuditDefaults(character, request.frame);
      setAuditDefaults(setDoc, request.frame);
      if (eventWindowFacts.size) {
        for (const row of request.frame.factOverrides) {
          for (const key of eventWindowFacts) {
            if (!Object.hasOwn(spec.gates ?? {}, key)) {
              delete row.facts[key];
            }
          }
        }
      }
      if (spec.gates) setGateFacts(setDoc, request.frame, spec.gates);
      if (spec.targetGates) setSubjectFacts(request.frame, { kind: 'target', id: 'enemy' }, spec.targetGates, setDoc.metadata);
      if (fourPcEvents.length) {
        const hitEvent = setup.events.find(e => e.id === 'hit');
        if (hitEvent) hitEvent.timeMs = fourPcEvents.length * 10 + 1;
      }
      for (const [idx, ev] of fourPcEvents.entries()) {
        const { actorOnField, ...eventBody } = ev;
        const subjectFacts = actorOnField !== undefined
          ? [{ subject: { kind: 'actor', id: eventBody.actorId ?? 'actor' }, values: { onField: bool(actorOnField) } }]
          : undefined;
        setup.events.push({ id: `trigger-${idx}`, actorId: 'actor', timeMs: idx * 10, order: idx, sourceEventIds: [], facts: {}, ...(subjectFacts ? { subjectFacts } : {}), ...eventBody });
      }

      const monaName = spec.recipientMonaKey ?? (recipientId[0].toUpperCase() + recipientId.slice(1));
      const probe = (await probeMonaSkills({ characters: [monaName], indices: [spec.monaSkillIndex ?? 0], constellations: [0] })).rows[0];
      if (!probe || probe.status !== 'ok') throw new Error(`Mona fixture failed for ${monaName}`);
      const otherSet = spec.key === 'GladiatorsFinale' ? 'NoblesseOblige' : 'GladiatorsFinale';
      const arts3 = probe.input.artifacts.slice(0, 4).map((a, i) => ({
        ...a,
        set_name: i === 3 ? otherSet : spec.key,
        ...(spec.stripArtifactSubstats ? { sub_stats: [] } : {}),
      }));
      const arts4 = arts3.map(a => ({ ...a, set_name: spec.key }));
      const monaConfig = spec.monaArtifactConfig ?? null;

      const sampleMona = artifacts => {
        const input = { ...structuredClone(probe.input), artifacts, artifact_config: monaConfig, buffs: [] };
        return {
          attribute: api.CommonInterface.get_attribute(input),
          damage: api.CalculatorInterface.get_damage_analysis(input, null),
        };
      };
      const m3 = sampleMona(arts3);
      const m4 = sampleMona(arts4);

      for (const eff of spec.effects ?? []) {
        const fieldInfo = eff.monaField
          ? { source: eff.monaSource ?? 'attribute', field: eff.monaField, sign: eff.monaSign ?? 1, base: eff.monaBase ?? null }
          : monaFieldSpec(eff.leylineTarget);
        if (!fieldInfo) throw new Error(`Unsupported 4pc target: ${eff.leylineTarget}`);

        const r3 = readLeylineTarget(engine, team3.team, setup, request.frame, eff.leylineTarget);
        const r4 = readLeylineTarget(engine, team4.team, setup, request.frame, eff.leylineTarget);
        const leylineDelta = (r3.value != null && r4.value != null) ? r4.value - r3.value : null;

        const mBefore = readMonaValue(m3, fieldInfo);
        const mAfter = readMonaValue(m4, fieldInfo);
        const monaBaseStat = readMonaBaseStat(m3.attribute, fieldInfo.base);
        const monaDeltaRaw = mAfter - mBefore;
        const monaDeltaNormalized = fieldInfo.base ? monaDeltaRaw / monaBaseStat : monaDeltaRaw * fieldInfo.sign;

        const expectedLeyline = eff.expectedLeyline ?? eff.amount;
        const expectedMonaRaw = eff.expectedMona != null
          ? (fieldInfo.base ? eff.expectedMona * monaBaseStat : eff.expectedMona)
          : (fieldInfo.base ? eff.amount * monaBaseStat : eff.amount * fieldInfo.sign);
        const tol = eff.tolerance ?? 1e-6;

        const leylineOk = close(leylineDelta, expectedLeyline, tol);
        const monaOk = close(monaDeltaRaw, expectedMonaRaw, Math.max(tol, Math.abs(expectedMonaRaw) * 1e-6));
        const isDifferent = eff.disposition === 'different';
        const status = (leylineOk && monaOk && (isDifferent || close(monaDeltaNormalized, leylineDelta, Math.max(tol, Math.abs(expectedLeyline) * 1e-6))))
          ? (isDifferent ? 'different' : 'matched')
          : 'open';

        const leylinePointer = eff.leylineField ?? `/effects/${spec.effectIndex ?? 1}/buffs/${eff.buffIndex ?? 0}/modifiers/${eff.modifierIndex ?? 0}`;
        const targetId = `set:${spec.entity}:modifier:${leylinePointer}`;
        const targetRow = leylineById.get(targetId);

        const row = {
          key: spec.key,
          entity: spec.entity,
          scenarioId,
          pieces: 4,
          leylineTarget: eff.leylineTarget,
          amount: expectedLeyline,
          monaDelta: monaDeltaRaw,
          monaDeltaNormalized,
          monaExpected: expectedMonaRaw,
          leylineBefore: r3.value,
          leylineAfter: r4.value,
          leylineDelta,
          targetId,
          status,
          evidence: [spec.specPath, `src/game-data/data/artifact-sets/${spec.entity}.json#${leylinePointer}`, ...(spec.evidence ?? [])],
        };
        rows.push(row);

        if ((status === 'matched' || status === 'different') && targetRow) {
          mappings.push({
            id: `spec-set4pc:${spec.key}:${scenarioId}:${eff.leylineTarget}`,
            disposition: status,
            coverage: 'scenario',
            mona: [`mona:set-threshold:${spec.key}:4`],
            leyline: [{ id: targetRow.id, revision: targetRow.revision }],
            explanation: eff.explanation ?? spec.explanation ?? `${spec.key} 4pc (${scenarioId}) bilateral scenario`,
            sources: row.evidence,
            comparisons: [
              { name: `Mona ${spec.key} 4pc ${fieldInfo.field} delta`, expected: expectedMonaRaw, actual: monaDeltaRaw, tolerance: Math.max(tol, Math.abs(expectedMonaRaw) * 1e-6) },
              { name: `LeyLine ${spec.entity} 4pc ${eff.leylineTarget} delta`, expected: expectedLeyline, actual: leylineDelta, tolerance: tol },
            ],
          });
        }
      }
    } catch (error) {
      rows.push({ key: spec.key, entity: spec.entity, scenarioId, status: 'error', error: String(error?.message ?? error) });
    }
  }

  return {
    rows,
    mappings,
    summary: {
      cases: rows.length,
      matched: rows.filter(r => r.status === 'matched').length,
      different: rows.filter(r => r.status === 'different').length,
      open: rows.filter(r => !['matched', 'different'].includes(r.status)).length,
    },
  };
}

export { MONA_BASELINE };
