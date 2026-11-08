<script setup lang="ts">
import { computed, ref } from 'vue';
import GameIcon from './GameIcon.vue';
import CloseButton from './CloseButton.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';
const props = defineProps<{ label: string; modelValue: string; options: { id: string; name: string }[]; disabled?: boolean; inline?: boolean; hideTrigger?: boolean; imageKind?: 'characters' | 'weapons' | 'artifacts' }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const open = ref(false);
defineExpose({show:()=>{open.value=true;}});
const search = ref('');
const entries = computed(() => props.options.filter(entry => entry.name.includes(search.value.trim())));
</script>
<template>
  <div v-show="!hideTrigger || open" class="catalog-picker"><span v-if="!hideTrigger">{{ label }}</span><slot v-if="!hideTrigger" name="trigger" :choose="() => open = true"><button :disabled="disabled" :aria-label="`选择${label}`" @click="open = true"><GameIcon v-if="imageKind && modelValue" :kind="imageKind" :id="modelValue" :size="40" />{{ options.find(entry => entry.id === modelValue)?.name ?? '点击选择' }} <span>更换 ›</span></button></slot>
    <component :is="inline ? 'section' : WorkbenchDialog" v-if="open" :title="inline ? undefined : `选择${label}`" class="catalog-choice" @close="open = false"><CloseButton v-if="inline" class="catalog-back" :label="`收起${label}选择`" @click="open = false" /><label>搜索<input v-model="search" :aria-label="`搜索${label}`" placeholder="输入名称"></label><div class="catalog-options"><button v-for="entry in entries" :key="entry.id" :class="{ selected: entry.id === modelValue }" @click="emit('update:modelValue', entry.id); open = false"><GameIcon v-if="imageKind" :kind="imageKind" :id="entry.id" :size="imageKind === 'weapons' ? 96 : 64" /><strong>{{ entry.name }}</strong></button></div><p v-if="!entries.length">没有符合条件的内容。</p></component>
  </div>
</template>
<style scoped>
.catalog-choice { grid-column:1/-1; }.catalog-back { display:flex; margin:0 0 12px auto; }.catalog-choice > .catalog-options { max-height:320px; overflow:auto; padding:3px; }
.catalog-picker { display:grid; gap:7px; min-width:150px; font-size:var(--font-body); }.catalog-picker > button { display:flex; justify-content:space-between; gap:20px; text-align:left; }.catalog-picker > button span { opacity:.65; } label { display:grid; gap:8px; } .catalog-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; margin-top:20px; }.catalog-options button { padding:14px; }.catalog-options .selected { border-color:var(--element-geo-primary); background:var(--element-geo-light); }
.catalog-options button { display:flex; flex-direction:column; align-items:center; gap:10px; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:12px; font-size:var(--font-body); }.catalog-options button:hover { border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.catalog-picker > button { align-items:center; justify-content:flex-start; min-height:54px; background:var(--surface); color:var(--ink); border-color:var(--line); }.catalog-picker > button > span:last-child { margin-left:auto; }
</style>
