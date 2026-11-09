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
onMounted(() => { previous = document.activeElement as HTMLElement; dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); queueMicrotask(() => previous?.focus()); });
</script>
<template>
  <dialog ref="dialog" class="workbench-dialog" :class="{'compact-dialog':compact,'editor-dialog':editor,'filter-dialog':size==='filter','sticky-footer-dialog':stickyFooter,'center-title-dialog':centerTitle}" :aria-label="title" @keydown.esc.prevent.stop="emit('close')" @cancel="cancel" @pointerdown="pressedBackdrop=$event.target===dialog && outside($event)" @click="backdropClick">
    <header><slot name="header-leading" /><slot name="title"><h2>{{ title }}</h2></slot><div v-if="$slots['header-trailing']" class="dialog-trailing"><slot name="header-trailing" /><CloseButton autofocus :label="`关闭${title}`" @click="emit('close')" /></div><CloseButton v-else autofocus :label="`关闭${title}`" @click="emit('close')" /></header>
    <div class="dialog-content"><slot /></div>
    <footer v-if="$slots.footer"><slot name="footer" /></footer>
  </dialog>
</template>
<style scoped>
.workbench-dialog { width: min(var(--dialog-width-content), calc(100vw - 40px)); max-width:calc(100vw - 40px); max-height: calc(100dvh - 48px); overscroll-behavior:contain; scroll-padding-top:88px; padding: 0; border: 1px solid var(--element-geo-primary); border-radius: 14px; color: var(--ink); background: var(--surface); box-shadow: 0 24px 90px #172c2755; }
dialog::backdrop { background: #102a30a8; backdrop-filter: blur(3px); }
.filter-dialog { width:min(var(--dialog-width-filter),calc(100vw - 40px)); }
.compact-dialog { width:min(var(--dialog-width-confirm),calc(100vw - 40px)); }.compact-dialog .dialog-content { font-size:var(--font-control); line-height:1.65; }.compact-dialog :deep(p) { font-size:var(--font-control); line-height:1.65; }.compact-dialog :deep(.confirmation-actions) { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
header { position:sticky; top:0; z-index:10; isolation:isolate; background:var(--surface); display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 24px; border-bottom:1px solid var(--line); } h2 { min-width:0; max-width:min(320px,100%); overflow-wrap:anywhere; font-size:var(--font-dialog); margin:0; } .dialog-content { position:relative; z-index:0; isolation:isolate; padding:24px; }
.dialog-trailing { display:flex; align-items:center; justify-content:flex-end; gap:8px; min-width:0; width:100%; }
footer { padding:0 24px 24px; }.filter-dialog:has(footer),.sticky-footer-dialog:has(footer) { scroll-padding-bottom:88px; }.filter-dialog footer,.sticky-footer-dialog footer { position:sticky; bottom:0; z-index:10; padding:16px 24px; border-top:1px solid var(--line); background:var(--surface); }.workbench-dialog :deep(.confirmation-actions) { display:flex; justify-content:flex-end; gap:8px; margin:0; }
.editor-dialog { width:min(var(--dialog-width-editor),calc(100vw - 40px)); }
.editor-dialog > header { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); padding:12px 20px; }.editor-dialog > header > h2 { grid-column:2; grid-row:1; text-align:center; font-size:var(--font-dialog); }.editor-dialog > header > :last-child { grid-column:3; grid-row:1; justify-self:end; }.editor-dialog > .dialog-content { padding:16px 20px 20px; font-size:var(--font-control); }
@media(max-width:600px) { .dialog-content, header { padding:16px; } }
@media(max-width:650px) { .editor-dialog > header { grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:12px; }.editor-dialog > header > h2 { grid-column:1; text-align:left; }.editor-dialog > header > :last-child { grid-column:2; }.editor-dialog > header > :first-child:not(h2) { grid-column:1/-1; grid-row:2; }.editor-dialog > .dialog-content { padding:12px; }footer { padding:0 16px 16px; } }
@media(max-width:650px) { .editor-dialog { scroll-padding-top:112px; } }
.center-title-dialog > header { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); }
.center-title-dialog > header > h2 { grid-column:2; grid-row:1; text-align:center; }
.center-title-dialog > header > :first-child:not(h2) { grid-column:1; grid-row:1; justify-self:start; }
.center-title-dialog > header > :last-child { grid-column:3; grid-row:1; justify-self:end; }
</style>
