<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
withDefaults(defineProps<{ title: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean }>(), { confirmLabel:'确认', cancelLabel:'取消', danger:true });
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>
<template>
  <WorkbenchDialog compact :title="title" @close="emit('cancel')">
    <slot />
    <template #footer><div class="confirmation-actions"><button class="ui-action soft" data-accent="anemo" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button><button class="ui-action" :data-accent="danger ? 'pyro' : 'anemo'" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</button></div></template>
  </WorkbenchDialog>
</template>
