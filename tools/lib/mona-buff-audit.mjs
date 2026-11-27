import { probeMonaSkills } from './mona-inventory-probes.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setGateFacts } from './roster-audit-settings.mjs';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// --- mona-buff-batch.mjs ---
/**
 * Enumerate every catalog buff and each declared effect without treating a buff key
 * or a matching attribute as proof that all of its effects are equivalent.
 * `candidates` is the Map returned by singleHitCandidates; it is optional.
 */
export function batchMonaBuffs(monaRows, leylineRows, candidates = new Map(), { resonanceAudit, characterAudit } = {}) {
  const buffs = monaRows.filter(row => row.kind === 'buff').slice().sort((a, b) => a.key.localeCompare(b.key, 'en'));
  const effects = monaRows.filter(row => row.kind === 'effect');
  const after = new Map(leylineRows.map(row => [row.id, row]));
  const byKey = new Map();
  for (const effect of effects) {
    const group = byKey.get(effect.key) ?? [];
    group.push(effect);
    byKey.set(effect.key, group);
  }
  const rows = [];
  for (const buff of buffs) {
    const declared = (byKey.get(buff.key) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
    for (const effect of declared) {
      const links = (candidates.get(effect.id) ?? []).map(candidate => {
        const target = after.get(candidate.id);
        if (!target || target.subject !== 'modifier') return null;
        return { id: target.id, revision: target.revision ?? null, source: target.source, reasons: candidate.reasons };
      }).filter(Boolean);
      rows.push({ id: effect.id, buffId: buff.id, key: buff.key, kind: 'declared-effect', effect: effect.effect,
        when: effect.when, variables: effect.variables, source: effect.source, catalogSource: buff.source,
        candidates: links, verifiedScenarios: effect.id === 'mona:effect:character:ShenheE:0' && after.has('character:shenhe:modifier:/talents/1/buffs/0/modifiers/0') ? [{
          recipient: 'kaeya', recipientHit: 'kaeya.skill.param1', source: 'shenhe',
          condition: 'shenhe.quillTap', scope: 'cryo skill hit at level one; source attack varied',
          target: 'character:shenhe:modifier:/talents/1/buffs/0/modifiers/0',
          evidence: 'tools/data/sources/mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/single-hit-pilot.json#/mappings/2',
        }] : [], disposition: 'open',
        unresolved: ['independent source and recipient binding', 'activation and effect conditions', 'value and scope equivalence'] });
    }
    // A declaration does not prove that adapters or legacy execution add no other effects.
    if (!declared.length || buff.adapter) rows.push({ id: `mona:buff-batch:opaque:${buff.key}`, buffId: buff.id,
      key: buff.key, kind: 'opaque', source: buff.source, adapter: buff.adapter, candidates: [], disposition: 'open',
      unresolved: ['effect extraction from adapter or legacy implementation', 'source, recipient, conditions and value'] });
  }
  for (const audit of characterAudit?.rows ?? []) {
    if (audit.status !== 'matched') continue;
    const row = rows.find(item => item.id === audit.effectId);
    const target = after.get(audit.targetId);
    const extraTargets = (audit.extraTargetIds ?? []).map(id => after.get(id));
    const element = audit.behaviorEvidence?.hitElement;
    const elements = target?.binding?.buff?.appliesTo?.elements;
    const elementalCritical = audit.stat === 'critDamage' && element && elements?.length === 1 && elements[0] === element
      ? 'CriticalDamage' + element[0].toUpperCase() + element.slice(1) : undefined;
    const expectedAttribute = elementalCritical ?? { attackPercent: 'ATKPercentage', defensePercent: 'DEFPercentage', critRate: 'CriticalBase', elementalMastery: 'ElementalMastery' }[audit.stat] ?? (/^(pyro|cryo|electro|hydro|geo|anemo|dendro)Bonus$/.test(audit.stat) ? 'Bonus' + audit.stat[0].toUpperCase() + audit.stat.slice(1, -5) : undefined);
    if (!row || !expectedAttribute || row.effect?.attribute !== expectedAttribute || JSON.stringify(row.effect?.value) !== JSON.stringify(audit.monaExpression ?? audit.amount)
      || target?.binding?.modifier?.target !== 'attribute.' + audit.stat || extraTargets.some(item => item?.binding?.modifier?.target !== 'attribute.' + audit.stat)) continue;
    row.verifiedScenarios.push({ ...audit, target: { id: target.id, revision: target.revision, source: target.source }, extraTargets: extraTargets.map(item => ({id:item.id,revision:item.revision,source:item.source})) });
  }
  // Runtime-reviewed components remain separate from the opaque catalog key: a
  // multi-effect key is never closed because one of its components matches.
  for (const audit of resonanceAudit?.rows ?? []) {
    if (audit.status !== 'matched') continue;
    const buff = buffs.find(item => item.key === audit.key);
    const target = after.get('public:resonances:modifier:' + audit.field);
    if (!buff || !target || target.binding?.modifier?.target !== 'attribute.' + audit.stat) continue;
    rows.push({ id: `mona:buff-component:${audit.key}:${audit.stat}`, buffId: buff.id, key: buff.key,
      kind: 'verified-component', disposition: 'matched-scenario', source: buff.source,
      target: { id: target.id, revision: target.revision ?? null, source: target.source },
      verifiedScenarios: [audit], scope: audit.scope });
  }
  const mappings = rows.filter(row => row.kind === 'declared-effect').flatMap(row =>
    row.verifiedScenarios.filter(scenario => scenario.status === 'matched' && scenario.target?.id).map(scenario => ({
      id: 'buff-scenario:' + scenario.effectId + ':' + scenario.target.id + (scenario.scenarioId && scenario.scenarioId !== 'default' ? ':' + scenario.scenarioId : ''),
      disposition: 'matched', coverage: 'scenario', mona: [scenario.effectId], leyline: [scenario.target, ...(scenario.extraTargets ?? [])].map(target => ({ id: target.id, revision: target.revision })),
      explanation: `${scenario.scope} Source ${scenario.source}; recipient ${scenario.recipient}; tested gate: ${JSON.stringify(scenario.gate)}. This mapping is limited to the tested scenario.`,
      sources: scenario.evidence,
      comparisons: [
        { name: 'Mona selected-buff delta', expected: scenario.monaExpected, actual: scenario.monaDelta, tolerance: 1e-7 },
        { name: 'LeyLine off/on modifier delta', expected: scenario.amount, actual: scenario.leylineDelta, tolerance: 1e-7 },
      ],
    })));
  return { rows, mappings, summary: { catalogBuffs: buffs.length, declaredEffects: rows.filter(row => row.kind === 'declared-effect').length,
    opaqueBuffs: rows.filter(row => row.kind === 'opaque').length, candidateEffects: rows.filter(row => row.candidates?.length).length,
    verifiedComponents: rows.filter(row => row.kind === 'verified-component').length, verifiedDeclaredEffects: rows.filter(row => row.kind === 'declared-effect' && row.verifiedScenarios.length).length, closedEffects: 0 }, limitations: [
      'Candidate links are leads only; owner and target similarity do not establish source, recipient, conditions, value or scope.',
      'Opaque adapters and legacy effects are represented once per key, not assumed to contain only one effect.',
      'A declared effect does not establish runtime execution or completeness of the upstream implementation.'
    ] };
}

// --- mona-character-buff-batch.mjs ---
// Each row independently identifies an original clause, one Mona effect and one
// LeyLine modifier. Gates deliberately describe one testable recipient scenario.
const fischlValue = (amount, rate) => ({
  op: 'mul', args: [amount, { op: 'coalesce', args: [{ ref: 'parameters.' + rate }, 0] },
    { op: 'add', args: [1, { op: 'coalesce', args: [{ ref: 'parameters.coordinated_attack_rate' }, 0] }] }],
});
const fischlScenarios = [
  { scenarioId: 'overload', attribute: 'ATKPercentage', stat: 'attackPercent', amount: .225,
    index: 0, rate: 'overload_rate', phrase: /Overloaded grants 22.5% attack/ },
  { scenarioId: 'electro-charged', attribute: 'ElementalMastery', stat: 'elementalMastery', amount: 90,
    index: 1, rate: 'electro_charged_rate', phrase: /Electro-Charged or Lunar-Charged grants 90 elemental mastery/ },
].flatMap(spec => [false, true].map(coordinated => ({
  key: 'FischlWitchEve', scenarioId: spec.scenarioId + (coordinated ? '-coordinated' : ''), owner: 'fischl',
  sourcePath: 'tools/data/sources/character-text/fischl-hexerei-nocturne.json', phrase: spec.phrase,
  group: 'passives', index: 3,
  gates: { 'fischl.hexereiSecretRite': true, 'fischl.hexereiOverloadActive': spec.index === 0,
    'fischl.hexereiElectroActive': spec.index === 1, 'fischl.hexereiCoordinationActive': coordinated },
  monaParams: { is_magical_secret_rite_active: true, overload_rate: spec.index === 0 ? 1 : 0,
    electro_charged_rate: spec.index === 1 ? 1 : 0, coordinated_attack_rate: coordinated ? 1 : 0 },
  monaValue: fischlValue(spec.amount, spec.rate),
  extraTargetPaths: coordinated ? [`/passives/3/buffs/${spec.index}/modifiers/3`] : [],
  effects: [[spec.attribute, spec.stat, spec.index, spec.amount * (coordinated ? 2 : 1), spec.index, 1]],
})));
const characterSpecs = [
  ...fischlScenarios,
  ...[
    ['burning', 'Dendro', 1, 7], ['overloaded', 'Electro', 2, 3], ['swirl', 'Anemo', 3, 5],
    ['crystallize', 'Geo', 4, 6], ['vaporize', 'Hydro', 5, 2], ['melt', 'Cryo', 6, 4],
  ].map(([reactionId, element, parameter, effect]) => ({
    key: 'DurinC2', scenarioId: reactionId, owner: 'durin', rank: 2, group: 'constellations', index: 1,
    phrase: /施放元素爆发后的20秒内.*火元素伤害与参与反应的对应元素伤害提升50%，持续6秒/,
    teamElements: [element.toLowerCase()], monaParams: { reaction_element: parameter, effect_active: true },
    gates: { 'durin.reactiveWindow-pyro': true, ['durin.reactiveWindow-' + element.toLowerCase()]: true },
    effects: [['BonusPyro', 'pyroBonus', 0, .5], ['Bonus' + element, element.toLowerCase() + 'Bonus', effect, .5, parameter]],
  })),
  { key:'MonaC2', scenarioId:'awakened-charged', owner:'mona', sourcePath:'tools/data/sources/character-text/mona-hexerei-constellations.json', phrase:/grants nearby party members 80 elemental mastery for 12 seconds/, group:'constellations', index:1, rank:2, gates:{'mona.hexereiAwakened':true,'mona.c1Prophecy':false}, event:{kind:'hit',skillId:'mona.normal',hitId:'mona.normal.param5',category:'charged',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,80]] },
  { key:'KleeC1', scenarioId:'awakened-spark', selfRecipient:true, owner:'klee', sourcePath:'tools/data/sources/character-text/klee-hexerei-constellations.json', phrase:/constellation 1 grants Klee 60% attack for 12 seconds/, group:'constellations', index:0, rank:1, fixedGates:{'klee.hexereiAwakened':true}, gates:{'klee.chainedSparkAttackActive':true}, monaParams:{hexerei_secret_rite:true,effect_active:true}, effects:[['ATKPercentage','attackPercent',0,.6,1]] },
  { key:'AratakiIttoC4', owner:'aratakiitto', group:'constellations', index:3, phrase:/防御力提升20%.*攻击力提升20%.*持续10秒/, rank:4, gates:{'aratakiitto.oniKingEnded':true}, effects:[['ATKPercentage','attackPercent',0,.2,0,1],['DEFPercentage','defensePercent',1,.2]] },
  { key:'AloyTalent1', owner:'aloy', group:'passives', index:0, phrase:/其他角色的攻击力提升8%.*持续10秒/, ascension:1, gates:{'aloy.coilAttackWindow':true}, effects:[['ATKPercentage','attackPercent',0,.08,1]] },
  { key:'HuTaoTalent1', owner:'hutao', group:'passives', index:0, phrase:/不包括胡桃自己.*暴击率提高12%.*持续8秒/, ascension:1, gates:{'hutao.butterflyRetirement':true}, effects:[['CriticalBase','critRate',0,.12]] },
  { key:'RaidenShogunC4', owner:'raidenshogun', group:'constellations', index:3, phrase:/不包括雷电将军自己.*攻击力提升30%.*持续10秒/, rank:4, gates:{'raidenshogun.musouEnded':true}, effects:[['ATKPercentage','attackPercent',0,.3]] },
  { key:'DionaC6G50', owner:'diona', group:'constellations', index:5, phrase:/生命值高于50%时，元素精通提升200/, rank:6, recipientGates:{'diona.signatureMixArea':true}, effects:[['ElementalMastery','elementalMastery',0,200,0,1]] },
  { key:'KaedeharaKazuhaC2', owner:'kaedeharakazuha', group:'constellations', index:1, phrase:/场上角色的元素精通提升200点/, rank:2, gates:{'kaedeharakazuha.autumnWhirlwind':true}, recipientGates:{'kaedeharakazuha.autumnWhirlwindArea':true}, effects:[['ElementalMastery','elementalMastery',0,200,0,1]] },
  { key:'BennettC6', owner:'bennett', group:'constellations', index:5, phrase:/单手剑、双手剑、长柄武器角色获得15%火元素伤害加成/, rank:6, recipientGates:{'bennett.inField':true}, event:{kind:'action',skillId:'bennett.burst',targetIds:[]}, effects:[['BonusPyro','pyroBonus',0,.15]] },
  { key:'GanyuTalent2', owner:'ganyu', group:'passives', index:1, phrase:/当前场上角色获得20%冰元素伤害加成/, ascension:4, recipientGates:{'ganyu.celestialShowerArea':true}, effects:[['BonusCryo','cryoBonus',0,.2]] },
  { key:'ShenheTalent1', scenarioId:'active-cryo-recipient-in-field', owner:'shenhe', recipient:'charlotte', group:'passives', index:0,
    phrase:/当前场上角色，冰元素伤害加成提高15%/, ascension:1, gates:{'shenhe.burstField':true},
    monaParams:{c2:false}, recipientParams:{talent2_non_fontaine_count:0,talent2_fontaine_count:0}, effects:[['BonusCryo','cryoBonus',0,.15]] },
  { key:'ShenheTalent1', scenarioId:'c2-cryo-critical-in-field', owner:'shenhe', recipient:'charlotte', group:'constellations', index:1,
    phrase:/当前场上角色，冰元素伤害的暴击伤害提高15%/, ascension:1, rank:2, gates:{'shenhe.burstField':true},
    monaParams:{c2:true}, recipientParams:{talent2_non_fontaine_count:0,talent2_fontaine_count:0},
    hitElement:'cryo', constellationParameter:'c2', effects:[['CriticalDamageCryo','critDamage',1,.15]] },
  { key:'KujouSaraEOrQ', scenarioId:'c6-electro-critical-on-recipient', owner:'kujousara', recipient:'lisa', group:'constellations', index:5,
    phrase:/处于天狗咒雷带来的攻击力提升效果状态下的角色，其雷元素伤害的暴击伤害提高60%/, rank:6,
    recipientGates:{'kujousara.tenguJuuraiRecipient':true}, monaParams:{base_atk:39.62836,skill2:4,c6:true},
    hitElement:'electro', constellationParameter:'c6', effects:[['CriticalDamageElectro','critDamage',1,.6]] },
  { key:'NingguangTalent2', owner:'ningguang', group:'passives', index:1, phrase:/获得12%岩元素伤害加成，持续10秒/, ascension:4, recipientGates:{'ningguang.jadeScreenCrossed':true}, effects:[['BonusGeo','geoBonus',0,.12]] },
  { key:'XianglingC6', owner:'xiangling', group:'constellations', index:5, phrase:/所有角色获得15%火元素伤害加成/, rank:6, gates:{'xiangling.pyronadoActive':true}, effects:[['BonusPyro','pyroBonus',0,.15]] },
  { key:'KleeC6', owner:'klee', group:'constellations', index:5, phrase:/所有角色获得10%火元素伤害加成/, rank:6, fixedGates:{'klee.hexereiAwakened':false,'klee.chainedSparkAttackActive':false}, event:{kind:'action',skillId:'klee.burst',targetIds:[]}, monaParams:{is_self:false}, monaValue:{op:'if',args:[{op:'eq',args:[{ref:'parameters.is_self'},true]},.5,.1]}, effects:[['BonusPyro','pyroBonus',0,.1]] },
  { key:'KleeC6', scenarioId:'self-off-field', selfRecipient:true, recipientOnField:false, owner:'klee', group:'constellations', index:5, phrase:/所有角色获得10%火元素伤害加成/, rank:6, event:{kind:'action',skillId:'klee.burst',targetIds:[]}, fixedGates:{'klee.hexereiAwakened':true,'klee.chainedSparkAttackActive':false}, extraEvidence:['tools/data/sources/character-text/klee-hexerei-constellations.json#/sources/1'], extraTargetPaths:['/constellations/5/buffs/2/modifiers/0'], monaParams:{is_self:true}, monaValue:{op:'if',args:[{op:'eq',args:[{ref:'parameters.is_self'},true]},.5,.1]}, effects:[['BonusPyro','pyroBonus',0,.5]] },
  ...[false, true].map(stellar => ({ key:'AetherCryoC2', scenarioId:stellar ? 'stellar-120' : 'ordinary-60', owner:'aether-cryo', sourceOwner:'travelercryo', group:'constellations', index:1, phrase:/当前场上角色的元素精通提升60点，持续5秒[\s\S]*提升120点元素精通/, rank:2, recipientGates:{'aether-cryo.frostMotesBuff':true,'aether-cryo.frostMotesStellar':stellar}, monaParams:{stellar_triggered:stellar}, monaValue:{op:'if',args:[{op:'coalesce',args:[{ref:'parameters.stellar_triggered'},true]},120,60]}, recipientBoundary:true, extraModifierIndices:stellar ? [1] : [], effects:[['ElementalMastery','elementalMastery',0,stellar ? 120 : 60]] })),
  { key:'YaeMikoC4', owner:'yaemiko', group:'constellations', index:3, phrase:/所有角色获得20%雷元素伤害加成/, rank:4, fixedGates:{'yaemiko.c1StellarConductWindow':false}, event:{kind:'hit',skillId:'yaemiko.skill',hitId:'yaemiko.skill.param1',category:'skill',targetIds:['enemy']}, effects:[['BonusElectro','electroBonus',0,.2]] },
  { key:'NilouTalent1', owner:'nilou', recipient:'barbara', group:'passives', index:0, phrase:/草元素攻击会使附近的所有角色元素精通提升100点，持续10秒/, ascension:1, gates:{'nilou.goldenChaliceDendroHit':true}, teamElements:['dendro','hydro'], effects:[['ElementalMastery','elementalMastery',0,100]] },
  { key:'SucroseTalent1', owner:'sucrose', group:'passives', index:0, phrase:/对应元素类型.*元素精通提升50，持续8秒/, ascension:1, event:{kind:'reaction',reactionId:'swirl',reactionElement:'cryo',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,50,2,0]] },
  { key:'AlbedoTalent2', owner:'albedo', group:'passives', index:1, phrase:/元素精通提高125点，持续10秒/, ascension:4, event:{kind:'action',skillId:'albedo.burst',targetIds:[]}, effects:[['ElementalMastery','elementalMastery',0,125]] },
  { key:'GorouTalent1', owner:'gorou', group:'passives', index:0, phrase:/防御力提升25%/, ascension:1, event:{kind:'action',skillId:'gorou.burst',targetIds:[]}, effects:[['DEFPercentage','defensePercent',0,.25]] },
  { key:'ShikanoinHeizouTalent2', owner:'shikanoinheizou', group:'passives', index:1, phrase:/元素精通提升80点，持续10秒/, ascension:4, event:{kind:'hit',skillId:'shikanoinheizou.skill',hitId:'shikanoinheizou.skill.param1',category:'skill',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,80]] },
];
const stats = { attackPercent:['atk','ATKPercentage'], defensePercent:['def','DEFPercentage'], critRate:['critical','CriticalBase'], critDamage:['critical_damage','CriticalDamageBase'], elementalMastery:['elemental_mastery','ElementalMastery'] };
const sum = value => Object.values(value ?? {}).reduce((a,b) => a+b,0);
const close = (a, b, tolerance = 1e-7) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < tolerance;
const textExcerptPath = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/text-excerpts.json';
const textExcerpts = readContentSource(new URL('../../' + textExcerptPath, import.meta.url));

