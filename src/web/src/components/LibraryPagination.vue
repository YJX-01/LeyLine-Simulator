<script setup lang="ts">
import NumberStepper from './NumberStepper.vue';
withDefaults(defineProps<{page:number;pages:number;always?:boolean;position?:string}>(),{position:''});
const emit=defineEmits<{'update:page':[page:number]}>();
</script>
<template>
  <nav v-if="always || pages>1" class="library-pagination" :aria-label="`${position}列表分页`">
    <button v-if="position!=='顶部'" class="ui-action soft" data-size="md" :disabled="page<=1" @click="emit('update:page',page-1)">上一页</button>
    <NumberStepper v-if="position!=='底部'" :model-value="page" :maximum="pages" :label="`${position}页码`" @update:model-value="emit('update:page',$event)" /><span v-if="position!=='底部'" role="status">/ {{ pages }}页</span>
    <button v-if="position!=='顶部'" class="ui-action soft" data-size="md" :disabled="page>=pages" @click="emit('update:page',page+1)">下一页</button>
  </nav>
</template>
<style scoped>
.library-pagination { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:12px; margin-top:20px; font-size:var(--font-control); font-weight:700; font-variant-numeric:tabular-nums; }
.library-pagination > button { font-size:var(--font-control); font-weight:700; }
.library-pagination :deep(.number-stepper) { --control-height:32px; width:120px; height:32px; min-height:32px; }.library-pagination :deep(.number-stepper button) { font-size:20px; font-weight:700; }.library-pagination :deep(input) { font-size:16px; }
@media(max-width:500px) { .library-pagination { gap:6px; }.library-pagination :deep(.number-stepper) { width:104px; } }
</style>
