<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { teamSchema, type TeamSimulationResult, type WorkerResponse } from '@leyline/schema';
import example from '../../../fixtures/scenarios/first-team.json';
import PlanLibrary from './PlanLibrary.vue';
const source = ref(JSON.stringify(example, null, 2));
const result = ref<TeamSimulationResult>();
const busy = ref(false), error = ref(''), page = ref(0);
let worker: Worker | undefined, taskId = 0;
function invalidate() { taskId++; worker?.terminate(); worker = undefined; busy.value = false; }
watch(source, () => { invalidate(); result.value = undefined; error.value = ''; page.value = 0; }, { flush: 'sync' });
onBeforeUnmount(invalidate);
function cancel() { invalidate(); error.value = '已取消队伍模拟，可重新运行。'; }
function load(kind: 'team' | 'jean' | 'raiden') {
  const input = teamSchema.parse(structuredClone(example));
  if (kind !== 'team') {
    const actor = structuredClone(input.actors.find(a => a.character === (kind === 'jean' ? 'jean' : 'hutao'))!);
    actor.id = kind; actor.character = kind; actor.initialEnergy = kind === 'jean' ? 80 : 90; actor.initialHpRatio = kind === 'jean' ? 0.3 : 1;
    if (kind === 'raiden') {
      actor.weapon.id = 'engulfing-lightning';
      for (const piece of actor.artifacts) {
        piece.set = 'emblem';
        if (piece.slot === 'SANDS') { piece.mainStat = 'ER'; piece.substats = [{ stat: 'EM', value: 20 }]; }
        if (piece.slot === 'GOBLET') piece.mainStat = 'ELECTRO_DMG';
      }
    }
    input.actors = [actor]; input.initialOnField = kind; input.durationMs = 16000;
    input.commands = kind === 'jean' ? [
      { type: 'cast', id: 'burst', timeMs: 0, actorId: kind, action: 'Q' },
      { type: 'cast', id: 'skill', timeMs: 2000, actorId: kind, action: 'E' },
    ] : [
      { type: 'cast', id: 'eye', timeMs: 0, actorId: kind, action: 'E' },
      { type: 'cast', id: 'burst', timeMs: 1200, actorId: kind, action: 'Q' },
      ...[3200, 4300, 5400, 6500, 7600].map((timeMs, i) => ({ type: 'cast' as const, id: `attack-${i}`, timeMs, actorId: kind, action: 'N1' as const })),
    ];
  }
  source.value = JSON.stringify(input, null, 2);
}
function run() {
  invalidate(); result.value = undefined; error.value = ''; page.value = 0;
  let input: unknown;
  try { input = JSON.parse(source.value); } catch { error.value = '队伍 JSON 格式错误。'; return; }
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) { error.value = parsed.error.issues.slice(0, 20).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'); return; }
  const id = ++taskId;
  try {
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== taskId) return;
      if (event.data.ok && event.data.kind === 'team') result.value = event.data.result;
      else if (!event.data.ok) error.value = event.data.error;
      invalidate();
    };
    worker.onerror = () => { if (id === taskId) { error.value = '队伍计算进程异常，可重新运行。'; invalidate(); } };
    busy.value = true; worker.postMessage({ id, kind: 'team', input: parsed.data });
  } catch { error.value = '无法启动队伍模拟。'; invalidate(); }
}
const format = (number: number) => number.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
const names = computed(() => Object.fromEntries(result.value?.loadouts.map(actor => [actor.loadout.id, actor.name]) ?? []));
const visible = computed(() => result.value?.events.slice(page.value * 50, (page.value + 1) * 50) ?? []);
const rejections = computed(() => result.value?.eventCounts.rejected ?? 0);
</script>

