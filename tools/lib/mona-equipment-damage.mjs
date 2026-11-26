import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { auditBuild, auditHit, bool, setAuditDefaults } from './roster-audit-settings.mjs';

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
