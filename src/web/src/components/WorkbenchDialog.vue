<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import CloseButton from './CloseButton.vue';
defineProps<{ title: string; compact?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: HTMLElement | null = null;
onMounted(() => { previous = document.activeElement as HTMLElement; dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); queueMicrotask(() => previous?.focus()); });
</script>
<template>
  <dialog ref="dialog" class="workbench-dialog" :class="{'compact-dialog':compact}" :aria-label="title" @cancel.prevent="emit('close')" @click="($event.target === dialog) && emit('close')">
    <header><slot name="header-leading" /><slot name="title"><h2>{{ title }}</h2></slot><CloseButton autofocus :label="`关闭${title}`" @click="emit('close')" /></header>
    <div class="dialog-content"><slot /></div>
  </dialog>
</template>
<style scoped>
.workbench-dialog { width: min(920px, calc(100vw - 40px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid var(--element-geo-primary); border-radius: 14px; color: var(--ink); background: var(--surface); box-shadow: 0 24px 90px #172c2755; }
dialog::backdrop { background: #102a30a8; backdrop-filter: blur(3px); }
.compact-dialog { width:min(420px,calc(100vw - 40px)); }.compact-dialog .dialog-content { font-size:16px; line-height:1.65; }.compact-dialog :deep(p) { font-size:16px; line-height:1.65; }.compact-dialog :deep(.confirmation-actions) { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
header { position:sticky; top:0; z-index:10; isolation:isolate; background:var(--surface); display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 24px; border-bottom:1px solid var(--line); } h2 { font-size:20px; margin:0; } .dialog-content { position:relative; z-index:0; isolation:isolate; padding:24px; } button { min-height:36px; }
@media(max-width:600px) { .dialog-content, header { padding:16px; } }
</style>
