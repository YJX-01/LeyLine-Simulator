<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
import CancelButton from './CancelButton.vue';
withDefaults(defineProps<{ title: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean }>(), { confirmLabel:'确认', cancelLabel:'取消', danger:true });
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>
<template>
  <WorkbenchDialog compact :title="title" @close="emit('cancel')">
    <slot />
    <template #footer><div class="confirmation-actions"><CancelButton :label="cancelLabel" :disabled="busy" @click="emit('cancel')" /><button class="ui-action" :data-accent="danger ? 'pyro' : 'anemo'" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</button></div></template>
  </WorkbenchDialog>
</template>
