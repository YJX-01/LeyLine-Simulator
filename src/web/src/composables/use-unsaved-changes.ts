import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** Protect a local editor draft. Its owner decides how and where to save. */
export function useUnsavedChanges(dirty:Readonly<Ref<boolean>>) {
  const discardOpen = ref(false);
  const saving = ref(false);
  let leaveAction:(()=>void) | undefined;
  let waitingForSave=false;
  function requestLeave(action:()=>void) { if(saving.value || waitingForSave)return;if(dirty.value){leaveAction=action;discardOpen.value=true;}else action(); }
  function cancelDiscard() { discardOpen.value=false;leaveAction=undefined;waitingForSave=false; }
  function discardChanges() { const action=leaveAction;cancelDiscard();action?.(); }
  function finishSave() { if(!waitingForSave)return;discardChanges(); }
  async function saveAndLeave(save:()=>boolean|'pending'|Promise<boolean|'pending'>) {
    if(saving.value)return;
    const action=leaveAction;
    discardOpen.value=false;saving.value=true;waitingForSave=true;
    try {
      const result=await save();
      if(result===true){cancelDiscard();action?.();}
      else if(result!=='pending')cancelDiscard();
    } catch { cancelDiscard(); }
    finally { saving.value=false; }
  }
  function beforeUnload(event:BeforeUnloadEvent) { if(dirty.value){event.preventDefault();event.returnValue='';} }
  onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
  onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload));
  return { discardOpen, saving, requestLeave, cancelDiscard, discardChanges, saveAndLeave, finishSave };
}
