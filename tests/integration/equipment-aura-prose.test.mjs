import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { auditEquipmentAuraCases, makeEquipmentAuraProseProofs } from '../../tools/lib/equipment-aura-prose.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { rosterEquipmentEvaluation } from '../../tools/lib/roster-equipment-evaluation.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { auditBuild, auditHit, bool, number, setGateFacts } from '../../tools/lib/roster-audit-settings.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';

test('Peak Patrol snapshots the second stack defense for an independent fifteen-second party window', async () => {
  const catalog = await createRuntimeCatalog({characters:['xilonen','kaeya'],weapons:['peakpatrolsong','dullblade'],sets:[],actions:[]});
  const { evaluateTimeline } = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addCombatObservation, addFieldChange, addSkillHit, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  for (const refinement of [1,5]) {
    const project = createEmptyProject(); project.enemy = defaultEnemy();
    const build = auditBuild(await catalog.get('characters','xilonen'),await catalog.get('weapons','peakpatrolsong'));
    const owner = addActorFromBuild(project, {...build,level:70,ascension:4,refinement});
    const ally = addActorFromBuild(project,auditBuild(await catalog.get('characters','kaeya'),await catalog.get('weapons','dullblade')));
    const mode = {crit:'noncritical',reaction:'none'}; addFieldChange(project,owner,0,{mode});
    const hit = (time,index) => addSkillHit(project,owner,'xilonen.normal',index,time,{...mode,
      facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]});
    const probe = time => addSkillHit(project,ally,'kaeya.skill',0,time,mode);
    const base=probe(6999),first=hit(7000,0),early=hit(7099,0);
    const second=hit(7400,1),active=probe(7401);
    addCombatObservation(project,owner,8000,'nightsoulBurst',true);
    const changed=probe(8001),afterPersonal=probe(13401),expired=probe(22400);
    const run=evaluateTimeline(project), value=id=>run.points.find(point=>point.id===id).value;
    const secondDefense=run.points.find(point=>point.id===second).real?.panel.stats.defense;
    const firstDefense=run.points.find(point=>point.id===first).real?.panel.stats.defense;
    const perStack = refinement === 1 ? .08 : .16;
    const partyBonus=Math.min(refinement === 1 ? .256 : .512, (2 * secondDefense - firstDefense) * perStack / 1000);
    assert.ok(Number.isFinite(value(active)),JSON.stringify(run.diagnostics));
    assert.ok(Math.abs(value(active)/value(base)-(1+partyBonus))<1e-8,JSON.stringify({partyBonus,base:value(base),active:value(active),secondDefense}));
    assert.equal(value(changed),value(active));
    assert.equal(value(afterPersonal),value(active));
    assert.equal(value(expired),value(base));
    assert.ok(first);
    const refresh = structuredClone(project);
    addSkillHit(refresh,owner,'xilonen.normal',0,8100,{...mode,
      facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]});
    const renewed = addSkillHit(refresh,ally,'kaeya.skill',0,8101,mode), renewedEnd = addSkillHit(refresh,ally,'kaeya.skill',0,23100,mode);
    const refreshed = evaluateTimeline(refresh), read = id => refreshed.points.find(point=>point.id===id).value;
    assert.ok(read(renewed)>value(active));
    assert.equal(read(renewedEnd),value(base));
    const manual = structuredClone(project);
    manual.timeline = manual.timeline.filter(row => row.id !== first && row.id !== early && row.id !== second);
    addSkillHit(manual,ally,'kaeya.normal',0,7000,{...mode,
      facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]});
    addSkillHit(manual,ally,'kaeya.normal',0,7400,{...mode,
      facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]});
    assert.equal(evaluateTimeline(manual).points.find(point=>point.id===active).value,value(base));
    manual.timeline.find(row => row.id === active).damage.facts = [{subject:{kind:'actor',id:owner},
      values:{'peakpatrolsong.ode-teamActive':bool(true)}}];
    const manualValue = evaluateTimeline(manual).points.find(point=>point.id===active).value;
    assert.ok(Math.abs(manualValue / value(base) - (1 + firstDefense * perStack / 1000)) < 1e-8);
    manual.timeline.find(row=>row.id===active).damage.facts[0].values['peakpatrolsong.ode-teamActive'].value = null;
    assert.equal(evaluateTimeline(manual).points.find(point=>point.id===active).value,null);
    const shield = structuredClone(project);
    shield.timeline.find(row=>row.id===second).damage.facts[0].values.targetsDamaged = number('count',0);
    assert.equal(evaluateTimeline(shield).points.find(point=>point.id===active).value,null);
    const tied = structuredClone(project), tiedHit = tied.timeline.find(row=>row.id===second), tiedQuery = tied.timeline.find(row=>row.id===active);
    tiedQuery.timeMs = tiedHit.timeMs; tiedQuery.order = tiedHit.order;
    assert.equal(evaluateTimeline(tied).points.find(point=>point.id===active).value,null);
    const edge = structuredClone(project);
    edge.timeline.find(row=>row.id===second).timeMs=7100;
    edge.timeline.find(row=>row.id===active).timeMs=7101;
    assert.equal(evaluateTimeline(edge).points.find(point=>point.id===active).value,value(active));
    const charged = structuredClone(project);
    const chargedIndex = build.character.talents.find(talent => talent.id === 'xilonen.normal').hits.findIndex(hit => hit.category === 'charged');
    addSkillHit(charged,owner,'xilonen.normal',chargedIndex,7200,{...mode,
      facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]});
    const notFull = addSkillHit(charged,ally,'kaeya.skill',0,7201,mode);
    assert.equal(evaluateTimeline(charged).points.find(point=>point.id===notFull).value,value(base));
  }
});

