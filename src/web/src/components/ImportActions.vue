<script setup lang="ts">
withDefaults(defineProps<{label?:string;ready?:boolean;showConfirm?:boolean;busy?:boolean;tone?:'anemo'|'hydro'|'electro'}>(),{tone:'anemo',showConfirm:true});
const emit=defineEmits<{cancel:[];confirm:[]}>();
</script>
<template><div class="import-actions"><button class="ui-action soft" :data-accent="tone" :disabled="busy" @click="emit('cancel')">取消</button><button v-if="showConfirm" class="ui-action" :data-accent="tone" :disabled="!ready || busy" :aria-label="label" @click="emit('confirm')">{{ label }}</button></div></template>
<style scoped>.import-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12px; }.import-actions button { min-width:104px; height:40px; font-size:var(--font-control); font-weight:700; }</style>
