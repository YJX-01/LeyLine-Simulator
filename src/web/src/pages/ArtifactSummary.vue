<script setup lang="ts">
import GameIcon from '../components/GameIcon.vue';
import ArtifactPortrait from '../components/ArtifactPortrait.vue';
import {useArtifactFavoritesStore} from '../stores/artifact-favorites';
import StatLabel from '../components/StatLabel.vue';
import { computed, onMounted, shallowRef } from 'vue';
import type { Build, StatKey } from '@leyline/schema';
import type { AccountArtifact, LocalAccount } from '../domain/account';
import { accountSlotLabels } from '../domain/account';
import { useAccountStore } from '../stores/account';
import { artifactMainValue, formatGameStat, loadAccountGameData } from '../domain/account-presentation';
const props=defineProps<{ item: AccountArtifact; account?: LocalAccount; compact?: boolean; variant?: 'relaxed' | 'compact'; effectiveStats?:readonly StatKey[]; wearers?: {name:string;id?:string;label?:string}[] }>();
const store=useAccountStore(),favorites=useArtifactFavoritesStore();
const favorite=computed(()=>favorites.level((props.account ?? store.account).id,props.item.id));
const effective=computed(()=>props.effectiveStats ?? []);
const density=computed(()=>props.variant ?? (props.compact?'compact':'relaxed'));
const wearers=computed(()=>{
  if(props.wearers)return props.wearers;
  const local=(props.account ?? store.account).characters.filter(character=>Object.values(character.equipment).includes(props.item.id)).map(character=>({name:character.name,id:character.build?.character.id,label:'本地装备'}));
  return local.length?local:props.item.mona?.equippedBy?[{name:props.item.mona.equippedBy,id:undefined,label:'原始穿戴备注'}]:[];
});

const rolls=shallowRef<typeof import('../domain/artifact-rolls')>();
const counts=computed(()=>props.item.real&&rolls.value?rolls.value.preferredUpgradeCounts(props.item.real):[]);
function rollTitle(index:number) { const count=counts.value[index];return count?`${props.item.rollSource==='manual'?'手动选择的合法次数':props.item.rollSource==='inferred'?'已保存的合法推定':count.recorded?'展柜记录':'合法组合推定（歧义取较小值）'}：强化命中 ${count.min} 次（不含初始词条）`:'当前数值无法匹配合法强化组合'; }
const main = shallowRef<Build['artifactMain']>();
onMounted(async () => { const [data,result]=await Promise.allSettled([loadAccountGameData(),import('../domain/artifact-rolls')]);if(data.status==='fulfilled')main.value=data.value.main;if(result.status==='fulfilled')rolls.value=result.value; });
</script>
<template>
  <div class="artifact-summary" :class="density" :title="`${item.alias ?? item.name} · ${accountSlotLabels[item.slot]}`">
    <div class="artifact-visual"><ArtifactPortrait :item="item" :size="density==='compact'?64:undefined" main :favorite="favorite" :transparent-badges="density==='compact'"><div v-if="density==='relaxed' && wearers.length && item.inventoryId!==null" class="artifact-wearers" :aria-label="wearers.map(entry=>`${entry.label ?? '装备'}：${entry.name}`).join('；')"><span v-for="entry in wearers.slice(0,2)" :key="entry.name" :title="`${entry.label ?? '装备'}：${entry.name}`"><GameIcon kind="characters" :id="entry.id" :name="entry.name" :size="20" /></span><span v-if="wearers.length>2" class="wearer-more" :title="wearers.slice(2).map(entry=>entry.name).join('、')">…</span></div></ArtifactPortrait></div>
    <div v-if="density==='relaxed'" class="artifact-values">
      <p class="summary-main"><StatLabel v-if="item.real" :stat="item.real.mainStat" short /><span v-else>旧版攻击增量</span><b :title="`计算表值：${artifactMainValue(item, main) ?? '—'}`">{{ item.real ? formatGameStat(item.real.mainStat, artifactMainValue(item, main),false) : Math.round(item.attack) }}</b></p>
      <dl v-if="item.real"><template v-for="(sub,index) in item.real.substats" :key="sub.stat"><dt :class="{'effective-substat':effective.includes(sub.stat)}"><span class="roll-slot"><span v-if="counts[index] && counts[index]!.min>0" class="roll-count" :title="rollTitle(index)" :aria-label="rollTitle(index)">{{ counts[index]!.min }}</span><span v-else-if="rolls && !counts[index]" class="roll-unknown" :title="rollTitle(index)">?</span></span><StatLabel :stat="sub.stat" /></dt><dd :class="{'effective-substat':effective.includes(sub.stat)}" :title="`保存值：${sub.value}`">{{ formatGameStat(sub.stat, sub.value) }}</dd></template></dl>
    </div>
    <div v-else-if="item.real" class="compact-substats"><span v-for="sub in item.real.substats" :key="sub.stat" class="compact-entry" :class="{'effective-substat':effective.includes(sub.stat)}"><StatLabel :stat="sub.stat" /><span aria-hidden="true">+</span><b :title="`保存值：${sub.value}`">{{ formatGameStat(sub.stat,sub.value) }}</b></span></div>
    <span v-else class="pending">旧资料待补全</span>
    <p v-if="item.mona?.setIdentityPending" class="pending">套装身份待核对，暂不可用于计算。</p>
  </div>
