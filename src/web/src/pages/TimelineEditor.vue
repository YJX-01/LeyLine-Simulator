<script setup lang="ts">
import GameIcon from '../components/GameIcon.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { addSkillAction, addSkillHit } from '../domain/real-project';
import { recordLabel } from '../domain/workbench-labels';
import type { Project } from '@leyline/schema';
type Record = Project['timeline'][number];
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
const duration = computed(() => Math.min(3600000, Math.max(15000, cursor.value + 3000, ...axis.project.timeline.map(record => record.timeMs + 3000))));
const width = computed(() => Math.max(600, duration.value / 1000 * scale.value));
const records = (actor: string, kind: string) => axis.project.timeline.filter(record => record.actor === actor && record.kind === kind);
function add(kind = layer.value, selectedSkill = skill.value) {
  const owner = axis.actor;
  if (!owner || !selectedSkill) { error.value = '请先准备队伍并选择技能。'; return; }
  const time = Math.round(cursor.value);
  if (!Number.isInteger(time) || time < 0 || time > 3600000) { error.value = '记录时间必须在 0 到 3600000 毫秒之间。'; return; }
  if (kind === 'damage' && (!selectedSkill.hits[hitIndex.value]?.outputs.length)) { error.value = '该技能或段数尚未支持伤害计算；动作仍可记录。'; return; }
  let id = '';
  try { axis.command(draft => {
    if (kind === 'damage') { id = addSkillHit(draft, owner.id, selectedSkill.id, hitIndex.value, time); return; }
    id = addSkillAction(draft, owner.id, selectedSkill.id, time);
  }); } catch (cause) { error.value = cause instanceof Error ? cause.message : '命中记录无效。'; return; }
  axis.selectedId = id;
  error.value = '';
}
function seek(event: MouseEvent) {
  pause();
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  cursor.value = Math.min(3600000, Math.max(0, Math.round((event.clientX - bounds.left) / scale.value * 1000)));
}
function drag(event: PointerEvent, record: Record) {
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
        <small v-if="!item.hits.some(hit => hit.outputs.length)">仅可记动作</small>
      </button>
      <label v-if="layer === 'damage' && skill">命中段数
        <select v-model.number="hitIndex" aria-label="标注技能段数">
          <option v-for="(_, index) in skill.hits" :key="index" :value="index">第 {{ index + 1 }} 段</option>
        </select>
      </label>
      <button class="ui-action" :disabled="!skill" @click="add()">在光标处记录{{ layer === 'action' ? '动作' : '伤害点' }}</button>
    </div>
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
