<template><span class="library-corner-ornaments" aria-hidden="true"><i v-for="corner in ['top-left','top-right','bottom-right','bottom-left']" :key="corner" :class="corner" /></span></template>
<style scoped>
.library-corner-ornaments { position:absolute; inset:7px; pointer-events:none; }
.library-corner-ornaments i { position:absolute; width:40px; height:40px; background:var(--fantasy-gold); mask:url('../../../../assets/ui/ornaments/knot-corner.svg') center / contain no-repeat; opacity:.32; }
.top-left { top:0; left:0; }.top-right { top:0; right:0; transform:rotate(90deg); }.bottom-right { bottom:0; right:0; transform:rotate(180deg); }.bottom-left { bottom:0; left:0; transform:rotate(270deg); }
</style>