test('Key of Khaj-Nisut tracks shared skill stacks and the party mastery window', async () => {
  const catalog = await createRuntimeCatalog({characters:['nilou','kaeya'],weapons:['keyofkhajnisut','dullblade'],sets:[],actions:[]});
  const { evaluateTimeline } = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addFieldChange, addSkillHit, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const project = createEmptyProject(); project.enemy = defaultEnemy();
  const owner = addActorFromBuild(project, auditBuild(await catalog.get('characters','nilou'),await catalog.get('weapons','keyofkhajnisut')));
  const ally = addActorFromBuild(project, auditBuild(await catalog.get('characters','kaeya'),await catalog.get('weapons','dullblade')));
  const mode = {crit:'noncritical',reaction:'none'};
  addFieldChange(project, owner, 0, {mode});
  const hit = (time, index) => addSkillHit(project, owner, 'nilou.skill', index, time, {...mode,
    facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]});
  const probe = (time, actor = owner) => addSkillHit(project, actor, actor === owner ? 'nilou.normal' : 'kaeya.normal', 0, time, mode);
  const initial = probe(1), empty = probe(20999), first = hit(21000,0), one = probe(21001);
  hit(21299,1); const second = hit(21300,2), two = probe(21301);
  const third = hit(21600,4), full = probe(21601), team = probe(21602,ally);
  addFieldChange(project, ally, 22000, {mode});
  const off = hit(23000,0), retained = probe(23001);
  addFieldChange(project, owner, 40000, {mode});
  const refreshed = hit(40001,0), extended = probe(41601), expired = probe(60001);
  const run = evaluateTimeline(project);
  const em = id => run.points.find(point=>point.id===id).real?.panel.stats.elementalMastery;
  const hp = run.points.find(point=>point.id===full).real?.panel.stats.hp;
  assert.equal(em(initial), null);
  assert.equal(em(empty), 0);
  assert.ok(Math.abs(em(one)-hp*.0012)<1e-8);
  assert.ok(Math.abs(em(two)-hp*.0024)<1e-8);
  assert.ok(Math.abs(em(full)-hp*.0056)<1e-8);
  assert.ok(Math.abs(em(team)-hp*.002)<1e-8);
  assert.equal(em(retained),em(full));
  assert.equal(em(extended),em(full));
  assert.equal(em(expired),0);
  assert.ok([first,second,third,off,refreshed].every(Boolean));
  const shield = structuredClone(project), facts = shield.timeline.find(row=>row.id===third).damage.facts[0].values;
  facts.targetsDamaged = number('count',0);
  assert.equal(evaluateTimeline(shield).points.find(point=>point.id===full).real?.panel.stats.elementalMastery, null);
  facts.targetsHit = number('count',0);
  assert.ok(Math.abs(evaluateTimeline(shield).points.find(point=>point.id===full).real?.panel.stats.elementalMastery - hp*.0024)<1e-8);
  const manual = structuredClone(project);
  manual.timeline.find(row=>row.id===full).damage.facts = [{subject:{kind:'actor',id:owner},values:{
    'keyofkhajnisut.grandHymnLayers':number('count',0), 'keyofkhajnisut.grand-hymn-teamActive':bool(true),
  }}];
  assert.ok(Math.abs(evaluateTimeline(manual).points.find(point=>point.id===full).real?.panel.stats.elementalMastery-hp*.002)<1e-8);
  manual.timeline.find(row=>row.id===full).damage.facts[0].values['keyofkhajnisut.grandHymnLayers'].value = null;
  assert.equal(evaluateTimeline(manual).points.find(point=>point.id===full).real?.panel.stats.elementalMastery, null);
  const tied = structuredClone(project), source = tied.timeline.find(row=>row.id===third), query = tied.timeline.find(row=>row.id===full);
  query.timeMs = source.timeMs; query.order = source.order;
  assert.equal(evaluateTimeline(tied).points.find(point=>point.id===full).real?.panel.stats.elementalMastery, null);
});

