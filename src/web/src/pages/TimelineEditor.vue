<script setup lang="ts">
import BattleSceneSettings from '../components/BattleSceneSettings.vue';
import AuraObservationForm from '../components/AuraObservationForm.vue';
import TalentHealingForm from '../components/TalentHealingForm.vue';
import ReactionRecordForm from '../components/ReactionRecordForm.vue';
import GameIcon from '../components/GameIcon.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { equipmentHits, putHitFact, transformativeElements, transformativeFamilies, type TransformativeFamily, type HitRef, type HitFacts } from '@leyline/schema';
import { getReactionCalculationBundle } from '@leyline/game-data';
import { grantedDamageChanges } from '@leyline/engine';
import { ordinaryReactions } from '@leyline/schema/hit-bindings';
import { reactionNames } from '../domain/calculator-factors';
import { addAuraObservation, addFieldChange, addCombatObservation, addParticlePickup, addReactionObservation, addSelectedHit, addSkillAction, addSkillHit, addTalentHeal, addTransformativeReaction } from '../domain/real-project';
import { recordLabel, realElementLabel, damageFamilyLabel } from '../domain/workbench-labels';
import type { CombatObservation, Project } from '@leyline/schema';
type TimelineRecord = Project['timeline'][number];
const axis = useAxisWorkspaceStore();
const cursor = ref(0);
const scale = ref(60);
const layer = ref<'action' | 'damage'>('action');
const skillId = ref('');
const hitIndex = ref(0);
const error = ref('');
const playing = ref(false);
let frame = 0;
function pause() { playing.value = false; cancelAnimationFrame(frame); }
function toggleClock() {
  if (playing.value) { pause(); return; }
  const origin = performance.now(), start = Number(cursor.value);
  if (!Number.isFinite(start) || start < 0 || start >= 3600000) { error.value = '请先设置合法的标注光标时间。'; return; }
  playing.value = true;
  const tick = () => {
    cursor.value = Math.min(3600000, Math.round(start + performance.now() - origin));
    if (cursor.value >= 3600000) { pause(); return; }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}
const skills = computed(() => axis.actor?.build?.character.talents ?? []);
const skill = computed(() => skills.value.find(item => item.id === skillId.value) ?? skills.value[0]);
const hit = computed(() => skill.value?.hits[hitIndex.value]);
const summonTalent = computed(() => skills.value.find(t => t.summon && (t.id === skill.value?.id || t.summon.release.skill === skill.value?.id)));
const priorSummons = computed(() => axis.project.timeline.filter(record => record.actor === axis.actorId && record.kind === 'action'
  && record.skillId === summonTalent.value?.id && record.summon && record.timeMs <= cursor.value));
const nearby = ref<string[]>([]), replace = ref(''), targetInRange = ref(true);
const summonCrit = ref<'noncritical' | 'critical' | 'expected'>('noncritical');
const summonReaction = ref<'none' | 'aggravate'>('none');
const coordinatedParty = computed(() => axis.project.candidate.actors.some(actor =>
  actor.build?.character.talents.some(talent => talent.hits.some(item => item.coordinated))));
const coordinatedSource = computed(() => layer.value === 'action' ? skill.value?.hits.some(item => item.coordinated?.window)
  : coordinatedParty.value && hit.value && !hit.value.coordinated);
const coordinatedCrit = ref<'inherit' | 'unknown' | 'noncritical' | 'critical' | 'expected'>('inherit');
const coordinatedReaction = ref<'unknown' | keyof typeof reactionNames>('unknown');
const projectionReactions = computed(() => layer.value === 'damage' ? ordinaryReactions(axis.actor?.build?.character.identity.element) : []);
watch([() => axis.actorId, layer, skillId], () => { coordinatedCrit.value = 'inherit'; coordinatedReaction.value = 'unknown'; }, { flush: 'sync' });
watch([() => axis.actorId, skillId], () => { nearby.value = []; replace.value = ''; });
const equipment = computed(() => axis.actor?.build ? equipmentHits(axis.actor.build) : []);
const reactionFamily = ref<TransformativeFamily>('swirl'), reactionElement = ref<typeof transformativeElements.swirl[number]>('pyro');
watch(reactionFamily, family => { reactionElement.value = transformativeElements[family][0]; });
async function addReaction() {
  const owner = axis.actor?.id, at = Math.round(cursor.value), family = reactionFamily.value, element = reactionElement.value, projectId = axis.project.id;
  if (!owner) return;
  try {
    const rules = axis.project.reactionRules ?? await getReactionCalculationBundle();
    if (axis.project.id !== projectId) return;
    axis.command(draft => { axis.selectedId = addTransformativeReaction(draft,owner,family,element,at,rules); });
    error.value = '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法记录反应伤害。'; }
}
const damageChanges = computed(() => axis.actor?.build ? grantedDamageChanges(axis.actor.build) : []);
const hasDefeatTrigger = computed(() => axis.actor?.build?.weapon?.metadata.buffs?.some(b => typeof b.trigger === 'object' && 'selector' in b.trigger && b.trigger.selector.observation?.key === 'enemyDefeated'));
const hitTargets = ref<number | ''>(''), criticalTargets = ref<number | ''>(''), triggerRoll = ref<number | ''>('');
function setSeed(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  if (raw && (!Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > 4294967295)) {
    error.value = '随机种子须为 0 到 4294967295 的整数。'; return;
  }
  axis.command(draft => { if (raw) draft.seed = Number(raw); else delete draft.seed; });
}
const defeated = ref(''), remainingCooldown = ref<number | ''>('');
watch([() => axis.actorId, skillId], () => { hitTargets.value = ''; criticalTargets.value = ''; triggerRoll.value = ''; defeated.value = ''; remainingCooldown.value = ''; });
const observationLabels: Record<CombatObservation,string> = {hpRatioChange:'生命变化（%）',damageTaken:'实际受到的伤害',healingDone:'治疗量（含溢出）',healingReceived:'受到治疗量（含溢出）',bondOfLifeChange:'生命之契变化量',nightsoulChange:'夜魂值变化量',nightsoulBurst:'触发夜魂迸发'};
const healthField = ref<CombatObservation>('hpRatioChange'), healthValue = ref<number | string>('');
const energyReading=ref<number|''>(''), exitCrit=ref<NonNullable<Project['timeline'][number]['fieldSwitch']>['crit']>(null);
function recordField(enter:boolean) {
  const id=axis.actor?.id;
  if (!id) return;
  try { axis.command(draft=>{axis.selectedId=addFieldChange(draft,id,Math.round(cursor.value),{
    ...(enter ? {mode:{crit:exitCrit.value,reaction:exitCrit.value===null?null:'none'}} : {}), ...(energyReading.value===''?{}:{energy:energyReading.value}) });}); error.value=''; }
  catch(cause){error.value=cause instanceof Error?cause.message:'状态记录无效。';}
}
function recordHealth() {
  const actor = axis.actor;
  if (!actor || healthField.value !== 'nightsoulBurst' && (healthValue.value === '' || !Number.isFinite(Number(healthValue.value)))) { error.value = '请填写所选事件的变化量。'; return; }
  const value = healthField.value === 'nightsoulBurst' ? true : Number(healthValue.value) / (healthField.value === 'hpRatioChange' ? 100 : 1);
  try {
    axis.command(project => { axis.selectedId = addCombatObservation(project, actor.id, Math.round(cursor.value), healthField.value, value); });
    error.value = '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法记录生命变化。'; }
}
function addEquipmentHit(ref: HitRef) {
  const owner = axis.actor;
  if (!owner) return;
  try { axis.command(project => { axis.selectedId = addSelectedHit(project, owner.id, ref, Math.round(cursor.value)); }); error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '无法添加装备伤害。'; }
}
const duration = computed(() => Math.min(3600000, Math.max(15000, cursor.value + 3000, ...axis.project.timeline.map(record => record.timeMs + 3000))));
const width = computed(() => Math.max(600, duration.value / 1000 * scale.value));
const records = (actor: string, kind: string) => axis.project.timeline.filter(record => record.actor === actor
  && (kind === 'damage' ? record.kind === 'damage' : record.kind === 'action' || record.kind === 'state-change'));
function add(kind = layer.value, selectedSkill = skill.value) {
  const owner = axis.actor;
  if (!owner || !selectedSkill) { error.value = '请先准备队伍并选择技能。'; return; }
  const time = Math.round(cursor.value);
  if (!Number.isInteger(time) || time < 0 || time > 3600000) { error.value = '记录时间必须在 0 到 3600000 毫秒之间。'; return; }
  if (kind === 'damage' && !selectedSkill.hits[hitIndex.value]) { error.value = '请选择此技能已绑定的命中。'; return; }
  let id = '';
  try { axis.command(draft => {
    if (kind === 'damage') {
      const facts: HitFacts = [];
      if (damageChanges.value.length) {
        for (const [key, input] of [['targetsDamaged',hitTargets],['criticalTargets',criticalTargets],['triggerRoll',triggerRoll]] as const) {
          if (input.value !== '') putHitFact(facts,{kind:'event'},key,{ kind:'quantity', unit: key === 'triggerRoll' ? 'scalar' : 'count', value: input.value });
        }
        if (remainingCooldown.value !== '') putHitFact(facts,{kind:'actor',id:owner.id},'skillCooldownRemaining',{kind:'quantity',unit:'milliseconds',value:remainingCooldown.value});
      }
      if (hasDefeatTrigger.value && defeated.value) putHitFact(facts,{kind:'event'},'enemyDefeated',{kind:'boolean',value:defeated.value === 'true'});
      id = addSkillHit(draft, owner.id, selectedSkill.id, hitIndex.value, time, { crit: null, reaction: null, ...(facts.length ? { facts } : {}) });
    } else {
      const rule = skills.value.find(t => t.summon && (t.id === selectedSkill.id || t.summon.release.skill === selectedSkill.id));
      const summon: TimelineRecord['summon'] = rule ? { nearby: nearby.value.filter(id => priorSummons.value.some(record => record.id === id)),
        ...(rule.id === selectedSkill.id && replace.value ? { replace: replace.value } : {}),
        targetInRange: targetInRange.value, crit: summonCrit.value, reaction: summonReaction.value === 'none' ? 'none' : { type: summonReaction.value, trigger: 'record-owner' } } : undefined;
      id = addSkillAction(draft, owner.id, selectedSkill.id, time, summon);
    }
    if (coordinatedSource.value && coordinatedCrit.value !== 'inherit') {
      const reaction = coordinatedReaction.value;
      draft.timeline.find(entry => entry.id === id)!.coordinatedMode = { crit: coordinatedCrit.value === 'unknown' ? null : coordinatedCrit.value,
        reaction: reaction === 'unknown' ? null : reaction === 'none' ? 'none' : { type: reaction, trigger: 'record-owner' } };
    }
  }); } catch (cause) { error.value = cause instanceof Error ? cause.message : '命中记录无效。'; return; }
  axis.selectedId = id;
  error.value = '';
}
function seek(event: MouseEvent) {
  pause();
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  cursor.value = Math.min(3600000, Math.max(0, Math.round((event.clientX - bounds.left) / scale.value * 1000)));
}
function drag(event: PointerEvent, record: TimelineRecord) {
  if (event.button !== 0) return;
  pause();
  event.stopPropagation();
  axis.selectedId = record.id;
  axis.actorId = record.actor;
  const target = event.currentTarget as HTMLElement;
  const project = axis.project;
  const start = event.clientX, time = record.timeMs;
  target.setPointerCapture(event.pointerId);
  let next = time;
  const move = (event: PointerEvent) => {
    const raw = time + (event.clientX - start) / scale.value * 1000;
    next = Math.min(3600000, Math.max(0, Math.round(raw / (event.altKey ? 1 : 10)) * (event.altKey ? 1 : 10)));
    target.style.left = `${next / 1000 * scale.value}px`;
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', cancel);
    if (axis.project === project && next !== time) axis.command(draft => { const item = draft.timeline.find(item => item.id === record.id); if (item) item.timeMs = next; });
  };
  const cancel = () => { next = time; target.style.left = `${time / 1000 * scale.value}px`; end(); };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end, { once: true });
  target.addEventListener('pointercancel', cancel, { once: true });
}
function key(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target.closest('input, textarea, select, [contenteditable], dialog')) return;
  if ((event.key === 'Enter' || event.code === 'Space') && target.closest('button, a, summary')) return;
  if (event.code === 'Space') { toggleClock(); event.preventDefault(); return; }
  const index = Number(event.key) - 1;
  if (/^[1-4]$/.test(event.key)) { const actor = axis.project.candidate.actors[index]; if (actor) axis.actorId = actor.id; event.preventDefault(); return; }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { pause(); cursor.value = Math.max(0, Math.min(3600000, cursor.value + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1000 : 10))); event.preventDefault(); return; }
  const category = event.key.toLowerCase() === 'e' ? 'skill' : event.key.toLowerCase() === 'q' ? 'burst' : undefined;
  if (category) { const selected = skills.value.find(skill => skill.category === category); if (selected) { skillId.value = selected.id; hitIndex.value = 0; add(layer.value, selected); } event.preventDefault(); }
  if (event.key === 'Enter') { add(); event.preventDefault(); }
}
onMounted(() => window.addEventListener('keydown', key));
onBeforeUnmount(() => { pause(); window.removeEventListener('keydown', key); });
</script>
<template>
  <section class="editing-desk" aria-label="剪辑式时间轴编辑">
    <div v-if="axis.project.candidate.actors.length" class="desk-roster" role="group" aria-label="时间轴队员">
      <button v-for="(actor, index) in axis.project.candidate.actors" :key="actor.id"
        class="desk-option" data-card-action="select" :aria-pressed="axis.actorId === actor.id" @click="axis.actorId = actor.id">
        <GameIcon kind="characters" :id="actor.build?.character.id" :name="actor.name" :constellation="actor.build?.constellation"
          :level="actor.build?.level" :size="28" />
        <span><kbd>{{ index + 1 }}</kbd> {{ actor.name ?? actor.build?.character.identity.name }}</span>
      </button>
    </div>
    <div class="edit-tools">
      <div class="library-page-actions">
        <ChoiceGroup :model-value="layer" :options="[{ value: 'action', label: '动作层' }, { value: 'damage', label: '伤害层' }]"
          label="标注图层" joined @update:model-value="layer = $event === 'damage' ? 'damage' : 'action'" />
        <button class="ui-action soft" :aria-pressed="playing" @click="toggleClock">{{ playing ? '暂停标注时钟' : '播放标注时钟' }}</button>
      </div>
      <label class="desk-time">光标时间（毫秒）
        <input v-model.number="cursor" aria-label="标注光标时间" type="number" min="0" max="3600000" step="10" @focus="pause">
      </label>
      <label class="desk-zoom">缩放
        <input v-model.number="scale" aria-label="时间轴缩放" type="range" min="15" max="180">
      </label>
    </div>
    <div v-if="skills.length" class="skill-palette">
      <button v-for="item in skills" :key="item.id" class="desk-option" data-card-action="select" :aria-pressed="skill?.id === item.id"
        @click="skillId = item.id; hitIndex = 0">
        <span>{{ item.name }}</span>
        <small v-if="!item.hits.length">仅可记动作</small>
      </button>
      <label v-if="layer === 'damage' && skill">命中段数
        <select v-model.number="hitIndex" aria-label="标注技能段数">
          <option v-for="(_, index) in skill.hits" :key="index" :value="index">第 {{ index + 1 }} 段</option>
        </select>
      </label>

      <button class="ui-action" :disabled="!skill" @click="add()">在光标处记录{{ layer === 'action' ? '动作' : '伤害点' }}</button>
    </div>
    <div v-if="layer === 'damage' && equipment.length" class="skill-palette">
      <button v-for="entry in equipment" :key="JSON.stringify(entry.ref)" class="desk-option" @click="addEquipmentHit(entry.ref)">{{ entry.entity.name }} · {{ entry.hit.name }}</button>
    </div>
    <details v-if="layer === 'damage' && axis.actor?.build"><summary>独立反应伤害</summary><div class="skill-palette">
      <label>剧变反应<select v-model="reactionFamily"><option v-for="key in transformativeFamilies" :key="key" :value="key">{{ damageFamilyLabel(key) }}</option></select></label>
      <label v-if="transformativeElements[reactionFamily].length > 1">反应伤害元素<select v-model="reactionElement"><option v-for="e in transformativeElements[reactionFamily]" :key="e" :value="e">{{ realElementLabel(e) }}</option></select></label>
      <button class="ui-action" type="button" @click="addReaction">记录一次反应伤害</button>
    </div></details>
    <fieldset v-if="layer === 'action' && summonTalent" class="skill-palette"><legend>召唤物与目标</legend>
      <label><input v-model="targetInRange" type="checkbox">目标在作用范围内</label>
      <label v-for="source in priorSummons" :key="source.id"><input v-model="nearby" type="checkbox" :value="source.id">{{ source.timeMs }} ms 创建的召唤物在附近</label>
      <label v-if="skill?.id === summonTalent.id && priorSummons.length">过近时替换<select v-model="replace"><option value="">无</option>
        <option v-for="source in priorSummons" :key="source.id" :value="source.id">{{ source.timeMs }} ms</option></select></label>
      <label>召唤伤害暴击<select v-model="summonCrit"><option value="noncritical">不暴击</option><option value="critical">暴击</option><option value="expected">期望</option></select></label>
      <label>召唤伤害反应<select v-model="summonReaction"><option value="none">无反应</option><option value="aggravate">超激化</option></select></label>
    </fieldset>
    <fieldset v-if="coordinatedSource" class="skill-palette"><legend>协同攻击</legend>
      <label>协同伤害暴击<select v-model="coordinatedCrit"><option value="inherit">继承施放设置</option><option value="unknown">待确认</option><option value="noncritical">不暴击</option><option value="critical">暴击</option><option value="expected">期望</option></select></label>
      <label v-if="coordinatedCrit !== 'inherit'">协同伤害反应<select v-model="coordinatedReaction"><option value="unknown">待确认</option><option value="none">无反应</option>
        <option v-for="reaction in projectionReactions" :key="reaction" :value="reaction">{{ reactionNames[reaction] }}</option></select></label>
    </fieldset>
    <fieldset v-if="layer === 'damage' && (damageChanges.length || hasDefeatTrigger)" class="skill-palette"><legend>命中与装备触发</legend>
      <template v-if="damageChanges.length">
        <label>实际受到伤害的目标数<input v-model.number="hitTargets" type="number" min="0" max="1000" placeholder="待确认"></label>
        <label v-if="damageChanges.some(c => c.rule.critical)">其中受到暴击的目标数<input v-model.number="criticalTargets" type="number" min="0" max="1000" placeholder="待确认"></label>
        <label>触发抽样值<input v-model.number="triggerRoll" type="number" min="0" max="0.999999999" step="any" placeholder="使用项目种子"></label>
        <label>项目随机种子<input type="number" min="0" max="4294967295" step="1" :value="axis.project.seed" placeholder="待确认" @change="setSeed"></label>
        <label v-if="damageChanges.some(c => c.rule.change.kind === 'reset-skill')">当前战技剩余冷却（毫秒）<input v-model.number="remainingCooldown" type="number" min="0" placeholder="继承记录"></label>
      </template>
      <label v-if="hasDefeatTrigger">本击击败目标<select v-model="defeated"><option value="">未记录</option><option value="true">是</option><option value="false">否</option></select></label>
    </fieldset>
    <ReactionRecordForm v-if="axis.actor?.build" :project="axis.project" :actor="axis.actor.id" :time-ms="Math.round(cursor)" :changes="axis.result.combatChanges"
      @reaction="(actor,reaction,element)=>axis.command(draft=>{axis.selectedId=addReactionObservation(draft,actor,Math.round(cursor),reaction,element);})"
      @pickup="(actor,source,effect)=>axis.command(draft=>{axis.selectedId=addParticlePickup(draft,actor,source,Math.round(cursor),effect);})" />
    <details v-if="axis.actor?.build"><summary>战斗事件记录</summary>
      <div class="skill-palette"><label>记录类型<select v-model="healthField"><option v-for="(name,id) in observationLabels" :key="id" :value="id">{{ name }}</option></select></label>
        <label v-if="healthField !== 'nightsoulBurst'">{{ observationLabels[healthField] }}<input v-model="healthValue" type="number" step="any"></label>
        <button class="ui-action" @click="recordHealth">在光标处记录</button></div>
    </details>
    <details v-if="axis.actor?.build && layer === 'action'"><summary>换人与能量</summary><div class="skill-palette">
      <label>当前队员元素能量<input type="number" min="0" step="any" v-model.number="energyReading" placeholder="待确认"></label>
      <button type="button" class="ui-action" :disabled="energyReading === ''" @click="recordField(false)">记录能量</button>
      <label>离场追击口径<select v-model="exitCrit"><option :value="null">待确认</option><option value="noncritical">非暴击、无反应</option><option value="critical">暴击、无反应</option><option value="expected">暴击期望、无反应</option></select></label>
      <button type="button" class="ui-action" @click="recordField(true)">切换至当前队员</button>
    </div></details>
    <TalentHealingForm :members="axis.project.candidate.actors" @apply="(actor,recipient,heal,facts)=>axis.command(draft=>{axis.selectedId=addTalentHeal(draft,actor,recipient,heal,Math.round(cursor),facts);})" />
    <AuraObservationForm v-if="axis.actor?.build" :members="axis.project.candidate.actors.filter(a=>a.build)" :actor="axis.actor.id"
      @apply="(id,aura)=>axis.command(draft=>{axis.selectedId=addAuraObservation(draft,id,Math.round(cursor),aura);})" />
    <BattleSceneSettings v-if="axis.actor?.build" :selections="axis.project.sceneEffects" @change="entries => axis.command(draft => { draft.sceneEffects = entries; })" />
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="desk-scroll" role="region" aria-label="时间轴轨道" tabindex="0">
      <div class="desk-tracks" :style="{ width: `${width + 120}px`, '--second-width': `${scale}px` }">
        <div class="desk-ruler">
          <span>角色 / 图层</span>
          <div :style="{ width: `${width}px` }" @click="seek">
            <i v-for="tick in Math.ceil(duration / 1000) + 1" :key="tick" :style="{ left: `${(tick - 1) * scale}px` }">{{ tick - 1 }}s</i>
            <b class="playhead" :style="{ left: `${cursor / 1000 * scale}px` }"></b>
          </div>
        </div>
        <template v-for="actor in axis.project.candidate.actors" :key="actor.id">
          <div v-for="kind in ['action', 'damage']" :key="kind" class="desk-row" :class="{ dim: layer !== kind }">
            <div class="desk-label">
              <GameIcon kind="characters" :id="actor.build?.character.id" :name="actor.name" :constellation="actor.build?.constellation"
                :level="actor.build?.level" :size="28" />
              {{ actor.name ?? '角色' }}
              <small>{{ kind === 'action' ? '动作' : '伤害' }}</small>
            </div>
            <div class="desk-lane" @click="seek">
              <span class="cursor-line" :style="{ left: `${cursor / 1000 * scale}px` }"></span>
              <button v-for="record in records(actor.id, kind)" :key="record.id" class="desk-record" data-card-action="detail"
                :class="{ selected: axis.selectedId === record.id, damage: kind === 'damage' }"
                :style="{ left: `${record.timeMs / 1000 * scale}px` }"
                :aria-label="`选择${kind === 'action' ? '动作' : '伤害点'} ${recordLabel(axis.project, record.id)}`" :data-record-id="record.id"
                @click.stop="axis.selectedId = record.id; axis.actorId = record.actor" @pointerdown="drag($event, record)">
                {{ recordLabel(axis.project, record.id) }}<small>{{ record.timeMs }} ms</small>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
    <p v-if="!axis.project.timeline.length" class="empty-axis">还没有轴记录</p>
    <details class="timeline-shortcuts">
      <summary>快捷键与时间规则</summary>
      <p>空格播放或暂停，1–4 选择队员，E 选战技，Q 选爆发，Enter 记录所选技能。←/→ 移动 10 毫秒，按住 Shift 时移动 1 秒。</p>
      <p>拖动记录默认吸附至 10 毫秒，按住 Alt 时精确到 1 毫秒。时间采用整数毫秒，区间左闭右开。</p>
    </details>
  </section>
