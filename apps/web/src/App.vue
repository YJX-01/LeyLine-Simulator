<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import DeveloperTools from './DeveloperTools.vue';
const Workbench = defineAsyncComponent(() => import('./Workbench.vue'));
const hash = ref(window.location.hash);
function change() { hash.value = window.location.hash; }
window.addEventListener('hashchange', change);
onBeforeUnmount(() => window.removeEventListener('hashchange', change));
</script>
<template><DeveloperTools v-if="['#tools', '#team', '#combat'].includes(hash)" /><Workbench v-else /></template>
