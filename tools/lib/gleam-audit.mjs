import {auditBuild,auditHit} from './roster-evaluation.mjs';

const starters={WEAPON_CATALYST:'apprenticesnotes',WEAPON_BOW:'huntersbow',WEAPON_SWORD_ONE_HAND:'dullblade',WEAPON_CLAYMORE:'wastergreatsword',WEAPON_POLE:'beginnersprotector'};
const qty=(unit,value)=>({value:{kind:'quantity',unit,value},provenance:'explicit',sourceRefs:[]});
const yes={value:{kind:'boolean',value:true},provenance:'explicit',sourceRefs:[]};
const lunar=['lunar-bloom','lunar-charged','lunar-crystallize'];

export function auditGleam(entities,engine) {
  const chars=new Map(entities.characters.map(c=>[c.id,c])),weapons=new Map(entities.weapons.map(w=>[w.id,w])),rows=[];
  function build(id,weapon) {const c=chars.get(id);return auditBuild(c,weapons.get(weapon??starters[c.identity.weaponType]));}
  function record(scenario,value,expected) {
    const ok=expected===null?value===null:Number.isFinite(value)&&Math.abs(value-expected)<1e-8;
    rows.push({entity:'public.gleam',field:'/team/lunarReactionBonus',scenario,value,expected,...(ok?{}:{issue:'满辉触发、替换、实时面板或贡献不符'})});
  }
  function prepare(builds) {
    const result=engine.prepareStructuredBuilds(builds.map(([id,build])=>({id,...build?{build}:{element:'geo'}})));
    if(!result.ok)throw Error(JSON.stringify(result.diagnostics));
    return result.team;
  }
  function action(actorId,category,timeMs,order=0) {
    return {id:actorId+'-'+category+'-'+timeMs+'-'+order,actorId,category,kind:'action',timeMs,order,sourceEventIds:[],targetIds:[],facts:{}};
  }
  const queryBuild=build('flins'),ally=build('aino'),t=queryBuild.character.talents[0];
  function probe(team,time,events,{family='lunar-bloom',recipient='actor',inputs={}}={}) {
    const {setup,request}=auditHit(queryBuild.character,t,t.hits[0]);
    setup.events[0].timeMs=time;
    setup.events.push(...events);
    const world=engine.createStructuredCombatContext(team,setup);
    for(const actor of world.actors)Object.assign(actor.inputs,inputs[actor.id]);
    const binding={kind:'attribute',key:{namespace:'builtin',id:'attribute.reaction.lunar.damageBonus',revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}};
    const output=engine.evaluateCombatBindings(team.program,world,{bonus:binding},{...request.frame,factOverrides:[],
      ownerId:recipient,recipientId:recipient,contributorId:null,hit:{skillId:null,hitId:null,element:'dendro',category:null,family,origin:'reaction',reactionId:family}});
    return output.outputs.bonus?.value?.value??null;
  }
  for(const [id,stat,rate] of [['amber','attack',.00009],['lisa','attack',.00009],['kaeya','attack',.00009],['barbara','hp',.000006],
    ['noelle','defense',.0001],['sucrose','elementalMastery',.000225],['collei','elementalMastery',.000225]]){
    const b=build(id),base=stat==='elementalMastery'?0:b.character.attributes.base[stat]*b.character.progression.curves[stat][1]+(stat==='attack'?b.weapon.baseAttack*b.weapon.attackCurve[1]:0);
    const input=stat==='elementalMastery'?stat:'flat'+stat[0].toUpperCase()+stat.slice(1);
    for(const [size,second] of [['full',ally],['first',build('jean')],['unknown',null]]){
      const team=prepare([['actor',queryBuild],['support',b],['second',second]]);
      for(const category of ['skill','burst','normal']) for(const [time,extra] of [[1,100],[19999,100],[20000,100],[1,.36/rate],[1,.36/rate+100]]) {
        const casts=[action('support',category,0)],inputs={support:{[input]:qty(stat,extra)}};
        for(const family of [...lunar,'stellar-swirl','ordinary']) {
          const active=lunar.includes(family)&&category!=='normal'&&time<20000 && size!=='first';
          const bonus=active?size==='unknown'?null:Math.min(.36,(base+extra)*rate):0;
          const result=probe(team,time,casts,{inputs,family});
          record({id,size,category,time,extra,family},result,bonus);
        }
      }
    }
  }
  const ice=build('kaeya','blackclifflongsword'),wind=build('sucrose'),team=prepare([['actor',queryBuild],['second',ally],['ice',ice],['wind',wind]]);
  const atk=ice.character.attributes.base.attack*ice.character.progression.curves.attack[1]+ice.weapon.baseAttack*ice.weapon.attackCurve[1];
  const casts=[action('ice','skill',0),action('actor','burst',25),{id:'victory',actorId:'ice',kind:'hit',timeMs:50,order:0,category:'normal',targetIds:['enemy'],sourceEventIds:[],
    subjectFacts:[{subject:{kind:'actor',id:'ice'},values:{onField:yes}}],facts:{enemyDefeated:yes}},
    action('wind','burst',100),action('ice','burst',200,1),action('wind','skill',200,2)];
  for(const [time,expected] of [[1,atk*.00009],[26,atk*.00009],[50,atk*1.12*.00009],[99,atk*1.12*.00009],[101,.000225],[201,.000225],[20199,.000225],[20200,0]]){
    for(const recipient of ['actor','second','ice','wind'])
      record({time,recipient,case:'后触发者覆盖、实时属性、月兆队员施放排除'},probe(team,time,casts,{recipient,inputs:{wind:{elementalMastery:qty('elementalMastery',1)}}}),expected);
  }
  const reference = ice.character.calculation.bundle.effects.find(effect=>effect.stacking.group==='public.gleam').buff;
  const short = {id:'wind-confirmed',actorId:'wind',kind:'state-change',timeMs:100,order:0,targetIds:[],sourceEventIds:[],facts:{},confirmedBuff:{...reference,remainingMs:2000}};
  const absent = {...yes,value:null};
  for (const [time,expected] of [[99,atk*.00009],[100,.000225],[2099,.000225],[2100,0],[9999,0]]) {
    record({time,case:'短时确认的新实例覆盖旧实例且到期后不恢复'},probe(team,time,[casts[0],short],{inputs:{wind:{elementalMastery:qty('elementalMastery',1)}}}),expected);
  }
  for (const [time,expected] of [[99,null],[101,.000225]]) record({time,case:'前任持有者的未知属性在替换后一同撤销'},
    probe(team,time,[casts[0],casts[3]],{inputs:{ice:{flatAttack:absent},wind:{elementalMastery:qty('elementalMastery',1)}}}),expected);
  record({time:101,case:'当前持有者的未知属性仍然待定'},probe(team,101,[casts[0],casts[3]],{inputs:{wind:{elementalMastery:absent}}}),null);
  return {rows,summary:{gleamCases:rows.length,gleamFailures:rows.filter(r=>r.issue).length}};
}
