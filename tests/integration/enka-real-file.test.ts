import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccount, cloneAccount, parseAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport, confirmEnkaImport } from '../../src/web/src/domain/enka-import';
import { getWeapon } from '@leyline/game-data';
import { resolveBuild, evaluateDamage, evaluateTimeline } from '@leyline/engine';
import { addActorFromBuild, addSkillHits, defaultEnemy } from '../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../src/web/src/domain/workbench-project';
const path='.references/enka/official-example.json';
describe.skipIf(!existsSync(path))('Enka official documented public showcase (actual response)',()=>{
  it('preserves observed cultivation and isolates equipment snapshots from physical inventory',async()=>{
    const raw=JSON.parse(readFileSync(path,'utf8')); const account=createAccount();
    const preview=await previewEnkaImport(raw,String(raw.uid),account);
    expect(preview.rows.length).toBeGreaterThan(0); expect(preview.skipped).toEqual([]);
    expect(account.characters).toHaveLength(0);
    for(const row of preview.rows) {
      const original=raw.avatarInfoList.find((entry:{avatarId:number})=>entry.avatarId===row.character.showcase!.avatarId);
      expect(row.character.build?.level).toBe(Number(original.propMap['4001'].val));
      expect(row.character.build).not.toHaveProperty('hpRatio');
      expect(row.character.showcase!.build).not.toHaveProperty('hpRatio');
      expect(row.character.build?.constellation).toBe(original.talentIdList?.length??0);
      expect(row.character.build?.weaponLevel).toBe(original.equipList.find((entry:{weapon?:unknown})=>entry.weapon).weapon.level);
      const piece=row.character.showcase!.build.artifacts[0];
      const source=original.equipList.find((entry:{flat:{equipType?:string}})=>entry.flat.equipType==='EQUIP_BRACER');
      expect(piece.level).toBe(source.reliquary.level-1);
      expect(piece.source?.format).toBe('enka-showcase');
      expect(row.character.equipment).toEqual({});
    }
    confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id));
    expect(account.artifacts).toHaveLength(0);expect(parseAccount(account)).toEqual(account);
    const again=await previewEnkaImport(raw,String(raw.uid),account);
    expect(again.rows.every(row=>row.action==='update')).toBe(true);
    const changed=cloneAccount(account);changed.characters[0].name+='（已编辑）';
    expect(()=>confirmEnkaImport(changed,again,[again.rows[0].character.id])).toThrow('预览后角色资料已变化');
    expect(account.characters).toHaveLength(preview.rows.length);
  });
});

describe.skipIf(!existsSync(path))('explicit hit conditions derived from recorded Xingqiu',()=>{
  it('marks unknown HP effects as incomplete using the real Harbinger of Dawn rule',async()=>{
    const raw=JSON.parse(readFileSync(path,'utf8'));
    const preview=await previewEnkaImport(raw,String(raw.uid),createAccount());
    // A calculation boundary derived from the recorded Xingqiu profile; this weapon
    // choice is a test configuration, not a claim about the player's inventory.
    const build=structuredClone(preview.rows.find(row=>row.character.build?.character.id==='xingqiu')!.character.showcase!.build);
    build.weapon=await getWeapon('harbingerofdawn');build.refinement=1;
    const inactive=resolveBuild(build,{hpRatio:0.9});
    const active=resolveBuild(build,{hpRatio:1});
    expect(active.stats.critRate-inactive.stats.critRate).toBeCloseTo(0.14,10);
    const pending=resolveBuild(build);
    expect(pending.stats.critRate).toBe(inactive.stats.critRate);
    expect(pending.issues).toContainEqual({code:'unknown',message:'生命比例尚未确认，无法判断生命条件效果。'});
    expect(pending.status).toBe('partial');
    const request={skillId:'xingqiu.skill',hitIndex:0,crit:'noncritical' as const,reaction:'none' as const};
    expect(evaluateDamage(build,{...request,conditions:{hpRatio:1}},undefined).panel.stats.critRate).toBe(active.stats.critRate);
    expect(evaluateDamage(build,{...request,conditions:{hpRatio:0.9}},undefined).panel.stats.critRate).toBe(inactive.stats.critRate);
    expect(build).not.toHaveProperty('hpRatio');
    const project=createEmptyProject(),id=addActorFromBuild(project,build);
    expect(project.enemy).toBeUndefined();
    expect(project.definitions.find(definition=>definition.id===`${id}-real-damage`)!.source.verified).toBe(false); // Recorded constellation is outside the verified scope.
    addSkillHits(project,id,'xingqiu.skill',0);
    expect(project.timeline.every(record=>record.damage?.crit===null && record.damage.reaction===null)).toBe(true);
    // Counterfactual C0 calculation from the same recorded cultivation/equipment,
    // with an explicit target assumption; not an observed player combat sequence.
    const calculation=structuredClone(build);calculation.constellation=0;
    const axis=createEmptyProject(),actor=addActorFromBuild(axis,calculation);axis.enemy=defaultEnemy();
    const unknown=addSkillHits(axis,actor,'xingqiu.skill',0,{crit:'expected',reaction:'none'});
    const high=addSkillHits(axis,actor,'xingqiu.skill',1000,{crit:'expected',reaction:'none',conditions:{hpRatio:1}});
    const low=addSkillHits(axis,actor,'xingqiu.skill',2000,{crit:'expected',reaction:'none',conditions:{hpRatio:0.9}});
    const result=evaluateTimeline(axis),point=(id:string)=>result.points.find(point=>point.id===id)!;
    expect(point(unknown[0]).value).toBeNull();
    expect(point(high[0]).value).not.toBeNull();expect(point(low[0]).value).not.toBeNull();
    expect(point(high[0]).real!.panel.stats.critRate-point(low[0]).real!.panel.stats.critRate).toBeCloseTo(0.14,10);
  });
});

describe.skipIf(!existsSync('.references/enka/uid-107590923.json'))('User-authorized Enka showcase: new character skill adaptation',()=>{
  it('imports all twelve actual profiles with verified normal, skill and burst levels',async()=>{
    const raw=JSON.parse(readFileSync('.references/enka/uid-107590923.json','utf8'));
    const account=createAccount();
    const preview=await previewEnkaImport(raw,'107590923',account);
    expect(preview.skipped).toEqual([]);
    expect(preview.rows).toHaveLength(12);
    // Expected order is independently identified by release-page talent names,
    // not by enumeration/sorting of the player's skillLevelMap.
    const expected={vesna:[8,10,10],odette:[2,10,7],sandrone:[10,8,10],vodyanitsa:[2,10,2],columbina:[2,10,9]};
    for(const [id,levels] of Object.entries(expected)) {
      const build=preview.rows.find(row=>row.character.build?.character.id===id)!.character.build!;
      expect(build.talents).toEqual({normal:levels[0],skill:levels[1],burst:levels[2]});
    }
    expect(account.characters).toHaveLength(0);
    expect(confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id))).toBe(12);
    expect(account.artifacts).toHaveLength(0);
    expect(parseAccount(account)).toEqual(account);
    const changed=structuredClone(raw);
    changed.avatarInfoList.find((avatar:{avatarId:number})=>avatar.avatarId===10000143).skillDepotId=14001;
    const invalid=await previewEnkaImport(changed,'107590923',createAccount());
    expect(invalid.rows).toHaveLength(11);
    expect(invalid.skipped).toHaveLength(1);
    expect(invalid.skipped[0]).toContain('天赋形态与已核验资料不一致');
  });
});
