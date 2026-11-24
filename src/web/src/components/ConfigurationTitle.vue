<script setup lang="ts">
withDefaults(defineProps<{characterName:string;name?:string;truncateName?:boolean;preferred?:boolean}>(), { preferred: undefined });
</script>
<template>
  <h3 class="configuration-title" :class="{ truncated: truncateName }">
    <span>{{ characterName }}</span>
    <span v-if="preferred!==undefined" class="configuration-kind" :class="preferred?'preferred':'alternate'">{{ preferred?'首选':'备选' }}</span>
    <span v-if="name" class="configuration-name">{{ name }}</span>
  </h3>
</template>
<style scoped>
.configuration-title { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px 12px; margin:0; min-width:0; font-size:var(--font-control); font-weight:700; overflow-wrap:anywhere; }
.configuration-title.truncated { flex-wrap:nowrap; max-width:100%; }
.truncated > span { white-space:nowrap; }
.truncated .configuration-name { min-width:0; max-width:240px; overflow:hidden; text-overflow:ellipsis; }
.configuration-kind { font-size:inherit; } .preferred { color:var(--element-pyro-deep); } .alternate { color:var(--element-geo-deep); }
</style>