test('target-aura weapon prose requires every refinement, target branch and recipient exclusion', async () => {
  const [schemas, engine, { combatObservationUnits }] = await Promise.all([
    loadContentSchema(), loadContentSchema('/src/engine/src/index.ts'), loadContentSchema('/src/schema/src/calculation/event.ts'),
  ]);
  const read = name => readCalculationData('src/game-data/data/' + name + '.json');
  const characters = ['amber', 'kaeya', 'lisa', 'noelle', 'xiangling', 'jean'].map(id => read('characters/' + id));
  const weaponIds = ['bloodtaintedgreatsword', 'coolsteel', 'dragonsbane', 'lionsroar', 'magicguide', 'rainslasher', 'ravenbow'];
  const weapons = [...weaponIds, 'dullblade'].map(id => read('weapons/' + id));
  const compiled = engine.compileCalculation(assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'),
    [...characters, ...weapons]));
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  const entities = { characters: characters.map(linker.character), weapons: weapons.map(linker.weapon), sets: [] };
  const equipment = rosterEquipmentEvaluation(entities, engine, combatObservationUnits);
  const equipmentAuraCases = auditEquipmentAuraCases(entities, engine);
  assert.deepEqual(equipmentAuraCases.rows.filter(row => row.issue).slice(0, 2), []);
  assert.equal(equipmentAuraCases.resolved.length, weaponIds.length);
  const prove = results => makeEquipmentAuraProseProofs(entities, { equipment, equipmentAuraCases, ...results });
  const proof = prove();
  for (const weapon of weaponIds) {
    const original = equipment.rows.find(row => row.entity === weapon && row.refinement === 1).description;
    const { whole, parts } = proof(weapon, '/buffs', original);
    assert.equal(whole.length, 1, weapon);
    assert.equal(whole[0].field, '/buffs/0/modifiers/0');
    assert.equal(whole[0].cases, 75);
    assert.equal(whole[0].refs.filter(ref => ref.endsWith('/description')).length, 5);
    assert.deepEqual(parts, []);
  }

  const sentence = '对处于水元素或冰元素影响下的敌人，造成的伤害提高12%';
  const missing = { whole: [], parts: [] };
  assert.deepEqual(proof('coolsteel', '/buffs', sentence.replace('冰元素', '雷元素')), missing);
  assert.deepEqual(proof('coolsteel', '/buffs/0', sentence), missing);
  const missingRefinement = { rows: equipment.rows.filter(row => row.entity !== 'coolsteel' || row.refinement !== 5) };
  assert.deepEqual(prove({ equipment: missingRefinement })('coolsteel', '/buffs', sentence), missing);

  for (const missingBranch of [
    row => row.settings.left === false && row.settings.right === true,
    row => row.settings.left === null && row.settings.right === false,
    row => row.settings.recipient === 'peer0',
  ]) {
    const equipmentAuraCasesWithoutBranch = { rows: equipmentAuraCases.rows.filter(row =>
      row.entity !== 'coolsteel' || row.rank !== 5 || !missingBranch(row)) };
    assert.deepEqual(prove({ equipmentAuraCases: equipmentAuraCasesWithoutBranch })('coolsteel', '/buffs', sentence), missing);
  }
});

