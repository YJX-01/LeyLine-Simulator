<script setup lang="ts">
defineProps<{ dirty: boolean; busy?: boolean; allowSaveAs?: boolean }>();
const emit = defineEmits<{ save: []; saveAs: []; restore: [] }>();
</script>
<template>
  <div class="editor-actions">
    <button class="ui-action" data-accent="anemo" :disabled="!dirty || busy" @click="emit('save')">保存</button>
    <button v-if="allowSaveAs" class="ui-action soft" data-accent="anemo" :disabled="!dirty || busy" @click="emit('saveAs')">另存</button>
    <button class="ui-action soft" data-accent="pyro" :disabled="!dirty || busy" @click="emit('restore')">还原</button>
  </div>
</template>
<style scoped>
.editor-actions { display:flex; align-items:center; gap:6px; }
.editor-actions .ui-action { min-height:var(--control-height-md); height:var(--control-height-md); padding:0 10px; }
</style>
