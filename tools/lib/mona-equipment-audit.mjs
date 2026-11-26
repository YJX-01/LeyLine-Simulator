import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readContentSource } from './content-source.mjs';
import { probeMonaSkills } from './mona-inventory-probes.mjs';
import { auditBuild, auditHit, bool, setAuditDefaults, number } from './roster-audit-settings.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { createRuntimeCatalog } from './runtime-catalog.mjs';

// --- mona-equipment-hit-audit.mjs ---
const source = '.references/mona-community/beta-data/equipment-damage-events.mjs';
const weapons = [
  ['Messenger', 'messenger', 'Amber', 'charged'], ['SkywardSpine', 'skywardspine', 'Xiangling', 'normal'],
  ['Frostbearer', 'frostbearer', 'Lisa', 'normal'], ['DragonspineSpear', 'dragonspinespear', 'Xiangling', 'normal'],
  ['Halberd', 'halberd', 'Xiangling', 'normal'], ['PrizedIsshinBlade', 'prizedisshinblade-01', 'Bennett', 'normal'],
  ['SwordOfNarzissenkreuz', 'swordofnarzissenkreuz', 'Bennett', 'normal'], ['SkywardAtlas', 'skywardatlas', 'Lisa', 'normal'],
  ['EyeOfPerception', 'eyeofperception', 'Lisa', 'normal'], ['FilletBlade', 'filletblade', 'Bennett', 'normal'],
  ['SwordOfDescension', 'swordofdescension', 'Bennett', 'normal'], ['SkywardBlade', 'skywardblade', 'Bennett', 'normal'],
  ['CursedBlade', 'kagotsurubeisshin', 'Bennett', 'normal'], ['AshGravenDrinkingHorn', 'ashgravendrinkinghorn', 'Lisa', 'normal'],
  ['TheFlute', 'theflute', 'Bennett', 'normal'],
];
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

/** Probe published equipment event outputs; scaling agreement is not proof of trigger semantics. */
export async function auditMonaEquipmentHits(leylineRows) {
  const { equipmentDamageEvents } = await import('../../.references/mona-community/beta-data/equipment-damage-events.mjs');
  function ownerEvents(weapon, refinement, { owner, count, role, onField, category, weakpoint, enemyCount = 1 }, cryoTeammate) {
    const profiles = [{ character: { name: owner }, weapon: { name: weapon, refine: refinement } }];
    if (cryoTeammate) profiles.push({ character: { name: 'Kaeya' }, weapon: { name: 'DullBlade', refine: 1 } });
    const events = Array.from({ length: count }, (_, i) => ({ role, onField, category, weakpoint, time: 1 + i, rootOrder: i, order: i }));
    const rotation = { events, heals: [], duration: 30, endHit: 'include', lastCast: () => weapon === 'SkywardBlade' ? 0 : -Infinity };
    return equipmentDamageEvents(profiles, profiles.map(() => []), rotation, () => 0, { enemy_count: enemyCount, damage_scope: 'all' })
      .procs.filter(event => event.role === 0);
  }
  const rows = [], observations = [];
  for (const [monaWeapon, entity, owner, category] of weapons) {
    const document = readContentSource(new URL('../../src/game-data/data/weapons/' + entity + '.json', import.meta.url));
    const hits = leylineRows.filter(row => row.entity === entity && row.subject === 'equipment-hit');
    const cryoWeapon = ['Frostbearer', 'DragonspineSpear'].includes(monaWeapon);
    const scenarios = cryoWeapon ? [
      { name: 'no-cryo-teammate', cryo: false, enemyCryo: 'unspecified' },
      { name: 'cryo-teammate', cryo: true, enemyCryo: 'unspecified' },
    ] : [{ name: 'trigger', cryo: false, enemyCryo: 'unspecified' }];
    for (const scenario of scenarios) for (let refinement = 1; refinement <= document.maxRefinement; refinement++) {
      const count = monaWeapon === 'TheFlute' ? 5 : 1;
      const weakpoint = monaWeapon === 'Messenger';
      let procs;
      try { procs = ownerEvents(monaWeapon, refinement, { owner, count, role: 0, onField: true, category, weakpoint }, scenario.cryo); }
      catch (error) { rows.push({ entity, monaWeapon, scenario: scenario.name, refinement, status: 'probe-error', error: String(error?.message ?? error) }); continue; }
      const branch = cryoWeapon ? hits.find(hit => hit.binding.hitId.endsWith(scenario.cryo ? '.icicle-cryo' : '.icicle')) : hits[0];
      const ratio = branch?.binding.definition.base?.inputs?.ratio;
      const expected = typeof ratio === 'number' ? ratio : ratio?.refinement?.[refinement - 1];
      const expectedStat = branch?.binding.definition.base?.inputs?.attribute?.stat;
      const stat = expectedStat === 'attack' ? 'atk' : expectedStat;
      const numbersMatch = procs.length > 0 && procs.every(proc => close(proc.ratio, expected) && proc.stat === stat);
      rows.push({ entity, revision: document.revision, monaWeapon, refinement, scenario: scenario.name,
        input: { owner, category, onField: true, weakpoint, events: count,
          cryoTeammate: scenario.cryo, enemyCryo: scenario.enemyCryo, lastBurst: monaWeapon === 'SkywardBlade' ? 0 : null, enemy_count: 1, damage_scope: 'all' },
        mona: { source, events: procs.map(({ ratio, stat, probability, label, time, forceCritical, targetCount }) =>
          ({ ratio, stat, probability: probability ?? 1, label, time, forceCritical: forceCritical ?? false, targetCount: targetCount ?? null })) },
        leyline: branch ? { id: branch.id, source: branch.source, hitId: branch.binding.hitId, ratio: expected, stat: expectedStat,
          when: branch.binding.definition.when, critical: branch.binding.definition.critical ?? 'normal' } : null,
        status: !branch ? 'missing-leyline-hit' : !procs.length ? 'no-proc' : numbersMatch ? 'scaling-match' : 'scaling-mismatch',
        limitations: cryoWeapon ? ['Mona selects by Cryo team membership; LeyLine selects by target Cryo aura. These inputs are not equivalent.',
          'Enemy aura is unspecified in this probe; matching ratios do not validate the branch condition.']
          : ['Event ratio and stat only; proc probability, trigger, cooldown, timing and full damage require independent validation.'] });
    }
    const variants = [
      { name: 'repeated-owner-hits', owner, role: 0, onField: true, category, count: 5, weakpoint: true },
      { name: 'off-field-owner-hit', owner, role: 0, onField: false, category, count: 1, weakpoint: true },
      { name: 'other-character-hit', owner, role: 1, onField: true, category, count: 1, weakpoint: true },
      ...(monaWeapon === 'Messenger' ? [{ name: 'no-weakpoint', owner, role: 0, onField: true, category, count: 1, weakpoint: false }] : []),
      ...(monaWeapon === 'SwordOfNarzissenkreuz' ? [{ name: 'arkhe-owner', owner: 'Furina', role: 0, onField: true, category, count: 1, weakpoint: true }] : []),
      ...(monaWeapon === 'EyeOfPerception' ? [{ name: 'three-enemies', owner, role: 0, onField: true, category, count: 1, weakpoint: true, enemyCount: 3 }] : []),
    ];
    for (const variant of variants) {
      try {
        const procs = ownerEvents(monaWeapon, 1, variant, true);
        observations.push({ entity, monaWeapon, scenario: variant.name, input: variant, source,
          events: procs.map(({ time, ratio, stat, probability, targetCount, forceCritical }) =>
            ({ time, ratio, stat, probability: probability ?? 1, targetCount: targetCount ?? null, forceCritical: forceCritical ?? false })) });
      } catch (error) { observations.push({ entity, monaWeapon, scenario: variant.name, input: variant, source, error: String(error?.message ?? error) }); }
    }
  }
  const summary = { weapons: weapons.length, scenarios: rows.length, observations: observations.length };

  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;
  return { source, rows, observations, summary };
}

