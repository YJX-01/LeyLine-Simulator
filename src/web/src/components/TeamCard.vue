<script setup lang="ts">
import GameIcon from './GameIcon.vue';
import CardReplaceMark from './CardReplaceMark.vue';
import FavoriteMark from './FavoriteMark.vue';
import { teamMemberName, teamMemberPortrait, type TeamMember } from '../domain/team-members';

withDefaults(defineProps<{
  name: string;
  members: readonly TeamMember[];
  selected?: boolean;
  favorite?: number;
  action?: 'detail' | 'select' | 'replace';
  disabled?: boolean;
}>(), { action: 'detail' });
</script>

<template>
  <button type="button" class="team-row" :data-card-action="action" :disabled="disabled" :class="{ selected }" :aria-description="members.map(teamMemberName).join('、')">
    <strong>{{ name }}</strong>
    <span class="team-row-members" :class="{ 'replace-portrait': action === 'replace' }">
      <GameIcon v-for="member in members" :key="member.id" kind="characters"
        :id="teamMemberPortrait(member)" :name="teamMemberName(member)" :title="teamMemberName(member)" :size="64"
        style="width:var(--team-portrait-size);height:var(--team-portrait-size)"
        :constellation="member.build?.constellation" :level="member.build?.level" />
      <CardReplaceMark v-if="action === 'replace' && !disabled" />
    </span>
    <span class="team-row-trailing">
      <span v-if="favorite" role="img" :aria-label="`${favorite}级收藏`" :title="`${favorite}级收藏`"><FavoriteMark :level="favorite" /></span>
      <svg viewBox="0 0 24 24" class="team-row-arrow" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
    </span>
  </button>
</template>

<style scoped>
button.team-row {
  --team-portrait-size:64px;
  display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr); align-items:center; gap:12px;
  box-sizing:border-box; width:100%; min-height:96px; padding:12px 16px; text-align:left;
  background:var(--surface);
}
button.team-row.selected { background:var(--element-hydro-light); }
.team-row > strong { min-width:0; font-size:var(--font-control); overflow-wrap:anywhere; }
.team-row-members { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px 12px; min-width:0; }
.team-row-members.replace-portrait { justify-self:center; max-width:100%; border-radius:var(--control-radius); }
.team-row-arrow { width:18px; height:18px; justify-self:end; color:var(--muted); }
.team-row-trailing { justify-self:end; display:flex; align-items:center; gap:8px; }
@media(max-width:600px) {
  button.team-row { --team-portrait-size:56px; grid-template-columns:minmax(0,1fr) auto; padding:12px; gap:8px; }
  .team-row-members { grid-column:1/-1; grid-row:2; gap:6px; }
  .team-row-trailing { grid-column:2; grid-row:1; }
}
</style>
