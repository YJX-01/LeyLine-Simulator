<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { attackSchema, type AttackInput, type AttackResult, type WorkerResponse } from '@leyline/schema';
import RotationPanel from './RotationPanel.vue';
import CharacterPanel from './CharacterPanel.vue';
import CombatPanel from './CombatPanel.vue';
import TeamPanel from './TeamPanel.vue';

const config = reactive<AttackInput>({ schemaVersion: 1, attack: 1000, multiplier: 2,
  damageBonus: 0.5, critRate: 0.5, critDamage: 1, mode: 'expected' });
const result = ref<AttackResult>();
const error = ref('');
const busy = ref(false);
const useEnemy = ref(true);
const enemy = reactive({ characterLevel: 90, enemyLevel: 90, resistance: 0.1, defenseReduction: 0, defenseIgnore: 0 });
const enemyFields = [
  { key: 'characterLevel', label: '角色等级', min: 1, max: 100, step: 1 },
  { key: 'enemyLevel', label: '敌人等级', min: 1, max: 200, step: 1 },
  { key: 'resistance', label: '有效抗性（0.1 = 10%）', min: -10, max: 10, step: 0.05 },
  { key: 'defenseReduction', label: '减防比例', min: 0, max: 1, step: 0.05 },
  { key: 'defenseIgnore', label: '无视防御比例', min: 0, max: 1, step: 0.05 },
] as const;
let worker: Worker | undefined;
let taskId = 0;
const fields = [
  { key: 'attack', label: '攻击力', step: 1, max: 1e9 },
  { key: 'multiplier', label: '技能倍率（2 = 200%）', step: 0.1, max: 1e9 },
  { key: 'damageBonus', label: '伤害加成（0.5 = 50%）', step: 0.1, max: 1e9 },
  { key: 'critRate', label: '暴击率（0.5 = 50%）', step: 0.05, max: 1 },
  { key: 'critDamage', label: '暴击伤害（1 = 100%）', step: 0.1, max: 1e9 },
] as const;
function cancel() {
  taskId++;
  worker?.terminate();
  worker = undefined;
  busy.value = false;
}
function run() {
  cancel();
  result.value = undefined;
  error.value = '';
  const parsed = attackSchema.safeParse({ ...config, ...(useEnemy.value ? { enemy: { ...enemy } } : {}) });
  if (!parsed.success) {
    error.value = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    return;
  }
  const id = ++taskId;
  try {
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' });
    busy.value = true;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== taskId) return;
      if (event.data.ok && event.data.kind === 'attack') result.value = event.data.result;
      else if (!event.data.ok) error.value = event.data.error;
      cancel();
    };
    worker.onerror = () => {
      if (id !== taskId) return;
      error.value = '计算进程异常，请重新运行。';
      cancel();
    };
    worker.postMessage({ id, kind: 'attack', input: parsed.data });
  } catch {
    error.value = '无法启动计算进程，请重新运行。';
    cancel();
  }
}
onBeforeUnmount(cancel);
</script>

<template>
  <main>
    <p class="eyebrow">LEYLINE SIMULATOR · 重写预览</p>
    <h1>地脉模拟器</h1>
    <nav><a href="#workbench">队伍模拟器</a> · <a href="#team">真实角色队伍验证</a> · <a href="#combat">综合战斗机制验证</a></nav>
    <p>单次攻击公式验证台</p>
    <aside>当前使用人工测试数据，可验证基础伤害、暴击、敌人防御和抗性结算。防御与抗性公式来自旧项目，尚未验证当前游戏版本；不包含元素反应和角色机制。</aside>
    <form @submit.prevent="run">
      <label v-for="field in fields" :key="field.key">
        {{ field.label }}
        <input v-model.number="config[field.key]" type="number" required min="0" :max="field.max" :step="field.step">
      </label>
      <label>暴击模式<select v-model="config.mode"><option value="expected">期望伤害</option><option value="critical">必定暴击</option><option value="noncritical">不暴击</option></select></label>
      <label><span><input v-model="useEnemy" type="checkbox"> 计算敌人防御与抗性</span></label>
      <template v-if="useEnemy">
        <label v-for="field in enemyFields" :key="field.key">
          {{ field.label }}
          <input v-model.number="enemy[field.key]" type="number" required :min="field.min" :max="field.max" :step="field.step">
        </label>
      </template>
      <div class="actions"><button type="submit">{{ busy ? '重新计算' : '计算伤害' }}</button><button v-if="busy" type="button" @click="cancel">取消</button></div>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <section aria-live="polite">
      <p v-if="busy">正在计算…</p>
      <template v-if="result">
        <h2>公式伤害：{{ result.damage.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) }}</h2>
        <p>{{ result.baseDamage }} × {{ result.bonusMultiplier }} × {{ result.critMultiplier }} × {{ result.defenseMultiplier.toFixed(4) }} × {{ result.resistanceMultiplier.toFixed(4) }}</p>
        <p>基础伤害 × 加成系数 × 暴击系数 × 防御系数 × 抗性系数</p>
        <small>规则：{{ result.versions.rules }} · 引擎：{{ result.versions.engine }}</small>
      </template>
    </section>
    <RotationPanel />
    <CharacterPanel />
    <CombatPanel />
    <TeamPanel />
  </main>
</template>

<style>
:root { font-family: system-ui, sans-serif; color: #243442; background: #f3f6f7; }
body { margin: 0; }
main { max-width: 820px; margin: 48px auto; padding: 24px; }
h1 { font-size: 2.5rem; margin: 8px 0; }
.eyebrow { color: #35746d; letter-spacing: .12em; font-size: .8rem; }
aside { background: #fff3d7; padding: 18px; border-radius: 8px; line-height: 1.7; }
form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin: 28px 0; }
label { display: grid; gap: 8px; }
input, select, button { font: inherit; padding: 12px; border: 1px solid #a7b7bd; border-radius: 6px; }
button { background: #235f58; color: white; cursor: pointer; }
.actions { display: flex; gap: 10px; align-items: end; }
section { background: white; padding: 20px; border-radius: 8px; }
.error { color: #a62424; white-space: pre-wrap; }
</style>
