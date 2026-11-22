import { expect, test, type Page } from '@playwright/test';
import * as engine from '@leyline/engine';
import { combatObservationUnits, type AxisRequest, type AxisResponse, type Build, type DamageRequest, type Project } from '@leyline/schema';
import { catalogSnapshotFields } from '../../helpers/catalog-snapshot-fields';
import { auditTalentHealing, type HealingExpectation } from '../../../tools/lib/talent-healing-audit.mjs';
import { createRuntimeCatalog } from '../../../tools/lib/runtime-catalog.mjs';
import { auditPublicScenes, rosterEvaluation, rosterEquipmentEvaluation, type RosterReplayQuery } from '../../../tools/lib/roster-evaluation.mjs';
import { readCalculationData } from '../../../tools/lib/catalog-data.mjs';
import { assembleCalculationLibrary } from '../../../tools/lib/calculation-library.mjs';
import { auditHealingWindows, type HealingWindowCase } from '../../../tools/lib/set-condition-audit.mjs';

type ReopenedCase = RosterReplayQuery & { anemoResistance?: number; missingInput?: string; hpChanges?: number[];
  reactionRecords?: { kind: 'freeze' | 'shatter'; timeMs: number; byTeammate?: boolean }[];
  reactionRules?: Project['reactionRules']; timeMs?: number };
