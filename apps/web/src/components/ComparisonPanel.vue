<script setup lang="ts">
import { computed } from 'vue';
import { useComparisonStore } from '../stores/comparison';
import { characterNames } from '../domain/editor';
import { formatNumber as fmt } from '../domain/results';
import { downloadJson } from '../domain/download';
const store = useComparisonStore();
const change = (value: number) => `${value > 0 ? '+' : ''}${fmt(value)}`;
const percent = (value: number | null) => value === null ? '基准为零' : `${change(value)}%`;
const groups = computed(() => [...new Set(store.comparison?.differences.map(diff => diff.path.startsWith('actors') ? '队伍与装备' : diff.path.startsWith('commands') ? '动作循环' : diff.path.startsWith('enemy') ? '敌人条件' : '运行参数与版本') ?? [])]);
</script>
<template>
  <section aria-label="方案运行对比">
    <h2>方案运行对比</h2><p>固定两次运行结果进行比较，仅保留在当前页面会话中。差值为 B − A；模式、种子或敌人条件不同也会影响结果。</p>
    <p>A：{{ store.a ? `${fmt(store.a.result.totalDamage)} 伤害 / 种子 ${store.a.input.seed}` : '未设置' }} · B：{{ store.b ? `${fmt(store.b.result.totalDamage)} 伤害 / 种子 ${store.b.input.seed}` : '未设置' }}</p>
    <div class="actions"><button type="button" :disabled="!store.a && !store.b" @click="store.clear">清空对比</button><button v-if="store.a && store.b" type="button" @click="downloadJson({ version: 1, a: store.a, b: store.b }, 'leyline-comparison.json')">导出对比及两套配置</button></div>
    <template v-if="store.comparison && store.a && store.b">
      <p data-testid="comparison-damage">总伤害差：{{ change(store.comparison.damage.value) }}（{{ percent(store.comparison.damage.percent) }}）</p>
      <p>DPS 差：{{ change(store.comparison.dps.value) }}（{{ percent(store.comparison.dps.percent) }}）</p>
      <p>配置差异：{{ groups.join('、') || '配置与版本相同' }} · A {{ store.a.result.durationMs / 1000 }} 秒 / B {{ store.b.result.durationMs / 1000 }} 秒</p>
      <div class="scroll"><table aria-label="角色对比"><thead><tr><th>角色</th><th>A 伤害</th><th>B 伤害</th><th>伤害差</th><th>A / B 最终能量</th></tr></thead><tbody><tr v-for="actor in store.comparison.actors" :key="actor.character"><td>{{ characterNames[actor.character] }}</td><td>{{ fmt(actor.aDamage) }}</td><td>{{ fmt(actor.bDamage) }}</td><td>{{ change(actor.damage.value) }}</td><td>{{ actor.aEnergy === null ? '未入队' : fmt(actor.aEnergy) }} / {{ actor.bEnergy === null ? '未入队' : fmt(actor.bEnergy) }}</td></tr></tbody></table></div>
      <details><summary>配置差异明细（{{ store.comparison.differences.length }} 项）</summary><p>最多显示前 100 项，完整配置可导出查看。</p><ul><li v-for="diff in store.comparison.differences.slice(0, 100)" :key="diff.path">{{ diff.path }}：{{ diff.before }} → {{ diff.after }}</li></ul></details>
    </template>
  </section>
</template>
<style scoped>section { margin-top: 24px; background: #f3f6f7; } li { overflow-wrap: anywhere; }</style>
