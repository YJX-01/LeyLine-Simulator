<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
const props = defineProps<{ option: EChartsCoreOption; label: string }>();
const container = ref<HTMLDivElement>(), error = ref('');
let chart: EChartsType | undefined, observer: ResizeObserver | undefined, disposed = false;
async function draw() {
  if (!container.value || container.value.clientWidth === 0) return;
  try {
    const runtime = await import('../charts/runtime');
    if (disposed || !container.value || container.value.clientWidth === 0) return;
    chart ??= runtime.init(container.value, undefined, { renderer: 'svg' });
    chart.setOption({ ...props.option, aria: { enabled: true, label: { description: props.label } } }, { notMerge: true }); chart.resize();
  } catch { error.value = '图表无法加载，请查看下方数据表。'; }
}
onMounted(() => { observer = new ResizeObserver(() => { void draw(); }); observer.observe(container.value!); void draw(); });
watch(() => props.option, () => { void draw(); });
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); chart?.dispose(); });
</script>
<template><figure><figcaption>{{ label }}</figcaption><div ref="container" class="result-chart" role="img" :aria-label="label"></div><p v-if="error" role="status">{{ error }}</p></figure></template>
<style scoped>figure { margin: 24px 0; min-width: 0; } figcaption { font-weight: 600; } .result-chart { height: 300px; width: 100%; }</style>
