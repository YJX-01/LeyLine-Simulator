<script setup lang="ts">
import GameIcon from './components/GameIcon.vue';
import CornerBadge from './components/CornerBadge.vue';
import StatLabel from './components/StatLabel.vue';
import { computed, onMounted, shallowRef } from 'vue';
import type { RealBuild, RealStat } from '@leyline/schema';
import type { AccountArtifact, LocalAccount } from './domain/account';
import { accountSlotLabels } from './domain/account';
import { useAccountStore } from './stores/account';
import { artifactMainValue, formatGameStat, loadAccountGameData } from './domain/account-presentation';
const props=defineProps<{ item: AccountArtifact; account?: LocalAccount; compact?: boolean; variant?: 'relaxed' | 'compact'; effectiveStats?:readonly RealStat[]; wearers?: {name:string;id?:string;label?:string}[] }>();
const store=useAccountStore();
const effective=computed(()=>props.effectiveStats ?? []);
const density=computed(()=>props.variant ?? (props.compact?'compact':'relaxed'));
const wearers=computed(()=>{
  if(props.wearers)return props.wearers;
  const local=(props.account ?? store.account).characters.filter(character=>Object.values(character.equipment).includes(props.item.id)).map(character=>({name:character.name,id:character.realBuild?.character.id,label:'本地装备'}));
  return local.length?local:props.item.mona?.equippedBy?[{name:props.item.mona.equippedBy,id:undefined,label:'原始穿戴备注'}]:[];
});

const rolls=shallowRef<typeof import('./domain/artifact-rolls')>();
const counts=computed(()=>props.item.real&&rolls.value?rolls.value.preferredUpgradeCounts(props.item.real):[]);
function rollTitle(index:number) { const count=counts.value[index];return count?`${count.recorded?'接口记录':'合法组合推定（歧义取较大值）'}：强化命中 ${count.min} 次（不含初始词条）`:'当前数值无法匹配合法强化组合'; }
function averageCount(index:number) {
  const sub=props.item.real?.substats[index];
  const value=sub&&props.item.real&&rolls.value?rolls.value.averageRollCount(sub.stat,sub.value,props.item.real.rarity):undefined;
  return value===undefined?'?':value.toFixed(1);
}
function averageTitle(index:number) { return `平均词条数 ${averageCount(index)}：当前值 ÷ 该稀有度四档单次值的算术平均，包含初始词条，不表示强化次数`; }
const main = shallowRef<RealBuild['artifactMain']>();
onMounted(async () => { const [data,result]=await Promise.allSettled([loadAccountGameData(),import('./domain/artifact-rolls')]);if(data.status==='fulfilled')main.value=data.value.main;if(result.status==='fulfilled')rolls.value=result.value; });
</script>
<template>
  <div class="artifact-summary" :class="density" :title="`${item.name} · ${accountSlotLabels[item.slot]}`">
    <div class="artifact-visual"><div class="artifact-art" :data-rarity="item.real?.rarity" :aria-label="`${item.name} · ${accountSlotLabels[item.slot]}`">
      <GameIcon kind="artifacts" :id="item.mona?.setIdentityPending || !item.real ? undefined : `${item.real.setId}-${item.slot}`" :size="density==='compact'?48:112" />
      <StatLabel v-if="item.real" class="compact-main" :stat="item.real.mainStat" icon-only :size="20" />
      <CornerBadge class="artifact-level" >{{ item.real?.level ?? 0 }}</CornerBadge>
    <div v-if="density==='relaxed' && wearers.length" class="artifact-wearers" :aria-label="wearers.map(entry=>`${entry.label ?? '装备'}：${entry.name}`).join('；')"><span v-for="entry in wearers.slice(0,2)" :key="entry.name" :title="`${entry.label ?? '装备'}：${entry.name}`"><GameIcon kind="characters" :id="entry.id" :name="entry.name" :size="20" /></span><span v-if="wearers.length>2" class="wearer-more" :title="wearers.slice(2).map(entry=>entry.name).join('、')">…</span></div></div></div>
    <div v-if="density==='relaxed'" class="artifact-values">
      <p class="summary-main"><StatLabel v-if="item.real" :stat="item.real.mainStat" short /><span v-else>旧版攻击增量</span><b :title="`计算表值：${artifactMainValue(item, main) ?? '—'}`">{{ item.real ? formatGameStat(item.real.mainStat, artifactMainValue(item, main),false) : Math.round(item.attack) }}</b></p>
      <dl v-if="item.real"><template v-for="(sub,index) in item.real.substats" :key="sub.stat"><dt :class="{'effective-substat':effective.includes(sub.stat)}"><span class="roll-slot"><span v-if="counts[index] && counts[index]!.min>0" class="roll-count" :title="rollTitle(index)" :aria-label="rollTitle(index)">{{ counts[index]!.min }}</span><span v-else-if="rolls && !counts[index]" class="roll-unknown" :title="rollTitle(index)">?</span></span><StatLabel :stat="sub.stat" /></dt><dd :class="{'effective-substat':effective.includes(sub.stat)}" :title="`保存值：${sub.value}`">{{ formatGameStat(sub.stat, sub.value) }}</dd></template></dl>
    </div>
    <div v-else-if="item.real" class="compact-substats"><span v-for="(sub,index) in item.real.substats" :key="sub.stat" class="compact-entry" :class="{'effective-substat':effective.includes(sub.stat)}" :title="averageTitle(index)"><StatLabel :stat="sub.stat" icon-only :size="18" /><b class="average-count" :aria-label="averageTitle(index)">{{ averageCount(index) }}</b></span></div>
    <span v-else class="pending">旧资料待补全</span>
    <p v-if="item.mona?.setIdentityPending" class="pending">套装身份待核对，暂不可用于计算。</p>
  </div>