</template>

<style scoped>
section.editing-desk { display:grid; gap:12px; padding:12px 16px; }
.desk-roster,.edit-tools,.skill-palette { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; }
.desk-roster { padding-bottom:12px; border-bottom:1px solid var(--line); }
.edit-tools,.skill-palette { align-items:end; }
.edit-tools > .library-page-actions { margin-inline-end:auto; }
.desk-time { width:136px; }
.desk-zoom { width:116px; }
.desk-zoom > input[type=range] { padding:0; border:0; background:transparent; accent-color:var(--element-anemo-deep); }
.desk-option {
  display:flex; align-items:center; gap:8px; max-width:100%; min-height:var(--control-height-lg);
  padding:4px 8px; overflow-wrap:anywhere; text-align:left;
}
.desk-option[aria-pressed=true] { background:var(--element-hydro-light); color:var(--element-hydro-deep); font-weight:700; }
.skill-palette .desk-option { display:grid; gap:0; }
.skill-palette small,.desk-option kbd { color:var(--muted); }
.desk-scroll { overflow:auto; max-height:480px; border:1px solid var(--line); border-radius:var(--control-radius); }
.desk-scroll:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.desk-tracks { min-width:100%; font-variant-numeric:tabular-nums; }
.desk-ruler,.desk-row { display:flex; }
.desk-ruler { position:sticky; top:0; background:var(--surface-subtle); height:var(--control-height-lg); z-index:3; }
.desk-ruler > span,.desk-label {
  width:120px; flex-shrink:0; padding:8px; position:sticky; left:0; z-index:2;
  border-right:1px solid var(--line); background:var(--surface); overflow-wrap:anywhere;
}
.desk-ruler > span { font-weight:700; }
.desk-ruler > div { position:relative; cursor:crosshair; }
.desk-ruler i { position:absolute; top:8px; color:var(--muted); font-style:normal; }
.desk-lane {
  position:relative; flex:1; height:72px; cursor:crosshair; border-top:1px solid var(--line);
  background:repeating-linear-gradient(90deg,var(--line) 0 1px,transparent 1px var(--second-width)),var(--surface-raised);
}
.desk-label small { display:block; margin-top:6px; color:var(--muted); }
.desk-label > .game-icon { float:left; margin-right:6px; }
.desk-record {
  position:absolute; top:12px; min-width:92px; max-width:150px; padding:4px 8px; color:var(--ink);
  background:var(--surface);
  text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; touch-action:none; cursor:grab;
}
.desk-record.damage { color:var(--element-anemo-deep); background:var(--element-anemo-light); border-inline-color:var(--element-anemo-primary); border-bottom-color:var(--element-anemo-primary); }
.desk-record.selected { border-color:var(--element-hydro-deep); box-shadow:inset 0 0 0 1px var(--element-hydro-deep); z-index:1; }
.desk-record small { display:block; }
.playhead,.cursor-line { position:absolute; top:0; bottom:0; border-left:1px solid var(--element-pyro-deep); pointer-events:none; }
.dim .desk-lane { background-color:var(--surface-subtle); }
.empty-axis,.timeline-shortcuts { color:var(--muted); }
.empty-axis { text-align:center; }
.timeline-shortcuts summary { width:fit-content; line-height:var(--control-height-md); }
.timeline-shortcuts p + p { margin-top:4px; }
</style>