<template>
  <section id="team" class="team-panel" aria-label="真实角色队伍验证">
    <h2>真实角色队伍验证</h2>
    <p>琴、行秋、胡桃、阿贝多、雷电将军已接入统一内核。使用真实等级、天赋与装备数据；当前为固定单目标、近战范围的内容验收入口。</p>
    <p>默认示例为行秋、阿贝多、琴、胡桃的两轮 24 秒循环。祭礼触发由种子控制，示例采用种子 1；更换种子后须重新检查技能冷却。</p>
    <div class="actions presets"><button type="button" @click="load('team')">加载四人循环</button><button type="button" @click="load('jean')">加载琴技能示例</button><button type="button" @click="load('raiden')">加载雷电爆发示例</button></div>
    <form class="team-form" @submit.prevent="run">
      <label>真实队伍配置（JSON）<textarea v-model="source" rows="14" spellcheck="false" maxlength="1000000" required></textarea></label>
      <div class="actions"><button type="submit">{{ busy ? '重新运行真实队伍' : '运行真实队伍' }}</button><button v-if="busy" type="button" @click="cancel">取消队伍模拟</button></div>
    </form>
    <PlanLibrary :source="source" @load="source = $event" />
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div aria-live="polite">
      <p v-if="busy">正在计算队伍…</p>
      <template v-if="result">
        <h3>队伍总伤害：{{ format(result.totalDamage) }}</h3>
        <p>队伍 DPS：{{ format(result.dps) }} · 指令拒绝：{{ rejections }} · 种子 {{ result.seed }}</p>
        <table aria-label="真实队伍结果"><thead><tr><th>角色</th><th>伤害</th><th>最终能量</th><th>最终生命</th></tr></thead>
          <tbody><tr v-for="actor in result.loadouts" :key="actor.loadout.id"><td>{{ actor.name }}</td><td>{{ format(result.damageByActor[actor.loadout.id]) }}</td><td>{{ format(result.finalEnergy[actor.loadout.id]) }}</td><td>{{ format(result.finalHealth[actor.loadout.id].current) }}</td></tr></tbody>
        </table>
        <details v-for="actor in result.loadouts" :key="`stats-${actor.loadout.id}`"><summary>{{ actor.name }} · 初始配装面板与来源</summary>
          <p>生命 {{ format(actor.stats.maxHp) }} · 攻击 {{ format((actor.stats.characterBaseAttack + actor.stats.weaponBaseAttack) * (1 + actor.stats.attackPercent) + actor.stats.flatAttack) }} · 防御 {{ format(actor.stats.defense) }} · 充能 {{ format(actor.stats.energyRecharge * 100) }}%</p>
          <ul><li v-for="(entry, index) in actor.contributions" :key="index">{{ entry.source }} · {{ entry.stat }}：{{ format(entry.value) }}</li></ul>
        </details>
        <p v-for="warning in result.warnings" :key="warning" class="scope">{{ warning }}</p>
        <details><summary>查看真实队伍事件（{{ result.events.length }} 条）</summary>
          <ol aria-label="真实队伍事件" :start="page * 50 + 1"><li v-for="(event, index) in visible" :key="`${page}-${index}`">
            {{ event.timeMs }} ms · {{ names[event.actorId] ?? event.actorId }} · {{ event.type }} · {{ event.id }}
            <template v-if="event.type === 'hit'"> · {{ format(event.damage) }} · {{ event.reaction ?? '无反应' }}</template>
            <template v-else-if="event.type === 'rejected'"> · {{ event.details.reason }}</template>
            <template v-else-if="event.type === 'health'"> · {{ format(Number(event.details.before)) }} → {{ format(Number(event.details.after)) }}</template>
          </li></ol>
          <div class="actions"><button type="button" :disabled="page === 0" @click="page--">上一页队伍日志</button><span>第 {{ page + 1 }} 页</span><button type="button" :disabled="(page + 1) * 50 >= result.events.length" @click="page++">下一页队伍日志</button></div>
        </details>
        <small>规则 {{ result.versions.rules }} · 数据 {{ result.versions.data }} · 引擎 {{ result.versions.engine }}</small>
      </template>
    </div>
  </section>
</template>

<style scoped>
.team-panel { margin-top: 28px; }
.team-form { display: flex; flex-direction: column; }
textarea { font: .85rem/1.6 ui-monospace, monospace; padding: 12px; border: 1px solid #a7b7bd; border-radius: 6px; resize: vertical; }
.presets { flex-wrap: wrap; margin: 18px 0; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px; border-bottom: 1px solid #dce4e7; }
details { margin-top: 16px; }
summary { cursor: pointer; }
li { line-height: 1.8; }
.scope { font-size: .9rem; color: #586b77; }
</style>
