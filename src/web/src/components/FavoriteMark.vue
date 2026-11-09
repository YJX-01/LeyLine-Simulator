<script setup lang="ts">
defineProps<{level:number}>();
const corners=[0,240,120];
const corner='M12 2Q6.8 9 12 12Q17.2 9 12 2Z';
</script>
<template><svg class="favorite-mark" :class="{active:level>0}" :data-level="level" viewBox="0 0 24 24" aria-hidden="true"><g transform="translate(0 2.5)"><path v-for="(angle,index) in corners" :key="angle" class="favorite-corner" :class="{filled:level>index}" :d="corner" :transform="`rotate(${angle} 12 12)`" /></g></svg></template>
<style scoped>.favorite-mark { display:block; flex:none; width:28px; height:28px; color:var(--muted); overflow:visible; }.favorite-corner { fill:none; stroke:currentColor; stroke-width:1.35; stroke-linecap:round; stroke-linejoin:round; }.favorite-mark.active { color:var(--element-geo-deep); }.favorite-corner.filled { fill:currentColor; }</style>
