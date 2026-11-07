<script setup lang="ts">
import GameIcon from './components/GameIcon.vue';
import { computed, onMounted, shallowRef } from 'vue';
import type { RealBuild } from '@leyline/schema';
import type { AccountArtifact } from './domain/account';
import { accountSlotLabels } from './domain/account';
import { useAccountStore } from './stores/account';
import { accountStatLabels } from './domain/account-real';
import { artifactMainValue, formatGameStat, loadAccountGameData } from './domain/account-presentation';
const props=defineProps<{ item: AccountArtifact; compact?: boolean; variant?: 'relaxed' | 'compact'; wearers?: {name:string;id?:string;label?:string}[] }>();
const store=useAccountStore();
const density=computed(()=>props.variant ?? (props.compact?'compact':'relaxed'));
const wearers=computed(()=>{
  if(props.wearers)return props.wearers;
  const local=store.account.characters.filter(character=>Object.values(character.equipment).includes(props.item.id)).map(character=>({name:character.name,id:character.realBuild?.character.id,label:'本地装备'}));
  return local.length?local:props.item.mona?.equippedBy?[{name:props.item.mona.equippedBy,id:undefined,label:'原始穿戴备注'}]:[];
});
const subLabel=(stat:string)=>stat==='hpPercent'?'生命值':accountStatLabels[stat as keyof typeof accountStatLabels];
const rolls=shallowRef<typeof import('./domain/artifact-rolls')>();
const counts=computed(()=>props.item.real&&rolls.value?rolls.value.upgradeCounts(props.item.real):[]);
function rollTitle(index:number) { const count=counts.value[index];return count?`${count.recorded?'接口记录':'合法档位推断'}：强化命中 ${count.min===count.max?count.min:`${count.min}–${count.max}`} 次（不含初始词条）`:'现有数值无法确认强化次数'; }
const main = shallowRef<RealBuild['artifactMain']>();
onMounted(async () => { const [data,result]=await Promise.allSettled([loadAccountGameData(),import('./domain/artifact-rolls')]);if(data.status==='fulfilled')main.value=data.value.main;if(result.status==='fulfilled')rolls.value=result.value; });
</script>
<template>
  <div class="artifact-summary" :class="density" :title="`${item.name} · ${accountSlotLabels[item.slot]}`">
    <div class="artifact-visual"><div class="artifact-art" :data-rarity="item.real?.rarity" :aria-label="`${item.name} · ${accountSlotLabels[item.slot]}`">
      <GameIcon kind="artifacts" :id="item.mona?.setIdentityPending || !item.real ? undefined : `${item.real.setId}-${item.slot}`" :size="density==='compact' ? 64 : 80" />
      <span class="artifact-level">{{ item.real?.level ?? 0 }}</span>
    </div><div v-if="wearers.length" class="artifact-wearers" :aria-label="wearers.map(entry=>`${entry.label ?? '装备'}：${entry.name}`).join('；')"><span v-for="entry in wearers.slice(0,2)" :key="entry.name" :title="`${entry.label ?? '装备'}：${entry.name}`"><GameIcon kind="characters" :id="entry.id" :name="entry.name" :size="density==='compact'?20:24" /></span><span v-if="wearers.length>2" class="wearer-more" :title="wearers.slice(2).map(entry=>entry.name).join('、')">…</span></div></div>
    <div class="artifact-values">
      <p class="summary-main"><span>{{ item.real ? accountStatLabels[item.real.mainStat] : '旧版攻击增量' }}</span><b :title="`计算表值：${artifactMainValue(item, main) ?? '—'}`">{{ item.real ? formatGameStat(item.real.mainStat, artifactMainValue(item, main),false) : Math.round(item.attack) }}</b></p>
      <dl v-if="item.real"><template v-for="(sub,index) in item.real.substats" :key="sub.stat"><dt><span class="roll-slot"><span v-if="counts[index] && counts[index]!.max>0" class="roll-count" :title="rollTitle(index)" :aria-label="rollTitle(index)">{{ counts[index]!.min===counts[index]!.max ? counts[index]!.min : `${counts[index]!.min}–${counts[index]!.max}` }}</span></span><span>{{ subLabel(sub.stat) }}</span></dt><dd :title="`保存值：${sub.value}`">{{ formatGameStat(sub.stat, sub.value) }}</dd></template></dl>
    </div>
    <p v-if="item.mona?.setIdentityPending" class="pending">套装身份待核对，暂不可用于计算。</p>
  </div>
</template>
<style scoped>
.artifact-summary { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:8px; color:var(--ink); min-width:0; font-weight:700; }
.artifact-visual { display:grid; justify-items:center; gap:5px; }.artifact-art { position:relative; width:max-content; border-radius:8px; background:var(--surface); }.artifact-art[data-rarity="5"] { background:var(--element-geo-light); }.artifact-art[data-rarity="4"] { background:var(--element-electro-light); }.artifact-art :deep(.game-icon) { background:transparent; }
.artifact-level { position:absolute; right:0; bottom:0; padding:1px 3px; border-radius:4px; background:var(--surface); color:var(--ink); font-size:9px; line-height:1.2; }
.artifact-wearers { display:flex; align-items:center; justify-content:center; gap:3px; max-width:80px; }.artifact-wearers > span { display:inline-flex; }.wearer-more { font-size:15px; line-height:1; }
.artifact-values { min-width:0; }.summary-main { display:flex; justify-content:space-between; align-items:baseline; gap:5px; margin:0 0 4px; padding:0 0 4px; border-bottom:1px solid var(--line); color:var(--element-geo-deep); font-size:14px; line-height:1.35; }.summary-main b { flex-shrink:0; font-size:17px; font-weight:750; }
dl { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 5px; margin:0; font-size:12px; line-height:19px; }dt { display:flex; align-items:center; gap:4px; min-width:0; }dd { margin:0; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }.roll-slot { display:inline-flex; align-items:center; justify-content:center; flex:none; width:18px; height:18px; }.roll-count { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 2px; box-sizing:border-box; border-radius:4px; background:var(--element-geo-light); color:var(--element-geo-deep); border:1px solid var(--element-geo-primary); font-size:10px; line-height:1; }
.pending { grid-column:1/-1; color:var(--element-geo-deep); font-size:11px; margin:0; }
.compact { gap:6px; }.compact dl { gap:1px 3px; font-size:11px; line-height:18px; }.compact .summary-main { font-size:12px; padding-bottom:3px; margin-bottom:3px; }.compact .summary-main b { font-size:15px; }.compact .roll-slot { width:16px; height:16px; }.compact .roll-count { min-width:16px; height:16px; font-size:9px; }.compact dt { gap:3px; }.compact .artifact-wearers { gap:2px; max-width:64px; }
</style>
