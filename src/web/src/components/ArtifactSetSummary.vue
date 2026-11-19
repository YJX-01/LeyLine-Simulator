<script setup lang="ts">
import { computed } from 'vue';
import type { AccountArtifact } from '../domain/account';
import CornerBadge from './CornerBadge.vue';
import GameIcon from './GameIcon.vue';

const props = withDefaults(defineProps<{ artifacts: readonly AccountArtifact[]; size?: number }>(), { size: 88 });
const sets = computed(() => {
  const counts = new Map<string, { id: string; count: number; name: string; rarity: number }>();
  for (const item of props.artifacts) {
    if (!item.real || item.mona?.setIdentityPending) continue;
    const id = item.real.setId;
    const group = counts.get(id) ?? { id, count: 0, name: item.name.split(' · ')[0]!, rarity: item.real.rarity };
    group.count++;
    counts.set(id, group);
  }
  const groups = [...counts.values()].sort((a, b) => b.count - a.count);
  const four = groups.find(group => group.count >= 4);
  if (four) return [{ ...four, badge: '4' }];
  const pairs = groups.filter(group => group.count >= 2).slice(0, 2);
  if (pairs.length) return pairs.map(group => ({ ...group, badge: '2' }));
  const flower = props.artifacts.find(item => item.slot === 'flower' && item.real && !item.mona?.setIdentityPending);
  const loose = counts.get(flower?.real?.setId ?? '') ?? groups[0];
  return loose ? [{ ...loose, badge: '散' }] : [];
});
const paired = computed(() => sets.value[0]?.badge === '2');
const tileSize = computed(() => paired.value ? props.size / 2 : props.size);
const description = computed(() => sets.value.map(set => `${set.name} ${set.badge === '散' ? '散件' : `${set.badge}件套`}`).join('；')
  || (props.artifacts.length ? '套装身份待核对' : '未装备圣遗物'));
</script>

<template>
  <span class="card-sets" :class="{ paired }" :style="{ width: `${size}px`, height: `${size}px` }" :aria-label="description" :title="description">
    <span v-for="set in sets" :key="set.id" class="card-set" :data-rarity="set.rarity" :data-set-id="set.id" :data-count="set.badge">
      <GameIcon kind="artifacts" :id="set.id" :size="tileSize" style="width:100%;height:100%" />
      <CornerBadge class="set-badge" :small="size <= 48">{{ set.badge }}</CornerBadge>
    </span>
  </span>
</template>

<style scoped>
.card-sets { position:relative; flex:none; }
.card-set { position:absolute; inset:0; display:grid; border-radius:var(--control-radius); }
.card-set[data-rarity="5"] { background:var(--element-geo-light); }
.card-set[data-rarity="4"] { background:var(--element-electro-light); }
.card-set :deep(.game-icon) { background:none; }
.set-badge { position:absolute; top:0; left:0; background:transparent; color:var(--element-geo-deep); }
.paired .card-set { inset:auto; top:0; left:0; width:50%; height:50%; }
.paired .card-set:nth-child(2) { top:50%; left:50%; }
</style>
