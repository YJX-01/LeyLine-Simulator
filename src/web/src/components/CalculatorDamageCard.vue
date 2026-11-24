<script setup lang="ts">
import { computed } from 'vue';
import { isTransformative, type CalculationBundle, type ProjectReaction, type SceneDefinition } from '@leyline/schema';
import type { CalculatorHitChoice } from '../domain/calculator-hits';
import { damageFamilyLabel, sceneHitLabel } from '../domain/workbench-labels';
import CalculatorChoiceCard from './CalculatorChoiceCard.vue';
import CalculatorReactionIcon from './CalculatorReactionIcon.vue';
import GameIcon from './GameIcon.vue';

const props = defineProps<{ hit?: CalculatorHitChoice; scene?: SceneDefinition; family?: ProjectReaction['family'];
  element?: ProjectReaction['element']; rules?: CalculationBundle; coefficient?: number | null }>();
const reactionRate = computed(() => {
  if (props.coefficient != null) return props.coefficient;
  const base = props.rules?.attributes.find(attr => attr.identity.id === 'attribute.reaction.' + props.family + '.coefficient')?.base;
  return base?.kind === 'constant' && base.value.kind === 'quantity' ? base.value.value : undefined;
});
</script>
<template>
  <CalculatorChoiceCard v-if="hit" :code="hit.code" :source="hit.source" :name="hit.name" :alias="hit.alias" :note="hit.note"
    :value="hit.scaling ?? '倍率随命中条件计算'">
    <template #icon><GameIcon :kind="hit.iconKind ?? 'skills'" :id="hit.icon" :size="42" :title="hit.skillName">
      <template #fallback><GameIcon kind="stats" id="attack" :size="32" /></template>
    </GameIcon></template>
  </CalculatorChoiceCard>
  <CalculatorChoiceCard v-else-if="family" :name="damageFamilyLabel(family)" :source="isTransformative(family) ? '剧变反应' : '反应伤害'"
    :value="reactionRate != null ? '等级系数 × ' + reactionRate : undefined">
    <template #icon><CalculatorReactionIcon :family="family" :element="element" /></template>
  </CalculatorChoiceCard>
  <CalculatorChoiceCard v-else-if="scene" :name="sceneHitLabel(scene)" source="场景冲击" :note="scene.hits?.[0]?.trigger"
    :value="scene.hits?.[0] ? '等级系数 × ' + scene.hits[0].multiplier : undefined">
    <template #icon><GameIcon kind="buffs" id="crystal-link-crashdamage" :size="40" monochrome>
      <template #fallback><GameIcon kind="stats" id="attack" :size="32" /></template>
    </GameIcon></template>
  </CalculatorChoiceCard>
</template>
