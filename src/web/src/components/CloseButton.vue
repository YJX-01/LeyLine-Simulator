<script setup lang="ts">
defineProps<{ label: string }>();
</script>
<template>
  <button type="button" class="ui-close" :aria-label="label" :title="label"><span class="ui-close-mark" aria-hidden="true" /></button>
</template>
<style scoped>
.ui-close.ui-close { display:inline-flex; flex:none; align-items:center; justify-content:center; width:var(--control-height-md); height:var(--control-height-md); min-height:var(--control-height-md); padding:6px; border:0; border-radius:7px; background:transparent; color:var(--element-pyro-deep); cursor:pointer; }
.ui-close.ui-close:hover { background:var(--element-pyro-light); }
.ui-close-mark { display:block; width:20px; height:20px; background:currentColor; mask:url('../assets/ornaments/close-arrows.svg') center / contain no-repeat; pointer-events:none; }
</style>
