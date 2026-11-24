<script setup lang="ts">
defineProps<{ name: string; alias?: string; code?: string; source?: string; note?: string; value?: string }>();
</script>
<template>
  <span class="choice-card">
    <span class="identity">
      <span v-if="$slots.icon" class="portrait"><slot name="icon" /></span>
      <b v-if="code" class="code">{{ code }}</b>
      <span v-if="source" class="source">{{ source }}</span>
    </span>
    <span class="details">
      <span><strong>{{ alias || name }}</strong><span v-if="alias && alias !== name" class="official">（{{ name }}）</span></span>
      <span class="note"><span v-if="note">{{ note }}</span><slot /></span>
      <span class="value">{{ value }}</span>
    </span>
  </span>
</template>
<style scoped>
.choice-card { display:grid; grid-template-columns:4.4rem minmax(0,1fr); align-items:stretch; gap:12px; min-width:0; width:100%; min-height:98px; line-height:1.45; text-align:left; overflow-wrap:anywhere; }
.identity,.details { display:grid; align-content:start; min-width:0; }
.identity { justify-items:center; text-align:center; gap:2px; }
.portrait { display:grid; place-items:center; width:50px; height:50px; border-radius:50%; overflow:hidden; background:var(--neutral-canvas); }
.code { font-size:16px; color:var(--element-hydro-deep); }
.source { font-size:14px; font-weight:500; color:var(--muted); }
.details { align-content:stretch; grid-template-rows:minmax(1.45em,auto) minmax(1.45em,1fr) minmax(1.45em,auto); font-size:18px; gap:4px; }
strong,.value { font-size:18px; font-weight:650; }
.note { display:block; font-size:14px; line-height:1.45; color:var(--muted); font-weight:400; }
.official { font-size:16px; font-weight:400; color:var(--muted); }
.value { font-variant-numeric:tabular-nums; }
</style>
