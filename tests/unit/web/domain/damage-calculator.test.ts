import { hpFacts } from '../../../helpers/catalog-calculation';
import { characterHitRef } from '@leyline/schema';
import { officialShowcase } from '../../../helpers/recorded-reference';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport, confirmEnkaImport } from '../../../../src/web/src/domain/enka-import';
import { calculatorCritProject, calculatorSnapshotDraft, calculatorWorkerRequest, createDamageCalculation, parseDamageCalculator, prepareCalculatorEvaluationProject, readCalculatorSource } from '../../../../src/web/src/domain/damage-calculator';
import { packDocument } from '../../../../src/web/src/domain/content-document';
import { projectSchema, putHitFact, subjectFacts, type Build, type DamageCalculatorDocument, type Project } from '@leyline/schema';
import { recordedVaresaPlunge, vesnaRecording } from '../../../helpers/recorded-vesna';
import { applyCalculatorBuffs, calculatorBuffChecked, calculatorBuffChoices, enableCalculatorBuff, resolveBuffSelection } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild, addSingleContributorReaction, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject, nextRecordId } from '../../../../src/web/src/domain/workbench-project';
import { evaluateTimeline } from '@leyline/engine';
import { getArtifactMain, getArtifactSet, getBuildSources, getCharacter, getReactionCalculationBundle, getWeapon, stellarSwirlCoefficients } from '@leyline/game-data';
import { calculatorHitChoices } from '../../../../src/web/src/domain/calculator-hits';
import { calculatorIntervals, setCalculatorCondition } from '../../../../src/web/src/domain/calculator-conditions';

it('preserves a recorded joint expectation when evaluating the all-critical alternative', () => {
  const project = createEmptyProject();
  const reaction = {
    family: 'lunar-charged' as const, element: 'electro' as const,
    contributors: [
      { actorId: 'first', qualified: true, crit: 'expected' as const },
      { actorId: 'second', qualified: true, crit: 'noncritical' as const },
    ],
    jointCrit: [
      { id: 'on', probability: 0.25, critical: { first: true } },
      { id: 'off', probability: 0.75, critical: { first: false } },
    ],
  };
  project.timeline.push({ id: 'hit', actor: 'first', kind: 'damage', definition: 'reaction', timeMs: 0, order: 0, reactionEvent: reaction });
  const critical = calculatorCritProject(project, 'hit', 'critical').timeline[0].reactionEvent!;
  expect(critical.contributors.map(owner => owner.crit)).toEqual(['critical', 'critical']);
  expect(critical.jointCrit).toBeUndefined();
  expect(calculatorCritProject(project, 'hit', 'expected')).toBe(project);
  expect(project.timeline[0].reactionEvent).toEqual(reaction);
  expect(reaction.contributors.map(owner => owner.crit)).toEqual(['expected', 'noncritical']);
});

const datedShowcase = '.references/enka/official-example-2026-11-13.json';
it.skipIf(!existsSync(datedShowcase))('editing a calculator snapshot preserves owned references and leaves public gear unowned', async () => {
  const account = createAccount();
  const preview = await previewEnkaImport(JSON.parse(readFileSync(datedShowcase, 'utf8')), '618285856', account);
  const entry = preview.rows[0].character;
  confirmEnkaImport(account, preview, [entry.id], true);
  const before = JSON.stringify(account);
  const { character: local } = await readCalculatorSource(account, account.characters[0].id, 'local');
  const owned = calculatorSnapshotDraft(account, local.build!);
  expect(owned.character.id).toBe(local.id);
  expect(owned.character.equipment).toEqual(local.equipment);

  const showcase = entry.showcase!.build;
  expect(showcase.artifacts.length).toBeGreaterThan(0);
  const draft = calculatorSnapshotDraft(account, showcase);
  const artifacts = draft.account.artifacts.filter(item => Object.values(draft.character.equipment).includes(item.id));
  expect(artifacts).toHaveLength(showcase.artifacts.length);
  expect(artifacts.every(item => item.inventoryId === null)).toBe(true);
  const { character } = await readCalculatorSource(draft.account, draft.character.id, 'local');
  expect(character.build!.artifacts.every(piece => piece.inventory === null)).toBe(true);
  expect(JSON.stringify(account)).toBe(before);
});

