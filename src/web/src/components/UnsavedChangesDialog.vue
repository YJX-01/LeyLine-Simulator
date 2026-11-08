<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
defineProps<{busy?:boolean}>();
const emit=defineEmits<{save:[];continue:[];discard:[]}>();
</script>
<template>
  <WorkbenchDialog compact title="有未保存的修改" @close="!busy && emit('continue')">
    <p>保存后退出，还是放弃修改？</p>
    <template #footer><div class="unsaved-actions">
      <button class="ui-action" data-accent="anemo" :disabled="busy" @click="emit('save')">保存</button>
      <button class="ui-action soft" data-accent="anemo" :disabled="busy" @click="emit('continue')">继续编辑</button>
      <button class="ui-action" data-accent="pyro" :disabled="busy" @click="emit('discard')">放弃修改</button>
    </div></template>
  </WorkbenchDialog>
</template>
<style scoped>
p { margin:0; }.unsaved-actions .ui-action { font-size:var(--font-control); font-weight:700; }.unsaved-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
</style>
