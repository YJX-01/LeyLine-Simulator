<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, h } from 'vue';
import ViewLoadError from './components/ViewLoadError.vue';
function normalizeLocation() {
  if(window.location.hash && window.location.hash!=='#axis') history.replaceState(null,'',window.location.pathname+window.location.search);
}
normalizeLocation();
window.addEventListener('hashchange',normalizeLocation);
onBeforeUnmount(()=>window.removeEventListener('hashchange',normalizeLocation));
const WorkspaceShell=defineAsyncComponent({loader:()=>import('./WorkspaceShell.vue'),errorComponent:ViewLoadError,timeout:15000,loadingComponent:{render:()=>h('main',{role:'status'},'正在加载页面…')}});
</script>
<template><WorkspaceShell /></template>
