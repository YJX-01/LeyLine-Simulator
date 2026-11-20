<script setup lang="ts">
withDefaults(defineProps<{ dirty: boolean; busy?: boolean; allowSaveAs?: boolean; canSave?:boolean;canSaveAs?:boolean; saveLabel?:string }>(),{canSave:undefined,canSaveAs:undefined,saveLabel:'保存'});
const emit = defineEmits<{ save: []; saveAs: []; restore: [] }>();
</script>
<template>
  <div class="editor-actions">
    <button class="ui-action" data-accent="anemo" data-size="md" :disabled="!(canSave ?? dirty) || busy" @click="emit('save')">{{ saveLabel }}</button>
    <button v-if="allowSaveAs" class="ui-action soft" data-accent="anemo" data-size="md" :disabled="!(canSaveAs ?? dirty) || busy" @click="emit('saveAs')">另存</button>
    <button class="ui-action soft" data-accent="pyro" data-size="md" :disabled="!dirty || busy" @click="emit('restore')">还原</button>
  </div>
</template>
<style scoped>
.editor-actions { display:flex; align-items:center; gap:6px; }
</style>
