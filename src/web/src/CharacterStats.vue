<script setup lang="ts">
import { ref, watch } from 'vue';
import { resolveRealBuild } from '@leyline/engine';
import { getRealSet } from '@leyline/game-data/real';
import type { AccountCharacter } from './domain/account';
import { useAccountStore } from './stores/account';
import { accountStatLabels } from './domain/account-real';
import { formatAccountStat } from './domain/account-presentation';
import type { RealStat } from '@leyline/schema';
const props = defineProps<{ character: AccountCharacter }>();
const store = useAccountStore();
const stats = ref<Partial<Record<RealStat, number>>>({});
const message = ref('');
let revision = 0;
watch(() => JSON.stringify({ character: props.character, artifacts: store.account.artifacts.filter(item => Object.values(props.character.equipment).includes(item.id)) }), async () => {
  const current = ++revision;
  stats.value = {}; message.value = '';
  if (!props.character.realBuild) return;
  try {
    const items = Object.values(props.character.equipment).map(id => store.account.artifacts.find(item => item.id === id));
    if (items.some(item => !item?.real || item.mona?.setIdentityPending)) throw new Error('装备词条或套装身份待补全，暂不展示计算面板。');
    const artifacts = items.map(item => item!.real!);
    const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => getRealSet(id)));
    if (revision !== current) return;
    const result = resolveRealBuild({ ...props.character.realBuild, artifacts, sets });
    stats.value = result.status === 'invalid' ? {} : result.stats;
    message.value = result.status === 'complete' ? '' : '部分机制尚未支持；此处仅供核对静态面板，计算支持范围以队伍检查为准。';
  } catch (cause) { if (revision === current) message.value = cause instanceof Error ? cause.message : '面板加载失败。'; }
}, { immediate: true });
</script>
<template><section v-if="character.realBuild" class="character-stats"><h3>当前装备面板</h3><p v-if="message">{{ message }}</p><dl><template v-for="stat in (['hp','attack','defense','elementalMastery','critRate','critDamage','energyRecharge'] as const)" :key="stat"><dt>{{ accountStatLabels[stat] }}</dt><dd>{{ formatAccountStat(stat,stats[stat]) }}</dd></template></dl></section></template>
<style scoped>.character-stats { margin-block:20px; }h3 { font-size:14px; }dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr) auto); gap:10px 20px; font-size:13px; }dd { margin:0; }p { font-size:12px; }@media(max-width:500px){dl { grid-template-columns:1fr auto; }}</style>