describe.skipIf(!existsSync(officialShowcase))('calculator reads original public showcase and local inventory independently', () => {
  it('retains real wearing IDs when a format derivative lacks a local cultivation build', async () => {
    const account = createAccount();
    const preview = await previewEnkaImport(JSON.parse(readFileSync(officialShowcase, 'utf8')), '618285856', account);
    const row = preview.rows.find(row => row.character.showcase!.build.character.id === 'xingqiu')!;
    confirmEnkaImport(account, preview, [row.character.id], true);
    const character = account.characters[0];
    const complete = await readCalculatorSource(account, character.id, 'local');
    expect(complete.character.build!.artifacts.map(item => item.id)).toEqual(Object.values(character.equipment));
    // Explicit missing-field derivative of the original import; not a reconstructed player export.
    delete character.build;
    const original = JSON.stringify(account);
    const pending = await readCalculatorSource(account, character.id, 'local');
    expect(pending.character.build).toBeUndefined(); // Existing showcase must not fill missing local fields.
    expect(pending.equipment!.artifacts.map(item => item.id)).toEqual(Object.values(character.equipment));
    expect(pending.equipment!.artifacts).toHaveLength(5);
    expect(pending.equipment!.artifacts.every(item => item.inventory?.accountId === account.id)).toBe(true);
    const showcase = await readCalculatorSource(account, character.id, 'showcase');
    expect(showcase.equipment).toBeUndefined();
    expect(showcase.character.equipment).toEqual({});
    expect(showcase.character.build).toEqual(character.showcase!.build);
    expect(JSON.stringify(account)).toBe(original);
    pending.equipment!.artifacts[0].substats[0].value = 0;
    expect(JSON.stringify(account)).toBe(original);
    account.artifacts = account.artifacts.filter(item => item.id !== Object.values(character.equipment)[0]);
    await expect(readCalculatorSource(account, character.id, 'local')).rejects.toThrow('待补全');
  });
});

it.skipIf(!existsSync(vesnaRecording))('the recorded Varesa trial uses the same shared project formula and requires a known crit choice', async () => {
  const preview = await previewEnkaImport(JSON.parse(readFileSync(vesnaRecording, 'utf8')), '107590923', createAccount());
  const build = preview.rows.find(row => row.character.showcase?.build.character.id === 'varesa')!.character.showcase!.build;
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const actorId = addActorFromBuild(project, build);
  const skill = build.character.talents.find(skill => skill.id === 'varesa.burst')!;
  const hit = skill.hits.find(hit => hit.id === 'varesa.burst.param5')!;
  const recordId = nextRecordId(project);
  project.timeline.push({ id: recordId, actor: actorId, kind: 'damage', definition: actorId + '-real-damage', timeMs: 0, order: 0,
    damage: { hit: characterHitRef(build.character, hit.id), crit: 'critical', reaction: 'none' } });
  const inputs = project.timeline[0].damage!.facts ??= [];
  putHitFact(inputs, { kind: 'actor', id: actorId }, 'thewidsith.debutSong', { kind: 'quantity', unit: 'count', value: 0 });
  putHitFact(inputs, { kind: 'actor', id: actorId }, 'shimenawasreminiscence.energy-spentActive', { kind: 'boolean', value: false });
  const document: DamageCalculatorDocument = { schemaVersion: project.schemaVersion, kind: 'damage-calculator', project, actorId, recordId };
  expect(projectSchema.safeParse(project).success).toBe(true);
  const saved = JSON.stringify(document);
  const evaluate = () => evaluateTimeline(calculatorWorkerRequest(document, 1).project).points.find(point => point.id === recordId)!;
  const point = evaluate();

  expect(point.value, point.real?.diagnostics.join(' / ')).toBeCloseTo(recordedVaresaPlunge('critical'), 5);
  const output = point.real!.structured!.outputs[0].value;
  const modeled = output.state === 'known' ? output.value : undefined;
  expect(modeled?.kind === 'quantity' && modeled.value).toBeCloseTo(recordedVaresaPlunge('critical'), 5);
  expect(JSON.stringify(document)).toBe(saved);
  project.timeline[0].damage!.crit = null;
  const unknown = evaluate();
  expect(unknown.value).toBeNull();
  expect(unknown.real!.structured!.outputs[0].value.state).toBe('unknown');
}, 20000);

