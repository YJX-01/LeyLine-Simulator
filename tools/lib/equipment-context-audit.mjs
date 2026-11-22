import { auditBuild, auditHit } from './roster-evaluation.mjs';
import { readContentSource } from './content-source.mjs';

const source = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json',import.meta.url));
const flag = value => ({value:{kind:'boolean',value},provenance:'explicit',sourceRefs:[]});
const quantity = (unit,value) => ({value:{kind:'quantity',unit,value},provenance:'explicit',sourceRefs:[]});
const starter = {WEAPON_SWORD_ONE_HAND:'dullblade',WEAPON_BOW:'huntersbow',WEAPON_POLE:'beginnersprotector',WEAPON_CLAYMORE:'wastergreatsword',WEAPON_CATALYST:'apprenticesnotes'};

/** Compare the actual attribute under different parties, source events and target attacks with the local refinement text. */
export function auditEquipmentContexts(entities,engine) {
  const rows=[], weapons=new Map(entities.weapons.map(w=>[w.id,w])), characters=new Map(entities.characters.map(c=>[c.id,c]));
  function build(id,weapon,refinement=1) {
    const c=characters.get(id);
    return {...auditBuild(c,weapons.get(weapon ?? starter[c.identity.weaponType])),refinement};
  }
  function probe(b,others=[]) {
    const members=[{id:'actor',build:b},...others.map((build,i)=>({id:'peer'+i,...build?{build}:{element:'geo'}}))];
    const prepared=engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(b.character.id+' / '+b.weapon.id+' '+JSON.stringify(prepared.diagnostics));
    const talent=b.character.talents[0], h=talent.hits[0];
    return (key,{category='normal',time=1,events=[],facts={},targetFacts,recipient='actor',family='ordinary',reactionId=null,flatHp,recharge,queryEvent,phase='before'}={}) => {
      const {setup,request}=auditHit(b.character,talent,h);
      if (queryEvent) Object.assign(setup.events[0],queryEvent,{id:request.frame.eventId});
      setup.events[0].timeMs=time;
      setup.events.unshift(...events);
      Object.assign(request.frame.factOverrides[0].facts,facts);
      if (targetFacts) request.frame.factOverrides.push({subject:{kind:'target',id:'enemy'},facts:targetFacts});
      const context=engine.createStructuredCombatContext(prepared.team,setup);
      if (flatHp!==undefined) context.actors[0].inputs.flatHp=quantity('hp',flatHp);
      if (recharge!==undefined) context.actors[0].inputs.energyRecharge=quantity('scalar',recharge);
      const input={kind:'attribute',key:{id:'attribute.'+key,namespace:'builtin',revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}};
      const result=engine.evaluateCombatBindings(prepared.team.program,context,{value:input},{...request.frame,phase,ownerId:recipient,recipientId:recipient,contributorId:null,
        hit:{skillId:talent.id,hitId:h.id,category,element:'physical',origin:'talent',family,reactionId}});
      return result.outputs.value?.value?.value ?? null;
    };
  }
  function record(entity,rank,field,settings,value,expected) {
    const matches=expected===null?value===null:Number.isFinite(value) && Math.abs(value-expected)<1e-7;
    rows.push({entity,rank,field,settings,value,expected,...matches?{}:{issue:'实际属性与独立期望不符'}});
  }
  const event=(kind,category,timeMs,actorId='actor',facts={},onField=true)=>({id:'source-'+timeMs,kind,category,actorId,targetIds:['enemy'],timeMs,order:0,
    sourceEventIds:[],facts,subjectFacts:[{subject:{kind:'actor',id:actorId},values:{onField:flag(onField)}}]});
  const energyHolders=[['yaemiko',90],['raidenshogun',90],['kamisatoayaka',80],['eula',80]];
  const polearm = 'engulfinglightning';
  for (let rank = 1; rank <= 5; rank++) {
    const read = probe(build('xiangling', polearm, rank), [build('jean')]);
    const rate = [.28, .35, .42, .49, .56][rank - 1];
    const cap = [.8, .9, 1, 1.1, 1.2][rank - 1];
    const burst = [.30, .35, .40, .45, .50][rank - 1];
    for (const recharge of [.9, 1, 1.12, 2, 1 + cap / rate, 5]) {
      for (const [time, who, category] of [[1,'actor','burst'], [11999,'actor','burst'], [12000,'actor','burst'], [1,'peer0','burst'], [1,'actor','skill']]) {
        const gain = time < 12000 && who === 'actor' && category === 'burst' ? burst : 0;
        for (const recipient of ['actor', 'peer0']) {
          const settings = { time, who, category, recharge, recipient };
          const options = { time, recipient, recharge, events: [event('action', category, 0, who)], facts: { onField:flag(false) } };
          const holder = recipient === 'actor';
          record(polearm, rank, '/buffs/0', settings, read('energyRecharge', options), holder ? recharge + gain : 1);
          record(polearm, rank, '/buffs/1', settings, read('attackPercent', options), holder ? Math.min(cap, Math.max(0, recharge + gain - 1) * rate) : 0);
        }
      }
    }
  }
  for (let rank=1;rank<=5;rank++) {
    const id='beaconofthereedsea', read=probe(build('noelle',id,rank),[build('jean')]);
    const [skillRate,damageRate,hpRate]=[...source[id].metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for (const onField of [false,true]) {
      const history=[event('hit','skill',0,'actor',{targetsDamaged:quantity('count',0)},onField),event('state-change','normal',500,'actor',{damageTaken:quantity('hp',1)},onField)];
      for (const time of [0,499,500,7999,8000,8499,8500]) for (const recipient of ['actor','peer0']) {
        const value=read('attackPercent',{time,recipient,events:history});
        record(id,rank,'/buffs',{onField,time,recipient},value,recipient==='actor'?(time<8000?skillRate:0)+(time>=500&&time<8500?damageRate:0):0);
      }
    }
    for (const shielded of [false,true]) for(const recipient of ['actor','peer0']) {
      record(id,rank,'/buffs/2',{shielded,recipient},read('hpPercent',{facts:{shielded:flag(shielded)},recipient}),recipient==='actor'&&!shielded?hpRate:0);
    }
    for (const [who,kind,key,val] of [['peer0','state-change','damageTaken',10],['actor','state-change','hpRatioChange',-.1],['actor','state-change','damageTaken',0],['actor','hit','targetsDamaged',1]]) {
      const e=event(kind,'normal',0,who,{[key]:quantity(key==='damageTaken'?'hp':key==='targetsDamaged'?'count':'scalar',val)});
      record(id,rank,'/buffs',{who,kind,key,val},read('attackPercent',{events:[e]}),0);
    }
    const bowId='rainbowserpentsrainbow', b=build('amber',bowId,rank), bow=probe(b,[build('jean')]);
    const baseline=b.weapon.stat==='attackPercent'?b.weapon.baseStat*b.weapon.statCurve[1]:0;
    const rate=Number(source[bowId].metadata['r'+rank].description.match(/([\d.]+)%/)[1])/100;
    for(const onField of [false,true]) for (const now of [false,true]) for(const who of ['actor','peer0']) for(const kind of ['hit','reaction','action']) {
      const e=event(kind,'skill',0,who,{targetsDamaged:quantity('count',0)},onField);
      for(const time of [1,7999,8000]) {
        const expected=kind==='hit'&&who==='actor'&&!onField&&time<8000?rate:0;
        record(bowId,rank,'/buffs/0',{onField,now,who,kind,time},bow('attackPercent',{time,events:[e],facts:{onField:flag(now)}}),baseline+expected);
      }
    }
    const refresh=[event('hit','normal',0,'actor',{},false),event('hit','skill',500,'actor',{},false),event('hit','skill',600,'actor',{},true)];
    for (const time of [501,8000,8499,8500]) for(const recipient of ['actor','peer0']) {
      record(bowId,rank,'/buffs/0',{time,recipient,refresh:true},bow('attackPercent',{time,events:refresh,recipient}),recipient==='actor'?baseline+(time<8500?rate:0):0);
    }
  }
  for (let rank=1;rank<=5;rank++) {
    const b=build('kaeya','cinnabarspindle',rank), read=probe(b,[build('jean')]);
    const rate=Number(source.cinnabarspindle.metadata['r'+rank].description.match(/([\d.]+)%/)[1])/100;
    const defense=(b.character.attributes.base.defense*b.character.progression.curves.defense[1]+b.character.progression.promotion[0].defense)*(1+b.weapon.baseStat*b.weapon.statCurve[1]);
    const window=[0,99,100,1499,1500,1599,1600];
    for (const field of [false,true]) {
      const history=window.map(time=>event('hit','skill',time,'actor',{targetsDamaged:quantity('count',1)},field));
      for (const time of window) for (const recipient of ['actor','peer0']) for (const category of ['normal','skill','burst']) {
        const active=[0,99,1500,1599].includes(time)&&recipient==='actor'&&category==='skill';
        const options={time,category,recipient,events:history};
        record(b.weapon.id,rank,'/buffs/0',{time,category,recipient,field},read('baseDamageBonus',options),active?defense*rate:0);
      }
    }
    for (const [who,category,targets] of [['peer0','skill',1],['actor','burst',1],['actor','skill',0],['actor','skill',null]]) {
      const source=event('hit',category,0,who,{targetsDamaged:targets===null?{value:null,provenance:'explicit',sourceRefs:[]}:quantity('count',targets)});
      record(b.weapon.id,rank,'/buffs/0',{who,category,targets},read('baseDamageBonus',{category:'skill',time:1,events:[source]}),targets===null?null:0);
    }
  }
  for (const [weapon,id,cost] of [['mouunsmoon','kujousara',80],['akuoumaru','beidou',80],['wavebreakersfin','raidenshogun',90]]) for (let rank=1;rank<=5;rank++) {
    const b=build(id,weapon,rank), peers=energyHolders.filter(([member])=>member!==id).slice(0,3);
    const text=source[weapon].metadata['r'+rank].description;
    const amounts=[...text.matchAll(/([\d.]+)%/g)].map(match=>Number(match[1])/100);
    if (amounts.length!==2) throw new Error(weapon+' '+rank);
    for (const party of [[],peers,[...peers.slice(0,2),['mavuika',0]],[['skirk',0]],[[null,null]]]) {
      const read=probe(b,party.map(([actor])=>actor?build(actor):null));
      const energy=party.some(([actor])=>!actor)?null:cost+party.reduce((sum,[,v])=>sum+v,0);
      for (const category of ['burst','skill']) record(weapon,rank,'/buffs/0',{party:party.map(([id])=>id),energy,category},
        read('damageBonus',{category}),category==='skill'?0:energy===null?null:Math.min(energy*amounts[0],amounts[1]));
    }
  }
  for (const [id,actor] of [['aquasimulacra','amber'],['deathmatch','xiangling']]) for (let rank=1;rank<=5;rank++) {
    const read=probe(build(actor,id,rank)),rates=[...source[id].metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for (const count of [0,1,2,3]) for (const field of [false,true]) {
      const settings={count,onField:field}, facts={nearbyEnemies:quantity('count',count),onField:flag(field)};
      if (id==='deathmatch') {
        facts['deathmatch.enemiesAtUpdate']=quantity('count',count);
        facts.nearbyEnemies=quantity('count',count>=2?0:3);
      }
      const expected=id==='deathmatch'?{attackPercent:count>=2?rates[0]:rates[2],defensePercent:count>=2?rates[1]:0}:{hpPercent:rates[0],damageBonus:count>=1?rates[1]:0};
      for (const [stat,v] of Object.entries(expected)) record(id,rank,stat,settings,read(stat,{facts}),v);
    }
    if (id==='deathmatch') {
      const last=event('hit','normal',0);
      last.subjectFacts[0].values['deathmatch.enemiesAtUpdate']=quantity('count',2);
      const facts={onField:flag(false),nearbyEnemies:quantity('count',0)};
      record(id,rank,'/buffs/0/condition',{offFieldSnapshot:true},read('defensePercent',{facts,events:[last]}),rates[1]);
      record(id,rank,'/buffs/0/condition',{unobserved:true},read('defensePercent',{facts}),null);
      const reset=event('hit','normal',2);
      reset.subjectFacts[0].values['deathmatch.enemiesAtUpdate']={value:null,provenance:'explicit',sourceRefs:[]};
      record(id,rank,'/buffs/0/condition',{explicitUnknown:true},read('defensePercent',{time:3,facts,events:[last,reset]}),null);
    }
  }
  for (const [weapon,actor] of [['blackcliffagate','lisa'],['blackclifflongsword','kaeya'],['blackcliffpole','xiangling'],['blackcliffslasher','noelle'],['blackcliffwarbow','amber'],['twinnephrite','lisa']]) for (let rank=1;rank<=5;rank++) {
    const read=probe(build(actor,weapon,rank),[build('jean')]);
    const text=source[weapon].metadata['r'+rank].description;
    const rate=Number(text.match(/攻击力提升([\d.]+)%/)[1])/100,limit=weapon==='twinnephrite'?1:3;
    const lifetime=weapon==='twinnephrite'?15000:30000;
    const hits=[[0,'actor',true,true],[1000,'actor',true,true],[2000,'actor',true,true],[3000,'actor',true,true],
      [4100,'peer0',true,true],[4200,'actor',false,true],[4300,'actor',true,false]];
    for (const time of [1,2001,4301,lifetime,lifetime+1000,lifetime+2000,lifetime+3000]) {
      const events=hits.filter(([t])=>t<time).map(([t,id,on,kill])=>event('hit','normal',t,id,{enemyDefeated:flag(kill)},on));
      const count=Math.min(limit,[0,1000,2000,3000].filter(t=>t<time && time<t+lifetime).length);
      for(const stat of weapon==='twinnephrite'?['attackPercent','movementSpeed']:['attackPercent'])
        record(weapon,rank,stat,{time,count},read(stat,{time,events}),count*rate);
    }
  }
  const timed=[['oathsworneye','lisa','skill',10000,'energyRecharge',/元素充能效率提升([\d.]+)%/],
    ['skyridersword','kaeya','burst',15000,'attackPercent',/提高([\d.]+)%攻击力和移动速度/],
    ['tamayurateinoohanashi','xiangling','skill',10000,'movementSpeed',/和([\d.]+)%移动速度/],
    ['lightbearingmoonshard','kaeya','skill',5000,'reaction.lunar.damageBonus',/月结晶反应伤害提升([\d.]+)%/]];
  for (const [weapon,actor,trigger,ms,stat,pattern] of timed) for (let rank=1;rank<=5;rank++) {
    const b=build(actor,weapon,rank),read=probe(b,[build('jean')]),rate=Number(source[weapon].metadata['r'+rank].description.match(pattern)[1])/100;
    for(const [time,who,cast,family] of [[1,'actor',trigger,'lunar-crystallize'],[ms-1,'actor',trigger,'lunar-crystallize'],[ms,'actor',trigger,'lunar-crystallize'],
      [1,'peer0',trigger,'lunar-crystallize'],[1,'actor','normal','lunar-crystallize'],[1,'actor',trigger,'ordinary']]) {
      const baseline=read(stat,{time,family});
      const active=who==='actor' && cast===trigger && time<ms && (weapon!=='lightbearingmoonshard' || family==='lunar-crystallize');
      record(weapon,rank,stat,{time,who,cast,family},read(stat,{time,family,events:[event('action',cast,0,who)]}),baseline+ (active?rate:0));
    }
  }
  for (let rank=1;rank<=5;rank++) {
    for(const [weapon,owner] of [['lithicblade','beidou'],['lithicblade','noelle'],['lithicspear','xiangling'],['lithicspear','rosaria']]) {
      const ownerCounts=['beidou','xiangling'].includes(owner),b=build(owner,weapon,rank);
      const rates=[...source[weapon].metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
      for(const [others,teammates] of [[[],0],[['zibai'],1],[['aether-geo','skirk','nicole'],0],[['zhongli','zibai','xingqiu'],3],[[null],null]]){
        const members=others.map(id=>id?build(id):null),read=probe(b,members);
        const targetFacts={'aura.cryo':flag(false),'aura.frozen':flag(false)};
        for(const [i,stat] of ['attackPercent','critRate'].entries()){
          const resonance=stat==='attackPercent' && owner==='xiangling' && others.includes('nicole')?.25:0;
          const base=(stat==='critRate'?.05:0)+resonance;
          const expected=teammates===null?null:base+Math.min(4,teammates+Number(ownerCounts))*rates[i];
          const weaponStat=stat===b.weapon.stat?b.weapon.baseStat*b.weapon.statCurve[1]:0;
          record(weapon,rank,'/buffs/0',{owner,others,stat},read(stat,{targetFacts}),expected===null?null:expected+weaponStat);
          if(others[0])record(weapon,rank,'/buffs/0',{owner,others,stat,recipient:'peer0'},read(stat,{recipient:'peer0',targetFacts}),base);
        }
      }
    }
    const hamayumi=probe(build('amber','hamayumi',rank),[build('jean')]);
    const harm=[...source.hamayumi.metadata['r'+rank].description.matchAll(/提升([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for(const recipient of ['actor','peer0']) for(const category of ['normal','charged','plunge','skill','burst']) for(const energy of [0,39.999,40,null]) {
      const bonus=category==='normal'?harm[0]:category==='charged'?harm[1]:0;
      const facts={currentEnergy:energy===null?{value:null,provenance:'explicit',sourceRefs:[]}:quantity('energy',energy)};
      const expected=recipient==='peer0'||!bonus?0:energy===null?null:bonus*(energy===40?2:1);
      record('hamayumi',rank,'/buffs',{recipient,category,energy},hamayumi('damageBonus',{facts,category,recipient}),expected);
    }
    const lantern=build('lisa','blackmarrowlantern',rank);
    const bonuses=[...source.blackmarrowlantern.metadata['r'+rank].description.matchAll(/提升([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for(const full of [false,true]){
      const members=full?[build('aino'),build('flins')]:[build('jean')],read=probe(lantern,members),blank=probe(build('lisa'),members);
      for(const recipient of ['actor','peer0']) for(const [family,reactionId] of [['transformative','bloom'],['transformative','hyperbloom'],['transformative','burgeon'],['lunar-bloom','lunar-bloom'],['lunar-charged','lunar-charged'],['ordinary',null]]){
        const opts={family,reactionId,recipient},stat='reaction.'+(family==='transformative'?'transformative':'lunar')+'.damageBonus';
        const delta=recipient!=='actor'?0:family==='lunar-bloom'?bonuses[1]+(full?bonuses[2]:0):reactionId==='bloom'?bonuses[0]:0;
        record('blackmarrowlantern',rank,'/buffs',{...opts,full},read(stat,opts),blank(stat,opts)+delta);
      }
    }
    const id='ringofyaxche',read=probe(build('lisa',id,rank),[build('jean')]);
    const rates=[...source[id].metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for (const added of [0,40000]) for(const [category,t,who,cast] of [['normal',9999,'actor','skill'],['normal',10000,'actor','skill'],['charged',1,'actor','skill'],['normal',1,'peer0','skill'],['normal',1,'actor','burst']]) {
      const opts={flatHp:added,time:t,category,events:[event('action',cast,0,who)]},hp=read('hp',opts);
      record(id,rank,'/buffs/0',{added,hp,category,t,who,cast},read('damageBonus',opts),who==='actor'&&cast==='skill'&&category==='normal'&&t<10000?Math.min(hp/1000*rates[0],rates[1]):0);
    }
  }
  for (const [id,trigger,categories,timeMs,values] of [
    ['heartofdepth','action',['skill'],15000,{damageBonus:.30}],
    ['martialartist','action',['skill'],8000,{damageBonus:.25}],
    ['maidenbeloved','action',['skill','burst'],10000,{incomingHealingBonus:.20}],
    ['desertpavilionchronicle','hit',['charged'],15000,{damageBonus:.40,normalAttackSpeed:.10}],
  ]) {
    const set=entities.sets.find(s=>s.id===id);
    for (const count of [3,4]) {
      const gear={...build('kaeya'),sets:[set],theoreticalSetSlots:set.slots.slice(0,count).map(slot=>({slot,setId:id}))};
      const read=probe(gear,[build('lisa')]);
      for (const [who,cast,kind,time] of [['actor',categories[0],trigger,1],['actor',categories.at(-1),trigger,timeMs-1],
        ['actor',categories[0],trigger,timeMs],['actor','plunge',trigger,1],['peer0',categories[0],trigger,1],['actor',categories[0],trigger==='hit'?'action':'hit',1]]) {
        for (const [stat,v] of Object.entries(values)) for(const [category,recipient] of [['normal','actor'],['charged','actor'],['plunge','actor'],['burst','actor'],['normal','peer0']]) {
          const settings={category,recipient,time},baseline=read(stat,settings);
          const active=count===4 && who==='actor' && kind===trigger && categories.includes(cast) && time<timeMs &&
            (id==='maidenbeloved' || recipient==='actor') && (stat!=='damageBonus' || ['normal','charged'].includes(category) || category==='plunge' && id==='desertpavilionchronicle');
          record(id,count,stat,{...settings,who,cast,kind},read(stat,{...settings,events:[event(kind,cast,0,who)]}),baseline+ (active?v:0));
        }
      }
    }
  }
  for (let rank=1;rank<=5;rank++) {
    const b=build('xiangling','balladofthefjords',rank);
    const rate=Number(source[b.weapon.id].metadata['r'+rank].description.match(/元素精通提升([\d.]+)点/)[1]);
    const own=b.weapon.stat==='elementalMastery'?b.weapon.baseStat*b.weapon.statCurve[b.weaponLevel]:0;
    for(const [others,eligible] of [[[],false],[['amber','jean'],false],[['jean','kaeya'],true],[['aether','amber','kaeya'],false]]) {
      record(b.weapon.id,rank,'/buffs/0',{others},probe(b,others.map(id=>build(id)))('elementalMastery'),own+(eligible?rate:0));
    }
    const sword=build('kaeya','azurelight',rank),read=probe(sword,[build('jean')]);
    const rates=[...source.azurelight.metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for(const [energy,time,who] of [[0,1,'actor'],[1,1,'actor'],[0,11999,'actor'],[0,12000,'actor'],[0,1,'peer0']]) {
      const facts={currentEnergy:quantity('energy',energy)},active=who==='actor' && time<12000;
      for(const [stat,bonus] of [['attackPercent',rates[0]+(energy===0?rates[1]:0)],['critDamage',energy===0?rates[2]:0]]) {
        const base=read(stat,{facts,time});
        record('azurelight',rank,stat,{energy,time,who},read(stat,{facts,time,events:[event('action','skill',0,who)]}),base+(active?bonus:0));
      }
    }
    for(const [weapon,actor] of [['snarehook','amber'],['bladeofatonement','noelle'],['echoesoftheheart','lisa'],['emberwell','kaeya']]) {
      const b=build(actor,weapon,rank),text=source[weapon].metadata['r'+rank].description;
      const amounts=[...text.matchAll(/提升([\d.]+)(点|%)/g)].map(m=>Number(m[1])/(m[2]==='点'?1:100));
      for(const full of [false,true]) {
        const read=probe(b,full?[build('aino'),build('flins')]:[build('jean')]);
        for(const [who,kind,reaction,time] of [['actor','hit','vaporize',1],['actor','reaction','stellar-swirl',11999],['actor','reaction','stellar-conduct',1],
          ['actor','hit',undefined,1],['peer0','reaction','stellar-swirl',1],['actor','reaction','stellar-swirl',12000]]) {
          const sourceEvent=event(kind,'normal',0,who,{},false);
          if(reaction)sourceEvent.reactionId=reaction;
          const active=!!reaction && who==='actor' && time<12000, stellar=active && reaction.startsWith('stellar-');
          const entries=[[weapon==='emberwell'?'attackPercent':'elementalMastery','ordinary',active?amounts[0]+(weapon==='snarehook' && full?amounts[1]:0):0]];
          if (weapon==='bladeofatonement') entries.push(['attackPercent','ordinary',stellar?amounts[1]:0]);
          if (weapon==='emberwell' || weapon==='echoesoftheheart') for(const f of ['stellar-swirl','stellar-conduct']) {
            for(const family of [f,'ordinary','lunar-charged']) entries.push(['reaction.'+f+'.damageBonus',family,stellar && family===f?amounts[1]:0]);
          }
          for (const [stat,family,bonus] of entries) {
            const opts={time,family},baseline=read(stat,opts);
            record(weapon,rank,stat,{who,kind,reaction,time,full,family},read(stat,{...opts,events:[sourceEvent]}),baseline+bonus);
          }
        }
      }
    }
    const sunny=build('lisa','sunnymorningsleepin',rank),readSunny=probe(sunny,[build('jean')]);
    const em=[...source[sunny.weapon.id].metadata['r'+rank].description.matchAll(/元素精通提升([\d.]+)点/g)].map(m=>Number(m[1]));
    const reactions=[{...event('reaction','normal',0),reactionId:'swirl'},event('hit','skill',1),event('hit','burst',2)];
    for (const [time,factors] of [[3,[1,1,1]],[6000,[0,1,1]],[9001,[0,0,1]],[30002,[0,0,0]]]) {
      const baseline=readSunny('elementalMastery',{time});
      record(sunny.weapon.id,rank,'/buffs',{time},readSunny('elementalMastery',{time,events:reactions}),baseline+em.reduce((n,v,i)=>n+v*factors[i],0));
    }
  }
  for (const [id,element,rate] of [['lavawalker','pyro',.4],['thundersoother','electro',.4],['tinymiracle','all',.2]]) {
    const set=entities.sets.find(s=>s.id===id);
    for(const count of [1,2]) {
      const gear={...build('kaeya'),sets:[set],theoreticalSetSlots:set.slots.slice(0,count).map(slot=>({slot,setId:id}))};
      const read=probe(gear,[build('lisa')]);
      for(const target of ['physical','anemo','geo','electro','hydro','pyro','cryo','dendro']) for(const recipient of ['actor','peer0']) {
        const value=read('resistance.'+target,{recipient});
        record(id,count,'/effects/0',{target,recipient},value,count===2&&recipient==='actor'&&target!=='physical'&&(element===target||element==='all')?rate:0);
      }
    }
  }
  for (let rank=1;rank<=5;rank++) {
    const flower = 'mailedflower', readFlower = probe(build('noelle',flower,rank),[build('jean')]);
    // The two Mailed Flower observations in kqm-tcl/docs/evidence/equipment/weapons.md cover off-field refresh and the triggering hit.
    const description = source[flower].metadata['r'+rank].description;
    const [,duration,attack,mastery] = description.match(/后的(\d+)秒内，攻击力提升([\d.]+)%，元素精通提升(\d+)点/);
    const end = Number(duration) * 1000;
    const skill = event('hit','skill',0);
    const reaction = {...event('reaction','normal',0),reactionId:'freeze'};
    const both = {...skill,reactionId:'crystallize'};
    const offField = event('hit','skill',end-1,'actor',{},false);
    const unknown = {...skill,subjectFacts:[{subject:{kind:'actor',id:'actor'},values:{onField:{value:null,provenance:'explicit',sourceRefs:[]}}}]};
    const checks = [
      ['skill',[skill],1,true], ['reaction',[reaction],end-1,true], ['both',[both],1,true],
      ['reaction on a normal hit',[{...event('hit','normal',0),reactionId:'freeze'}],1,true],
      ['shield contact',[{...skill,facts:{targetsDamaged:quantity('count',0)}}],1,true],
      ['cast',[event('action','skill',0)],1,false], ['ordinary hit',[event('hit','normal',0)],1,false],
      ['no enemy',[{...skill,targetIds:[]}],1,false], ['other actor',[event('hit','skill',0,'peer0')],1,false],
      ['other reactor',[{...reaction,actorId:'peer0'}],1,false], ['off-field',[offField],end,false],
      ['expired',[skill],end,false], ['off-field keeps previous',[skill,offField],end-1,true],
      ['off-field cannot extend',[skill,offField],end,false], ['holder position missing',[unknown],1,null],
      ['refresh by reaction',[skill,{...reaction,id:'again',timeMs:end-1}],2*end-2,true],
      ['refresh expires',[skill,{...reaction,id:'again',timeMs:end-1}],2*end-1,false],
      ['refresh by skill',[reaction,{...skill,id:'again',timeMs:end-1}],end,true],
      ['effect persists off-field',[skill],1,true],
    ];
    for (const [stat,delta] of [['attackPercent',Number(attack)/100],['elementalMastery',Number(mastery)]]) {
      for (const [scenario,events,time,active] of checks) for (const recipient of ['actor','peer0']) {
        const opts = {recipient,time,...scenario==='effect persists off-field'?{facts:{onField:flag(false)}}:{}};
        const base = readFlower(stat,opts);
        const expected = recipient==='actor' && active===null ? null : base + (recipient==='actor' && active ? delta : 0);
        record(flower,rank,'/buffs/0',{scenario,stat,recipient},readFlower(stat,{...opts,events}),expected);
      }
      for (const queryEvent of [skill,reaction,both]) for (const phase of ['before','after']) {
        const base = readFlower(stat);
        record(flower,rank,'/buffs/0',{stat,phase,kind:queryEvent.kind,reaction:queryEvent.reactionId},
          readFlower(stat,{queryEvent,phase}),base+(phase==='after'?delta:0));
      }
    }
    for (const [id,holder,stat,eligible,element] of [
      ['darkironsword','kaeya','attackPercent',['overloaded','superconduct','stellar-conduct','electro-charged','quicken','aggravate','hyperbloom','lunar-charged'],'electro'],
      ['emeraldorb','lisa','attackPercent',['vaporize','electro-charged','freeze','bloom','lunar-charged','lunar-bloom'],'hydro'],
      ['earthshaker','noelle','damageBonus',['vaporize','melt','overloaded','burning','burgeon'],'pyro']]) {
      const b=build(holder,id,rank),read=probe(b,[build('jean')]);
      const rate=Number(source[id].metadata['r'+rank].description.match(/([\d.]+)%/)[1])/100;
      const until=id==='earthshaker'?8000:12000;
      const branches=[...new Set([...eligible,'spread','shatter','bloom','quicken','burning','superconduct','vaporize'])].map(reaction=>[reaction,undefined]);
      for(const reaction of ['swirl','crystallize']) for(const el of ['pyro','hydro','electro','cryo',undefined]) branches.push([reaction,el]);
      for (const [reaction,el] of branches) {
        const filtered = reaction==='swirl'||reaction==='crystallize'&&id==='earthshaker';
        const active=eligible.includes(reaction)||filtered&&el===element;
        const e={...event('reaction','normal',0),reactionId:reaction,reactionElement:el};
        const opts={category:'skill',time:until-1};
        record(id,rank,'/buffs',{reaction,el,...opts},read(stat,{...opts,events:[e]}),filtered&&!el?null:read(stat,opts)+(active?rate:0));
      }
      for(const [actor,kind,field,time,category,recipient] of [['actor','reaction',false,1,'skill','actor'],['peer0','reaction',true,1,'skill','actor'],
        ['actor','hit',true,2,'skill','actor'],['actor','action',true,1,'skill','actor'],['actor','reaction',true,until,'skill','actor'],
        ['actor','reaction',true,1,'normal','actor'],['actor','reaction',true,1,'skill','peer0']]) {
        const opts={category,time,recipient},e={...event(kind,'normal',0,actor,{},field),reactionId:eligible[0]};
        const active=recipient==='actor'&&time<until&&(kind==='hit'||kind==='reaction')&&(id==='earthshaker'?category==='skill':actor==='actor'&&field);
        const offField=actor==='actor' && !field && id!=='earthshaker';
        record(id,rank,'/buffs',{actor,kind,field,...opts},read(stat,{...opts,events:[e]}),offField?null:read(stat,opts)+(active?rate:0));
        if(offField) for(const confirmed of [false,true]) record(id,rank,'/buffs',{actor,kind,field,confirmed,...opts},
          read(stat,{...opts,events:[{...e,facts:{weaponTriggeredOffField:flag(confirmed)}}]}),read(stat,opts)+(confirmed?rate:0));
      }
    }
    for(const [id,holder,stat,seconds] of [['masterkey','noelle','elementalMastery',12],['serenityscall','kaeya','hpPercent',12],['missivewindspear','xiangling','attackPercent',10]]) {
      const rates=[...source[id].metadata['r'+rank].description.matchAll(/([\d.]+)(%|点)/g)].map(m=>Number(m[1])/(m[2]==='%'?100:1));
      for(const full of [false,true]) {
        const read=probe(build(holder,id,rank),full?[build('flins'),build('aino')]:[build('jean')]);
        for(const [time,owner,kind,field] of [[1,'actor','reaction',true],[seconds*1000-1,'actor','reaction',false],
          [seconds*1000,'actor','reaction',true],[1,'peer0','reaction',true],[1,'actor','action',true],[1,'actor','hit',true]]) {
          const e={...event(kind,'skill',0,owner,{},field),reactionId:'freeze'};
          const active=time<seconds*1000&&owner==='actor'&&kind!=='action'&&(id!=='missivewindspear'||field);
          for(const recipient of ['actor','peer0']) for(const [key,amount] of [[stat,rates[0]+(id!=='missivewindspear'&&full?rates[1]:0)],...id==='missivewindspear'?[['elementalMastery',rates[1]]]:[]]) {
            const offField=recipient==='actor' && owner==='actor' && !field && id==='missivewindspear';
            record(id,rank,'/buffs',{time,owner,kind,field,full,key,recipient},read(key,{time,recipient,events:[e]}),offField?null:read(key,{time,recipient})+(recipient==='actor'&&active?amount:0));
            if(offField) for(const confirmed of [false,true]) record(id,rank,'/buffs',{time,owner,kind,field,full,key,recipient,confirmed},
              read(key,{time,recipient,events:[{...e,facts:{weaponTriggeredOffField:flag(confirmed)}}]}),read(key,{time,recipient})+(confirmed?amount:0));
          }
        }
      }
    }
    for(const [id,holder,stat] of [['tidalshadow','noelle','attackPercent'],['songofstillness','amber','damageBonus']]) {
      const read=probe(build(holder,id,rank),[build('jean')]),rate=Number(source[id].metadata['r'+rank].description.match(/([\d.]+)%/)[1])/100;
      for(const [who,field,fact,value,time] of [['actor',true,'healingReceived',1,1],['actor',false,'healingReceived',500,7999],['actor',true,'healingDone',500,1],
        ['actor',true,'hpRatioChange',.1,1],['peer0',true,'healingReceived',1,1],['actor',true,'healingReceived',0,1],['actor',true,'healingReceived',1000,8000]]){
        const e=event('state-change','normal',0,who,{[fact]:quantity(fact==='hpRatioChange'?'scalar':'hp',value)},field);
        const active=who==='actor'&&fact==='healingReceived'&&value>0&&time<8000;
        for(const recipient of ['actor','peer0']) record(id,rank,'/buffs',{who,field,fact,value,time,recipient},read(stat,{time,recipient,events:[e]}),read(stat,{time,recipient})+(active&&recipient==='actor'?rate:0));
      }
    }
    const moon=source.moonweaversdawn.metadata['r'+rank].description;
    const moonRates=[...moon.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for(const [actor,capacity] of [['keqing',40],['chiori',50],['kaeya',60],['kamisatoayaka',80],['skirk',0]]) {
      const read=probe(build(actor,'moonweaversdawn',rank),[build('jean')]);
      for(const recipient of ['actor','peer0']) for(const category of ['normal','burst','skill']) {
        const opts={recipient,category},eligible=recipient==='actor' && category==='burst';
        record('moonweaversdawn',rank,'/buffs', {actor,capacity,...opts},read('damageBonus',opts),eligible?moonRates[0]+(capacity===0||capacity>60?0:capacity<=40?moonRates[2]:moonRates[1]):0);
      }
    }
    const hook=probe(build('noelle','fruitfulhook',rank),[build('jean')]),red=probe(build('noelle','redhornstonethresher',rank),[build('jean')]);
    const hookRates=[...source.fruitfulhook.metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    const redRates=[...source.redhornstonethresher.metadata['r'+rank].description.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1])/100);
    for(const category of ['normal','charged','plunge','skill','burst'])for(const recipient of ['actor','peer0']) {
      const opts={category,recipient};
      record('redhornstonethresher',rank,'/buffs/1',opts,red('baseDamageBonus',opts),recipient==='actor'&&['normal','charged'].includes(category)?red('defense',opts)*redRates[1]:0);
      record('redhornstonethresher',rank,'/buffs/0',opts,red('defensePercent',opts),recipient==='actor'?redRates[0]:0);
      record('fruitfulhook',rank,'/buffs/0',opts,hook('critRate',opts),.05+(category==='plunge'&&recipient==='actor'?hookRates[0]:0));
      if(category==='normal'&&recipient==='actor') for(const confirmed of [null,false,true]) {
        const e=event('hit','plunge',0,'actor',confirmed===null?{}:{weaponTriggeredOffField:flag(confirmed)},false);
        record('fruitfulhook',rank,'/buffs/1',{...opts,field:false,confirmed},hook('damageBonus',{...opts,events:[e]}),confirmed===null?null:confirmed?hookRates[1]:0);
      }
      for(const [time,who,trigger,kind] of [[1,'actor','plunge','hit'],[9999,'actor','plunge','hit'],[10000,'actor','plunge','hit'],[1,'peer0','plunge','hit'],[1,'actor','normal','hit'],[1,'actor','plunge','action']]) {
        const active=time<10000&&who==='actor'&&trigger==='plunge'&&kind==='hit'&&recipient==='actor'&&['normal','charged','plunge'].includes(category);
        record('fruitfulhook',rank,'/buffs/1',{...opts,time,who,trigger,kind},hook('damageBonus',{...opts,time,events:[event(kind,trigger,0,who)]}),active?hookRates[1]:0);
      }
    }
  }
  return {rows,summary:{equipmentContextCases:rows.length,equipmentContextFailures:rows.filter(r=>r.issue).length}};
}
