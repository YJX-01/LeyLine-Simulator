<script setup lang="ts">
defineProps<{add?:boolean}>();
const source=`${import.meta.env.BASE_URL}buffs/crystal-link-generalattack.webp`;
</script>
<template><span class="weapon-placeholder" :class="{add}" role="img" :aria-label="add?'添加武器':'武器资料缺失'"><span class="weapon-placeholder-icon" :style="{maskImage:`url(${source})`,WebkitMaskImage:`url(${source})`}"></span><svg v-if="add" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v22M5 16h22" /></svg></span></template>
<style scoped>
.weapon-placeholder { position:relative; display:flex; width:88px; height:88px; align-items:center; justify-content:center; color:var(--muted); }.weapon-placeholder-icon { width:64px; height:64px; background:currentColor; opacity:.32; mask-size:contain; mask-position:center; mask-repeat:no-repeat; -webkit-mask-size:contain; -webkit-mask-position:center; -webkit-mask-repeat:no-repeat; }.weapon-placeholder.add svg { position:absolute; right:1px; bottom:1px; width:36px; height:36px; stroke:var(--element-anemo-deep); stroke-width:4; stroke-linecap:round; }
</style>
