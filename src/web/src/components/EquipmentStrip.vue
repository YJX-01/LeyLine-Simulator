<script setup lang="ts">
import type {StatKey} from '@leyline/schema';
import type { AccountArtifact, AccountSlot } from '../domain/account';
import { accountSlotLabels } from '../domain/account';
import ArtifactSummary from '../pages/ArtifactSummary.vue';
import GameIcon from './GameIcon.vue';
defineProps<{effectiveStats?:readonly StatKey[];entries:{slot:AccountSlot;item?:AccountArtifact}[]}>();
</script>
<template>
  <div class="equipment-strip" aria-label="五部位装备摘要"><div class="equipment-strip-items" :class="{'with-leading':!!$slots.leading}">
    <div v-if="$slots.leading" class="equipment-strip-leading"><slot name="leading" /></div>
    <div v-for="entry in entries" :key="entry.slot" class="artifact-item-card" data-passive :data-rarity="entry.item?.real?.rarity" data-density="compact" :data-empty="!entry.item" :aria-label="accountSlotLabels[entry.slot]">
      <ArtifactSummary v-if="entry.item" :item="entry.item" variant="compact" :effective-stats="effectiveStats" />
      <div v-else class="equipment-strip-empty" :aria-label="`${accountSlotLabels[entry.slot]}未装备`" :title="`${accountSlotLabels[entry.slot]} · 未装备`"><GameIcon kind="artifactSlots" :id="entry.slot" :size="40" /></div>
    </div>
  </div></div>
</template>
<style scoped>
.equipment-strip { container-type:inline-size; container-name:equipment-summary; min-width:0; }
.equipment-strip-items { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); align-items:center; gap:8px; }
.equipment-strip-items.with-leading { grid-template-columns:136px repeat(5,minmax(0,1fr)); }
.equipment-strip-leading { display:flex; align-items:center; justify-content:center; gap:8px; min-width:0; }
.artifact-item-card { box-sizing:border-box; min-height:80px; }
.artifact-item-card[data-empty=true] { border-style:dashed; }
.equipment-strip-empty { display:flex; height:64px; align-items:center; justify-content:center; color:var(--muted); }
@container equipment-summary (max-width:1135px) { .equipment-strip-items.with-leading { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@container equipment-summary (max-width:991px) { .equipment-strip-items { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@container equipment-summary (max-width:591px) { .equipment-strip-items,.equipment-strip-items.with-leading { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container equipment-summary (max-width:391px) { .equipment-strip-items,.equipment-strip-items.with-leading { grid-template-columns:minmax(0,1fr); } }
</style>
