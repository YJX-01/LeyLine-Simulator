<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, h } from 'vue';
import ViewLoadError from './components/ViewLoadError.vue';
const options = { errorComponent: ViewLoadError, timeout: 15000, loadingComponent: { render: () => h('main', { role: 'status' }, '正在加载页面…') } };
const DeveloperTools = defineAsyncComponent({ ...options, loader: () => import('./DeveloperTools.vue') });
const Workbench = defineAsyncComponent({ ...options, loader: () => import('./Workbench.vue') });
const AnnotationWorkbench = defineAsyncComponent({ ...options, loader: () => import('./AnnotationWorkbench.vue') });
const WorkspaceShell = defineAsyncComponent({ ...options, loader: () => import('./WorkspaceShell.vue') });
const hash = ref(window.location.hash);
const currentView = computed(() => ['#tools', '#team', '#combat'].includes(hash.value) ? DeveloperTools
  : hash.value === '#workbench' ? Workbench : hash.value === '#annotation' ? AnnotationWorkbench : WorkspaceShell);
function change() { hash.value = window.location.hash; }
window.addEventListener('hashchange', change);
onBeforeUnmount(() => window.removeEventListener('hashchange', change));
</script>
<template><KeepAlive><component :is="currentView" /></KeepAlive></template>
