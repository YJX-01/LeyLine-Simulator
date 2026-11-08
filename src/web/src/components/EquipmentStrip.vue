<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import type { AccountArtifact, AccountSlot } from '../domain/account';
import { accountSlotLabels } from '../domain/account';
import { artifactMainValue, formatGameStat, loadAccountGameData } from '../domain/account-presentation';
import GameIcon from './GameIcon.vue';
import CornerBadge from './CornerBadge.vue';
import StatLabel from './StatLabel.vue';
defineProps<{entries:{slot:AccountSlot;item?:AccountArtifact}[]}>();
const data=shallowRef<Awaited<ReturnType<typeof loadAccountGameData>>>();
onMounted(async()=>{try { data.value=await loadAccountGameData(); } catch { /* Keep unknown values explicit. */ } });
</script>
<template>
  <div class="equipment-strip" aria-label="五部位装备摘要">
    <div v-for="entry in entries" :key="entry.slot" :aria-label="accountSlotLabels[entry.slot]" :title="accountSlotLabels[entry.slot]">
      <div class="equipment-strip-icon"><GameIcon :kind="entry.item?'artifacts':'artifactSlots'" :id="entry.item?.real?`${entry.item.real.setId}-${entry.slot}`:entry.slot" :size="48" /><CornerBadge v-if="entry.item" small>{{ entry.item.real?.level ?? '?' }}</CornerBadge></div>
      <span v-if="entry.item?.real" class="equipment-strip-stat"><StatLabel :stat="entry.item.real.mainStat" icon-only /><b>{{ data?formatGameStat(entry.item.real.mainStat,artifactMainValue(entry.item,data.main),false):'—' }}</b></span>
      <span v-else class="equipment-strip-empty">未装备</span>
    </div>
  </div>
</template>
<style scoped>
.equipment-strip { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; min-width:0; font-size:var(--font-body); }.equipment-strip > div { display:flex; flex-direction:column; align-items:center; gap:8px; min-width:0; padding:8px 0; }.equipment-strip-icon { position:relative; width:48px; height:48px; }.equipment-strip-icon .corner-badge { position:absolute; right:0; bottom:0; }.equipment-strip-stat { display:flex; align-items:center; gap:4px; font-variant-numeric:tabular-nums; white-space:nowrap; }.equipment-strip-empty { color:var(--muted); }
@media(max-width:600px) { .equipment-strip { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; } }
</style>
