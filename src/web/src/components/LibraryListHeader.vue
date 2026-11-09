<script setup lang="ts">
import LibraryPagination from './LibraryPagination.vue';
defineProps<{count:number;total:number;unit:string;page:number;pages:number}>();
const emit=defineEmits<{'update:page':[page:number]}>();
</script>
<template><div class="library-list-header"><p class="library-result-count" role="status">{{ count }} {{ unit }}<span v-if="count!==total"> / 共 {{ total }} {{ unit }}</span></p><LibraryPagination :page="page" :pages="pages" position="顶部" full always @update:page="emit('update:page',$event)" /></div></template>
<style scoped>.library-list-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin:0; min-width:0; }.library-result-count { margin:0; color:var(--muted); font-size:var(--font-control); font-weight:700; line-height:24px; }.library-list-header :deep(.library-pagination) { margin:0; }@media(max-width:600px) { .library-list-header :deep(.library-pagination) { flex-basis:100%; } }</style>
