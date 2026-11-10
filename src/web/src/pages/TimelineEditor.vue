<script setup lang="ts">
import GameIcon from '../components/GameIcon.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { nextRecordId } from '../domain/workbench-project';
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
  if (kind === 'damage' && (!selectedSkill.support.supported || !selectedSkill.hits[hitIndex.value])) { error.value = '该技能或段数尚未支持伤害计算；动作仍可记录。'; return; }
  const id = nextRecordId(axis.project);
  axis.command(draft => {
    const definition = kind === 'damage' ? `${owner.id}-real-damage` : `${owner.id}-action-${selectedSkill.id}`;
    if (kind === 'action' && !draft.definitions.some(entry => entry.id === definition)) draft.definitions.push({ id: definition, name: selectedSkill.name, version: owner.build!.dataVersion, source: { kind: 'preset', reference: owner.build!.dataVersion, verified: false }, nodes: [], effects: [] });
    draft.timeline.push({ id, kind, actor: owner.id, definition, timeMs: time, order: Math.max(-1, ...draft.timeline.map(record => record.order)) + 1,
      ...(kind === 'damage' ? { damage: { skillId: selectedSkill.id, hitIndex: hitIndex.value, crit: null, reaction: null } } : {}) });
    if (kind === 'damage' && draft.objective.damageIds) draft.objective.damageIds.push(id);
  });
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
    <div class="roster"><button v-for="(actor, index) in axis.project.candidate.actors" :key="actor.id" :class="{ active: axis.actorId === actor.id }" @click="axis.actorId = actor.id"><GameIcon kind="characters" :id="actor.build?.character.id" :name="actor.name" :constellation="actor.build?.constellation" :level="actor.build?.level" :size="32" /><kbd>{{ index + 1 }}</kbd> {{ actor.name ?? actor.build?.character.identity.name }}</button><p v-if="!axis.project.candidate.actors.length">先到队伍页，从账号选择角色。</p></div>
    <div class="edit-tools"><ChoiceGroup :model-value="layer" :options="[{value:'action',label:'动作层'},{value:'damage',label:'伤害层'}]" label="标注图层" joined @update:model-value="layer=$event==='damage'?'damage':'action'" /><button class="ui-action soft" data-accent="anemo" :aria-pressed="playing" @click="toggleClock">{{ playing ? '暂停标注时钟' : '播放标注时钟' }}</button><label>光标时间 / 毫秒<input v-model.number="cursor" aria-label="标注光标时间" type="number" min="0" max="3600000" step="10" @focus="pause"></label><label>缩放<input v-model.number="scale" aria-label="时间轴缩放" type="range" min="15" max="180"></label></div>
    <div class="skill-palette"><button v-for="item in skills" :key="item.id" :class="{ active: skill?.id === item.id }" @click="skillId = item.id; hitIndex = 0">{{ item.name }}<small>{{ item.support.supported ? '可计算' : '可记动作 · 伤害待支持' }}</small></button><label v-if="layer === 'damage' && skill">命中段数<select v-model.number="hitIndex" aria-label="标注技能段数"><option v-for="(_, index) in skill.hits" :key="index" :value="index">第 {{ index + 1 }} 段</option></select></label><button class="ui-action" data-accent="anemo" :disabled="!skill" @click="add()">在光标处记录{{ layer === 'action' ? '动作' : '伤害点' }}</button></div>
    <p class="key-help">空格 播放/暂停标注时钟 · 1–4 选角色 · E 战技 · Q 爆发 · Enter 记录所选技能 · ←/→ 移动 10 毫秒（Shift 为 1 秒）。拖动记录细调，默认吸附 10 毫秒，Alt 精确到 1 毫秒。动作与命中分别记录，时钟本身不会生成记录。</p><p v-if="error" role="alert">{{ error }}</p>
    <div class="desk-scroll"><div class="desk-tracks" :style="{ width: `${width + 120}px` }"><div class="desk-ruler"><span>角色 / 信息层</span><div :style="{ width: `${width}px` }" @click="seek"><i v-for="tick in Math.ceil(duration / 1000) + 1" :key="tick" :style="{ left: `${(tick - 1) * scale}px` }">{{ tick - 1 }}s</i><b class="playhead" :style="{ left: `${cursor / 1000 * scale}px` }"></b></div></div><template v-for="actor in axis.project.candidate.actors" :key="actor.id"><div v-for="kind in ['action', 'damage']" :key="kind" class="desk-row" :class="{ dim: layer !== kind }"><div class="desk-label"><GameIcon kind="characters" :id="actor.build?.character.id" :name="actor.name" :constellation="actor.build?.constellation" :level="actor.build?.level" :size="28" />{{ actor.name ?? '角色' }}<small>{{ kind === 'action' ? '动作' : '伤害' }}</small></div><div class="desk-lane" @click="seek"><span class="cursor-line" :style="{ left: `${cursor / 1000 * scale}px` }"></span><button v-for="record in records(actor.id, kind)" :key="record.id" class="desk-record" :class="{ selected: axis.selectedId === record.id, damage: kind === 'damage' }" :style="{ left: `${record.timeMs / 1000 * scale}px` }" :aria-label="`选择${kind === 'action' ? '动作' : '伤害点'} ${recordLabel(axis.project, record.id)}`" :data-record-id="record.id" @click.stop="axis.selectedId = record.id; axis.actorId = record.actor" @pointerdown="drag($event, record)">{{ recordLabel(axis.project, record.id) }}<small>{{ record.timeMs }} ms</small></button></div></div></template></div></div>
    <p v-if="!axis.project.timeline.length" class="empty-axis">轴里还没有记录。选择角色与技能，在光标位置记录动作；切到伤害层记录实际命中，再补充条件。</p>
  </section>
