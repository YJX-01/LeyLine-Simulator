import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setGateFacts } from './roster-audit-settings.mjs';

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
    prerequisite: { kind: 'action', skillId: 'durin.burst', targetIds: [] },
    event: { kind: 'reaction', actorId: 'extra0', reactionId, targetIds: ['enemy'],
      ...(['swirl', 'crystallize'].includes(reactionId) ? { reactionElement: 'pyro' } : {}) },
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
  { key:'YaeMikoC4', owner:'yaemiko', group:'constellations', index:3, phrase:/所有角色获得20%雷元素伤害加成/, rank:4, event:{kind:'hit',skillId:'yaemiko.skill',hitId:'yaemiko.skill.param1',category:'skill',targetIds:['enemy']}, effects:[['BonusElectro','electroBonus',0,.2]] },
  { key:'NilouTalent1', owner:'nilou', recipient:'barbara', group:'passives', index:0, phrase:/草元素攻击会使附近的所有角色元素精通提升100点，持续10秒/, ascension:1, gates:{'nilou.goldenChaliceDendroHit':true}, teamElements:['dendro','hydro'], effects:[['ElementalMastery','elementalMastery',0,100]] },
  { key:'SucroseTalent1', owner:'sucrose', group:'passives', index:0, phrase:/对应元素类型.*元素精通提升50，持续8秒/, ascension:1, event:{kind:'reaction',reactionId:'swirl',reactionElement:'cryo',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,50,2,0]] },
  { key:'AlbedoTalent2', owner:'albedo', group:'passives', index:1, phrase:/元素精通提高125点，持续10秒/, ascension:4, event:{kind:'action',skillId:'albedo.burst',targetIds:[]}, effects:[['ElementalMastery','elementalMastery',0,125]] },
  { key:'GorouTalent1', owner:'gorou', group:'passives', index:0, phrase:/防御力提升25%/, ascension:1, event:{kind:'action',skillId:'gorou.burst',targetIds:[]}, effects:[['DEFPercentage','defensePercent',0,.25]] },
  { key:'ShikanoinHeizouTalent2', owner:'shikanoinheizou', group:'passives', index:1, phrase:/元素精通提升80点，持续10秒/, ascension:4, event:{kind:'hit',skillId:'shikanoinheizou.skill',hitId:'shikanoinheizou.skill.param1',category:'skill',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,80]] },
];
const stats = { attackPercent:['atk','ATKPercentage'], defensePercent:['def','DEFPercentage'], critRate:['critical','CriticalBase'], critDamage:['critical_damage','CriticalDamageBase'], elementalMastery:['elemental_mastery','ElementalMastery'] };
const sum = value => Object.values(value ?? {}).reduce((a,b) => a+b,0);
const close = (a, b, tolerance = 1e-7) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < tolerance;
const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';

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
    const originalPath = spec.sourcePath ?? sourceRoot + (spec.group === 'passives' ? 'talents/' : 'constellations/') + (spec.sourceOwner ?? spec.owner) + '.json';
    const sourceKey = spec.group === 'passives' ? 'passive' + (spec.index+1) : 'c' + (spec.index+1);
    try {
      const original = readContentSource(new URL('../../'+originalPath,import.meta.url));
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
