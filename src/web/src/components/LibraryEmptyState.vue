<script setup lang="ts">
defineProps<{title:string;description?:string;action:string}>();
const emit=defineEmits<{action:[]}>();
</script>
<template><div class="library-empty"><h3>{{ title }}</h3><p v-if="description">{{ description }}</p><button class="ui-action soft" @click="emit('action')">{{ action }}</button></div></template>
<style scoped>
.library-empty { display:grid; justify-items:center; gap:12px; padding:32px 16px; text-align:center; }.library-empty h3 { margin:0; font-size:var(--font-control); }.library-empty p { max-width:440px; margin:0; color:var(--muted); font-size:var(--font-body); line-height:1.6; }
</style>
