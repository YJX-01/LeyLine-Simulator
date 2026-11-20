<script setup lang="ts">
import { computed } from 'vue';
import type { Build, StatKey } from '@leyline/schema';
import type { AccountArtifact, AccountSlot } from '../domain/account';
import type { EffectiveRollBasis } from '../domain/effective-roll-basis';
import ArtifactSetSummary from './ArtifactSetSummary.vue';
import CardReplaceMark from './CardReplaceMark.vue';
import ConfigurationTitle from './ConfigurationTitle.vue';
import EffectiveRollSummary from './EffectiveRollSummary.vue';
import EquipmentStrip from './EquipmentStrip.vue';
import GameIcon from './GameIcon.vue';
import WeaponPlaceholder from './WeaponPlaceholder.vue';

const props = withDefaults(defineProps<{
  characterName: string;
  configurationName?: string;
  build?: Build;
  entries: { slot: AccountSlot; item?: AccountArtifact }[];
  basis: EffectiveRollBasis;
  effectiveStats?: readonly StatKey[];
  preferred?: boolean;
  current?: boolean;
  openLabel?: string;
  action?: 'detail' | 'select';
  replaceLabel?: string;
  compact?: boolean;
}>(), { effectiveStats: () => [], preferred: undefined, compact: true, action: 'detail' });
const emit = defineEmits<{ open: []; replace: []; openKeydown: [event: KeyboardEvent] }>();
const items = computed(() => props.entries.flatMap(entry => entry.item ? [entry.item] : []));
</script>

<template>
  <article class="configuration-row" :data-card-action="openLabel ? action : undefined" :class="{ current, compact }">
    <div class="configuration-top">
      <div class="configuration-heading">
        <ConfigurationTitle :character-name="characterName" :name="configurationName" :preferred="preferred" :current="current" />
        <template v-if="!compact">
          <span v-if="build" class="configuration-cultivation">
            <span>{{ build.level }}级</span><span>{{ build.constellation }}命</span>
            <span>天赋 {{ build.talents.normal }}/{{ build.talents.skill }}/{{ build.talents.burst }}</span>
            <span>武器 {{ build.weaponLevel }}级</span><span>精炼{{ build.refinement }}</span>
          </span>
          <span v-else class="configuration-cultivation">培养资料缺失，未配置武器</span>
        </template>
      </div>
      <slot name="actions" />
    </div>
    <div class="configuration-body">
      <component v-if="compact" :is="replaceLabel ? 'button' : 'div'" class="configuration-portraits"
        :class="{ 'replace-portrait': replaceLabel }" :type="replaceLabel ? 'button' : undefined"
        :aria-label="replaceLabel" :title="replaceLabel"
        @click="replaceLabel && emit('replace')" @keydown="replaceLabel && emit('openKeydown', $event)">
        <GameIcon kind="characters" :id="build?.character.derivedFrom?.id ?? build?.character.id" :name="characterName" :size="48"
          :level="build?.level" :constellation="build?.constellation" />
        <GameIcon v-if="build" kind="weapons" :id="build.weapon.id" :name="build.weapon.name" :size="48"
          :level="build.weaponLevel" :refinement="build.refinement" />
        <WeaponPlaceholder v-else :size="48" />
        <ArtifactSetSummary :artifacts="items" :size="48" />
        <CardReplaceMark v-if="replaceLabel" />
      </component>
      <EquipmentStrip v-else :effective-stats="effectiveStats" :entries="entries">
        <template #leading>
          <GameIcon kind="characters" :id="build?.character.derivedFrom?.id ?? build?.character.id" :name="characterName" :size="64"
            :level="build?.level" :constellation="build?.constellation" />
          <GameIcon v-if="build" kind="weapons" :id="build.weapon.id" :name="build.weapon.name" :size="64"
            :level="build.weaponLevel" :refinement="build.refinement" />
          <WeaponPlaceholder v-else :size="64" />
        </template>
      </EquipmentStrip>
      <EffectiveRollSummary inline :stacked="compact" :basis="basis" :items="items" :selected-stats="effectiveStats" />
    </div>
    <button v-if="openLabel" type="button" class="configuration-open card-detail-target" :aria-label="openLabel" :disabled="current"
      @click="emit('open')" @keydown="emit('openKeydown', $event)"></button>
  </article>
</template>

<style scoped>
.configuration-row {
  position:relative; display:grid; gap:12px; min-width:0; padding:16px;
  border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface);
}
.configuration-row.current { border-color:var(--element-hydro-primary); }
.configuration-top { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.configuration-heading { display:flex; align-items:baseline; flex-wrap:wrap; flex:1; min-width:0; gap:8px 12px; }
.configuration-cultivation { display:flex; flex-wrap:wrap; gap:4px 12px; color:var(--muted); font-size:var(--font-body); }
.configuration-body { display:grid; gap:12px; min-width:0; }
.configuration-row.compact { gap:8px; padding:10px; }
.compact .configuration-body { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; align-self:start; }
.configuration-portraits { position:relative; display:flex; align-items:center; gap:6px; }
.configuration-portraits.replace-portrait {
  z-index:2; align-self:stretch; padding:0; border:0; background:transparent;
}
.compact .effective-roll-summary { flex:1 1 232px; min-width:0; }
.configuration-open:disabled { opacity:1; }
@media(max-width:600px) { .configuration-top { align-items:start; }.configuration-heading { flex-basis:100%; }.configuration-row { padding:12px; } }
</style>
