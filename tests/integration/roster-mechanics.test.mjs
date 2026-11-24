import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { readContentSource } from '../../tools/lib/content-source.mjs';
import { catalogPlugin } from '../../tools/scripts/build/catalog-plugin.mjs';
import { auditHealingWindows, auditSetConditions } from '../../tools/lib/set-condition-audit.mjs';
import { auditBuild, auditHit } from '../../tools/lib/roster-evaluation.mjs';
import { auditVarkaChargedHands } from '../../tools/lib/varka-charged-hands-audit.mjs';

const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
const fixtureModules = new Map();
function loadFixtureModule(path) {
  if (!fixtureModules.has(path)) fixtureModules.set(path, loadContentSchema(path));
  return fixtureModules.get(path);
}

test('an unknown party element preserves a rank-invariant cooldown and identifies the missing damage rank', async () => {
  const sword = await catalog.get('weapons','dullblade');
  const kaeya = auditBuild(await catalog.get('characters','kaeya'), sword);
  const skirk = auditBuild(await catalog.get('characters','skirk'), sword);
  const skill = kaeya.character.talents.find(t => t.category === 'skill');
  const { setup, request } = auditHit(kaeya.character,skill,skill.hits[0]);
  const frame = { ...request.frame, ownerId:'actor',recipientId:'actor',contributorId:null,hit:null };
  const binding = (parameterId,unit) => ({kind:'talent-parameter',actor:{role:'owner'},skillId:skill.id,parameterId,type:{kind:'quantity',unit}});
  const inputs = [{id:'actor',build:kaeya},{id:'teacher',build:skirk},{id:'third'}];
  const baseline = JSON.stringify(inputs);
  for (const [element,expected] of [[undefined,null],['hydro',2.0554],['pyro',1.912]]) {
    const party = [inputs[0],inputs[1],{id:'third',element}];
    const prepared = engine.prepareStructuredBuilds(party);
    assert.equal(prepared.ok,true);
    const context = engine.createStructuredCombatContext(prepared.team,setup);
    const result = engine.evaluateCombatBindings(prepared.team.program,context,{rate:binding('param1','scalar'),cooldown:binding('param2','milliseconds')},frame);
    assert.equal(result.outputs.cooldown.value.value,6000);
    assert.equal(result.outputs.rate.value?.value ?? null,expected);
    if (expected === null) assert.ok(result.requiredInputs.some(entry => entry.key === 'kaeya.skill.teamTalentLevel'));
    if (element === 'hydro') assert.ok(context.actors[0].talents.find(t=>t.id===skill.id).sourceRefs.includes(skirk.character.sources[0]));
  }
  assert.equal(JSON.stringify(inputs),baseline);
});
test('recorded talent heals validate the saved count and remove the recipient without mutating the original build', async () => {
  const { createEmptyProject, removeProjectActor } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addTalentHeal } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const { projectSchema } = await loadFixtureModule('/src/schema/src/index.ts');
  const project = createEmptyProject();
  const healer = addActorFromBuild(project, auditBuild(await catalog.get('characters','lyney'), await catalog.get('weapons','huntersbow')));
  const ally = addActorFromBuild(project, auditBuild(await catalog.get('characters','kaeya'), await catalog.get('weapons','dullblade')));
  const count = value => [{ subject:{kind:'event'}, values:{ 'lyney.propSurplus':number('count',value) } }];
  const healId = 'lyney.skill.heal.param3';
  assert.throws(() => addTalentHeal(project,healer,healer,healId,0,count(6)));
  assert.equal(project.timeline.length,0);
  addTalentHeal(project,healer,healer,healId,0,count(5));
  addTalentHeal(project,healer,ally,healId,0,count(5));
  const original = JSON.stringify(project);
  const read = engine.evaluateTimeline(project);
  assert.deepEqual(read.combatChanges.filter(c => c.kind === 'talent-healing').map(c => c.status),['applied','excluded']);
  assert.equal(JSON.stringify(project),original);
  removeProjectActor(project,ally);
  assert.equal(project.timeline.length,1);
  assert.equal(projectSchema.safeParse(project).success,true);
});
test('authored talents reject duplicate parameters, legacy hits and ambiguous damage declarations', async () => {
  const schema=await loadFixtureModule('/src/schema/src/index.ts');
  const metadata=(await catalog.get('characters','kaeya')).metadata;
  assert.ok(schema.characterMetadataSchema.safeParse(metadata).success);
  for (const revision of ['ab12cde', 'a'.repeat(32), 'b'.repeat(40), 'c'.repeat(64)]) {
    assert.equal(schema.characterMetadataSchema.safeParse({...metadata,revision}).success,false);
  }
  for (const change of [
    skill=>skill.parameters.push(structuredClone(skill.parameters[0])),
    skill=>{skill.hits[0].parameter=skill.parameters[0].id;},
    skill=>{skill.noIndependentDamage=true;},
  ]) {
    const copy=structuredClone(metadata);
    change(copy.talents[0]);
    assert.equal(schema.characterMetadataSchema.safeParse(copy).success,false);
  }
  const ref=schema.characterHitRef(metadata,metadata.talents[0].hits[0].id);
  assert.ok(schema.hitBelongsToCharacter(ref,metadata));
  for(const change of [{group:'weapons'},{group:'sets'},{namespace:'custom'},{revision:'different'}]) {
    assert.equal(schema.hitBelongsToCharacter({...ref,definition:{...ref.definition,...change}},metadata),false);
  }
});
const f = value => ({ value, provenance: 'explicit', sourceRefs: [] });
test('Freminet C4 overlapping expiry accepts either recorded layer state only during the ambiguous interval', async () => {
  const character = await catalog.get('characters','freminet');
  const weapon = await catalog.get('weapons','wastergreatsword');
  const {team} = engine.prepareStructuredBuilds([{id:'actor',build:{...auditBuild(character,weapon),constellation:4}}]);
  const skill = character.talents[1], {setup,request} = auditHit(character,skill,skill.hits[0]);
  setup.events[0].timeMs = 6000;
  setup.events.unshift(...[0,300].map((timeMs,i) => ({id:'freeze'+i,kind:'reaction',reactionId:'freeze',actorId:'actor',targetIds:['enemy'],timeMs,order:i,sourceEventIds:[],facts:{}})));
  const context = engine.createStructuredCombatContext(team,setup);
  const instanceId = engine.calculationEffectInstanceId('actor',{namespace:'builtin',id:'freminet.snowy-moon',revision:'1'},'freeze0');
  const binding = {kind:'attribute',actor:{role:'owner'},key:{namespace:'builtin',id:'attribute.attackPercent',revision:'1'},at:{kind:'current',phase:'same'}};
  for (const [active,expected] of [[null,null],[false,.09],[true,.18]]) {
    const frame = {...request.frame,ownerId:'actor',recipientId:'actor',contributorId:null,hit:null,applications:active === null ? [] : [{instanceId,active}]};
    const read = engine.evaluateCombatBindings(team.program,context,{n:binding},frame);
    assert.equal(read.outputs.n?.value?.value ?? null,expected);
    if (active === null) assert.ok(read.requiredInputs.some(input => input.key === 'freminet.snowy-moon.stackRefresh'));
    else assert.equal(read.outputs.n.state,'known');
  }
});
const yes = value => f({ kind: 'boolean', value });
const number = (unit, value) => f({ kind: 'quantity', unit, value });
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) < 0.000001, actual + ' ≠ ' + expected);
async function build(id, weapon) {
  const b = auditBuild(await catalog.get('characters', id), await catalog.get('weapons', weapon));
  return { ...b, level: 90, ascension: 6, talents: { normal: 10, skill: 10, burst: 10 } };
}
function prepare(members) {
  const p = engine.prepareStructuredBuilds(members);
  assert.ok(p.ok, JSON.stringify(p.diagnostics)); return p.team;
}
function panel(team, b, name, key, actorFacts = {}, ownerFacts = {}, time = 1, cast, changes = [], allowUnknown = false) {
  const t = b.character.talents[0], h = t.hits[0], { setup, request } = auditHit(b.character, t, h, 90);
  setup.events[0].timeMs = time;
  if (cast) setup.events.unshift({ id: 'cast', kind: 'action', actorId: 'support', skillId: cast, category: 'burst', targetIds: [], timeMs: 0, order: 0, sourceEventIds: [], facts: {} });
  for (const [index, [actorId, timeMs, change]] of changes.entries()) setup.events.push({ id: 'change-' + index, kind: 'state-change',
    actorId, timeMs, order: index + 2, targetIds: [], sourceEventIds: [], facts: { hpRatioChange: change === null ? f(null) : number('scalar', change) } });
  request.frame.factOverrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: actorFacts }, { subject: { kind: 'actor', id: 'support' }, facts: ownerFacts }];
  if (!cast && !Object.keys(ownerFacts).length) request.frame.factOverrides.pop();
  const result = engine.evaluateCombatBindings(team.program, engine.createStructuredCombatContext(team, setup), {
    value: { kind: 'attribute', key: { namespace: 'builtin', id: 'attribute.' + key, revision: '1' }, actor: { role: 'owner' }, at: { kind: 'current', phase: 'same' } }
  }, { ...request.frame, ownerId: name, recipientId: name, contributorId: null, hit: null });
  if (allowUnknown && result.outputs.value.state === 'unknown') return null;
  assert.equal(result.outputs.value.state, 'known', JSON.stringify(result.diagnostics)); return result.outputs.value.value.value;
}
test('Flins checks both direct lunar bases, the event and team gates', async () => {
  const b = await build('flins', 'beginnersprotector'), t = b.character.talents.find(t => t.category === 'burst'), team = prepare([{ id: 'actor', build: b }]);
  const attack = b.character.attributes.base.attack * b.character.progression.curves.attack[90] + b.character.progression.promotion[6].attack + b.weapon.baseAttack * b.weapon.attackCurve[1];
  const blessing = Math.min(.14, attack * .00007);
  const mastery = Math.min(160, attack * .08);
  for (const [hit, expected] of [['symphony', 1301.720302], ['symphony-extra', 1893.411349]]) {
    const h = t.hits.find(h => h.id === 'flins.burst.' + hit);
    for (const [window, moon, cloud] of [[true, true, true], [false, true, true], [true, false, true], [true, true, false]]) {
      const { setup, request } = auditHit(b.character, t, h, 90);
      request.frame.factOverrides[0].facts['flins.symphonyWindow'] = yes(window);
      request.frame.factOverrides.push({ subject: { kind: 'team' }, facts: { fullMoonsign: yes(moon) } });
      request.frame.facts.nearThundercloud = yes(cloud);
      const result = engine.evaluateStructuredHit(team, setup, request);
      const enabled = window && (hit === 'symphony' || moon && cloud);
      const reactionBonus = 1 + 6 * mastery / (2000 + mastery) + (moon ? .2 : 0);
      assert.equal(result.outputs.length, 1);
      near(result.totals.all.value.value, enabled ? expected * reactionBonus * (1 + blessing) : 0);
      const context = engine.createStructuredCombatContext(team, setup);
      context.effectRevisions = [{ instanceId: engine.calculationEffectInstanceId('actor', { namespace: 'builtin', id: 'flins.reaction-blessing', revision: '1' }, null), disabled: true }];
      near(engine.evaluateStructuredHit(team, setup, request, { context }).totals.all.value.value, enabled ? expected * reactionBonus : 0);
    }
  }
});
test('Bennett uses owner white attack, recipient HP and on-field interval', async () => {
  const b = await build('kaeya', 'dullblade'), support = await build('bennett', 'dullblade');
  const white = support.character.attributes.base.attack * support.character.progression.curves.attack[90] + support.character.progression.promotion[6].attack + support.weapon.baseAttack * support.weapon.attackCurve[1];
  for (const rank of [0, 1]) {
    const team = prepare([{ id: 'actor', build: b }, { id: 'support', build: { ...support, constellation: rank } }]);
    const alone = panel(team, b, 'actor', 'attack');
    for (const [hp, onField, inField, time] of [[0.7, true, true, 1], [.7001, true, true, 1], [.8, false, true, 1], [.8, true, false, 1], [.8, true, true, 12000]]) {
      const value = panel(team, b, 'actor', 'attack', { hpRatio: number('scalar', hp), onField: yes(onField), 'bennett.inField': yes(inField) }, { hpRatio: number('scalar', .01) }, time, 'bennett.burst');
      near(value - alone, time < 12000 && onField && inField && (rank || hp > .7) ? white * (rank ? 1.208 : 1.008) : 0);
    }
  }
});
test('Ayato gains Namisen after impact, refreshes the cap on water illusion burst and clears it on departure or expiry', async () => {
  const {createEmptyProject}=await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addFieldChange,addSkillAction,addSkillHit,defaultEnemy}=await loadFixtureModule('/src/web/src/domain/real-project.ts');
  for(const rank of [0,2])for(const leave of [false,true]) {
    const b=await build('kamisatoayato','dullblade'); b.constellation=rank;
    const project=createEmptyProject(); project.enemy=defaultEnemy();project.enemy.level=90;project.enemy.resistances.hydro=.1;
    const owner=addActorFromBuild(project,b),other=addActorFromBuild(project,await build('lisa','apprenticesnotes'));
    const mode={crit:'noncritical',reaction:'none',facts:[{subject:{kind:'target',id:'target'},values:{targetHpRatio:number('scalar',.75)}}]};
    addSkillAction(project,owner,'kamisatoayato.skill',0);
    const cap=rank===2?5:4, times=[[10,2],[50,3],[109,3],[110,3],[151,cap],[201,leave?null:cap],[6000,null]];
    const ids=times.map(([time])=>addSkillHit(project,owner,'kamisatoayato.skill',0,time,mode));
    addSkillHit(project,owner,'kamisatoayato.skill',3,150,mode);
    if(leave)addFieldChange(project,other,200,{mode:{crit:'noncritical',reaction:'none'}});
    const result=engine.evaluateTimeline(project), baseHp=b.character.attributes.base.hp*b.character.progression.curves.hp[90]+b.character.progression.promotion[6].hp;
    const atk=b.character.attributes.base.attack*b.character.progression.curves.attack[90]+b.character.progression.promotion[6].attack+b.weapon.baseAttack*b.weapon.attackCurve[1];
    const params=b.character.talents[1].parameters, slash=params.find(p=>p.id==='param1').values[9],perLayer=params.find(p=>p.id==='param5').values[9];
    for(const [i,[time,stacks]] of times.entries()) {
      const point=result.points.find(p=>p.id===ids[i]),hp=baseHp*(rank===2&&stacks>=3?1.5:1);
      assert.ok(point?.real,JSON.stringify({rank,leave,time,issues:result.diagnostics}));
      near(point.real.panel.stats.hp,hp);
      near(point.real.value,stacks===null?0:(atk*slash+hp*perLayer*stacks)*.45);
    }
  }
});