export function buffScenarioCharacters(keys) {
  const ids = new Set();
  for (const spec of characterSpecs.filter(spec => keys.includes(spec.key))) {
    ids.add(spec.owner);
    if (!spec.selfRecipient) ids.add(spec.recipient ?? 'kaeya');
  }
  if (resonanceSpecs.some(spec => keys.includes(spec.key))) ids.add('kaeya');
  return [...ids];
}

/** Live off/on tests; a row certifies only its named source, recipient, stat and gate. */
async function auditCharacters({ characters, weapons, engine, api, rules, ruleSources, inputFor, keys }) {

  const rows=[];
  for (const spec of characterSpecs.filter(spec => !keys || keys.has(spec.key))) {
    const excerptBucket = spec.group === 'passives' ? 'talents' : 'constellations';
    const excerptId = spec.sourceOwner ?? spec.owner;
    const originalPath = spec.sourcePath ?? `${textExcerptPath}#/${excerptBucket}/${excerptId}`;
    const sourceKey = spec.group === 'passives' ? 'passive' + (spec.index+1) : 'c' + (spec.index+1);
    try {
      const original = spec.sourcePath
        ? readContentSource(new URL('../../'+spec.sourcePath,import.meta.url))
        : textExcerpts[excerptBucket][excerptId];
      const description = spec.sourcePath ? original.sources[0].description : original[sourceKey].description;
      if (!spec.phrase.test(description)) throw new Error('independent source phrase does not match');
      const owner = characters.get(spec.owner);
      const recipientId = spec.selfRecipient ? spec.owner : spec.recipient ?? 'kaeya';
      const kaeya = characters.get(recipientId);
      const recipientWeapon = weapons.get(novice[kaeya.identity.weaponType]);
      const input = await inputFor(recipientId);
      const weapon = weapons.get(novice[owner.identity.weaponType]);
      const build = {...auditBuild(owner,weapon), constellation:spec.rank ?? 0, ascension:spec.ascension ?? 0, level:spec.ascension === 4 ? 60 : spec.ascension ? 20 : 1};
      const recipientBuild = spec.selfRecipient ? build : auditBuild(kaeya,recipientWeapon);
      if (spec.recipientParams) Object.assign(input.character.params[input.character.name],spec.recipientParams);
      Object.assign(input.character,{level:recipientBuild.level, ascend:Boolean(recipientBuild.ascension), constellation:recipientBuild.constellation, skill1:0, skill2:0, skill3:0});
      Object.assign(input.weapon,{level:1,ascend:false,refine:1});
      input.artifacts = [];
      const team = [{id:'actor',build},...(!spec.selfRecipient ? [{id:'peer',build:recipientBuild}] : []),...(spec.teamElements ?? []).map((element,index)=>({id:'extra'+index,element}))];
      const prepared = engine.prepareStructuredBuilds(team);
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
      const belowRank = spec.constellationParameter && engine.prepareStructuredBuilds([{id:'actor',build:{...build,constellation:spec.rank-1}},...team.slice(1)]);
      if (belowRank && !belowRank.ok) throw new Error(JSON.stringify(belowRank.diagnostics));
      const { before, after, disabled } = samplePanels(api, input, { name: spec.key, config: spec.monaParams ? { [spec.key]: spec.monaParams } : 'NoConfig' },spec.hitElement,spec.constellationParameter);
      for (const [attribute,stat,position,amount,buffIndex=0,modifierIndex=0] of spec.effects) {
        const effect = rules[spec.key]?.effects?.[position];
        if (effect?.attribute !== attribute || JSON.stringify(effect.value) !== JSON.stringify(spec.monaValue ?? amount)) throw new Error('upstream effect changed: '+spec.key);
        const recipientActor = spec.selfRecipient ? 'actor' : 'peer';
        const {setup,request}=recipientHit(kaeya, recipientActor);
        if (spec.hitElement && request.frame.hit.element !== spec.hitElement) throw new Error('LeyLine recipient hit has the wrong element');
        const values=[];
        for(const phase of ['before','enabled','disabled']) {
          const below = phase === 'disabled' && belowRank;
          const active = phase === 'enabled' || Boolean(below);
          request.frame.factOverrides = request.frame.factOverrides.filter(entry=>entry.subject.id!==recipientActor);
          request.frame.factOverrides.push({subject:{kind:'actor',id:recipientActor},facts:{onField:bool(spec.recipientOnField ?? true),hpRatio:number('scalar',1),...Object.fromEntries(Object.entries(spec.recipientGates??{}).map(([k,v])=>[k,bool(active && v)]))}});
          setGateFacts(owner, request.frame, { ...spec.fixedGates,
            ...Object.fromEntries(Object.entries(spec.gates ?? {}).map(([key, value]) => [key, active && value])) });
          setup.events=setup.events.filter(event=>event.id!=='trigger' && event.id!=='prerequisite');
          if(active && spec.prerequisite) setup.events.unshift({ id:'prerequisite',actorId:'actor',timeMs:0,order:0,sourceEventIds:[],facts:{},...spec.prerequisite });
          if((active || spec.prerequisite && phase==='disabled') && spec.event) setup.events.push({id:'trigger',actorId:'actor',timeMs:0,order:1,sourceEventIds:[],facts:{},...spec.event});
          values.push(readAttribute(engine, below ? below.team : prepared.team, setup, request.frame, stat));
        }
        let boundary = null;
        if (spec.recipientBoundary) {
          const offPanels = samplePanels(api, input, { name: spec.key, config: { [spec.key]: { ...spec.monaParams, recipient_on_field:false } } },spec.hitElement);
          request.frame.factOverrides = request.frame.factOverrides.filter(entry=>entry.subject.id!=='peer');
          request.frame.factOverrides.push({subject:{kind:'actor',id:'peer'},facts:{onField:bool(false),hpRatio:number('scalar',1),...Object.fromEntries(Object.entries(spec.recipientGates ?? {}).map(([k,v])=>[k,bool(v)]))}});
          const offValue = readAttribute(engine, prepared.team, setup, request.frame, stat);
          const monaStat=stats[stat]?.[0] ?? (stat.endsWith('Bonus') ? 'bonus_' + stat.slice(0, -5) : undefined);
          boundary={recipient:'off-field',monaBefore:sum(offPanels.before[monaStat]),monaEnabled:sum(offPanels.after[monaStat]),leyline:offValue};
        }
        const monaStat=stats[stat]?.[0] ?? (stat.endsWith('Bonus') ? 'bonus_' + stat.slice(0, -5) : undefined), delta=sum(after[monaStat])-sum(before[monaStat]);
        const base=stat==='attackPercent'?before.atk['角色基础攻击']+before.atk['武器基础攻击']:stat==='defensePercent'?before.def['角色基础防御']:1;
        const expected=amount*base, targetId=`character:${spec.owner}:modifier:/${spec.group}/${spec.index}/buffs/${buffIndex}/modifiers/${modifierIndex}`;
        rows.push({key:spec.key,scenarioId:spec.scenarioId ?? 'default',effectId:`mona:effect:character:${spec.key}:${position}`,stat,amount,source:spec.owner,recipient:recipientId,targetId, extraTargetIds:[...(spec.extraModifierIndices ?? []).map(index=>`character:${spec.owner}:modifier:/${spec.group}/${spec.index}/buffs/${buffIndex}/modifiers/${index}`), ...(spec.extraTargetPaths ?? []).map(path=>`character:${spec.owner}:modifier:${path}`)], monaExpression:spec.monaValue ?? amount, monaParams:spec.monaParams ?? {},
          gate:{owner:{...spec.fixedGates,...spec.gates},recipient:{onField:spec.recipientOnField ?? true,hpRatio:1,...spec.recipientGates??{}},event:spec.event??null,...(spec.prerequisite && {prerequisite:spec.prerequisite}),teamElements:spec.selfRecipient ? [owner.identity.element] : [owner.identity.element,kaeya.identity.element,...spec.teamElements??[]]},monaDelta:delta,monaExpected:expected,leylineBefore:values[0],leylineAfter:values[1],leylineDelta:values[1]-values[0],
          behaviorEvidence: {
            source:spec.owner, recipient:recipientId, attribute:stat, targetId,
            ...(spec.hitElement && {hitElement:spec.hitElement,hitId:request.frame.hit.hitId,monaSkillIndex:input.skill.index}),
            ...(stat === 'attackPercent' || stat === 'defensePercent' ? {monaBaseStat:base} : {}),
            recipientBuild:{level:recipientBuild.level, ascension:recipientBuild.ascension, constellation:recipientBuild.constellation, weapon:recipientWeapon.id, weaponLevel:1, artifacts:[],
              monaCharacter:input.character.name, monaWeapon:input.weapon.name, ...(spec.recipientParams && {monaParams:input.character.params})},
            mona:{before:sum(before[monaStat]),enabled:sum(after[monaStat]),disabled:sum(disabled[monaStat]),disabledCondition:spec.constellationParameter ? 'buff selected; '+spec.constellationParameter+' = false' : 'selected buff locked'},
            leyline:{before:values[0],enabled:values[1],disabled:values[2],disabledCondition:belowRank ? 'source at C'+(spec.rank-1)+'; same receiver conditions' : spec.prerequisite ? 'reaction recorded without the prerequisite burst' : spec.event ? 'trigger event absent; declared gates false' : 'declared gates false'},
            boundary, scope:'Explicit source, recipient, listed gates and stat only; no duration inferred.',
          },
          status:values.every(Number.isFinite)&&close(delta,expected)&&close(values[1]-values[0],amount)&&close(values[2],values[0])&&close(sum(disabled[monaStat]),sum(before[monaStat]))&&(!boundary || close(boundary.monaEnabled,boundary.monaBefore)&&close(boundary.leyline,values[0]))?'matched':'open',
          evidence:[originalPath+(spec.sourcePath ? '#/sources/0' : '#/'+sourceKey),ruleSources[spec.key],`src/game-data/data/characters/${spec.owner}.json#/${spec.group}/${spec.index}/buffs/${buffIndex}`,...spec.extraEvidence ?? []],
          scope:recipientId + ' recipient and the listed explicit facts or event; Mona uses a manually selected buff with parameters ' + JSON.stringify(spec.monaParams ?? {}) + '. Other recipients and duration boundaries are not verified.'});
      }
    } catch(error) { rows.push({key:spec.key,status:'error',error:String(error?.message??error)}); }
  }
  return {rows,summary:{cases:rows.length,matched:rows.filter(row=>row.status==='matched').length,open:rows.filter(row=>row.status!=='matched').length}};
}

