import { auditBuild, auditHit, bool, novice, setAuditDefaults } from './roster-audit-settings.mjs';

const sum = value => Object.values(value ?? {}).reduce((a, b) => a + b, 0);
const near = (a,b,tolerance=1e-4) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= tolerance * Math.max(1,Math.abs(a),Math.abs(b));
const directions = { pyro:{melt:{factor:2,aura:'cryo'},vaporize:{factor:1.5,aura:'hydro'}}, hydro:{vaporize:{factor:2,aura:'pyro'}}, cryo:{melt:{factor:1.5,aura:'pyro'}} };
const axes = {attack:['atk','atk_ratio'],hp:['hp','hp_ratio'],defense:['def','def_ratio'],elementalMastery:['em','em_ratio']};

/** Verify only default C0 branch IDs already attached to a reviewed ordinary hit. */
export async function auditMonaAmplificationBatch(monaRows, leylineRows, ordinary, entities, engine) {
  const {api}=await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const targets=new Map(leylineRows.map(row=>[row.id,row]));
  const characters=new Map(entities.characters.map(row=>[row.id,row]));
  const weapons=new Map(entities.weapons.map(row=>[row.id,row]));
  const branches=new Map(monaRows.filter(row=>row.kind==='output-branch' && row.output==='damage' && row.scenario?.id==='default' && row.scenario?.constellation===0 && ['melt','vaporize'].includes(row.branch)).map(row=>[row.parentId+'\0'+row.branch,row]));
  const results=[],mappings=[];
  for(const ordinaryReview of ordinary.mappings ?? []) {
    if(ordinaryReview.disposition!=='matched' || ordinaryReview.leyline?.length!==1) continue;
    const skillId=ordinaryReview.mona.find(id=>id.startsWith('mona:skill:'));
    const hit=targets.get(ordinaryReview.leyline[0].id), character=characters.get(hit?.entity), binding=hit?.binding;
    const weapon=weapons.get(novice[character?.identity?.weaponType]);
    const talent=character?.talents.find(item=>item.id===binding?.skillId), actualHit=talent?.hits.find(item=>item.id===binding?.hitId);
    if(!skillId||!hit||!character||!weapon||!talent||!actualHit) continue;
    for(const [reaction,config] of Object.entries(directions[binding.element] ?? {})) {
      const branch=branches.get(skillId+'\0'+reaction);
      if(!branch) continue;
      const record={id:branch.id,leyline:hit.id,reaction,element:binding.element,aura:config.aura,status:'unresolved',cases:[]};
      results.push(record);
      try {
        for(const level of [1,6,10]) {
          const input=structuredClone(branch.scenario.input);
          input.character.constellation=0;input.character.level=90;input.character.ascend=false;
          for(const slot of [1,2,3]) input.character['skill'+slot]=level-1;
          input.weapon.level=1;input.weapon.ascend=false;input.weapon.refine=1;input.artifacts=[];input.buffs=[];input.enemy=null;
          const analysis=api.CalculatorInterface.get_damage_analysis(input,null);
          if(String(analysis.element).toLowerCase()!==binding.element || !analysis[reaction] || analysis.is_heal || analysis.is_shield) throw new Error('Mona reaction branch unavailable');
          const em=sum(analysis.em), enhancement=analysis[reaction+'_enhance'] ?? {};
          const otherBonus=Object.entries(enhancement).filter(([key])=>key!=='精通').reduce((a,[,v])=>a+v,0);
          const masteryBonus=(25/9)*em/(1400+em);
          if(!near(sum(enhancement),masteryBonus+otherBonus,1e-6)) throw new Error('Mona mastery enhancement differs from independent formula');
          const monaBase=Object.values(axes).reduce((total,[stat,ratio])=>total+sum(analysis[stat])*sum(analysis[ratio]),0)+sum(analysis.extra_damage);
          const monaNormal=monaBase*(1+sum(analysis.bonus))*.5*.9;
          const monaExpected=monaNormal*config.factor*(1+masteryBonus+otherBonus), monaActual=analysis[reaction].non_critical;
          const build={...auditBuild(character,weapon),level:90,ascension:6,talents:{normal:level,skill:level,burst:level}};
          const team=engine.prepareStructuredBuilds([{id:'actor',build}]);if(!team.ok) throw new Error('LeyLine build failed');
          const {setup,request}=auditHit(character,talent,actualHit,90);
          setAuditDefaults(character,request.frame); setAuditDefaults(weapon,request.frame);
          request.frame.factOverrides.push({subject:{kind:'target',id:'enemy'},facts:{['aura.'+config.aura]:bool(true)}});
          const normal=engine.evaluateStructuredHit(team.team,setup,request).totals.all.value?.value;
          request.reactionMode=reaction;
          const evaluated=engine.evaluateStructuredHit(team.team,setup,request);
          const actual=evaluated.totals.all.value?.value;
          const specialized=character.attributes.specialized, promotion=character.progression.promotion[6].specialized;
          const leyEm=specialized==='elementalMastery'?promotion:0;
          const panel=Object.fromEntries(['hp','attack','defense'].map(stat=>[stat,character.attributes.base[stat]*character.progression.curves[stat][90]+character.progression.promotion[6][stat]]));
          panel.attack+=weapon.baseAttack; panel.elementalMastery=leyEm;
          for(const stat of ['hp','attack','defense']) if(specialized===stat+'Percent') panel[stat]*=1+promotion;
          const elementalBonus=specialized===binding.element+'Bonus'?promotion:0;
          const independentNormal=binding.definition.base.reduce((total,term)=>total+panel[term.stat]*talent.parameters.find(item=>item.id===term.parameter).values[level-1],0)*(1+elementalBonus)*.5*.9;
          const expected=independentNormal*config.factor*(1+2.78*leyEm/(1400+leyEm));
          record.cases.push({level,mona:{normal:monaNormal,em,otherBonus,expected:monaExpected,actual:monaActual,panel:Object.fromEntries(Object.entries(axes).map(([key,[stat,ratio]])=>[key,{stat:sum(analysis[stat]),ratio:sum(analysis[ratio])}])),bonus:sum(analysis.bonus)},leyline:{normal,em:leyEm,expected,actual,panel,elementalBonus}});
          if(!near(monaNormal,analysis.normal?.non_critical,1e-8) || !near(monaExpected,monaActual,1e-8)) throw new Error('Mona reaction formula mismatch');
          if(!near(independentNormal,normal,1e-8)||!near(expected,actual,1e-8)) throw new Error('LeyLine reaction formula mismatch or unavailable');
          const rounded={elementalMastery:Math.round(leyEm)};
          for(const stat of ['hp','attack','defense']) {
            const white=character.attributes.base[stat]*character.progression.curves[stat][90]+character.progression.promotion[6][stat];
            rounded[stat]=(Math.round(white)+(stat==='attack'?Math.round(weapon.baseAttack):0))*(specialized===stat+'Percent'?1+promotion:1);
          }
          const reconstructed=Object.entries(axes).every(([stat,[panelKey,ratioKey]])=>{
            const terms=binding.definition.base.filter(term=>term.stat===stat);
            const ratio=terms.reduce((total,term)=>total+talent.parameters.find(item=>item.id===term.parameter).values[level-1],0);
            return (!terms.length || near(sum(analysis[panelKey]),rounded[stat],1e-9)) && Math.abs(sum(analysis[ratioKey])-ratio)<=.000051*Math.max(1,terms.length);
          });
          if(otherBonus!==0 || !near(em,rounded.elementalMastery,1e-9) || !near(sum(analysis.bonus),elementalBonus,1e-9) || !reconstructed || sum(analysis.extra_damage)!==0) throw new Error('Panel differences cannot be reconstructed from integer stats and four-decimal ratios');
        }
        record.status=record.cases.some(item=>item.mona.em!==0)?'different':'matched';
        mappings.push({id:'amplification-batch:'+branch.character+':'+branch.index+':'+reaction,disposition:record.status,mona:[branch.id],leyline:[{id:hit.id,revision:hit.revision}],
          explanation:'C0 默认分支，分别按同一反应方向、目标元素附着、90 级角色、1 级武器及空圣遗物核验；三个天赋等级各自使用面板数值和独立反应公式，逐项重建 Mona 整数面板及四位小数倍率，精通非零时 Mona 采用 25/9、LeyLine 采用 2.78 的精通系数，故分别按各自公式比较。',
          sources:[branch.source.path,hit.source,'tools/lib/mona-amplification-batch.mjs','src/engine/src/calculation/templates-reactions.ts','.references/mona-community/mona_core/src/damage/reaction.rs','tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/reaction-facts.json'],
          comparisons:record.cases.flatMap(item=>[{name:'Mona level '+item.level,expected:item.mona.expected,actual:item.mona.actual,tolerance:Math.max(1e-8,Math.abs(item.mona.expected)*1e-8)},{name:'LeyLine level '+item.level,expected:item.leyline.expected,actual:item.leyline.actual,tolerance:Math.max(1e-8,Math.abs(item.leyline.expected)*1e-8)}])});
      } catch(error) {record.reason=String(error?.message??error);}
    }
  }
  return {rows:results,mappings,summary:{eligible:results.length,reviewed:mappings.length,unresolved:results.length-mappings.length},limitations:['Only C0 default branch IDs of previously reviewed ordinary hits are mapped.','The supplied aura fact and single reaction mode do not prove aura application or event triggering.']};
}
