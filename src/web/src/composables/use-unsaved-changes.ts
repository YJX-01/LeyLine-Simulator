import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** Protect a local editor draft. Its owner decides how and where to save. */
export function useUnsavedChanges(dirty:Readonly<Ref<boolean>>) {
  const discardOpen = ref(false);
  let leaveAction:(()=>void) | undefined;
  function requestLeave(action:()=>void) { if(dirty.value){leaveAction=action;discardOpen.value=true;}else action(); }
  function cancelDiscard() { discardOpen.value=false;leaveAction=undefined; }
  function discardChanges() { const action=leaveAction;cancelDiscard();action?.(); }
  function beforeUnload(event:BeforeUnloadEvent) { if(dirty.value){event.preventDefault();event.returnValue='';} }
  onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
  onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload));
  return { discardOpen, requestLeave, cancelDiscard, discardChanges };
}
