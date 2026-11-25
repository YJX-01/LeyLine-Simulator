import { readFileSync } from 'node:fs';
import { auditBuild, auditHit, bool, number, setAuditDefaults } from './roster-audit-settings.mjs';

/** Probe one single-target set event. Sequence gates remain separately modelled. */
export async function auditMonaArtifactEvents(leylineRows, entities, engine) {
  const {equipmentDamageEvents} = await import('../../.references/mona-community/beta-data/equipment-damage-events.mjs');
  const character = entities.characters.find(row => row.id === 'kaeya');
  const weapon = entities.weapons.find(row => row.id === 'dullblade');
  const rows=[];
  const evaluator = readFileSync(new URL('../../.references/mona-community/beta-data/team-dps-evaluator.mjs', import.meta.url), 'utf8');
  const echoRatio = /echoesRatio=m\.mul\((\.[0-9]+),echoesProbability\?\?0\)/.exec(evaluator);
  for(const [id,mona] of [['oceanhuedclam','OceanHuedClam'],['songofdayspast','SongOfDaysPast'],['echoesofanoffering','EchoesOfAnOffering']]) {
    const set = entities.sets.find(row => row.id === id);
    const build = { ...auditBuild(character, weapon, [set]), theoreticalSetSlots: set.slots.slice(0, 4).map(slot => ({ slot, setId: id })) };
    const team=engine.prepareStructuredBuilds([{id:'actor',build}]);
    if(!team.ok){rows.push({id,status:'build-error',diagnostics:team.diagnostics});continue;}
    const talent=character.talents[0], hit=talent.hits[0], {setup,request}=auditHit(character,talent,hit);
    setAuditDefaults(character,request.frame);setAuditDefaults(weapon,request.frame);setAuditDefaults(set,request.frame);
    const event={role:0,onField:true,category:'normal',time:7,rootOrder:1,order:1};
    const heal={role:0,time:0,rootOrder:0,order:0,amount:10000};
    const profiles=[{character:{name:'Kaeya'},weapon:{name:'DullBlade',refine:1}}];
    const built=[[...Array(4)].map(()=>({set_name:mona}))];
    const rotation={events:[event],heals:[heal],duration:20,endHit:'include',lastCast:()=>-Infinity};
    const result=equipmentDamageEvents(profiles,built,rotation,h=>h.amount,{enemy_count:1,damage_scope:'all'});
    let expected,actual, target;
    if(id==='oceanhuedclam'){
      const proc=result.procs[0];target=leylineRows.find(x=>x.entity===id&&x.subject==='equipment-hit');
      request.hit={definition:{group:'sets',namespace:set.namespace,id:set.id,revision:set.revision},hitId:target.binding.hitId};
      request.frame.facts['oceanhuedclam.healing']=number('hp',10000);
      const query=setup.events.find(e=>e.id===request.frame.eventId);query.hitId=target.binding.hitId;delete query.skillId;delete query.category;
      actual=engine.evaluateStructuredHit(team.team,setup,request).totals.all.value?.value ?? null;
      expected=proc.fixed*.9;
    } else {
      target=leylineRows.find(x=>x.entity===id&&x.subject==='modifier'&&x.binding.modifier.target==='attribute.baseDamageBonus');
      if(id==='songofdayspast') request.frame.factOverrides[0].facts['songofdayspast.recordedHealing']=number('hp',10000);
      else request.frame.factOverrides[0].facts['echoesofanoffering.valley-riteActive']=bool(true);
      const context=engine.createStructuredCombatContext(team.team,setup);
      const frame={...request.frame,ownerId:'actor',recipientId:'actor',contributorId:null,phase:'before',hit:{skillId:talent.id,hitId:hit.id,category:'normal',element:'physical',family:'ordinary',origin:'talent',reactionId:null}};
      const attr=key=>engine.evaluateCombatBindings(team.team.program,context,{value:{kind:'attribute',key:{namespace:'builtin',id:'attribute.'+key,revision:'1'},actor:{role:'recipient'},at:{kind:'current',phase:'same'}}},frame).outputs.value?.value?.value;
      actual=attr('baseDamageBonus');
      expected=id==='songofdayspast' ? result.flat.get(1) : echoRatio && result.echoes.get(1) > 0 ? Number(echoRatio[1])*attr('attack') : null;
    }
    rows.push({id,mona,target:target?.id,revision:target?.revision,expected,actual,status:Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<1e-7?'match':'mismatch',monaOutput:{flat:[...result.flat],procs:result.procs,echoes:[...result.echoes]}});
  }
  const mappings=rows.filter(row=>row.status==='match' && row.target && row.revision).map(row=>({
    id:'equipment-event-'+row.id, disposition:'different', mona:['mona:equipment-event:'+row.mona],
    leyline:[{id:row.target,revision:row.revision}],
    explanation:'The tested single-target value agrees for the specified input. Mona models event timing, counters and probability; LeyLine evaluates the supplied recorded state or trigger, so the complete event sequences are not established as equivalent.',
    sources:['.references/mona-community/beta-data/equipment-damage-events.mjs',
      '.references/mona-community/beta-data/equipment-healing-damage-rules.mjs',
      '.references/mona-community/beta-data/team-dps-evaluator.mjs',
      'src/game-data/data/artifact-sets/'+row.id+'.json', 'tools/lib/mona-equipment-artifacts.mjs'],
    comparisons:[{name:'single-target output',expected:row.expected,actual:row.actual,tolerance:1e-7}],
  }));
  return {rows,mappings};
}
