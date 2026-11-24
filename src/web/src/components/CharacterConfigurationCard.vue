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
import FavoriteMark from './FavoriteMark.vue';
import WeaponPlaceholder from './WeaponPlaceholder.vue';

const props = withDefaults(defineProps<{
  characterName: string;
  configurationName?: string;
  truncateName?: boolean;
  build?: Build;
  entries: { slot: AccountSlot; item?: AccountArtifact }[];
  basis: EffectiveRollBasis;
  effectiveStats?: readonly StatKey[];
  preferred?: boolean;
  favorite?: number;
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
  <article class="configuration-row" :data-card-action="openLabel ? action : undefined" :data-current="current || undefined" :class="{ compact }">
    <div class="configuration-top">
      <div class="configuration-heading">
        <ConfigurationTitle :character-name="characterName" :name="configurationName" :truncate-name="truncateName" :preferred="preferred" />
        <template v-if="!compact">
          <span v-if="build" class="configuration-cultivation">
            <span>{{ build.level }}级</span><span>{{ build.constellation }}命</span>
            <span>天赋 {{ build.talents.normal }}/{{ build.talents.skill }}/{{ build.talents.burst }}</span>
            <template v-if="build.weapon"><span>武器 {{ build.weaponLevel }}级</span><span>精炼{{ build.refinement }}</span></template><span v-else>未配武器</span>
          </span>
          <span v-else class="configuration-cultivation">培养资料缺失，未配置武器</span>
        </template>
      </div>
      <span v-if="favorite" class="configuration-favorite" role="img" :aria-label="`${favorite}级收藏`" :title="`${favorite}级收藏`"><FavoriteMark :level="favorite" /></span>
      <slot name="actions" />
    </div>
    <div class="configuration-body">
      <component v-if="compact" :is="replaceLabel ? 'button' : 'div'" class="configuration-portraits"
        :class="{ 'replace-portrait': replaceLabel }" :type="replaceLabel ? 'button' : undefined"
        :aria-label="replaceLabel" :title="replaceLabel" :aria-haspopup="replaceLabel ? 'dialog' : undefined"
        @click="replaceLabel && emit('replace')" @keydown="replaceLabel && emit('openKeydown', $event)">
        <GameIcon kind="characters" :id="build?.character.derivedFrom?.id ?? build?.character.id" :name="characterName" :size="48"
          :level="build?.level" :constellation="build?.constellation" />
        <GameIcon v-if="build?.weapon" kind="weapons" :id="build.weapon.id" :name="build.weapon.name" :size="48"
          :level="build.weaponLevel" :refinement="build.refinement" />
        <WeaponPlaceholder v-else :size="48" />
        <ArtifactSetSummary :artifacts="items" :size="48" />
        <CardReplaceMark v-if="replaceLabel" />
      </component>
      <EquipmentStrip v-else :effective-stats="effectiveStats" :entries="entries">
        <template #leading>
          <GameIcon kind="characters" :id="build?.character.derivedFrom?.id ?? build?.character.id" :name="characterName" :size="64"
            :level="build?.level" :constellation="build?.constellation" />
          <GameIcon v-if="build?.weapon" kind="weapons" :id="build.weapon.id" :name="build.weapon.name" :size="64"
            :level="build.weaponLevel" :refinement="build.refinement" />
          <WeaponPlaceholder v-else :size="64" />
        </template>
      </EquipmentStrip>
      <EffectiveRollSummary inline :stacked="compact" :basis="basis" :items="items" :selected-stats="effectiveStats" />
    </div>
    <button v-if="openLabel" type="button" class="configuration-open card-detail-target" :aria-label="openLabel" :title="truncateName ? configurationName : undefined" :aria-current="current || undefined" :aria-disabled="current || undefined"
      @click="!current && emit('open')" @keydown="emit('openKeydown', $event)"></button>
  </article>
</template>

<style scoped>
.configuration-row {
  position:relative; display:grid; grid-template-columns:minmax(0,1fr); gap:12px; min-width:0; padding:16px;
  border:1px solid var(--line); border-top:3px solid var(--card-rest-edge, var(--line)); border-radius:10px; background:var(--surface);
}
.configuration-top { display:flex; flex-wrap:wrap; align-items:center; gap:12px; min-height:var(--control-height-sm); }
.configuration-heading { display:flex; align-items:baseline; flex-wrap:wrap; flex:1; min-width:0; gap:8px 12px; }
.configuration-favorite { flex:none; align-self:flex-start; margin-inline-start:auto; }
.configuration-cultivation { display:flex; flex-wrap:wrap; gap:4px 12px; color:var(--muted); font-size:var(--font-body); }
.configuration-body { display:grid; gap:12px; min-width:0; }
.configuration-row.compact { gap:8px; padding:10px; }
.compact .configuration-body { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; align-self:start; }
.configuration-portraits { position:relative; display:flex; align-items:center; gap:6px; }
.configuration-portraits.replace-portrait {
  z-index:2; align-self:stretch; padding:0; border:0; background:transparent;
}
.configuration-portraits.replace-portrait:enabled:hover > :deep(.card-replace-layer) { visibility:visible; }
.compact .effective-roll-summary { flex:1 1 232px; min-width:0; }
.configuration-open[aria-current="true"]:focus-visible { outline:2px solid var(--element-anemo-deep); outline-offset:-4px; }
.slot-configuration { box-sizing:border-box; container-type:inline-size; min-height:0; }
.slot-configuration.compact { align-content:center; gap:4px; }
.slot-configuration .configuration-top { min-height:0; }
.slot-configuration .configuration-body { flex-wrap:nowrap; }
.slot-configuration :deep(.configuration-title > span:first-child) { flex:none; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
.slot-configuration .configuration-portraits { min-width:0; --slot-portrait-size:min(48px,calc((100cqi - 12px) / 3)); }
.slot-configuration .configuration-portraits > :is(.game-icon,.weapon-placeholder,.card-sets) { max-width:var(--slot-portrait-size); max-height:var(--slot-portrait-size); }
.slot-configuration :deep(.effective-roll-summary.stacked > div) { line-height:18px; }
@media(max-width:600px) { .configuration-top { align-items:start; }.configuration-row { padding:12px; } }
</style>
