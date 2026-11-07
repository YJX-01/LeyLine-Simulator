<script setup lang="ts">
import { computed } from 'vue';
import type { RealBuild } from '@leyline/schema';
import talentDisplay from '../domain/data/character-talent-display.json';
import GameIcon from './GameIcon.vue';

const props = defineProps<{ build?: RealBuild; name: string }>();
type Talent = { key: string; label: string; icon: string; name: string; constellations: number[] };
const rows = computed(() => {
  const source = (talentDisplay.characters as Record<string, Talent[]>)[props.name];
  return (source ?? ['normal', 'skill', 'burst'].map((key, index) => ({ key, label: 'AEQ'[index], icon: '', name: '', constellations: [] }))).map(row => {
    const base = props.build?.talents[row.key as keyof RealBuild['talents']];
    const bonus = row.constellations.filter(rank => rank <= (props.build?.constellation ?? 0)).length * 3;
    return { ...row, base, bonus, level: base === undefined ? '—' : base + bonus };
  });
});
</script>

<template>
  <span class="card-portraits">
    <span class="card-talents">
      <span v-for="row in rows" :key="row.key" class="talent-row" :title="`${row.name}${row.base === undefined ? ' · 待补全' : ` · 基础 ${row.base}${row.bonus ? ` + 命座 ${row.bonus}` : ''}`}`">
        <span>{{ row.label }}</span><GameIcon kind="skills" :id="row.icon" :size="34" />
        <b>{{ row.level }}<sup v-if="row.bonus && row.base !== undefined">*</sup></b>
      </span>
    </span>
    <GameIcon kind="characters" :id="build?.character.id" :name="name" :size="104" :constellation="build?.constellation" :level="build?.level" />
    <span class="card-weapon">
      <GameIcon v-if="build" kind="weapons" :id="build.weapon.id" :size="88" :refinement="build.refinement" :level="build.weaponLevel" :rarity="build.weapon.rarity" />
    </span>
  </span>
</template>

<style scoped>
.card-portraits { display:grid; grid-template-columns:minmax(0,1fr) 104px minmax(0,1fr); align-items:center; gap:4px; width:100%; padding:0; }
.card-talents { display:grid; grid-template-rows:repeat(3,minmax(0,1fr)); height:104px; justify-self:start; color:var(--muted); }
.talent-row { display:grid; grid-template-columns:14px 34px 30px; align-items:center; justify-items:center; gap:2px; font-size:14px; line-height:1; }
.talent-row b { color:var(--ink); position:relative; font-size:15px; line-height:1; font-weight:600; font-variant-numeric:tabular-nums; }
.talent-row sup { position:absolute; top:-2px; left:100%; margin-left:1px; color:var(--element-electro-deep); font-size:11px; }
.card-weapon { width:88px; height:88px; justify-self:end; }
@media(max-width:400px) { .card-talents { height:96px; }.talent-row { grid-template-columns:14px 32px 28px; }.talent-row > .skills { width:32px !important; height:32px !important; } .card-portraits { grid-template-columns:minmax(0,1fr) 96px minmax(0,1fr); }.card-portraits > .characters { width:96px !important; height:96px !important; }.card-weapon,.card-weapon > .weapons { width:80px !important; height:80px !important; } }
</style>
