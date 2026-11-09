import {useAccountStore} from '../stores/account';
import {useCharacterLoadoutsStore} from '../stores/character-loadouts';
import {useArtifactCombinationsStore} from '../stores/artifact-combinations';
import {cloneAccount,type AccountArtifact,type LocalAccount} from '../domain/account';
import {artifactValueSignature} from '../domain/showcase-inventory';

/** Share verified enhancement metadata with unchanged references, never changed equipment. */
export function useInventoryHistoryMerge(){
  const account=useAccountStore(),loadouts=useCharacterLoadoutsStore(),groups=useArtifactCombinationsStore();
  return (next:LocalAccount)=>{
    const index=new Map(next.artifacts.map(item=>[item.id,item]));
    function merge(item:AccountArtifact){
      const current=index.get(item.id);
      if(item.inventoryId===null || !item.real || current?.rollSource!=='showcase' || artifactValueSignature(item)!==artifactValueSignature(current))return item;
      return {...item,rollSource:'showcase' as const,real:{...item.real,substats:JSON.parse(JSON.stringify(current.real!.substats))}};
    }
    const configurations=loadouts.loadouts.map(item=>{if(item.accountId!==next.id)return item;const snapshot=cloneAccount(item.snapshot);snapshot.artifacts=snapshot.artifacts.map(merge);return {...item,snapshot};});
    const combinations=groups.combinations.map(item=>item.accountId===next.id?{...item,items:item.items.map(merge)}:item);
    loadouts.replaceAll(configurations,()=>groups.replaceAll(combinations,()=>account.commitEdit(next)));
  };
}
