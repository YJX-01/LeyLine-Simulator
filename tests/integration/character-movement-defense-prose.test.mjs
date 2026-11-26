import { characterReactionUtilityNumbers } from '../../tools/lib/character-reaction-utility-numbers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { characterResistanceBonusProofs } from '../../tools/lib/character-resistance-bonus-proofs.mjs';
import { makeCharacterMovementDefenseProse } from '../../tools/lib/character-movement-defense-prose.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { auditBuild, bool, auditHit, number, setGateFacts } from '../../tools/lib/roster-audit-settings.mjs';
import { assembleHit } from '../../src/game-data/src/character-hits.mjs';
import { readFileSync } from 'node:fs';

test('source resistance requires the audited hit and expiry for its exact clause', async () => {
  const [schemas, engine] = await Promise.all([loadContentSchema(), loadContentSchema('/src/engine/src/index.ts')]);
  const read = name => readCalculationData('src/game-data/data/' + name + '.json');
  const characters = ['ganyu', 'kaeya'].map(id => read('characters/' + id));
  const weapons = ['huntersbow', 'dullblade'].map(id => read('weapons/' + id));
  const compiled = engine.compileCalculation(assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'),
    [...characters, ...weapons]));
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  const entities = { characters: characters.map(linker.character), weapons: weapons.map(linker.weapon), sets: [] };
  const listed = {
    entity: 'ganyu', field: '/constellations/0/buffs/0/modifiers/0', id: 'ganyu.c1.frostflake-shred',
    target: 'target.resistance.cryo', role: 'target', listed: true,
  };
  const evidence = characterResistanceBonusProofs(entities, { calculator: { buffs: [listed] } }, engine);
  assert.equal(evidence.length, 1);
  const statement = '二段蓄力重击的霜华矢或霜华绽发命中敌人时，会使敌人的冰元素抗性降低15%，持续6秒';
  const evaluate = records => makeCharacterMovementDefenseProse(entities, { registeredModifierEvidence: records });
  const lookup = evaluate(evidence);
  assert.equal(lookup('ganyu', '/constellations/0', statement).proofs[0].field, listed.field);
  assert.deepEqual(lookup('ganyu', '/constellations/0', statement.replace('6秒', '8秒')), { proofs: [], parts: [] });
  assert.deepEqual(lookup('ganyu', '/constellations/1', statement), { proofs: [], parts: [] });
  const withoutExpiry = evidence.map(row => ({ ...row, cases: row.cases.filter(probe => probe.settings.timeMs !== 6000) }));
  assert.deepEqual(evaluate(withoutExpiry)('ganyu', '/constellations/0', statement), { proofs: [], parts: [] });
});

test('Kazuha and Sucrose share mastery without passing on earlier percentage conversions', async () => {
  const { number } = await import('../../tools/lib/roster-audit-settings.mjs');
  const catalog = await createRuntimeCatalog({characters:['kaedeharakazuha','sucrose','nilou','amber'],
    weapons:['keyofkhajnisut','dullblade','magicguide','huntersbow'],sets:[],actions:[]});
  const { evaluateTimeline } = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addFieldChange, addSkillHit, addTransformativeReaction, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  async function member(character, weapon, advanced = false) {
    return addActorFromBuild(project, {...auditBuild(await catalog.get('characters',character),await catalog.get('weapons',weapon)),
      ...(advanced ? {level:90, ascension:6} : {})});
  }
  const nilou = await member('nilou','keyofkhajnisut'), kazuha = await member('kaedeharakazuha','dullblade',true);
  const sucrose = await member('sucrose','magicguide',true), amber = await member('amber','huntersbow');
  const mode = {crit:'noncritical',reaction:'none'};
  const contact = {...mode,facts:[{subject:{kind:'event'},values:{targetsHit:number('count',1),targetsDamaged:number('count',1)}}]};
  const rules = assembleCalculationLibrary(readCalculationData('src/game-data/data/calculation/common.json'),
    readCalculationData('src/game-data/data/calculation/reactions.json'),[]);
  addFieldChange(project,nilou,0,{mode});
  const initial = addSkillHit(project,sucrose,'sucrose.normal',0,20500,mode);
  const keyHits = [21000,21300,21600].map((time,i) => addSkillHit(project,nilou,'nilou.skill',i*2,time,contact));
  addFieldChange(project,sucrose,23000,{mode});
  const shared = addSkillHit(project,sucrose,'sucrose.skill',0,23100,contact);
  addFieldChange(project,kazuha,24500,{mode});
  const swirler = addSkillHit(project,kazuha,'kaedeharakazuha.normal',0,24600,mode);
  const swirl = addTransformativeReaction(project,kazuha,'swirl','pyro',24700,rules);
  addFieldChange(project,amber,26000,{mode});
  const shot = addSkillHit(project,amber,'amber.normal',6,26100,mode);
  const output = evaluateTimeline(project), point = id => output.points.find(p => p.id === id);
  const original = point(initial).real.panel.stats.elementalMastery;
  const keyGrant = point(shared).real.panel.stats.elementalMastery - original;
  const total = point(swirler).real.panel.stats.elementalMastery;
  assert.ok(original > 0 && keyGrant > 0);
  assert.ok(Math.abs(total - (115.2 + original * .2 + keyGrant)) < 1e-9);
  assert.ok(Math.abs(point(shot).real.panel.attributes.pyroBonus - 115.2 * .0004) < 1e-9);
  const control = structuredClone(project);
  control.timeline = control.timeline.filter(row => !keyHits.includes(row.id) && row.id !== shared);
  const controlSwirl = evaluateTimeline(control).points.find(p => p.id === swirl);
  const reactionBonus = em => 1 + 16 * em / (2000 + em);
  assert.ok(Math.abs(point(swirl).value / controlSwirl.value - reactionBonus(total) / reactionBonus(115.2)) < 1e-9);
});

