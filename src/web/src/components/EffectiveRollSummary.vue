<script setup lang="ts">
import { computed } from 'vue';
import type { StatKey } from '@leyline/schema';
import type { AccountArtifact } from '../domain/account';
import { effectiveRollBreakdown } from '../domain/character-loadout-name';
import type {EffectiveRollBasis} from '../domain/effective-roll-basis';
import GameIcon from './GameIcon.vue';
const props=defineProps<{ items:AccountArtifact[]; selectedStats:readonly StatKey[]; selectable?:boolean; inline?:boolean; basis?:EffectiveRollBasis }>();
const emit=defineEmits<{toggle:[stat:StatKey]}>();
const rows=computed(()=>effectiveRollBreakdown(props.items,props.basis).sort((a,b)=>props.selectable?0:Number(b.members.some(stat=>props.selectedStats.includes(stat)))-Number(a.members.some(stat=>props.selectedStats.includes(stat)))));
</script>
<template>
  <dl class="effective-roll-summary" :class="{readonly:!selectable,inline:inline && !selectable}" aria-label="各属性平均词条数"><div v-for="row in rows" :key="row.stat" :data-roll-stat="row.stat" :class="{effective:row.members.some(stat=>selectedStats.includes(stat))}"><dt><button v-if="selectable" type="button" :aria-label="`有效词条${row.label}`" :aria-pressed="row.members.some(stat=>selectedStats.includes(stat))" @click="emit('toggle',row.stat)"><GameIcon kind="stats" :id="row.icon" :size="18" />{{ row.label }}</button><template v-else><GameIcon kind="stats" :id="row.icon" :size="18" />{{ row.label }}</template></dt><dd>{{ row.value===undefined?'?':row.value.toFixed(1) }}<span v-if="!inline || selectable"> 条</span></dd></div></dl>
</template>
<style scoped>
.effective-roll-summary { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; margin:0; font-size:var(--font-body); font-weight:700; }.effective-roll-summary > div { position:relative; display:grid; justify-items:center; gap:5px; padding:8px 4px; border:1px solid var(--line); border-radius:var(--control-radius); color:var(--muted); background:var(--surface-raised); }dt button { height:var(--control-height-sm); min-height:var(--control-height-sm); display:flex; align-items:center; justify-content:center; gap:4px; padding:0; border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; }dt button::after { content:""; position:absolute; inset:0; border-radius:var(--control-radius); }dt button:focus-visible { outline:none; }dt button:focus-visible::after { outline:2px solid var(--element-hydro-deep); outline-offset:2px; }dt { display:flex; align-items:center; gap:4px; white-space:nowrap; }dd { margin:0; font-weight:700; font-variant-numeric:tabular-nums; }.effective-roll-summary > div.effective { color:var(--element-pyro-deep); border-color:var(--element-pyro-primary); background:var(--element-pyro-light); }.effective-roll-summary :deep(.stats) { color:inherit; }
.effective-roll-summary.readonly > div { border:0; border-radius:0; border-left:1px solid var(--line); background:transparent; padding:4px; }.effective-roll-summary.readonly > div:first-child { border-left:0; }.effective-roll-summary.readonly > div.effective { background:transparent; }
@media(max-width:850px) { .effective-roll-summary { grid-template-columns:repeat(4,minmax(0,1fr)); } }@media(max-width:500px) { .effective-roll-summary { grid-template-columns:repeat(2,minmax(0,1fr)); } }
.effective-roll-summary.inline.readonly { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:var(--font-body); }
.effective-roll-summary.inline.readonly > div { display:flex; align-items:center; gap:5px; padding:0; border:0; line-height:20px; }
.effective-roll-summary.inline.readonly > div.effective { color:var(--element-pyro-deep); }
.effective-roll-summary.inline.readonly :deep(.game-icon) { width:16px !important; height:16px !important; }
</style>
