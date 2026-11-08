<script setup lang="ts">
defineProps<{ title: string; label?: string; expanded: boolean; controls: string }>();
const emit = defineEmits<{ toggle: [] }>();
</script>
<template>
  <div class="disclosure-heading"><h3>{{ title }}</h3><button type="button" class="disclosure-arrow" :aria-label="`${expanded ? '收起' : '展开'}${label ?? title}`" :aria-expanded="expanded" :aria-controls="controls" @click="emit('toggle')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></div>
</template>
<style scoped>
.disclosure-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.disclosure-heading h3 { margin:0; font-size:16px; line-height:24px; font-weight:700; text-align:left; }
.disclosure-arrow.disclosure-arrow { display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:24px; height:24px; min-height:24px; padding:2px; border:0; border-radius:4px; color:var(--muted); background:transparent; }
.disclosure-arrow svg { display:block; width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; transition:transform .15s; }
.disclosure-arrow[aria-expanded=true] svg { transform:rotate(180deg); }
@media(prefers-reduced-motion:reduce) { .disclosure-arrow svg { transition:none; } }
</style>
