<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
<template>
  <span class="slot-placeholder">
    <slot />
    <span v-if="label" class="slot-caption"><span aria-hidden="true">＋</span>{{ label }}</span>
  </span>
</template>
<style scoped>
.slot-placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; min-width:0; width:100%; color:var(--muted); }
.slot-caption { display:flex; align-items:center; justify-content:center; gap:2px; font-size:var(--font-body); font-weight:700; color:var(--ink); }
</style>
