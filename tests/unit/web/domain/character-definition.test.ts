import { describe, expect, it } from 'vitest';
import { getCharacter, DATA_VERSION } from '@leyline/game-data';
import { copyCharacterDefinition, parseCharacterDefinition, prepareCharacterDefinition, applyCharacterDefinition } from '../../../../src/web/src/domain/character-definition';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport } from '../../../../src/web/src/domain/enka-import';
import { hasRecordedReference, readRecordedReference } from '../../../helpers/recorded-reference';
import { evaluateDamage } from '@leyline/engine';
import { formatTalentDetail } from '../../../../src/web/src/domain/character-info';

describe('portable real character metadata', () => {
  it('copies verified Jean data and preserves every static rule through formatted JSON', async () => {
    const original = await getCharacter('jean');
    const file = copyCharacterDefinition(original, DATA_VERSION);
    expect(file.origin).toBe('custom');
    expect(file.id).not.toBe(original.id);
    expect(file.derivedFrom?.id).toBe(original.id);
    expect(parseCharacterDefinition(JSON.stringify(file, null, 2))).toEqual(file);
    const skill = file.talents.find(skill => skill.category === 'skill')!;
    const prepared = prepareCharacterDefinition(file, { [JSON.stringify([skill.id, '0', '0'])]: '2.92' });
    expect(prepared.talents.find(skill => skill.category === 'skill')!.parameters[0].values[0]).toBe(2.92);
    expect(original.identity.name).toBe('琴');
    expect(() => prepareCharacterDefinition(file, { [JSON.stringify([skill.id, '0', '0'])]: '' })).toThrow('非负');
    expect(() => parseCharacterDefinition(JSON.stringify({ ...file, schemaVersion: 3 }))).toThrow('格式');
    expect(() => parseCharacterDefinition(JSON.stringify({ ...file, talents: [skill, skill] }))).toThrow('重复');
  });

  it.skipIf(!hasRecordedReference('.references/enka/official-example.json'))('applies only to a candidate snapshot of recorded Xingqiu without changing account or equipment', async () => {
    const account = createAccount();
    const preview = await previewEnkaImport(JSON.parse(readRecordedReference('.references/enka/official-example.json')), '618285856', account);
    const recorded = preview.rows.find(row => row.character.showcase!.build.character.id === 'xingqiu')!.character.showcase!.build;
    const project = createEmptyProject();
    const actorId = addActorFromBuild(project, recorded);
    const before = JSON.stringify(project), accountBefore = JSON.stringify(account);
    const file = copyCharacterDefinition(recorded.character, recorded.dataVersion);
    const talent=file.talents.find(talent=>talent.category==='skill')!;
    const parameter=talent.parameters.find(parameter=>parameter.id===talent.hits[0].parameter)!;
    const level=recorded.talents.skill;
    // An explicit custom trial, without an invented enemy, crit, or observed damage value.
    const trialValue=parameter.values[level-1]*2;
    const trial=prepareCharacterDefinition(file,{[JSON.stringify([talent.id,'0',String(level-1)])]:String(trialValue)});
    const trialProject=applyCharacterDefinition(project,actorId,trial);
    const trialBuild=trialProject.candidate.actors[0].build!;
    const calculation=evaluateDamage(trialBuild,{skillId:talent.id,hitIndex:0,crit:null,reaction:null},undefined);
    expect(calculation.parts.multiplier).toBe(trialValue);
    expect(calculation.value).toBeNull(); // The original showcase has no observed combat conditions.
    const trialTalent=trialBuild.character.talents.find(talent=>talent.category==='skill')!;
    const template=trialTalent.details.find(detail=>detail.template.includes(`{${parameter.id}:`))!.template;
    expect(formatTalentDetail(trialTalent,template,level)).toContain(`${(trialValue*100).toFixed(1)}%`);
    const next = applyCharacterDefinition(project, actorId, file);
    expect(next.candidate.actors[0].build!.character.id).toBe(file.id);
    expect(next.candidate.actors[0].build!.artifacts).toEqual(recorded.artifacts);
    expect(next.candidate.actors[0].build!.weapon).toEqual(recorded.weapon);
    expect(JSON.stringify(project)).toBe(before);
    expect(JSON.stringify(account)).toBe(accountBefore);
    file.attributes.base.attack = 0;
    expect(next.candidate.actors[0].build!.character.attributes.base.attack).toBe(recorded.character.attributes.base.attack);
    const incompatible = copyCharacterDefinition(await getCharacter('jean'), DATA_VERSION);
    expect(() => applyCharacterDefinition(project, actorId, incompatible)).toThrow('当前队员');
    expect(() => applyCharacterDefinition(project, actorId, { ...file, dataVersion: 'unavailable-version' })).toThrow('版本');
  });
});