const resonanceSpecs = [
  { key: 'ResonancePyro2', element: 'pyro', stat: 'attackPercent', monaStat: 'atk', base: 'attack', amount: .25, field: '/resonances/0/buffs/0/modifiers/0' },
  { key: 'ResonanceHydro2', element: 'hydro', stat: 'hpPercent', monaStat: 'hp', base: 'hp', amount: .25, field: '/resonances/1/buffs/0/modifiers/0' },
  { key: 'ResonanceGeo2', element: 'geo', stat: 'shieldStrength', monaStat: 'shield_strength', amount: .15, field: '/resonances/4/buffs/0/modifiers/0' },
];

/** Tests one actual Kaeya recipient, with and without the two-element team grant. */
async function auditResonances({ characters, weapons, engine, api, inputFor, keys }) {
  const selected = resonanceSpecs.filter(spec => !keys || keys.has(spec.key));
  if (!selected.length) return { rows: [], summary: { cases: 0, matched: 0 } };
  const character = characters.get('kaeya');
  const weapon = weapons.get('dullblade');
  const input = await inputFor('kaeya');
  const rows = [];
  for (const spec of selected) {
    const config = spec.key === 'ResonanceGeo2' ? { [spec.key]: { rate1: 0, rate2: 0 } } : 'NoConfig';
    const { before, after } = samplePanels(api, input, { name: spec.key, config });
    const monaDelta = sum(after[spec.monaStat]) - sum(before[spec.monaStat]);
    const monaExpected = spec.base === 'attack' ? .25 * (before.atk['角色基础攻击'] + before.atk['武器基础攻击'])
      : spec.base === 'hp' ? .25 * before.hp['角色基础生命'] : spec.amount;
    const values = [];
    for (const active of [false, true]) {
      const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build: auditBuild(character, weapon) },
        { id: 'p1', element: spec.element }, { id: 'p2', element: active ? spec.element : 'anemo' }, { id: 'p3', element: 'electro' }]);
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
      const { setup, request } = recipientHit(character, 'actor');
      values.push(readAttribute(engine, prepared.team, setup, request.frame, spec.stat));
    }
    const leylineDelta = values[1] - values[0];
    rows.push({ ...spec, monaDelta, monaExpected, leylineBefore: values[0], leylineAfter: values[1], leylineDelta,
      status: values.every(Number.isFinite) && close(monaDelta, monaExpected, 1e-8) && close(leylineDelta, spec.amount, 1e-8) ? 'matched' : 'open',
      recipient: 'kaeya', activation: 'four-member team with at least two matching elements',
      evidence: ['.references/mona-community/mona_core/src/buffs/buffs/resonance/mod.rs', 'src/game-data/data/calculation/resonances.json#' + spec.field],
      scope: 'One isolated stat on Kaeya; other effects and aura duration are not compared.' });
  }
  return { rows, summary: { cases: rows.length, matched: rows.filter(row => row.status === 'matched').length } };
}

