<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref, h } from 'vue';
import ViewLoadError from './components/ViewLoadError.vue';
const options = { errorComponent: ViewLoadError, timeout: 15000, loadingComponent: { render: () => h('main', { role: 'status' }, '正在加载页面…') } };
const DeveloperTools = defineAsyncComponent({ ...options, loader: () => import('./DeveloperTools.vue') });
const Workbench = defineAsyncComponent({ ...options, loader: () => import('./Workbench.vue') });
const AnnotationWorkbench = defineAsyncComponent({ ...options, loader: () => import('./AnnotationWorkbench.vue') });
const hash = ref(window.location.hash);
function change() { hash.value = window.location.hash; }
window.addEventListener('hashchange', change);
onBeforeUnmount(() => window.removeEventListener('hashchange', change));
</script>
<template><DeveloperTools v-if="['#tools', '#team', '#combat'].includes(hash)" /><Workbench v-else-if="hash === '#workbench'" /><AnnotationWorkbench v-else /></template>
