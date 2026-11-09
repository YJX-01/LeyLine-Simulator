import {useAccountStore} from '../stores/account';
import {useCharacterLoadoutsStore} from '../stores/character-loadouts';
import {useArtifactCombinationsStore} from '../stores/artifact-combinations';
import {useArtifactFavoritesStore} from '../stores/artifact-favorites';
import {detachArtifact,detachAccountArtifact,removeInventoryArtifact} from '../domain/artifact-references';

/** Inventory deletion detaches saved references in one rollback-protected operation. */
export function useArtifactRemoval(){
  const account=useAccountStore(),loadouts=useCharacterLoadoutsStore(),combinations=useArtifactCombinationsStore(),favorites=useArtifactFavoritesStore();
  return (id:string)=>{
    const owner=account.account.id,next=removeInventoryArtifact(account.account,id);
    const configurations=loadouts.loadouts.map(item=>item.accountId===owner?{...item,snapshot:detachAccountArtifact(item.snapshot,id)}:item);
    const groups=combinations.combinations.map(item=>item.accountId===owner?{...item,items:item.items.map(piece=>piece.id===id?detachArtifact(piece):piece)}:item);
    loadouts.replaceAll(configurations,()=>combinations.replaceAll(groups,()=>favorites.remove(owner,id,()=>account.commitEdit(next))));
  };
}
