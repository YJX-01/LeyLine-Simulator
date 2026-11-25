import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setGateFacts } from './roster-audit-settings.mjs';

// Each row independently identifies an original clause, one Mona effect and one
// LeyLine modifier. Gates deliberately describe one testable recipient scenario.
const characterSpecs = [
  { key:'AratakiIttoC4', owner:'aratakiitto', group:'constellations', index:3, phrase:/防御力提升20%.*攻击力提升20%.*持续10秒/, rank:4, gates:{'aratakiitto.oniKingEnded':true}, effects:[['ATKPercentage','attackPercent',0,.2,0,1],['DEFPercentage','defensePercent',1,.2]] },
  { key:'AloyTalent1', owner:'aloy', group:'passives', index:0, phrase:/其他角色的攻击力提升8%.*持续10秒/, ascension:1, gates:{'aloy.coilAttackWindow':true}, effects:[['ATKPercentage','attackPercent',0,.08,1]] },
  { key:'HuTaoTalent1', owner:'hutao', group:'passives', index:0, phrase:/不包括胡桃自己.*暴击率提高12%.*持续8秒/, ascension:1, gates:{'hutao.butterflyRetirement':true}, effects:[['CriticalBase','critRate',0,.12]] },
  { key:'RaidenShogunC4', owner:'raidenshogun', group:'constellations', index:3, phrase:/不包括雷电将军自己.*攻击力提升30%.*持续10秒/, rank:4, gates:{'raidenshogun.musouEnded':true}, effects:[['ATKPercentage','attackPercent',0,.3]] },
  { key:'DionaC6G50', owner:'diona', group:'constellations', index:5, phrase:/生命值高于50%时，元素精通提升200/, rank:6, recipientGates:{'diona.signatureMixArea':true}, effects:[['ElementalMastery','elementalMastery',0,200,0,1]] },
  { key:'KaedeharaKazuhaC2', owner:'kaedeharakazuha', group:'constellations', index:1, phrase:/场上角色的元素精通提升200点/, rank:2, gates:{'kaedeharakazuha.autumnWhirlwind':true}, recipientGates:{'kaedeharakazuha.autumnWhirlwindArea':true}, effects:[['ElementalMastery','elementalMastery',0,200,0,1]] },
  { key:'BennettC6', owner:'bennett', group:'constellations', index:5, phrase:/单手剑、双手剑、长柄武器角色获得15%火元素伤害加成/, rank:6, recipientGates:{'bennett.inField':true}, event:{kind:'action',skillId:'bennett.burst',targetIds:[]}, effects:[['BonusPyro','pyroBonus',0,.15]] },
  { key:'GanyuTalent2', owner:'ganyu', group:'passives', index:1, phrase:/当前场上角色获得20%冰元素伤害加成/, ascension:4, recipientGates:{'ganyu.celestialShowerArea':true}, effects:[['BonusCryo','cryoBonus',0,.2]] },
  { key:'NingguangTalent2', owner:'ningguang', group:'passives', index:1, phrase:/获得12%岩元素伤害加成，持续10秒/, ascension:4, recipientGates:{'ningguang.jadeScreenCrossed':true}, effects:[['BonusGeo','geoBonus',0,.12]] },
  { key:'XianglingC6', owner:'xiangling', group:'constellations', index:5, phrase:/所有角色获得15%火元素伤害加成/, rank:6, gates:{'xiangling.pyronadoActive':true}, effects:[['BonusPyro','pyroBonus',0,.15]] },
  { key:'KleeC6', owner:'klee', group:'constellations', index:5, phrase:/所有角色获得10%火元素伤害加成/, rank:6, event:{kind:'action',skillId:'klee.burst',targetIds:[]}, effects:[['BonusPyro','pyroBonus',0,.1]] },
  { key:'YaeMikoC4', owner:'yaemiko', group:'constellations', index:3, phrase:/所有角色获得20%雷元素伤害加成/, rank:4, event:{kind:'hit',skillId:'yaemiko.skill',hitId:'yaemiko.skill.param1',category:'skill',targetIds:['enemy']}, effects:[['BonusElectro','electroBonus',0,.2]] },
  { key:'NilouTalent1', owner:'nilou', recipient:'barbara', group:'passives', index:0, phrase:/草元素攻击会使附近的所有角色元素精通提升100点，持续10秒/, ascension:1, gates:{'nilou.goldenChaliceDendroHit':true}, teamElements:['dendro','hydro'], effects:[['ElementalMastery','elementalMastery',0,100]] },
  { key:'SucroseTalent1', owner:'sucrose', group:'passives', index:0, phrase:/对应元素类型.*元素精通提升50，持续8秒/, ascension:1, event:{kind:'reaction',reactionId:'swirl',reactionElement:'cryo',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,50,2,0]] },
  { key:'AlbedoTalent2', owner:'albedo', group:'passives', index:1, phrase:/元素精通提高125点，持续10秒/, ascension:4, event:{kind:'action',skillId:'albedo.burst',targetIds:[]}, effects:[['ElementalMastery','elementalMastery',0,125]] },
  { key:'GorouTalent1', owner:'gorou', group:'passives', index:0, phrase:/防御力提升25%/, ascension:1, event:{kind:'action',skillId:'gorou.burst',targetIds:[]}, effects:[['DEFPercentage','defensePercent',0,.25]] },
  { key:'ShikanoinHeizouTalent2', owner:'shikanoinheizou', group:'passives', index:1, phrase:/元素精通提升80点，持续10秒/, ascension:4, event:{kind:'hit',skillId:'shikanoinheizou.skill',hitId:'shikanoinheizou.skill.param1',category:'skill',targetIds:['enemy']}, effects:[['ElementalMastery','elementalMastery',0,80]] },
];
const stats = { attackPercent:['atk','ATKPercentage'], defensePercent:['def','DEFPercentage'], critRate:['critical','CriticalBase'], elementalMastery:['elemental_mastery','ElementalMastery'] };
const sum = value => Object.values(value ?? {}).reduce((a,b) => a+b,0);
const close = (a, b, tolerance = 1e-7) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < tolerance;
const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';

