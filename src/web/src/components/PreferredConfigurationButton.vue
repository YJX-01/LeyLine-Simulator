<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <button type="button" class="preferred-pin" :aria-label="`设${name}此配置为首选`" title="设为首选">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 3 6 6-3 1-4 5v3l-3-2-6 6 5-7-3-3 3-1 5-5z" /></svg>
  </button>
</template>

<style scoped>
button.preferred-pin {
  position:relative; z-index:2; display:grid; place-items:center; flex:none;
  width:var(--control-height-sm); height:var(--control-height-sm); min-height:0; padding:2px;
  border:0; border-radius:4px; color:var(--muted); background:transparent;
}
button.preferred-pin:is(:hover,:focus-visible) { color:var(--element-anemo-deep); background:var(--element-anemo-light); }
svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linejoin:round; }
</style>
