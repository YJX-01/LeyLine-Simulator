<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
import AccountLibrary from '../AccountLibrary.vue';
defineProps<{selectedId?:string}>();
const emit=defineEmits<{select:[id:string];close:[]}>();
</script>
<template><WorkbenchDialog title="选择角色" @close="emit('close')"><AccountLibrary page="characters" pick :selected-id="selectedId" @select="emit('select',$event)" /></WorkbenchDialog></template>
