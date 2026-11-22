import { auditBuild, auditHit } from './roster-evaluation.mjs';

const white = {WEAPON_SWORD_ONE_HAND:'dullblade',WEAPON_POLE:'beginnersprotector',WEAPON_CATALYST:'apprenticesnotes',WEAPON_CLAYMORE:'wastergreatsword',WEAPON_BOW:'huntersbow'};
const boolean = value => ({value:{kind:'boolean',value},provenance:'explicit',sourceRefs:[]});
const hp = value => ({value:{kind:'quantity',unit:'scalar',value},provenance:'explicit',sourceRefs:[]});
const casts = [
  ['albedo','passives',1,'burst',10000,'team',{elementalMastery:125}],
  ['collei','constellations',3,'burst',12000,'others',{elementalMastery:60}],
  ['keqing','passives',1,'burst',8000,'self',{critRate:.15,energyRecharge:.15}],
  ['amber','constellations',5,'burst',10000,'team',{movementSpeed:.15,attackPercent:.15}],
  ['baizhu','constellations',3,'burst',15000,'team',{elementalMastery:80}],
  ['gorou','passives',0,'burst',12000,'team',{defensePercent:.25}],
  ['kamisatoayaka','passives',0,'skill',6000,'self',{damageBonus:.30},['normal','charged']],
  ['kamisatoayato','constellations',3,'burst',15000,'team',{normalAttackSpeed:.15}],
  ['kaveh','constellations',0,'skill',3000,'self',{'resistance.dendro':.5,incomingHealingBonus:.25}],
  ['lanyan','constellations',3,'burst',12000,'team',{elementalMastery:60}],
  ['yunjin','constellations',1,'burst',12000,'team',{damageBonus:.15},['normal']],
  ['aether-pyro','constellations',3,'burst',9000,'self',{pyroBonus:.2}],['lumine-pyro','constellations',3,'burst',9000,'self',{pyroBonus:.2}],
];

