import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport, confirmEnkaImport } from '../../../../src/web/src/domain/enka-import';
import { calculatorWorkerRequest, readCalculatorSource } from '../../../../src/web/src/domain/damage-calculator';
import { calculatorProjectSchema, ordinaryTrialId, projectSchema, type DamageCalculatorDocument } from '@leyline/schema';
import { recordedVaresaPlunge, vesnaRecording } from '../../../helpers/recorded-vesna';
import { applyCalculatorBuffs, calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject, nextRecordId } from '../../../../src/web/src/domain/workbench-project';
import { evaluateTimeline } from '@leyline/engine';
import { getWeapon } from '@leyline/game-data';
import { calculatorIntervals, setTrialCondition } from '../../../../src/web/src/domain/calculator-conditions';

const recording = '.references/enka/official-example-2026-11-13.json';
describe.skipIf(!existsSync(recording))('calculator reads original public showcase and local inventory independently', () => {
  it('retains real wearing IDs when a format derivative lacks a local cultivation build', async () => {
    const account = createAccount();
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', account);
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

const officialShowcase = '.references/enka/official-example.json';
it.skipIf(!existsSync(vesnaRecording))('ordinary trial for the recorded Varesa is confined to the calculator and requires a known crit choice', async () => {
  const preview = await previewEnkaImport(JSON.parse(readFileSync(vesnaRecording, 'utf8')), '107590923', createAccount());
  const build = preview.rows.find(row => row.character.showcase?.build.character.id === 'varesa')!.character.showcase!.build;
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const actorId = addActorFromBuild(project, build);
  const skill = build.character.talents.find(skill => skill.id === 'varesa.burst')!;
  const hit = skill.hits.find(hit => hit.parameter === 'param5')!;
  const recordId = nextRecordId(project);
  project.timeline.push({ id: recordId, actor: actorId, kind: 'damage', definition: actorId + '-real-damage', timeMs: 0, order: 0,
    damage: { skillId: skill.id, hitId: hit.id, outputId: ordinaryTrialId(hit.id), crit: 'critical', reaction: 'none' } });
  const document: DamageCalculatorDocument = { schemaVersion: project.schemaVersion, kind: 'damage-calculator', project, actorId, recordId };
  expect(calculatorProjectSchema.safeParse(project).success).toBe(true);
  expect(projectSchema.safeParse(project).success).toBe(false);
  const saved = JSON.stringify(document);
  const evaluate = () => evaluateTimeline(calculatorWorkerRequest(document, 1).project).points.find(point => point.id === recordId)!;
  const point = evaluate();
  expect(point.value).toBeNull();
  const modeled = point.real!.structured!.outputs[0].modeledValue?.value;
  expect(modeled?.kind === 'quantity' && modeled.value).toBeCloseTo(recordedVaresaPlunge('critical'), 5);
  expect(JSON.stringify(document)).toBe(saved);
  project.timeline[0].damage!.crit = null;
  const unknown = evaluate();
  expect(unknown.value).toBeNull();
  expect(unknown.real!.structured!.outputs[0].modeledValue).toBeUndefined();
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
  damage.stateOverrides = [{ actor, values: { hpRatio: 0.9 } }];
  expect(option().checked).toBe(false);
  const rate = () => evaluateTimeline(project).points[0].real!.panel.stats.critRate!;
  const before = rate();
  setTrialCondition(damage, actor, 'hpRatio', option().hp!.preset);
  expect(option().checked).toBe(true);
  expect(rate() - before).toBeCloseTo(0.14, 10);
  expect(damage.stateOverrides[0].values.hpRatio).toBe(1);
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
  const initial = calculatorBuffChoices(project,recipient,damage,1000,hitId);
  const set = initial.find(option => option.ownerId === source && option.triggerSkill === 'bennett.burst')!;
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
  expect(onPanel.stats.attack! - offPanel.stats.attack!).toBeCloseTo(offPanel.baseStats!.attack * 0.20, 6);
  expect(off.project.timeline).toEqual(active.project.timeline);
  expect(active.project.effectRevisions).toBeUndefined();
});
