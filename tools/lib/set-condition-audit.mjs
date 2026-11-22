import { auditBuild, auditHit } from './roster-evaluation.mjs';
import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const users = [
  ['kaeya', 'dullblade'], ['noelle', 'wastergreatsword'], ['xiangling', 'beginnersprotector'],
  ['amber', 'huntersbow'], ['lisa', 'apprenticesnotes'],
];
const flag = value => ({ value: { kind: 'boolean', value }, provenance: 'explicit', sourceRefs: [] });

export function auditSetConditions(entities, engine) {
  const rows = [];
  const equip = (id, weapon, set, count) => ({
    ...auditBuild(entities.characters.find(c => c.id === id), entities.weapons.find(w => w.id === weapon), [set]),
    theoreticalSetSlots: set.slots.slice(0, count).map(slot => ({ slot, setId: set.id })),
  });
  function prepare(builds) {
    const result = engine.prepareStructuredBuilds(builds.map((build, i) => ({ id: i === 0 ? 'actor' : 'support', build })));
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.team;
  }
  function value(team, setup, request) {
    return engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value ?? null;
  }
  function record(entity, settings, actual, expected) {
    rows.push({ entity, ...settings, actual, expected, ...((expected === null ? actual !== null : !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-7)
      ? { issue: '套装数值或生效条件不符' } : {}) });
  }
  for (const id of ['gladiatorsfinale', 'wandererstroupe']) {
    const set = entities.sets.find(s => s.id === id);
    for (const [actor, weapon] of users) {
      const before = equip(actor, weapon, set, 3), after = equip(actor, weapon, set, 4);
      const three = prepare([before]), four = prepare([after]);
      const talent = before.character.talents[0];
      for (const category of ['normal', 'charged', 'plunge']) {
        const hit = talent.hits.find(h => h.category === category);
        const { setup, request } = auditHit(before.character, talent, hit);
        const base = value(three, setup, request);
        const active = id === 'gladiatorsfinale' ? ['kaeya','noelle','xiangling'].includes(actor) && category === 'normal'
          : ['amber','lisa'].includes(actor) && category === 'charged';
        record(id, { actor, hit: hit.id, category, threePieces: base }, value(four, setup, request), base === null ? null : base * (active ? 1.35 : 1));
      }
    }
  }
  const ice = entities.sets.find(s => s.id === 'blizzardstrayer');
  const iceBuild = equip('kaeya', 'dullblade', ice, 4), iceTeam = prepare([iceBuild]);
  const normal = iceBuild.character.talents[0], strike = normal.hits[0];
  for (const [cryo, frozen, afterImpact] of [[false,false,false], [true,false,false], [false,true,false], [true,true,false], [false,false,true]]) {
    const { setup, request } = auditHit(iceBuild.character, normal, strike);
    setup.targets[0].facts = { 'aura.cryo': flag(cryo), 'aura.frozen': flag(frozen) };
    setup.targets.push({ ...setup.targets[0], id: 'elsewhere', facts: { 'aura.cryo': flag(!cryo), 'aura.frozen': flag(!frozen) } });
    if (afterImpact) setup.stateFrames = [{ id: 'freeze', subject: { kind: 'target', id: 'enemy' }, eventId: 'hit', phase: 'after',
      facts: { 'aura.frozen': flag(true) } }];
    const base = value(iceTeam, setup, request);
    const critRate = .05 + (cryo || frozen ? .2 : 0) + (frozen ? .2 : 0);
    record(ice.id, { cryo, frozen, afterImpact, noncritical: base }, value(iceTeam, setup, { ...request, critMode: 'expected' }),
      base === null ? null : base * (1 + critRate * .5));
  }
  const forest = entities.sets.find(s => s.id === 'deepwoodmemories');
  const dealer = equip('collei', 'huntersbow', forest, 4), peer = equip('aether-dendro', 'dullblade', forest, 4);
  const team = prepare([dealer, peer]), skill = dealer.character.talents[1], damage = skill.hits[0];
  const neutral = auditHit(dealer.character, skill, damage), base = value(team, neutral.setup, neutral.request);
  for (const [category, target, time, refresh, reduced] of [
    ['skill','enemy',1,false,true], ['burst','enemy',7999,false,true], ['skill','enemy',8000,false,false],
    ['normal','enemy',1,false,false], ['skill','elsewhere',1,false,false], ['skill','enemy',8100,true,true],
    ['skill','enemy',9000,true,false], ['burst','enemy',1001,true,true],
  ]) {
    const { setup, request } = auditHit(dealer.character, skill, damage);
    setup.events[0].timeMs = time;
    setup.targets.push({ ...setup.targets[0], id: 'elsewhere' });
    const trigger = { id: 'impact', kind: 'hit', actorId: 'actor', category, targetIds: [target], timeMs: 0, order: 0, sourceEventIds: [], facts: {} };
    setup.events.push(trigger);
    if (refresh) setup.events.push({ ...trigger, id: 'off-field-impact', actorId: 'support', timeMs: 1000,
      subjectFacts: [{ subject: { kind: 'actor', id: 'support' }, values: { onField: flag(false) } }] });
    record(forest.id, { category, target, time, refresh, baseline: base }, value(team, setup, request), base === null ? null : base * (reduced ? 1.1 / .9 : 1));
  }
  function stats(members,holder) {
    const prepared=engine.prepareStructuredBuilds(members);
    if(!prepared.ok)throw Error(JSON.stringify(prepared.diagnostics));
    const first=holder.character.talents[0];
    return (key,events=[],time=100,recipient='actor',category='normal')=>{
      const {setup,request}=auditHit(holder.character,first,first.hits[0]);
      Object.assign(setup.events[0],{kind:'capture',timeMs:time,order:100});
      setup.events.unshift(...events);
      const ctx=engine.createStructuredCombatContext(prepared.team,setup);
      const binding={kind:'attribute',key:{namespace:'builtin',id:'attribute.'+key,revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}};
      const character=members.find(member=>member.id===recipient).build.character;
      const talent=character.talents.find(skill=>skill.hits.some(hit=>hit.category===category));
      const hit=talent.hits.find(hit=>hit.category===category);
      const frame={...request.frame,ownerId:recipient,recipientId:recipient,contributorId:null,
        hit:{skillId:talent.id,hitId:hit.id,category,element:hit.element,family:'ordinary',origin:'talent',reactionId:null}};
      return engine.evaluateCombatBindings(prepared.team.program,ctx,{value:binding},frame).outputs.value?.value?.value??null;
    };
  }
  const amount=(unit,value)=>({value:{kind:'quantity',unit,value},provenance:'explicit',sourceRefs:[]});
  const ward=entities.sets.find(s=>s.id==='defenderswill');
  const elements=['pyro','hydro','cryo','electro','anemo','geo','dendro','physical'];
  for (const pieces of [3,4]) for (const party of [[],['cryo','cryo'],['pyro','anemo','geo'],['dendro','electro','hydro'],[null,'pyro']]) {
    const actor=equip('kaeya','dullblade',ward,pieces);
    const members=[{id:'actor',build:actor},...party.map((element,i)=>({id:'peer'+i,...element?{element}:{}}))];
    const read=stats(members,actor);
    const resonance=party.length===3 && new Set(['cryo',...party]).size===4 ? .15 : 0;
    for(const element of elements) {
      const exists=element==='cryo'||party.includes(element);
      const expected=pieces<4||element==='physical' ? resonance : exists ? resonance+.3 : party.includes(null) ? null : resonance;
      record(ward.id,{pieces,party,element},read('resistance.'+element),expected);
    }
  }
  {
    const actor=equip('kaeya','dullblade',ward,4),peer=equip('noelle','wastergreatsword',ward,0);
    const read=stats([{id:'actor',build:actor},{id:'peer',build:peer}],actor);
    for(const element of elements) record(ward.id,{recipient:'peer',element},read('resistance.'+element,[],1,'peer'),0);
  }
  const tenacity=entities.sets.find(s=>s.id==='tenacityofthemillelith');
  const event=(id,kind,actorId,timeMs,category,facts={},targetIds=['enemy'])=>({id,kind,actorId,timeMs,order:1,category,targetIds,sourceEventIds:[],facts});
  for(const pieces of [3,4]) {
    const actor=equip('kaeya','dullblade',tenacity,pieces),support=equip('noelle','wastergreatsword',tenacity,4);
    const read=stats([{id:'actor',build:actor},{id:'support',build:support}],actor);
    const blocked=event('shield-impact','hit','actor',0,'skill',{targetsDamaged:amount('count',0)});
    blocked.subjectFacts=[{subject:{kind:'actor',id:'actor'},values:{onField:flag(false)}}];
    const ally={...blocked,id:'ally',actorId:'support',timeMs:1000}, fresh={...blocked,id:'refresh',timeMs:500};
    for(const [events,time,eligible] of [
      [[blocked],1,pieces===4],[[blocked],2999,pieces===4],[[blocked],3000,false],
      [[{...blocked,category:'burst'}],1,false],[[{...blocked,targetIds:[]}],1,false],[[{...blocked,occurred:false}],1,false],
      [[blocked,{...fresh,timeMs:499}],3000,false],[[blocked,fresh],3499,pieces===4],[[blocked,fresh],3500,false],
      [[blocked,ally],1001,true],[[blocked,ally],3999,true],[[blocked,ally],4000,false],
    ]) for(const recipient of ['actor','support']) for(const [key,rate] of [['attackPercent',.2],['shieldStrength',.3]]) {
      const base=read(key,[],time,recipient);
      record(tenacity.id,{pieces,recipient,key,time,sources:events.map(e=>e.id)},read(key,events,time,recipient),base+(eligible?rate:0));
    }
  }
  const glow=entities.sets.find(s=>s.id==='vourukashasglow');
  for(const pieces of [3,4]) {
    const actor=equip('kaeya','dullblade',glow,pieces),peer=equip('noelle','wastergreatsword',glow,0);
    const read=stats([{id:'actor',build:actor},{id:'peer',build:peer}],actor);
    const damage=Array.from({length:6},(_,i)=>({...event('damage-'+i,'state-change','actor',1000*i,undefined,{damageTaken:amount('hp',20)},[]),
      subjectFacts:[{subject:{kind:'actor',id:'actor'},values:{onField:flag(false)}}]}));
    const drain=event('hp-cost','state-change','actor',2,undefined,{hpRatioChange:amount('scalar',-.2)},[]);
    for(const [events,time,stacks] of [[[],1,0],[[drain],3,0],[[{...damage[0],actorId:'peer'}],1,0],
      [[{...damage[0],facts:{damageTaken:amount('hp',0)}}],1,0],[[{...damage[0],occurred:false}],1,0],
      [damage,1,1],[damage,4999,5],[damage,5001,5],[damage,6000,4],[damage,9999,1],[damage,10000,0]]) {
      for(const recipient of ['actor','peer']) for(const category of ['normal','charged','skill','burst']) {
        const expected=recipient==='actor' && pieces===4 && ['skill','burst'].includes(category) ? .1*(1+.8*stacks) : 0;
        record(glow.id,{pieces,recipient,category,time,stacks,sources:events.map(e=>e.id)},read('damageBonus',events,time,recipient,category),expected);
      }
    }
  }
  return { rows, summary: { setConditionScenarios: rows.length, setConditionFailures: rows.filter(row => row.issue).length } };
}

