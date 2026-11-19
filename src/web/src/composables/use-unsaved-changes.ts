import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import type { BeforeDialogClose } from './workbench-dialog-close';

/** Protect a local editor draft. Its owner decides how and where to save. */
export function useUnsavedChanges(dirty:Readonly<Ref<boolean>>) {
  const discardOpen = ref(false);
  const saving = ref(false);
  let leaveAction:(()=>void) | undefined;
  let cancelAction:(()=>void) | undefined;
  let waitingForSave=false;
  const requestLeave: BeforeDialogClose = (action, cancel) => {
    if(saving.value || waitingForSave){cancel?.();return;}
    if(dirty.value){leaveAction=action;cancelAction=cancel;discardOpen.value=true;}else action();
  };
  function reset() { discardOpen.value=false;leaveAction=undefined;cancelAction=undefined;waitingForSave=false; }
  function cancelDiscard() { const action=cancelAction;reset();action?.(); }
  function discardChanges() { const action=leaveAction;reset();action?.(); }
  function finishSave() { if(!waitingForSave)return;discardChanges(); }
  async function saveAndLeave(save:()=>boolean|'pending'|Promise<boolean|'pending'>) {
    if(saving.value)return;
    const action=leaveAction;
    discardOpen.value=false;saving.value=true;waitingForSave=true;
    try {
      const result=await save();
      if(result===true){reset();action?.();}
      else if(result!=='pending')cancelDiscard();
    } catch { cancelDiscard(); }
    finally { saving.value=false; }
  }
  function beforeUnload(event:BeforeUnloadEvent) { if(dirty.value){event.preventDefault();event.returnValue='';} }
  onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
  onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload));
  return { discardOpen, saving, requestLeave, cancelDiscard, discardChanges, saveAndLeave, finishSave };
}
