<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
import AccountLibrary from '../pages/AccountLibrary.vue';
defineProps<{selectedId?:string;allowAll?:boolean}>();
const emit=defineEmits<{select:[id:string];close:[]}>();
</script>
<template><WorkbenchDialog title="选择角色" center-title @close="emit('close')"><template v-if="allowAll" #header-leading><button class="ui-action soft" data-size="md" @click="emit('select','')">全部角色</button></template><AccountLibrary page="characters" pick :selected-id="selectedId" @select="emit('select',$event)" /></WorkbenchDialog></template>
