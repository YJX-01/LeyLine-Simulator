import { expect, test, type Page } from '@playwright/test';
import * as engine from '@leyline/engine';
import { combatObservationUnits, putHitFact, type AxisRequest, type AxisResponse, type Build, type CalculationFact, type DamageRequest, type Project } from '@leyline/schema';
import { catalogSnapshotFields } from '../../helpers/catalog-snapshot-fields';
import { auditTalentHealing, type HealingExpectation } from '../../../tools/lib/talent-healing-audit.mjs';
import { createRuntimeCatalog } from '../../../tools/lib/runtime-catalog.mjs';
import { auditPublicScenes, rosterEvaluation, rosterEquipmentEvaluation, type RosterReplayQuery } from '../../../tools/lib/roster-evaluation.mjs';
import { readCalculationData } from '../../../tools/lib/catalog-data.mjs';
import { assembleCalculationLibrary } from '../../../tools/lib/calculation-library.mjs';
import { auditHealingWindows, type HealingWindowCase } from '../../../tools/lib/set-condition-audit.mjs';

type ReopenedCase = RosterReplayQuery & { anemoResistance?: number; physicalResistance?: number; missingInput?: string; hpChanges?: number[]; additionalMembers?: Build[];
  reactionRecords?: (({ kind: 'freeze' | 'shatter' } | { kind: 'swirl'; element: 'pyro' | 'hydro' | 'cryo' | 'electro' })
    & { timeMs: number; byTeammate?: boolean })[];
  priorHits?: { category: 'skill' | 'normal'; timeMs: number; byTeammate?: boolean }[];
  fieldChanges?: { timeMs: number; byTeammate?: boolean }[];
  reactionRules?: Project['reactionRules']; timeMs?: number };
async function compareReopenedQueries(page: Page, cases: ReopenedCase[]) {
  const results = await page.evaluate(async cases => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation, parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy, addActorFromBuild, addAttributeCapture, addCombatObservation, addFieldChange, addReactionObservation, addSkillAction, addSkillHit, addTransformativeReaction } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    // @ts-expect-error Vite browser source URL.
    const { importProject } = await import('/src/domain/workbench-project.ts');
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    const evaluate = (request: AxisRequest) => new Promise<AxisResponse>((resolve, reject) => {
      worker.onmessage = event => resolve(event.data); worker.onerror = event => reject(Error(event.message)); worker.postMessage(request);
    });
    const values = [];
    let current = '';
    try {
      for (const { label, build, damage, teammate, additionalMembers, capture, cast, anemoResistance, physicalResistance, hpChanges, reactionRecords, reactionRules, timeMs, priorHits, fieldChanges } of cases) {
        current = label;
        const enemy = defaultEnemy(); enemy.level = build.level;
        if (anemoResistance !== undefined) enemy.resistances.anemo = anemoResistance;
        if (physicalResistance !== undefined) enemy.resistances.physical = physicalResistance;
        const file = createDamageCalculation(build, damage, enemy);
        const peer = teammate && addActorFromBuild(file.project, teammate);
        for (const member of additionalMembers ?? []) addActorFromBuild(file.project, member);
        if (timeMs !== undefined) file.project.timeline[0].timeMs = timeMs;
        for (const change of fieldChanges ?? []) {
          addFieldChange(file.project, change.byTeammate ? peer : file.actorId, change.timeMs, {mode:{crit:'noncritical',reaction:'none'}});
        }
        for (const previous of priorHits ?? []) {
          const actor = previous.byTeammate ? peer : file.actorId;
          const member = previous.byTeammate ? teammate! : build;
          const skill = member.character.talents.find(t => t.category === previous.category)!;
          addSkillHit(file.project, actor, skill.id, 0, previous.timeMs, {crit:'noncritical',reaction:'none'});
        }
        if (cast) {
          file.project.timeline[0].timeMs = cast.delayMs;
          addSkillAction(file.project, file.actorId, cast.skillId, 0);
        }
        for (const [i, delta] of (hpChanges ?? []).entries()) {
          addCombatObservation(file.project, i % 2 || !peer ? file.actorId : peer, i + 1, 'hpRatioChange', delta);
        }
        for (const reaction of reactionRecords ?? []) {
          const actor = reaction.byTeammate ? peer : file.actorId;
          if (reaction.kind === 'shatter') addTransformativeReaction(file.project, actor, 'shatter', 'physical', reaction.timeMs, reactionRules);
          else if (reaction.kind === 'swirl') addTransformativeReaction(file.project, actor, 'swirl', reaction.element, reaction.timeMs, reactionRules);
          else addReactionObservation(file.project, actor, reaction.timeMs, reaction.kind);
        }
        if (reactionRecords || priorHits) file.project.objective.damageIds = [file.recordId];
        if (capture) {
          file.project.timeline[0].timeMs = 1;
          const recordId = addAttributeCapture(file.project, file.actorId, capture.skillId, 0);
          const anchor = file.project.timeline.find((row: Project['timeline'][number]) => row.id === recordId);
          if (capture.facts) anchor.captureFacts = capture.facts.map(row => ({
            ...row, subject: row.subject.kind === 'actor' && row.subject.id === 'owner' ? { kind: 'actor', id: file.actorId } : row.subject,
          }));
          file.project.timeline[0].damage.capture = { recordId, phase: capture.phase };
        }
        const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', file)));
        const request = calculatorWorkerRequest(reopened, 1);
        const calculator = (await evaluate(request)).result;
        const project = importProject(JSON.stringify(packDocument('axis', reopened.project)));
        const axis = (await evaluate({ ...request, project, taskId: 2 })).result;
        values.push([calculator, axis].map(r => ({
          value: reactionRecords || priorHits ? r.objectiveValue : r.totalValue, matches: r.points.filter(p => p.id === file.recordId).length,
          missing: r.points.find(p => p.id === file.recordId)?.real?.structured?.requiredInputs.map(input => input.key) ?? [],
          issues: r.totalValue === null ? r.diagnostics.map(d => d.message).slice(0, 3) : []
        })));
      }
    } catch (cause) {
      throw new Error(current + ' · ' + (cause instanceof Error ? cause.message : String(cause)));
    } finally { worker.terminate(); }
    return values;
  }, cases);
  return results.flatMap((actual, index) => {
    const { label, expected, missingInput } = cases[index];
    const agrees = actual.every(row => row.matches === 1 && (expected === null
      ? !!missingInput && row.value === null && row.missing.includes(missingInput)
      : Number.isFinite(expected) && row.value !== null && Number.isFinite(row.value) && Math.abs(row.value - expected) <= 1e-8));
    return agrees ? [] : [{ label, expected, actual }];
  });
}

