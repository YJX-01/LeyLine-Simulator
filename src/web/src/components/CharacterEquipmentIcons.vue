<script setup lang="ts">
import { computed } from 'vue';
import type { Build } from '@leyline/schema';
import GameIcon from './GameIcon.vue';
const props = withDefaults(defineProps<{ build?: Build; name?: string; size?: number }>(), { size: 80 });
const weaponSize = computed(() => Math.round(props.size * .84));
const description = computed(() => {
  const build = props.build;
  if (!build) return `${props.name ?? '角色'}，配装资料待补全`;
  const weapon = build.weapon ? `${build.weapon.name}，精炼${build.refinement}，${build.weaponLevel}级` : '未配武器';
  return `${props.name ?? build.character.identity.name}，${build.constellation}命，${build.level}级，${weapon}`;
});
</script>
<template>
  <div class="character-equipment-icons" role="img" :aria-label="description">
    <GameIcon kind="characters" :id="build?.character.id" :name="name ?? build?.character.identity.name" :size="size" :constellation="build?.constellation" :level="build?.level" />
    <GameIcon v-if="build?.weapon" kind="weapons" :id="build.weapon.id" :size="weaponSize" :refinement="build.refinement" :level="build.weaponLevel" :rarity="build.weapon.rarity" />
    <span v-else class="empty-weapon" :style="{width:`${weaponSize}px`,height:`${weaponSize}px`}"></span>
  </div>
</template>
<style scoped>
.character-equipment-icons { display:flex; flex:none; align-items:center; justify-content:flex-start; gap:12px; padding:3px 2px; width:max-content; max-width:100%; }
</style>