test('recorded enemy aura controls Lions Roar and Dragon Bane on the current hit', async () => {
  const [catalog,engine]=await Promise.all([createRuntimeCatalog(),loadContentSchema('/src/engine/src/index.ts')]);
  const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addSkillHit,addAuraObservation,defaultEnemy}=await loadContentSchema('/src/web/src/domain/real-project.ts');
  for(const [characterId,weaponId,second] of [['keqing','lionsroar','electro'],['xiangling','dragonsbane','hydro']]) for(const refinement of [1,5]) {
    const character=await catalog.get('characters',characterId),weapon=await catalog.get('weapons',weaponId),p=createEmptyProject(); p.enemy=defaultEnemy();
    const actor=addActorFromBuild(p,{...auditBuild(character,weapon),refinement}),talent=character.talents.find(t=>t.category==='skill');
    const hit=(time,pyro,other)=>addSkillHit(p,actor,talent.id,0,time,{crit:'noncritical',reaction:'none',facts:[{subject:{kind:'target',id:'target'},values:{
      'aura.pyro':pyro===null?{value:null,provenance:'explicit',sourceRefs:[]}:bool(pyro),
      ['aura.'+second]:other===null?{value:null,provenance:'explicit',sourceRefs:[]}:bool(other)}}]});
    addAuraObservation(p,actor,0,{element:'pyro',baseDurationMs:10000});
    const ids=[hit(1,false,false),hit(2,true,false),hit(3,false,true),hit(4,true,true),hit(5,null,false)];
    const r=engine.evaluateTimeline(p),value=id=>r.points.find(point=>point.id===id)?.value,base=value(ids[0]);
    const bonus=.2+(refinement-1)*.04;
    assert.ok(base>0,JSON.stringify(r.diagnostics));
    for(const id of ids.slice(1,4)) assert.ok(Math.abs(value(id)/base-(1+bonus))<1e-9);
    assert.equal(value(ids[4]),null);
  }
});

test('equipment contribution probe reads trigger windows without overriding them with inactive defaults', async () => {
  const [catalog,engine,events]=await Promise.all([createRuntimeCatalog(),loadContentSchema('/src/engine/src/index.ts'),loadContentSchema('/src/schema/src/calculation/event.ts')]);
  const entities={characters:await Promise.all(['aether','lisa','kaeya'].map(id=>catalog.get('characters',id))),
    weapons:await Promise.all(['angelosheptades','athameartis','dullblade','apprenticesnotes'].map(id=>catalog.get('weapons',id))),sets:[]};
  const report=rosterEquipmentEvaluation(entities,engine,events.combatObservationUnits);
  for (const [id, expected] of [['athameartis.daybreak-owner',[.2,.4]],['athameartis.daybreak-team',[.16,.32]],
    ['athameartis.daybreak-owner-hexerei',[.15,.3]],['athameartis.daybreak-team-hexerei',[.12,.24]]]) {
    for (const [index,rank] of [1,5].entries()) {
      const entry=report.rows.find(row=>row.entity==='athameartis' && row.refinement===rank).modifiers.find(row=>row.id===id);
      assert.ok(Math.abs(entry.amount-expected[index])<1e-9,JSON.stringify(entry));
      assert.equal(entry.excluded,true);
      assert.equal(entry.expired,true);
    }
  }
  for (const rank of [1,5]) for (const id of ['angelosheptades.leading-light','angelosheptades.leading-light-backstage']) {
    const entry=report.rows.find(row=>row.entity==='angelosheptades' && row.refinement===rank).modifiers.find(row=>row.id===id);
    assert.ok(entry.amount>0,JSON.stringify(entry));
    assert.equal(entry.excluded,true);
    assert.equal(entry.expired,true);
  }
});

test('project shield observations reach both weapon windows and expire', async () => {
  const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addCombatObservation, addSkillHit, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const barbara = await catalog.get('characters', 'barbara');
  for (const [weaponId, duration] of [['angelosheptades', 20000], ['jadefallssplendor', 3000]]) {
    const weapon = await catalog.get('weapons', weaponId), build = auditBuild(barbara, weapon);
    const project = createEmptyProject(); project.enemy = defaultEnemy();
    const actor = addActorFromBuild(project, build);
    addCombatObservation(project, actor, 10, 'shieldCreated', true);
    const ids = [9, 11, 10 + duration].map(time => addSkillHit(project, actor, barbara.talents[0].id, 0, time, { crit: 'noncritical', reaction: 'none',
      facts: [{ subject: { kind: 'actor', id: actor }, values: { onField: bool(true), 'angelosheptades.hexereiRecipient': bool(false) } }] }));
    const result = engine.evaluateTimeline(project);
    const values = ids.map(id => result.points.find(point => point.id === id)?.value);
    assert.ok(values.every(Number.isFinite), JSON.stringify(result.diagnostics));
    assert.ok(values[1] > values[0], `${weaponId} shield did not activate`);
    assert.ok(Math.abs(values[2] - values[0]) < 1e-8, `${weaponId} shield window did not expire`);
  }
});