it.skipIf(!existsSync(officialShowcase))('Harbinger trial uses the actual HP threshold, interval and hit override', async () => {
  const preview = await previewEnkaImport(JSON.parse(readFileSync(officialShowcase, 'utf8')), '618285856', createAccount());
  const original = preview.rows.find(row => row.character.showcase?.build.character.id === 'xingqiu')!.character.showcase!.build;
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  // Explicit weapon trial on the public build. The HP readings below are calculator inputs.
  const actor = addActorFromBuild(project, { ...original, weapon: await getWeapon('harbingerofdawn'), refinement: 1 });
  const id = addSkillHit(project, actor, 'xingqiu.skill', 0, 1000, { crit: 'expected', reaction: 'none' });
  const damage = project.timeline[0].damage!;
  const option = () => calculatorBuffChoices(project, actor, damage, 1000, id).find(choice => choice.effect.id === 'harbingerofdawn.static-critRate')!;
  expect(option()).toMatchObject({ checked: false, hp: { threshold: 0.9, relation: 'gt', preset: 1 } });
  project.combatStates = [{ id: 'trial-hp', actor, startMs: 1000, endMs: 2000, values: { hpRatio: 0.95 } }];
  expect(option().checked).toBe(true);
  expect(calculatorIntervals(project, actor, 2000, id)).toEqual({});
  damage.facts = hpFacts(actor, 0.9);
  expect(option().checked).toBe(false);
  const rate = () => evaluateTimeline(project).points[0].real!.panel.stats.critRate!;
  const before = rate();
  setCalculatorCondition(damage, actor, 'hpRatio', option().hp!.preset);
  expect(option().checked).toBe(true);
  expect(rate() - before).toBeCloseTo(0.14, 10);
  expect(damage.facts[0].values.hpRatio.value?.value).toBe(1);
  expect(project.combatStates[0].values.hpRatio).toBe(0.95);
});

it.skipIf(!existsSync(officialShowcase))('selecting the recorded Bennett Noblesse set places its burst before Xingqiu’s hit and removing it reverses only the trial bonus', async () => {
  const preview = await previewEnkaImport(JSON.parse(readFileSync(officialShowcase,'utf8')), '618285856', createAccount());
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const build = (id: string) => preview.rows.find(row => row.character.showcase?.build.character.id === id)!.character.showcase!.build;
  const source = addActorFromBuild(project,build('bennett'));
  const recipient = addActorFromBuild(project,build('xingqiu'));
  const hitId = addSkillHit(project,recipient,'xingqiu.skill',0,1000,{crit:'noncritical',reaction:'none'});
  const damage = project.timeline[0].damage!;
  damage.facts = [{ subject: { kind: 'actor', id: recipient }, values: { onField: { value: { kind: 'boolean', value: false }, provenance: 'explicit', sourceRefs: [] } } }];
  const initial = calculatorBuffChoices(project,recipient,damage,1000,hitId);
  putHitFact(damage.facts!, { kind: 'actor', id: source }, 'freedomsworn.rebelSong', { kind: 'boolean', value: false });
  const set = initial.find(option => option.ownerId === source && option.effect.id === 'noblesseoblige.burst-team-attack.team-attack')!;
  expect(set.checked).toBe(false);
  const active = applyCalculatorBuffs(project,damage,initial,new Map([[set.id,true]]),1000,hitId);
  expect(project.timeline).toHaveLength(1);
  const action = active.project.timeline.find(record => record.kind === 'action')!;
  expect(action).toMatchObject({actor:source, timeMs:1000, skillId:'bennett.burst'});
  expect(action.order).toBeLessThan(active.project.timeline.find(record => record.id === hitId)!.order);
  const available = calculatorBuffChoices(active.project,recipient,damage,1000,hitId);
  const applied = available.find(option => option.ownerId === source && option.effect.id === set.effect.id)!;
  expect(applied.checked).toBe(true);
  const off = applyCalculatorBuffs(active.project,damage,available,new Map([[applied.id,false]]),1000,hitId);
  const onPanel = evaluateTimeline(active.project).points.find(point => point.id === hitId)!.real!.panel;
  const offPanel = evaluateTimeline(off.project).points.find(point => point.id === hitId)!.real!.panel;
  expect(onPanel.stats.attack! - offPanel.stats.attack!, [...onPanel.diagnostics, ...offPanel.diagnostics].join(' / ')).toBeCloseTo(offPanel.baseStats!.attack * 0.20, 6);
  expect(off.project.timeline).toEqual(active.project.timeline);
  expect(active.project.effectRevisions).toBeUndefined();
});


