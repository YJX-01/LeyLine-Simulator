<script setup lang="ts">
defineProps<{ label: string }>();
</script>
<template>
  <button type="button" class="ui-close" :aria-label="label" :title="label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
</template>
<style scoped>
.ui-close.ui-close { display:inline-flex; flex:none; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:6px; border:0; border-radius:7px; background:transparent; color:var(--element-pyro-deep); cursor:pointer; }
.ui-close.ui-close:hover { background:var(--element-pyro-light); }
.ui-close svg { display:block; width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
</style>