export function auditCharacterBuffs(entities,engine) {
  const weapons=new Map(entities.weapons.map(w=>[w.id,w])),chars=new Map(entities.characters.map(c=>[c.id,c])),rows=[];
  const build=id=>auditBuild(chars.get(id),weapons.get(white[chars.get(id).identity.weaponType]));
  const peer=build('jean');
  function record(entity,field,settings,value,expected) {
    const ok=expected===null ? value===null : Number.isFinite(value) && Math.abs(value-expected)<1e-7;
    rows.push({entity,field,settings,value,expected,...ok?{}:{issue:'条件或贡献与本地条款不符'}});
  }
  function prepare(b,others=[peer]) {
    const result=engine.prepareStructuredBuilds([{id:'actor',build:b},...others.map((v,i)=>({id:'peer'+i,...v?{build:v}:{element:'pyro'}}))]);
    if(!result.ok)throw Error(b.character.id+' '+JSON.stringify(result.diagnostics));
    return result.team;
  }
  function read(b,team,key,{recipient='actor',category='normal',hitId,events=[],time=1,facts={},targetFacts,ownerInputs}={}) {
    const talent=b.character.talents[0],h=talent.hits[0],{setup,request}=auditHit(b.character,talent,h,b.level);
    setup.events[0].timeMs=time;
    setup.events.push(...events);
    Object.assign(request.frame.factOverrides[0].facts,facts);
    if(targetFacts)request.frame.factOverrides.push({subject:{kind:'target',id:'enemy'},facts:targetFacts});
    const binding={kind:'attribute',key:{namespace:'builtin',id:'attribute.'+key,revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}};
    const context=engine.createStructuredCombatContext(team,setup);
    if (ownerInputs) Object.assign(context.actors[0].inputs,ownerInputs);
    const attackTalent = hitId ? b.character.talents.find(t=>t.hits.some(hit=>hit.id===hitId)) : talent;
    const result=engine.evaluateCombatBindings(team.program,context,{value:binding},{...request.frame,
      ownerId:recipient,recipientId:recipient,contributorId:null,hit:{skillId:attackTalent?.id??'equipment',hitId:hitId??h.id,category,element:'physical',origin:attackTalent?'talent':'triggered',family:'ordinary',reactionId:null}});
    return result.outputs.value?.value?.value ?? null;
  }
  for (const rank of [0, 1, 2]) {
    const b = { ...build('furina'), level: 90, ascension: 6, constellation: rank };
    b.talents.burst = 10;
    const team = prepare(b);
    const cast = { id: 'cast', kind: 'action', actorId: 'actor', skillId: 'furina.burst', timeMs: 0, order: 0, targetIds: [], sourceEventIds: [], facts: {} };
    for (const changes of [[], [-.25], [-.5, .5], [1, -1], [1, -1, .75]]) {
      const events = [cast, ...changes.map((delta, i) => ({ id: 'health-' + i, kind: 'state-change', actorId: i % 2 ? 'actor' : 'peer0',
        timeMs: i + 1, order: i + 1, targetIds: [], sourceEventIds: [], facts: { hpRatioChange: hp(delta) } }))];
      const total = (rank >= 1 ? 150 : 0) + changes.reduce((n, delta) => n + Math.abs(delta), 0) * (rank === 2 ? 350 : 100);
      const cap = rank === 0 ? 300 : 400;
      for (const recipient of ['actor', 'peer0']) for (const time of [10, 17999, 18000]) {
        const points = time === 18000 ? 0 : Math.min(cap, total);
        const excessHealth = time < 18000 && rank === 2 && recipient === 'actor' ? Math.min(1.4, Math.max(0, total - cap) * .0035) : 0;
        for (const [stat, expected] of [['damageBonus', points * .0025], ['incomingHealingBonus', points * .001], ['hpPercent', excessHealth]]) {
          const value = read(b, team, stat, { recipient, time, events });
          record('furina', rank < 2 && stat !== 'hpPercent' ? '/constellations/0' : '/constellations/1', { rank, changes, recipient, time, stat }, value, expected);
        }
      }
    }
    if (rank === 2) for (const [points, excess, expected] of [[399, undefined, 0], [400, undefined, null], [400, 0, 0], [400, 100, .35], [400, 500, 1.4], [399, 1, null]]) {
      const facts = { 'furina.fanfarePoints': hp(points), ...(excess === undefined ? {} : { 'furina.excessFanfare': hp(excess) }) };
      record('furina', '/constellations/1', { points, excess, stat: 'hpPercent' }, read(b, team, 'hpPercent', { facts, events: [cast] }), expected);
    }
  }
  for (const [rank, ascension] of [[0, 0], [0, 4], [3, 4], [4, 4], [5, 4], [6, 4]]) {
    const b = { ...build('freminet'), constellation: rank, ascension, level: ascension ? 60 : 1 }, team = prepare(b);
    const pressure = b.character.talents[1].hits.filter(h => h.name.includes('高压粉碎'));
    const proposals = [
      ['/passives/1', 'damageBonus', .4, ascension >= 4, 1, 5000],
      ['/constellations/3', 'attackPercent', .09, rank >= 4, 2, 6000],
      ['/constellations/5', 'critDamage', .12, rank >= 6, 3, 6000],
    ];
    for (const [field, stat, delta, unlocked, max, duration] of proposals) {
      const shatterOnly = stat === 'damageBonus';
      const check = (observations, time, recipient, hit, stackCount) => {
        const events = observations.map(([reactionId, timeMs, actorId], i) => ({ id: 'reaction-' + i, kind: 'reaction', actorId,
          reactionId, timeMs, order: i + 2, targetIds: ['enemy'], sourceEventIds: [], facts: {} }));
        const opts = { recipient, time, category: hit.category, hitId: hit.id };
        const base = read(b, team, stat, opts), active = read(b, team, stat, { ...opts, events });
        const applies = unlocked && recipient === 'actor' && (!shatterOnly || pressure.some(h => h.id === hit.id));
        record('freminet', field, { rank, ascension, recipient, hit: hit.id, observations, time }, active === null || base === null ? null : active - base,
          applies ? stackCount === null ? null : delta * Math.min(max, stackCount) : 0);
      };
      for (const reaction of ['freeze', 'shatter', 'superconduct', 'stellar-conduct', 'melt', 'crystallize']) for (const who of ['actor', 'peer0']) {
        const eligible = who === 'actor' && (shatterOnly ? reaction === 'shatter' : ['freeze', 'shatter', 'superconduct', 'stellar-conduct'].includes(reaction));
        check([[reaction, 0, who]], 1, 'actor', pressure[0], Number(eligible));
      }
      for (const hit of [...pressure, b.character.talents[1].hits[0], b.character.talents[0].hits[0]]) {
        check([['shatter', 0, 'actor']], 1, 'actor', hit, 1);
      }
      check([['shatter', 0, 'actor']], 1, 'peer0', pressure[0], 0);
      check([['shatter', 0, 'actor']], duration, 'actor', pressure[0], 0);
      if (!shatterOnly) {
        const sequence = [0, 299, 300, 600, 900].map(t => ['shatter', t, 'actor']);
        for (const [time, stacks] of [[1, 1], [299, 1], [301, 2], [901, max], [6900, 0]]) check(sequence, time, 'actor', pressure[0], stacks);
        const overlapping = [['freeze',0,'actor'],['shatter',300,'actor']];
        for (const [time, stacks] of [[5999,2],[6000,null],[6299,null],[6300,0]]) check(overlapping,time,'actor',pressure[0],stacks);
      }
    }
  }
  for (const [level,rate] of [[1,.0022],[4,.0025],[9,.003],[10,.003]]) {
    const b={...build('raidenshogun'),level:90,ascension:6}; b.talents.skill=level;
    const team=prepare(b,[build('keqing'),build('kaeya'),build('skirk')]);
    for(const [recipient,capacity] of [['actor',90],['peer0',40],['peer1',60],['peer2',0]]) for(const category of ['burst','skill','normal']) {
      for (const [time,who,skill] of [[1,'actor','raidenshogun.skill'],[24999,'actor','raidenshogun.skill'],[25000,'actor','raidenshogun.skill'],
        [1,'peer1','kaeya.skill'],[1,'actor','raidenshogun.burst']]) {
        const event={id:'cast',kind:'action',actorId:who,skillId:skill,timeMs:0,order:0,targetIds:[],sourceEventIds:[],facts:{}};
        const opts={time,recipient,category},active=category==='burst' && time<25000 && who==='actor' && skill==='raidenshogun.skill';
        record('raidenshogun','/talents/1/buffs/0',{level,capacity,who,skill,...opts},read(b,team,'damageBonus',{...opts,events:[event]}),read(b,team,'damageBonus',opts)+(active?rate*capacity:0));
      }
    }
  }
  for(const [id,mode,other] of [['amber','glide','venti'],['collei','glide','amber'],['venti','glide','collei'],['beidou','swim','sangonomiyakokomi'],
    ['sangonomiyakokomi','swim','beidou'],['candace','climb','xiao'],['xiao','climb','candace'],['kaeya','sprint','razor'],['razor','sprint','kaeya'],
    ['kaedeharakazuha','sprint','chevreuse'],['chevreuse','sprint','shikanoinheizou'],['shikanoinheizou','sprint','kaedeharakazuha']]) {
    const b=build(id),index=b.character.passives.findIndex(p=>p.description.includes('体力降低20%'));
    for(const party of [[peer],[build(other),peer],[build(other),peer,build('sucrose')]]) {
      const team=prepare(b,party),has=party.map(p=>p.character.id);
      for(const recipient of ['actor','peer0']) for(const action of ['sprint','glide','swim','climb']) {
        const opts={recipient};
        record(id,'/passives/'+index,{action,recipient,party:has},read(b,team,'staminaCostReduction.'+action,opts),read(b,team,'staminaCostReduction',opts)+(mode===action?.2:0));
      }
    }
  }
  for(const [id,stat,ratio] of [['aino','elementalMastery',.5],['kachina','defense',.2]]) {
    for(const ascension of [3,4]) {
      const b={...build(id),ascension,level:ascension===3?60:70};
      if(id==='aino')b.weapon=weapons.get('bloodtaintedgreatsword');
      const team=prepare(b),own=read(b,team,stat);
      for(const [i,talent] of b.character.talents.entries())for(const hit of talent.hits)for(const recipient of ['actor','peer0']) {
        const opts={recipient,hitId:hit.id,category:hit.category};
        const eligible=id==='aino'?i===2:hit.id==='kachina.skill.param1'||hit.id==='kachina.skill.param2';
        record(id,'/passives/1',{ascension,own,...opts},read(b,team,'baseDamageBonus',opts),eligible&&ascension===4&&recipient==='actor'?own*ratio:0);
      }
    }
  }
  for(const id of ['kaeya','diluc','kamisatoayato','freminet','hutao']) {
    for(const unlocked of [false,true]) {
      const passive=id==='hutao', b={...build(id),...(passive?{ascension:unlocked?4:3,level:unlocked?70:60}:{constellation:Number(unlocked)})};
      const team=prepare(b),stat=passive?'pyroBonus':id==='kaeya'||id==='freminet'?'critRate':'damageBonus';
      const cases = id==='kaeya'?[[false,false],[true,false],[false,true],[true,true]] : id==='freminet'?[[false,false]]:[[.4999,false],[.5,false],[.5001,false],[1,false]];
      for(const talent of b.character.talents)for(const hit of talent.hits) for(const [state,frozen] of cases)for(const recipient of ['actor','peer0']) {
        const facts={hpRatio:hp(state)},targetFacts=id==='kaeya'?{'aura.cryo':boolean(state),'aura.frozen':boolean(frozen)}:{targetHpRatio:hp(state)};
        const opts={category:hit.category,hitId:hit.id,recipient,...typeof state==='number'?{facts}:{},...id==='freminet'||passive?{}:{targetFacts}};
        const grant=id==='kaeya'?((state||frozen)&&['normal','charged'].includes(hit.category)?.15:0):id==='diluc'?(state>.5?.15:0)
          :id==='kamisatoayato'?(state<=.5 && (/^kamisatoayato\.skill\.param[123]$/.test(hit.id) || hit.id==='kamisatoayato.c6.shunsuiken') ? .4 : 0)
          :id==='freminet'?(/^freminet\.skill\.param(?:[4-9]|10|11)$/.test(hit.id)?.15:0):state<=.5?.33:0;
        record(id,passive?'/passives/1':'/constellations/0',{unlocked,state,frozen,recipient,hit:hit.id},read(b,team,stat,opts),(stat==='critRate'?.05:0)+(recipient==='actor'&&unlocked?grant:0));
      }
    }
  }
  for(const [entity,group,index,category,duration,range,stats,eligible] of casts) {
    const base=build(entity),branch=base.character[group][index],gate=group==='passives'?branch.unlockAscension:branch.rank;
    const talent=base.character.talents.find(t=>t.category===category),field='/'+group+'/'+index;
    for(const unlocked of [false,true]) {
      const b=group==='passives'?{...base,ascension:unlocked?gate:gate-1,level:base.character.progression.promotion[gate-1].maxLevel}:{...base,constellation:unlocked?gate:gate-1};
      const team=prepare(b);
      for(const [time,actorId,skillId] of [[1,'actor',talent.id],[duration-1,'actor',talent.id],[duration,'actor',talent.id],[1,'peer0',peer.character.talents[1].id],[1,'actor',base.character.talents[0].id]]) {
        const event={id:'cast',kind:'action',actorId,skillId,timeMs:0,order:0,targetIds:[],sourceEventIds:[],facts:{}};
        for(const recipient of ['actor','peer0']) for(const cat of eligible?['normal','charged','plunge','burst']:['normal']) {
          const receives=range==='team' || (range==='others' ? recipient!=='actor' : recipient==='actor');
          const on=unlocked && time<duration && actorId==='actor' && skillId===talent.id && receives && (!eligible || eligible.includes(cat));
          for(const [stat,delta] of Object.entries(stats)) {
            const opts={recipient,category:cat,time};
            const without=read(b,team,stat,opts),withCast=read(b,team,stat,{...opts,events:[event]});
            record(entity,field,{stat,unlocked,actorId,skillId,...opts},without===null||withCast===null?null:withCast-without,on?delta:0);
          }
        }
      }
    }
  }
  for(const [entity,index,stat,delta,when] of [['bennett',1,'energyRecharge',.30,'below70'],['xiao',1,'energyRecharge',.25,'off'],
    ['xiao',3,'defensePercent',1,'below50'],['aether-anemo',1,'energyRecharge',.16,'always'],['lumine-anemo',1,'energyRecharge',.16,'always'],
    ['collei',0,'energyRecharge',.20,'off']]) {
    const base=build(entity),locked=prepare({...base,constellation:index}),enabled=prepare({...base,constellation:index+1});
    for(const health of [.4999,.5,.6999,.7,1]) for(const field of [false,true]) {
      const opts={facts:{hpRatio:hp(health),onField:boolean(field)}};
      const on=when==='below50'?health<.5:when==='below70'?health<.7:when==='off'?!field:true;
      const withRank=read(base,enabled,stat,opts),without=read(base,locked,stat,opts);
      record(entity,'/constellations/'+index,{health,field},withRank===null||without===null?null:withRank-without,on?delta:0);
    }
  }
  function pairedBuilds(id,group,index) {
    const base=build(id), branch=base.character[group][index];
    const rank=group==='passives'?branch.unlockAscension:branch.rank;
    const key=group==='passives'?'ascension':'constellation';
    const level=group==='passives'?base.character.progression.promotion[rank-1].maxLevel:1;
    const active={...base,level,[key]:rank}, locked={...active,[key]:rank-1};
    return {b:active,before:prepare(locked),after:prepare(active),field:'/'+group+'/'+index};
  }
  const attributeInput=(unit,value)=>({value:{kind:'quantity',unit,value},provenance:'explicit',sourceRefs:[]});
  const flatCases=[
    ['albedo','passives',0,'damageBonus'],['yanfei','constellations',1,'critRate'],
    ['kukishinobu','passives',0,'healingBonus'],['tighnari','constellations',0,'critRate'],
    ['xingqiu','passives',1,'hydroBonus'],['yaemiko','constellations',5,'defenseIgnore'],
  ];
  for(const [id,group,index,stat] of flatCases) {
    const {b,before,after,field}=pairedBuilds(id,group,index);
    for(const talent of b.character.talents) for(const hit of talent.hits) for(const health of [.4999,.5,.5001]) for(const recipient of ['actor','peer0']) {
      const category=hit.category??talent.category;
      const opts={recipient,category,hitId:hit.id,facts:{hpRatio:hp(1-health)},targetFacts:{targetHpRatio:hp(health)}};
      const expected={
        albedo:hit.name==='刹那之花伤害' && health<.5 ? .25 : 0,
        yanfei:category==='charged' && health<.5 ? .2 : 0,
        kukishinobu:1-health<=.5 ? .15 : 0,
        tighnari:category==='charged' ? .15 : 0,
        xingqiu:.2,
        yaemiko:hit.name.startsWith('杀生樱伤害') ? .6 : 0,
      }[id];
      const prior=read(b,before,stat,opts),current=read(b,after,stat,opts);
      record(id,field,{stat,health,recipient,hit:hit.id},current===null||prior===null?null:current-prior,recipient==='actor'?expected:0);
    }
  }
  const scaleCases=[
    ['aratakiitto','passives',1,'defense','baseDamageBonus'],['thoma','passives',1,'hp','baseDamageBonus'],
    ['dehya','constellations',0,'hp','baseDamageBonus'],['yaemiko','passives',1,'elementalMastery','damageBonus'],
    ['tighnari','passives',1,'elementalMastery','damageBonus'],['mona','passives',1,'energyRecharge','hydroBonus'],
  ];
  for(const [id,group,index,basis,stat] of scaleCases) {
    const {b,before,after,field}=pairedBuilds(id,group,index);
    const attacks=b.character.talents.flatMap(t=>t.hits.map(hit=>({hit,category:hit.category??t.category})));
    for(const t of peer.character.talents.slice(1)) attacks.push({hit:t.hits[0],category:t.category});
    for(const input of basis==='energyRecharge'?[1,1.5,2.1]:basis==='elementalMastery'?[0,500,1000,1200]:[0,307]) {
      const key=basis==='hp'?'flatHp':basis==='defense'?'flatDefense':basis, unit=basis==='energyRecharge'?'scalar':basis;
      const ownerInputs={[key]:attributeInput(unit,input)};
      let panel=input;
      if (basis==='hp'||basis==='defense') {
        const white=b.character.attributes.base[basis]*b.character.progression.curves[basis][b.level]+b.character.progression.promotion[b.ascension][basis];
        panel=white*(id==='dehya'?1.2:1)+input;
      }
      for(const recipient of ['actor','peer0']) {
        if (id==='dehya') {
          const opts={recipient,ownerInputs};
          record(id,field,{stat:'hpPercent',input,recipient},read(b,after,'hpPercent',opts)-read(b,before,'hpPercent',opts),recipient==='actor'?.2:0);
        }
        for(const {hit,category} of attacks) {
          const opts={recipient,ownerInputs,category,hitId:hit.id};
          const expected={
            aratakiitto:hit.name.startsWith('荒泷逆袈裟')?panel*.35:0,
            thoma:hit.name==='炽火崩破伤害'?panel*.022:0,
            dehya:hit.id.startsWith('dehya.skill.')?panel*.036:hit.id.startsWith('dehya.burst.')?panel*.06:0,
            yaemiko:hit.name.startsWith('杀生樱伤害')?panel*.0015:0,
            tighnari:category==='charged'||hit.id.startsWith('tighnari.burst.')?Math.min(panel*.0006,.6):0,
            mona:panel*.2,
          }[id];
          const prior=read(b,before,stat,opts), current=read(b,after,stat,opts);
          record(id,field,{stat,basis,input,recipient,hit:hit.id},prior===null||current===null?null:current-prior,recipient==='actor'?expected:0);
        }
      }
    }
  }
  const gamer={...build('gaming'),level:60,ascension:4},gaming=prepare(gamer);
  for(const [ascension,level] of [[0,1],[3,60],[4,60]]) {
    const b={...build('sangonomiyakokomi'),ascension,level},team=prepare(b);
    const maxHp=b.character.attributes.base.hp*b.character.progression.curves.hp[level]+b.character.progression.promotion[ascension].hp;
    for(const recipient of ['actor','peer0']) {
      for(const [stat,value] of [['healingBonus',.25],['critRate',-.95]]) {
        const expected=recipient==='actor'?value:stat==='healingBonus'?0:.05;
        record(b.character.id,'/passives/3',{stat,ascension,recipient},read(b,team,stat,{recipient}),expected);
      }
      for(const category of ['normal','charged','plunge','burst']) for(const active of [true,false]){
        const facts={'sangonomiyakokomi.garment':boolean(active)};
        const ratio=category==='normal'?.0484:category==='charged'?.06776:0;
        const enabled=active && recipient==='actor' && ratio>0;
        const expected=enabled?maxHp*(ratio+(ascension>=4?.25*.15:0)):0;
        record(b.character.id,'/passives/1',{ascension,category,active,recipient},read(b,team,'baseDamageBonus',{facts,category,recipient}),expected);
      }
    }
  }
  for(const health of [.4999,.50,1]) for(const attack of ['gaming.skill.param1',gamer.character.talents[0].hits[0].id]) {
    const opts={facts:{hpRatio:hp(health)},hitId:attack};
    record('gaming','/passives/1',{health,attack,stat:'healing'},read(gamer,gaming,'incomingHealingBonus',opts),health<.5?.2:0);
    record('gaming','/passives/1',{health,attack,stat:'damage'},read(gamer,gaming,'damageBonus',opts),health>=.5&&attack==='gaming.skill.param1'?.2:0);
  }
  for(const c of entities.characters) {
    const i=c.passives.findIndex(p=>/在队伍中时，队伍的月兆将会上升一级/.test(p.description));
    if(i<0)continue;
    const partner=build(c.id==='aino'?'flins':'aino'),base=build(c.id);
    for(const [others,first,full] of [[[],true,false],[[peer],true,false],[[partner],true,true],[[null],true,null]]) {
      const t=prepare(base,others),context=engine.createStructuredCombatContext(t,{targets:[],events:[],factIntervals:[],sources:[],team:{inputs:{},actorFacts:{},facts:{}}});
      for(const [key,value] of [['firstMoonsign',first],['fullMoonsign',full]]) {
        const result=context.team.facts[key]?.value?.value;
        record(c.id,'/passives/'+i,{key,others:others.map(o=>o?.character.id ?? null)},result===undefined?null:Number(result),value===null?null:Number(value));
      }
    }
  }
  const verified=rows.filter(r=>(!r.settings.key || /^[^。]+在队伍中时，队伍的月兆将会上升一级。$/.test(chars.get(r.entity).passives[Number(r.field.split('/')[2])].description)) &&
    !rows.some(other=>other.entity===r.entity && other.field===r.field && other.issue)).map(r=>r.entity+r.field);
  return {rows,verified:[...new Set(verified)],summary:{characterBuffCases:rows.length,characterBuffFailures:rows.filter(r=>r.issue).length}};
}