const baseline = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
const equipmentHitDefinitions = {
  'mona:equipment-event:AshGravenDrinkingHorn': { leyline: 'weapon:ashgravendrinkinghorn:equipment-hit:/hits/0',
    owner: 'Barbara', category: 'normal', stat: 'hp', cooldown: 15, values: [0.4, 0.8], critical: false },
  'mona:equipment-event:Messenger': { leyline: 'weapon:messenger:equipment-hit:/hits/0',
    owner: 'Amber', category: 'charged', stat: 'atk', cooldown: 10, values: [1, 2], critical: true },
};
const closeEvidenceValue = (a, b, epsilon = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
const sharedInputs = [
  'src/schema/src/calculation/event.ts', 'src/schema/src/calculation/context.ts', 'src/schema/src/calculation/binding.ts',
  'src/schema/src/calculation/buffs.mjs', 'src/schema/src/content/calculation.ts',
  'src/schema/src/content/character-metadata.ts', 'src/schema/src/content/equipment-metadata.ts', 'src/schema/src/project/project.ts',
  'src/schema/src/calculation/hit-bindings.mjs', 'src/game-data/src/character-metadata.mjs', 'src/game-data/src/character-hits.mjs',
  'src/game-data/data/calculation/common.json', 'src/game-data/data/calculation/resonances.json',
  'src/engine/src/attributes/build.ts', 'src/engine/src/attributes/queries.ts', 'src/engine/src/calculation/templates.ts',
  'src/engine/src/calculation/templates-common.ts', 'src/engine/src/calculation/template-builder.ts',
  'src/engine/src/calculation/interpret.ts', 'src/engine/src/calculation/formula-ir.ts', 'src/engine/src/calculation/build-context.ts',
  'src/engine/src/calculation/project.ts', 'src/engine/src/calculation/coordinated-hits.ts',
  'src/engine/src/calculation/context.ts', 'src/engine/src/calculation/effects.ts', 'src/engine/src/effects/graph.ts',
  'src/web/src/domain/real-project.ts', 'tools/lib/roster-audit-settings.mjs', 'tools/lib/runtime-catalog.mjs',
  '.references/mona-community/beta-data/equipment-damage-events.mjs', '.references/mona-community/beta-data/equipment-combat-facts.mjs',
  '.references/mona-community/beta-data/equipment-healing-damage-rules.mjs', '.references/mona-community/beta-data/team-dps-config.mjs',
  '.references/mona-community/beta-data/team-dps-numeric-rules.mjs', '.references/mona-community/src/assets/_gen_character.js',
];
const subjectInputs = {
  'mona:equipment-event:AshGravenDrinkingHorn': ['src/game-data/data/weapons/ashgravendrinkinghorn.json',
    'src/game-data/data/characters/barbara.json', 'tools/lib/mona-equipment-audit.mjs'],
  'mona:equipment-event:Messenger': ['src/game-data/data/weapons/messenger.json',
    'src/game-data/data/characters/amber.json', 'tools/lib/mona-equipment-audit.mjs'],
};
/** Hash the precise shared implementation, entity data and executable comparison setup. */
export function equipmentEventInputSignature(id, reader = path => readFileSync(path)) {
  if (!subjectInputs[id]) return undefined;
  const hash = createHash('sha256');
  try {
    for (const path of [...sharedInputs, ...subjectInputs[id]]) {
      const bytes = reader(path);
      hash.update(path).update('\0').update(String(bytes.length)).update('\0').update(bytes);
    }
  } catch { return undefined; }
  return hash.digest('hex');
}

/** Optional scoped evidence: missing or stale artifacts never become positive proof. */
export function loadScopedEquipmentEvents(path = 'artifacts/equipment-scoped-ledger.json') {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(data.records) ? data.records : [];
  } catch { return []; }
}

