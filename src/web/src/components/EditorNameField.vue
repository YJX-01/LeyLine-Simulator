<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  modelValue: string;
  automatic: boolean;
  canGenerate: boolean;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
}>(), { maxLength: 160 });
const emit = defineEmits<{ 'update:modelValue': [value: string]; generate: [] }>();
</script>

<template>
  <div class="editor-name-row">
    <label>{{ label }}
      <input :value="modelValue" :maxlength="maxLength" :required="required" :placeholder="placeholder" autocomplete="off"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
    </label>
    <button type="button" class="ui-action soft" :aria-pressed="automatic" :disabled="!canGenerate" @click="emit('generate')">自动命名</button>
  </div>
</template>

<style scoped>
.editor-name-row { display:flex; flex-wrap:wrap; align-items:end; gap:8px 12px; min-width:0; }
.editor-name-row > label { flex:1 1 240px; min-width:0; font-size:var(--font-control); font-weight:700; }
</style>