test('Hymn single-layer bonus uses holder HP and leaves unconfirmed multi-layer bonus unknown', async () => {
  const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const [owner, peer, weapon, sword, set] = await Promise.all([
    catalog.get('characters', 'neuvillette'), catalog.get('characters', 'kaeya'),
    catalog.get('weapons', 'hymnofthemaelstrom'), catalog.get('weapons', 'dullblade'),
    catalog.get('sets', 'gladiatorsfinale'),
  ]);
  const build = { ...auditBuild(owner, weapon, [set]), level: 90, ascension: 6, weaponLevel: 90, weaponAscension: 6,
    artifacts: ['flower', 'sands', 'goblet', 'circlet'].map((slot, i) => ({ id: 'hp-' + i, setId: set.id, slot,
      rarity: 5, level: 20, mainStat: slot === 'flower' ? 'hp' : 'hpPercent', inventory: null, sourceRefs: [], substats: [] })) };
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: auditBuild(peer, sword) }]);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.diagnostics));
  const talent = peer.talents[0], hit = talent.hits[0], { setup, request } = auditHit(peer, talent, hit, 90);
  setup.events.find(event => event.id === 'hit').actorId = 'peer';
  Object.assign(request.frame, { ownerId: 'peer', recipientId: 'peer', contributorId: null, hit: {
    skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, origin: hit.origin, family: 'ordinary', reactionId: null } });
  const context = engine.createStructuredCombatContext(prepared.team, setup);
  const binding = key => ({ kind: 'attribute', actor: { role: 'owner' }, key: { namespace: 'builtin', id: 'attribute.' + key, revision: '1' }, at: { kind: 'current', phase: 'same' } });
  function read(layers, reaction, observed) {
    request.frame.factOverrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: {
      'hymnofthemaelstrom.meadLayers': number('count', layers), 'hymnofthemaelstrom.reactionBuff': bool(reaction),
      ...(observed === undefined ? {} : { 'hymnofthemaelstrom.multilayerAttackBonus': number('scalar', observed) }), onField: bool(false) } },
    { subject: { kind: 'actor', id: 'peer' }, facts: { onField: bool(true) } }];
    const attack = engine.evaluateCombatBindings(prepared.team.program, context, { attack: binding('attackPercent') }, request.frame).outputs.attack;
    const hp = engine.evaluateCombatBindings(prepared.team.program, context, { hp: binding('hp') },
      { ...request.frame, ownerId: 'actor', recipientId: 'actor' }).outputs.hp;
    return { attack, hp };
  }
  const zero = read(0, false), single = read(1, false), reacted = read(1, true), multi = read(2, false), confirmed = read(2, false, .1);
  for (const result of [zero, single, reacted, confirmed]) assert.equal(result.attack.state, 'known');
  assert.equal(multi.attack.state, 'unknown');
  // R1 source: 0.4% per 1000 HP above 40000, capped at 8%; reaction increases this by 75%.
  const expected = hp => Math.min(.08, Math.max(0, hp - 40000) * .004 / 1000);
  assert.ok(Math.abs(single.attack.value.value - zero.attack.value.value - expected(single.hp.value.value)) < 1e-9);
  assert.ok(Math.abs(reacted.attack.value.value - zero.attack.value.value - expected(reacted.hp.value.value) * 1.75) < 1e-9);
  assert.ok(Math.abs(confirmed.attack.value.value - zero.attack.value.value - .1) < 1e-9);
});

test('Skyward Pride manual confirmed blade is independent physical damage', async () => {
 const catalog=await createRuntimeCatalog({characters:['noelle'],weapons:['skywardpride'],sets:[],actions:[]}),engine=await loadContentSchema('/src/engine/src/index.ts');
 const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
 const {addActorFromBuild,addSelectedHit,defaultEnemy}=await loadContentSchema('/src/web/src/domain/real-project.ts');
 const character=await catalog.get('characters','noelle'),weapon=await catalog.get('weapons','skywardpride');
 for(const refinement of [1,5]){
  const p=createEmptyProject();p.enemy=defaultEnemy();const actor=addActorFromBuild(p,{...auditBuild(character,weapon),refinement});
  const selected={definition:{group:'weapons',namespace:weapon.namespace,id:weapon.id,revision:weapon.revision},hitId:'skywardpride.vacuum-blade'};
  const id=addSelectedHit(p,actor,selected,0,{crit:'noncritical',reaction:'none',facts:[{subject:{kind:'event'},values:{'skywardpride.vacuum-bladeTriggered':bool(true)}},{subject:{kind:'actor',id:actor},values:{'noelle.sweepingTime':bool(false)}}]});
  const result=engine.evaluateTimeline(p),point=result.points.find(row=>row.id===id);
  const expected=point.real.panel.stats.attack*(refinement===1?.8:1.6)*(refinement===1?1.08:1.16)*.9*101/291;
  assert.ok(Number.isFinite(point.value) && Number.isFinite(expected) && Math.abs(point.value-expected)<1e-8, JSON.stringify(result.diagnostics));
 }
});

