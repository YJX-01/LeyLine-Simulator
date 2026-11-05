<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { rotationSchema, type RotationResult, type WorkerResponse } from '@leyline/schema';
import scenario from '../../../fixtures/scenarios/buff-boundary.json';

const durationMs = ref(scenario.durationMs);
const actions = ref(scenario.actions.map(action => ({ ...action })));
const buffs = ref(scenario.buffs.map(buff => ({ ...buff })));
const result = ref<RotationResult>();
const error = ref('');
const busy = ref(false);
let nextId = 1;
let taskId = 0;
let worker: Worker | undefined;
function invalidate() {
  taskId++;
  worker?.terminate();
  worker = undefined;
  busy.value = false;
}
function cancel() {
  invalidate();
  result.value = undefined;
  error.value = '已取消本次模拟，可重新运行。';
}
function run() {
  invalidate();
  result.value = undefined;
  error.value = '';
  const parsed = rotationSchema.safeParse({ schemaVersion: 1, durationMs: durationMs.value,
    attacker: scenario.attacker, actions: actions.value, buffs: buffs.value });
  if (!parsed.success) {
    error.value = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    return;
  }
  const id = ++taskId;
  try {
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== taskId) return;
      if (event.data.ok && event.data.kind === 'rotation') result.value = event.data.result;
      else if (!event.data.ok) error.value = event.data.error;
      invalidate();
    };
    worker.onerror = () => {
      if (id !== taskId) return;
      error.value = '模拟进程异常，请重新运行。';
      invalidate();
    };
    busy.value = true;
    worker.postMessage({ id, kind: 'rotation', input: parsed.data });
  } catch {
    error.value = '无法启动模拟进程，请重新运行。';
    invalidate();
  }
}
onBeforeUnmount(invalidate);
watch([durationMs, actions, buffs], () => {
  invalidate();
  result.value = undefined;
  error.value = '';
}, { deep: true, flush: 'sync' });
</script>

<template>
  <section class="rotation">
    <h2>动作序列与限时增益</h2>
    <p>独立人工测试场景：攻击力 1000、无暴击与敌人减免。与上方单次攻击配置独立；所有命中按命中时的增益动态结算。</p>
    <p>增益在开始时生效、到期时失效；模拟包含截止时刻。时间单位为整数毫秒。</p>
    <form class="rotation-form" @submit.prevent="run">
      <label>模拟时长（毫秒）<input v-model.number="durationMs" type="number" min="1" max="3600000" step="1" required></label>
      <h3>命中动作</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>标识</th><th>命中时间（毫秒）</th><th>倍率</th><th>操作</th></tr></thead>
        <tbody><tr v-for="(action, index) in actions" :key="action.id">
          <td>{{ action.id }}</td>
          <td><input v-model.number="action.timeMs" :aria-label="`动作 ${index + 1} 时间`" type="number" min="0" max="3600000" step="1" required></td>
          <td><input v-model.number="action.multiplier" :aria-label="`动作 ${index + 1} 倍率`" type="number" min="0" max="1000000000" step="any" required></td>
          <td><button type="button" :aria-label="`删除动作 ${index + 1}`" @click="actions.splice(index, 1)">删除</button></td>
        </tr></tbody>
      </table></div>
      <button type="button" :disabled="actions.length >= 10000" @click="actions.push({ id: `action-${nextId++}`, timeMs: 0, multiplier: 1 })">添加动作</button>
      <h3>伤害加成增益</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>标识</th><th>开始（毫秒）</th><th>持续（毫秒）</th><th>加成（0.5 = 50%）</th><th>操作</th></tr></thead>
        <tbody><tr v-for="(buff, index) in buffs" :key="buff.id">
          <td>{{ buff.id }}</td>
          <td><input v-model.number="buff.startMs" :aria-label="`增益 ${index + 1} 开始`" type="number" min="0" max="3600000" step="1" required></td>
          <td><input v-model.number="buff.durationMs" :aria-label="`增益 ${index + 1} 持续`" type="number" min="1" max="3600000" step="1" required></td>
          <td><input v-model.number="buff.damageBonus" :aria-label="`增益 ${index + 1} 加成`" type="number" min="0" max="100" step="any" required></td>
          <td><button type="button" :aria-label="`删除增益 ${index + 1}`" @click="buffs.splice(index, 1)">删除</button></td>
        </tr></tbody>
      </table></div>
      <button type="button" :disabled="buffs.length >= 1000" @click="buffs.push({ id: `buff-${nextId++}`, startMs: 0, durationMs: 1000, damageBonus: 0.5 })">添加增益</button>
      <div class="actions"><button type="submit">{{ busy ? '重新模拟' : '运行动作模拟' }}</button><button v-if="busy" type="button" @click="cancel">取消模拟</button></div>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div aria-live="polite">
      <p v-if="busy">模拟中…</p>
      <template v-if="result">
        <h3>序列总伤害：{{ result.totalDamage.toLocaleString('zh-CN') }}</h3>
        <p>DPS：{{ result.dps.toLocaleString('zh-CN') }} · 窗口 {{ result.durationMs }} 毫秒</p>
        <details><summary>查看事件日志（{{ result.events.length }} 条）</summary>
          <ol><li v-for="(event, index) in result.events" :key="index">
            {{ event.timeMs }} ms · {{ event.id }} ·
            <template v-if="event.type === 'hit'">命中 {{ event.calculation.damage }} · 生效增益：{{ event.activeBuffIds.join(', ') || '无' }}</template>
            <template v-else>{{ event.type === 'buff-start' ? '增益开始' : '增益到期' }}</template>
          </li></ol>
        </details>
        <small>规则：{{ result.versions.rules }} · 数据：{{ result.versions.data }}</small>
      </template>
    </div>
  </section>
</template>

<style scoped>
.rotation { margin-top: 28px; }
.rotation-form { display: flex; flex-direction: column; align-items: stretch; }
.rotation-form > button { align-self: start; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid #dce4e7; }
td input { width: 100%; min-width: 85px; box-sizing: border-box; }
li { line-height: 1.8; }
</style>
