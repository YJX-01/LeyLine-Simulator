<script setup lang="ts">
defineProps<{kind:string}>();
const strand='M12 2.5C6.7 7.5 6.7 11.5 12 16C17.3 11.5 17.3 7.5 12 2.5Z';
</script>
<template>
  <svg viewBox="0 0 24 24" class="library-nav-icon" aria-hidden="true">
    <template v-if="kind==='person'"><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></template>
    <template v-else-if="kind==='equipment'"><circle cx="7.5" cy="6.5" r="3"/><path d="M2.5 21v-4a5 5 0 0 1 8.5-3.5M14 17 20 4l2-1v4l-6 12M12 16l6 3M14 18l-2 4"/></template>
    <template v-else><circle v-if="kind==='pieces'" class="knot-frame" cx="12" cy="12" r="10.5"/><g :transform="kind==='pieces'?'translate(2.4 2.4) scale(.8)':undefined"><path :d="strand"/><path :d="strand" transform="rotate(120 12 12)"/><path :d="strand" transform="rotate(240 12 12)"/></g></template>
  </svg>
</template>
<style scoped>
.library-nav-icon { fill:none; stroke:currentColor; stroke-width:1.55; stroke-linecap:round; stroke-linejoin:round; }.knot-frame { stroke-width:1; }
</style>