test('Kagura follows three actual Yae skill casts, refreshes all stacks and preserves manual inputs', async () => {
 const c=await createRuntimeCatalog({characters:['yaemiko'],weapons:['kagurasverity'],sets:[],actions:[]}),engine=await loadContentSchema('/src/engine/src/index.ts');
 const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts'),{addActorFromBuild,addSkillAction,addSkillHit,defaultEnemy}=await loadContentSchema('/src/web/src/domain/real-project.ts');
 const character=await c.get('characters','yaemiko'),weapon=await c.get('weapons','kagurasverity');
 for(const refinement of [1,5]) {
  const p=createEmptyProject();p.enemy=defaultEnemy();const actor=addActorFromBuild(p,{...auditBuild(character,weapon),level:90,ascension:6,refinement}),mode={crit:'noncritical',reaction:'none'},hits=[];
  for(const time of [1000,2000,3000]){addSkillAction(p,actor,'yaemiko.skill',time);hits.push(addSkillHit(p,actor,'yaemiko.skill',0,time+1,mode));}
  const normal=addSkillHit(p,actor,'yaemiko.normal',0,3002,mode),last=addSkillHit(p,actor,'yaemiko.skill',0,26999,mode),expired=addSkillHit(p,actor,'yaemiko.skill',0,27000,mode);
  const result=engine.evaluateTimeline(p),point=id=>result.points.find(x=>x.id===id),base=point(expired).value,rate=refinement===1?.12:.24;
  assert.ok(base>0);for(let i=0;i<3;i++)assert.ok(Math.abs(point(hits[i]).value/base-(1+rate*(i+1)+(i===2?rate:0)))<1e-9);
  assert.equal(point(last).value,point(hits[2]).value);assert.equal(result.combatChanges.filter(x=>x.kind==='skill-charge'&&x.status==='applied').length,3);
  const uncertain=structuredClone(p),secondAction=uncertain.timeline.filter(x=>x.kind==='action')[1];
  secondAction.facts={skillCooldownRemaining:{value:null,provenance:'explicit',sourceRefs:[]}};
  const uncertainResult=engine.evaluateTimeline(uncertain);
  assert.equal(uncertainResult.points.find(x=>x.id===hits[1]).value,null);
  assert.ok(uncertainResult.combatChanges.some(x=>x.source===secondAction.id&&x.status==='unknown'));
  assert.ok(uncertainResult.points.find(x=>x.id===expired).value>0);
  const off=structuredClone(p);off.timeline.find(x=>x.id===normal).damage.facts=[{subject:{kind:'actor',id:actor},values:{'kagurasverity.danceLayers':{value:{kind:'quantity',unit:'count',value:0},provenance:'explicit',sourceRefs:[]}}}];
  const disabled=engine.evaluateTimeline(off).points.find(x=>x.id===normal).value;assert.ok(Math.abs(point(normal).value/disabled-(1+rate))<1e-9);
  const prepared=engine.prepareStructuredBuilds([{id:'actor',build:{...auditBuild(character,weapon),refinement}}]);const {setup,request}=auditHit(character,character.talents[1],character.talents[1].hits[0]);setGateFacts(weapon,request.frame,{'kagurasverity.danceLayers':3});
  const context=engine.createStructuredCombatContext(prepared.team,setup),binding={kind:'attribute',key:{namespace:'builtin',id:'attribute.damageBonus',revision:'1'},actor:{role:'recipient'},at:{kind:'current',phase:'same'}};
  const read=(element,category)=>engine.evaluateCombatBindings(prepared.team.program,context,{value:binding},{...request.frame,ownerId:'actor',recipientId:'actor',contributorId:null,phase:'before',hit:{skillId:character.talents[1].id,hitId:character.talents[1].hits[0].id,category,element,family:'ordinary',origin:'talent',reactionId:null}}).outputs.value.value.value;
  assert.equal(read('physical','normal'),0);assert.equal(read('electro','normal'),rate);assert.ok(Math.abs(read('electro','skill')-rate*4)<1e-9);
 }
});

