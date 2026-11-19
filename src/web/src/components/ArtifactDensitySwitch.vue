<script setup lang="ts">
defineProps<{modelValue:'relaxed'|'compact'}>();const emit=defineEmits<{'update:modelValue':[value:'relaxed'|'compact']}>();
</script>
<template><div class="artifact-density-switch" role="group" aria-label="卡片密度"><button type="button" class="relaxed" :aria-pressed="modelValue==='relaxed'" @click="emit('update:modelValue','relaxed')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="7" height="14" rx="1"/><path d="M14 7h7M14 12h7M14 17h7"/></svg>疏松</button><button type="button" class="compact" :aria-pressed="modelValue==='compact'" @click="emit('update:modelValue','compact')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="4" width="7" height="6" rx="1"/><rect x="3" y="14" width="7" height="6" rx="1"/><rect x="14" y="14" width="7" height="6" rx="1"/></svg>紧凑</button></div></template>
<style scoped>
.artifact-density-switch { display:inline-flex; flex:none; box-sizing:border-box; height:var(--control-height-lg); border:1px solid var(--line); border-radius:var(--control-radius); overflow:hidden; }
.artifact-density-switch > button { display:flex; align-items:center; justify-content:center; gap:5px; height:100%; min-height:0; padding:0 8px; border:0; border-radius:0; font-size:var(--font-control); font-weight:700; background:var(--surface-raised); }
.artifact-density-switch > button:focus-visible { outline-offset:-2px; }
.artifact-density-switch svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.7; }
.relaxed { color:var(--element-hydro-deep); }.compact { color:var(--element-electro-deep); }.relaxed[aria-pressed=true] { background:var(--element-hydro-light); }.compact[aria-pressed=true] { background:var(--element-electro-light); }
</style>
