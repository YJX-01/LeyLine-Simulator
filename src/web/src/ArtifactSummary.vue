<script setup lang="ts">
import GameIcon from './components/GameIcon.vue';
import { onMounted, shallowRef } from 'vue';
import type { RealBuild } from '@leyline/schema';
import type { AccountArtifact } from './domain/account';
import { accountSlotLabels } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { artifactMainValue, formatAccountStat, loadAccountGameData } from './domain/account-presentation';
defineProps<{ item: AccountArtifact; compact?: boolean }>();
const main = shallowRef<RealBuild['artifactMain']>();
onMounted(async () => { try { main.value = (await loadAccountGameData()).main; } catch { /* The parent displays catalog loading errors. */ } });
</script>
<template>
  <div class="artifact-summary" :class="{ compact }">
    <div class="summary-top"><GameIcon kind="artifacts" :id="item.mona?.setIdentityPending || !item.real ? undefined : `${item.real.setId}-${item.slot}`" :size="compact ? 68 : 100" /><div class="summary-head"><small v-if="item.real?.rarity === 5" class="rarity">★★★★★</small><strong>{{ item.name }}</strong><span>{{ accountSlotLabels[item.slot] }} · +{{ item.real?.level ?? 0 }}</span></div></div>
    <p class="summary-main"><span>{{ item.real ? accountStatLabels[item.real.mainStat] : '旧版攻击增量' }}</span><b>{{ item.real ? formatAccountStat(item.real.mainStat, artifactMainValue(item, main)) : item.attack }}</b></p>
    <dl v-if="item.real"><template v-for="sub in item.real.substats" :key="sub.stat"><dt>{{ accountStatLabels[sub.stat] }}</dt><dd>{{ formatAccountStat(sub.stat, sub.value) }}</dd></template></dl>
    <p v-if="item.mona?.setIdentityPending" class="pending">套装身份待核对，暂不可用于计算。</p>
  </div>
</template>
<style scoped>
.artifact-summary { color:var(--ink,#283449); min-width:0; }.summary-head { display:grid; gap:6px; }.summary-head strong { font-size:14px; overflow-wrap:anywhere; }.summary-head > span { font-size:12px; color:var(--muted,#66736c); }.summary-main { display:flex; justify-content:space-between; gap:12px; padding:12px 0; margin:8px 0; border-block:1px solid var(--line,#ddd7c7); font-size:13px; } dl { display:grid; grid-template-columns:1fr auto; gap:8px; font-size:13px; margin:12px 0; } dd { margin:0; } .pending { color:#91662f; font-size:12px; }.compact .summary-head strong { font-size:12px; }.compact dl { font-size:12px; gap:5px; }.compact .summary-main { font-size:12px; padding:8px 0; }
.summary-top { display:flex; align-items:center; gap:12px; min-height:76px; }.summary-head { flex:1; }.summary-head strong { font-weight:600; line-height:1.5; }.compact .summary-top { gap:8px; }.compact .summary-head strong { font-size:13px; }.compact .summary-head > span { font-size:11px; }
@media(max-width:600px) { .compact .summary-top { flex-direction:column; align-items:flex-start; gap:8px; }.compact .summary-head strong { font-size:12px; } }
.rarity { color:#bb9658; font-size:10px; letter-spacing:2px; line-height:1; }
</style>
