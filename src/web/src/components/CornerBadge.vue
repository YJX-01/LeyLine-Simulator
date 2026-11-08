<script setup lang="ts">
defineProps<{ small?:boolean }>();
</script>
<template><span class="corner-badge" :data-ui-badge="small ? 'mini' : 'normal'"><slot /></span></template>
<style scoped>
.corner-badge { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; flex:none; min-width:20px; height:20px; padding:0 3px; border-radius:3px; background:var(--surface-raised); color:var(--ink); font-size:var(--font-badge); font-weight:700; line-height:1; font-variant-numeric:tabular-nums; white-space:nowrap; }
.corner-badge[data-ui-badge=mini] { min-width:16px; height:16px; padding:0 2px; font-size:var(--font-badge-mini); }
</style>