test('four recorded sources share the 90% defense-reduction cap on their target', async () => {
  const catalog=await createRuntimeCatalog(), engine=await loadContentSchema('/src/engine/src/index.ts');
  const domain=await loadContentSchema('/src/web/src/domain/real-project.ts'), work=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const project=work.createEmptyProject(); project.enemy=domain.defaultEnemy();
  const actors={};
  for(const [id,weapon,rank] of [['kamisatoayaka','dullblade',4],['nahida','apprenticesnotes',2],['klee','apprenticesnotes',2],['lisa','apprenticesnotes',0]]) {
    const character=await catalog.get('characters',id), equipment=await catalog.get('weapons',weapon);
    actors[id]=domain.addActorFromBuild(project,{...auditBuild(character,equipment),level:90,ascension:6,constellation:rank});
  }
  const hit=(actor,skill,id,time,extra={})=>{
    const character=project.candidate.actors.find(member=>member.id===actors[actor]).build.character;
    const talent=character.talents.find(item=>item.id===skill),index=talent.hits.findIndex(item=>item.id===id);
    assert.ok(index>=0);
    return domain.addSkillHit(project,actors[actor],skill,index,time,{crit:'noncritical',reaction:'none',...extra});
  };
  const sources={klee:hit('klee','klee.skill','klee.skill.param4',1000),
    ayaka:hit('kamisatoayaka','kamisatoayaka.burst','kamisatoayaka.burst.param1',2000),
    lisa:hit('lisa','lisa.burst','lisa.burst.param1',3000)};
  domain.addFieldChange(project,actors.lisa,3500,{mode:{crit:'noncritical',reaction:'none'}});
  const target=active=>[{subject:{kind:'target',id:'target'},values:{'nahida.seedMark':bool(active),'nahida.seedQuicken':bool(active)}}];
  const damage=hit('lisa','lisa.normal','lisa.normal.param1',4000,{facts:target(true)});
  const observed=setting=>{
    const copy=structuredClone(project);
    copy.timeline=copy.timeline.filter(row=>!Object.entries(sources).some(([key,id])=>row.id===id&&!setting.includes(key)));
    copy.timeline.find(row=>row.id===damage).damage.facts=target(setting.includes('nahida'));
    const result=engine.evaluateTimeline(copy), point=result.points.find(row=>row.id===damage);
    assert.equal(point.real.structured.totals.all.state,'known');
    const reduction=point.real.structured.trace.find(row=>row.kind==='attribute'&&row.nodeId==='target.defenseReduction');
    assert.equal(reduction?.state,'known');
    return {value:point.value,reduction:reduction.value.value};
  };
  const neutral=observed([]).value;
  for(const [key,reduction] of [['klee',.23],['ayaka',.3],['lisa',.15],['nahida',.3]]) {
    const result=observed([key]);
    assert.ok(Math.abs(result.reduction-reduction)<1e-10,key);
    assert.ok(Math.abs(result.value-neutral*2/(2-reduction))<1e-8,key);
  }
  const combined=observed(['klee','ayaka','lisa','nahida']);
  assert.ok(Math.abs(combined.reduction-.98)<1e-10);
  assert.ok(Math.abs(combined.value-neutral*2/1.1)<1e-8);
});

