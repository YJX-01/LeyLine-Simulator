import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccount, cloneAccount, parseAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport, confirmEnkaImport } from '../../src/web/src/domain/enka-import';
const path='.references/enka/official-example.json';
describe.skipIf(!existsSync(path))('Enka official documented public showcase (actual response)',()=>{
  it('preserves observed cultivation and isolates equipment snapshots from physical inventory',async()=>{
    const raw=JSON.parse(readFileSync(path,'utf8')); const account=createAccount();
    const preview=await previewEnkaImport(raw,String(raw.uid),account);
    expect(preview.rows.length).toBeGreaterThan(0); expect(preview.skipped).toEqual([]);
    expect(account.characters).toHaveLength(0);
    for(const row of preview.rows) {
      const original=raw.avatarInfoList.find((entry:{avatarId:number})=>entry.avatarId===row.character.showcase!.avatarId);
      expect(row.character.realBuild?.level).toBe(Number(original.propMap['4001'].val));
      expect(row.character.realBuild?.hpRatio).toBe(original.fightPropMap['1010']/original.fightPropMap['2000']);
      expect(row.character.realBuild?.constellation).toBe(original.talentIdList?.length??0);
      expect(row.character.realBuild?.weaponLevel).toBe(original.equipList.find((entry:{weapon?:unknown})=>entry.weapon).weapon.level);
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
      const build=preview.rows.find(row=>row.character.realBuild?.character.id===id)!.character.realBuild!;
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