test('Furina grants both rank-ten contributions for one duration', async () => {
  const b = await build('kaeya', 'dullblade'), support = await build('furina', 'dullblade');
  const team = prepare([{ id: 'actor', build: b }, { id: 'support', build: support }]);
  for (const [key, expected] of [['damageBonus', .25], ['incomingHealingBonus', .1]]) for (const time of [1, 17999, 18000]) {
    near(panel(team, b, 'actor', key, {}, { 'furina.fanfarePoints': number('scalar', 100) }, time, 'furina.burst'), time < 18000 ? expected : 0);
  }
});
test('confirmed Buff snapshots persist Fanfare and individual Blackcliff expiries from time zero', async () => {
  const { createEmptyProject, importProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addCombatObservation, addSkillHit, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const { calculatorBuffChoices, applyCalculatorBuffs } = await loadContentSchema('/src/web/src/domain/calculator-buffs.ts', [catalogPlugin()]);
  const { packDocument } = await loadFixtureModule('/src/web/src/domain/content-document.ts');
  const project = createEmptyProject(), mode = { crit: 'noncritical', reaction: 'none' };
  project.enemy = defaultEnemy();
  const kaeya = addActorFromBuild(project, await build('kaeya', 'blackclifflongsword'));
  const furina = addActorFromBuild(project, await build('furina', 'dullblade'));
  const times = [0,500,999,1000,1999,2000,3999,4000];
  const ids = times.map(time => addSkillHit(project,kaeya,'kaeya.normal',0,time,mode));
  const request = project.timeline[0].damage;
  request.facts = [{ subject:{kind:'actor',id:furina}, values:{'furina.fanfarePoints':number('scalar',100)} }];
  addCombatObservation(project,kaeya,250,'hpRatioChange',-.2);
  const menu = calculatorBuffChoices(project,kaeya,request,0,ids[0]);
  const fan = menu.find(o => o.effect.id === 'furina.fanfare'), black = menu.find(o => o.effect.id === 'blackclifflongsword.defeat');
  const selections = new Map([[fan.id,true],[black.id,true]]);
  assert.throws(() => applyCalculatorBuffs(project,request,menu,selections,0,ids[0],new Map([[black.id,[30001]]])));
  const active = applyCalculatorBuffs(project,request,menu,selections,0,ids[0],new Map([[fan.id,[1000]],[black.id,[2000,4000]]])).project;
  assert.equal(active.timeline.filter(r => r.confirmedBuff).length,3);
  assert.equal(active.timeline.filter(r => r.kind === 'action').length,0);
  assert.equal(project.timeline.some(r => r.confirmedBuff),false);
  const reopened = importProject(JSON.stringify(packDocument('axis',active)));
  const result = engine.evaluateTimeline(reopened), baseline = engine.evaluateTimeline(project);
  const fanInstances = result.effectInstances.filter(view=>view.content?.entity==='furina' && view.effect.startsWith('furina.fanfare'));
  assert.equal(fanInstances.length,1);
  assert.deepEqual(fanInstances[0].modifiers.map(m=>m.attribute),['damageBonus','incomingHealingBonus']);
  const base = baseline.points.find(p => p.id === ids[0]).real.panel;
  for (const [i,time] of times.entries()) {
    const point = result.points.find(p => p.id === ids[i]);
    const layers = Number(time < 2000) + Number(time < 4000), points = time >= 1000 ? 0 : time < 250 ? 100 : 120;
    near(point.real.panel.stats.attack - base.stats.attack, base.baseStats.attack*.12*layers);
    near(point.real.panel.attributes.damageBonus-base.attributes.damageBonus,points*.0025);
    near(point.real.panel.attributes.incomingHealingBonus-base.attributes.incomingHealingBonus,points*.001);
    const options = calculatorBuffChoices(reopened,kaeya,reopened.timeline.find(r=>r.id===ids[i]).damage,time,ids[i]);
    assert.equal(options.filter(o => o.effect.id === black.effect.id && o.triggerTime !== undefined).length,layers);
  }
  const activeMenu = calculatorBuffChoices(reopened,kaeya,request,0,ids[0]);
  const layer = activeMenu.find(o => o.timing?.remainingMs === 2000);
  const edited = applyCalculatorBuffs(reopened,request,activeMenu,new Map([[layer.id,true]]),0,ids[0],new Map([[layer.id,[500]]])).project;
  assert.equal(edited.timeline.filter(r=>r.confirmedBuff).length,3);
  near(engine.evaluateTimeline(edited).points.find(p=>p.id===ids[1]).real.panel.stats.attack-base.stats.attack,.12*base.baseStats.attack);
});
test('Xiao, Kaveh, Yanfei and Kokomi use the correct base, element, recipient and cast window, including failed casts', async () => {
  const { assembleCalculationLibrary } = await loadFixtureModule('/src/game-data/src/calculation-library.mjs');
  const local = name => readContentSource(new URL('../../src/game-data/data/calculation/'+name+'.json',import.meta.url));
  const rules = assembleCalculationLibrary(local('common'),local('reactions'),[]);
  const { createEmptyProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addFieldChange, addSkillAction, addSkillHit, addTransformativeReaction, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const mode = {crit:'noncritical',reaction:'none'};
  for (const [id,weapon,infused,duration,energy] of [['xiao','beginnersprotector','anemo',15000,70],['kaveh','wastergreatsword','dendro',12000,80],['yanfei','apprenticesnotes','pyro',15000,80],['sangonomiyakokomi','apprenticesnotes','hydro',10000,70]]) {
    const p = createEmptyProject(), b = auditBuild(await catalog.get('characters',id),await catalog.get('weapons',weapon));
    p.enemy = defaultEnemy(); p.enemy.level=1; p.enemy.resistances.physical=.6; p.enemy.resistances[infused]=.2;
    const owner=addActorFromBuild(p,b);
    const peer=addActorFromBuild(p,auditBuild(await catalog.get('characters','barbara'),await catalog.get('weapons','apprenticesnotes')));
    const attack=b.character.attributes.base.attack*b.character.progression.curves.attack[1]+b.weapon.baseAttack*b.weapon.attackCurve[1];
    const first=b.character.talents[0], checks=[];
    function hits(time,enabled) {
      const kokomi=id==='sangonomiyakokomi';
      const indices=id==='yanfei'||kokomi?[0,3]:[0];
      for(const index of indices){
        const multiplier=first.parameters.find(v=>v.id==='param'+(index+1)).values[0];
        const bonus=enabled?(id==='xiao'?.5845:id==='yanfei'&&index===3?.334:0):0;
        const resistance=enabled || id==='yanfei' || kokomi ? .2 : .6;
        const extra=kokomi && enabled?b.character.attributes.base.hp*(index===0?.0484:.06776):0;
        checks.push([addSkillHit(p,owner,first.id,index,time,mode),(attack*multiplier+extra)*(1+bonus)*.5*(1-resistance)]);
      }
      if(id==='kaveh') for(const [family,coefficient] of [['bloom',2],['hyperbloom',3]]) {
        const bonus=enabled && family==='bloom' ? .27488 : 0;
        checks.push([addTransformativeReaction(p,peer,family,'dendro',time,rules),17.165606*coefficient*(1+bonus)*.8]);
      }
    }
    addFieldChange(p,owner,0,{mode,energy});
    hits(1,false);
    addSkillAction(p,owner,id+'.burst',1);
    hits(1,true); hits(duration,true); hits(duration+1,false);
    const failed=addSkillAction(p,owner,id+'.burst',30000);
    hits(30000,false);
    addFieldChange(p,owner,40000,{mode,energy});
    addSkillAction(p,owner,id+'.burst',40000);
    hits(40001,true);
    addFieldChange(p,peer,40001,{mode});
    hits(40001,false);
    if(id==='yanfei'){
      addFieldChange(p,owner,80000,{mode,energy});addSkillAction(p,owner,id+'.burst',80000);
      p.combatStates=[{id:'defeat',actor:owner,startMs:80010,endMs:80020,values:{hpRatio:0}}];
      hits(80009,true);hits(80010,false);hits(80020,false);
    }
    const result=engine.evaluateTimeline(p);
    assert.equal(result.combatChanges.find(row=>row.source===failed)?.status,'excluded');
    for(const [rid,expected] of checks)near(result.points.find(point=>point.id===rid)?.value,expected);
  }
});
test('Nicole refreshes one shared attack bonus and uses the increased C3 skill rank', async () => {
  const recipient=await build('kaeya','dullblade'),caster=await build('nicole','apprenticesnotes');
  const talent=recipient.character.talents[0];
  const attack={kind:'attribute',key:{id:'attribute.attack',namespace:'builtin',revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}};
  for (const rank of [0,2,3]) {
    const team=prepare([{id:'actor',build:recipient},{id:'support',build:{...caster,constellation:rank}}]);
    const {setup,request}=auditHit(recipient.character,talent,talent.hits[0],90);
    request.frame.factOverrides[0].facts['nicole.blessedDirection'] = yes(false);
    request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'support' }, facts: { onField: yes(false), 'nicole.blessedDirection': yes(false) } });
    const scope=engine.createStructuredCombatContext(team,setup);
    const stats=id=>({ ...request.frame, ownerId:id,recipientId:id,contributorId:null,hit:null });
    function attribute(id,events) {
      const result=engine.evaluateCombatBindings(team.program,{...scope,events},{value:attack},stats(id));
      assert.equal(result.outputs.value.state,'known',JSON.stringify(result.diagnostics));
      return result.outputs.value.value.value;
    }
    const ownerBase=attribute('support',setup.events),recipientBase=attribute('actor',setup.events);
    const flat=rank>=2?300:0,scaled=ownerBase*(rank===3?.177:.15);
    for (const [time,enabled] of [[1,true],[19999,true],[20000,true],[38999,true],[39000,false]]) {
      const cast=(ms)=>({id:'skill-'+ms,kind:'action',actorId:'support',skillId:'nicole.skill',targetIds:[],timeMs:ms,order:0,sourceEventIds:[],facts:{}});
      const events=[cast(0),...(time>=19000?[cast(19000)]:[]),{...setup.events[0],timeMs:time}];
      near(attribute('actor',events)-recipientBase,enabled?scaled+flat:0);
      near(attribute('support',events)-ownerBase,enabled?scaled+flat:0);
    }
  }
});
test('Adventurer gains 1000 HP only after its second occupied slot', async () => {
  const b = await build('kaeya', 'dullblade'), set = await catalog.get('sets', 'adventurer');
  const { createEmptyProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const traveler = auditBuild(await catalog.get('characters', 'aether'), await catalog.get('weapons', 'dullblade'), [set]);
  for (const [pieces, verified] of [[0, true], [2, true], [3, true], [4, false]]) {
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, { ...traveler, theoreticalSetSlots: set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id })) });
    assert.equal(project.definitions.find(d => d.id === actor + '-real-damage').source.verified, verified);
  }
  const values = [0, 1, 2].map(count => panel(prepare([{ id: 'actor', build: { ...b, sets: [set], theoreticalSetSlots: set.slots.slice(0, count).map(slot => ({ slot, setId: set.id })) } }]), b, 'actor', 'hp'));
  near(values[1], values[0]); near(values[2] - values[1], 1000);
});
test('a full party grants pyro resonance once for either two or three members', async () => {
  const b = await build('kaeya', 'dullblade');
  const read = elements => panel(prepare([{ id: 'actor', build: b }, ...elements.map((element, index) => ({ id: 'member-' + index, element }))]), b, 'actor', 'attackPercent');
  near(read(['pyro', 'pyro', 'pyro']) - read(['pyro', 'hydro', 'electro']), .25);
  near(read(['pyro', 'pyro', 'hydro']) - read(['pyro', 'pyro']), .25);
});

