<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
import AccountLibrary from '../pages/AccountLibrary.vue';
withDefaults(defineProps<{selectedId?:string;title?:string;allowAll?:boolean}>(), { title: '选择角色' });
const emit=defineEmits<{select:[id:string];close:[]}>();
</script>
<template>
  <WorkbenchDialog :title="title" center-title @close="emit('close')">
    <template v-if="allowAll" #header-leading>
      <button type="button" class="ui-action soft" data-size="md" @click="emit('select','')">全部角色</button>
    </template>
    <slot />
    <AccountLibrary page="characters" pick :selected-id="selectedId" @select="emit('select',$event)" />
  </WorkbenchDialog>
</template>
