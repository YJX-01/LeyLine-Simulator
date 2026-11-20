<script setup lang="ts">
import type { StatKey } from '@leyline/schema';
import type { AccountArtifact, AccountSlot, LocalAccount } from '../domain/account';
import { accountSlotLabels } from '../domain/account';
import CardReplaceMark from './CardReplaceMark.vue';
import ArtifactSummary from '../pages/ArtifactSummary.vue';
import GameIcon from './GameIcon.vue';
withDefaults(defineProps<{ density?:'relaxed'|'compact'; entries:{slot:AccountSlot;item?:AccountArtifact}[]; account?:LocalAccount; effectiveStats?:readonly StatKey[]; readonly?:boolean; contextMenu?:boolean; busy?:boolean; wearers?:{name:string;id?:string;label?:string}[] }>(),{density:'compact'});
const emit=defineEmits<{ change:[slot:AccountSlot]; inspect:[slot:AccountSlot]; menu:[slot:AccountSlot,event:MouseEvent|KeyboardEvent] }>();
function keyboard(event:KeyboardEvent,slot:AccountSlot,enabled?:boolean){if(enabled && (event.key==='ContextMenu' || event.shiftKey && event.key==='F10')){event.preventDefault();emit('menu',slot,event);}}
</script>
<template>
  <div class="equipment-grid" :class="{compact:density==='compact'}"><div class="equipment-list"><article v-for="entry in entries" :key="entry.slot" class="artifact-item-card" :data-card-action="entry.item ? 'detail' : 'select'" :data-rarity="entry.item?.real?.rarity" :data-density="density" :data-empty="!entry.item" @contextmenu="contextMenu && entry.item && ($event.preventDefault(),emit('menu',entry.slot,$event))" @keydown="keyboard($event,entry.slot,contextMenu && !!entry.item)">
    <template v-if="entry.item">
      <button type="button" class="card-detail-target" :disabled="busy" :aria-label="`查看${accountSlotLabels[entry.slot]}详情`" @click="emit('inspect',entry.slot)"></button>
      <ArtifactSummary :item="entry.item" :variant="density" :account="account" :wearers="wearers" :effective-stats="effectiveStats">
        <template v-if="!readonly" #portrait-action>
          <button type="button" class="card-replace-target" :aria-label="`替换${accountSlotLabels[entry.slot]}`" :title="`替换${accountSlotLabels[entry.slot]}`" :disabled="busy" @click="emit('change',entry.slot)"><CardReplaceMark v-if="!busy" /></button>
        </template>
      </ArtifactSummary>
    </template>
    <button v-else class="empty-artifact card-action-trigger" :aria-label="`装备${accountSlotLabels[entry.slot]}`" :title="`${accountSlotLabels[entry.slot]} · 未装备`" :disabled="readonly || busy" @click="emit('change',entry.slot)"><GameIcon kind="artifactSlots" :id="entry.slot" :size="density==='compact'?40:48" /></button>
  </article></div></div>
</template>
<style scoped>
.equipment-grid { container-type:inline-size; container-name:equipment; min-width:0; width:100%; }
.equipment-list { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; max-width:864px; margin-inline:auto; }.equipment-list article { grid-column:span 2; position:relative; min-height:132px; box-sizing:border-box; }.equipment-list article:nth-child(4) { grid-column:2/span 2; }.equipment-list article:nth-child(5) { grid-column:4/span 2; }
.artifact-item-card[data-empty=true] { border-style:dashed; }.empty-artifact { display:flex; align-items:center; justify-content:center; width:100%; min-height:112px; height:112px; padding:0; border:0; background:transparent; color:var(--muted); }.empty-artifact:disabled { opacity:.6; }
@container equipment (max-width:863px) { .equipment-list { grid-template-columns:repeat(2,minmax(0,1fr)); max-width:572px; }.equipment-list article,.equipment-list article:nth-child(4),.equipment-list article:nth-child(5) { grid-column:auto; } }
@container equipment (max-width:571px) { .equipment-list { grid-template-columns:minmax(0,1fr); max-width:280px; } }
.equipment-grid.compact > .equipment-list { grid-template-columns:repeat(5,minmax(0,1fr)); max-width:none; gap:8px; }
.equipment-grid.compact > .equipment-list > article { grid-column:auto; min-height:80px; }
.equipment-grid.compact .empty-artifact { height:64px; min-height:64px; }
@container equipment (max-width:991px) { .equipment-grid.compact > .equipment-list { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@container equipment (max-width:591px) { .equipment-grid.compact > .equipment-list { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container equipment (max-width:391px) { .equipment-grid.compact > .equipment-list { grid-template-columns:minmax(0,1fr); } }
</style>
