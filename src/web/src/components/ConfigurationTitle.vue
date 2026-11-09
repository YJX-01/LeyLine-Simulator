<script setup lang="ts">
defineProps<{characterName:string;name:string;preferred:boolean;current?:boolean}>();
</script>
<template><h3 class="configuration-title"><span>{{ characterName }}</span><span class="configuration-kind" :class="preferred?'preferred':'alternate'">{{ preferred?'首选':'备选' }}</span><span>{{ name }}</span><span v-if="current" class="configuration-current">当前</span></h3></template>
<style scoped>
.configuration-title { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px 12px; margin:0; min-width:0; font-size:var(--font-control); font-weight:700; overflow-wrap:anywhere; }
.configuration-kind { font-size:inherit; }.configuration-current { font-size:var(--font-body); }.preferred { color:var(--element-pyro-deep); }.alternate { color:var(--element-geo-deep); }.configuration-current { color:var(--muted); }
</style>