/** Recognize only the explicitly reviewed beta-event samples, never the complete weapon behavior. */
export function scopedEquipmentEventEvidence(record, report, signature = equipmentEventInputSignature) {
  const rule = equipmentHitDefinitions[record?.mona];
  if (!rule || record.leyline !== rule.leyline || report.provenance?.mona !== baseline || record.monaRevision !== baseline
    || !record.leylineRevision || record.leylineRevision !== report.provenance?.leyline
    || !record.inputSignature || record.inputSignature !== signature(record.mona)
    || record.source !== source
    || record.owner !== rule.owner || record.category !== rule.category || record.onField !== true
    || record.confirmation !== 'explicit' || rule.critical && record.weakPoint !== true
    || record.targetResistance !== 0.1 || record.actorLevel !== 90 || record.enemyLevel !== 90
    || !Array.isArray(record.cases) || record.cases.length !== 2) return false;
  const samples = [...record.cases].sort((a, b) => a.refinement - b.refinement);
  return samples.every((sample, index) => {
    const beta = sample.beta, actual = sample.leyline;
    if (sample.refinement !== [1, 5][index] || !beta || !actual || beta.stat !== rule.stat
      || !closeEvidenceValue(beta.ratio, rule.values[index]) || beta.forceCritical !== rule.critical
      || !Array.isArray(beta.sourceTimes) || !Array.isArray(beta.procSourceTimes)
      || JSON.stringify(beta.sourceTimes) !== JSON.stringify([0, rule.cooldown - .001, rule.cooldown])
      || JSON.stringify(beta.procSourceTimes) !== JSON.stringify([0, rule.cooldown])
      || !Number.isFinite(actual.panel) || actual.panel <= 0 || !Number.isFinite(actual.first)
      || !closeEvidenceValue(actual.blocked, 0) || !closeEvidenceValue(actual.ready, actual.first)) return false;
    const critical = rule.critical ? 1 + actual.critDamage : 1;
    return Number.isFinite(critical) && closeEvidenceValue(actual.first, actual.panel * beta.ratio * .45 * critical, 1e-7);
  });
}

// --- mona-equipment-damage.mjs ---
/** Recalculate each emitted coefficient through the actual structured damage engine. */
async function auditMonaEquipmentDamage(audit, entities, engine) {
  const rows = [];
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const fixture = (await probeMonaSkills({characters:['Bennett'],indices:[0],constellations:[0]})).rows[0];
  const monaInput = structuredClone(fixture.input);
  monaInput.artifacts=[]; monaInput.character.level=1;
  monaInput.weapon={name:'PrizedIsshinBlade',level:1,ascend:false,refine:1,params:'NoConfig'};
  const prizedAnalysis=api.CalculatorInterface.get_damage_analysis(monaInput, null);
  const prizedDamageBonus=Object.values(prizedAnalysis.bonus ?? {}).reduce((a,b)=>a+b,0);
  for (const row of audit.rows) {
    if (!row.leyline || !row.mona?.events.length) {
      rows.push({ entity: row.entity, scenario: row.scenario, refinement: row.refinement, status: row.status });
      continue;
    }
    const weapon = entities.weapons.find(item => item.id === row.entity);
    const character = entities.characters.find(item => item.id === row.input.owner.toLowerCase());
    const build = { ...auditBuild(character, weapon), refinement: row.refinement };
    const prepared = engine.prepareStructuredBuilds([{ id:'actor', build }]);
    if (!prepared.ok) { rows.push({entity:row.entity, scenario:row.scenario, refinement:row.refinement, status:'build-error', diagnostics:prepared.diagnostics}); continue; }
    const talent = character.talents[0], hit = talent.hits[0];
    const { setup, request } = auditHit(character, talent, hit);
    setAuditDefaults(character, request.frame); setAuditDefaults(weapon, request.frame);
    for (const [key, definition] of Object.entries(weapon.metadata.facts ?? {})) {
      if (definition.type.kind !== 'boolean') continue;
      const value = key.endsWith('Triggered') || key.endsWith('Ready') || key.endsWith('wielderWithoutArkhe') || key.endsWith('piercingMight');
      if (definition.scope === 'query') request.frame.facts[key] = bool(value);
      else if (definition.scope === 'owner') request.frame.factOverrides[0].facts[key] = bool(value);
    }
    request.frame.factOverrides.push({subject:{kind:'target',id:'enemy'}, facts:{'aura.cryo':bool(row.scenario === 'cryo-teammate')}});
    request.hit = { definition:{group:'weapons', namespace:weapon.namespace, id:weapon.id, revision:weapon.revision}, hitId:row.leyline.hitId };
    const event = setup.events.find(item=>item.id===request.frame.eventId);
    event.hitId = row.leyline.hitId; delete event.skillId; delete event.category;
    const context = engine.createStructuredCombatContext(prepared.team, setup);
    const stat = row.leyline.stat;
    const binding = {kind:'attribute',key:{namespace:'builtin',id:'attribute.'+stat,revision:'1'},actor:{role:'recipient'},at:{kind:'current',phase:'same'}};
    const frame = {...request.frame, ownerId:'actor', recipientId:'actor', contributorId:null, phase:'before', hit:{skillId:talent.id,hitId:hit.id,category:'normal',element:'physical',family:'ordinary',origin:'talent',reactionId:null}};
    const attribute = id => engine.evaluateCombatBindings(prepared.team.program, context, {value:{...binding,key:{...binding.key,id:'attribute.'+id}}}, frame).outputs.value?.value?.value;
    const statValue = attribute(stat), physicalBonus = attribute('physicalBonus'), critDamage = attribute('critDamage');
    const result = engine.evaluateStructuredHit(prepared.team, setup, request);
    const actual = result.totals.all.value?.value ?? null;
    const critical = row.mona.events[0].forceCritical ? 1 + critDamage : 1;
    const bonus = row.entity === 'prizedisshinblade-01' ? prizedDamageBonus : 0;
    const expected = statValue * row.mona.events[0].ratio * (1 + physicalBonus + bonus) * .5 * .9 * critical;
    rows.push({entity:row.entity,scenario:row.scenario,refinement:row.refinement,stat,statValue,expected,actual,
      ...(row.entity === 'prizedisshinblade-01' ? {monaDamageBonus:prizedDamageBonus} : {}),
      status:Number.isFinite(actual) && Math.abs(actual-expected)<Math.max(1e-7,Math.abs(expected)*1e-8)?'match':'mismatch', diagnostics:result.diagnostics});
  }
  return {rows,summary:{cases:rows.length,match:rows.filter(row=>row.status==='match').length,different:0,failed:rows.filter(row=>row.status!=='match').length}};
}