test('Ocean-Hued Clam applies a capped healing sum and only the physical resistance multiplier', async () => {
  const b = await build('barbara', 'apprenticesnotes'), set = await catalog.get('sets', 'oceanhuedclam');
  const slots = set.slots.slice(0, 4).map(slot => ({ slot, setId: set.id }));
  const team = prepare([{ id: 'actor', build: { ...b, sets: [set], theoreticalSetSlots: slots } }]);
  const t = b.character.talents[0], { setup, request } = auditHit(b.character, t, t.hits[0], 90);
  setup.events[0].hitId = 'oceanhuedclam.bubble';
  delete setup.events[0].category;
  delete setup.events[0].skillId;
  request.hit = { definition: { group: 'sets', id: set.id, namespace: set.namespace, revision: set.revision }, hitId: 'oceanhuedclam.bubble' };
  request.critMode = 'critical';
  for (const amount of [0, 16000, 30000, 42000]) {
    request.frame.facts = { 'oceanhuedclam.healing': number('hp', amount) };
    const result = engine.evaluateStructuredHit(team, setup, request);
    assert.equal(result.totals.all.state, 'known', JSON.stringify(result.diagnostics));
    near(result.totals.all.value.value, Math.min(30000, amount) * .9 * .9);
  }
  const partial = prepare([{ id: 'actor', build: { ...b, sets: [set], theoreticalSetSlots: slots.slice(0,3) } }]);
  assert.equal(engine.evaluateStructuredHit(partial, setup, request).execution, 'invalid');
});
test('Nahida reads the current team maximum on each equipment change and excludes her own share', async () => {
  const recipient = await build('kaeya', 'dullblade'), support = await build('nahida', 'apprenticesnotes');
  const other = await build('sucrose', 'sacrificialfragments');
  for (const weapon of ['apprenticesnotes', 'sacrificialfragments']) {
    const gear = await catalog.get('weapons', weapon);
    const b = { ...other, weapon: gear, weaponLevel: 70, weaponAscension: 4 };
    const team = prepare([{ id: 'actor', build: recipient }, { id: 'support', build: support }, { id: 'holder', build: b }]);
    const outside = { 'nahida.inShrine': yes(false), onField: yes(false) };
    const own = support.character.progression.promotion[6].specialized;
    const highest = Math.max(own, gear.stat === 'elementalMastery' ? gear.baseStat * gear.statCurve[70] : 0);
    const inField = { 'nahida.inShrine': yes(true), onField: yes(true) };
    near(panel(team, recipient, 'actor', 'elementalMastery', inField, outside), Math.min(250, highest * .25));
    near(panel(team, recipient, 'actor', 'elementalMastery', { ...inField, onField: yes(false) }, outside), 0);
  }
});

