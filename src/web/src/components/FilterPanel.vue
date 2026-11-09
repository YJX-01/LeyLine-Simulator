<template><div class="filter-panel"><slot /></div></template>
<style scoped>
.filter-panel { display:grid; gap:20px; min-width:0; --choice-selected-shadow:none; }
.filter-panel :deep(section) { display:grid; gap:8px; min-width:0; }
.filter-panel :deep(h3) { margin:0; font-size:var(--font-control); font-weight:700; color:var(--ink); }
.filter-panel :deep(.filter-heading) { display:flex; align-items:center; justify-content:space-between; gap:12px; }
</style>
