import { auditBuild } from './roster-evaluation.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { readContentSource } from './content-source.mjs';

const material=readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json',import.meta.url));
export async function auditAuraDurations(entities,engine) {
  const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addAuraObservation,addSkillHit}=await loadContentSchema('/src/web/src/domain/real-project.ts');
  const weapon={WEAPON_SWORD_ONE_HAND:'dullblade',WEAPON_BOW:'huntersbow',WEAPON_CATALYST:'apprenticesnotes',WEAPON_POLE:'beginnersprotector',WEAPON_CLAYMORE:'wastergreatsword'};
  const build=id=>{const c=entities.characters.find(c=>c.id===id);return auditBuild(c,entities.weapons.find(w=>w.id===weapon[c.identity.weaponType]));};
  const rows=[];
  for (const [setId,element,team,ally,second] of [
    ['prayersforillumination','pyro','hydro','barbara','xingqiu'],['prayersfordestiny','hydro','electro','lisa','razor'],
    ['prayerstospringtime','cryo','pyro','amber','diluc'],['prayersforwisdom','electro','cryo','kaeya','rosaria'],
  ]) {
    const set=entities.sets.find(s=>s.id===setId), rate=Number(material[setId].effect1Pc.match(/减少(\d+)%/)[1])/100;
    for(const wearing of [false,true]) for(const count of [1,2]) {
      const p=createEmptyProject(),b=build('noelle');
      const actor=addActorFromBuild(p,wearing?{...b,sets:[set],theoreticalSetSlots:[{slot:'circlet',setId}]}:b);
      const peer=addActorFromBuild(p,build('sucrose'));
      addActorFromBuild(p,build(ally));addActorFromBuild(p,build(count===2?second:'ningguang'));
      const other=element==='pyro'?'hydro':'pyro';
      const source=addAuraObservation(p,actor,0,{element,baseDurationMs:10000});
      const peerSource=addAuraObservation(p,peer,0,{element,baseDurationMs:10000});
      const opposite=addAuraObservation(p,actor,0,{element:other,baseDurationMs:10000});
      const length=Math.round(10000*(1-(wearing?rate:0)-(count===2?.4:0)));
      const anchors=new Map();
      const anchor=(timeMs,id)=>anchors.set(id,addSkillHit(p,actor,'noelle.normal',0,timeMs,{crit:'noncritical',reaction:'none'}));
      anchor(length-1,'last');anchor(length,'end');
      const clear=addAuraObservation(p,actor,length+1,{element:other,baseDurationMs:0});
      anchor(length+2,'cleared');
      const changes=engine.evaluateTimeline(p).combatChanges??[];
      const events=new Map(engine.projectBuffContext(p).events.map(e=>[e.id,e]));
      function check(scenario,value,expected){
        rows.push({entity:setId,field:'/effects/0',resonance:'resonance.'+team,wearing,count,scenario,value,expected,...(value===expected?{}:{issue:'元素附着对象、减时或到期不符'})});
      }
      const duration=id=>changes.find(r=>r.source===id&&r.kind==='aura-duration')?.durationMs;
      const active=(id,key,phase='before')=>events.get(anchors.get(id)??id)?.derivedStates?.[phase][actor]?.['aura.'+key]?.value?.value;
      check('持有者持续时间',duration(source),length);
      check('队友仅享受共鸣',duration(peerSource),count===2?6000:10000);
      check('其他元素持续时间',duration(opposite),10000);
      check('到期前一毫秒',active('last',element),true);
      check('到期时结束',active('end',element),false);
      check('手工清除',duration(clear),0);
      check('清除后',active('cleared',other),false);
      check('尚未施加的附着',active(source,element),undefined);
      check('施加后',active(source,element,'after'),true);
    }
  }
  return {rows,summary:{auraDurationCases:rows.length,auraDurationFailures:rows.filter(r=>r.issue).length}};
}