test('Yun Jin counts normal attacks separately for each recipient and honors explicit exclusions', async () => {
  const b = await build('kaeya', 'dullblade'), support = await build('yunjin', 'beginnersprotector');
  const team = prepare([{ id: 'actor', build: b }, { id: 'other', build: await build('jean', 'dullblade') }, { id: 'support', build: support }]);
  const t = b.character.talents[0], h = t.hits[0];
  const instance = engine.calculationEffectInstanceId('support', { namespace: 'builtin', id: 'yunjin.flying-cloud-base.base', revision: '1' }, 'cast');
  const quota = support.character.talents.find(t => t.id === 'yunjin.burst').parameters.find(p => p.id === 'param6').values[9];
  function damage(priorActor, priorCount, skipped = false) {
    const { setup, request } = auditHit(b.character, t, h, 90);
    const current = setup.events[0];
    current.timeMs = 5000;
    const remaining = priorActor !== 'actor' || priorCount - (skipped ? 1 : 0) < quota;
    request.frame.factOverrides[0].facts['yunjin.flagFormation'] = yes(remaining);
    request.frame.applications.push({ instanceId: instance, active: true });
    setup.events.unshift({ id: 'cast', kind: 'action', actorId: 'support', skillId: 'yunjin.burst', category: 'burst', targetIds: [], timeMs: 0, order: 0, sourceEventIds: [], facts: {} });
    for (let i = 0; i < priorCount; i++) setup.events.push({ ...current, id: 'prior-' + i, actorId: priorActor, timeMs: i + 1, order: i + 1, applications: [{ instanceId: instance, active: !(skipped && i === 0) }] });
    const result = engine.evaluateStructuredHit(team, setup, request);
    assert.equal(result.totals.all.state, 'known', JSON.stringify(result.diagnostics));
    return result.totals.all.value.value;
  }
  const base = damage('actor', quota), available = damage('actor', 0);
  const defense = support.character.attributes.base.defense * support.character.progression.curves.defense[90] + support.character.progression.promotion[6].defense;
  const ratio = support.character.talents.find(t => t.id === 'yunjin.burst').parameters.find(p => p.id === 'param2').values[9];
  // Kaeya, Jean and Yun Jin supply three different elements for Yun Jin's A4.
  near(available - base, defense * (ratio + .075) * .45);
  near(damage('other', quota), available);
  near(damage('actor', quota - 1), available);
  near(damage('actor', quota, true), available);
});

test('changing food uses its local quality, actual start, expiry and shared team attributes', async () => {
  const { readContentSource } = await import('../../tools/lib/content-source.mjs');
  const scenes = readContentSource(new URL('../../src/game-data/data/calculation/battle-scenes.json', import.meta.url));
  const b = await build('kaeya', 'dullblade');
  const base = panel(prepare([{ id: 'actor', build: b }]), b, 'actor', 'attack');
  for (const [quality, delta, crit] of [['suspicious', 260, .08], ['normal', 316, .1], ['delicious', 372, .12]]) {
    const entry = scenes.find(d => d.id === 'scene.food.adeptustemptation.' + quality);
    const p = engine.prepareStructuredBuilds([{ id: 'actor', build: b }], [], [{ definition: entry, startMs: 100, endMs: 300100 }]);
    assert.ok(p.ok, JSON.stringify(p.diagnostics));
    for (const [time, active] of [[99, false], [100, true], [300099, true], [300100, false]]) {
      near(panel(p.team, b, 'actor', 'attack', {}, {}, time), base + (active ? delta : 0));
      near(panel(p.team, b, 'actor', 'critRate', {}, {}, time), .05 + (active ? crit : 0));
    }
  }
});

test('Furina accumulates signed HP changes from the team and applies her constellation caps', async () => {
  const actor = await build('kaeya', 'dullblade'), support = await build('furina', 'dullblade');
  const changes = [['actor', 10, -.25], ['support', 20, .1], ['actor', 30, .75], ['support', 40, null]];
  for (const [rank, at20, at31] of [[0, 25, 110], [1, 175, 260], [2, 237.5, 400]]) {
    const team = prepare([{ id: 'actor', build: actor }, { id: 'support', build: { ...support, constellation: rank } }]);
    const read = (time, override = {}, unknown = false) => panel(team, actor, 'actor', 'damageBonus', {}, override, time, 'furina.burst', changes, unknown);
    near(read(20), at20 * .0025);
    near(read(31), at31 * .0025);
    assert.equal(read(41, {}, true), null);
    near(read(41, { 'furina.fanfarePoints': number('scalar', 0) }), 0);
    near(read(18000), 0);
  }
});

