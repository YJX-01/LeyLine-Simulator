<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId, watch } from 'vue';
import { damageGroupNames, hitSearchText, type CalculatorHitChoice } from '../domain/calculator-hits';
import { damageFamilyLabel, sceneHitLabel } from '../domain/workbench-labels';
import { singleContributorLunarElements, type SingleContributorReaction } from '../domain/real-project';
import { calculatorDamageGroups, definitionKey, type ProjectReaction, transformativeFamilies, type CharacterMetadata, type CalculatorDamageGroup, type CalculationBundle, type SceneDefinition } from '@leyline/schema';
import { getReactionCalculationBundle } from '@leyline/game-data';
import CalculatorDamageCard from './CalculatorDamageCard.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';

const props = defineProps<{ choices: CalculatorHitChoice[]; selected?: CalculatorHitChoice; scenes: SceneDefinition[];
  groupSettings?: NonNullable<CharacterMetadata['calculator']>['groups']; selectedScene?: string; swirlElement?: ProjectReaction['element']; selectedReaction?: string; reactionRules?: CalculationBundle }>();
const emit = defineEmits<{ select: [choice: CalculatorHitChoice]; reaction: [family: SingleContributorReaction];
  scene: [definition: SceneDefinition]; close: [] }>();
const query = ref('');
const term = computed(() => query.value.trim().toLowerCase());
const panelId = useId();
type Group = CalculatorDamageGroup | 'common' | 'lunar-reaction' | 'stellar-reaction';
const lunarFamilies = Object.keys(singleContributorLunarElements) as (keyof typeof singleContributorLunarElements)[];
const groupNames = { ...damageGroupNames, 'lunar-reaction': '月曜反应', 'stellar-reaction': '星烁反应' };
const browsing = ref(new Map<Group, boolean>());
const searching = ref(new Map<Group, boolean>());
watch(term, () => searching.value.clear());
const defaultRules = shallowRef<CalculationBundle>();
onMounted(async () => {
  if (!props.reactionRules) defaultRules.value = await getReactionCalculationBundle();
});
const scenes = computed(() => props.scenes.filter(scene => (sceneHitLabel(scene) + ' 场景 ' + scene.hits?.[0]?.trigger)
  .toLowerCase().includes(term.value)));
const reactions = computed(() => transformativeFamilies.filter(family =>
  ('剧变反应 ' + damageFamilyLabel(family) + ' ' + family).toLowerCase().includes(term.value)));
const lunarReactions = computed(() => lunarFamilies.filter(family =>
  ('月曜反应 ' + damageFamilyLabel(family) + ' ' + family).toLowerCase().includes(term.value)));
const groups = computed(() => {
  const configured = props.groupSettings ?? [];
  const order: Group[] = ['common', ...new Set([...configured.map(group => group.type), ...calculatorDamageGroups])];
  order.splice(order.indexOf('reaction') + 1, 0, 'lunar-reaction', 'stellar-reaction');
  const hits = new Map<Group, CalculatorHitChoice[]>();
  for (const choice of props.choices) {
    if (term.value && !hitSearchText(choice).includes(term.value)) continue;
    const group = choice.common ? 'common' : choice.group;
    const rows = hits.get(group) ?? [];
    rows.push(choice);
    hits.set(group, rows);
  }
  const visible = order.map(id => {
    const rows = hits.get(id) ?? [];
    const familyChoices: SingleContributorReaction[] = id === 'reaction' ? reactions.value : id === 'lunar-reaction' ? lunarReactions.value
      : id === 'stellar-reaction' && '星烁反应 星扩散 stellar-swirl'.includes(term.value) ? ['stellar-swirl'] : [];
    const count = id === 'scene' ? scenes.value.length : rows.length + familyChoices.length;
    return { id, rows, count, familyChoices };
  }).filter(group => group.count);
  const firstType = visible.find(group => group.id !== 'common')?.id;
  return visible.map(group => {
    const initial = group.id === 'common' || (configured.length ? configured.some(g => g.type === group.id && g.expanded) : group.id === firstType);
    const expanded = term.value ? (searching.value.get(group.id) ?? true) : (browsing.value.get(group.id) ?? initial);
    return { ...group, expanded };
  });
});
function toggle(group: Group, expanded: boolean) {
  (term.value ? searching.value : browsing.value).set(group, !expanded);
}
</script>
<template>
  <WorkbenchDialog title="选择伤害" center-title @close="emit('close')">
    <div class="damage-picker">
      <LibraryToolbar v-model="query" label="搜索伤害" placeholder="搜索编号、伤害名称或别名…" search-only />
      <section v-for="group in groups" :key="group.id" :aria-label="groupNames[group.id]">
        <h3><button class="group-toggle" type="button" :aria-expanded="group.expanded" :aria-controls="panelId + '-' + group.id"
          @click="toggle(group.id, group.expanded)">
          <span class="chevron" aria-hidden="true"></span>
          <span v-if="group.id === 'common'" class="pin" aria-hidden="true">★</span>
          {{ groupNames[group.id] }} <span class="count">{{ group.count }}</span>
        </button></h3>
        <div v-show="group.expanded" :id="panelId + '-' + group.id" class="hit-options">
          <button v-for="row in group.rows" :key="definitionKey(row.ref.definition) + '/' + row.hitId" type="button" data-card-action="select" :disabled="!row.available"
            :data-hit-id="row.hitId" :data-skill-id="row.skillId" :aria-pressed="row.available && selected === row" @click="emit('select',row)">
            <CalculatorDamageCard :hit="row" />
          </button>
          <button v-for="family in group.familyChoices" :key="family" type="button" data-card-action="select" :data-reaction="family"
            :aria-pressed="selectedReaction === family" @click="emit('reaction', family)">
            <CalculatorDamageCard :family="family" :element="swirlElement" :rules="reactionRules ?? defaultRules" :single-contributor="true" />
          </button>
          <template v-if="group.id === 'scene'">
            <button v-for="scene in scenes" :key="definitionKey(scene)" type="button" data-card-action="select" :data-scene-hit="scene.id"
              :aria-pressed="selectedScene === definitionKey(scene)" @click="emit('scene', scene)">
              <CalculatorDamageCard :scene="scene" />
            </button>
          </template>
        </div>
      </section>
      <p v-if="!groups.length" class="empty">没有符合条件的伤害</p>
    </div>
  </WorkbenchDialog>
</template>
<style scoped>
.damage-picker { display:grid; gap:10px; }
h3 { margin:0; }
.group-toggle { width:100%; display:flex; justify-content:flex-start; align-items:center; gap:9px; padding:8px 4px; min-height:42px; border:0; background:transparent; color:var(--ink); font-size:18px; font-weight:650; text-align:left; }
.chevron { display:inline-block; width:8px; height:8px; border:solid currentColor; border-width:0 2px 2px 0; transform:rotate(-45deg); margin:0 4px; }
[aria-expanded=true] .chevron { transform:rotate(45deg); }
.count { color:var(--muted); font-size:15px; font-variant-numeric:tabular-nums; }
.pin { color:var(--element-anemo-deep); }
.hit-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:10px; padding:4px 0 10px; }
.hit-options button { display:grid; align-content:stretch; text-align:left; height:auto; min-width:0; padding:12px; background:var(--surface-raised); color:var(--ink); }
.hit-options button[aria-pressed=true] { background:var(--element-hydro-light); }
.empty { color:var(--muted); }
</style>
