<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import { useWorkspaceStore } from './stores/workspace';
import { teamSchema } from '@leyline/schema';
import example from '../../../fixtures/scenarios/first-team.json';
import { canonical, characterNames } from './domain/editor';
import TeamEditor from './components/TeamEditor.vue';
import PlanLibrary from './PlanLibrary.vue';
import RotationEditor from './components/RotationEditor.vue';
import { useTeamSimulation } from './composables/useTeamSimulation';
import ResultPanel from './components/ResultPanel.vue';
import ComparisonPanel from './components/ComparisonPanel.vue';
import { useComparisonStore } from './stores/comparison';
const workspace = useWorkspaceStore(); workspace.initialize();
// The form must never mutate the parsed-input cache used to identify a run.
const draft = ref(teamSchema.parse(JSON.parse(JSON.stringify(workspace.input ?? example))));
const tab = ref('team');
const simulation = useTeamSimulation(toRef(workspace, 'source'), toRef(workspace, 'signature'));
const { snapshot, busy, error, stale } = simulation;
const comparisons = useComparisonStore();
watch(draft, value => { const source = JSON.stringify(value, null, 2); if (canonical(value) !== workspace.signature) workspace.source = source; }, { deep: true, flush: 'sync' });
watch(() => workspace.source, () => { if (workspace.input && canonical(draft.value) !== workspace.signature) draft.value = teamSchema.parse(JSON.parse(JSON.stringify(workspace.input))); }, { flush: 'sync' });
const issues = computed(() => { const parsed = teamSchema.safeParse(draft.value); return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`); });
</script>
<template>
  <main class="workbench">
    <p class="eyebrow">LEYLINE SIMULATOR</p><h1>地脉模拟器</h1>
    <p>配置队伍，编排循环，检查每一次结算。</p>
    <nav><a href="#tools">开发验证工具</a></nav>
    <aside class="scope">当前支持琴、行秋、胡桃、阿贝多、雷电将军；规则为仓库审计版本的固定单目标、近战范围模拟。不含敌人攻击、移动、多目标及草反应。</aside>
    <p v-if="workspace.notice" role="status">{{ workspace.notice }}</p>
    <div class="actions tabs" aria-label="工作区导航"><button v-for="(label, key) in { team: '配队与装备', rotation: '动作循环', results: '计算结果', plans: '方案管理' }" :key="key" type="button" :aria-pressed="tab === key" @click="tab = key">{{ label }}</button></div>
    <div class="actions"><button type="button" :disabled="!workspace.input" @click="simulation.run(); tab = 'results'">{{ busy ? '重新运行模拟' : '运行模拟' }}</button><button v-if="busy" type="button" @click="simulation.cancel()">取消模拟</button><span v-if="busy" role="status">正在计算…</span></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="stale" role="status">配置已修改，以下为上次运行结果，请重新运行。</p>
    <section v-show="tab === 'team'"><TeamEditor v-model="draft" /></section>
    <section v-show="tab === 'rotation'"><h2>模拟设置</h2><div class="fields">
      <label>模拟时长（秒）<input type="number" min="0.001" max="3600" step="0.001" :value="draft.durationMs / 1000" @input="draft.durationMs = Math.round(Number(($event.target as HTMLInputElement).value) * 1000)"></label>
      <label>随机种子<input v-model.number="draft.seed" type="number" min="0" max="4294967295"></label>
      <label>伤害模式<select v-model="draft.mode"><option value="expected">期望</option><option value="random">随机暴击</option><option value="critical">必定暴击</option><option value="noncritical">不暴击</option></select></label>
      <label>初始前台<select v-model="draft.initialOnField"><option v-for="actor in draft.actors" :key="actor.id" :value="actor.id">{{ characterNames[actor.character] }}</option></select></label>
      <label>敌人等级<input v-model.number="draft.enemy.level" type="number" min="1" max="200"></label>
      <label>敌人抗性（%）<input type="number" min="-1000" max="1000" :value="draft.enemy.resistance * 100" @input="draft.enemy.resistance = Number(($event.target as HTMLInputElement).value) / 100"></label>
      <label>敌人减防（%）<input type="number" min="0" max="100" :value="draft.enemy.defenseReduction * 100" @input="draft.enemy.defenseReduction = Number(($event.target as HTMLInputElement).value) / 100"></label>
      <label>敌人生命（%）<input type="number" min="0" max="100" :value="draft.enemy.hpRatio * 100" @input="draft.enemy.hpRatio = Number(($event.target as HTMLInputElement).value) / 100"></label>
      <label>阿贝多生灭之花命中数<input :value="draft.enemy.fatalBlossomHits" type="number" min="0" max="7" placeholder="使用阿贝多 Q 时必填" @input="($event.target as HTMLInputElement).value === '' ? delete draft.enemy.fatalBlossomHits : draft.enemy.fatalBlossomHits = Number(($event.target as HTMLInputElement).value)"></label>
      <label><span><input v-model="draft.enemy.collectCrystallizeShards" type="checkbox">拾取结晶盾（影响阿贝多六命）</span></label>
      <label>日志模式<select v-model="draft.logMode"><option value="detailed">详细</option><option value="summary">摘要</option></select></label>
      <label>日志上限<input v-model.number="draft.maxLogEvents" type="number" min="1" max="20000"></label>
    </div><RotationEditor :key="draft.actors.map(a => a.id).join(',')" v-model="draft" /></section>
    <section v-show="tab === 'results'"><h2>计算结果</h2><template v-if="snapshot"><div class="actions"><button type="button" :disabled="stale || busy" @click="comparisons.pin('a', snapshot)">设为对比 A</button><button type="button" :disabled="stale || busy" @click="comparisons.pin('b', snapshot)">设为对比 B</button></div><ResultPanel :snapshot="snapshot" /></template><p v-else>运行后在此检查伤害与事件。</p><ComparisonPanel /></section>
    <section v-show="tab === 'plans'"><h2>方案管理</h2><PlanLibrary :source="workspace.source" expanded @load="workspace.source = $event" /></section>
    <p v-for="issue in issues.slice(0, 10)" :key="issue" role="alert">{{ issue }}</p>
    <details><summary>高级：配置 JSON</summary><label>工作区 JSON<textarea v-model="workspace.source" rows="12" maxlength="1000000" spellcheck="false"></textarea></label><p v-if="!workspace.input" role="alert">JSON 或配置无效，请修正后再运行。</p></details>
  </main>
</template>
<style>
.workbench { max-width: 1120px; margin: 28px auto; padding: 24px; }
.workbench *, .workbench *::before, .workbench *::after { box-sizing: border-box; }
.workbench .fields { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 16px; margin: 20px 0; }
.workbench .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.workbench .tabs { margin: 28px 0; }
.workbench button[aria-pressed="true"] { background: #153e39; outline: 2px solid #8eb3a7; outline-offset: 2px; }
.workbench button:disabled { opacity: .5; cursor: not-allowed; }
.workbench fieldset { border: 1px solid #dce4e7; border-radius: 8px; margin: 20px 0; padding: 18px; min-width: 0; }
.workbench input, .workbench select { min-width: 0; width: 100%; }
.workbench input[type="checkbox"] { width: auto; }
.workbench textarea { width: 100%; font: .85rem/1.6 ui-monospace,monospace; }
.workbench details { margin: 16px 0; }
.workbench summary { cursor: pointer; padding: 8px 0; }
.workbench .substat { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 12px 0; }
.workbench table { width: 100%; border-collapse: collapse; }
.workbench th, .workbench td { text-align: left; padding: 10px; border-bottom: 1px solid #dce4e7; }
.workbench .scroll { overflow-x: auto; }
.workbench [role="alert"] { color: #a62424; overflow-wrap: anywhere; }
@media(max-width:600px) { .workbench { margin: 0; padding: 14px; } .workbench section { padding: 12px; } .workbench h1 { font-size: 2rem; } }
</style>