test('recorded healing creates one bubble per window and preserves authored impacts and inputs', async () => {
  const { createEmptyProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addCombatObservation, addSelectedHit, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const project = createEmptyProject(), b = await build('barbara', 'apprenticesnotes'), set = await catalog.get('sets', 'oceanhuedclam');
  project.enemy = defaultEnemy();
  project.enemy.resistances.physical = .1;
  const slots = set.slots.slice(0, 4).map(slot => ({ slot, setId: set.id }));
  const actor = addActorFromBuild(project, { ...b, sets: [set], theoreticalSetSlots: slots });
  for (const [time, amount] of [[0, 16000], [2999, 19000], [3000, 2100], [3499, 2000], [3500, 1000]]) addCombatObservation(project, actor, time, 'healingDone', amount);
  for (const key of ['healingDone','healingReceived','damageTaken']) assert.throws(() => addCombatObservation(project, actor, 2, key, -1));
  const original = JSON.stringify(project);
  const result = engine.evaluateTimeline(project);
  assert.deepEqual(result.points.map(point => point.value), [24300, 810]);
  assert.equal(JSON.stringify(project), original);
  const hit = { definition: { group: 'sets', namespace: set.namespace, id: set.id, revision: set.revision }, hitId: 'oceanhuedclam.bubble' };
  const id = addSelectedHit(project, actor, hit, 3000, { crit: 'noncritical', reaction: 'none' });
  const explicit = engine.evaluateTimeline(project);
  assert.deepEqual(explicit.points.map(point => point.value), [24300, 810]);
  assert.equal(explicit.points[0].id, id);
  project.timeline.find(entry => entry.id === id).damage.facts = [{ subject: { kind: 'event' }, values: { 'oceanhuedclam.healing': f(null) } }];
  assert.equal(engine.evaluateTimeline(project).points[0].value, null);
  const handovers = await auditHealingWindows(catalog, engine);
  assert.equal(handovers.rows.length, 24);
  assert.deepEqual(handovers.rows.filter(row => row.issue), []);
});

test('Lohen uses skill ranks for Cryo normals and distinct Will multipliers on each selected special hit', async () => {
  const b = await build('lohen', 'beginnersprotector'), team = prepare([{ id: 'actor', build: b }]);
  const attack = b.character.attributes.base.attack * b.character.progression.curves.attack[90] + b.character.progression.promotion[6].attack + b.weapon.baseAttack * b.weapon.attackCurve[1];
  const cryo = b.character.attributes.specialized === 'cryoBonus' ? b.character.progression.promotion[6].specialized : 0;
  for (const [category, baseIndex, rateIndex] of [['skill', 17, 18], ['burst', 1, 2], ['skill', 1, null]]) {
    const talent = b.character.talents.find(t => t.category === category);
    const rate = index => talent.parameters.find(p => p.id === 'param' + index).values[9];
    const hit = talent.hits.find(h => h.id.endsWith('.param' + baseIndex));
    for (const will of [0, 25, 100]) {
      const { setup, request } = auditHit(b.character, talent, hit, 90);
      request.frame.facts['lohen.will'] = number('scalar', will);
      request.frame.factOverrides[0].facts['lohen.masterstroke'] = yes(true);
      request.frame.factOverrides[0].facts['lohen.cryoReactionAttackWindow'] = yes(false);
      request.frame.factOverrides[0].facts['lohen.banebladeAttackWindow'] = yes(false);
      const result = engine.evaluateStructuredHit(team, setup, request);
      near(result.totals.all.value?.value, attack * rate(baseIndex) * (1 + will * (rateIndex ? rate(rateIndex) : 0)) * .45 * (1 + cryo));
      if (category === 'skill') {
        request.frame.factOverrides[0].facts['lohen.masterstroke'] = yes(false);
        near(engine.evaluateStructuredHit(team, setup, request).totals.all.value.value, 0);
      }
    }
  }
});

test('Yae resolves 14-second independent Sakura clocks, only destroys nearby summons and de-duplicates a manual strike', async () => {
  const { createEmptyProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addSkillAction, addSkillHit, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const p = createEmptyProject(), b = await build('yaemiko', 'apprenticesnotes'), id = addActorFromBuild(p, b);
  p.enemy = defaultEnemy();
  const range = nearby => ({ nearby, targetInRange: true, crit: 'noncritical', reaction: 'none' });
  const first = addSkillAction(p, id, 'yaemiko.skill', 0, range([]));
  let result = engine.evaluateTimeline(p);
  assert.deepEqual(result.plan.timeline.filter(r => r.damage).map(r => r.timeMs), [2583, 5517, 8450, 11383, 14317]);
  const manual = addSkillHit(p, id, 'yaemiko.skill', 0, 2583, { crit: 'noncritical', reaction: 'none' });
  const second = addSkillAction(p, id, 'yaemiko.skill', 4000, range([first]));
  const release = addSkillAction(p, id, 'yaemiko.burst', 7000, range([second]));
  const original = JSON.stringify(p);
  result = engine.evaluateTimeline(p);
  const records = result.plan.timeline.filter(r => r.damage);
  assert.equal(records.filter(r => r.timeMs === 2583).length, 1);
  assert.deepEqual(records.find(r => r.id === manual).sourceEventIds, [first]);
  const skillHits = records.filter(r => r.damage.hit.hitId.startsWith('yaemiko.skill.'));
  assert.deepEqual(skillHits.map(r => [r.timeMs, r.damage.hit.hitId.split('.').at(-1)]), [[2583, 'param1'], [5517, 'param2'], [6583, 'param2'], [8450, 'param1'], [11383, 'param1'], [14317, 'param1']]);
  assert.deepEqual(records.find(r => r.damage.hit.hitId === 'yaemiko.burst.param2').sourceEventIds, [release, second]);
  assert.equal(result.points.length, 8);
  assert.ok(result.points.every(point => point.value > 0));
  assert.equal(JSON.stringify(p), original);
});

test('Varka binds each stance hit to its hand and C2 follows the triggering attack category', async () => {
  const b = auditBuild(await catalog.get('characters', 'varka'), await catalog.get('weapons', 'wastergreatsword'));
  const audited = auditVarkaChargedHands({ characters: [b.character], weapons: [b.weapon] }, engine);
  assert.deepEqual(audited.rows.filter(row => row.issue), []);
  assert.equal(audited.rows.length, 113);
  assert.equal(audited.verified.size, 11);
  const skill = b.character.talents[1], attack = b.character.attributes.base.attack + b.weapon.baseAttack;
  const rate = n => skill.parameters.find(p => p.id === 'param' + n).values[0];
  const fourWinds = skill.hits.find(hit => hit.id === 'varka.skill.param14');
  const burst = b.character.talents[2];
  const burstHit = burst.hits.find(hit => hit.id === 'varka.burst.param1');
  for (const element of [undefined, 'hydro', 'pyro']) {
    const team = prepare([{ id: 'actor', build: b }, ...(element ? [{ id: 'other', element }] : [])]);
    const { setup, request } = auditHit(b.character, skill, fourWinds);
    request.frame.factOverrides[0].facts['varka.stance'] = yes(true);
    setup.targets[0].inputs['resistance.' + (element ?? 'anemo')] = number('scalar', .4);
    near(engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value, element ? attack * rate(14) * .5 * .6 : 0);
    const burstQuery = auditHit(b.character, burst, burstHit);
    burstQuery.setup.targets[0].inputs['resistance.' + (element ?? 'anemo')] = number('scalar', .4);
    const burstRate = burst.parameters.find(parameter => parameter.id === 'param1').values[0];
    near(engine.evaluateStructuredHit(team, burstQuery.setup, burstQuery.request).totals.all.value?.value, attack * burstRate * .5 * .6);
  }
  for (const rank of [1, 2]) for (const mode of ['none','four-winds','azure-fang']) {
    const team = prepare([{ id: 'actor', build: { ...b, constellation: rank } }, { id: 'other', element: 'pyro' }]);
    const extra = skill.hits.filter(h => h.id.startsWith('varka.c2.'));
    assert.deepEqual(extra.map(h => h.category), ['skill','charged']);
    for (const h of extra) {
      const { setup, request } = auditHit(b.character, skill, h);
      request.frame.factOverrides[0].facts['varka.stance'] = yes(true);
      request.frame.facts['varka.specialAttack'] = f({ kind: 'enum', value: mode });
      near(engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value, rank === 2 && h.id === 'varka.c2.' + mode ? attack * 8 * .45 : 0);
    }
  }
  const pyroTeam = prepare([{ id: 'actor', build: b }, { id: 'other', element: 'pyro' }]);
  const unknownParty = prepare([{ id: 'actor', build: b }, { id: 'unknown' }]);
  for (const [index, element, opposite] of [[12, 'pyro', 'left'], [13, 'anemo', 'right']]) {
    const hit = skill.hits.find(entry => entry.id === skill.id + '.param' + index);
    const { setup, request } = auditHit(b.character, skill, hit);
    setup.targets[0].inputs['resistance.' + element] = number('scalar', .4);
    request.frame.factOverrides[0].facts['varka.stance'] = yes(true);
    request.frame.facts.strikingHand = f({ kind: 'enum', value: opposite });
    const expected = attack * rate(index) * .5 * .6;
    near(engine.evaluateStructuredHit(pyroTeam, setup, request).totals.all.value?.value, expected);
    const pending = engine.evaluateStructuredHit(unknownParty, setup, request);
    if (index === 12) {
      assert.equal(pending.totals.all.state, 'unknown');
      assert.ok(pending.requiredInputs.some(input => input.key === 'partyPriorityElement' && input.scope === 'team'));
    } else {
      near(pending.totals.all.value?.value, expected);
    }
  }
});

test('Odette keeps one finale per event and selects the stellar ratio and attachment coefficient', async () => {
  const b = auditBuild(await catalog.get('characters', 'odette'), await catalog.get('weapons', 'dullblade'));
  const t = b.character.talents[1], final = t.hits.find(h => h.id === t.id + '.param3');
  const team = prepare([{ id: 'actor', build: b }]), atk = b.character.attributes.base.attack + b.weapon.baseAttack;
  const rate = n => t.parameters.find(p => p.id === 'param' + n).values[0];
  for (const [mode,count,coefficient] of [['none',0,1],['stellar-conduct',1,1.45],['stellar-conduct',12,2]]) {
    const { setup, request } = auditHit(b.character, t, final);
    request.frame.factOverrides[0].facts.radiance = f({ kind: 'enum', value: mode });
    request.frame.facts.stellarAttachments = number('count', count);
    const out = engine.evaluateStructuredHit(team, setup, request);
    assert.equal(out.outputs.length, 1);
    near(out.totals.all.value?.value, atk * rate(3) * coefficient * .9 * (1 + Math.min(.14, atk * .00007)));
    const dance = t.hits.find(h => h.id === t.id + '.param6');
    request.hit.hitId = setup.events[0].hitId = dance.id;
    near(engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value, mode === 'none' ? 0 : atk * rate(6) * coefficient * .9 * (1 + Math.min(.14, atk * .00007)));
  }
});

test('normal attack conversion and stance multipliers use the relevant skill and exclude invalid attacks', async () => {
  for (const [id,weapon,key,coefficient] of [['yoimiya','huntersbow','yoimiya.niwabi',4],['wriothesley','apprenticesnotes','wriothesley.chillingPenalty',1],['wanderer','apprenticesnotes','wanderer.windfavored',2]]) {
    const b = auditBuild(await catalog.get('characters', id), await catalog.get('weapons', weapon));
    const [t,e] = b.character.talents, team = prepare([{ id: 'actor', build: b }]);
    const raw = (b.character.attributes.base.attack + b.weapon.baseAttack) * t.parameters.find(p => p.id === 'param1').values[0] * .45;
    const skillRatio = e.parameters.find(p => p.id === 'param' + coefficient).values[0];
    for (const enabled of [false, true]) for (const hp of [.5, .51]) {
      const h = t.hits.find(h => h.id === id + '.normal.param1' + (id === 'yoimiya' && enabled ? '.pyro' : ''));
      const { setup, request } = auditHit(b.character, t, h);
      request.frame.factOverrides[0].facts[key] = yes(enabled);
      request.frame.factOverrides[0].facts.hpRatio = number('scalar', hp);
      near(engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value, raw * (enabled && (id !== 'wriothesley' || hp > .5) ? skillRatio : 1));
      if (enabled && id === 'yoimiya') {
        request.hit.hitId = setup.events[0].hitId = 'yoimiya.normal.param8';
        setup.events[0].category = t.hits.find(h => h.id === request.hit.hitId).category;
        near(engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value, 0);
      }
    }
  }
});

const inventoryFile = new URL('../../.references/artifacts_mona.json', import.meta.url);
test('two recorded equipment selections give Nahida a real team maximum of 800 and 1200', { skip: !existsSync(inventoryFile) }, async () => {
  const { createAccount } = await loadContentSchema('/src/web/src/domain/account.ts');
  const { previewMonaImport } = await loadContentSchema('/src/web/src/domain/mona-import.ts', [catalogPlugin()]);
  const { calculationArtifact } = await loadContentSchema('/src/web/src/domain/build-snapshot.ts', [catalogPlugin()]);
  const catalogSets = await Promise.all(catalog.inventory.sets.map(id => catalog.get('sets', id)));
  const holder = { ...await build('kaedeharakazuha', 'silverlight'), refinement: 5 };
  const contents = readFileSync(inventoryFile, 'utf8'), recording = JSON.parse(contents);
  const imported = await previewMonaImport(contents, createAccount(), catalogSets, holder.artifactMain);
  const bySource = new Map(imported.additions.map(item => [item.real.source.key, item.real]));
  const set = catalogSets.find(s => s.id === 'instructor');
  const collei = { ...await build('collei', 'huntersbow'), sets: [set], theoreticalSetSlots: set.slots.slice(0,4).map(slot => ({ slot, setId: set.id })) };
  const recipient = await build('lisa','apprenticesnotes'), support = await build('nahida','apprenticesnotes');
  for (const [indices, expected] of [[[0,0,98,30,72],800], [[11,31,98,0,9],1200]]) {
    const artifacts = ['flower','feather','sand','cup','head'].map((slot, i) => calculationArtifact(bySource.get('id:' + recording[slot][indices[i]].id)));
    const equipped = { ...holder, artifacts, sets: catalogSets.filter(set => artifacts.some(item => item.setId === set.id)) };
    const team = prepare([{ id: 'actor', build: recipient }, { id: 'support', build: support }, { id: 'holder', build: equipped }, { id: 'archer', build: collei }]);
    const t = recipient.character.talents[0], { setup, request } = auditHit(recipient.character, t, t.hits[0], 90);
    setup.events[0].timeMs = 7000;
    const skill = holder.character.talents.find(t => t.category === 'skill');
    for (const [i,timeMs] of [0,6000].entries()) setup.events.push({ id: 'skill-'+i, timeMs, order: i, kind: 'action', category: 'skill', skillId: skill.id, actorId: 'holder', targetIds: [], sourceEventIds: [], facts: {} });
    setup.events.push({ id: 'quicken', timeMs: 6100, order: 2, kind: 'reaction', reactionId: 'quicken', actorId: 'archer', targetIds:['enemy'], sourceEventIds: [], facts: {} });
    setup.stateFrames = [{ id:'instructor-field', eventId:'quicken', phase:'before', subject:{kind:'actor', id:'archer'}, facts:{onField:yes(true)} }];
    for (const id of ['holder','support','archer']) request.frame.factOverrides.push({subject:{kind:'actor',id},facts:{ onField:yes(false), 'nahida.inShrine':yes(false) }});
    const meadow = request.frame.factOverrides[0].facts;
    const read = id => {
      const result = engine.evaluateCombatBindings(team.program, engine.createStructuredCombatContext(team,setup), {
        em:{kind:'attribute',key:{namespace:'builtin',id:'attribute.elementalMastery',revision:'1'},actor:{role:'owner'},at:{kind:'current',phase:'same'}}
      },{...request.frame,ownerId:id,recipientId:id,contributorId:null,hit:null});
      assert.equal(result.outputs.em.state,'known',JSON.stringify(result.diagnostics));
      return result.outputs.em.value.value;
    };
    meadow['nahida.inShrine'] = yes(false);
    near(read('holder'),expected);
    const withoutShare = read('actor');
    meadow['nahida.inShrine'] = yes(true);
    near(read('actor')-withoutShare,Math.min(250,expected*.25));
    meadow.onField = yes(false);
    near(read('actor'),withoutShare);
    setup.stateFrames[0].facts.onField = yes(false);
    near(read('holder'),expected-120);
  }
});

test('Ayato grants normal attack damage to recipients in his garden through the last millisecond', async () => {
  const recipient = auditBuild(await catalog.get('characters', 'kaeya'), await catalog.get('weapons', 'dullblade'));
  const support = await build('kamisatoayato', 'dullblade');
  const team = prepare([{ id: 'actor', build: recipient }, { id: 'support', build: support }]);
  const t = recipient.character.talents[0], attack = recipient.character.attributes.base.attack + recipient.weapon.baseAttack;
  for (const category of ['normal', 'charged', 'plunge']) {
    const h = t.hits.find(hit => hit.category === category);
    const rate = t.parameters.find(p => p.id === h.id.split('.').at(-1)).values[0];
    for (const [inside, time] of [[true, 1], [false, 1], [true, 17999], [true, 18000]]) {
      const { setup, request } = auditHit(recipient.character, t, h);
      setup.events[0].timeMs = time;
      setup.events.unshift({ id: 'cast', kind: 'action', actorId: 'support', skillId: 'kamisatoayato.burst',
        targetIds: [], timeMs: 0, order: 0, sourceEventIds: [], facts: {} });
      request.frame.factOverrides[0].facts['kamisatoayato.inGarden'] = yes(inside);
      request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'support' }, facts: { 'kamisatoayato.inGarden': yes(!inside) } });
      const bonus = inside && time < 18000 && category === 'normal' ? .2 : 0;
      near(engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value, attack * rate * .45 * (1 + bonus));
    }
  }
});

