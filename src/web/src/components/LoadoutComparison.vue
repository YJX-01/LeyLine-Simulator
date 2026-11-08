<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RealBuild, RealStat } from '@leyline/schema';
import type { AccountArtifact, LocalAccount } from '../domain/account';
import { accountSlots, accountSlotLabels } from '../domain/account';
import { effectiveRollBreakdown, defaultEffectiveStats } from '../domain/character-loadout-name';
import { effectiveTotal } from '../domain/artifact-combinations';
import WorkbenchDialog from './WorkbenchDialog.vue';
import EffectiveReferencePicker from './EffectiveReferencePicker.vue';
import { useAccountStore } from '../stores/account';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import ArtifactSummary from '../ArtifactSummary.vue';
const props=defineProps<{sides:{title:string;items:AccountArtifact[];build?:RealBuild;account?:LocalAccount}[];stats:RealStat[];referenceName?:string}>();
const emit=defineEmits<{close:[]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore();
function chooseReference(name:string){reference.value=name;const character=account.account.characters.find(item=>item.name===name);selected.value=character?loadouts.effectiveStats(account.account.id,character.id,name):defaultEffectiveStats(name);}
const selected=ref([...props.stats]),reference=ref(props.referenceName ?? '');
const breakdown=computed(()=>props.sides.map(side=>effectiveRollBreakdown(side.items)));
const totals=computed(()=>props.sides.map(side=>effectiveTotal(side.items,selected.value)));
function slotDifference(slot:string){const left=props.sides[0]?.items.find(item=>item.slot===slot),right=props.sides[1]?.items.find(item=>item.slot===slot);return !left && !right?'均未装备':!left?'左侧未装备':!right?'右侧未装备':left.id===right.id && JSON.stringify(left.real)===JSON.stringify(right.real)?'相同装备':'装备不同';}
function difference(left:number|undefined,right:number|undefined) {if(left===undefined || right===undefined)return '?';const value=right-left;return `${value>0?'+':''}${value.toFixed(1)}`;}
</script>
<template>
  <WorkbenchDialog title="配装比较" @close="emit('close')">
    <div class="comparison-reference"><EffectiveReferencePicker :name="reference" @select="chooseReference" /><span>临时统计口径，不修改已保存的方案。</span></div>
    <div class="comparison-columns"><section v-for="(side,index) in sides" :key="index"><h3>{{ side.title }}</h3><p v-if="side.build">{{ side.build.level }}级 · {{ side.build.constellation }}命 · 天赋 {{ side.build.talents.normal }}/{{ side.build.talents.skill }}/{{ side.build.talents.burst }}</p><p v-if="side.build">{{ side.build.weapon.name }} · {{ side.build.weaponLevel }}级 · 精炼{{ side.build.refinement }}</p><strong>有效词条 {{ totals[index]?.toFixed(1) ?? '?' }}</strong></section></div>
    <table class="comparison-stats"><thead><tr><th>属性</th><th>左侧</th><th>右侧</th><th>右侧增减</th></tr></thead><tbody><tr v-for="(row,index) in breakdown[0]" :key="row.stat" :class="{effective:row.members.some(stat=>selected.includes(stat))}"><th>{{ row.label }}</th><td>{{ row.value?.toFixed(1) ?? '?' }}</td><td>{{ breakdown[1]?.[index].value?.toFixed(1) ?? '?' }}</td><td>{{ difference(row.value,breakdown[1]?.[index].value) }}</td></tr></tbody></table>
    <section v-for="slot in accountSlots" :key="slot" class="comparison-slot"><h3>{{ accountSlotLabels[slot] }}<span class="slot-difference">{{ slotDifference(slot) }}</span></h3><div class="comparison-columns"><div v-for="(side,index) in sides" :key="index"><ArtifactSummary v-if="side.items.find(item=>item.slot===slot)" :item="side.items.find(item=>item.slot===slot)!" :account="side.account" variant="relaxed" /><p v-else>未装备</p></div></div></section>
  </WorkbenchDialog>
</template>
<style scoped>
.comparison-reference { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; font-size:var(--font-body); color:var(--muted); }.comparison-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }.comparison-columns > * { min-width:0; overflow-wrap:anywhere; }.comparison-columns h3 { margin:0 0 8px; font-size:var(--font-control); }.comparison-columns p { font-size:var(--font-body); margin:8px 0; }.comparison-columns strong { font-size:var(--font-control); color:var(--element-anemo-deep); }.comparison-stats { width:100%; border-collapse:collapse; margin:20px 0; font-size:var(--font-body); font-variant-numeric:tabular-nums; }.comparison-stats th,.comparison-stats td { padding:10px 4px; border-bottom:1px solid var(--line); text-align:right; }.comparison-stats th:first-child { text-align:left; }.comparison-stats tr.effective { color:var(--element-anemo-deep); font-weight:700; }.comparison-slot { margin-top:16px; }.slot-difference { margin-left:12px; font-size:var(--font-body); font-weight:500; color:var(--muted); }.comparison-slot h3 { font-size:var(--font-control); margin:0 0 10px; }
@media(max-width:600px) { .comparison-columns { grid-template-columns:minmax(0,1fr); }.comparison-columns > *+* { border-top:1px solid var(--line); padding-top:12px; } }
</style>