export async function auditHealingWindows(catalog, engine, onCase) {
  const { oceanHuedClam: source } = readContentSource(new URL('../data/sources/catalog/combat-lifecycle.json', import.meta.url));
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addCombatObservation, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const set = await catalog.get('sets', source.entity);
  const builds = await Promise.all(source.roles.map(async (role, index) =>
    auditBuild(await catalog.get('characters', role), await catalog.get('weapons', index ? 'apprenticesnotes' : 'dullblade'), [set])));
  const equip = (index, pieces) => ({ ...builds[index],
    theoreticalSetSlots: set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id })) });
  const duration = source.collectionMs, cooldown = source.creationCooldownPerHolderMs;
  const rows = [];
  // Analytic boundary cases from the documented Qiqi/Kokomi handover and the 30,000 healing cap.
  for (const first of [0, 1]) for (const pieces of [3, 4]) {
    for (const next of [1, duration - 1, duration, duration + 1, cooldown - 1, cooldown]) {
      const project = createEmptyProject();
      project.enemy = defaultEnemy();
      project.enemy.resistances.physical = 0.1;
      const creator = addActorFromBuild(project, equip(first, 4));
      const other = addActorFromBuild(project, equip(1 - first, pieces));
      addCombatObservation(project, creator, 0, 'healingDone', 15000);
      addCombatObservation(project, creator, duration - 2, 'healingDone', 22500);
      addCombatObservation(project, other, next, 'healingDone', 7500);
      addCombatObservation(project, creator, cooldown - 1, 'healingDone', 1500);
      const expected = [{ owner: source.roles[first], value: 24300 }];
      if (pieces === 4 && next >= duration) expected.push({ owner: source.roles[1 - first], value: 6075 });
      const actual = engine.evaluateTimeline(project).points.map(point => ({
        owner: point.formula.definition === creator + '-real-damage' ? source.roles[first]
          : point.formula.definition === other + '-real-damage' ? source.roles[1 - first] : null,
        value: point.value,
      }));
      const correct = actual.length === expected.length && actual.every((point, index) =>
        point.owner === expected[index].owner && point.value !== null && Math.abs(point.value - expected[index].value) < 1e-8);
      rows.push({ entity: source.entity, field: '/effects/1/hits/0/accumulate', pieces: 4,
        first: source.roles[first], otherPieces: pieces, next, actual, expected, ...correct ? {} : { issue: '泡沫创建者、个数或伤害不符' } });
      if (onCase) onCase(project, expected.map((point, i) => ({ actor: i === 0 ? creator : other, value: point.value })));
    }
  }
  return { rows, summary: { setHealingScenarios: rows.length, setHealingFailures: rows.filter(row => row.issue).length } };
}