</template>
<style scoped>
.artifact-summary { display:grid; grid-template-columns:max-content max-content; justify-content:center; align-items:center; gap:10px; color:var(--ink); min-width:0; font-weight:700; }
.artifact-visual { display:grid; justify-items:center; gap:3px; }.artifact-art { position:relative; width:max-content; border-radius:8px; --artifact-background:var(--surface); background:var(--artifact-background); }.artifact-art[data-rarity="5"] { --artifact-background:var(--element-geo-light); }.artifact-art[data-rarity="4"] { --artifact-background:var(--element-electro-light); }.artifact-art :deep(.game-icon) { background:transparent; }
.artifact-level { position:absolute; right:0; bottom:0; background:var(--artifact-background); }
.artifact-wearers { position:absolute; left:2px; bottom:2px; display:flex; align-items:center; justify-content:center; gap:2px; max-width:76px; }.artifact-wearers > span { display:inline-flex; border-radius:4px; background:var(--artifact-background); }.wearer-more { font-size:var(--font-control); line-height:1; }
.artifact-values { min-width:0; justify-self:start; width:max-content; max-width:100%; }.summary-main { display:flex; justify-content:space-between; align-items:baseline; gap:8px; box-sizing:border-box; height:24px; margin:0; padding:0; border-bottom:1px solid var(--line); color:var(--element-geo-deep); font-size:var(--font-body); line-height:1.35; }.summary-main b { flex-shrink:0; font-size:var(--font-control); font-weight:750; }
dl { display:grid; grid-template-columns:max-content max-content; column-gap:12px; row-gap:0; grid-auto-rows:22px; margin:0; font-size:var(--font-body); line-height:22px; }dt { display:flex; align-items:center; gap:3px; min-width:0; }dd { margin:0; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }.roll-slot { display:inline-flex; align-items:center; justify-content:center; flex:none; width:20px; height:20px; }.roll-count { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 2px; box-sizing:border-box; border-radius:4px; background:var(--element-geo-light); color:var(--element-geo-deep); border:1px solid var(--element-geo-primary); font-size:var(--font-body); line-height:1; white-space:nowrap; }.roll-unknown { color:var(--muted); font-size:var(--font-body); }
.pending { grid-column:1/-1; color:var(--element-geo-deep); font-size:var(--font-body); margin:0; }
.compact { align-items:center; gap:8px; }.compact-main { position:absolute; left:0; top:0; display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:20px; height:20px; padding:0; border-radius:4px; color:var(--element-geo-deep); background:var(--artifact-background); }
.compact-substats { display:grid; grid-template-columns:repeat(2,max-content); gap:6px 8px; }.compact-entry { display:inline-flex; align-items:center; gap:2px; }.average-count { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; min-width:30px; height:24px; padding:0 2px; border:1px solid var(--element-geo-primary); border-radius:4px; color:var(--element-geo-deep); background:var(--element-geo-light); font-size:var(--font-body); line-height:1; font-variant-numeric:tabular-nums; }

dt.effective-substat,dd.effective-substat { color:var(--element-pyro-deep); }.effective-substat .roll-count { color:var(--element-pyro-deep); background:var(--element-pyro-light); border-color:var(--element-pyro-primary); }.effective-substat .average-count { color:var(--element-pyro-deep); }
</style>