test('category stacks retain independent hit windows for Nymph and Polar Star', async () => {
  const catalog = await createRuntimeCatalog({characters:['amber','lisa'],weapons:['polarstar','apprenticesnotes'],sets:['nymphsdream'],actions:[]});
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addAttributeCapture,addFieldChange,addSkillHit,defaultEnemy}=await loadContentSchema('/src/web/src/domain/real-project.ts');
  const {projectCombatEvents}=await loadContentSchema('/src/engine/src/calculation/combat-changes.ts');
  const set=await catalog.get('sets','nymphsdream'),p=createEmptyProject();p.enemy=defaultEnemy();
  const actor=addActorFromBuild(p,{...auditBuild(await catalog.get('characters','amber'),await catalog.get('weapons','polarstar'),[set]),theoreticalSetSlots:set.slots.slice(0,4).map(slot=>({slot,setId:set.id}))});
  const eventFacts={targetsHit:number('count',1),targetsDamaged:number('count',0)};
  const facts=[{subject:{kind:'event'},values:eventFacts},{subject:{kind:'actor',id:actor},values:{'nymphsdream.nymphLayers':number('count',0),'polarstar.starLayers':number('count',0)}}];
  addSkillHit(p,actor,'amber.normal',0,0,{crit:'noncritical',reaction:'none',facts});
  const contacted=[{subject:{kind:'event'},values:eventFacts}];
  addSkillHit(p,actor,'amber.skill',0,100,{crit:'noncritical',reaction:'none',facts:contacted});
  addSkillHit(p,actor,'amber.normal',6,200,{crit:'noncritical',reaction:'none',facts:contacted});
  const first=addAttributeCapture(p,actor,'amber.normal',201);
  addSkillHit(p,actor,'amber.normal',0,7000,{crit:'noncritical',reaction:'none',facts:contacted});
  const later=addAttributeCapture(p,actor,'amber.normal',8100),end=addAttributeCapture(p,actor,'amber.normal',15000);
  const actual=addSkillHit(p,actor,'amber.normal',0,8101,{crit:'noncritical',reaction:'none',facts:[{subject:{kind:'event'},values:{targetsHit:number('count',0)}}]});
  const events=projectCombatEvents(p),read=(id,key)=>events.find(event=>event.id===id)?.derivedStates?.before?.[actor]?.[key]?.value?.value;
  assert.equal(read(first,'nymphsdream.nymphLayers'),3);assert.equal(read(first,'polarstar.starLayers'),3);
  assert.equal(read(later,'nymphsdream.nymphLayers'),2);assert.equal(read(later,'polarstar.starLayers'),3);
  assert.equal(read(end,'nymphsdream.nymphLayers'),0);assert.equal(read(end,'polarstar.starLayers'),1);
  const panel=engine.evaluateTimeline(p).points.find(row=>row.id===actual)?.real?.panel;
  assert.ok(Math.abs(panel.attributes.hydroBonus-.24)<1e-9);
  assert.ok(Math.abs(panel.attributes.attackPercent-.46)<1e-9);
  const unknown=structuredClone(p), firstSource=unknown.timeline.find(row=>row.actor===actor&&row.timeMs===0&&row.damage);
  delete firstSource.damage.facts.find(row=>row.subject.kind==='event').values.targetsHit;
  const uncertain=projectCombatEvents(unknown).find(event=>event.id===first)?.derivedStates?.before?.[actor]?.['nymphsdream.nymphLayers'];
  assert.equal(uncertain?.value,null);
  const missed=structuredClone(p),source=missed.timeline.find(row=>row.actor===actor&&row.timeMs===0&&row.damage);
  source.damage.facts.find(row=>row.subject.kind==='event').values.targetsHit=number('count',0);
  const miss=projectCombatEvents(missed).find(event=>event.id===first)?.derivedStates?.before?.[actor]?.['nymphsdream.nymphLayers'];
  assert.equal(miss?.value?.value,2);
  const simultaneous=structuredClone(p),skill=simultaneous.timeline.find(row=>row.timeMs===100),charged=simultaneous.timeline.find(row=>row.timeMs===200);
  charged.timeMs=skill.timeMs;charged.order=skill.order;
  const tied=projectCombatEvents(simultaneous).find(event=>event.id===first)?.derivedStates?.before?.[actor];
  assert.equal(tied['nymphsdream.nymphLayers'].value.value,3);assert.equal(tied['polarstar.starLayers'].value.value,3);
  const manual=structuredClone(p);manual.timeline.find(row=>row.id===actual).damage.facts.push({subject:{kind:'actor',id:actor},values:{'nymphsdream.nymphLayers':number('count',1),'polarstar.starLayers':number('count',0)}});
  const override=engine.evaluateTimeline(manual).points.find(row=>row.id===actual)?.real?.panel;
  assert.ok(Math.abs(override.attributes.hydroBonus-.19)<1e-9);assert.ok(Math.abs(override.attributes.attackPercent-.07)<1e-9);
  const nullManual=structuredClone(p);nullManual.timeline.find(row=>row.id===actual).damage.facts.push({subject:{kind:'actor',id:actor},values:{'nymphsdream.nymphLayers':{value:null,provenance:'explicit',sourceRefs:[]}}});
  assert.equal(engine.evaluateTimeline(nullManual).points.find(row=>row.id===actual)?.real?.panel.attributes.hydroBonus,null);
  const preset=structuredClone(manual);preset.timeline.find(row=>row.id===actual).damage.facts.find(row=>row.subject.kind==='actor').values['nymphsdream.nymphLayers'].provenance='preset';
  assert.ok(Math.abs(engine.evaluateTimeline(preset).points.find(row=>row.id===actual)?.real?.panel.attributes.hydroBonus-.24)<1e-9);
  const trigger=events.find(event=>event.actorId===actor&&event.timeMs===100&&event.kind==='hit');
  assert.equal(trigger.derivedStates.before[actor]['nymphsdream.nymphLayers'].value.value,1);
  assert.equal(trigger.derivedStates.after[actor]['nymphsdream.nymphLayers'].value.value,2);
  const {weaponMetadataSchema,artifactSetMetadataSchema}=await loadContentSchema();
  const invalidWeapon=structuredClone(p.candidate.actors[0].build.weapon.metadata);invalidWeapon.categoryStacks[0].fact='missing';
  assert.equal(weaponMetadataSchema.safeParse(invalidWeapon).success,false);
  const invalidSet=structuredClone(set.metadata);invalidSet.categoryStacks[0].categories.push('normal');
  assert.equal(artifactSetMetadataSchema.safeParse(invalidSet).success,false);
  const offField=structuredClone(p),peer=addActorFromBuild(offField,auditBuild(await catalog.get('characters','lisa'),await catalog.get('weapons','apprenticesnotes')));
  addFieldChange(offField,peer,50,{mode:{crit:'noncritical',reaction:'none'}});
  const background=projectCombatEvents(offField).find(event=>event.id===first)?.derivedStates?.before?.[actor];
  assert.equal(background['nymphsdream.nymphLayers'].value.value,3);
});

