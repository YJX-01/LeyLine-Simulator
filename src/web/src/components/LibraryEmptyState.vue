<script setup lang="ts">
defineProps<{ title:string; description?:string; action?:string; createLabel?:string; filtered?:boolean; filteredTitle?:string }>();
const emit=defineEmits<{ action:[]; create:[]; clear:[] }>();
</script>
<template>
  <div class="library-empty">
    <h3>{{ filtered ? filteredTitle : title }}</h3>
    <p v-if="description && !filtered">{{ description }}</p>
    <button v-if="filtered" type="button" class="ui-action soft" @click="emit('clear')">清除搜索与筛选</button>
    <button v-else-if="createLabel" type="button" class="ui-action soft" @click="emit('create')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{{ createLabel }}
    </button>
    <button v-else-if="action" type="button" class="ui-action soft" @click="emit('action')">{{ action }}</button>
  </div>
</template>
<style scoped>
.library-empty { display:grid; justify-items:center; gap:12px; padding:32px 16px; text-align:center; }.library-empty h3 { margin:0; font-size:var(--font-control); }.library-empty p { max-width:440px; margin:0; color:var(--muted); font-size:var(--font-body); line-height:1.6; }
</style>
