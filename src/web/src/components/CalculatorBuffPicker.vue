<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CalculationFact, CombatConditions, DamageRequest, ValueType } from '@leyline/schema';
import { buffConditionsMet, buffFactNames, resolveBuffSelection, type CalculatorBuff } from '../domain/calculator-buffs';
import { hpMatches, setTrialCondition, setTrialFact, trialValue, withCurrentConditions, type CalculatorFactSetting } from '../domain/calculator-conditions';
import GameIcon from './GameIcon.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';

const props = defineProps<{ choices: CalculatorBuff[]; damage: DamageRequest; actorId: string; intervals: CombatConditions;
  fields: { key: string; type: ValueType; label: string }[]; hitFacts: CalculatorFactSetting[]; time: number }>();
const emit = defineEmits<{
  apply: [changes: Map<string, boolean>, damage: DamageRequest];
  close: [];
}>();
const changes = ref(new Map<string, boolean>());
const draft = ref<DamageRequest>(JSON.parse(JSON.stringify(props.damage)));
const current = computed(() => withCurrentConditions(draft.value, props.intervals, props.actorId));
const query = ref('');
const visible = computed(() => props.choices.filter(item => [item.name,item.description,item.source].some(text => text.includes(query.value.trim()))));
const enumLabels: Record<string, string> = { none: '无', 'stellar-conduct': '星超导', 'stellar-swirl': '星扩散' };
function factInput(key: string) {
  const value = draft.value.facts?.[key]?.value;
  return value ? String(value.value) : '';
}
function setFact(key: string, type: ValueType, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const value: CalculationFact['value'] = raw === '' ? null : type.kind === 'boolean' ? { kind: 'boolean', value: raw === 'true' }
    : type.kind === 'enum' ? { kind: 'enum', value: raw } : { kind: 'quantity', unit: type.unit, value: Number(raw) };
  draft.value.facts = { ...draft.value.facts, [key]: { value, provenance: 'explicit', sourceRefs: [] } };
}
function setCondition(key: 'hpRatio' | 'onField' | 'shielded', event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  setTrialCondition(draft.value, props.actorId, key, raw === '' ? null : key === 'hpRatio' ? Number(raw) / 100 : raw === 'true');
}
function toggle(item: CalculatorBuff, value: boolean) {
  if (value) {
    for (const setting of item.requirements) setTrialFact(draft.value, setting, props.actorId);
    if (item.hp && !hpMatches(item.hp, trialValue(current.value, 'hpRatio'))) {
      setTrialCondition(draft.value, props.actorId, 'hpRatio', item.hp.preset);
    }
    if (item.stacks && !(Number(trialValue(draft.value, item.stacks.key)) > 0)) {
      setTrialFact(draft.value, { key: item.stacks.key, value: { kind: 'quantity', unit: 'count', value: item.stacks.max } }, props.actorId);
    }
  } else if (item.toggleFact && !props.hitFacts.some(setting => setting.key === item.toggleFact)) {
    setTrialFact(draft.value, { key: item.toggleFact, value: { kind: 'boolean', value: false } }, props.actorId);
  }
  changes.value.set(item.id, value);
}
function checked(item: CalculatorBuff) {
  const enabled = changes.value.get(item.id) ?? (!item.disabled && !item.triggerSkill && (!item.explicit || item.checked));
  return enabled && buffConditionsMet(item, current.value);
}
function requirementLabel(setting: CalculatorFactSetting) {
  const value = setting.value;
  const label = buffFactNames[setting.key] ?? setting.key;
  return value.kind === 'boolean' ? (value.value ? label : label + '关闭') : label + ' ' + (enumLabels[String(value.value)] ?? value.value);
}
function apply() {
  const selected = resolveBuffSelection(props.choices, draft.value, props.intervals, props.actorId, changes.value);
  emit('apply', selected, draft.value);
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
              <small v-if="item.stacks">{{ buffFactNames[item.stacks.key] ?? item.stacks.key }} {{ Number(trialValue(draft, item.stacks.key)) > 0 ? trialValue(draft, item.stacks.key) : '勾选取满层 ' + item.stacks.max }}</small>
              <small v-if="item.hp">生命比例 {{ { gt:'>', gte:'≥', lt:'<', lte:'≤', eq:'=' }[item.hp.relation] }} {{ item.hp.threshold * 100 }}%<template v-if="!hpMatches(item.hp, trialValue(current, 'hpRatio'))">，勾选取 {{ item.hp.preset * 100 }}%</template></small>
              <small v-if="item.triggerSkill">在命中时刻 {{ time }} 秒施放</small></span>
            <input type="checkbox" :aria-label="item.name + ' / ' + item.description" :checked="checked(item)"
              @change="toggle(item,($event.target as HTMLInputElement).checked)">
          </label>
          <button v-if="item.explicit && !item.triggerSkill && !item.checked && !changes.has(item.id) && damage.effectApplications?.find(entry => entry.instanceId === item.id)?.active == null"
            type="button" class="ui-action soft" data-size="sm" @click="toggle(item,false)">此命中不适用</button>
        </div>
      </div>
      <p v-else>{{ query ? '没有匹配的增益' : '当前配装与伤害没有可选增益' }}</p>
      <section><h3>触发条件</h3><div class="buff-fields">
        <label v-for="field in fields" :key="field.key">{{ field.label }}
          <select v-if="field.type.kind !== 'quantity'" :value="factInput(field.key)" @change="setFact(field.key, field.type, $event)">
            <option value="">待确认</option><template v-if="field.type.kind === 'boolean'"><option value="true">是</option><option value="false">否</option></template>
            <template v-else><option v-for="value in field.type.values" :key="value" :value="value">{{ enumLabels[value] ?? value }}</option></template>
          </select>
          <input v-else type="number" min="0" :max="field.key === 'vesna.disciplineStacks' ? 6 : undefined" :step="field.type.unit === 'count' ? 1 : 'any'"
            :value="factInput(field.key)" placeholder="待确认" @input="setFact(field.key, field.type, $event)">
        </label>
        <label>生命比例（%）<input type="number" min="0" max="100" step="any" :value="trialValue(current, 'hpRatio') == null ? '' : Number(trialValue(current, 'hpRatio')) * 100" placeholder="待确认" @input="setCondition('hpRatio',$event)"></label>
        <label v-for="key in (['onField','shielded'] as const)" :key="key">{{ key === 'onField' ? '站场' : '护盾存在' }}
          <select :value="String(trialValue(current, key) ?? '')" @change="setCondition(key,$event)"><option value="">待确认</option><option value="true">是</option><option value="false">否</option></select>
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
.buff-entry input { width:18px; height:18px; min-height:0; accent-color:var(--element-hydro-deep); }
.buff-entry button { justify-self:end; margin:0 12px 10px; }.buff-fields label { min-width:0; }
h3 { margin:0 0 8px; font-size:var(--font-control); }.buff-actions { display:flex; justify-content:flex-end; }
</style>