function samplePanels(api, input, buff, hitElement, constellationParameter) {
  const read = buffs => {
    const sample = {...input,buffs};
    if (!hitElement) return api.CommonInterface.get_attribute(sample);
    const analysis = api.CalculatorInterface.get_damage_analysis(sample,null);
    if (analysis.element?.toLowerCase() !== hitElement) throw new Error('Mona recipient hit has the wrong element');
    return analysis;
  };
  const disabled = constellationParameter
    ? {...buff,config:{[buff.name]:{...buff.config[buff.name],[constellationParameter]:false}}}
    : {...buff,lock:true};
  return {before:read([]),after:read([buff]),disabled:read([disabled])};
}

function recipientHit(character, actorId) {
  const talent = character.talents[0], hit = talent.hits[0];
  const { setup, request } = auditHit(character, talent, hit);
  setup.events.find(event => event.id === 'hit').actorId = actorId;
  Object.assign(request.frame, { ownerId: actorId, recipientId: actorId, contributorId: null, hit: {
    skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, origin: hit.origin, family: 'ordinary', reactionId: null,
  } });
  return { setup, request };
}

function readAttribute(engine, team, setup, frame, stat) {
  const context = engine.createStructuredCombatContext(team, setup);
  const binding = { kind: 'attribute', actor: { role: 'owner' }, key: { namespace: 'builtin', id: 'attribute.' + stat, revision: '1' }, at: { kind: 'current', phase: 'same' } };
  const result = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame).outputs.value;
  return result?.state === 'known' ? result.value.value : null;
}

