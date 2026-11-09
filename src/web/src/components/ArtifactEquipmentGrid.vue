<script setup lang="ts">
import type { RealStat } from '@leyline/schema';
import type { AccountArtifact, AccountSlot, LocalAccount } from '../domain/account';
import { accountSlotLabels } from '../domain/account';
import ArtifactSummary from '../ArtifactSummary.vue';
import GameIcon from './GameIcon.vue';
withDefaults(defineProps<{ density?:'relaxed'|'compact'; entries:{slot:AccountSlot;item?:AccountArtifact}[]; account?:LocalAccount; effectiveStats?:readonly RealStat[]; readonly?:boolean; popup?:boolean; contextMenu?:boolean; inspectPrimary?:boolean; busy?:boolean; wearers?:{name:string;id?:string;label?:string}[] }>(),{density:'relaxed'});
const emit=defineEmits<{ change:[slot:AccountSlot]; remove:[slot:AccountSlot]; inspect:[slot:AccountSlot]; menu:[slot:AccountSlot,event:MouseEvent|KeyboardEvent] }>();
function keyboard(event:KeyboardEvent,slot:AccountSlot,enabled?:boolean){if(enabled && (event.key==='ContextMenu' || event.shiftKey && event.key==='F10')){event.preventDefault();emit('menu',slot,event);}}
</script>
<template>
  <div class="equipment-grid" :class="{compact:density==='compact'}"><div class="equipment-list"><article v-for="entry in entries" :key="entry.slot" class="artifact-item-card" :data-rarity="entry.item?.real?.rarity" :data-density="density" :data-empty="!entry.item" @contextmenu="contextMenu && entry.item && ($event.preventDefault(),emit('menu',entry.slot,$event))" @keydown="keyboard($event,entry.slot,contextMenu && !!entry.item)">
    <ArtifactSummary v-if="entry.item" :item="entry.item" :variant="density" :account="account" :wearers="wearers" :effective-stats="effectiveStats" />
    <button v-else class="empty-artifact" :aria-label="`装备${accountSlotLabels[entry.slot]}`" :title="`${accountSlotLabels[entry.slot]} · 未装备`" :disabled="readonly || busy" @click="emit('change',entry.slot)"><GameIcon kind="artifactSlots" :id="entry.slot" :size="density==='compact'?40:48" /></button>
    <button v-if="(popup && !readonly || contextMenu) && entry.item" class="equipment-open" :disabled="busy" :aria-label="`管理${accountSlotLabels[entry.slot]}`" @click="readonly || inspectPrimary?emit('inspect',entry.slot):emit('change',entry.slot)"></button>
    <div v-if="!popup && !readonly && entry.item" class="equipment-actions"><button class="equipment-change" :disabled="busy" :aria-label="`更换${accountSlotLabels[entry.slot]}`" @click="emit('change',entry.slot)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15l-4-4M20 17H5l4 4" /></svg></button><button class="equipment-remove" :disabled="busy" :aria-label="`卸下${accountSlotLabels[entry.slot]}`" @click="emit('remove',entry.slot)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
  </article></div></div>
</template>
<style scoped>
.equipment-grid { container-type:inline-size; container-name:equipment; min-width:0; width:100%; }
.equipment-list { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; max-width:864px; margin-inline:auto; }.equipment-list article { grid-column:span 2; position:relative; min-height:132px; box-sizing:border-box; }.equipment-list article:nth-child(4) { grid-column:2/span 2; }.equipment-list article:nth-child(5) { grid-column:4/span 2; }
.artifact-item-card[data-empty=true] { border-style:dashed; }.empty-artifact { display:flex; align-items:center; justify-content:center; width:100%; min-height:112px; height:112px; padding:0; border:0; background:transparent; color:var(--muted); }.empty-artifact:disabled { opacity:.6; }
.equipment-actions { position:absolute; inset:0; pointer-events:none; }.equipment-actions button { position:absolute; display:flex; align-items:center; justify-content:center; top:-9px; width:var(--control-height-sm); height:var(--control-height-sm); min-height:var(--control-height-sm); padding:0; border:0; border-radius:5px; color:white; pointer-events:auto; line-height:1; }.equipment-change { left:-7px; background:var(--element-hydro-deep); }.equipment-remove { right:-7px; background:var(--element-pyro-deep); }.equipment-actions svg { display:block; flex:none; width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.8; }
@container equipment (max-width:863px) { .equipment-list { grid-template-columns:repeat(2,minmax(0,1fr)); max-width:572px; }.equipment-list article,.equipment-list article:nth-child(4),.equipment-list article:nth-child(5) { grid-column:auto; } }
@container equipment (max-width:571px) { .equipment-list { grid-template-columns:minmax(0,1fr); max-width:280px; } }
.equipment-open { position:absolute; inset:0; width:100%; height:100%; padding:0; border:0; border-radius:inherit; background:transparent; cursor:pointer; }.equipment-open:hover { outline:none; }.equipment-open:focus-visible { outline:2px solid var(--element-anemo-primary); outline-offset:2px; }
.equipment-grid.compact > .equipment-list { grid-template-columns:repeat(5,minmax(0,1fr)); max-width:none; gap:8px; }
.equipment-grid.compact > .equipment-list > article { grid-column:auto; min-height:80px; }
.equipment-grid.compact .empty-artifact { height:64px; min-height:64px; }
@container equipment (max-width:991px) { .equipment-grid.compact > .equipment-list { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@container equipment (max-width:591px) { .equipment-grid.compact > .equipment-list { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container equipment (max-width:391px) { .equipment-grid.compact > .equipment-list { grid-template-columns:minmax(0,1fr); } }
</style>
