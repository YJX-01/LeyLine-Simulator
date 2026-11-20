<template>
  <span class="card-replace-layer" aria-hidden="true">
    <svg class="card-replace-mark" viewBox="0 0 20 16" fill="none" stroke="currentColor"
      stroke-linecap="round" stroke-linejoin="round" focusable="false">
      <path d="M1 5h18m-4-4 4 4-4 4M19 11H1m4 4-4-4 4-4" />
    </svg>
  </span>
</template>

<style scoped>
.card-replace-layer {
  position:absolute; inset:0; z-index:3; display:grid; place-items:center; visibility:hidden; pointer-events:none;
  border-radius:inherit; background:color-mix(in srgb,var(--element-hydro-primary) 14%,transparent);
  box-shadow:inset 0 0 0 2px var(--element-hydro-primary);
}
.card-replace-mark {
  display:block; width:24px; height:auto; padding:0; color:var(--element-hydro-deep); stroke-width:2;
}
.small > .card-replace-mark { width:16px; }
</style>
