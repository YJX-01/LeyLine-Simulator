<script setup lang="ts">
import { computed } from 'vue';
import type { RealStat } from '@leyline/schema';
import { accountStatLabels } from '../domain/account-real';
import GameIcon from './GameIcon.vue';
const props = withDefaults(defineProps<{ stat: RealStat; iconOnly?: boolean; size?: number }>(), { size:16 });
const label = computed(() => accountStatLabels[props.stat].replace(/%$/, ''));
const description = computed(() => `${label.value}${props.stat.endsWith('Percent') ? '（百分比）' : ['hp', 'attack', 'defense'].includes(props.stat) ? '（固定值）' : ''}`);
const element = computed(() => ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'].find(element => props.stat === `${element}Bonus`));
const icon = computed(() => ({ hp:'flatHp', attack:'flatAttack', defense:'flatDefense' }[props.stat as string] ?? props.stat));
</script>
<template>
  <span class="stat-label" :data-stat="stat" :title="description" :aria-label="description"><GameIcon v-if="iconOnly" :kind="element ? 'elements' : 'stats'" :id="element ?? icon" :size="size" /><span v-else>{{ label }}</span></span>
</template>
<style scoped>
.stat-label { display:inline-flex; flex:none; align-items:center; vertical-align:middle; line-height:1; }
.stat-label :deep(.stats) { color:inherit; }
</style>