test('Odette applies her burst to both stellar families once while active and excludes ordinary damage', async () => {
  const b = auditBuild(await catalog.get('characters', 'odette'), await catalog.get('weapons', 'dullblade'));
  const t = b.character.talents[1], team = prepare([{ id: 'actor', build: b }]);
  for (const [index, mode] of [[1, 'none'], [3, 'stellar-conduct'], [3, 'stellar-swirl']]) {
    const { setup, request } = auditHit(b.character, t, t.hits.find(h => h.id === t.id + '.param' + index));
    request.frame.factOverrides[0].facts.radiance = f({ kind: 'enum', value: mode });
    request.frame.facts.stellarAttachments = number('count', 1);
    const base = engine.evaluateStructuredHit(team, setup, request).totals.all.value?.value;
    assert.ok(base > 0);
    setup.events.unshift({ id: 'cast', kind: 'action', actorId: 'actor', skillId: 'odette.burst', targetIds: [],
      timeMs: 0, order: 0, sourceEventIds: [], facts: {} });
    for (const time of [1, 19999, 20000]) {
      setup.events[1].timeMs = time;
      const result = engine.evaluateStructuredHit(team, setup, request);
      assert.equal(result.outputs.length, 1);
      near(result.totals.all.value?.value, base * (index === 3 && time < 20000 ? 1.14 : 1));
    }
  }
});