</template>
<style scoped>
.artifact-summary { display:grid; grid-template-columns:max-content max-content; justify-content:start; align-items:center; gap:10px; color:var(--ink); min-width:0; font-weight:700; }
.artifact-visual { display:grid; justify-items:center; gap:3px; }
.artifact-wearers { position:absolute; left:2px; bottom:2px; display:flex; align-items:center; justify-content:center; gap:2px; max-width:76px; }.artifact-wearers > span { display:inline-flex; border-radius:4px; background:var(--artifact-background); }.wearer-more { font-size:var(--font-control); line-height:1; }
.artifact-values { min-width:0; justify-self:start; width:max-content; max-width:100%; }.summary-main { display:flex; justify-content:space-between; align-items:baseline; gap:8px; box-sizing:border-box; height:24px; margin:0; padding:0; border-bottom:1px solid var(--line); color:var(--element-geo-deep); font-size:var(--font-body); line-height:1.35; }.summary-main b { flex-shrink:0; font-size:var(--font-control); font-weight:750; }
dl { display:grid; grid-template-columns:max-content max-content; column-gap:12px; row-gap:0; grid-auto-rows:22px; margin:0; font-size:var(--font-body); line-height:22px; }dt { display:flex; align-items:center; gap:3px; min-width:0; }dd { margin:0; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }.roll-slot { display:inline-flex; align-items:center; justify-content:center; flex:none; width:20px; height:20px; }.roll-count { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 2px; box-sizing:border-box; border-radius:4px; background:var(--element-geo-light); color:var(--element-geo-deep); border:1px solid var(--element-geo-primary); font-size:var(--font-body); line-height:1; white-space:nowrap; }.roll-unknown { color:var(--muted); font-size:var(--font-body); }
.pending { grid-column:1/-1; color:var(--element-geo-deep); font-size:var(--font-body); margin:0; }
.compact { align-items:center; gap:8px; }
.compact-substats { display:grid; grid-template-rows:repeat(4,16px); grid-auto-flow:row; font-size:var(--font-body); line-height:16px; }.compact-entry { display:flex; align-items:center; gap:0; white-space:nowrap; font-variant-numeric:tabular-nums; }.compact-entry b { font:inherit; }

dt.effective-substat,dd.effective-substat,.compact-entry.effective-substat { color:var(--element-pyro-deep); }.effective-substat .roll-count { color:var(--element-pyro-deep); background:var(--element-pyro-light); border-color:var(--element-pyro-primary); }
</style>
