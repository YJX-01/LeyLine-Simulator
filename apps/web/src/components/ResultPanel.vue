<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import type { RunSnapshot } from '../domain/run';
import { buildTimeline, filterEvents, formatNumber as fmt } from '../domain/results';
import { downloadJson } from '../domain/download';
import ResultChart from './ResultChart.vue';
const props = defineProps<{ snapshot: RunSnapshot }>();
const actorFilter = ref(''), typeFilter = ref(''), page = ref(0), timelinePage = ref(0);
const result = computed(() => props.snapshot.result);
const names = computed(() => Object.fromEntries(result.value.loadouts.map(actor => [actor.loadout.id, actor.name])));
const timeline = computed(() => buildTimeline(props.snapshot.input, result.value));
const events = computed(() => filterEvents(result.value.events, actorFilter.value, typeFilter.value));
const visible = computed(() => events.value.slice(page.value * 40, (page.value + 1) * 40));
watch([() => props.snapshot, actorFilter, typeFilter], () => { page.value = 0; timelinePage.value = 0; });
const base = { animation: false, aria: { enabled: true }, tooltip: { trigger: 'axis', renderMode: 'richText' }, grid: { left: 65, right: 20, bottom: 65, top: 45 } };
const damageOption = computed<EChartsCoreOption>(() => ({ ...base,
  xAxis: { type: 'category', data: result.value.loadouts.map(actor => actor.name) }, yAxis: { type: 'value', name: '伤害' },
  series: [{ type: 'bar', data: result.value.loadouts.map(actor => result.value.damageByActor[actor.loadout.id]), itemStyle: { color: '#35746d' } }],
}));
const cumulativeOption = computed<EChartsCoreOption>(() => ({ ...base,
  xAxis: { type: 'value', name: '秒', max: result.value.durationMs / 1000 }, yAxis: { type: 'value', name: '累计伤害' },
  dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }], series: [{ type: 'line', showSymbol: false, step: 'end', data: timeline.value.cumulative }],
}));
const energyOption = computed<EChartsCoreOption>(() => ({ ...base, legend: { type: 'scroll' },
  xAxis: { type: 'value', name: '秒', max: result.value.durationMs / 1000 }, yAxis: { type: 'value', name: '能量', min: 0 },
  dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
  series: Object.entries(timeline.value.energy).map(([id, data]) => ({ type: 'line', name: names.value[id], showSymbol: false, step: 'end', data })),
}));
function exportResult() { downloadJson({ version: 1, input: props.snapshot.input, result: result.value }, 'leyline-result.json'); }
</script>
<template>
  <h3>总伤害：{{ fmt(result.totalDamage) }}</h3>
  <p>DPS：{{ fmt(result.dps) }} · 拒绝指令：{{ result.eventCounts.rejected ?? 0 }} · 命中 {{ result.hits }} 次 · {{ result.durationMs / 1000 }} 秒</p>
  <p>规则 {{ result.versions.rules }} · 数据 {{ result.versions.data }} · 引擎 {{ result.versions.engine }} · 种子 {{ result.seed }} · 模式 {{ result.mode }}</p>
  <button type="button" @click="exportResult">导出本次结果与配置</button>
  <p v-for="warning in result.warnings" :key="warning" class="scope">{{ warning }}</p>
  <ResultChart :option="damageOption" label="角色伤害贡献" />
  <div class="scroll"><table aria-label="工作区角色结果"><thead><tr><th>角色</th><th>伤害</th><th>占比</th><th>最终能量</th><th>最终生命</th></tr></thead><tbody><tr v-for="actor in result.loadouts" :key="actor.loadout.id"><td>{{ actor.name }}</td><td>{{ fmt(result.damageByActor[actor.loadout.id]) }}</td><td>{{ fmt(result.totalDamage ? result.damageByActor[actor.loadout.id] / result.totalDamage * 100 : 0) }}%</td><td>{{ fmt(result.finalEnergy[actor.loadout.id]) }}</td><td>{{ fmt(result.finalHealth[actor.loadout.id].current) }}</td></tr></tbody></table></div>
  <template v-if="timeline.detailed">
    <ResultChart :option="cumulativeOption" label="累计伤害曲线" />
    <ResultChart :option="energyOption" label="队伍能量变化" />
    <details><summary>前台与增益时间线（{{ timeline.intervals.length }} 段）</summary>
      <div class="scroll"><table aria-label="状态时间线"><thead><tr><th>角色</th><th>状态</th><th>起止（秒）</th><th>持续时间</th></tr></thead><tbody><tr v-for="(interval, index) in timeline.intervals.slice(timelinePage * 30, (timelinePage + 1) * 30)" :key="index"><td>{{ names[interval.actorId] ?? '敌人' }}</td><td>{{ interval.label }}</td><td>{{ fmt(interval.start) }}—{{ fmt(interval.end) }}</td><td><div class="duration-track"><span :style="{ marginLeft: `${interval.start / (result.durationMs / 1000) * 100}%`, width: `${(interval.end - interval.start) / (result.durationMs / 1000) * 100}%` }"></span></div>{{ fmt(interval.end - interval.start) }} 秒</td></tr></tbody></table></div>
      <div class="actions"><button type="button" :disabled="timelinePage === 0" @click="timelinePage--">上一页状态</button><span>第 {{ timelinePage + 1 }} 页</span><button type="button" :disabled="(timelinePage + 1) * 30 >= timeline.intervals.length" @click="timelinePage++">下一页状态</button></div>
    </details>
  </template>
  <p v-else role="status">摘要模式未记录逐事件数据，仅展示总量；切换详细日志后重跑可查看曲线、时间线和结算。</p>
  <h3>反应统计</h3><p>{{ Object.entries(result.reactionCounts).filter(([, count]) => count).map(([reaction, count]) => `${reaction}：${count}`).join(' · ') || '无反应' }}</p>
  <details><summary>事件与单次结算（{{ result.events.length }} 条）</summary>
    <div class="fields"><label>筛选事件角色<select v-model="actorFilter"><option value="">全部角色</option><option v-for="(name, id) in names" :key="id" :value="id">{{ name }}</option><option value="target">敌人</option></select></label><label>筛选事件类型<select v-model="typeFilter"><option value="">全部类型</option><option v-for="type in Object.keys(result.eventCounts)" :key="type" :value="type">{{ type }}</option></select></label></div>
    <ol :start="page * 40 + 1" aria-label="工作区事件日志"><li v-for="(event, index) in visible" :key="index">
      {{ fmt(event.timeMs / 1000) }} 秒 · {{ names[event.actorId] ?? event.actorId }} · {{ event.type }} · {{ event.id }}
      <template v-if="event.type === 'hit'"> · {{ fmt(event.damage) }} · {{ event.reaction ?? '无反应' }}<details><summary>伤害结算明细</summary><p>基础 {{ fmt(event.calculation.baseDamage) }} × 增伤 {{ fmt(event.calculation.bonusMultiplier) }} × 暴击 {{ fmt(event.calculation.critMultiplier) }} × 防御 {{ fmt(event.calculation.defenseMultiplier) }} × 抗性 {{ fmt(event.calculation.resistanceMultiplier) }}</p><p>反应倍率 {{ event.reactionMultiplier }} · 快照 {{ event.snapshot ? '是' : '否' }} · 增益 {{ event.buffIds.join('、') || '无' }} · 直接增益 {{ event.directBuffIds.join('、') || '无' }} · 附着 {{ event.applied ? '是' : '否' }} · 残留元素 {{ event.aura?.element ?? '无' }}</p></details></template>
      <template v-else><span v-for="(value, key) in event.details" :key="key"> · {{ key }}: {{ value }}</span></template>
    </li></ol>
    <p v-if="!events.length">无匹配事件。</p>
    <div class="actions"><button type="button" :disabled="page === 0" @click="page--">上一页事件</button><span>第 {{ page + 1 }} 页 · 共 {{ events.length }} 条</span><button type="button" :disabled="(page + 1) * 40 >= events.length" @click="page++">下一页事件</button></div>
  </details>
</template>
<style scoped>.duration-track { height: 8px; background: #e6eceb; min-width: 100px; } .duration-track span { display: block; height: 8px; background: #35746d; } li { line-height: 1.8; overflow-wrap: anywhere; } .scope { color: #586b77; font-size: .9rem; }</style>