for (const [weaponId, hitId, fact, cooldownMs] of [
  ['kagotsurubeisshin', 'kagotsurubeisshin.wind', 'kagotsurubeisshin.windTriggered', 8000],
  ['swordofdescension', 'swordofdescension.descent', 'swordofdescension.descentTriggered', 10000],
]) test(weaponId + ' applies its declared cooldown to the linked attack', async () => {
  const catalog = await createRuntimeCatalog({ characters: ['kaeya'], weapons: [weaponId], sets: [], actions: [] });
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addSkillHit, addSelectedHit, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const weapon = await catalog.get('weapons', weaponId);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const owner = addActorFromBuild(project, auditBuild(await catalog.get('characters', 'kaeya'), weapon));
  const mode = { crit: 'noncritical', reaction: 'none' };
  const definition = { group: 'weapons', namespace: weapon.namespace, id: weaponId, revision: weapon.revision };
  const ids = [0, cooldownMs - 1, cooldownMs].map(time => {
    const source = addSkillHit(project, owner, 'kaeya.normal', 0, time, mode);
    const id = addSelectedHit(project, owner, { definition, hitId }, time + 1, {
      ...mode, facts: [{ subject: { kind: 'event' }, values: { [fact]: bool(true) } }],
    });
    project.timeline.find(row => row.id === id).sourceEventIds = [source];
    return id;
  });
  const points = engine.evaluateTimeline(project).points;
  const values = ids.map(id => points.find(point => point.id === id)?.value);
  assert.ok(values[0] > 0);
  assert.equal(values[1], 0);
  assert.equal(values[2], values[0]);
});
