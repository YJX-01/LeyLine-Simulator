<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { combatSchema, type CombatEvent, type CombatResult, type WorkerResponse } from '@leyline/schema';
import scenario from '../../../fixtures/scenarios/combat-stage-3.json';

const source = ref(JSON.stringify(scenario, null, 2));
const result = ref<CombatResult>();
const names = ref<Record<string, string>>({});
const error = ref('');
const busy = ref(false);
const page = ref(0);
const filter = ref('all');
let worker: Worker | undefined;
let taskId = 0;
function invalidate() {
  taskId++;
  worker?.terminate();
  worker = undefined;
  busy.value = false;
}
function cancel() {
  invalidate();
  error.value = '已取消综合战斗，可修改配置后重新运行。';
}
function load(kind: 'snapshot' | 'dynamic' | 'random') {
  const config = combatSchema.parse(structuredClone(scenario));
  if (kind === 'dynamic') config.skills[0].snapshot = false;
  if (kind === 'random') {
    config.mode = 'random';
    for (const actor of config.actors) actor.stats.critRate = 0.5;
  }
  source.value = JSON.stringify(config, null, 2);
}
function run() {
  invalidate();
  result.value = undefined;
  error.value = '';
  page.value = 0;
  let input: unknown;
  try { input = JSON.parse(source.value); }
  catch { error.value = '场景 JSON 格式错误，请检查逗号、引号和括号。'; return; }
  const parsed = combatSchema.safeParse(input);
  if (!parsed.success) {
    error.value = parsed.error.issues.slice(0, 20).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    return;
  }
  names.value = Object.fromEntries(parsed.data.actors.map(actor => [actor.id, actor.name]));
  const id = ++taskId;
  try {
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== taskId) return;
      if (event.data.ok && event.data.kind === 'combat') result.value = event.data.result;
      else if (!event.data.ok) error.value = event.data.error;
      invalidate();
    };
    worker.onerror = () => {
      if (id !== taskId) return;
      error.value = '综合战斗进程异常，可重新运行。';
      invalidate();
    };
    busy.value = true;
    worker.postMessage({ id, kind: 'combat', input: parsed.data });
  } catch {
    error.value = '无法启动综合战斗，请重新运行。';
    invalidate();
  }
}
watch(source, () => { invalidate(); result.value = undefined; error.value = ''; page.value = 0; }, { flush: 'sync' });
watch(filter, () => { page.value = 0; });
onBeforeUnmount(invalidate);
const filtered = computed(() => (result.value?.events ?? []).filter(event => filter.value === 'all'
  || (filter.value === 'hit' ? event.type === 'hit' : filter.value === 'energy' ? event.type === 'energy'
    : filter.value === 'summon' ? event.type.startsWith('summon') : event.type.startsWith('buff') || event.type.startsWith('enemy-debuff'))));
const visibleEvents = computed(() => filtered.value.slice(page.value * 50, (page.value + 1) * 50));
const reactions = computed(() => Object.entries(result.value?.reactionCounts ?? {}).filter(([, count]) => count > 0));
const labels: Record<CombatEvent['type'], string> = {
  hit: '命中', cast: '施放', rejected: '拒绝', switch: '切人', energy: '能量',
  'buff-start': '增益开始', 'buff-end': '增益到期', 'buff-replaced': '增益替换',
  'summon-start': '召唤开始', 'summon-end': '召唤结束',
  'enemy-debuff-start': '敌人减益开始', 'enemy-debuff-end': '敌人减益到期',
};
const reactionNames: Record<string, string> = { vaporize: '蒸发', 'reverse-vaporize': '反向蒸发', melt: '融化', 'reverse-melt': '反向融化' };
const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
</script>