/** Review the observed weapon coefficients only. A different disposition records that
 * Mona schedules its own events while LeyLine takes explicit trigger facts; the
 * numerical probes do not establish equivalence of those trigger models. */
export async function reviewMonaEquipmentBatch(leylineRows, entities, engine, audit) {
  const damage = await auditMonaEquipmentDamage(audit, entities, engine);
  const mappings = [];
  const weaponIds = [...new Set(audit.rows.map(row => row.entity))];
  for (const entity of weaponIds) {
    const rows = audit.rows.filter(row => row.entity === entity);
    const hits = leylineRows.filter(row => row.entity === entity && row.subject === 'equipment-hit');
    const damageRows = damage.rows.filter(row => row.entity === entity);
    if (!rows.length || rows.some(row => row.status !== 'scaling-match') || !hits.length || damageRows.length !== rows.length || damageRows.some(row => row.status !== 'match')) continue;
    const used = hits.filter(hit => rows.some(row => row.leyline?.id === hit.id));
    if (!used.length) continue;
    const cryo = ['frostbearer', 'dragonspinespear'].includes(entity);
    mappings.push({
      id: `equipment-coefficients-${entity}`,
      disposition: 'different',
      mona: [`mona:equipment-event:${rows[0].monaWeapon}`],
      leyline: used.map(hit => ({ id: hit.id, revision: hit.revision })),
      explanation: 'The observed event coefficients and scaling attributes agree in the listed probes. Mona generates events with its own probability, cooldown and timing rules; LeyLine evaluates an explicitly triggered hit, so those event semantics are not established as equivalent.' + (entity === 'prizedisshinblade-01' ? ' Mona damage analysis records the same -50% additive damage bonus as LeyLine; its physical-only panel is not the total damage bonus.' : '') + (cryo ? ' Mona chooses the stronger coefficient from Cryo party membership; LeyLine uses target Cryo aura.' : ''),
      sources: ['.references/mona-community/beta-data/equipment-damage-events.mjs',
        ...used.map(hit => hit.source), 'tools/lib/mona-equipment-hit-audit.mjs', 'tools/lib/mona-equipment-damage.mjs'],
      comparisons: [...damageRows.map(row => ({ name: row.scenario + ' R' + row.refinement + ' structured damage', expected: row.expected, actual: row.actual, tolerance: Math.max(1e-7, Math.abs(row.expected) * 1e-8) })), ...rows.flatMap(row => row.mona.events.map((event, index) => ({
        name: `${row.scenario} R${row.refinement} event ${index + 1} coefficient`,
        expected: row.leyline.ratio, actual: event.ratio, tolerance: 1e-9,
      })))],
    });
  }
  return { mappings, summary: { reviewedWeapons: mappings.length, pendingWeapons: weaponIds.length - mappings.length }, damage };
}

// --- mona-equipment-artifacts.mjs ---
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

// --- mona-set-stat-batch.mjs ---
/** Prefer the caller's linked entities; construct a fallback catalog only if needed. */
function setEntityResolver(entities) {
  let catalogPromise;
  return {
    async get(group, id) {
      const entity = entities?.[group]?.find(item => item.id === id);
      if (entity) return entity;
      catalogPromise ??= createRuntimeCatalog();
      return (await catalogPromise).get(group, id);
    },
  };
}

/** Build the same character with different counts of a single theoretical set. */
function prepareSetTeams(engine, character, weapon, set, counts) {
  return counts.map(count => {
    const theoreticalSetSlots = ['flower', 'plume', 'sands', 'goblet'].slice(0, count)
      .map(slot => ({ slot, setId: set.id }));
    const build = { ...auditBuild(character, weapon, [set]), theoreticalSetSlots };
    const result = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.team;
  });
}

