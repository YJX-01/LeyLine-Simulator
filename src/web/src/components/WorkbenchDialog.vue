<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import CloseButton from './CloseButton.vue';
defineProps<{ title: string; compact?: boolean; editor?: boolean; size?: 'filter'; stickyFooter?:boolean; centerTitle?:boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let pressedBackdrop=false;
function outside(event:MouseEvent) {
  const bounds=dialog.value?.getBoundingClientRect();
  return !!bounds && (event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom);
}
function backdropClick(event:MouseEvent) {
  if(event.target===dialog.value && pressedBackdrop && outside(event))emit('close');
  pressedBackdrop=false;
}
function cancel(event:Event) {
  if(event.target!==dialog.value)return;
  event.preventDefault();
  event.stopPropagation();
  emit('close');
}
let previous: HTMLElement | null = null;
let focusObserver:MutationObserver|undefined;
function recoverFocus(){
  const current=dialog.value,active=document.activeElement;
  if(!current?.open || Array.from(document.querySelectorAll('dialog[open]')).at(-1)!==current)return;
  if(current.contains(active) && active instanceof HTMLElement && !active.matches(':disabled') && active.getClientRects().length)return;
  current.querySelector<HTMLElement>('[autofocus]')?.focus({preventScroll:true});
}
onMounted(() => {
  previous = document.activeElement as HTMLElement;dialog.value?.showModal();
  focusObserver=new MutationObserver(()=>queueMicrotask(recoverFocus));
  if(dialog.value)focusObserver.observe(dialog.value,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','style','open']});
});
onBeforeUnmount(() => { focusObserver?.disconnect();dialog.value?.close(); queueMicrotask(() => previous?.isConnected && previous.focus({preventScroll:true})); });
</script>
<template>
  <dialog ref="dialog" class="workbench-dialog" :class="{'compact-dialog':compact,'editor-dialog':editor,'filter-dialog':size==='filter','sticky-footer-dialog':stickyFooter,'center-title-dialog':centerTitle}" :aria-label="title" @keydown.esc.prevent.stop="emit('close')" @cancel="cancel" @pointerdown="pressedBackdrop=$event.target===dialog && outside($event)" @click="backdropClick">
    <header :class="{'has-secondary':!!$slots['header-secondary']}"><div v-if="$slots['header-leading']" class="dialog-leading"><slot name="header-leading" /></div><slot name="title"><h2>{{ title }}</h2></slot><div class="dialog-trailing"><div v-if="$slots['header-trailing']" class="dialog-extra"><slot name="header-trailing" /></div><div v-if="$slots['header-secondary']" class="dialog-secondary"><slot name="header-secondary" /></div><CloseButton autofocus :label="`关闭${title}`" @click="emit('close')" /></div></header>
    <div class="dialog-content"><slot /></div>
    <footer v-if="$slots.footer"><slot name="footer" /></footer>
  </dialog>
</template>
<style scoped>
.workbench-dialog { width: min(var(--dialog-width-content), calc(100vw - 40px)); max-width:calc(100vw - 40px); max-height: calc(100dvh - 48px); overscroll-behavior:contain; scroll-padding-top:88px; padding: 0; border: 1px solid var(--element-geo-primary); border-radius: 14px; color: var(--ink); background: var(--surface); box-shadow: 0 24px 90px #172c2755; }
dialog::backdrop { background: #102a30a8; backdrop-filter: blur(3px); }
.filter-dialog { width:min(var(--dialog-width-filter),calc(100vw - 40px)); }
.compact-dialog { width:min(var(--dialog-width-confirm),calc(100vw - 40px)); }.compact-dialog .dialog-content { font-size:var(--font-control); line-height:1.65; }.compact-dialog :deep(p) { font-size:var(--font-control); line-height:1.65; }.compact-dialog :deep(.confirmation-actions) { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
header { position:sticky; top:0; z-index:10; isolation:isolate; background:var(--surface); display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:16px; padding:12px 20px; border-bottom:1px solid var(--line); }
header > h2 { grid-column:2; grid-row:1; justify-self:center; min-width:0; max-width:min(320px,100%); overflow-wrap:anywhere; font-size:var(--font-dialog); font-weight:700; text-align:center; margin:0; }
.dialog-leading { grid-column:1; grid-row:1; min-width:0; display:flex; align-items:center; flex-wrap:wrap; gap:8px; }.dialog-trailing { grid-column:3; grid-row:1; display:flex; align-items:center; justify-content:flex-end; gap:8px; min-width:0; width:100%; }.dialog-extra { display:flex; align-items:center; flex:none; }.dialog-secondary { min-width:0; display:flex; justify-content:flex-end; }.dialog-content { position:relative; z-index:0; isolation:isolate; padding:24px; }

footer { padding:0 24px 24px; }.filter-dialog:has(footer),.sticky-footer-dialog:has(footer) { scroll-padding-bottom:88px; }.filter-dialog footer,.sticky-footer-dialog footer { position:sticky; bottom:0; z-index:10; padding:16px 24px; border-top:1px solid var(--line); background:var(--surface); }.workbench-dialog :deep(.confirmation-actions) { display:flex; justify-content:flex-end; gap:8px; margin:0; }
.editor-dialog { width:min(var(--dialog-width-editor),calc(100vw - 40px)); }
.editor-dialog > .dialog-content { padding:16px 20px 20px; font-size:var(--font-control); }
@media(max-width:850px) {
  header { grid-template-columns:32px minmax(0,1fr) 32px; gap:8px; padding:12px; }
  header > h2 { max-width:100%; text-align:center; }
  .dialog-leading { grid-column:1/-1; grid-row:2; }
  header.has-secondary > .dialog-leading { grid-row:3; }
  .dialog-trailing { display:contents; }
  .dialog-extra { grid-column:1; grid-row:1; justify-self:start; }
  .dialog-secondary { grid-column:1/-1; grid-row:2; width:100%; }
  .dialog-secondary :deep(button) { width:100%; }
  .dialog-trailing > .ui-close { grid-column:3; grid-row:1; justify-self:end; }
  .workbench-dialog:has(.dialog-leading) { scroll-padding-top:144px; }
  .workbench-dialog:has(header.has-secondary) { scroll-padding-top:196px; }
}
@media(max-width:650px) { .dialog-content { padding:16px; }.editor-dialog > .dialog-content { padding:12px; }footer { padding:0 16px 16px; } }
</style>