export async function auditMonaBuffScenarios(entities, engine, keys) {
  const { api, read } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const { CHARACTER_EFFECT_RULES } = await import('../../.references/mona-community/beta-data/character-effect-rules.mjs');
  const [classic, classicBook, characterBook, lunarBook] = await Promise.all([
    import('../../.references/mona-community/beta-data/classic-static-effect-rules.mjs'),
    import('../../.references/mona-community/beta-data/classic-effect-rule-book.mjs'),
    import('../../.references/mona-community/beta-data/character-rule-book.mjs'),
    import('../../.references/mona-community/beta-data/lunar-effect-rule-book.mjs'),
  ]);
  const libraries = [['classic-static-effect-rules.mjs', classic.CLASSIC_STATIC_RULES], ['classic-effect-rule-book.mjs', classicBook.CLASSIC_EFFECT_RULE_BOOK],
    ['character-rule-book.mjs', characterBook.CHARACTER_RULE_BOOK], ['lunar-effect-rule-book.mjs', lunarBook.LUNAR_EFFECT_RULE_BOOK]];
  const ruleSources = Object.fromEntries(libraries.flatMap(([file, rules]) => Object.keys(rules).map(key => [key, '.references/mona-community/beta-data/' + file])));
  const inputs = new Map();
  const recipientNames = new Map(Object.keys(read('src/assets/_gen_character.js')).map(name => [name.toLowerCase(),name]));
  const inputFor = async id => {
    const name = recipientNames.get(id);
    if (!name) throw new Error('Missing Mona recipient for ' + id);
    if (!inputs.has(id)) inputs.set(id, (await probeMonaSkills({ characters: [name], indices: [0], constellations: [0] })).rows[0].input);
    return structuredClone(inputs.get(id));
  };
  const shared = { characters: new Map(entities.characters.map(item => [item.id, item])),
    weapons: new Map(entities.weapons.map(item => [item.id, item])), engine, api, rules: CHARACTER_EFFECT_RULES, ruleSources, inputFor, keys: keys == null ? null : new Set(keys) };
  const characters = await auditCharacters(shared);
  return { resonance: await auditResonances(shared), characters };
}

