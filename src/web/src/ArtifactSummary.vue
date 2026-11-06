<script setup lang="ts">
import GameIcon from './components/GameIcon.vue';
import { computed, onMounted, shallowRef } from 'vue';
import type { RealBuild } from '@leyline/schema';
import type { AccountArtifact } from './domain/account';
import { accountSlotLabels } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { artifactMainValue, formatGameStat, loadAccountGameData } from './domain/account-presentation';
const props=defineProps<{ item: AccountArtifact; compact?: boolean }>();
const rolls=shallowRef<typeof import('./domain/artifact-rolls')>();
const counts=computed(()=>props.item.real&&rolls.value?rolls.value.upgradeCounts(props.item.real):[]);
function rollTitle(index:number) { const count=counts.value[index];return count?`${count.recorded?'接口记录':'合法档位推断'}：强化命中 ${count.min===count.max?count.min:`${count.min}–${count.max}`} 次（不含初始词条）`:'现有数值无法确认强化次数'; }
const main = shallowRef<RealBuild['artifactMain']>();
onMounted(async () => { const [data,result]=await Promise.allSettled([loadAccountGameData(),import('./domain/artifact-rolls')]);if(data.status==='fulfilled')main.value=data.value.main;if(result.status==='fulfilled')rolls.value=result.value; });
</script>
<template>
  <div class="artifact-summary" :class="{ compact }" :title="`${item.name} · ${accountSlotLabels[item.slot]}`">
    <div class="artifact-art" :data-rarity="item.real?.rarity" :aria-label="`${item.name} · ${accountSlotLabels[item.slot]}`">
      <GameIcon kind="artifacts" :id="item.mona?.setIdentityPending || !item.real ? undefined : `${item.real.setId}-${item.slot}`" :size="compact ? 80 : 88" />
      <span class="artifact-level">{{ item.real?.level ?? 0 }}</span>
    </div>
    <div class="artifact-values">
      <p class="summary-main"><span>{{ item.real ? accountStatLabels[item.real.mainStat] : '旧版攻击增量' }}</span><b :title="`计算表值：${artifactMainValue(item, main) ?? '—'}`">{{ item.real ? formatGameStat(item.real.mainStat, artifactMainValue(item, main)) : Math.round(item.attack) }}</b></p>
      <dl v-if="item.real"><template v-for="(sub,index) in item.real.substats" :key="sub.stat"><dt>{{ accountStatLabels[sub.stat] }}</dt><dd><span :title="`保存值：${sub.value}`">{{ formatGameStat(sub.stat, sub.value) }}</span><span class="roll-count" :title="rollTitle(index)" :aria-label="rollTitle(index)">{{ counts[index] ? counts[index]!.min===counts[index]!.max ? counts[index]!.min : `${counts[index]!.min}–${counts[index]!.max}` : '?' }}</span></dd></template></dl>
    </div>
    <p v-if="item.mona?.setIdentityPending" class="pending">套装身份待核对，暂不可用于计算。</p>
  </div>
</template>
<style scoped>
.artifact-summary { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:10px; color:var(--ink); min-width:0; }
.artifact-art { position:relative; width:max-content; margin-top:2px; border-radius:10px; background:var(--surface); }.artifact-art[data-rarity="5"] { background:var(--element-geo-light); }.artifact-art[data-rarity="4"] { background:var(--element-electro-light); }.artifact-art :deep(.game-icon) { background:transparent; }
.artifact-level { position:absolute; right:0; bottom:0; padding:1px 4px; border:0; border-radius:5px; background:var(--surface); color:var(--ink); font-size:9px; font-weight:500; line-height:1.2; }
.artifact-values { min-width:0; }.summary-main { display:flex; justify-content:space-between; align-items:baseline; gap:6px; margin:0 0 6px; padding:0 0 5px; font-weight:600; border-bottom:1px solid var(--line); font-size:12px; }.summary-main b { flex-shrink:0; font-size:15px; }
dl { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:5px 8px; margin:0; font-size:12px; line-height:1.4; }dt { color:var(--muted); }dd { display:flex; align-items:center; justify-content:flex-end; gap:5px; margin:0; font-variant-numeric:tabular-nums; }.pending { grid-column:1/-1; color:var(--element-geo-deep); font-size:11px; margin:0; }
.roll-count { display:inline-flex; flex:none; justify-content:center; align-items:center; width:18px; height:18px; border-radius:50%; background:var(--neutral-canvas); color:var(--muted); font-size:9px; border:1px solid var(--line); }
.compact { gap:8px; }.compact dl { font-size:11px; gap:4px 6px; }.compact .summary-main { font-size:11px; margin-bottom:6px; }.compact .summary-main b { font-size:14px; }
</style>