/** Live off/on tests; a row certifies only its named source, recipient, stat and gate. */
async function auditCharacters({ characters, weapons, engine, api, rules, inputFor }) {

  const rows=[];
  for (const spec of characterSpecs) {
    const originalPath = sourceRoot + (spec.group === 'passives' ? 'talents/' : 'constellations/') + spec.owner + '.json';
    const sourceKey = spec.group === 'passives' ? 'passive' + (spec.index+1) : 'c' + (spec.index+1);
    try {
      const description = readContentSource(new URL('../../'+originalPath,import.meta.url))[sourceKey].description;
      if (!spec.phrase.test(description)) throw new Error('independent source phrase does not match');
      const owner = characters.get(spec.owner);
      const recipientId = spec.recipient ?? 'kaeya';
      const kaeya = characters.get(recipientId);
      const recipientWeapon = weapons.get(recipientId === 'barbara' ? 'apprenticesnotes' : 'dullblade');
      const input = await inputFor(recipientId);
      const weapon = weapons.get(novice[owner.identity.weaponType]);
      const build = {...auditBuild(owner,weapon), constellation:spec.rank ?? 0, ascension:spec.ascension ?? 0, level:spec.ascension === 4 ? 60 : spec.ascension ? 20 : 1};
      const prepared = engine.prepareStructuredBuilds([{id:'actor',build},{id:'peer',build:auditBuild(kaeya,recipientWeapon)},...(spec.teamElements ?? []).map((element,index)=>({id:'extra'+index,element}))]);
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
      const { before, after } = samplePanels(api, input, { name: spec.key, config: 'NoConfig' });
      for (const [attribute,stat,position,amount,buffIndex=0,modifierIndex=0] of spec.effects) {
        const effect = rules[spec.key]?.effects?.[position];
        if (effect?.attribute !== attribute || effect.value !== amount) throw new Error('upstream effect changed: '+spec.key);
        const {setup,request}=recipientHit(kaeya, 'peer');
        const values=[];
        for(const active of [false,true]) {
          if (spec.gates) setGateFacts(owner,request.frame,Object.fromEntries(Object.keys(spec.gates).map(k=>[k,active])));
          request.frame.factOverrides = request.frame.factOverrides.filter(entry=>entry.subject.id!=='peer');
          request.frame.factOverrides.push({subject:{kind:'actor',id:'peer'},facts:{onField:bool(true),hpRatio:number('scalar',1),...Object.fromEntries(Object.keys(spec.recipientGates??{}).map(k=>[k,bool(active)]))}});
          setup.events=setup.events.filter(event=>event.id!=='trigger');
          if(active && spec.event) setup.events.unshift({id:'trigger',actorId:'actor',timeMs:0,order:0,sourceEventIds:[],facts:{},...spec.event});
          values.push(readAttribute(engine, prepared.team, setup, request.frame, stat));
        }
        const monaStat=stats[stat]?.[0] ?? (stat.endsWith('Bonus') ? 'bonus_' + stat.slice(0, -5) : undefined), delta=sum(after[monaStat])-sum(before[monaStat]);
        const base=stat==='attackPercent'?before.atk['角色基础攻击']+before.atk['武器基础攻击']:stat==='defensePercent'?before.def['角色基础防御']:1;
        const expected=amount*base, targetId=`character:${spec.owner}:modifier:/${spec.group}/${spec.index}/buffs/${buffIndex}/modifiers/${modifierIndex}`;
        rows.push({key:spec.key,effectId:`mona:effect:character:${spec.key}:${position}`,stat,amount,source:spec.owner,recipient:recipientId,targetId,
          gate:{owner:spec.gates??{},recipient:{onField:true,hpRatio:1,...spec.recipientGates??{}},event:spec.event??null,teamElements:[owner.identity.element,kaeya.identity.element,...spec.teamElements??[]]},monaDelta:delta,monaExpected:expected,leylineBefore:values[0],leylineAfter:values[1],leylineDelta:values[1]-values[0],
          status:values.every(Number.isFinite)&&close(delta,expected)&&close(values[1]-values[0],amount)?'matched':'open',
          evidence:[originalPath+'#/'+sourceKey,'.references/mona-community/beta-data/classic-static-effect-rules.mjs',`src/game-data/data/characters/${spec.owner}.json#/${spec.group}/${spec.index}/buffs/${buffIndex}`],
          scope:recipientId + ' recipient and the listed explicit facts or event; Mona uses a manually selected buff. Other recipients and duration boundaries are not verified.'});
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
async function auditResonances({ characters, weapons, engine, api, inputFor }) {
  const character = characters.get('kaeya');
  const weapon = weapons.get('dullblade');
  const input = await inputFor('kaeya');
  const rows = [];
  for (const spec of resonanceSpecs) {
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

function samplePanels(api, input, buff) {
  return { before: api.CommonInterface.get_attribute({ ...input, buffs: [] }),
    after: api.CommonInterface.get_attribute({ ...input, buffs: [buff] }) };
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

/** Run both scenario families with one runtime and shared recipient fixtures. */
export async function auditMonaBuffScenarios(entities, engine) {
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const { CHARACTER_EFFECT_RULES } = await import('../../.references/mona-community/beta-data/character-effect-rules.mjs');
  const inputs = new Map();
  const inputFor = async id => {
    if (!inputs.has(id)) inputs.set(id, (await probeMonaSkills({ characters: [id === 'barbara' ? 'Barbara' : 'Kaeya'], indices: [0], constellations: [0] })).rows[0].input);
    return structuredClone(inputs.get(id));
  };
  const shared = { characters: new Map(entities.characters.map(item => [item.id, item])),
    weapons: new Map(entities.weapons.map(item => [item.id, item])), engine, api, rules: CHARACTER_EFFECT_RULES, inputFor };
  return { resonance: await auditResonances(shared), characters: await auditCharacters(shared) };
}
