<script setup lang="ts">
defineProps<{level:number}>();
</script>
<template><svg class="favorite-mark" :class="{active:level>0}" viewBox="0 0 32 32" aria-hidden="true"><path d="m16 2.5 4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.4-8.4-4.5-8.4 4.5 1.6-9.4-6.8-6.6 9.4-1.4Z"/><text v-if="level" x="16" y="19.5" text-anchor="middle" data-ui-badge>{{ level }}</text></svg></template>
<style scoped>.favorite-mark { display:block; flex:none; width:28px; height:28px; color:var(--muted); overflow:visible; }.favorite-mark path { fill:none; stroke:currentColor; stroke-width:1.6; }.favorite-mark.active { color:var(--element-geo-deep); }.favorite-mark.active path { fill:var(--element-geo-light); }.favorite-mark text { fill:currentColor; stroke:none; font:800 12px sans-serif; }</style>
