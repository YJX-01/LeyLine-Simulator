<script setup lang="ts">
import type { CombatChange, Project } from '@leyline/schema';
import { buffFactNames } from '../domain/calculator-buffs';
import { healName, realElementLabel } from '../domain/workbench-labels';
const props = defineProps<{ changes?: CombatChange[]; team: Project['candidate']['actors'] }>();
const member = (id: string) => props.team.find(m => m.id === id);
const format = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
function name(row: CombatChange) {
  const actor = member(row.actor);
  if (row.kind === 'talent-healing') return healName(actor?.build, row.effect);
  if (row.particleElement) return '元素共鸣 · '+realElementLabel(row.particleElement);
  if (row.kind==='aura-duration') return (actor?.name ?? row.actor)+' · '+buffFactNames[row.effect];
  if (row.kind === 'passive-energy') return actor?.name;
  if (['skill-charge','burst-energy','burst-cooldown'].includes(row.kind)) return actor?.build?.character.talents.find(t => t.id === row.effect)?.name ?? row.effect;
  return actor?.build?.weapon?.name ?? row.effect;
}
const missing: Record<string,string> = { previousTrigger: '此前触发结果', reactionTrigger:'反应触发者', hitApplied: '本击是否发生', partySize: '单人队伍人数', energyRecharge: '元素充能效率' };
</script>
<template>
  <details v-show="changes?.length"><summary>战斗触发与回能</summary>
    <ul><li v-for="row in changes" :key="[row.source,row.timeMs,row.actor,row.effect,row.recipient].join('|')">
      {{ format(row.timeMs / 1000) }} 秒 · {{ name(row) }} ·
      <template v-if="row.status === 'excluded' && row.kind === 'burst-energy'">能量不足，当前 {{ format(row.energyAfter!) }} 点</template>
      <template v-else-if="row.status === 'excluded' && (row.kind === 'burst-cooldown' || row.kind === 'skill-charge')">冷却中，剩余 {{ format(row.cooldownAfterMs! / 1000) }} 秒</template>
      <template v-else-if="row.status === 'excluded'">未触发</template>
      <template v-else-if="row.status === 'applied' && row.kind === 'burst-energy'">消耗 {{ format(-row.energyGain!) }} 点元素能量<template v-if="row.energyAfter !== undefined">，剩余 {{ format(row.energyAfter) }} 点</template></template>
      <template v-else-if="row.status === 'applied' && row.kind === 'aura-duration'">持续 {{ format(row.durationMs! / 1000) }} 秒，{{ format((row.timeMs+row.durationMs!) / 1000) }} 秒结束</template>
      <template v-else-if="row.status === 'applied' && row.kind === 'talent-healing'">{{ member(row.recipient!)?.name }} 获得 {{ format(row.healing!) }} 点治疗（含溢出）</template>
      <template v-else-if="row.status === 'applied' && row.kind === 'skill-charge'">消耗一次战技，剩余 {{ row.chargesAfter }} 次</template>
      <template v-else-if="row.status === 'applied' && row.kind === 'clear-particles'">产生 {{ row.particles }} 个无元素微粒</template>
      <template v-else-if="row.status === 'applied' && row.kind === 'elemental-particles'">产生 {{ row.particles }} 个{{ realElementLabel(row.particleElement!) }}微粒</template>
      <template v-else-if="row.status === 'applied' && (row.kind === 'particle-energy' || row.kind === 'passive-energy')">{{ member(row.recipient!)?.name }} 获得 {{ format(row.energyGain!) }} 点元素能量<template v-if="row.energyAfter !== undefined">，当前 {{ format(row.energyAfter) }} 点</template></template>
      <template v-else-if="row.status === 'applied'">重置一次元素战技冷却<template v-if="row.cooldownAfterMs !== undefined">，剩余 {{ format(row.cooldownAfterMs / 1000) }} 秒</template></template>
      <template v-if="row.probability !== undefined">（触发概率 {{ format(row.probability * 100) }}%）</template>
      <template v-if="row.status === 'unknown' && row.baseHealing !== undefined">基础治疗量 {{ format(row.baseHealing) }} 点，</template>
      <template v-if="row.missing?.length">待确认{{ row.missing.map(key => buffFactNames[key] ?? missing[key] ?? key).join('、') }}</template>
    </li></ul>
  </details>
</template>