async function compareReopenedQueries(page: Page, cases: ReopenedCase[]) {
  const results = await page.evaluate(async cases => {
    // @ts-expect-error Vite browser source URL.
    const { createDamageCalculation, parseDamageCalculator, calculatorWorkerRequest } = await import('/src/domain/damage-calculator.ts');
    // @ts-expect-error Vite browser source URL.
    const { defaultEnemy, addActorFromBuild, addAttributeCapture, addCombatObservation, addReactionObservation, addSkillAction, addTransformativeReaction } = await import('/src/domain/real-project.ts');
    // @ts-expect-error Vite browser source URL.
    const { packDocument } = await import('/src/domain/content-document.ts');
    // @ts-expect-error Vite browser source URL.
    const { importProject } = await import('/src/domain/workbench-project.ts');
    const worker = new Worker('/src/workers/axis.worker.ts?worker_file&type=module', { type: 'module' });
    const evaluate = (request: AxisRequest) => new Promise<AxisResponse>((resolve, reject) => {
      worker.onmessage = event => resolve(event.data); worker.onerror = event => reject(Error(event.message)); worker.postMessage(request);
    });
    const values = [];
    try {
      for (const { build, damage, teammate, capture, cast, anemoResistance, hpChanges, reactionRecords, reactionRules, timeMs } of cases) {
        const enemy = defaultEnemy(); enemy.level = build.level;
        if (anemoResistance !== undefined) enemy.resistances.anemo = anemoResistance;
        const file = createDamageCalculation(build, damage, enemy);
        const peer = teammate && addActorFromBuild(file.project, teammate);
        if (timeMs !== undefined) file.project.timeline[0].timeMs = timeMs;
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
          else addReactionObservation(file.project, actor, reaction.timeMs, reaction.kind);
        }
        if (reactionRecords) file.project.objective.damageIds = [file.recordId];
        if (capture) {
          file.project.timeline[0].timeMs = 1;
          const recordId = addAttributeCapture(file.project, file.actorId, capture.skillId, 0);
          file.project.timeline[0].damage.capture = { recordId, phase: capture.phase };
        }
        const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', file)));
        const request = calculatorWorkerRequest(reopened, 1);
        const calculator = (await evaluate(request)).result;
        const project = importProject(JSON.stringify(packDocument('axis', reopened.project)));
        const axis = (await evaluate({ ...request, project, taskId: 2 })).result;
        values.push([calculator, axis].map(r => ({
          value: reactionRecords ? r.objectiveValue : r.totalValue, matches: r.points.filter(p => p.id === file.recordId).length,
          missing: r.points.find(p => p.id === file.recordId)?.real?.structured?.requiredInputs.map(input => input.key) ?? [],
          issues: r.totalValue === null ? r.diagnostics.map(d => d.message).slice(0, 3) : []
        })));
      }
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
        const rate = term.ratio ?? normal.parameters.find(p => p.id === term.parameter)!.values[0];
        return sum + atk * rate;
      }, 0) * .5 * .9;
      const flag = (value: boolean) => ({ value: { kind: 'boolean' as const, value }, sourceRefs: [], provenance: 'explicit' as const });
      const actorFacts = Object.fromEntries(Object.entries(character.metadata.facts ?? {}).filter(([, f]) => f.scope === 'owner' && f.type.kind === 'boolean').map(([key]) => [key, flag(false)]));
      const damage: DamageRequest = {
        hit: { definition: { group: 'characters', namespace: character.namespace, id, revision: character.revision }, hitId: first.id }, crit: 'noncritical', reaction: 'none',
        facts: [{ subject: { kind: 'actor', id: 'owner' }, values: { ...actorFacts, onField: flag(true), shielded: flag(false), hpRatio: { value: { kind: 'quantity', unit: 'scalar', value: 1 }, sourceRefs: [], provenance: 'explicit' } } }]
      };
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
test('Varka keeps the recorded striking hand and reports an undetermined charged hit in both save formats', async ({ page }) => {
  const starter = { sets: [], artifacts: [], level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0,
    refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  const build: Build = { ...await catalogSnapshotFields('varka', 'wastergreatsword'), ...starter };
  const teammate: Build = { ...await catalogSnapshotFields('amber', 'huntersbow'), ...starter };
  const skill = build.character.talents[1], attack = build.character.attributes.base.attack + build.weapon!.baseAttack;
  const cases: ReopenedCase[] = [];
  for (const index of [12, 13]) for (const party of [false, true]) for (const hand of ['left', 'right', null]) for (const stance of [false, true]) {
    const raw = attack * skill.parameters.find(p => p.id === 'param' + index)!.values[0] * .5;
    const expected = !stance ? 0 : party && hand === null ? null : raw * (!party || hand === 'left' ? .6 : .9);
    cases.push({ label: [index, party, hand, stance].join('/'), build, ...(party ? { teammate } : {}), anemoResistance: .4,
      expected, ...(expected === null ? { missingInput: 'strikingHand' } : {}),
      damage: { hit: { definition: { group: 'characters', namespace: 'builtin', id: 'varka', revision: build.character.revision }, hitId: skill.id + '.param' + index },
        crit: 'noncritical', reaction: 'none', facts: [
          { subject: { kind: 'actor', id: 'owner' }, values: { 'varka.stance': { value: { kind: 'boolean', value: stance }, provenance: 'explicit', sourceRefs: [] } } },
          { subject: { kind: 'event' }, values: { strikingHand: { value: hand ? { kind: 'enum', value: hand } : null, provenance: 'explicit', sourceRefs: [] } } },
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
      capture: { skillId:'hutao.burst',phase:'before' }, damage: {
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
  expect(summary.verifiedTalentHeals).toBe(41);
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
    expect(summary.compared).toBe(2142);
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
  const cases = definitions.filter(s => s.buffs.every(b => !b.trigger && b.modifiers.every(m => !m.target.includes('.reaction.')))).map(scene => {
    const rows = checked.rows.filter(r => r.entity === scene.id);
    return {
      scene, expected: rows.map(r => ({ stat: r.target.slice('attribute.'.length), delta: r.expectedDelta ?? r.expected })),
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
        for (const { scene, expected, platform, moonsign } of entries) {
          const { id, revision, namespace } = build.character;
          const doc = createDamageCalculation(build, { hit: { definition: { group: 'characters', id, revision, namespace }, hitId: 'kaeya.normal.param1' }, crit: 'noncritical', reaction: 'none' }, defaultEnemy());
          if (moonsign) addActorFromBuild(doc.project, moon);
          const startMs = 100, endMs = startMs + (scene.durationMs ?? 1000);
          doc.project.sceneEffects = [{ definition: scene, startMs, endMs }];
          doc.project.timeline[0].timeMs = endMs - 1;
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
  expect(cases).toHaveLength(500);
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
      try {
        for (const { scene, holder, source, observation, reaction, triggered, duration, stat, delta } of entries) {
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
      } finally { worker.terminate(); }
      return issues;
    }, { entries: cases.slice(offset, offset + 10), builds, rules });
    failures.push(...result);
  }
  expect(cases).toHaveLength(78);
  expect(failures).toEqual([]);
});