test('Geo resonance reads the hitter and target at impact and expires without duplicate resistance reductions', async () => {
  const b = auditBuild(await catalog.get('characters', 'ningguang'), await catalog.get('weapons', 'apprenticesnotes'));
  const striker = auditBuild(await catalog.get('characters', 'noelle'), await catalog.get('weapons', 'wastergreatsword'));
  const strike = striker.character.talents[0].hits[0].id;
  const team = prepare([{ id: 'actor', build: b }, { id: 'striker', build: striker }, { id: 'pyro', element: 'pyro' }, { id: 'hydro', element: 'hydro' }]);
  const t = b.character.talents[0], h = t.hits.find(hit => hit.id === t.id + '.param1');
  const base = (b.character.attributes.base.attack + b.weapon.baseAttack) * t.parameters.find(p => p.id === 'param1').values[0] * .5;
  for (const [shielded, field, target, time, refresh, expected] of [
    [true, true, 'enemy', 0, false, .9], [true, true, 'enemy', 1, false, 1.05],
    [true, false, 'enemy', 1, false, .9], [false, true, 'enemy', 1, false, .9],
    [true, true, 'elsewhere', 1, false, .9], [true, true, 'enemy', 15000, false, .9],
    [true, true, 'enemy', 14999, true, 1.05], [true, true, 'enemy', 15100, true, .9],
  ]) {
    const { setup, request } = auditHit(b.character, t, h);
    setup.targets.push({ ...setup.targets[0], id: 'elsewhere' });
    setup.events[0].timeMs = time;
    const { namespace, id, revision } = striker.character;
    const source = engine.projectCalculationEvent({ id: 'strike', kind: 'damage', actor: 'striker', timeMs: 0, order: 2,
      damage: { hit: { definition: { group: 'characters', namespace, id, revision }, hitId: strike }, crit: 'noncritical', reaction: 'none',
        facts: [{ subject: { kind: 'actor', id: 'striker' }, values: { onField: yes(field), shielded: yes(shielded) } }] } }, striker);
    source.targetIds = [target];
    setup.events.push(source);
    if (refresh) setup.events.push({ ...source, id: 'refresh', timeMs: 100 });
    const result = engine.evaluateStructuredHit(team, setup, request);
    assert.equal(result.totals.all.state, 'known', JSON.stringify(result.diagnostics));
    near(result.totals.all.value.value, base * expected);
  }
});

test('four-piece bonuses use the wielder, current target, damage category and hit time', async () => {
  const groups = {
    characters: ['kaeya', 'noelle', 'xiangling', 'amber', 'lisa', 'collei', 'aether-dendro'],
    weapons: ['dullblade', 'wastergreatsword', 'beginnersprotector', 'huntersbow', 'apprenticesnotes'],
    sets: ['gladiatorsfinale', 'wandererstroupe', 'blizzardstrayer', 'deepwoodmemories', 'defenderswill', 'tenacityofthemillelith', 'vourukashasglow'],
  };
  const entities = Object.fromEntries(await Promise.all(Object.entries(groups).map(async ([kind, ids]) =>
    [kind, await Promise.all(ids.map(id => catalog.get(kind, id)))])));
  const audit = auditSetConditions(entities, engine);
  assert.equal(audit.rows.length, 403);
  assert.deepEqual(audit.rows.filter(row => row.issue), []);
});

test('Nicole projections use the dealer’s ATK, level, element and crit, and Nicole’s burst rank and constellation', async () => {
  const nicole = await build('nicole', 'apprenticesnotes');
  const k = auditBuild(await catalog.get('characters','kaeya'), await catalog.get('weapons','dullblade'));
  const talent = nicole.character.talents[2];
  const attack = k.character.attributes.base.attack + k.weapon.baseAttack;
  for (const rank of [0, 1]) {
    const team = prepare([{ id: 'actor', build: { ...nicole, constellation: rank } }, { id: 'dealer', build: k }]);
    for (const hit of talent.hits.filter(h => h.coordinated)) {
      const { setup, request } = auditHit(nicole.character, talent, hit);
      setup.targets[0].inputs['resistance.cryo'] = number('scalar', .35);
      setup.targets[0].inputs['resistance.pyro'] = number('scalar', .7);
      request.frame.factOverrides[0].facts.onField = yes(false);
      request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'dealer' }, facts: { onField: yes(true), 'nicole.blessedDirection': yes(false) } });
      request.frame.facts[hit.coordinated.readyFact] = yes(true);
      request.critMode = 'critical';
      const result = engine.evaluateStructuredHit(team, setup, request);
      assert.equal(result.outputs[0].actorId, 'dealer');
      const multiplier = hit.id === 'nicole.c1.unity' ? rank === 1 ? 6 : 0 : 1.8;
      near(result.totals.all.value.value, attack * multiplier * .5 * .65 * 1.5);
      request.frame.factOverrides.pop();
      assert.equal(engine.evaluateStructuredHit(team, setup, request).totals.all.state, 'unknown');
      request.frame.facts[hit.coordinated.readyFact] = yes(false);
      near(engine.evaluateStructuredHit(team, setup, request).totals.all.value.value, 0);
    }
  }
});

