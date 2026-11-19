<script setup lang="ts">
import { computed } from 'vue';
import type { Build } from '@leyline/schema';
import type { AccountArtifact } from '../domain/account';
import talentDisplay from 'virtual:leyline-display/character-talent-display';
import ArtifactSetSummary from './ArtifactSetSummary.vue';
import GameIcon from './GameIcon.vue';
import WeaponPlaceholder from './WeaponPlaceholder.vue';
import { talentDisplayRows } from '../domain/character-info';

const props = defineProps<{ build?: Build; name: string; artifacts: AccountArtifact[] }>();
type Talent = { key: string; label: string; icon: string; name: string; constellations: number[] };
const rows = computed(() => {
  const source = props.build ? talentDisplayRows(props.build.character) : (talentDisplay.characters as Record<string,Talent[]>)[props.name];
  return (source ?? ['normal', 'skill', 'burst'].map((key, index) => ({ key, label: 'AEQ'[index], icon: '', name: '', constellations: [] }))).map(row => {
    const base = props.build?.talents[row.key as keyof Build['talents']];
    const bonus = row.constellations.filter(rank => rank <= (props.build?.constellation ?? 0)).length * 3;
    return { ...row, base, bonus, level: base === undefined ? '—' : base + bonus };
  });
});
</script>

<template>
  <span class="card-portraits">
    <ArtifactSetSummary class="character-card-sets" :artifacts="artifacts"
      style="width:var(--character-card-equipment-size);height:var(--character-card-equipment-size)" />
    <GameIcon kind="characters" :id="build?.character.id" :name="name" :size="104" :constellation="build?.constellation" :level="build?.level"
      style="width:var(--character-card-character-size);height:var(--character-card-character-size)" />
    <span class="card-weapon">
      <GameIcon v-if="build" kind="weapons" :id="build.weapon.id" :size="88" :refinement="build.refinement" :level="build.weaponLevel" :rarity="build.weapon.rarity"
        style="width:100%;height:100%" />
      <WeaponPlaceholder v-else style="--weapon-placeholder-size:var(--character-card-equipment-size)" />
    </span>
    <span class="card-talents">
      <span v-for="row in rows" :key="row.key" class="talent-row" :aria-label="`${row.label} ${row.name} ${row.level}级`" :title="`${row.label} ${row.name}${row.base === undefined ? '，待补全' : `，基础 ${row.base}${row.bonus ? ` + 命座 ${row.bonus}` : ''}`}`">
        <GameIcon kind="skills" :id="row.icon" :size="24" />
        <b>{{ row.level }}<sup data-ui-badge="mini" v-if="row.bonus && row.base !== undefined">*</sup></b>
      </span>
    </span>
  </span>
</template>

<style scoped>
.card-portraits { display:grid; grid-template-columns:var(--character-card-media-columns); align-items:center; gap:var(--character-card-media-gap); width:100%; }
.character-card-sets { justify-self:start; }
.card-weapon { display:grid; width:var(--character-card-equipment-size); aspect-ratio:1; justify-self:end; }
.card-weapon :deep(.weapons > img) { width:88%; height:88%; }
.card-talents { grid-column:1/-1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:center; justify-self:center; width:210px; max-width:100%; gap:4px; color:var(--muted); }
.talent-row { display:flex; justify-content:center; align-items:center; gap:6px; min-width:0; line-height:1; }
.talent-row b { color:var(--ink); position:relative; font-size:var(--font-body); line-height:1; font-weight:700; font-variant-numeric:tabular-nums; }
.talent-row sup { font-size:var(--font-badge-mini); position:absolute; top:-2px; left:100%; margin-left:1px; color:var(--element-electro-deep);  }
</style>
