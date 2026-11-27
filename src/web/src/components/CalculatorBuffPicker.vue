<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CombatConditions, DamageRequest, FactSubject, Value } from '@leyline/schema';
import { buffConditionsMet, buffDisplayName, calculatorBuffChecked, enableCalculatorBuff, resolveBuffSelection, type CalculatorBuff } from '../domain/calculator-buffs';
import { calculatorFactPreset, hpMatches, setCalculatorFact, calculatorFactValue, withCurrentConditions, type CalculatorFactSetting, type CalculatorFactField } from '../domain/calculator-conditions';
import CalculatorChoiceCard from './CalculatorChoiceCard.vue';
import GameIcon from './GameIcon.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';

const props = defineProps<{ choices: CalculatorBuff[]; damage: DamageRequest; actorId: string; intervals: CombatConditions;
  fields: (CalculatorFactField & { label: string })[]; hitFacts: CalculatorFactSetting[]; mainPageFactKeys: Set<string> }>();
const emit = defineEmits<{
  apply: [changes: Map<string, boolean>, damage: DamageRequest];
  close: [];
}>();
const changes = ref(new Map<string, boolean>());
const draft = ref<DamageRequest>(JSON.parse(JSON.stringify(props.damage)));
const current = computed(() => withCurrentConditions(draft.value, props.intervals, props.actorId));
const query = ref('');
const visible = computed(() => {
  const term = query.value.trim().toLowerCase();
  // Use applied state so checking an item never moves it away from its inputs.
  return props.choices.filter(item => [buffDisplayName(item), item.code, item.intro, item.description, item.note, item.source].some(text => text?.toLowerCase().includes(term)))
    .sort((a, b) => Number(b.checked) - Number(a.checked) || Number(!!b.relevant) - Number(!!a.relevant));
});
const enumLabels: Record<string, string> = { none: '无', left: '左手', right: '右手', 'stellar-conduct': '星超导', 'stellar-swirl': '星扩散',
  burning: '燃烧', burgeon: '烈绽放', other: '其他',
  'world-or-room': '大世界或普通室内', domain: '秘境', 'trounce-domain': '征讨领域', 'spiral-abyss': '深境螺旋', 'other-scene': '其他场景',
  'other-movement': '其他移动状态', gliding: '滑翔', 'underwater-sprint': '水下冲刺' };
const factMaximums: Record<string, number> = { 'vesna.disciplineStacks': 6, 'world.timeMinutes': 1439 };
type Field = typeof props.fields[number];
const fieldId = (field: { key: string; subject?: FactSubject }) => JSON.stringify([field.subject, field.key]);
const isMainPageField = (field: Field) => Boolean(props.mainPageFactKeys.has(field.key)
  && (field.subject?.kind === 'event' || (field.subject?.kind === 'actor' && field.subject.id === props.actorId)));
