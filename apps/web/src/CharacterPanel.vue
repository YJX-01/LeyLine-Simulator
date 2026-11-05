<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import { characterSimulationSchema, type RotationResult, type WorkerResponse } from '@leyline/schema';
import scenario from '../../../fixtures/scenarios/jean-tap.json';

const stats = reactive({ ...scenario.stats });
const talentLevel = ref(1);
const durationMs = ref(scenario.durationMs);
const commands = ref(scenario.commands.map(command => ({ ...command })));
const useEnemy = ref(false);
const enemy = reactive({ enemyLevel: 90, resistance: 0.1, defenseReduction: 0, defenseIgnore: 0 });
const result = ref<RotationResult>();
const error = ref('');
const busy = ref(false);
let worker: Worker | undefined;
let taskId = 0;
let nextId = 1;
const fields = [
  { key: 'level', label: '琴等级', min: 1, max: 100, step: '1' },
  { key: 'characterBaseAttack', label: '琴基础攻击（手动）', min: 0, max: 1e6, step: 'any' },
  { key: 'weaponBaseAttack', label: '武器基础攻击（手动）', min: 0, max: 1e6, step: 'any' },
  { key: 'attackPercent', label: '攻击加成（0.5 = 50%）', min: 0, max: 100, step: 'any' },
  { key: 'flatAttack', label: '固定攻击', min: 0, max: 1e6, step: 'any' },
  { key: 'damageBonus', label: '风元素战技伤害加成', min: 0, max: 100, step: 'any' },
  { key: 'critRate', label: '期望暴击率（0.5 = 50%）', min: 0, max: 1, step: 'any' },
  { key: 'critDamage', label: '期望暴击伤害（1 = 100%）', min: 0, max: 100, step: 'any' },
] as const;
function invalidate() {
  taskId++;
  worker?.terminate();
  worker = undefined;
  busy.value = false;
}
function run() {
  invalidate();
  result.value = undefined;
  error.value = '';
  const parsed = characterSimulationSchema.safeParse({ schemaVersion: 1, character: 'jean',
    stats: { ...stats }, talentLevel: talentLevel.value, durationMs: durationMs.value,
    mode: 'expected', commands: commands.value, buffs: [], ...(useEnemy.value ? { enemy: { ...enemy } } : {}),
  });
  if (!parsed.success) {
    error.value = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    return;
  }
  const id = ++taskId;
  try {
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== taskId) return;
      if (event.data.ok && event.data.kind === 'character') result.value = event.data.result;
      else if (!event.data.ok) error.value = event.data.error;
      invalidate();
    };
    worker.onerror = () => {
      if (id !== taskId) return;
      error.value = '角色模拟进程异常，请重新运行。';
      invalidate();
    };
    busy.value = true;
    worker.postMessage({ id, kind: 'character', input: parsed.data });
  } catch {
    error.value = '无法启动角色模拟，请重新运行。';
    invalidate();
  }
}
watch([stats, talentLevel, durationMs, commands, useEnemy, enemy], () => {
  invalidate();
  result.value = undefined;
  error.value = '';
}, { deep: true, flush: 'sync' });
function cancel() {
  invalidate();
  error.value = '已取消角色模拟，可重新运行。';
}
const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
onBeforeUnmount(invalidate);
</script>

<template>
  <section class="character-panel" aria-label="琴点按战技验证">
    <h2>琴 · 点按风压剑</h2>
    <p>仓库数据实验配置，支持天赋 1—10 级。面板手动输入，不含长按、命座、产球或元素反应。</p>
    <p>采用技能表的 6 秒冷却，并沿用旧动作表的 300 毫秒冷却开始延迟、767 毫秒命中延迟；当前游戏版本尚未核实。</p>
    <form @submit.prevent="run">
      <label v-for="field in fields" :key="field.key">{{ field.label }}
        <input v-model.number="stats[field.key]" type="number" :min="field.min" :max="field.max" :step="field.step" required>
      </label>
      <label>战技天赋等级<input v-model.number="talentLevel" type="number" min="1" max="10" step="1" required></label>
      <label>角色模拟时长（毫秒）<input v-model.number="durationMs" type="number" min="1" max="3600000" step="1" required></label>
      <label><span><input v-model="useEnemy" type="checkbox"> 角色模拟计算敌人减免</span></label>
      <template v-if="useEnemy">
        <label>目标敌人等级<input v-model.number="enemy.enemyLevel" type="number" min="1" max="200" step="1" required></label>
        <label>目标风元素有效抗性<input v-model.number="enemy.resistance" type="number" min="-10" max="10" step="any" required></label>
      </template>
      <div class="command-list">
        <h3>点按战技施放指令</h3>
        <div v-for="(command, index) in commands" :key="command.id" class="command">
          <label>{{ command.id }} · 施放时间（毫秒）<input v-model.number="command.timeMs" :aria-label="`琴指令 ${index + 1} 时间`" type="number" min="0" max="3600000" step="1" required></label>
          <button type="button" :aria-label="`删除琴指令 ${index + 1}`" @click="commands.splice(index, 1)">删除</button>
        </div>
        <button type="button" :disabled="commands.length >= 10000" @click="commands.push({ id: `cast-${nextId++}`, timeMs: 0, skillId: 'jean.e.tap' })">添加琴战技指令</button>
      </div>
      <div class="actions"><button type="submit">{{ busy ? '重新运行琴战技' : '运行琴战技' }}</button><button v-if="busy" type="button" @click="cancel">取消角色模拟</button></div>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div aria-live="polite">
      <p v-if="busy">正在模拟琴战技…</p>
      <template v-if="result">
        <h3>琴战技总伤害：{{ format(result.totalDamage) }}</h3>
        <p>结算攻击力：{{ format(result.resolvedAttack ?? 0) }} · DPS：{{ format(result.dps) }}</p>
        <ol aria-label="琴战技事件日志"><li v-for="(event, index) in result.events" :key="index">
          {{ event.timeMs }} ms · {{ event.id }} ·
          <template v-if="event.type === 'cast'">施放成功 · 预计命中 {{ event.hitAtMs }} ms · 下次可施放 {{ event.readyAtMs }} ms</template>
          <template v-else-if="event.type === 'rejected'">拒绝：{{ event.reason === 'action-lock' ? '动作锁定' : '技能冷却' }}</template>
          <template v-else-if="event.type === 'hit'">风元素命中 {{ format(event.calculation.damage) }}</template>
        </li></ol>
        <small>规则：{{ result.versions.rules }} · 数据：{{ result.versions.data }}</small>
      </template>
    </div>
  </section>
</template>

<style scoped>
.character-panel { margin-top: 28px; }
.command-list { grid-column: 1 / -1; }
.command { display: flex; gap: 12px; align-items: end; margin: 12px 0; }
.command label { flex: 1; }
.command input { min-width: 0; }
li { line-height: 1.8; }
</style>