/** Read one attribute for an actual authored hit in each prepared team. */
function readHitAttribute(engine, teams, character, talent, hit, stat) {
  const { setup, request } = auditHit(character, talent, hit);
  Object.assign(request.frame, { ownerId: 'actor', recipientId: 'actor', contributorId: null, hit: {
    skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element,
    origin: hit.origin, family: 'ordinary', reactionId: null,
  } });
  const binding = { kind: 'attribute', actor: { role: 'owner' },
    key: { namespace: 'builtin', id: 'attribute.' + stat, revision: '1' }, at: { kind: 'current', phase: 'same' } };
  return teams.map(team => {
    const context = engine.createStructuredCombatContext(team, setup);
    const value = engine.evaluateCombatBindings(team.program, context, { value: binding }, request.frame).outputs.value;
    return value?.state === 'known' ? value.value.value : null;
  });
}

/** Keep artifact stats fixed while replacing only the final set identity. */
function monaSetArtifacts(input, key, count) {
  const other = key === 'GladiatorsFinale' ? 'NoblesseOblige' : 'GladiatorsFinale';
  const before = input.artifacts.slice(0, count).map((artifact, index) => ({
    ...artifact, set_name: index === count - 1 ? other : key,
  }));
  return { before, after: before.map(artifact => ({ ...artifact, set_name: key })) };
}

function monaHitDamage(api, input, artifacts, index) {
  return api.CalculatorInterface.get_damage_analysis({ ...input, skill: { ...input.skill, index }, artifacts }, null).normal.non_critical;
}

const monaArtifactPath = '.references/mona-community/src/assets/_gen_artifact.js';
const catalogPath = 'tools/data/sources/catalog/mona-community/catalog.json';
const sourcePath = 'tools/data/sources/catalog/genshin-db/sets.json';
const runtime = '.references/mona-community/beta-tools/runtime-7106.mjs';
const setStatDefinitions = [
  ['hp', /^生命值上限提高([\d.]+)点。$/, 'hp', null, 1],
  ['defense', /^防御力提高([\d.]+)点。$/, 'def', null, 1],
  ['attackPercent', /^攻击力提高([\d.]+)%[。；]?$/, 'atk', 'attack'],
  ['defensePercent', /^防御力提高([\d.]+)%[。；]?$/, 'def', 'defense'],
  ['hpPercent', /^生命值(?:上限)?提升([\d.]+)%[。；]?$/, 'hp', 'hp'],
  ['energyRecharge', /^元素充能效率(?:提高|提升)([\d.]+)%[。；]?$/, 'recharge'],
  ['elementalMastery', /^元素精通提高([\d.]+)点。$/, 'elemental_mastery', null, 1],
  ['critRate', /^暴击率提高([\d.]+)%[。；]?$/, 'critical'],
  ['healingBonus', /^(?:角色造成的治疗效果提升|治疗加成提高)([\d.]+)%[。；]?$/, 'healing_bonus'],
  ['shieldStrength', /^护盾强效提高([\d.]+)%[。；]?$/, 'shield_strength'],
  ['physicalBonus', /^造成的物理伤害提高([\d.]+)%[。；]?$/, 'bonus_physical'],
  ...[['岩','geo'],['冰','cryo'],['火','pyro'],['草','dendro'],['风','anemo'],['水','hydro'],['雷','electro']].map(([zh,element]) =>
    [element+'Bonus', new RegExp('^获得([\\d.]+)%'+zh+'元素伤害加成。$'), 'bonus_'+element]),
];
const sum = values => Object.values(values ?? {}).reduce((a, b) => a + b, 0);
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7;
const valueOf = value => typeof value === 'number' ? value : value?.amount;
// Used only to report likely wording differences when no effect parser matches.
const comparableText = text => text?.replace(/[。；，\s]/g, '').replaceAll('提高', '提升');

const patterns = [
  [/^元素战技造成的伤害提升([\d.]+)%[。；]?$/, ['skill']],
  [/^元素爆发造成的伤害提升([\d.]+)%[。；]?$/, ['burst']],
  [/^普通攻击与重击造成的伤害提高([\d.]+)%[。；]?$/, ['normal', 'charged']],
  [/^下落攻击造成的伤害提升([\d.]+)%[。；]?$/, ['plunge']],
];
const hits = [
  ['normal', 0, 'kaeya.normal.param1'],
  ['charged', 5, 'kaeya.normal.param6'],
  ['plunge', 7, 'kaeya.normal.param9'],
  ['skill', 10, 'kaeya.skill.param1'],
  ['burst', 11, 'kaeya.burst.param1'],
];