// --- mona-aino-audit.mjs ---
const officialRoot = textExcerptPath;
const assertAinoClose = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);


/** Compare Aino's source descriptions and declared bindings with actual Mona release results. */
export async function auditMonaAino() {
  const aino = readContentSource('src/game-data/data/characters/aino.json');
  const original = textExcerpts.constellations.aino;
  assert.match(original.c1.description, /自身的元素精通提升80点.*当前场上其他角色的元素精通提升80点/s);
  assert.match(original.c1.description, /无法叠加/);
  assert.match(original.c2.description, /后台.*当前场上角色的攻击命中附近的敌人/s);
  assert.match(original.c2.description, /攻击力的25%与元素精通的100%/);
  assert.match(original.c2.description, /每5秒至多触发一次.*视为元素爆发伤害/);
  assert.match(original.c6.description, /后的15秒内.*当前场上角色触发的感电、绽放、月感电、月绽放、月结晶/s);
  assert.match(original.c6.description, /提升15%.*额外提升20%/s);
  const hit = aino.constellations[1].hits[0], c1 = aino.constellations[0].buffs[0], c6 = aino.constellations[5].buffs[0];
  assert.deepEqual(hit.base.map(({ stat, ratio }) => [stat, ratio]), [['attack', .25], ['elementalMastery', 1]]);
  assert.equal(hit.category, 'burst'); assert.equal(hit.element, 'hydro');
  assert.deepEqual(hit.when, ['aino.coolingFieldAllyHit']);
  assert.equal(c1.stacking.policy, 'replace'); assert.equal(c1.lifetime.durationMs, 15000);
  assert.equal(c6.lifetime.durationMs, 15000); assert.equal(c6.condition.fact, 'onField');
  assert.deepEqual(c6.modifiers.map(m => m.value.amount), [.15, .15, .2, .2]);
  assert.deepEqual(c6.modifiers[0].appliesTo.reactionIds, ['electro-charged', 'bloom']);
  assert.deepEqual(c6.modifiers[1].appliesTo.families, ['lunar-charged', 'lunar-bloom', 'lunar-crystallize']);
  if (!existsSync(resolve('.references/mona-community/beta-tools/runtime-7106.mjs'))) return {
    status: 'unavailable', revision: aino.revision, reason: 'Optional Mona release checkout is missing.', ratios: [], buffCases: [],
  };
  const cases = [];
  const mapping = [[0,0,'param1',1],[1,0,'param2',1],[2,0,'param3',2],[3,0,'param4',1],[4,0,'param5',1],[5,0,'param8',1],[6,0,'param9',1],[7,0,'param10',1],[8,1,'param1',1],[9,1,'param2',1],[10,2,'param1',1]];
  for (let level = 1; level <= 15; level++) {
    const probe = await probeMonaSkills({ characters: ['Aino'], constellations: [0], configure(input) { input.character.skill1 = level - 1; input.character.skill2 = level - 1; input.character.skill3 = level - 1; } });
    for (const [index, talent, parameter, repetitions] of mapping) {
      const row = probe.rows.find(item => item.index === index); assert.equal(row?.status, 'ok');
      const expected = aino.talents[talent].parameters.find(item => item.id === parameter).values[level - 1] * repetitions;
      const actual = sum(row.analysis.atk_ratio);
      assertAinoClose(actual, expected, .00011);
      cases.push({ index, talent: aino.talents[talent].id, parameter, repetitions, level, expected, actual });
    }
  }
  const [{ api }, { EXTENSION_BUFF_REGISTRY }] = await Promise.all([
    import('../../.references/mona-community/beta-tools/runtime-7106.mjs'),
    import('../../.references/mona-community/beta-data/extension-buffs.mjs'),
  ]);
  const fixture = (await probeMonaSkills({ characters: ['Lisa'], indices: [0], constellations: [0] })).rows[0].input;
  const buffCases = [];
  for (const full of [false, true]) for (const onField of [false, true]) {
    const buff = { name: 'AinoC6', config: { AinoC6: { full_moon: full } } };
    const input = { ...fixture, team_effects: { recipient_on_field: onField }, buffs: [buff] };
    const compiled = EXTENSION_BUFF_REGISTRY.compile(buff, input);
    const values = compiled[0]?.config.ExtensionEffect.values ?? {};
    const expected = onField ? (full ? .35 : .15) : 0;
    for (const key of ['EnhanceElectroCharged', 'EnhanceBloom', 'EnhanceMoonelectro', 'EnhanceMoonbloom', 'EnhanceMoonCrystallize']) assertAinoClose(values[key] ?? 0, expected);
    assert.equal(values.EnhanceHyperbloom, undefined);
    const baseline = api.CalculatorInterface.get_transformative_damage({ ...input, buffs: [] });
    const actual = api.CalculatorInterface.get_transformative_damage(input);
    for (const key of ['hyperbloom', 'burgeon', 'overload']) assertAinoClose(actual[key], baseline[key], 1e-7);
    if (onField) for (const key of ['electro_charged', 'bloom']) assert.ok(actual[key] > baseline[key]);
    else for (const key of ['electro_charged', 'bloom']) assertAinoClose(actual[key], baseline[key], 1e-7);
    buffCases.push({ full, onField, values, baseline, actual });
  }
  return { status: 'available', revision: aino.revision, ratios: cases, buffCases, limitations: [
    'Mona observed normal ratio 0..10 only; its menu does not expose Aino C2 water shot.',
    'C2 is declared as one caller-supplied aggregate fact: the observed single-hit binding does not independently schedule the five-second cooldown or validate all trigger conditions.',
    'C6 runtime tests use explicit buff input and an on-field recipient, not cast history; trigger and duration require the LeyLine event replay evidence.',
    'Damage bonus rates are compared as native parameters, not as ratios of final transformative damage.',
  ] };
}
