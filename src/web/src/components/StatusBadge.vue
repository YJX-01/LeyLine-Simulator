<script setup lang="ts">
defineProps<{ label: string; state: 'complete' | 'pending' | 'missing'; description: string; accessibleName: string; tone?: 'hydro' | 'electro' | 'pyro' }>();
</script>
<template>
  <span class="status-badge" :data-state="state" :data-tone="tone" :title="description" :aria-label="accessibleName">{{ label }}</span>
</template>
<style scoped>
.status-badge { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; min-width:0; height:24px; padding:0 4px; border-radius:3px; font-size:var(--font-body); font-weight:600; line-height:20px; white-space:nowrap; }
.status-badge[data-state=complete] { background:var(--element-anemo-light); color:var(--element-anemo-deep); }
.status-badge[data-state=pending] { background:var(--element-geo-light); color:var(--element-geo-deep); }
.status-badge[data-state=missing] { background:var(--element-pyro-light); color:var(--element-pyro-deep); }
.status-badge[data-tone=hydro] { background:var(--element-hydro-light); color:var(--element-hydro-deep); }
.status-badge[data-tone=electro] { background:var(--element-electro-light); color:var(--element-electro-deep); }
.status-badge[data-tone=pyro] { background:var(--element-pyro-light); color:var(--element-pyro-deep); }
</style>
