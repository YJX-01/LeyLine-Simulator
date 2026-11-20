<script setup lang="ts">
import WorkbenchDialog from './WorkbenchDialog.vue';
import AccountLibrary from '../pages/AccountLibrary.vue';
import type { TeamMember } from '../domain/team-members';
withDefaults(defineProps<{selectedId?:string;title?:string;allowAll?:boolean;members?:readonly TeamMember[];showcaseOnly?:boolean}>(), { title: '选择角色' });
const emit=defineEmits<{select:[id:string];close:[]}>();
</script>
<template>
  <WorkbenchDialog :title="title" center-title @close="emit('close')">
    <template v-if="allowAll || $slots['header-leading']" #header-leading>
      <button v-if="allowAll" type="button" class="ui-action soft" data-size="md" @click="emit('select','')">全部角色</button>
      <slot name="header-leading" />
    </template>
    <slot />
    <slot name="browser"><AccountLibrary page="characters" pick :pick-members="members" :pick-showcase="showcaseOnly" :selected-id="selectedId" @select="emit('select',$event)" /></slot>
  </WorkbenchDialog>
</template>
