<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import { healingGrant, putHitFact, talentInputIssues, talentInputMaximum, type FactSubject, type HitFacts, type Project, type ValueType } from '@leyline/schema';
import { conditionFactInputs } from '@leyline/schema/buffs';
import { buffFactNames } from '../domain/calculator-buffs';
import { bindingSubject, healingBonusFactFields } from '../domain/calculator-conditions';
const props = defineProps<{ members: Project['candidate']['actors'] }>();
const emit = defineEmits<{ apply: [actorId: string, recipientId: string, healId: string, facts: HitFacts] }>();
const selected = ref(''), recipientId = ref('');
const inputs = ref<Record<string, string | number>>({});
const percentageLimits: Record<string, number> = { hpRatio: 100, 'arlecchino.consumedBondRatio': 200,
  'clorinde.impaleBondRatio': 200, 'jahoda.coordinatorActiveHpRatio': 100 };
const choices = computed(() => props.members.flatMap(actor => actor.build?.character.talents.flatMap(talent =>
  (talent.heals ?? []).filter(heal => healingGrant(actor.build!, heal.origin).unlocked).map(heal => {
    const multiplier = typeof heal.multiplier === 'object' && healingGrant(actor.build!, heal.multiplier.origin).unlocked ? heal.multiplier : undefined;
    return { key: JSON.stringify([actor.id, heal.id]), actorId: actor.id, heal, talent,
      constellation: actor.build!.constellation, declarations: actor.build!.character.metadata.facts,
      healingBasis: multiplier && heal.stat === 'hp' && heal.basisActor !== 'recipient' ? 'hp' as const : undefined,
      fields: [...[heal.condition, heal.basisFactor, heal.basisAmount, multiplier?.condition]
        .flatMap(term => conditionFactInputs(term, actor.build!.character.metadata.facts)),
      ...(heal.recipient === 'on-field' ? [{ key: 'onField', scope: 'recipient' as const, type: { kind: 'boolean' as const } }] : [])],
      label: [actor.name ?? actor.build!.character.identity.name, healingGrant(actor.build!, heal.origin).name ?? talent.name,
        heal.label ?? talent.details[heal.detail!].label].join(' · ') };
  })) ?? []));
const choice = computed(() => choices.value.find(option => option.key === selected.value));
const fields = computed(() => {
  const option = choice.value;
  const resolved = new Map<string, { id: string; key: string; type: ValueType; subject: FactSubject; label: string; min?: number; max?: number }>();
  if (!option || !recipientId.value) return [];
  const direct = option.fields.map(field => ({ ...field, subject: bindingSubject(field.scope, option.actorId, recipientId.value),
    label: option.declarations?.[field.key]?.label, scope: field.scope as string, max: undefined }));
  const bonuses = healingBonusFactFields(props.members, option.actorId, recipientId.value, option.healingBasis).map(field => ({ ...field, scope: '' }));
  for (const { key, type, subject, label, scope, max } of [...direct, ...bonuses]) {
    if (!subject) continue;
    const id = JSON.stringify([subject, key]);
    if (resolved.has(id)) continue;
    const actorId = subject.kind === 'actor' ? subject.id : undefined;
    const actor = props.members.find(member => member.id === actorId);
    const actorLabel = scope === 'recipient' ? '受治疗队员' : actorId === option.actorId ? '施救者'
      : actorId === recipientId.value ? '受治疗队员' : actor?.name ?? actor?.build?.character.identity.name;
    const name = key === 'hpRatio' && actorLabel ? actorLabel + '生命比例' : label ?? buffFactNames[key] ?? key;
    const input = scope === 'query' ? option.talent.inputs?.find(entry => entry.id === key) : undefined;
    resolved.set(id, { id, key, type, subject, label: name, min: input?.min, max: input ? talentInputMaximum(input, option.constellation) : max });
  }
  return [...resolved.values()];
});
const countLimit = computed(() => {
  const option = choice.value, input = option?.talent.inputs?.find(i => i.id === option.heal.count?.fact);
  return option && input ? talentInputMaximum(input, option.constellation) : undefined;
});
const valid = computed(() => {
  if (!choice.value || !recipientId.value) return false;
  const key = choice.value.heal.count?.fact, n = key && inputs.value[key];
  if (n !== undefined && n !== '' && (!Number.isSafeInteger(Number(n)) || Number(n) < 0 || countLimit.value !== undefined && Number(n) > countLimit.value)) return false;
  const option = choice.value;
  return fields.value.every(field => {
    const raw = inputs.value[field.id];
    if (raw == null || raw === '' || field.type.kind !== 'quantity') return true;
    const value = Number(raw);
    if (!Number.isFinite(value)) return false;
    if (field.min !== undefined) return !talentInputIssues(option.talent, { [field.key]: value }, option.constellation).length;
    if (percentageLimits[field.key]) return value >= 0 && value <= percentageLimits[field.key];
    return field.type.unit === 'count' ? Number.isSafeInteger(value) && value >= 0 && (field.max === undefined || value <= field.max)
      : !['hp', 'stamina'].includes(field.type.unit) || value >= 0;
  });
});
watch([selected,recipientId], () => { inputs.value = {}; });
const recipients = computed(() => props.members.filter(member => member.build && choice.value &&
  (choice.value.heal.recipient !== 'self' || choice.value.actorId === member.id) && (choice.value.heal.recipient !== 'other' || choice.value.actorId !== member.id)));