<template>
  <section id="combat" aria-label="阶段三综合战斗" class="combat-panel">
    <h2>综合战斗机制验证</h2>
    <p>四个测试面板在同一次战斗中切人、回能、施放技能并触发反应。此示例验证引擎机制，不代表真实角色配队。</p>
    <p>快照示例预期：总伤害 9,300，DPS 2,325；改用动态面板后总伤害 8,200。首批反应支持正反蒸发和融化。</p>
    <div class="actions presets">
      <button type="button" @click="load('snapshot')">加载快照示例</button>
      <button type="button" @click="load('dynamic')">加载动态示例</button>
      <button type="button" @click="load('random')">加载种子随机示例</button>
    </div>
    <details><summary>示例事件顺序与配置说明</summary>
      <p>火面板在增益中召唤，快照保留攻击力；之后切到水面板蒸发并收集粒子，火面板后台回能。切回火面板消耗能量，再切冰面板触发融化。直接伤害增益在命中时结算。</p>
      <p>配置中的时间为整数毫秒；增益和召唤物在到期时刻失效，模拟包含终点命中。标准附着 ICD、能量、快照模式在各技能定义中显式配置。不支持的反应会终止本次模拟并提示错误。</p>
    </details>
    <form class="combat-form" @submit.prevent="run">
      <label>综合战斗配置（JSON）<textarea v-model="source" rows="16" maxlength="1000000" spellcheck="false" required></textarea></label>
      <div class="actions"><button type="submit">{{ busy ? '重新运行综合战斗' : '运行综合战斗' }}</button><button v-if="busy" type="button" @click="cancel">取消综合战斗</button></div>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div aria-live="polite">
      <p v-if="busy">综合战斗计算中…</p>
      <template v-if="result">
        <h3>综合总伤害：{{ format(result.totalDamage) }}</h3>
        <p>综合 DPS：{{ format(result.dps) }} · 命中 {{ result.hits }} 次 · 种子 {{ result.seed }}</p>
        <table aria-label="综合战斗角色结果">
          <thead><tr><th>测试面板</th><th>伤害</th><th>最终能量</th></tr></thead>
          <tbody><tr v-for="(damage, actorId) in result.damageByActor" :key="actorId">
            <td>{{ names[actorId] ?? actorId }}</td><td>{{ format(damage) }}</td><td>{{ format(result.finalEnergy[actorId]) }}</td>
          </tr></tbody>
        </table>
        <p>当前前台：{{ names[result.finalOnField] }} · 剩余附着：{{ result.finalAura ? `${result.finalAura.element} ${format(result.finalAura.units)}U` : '无' }}</p>
        <p>已触发反应：{{ reactions.map(([reaction, count]) => `${reactionNames[reaction]}${count > 1 ? ` × ${count}` : ''}`).join('、') || '无' }}</p>
        <p v-if="result.logMode === 'summary'">摘要模式保留统计与最终状态，不保存逐事件日志。</p>
        <details><summary>事件数量统计</summary><p v-for="(count, type) in result.eventCounts" :key="type">{{ labels[type as CombatEvent['type']] }}：{{ count }}</p></details>
        <template v-if="result.logMode === 'detailed'">
          <h3>综合事件日志</h3>
          <label>筛选综合日志<select v-model="filter"><option value="all">全部事件</option><option value="hit">命中与反应</option><option value="energy">能量变化</option><option value="summon">召唤物</option><option value="buff">增益与减益</option></select></label>
          <ol aria-label="综合事件日志" :start="page * 50 + 1">
            <li v-for="(event, index) in visibleEvents" :key="`${page}-${index}`">
              {{ event.timeMs }} ms · {{ names[event.actorId] ?? event.actorId }} · {{ labels[event.type] }} · {{ event.id }}
              <template v-if="event.type === 'hit'">
                · 伤害 {{ format(event.damage) }} · {{ event.reaction ? reactionNames[event.reaction] : '无反应' }} · {{ event.applied ? '元素已施加' : '未施加元素' }}
                <details><summary>结算明细</summary>
                  <p>基础 {{ format(event.calculation.baseDamage) }} × 加成 {{ format(event.calculation.bonusMultiplier) }} × 暴击 {{ format(event.calculation.critMultiplier) }} × 防御 {{ format(event.calculation.defenseMultiplier) }} × 抗性 {{ format(event.calculation.resistanceMultiplier) }} × 反应 {{ format(event.reactionMultiplier) }}</p>
                  <p>{{ event.snapshot ? '使用施放面板快照' : '使用动态面板' }} · 捕获面板增益：{{ event.buffIds.join('、') || '无' }}</p>
                  <p>命中时直接伤害增益：{{ event.directBuffIds.join('、') || '无' }}</p>
                </details>
              </template>
              <template v-else-if="event.type === 'energy'"> · {{ format(Number(event.details.before)) }} → {{ format(Number(event.details.after)) }} · 溢出 {{ format(Number(event.details.overflow)) }}</template>
              <template v-else-if="event.type === 'rejected'"> · {{ event.details.reason }}</template>
            </li>
          </ol>
          <div class="actions"><button type="button" :disabled="page === 0" @click="page--">上一页日志</button><span>第 {{ page + 1 }} 页 · 共 {{ filtered.length }} 条</span><button type="button" :disabled="(page + 1) * 50 >= filtered.length" @click="page++">下一页日志</button></div>
        </template>
        <small>规则 {{ result.versions.rules }} · 数据 {{ result.versions.data }} · 引擎 {{ result.versions.engine }}</small>
      </template>
    </div>
  </section>
</template>

<style scoped>
.combat-panel { margin-top: 28px; }
.combat-form { display: flex; flex-direction: column; }
textarea { font: 0.85rem/1.6 ui-monospace, monospace; padding: 12px; border: 1px solid #a7b7bd; border-radius: 6px; resize: vertical; }
.presets { flex-wrap: wrap; margin: 18px 0; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px; text-align: left; border-bottom: 1px solid #dce4e7; }
li { line-height: 1.9; margin: 10px 0; }
details { margin: 10px 0; }
summary { cursor: pointer; }
</style>
