import { auditBuild } from './roster-evaluation.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const white={WEAPON_SWORD_ONE_HAND:'dullblade',WEAPON_BOW:'huntersbow',WEAPON_CATALYST:'apprenticesnotes',WEAPON_POLE:'beginnersprotector',WEAPON_CLAYMORE:'wastergreatsword'};

export async function auditCastTiming(entities,engine) {
  const { createEmptyProject }=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild,addSkillAction,addSkillHit,addFieldChange,defaultEnemy }=await loadContentSchema('/src/web/src/domain/real-project.ts');
  const weapons=new Map(entities.weapons.map(w=>[w.id,w])),rows=[];
  function record(entity,field,scenario,value,expected) {
    const matches=typeof expected==='number' ? Number.isFinite(value) && Math.abs(value-expected)<1e-8 : value===expected;
    rows.push({entity,field,scenario,value,expected,...(matches?{}:{issue:'施放状态、伤害或可用次数不符'})});
  }
  for (const c of entities.characters) {
    const base=auditBuild(c,weapons.get(white[c.identity.weaponType]));
    const gate=c.constellations.find(v=>v.extraSkillCharge);
    for (const rank of gate?[gate.rank-1,gate.rank]:[0]) {
      const p=createEmptyProject(),actor=addActorFromBuild(p,{...base,constellation:rank});
      const expected=[];
      function add(t,timeMs) {
        const order=p.timeline.length, id='cast-'+order;
        p.timeline.push({id,timeMs,order,actor,kind:'action',skillId:t.id,definition:p.candidate.actors[0].character,
          ...(t.category==='burst'?{facts:{energySpent:{value:{kind:'quantity',unit:'energy',value:0},sourceRefs:[],provenance:'explicit'}}}:{})});
        return id;
      }
      for(const [i,t] of c.talents.entries()) {
        if(!t.cooldownParameter)continue;
        const detail=t.details.find(d=>d.label==='冷却时间') ?? t.details.find(d=>d.template.includes('{'+t.cooldownParameter+':'));
        const param=detail?.template.match(/\{(param\d+):/u)?.[1];
        const seconds=t.parameters.find(v=>v.id===param)?.values[0];
        if (!Number.isFinite(seconds)) throw Error(t.id+' 的本地冷却时间缺少数值');
        const reduction = c.id === 'amber' && rank >= 4 && t.category === 'skill' ? .2 : 0;
        const duration=Math.round(seconds*1000*(1-reduction)), field='/talents/'+i+'/cooldownParameter';
        const first=add(t,0);
        expected.push([field,first,'首次施放',true]);
        if(t.category==='burst'){
          expected.push([field,add(t,duration-1),'冷却结束前一毫秒',false],[field,add(t,duration),'恰好冷却完成',true]);
        }else{
          expected.push([field,first,'剩余冷却',duration]);
          if(t.skillCharges || gate && rank >= gate.rank) {
            const baseCount=Number(t.description.match(/拥有(\d+)次可使用次数/)?.[1] ?? (t.description.includes('2次')?2:1));
            const count=baseCount+Number(Boolean(gate && rank>=gate.rank));
            const cf=gate?'/constellations/'+(gate.rank-1):'/talents/'+i+'/skillCharges';
            for(let n=1;n<count;n++)expected.push([cf,add(t,0),'使用第'+(n+1)+'次充能',true]);
            expected.push([cf,add(t,duration-1),'充能耗尽',false],[cf,add(t,duration),'首个充能恢复',true]);
          } else {
            expected.push([field,add(t,duration-1),'普通战技冷却结束前一毫秒',false],[field,add(t,duration),'普通战技恰好冷却完成',true]);
          }
        }
      }
      if (!expected.length)continue;
      const context=engine.projectBuffContext(p),events=new Map(context?.events.map(e=>[e.id,e]));
      for(const [field,id,scenario,want] of expected){
        const e=events.get(id);
        const actual=!e?null:scenario==='剩余冷却'?e.derivedStates?.after[actor]?.skillCooldownRemaining?.value?.value ?? null:e.occurred!==false;
        record(c.id,field,scenario+' · C'+rank,actual,want);
      }
    }
  }
  const ayato=entities.characters.find(c=>c.id==='kamisatoayato'),lisa=entities.characters.find(c=>c.id==='lisa');
  for(const ascension of [0,1])for(const constellation of [0,1,2])for(const leave of [false,true]) {
    const p=createEmptyProject(),owner=addActorFromBuild(p,{...auditBuild(ayato,weapons.get('dullblade')),ascension,constellation,level:ascension?20:1});
    const peer=addActorFromBuild(p,auditBuild(lisa,weapons.get('apprenticesnotes'))),initial=ascension?2:0,cap=constellation===2?5:4;
    const start=addSkillAction(p,owner,'kamisatoayato.skill',0),field='/passives/0',cf='/constellations/1',opts={crit:'noncritical',reaction:'none'};
    const expected=[[start,field,'after',initial]];
    for(const [time,count] of [[1,initial],[50,initial+1],[100,initial+1],[101,initial+1]]){
      expected.push([addSkillHit(p,owner,'kamisatoayato.skill',0,time,opts),field,'before',count]);
    }
    const shadow=addSkillHit(p,owner,'kamisatoayato.skill',3,120,opts),filled=ascension?cap:initial+2;
    expected.push([shadow,field,'after',filled],[shadow,cf,'after',filled]);
    if(leave)addFieldChange(p,peer,130,{mode:opts});
    for(const [time,count] of [[201,leave?0:filled],[401,leave?0:Math.min(cap,filled+1)],[5999,leave?0:Math.min(cap,filled+2)],[6000,0]]){
      expected.push([addSkillHit(p,owner,'kamisatoayato.skill',0,time,opts),cf,'before',count]);
    }
    const events=new Map(engine.projectBuffContext(p)?.events.map(e=>[e.id,e]));
    for(const [id,pointer,phase,want] of expected) record(ayato.id,pointer,{ascension,constellation,leave,id,phase},events.get(id)?.derivedStates?.[phase][owner]?.namisen?.value?.value??null,want);
  }
  for (const ascension of [3,4]) for (const start of [0,37,39,40,41]) for (const leaveAt of [1000,3001]) {
    const p=createEmptyProject(),owner=addActorFromBuild(p,{...auditBuild(ayato,weapons.get('dullblade')),ascension,level:ascension===3?50:60});
    const peer=addActorFromBuild(p,auditBuild(lisa,weapons.get('apprenticesnotes'))),mode={crit:'noncritical',reaction:'none'};
    addFieldChange(p,owner,0,{energy:start});
    addFieldChange(p,peer,0,{mode});
    addFieldChange(p,owner,leaveAt,{mode});
    addFieldChange(p,peer,5000,{mode});
    addFieldChange(p,owner,6001,{mode});
    const rows=engine.evaluateTimeline(p).combatChanges?.filter(r=>r.kind==='passive-energy')??[];
    let energy=start;
    const expected=new Map();
    for (const time of [1000,2000,3000,6000]) {
      if(ascension===4 && (time<leaveAt||time===6000) && energy<40) expected.set(time,energy+=2);
    }
    record(ayato.id,'/passives/1',{ascension,start,leaveAt,measure:'ticks'},rows.length,expected.size);
    for(const [time,after] of expected) {
      const change=rows.find(r=>r.timeMs===time && r.recipient===owner && r.actor===owner);
      record(ayato.id,'/passives/1',{ascension,start,leaveAt,time},change?.energyAfter??null,after);
    }
  }
  const c6='kamisatoayato.c6.shunsuiken',field='/talents/1/castWindow/followUp',skill=ayato.talents.find(t=>t.category==='skill');
  const extraIndex=skill.hits.findIndex(h=>h.id===c6);
  for(const constellation of [5,6]) for(const recorded of [0,1,2,3]) for(const health of [.5,.5001]) {
    const p=createEmptyProject(),weapon=weapons.get('dullblade'),b={...auditBuild(ayato,weapon),constellation};
    const owner=addActorFromBuild(p,b);
    p.enemy=defaultEnemy();p.enemy.level=1;p.enemy.resistances.hydro=.1;
    const opts={crit:'noncritical',reaction:'none',facts:[{subject:{kind:'target',id:'target'},values:{targetHpRatio:{value:{kind:'quantity',unit:'scalar',value:health},provenance:'explicit',sourceRefs:[]}}}]};
    addSkillAction(p,owner,skill.id,0);
    addSkillHit(p,owner,skill.id,3,1,opts);
    const source=addSkillHit(p,owner,skill.id,0,50,opts);
    addSkillHit(p,owner,skill.id,1,70,opts);
    const extras=[];
    if(constellation===6) for(let i=0;i<recorded;i++) {
      const id=addSkillHit(p,owner,skill.id,extraIndex,100+i*150,opts);
      p.timeline.find(row=>row.id===id).sourceEventIds=[source];
      extras.push(id);
    }
    const result=engine.evaluateTimeline(p),missing=constellation===6 && recorded<2;
    record(ayato.id,field,{constellation,recorded,health,outcome:'缺少时刻'},result.diagnostics.some(d=>d.path==='timeline.'+source+'.followUp'),missing);
    record(ayato.id,field,{constellation,recorded,health,outcome:'总计已知'},Number.isFinite(result.totalValue),!missing);
    if(missing)record(ayato.id,field,{constellation,recorded,health,outcome:'保留已知小计'},result.knownSubtotal,result.points.reduce((sum,p)=>sum+(p.value??0),0));
    const damage=(ayato.attributes.base.attack+weapon.baseAttack)*4.5*(health<=.5?1.4:1)*.45;
    for(const [i,id] of extras.entries()) record(ayato.id,field,{constellation,recorded,health,ordinal:i+1},result.points.find(p=>p.id===id)?.value,i<2?damage:0);
  }
  {
    const p=createEmptyProject(),weapon=weapons.get('dullblade'),owner=addActorFromBuild(p,{...auditBuild(ayato,weapon),constellation:6});
    p.enemy=defaultEnemy();p.enemy.level=1;p.enemy.resistances.hydro=.1;
    const value=(kind,value,unit)=>({value:{kind,value,...unit?{unit}:{}},provenance:'explicit',sourceRefs:[]}),target={subject:{kind:'target',id:'target'},values:{targetHpRatio:value('quantity',1,'scalar')}};
    const hit=(index,time,values={},source)=>{
      const id=addSkillHit(p,owner,skill.id,index,time,{crit:'noncritical',reaction:'none',facts:[target,{subject:{kind:'event'},values}]});
      if(source)p.timeline.find(r=>r.id===id).sourceEventIds=[source];
      return id;
    };
    const ready={'kamisatoayato.extraSlash':value('boolean',true)},damage=(ayato.attributes.base.attack+weapon.baseAttack)*4.5*.45;
    addSkillAction(p,owner,skill.id,0);
    const premature=hit(extraIndex,1,ready);
    const miss=hit(0,5,{targetsDamaged:value('quantity',0,'count')});
    const trigger=hit(1,20),wrongSource=hit(extraIndex,21,ready,miss);
    const one=hit(extraIndex,40,ready,trigger),two=hit(extraIndex,40,ready,trigger);
    addSkillAction(p,owner,skill.id,300); // This cast is still on cooldown.
    hit(2,350);
    const third=hit(extraIndex,400,ready,trigger);
    addSkillAction(p,owner,skill.id,12000);
    const next=hit(2,12010),old=hit(extraIndex,12011,ready,trigger);
    const nextOne=hit(extraIndex,12012,ready,next),nextTwo=hit(extraIndex,12013,ready,next);
    const result=engine.evaluateTimeline(p);
    for(const [id,expected] of [[premature,0],[wrongSource,0],[one,damage],[two,damage],[third,0],[old,0],[nextOne,damage],[nextTwo,damage]]) {
      record(ayato.id,field,{source:'独立施放及关联命中',id},result.points.find(row=>row.id===id)?.value,expected);
    }
    record(ayato.id,field,'两次有效施放的四个追加命中均已记录',result.diagnostics.filter(d=>d.path.endsWith('.followUp')).length,0);
  }
  return {rows,summary:{castTimingCases:rows.length,castTimingFailures:rows.filter(r=>r.issue).length},
    verified:[...new Set(rows.filter(r=>(r.field.startsWith('/constellations/')||r.field.startsWith('/passives/'))&&!rows.some(o=>o.entity===r.entity&&o.field===r.field&&o.issue)).map(r=>r.entity+r.field))]};
}