watchEffect(() => {
  if (!choice.value) selected.value = choices.value[0]?.key ?? '';
  if (!recipients.value.some(member => member.id === recipientId.value)) recipientId.value = recipients.value[0]?.id ?? '';
});
function recordHeal() {
  if (!choice.value || !valid.value) return;
  const facts: HitFacts = [];
  if (choice.value.heal.count) {
    const key = choice.value.heal.count.fact, raw = inputs.value[key];
    if (raw !== undefined && raw !== '') putHitFact(facts, { kind: 'event' }, key, { kind: 'quantity', unit: 'count', value: Number(raw) });
  }
  for (const field of fields.value) {
    const raw = inputs.value[field.id];
    if (raw === undefined || raw === '') continue;
    const subject = field.subject;
    if (field.type.kind === 'boolean') putHitFact(facts, subject, field.key, raw === 'unknown' ? null : { kind: 'boolean', value: raw === 'true' });
    else if (field.type.kind === 'enum') putHitFact(facts, subject, field.key, { kind: 'enum', value: String(raw) });
    else if (field.type.kind === 'quantity') putHitFact(facts, subject, field.key,
      { kind: 'quantity', unit: field.type.unit, value: percentageLimits[field.key] ? Number(raw) / 100 : Number(raw) });
  }
  emit('apply', choice.value.actorId, recipientId.value, choice.value.heal.id, facts);
}
</script>

<template>
  <details v-if="choices.length"><summary>技能治疗</summary><div class="healing-record">
    <label>治疗来源<select v-model="selected"><option v-for="option in choices" :key="option.key" :value="option.key">{{ option.label }}</option></select></label>
    <label>本次受治疗队员<select v-model="recipientId"><option v-for="member in recipients" :key="member.id" :value="member.id">{{ member.name ?? member.build?.character.identity.name }}</option></select></label>
    <label v-if="choice?.heal.count">{{ buffFactNames[choice.heal.count.fact] ?? choice.heal.count.fact }}<input type="number" min="0" :max="countLimit" step="1" v-model="inputs[choice.heal.count.fact]" placeholder="未知"></label>
    <template v-for="field in fields" :key="field.id">
      <label v-if="percentageLimits[field.key]">{{ field.label }}（%）
        <input type="number" min="0" :max="percentageLimits[field.key]" step="any" placeholder="沿用记录" v-model="inputs[field.id]"></label>
      <label v-else-if="field.type.kind === 'boolean'">{{ field.label }}<select v-model="inputs[field.id]">
        <option :value="undefined">沿用记录</option><option value="true">是</option><option value="false">否</option><option value="unknown">未知</option></select></label>
      <label v-else-if="field.type.kind === 'enum'">{{ field.label }}<select v-model="inputs[field.id]">
        <option :value="undefined">沿用记录</option><option v-for="option in field.type.values" :key="option" :value="option">{{ option }}</option></select></label>
      <label v-else-if="field.type.kind === 'quantity'">{{ field.label }}<input type="number" :min="field.min ?? (['hp', 'stamina', 'count'].includes(field.type.unit) ? 0 : undefined)" :max="field.max" :step="field.type.unit === 'count' ? 1 : 'any'" placeholder="沿用记录" v-model="inputs[field.id]"></label>
    </template>
    <button type="button" class="ui-action" :disabled="!valid" @click="recordHeal">记录一次治疗</button>
  </div></details>
</template>

<style scoped>
summary { cursor: pointer; line-height: var(--control-height-md); }
.healing-record { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
label { display: grid; gap: 4px; max-width: 100%; }
</style>
