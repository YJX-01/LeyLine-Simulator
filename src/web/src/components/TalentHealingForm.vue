<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import { putHitFact, talentInputMaximum, type HitFacts, type Project } from '@leyline/schema';
import { conditionFactInputs } from '@leyline/schema/buffs';
import { buffFactNames } from '../domain/calculator-buffs';
const props = defineProps<{ members: Project['candidate']['actors'] }>();
const emit = defineEmits<{ apply: [actorId: string, recipientId: string, healId: string, facts: HitFacts] }>();
const selected = ref(''), recipientId = ref('');
const inputs = ref<Record<string, string | number>>({});
const choices = computed(() => props.members.flatMap(actor => actor.build?.character.talents.flatMap(talent =>
  (talent.heals ?? []).map(heal => ({ key: JSON.stringify([actor.id, heal.id]), actorId: actor.id, heal, talent,
    constellation: actor.build!.constellation, fields: conditionFactInputs(heal.condition, actor.build!.character.metadata.facts),
    label: [actor.name ?? actor.build!.character.identity.name, talent.name, talent.details[heal.detail].label].join(' · ') }))) ?? []));
const choice = computed(() => choices.value.find(option => option.key === selected.value));
const fields = computed(() => (choice.value?.fields ?? []).filter(f => ['owner','recipient'].includes(f.scope))
  .map(f => ({ ...f, id: f.scope + '/' + f.key })));
const countLimit = computed(() => {
  const option = choice.value, input = option?.talent.inputs?.find(i => i.id === option.heal.count?.fact);
  return option && input ? talentInputMaximum(input, option.constellation) : undefined;
});
const valid = computed(() => {
  if (!choice.value || !recipientId.value) return false;
  const key = choice.value.heal.count?.fact, n = key && inputs.value[key];
  if (n !== undefined && n !== '' && (!Number.isSafeInteger(Number(n)) || Number(n) < 0 || countLimit.value !== undefined && Number(n) > countLimit.value)) return false;
  return fields.value.every(f => f.key !== 'hpRatio' || inputs.value[f.id] == null || inputs.value[f.id] === ''
    || Number(inputs.value[f.id]) >= 0 && Number(inputs.value[f.id]) <= 100);
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
    const subject = { kind: 'actor' as const, id: field.scope === 'owner' ? choice.value.actorId : recipientId.value };
    if (field.type.kind === 'boolean') putHitFact(facts, subject, field.key, raw === 'unknown' ? null : { kind: 'boolean', value: raw === 'true' });
    if (field.key === 'hpRatio') putHitFact(facts, subject, field.key, { kind: 'quantity', unit: 'scalar', value: Number(raw) / 100 });
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
      <label v-if="field.key === 'hpRatio'">{{ field.scope === 'owner' ? '施救者' : '受治疗队员' }}生命比例（%）
        <input type="number" min="0" max="100" step="any" placeholder="沿用记录" v-model="inputs[field.id]"></label>
      <label v-else-if="field.type.kind === 'boolean'">{{ buffFactNames[field.key] ?? field.key }}<select v-model="inputs[field.id]">
        <option :value="undefined">沿用记录</option><option value="true">是</option><option value="false">否</option><option value="unknown">未知</option></select></label>
    </template>
    <button type="button" class="ui-action" :disabled="!valid" @click="recordHeal">记录一次治疗</button>
  </div></details>
</template>

<style scoped>
summary { cursor: pointer; line-height: var(--control-height-md); }
.healing-record { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
label { display: grid; gap: 4px; max-width: 100%; }
</style>
