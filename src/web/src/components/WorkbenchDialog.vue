<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: HTMLElement | null = null;
onMounted(() => { previous = document.activeElement as HTMLElement; dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); queueMicrotask(() => previous?.focus()); });
</script>
<template>
  <dialog ref="dialog" class="workbench-dialog" :aria-label="title" @cancel.prevent="emit('close')" @click="($event.target === dialog) && emit('close')">
    <header><h2>{{ title }}</h2><button autofocus :aria-label="`关闭${title}`" @click="emit('close')">关闭 ×</button></header>
    <div class="dialog-content"><slot /></div>
  </dialog>
</template>
<style scoped>
.workbench-dialog { width: min(920px, calc(100vw - 40px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid #b6a577; border-radius: 14px; color: #303e3b; background: #faf8f1; box-shadow: 0 24px 90px #172c2755; }
dialog::backdrop { background: #102a30a8; backdrop-filter: blur(3px); }
header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 24px; border-bottom:1px solid #d9d7c8; } h2 { font-size:20px; margin:0; } .dialog-content { padding:24px; } button { min-height:36px; }
@media(max-width:600px) { .dialog-content, header { padding:16px; } }
</style>
