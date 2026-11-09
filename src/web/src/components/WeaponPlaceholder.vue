<script setup lang="ts">
withDefaults(defineProps<{add?:boolean;size?:number}>(),{size:88});
const source=`${import.meta.env.BASE_URL}buffs/crystal-link-generalattack.webp`;
</script>
<template><span class="weapon-placeholder" :class="{add}" :style="{'--weapon-placeholder-size':`${size}px`}" role="img" :aria-label="add?'添加武器':'武器资料缺失'"><span class="weapon-placeholder-icon" :style="{maskImage:`url(${source})`,WebkitMaskImage:`url(${source})`}"></span><svg v-if="add" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v22M5 16h22" /></svg></span></template>
<style scoped>
.weapon-placeholder { position:relative; display:flex; width:var(--weapon-placeholder-size); height:var(--weapon-placeholder-size); align-items:center; justify-content:center; color:var(--muted); }.weapon-placeholder-icon { width:calc(var(--weapon-placeholder-size) * .7273); height:calc(var(--weapon-placeholder-size) * .7273); background:currentColor; opacity:.32; mask-size:contain; mask-position:center; mask-repeat:no-repeat; -webkit-mask-size:contain; -webkit-mask-position:center; -webkit-mask-repeat:no-repeat; }.weapon-placeholder.add svg { position:absolute; right:1px; bottom:1px; width:36px; height:36px; stroke:var(--element-anemo-deep); stroke-width:4; stroke-linecap:round; }
</style>
