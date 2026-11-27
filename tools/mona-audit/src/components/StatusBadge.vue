<script setup lang="ts">
defineProps<{
  tone?: 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'neutral';
  label: string;
  element?: string;
}>();
</script>

<template>
  <span class="badge" :class="`badge-${tone ?? 'neutral'}`">
    <span v-if="element" class="element-dot" :class="`element-${element}`" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>