test('every character form reopens its first normal attack in the calculator and timeline Worker', async ({ page }) => {
  test.setTimeout(300000);
  const catalog = await createRuntimeCatalog();
  const starter: Record<string, string> = { WEAPON_SWORD_ONE_HAND: 'dullblade', WEAPON_CLAYMORE: 'wastergreatsword', WEAPON_POLE: 'beginnersprotector', WEAPON_BOW: 'huntersbow', WEAPON_CATALYST: 'apprenticesnotes' };
  const failures: Awaited<ReturnType<typeof compareReopenedQueries>> = [];
  const roster: string[] = catalog.inventory.characters;
  await page.goto('/');
  for (let offset = 0; offset < roster.length; offset += 8) {
    const cases = await Promise.all(roster.slice(offset, offset + 8).map(async id => {
      const character: Build['character'] = await catalog.get('characters', id);
      const build: Build = {
        ...await catalogSnapshotFields(id, starter[character.identity.weaponType]), level: 1, ascension: 0, weaponLevel: 1,
        weaponAscension: 0, constellation: 0, refinement: 1, artifacts: [], sets: [], talents: { normal: 1, skill: 1, burst: 1 }
      };
      const normal = character.metadata.talents.find(t => t.category === 'normal')!, first = normal.hits[0];
      if (!Array.isArray(first.base)) throw new Error(id + ' 缺少可独立核算的普攻首段缩放');
      const atk = character.attributes.base.attack * character.progression.curves.attack[1] + character.progression.promotion[0].attack
        + build.weapon!.baseAttack * build.weapon!.attackCurve[1] + build.weapon!.promotion[0];
      const expected = first.base.reduce((sum, term) => {
        if (term.stat !== 'attack' || term.count || term.skill) throw new Error(id + ' 首段的独立算式需复核');
        const rate = term.ratio ?? normal.parameters.find(p => p.id === term.parameter)!.values[id === 'tartaglia' ? 1 : 0];
        return sum + atk * rate;
      }, 0) * .5 * .9;
      const flag = (value: boolean) => ({ value: { kind: 'boolean' as const, value }, sourceRefs: [], provenance: 'explicit' as const });
      const damage: DamageRequest = {
        hit: { definition: { group: 'characters', namespace: character.namespace, id, revision: character.revision }, hitId: first.id }, crit: 'noncritical', reaction: 'none',
        facts: [{ subject: { kind: 'actor', id: 'owner' }, values: { onField: flag(true), shielded: flag(false), hpRatio: { value: { kind: 'quantity', unit: 'scalar', value: 1 }, sourceRefs: [], provenance: 'explicit' } } }]
      };
      for (const [key, field] of Object.entries(character.metadata.facts ?? {})) {
        if (!['owner','recipient','team','target','query'].includes(field.scope) || character.talents.some(talent => talent.id !== normal.id && talent.inputs?.some(input => input.id === key))) continue;
        const subject = field.scope === 'team' ? { kind: 'team' as const } : field.scope === 'target' ? { kind: 'target' as const, id: 'target' }
          : field.scope === 'query' ? { kind: 'event' as const } : { kind: 'actor' as const, id: 'owner' };
        const type = field.type;
        putHitFact(damage.facts!, subject, key, type.kind === 'boolean' ? { kind:'boolean', value:false }
          : type.kind === 'quantity' ? { ...type, value: 0 } : { kind: 'enum', value: type.values.includes('none') ? 'none' : type.values[0] });
      }
      return { label: id, build, damage, expected };
    }));
    failures.push(...await compareReopenedQueries(page, cases));
  }
  expect(roster).toHaveLength(154);
  expect(failures).toEqual([]);
});