test('Nicole shares four projections per cast across dealers, separates C1, and replays a manual impact once', async () => {
  const { createEmptyProject, importProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { packDocument } = await loadFixtureModule('/src/web/src/domain/content-document.ts');
  const { addActorFromBuild, addFieldChange, addSkillAction, addSkillHit, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const project = createEmptyProject();
  project.enemy = { ...defaultEnemy(), level: 1 };
  const n = await build('nicole','apprenticesnotes');
  const kaeya = auditBuild(await catalog.get('characters','kaeya'), await catalog.get('weapons','dullblade'));
  const lisa = auditBuild(await catalog.get('characters','lisa'), await catalog.get('weapons','apprenticesnotes'));
  const owner = addActorFromBuild(project, { ...n, constellation: 1 }), first = addActorFromBuild(project, kaeya), second = addActorFromBuild(project, lisa);
  // Isolate the projection from the optional 300 ATK granted by Blessed Direction.
  project.effectRevisions = [{ instanceId: engine.calculationEffectInstanceId(owner, { namespace: 'builtin', id: 'nicole.a0.blessed-direction', revision: '1' }, null), disabled: true }];
  const mode = { crit: 'noncritical', reaction: 'none' };
  const cast = addSkillAction(project, owner, 'nicole.burst', 0);
  const trigger = (dealer, character, time, onField = true) => {
    const id = addSkillHit(project, dealer, character + '.normal', 0, time, { ...mode, facts: [
      { subject: { kind: 'actor', id: dealer }, values: { onField: yes(onField) } }] });
    project.timeline.find(entry => entry.id === id).coordinatedMode = mode;
    return id;
  };
  trigger(first,'kaeya',1,false);
  const source = trigger(first,'kaeya',2);
  trigger(second,'lisa',3001); trigger(second,'lisa',3002);
  trigger(first,'kaeya',6002); trigger(second,'lisa',9002);
  const fifth = trigger(second,'lisa',12002); trigger(first,'kaeya',20000);
  const manual = addSkillHit(project, owner, 'nicole.burst', 1, 2, mode);
  addSkillAction(project,owner,'nicole.burst',21000);
  trigger(first,'kaeya',21001);
  addFieldChange(project,owner,21999,{energy:60});
  const again = addSkillAction(project, owner, 'nicole.burst', 22000);
  trigger(first,'kaeya',22001); trigger(second,'lisa',42000);
  const saved = JSON.stringify(packDocument('axis', project));
  const result = engine.evaluateTimeline(importProject(saved));
  const projected = result.plan.timeline.filter(entry => entry.damage?.hit.hitId === 'nicole.burst.projection');
  assert.deepEqual(projected.map(r => r.timeMs), [2,3002,6002,9002,22001]);
  assert.equal(projected[0].id, manual);
  assert.deepEqual(projected[0].sourceEventIds, [cast, source]);
  assert.ok(projected[4].sourceEventIds.includes(again));
  assert.deepEqual(result.plan.timeline.filter(entry => entry.damage?.hit.hitId === 'nicole.c1.unity').map(r => r.timeMs), [2,6002,12002,20000,42000]);
  for (const [i, entry] of projected.entries()) {
    const point = result.points.find(point => point.id === entry.id);
    const dealer = i === 1 || i === 3 ? second : first, b = dealer === second ? lisa : kaeya;
    assert.equal(point.real.structured.outputs[0].actorId, dealer);
    near(point.value, (b.character.attributes.base.attack + b.weapon.baseAttack) * 1.8 * .5 * .9);
  }
  assert.equal(JSON.stringify(packDocument('axis',project)), saved);
  const amended = importProject(saved);
  const repeated = addSkillHit(amended, owner, 'nicole.burst', 1, 2, mode);
  const overCap = addSkillHit(amended, owner, 'nicole.burst', 1, 12002, mode);
  amended.timeline.find(entry => entry.id === overCap).sourceEventIds = [cast, fifth];
  amended.objective = { damageIds: [manual, repeated, overCap] };
  const checked = engine.evaluateTimeline(amended);
  assert.ok(!checked.points.some(p => p.id === repeated));
  assert.equal(checked.points.find(p => p.id === overCap).value, 0);
  near(checked.objectiveValue, result.points.find(p => p.id === manual).value);
});

test('Favonius particles follow the collector and each party member’s recharge, energy cap and seed on replay', async () => {
  const { createEmptyProject, importProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { packDocument } = await loadFixtureModule('/src/web/src/domain/content-document.ts');
  const { addActorFromBuild, addSkillHit, addParticlePickup, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const p = createEmptyProject();
  p.enemy = defaultEnemy();
  p.seed = 0;
  const builds = await Promise.all([['kaeya','favoniussword'],['lisa','apprenticesnotes'],['amber','huntersbow'],['noelle','wastergreatsword']]
    .map(async ([c,w]) => auditBuild(await catalog.get('characters',c), await catalog.get('weapons',w))));
  const members = builds.map(b => addActorFromBuild(p,b));
  const [owner, collector] = members;
  const facts = members.map((id,i) => ({ subject: { kind: 'actor', id }, values: { onField: yes(i === 0), currentEnergy: number('energy', i === 1 ? 79 : 0) } }));
  facts.push({ subject: { kind: 'event' }, values: { targetsDamaged: number('count', 1) } });
  const hit = addSkillHit(p,owner,'kaeya.normal',0,1,{ crit: 'critical', reaction: 'none', facts });
  const pickup = addParticlePickup(p,collector,hit,1000);
  assert.throws(() => addParticlePickup(p,owner,hit,1001));
  const file = JSON.stringify(packDocument('axis',p));
  const reopen = importProject(file);
  const run = engine.evaluateTimeline(reopen);
  const gains = run.combatChanges.filter(change => change.source === pickup);
  assert.equal(gains.length,4);
  for (const [i,id] of members.entries()) {
    const change = gains.find(r => r.recipient === id);
    assert.equal(change.status,'applied');
    const expected = i === 1 ? 6 : 3.6 * (i === 0 ? 1 + builds[0].weapon.baseStat * builds[0].weapon.statCurve[1] : 1);
    near(change.energyGain,expected);
    near(change.energyAfter,i === 1 ? 80 : expected);
  }
  assert.deepEqual(engine.evaluateTimeline(reopen).combatChanges,run.combatChanges);
  assert.equal(JSON.stringify(packDocument('axis',p)),file);
  reopen.timeline.find(r => r.id === hit).damage.facts.at(-1).values.triggerRoll = f(null);
  const masked = engine.evaluateTimeline(reopen);
  assert.ok(masked.combatChanges.every(row => row.status === 'unknown' && row.missing.includes('triggerRoll')));
  assert.equal(masked.status,'partial');
  assert.equal(masked.points[0].value,run.points[0].value);
});

test('Sacrificial Fragments frees one recovering Sucrose charge and preserves the next recharge duration', async () => {
  const { createEmptyProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addSkillHit, addSkillAction, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const p = createEmptyProject();
  p.enemy = defaultEnemy();
  const source = addActorFromBuild(p,{ ...await build('sucrose','sacrificialfragments'), constellation: 1 });
  for (const time of [0,1000]) addSkillAction(p,source,'sucrose.skill',time);
  const facts = [{ subject: { kind: 'actor', id: source }, values: { onField: yes(true) } },
    { subject: { kind: 'event' }, values: { targetsDamaged: number('count',1), triggerRoll: number('scalar',0) } }];
  const id = addSkillHit(p,source,'sucrose.skill',0,2000,{ crit: 'noncritical', reaction: 'none', facts });
  addSkillHit(p,source,'sucrose.normal',0,3000,{ crit: 'critical', reaction: 'none', facts });
  const result = engine.evaluateTimeline(p);
  assert.deepEqual(result.combatChanges.filter(r=>r.kind==='skill-charge').map(r=>[r.status,r.chargesAfter]),[['applied',1],['applied',0]]);
  const resets=result.combatChanges.filter(r=>r.kind==='reset-skill');
  assert.equal(resets.length,1);
  assert.equal(resets[0].source,id);
  assert.equal(resets[0].status,'applied');
  assert.equal(resets[0].cooldownAfterMs,15000);
});

test('all nine transformative reactions use the owner level and EM, the damage element and the field’s reaction filter', async () => {
  const { assembleCalculationLibrary } = await loadFixtureModule('/src/game-data/src/calculation-library.mjs');
  const local = name => readContentSource(new URL('../../src/game-data/data/calculation/' + name + '.json',import.meta.url));
  const { createEmptyProject, importProject } = await loadFixtureModule('/src/web/src/domain/workbench-project.ts');
  const { packDocument } = await loadFixtureModule('/src/web/src/domain/content-document.ts');
  const { addActorFromBuild, addTransformativeReaction, defaultEnemy } = await loadFixtureModule('/src/web/src/domain/real-project.ts');
  const p = createEmptyProject(), rules = assembleCalculationLibrary(local('common'),local('reactions'),[]);
  p.enemy = defaultEnemy();
  p.enemy.resistances.hydro = .4; p.enemy.resistances.dendro = .2;
  const b = auditBuild(await catalog.get('characters','sucrose'),await catalog.get('weapons','magicguide'));
  const owner = addActorFromBuild(p,b);
  const domains = local('battle-scenes');
  p.sceneEffects = [{definition:domains.find(s => s.name.includes('扩散与星扩散')),startMs:0,endMs:100},
    {definition:domains.find(s => s.name.includes('绽放与月绽放')),startMs:100,endMs:200}];
  const states = [['burning','pyro',.25],['superconduct','cryo',1.5],['swirl','hydro',.6],['electro-charged','electro',2],['shatter','physical',3],
    ['overloaded','pyro',2.75],['bloom','dendro',2],['burgeon','dendro',3],['hyperbloom','dendro',3]];
  const checks = [], em = b.weapon.baseStat * b.weapon.statCurve[1];
  for (const [family,element,coefficient] of states) for (const time of [99,100,200]) {
    const id = addTransformativeReaction(p,owner,family,element,time,rules);
    const bonus = time === 99 && family === 'swirl' ? 2 : time === 100 && ['bloom','burgeon','hyperbloom'].includes(family) ? 1.5 : 0;
    checks.push([id,17.165606 * coefficient * (1+16*em/(2000+em)+bonus) * (1-p.enemy.resistances[element])]);
  }
  const result = engine.evaluateTimeline(importProject(JSON.stringify(packDocument('axis',p))));
  for (const [id,expected] of checks) {
    const point = result.points.find(row => row.id === id);
    assert.equal(point.real.structured.outputs[0].actorId,owner);
    assert.equal(point.real.structured.totals.all.state,'known',JSON.stringify(point.real.diagnostics));
    near(point.value,expected);
  }
});

test('Scarlet Proof starts only after its holder triggers Stellar Swirl, expires at ten seconds and respects a hit-local observation', async () => {
  const base = await build('sucrose','apprenticesnotes'), peer = await build('kaeya','dullblade'), set = await catalog.get('sets','scarletproof');
  const b = { ...base,sets:[set],theoreticalSetSlots:set.slots.slice(0,4).map(slot => ({slot,setId:set.id})) };
  const team = prepare([{id:'actor',build:b},{id:'support',build:peer}]), skill=b.character.talents[0];
  for (const [actor,family,time,override,applies] of [['actor','stellar-swirl',1,undefined,true],['support','stellar-swirl',1,undefined,false],
    ['actor','lunar-charged',1,undefined,false],['actor','stellar-swirl',9999,undefined,true],['actor','stellar-swirl',10000,undefined,false],
    ['actor','stellar-swirl',9999,false,false],['support','lunar-charged',10001,true,true]]) {
    const { setup, request }=auditHit(b.character,skill,skill.hits[0]);
    setup.events[0].timeMs=time;
    setup.events.unshift({id:'cause',kind:'reaction',reactionId:family,actorId:actor,targetIds:['enemy'],timeMs:0,order:0,sourceEventIds:[],facts:{}});
    if(override!==undefined) request.frame.factOverrides[0].facts['scarletproof.stellarWindow']=yes(override);
    const context=engine.createStructuredCombatContext(team,setup), frame={...request.frame,ownerId:'actor',recipientId:'actor',contributorId:null,hit:null};
    const result=engine.evaluateCombatBindings(team.program,context,Object.fromEntries(['critRate','reaction.stellar-swirl.damageBonus'].map(key =>
      [key,{kind:'attribute',actor:{role:'owner'},key:{namespace:'builtin',id:'attribute.'+key,revision:'1'},at:{kind:'current',phase:'same'}}])),frame);
    near(result.outputs.critRate.value.value,.05 + (applies ? .16 : 0));
    near(result.outputs['reaction.stellar-swirl.damageBonus'].value.value,applies ? .4 : 0);
  }
});