it('exposes new character hits and explicit weapon windows in calculator controls', async () => {
  const [mualani, artifactMain, sources] = await Promise.all([getCharacter('mualani'), getArtifactMain(), getBuildSources()]);
  const makeBuild = async (characterId: string, weaponId: string) => {
    const [character, weapon] = await Promise.all([getCharacter(characterId), getWeapon(weaponId)]);
    return { ...sources, character, weapon, artifactMain, sets: [], artifacts: [], schemaVersion: character.schemaVersion,
      dataVersion: character.dataVersion, kind: 'calculation-build' as const, level: 1, ascension: 0, constellation: 0,
      weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  };
  const mualaniBuild = await makeBuild('mualani', 'apprenticesnotes');
  expect(calculatorHitChoices(mualani, mualaniBuild).find(row => row.hitId === 'mualani.skill.param1')?.available).toBe(true);
  expect(calculatorHitChoices(mualani, mualaniBuild).some(row => row.hitId === 'mualani.skill.shark-missile')).toBe(true);
  expect(mualani.talents.find(row => row.id === 'mualani.skill')?.inputs?.find(field => field.id === 'mualani.biteTargets')).toMatchObject({ min: 1, max: 3, integer: true });
  for (const [characterId, weaponId, key] of [
    ['kaeya', 'athameartis', 'athameartis.daybreakWindow'],
    ['neuvillette', 'waveridingwhirl', 'waveridingwhirl.whirlWindow'],
  ]) {
    const build = await makeBuild(characterId, weaponId), project = createEmptyProject(); project.enemy = defaultEnemy();
    const actor = addActorFromBuild(project, build);
    const talent = build.character.talents.find(row => row.category === (characterId === 'neuvillette' ? 'skill' : 'normal') && row.hits.length)!;
    const id = addSkillHit(project, actor, talent.id, 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const request = project.timeline.find(row => row.id === id)!.damage!;
    const fields = calculatorBuffChoices(project, actor, request, 1000, id).filter(row => row.effect.id.startsWith(weaponId + '.')).flatMap(row => row.fields);
    expect(fields).toContainEqual(expect.objectContaining({ key, fromTrigger: true, subject: { kind: 'actor', id: actor } }));
  }
});

it('preserves baseline invariants and evaluates critical and expected deltas when candidate introduces conditional and HP buffs', async () => {
  const [artifactMain, sources, huTao, beginnersProtector, staffOfHoma, lisa, apprenticesNotes, theWidsith] = await Promise.all([
    getArtifactMain(), getBuildSources(),
    getCharacter('hutao'), getWeapon('beginnersprotector'), getWeapon('staffofhoma'),
    getCharacter('lisa'), getWeapon('apprenticesnotes'), getWeapon('thewidsith'),
  ]);

  const cases = [
    {
      label: 'Hu Tao Beginner -> Staff of Homa C6',
      hitId: 'hutao.normal.param1',
      baselineBuild: {
        ...sources, character: huTao, weapon: beginnersProtector, artifactMain, sets: [], artifacts: [],
        schemaVersion: huTao.schemaVersion, dataVersion: huTao.dataVersion, kind: 'calculation-build' as const,
        level: 90, ascension: 6, constellation: 0, weaponLevel: 70, weaponAscension: 4, refinement: 1,
        talents: { normal: 10, skill: 10, burst: 10 },
      },
      candidateBuild: {
        ...sources, character: huTao, weapon: staffOfHoma, artifactMain, sets: [], artifacts: [],
        schemaVersion: huTao.schemaVersion, dataVersion: huTao.dataVersion, kind: 'calculation-build' as const,
        level: 90, ascension: 6, constellation: 6, weaponLevel: 90, weaponAscension: 6, refinement: 1,
        talents: { normal: 10, skill: 10, burst: 10 },
      },
    },
    {
      label: 'Lisa Apprentice -> The Widsith C6',
      hitId: 'lisa.skill.param1',
      baselineBuild: {
        ...sources, character: lisa, weapon: apprenticesNotes, artifactMain, sets: [], artifacts: [],
        schemaVersion: lisa.schemaVersion, dataVersion: lisa.dataVersion, kind: 'calculation-build' as const,
        level: 90, ascension: 6, constellation: 0, weaponLevel: 70, weaponAscension: 4, refinement: 1,
        talents: { normal: 10, skill: 10, burst: 10 },
      },
      candidateBuild: {
        ...sources, character: lisa, weapon: theWidsith, artifactMain, sets: [], artifacts: [],
        schemaVersion: lisa.schemaVersion, dataVersion: lisa.dataVersion, kind: 'calculation-build' as const,
        level: 90, ascension: 6, constellation: 6, weaponLevel: 90, weaponAscension: 6, refinement: 1,
        talents: { normal: 10, skill: 10, burst: 10 },
      },
    },
  ];

  for (const scenario of cases) {
    const doc = createDamageCalculation(
      scenario.baselineBuild,
      { hit: characterHitRef(scenario.baselineBuild.character, scenario.hitId), crit: 'critical', reaction: 'none' },
      defaultEnemy(),
    );
    doc.baseline = projectSchema.parse(doc.project);
    // Option A: mutate ONLY candidate actor build on document.project while preserving baseline timeline/conditions/definitions.
    doc.project.candidate.actors[0].build = scenario.candidateBuild;

    const serialized = JSON.stringify(packDocument('damage-calculator', doc));
    const reopened = parseDamageCalculator(serialized);
    expect(reopened.baseline, scenario.label).toBeDefined();

    const recordId = reopened.recordId!;
    const baselinePrepared = prepareCalculatorEvaluationProject(reopened.baseline!, reopened.actorId, recordId);
    const candidatePrepared = prepareCalculatorEvaluationProject(reopened.project, reopened.actorId, recordId);

    const evaluateMode = (project: typeof baselinePrepared, mode: 'critical' | 'expected') => {
      const evaluated = evaluateTimeline(calculatorCritProject(project, recordId, mode));
      const point = evaluated.points.find(p => p.id === recordId)!;
      expect(point.value, `${scenario.label}/${mode}`).not.toBeNull();
      expect(Number.isFinite(point.value!), `${scenario.label}/${mode}`).toBe(true);
      const missingDiagnostics = [
        ...evaluated.diagnostics.filter(d => d.code === 'unknown' || d.code === 'invalid-input' || d.code === 'stale-revision'),
        ...(point.real?.structured?.diagnostics ?? []).filter(d => d.code === 'missing-fact'),
      ];
      expect(missingDiagnostics, `${scenario.label}/${mode}`).toEqual([]);
      return point.value!;
    };

    const baseCrit = evaluateMode(baselinePrepared, 'critical');
    const baseExp = evaluateMode(baselinePrepared, 'expected');
    const candCrit = evaluateMode(candidatePrepared, 'critical');
    const candExp = evaluateMode(candidatePrepared, 'expected');

    expect(candCrit - baseCrit, scenario.label).toBeGreaterThan(0);
    expect(candExp - baseExp, scenario.label).toBeGreaterThan(0);
  }
});

describe('multi-actor calculator evaluation and teammate conditional buffs', () => {
  async function makePartyBuild(
    characterId: string,
    weaponId: string,
    options: { constellation?: number; refinement?: number; setId?: string; setPieces?: number } = {},
  ): Promise<Build> {
    const [character, weapon, artifactMain, sources, set] = await Promise.all([
      getCharacter(characterId),
      getWeapon(weaponId),
      getArtifactMain(),
      getBuildSources(),
      options.setId ? getArtifactSet(options.setId) : Promise.resolve(undefined),
    ]);
    const sets = set ? [set] : [];
    const pieces = options.setPieces ?? (set ? 4 : 0);
    return {
      ...sources,
      schemaVersion: character.schemaVersion,
      dataVersion: character.dataVersion,
      kind: 'calculation-build',
      character,
      weapon,
      artifactMain,
      level: 90,
      ascension: 6,
      weaponLevel: weapon.rarity >= 3 ? 90 : 70,
      weaponAscension: weapon.rarity >= 3 ? 6 : 4,
      constellation: options.constellation ?? 0,
      refinement: options.refinement ?? 1,
      talents: { normal: 10, skill: 10, burst: 10 },
      artifacts: [],
      sets,
      ...(set && pieces ? { theoreticalSetSlots: set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id })) } : {}),
    };
  }

  function evaluatePreparedModes(project: Project, actorId: string, recordId: string, label: string) {
    const beforeRevisions = JSON.stringify(project.effectRevisions);
    const prepared = prepareCalculatorEvaluationProject(project, actorId, recordId);
    expect(JSON.stringify(project.effectRevisions), `${label}: input effectRevisions mutated`).toBe(beforeRevisions);

    const results = {} as Record<'critical' | 'expected', number>;
    for (const mode of ['critical', 'expected'] as const) {
      const evaluated = evaluateTimeline(calculatorCritProject(prepared, recordId, mode));
      const badDiagnostics = [
        ...evaluated.diagnostics.filter(d => d.code === 'unknown' || d.code === 'invalid-input' || d.code === 'stale-revision'),
      ];
      expect(badDiagnostics, `${label}/${mode}`).toEqual([]);
      expect(evaluated.status, `${label}/${mode}: ${JSON.stringify(evaluated.diagnostics)}`).not.toBe('invalid');
      const point = evaluated.points.find(p => p.id === recordId)!;
      expect(point, `${label}/${mode}`).toBeDefined();
      expect(point.value, `${label}/${mode}`).not.toBeNull();
      expect(Number.isFinite(point.value!), `${label}/${mode}`).toBe(true);
      expect(point.value!, `${label}/${mode}`).toBeGreaterThan(0);
      const missingFacts = (point.real?.structured?.diagnostics ?? []).filter(d => d.code === 'missing-fact');
      expect(missingFacts, `${label}/${mode}`).toEqual([]);
      results[mode] = point.value!;
    }
    return { prepared, ...results };
  }

  function enableChoicesOnPrepared(
    prepared: Project,
    actorId: string,
    recordId: string,
    effectIds: readonly string[],
  ): Project {
    const record = prepared.timeline.find(entry => entry.id === recordId)!;
    const damage = structuredClone(record.damage!);
    const choices = calculatorBuffChoices(prepared, actorId, damage, record.timeMs, recordId);
    const changes = new Map<string, boolean>();
    for (const effectId of effectIds) {
      const match = choices.find(choice => choice.effect.id === effectId);
      expect(match, `missing choice ${effectId}`).toBeDefined();
      enableCalculatorBuff(match!, damage, {}, actorId);
      expect(calculatorBuffChecked(match!, damage, true), `checked after enable ${effectId}`).toBe(true);
      changes.set(match!.id, true);
    }
    const selected = resolveBuffSelection(choices, damage, {}, actorId, changes);
    const applied = applyCalculatorBuffs(prepared, damage, choices, selected, record.timeMs, recordId);
    const nextRecord = applied.project.timeline.find(entry => entry.id === recordId)!;
    nextRecord.damage = { ...damage, effectApplications: applied.applications };
    return applied.project;
  }

  it('evaluates Odette C6 hits and standalone Stellar-Swirl in a 4-member TTDS party and scales cleanly when TTDS and Odette C2 are enabled', async () => {
    const [odette, vesna, lisa, fischl, reactionRules] = await Promise.all([
      makePartyBuild('odette', 'dullblade', { constellation: 6 }),
      makePartyBuild('vesna', 'dullblade', { constellation: 6 }),
      makePartyBuild('lisa', 'thrillingtalesofdragonslayers', { constellation: 0, refinement: 5, setId: 'noblesseoblige', setPieces: 4 }),
      makePartyBuild('fischl', 'thestringless', { constellation: 6, setId: 'tenacityofthemillelith', setPieces: 4 }),
      getReactionCalculationBundle(),
    ]);

    const buildHitDoc = (hitId: string): DamageCalculatorDocument => {
      const doc = createDamageCalculation(odette, { hit: characterHitRef(odette.character, hitId), crit: 'critical', reaction: 'none' }, defaultEnemy());
      addActorFromBuild(doc.project, vesna);
      addActorFromBuild(doc.project, lisa);
      addActorFromBuild(doc.project, fischl);
      return doc;
    };

    const hitIds = ['odette.skill.param6', 'odette.skill.param9', 'odette.c1.finale-conduct', 'odette.c1.finale-swirl'] as const;
    const baselineResults = new Map<string, { doc: DamageCalculatorDocument; prepared: Project; critical: number; expected: number }>();

    for (const hitId of hitIds) {
      const doc = buildHitDoc(hitId);
      expect(doc.project.effectRevisions).toBeUndefined();
      const evaluated = evaluatePreparedModes(doc.project, doc.actorId, doc.recordId!, hitId);
      baselineResults.set(hitId, { doc, ...evaluated });
    }

    // Standalone stellar-swirl reaction for Odette in the 4-member party.
    {
      const doc = buildHitDoc('odette.skill.param6');
      doc.recordId = addSingleContributorReaction(
        doc.project, doc.actorId, 'stellar-swirl', 'anemo', 0, reactionRules, doc.recordId, stellarSwirlCoefficients.initialAnemo,
      );
      evaluatePreparedModes(doc.project, doc.actorId, doc.recordId, 'odette.standalone.stellar-swirl');
    }

    for (const hitId of ['odette.skill.param6', 'odette.c1.finale-conduct'] as const) {
      const base = baselineResults.get(hitId)!;
      const { doc } = base;
      const ttdsProject = enableChoicesOnPrepared(base.prepared, doc.actorId, doc.recordId!, ['thrillingtalesofdragonslayers.handoff-attack']);
      const ttdsFact = subjectFacts(ttdsProject.timeline.find(entry => entry.id === doc.recordId)?.damage?.facts, { kind: 'actor', id: doc.actorId })
        ?.['thrillingtalesofdragonslayers.switchRecipient'];
      expect(ttdsFact?.value).toEqual({ kind: 'boolean', value: true });
      const withTtds = evaluatePreparedModes(ttdsProject, doc.actorId, doc.recordId!, `${hitId}+TTDS`);
      expect(withTtds.critical, `${hitId}+TTDS critical`).toBeGreaterThan(base.critical);
      expect(withTtds.expected, `${hitId}+TTDS expected`).toBeGreaterThan(base.expected);

      const ttdsAndC2Project = enableChoicesOnPrepared(withTtds.prepared, doc.actorId, doc.recordId!, [
        'thrillingtalesofdragonslayers.handoff-attack',
        'odette.c2.splendor-attack',
      ]);
      const splendorFact = subjectFacts(ttdsAndC2Project.timeline.find(entry => entry.id === doc.recordId)?.damage?.facts, { kind: 'actor', id: doc.actorId })
        ?.['odette.splendorStacks'];
      expect(splendorFact?.value).toEqual({ kind: 'quantity', unit: 'count', value: 6 });
      const withBoth = evaluatePreparedModes(ttdsAndC2Project, doc.actorId, doc.recordId!, `${hitId}+TTDS+C2`);
      expect(withBoth.critical, `${hitId}+TTDS+C2 critical`).toBeGreaterThan(withTtds.critical);
      expect(withBoth.expected, `${hitId}+TTDS+C2 expected`).toBeGreaterThan(withTtds.expected);
    }
  });

  it('respects excludeOwner on TTDS when the hit-owner holds it in a 4-member party including Vesna', async () => {
    const [lisa, vesna, bennett, fischl, reactionRules] = await Promise.all([
      makePartyBuild('lisa', 'thrillingtalesofdragonslayers', { constellation: 0, refinement: 5 }),
      makePartyBuild('vesna', 'dullblade', { constellation: 6 }),
      makePartyBuild('bennett', 'dullblade', { constellation: 1, setId: 'noblesseoblige', setPieces: 4 }),
      makePartyBuild('fischl', 'thestringless', { constellation: 6 }),
      getReactionCalculationBundle(),
    ]);

    const doc = createDamageCalculation(lisa, { hit: characterHitRef(lisa.character, 'lisa.skill.param1'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    addActorFromBuild(doc.project, vesna);
    addActorFromBuild(doc.project, bennett);
    addActorFromBuild(doc.project, fischl);

    const { prepared } = evaluatePreparedModes(doc.project, doc.actorId, doc.recordId!, 'lisa.skill.param1');
    const lisaDamage = prepared.timeline.find(entry => entry.id === doc.recordId)?.damage!;
    const choices = calculatorBuffChoices(prepared, doc.actorId, lisaDamage, 0, doc.recordId);
    expect(choices.some(choice => choice.effect.id === 'thrillingtalesofdragonslayers.handoff-attack')).toBe(false);

    doc.recordId = addSingleContributorReaction(doc.project, doc.actorId, 'overloaded', 'pyro', 0, reactionRules, doc.recordId);
    evaluatePreparedModes(doc.project, doc.actorId, doc.recordId, 'lisa.standalone.overloaded');
  });

  it('evaluates Xiangling snapshot burst hit cleanly in a 4-member party with TTDS and Vesna', async () => {
    const [xiangling, vesna, lisa, bennett] = await Promise.all([
      makePartyBuild('xiangling', 'beginnersprotector', { constellation: 6 }),
      makePartyBuild('vesna', 'dullblade', { constellation: 6 }),
      makePartyBuild('lisa', 'thrillingtalesofdragonslayers', { constellation: 0, refinement: 5 }),
      makePartyBuild('bennett', 'dullblade', { constellation: 1, setId: 'noblesseoblige', setPieces: 4 }),
    ]);

    const doc = createDamageCalculation(xiangling, { hit: characterHitRef(xiangling.character, 'xiangling.burst.param4'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    addActorFromBuild(doc.project, vesna);
    addActorFromBuild(doc.project, lisa);
    addActorFromBuild(doc.project, bennett);

    evaluatePreparedModes(doc.project, doc.actorId, doc.recordId!, 'xiangling.burst.param4');
  });

  it('evaluates Nahida A1 team max-EM conditional buff in a 4-member party without missing facts', async () => {
    const [nahida, kuki, sucrose, lisa] = await Promise.all([
      makePartyBuild('nahida', 'thewidsith', { constellation: 2, refinement: 1 }),
      makePartyBuild('kukishinobu', 'ironsting', { constellation: 6, setId: 'gildeddreams', setPieces: 4 }),
      makePartyBuild('sucrose', 'thewidsith', { constellation: 6, refinement: 5 }),
      makePartyBuild('lisa', 'thrillingtalesofdragonslayers', { constellation: 0, refinement: 5 }),
    ]);

    for (const hitId of ['nahida.skill.param1', 'nahida.skill.param3'] as const) {
      const doc = createDamageCalculation(nahida, { hit: characterHitRef(nahida.character, hitId), crit: 'critical', reaction: 'none' }, defaultEnemy());
      addActorFromBuild(doc.project, kuki);
      addActorFromBuild(doc.project, sucrose);
      addActorFromBuild(doc.project, lisa);

      const base = evaluatePreparedModes(doc.project, doc.actorId, doc.recordId!, hitId);
      const shrineProject = enableChoicesOnPrepared(base.prepared, doc.actorId, doc.recordId!, ['nahida.compassion']);
      const shrineFact = subjectFacts(shrineProject.timeline.find(entry => entry.id === doc.recordId)?.damage?.facts, { kind: 'actor', id: doc.actorId })
        ?.['nahida.inShrine'];
      expect(shrineFact?.value).toEqual({ kind: 'boolean', value: true });
      const withShrine = evaluatePreparedModes(shrineProject, doc.actorId, doc.recordId!, `${hitId}+inShrine`);
      if (hitId === 'nahida.skill.param3') {
        expect(withShrine.critical, `${hitId}+inShrine critical`).toBeGreaterThan(base.critical);
        expect(withShrine.expected, `${hitId}+inShrine expected`).toBeGreaterThan(base.expected);
      }
    }
  });
});
