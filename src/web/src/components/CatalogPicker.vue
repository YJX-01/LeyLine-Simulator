<script setup lang="ts">
import { computed, ref } from 'vue';
import WorkbenchDialog from './WorkbenchDialog.vue';
const props = defineProps<{ label: string; modelValue: string; options: { id: string; name: string }[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const open = ref(false);
const search = ref('');
const entries = computed(() => props.options.filter(entry => entry.name.includes(search.value.trim())));
</script>
<template>
  <div class="catalog-picker"><span>{{ label }}</span><button :disabled="disabled" :aria-label="`选择${label}`" @click="open = true">{{ options.find(entry => entry.id === modelValue)?.name ?? '点击选择' }} <span>更换 ›</span></button>
    <WorkbenchDialog v-if="open" :title="`选择${label}`" @close="open = false"><label>搜索<input v-model="search" :aria-label="`搜索${label}`" placeholder="输入名称"></label><div class="catalog-options"><button v-for="entry in entries" :key="entry.id" :class="{ selected: entry.id === modelValue }" @click="emit('update:modelValue', entry.id); open = false">{{ entry.name }}</button></div><p v-if="!entries.length">没有符合条件的内容。</p></WorkbenchDialog>
  </div>
</template>
<style scoped>
.catalog-picker { display:grid; gap:7px; min-width:150px; font-size:13px; }.catalog-picker > button { display:flex; justify-content:space-between; gap:20px; text-align:left; }.catalog-picker > button span { opacity:.65; } label { display:grid; gap:8px; } .catalog-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; margin-top:20px; }.catalog-options button { padding:14px; }.catalog-options .selected { border-color:#aa8a48; background:#f0e4c5; }
</style>
