import {auditBuild} from './roster-evaluation.mjs';
import {loadContentSchema} from './load-content-schema.mjs';
import {readContentSource} from './content-source.mjs';

export async function auditResonanceParticles(catalog,engine) {
  const {assembleCalculationLibrary}=await loadContentSchema('/src/game-data/src/calculation-library.mjs');
  const local=name=>readContentSource(new URL('../../src/game-data/data/calculation/'+name+'.json',import.meta.url));
  const library=assembleCalculationLibrary(local('common'),local('reactions'),[]);
  const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addFieldChange,addParticlePickup,addReactionObservation,addSkillHit,addTransformativeReaction,defaultEnemy}
    =await loadContentSchema('/src/web/src/domain/real-project.ts');
  const builds=await Promise.all([['lisa','favoniuscodex'],['fischl','huntersbow'],['sucrose','apprenticesnotes'],['kaeya','dullblade'],['noelle','wastergreatsword']]
    .map(async([c,w])=>auditBuild(await catalog.get('characters',c),await catalog.get('weapons',w))));
  const rows=[],effect='resonance.electro.particles',mode={crit:'noncritical',reaction:'none'};
  const quantity=(unit,value)=>({value:{kind:'quantity',unit,value},provenance:'explicit',sourceRefs:[]});
  for (const [team,qualified] of [[[0,1,2,3],true],[[0,1,2],false],[[0,2,3,4],false]]) {
    const project=createEmptyProject();
    project.enemy=defaultEnemy();
    const members=team.map(i=>addActorFromBuild(project,builds[i]));
    for(const actor of members) addFieldChange(project,actor,0,{energy:0});
    addFieldChange(project,members[0],0,{mode});
    const scenarios=[];
    const record=(label,source,expected)=>scenarios.push({label,source,expected:qualified?expected:null});
    const hit=(time,trigger,targets=1)=>addSkillHit(project,members[0],'lisa.normal',0,time,{
      crit:'critical',reaction:{type:'aggravate',trigger},
      facts:[{subject:{kind:'event'},values:{targetsDamaged:quantity('count',targets),triggerRoll:quantity('scalar',0)}}],
    });
    const dual=hit(1,'record-owner');
    record('同一暴击触发超激化和西风',dual,'applied');
    const clear=addParticlePickup(project,members[1],dual,2);
    const colored=qualified ? addParticlePickup(project,members[0],dual,3,effect) : undefined;
    record('另一队员在冷却最后一毫秒触发',addReactionObservation(project,members[1],5000,'quicken'),'excluded');
    record('另一队员在冷却结束时原激化',addReactionObservation(project,members[1],5001,'quicken'),'applied');
    let time=11000;
    for(const [reaction,element,applies] of [
      ['superconduct','cryo',true],['electro-charged','electro',true],['overloaded','pyro',true],['hyperbloom','dendro',true],
      ['swirl','electro',true],['swirl','hydro',false],['swirl','cryo',false],['swirl','pyro',false],['bloom','dendro',false],
      ['burgeon','dendro',false],['burning','pyro',false],['shatter','physical',false],
    ]){
      record(reaction+' · '+element,addTransformativeReaction(project,members[2],reaction,element,time,library),applies?'applied':null);
      time+=5100;
    }
    for(const reaction of ['freeze','crystallize'])record(reaction,addReactionObservation(project,members[0],time,reaction),null);
    record('没有命中目标',hit(time+1,'record-owner',0),'excluded');
    record('触发归属未知',hit(time+2,null),'unknown');
    record('可能与先前反应共用冷却',addReactionObservation(project,members[0],time+3,'quicken'),'unknown');
    record('离开不确定的冷却窗口',addReactionObservation(project,members[0],time+5003,'quicken'),'applied');
    const changes=engine.evaluateTimeline(project).combatChanges??[];
    function check(scenario,value,expected){
      const match=typeof value==='number' && typeof expected==='number' ? Math.abs(value-expected)<1e-8 : value===expected;
      rows.push({entity:'resonance.electro',field:'/particles',team,scenario,value,expected,...(match?{}:{issue:'共鸣触发、拾取或回能不符'})});
    }
    for(const {label,source,expected} of scenarios){
      const found=changes.filter(c=>c.source===source && c.effect===effect);
      check(label,found[0]?.status??null,expected);
      check(label+' · 数量',found.filter(c=>c.status==='applied').reduce((n,c)=>n+c.particles,0),expected==='applied'?1:0);
    }
    for(const [i,actor] of members.entries()){
      const er=i===0?1+builds[0].weapon.baseStat*builds[0].weapon.statCurve[1]:1;
      const share=(10-team.length)/10;
      check('无元素微粒 · '+team[i],changes.find(c=>c.source===clear && c.recipient===actor)?.energyGain,6*er*(i===1?1:share));
      if(colored){
        const gain=changes.find(c=>c.source===colored && c.recipient===actor);
        check('雷微粒 · '+team[i],gain?.energyGain,(i<2?3:1)*er*(i===0?1:share));
        check('两组微粒分别结算 · '+team[i],gain?.energyAfter,6*er*(i===1?1:share)+(i<2?3:1)*er*(i===0?1:share));
      }
    }
  }
  return {rows,summary:{resonanceParticleCases:rows.length,resonanceParticleFailures:rows.filter(r=>r.issue).length}};
}
