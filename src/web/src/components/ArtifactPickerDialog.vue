<script setup lang="ts">
import {ref} from 'vue';
import type {RealStat} from '@leyline/schema';
import type {AccountArtifact,AccountSlot,LocalAccount} from '../domain/account';
import {accountSlotLabels} from '../domain/account';
import WorkbenchDialog from './WorkbenchDialog.vue';
import ArtifactBrowser from '../ArtifactBrowser.vue';
defineProps<{slot:AccountSlot;account:LocalAccount;current?:AccountArtifact;effectiveStats?:readonly RealStat[]}>();
const emit=defineEmits<{close:[];select:[item:AccountArtifact];remove:[]}>();
const browser=ref<InstanceType<typeof ArtifactBrowser>>();
function close(){if(browser.value)browser.value.requestLeave(()=>emit('close'));else emit('close');}
</script>
<template><WorkbenchDialog center-title class="artifact-picker-dialog" :title="`选择${accountSlotLabels[slot]}`" @close="close"><template #header-leading><button v-if="current" class="ui-action soft picker-remove" data-accent="pyro" data-size="md" data-width="short" @click="emit('remove')">卸下</button></template><ArtifactBrowser ref="browser" inline pick :account="account" density="relaxed" :slot="slot" :effective-stats="effectiveStats" @select="emit('select',$event)" /></WorkbenchDialog></template>
<style scoped>.artifact-picker-dialog { scrollbar-gutter:auto; }.artifact-picker-dialog > :deep(.dialog-content) { padding:16px; }.picker-remove { width:auto; justify-self:start; flex:none; font-size:var(--font-control); font-weight:700; }</style>
