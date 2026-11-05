<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import DeveloperTools from './DeveloperTools.vue';
const Workbench = defineAsyncComponent(() => import('./Workbench.vue'));
const hash = ref(window.location.hash);
function change() { hash.value = window.location.hash; }
window.addEventListener('hashchange', change);
onBeforeUnmount(() => window.removeEventListener('hashchange', change));
</script>
<template><Workbench v-if="hash === '#workbench'" /><DeveloperTools v-else /></template>