test('Linnea catalogue uses both confirmed C6 stacks for a real Zibai lunar hit', async () => {
  const catalog = await createRuntimeCatalog({ characters: ['linnea', 'zibai'], weapons: ['huntersbow', 'dullblade'], sets: [], actions: [] });
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const linnea = await catalog.get('characters', 'linnea'), zibai = await catalog.get('characters', 'zibai');
  const holder = auditBuild(linnea, await catalog.get('weapons', 'huntersbow'));
  const recipient = auditBuild(zibai, await catalog.get('weapons', 'dullblade'));
  const talent = zibai.talents.find(row => row.id === 'zibai.burst');
  const hit = talent.hits.find(row => row.id === 'zibai.burst.param2');
  assert.equal(hit.damage['lunar-crystallize'] !== undefined, true);
  const defense = linnea.attributes.base.defense;
  function evaluate(rank, ready, resistance = .1) {
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build: recipient }, { id: 'linnea', build: { ...holder, constellation: rank } }]);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.diagnostics));
    const { setup, request } = auditHit(zibai, talent, hit, 90);
    setup.targets[0].inputs['resistance.geo'] = number('scalar', resistance);
    setGateFacts(linnea, request.frame, { fullMoonsign: false, ...(ready === undefined ? {} : { 'linnea.catalogueConsumeReady': ready }) });
    request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'linnea' }, facts: { onField: bool(false) } });
    return engine.evaluateStructuredHit(prepared.team, setup, request);
  }
  const read = (rank, ready, resistance) => evaluate(rank, ready, resistance).totals.all.value?.value;
  const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-8, `${a} != ${b}`);
  near(read(0, true), read(0, false));
  near(read(1, true) - read(1, false), defense * .75 * .9);
  near(read(5, true) - read(5, false), defense * .75 * .9);
  near(read(6, true) - read(6, false), defense * 2.25 * .9);
  near(read(6, true, .3) - read(6, false, .3), defense * 2.25 * .7);
  const missing = evaluate(6, undefined);
  assert.equal(missing.totals.all.state, 'unknown');
  assert.ok(missing.requiredInputs.some(input => input.key === 'linnea.catalogueConsumeReady'));

  const own = engine.prepareStructuredBuilds([{ id: 'actor', build: { ...holder, constellation: 6 } }]);
  const ownSkill = linnea.talents.find(row => row.id === 'linnea.skill');
  const hammer = ownSkill.hits.find(row => row.id === 'linnea.skill.param2');
  const ownHammer = ready => {
    const { setup, request } = auditHit(linnea, ownSkill, hammer, 90);
    setGateFacts(linnea, request.frame, { fullMoonsign: false, 'linnea.nearMoondrift': true, 'linnea.catalogueConsumeReady': ready });
    return engine.evaluateStructuredHit(own.team, setup, request).totals.all.value?.value;
  };
  near(ownHammer(true) - ownHammer(false), defense * 2.25 * .9);

  // The owner's megaton uses the actual consumed count, not a second ally stack.
  for (const rank of [1, 6]) {
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build: { ...holder, constellation: rank } }]);
    const skill = linnea.talents.find(row => row.id === 'linnea.skill'), megaton = skill.hits.find(row => row.id === 'linnea.skill.param3');
    const measure = (spent, ready) => {
      const { setup, request } = auditHit(linnea, skill, megaton, 90);
      setGateFacts(linnea, request.frame, { fullMoonsign: false, 'linnea.ultimateForm': true,
        'linnea.catalogueConsumeReady': ready, 'linnea.megatonCatalogueSpent': spent });
      const result = engine.evaluateStructuredHit(prepared.team, setup, request);
      if (!result.totals.all.value) throw new Error(JSON.stringify({ rank, spent, ready, diagnostics: result.diagnostics, required: result.requiredInputs }));
      return result.totals.all.value.value;
    };
    const baseline = measure(0, false), count = rank === 6 ? 10 : 5, perStack = rank === 6 ? 2.25 : 1.5;
    near(measure(count, false) - baseline, defense * count * perStack * .9);
    near(measure(count, true), measure(count, false));
  }
});

test('Linnea shared grant audit uses actual Zibai lunar hit and actual consumed stack count', async () => {
  const catalog = await createRuntimeCatalog({ characters: ['linnea', 'zibai'], weapons: ['huntersbow', 'dullblade'], sets: [], actions: [] });
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const linnea = await catalog.get('characters', 'linnea'), zibai = await catalog.get('characters', 'zibai');
  const entities = { characters: [linnea, zibai], weapons: [await catalog.get('weapons', 'huntersbow'), await catalog.get('weapons', 'dullblade')], sets: [] };
  const buffs = [];
  for (const index of [0, 5]) for (const [i, buff] of linnea.metadata.constellations[index].buffs.entries()) {
    if (!buff.id.includes('catalogue-')) continue;
    buffs.push({ entity: 'linnea', field: `/constellations/${index}/buffs/${i}/modifiers/0`, id: buff.id,
      target: 'attribute.reaction.lunar.flatBaseBonus', role: buff.recipient ?? 'owner', listed: true });
  }
  const rows = characterReactionUtilityNumbers(entities, { calculator: { buffs }, registeredModifierEvidence: [] }, engine);
  assert.equal(rows.length, 4, JSON.stringify(rows));
  const ordinary = rows.find(row => row.id === 'linnea.c6.catalogue-ordinary');
  assert.ok(ordinary.cases.some(row => row.settings.recipient === 'zibai' && row.settings.hit.suffix === 'burst.param2' && Math.abs(row.actual - row.expected) < 1e-8));
  const megaton = rows.find(row => row.id === 'linnea.c6.catalogue-megaton');
  assert.ok(megaton.cases.some(row => row.settings.values['linnea.megatonCatalogueSpent'] === 10 && Math.abs(row.actual - row.expected) < 1e-8));
});