/** Verify category bonuses on real eligible and ineligible Kaeya hits. */
async function auditSetCategory({ identity, text, monaText, effectIndex, leylineRows, engine, catalog, character, weapon, api, input, index }) {
  const definition = patterns.map(([pattern, categories]) => ({ match: monaText?.match(pattern), categories })).find(row => row.match);
  if (!definition) return null;
  const independent = patterns.map(([pattern, categories]) => ({ match: text?.match(pattern), categories })).find(row => row.match);
  const { canonicalId: entity, exportName: key } = identity;
  const amount = Number(definition.match[1]) / 100;
  const id = `mona:set-stat:${key}:2:damageBonus`;
  const component = { id, kind: 'set-stat-effect', key, attribute: 'damageBonus', categories: definition.categories,
    source: { path: '.references/mona-community/src/assets/_gen_artifact.js', pointer: `/${identity.monaKey}/effect2` }, resolution: 'source-declared' };
  const common = { entity, key, id, pieces: 2, sourceText: text ?? null, monaText: monaText ?? null, source: `${sourcePath}#/${entity}/effect2Pc`,
    stat: 'damageBonus', expected: amount, categories: definition.categories };
  if (!independent || Number(independent.match[1]) !== Number(definition.match[1])
    || JSON.stringify(independent.categories) !== JSON.stringify(definition.categories) || effectIndex < 0) {
    return { component, row: { ...common, status: 'open-source' } };
  }
  const targets = leylineRows.filter(row => row.kind === 'set' && row.entity === entity && row.subject === 'modifier'
    && row.field.startsWith(`/effects/${effectIndex}/`) && row.binding?.modifier?.target === 'attribute.damageBonus'
    && JSON.stringify(row.binding.buff.appliesTo?.categories) === JSON.stringify(definition.categories));
  if (targets.length !== 1) return { component, row: { ...common, status: 'open-binding', reason: 'Expected one modifier with exact category scope.' } };
  const target = targets[0];
  try {
    const set = await catalog.get('sets', entity);
    const teams = prepareSetTeams(engine, character, weapon, set, [1, 2]);
    const artifacts = monaSetArtifacts(input, key, 2);
    const cases = [];
    for (const [category, index, hitId] of hits) {
      const talent = character.talents.find(row => row.hits.some(hit => hit.id === hitId));
      const hit = talent.hits.find(row => row.id === hitId);
      const values = readHitAttribute(engine, teams, character, talent, hit, 'damageBonus');
      const before = monaHitDamage(api, input, artifacts.before, index);
      const after = monaHitDamage(api, input, artifacts.after, index);
      const active = definition.categories.includes(category);
      cases.push({ category, hitId, monaIndex: index, expected: active ? amount : 0,
        monaDeltaRatio: after / before - 1, leylineBefore: values[0], leylineAfter: values[1],
        leylineDelta: values[1] - values[0], before, after });
    }
    const status = cases.every(row => Number.isFinite(row.leylineBefore) && Number.isFinite(row.leylineAfter)
      && near(row.expected, row.monaDeltaRatio) && near(row.expected, row.leylineDelta)) ? 'matched-scenario' : 'open-runtime';
    const scope = 'Kaeya wearer; one versus two pieces, five explicit normal, charged, plunge, skill and burst hits. Four-piece effects remain open.';
    const row = { ...common, status, recipient: 'kaeya', cases, scope, target: { id: target.id, revision: target.revision, source: target.source } };
    if (status !== 'matched-scenario') return { component, row };
    const mapping = { id: 'set-category-scenario:' + key, disposition: 'matched', mona: [id, `mona:set-threshold:${key}:2`],
      leyline: [{ id: target.id, revision: target.revision }], explanation: scope,
      sources: [catalogPath + `#/sets/${index}`, common.source, target.source, runtime],
      comparisons: cases.flatMap(test => [
        { name: `Mona ${test.category} damage ratio delta`, expected: test.expected, actual: test.monaDeltaRatio, tolerance: 1e-7 },
        { name: `LeyLine ${test.category} modifier delta`, expected: test.expected, actual: test.leylineDelta, tolerance: 1e-7 },
      ]) };
    return { component, row, mapping };
  } catch (error) {
    return { component, row: { ...common, status: 'open-error', error: String(error?.message ?? error) } };
  }
}

