<script setup lang="ts">
import { computed, ref } from 'vue';
import { putHitFact, subjectFacts, type FactSubject } from '@leyline/schema';
import type { CalculationFact, CombatConditions, DamageRequest, ValueType } from '@leyline/schema';
import { buffConditionsMet, buffFactNames, resolveBuffSelection, type CalculatorBuff } from '../domain/calculator-buffs';
import { hpMatches, setCalculatorCondition, setCalculatorFact, calculatorFactValue, withCurrentConditions, type CalculatorFactSetting } from '../domain/calculator-conditions';
import GameIcon from './GameIcon.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';

const props = defineProps<{ choices: CalculatorBuff[]; damage: DamageRequest; actorId: string; intervals: CombatConditions;
  fields: { key: string; type: ValueType; label: string; subject?: FactSubject }[]; hitFacts: CalculatorFactSetting[]; time: number }>();
const emit = defineEmits<{
  apply: [changes: Map<string, boolean>, damage: DamageRequest, durations: Map<string, number[]>];
  close: [];
}>();
const changes = ref(new Map<string, boolean>());
const times = ref(new Map<string, string[]>());
const draft = ref<DamageRequest>(JSON.parse(JSON.stringify(props.damage)));
const current = computed(() => withCurrentConditions(draft.value, props.intervals, props.actorId));
const query = ref('');
const visible = computed(() => props.choices.filter(item => [item.name,item.description,item.source].some(text => text.includes(query.value.trim()))));
const enumLabels: Record<string, string> = { none: '无', left: '左手', right: '右手', 'stellar-conduct': '星超导', 'stellar-swirl': '星扩散' };
function factInput(key: string, selected?: FactSubject) {
  const subject = selected ?? { kind: 'actor', id: props.actorId };
  const value = subjectFacts(draft.value.facts, subject)?.[key]?.value;
  return value ? String(value.value) : '';
}
function setFact(key: string, type: ValueType, event: Event, selected?: FactSubject) {
  const raw = (event.target as HTMLInputElement).value;
  const value: CalculationFact['value'] = raw === '' ? null : type.kind === 'boolean' ? { kind: 'boolean', value: raw === 'true' }
    : type.kind === 'enum' ? { kind: 'enum', value: raw } : { kind: 'quantity', unit: type.unit, value: Number(raw) };
  const subject = selected ?? { kind: 'actor', id: props.actorId };
  putHitFact(draft.value.facts ??= [], subject, key, value);
}
function setCondition(key: 'hpRatio' | 'onField' | 'shielded', event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  setCalculatorCondition(draft.value, props.actorId, key, raw === '' ? null : key === 'hpRatio' ? Number(raw) / 100 : raw === 'true');
}
function toggle(item: CalculatorBuff, value: boolean) {
  if (value) {
    for (const setting of item.requirements) setCalculatorFact(draft.value, setting, item.ownerId);
    if (item.hp && !hpMatches(item.hp, calculatorFactValue(current.value, 'hpRatio', item.ownerId))) {
      setCalculatorCondition(draft.value, item.ownerId, 'hpRatio', item.hp.preset);
    }
    if (item.stacks && !(Number(calculatorFactValue(draft.value, item.stacks.key, item.ownerId)) > 0)) {
      setCalculatorFact(draft.value, { key: item.stacks.key, value: { kind: 'quantity', unit: 'count', value: item.stacks.max } }, item.ownerId);
    }
  } else if (item.toggleFact && !props.hitFacts.some(setting => setting.key === item.toggleFact)) {
    setCalculatorFact(draft.value, { key: item.toggleFact, value: { kind: 'boolean', value: false } }, item.ownerId);
  }
  changes.value.set(item.id, value);
}
function checked(item: CalculatorBuff) {
  const enabled = changes.value.get(item.id) ?? (!item.disabled && !item.triggerSkill && !item.confirmTrigger && (!item.explicit || item.checked));
  return enabled && buffConditionsMet(item, current.value);
}
function requirementLabel(setting: CalculatorFactSetting) {
  const value = setting.value;
  const label = buffFactNames[setting.key] ?? setting.key;
  return value.kind === 'boolean' ? (value.value ? label : label + '关闭') : label + ' ' + (enumLabels[String(value.value)] ?? value.value);
}
function layerTimes(item: CalculatorBuff) {
  return times.value.get(item.id) ?? [item.timing?.remainingMs === undefined ? '' : String(item.timing.remainingMs / 1000)];
}
function setTime(item: CalculatorBuff, index: number, event: Event) {
  const values = [...layerTimes(item)];
  values[index] = (event.target as HTMLInputElement).value;
  times.value.set(item.id, values);
  changes.value.set(item.id, true);
}
function apply() {
  const selected = resolveBuffSelection(props.choices, draft.value, props.intervals, props.actorId, changes.value);
  const durations = new Map([...times.value].map(([id, values]) => [id, values.filter(value => value !== '').map(value => Number(value) * 1000)]));
  emit('apply', selected, draft.value, durations);
}
</script>
<template>
  <WorkbenchDialog title="选择增益" center-title sticky-footer @close="emit('close')">
    <div class="buff-picker">
      <LibraryToolbar v-model="query" search-only label="搜索增益" placeholder="搜索增益或来源…" />
      <div v-if="visible.length" class="buff-options">
        <div v-for="item in visible" :key="item.id" class="buff-entry" data-card-action="select" :class="{ chosen: checked(item) }">
          <label class="card-action-trigger">
            <GameIcon :kind="item.icon.kind" :id="item.icon.id" :monochrome="item.icon.kind === 'constellations'" :size="44" />
            <span><strong>{{ item.name }}</strong><small>{{ item.source }} / {{ item.description }}</small>
              <small v-if="item.requirements.length && !item.toggleFact">{{ item.requirements.map(requirementLabel).join('、') }}</small>
              <small v-if="item.stacks">{{ buffFactNames[item.stacks.key] ?? item.stacks.key }} {{ Number(calculatorFactValue(draft, item.stacks.key, actorId)) > 0 ? calculatorFactValue(draft, item.stacks.key, actorId) : '勾选取满层 ' + item.stacks.max }}</small>
              <small v-if="item.hp">生命比例 {{ { gt:'>', gte:'≥', lt:'<', lte:'≤', eq:'=' }[item.hp.relation] }} {{ item.hp.threshold * 100 }}%<template v-if="!hpMatches(item.hp, calculatorFactValue(current, 'hpRatio', actorId))">，勾选取 {{ item.hp.preset * 100 }}%</template></small>
              <small v-if="item.triggerSkill && !times.get(item.id)?.some(Boolean)">在命中时刻 {{ time }} 秒施放</small></span>
            <input type="checkbox" :aria-label="item.source + ' / ' + item.name + ' / ' + item.description" :checked="checked(item)"
              @change="toggle(item,($event.target as HTMLInputElement).checked)">
          </label>
          <div v-if="checked(item) && item.timing" class="layer-times">
            <label v-for="(value,index) in layerTimes(item)" :key="index">
              {{ item.timing.maxLayers > 1 ? '第' + (index + 1) + '层' : '' }}剩余时间（秒）
              <input type="number" min="0.001" :max="item.timing.durationMs / 1000" step="0.001" :placeholder="String(item.timing.durationMs / 1000)"
                :value="value" @input="setTime(item,index,$event)">
            </label>
            <button v-if="layerTimes(item).length < item.timing.maxLayers" type="button" class="ui-action soft" data-size="sm"
              @click="times.set(item.id,[...layerTimes(item).map(v => v || String(item.timing!.durationMs / 1000)),String(item.timing.durationMs / 1000)])">增加一层</button>
          </div>
          <button v-if="item.explicit && !item.triggerSkill && !item.checked && !changes.has(item.id) && damage.effectApplications?.find(entry => entry.instanceId === item.id)?.active == null"
            type="button" class="ui-action soft" data-size="sm" @click="toggle(item,false)">此命中不适用</button>
        </div>
      </div>
      <p v-else>{{ query ? '没有匹配的增益' : '当前配装与伤害没有可选增益' }}</p>
      <section><h3>触发条件</h3><div class="buff-fields">
        <label v-for="field in fields" :key="JSON.stringify([field.subject, field.key])">{{ field.label }}
          <select v-if="field.type.kind !== 'quantity'" :value="factInput(field.key, field.subject)" @change="setFact(field.key, field.type, $event, field.subject)">
            <option value="">待确认</option><template v-if="field.type.kind === 'boolean'"><option value="true">是</option><option value="false">否</option></template>
            <template v-else><option v-for="value in field.type.values" :key="value" :value="value">{{ enumLabels[value] ?? value }}</option></template>
          </select>
          <input v-else type="number" min="0" :max="field.key === 'vesna.disciplineStacks' ? 6 : undefined" :step="field.type.unit === 'count' ? 1 : 'any'"
            :value="factInput(field.key, field.subject)" placeholder="待确认" @input="setFact(field.key, field.type, $event, field.subject)">
        </label>
        <label>生命比例（%）<input type="number" min="0" max="100" step="any" :value="calculatorFactValue(current, 'hpRatio', actorId) == null ? '' : Number(calculatorFactValue(current, 'hpRatio', actorId)) * 100" placeholder="待确认" @input="setCondition('hpRatio',$event)"></label>
        <label v-for="key in (['onField','shielded'] as const)" :key="key">{{ key === 'onField' ? '站场' : '护盾存在' }}
          <select :value="String(calculatorFactValue(current, key, actorId) ?? '')" @change="setCondition(key,$event)"><option value="">待确认</option><option value="true">是</option><option value="false">否</option></select>
        </label>
      </div></section>
    </div>
    <template #footer><div class="buff-actions"><button type="button" class="ui-action" data-accent="anemo" @click="apply">应用增益</button></div></template>
  </WorkbenchDialog>
</template>
<style scoped>
.buff-picker { display:grid; gap:16px; }
.buff-options,.buff-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr)); gap:8px; }
.buff-entry { display:grid; align-content:start; }
.buff-entry.chosen { background:var(--element-hydro-light); }
.buff-entry label { display:grid; grid-template-columns:44px 1fr auto; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; }
.buff-entry strong,.buff-entry small { display:block; overflow-wrap:anywhere; }
.buff-entry small { font-size:var(--font-body); color:var(--muted); line-height:1.5; font-weight:400; }
.buff-entry input[type=checkbox] { width:18px; height:18px; min-height:0; accent-color:var(--element-hydro-deep); }
.layer-times { display:grid; gap:6px; padding:0 12px 10px; }
.layer-times label { grid-template-columns:1fr minmax(76px,100px); padding:0; }
.buff-entry button { justify-self:end; margin:0 12px 10px; }.buff-fields label { min-width:0; }
h3 { margin:0 0 8px; font-size:var(--font-control); }.buff-actions { display:flex; justify-content:flex-end; }
</style>
