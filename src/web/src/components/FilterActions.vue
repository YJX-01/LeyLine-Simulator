<script setup lang="ts">
withDefaults(defineProps<{resetLabel?:string;flush?:boolean}>(),{resetLabel:'重置筛选'});
const emit=defineEmits<{reset:[];confirm:[]}>();
</script>
<template><div class="filter-actions" :class="{flush}"><button class="ui-action soft" data-accent="anemo" @click="emit('reset')">{{ resetLabel }}</button><button class="ui-action" data-accent="anemo" @click="emit('confirm')">完成</button></div></template>
<style scoped>.filter-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:20px; }.filter-actions.flush { margin-top:0; }.filter-actions .ui-action { height:40px; min-height:40px; width:104px; min-width:104px; padding:0 16px; font-size:var(--font-control); font-weight:700; }</style>
