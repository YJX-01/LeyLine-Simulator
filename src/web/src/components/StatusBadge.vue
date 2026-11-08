<script setup lang="ts">
defineProps<{ label: string; state: 'complete' | 'pending' | 'missing'; description: string; accessibleName: string; tone?: 'hydro' | 'electro' | 'pyro' }>();
</script>
<template>
  <span class="status-badge" :data-state="state" :data-tone="tone" :title="description" :aria-label="accessibleName">{{ label }}<svg viewBox="0 0 16 16" aria-hidden="true"><path v-if="state === 'complete'" d="m3 8 3 3 7-7" /><path v-else-if="state === 'missing'" d="m4 4 8 8M12 4l-8 8" /><path v-else d="M5 5a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1" /></svg></span>
</template>
<style scoped>
.status-badge { display:inline-flex; align-items:center; gap:2px; justify-content:center; box-sizing:border-box; width:100%; padding:1px 2px; border-radius:3px; font-size:10px; font-weight:600; line-height:16px; white-space:nowrap; }
.status-badge[data-state=complete] { background:var(--element-anemo-light); color:var(--element-anemo-deep); }
.status-badge[data-state=pending] { background:var(--element-geo-light); color:var(--element-geo-deep); }
.status-badge[data-state=missing] { background:var(--element-pyro-light); color:var(--element-pyro-deep); }
.status-badge[data-tone=hydro] { background:var(--element-hydro-light); color:var(--element-hydro-deep); }
.status-badge[data-tone=electro] { background:var(--element-electro-light); color:var(--element-electro-deep); }
.status-badge[data-tone=pyro] { background:var(--element-pyro-light); color:var(--element-pyro-deep); }
.status-badge svg { width:10px; height:10px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
</style>