async function replayCatalog() {
  const catalog = await createRuntimeCatalog();
  return {
    characters: await Promise.all(catalog.inventory.characters.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(catalog.inventory.weapons.map(id => catalog.get('weapons', id))), sets: await Promise.all(catalog.inventory.sets.map(id => catalog.get('sets', id)))
  };
}
test('party talent levels use the saved lineup in both files and the actual Worker', async ({ page }) => {
  const base = { sets:[], artifacts:[], level:1, ascension:0, constellation:0, weaponLevel:1, weaponAscension:0,
    refinement:1, talents:{normal:1,skill:1,burst:1} };
  const member = async (id: string, weapon: string): Promise<Build> => ({ ...await catalogSnapshotFields(id, weapon), ...base });
  const [kaeya, tartaglia, skirk, amber] = await Promise.all([member('kaeya','dullblade'),member('tartaglia','huntersbow'),
    member('skirk','dullblade'),member('amber','huntersbow')]);
  const cases: ReopenedCase[] = [];
  const lineups: [Build[], number, number][] = [[[],0,0],[[tartaglia],1,0],[[skirk],0,0],[[skirk,tartaglia],1,1],[[skirk,tartaglia,amber],1,0]];
  for (const [members, normal, skill] of lineups) for (const [category, bonus] of [['normal',normal],['skill',skill]] as const) {
    const talent = kaeya.character.talents.find(t => t.category === category)!;
    const attack = kaeya.character.attributes.base.attack + kaeya.weapon!.baseAttack;
    const rates = category === 'normal' ? [.5375,.58125] : [1.912,2.0554];
    cases.push({label:category+'/'+members.map(m=>m.character.id).join(','), build:kaeya, additionalMembers:members,
      damage:{hit:{definition:{group:'characters',namespace:'builtin',id:'kaeya',revision:kaeya.character.revision},hitId:talent.id+'.param1'},
        crit:'noncritical',reaction:'none',facts:[]},expected:attack*rates[bonus]*.5*.9});
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});
test('Mailed Flower replays either trigger, field changes and shared expiry in both Worker requests', async ({page}) => {
  const base = {sets:[], artifacts:[], level:1, ascension:0, constellation:0, weaponLevel:1, weaponAscension:0, refinement:1, talents:{normal:1,skill:1,burst:1}};
  const weapon = await catalogSnapshotFields('chongyun','mailedflower');
  const teammate: Build = {...await catalogSnapshotFields('kaeya','dullblade'),...base};
  const cases: ReopenedCase[] = [];
  const skill = {category:'skill' as const,timeMs:1}, reaction = {kind:'freeze' as const,timeMs:1}, enter = {timeMs:0};
  const scenarios: [string,boolean,Partial<ReopenedCase>][] = [
    ['触发当击',false,{}],
    ['战技命中后',true,{timeMs:2,priorHits:[skill]}],
    ['反应后',true,{timeMs:8000,reactionRecords:[reaction]}],
    ['八秒边界',false,{timeMs:8001,reactionRecords:[reaction]}],
    ['队友触发',false,{timeMs:2,reactionRecords:[{...reaction,byTeammate:true}]}],
    ['换人后保留',true,{timeMs:10,priorHits:[skill],fieldChanges:[enter,{timeMs:5,byTeammate:true}]}],
    ['后台命中不能刷新',false,{timeMs:8001,priorHits:[skill,{...skill,timeMs:7000}],fieldChanges:[enter,{timeMs:5,byTeammate:true}]}],
    ['另一种触发刷新',true,{timeMs:8001,priorHits:[skill],reactionRecords:[{...reaction,timeMs:7000}]}],
  ];
  for (const rank of [1,5]) {
    const build: Build = {...weapon,...base,refinement:rank}, attack = build.character.attributes.base.attack + build.weapon!.baseAttack;
    for (const [label,active,settings] of scenarios) {
      const triggering = label === '触发当击', skillId = triggering ? 'skill' : 'normal';
      cases.push({label:label+'/'+rank,build,teammate,fieldChanges:[enter],timeMs:1,...settings,
        damage:{hit:{definition:{group:'characters',namespace:'builtin',id:'chongyun',revision:build.character.revision},hitId:'chongyun.'+skillId+'.param1'},crit:'noncritical',reaction:'none',facts:[]},
        expected:attack*(active?rank===1?1.12:1.24:1)*(triggering?1.7204:.70004)*.5*.9});
    }
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page,cases)).toEqual([]);
});
test('Varka ignores a legacy striking-hand fact on current charged hits in both save formats', async ({ page }) => {
  const starter = { sets: [], artifacts: [], level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0,
    refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const build: Build = { ...await catalogSnapshotFields('varka', 'wastergreatsword'), ...starter };
  const teammate: Build = { ...await catalogSnapshotFields('amber', 'huntersbow'), ...starter };
  const skill = build.character.talents[1], attack = build.character.attributes.base.attack + build.weapon!.baseAttack;
  const cases: ReopenedCase[] = [];
  for (const index of [12, 13]) for (const party of [false, true]) for (const hand of [undefined, 'left', 'right', null]) for (const stance of [false, true]) {
    const raw = attack * skill.parameters.find(p => p.id === 'param' + index)!.values[0] * .5;
    const expected = stance ? raw * (index === 13 ? .6 : party ? .9 : .8) : 0;
    cases.push({ label: [index, party, hand === undefined ? 'omitted' : String(hand), stance].join('/'), build, ...(party ? { teammate } : {}), anemoResistance: .4,
      physicalResistance: .2, expected,
      damage: { hit: { definition: { group: 'characters', namespace: 'builtin', id: 'varka', revision: build.character.revision }, hitId: skill.id + '.param' + index },
        crit: 'noncritical', reaction: 'none', facts: [
          { subject: { kind: 'actor', id: 'owner' }, values: { 'varka.stance': { value: { kind: 'boolean', value: stance }, provenance: 'explicit', sourceRefs: [] } } },
          ...(hand === undefined ? [] : [{ subject: { kind: 'event' as const }, values: {
            strikingHand: { value: hand ? { kind: 'enum' as const, value: hand } : null, provenance: 'explicit' as const, sourceRefs: [] },
          } }]),
        ] } });
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});
test('Furina caps party Fanfare and applies the excess to her own HP after reopening both files', async ({ page }) => {
  const starter = { sets: [], artifacts: [], level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0,
    refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const fields = await catalogSnapshotFields('furina', 'dullblade');
  const teammate: Build = { ...await catalogSnapshotFields('kaeya', 'dullblade'), ...starter };
  const cases: ReopenedCase[] = [];
  for (const constellation of [0, 1, 2]) {
    const build: Build = { ...fields, ...starter, constellation };
    const damage: DamageRequest = { hit: { definition: { group: 'characters', namespace: 'builtin', id: 'furina', revision: fields.character.revision },
      hitId: 'furina.skill.param1' }, crit: 'noncritical', reaction: 'none' };
    for (const hpChanges of [[], [-.25], [-.5, .5], [1, -1], [1, -1, .75]]) for (const delayMs of [10, 18000]) {
      const raw = (constellation ? 150 : 0) + hpChanges.reduce((sum, change) => sum + Math.abs(change), 0) * (constellation === 2 ? 350 : 100);
      const points = delayMs < 18000 ? Math.min(constellation ? 400 : 300, raw) : 0;
      const health = delayMs < 18000 && constellation === 2 ? Math.min(1.4, Math.max(0, raw - 400) * .0035) : 0;
      const expected = 1191.65 * (1 + health) * .07864 * (1 + points * .0007) * .45;
      cases.push({ label: [constellation, hpChanges, delayMs].join('/'), build, damage, teammate, hpChanges, expected, cast: { skillId: 'furina.burst', delayMs } });
    }
    if (constellation === 2) for (const excess of [null, 0, 100, 500]) {
      const fact = (value: number) => ({ value: { kind: 'quantity' as const, unit: 'scalar' as const, value }, provenance: 'explicit' as const, sourceRefs: [] });
      cases.push({ label: 'explicit/' + excess, build, teammate, cast: { skillId: 'furina.burst', delayMs: 10 },
        expected: excess === null ? null : 1191.65 * (1 + Math.min(1.4, excess * .0035)) * .07864 * 1.28 * .45,
        ...(excess === null ? { missingInput: 'furina.excessFanfare' } : {}),
        damage: { ...damage, facts: [{ subject: { kind: 'actor', id: 'owner' }, values: { 'furina.fanfarePoints': fact(400),
          ...(excess === null ? {} : { 'furina.excessFanfare': fact(excess) }) } }] } });
    }
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('Freminet distinguishes his own freezes and shatters, Pressure hits and both constellation thresholds on replay', async ({ page }) => {
  const starter = { sets: [], artifacts: [], level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0,
    refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const fields = await catalogSnapshotFields('freminet', 'wastergreatsword');
  const teammate: Build = { ...await catalogSnapshotFields('kaeya', 'dullblade'), ...starter };
  const reactionRules = assembleCalculationLibrary(readCalculationData('src/game-data/data/calculation/common.json'), readCalculationData('src/game-data/data/calculation/reactions.json'), []);
  const cases: ReopenedCase[] = [];
  for (const [constellation, ascension] of [[0, 0], [0, 4], [4, 4], [6, 4]]) {
    const build: Build = { ...fields, ...starter, constellation, ascension, level: ascension ? 60 : 1 };
    const { character, weapon } = build, skill = character.talents[1], promotion = character.progression.promotion[ascension];
    const baseAttack = character.attributes.base.attack * character.progression.curves.attack[build.level] + promotion.attack + weapon!.baseAttack;
    const talentRank = constellation >= 5 ? 4 : 1;
    for (const kind of ['freeze', 'shatter'] as const) for (const byTeammate of [false, true]) for (const parameter of ['param1', 'param11']) {
      const timeMs = 902, records = [0, 299, 300, 601].map(timeMs => ({ kind, timeMs, byTeammate }));
      const atkPercent = promotion.specialized + (constellation >= 4 && !byTeammate ? .18 : 0);
      const crit = .5 + (constellation >= 6 && !byTeammate ? .36 : 0);
      const damageBonus = ascension >= 4 && kind === 'shatter' && !byTeammate && parameter === 'param11' ? .4 : 0;
      const rate = skill.parameters.find(p => p.id === parameter)!.values[talentRank - 1];
      cases.push({ label: [constellation, ascension, kind, byTeammate, parameter].join('/'), build, teammate, timeMs,
        reactionRecords: records, ...(kind === 'shatter' ? { reactionRules } : {}),
        expected: baseAttack * (1 + atkPercent) * rate * (1 + crit) * (1 + damageBonus) * .45,
        damage: { hit: { definition: { group: 'characters', namespace: 'builtin', id: character.id, revision: character.revision }, hitId: skill.id + '.' + parameter }, crit: 'critical', reaction: 'none' } });
    }
  }
  const crossed = cases.find(row => row.build.constellation === 4 && row.reactionRecords?.[0].kind === 'freeze')!;
  for (const timeMs of [6000,6299]) cases.push({ ...crossed, label:'unverified overlap/'+timeMs, timeMs, expected:null,
    missingInput:'freminet.snowy-moon.stackRefresh', reactionRecords:[{kind:'freeze',timeMs:0},{kind:'freeze',timeMs:300}] });
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('the Geo Travelers’ second explosion and Lynette’s second Vivid Shot keep their own trigger on replay', async ({ page }) => {
  const cases: ReopenedCase[] = [];
  for (const id of ['aether-geo', 'lumine-geo', 'lynette']) {
    const build: Build = { ...await catalogSnapshotFields(id, 'dullblade'), sets: [], artifacts: [], level: 1, ascension: 0,
      constellation: 2, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
    const lynette = id === 'lynette';
    const gate = id + (lynette ? '.vividShotFired' : '.rockcoreDestroyed');
    const hitId = id + (lynette ? '.c2.second-vivid-shot' : '.c2.rockcore-meltdown');
    const full = lynette ? (19.41072 + 23.245) * .456 * .45 : (17.808 + 23.245) * 2.48 * .45;
    for (const triggered of [false, true, null]) {
      const facts: NonNullable<DamageRequest['facts']> = [];
      if (triggered !== null) putHitFact(facts, { kind: 'event' }, gate, { kind: 'boolean', value: triggered });
      if (lynette) putHitFact(facts, { kind: 'event' }, 'absorbedElement', { kind: 'enum', value: 'cryo' });
      cases.push({ label: id + '/' + triggered, build, expected: triggered === null ? null : triggered ? full : 0,
        ...(!lynette ? { capture: { skillId: id + '.skill', phase: 'before' as const } } : {}),
        ...(triggered === null ? { missingInput: gate } : {}), damage: { crit: 'noncritical', reaction: 'none', facts,
          hit: { definition: { group: 'characters', namespace: 'builtin', id, revision: build.character.revision }, hitId } } });
      if (!lynette && triggered === true) cases.push({ label: id + '/missing-rock-creation', build, expected: null, missingInput: 'panel',
        damage: { crit: 'noncritical', reaction: 'none', facts,
          hit: { definition: { group: 'characters', namespace: 'builtin', id, revision: build.character.revision }, hitId } } });
    }
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('Kazuha grants Klee the elemental bonus from a matching Swirl in both reopened files', async ({ page }) => {
  const basic = { level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, constellation: 0,
    refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const build: Build = { ...await catalogSnapshotFields('klee', 'apprenticesnotes'), ...basic };
  const teammate: Build = { ...await catalogSnapshotFields('kaedeharakazuha', 'dullblade'), ...basic, level: 70, ascension: 4 };
  const rules = assembleCalculationLibrary(readCalculationData('src/game-data/data/calculation/common.json'),
    readCalculationData('src/game-data/data/calculation/reactions.json'), []);
  const cases: ReopenedCase[] = [];
  for (const element of ['pyro', 'hydro'] as const) for (const timeMs of [101, 8100]) {
    const bonus = element === 'pyro' && timeMs < 8100 ? 57.6 * .0004 : 0;
    cases.push({ label: '可莉/' + element + '/' + timeMs, build, teammate, timeMs, reactionRules: rules,
      damage: { hit: { definition: { group: 'characters', namespace: 'builtin', id: 'klee', revision: build.character.revision },
        hitId: 'klee.normal.param1' }, crit: 'noncritical', reaction: 'none' },
      reactionRecords: [{ kind: 'swirl', element, byTeammate: true, timeMs: 100 }],
      expected: (24.206 + 23.245) * .7216 * (1 + bonus) * .45 });
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('Iansan reads her attack before the Kinetic Energy Scale bonus on both sides of 42 Nightsoul', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('iansan', 'beginnersprotector'), level: 1, ascension: 0,
    weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const cases: RosterReplayQuery[] = [];
  for (const points of [15, 41, 42, 54]) for (const active of [false, true]) {
    const facts: NonNullable<DamageRequest['facts']> = [];
    const owner = { kind: 'actor' as const, id: 'owner' };
    putHitFact(facts, owner, 'onField', { kind: 'boolean', value: true });
    putHitFact(facts, owner, 'iansan.kineticMarkerActive', { kind: 'boolean', value: active });
    putHitFact(facts, owner, 'iansan.kineticNightsoul', { kind: 'quantity', unit: 'count', value: points });
    const white = 21.54768 + 23.245;
    const bonus = active ? Math.min(330, white * (points >= 42 ? .27 : points * .005)) : 0;
    cases.push({ label: `伊安珊/${active}/${points}`, build, damage: { hit: { definition: { group: 'characters', namespace: 'builtin',
      id: 'iansan', revision: build.character.revision }, hitId: 'iansan.normal.param1' }, crit: 'noncritical', reaction: 'none', facts },
      expected: (white + bonus) * .469758 * .5 * .9 });
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('Engulfing Lightning separates the attack cap and burst recharge through both file formats at every refinement', async ({ page }) => {
  test.setTimeout(120000);
  const catalog = await createRuntimeCatalog();
  const set = await catalog.get('sets', 'emblemofseveredfate');
  const fields = await catalogSnapshotFields('xiangling', 'engulfinglightning');
  const cases: RosterReplayQuery[] = [];
  for (const [i, rate] of [.28, .35, .42, .49, .56].entries()) {
    const refinement = i + 1;
    for (const pieces of [0, 4]) for (const delay of [0, 1, 11999, 12000]) {
      const build: Build = { ...fields, sets:[set], artifacts:[], level:1, ascension:0, constellation:0, weaponLevel:1, weaponAscension:0, refinement,
        talents:{normal:1,skill:1,burst:1}, theoreticalSetSlots:set.slots.slice(0,pieces).map(slot => ({ slot, setId:set.id })) };
      const recharge = 1.12 + (pieces === 4 ? .2 : 0) + (delay > 0 && delay < 12000 ? [.30, .35, .40, .45, .50][i] : 0);
      const attack = (18.87648 + 45.9364) * (1 + Math.min([.8, .9, 1, 1.1, 1.2][i], (recharge - 1) * rate));
      const burstBonus = pieces === 4 ? Math.min(.75, .25 * recharge) : 0;
      cases.push({ label:[refinement,pieces,delay].join('/'), build, expected:attack * .72 * (1 + burstBonus) * .45,
        damage:{ hit:{ definition:{ group:'characters', namespace:'builtin', id:'xiangling', revision:fields.character.revision },
          hitId:'xiangling.burst.param1' }, crit:'noncritical', reaction:'none' }, ...delay ? {cast:{skillId:'xiangling.burst',delayMs:delay}} : {} });
    }
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('Festering Desire applies its skill damage and crit bonuses exactly once for every refinement', async ({ page }) => {
  const fields = await catalogSnapshotFields('kaeya', 'festeringdesire');
  const cases: RosterReplayQuery[] = [];
  for (const [i, bonus] of [.16, .20, .24, .28, .32].entries()) {
    const build: Build = { ...fields, sets: [], artifacts: [], level: 1, ascension: 0, constellation: 0,
      weaponLevel: 1, weaponAscension: 0, refinement: i + 1, talents: { normal: 1, skill: 1, burst: 1 } };
    for (const [category, multiplier] of [['normal', .5375], ['skill', 1.912], ['burst', .776]] as const) {
      const skillId = 'kaeya.' + category;
      const crit = .05 + (category === 'skill' ? [.06, .075, .09, .105, .12][i] : 0);
      const expected = (18.6984 + 42.401) * multiplier * (category === 'skill' ? 1 + bonus : 1) * (1 + crit * .5) * .45;
      cases.push({ label: [build.refinement, category].join('/'), build, expected,
        damage: { hit: { definition: { group:'characters', namespace:'builtin', id:'kaeya', revision:fields.character.revision }, hitId:skillId + '.param1' },
          crit:'expected', reaction:'none' }, ...category === 'burst' ? { capture: { skillId, phase: 'before' as const } } : {} });
    }
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page, cases)).toEqual([]);
});

test('Hu Tao selects one burst damage tier at the 50 percent boundary in both restored files', async ({ page }) => {
  const build: Build = { ...await catalogSnapshotFields('hutao','beginnersprotector'), sets: [], artifacts: [], level: 1,
    ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const cases: ReopenedCase[] = [];
  for (const [index, multiplier] of [3.03272,3.7909].entries()) for (const hp of [.499,.5,.501,null]) {
    const expected = hp === null ? null : (hp <= .5) === (index === 1) ? (8.2859 + 23.245) * multiplier * .45 : 0;
    cases.push({ build, label: [index,hp].join('/'), expected, ...(hp === null ? {missingInput:'hpRatio'} : {}),
      capture: { skillId:'hutao.burst',phase:'before',facts: [{subject:{kind:'actor',id:'owner'},values:{
        'hutao.paramitaPapilio': {value:{kind:'boolean',value:false},provenance:'explicit',sourceRefs:[]},
        onField: {value:{kind:'boolean',value:true},provenance:'explicit',sourceRefs:[]}
      }}] }, damage: {
        hit: { definition: { group:'characters', namespace:'builtin', id:'hutao',revision:build.character.revision }, hitId:'hutao.burst.param' + (index + 1) },
        crit:'noncritical', reaction:'none', facts:[{subject:{kind:'actor',id:'owner'}, values: { hpRatio: {
          value:hp === null ? null : {kind:'quantity',unit:'scalar',value:hp}, provenance:'explicit',sourceRefs:[] } } }] } });
  }
  await page.goto('/');
  expect(await compareReopenedQueries(page,cases)).toEqual([]);
});

test('two Ocean-Hued Clam holders retain separate formation cooldowns after calculator and timeline file replay', async ({ page }) => {
  test.setTimeout(120000);
  const cases: HealingWindowCase[] = [];
  const { summary } = await auditHealingWindows(await createRuntimeCatalog(), engine, (project, expected) => cases.push({ project, expected }));
  expect(summary).toEqual({ setHealingScenarios: 24, setHealingFailures: 0 });
  await page.goto('/');
  for (const entry of cases) {
    const results = await page.evaluate(async project => {
      // @ts-expect-error Vite browser source URL.
      const { copyProjectForCalculator, parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
      // @ts-expect-error Vite browser source URL.
      const { packDocument } = await import('/src/domain/content-document.ts');
      // @ts-expect-error Vite browser source URL.
      const { importProject } = await import('/src/domain/workbench-project.ts');
      const file = copyProjectForCalculator(project);
      const calculator = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', file)));
      const axis = importProject(JSON.stringify(packDocument('axis', project)));
      const request = calculatorWorkerRequest(calculator, 1);
      const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
      const run = (input: AxisRequest) => new Promise<AxisResponse>((resolve, reject) => {
        worker.onmessage = e => resolve(e.data);
        worker.onerror = e => reject(Error(e.message));
        worker.postMessage(input);
      });
      try {
        const fromCalculator = await run(request);
        const fromTimeline = await run({ ...request, project: axis, taskId: 2 });
        return [fromCalculator, fromTimeline].map(reply => reply.result.points.map(point => ({
          actor: project.candidate.actors.find(actor => point.formula.definition === actor.id + '-real-damage')?.id,
          value: point.value
        })));
      } finally { worker.terminate(); }
    }, entry.project);
    expect(results).toEqual([entry.expected, entry.expected]);
  }
});

test('talent healing reads both builds and feeds one clam bubble after calculator and axis reload', async ({ page }) => {
  test.setTimeout(300000);
  const cases: { project: Project; expected: HealingExpectation[]; bubble?: number }[] = [];
  const { summary } = await auditTalentHealing(await createRuntimeCatalog(), engine, (project, expected, bubble) => cases.push({ project, expected, bubble }));
  expect(summary.talentHealingFailures).toBe(0);
  expect(summary.verifiedTalentHeals).toBe(48);
  await page.goto('/');
  for (const entry of cases) {
    const runs = await page.evaluate(async project => {
      // @ts-expect-error Vite browser source URL.
      const { copyProjectForCalculator, parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
      // @ts-expect-error Vite browser source URL.
      const { packDocument } = await import('/src/domain/content-document.ts');
      // @ts-expect-error Vite browser source URL.
      const { importProject } = await import('/src/domain/workbench-project.ts');
      const calculator = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', copyProjectForCalculator(project))));
      const axis = importProject(JSON.stringify(packDocument('axis', project)));
      const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
      const evaluate = (input: AxisRequest) => new Promise<AxisResponse>((resolve, reject) => {
        worker.onmessage = e => resolve(e.data);
        worker.onerror = e => reject(Error(e.message));
        worker.postMessage(input);
      });
      try {
        const request = calculatorWorkerRequest(calculator, 1);
        const results = [await evaluate(request), await evaluate({ ...request, project: axis, taskId: 2 })];
        return results.map(({ result }) => ({ changes: (result.combatChanges ?? []).filter(c => c.kind === 'talent-healing')
          .map(c => ({ source: c.sourceEventIds?.[0] ?? c.source, recipient: c.recipient, status: c.status, healing: c.healing ?? null })), damage: result.points.map(p => p.value) }));
      } finally { worker.terminate(); }
    }, entry.project);
    for (const run of runs) {
      expect(run.changes).toHaveLength(entry.expected.length);
      for (const q of entry.expected) {
        const actual = run.changes.find(row => row.source === q.source && row.recipient === q.recipient);
        expect(actual).toMatchObject({ recipient: q.recipient, status: q.status });
        if (q.healing === null) expect(actual?.healing).toBeNull();
        else expect(actual?.healing).toBeCloseTo(q.healing, 7);
      }
      if (entry.bubble !== undefined) {
        expect(run.damage).toHaveLength(1);
        expect(run.damage[0]).toBeCloseTo(entry.bubble, 7);
      }
    }
  }
});

for (const domain of ['character hits', 'weapon refinements and set thresholds'] as const) test('full catalog replay of ' + domain, async ({ page }) => {
  test.setTimeout(1200000);
  const entities = await replayCatalog();
  const cases: RosterReplayQuery[] = [];
  if (domain === 'character hits') {
    const { summary } = rosterEvaluation(entities, engine, entry => cases.push(entry));
    const formalHits = entities.characters.reduce((count, character) => count + character.talents.reduce((total, talent) => total + talent.hits.length, 0), 0);
    expect(summary.compared).toBe(formalHits);
    expect(cases).toHaveLength(summary.compared);
  } else {
    const { summary } = rosterEquipmentEvaluation(entities, engine, combatObservationUnits, entry => cases.push(entry));
    expect(summary.weaponRefinementsEvaluated).toBe(1216);
    expect(summary.setThresholdsEvaluated).toBe(122);
    expect(cases).toHaveLength(summary.weaponRefinementsEvaluated + 2 * summary.setThresholdsEvaluated);
  }
  await page.goto('/');
  const failures: Awaited<ReturnType<typeof compareReopenedQueries>> = [];
  for (let offset = 0; offset < cases.length; offset += 8) failures.push(...await compareReopenedQueries(page, cases.slice(offset, offset + 8)));
  expect(failures).toEqual([]);
});

test('continuous scene attributes apply and expire after saving a calculator or timeline project', async ({ page }) => {
  test.setTimeout(600000);
  const entities = await replayCatalog();
  const checked = auditPublicScenes(entities, engine);
  type Scene = NonNullable<Project['sceneEffects']>[number]['definition'];
  const definitions: Scene[] = readCalculationData('src/game-data/data/calculation/battle-scenes.json');
  const cases = definitions.filter(s => s.buffs.length && s.buffs.every(b => !b.trigger && b.modifiers.every(m => !m.target.includes('.reaction.')))).map(scene => {
    const rows = checked.rows.filter(r => r.entity === scene.id);
    const active = rows.find(r => r.input && r.recipient === 'actor' && r.onField && r.timeMs === 100
      && Object.values(r.input).some(fact => (fact as { value?: { value?: number | boolean } }).value?.value)
      && rows.some(other => other.target === r.target && other.timeMs === 25000 && other.expected !== r.expected));
    const probe = active ? rows.filter(r => r.timeMs === 100 && r.category === active.category && r.recipient === active.recipient
      && r.onField && JSON.stringify(r.input) === JSON.stringify(active.input)) : rows;
    return {
      scene, expected: probe.map(r => ({ stat: r.target.replace(/^attribute\./, ''),
        delta: active ? r.expected! - rows.find(other => other.timeMs === 25000 && other.target === r.target)!.expected! : r.expectedDelta ?? r.expected })),
      category: active?.category ?? 'normal', input: active?.input as Record<string, CalculationFact> | undefined,
      platform: scene.name.includes('炎祝') ? 'pyro' : scene.name.includes('霜祝') ? 'cryo' : null,
      moonsign: scene.buffs.some(b => b.condition && typeof b.condition === 'object' && 'fact' in b.condition && b.condition.fact === 'firstMoonsign')
    };
  });
  const basic = { level: 1, ascension: 0, constellation: 0, refinement: 1, weaponLevel: 1, weaponAscension: 0, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const build: Build = { ...await catalogSnapshotFields('kaeya', 'dullblade'), ...basic };
  const moon: Build = { ...await catalogSnapshotFields('aino', 'wastergreatsword'), ...basic };
  await page.goto('/');
  const failures: { entity: string; stat: string; expected: unknown; values: unknown }[] = [];
  for (let offset = 0; offset < cases.length; offset += 16) {
    const result = await page.evaluate(async ({ entries, build, moon }) => {
      // @ts-expect-error Vite browser source URL.
      const { createDamageCalculation, parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
      // @ts-expect-error Vite browser source URL.
      const { defaultEnemy, addActorFromBuild } = await import('/src/domain/real-project.ts');
      // @ts-expect-error Vite browser source URL.
      const { packDocument } = await import('/src/domain/content-document.ts');
      // @ts-expect-error Vite browser source URL.
      const { importProject } = await import('/src/domain/workbench-project.ts');
      const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
      const issues = [];
      const evaluate = (request: AxisRequest) => new Promise<AxisResponse>((resolve, reject) => {
        worker.onmessage = e => resolve(e.data); worker.onerror = e => reject(Error(e.message)); worker.postMessage(request);
      });
      try {
        for (const { scene, expected, platform, moonsign, category, input } of entries) {
          const { id, revision, namespace } = build.character;
          const hit = build.character.talents.flatMap(talent => talent.hits).find(hit => hit.category === category)!;
          const doc = createDamageCalculation(build, { hit: { definition: { group: 'characters', id, revision, namespace }, hitId: hit.id }, crit: 'noncritical', reaction: 'none' }, defaultEnemy());
          if (moonsign) addActorFromBuild(doc.project, moon);
          const startMs = 100, endMs = startMs + (scene.durationMs ?? 1000);
          doc.project.sceneEffects = [{ definition: scene, startMs, endMs }];
          doc.project.timeline[0].timeMs = endMs - 1;
          if (input) {
            const rows = [{ subject: { kind: 'actor', id: doc.actorId }, values: { onField: { value: { kind: 'boolean', value: true }, provenance: 'explicit', sourceRefs: [] } } }] as NonNullable<DamageRequest['facts']>;
            for (const [key, value] of Object.entries(input)) {
              const scope = scene.facts?.[key]?.scope;
              if (scope === 'team' || scope === 'target') rows.push({ subject: scope === 'team' ? { kind: 'team' } : { kind: 'target', id: 'target' }, values: { [key]: value } });
              else rows[0].values[key] = value;
            }
            doc.project.timeline[0].damage.facts = rows;
          }
          if (platform) doc.project.timeline[0].damage.facts = [{
            subject: { kind: 'actor', id: doc.actorId }, values: {
              onField: { value: { kind: 'boolean', value: true }, provenance: 'explicit', sourceRefs: [] },
              autumnPlatform: { value: { kind: 'enum', value: platform }, provenance: 'explicit', sourceRefs: [] }
            }
          }];
          const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', doc)));
          const request = calculatorWorkerRequest(reopened, 1);
          const calculate = async (query: AxisRequest) => (await evaluate(query)).result.points.find(p => p.id === doc.recordId)?.real?.panel.attributes;
          const calculator = await calculate(request);
          const project: Project = importProject(JSON.stringify(packDocument('axis', reopened.project)));
          const axis = await calculate({ ...request, project, taskId: 2 });
          project.timeline[0].timeMs = endMs;
          const expired = await calculate({ ...request, project, taskId: 3 });
          for (const { stat, delta } of expected) {
            const values = [calculator?.[stat], axis?.[stat], expired?.[stat]];
            if (typeof delta !== 'number' || !Number.isFinite(delta) || !values.every(v => typeof v === 'number' && Number.isFinite(v)) ||
              Math.abs(values[0]! - values[2]! - delta) > 1e-8 || Math.abs(values[1]! - values[2]! - delta) > 1e-8) {
              issues.push({ entity: scene.id, stat, expected: delta, values });
            }
          }
        }
      } finally { worker.terminate(); }
      return issues;
    }, { entries: cases.slice(offset, offset + 16), build, moon });
    failures.push(...result);
  }
  expect(cases.filter(c => !c.input)).toHaveLength(500);
  expect(cases.every(c => c.expected.length > 0)).toBe(true);
  expect(failures).toEqual([]);
});

test('reaction and event-driven fields replay their source and expiry in the calculator and timeline', async ({ page }) => {
  test.setTimeout(240000);
  const checked = auditPublicScenes(await replayCatalog(), engine);
  type Scene = NonNullable<Project['sceneEffects']>[number]['definition'];
  const definitions: Scene[] = readCalculationData('src/game-data/data/calculation/battle-scenes.json');
  const rules = assembleCalculationLibrary(readCalculationData('src/game-data/data/calculation/common.json'),
    readCalculationData('src/game-data/data/calculation/reactions.json'), []);
  const cases = definitions.filter(s => s.buffs.some(b => b.trigger || b.modifiers.some(m => m.target.includes('.reaction.')))).map(scene => {
    const trigger = scene.buffs[0].trigger;
    const selector = typeof trigger === 'object' && 'kind' in trigger && trigger.kind === 'event' ? trigger.selector : undefined;
    const rows = checked.rows.filter(r => r.entity === scene.id);
    const positive = selector ? rows.find(r => !r.target.includes('reaction.')) : rows.find(r => r.target === 'attribute.reaction.transformative.damageBonus');
    if (!positive || typeof positive.expectedDelta !== 'number') throw new Error('场地缺少独立正向用例 ' + scene.id);
    const observation = selector?.observation?.key;
    const reaction = selector?.reactionIds?.includes('bloom') ? 'bloom' : selector?.reactionIds?.includes('lunar-bloom') ? 'lunar-bloom' : selector?.reactionIds?.[0];
    const source = observation ?? reaction ?? (selector ? 'plunge' : positive.probe);
    if (!source) throw new Error(scene.id + ' 缺少用于重放的来源事件');
    const holder = source === 'swirl' ? 'sucrose' : source === 'electro-charged' ? 'lisa' : source === 'bloom' ? 'barbara' : source === 'lunar-bloom' ? 'columbina' :
      source.startsWith('nightsoul') ? 'kachina' : source === 'bondOfLifeChange' ? 'arlecchino' : 'kaeya';
    const life = scene.buffs[0].lifetime;
    return {
      scene, holder, source, reaction, observation, triggered: Boolean(selector), duration: life?.kind === 'interval' ? life.durationMs : 1000,
      stat: positive.target, delta: positive.expectedDelta
    };
  });
  const basic = { level: 1, ascension: 0, constellation: 0, refinement: 1, weaponLevel: 1, weaponAscension: 0, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  const gear: Record<string, string> = {
    sucrose: 'apprenticesnotes', lisa: 'apprenticesnotes', columbina: 'apprenticesnotes', barbara: 'apprenticesnotes',
    kachina: 'beginnersprotector', arlecchino: 'beginnersprotector', kaeya: 'dullblade'
  };
  const builds: Record<string, Build> = Object.fromEntries(await Promise.all(Object.entries(gear).map(async ([id, weapon]) =>
    [id, { ...await catalogSnapshotFields(id, weapon), ...basic }])));
  await page.goto('/');
  const failures = [];
  for (let offset = 0; offset < cases.length; offset += 10) {
    const result = await page.evaluate(async ({ entries, builds, rules }) => {
      // @ts-expect-error Vite browser source URL.
      const { createDamageCalculation, parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
      // @ts-expect-error Vite browser source URL.
      const { defaultEnemy, addTransformativeReaction, addCombatObservation, addSkillHit, addReactionObservation } = await import('/src/domain/real-project.ts');
      // @ts-expect-error Vite browser source URL.
      const { packDocument } = await import('/src/domain/content-document.ts');
      // @ts-expect-error Vite browser source URL.
      const { importProject } = await import('/src/domain/workbench-project.ts');
      const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
      const evaluate = (request: AxisRequest) => new Promise<AxisResponse>((resolve, reject) => {
        worker.onmessage = e => resolve(e.data); worker.onerror = e => reject(Error(e.message)); worker.postMessage(request);
      });
      const issues = [];
      let current = '';
      try {
        for (const { scene, holder, source, observation, reaction, triggered, duration, stat, delta } of entries) {
          current = scene.id + ' / ' + source;
          const b = builds[holder], c = b.character, talent = c.talents[0];
          const doc = createDamageCalculation(b, {
            hit: { definition: { group: 'characters', namespace: c.namespace, id: c.id, revision: c.revision }, hitId: talent.hits[0].id },
            crit: 'noncritical', reaction: 'none'
          }, defaultEnemy());
          const sourceTime = 100, expiry = sourceTime + duration;
          doc.project.sceneEffects = [{ definition: scene, startMs: triggered ? 0 : sourceTime, endMs: triggered ? expiry + 2 : expiry }];
          if (!triggered) {
            const element = source === 'swirl' ? 'hydro' : source === 'bloom' ? 'dendro' : 'electro';
            addTransformativeReaction(doc.project, doc.actorId, source, element, expiry - 1, rules, doc.recordId);
          } else {
            doc.project.timeline[0].timeMs = expiry - 1;
            if (observation) addCombatObservation(doc.project, doc.actorId, sourceTime, observation,
              observation === 'nightsoulBurst' ? true : observation === 'hpRatioChange' ? -.1 : 1);
            else if (reaction === 'swirl' || reaction === 'bloom') addTransformativeReaction(doc.project, doc.actorId, reaction,
              reaction === 'swirl' ? 'hydro' : 'dendro', sourceTime, rules);
            else if (reaction) addReactionObservation(doc.project, doc.actorId, sourceTime, reaction);
            else addSkillHit(doc.project, doc.actorId, talent.id, talent.hits.findIndex(h => h.category === 'plunge'), sourceTime,
              { crit: 'noncritical', reaction: 'none', facts: [{ subject: { kind: 'event' }, values: { targetsDamaged: { value: { kind: 'quantity', unit: 'count', value: 1 }, sourceRefs: [], provenance: 'explicit' } } }] });
          }
          const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', doc)));
          const request = calculatorWorkerRequest(reopened, 1);
          const measure = async (query: AxisRequest) => {
            const point = (await evaluate(query)).result.points.find(p => p.id === doc.recordId);
            return triggered ? point?.real?.panel.attributes?.[stat] : point?.value;
          };
          const calculator = await measure(request);
          const project: Project = importProject(JSON.stringify(packDocument('axis', reopened.project)));
          const axis = await measure({ ...request, project, taskId: 2 });
          project.timeline.find(r => r.id === doc.recordId)!.timeMs = expiry;
          const expired = await measure({ ...request, project, taskId: 3 });
          const actual = [calculator, axis].map(v => typeof v !== 'number' || typeof expired !== 'number' ? null : triggered ? v - expired : v / expired - 1);
          if (actual.some(v => v === null || !Number.isFinite(v) || Math.abs(v - delta) > 1e-8)) issues.push({ scene: scene.id, source, stat, delta, calculator, axis, expired });
        }
      } catch (cause) {
        throw new Error(current + ' · ' + (cause instanceof Error ? cause.message : String(cause)));
      } finally { worker.terminate(); }
      return issues;
    }, { entries: cases.slice(offset, offset + 10), builds, rules });
    failures.push(...result);
  }
  expect(cases).toHaveLength(78);
  expect(failures).toEqual([]);
});
