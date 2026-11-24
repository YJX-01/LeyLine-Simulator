<script setup lang="ts">
import type { FactorItem } from '../domain/calculator-factors';
defineProps<{ rows: FactorItem[]; hue: (id: string) => number | undefined }>();
</script>
<template>
  <dl v-if="rows.length" class="chips">
    <div v-for="row in rows" :key="row.id" class="factor-chip" :style="{ '--chip-hue': hue(row.id) }">
      <dt>{{ row.label }}<small v-if="row.source">{{ row.source }}</small></dt><dd>{{ row.value }}</dd>
    </div>
  </dl>
</template>
<style scoped>
.chips { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr)); gap:6px; margin:0; }
.factor-chip { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px 8px; min-width:0; padding:7px 10px; border-radius:6px; background:color-mix(in srgb,hsl(var(--chip-hue) 68% 65%) 21%,var(--surface)); border-inline-start:3px solid hsl(var(--chip-hue) 43% 51%); overflow-wrap:anywhere; }
dt small { display:block; color:var(--muted); font-size:var(--font-body); }
dd { margin:0 0 0 auto; font-weight:700; text-align:right; font-variant-numeric:tabular-nums; }
</style>