/** Two-piece wearer-panel checks; source-ineligible and runtime failures remain open. */
async function auditTwoPiece(leylineRows, context) {
  const { engine, catalog, identities, sources, api, monaCatalog, monaLabels } = context;
  const character = await catalog.get('characters', 'kaeya');
  const weapon = await catalog.get('weapons', 'dullblade');
  const input = await context.fixture('Kaeya');
  const rows = [], monaRows = [], mappings = [];
  for (const [index, identity] of identities.entries()) {
    const { canonicalId: entity, exportName: key } = identity;
    const document = readContentSource(new URL('../../src/game-data/data/artifact-sets/' + entity + '.json', import.meta.url));
    for (const pieces of [1, 2, 4]) {
      const locale = monaCatalog[identity.monaKey]?.['effect' + pieces];
      const description = locale == null ? null : monaLabels[locale];
      if (!description) continue;
      monaRows.push({
        id: `mona:set-threshold:${key}:${pieces}`,
        kind: 'set-threshold', key, pieces, description,
        source: { path: '.references/mona-community/src/assets/_gen_artifact.js', pointer: `/${identity.monaKey}/effect${pieces}` },
        resolution: 'source-declared',
      });
    }
    const effectIndex = document.effects.findIndex(effect => effect.pieces === 2);
    const text = sources[entity]?.effect2Pc;
    const monaText = monaLabels[monaCatalog[identity.monaKey]?.effect2];
    const parse = value => setStatDefinitions.map(([stat, pattern, panel, base, scale]) =>
      ({ stat, panel, base, scale: scale ?? .01, found: value?.match(pattern) })).find(row => row.found);
    const match = parse(monaText);
    const independent = parse(text);
    const baseRow = { entity, key, sourceText: text ?? null, monaText: monaText ?? null,
      source: `${sourcePath}#/${entity}/effect2Pc`, pieces: 2 };
    if (!monaText) {
      rows.push({ ...baseRow, status: 'no-two-piece', reason: 'One-piece set or no captured two-piece text.' });
      continue;
    }
    if (!match) {
      const category = await auditSetCategory({ identity, text, monaText, effectIndex, leylineRows, engine, catalog, character, weapon, api, input, index });
      if (category) {
        monaRows.push(category.component);
        rows.push(category.row);
        if (category.mapping) mappings.push(category.mapping);
        continue;
      }
      const wordingDiffers = text && monaText !== text && comparableText(text) === comparableText(monaText);
      rows.push({ ...baseRow, monaText, status: wordingDiffers ? 'open-source' : 'open-specialized',
        reason: wordingDiffers ? 'The source wording differs and could not be parsed by this batch.'
          : 'Conditional, category-scoped, team, incoming-healing, resistance or other non-panel effect.' });
      continue;
    }
    const expected = Number(match.found[1]) * match.scale;
    const id = `mona:set-stat:${key}:2:${match.stat}`;
    monaRows.push({
      id, kind: 'set-stat-effect', key, attribute: match.stat,
      source: { path: '.references/mona-community/src/assets/_gen_artifact.js', pointer: `/${identity.monaKey}/effect2` },
      resolution: 'source-declared',
    });
    if (!independent || independent.stat !== match.stat || independent.scale !== match.scale
      || Number(independent.found[1]) !== Number(match.found[1]) || effectIndex < 0) {
      rows.push({ ...baseRow, status: 'open-source', stat: match.stat, monaText });
      continue;
    }
    const mods = leylineRows.filter(row => row.kind === 'set' && row.entity === entity && row.subject === 'modifier'
      && row.field.startsWith(`/effects/${effectIndex}/`) && row.binding?.modifier?.target === 'attribute.' + match.stat
      && near(valueOf(row.binding.modifier.value), expected));
    if (mods.length !== 1) {
      rows.push({ ...baseRow, status: 'open-binding', stat: match.stat, expected, reason: 'Expected exactly one matching authored modifier.' });
      continue;
    }
    const target = mods[0];
    try {
      const set = await catalog.get('sets', entity);
      const teams = prepareSetTeams(engine, character, weapon, set, [1, 2]);
      const values = readHitAttribute(engine, teams, character, character.talents[0], character.talents[0].hits[0], match.stat);
      const artifacts = monaSetArtifacts(input, key, 2);
      const before=api.CommonInterface.get_attribute({...input,artifacts:artifacts.before});
      const after=api.CommonInterface.get_attribute({...input,artifacts:artifacts.after});
      const monaDelta=sum(after[match.panel])-sum(before[match.panel]);
      const monaBase=match.base==='attack'?before.atk['角色基础攻击']+before.atk['武器基础攻击']
        :match.base==='defense'?before.def['角色基础防御']:match.base==='hp'?before.hp['角色基础生命']:1;
      const monaExpected=expected*monaBase, leylineDelta=values[1]-values[0];
      const status=values.every(Number.isFinite)&&near(monaDelta,monaExpected)&&near(leylineDelta,expected)?'matched-scenario':'open-runtime';

      const row={...baseRow,id,stat:match.stat,expected,recipient:'kaeya',onePiece:values[0],twoPieces:values[1],leylineDelta,monaDelta,monaExpected,status,
        target:{id:target.id,revision:target.revision,source:target.source},scope:'Kaeya wearer, one versus two pieces, queried panel stat; four-piece and other effects excluded.'};
      rows.push(row);
      if(status!=='matched-scenario')continue;

      mappings.push({id:'set-stat-scenario:'+key+':'+match.stat,disposition:'matched',mona:[id, 'mona:set-threshold:' + key + ':2'],leyline:[{id:target.id,revision:target.revision}],
        explanation:row.scope,sources:[catalogPath+`#/sets/${index}`,row.source,target.source,runtime],comparisons:[
          {name:'Mona one-to-two piece panel delta',expected:monaExpected,actual:monaDelta,tolerance:1e-7},
          {name:'LeyLine one-to-two piece stat delta',expected,actual:leylineDelta,tolerance:1e-7},
        ]});
    } catch(error) { rows.push({...baseRow,status:'open-error',stat:match.stat,expected,error:String(error?.message??error)}); }
  }
  return {rows,monaRows,mappings,summary:{sets:rows.length,...Object.fromEntries([...new Set(rows.map(row=>row.status))].sort().map(status=>[status,rows.filter(row=>row.status===status).length])),mappedEffects:mappings.length},
    limitations:['This covers only source-recognized unconditional wearer panel stats at two pieces; other effects and four-piece behavior remain open.',
      'Mona receives two synthetic pieces with identical individual stats; LeyLine uses theoretical set slots. Numeric panel contribution is compared rather than final damage.']};
}

const fourPieceSpecs = [
  { key: 'GladiatorsFinale', entity: 'gladiatorsfinale', category: 'normal',
    phrase: /^装备该圣遗物套装的角色为单手剑、双手剑、长柄武器角色时，角色普通攻击造成的伤害提高35%[。；]?$/ },
  { key: 'WanderersTroupe', entity: 'wandererstroupe', category: 'charged',
    phrase: /^装备该圣遗物套装的角色为法器、弓箭角色时，角色重击造成的伤害提高35%[。；]?$/ },
];
const fourPieceProfiles = [
  { id: 'kaeya', mona: 'Kaeya', weapon: 'dullblade', weaponClass: 'sword', hits: [['normal', 0, 'kaeya.normal.param1'], ['charged', 5, 'kaeya.normal.param6']] },
  { id: 'amber', mona: 'Amber', weapon: 'huntersbow', weaponClass: 'bow', hits: [['normal', 0, 'amber.normal.param1'], ['charged', 5, 'amber.normal.param6']] },
];

