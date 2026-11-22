import { auditBuild } from './roster-evaluation.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

/** These settings are calculation probes for the two Manekin and their seven elemental variants. */
export async function auditManekin(catalog, engine) {
  const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addFieldChange,addSkillAction,addSkillHit,defaultEnemy}=await loadContentSchema('/src/web/src/domain/real-project.ts');
  const blade=await catalog.get('weapons','dullblade'),peer=auditBuild(await catalog.get('characters','kaeya'),blade),rows=[];
  const mode={crit:'noncritical',reaction:'none'};
  for (const id of catalog.inventory.characters.filter(key=>/^manekin(a)?(-[a-z]+)?$/.test(key))) {
    const c=await catalog.get('characters',id),b={...auditBuild(c,blade),level:60,ascension:4};
    const p=createEmptyProject(),owner=addActorFromBuild(p,b),other=addActorFromBuild(p,peer),[normal,skill,burst]=c.talents;
    const element=c.identity.element;
    p.enemy={...defaultEnemy(),level:60};
    p.enemy.resistances.physical=.55;
    if(skill) p.enemy.resistances[element]=.20;
    const raw=c.attributes.base.attack*c.progression.curves.attack[60]+c.progression.promotion[4].attack+blade.baseAttack*blade.attackCurve[1]+blade.promotion[0];
    const promoted=c.progression.promotion[4].specialized,atk=raw*(c.attributes.specialized==='attackPercent'?1+promoted:1);
    const amount=(ratio,e)=>atk*ratio*.5*(1-p.enemy.resistances[e])*(c.attributes.specialized===e+'Bonus'?1+promoted:1);
    const expected=new Map();
    const hit=(talent,index,time,ratio,e)=>{const key=addSkillHit(p,owner,talent.id,index,time,mode);expected.set(key,amount(ratio,e));return key;};
    function allNormals(time,element) {
      for (const [i,param] of ['param1','param2','param3','param4','param5','param6','param8','param9','param10'].entries())
        hit(normal,i,time,normal.parameters.find(p => p.id === param).values[0],element);
    }
    const normalRatio=normal.parameters.find(v=>v.id==='param1').values[0];
    addFieldChange(p,owner,0,{mode});
    allNormals(0,'physical');
    if(skill) {
      addSkillAction(p,owner,skill.id,0);
      allNormals(0,element);
      hit(skill,0,0,skill.parameters.find(p=>p.id==='param1').values[0],element);
      addFieldChange(p,owner,0,{energy:60});
      addSkillAction(p,owner,burst.id,0);
      const first=burst.parameters.find(v=>v.id==='param1').values[0],entry=burst.parameters.find(v=>v.id==='param2').values[0];
      hit(burst,0,0,first,element);
      for(const [time,ratio] of [[1,entry],[499,0],[500,0],[501,entry]]) {
        const id=hit(burst,1,time,ratio,element);
        if(time===499) p.timeline.find(row=>row.id===id).damage.facts=[{subject:{kind:'event'},values:{'manekin.contactReady':{value:{kind:'boolean',value:true},provenance:'explicit',sourceRefs:[]}}}];
      }
      addFieldChange(p,owner,1200,{energy:15});
      addFieldChange(p,other,1400,{mode});
      hit(burst,2,1400,2,element);
      hit(burst,2,1400,0,element);
      hit(burst,1,1500,0,element);
      addFieldChange(p,owner,6000,{mode});
      hit(normal,0,6001,normalRatio,'physical');
      addSkillAction(p,owner,skill.id,7000);
      addSkillAction(p,owner,skill.id,9999);
      hit(normal,0,10999,normalRatio,element); hit(normal,0,11000,normalRatio,'physical');
      addSkillAction(p,owner,skill.id,11001);
      addSkillAction(p,owner,skill.id,11002);
      hit(normal,0,11002,normalRatio,element);
      addSkillAction(p,owner,burst.id,14999);
      addSkillAction(p,owner,burst.id,15000);
      hit(burst,1,15001,0,element);
      addFieldChange(p,owner,16000,{energy:60});
      addSkillAction(p,owner,burst.id,16000);
      hit(burst,1,23999,entry,element);hit(burst,1,24000,0,element);
      addFieldChange(p,owner,24500,{energy:18});
      addFieldChange(p,other,25000,{mode});addFieldChange(p,owner,27000,{mode});
      addFieldChange(p,owner,27500,{energy:0});
      addFieldChange(p,other,28000,{mode});addFieldChange(p,owner,30000,{mode});
    } else {
      addFieldChange(p,other,1000,{mode});addFieldChange(p,owner,6000,{mode});
    }
    const result=engine.evaluateTimeline(p);
    function record(field,actual,want) {
      const ok=typeof want==='number' ? Number.isFinite(actual) && Math.abs(actual-want)<1e-7 : JSON.stringify(actual)===JSON.stringify(want);
      rows.push({entity:id,field,value:actual,expected:want,...(ok?{}:{issue:'数值、状态或次数不符'})});
    }
    for(const [key,want] of expected) record('hit/'+key,result.points.find(r=>r.id===key)?.value,want);
    const exits=result.plan.timeline.filter(entry=>entry.damage?.hit.hitId===id+'.passive.zone-exit' && result.points.find(p=>p.id===entry.id)?.value>0);
    record('/passives/0/occurrences',exits.map(r=>r.timeMs),skill?[1400]:[]);
    for(const exit of exits)record('/passives/0/exitDamage',result.points.find(r=>r.id===exit.id)?.value,amount(2,element));
    const ticks=(result.combatChanges??[]).filter(r=>r.kind==='passive-energy' && r.timeMs<6000);
    record('/passives/1/energy',ticks.map(r=>[r.timeMs,r.energyGain,r.energyAfter]),skill?[[2400,2,17],[3400,2,19]]:[]);
    const changes = result.combatChanges ?? [];
    record('/talents/1/charges', changes.filter(r=>r.kind==='skill-charge').map(r=>[r.timeMs,r.status,r.chargesAfter]),
      skill ? [[0,'applied',1],[7000,'applied',0],[9999,'excluded',0],[11001,'applied',0],[11002,'excluded',0]] : []);
    record('/talents/2/costAndCooldown', changes.filter(r=>r.kind.startsWith('burst-')).map(r=>[r.timeMs,r.kind,r.status,r.energyAfter ?? r.cooldownAfterMs]),
      skill ? [[0,'burst-energy','applied',0],[14999,'burst-cooldown','excluded',1],[15000,'burst-energy','excluded',19],[16000,'burst-energy','applied',0]] : []);
    record('/passives/1/threshold',changes.filter(r=>r.kind==='passive-energy' && r.timeMs>=6000).map(r=>[r.timeMs,r.recipient,r.energyAfter]),skill?[[29000,owner,2]]:[]);
    if (skill) {
      const locked = {...p, candidate:{...p.candidate,actors:p.candidate.actors.map(m=>m.id===owner?{...m,build:{...b,level:20,ascension:0}}:m)}};
      const low=engine.evaluateTimeline(locked);
      const actualExit=low.points.find(point=>point.id===exits[0]?.id);
      record('/passives/0/locked',actualExit?.value,0);
      record('/passives/1/locked',low.combatChanges?.filter(r=>r.kind==='passive-energy').length ?? 0,0);
    }
    record('/passives/2/wardrobe',/从已有的装扮搭配方案中，随机选择一套进行切换/.test(c.passives[2].description),true);
    record('/passives/2/combatGrants',engine.grantedBuildEffects(b).filter(g=>g.passive?.id===c.passives[2].id).length,0);
  }
  return {rows,summary:{manekinCases:rows.length,manekinFailures:rows.filter(r=>r.issue).length}};
}
