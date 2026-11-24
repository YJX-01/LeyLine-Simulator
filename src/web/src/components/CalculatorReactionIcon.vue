<script setup lang="ts">
import { computed } from 'vue';
import type { ProjectReaction } from '@leyline/schema';
import GameIcon from './GameIcon.vue';

const props = defineProps<{ family: ProjectReaction['family']; element?: ProjectReaction['element'] }>();
// The badge depicts the ingredients of the reaction. Its damage can use a different element.
const elements = computed(() => {
  const absorbed = props.element && ['pyro', 'hydro', 'electro', 'cryo'].includes(props.element) ? props.element : 'pyro';
  return {
    burning: ['dendro', 'pyro'], superconduct: ['cryo', 'electro'], swirl: ['anemo', absorbed],
    'electro-charged': ['hydro', 'electro'], shatter: ['cryo', 'physical'], overloaded: ['pyro', 'electro'],
    bloom: ['hydro', 'dendro'], burgeon: ['hydro', 'dendro', 'pyro'], hyperbloom: ['hydro', 'dendro', 'electro'],
    'lunar-charged': ['hydro', 'electro'], 'lunar-crystallize': ['hydro', 'geo'], 'stellar-swirl': ['anemo', 'cryo'],
  }[props.family];
});
</script>
<template>
  <span class="reaction-icon" :class="{ triple: elements.length === 3 }" aria-hidden="true">
    <span v-for="element in elements" :key="element" class="seal" :data-element="element"
      :style="{ color: 'var(--element-' + element + '-deep, var(--ink))', backgroundColor: 'var(--element-' + element + '-light, var(--neutral-canvas))' }">
      <GameIcon :kind="element === 'physical' ? 'stats' : 'elements'" :id="element === 'physical' ? 'physicalDamage' : element"
        :size="elements.length === 3 ? 19 : 22" monochrome />
    </span>
  </span>
</template>
<style scoped>
.reaction-icon { display:block; width:46px; height:46px; position:relative; }
.seal { position:absolute; display:grid; place-items:center; width:29px; height:29px; border-radius:50%; outline:1.5px solid var(--surface-raised); }
.seal:first-child { left:0; top:1px; }
.seal:nth-child(2) { right:0; bottom:1px; }
.seal :deep(.game-icon) { color:inherit; }
.triple .seal { width:25px; height:25px; }
.triple .seal:first-child { left:0; top:2px; }
.triple .seal:nth-child(2) { right:0; top:2px; }
.triple .seal:last-child { left:11px; bottom:0; }
</style>