</template>
<style scoped>
.editing-desk { padding:18px; }.roster,.edit-tools,.skill-palette,.layers { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }.roster { border-bottom:1px solid var(--neutral-line); padding-bottom:16px; }.roster > button.active,.skill-palette > button.active { background:var(--element-anemo-light); color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); }.edit-tools { justify-content:space-between; padding:16px 0; } label { display:grid; gap:7px; font-size:var(--font-body); } input[type=number] { width:140px; }.skill-palette button small { display:block; margin-top:6px; font-size:var(--font-body); }.key-help { font-size:var(--font-body); line-height:1.8; color:var(--neutral-muted); margin:16px 0; }.desk-scroll { overflow:auto; max-height:480px; border:1px solid var(--neutral-line); border-radius:8px; }.desk-tracks { min-width:100%; }.desk-ruler,.desk-row { display:flex; }.desk-ruler { position:sticky; top:0; background:var(--neutral-line); height:36px; z-index:3; }.desk-ruler > span,.desk-label { width:120px; flex-shrink:0; padding:10px; box-sizing:border-box; position:sticky; left:0; background:var(--element-dendro-light); z-index:2; font-size:var(--font-body); }.desk-ruler > div { position:relative; cursor:crosshair; }.desk-ruler i { position:absolute; top:8px; font-size:var(--font-body); font-style:normal; }.playhead { position:absolute; height:100%; border-left:2px solid var(--element-pyro-deep); }.desk-lane { position:relative; flex:1; height:80px; cursor:crosshair; background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--neutral-line) 20.00%,transparent) 0 1px,transparent 1px 60px),var(--neutral-canvas); border-top:1px solid var(--neutral-line); }.desk-label small { display:block; margin-top:10px; color:var(--neutral-muted); }.desk-record { position:absolute; top:12px; min-width:92px; max-width:150px; padding:7px 10px; background:var(--neutral-line); border:1px solid var(--element-cryo-primary); border-radius:5px; text-align:left; font-size:var(--font-body); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; touch-action:none; cursor:grab; }.desk-record.damage { background:var(--element-anemo-light); border-color:var(--element-anemo-primary); }.desk-record.selected { outline:2px solid var(--element-geo-primary); z-index:1; }.desk-record small { display:block; margin-top:5px; }.cursor-line { position:absolute; top:0; bottom:0; border-left:1px solid var(--element-pyro-deep); pointer-events:none; }.dim .desk-lane { background-color:var(--element-dendro-light); }.empty-axis { text-align:center; padding:30px 15px; font-size:var(--font-body); line-height:1.8; } kbd { padding-right:6px; }
.roster > button { display:flex; align-items:center; gap:8px; }.desk-label > .game-icon { float:left; margin-right:8px; }
</style>
