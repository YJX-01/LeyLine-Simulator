// Independent probes select the event and its beneficiary from the adopted local description.
export function auditSceneTrigger(definition, text, b, peer, engine, auditHit) {
  const teamwide = text.includes('队伍中所有角色') || text.includes('队伍内所有角色');
  const seconds = Number(text.match(/持续([\d.]+)秒|后的([\d.]+)秒内/)?.slice(1).find(Boolean));
  const max = Number(text.match(/至多叠加(\d+)层/)?.[1] ?? 1), interval = Number(text.match(/每([\d.]+)秒至多触发/)?.[1] ?? 0)*1000;
  if (!seconds) throw Error(definition.id+' 的本地时长缺失');
  const prepared = engine.prepareStructuredBuilds([{id:'actor',build:b},{id:'peer',build:peer}],[],[
    {definition,startMs:100,endMs:30000},{definition,startMs:32000,endMs:60000}]);
  if (!prepared.ok) throw Error(JSON.stringify(prepared.diagnostics));
  const labels = {critDamage:'暴击伤害',attackPercent:'攻击力',anemoBonus:'风元素伤害',defensePercent:'防御力',damageBonus:'伤害','reaction.lunar.damageBonus':'月绽放伤害'};
  const expectedStats = Object.fromEntries(definition.buffs.flatMap(buff=>buff.modifiers).map(mod=>{
    const stat = mod.target.slice(10), label = labels[stat];
    if (stat === 'elementalMastery') {
      const points = text.match(/元素精通提升(\d+)点/);
      if (!points) throw Error(definition.id+' 缺少元素精通数值');
      return [stat, Number(points[1])];
    }
    const percent = text.match(new RegExp(label+'提升([\\d.]+)%')) ?? text.match(new RegExp('获得([\\d.]+)%(?:所有元素伤害与物理伤害|'+label+')加成'));
    if (!percent) throw Error(definition.id+' 缺少 '+stat+' 的本地数值');
    return [stat,Number(percent[1])/100];
  }));
  const related = text.includes('草元素相关反应') ? 'dendro' : text.includes('冰元素相关反应') ? 'cryo' : null;
  const trigger = related ?? (text.includes('下落攻击命中') ? 'plunge' : text.includes('扩散反应') ? 'swirl' : text.includes('月结晶') ? 'lunar'
    : text.includes('角色的当前生命') ? 'hpRatioChange' : text.includes('生命之契') ? 'bondOfLifeChange' : text.includes('夜魂迸发') ? 'nightsoulBurst' : 'nightsoulChange');
  const mode = trigger==='plunge' ? 'hit' : related || ['swirl','lunar'].includes(trigger) ? 'reaction' : 'state-change';
  const fact = value=>({value:typeof value==='boolean'?{kind:'boolean',value}:{kind:'quantity',unit:trigger==='bondOfLifeChange'?'hp':'scalar',value},provenance:'explicit',sourceRefs:[]});
  function event(timeMs,order,actorId='actor',eligible=true) {
    const entry={id:'source-'+order,kind:mode,actorId,targetIds:mode==='state-change'?[]:['enemy'],timeMs,order,sourceEventIds:[],facts:{}};
    if (trigger==='plunge') entry.category=eligible?'plunge':'charged';
    else if (related) entry.reactionId=eligible?(related==='cryo'?'freeze':'bloom'):'vaporize';
    else if (trigger==='swirl'||trigger==='lunar') entry.reactionId=eligible?(trigger==='swirl'?'swirl':'lunar-charged'):'overloaded';
    else entry.facts[trigger]=fact(trigger==='nightsoulBurst'?eligible:eligible?-.01:0);
    return entry;
  }
  const talent=b.character.talents[0], h=talent.hits[0], rows=[];
  const bindings=Object.fromEntries(Object.keys(expectedStats).map(stat=>[stat,{kind:'attribute',key:{namespace:'builtin',id:'attribute.'+stat,revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}}]));
  function read(sources,time,order,recipient) {
    const {setup,request}=auditHit(b.character,talent,h);
    const query=setup.events[0];query.timeMs=time;query.order=order;query.kind='capture';delete query.category;
    setup.events.unshift(...sources);
    const context=engine.createStructuredCombatContext(prepared.team,setup);
    return engine.evaluateCombatBindings(prepared.team.program,context,bindings,{...request.frame,ownerId:recipient,recipientId:recipient,contributorId:null,hit:null}).outputs;
  }
  const baselines=new Map(['actor','peer'].map(actor=>[actor,read([],100,100,actor)]));
  function check(label,sources,time,count,recipient='actor',order=100) {
    const values=read(sources,time,order,recipient), base=baselines.get(recipient);
    for(const [stat,rate] of Object.entries(expectedStats)) {
      const delta=values[stat]?.state==='known'&&base[stat]?.state==='known'?values[stat].value.value-base[stat].value.value:null;
      const expected=rate*count;
      rows.push({entity:definition.id,field:'/buffs/0',target:stat,probe:label,time,recipient,active:delta,expectedDelta:expected,
        ...(delta===null||Math.abs(delta-expected)>1e-8?{issue:'场景贡献或到期不符'}:{})});
    }
  }
  const first=event(100,2);
  check('进入前触发',[event(99,2)],101,0);
  check('同刻触发前',[first],100,0,'actor',1);
  check('同刻触发后',[first],100,1);
  check('其他队员接受',[first],101,teamwide?1:0,'peer');
  check('其他队员触发',[event(100,2,'peer')],101,teamwide?1:0);
  check('触发条件不符',[event(100,2,'actor',false)],101,0);
  check('已排除的事件',[{...first,occurred:false}],101,0);
  check('到期前',[first],100+seconds*1000-1,1);
  check('恰好到期',[first],100+seconds*1000,0);
  check('重新进入',[event(29999,2)],32001,0);
  if(mode==='hit') check('命中未造成伤害',[{...first,facts:{targetsDamaged:{value:{kind:'quantity',unit:'count',value:0},provenance:'explicit',sourceRefs:[]}}}],101,0);
  if(mode==='state-change'&&trigger!=='nightsoulBurst') check('数值增加',[{...first,facts:{[trigger]:fact(.1)}}],101,1);
  if(trigger==='lunar') for(const reactionId of ['lunar-crystallize','lunar-bloom']) check(reactionId,[{...first,reactionId}],101,1);
  if (related) {
    const cryo = ['freeze','melt','superconduct','stellar-conduct','stellar-swirl'];
    const dendro = ['bloom','burning','quicken','spread','aggravate','burgeon','hyperbloom','lunar-bloom'];
    for (const reactionId of [...cryo,...dendro,'vaporize','shatter','overloaded','electro-charged','lunar-charged','lunar-crystallize']) {
      check(reactionId,[{...first,reactionId}],101,Number((related==='cryo'?cryo:dendro).includes(reactionId)));
    }
    for (const reactionId of ['swirl','crystallize']) for (const reactionElement of ['cryo','pyro','hydro','electro']) {
      check(reactionId+'-'+reactionElement,[{...first,reactionId,reactionElement}],101,Number(related==='cryo'&&reactionElement==='cryo'));
    }
    for (const reactionId of ['swirl','crystallize']) {
      if (related==='dendro') check(reactionId+'无元素',[{...first,reactionId}],101,0);
      else {
        const value=read([{...first,reactionId}],101,100,'peer').elementalMastery;
        rows.push({entity:definition.id,field:'/buffs/0',target:'elementalMastery',probe:reactionId+'无元素',recipient:'peer',
          state:value?.state,expectedState:'unknown',...(value?.state!=='unknown'?{issue:'场景贡献或到期不符'}:{})});
      }
    }
    // Only the accepted second event extends a single, teamwide window.
    const refresh = interval || 1;
    check('其他队员刷新至新到期',[first,event(100+refresh,3,'peer')],100+seconds*1000,1,'peer');
    check('刷新后到期',[first,event(100+refresh,3,'peer')],100+seconds*1000+refresh,0,'peer');
    if (interval) check('间隔内队友触发不延长',[first,event(100+interval-1,3,'peer')],100+seconds*1000,0,'peer');
  }
  if(interval) {
    check('触发间隔内',[first,event(100+interval-1,3)],100+interval,1);
    check('触发间隔边界',[first,event(100+interval,3)],100+interval,Math.min(max,2));
  }
  if(max>1) {
    const step=interval||1, events=Array.from({length:max+2},(_,i)=>event(100+i*step,i+1));
    check('超出层数上限',events,events.at(-1).timeMs,max);
    check('各层独立到期',events,100+seconds*1000+(max-2)*step,Math.min(max,3));
  }
  return rows;
}
