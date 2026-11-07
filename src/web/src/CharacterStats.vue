<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import GameIcon from './components/GameIcon.vue';
import { resolveRealBuild } from '@leyline/engine';
import { getRealSet } from '@leyline/game-data/real';
import type { AccountCharacter } from './domain/account';
import { useAccountStore } from './stores/account';
import { accountStatLabels } from './domain/account-real';
import { formatGameStat } from './domain/account-presentation';
import type { RealStat } from '@leyline/schema';
const props = defineProps<{ character: AccountCharacter; showcase?: boolean }>();
const store = useAccountStore();
const stats = ref<Partial<Record<RealStat, number>>>({});
const message = ref('');
const selectedBuild = computed(() => props.showcase ? props.character.showcase?.build : props.character.realBuild);
const element = computed(() => selectedBuild.value?.character.element ?? 'physical');
const damageStat = computed<RealStat>(() => `${element.value}Bonus` as RealStat);
const columns = computed<readonly (readonly RealStat[])[]>(() => [
  ['hp', 'attack', 'defense', 'elementalMastery'],
  ['critRate', 'critDamage', 'energyRecharge', damageStat.value],
]);
let revision = 0;
watch(() => JSON.stringify({ character: props.character, showcase:props.showcase, artifacts: store.account.artifacts.filter(item => Object.values(props.character.equipment).includes(item.id)) }), async () => {
  const current = ++revision;
  stats.value = {}; message.value = '';
  const build = props.showcase ? props.character.showcase?.build : props.character.realBuild;
  if (!build) return;
  try {
    const items = Object.values(props.character.equipment).map(id => store.account.artifacts.find(item => item.id === id));
    if (!props.showcase && items.some(item => !item?.real || item.mona?.setIdentityPending)) throw new Error('装备词条或套装身份待补全，暂不展示计算面板。');
    const artifacts = props.showcase ? build.artifacts : items.map(item => item!.real!);
    const sets = props.showcase ? build.sets : await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => getRealSet(id)));
    if (revision !== current) return;
    const result = resolveRealBuild({ ...build, artifacts, sets });
    stats.value = result.status === 'invalid' ? {} : result.stats;
    message.value = result.status === 'invalid' ? result.issues.filter(issue => issue.code === 'invalid-input').map(issue => issue.message).join('；') : '';
  } catch (cause) { if (revision === current) message.value = cause instanceof Error ? cause.message : '面板加载失败。'; }
}, { immediate: true });
</script>
<template>
  <section v-if="character.realBuild" class="character-stats">
    <h3>{{ showcase ? '展柜快照面板' : '当前装备面板' }}</h3><p v-if="message">{{ message }}</p>
    <div class="stats-columns"><dl v-for="(column, index) in columns" :key="index" :data-column="index === 0 ? 'left' : 'right'"><template v-for="stat in column" :key="stat"><dt :data-stat="stat"><GameIcon v-if="stat === damageStat && element !== 'physical'" kind="elements" :id="element" :size="20" /><GameIcon v-else kind="stats" :id="stat" :size="20" /><span>{{ accountStatLabels[stat] }}</span></dt><dd :data-stat-value="stat">{{ formatGameStat(stat, stats[stat]) }}</dd></template></dl></div>
  </section>
</template>
<style scoped>
.character-stats { margin-block:20px; }h3 { font-size:14px; }.stats-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; }dl { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:0 12px; font-size:16px; margin:0; }dt { display:flex; align-items:center; gap:6px; min-width:0; padding:10px 0; border-bottom:1px solid var(--line); }dd { margin:0; padding:10px 0; border-bottom:1px solid var(--line); text-align:right; font-size:18px; font-weight:700; font-variant-numeric:tabular-nums; }p { font-size:12px; margin-bottom:12px; }@media(max-width:500px){.stats-columns { grid-template-columns:1fr; gap:10px; }}
</style>