/** Tests two weapon classes and two attack categories; other classes stay unverified. */
async function auditFourPiece(leylineRows, context) {
  const { engine, catalog, identities, sources, api, monaCatalog, monaLabels } = context;
  const rows = [], monaRows = [], mappings = [];
  for (const spec of fourPieceSpecs) {
    const catalogIndex = identities.findIndex(row => row.exportName === spec.key);
    const identity = identities[catalogIndex];
    const monaText = monaLabels[monaCatalog[identity.monaKey]?.effect4];
    const sourceText = sources[spec.entity]?.effect4Pc;
    const id = `mona:set-stat:${spec.key}:4:${spec.category}:weapon`;
    const source = { path: monaArtifactPath, pointer: `/${identity.monaKey}/effect4` };
    monaRows.push({ id, kind: 'set-stat-effect', key: spec.key, pieces: 4, category: spec.category,
      resolution: 'source-declared', source });
    const row = { id, key: spec.key, entity: spec.entity, pieces: 4, sourceText, monaText,
      scope: 'Three versus four pieces; Kaeya sword and Amber bow, each using normal and charged hits. Other weapon classes remain untested.' };
    if (!spec.phrase.test(sourceText) || !spec.phrase.test(monaText)) {
      rows.push({ ...row, status: 'open-source' });
      continue;
    }
    const target = leylineRows.find(item => item.id === `set:${spec.entity}:modifier:/effects/1/buffs/0/modifiers/0`);
    if (!target || target.binding.modifier.target !== 'attribute.damageBonus') {
      rows.push({ ...row, status: 'open-binding' });
      continue;
    }
    try {
      const set = await catalog.get('sets', spec.entity);
      const cases = [];
      for (const profile of fourPieceProfiles) {
        const character = await catalog.get('characters', profile.id);
        const weapon = await catalog.get('weapons', profile.weapon);
        const input = await context.fixture(profile.mona);
        const teams = prepareSetTeams(engine, character, weapon, set, [3, 4]);
        const artifacts = monaSetArtifacts(input, spec.key, 4);
        for (const [category, index, hitId] of profile.hits) {
          const talent = character.talents.find(item => item.hits.some(hit => hit.id === hitId));
          const hit = talent?.hits.find(item => item.id === hitId);
          if (!hit) throw new Error('Missing authored hit: ' + hitId);
          const values = readHitAttribute(engine, teams, character, talent, hit, 'damageBonus');
          const before = monaHitDamage(api, input, artifacts.before, index);
          const after = monaHitDamage(api, input, artifacts.after, index);
          const qualifies = category === spec.category && (spec.key === 'GladiatorsFinale' ? profile.weaponClass === 'sword' : profile.weaponClass === 'bow');
          cases.push({ recipient: profile.id, weaponClass: profile.weaponClass, category, hitId, monaIndex: index,
            expected: qualifies ? .35 : 0, monaDeltaRatio: after / before - 1, leylineBefore: values[0], leylineAfter: values[1],
            leylineDelta: values[1] - values[0], before, after });
        }
      }
      const status = cases.every(test => Number.isFinite(test.leylineBefore) && Number.isFinite(test.leylineAfter)
        && near(test.expected, test.monaDeltaRatio) && near(test.expected, test.leylineDelta)) ? 'matched-scenario' : 'open-runtime';
      rows.push({ ...row, status, cases, target: { id: target.id, revision: target.revision, source: target.source } });
      if (status !== 'matched-scenario') continue;
      mappings.push({ id: 'set-four-piece-scenario:' + spec.key, disposition: 'matched', mona: [id], leyline: [{ id: target.id, revision: target.revision }],
        explanation: row.scope, sources: [catalogPath + `#/sets/${catalogIndex}`, sourcePath + `#/${spec.entity}/effect4Pc`, target.source, runtime],
        comparisons: cases.flatMap(test => [
          { name: `Mona ${test.recipient} ${test.category} damage ratio`, expected: test.expected, actual: test.monaDeltaRatio, tolerance: 1e-7 },
          { name: `LeyLine ${test.recipient} ${test.category} modifier`, expected: test.expected, actual: test.leylineDelta, tolerance: 1e-7 },
        ]) });
    } catch (error) { rows.push({ ...row, status: 'open-error', error: String(error?.message ?? error) }); }
  }
  return { rows, monaRows, mappings, summary: { cases: rows.length, matched: rows.filter(row => row.status === 'matched-scenario').length } };
}

/** Run both packets using one engine, source catalog, entity resolver and fixture cache. */
export async function auditMonaSets(leylineRows, entities, providedEngine) {
  const engine = providedEngine ?? await loadContentSchema('/src/engine/src/index.ts');
  const catalog = setEntityResolver(entities);
  const identities = readContentSource(new URL('../../' + catalogPath, import.meta.url)).sets;
  const sources = readContentSource(new URL('../../' + sourcePath, import.meta.url));
  const { api, read } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const monaCatalog = read('src/assets/_gen_artifact.js');
  const monaLabels = read('src/i18n/generated/zh-cn.json');
  const fixtures = new Map();
  async function fixture(name) {
    if (!fixtures.has(name)) fixtures.set(name, probeMonaSkills({ characters: [name], indices: [0], constellations: [0] }));
    return (await fixtures.get(name)).rows[0].input;
  }
  const context = { engine, catalog, identities, sources, api, monaCatalog, monaLabels, fixture };
  const two = await auditTwoPiece(leylineRows, context);
  const four = await auditFourPiece(leylineRows, context);
  return { two, four };
}
