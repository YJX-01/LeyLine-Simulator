<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import GameIcon from '../components/GameIcon.vue';
import { resolveEquipmentPanel } from '@leyline/engine';
import type { Build, StatKey } from '@leyline/schema';
import type { AccountCharacter, LocalAccount } from '../domain/account';
import { accountStatLabels } from '../domain/account-real';
import { calculationArtifact, resolveBuildEquipment } from '../domain/build-snapshot';
import { formatGameStat } from '../domain/account-presentation';
const props = defineProps<{ character: AccountCharacter; build?: Build; showcase: boolean; account: LocalAccount }>();
const stats = ref<Partial<Record<StatKey, number | null>>>({});
const message = ref('');
const element = computed(() => props.build?.character.identity.element ?? 'physical');
const damageStat = computed(() => `${element.value}Bonus` as const);
const columns = computed<readonly (readonly StatKey[])[]>(() => [
  ['hp', 'attack', 'defense', 'elementalMastery'],
  ['critRate', 'critDamage', 'energyRecharge', damageStat.value],
]);
const equipped = computed(() => props.showcase ? [] : Object.values(props.character.equipment).map(id => props.account.artifacts.find(item => item.id === id)));
watch([() => props.build, () => props.showcase, () => props.character.build, equipped], async ([build, showcase, savedBuild, items], _, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  message.value = '';
  if (!build) { stats.value = {}; return; }
  try {
    if (!showcase && items.some(item => !item?.real || item.mona?.setIdentityPending)) throw new Error('装备词条或套装身份待补全，暂不展示计算面板。');
    const equipment = showcase ? build : await resolveBuildEquipment(items.map(item =>
      calculationArtifact(item!.real!, item!.inventoryId === null ? undefined : props.account.id)), savedBuild ?? build);
    if (!current) return;
    const result = resolveEquipmentPanel({ ...build, ...equipment });
    stats.value = result.stats;
    message.value = result.status === 'invalid' ? result.issues.filter(issue => issue.code === 'invalid-input').map(issue => issue.message).join('；') : '';
  } catch (cause) { if (current) { stats.value = {}; message.value = cause instanceof Error ? cause.message : '面板加载失败。'; } }
}, { immediate: true });
</script>
<template>
  <section v-if="build" class="character-stats">
    <h3>{{ showcase ? '展柜快照面板' : '当前装备面板' }}</h3><p v-if="message">{{ message }}</p>
    <div class="stats-columns">
      <dl v-for="(column, index) in columns" :key="index" :data-column="index === 0 ? 'left' : 'right'">
        <template v-for="stat in column" :key="stat">
          <dt :data-stat="stat"><GameIcon v-if="stat === damageStat && element !== 'physical'" kind="elements" :id="element" :size="20" /><GameIcon v-else kind="stats" :id="stat" :size="20" /><span>{{ accountStatLabels[stat] }}</span></dt>
          <dd :data-stat-value="stat">{{ formatGameStat(stat, stats[stat]) }}</dd>
        </template>
      </dl>
    </div>
  </section>
</template>
<style scoped>
.character-stats { margin-block:20px; }h3 { font-size:var(--font-body); }.stats-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; }dl { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:0 12px; font-size:var(--font-control); margin:0; }dt { display:flex; align-items:center; gap:6px; min-width:0; padding:10px 0; border-bottom:1px solid var(--line); }dd { margin:0; padding:10px 0; border-bottom:1px solid var(--line); text-align:right; font-size:18px; font-weight:700; font-variant-numeric:tabular-nums; }p { font-size:var(--font-body); margin-bottom:12px; }@media(max-width:500px){.stats-columns { grid-template-columns:1fr; gap:10px; }}
</style>