const cardFields = computed(() => {
  const assigned = new Set<string>();
  const groups = new Map<string, Field[]>();
  const eligible = props.fields.filter(field => !isMainPageField(field));
  for (const item of props.choices) {
    const keys = new Set(item.fields.map(fieldId));
    groups.set(item.id, eligible.filter(field => keys.has(fieldId(field))));
    for (const key of keys) assigned.add(key);
  }
  groups.set('', eligible.filter(field => !assigned.has(fieldId(field))));
  return groups;
});
const cards = computed(() => [
  ...visible.value.map(item => ({ id: item.id, item, fields: cardFields.value.get(item.id) ?? [] })),
  ...(!query.value.trim() && cardFields.value.get('')?.length ? [{ id: '', item: undefined, fields: cardFields.value.get('')! }] : []),
]);
function fieldValue(field: Field) {
  const local = calculatorFactValue(current.value, field.key, props.actorId, field.subject);
  const owner = field.subject?.kind === 'actor' ? field.subject.id : undefined;
  const derived = owner && props.choices.find(choice => choice.ownerId === owner && choice.derivedFacts?.[field.key])?.derivedFacts?.[field.key]?.value;
  const value = local ?? field.inherited?.value ?? (derived ? derived.value : calculatorFactPreset(field, props.actorId).value);
  return field.key === 'hpRatio' ? Number(value) * 100 : value;
}
function setField(field: Field, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const type = field.type;
  const value: Value = raw === '' ? calculatorFactPreset(field, props.actorId)
    : type.kind === 'quantity' ? { ...type, value: Number(raw) / (field.key === 'hpRatio' ? 100 : 1) }
    : type.kind === 'boolean' ? { kind: 'boolean', value: raw === 'true' } : { kind: 'enum', value: raw };
  setCalculatorFact(draft.value, { ...field, value }, props.actorId);
  if (raw === '') (event.target as HTMLInputElement).value = String(fieldValue(field));
  for (const choice of props.choices) {
    if (!choice.fields.some(entry => fieldId(entry) === fieldId(field))) continue;
    const met = buffConditionsMet(choice, current.value);
    const isToggle = choice.toggleFact === field.key
      && JSON.stringify(choice.toggleSubject ?? { kind: 'actor', id: choice.ownerId }) === JSON.stringify(field.subject ?? { kind: 'actor', id: choice.ownerId });
    if (isToggle && !choice.triggerSkill && !choice.confirmTrigger && !choice.disabled && (!choice.explicit || !met && (changes.value.get(choice.id) ?? choice.checked))) {
      changes.value.set(choice.id, met);
    } else if (!met && changes.value.get(choice.id) === true) {
      changes.value.delete(choice.id);
    } else if (met && !choice.explicit && !choice.triggerSkill && !choice.confirmTrigger && !choice.disabled && !choice.checked && !changes.value.has(choice.id)) {
      changes.value.set(choice.id, true);
    }
  }
}
function toggle(item: CalculatorBuff, value: boolean) {
  if (value) {
    enableCalculatorBuff(item, draft.value, props.intervals, props.actorId);
  } else if (item.toggleFact) {
    const targetSubject = item.toggleSubject ?? { kind: 'actor', id: item.ownerId };
    const blockedByHit = props.hitFacts.some(setting => setting.key === item.toggleFact
      && JSON.stringify(setting.subject ?? { kind: 'actor', id: props.actorId }) === JSON.stringify(targetSubject));
    if (!blockedByHit) {
      setCalculatorFact(draft.value, { key: item.toggleFact, subject: item.toggleSubject, value: { kind: 'boolean', value: false } }, item.ownerId);
    }
  }
  changes.value.set(item.id, value);
}
function checked(item: CalculatorBuff) {
  return calculatorBuffChecked(item, current.value, changes.value.get(item.id));
}
function apply() {
  const selected = resolveBuffSelection(props.choices, draft.value, props.intervals, props.actorId, changes.value);
  emit('apply', selected, draft.value);
}
</script>
<template>
  <WorkbenchDialog title="选择增益" center-title sticky-footer @close="emit('close')">
    <div class="buff-picker">
      <LibraryToolbar v-model="query" search-only label="搜索增益" placeholder="搜索增益名称、别名或来源…" />
      <div v-if="cards.length" class="buff-options">
        <div v-for="{ id, item, fields: inputs } in cards" :key="id" class="buff-entry" data-card-action="select" :class="{ chosen: item && checked(item) }">
          <label v-if="item" class="card-action-trigger">
            <CalculatorChoiceCard :name="item.name" :alias="item.alias" :code="item.code" :source="item.source"
              :note="[item.intro, item.note].filter(Boolean).join(' ')" :value="item.description">
              <template #icon><GameIcon :kind="item.icon.kind" :id="item.icon.id" :monochrome="item.icon.kind === 'constellations'" :size="42"><template #fallback><GameIcon kind="stats" id="elementalMastery" :size="32" /></template></GameIcon></template>
              <small v-if="item.stacks && !checked(item)">勾选取满层 {{ item.stacks.max }}</small>
              <small v-if="item.hp">生命比例 {{ { gt:'>', gte:'≥', lt:'<', lte:'≤', eq:'=' }[item.hp.relation] }} {{ item.hp.threshold * 100 }}%<template v-if="!hpMatches(item.hp, calculatorFactValue(current, 'hpRatio', item.ownerId))">，勾选取 {{ item.hp.preset * 100 }}%</template></small>
            </CalculatorChoiceCard>
            <input type="checkbox" :aria-label="[item.source, buffDisplayName(item), item.description, item.note].filter(Boolean).join(' / ')" :checked="checked(item)"
              @change="toggle(item,($event.target as HTMLInputElement).checked)">
          </label>
          <h3 v-else>本击条件</h3>
          <div v-if="inputs.length" class="buff-fields">
            <label v-for="field in inputs" :key="fieldId(field)">{{ field.label }}
              <select v-if="field.type.kind !== 'quantity'" :value="String(fieldValue(field))" @change="setField(field, $event)">
                <template v-if="field.type.kind === 'boolean'"><option value="true">是</option><option value="false">否</option></template>
                <template v-else><option v-for="value in field.type.values" :key="value" :value="value">{{ enumLabels[value] ?? value }}</option></template>
              </select>
              <input v-else type="number" min="0" :max="field.key === 'hpRatio' ? 100 : item?.stacks?.key === field.key ? item.stacks.max : factMaximums[field.key]"
                :step="field.type.unit === 'count' ? 1 : 'any'" :value="fieldValue(field)" @input="($event.target as HTMLInputElement).value && setField(field, $event)" @change="setField(field, $event)">
            </label>
          </div>
        </div>
      </div>
      <p v-else>{{ query ? '没有匹配的增益' : '当前配装与伤害没有可选增益' }}</p>

    </div>
    <template #footer><div class="buff-actions"><button type="button" class="ui-action" data-accent="anemo" @click="apply">应用增益</button></div></template>
  </WorkbenchDialog>
</template>
<style scoped>
.buff-picker { display:grid; gap:16px; }
.buff-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,310px),1fr)); align-items:start; gap:12px; }
.buff-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr)); gap:10px; border-top:1px solid var(--line); padding:10px 12px 12px; }
.buff-fields label { display:grid; align-content:start; gap:4px; }
.buff-fields :is(input, select) { width:100%; min-width:0; }
.buff-entry { display:grid; align-content:start; min-width:0; font-size:16px; background:var(--surface-raised); }
.buff-entry.chosen { background:var(--element-hydro-light); }
.buff-entry .card-action-trigger { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; gap:10px; padding:12px; cursor:pointer; line-height:1.45; overflow-wrap:anywhere; }
.buff-entry small { display:block; font-size:var(--font-body); color:var(--muted); line-height:1.5; font-weight:400; }
.buff-entry input[type=checkbox] { width:18px; height:18px; min-height:0; accent-color:var(--element-hydro-deep); }
.buff-fields label { min-width:0; }
h3 { margin:12px; font-size:var(--font-control); }.buff-actions { display:flex; justify-content:flex-end; }
</style>
