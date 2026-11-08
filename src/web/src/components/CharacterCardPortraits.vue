<script setup lang="ts">
import { computed } from 'vue';
import type { RealBuild } from '@leyline/schema';
import type { AccountArtifact } from '../domain/account';
import talentDisplay from '../domain/data/character-talent-display.json';
import GameIcon from './GameIcon.vue';

const props = defineProps<{ build?: RealBuild; name: string; artifacts: AccountArtifact[] }>();
type Talent = { key: string; label: string; icon: string; name: string; constellations: number[] };
const rows = computed(() => {
  const source = (talentDisplay.characters as Record<string, Talent[]>)[props.name];
  return (source ?? ['normal', 'skill', 'burst'].map((key, index) => ({ key, label: 'AEQ'[index], icon: '', name: '', constellations: [] }))).map(row => {
    const base = props.build?.talents[row.key as keyof RealBuild['talents']];
    const bonus = row.constellations.filter(rank => rank <= (props.build?.constellation ?? 0)).length * 3;
    return { ...row, base, bonus, level: base === undefined ? '—' : base + bonus };
  });
});
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
const setDescription = computed(() => sets.value.map(set => `${set.name} · ${set.badge === '散' ? '散件' : `${set.badge}件套`}`).join('；') || (props.artifacts.length ? '套装身份待核对' : '未装备圣遗物'));
</script>

<template>
  <span class="card-portraits">
    <span class="card-sets" :class="{ paired: sets[0]?.badge === '2' }" :aria-label="setDescription" :title="setDescription">
      <span v-for="set in sets" :key="set.id" class="card-set" :data-rarity="set.rarity" :data-set-id="set.id" :data-count="set.badge">
        <GameIcon kind="artifacts" :id="set.id" :size="sets[0]?.badge === '2' ? 44 : 88" />
        <b class="set-badge">{{ set.badge }}</b>
      </span>
    </span>
    <GameIcon kind="characters" :id="build?.character.id" :name="name" :size="104" :constellation="build?.constellation" :level="build?.level" />
    <span class="card-weapon">
      <GameIcon v-if="build" kind="weapons" :id="build.weapon.id" :size="88" :refinement="build.refinement" :level="build.weaponLevel" :rarity="build.weapon.rarity" />
    </span>
    <span class="card-talents">
      <span v-for="row in rows" :key="row.key" class="talent-row" :aria-label="`${row.label} ${row.name} ${row.level}级`" :title="`${row.label} · ${row.name}${row.base === undefined ? ' · 待补全' : ` · 基础 ${row.base}${row.bonus ? ` + 命座 ${row.bonus}` : ''}`}`">
        <GameIcon kind="skills" :id="row.icon" :size="24" />
        <b>{{ row.level }}<sup v-if="row.bonus && row.base !== undefined">*</sup></b>
      </span>
    </span>
  </span>
</template>

<style scoped>
.card-portraits { display:grid; grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); align-items:center; gap:8px; width:100%; }
.card-sets { position:relative; width:88px; height:88px; justify-self:start; }
.card-set { position:absolute; inset:0; display:block; border-radius:7px; }
.card-set[data-rarity="5"] { background:var(--element-geo-light); }.card-set[data-rarity="4"] { background:var(--element-electro-light); }
.card-set :deep(.game-icon) { background:none; }
.set-badge { position:absolute; top:0; left:0; min-width:20px; padding:1px 3px; border-radius:4px; text-align:center; background:var(--element-geo-light); color:var(--element-geo-deep); font-size:15px; line-height:22px; }
.paired .card-set { inset:auto; top:0; left:0; width:50%; height:50%; }
.paired .card-set:nth-child(2) { top:50%; left:50%; }
.paired .set-badge { min-width:14px; font-size:12px; line-height:17px; }
.card-weapon { width:88px; height:88px; justify-self:end; }
.card-talents { grid-column:1/-1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:center; justify-self:center; width:210px; max-width:100%; gap:4px; color:var(--muted); }
.talent-row { display:flex; justify-content:center; align-items:center; gap:6px; min-width:0; line-height:1; }
.talent-row b { color:var(--ink); position:relative; font-size:14px; line-height:1; font-weight:700; font-variant-numeric:tabular-nums; }
.talent-row sup { position:absolute; top:-2px; left:100%; margin-left:1px; color:var(--element-electro-deep); font-size:11px; }
@media(max-width:400px) {
  .card-portraits { grid-template-columns:minmax(88px,1fr) 104px minmax(88px,1fr); column-gap:8px; }
  .card-portraits > .characters { width:104px !important; height:104px !important; }
  .card-sets { width:88px; height:88px; }
  .card-set :deep(.game-icon) { width:88px !important; height:88px !important; }
  .paired .card-set :deep(.game-icon) { width:44px !important; height:44px !important; }

}
@container(max-width:295.99px) { .card-portraits { grid-template-columns:minmax(88px,1fr) 104px; }.card-weapon { grid-column:1; grid-row:2; justify-self:start; }.card-talents { grid-row:3; } }
</style>
