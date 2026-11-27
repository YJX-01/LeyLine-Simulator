<script setup lang="ts">
import { computed } from 'vue';
import { formatInt, formatPercent } from '../utils/format';

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'neutral';
  clickable?: boolean;
}

const props = withDefaults(
  defineProps<{
    segments: BarSegment[];
    compact?: boolean;
    showLegend?: boolean;
    ariaLabel?: string;
  }>(),
  {
    compact: false,
    showLegend: true,
  },
);

const emit = defineEmits<{
  select: [key: string];
}>();

const total = computed(() => props.segments.reduce((sum, item) => sum + Math.max(0, item.value), 0));
const nonZero = computed(() => props.segments.filter(item => item.value > 0));

function widthStyle(value: number): string {
  if (!total.value || value <= 0) return '0%';
  const pct = (value / total.value) * 100;
  return `${Math.max(pct, 0.8)}%`;
}
</script>

<template>
  <div class="stacked-bar-wrap">
    <div class="stacked-track" :class="{ compact }" role="img" :aria-label="ariaLabel ?? '分布比例条'">
      <template v-for="seg in nonZero" :key="seg.key">
        <button
          v-if="seg.clickable"
          type="button"
          class="stacked-seg clickable"
          :class="`seg-${seg.tone}`"
          :style="{ width: widthStyle(seg.value) }"
          :title="`${seg.label}：${formatInt(seg.value)}（${formatPercent(seg.value, total)}）`"
          :aria-label="`筛选 ${seg.label} ${seg.value} 条`"
          @click="emit('select', seg.key)"
        />
        <span
          v-else
          class="stacked-seg"
          :class="`seg-${seg.tone}`"
          :style="{ width: widthStyle(seg.value) }"
          :title="`${seg.label}：${formatInt(seg.value)}（${formatPercent(seg.value, total)}）`"
        />
      </template>
    </div>
    <div v-if="showLegend !== false" class="stacked-legend">
      <template v-for="seg in segments" :key="seg.key">
        <button
          v-if="seg.clickable && seg.value > 0"
          type="button"
          class="legend-item clickable"
          @click="emit('select', seg.key)"
        >
          <span class="legend-swatch" :class="`seg-${seg.tone}`" aria-hidden="true" />
          <span>{{ seg.label }}</span>
          <strong>{{ formatInt(seg.value) }}</strong>
          <span>({{ formatPercent(seg.value, total) }})</span>
        </button>
        <span v-else-if="seg.value > 0" class="legend-item">
          <span class="legend-swatch" :class="`seg-${seg.tone}`" aria-hidden="true" />
          <span>{{ seg.label }}</span>
          <strong>{{ formatInt(seg.value) }}</strong>
          <span>({{ formatPercent(seg.value, total) }})</span>
        </span>
      </template>
    </div>
  </div>
</template>
