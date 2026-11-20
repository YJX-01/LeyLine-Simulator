<script setup lang="ts">
import GameIcon from './GameIcon.vue';
import { teamMemberName, teamMemberPortrait, type TeamMember } from '../domain/team-members';

defineProps<{ name: string; members: readonly TeamMember[]; selected?: boolean }>();
</script>

<template>
  <button type="button" class="team-row" :class="{ selected }" :aria-description="members.map(teamMemberName).join('、')">
    <strong>{{ name }}</strong>
    <span class="team-row-members">
      <GameIcon v-for="member in members" :key="member.id" kind="characters"
        :id="teamMemberPortrait(member)" :name="teamMemberName(member)" :title="teamMemberName(member)" :size="64"
        style="width:var(--team-portrait-size);height:var(--team-portrait-size)"
        :constellation="member.build?.constellation" :level="member.build?.level" />
    </span>
    <svg viewBox="0 0 24 24" class="team-row-arrow" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
  </button>
</template>

<style scoped>
button.team-row {
  --team-portrait-size:64px;
  display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr); align-items:center; gap:12px;
  box-sizing:border-box; width:100%; min-height:96px; padding:12px 16px; text-align:left;
  border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface);
}
button.team-row:hover,button.team-row.selected { border-top-color:var(--element-anemo-primary); }
button.team-row.selected { background:var(--element-anemo-light); }
.team-row > strong { min-width:0; font-size:var(--font-control); overflow-wrap:anywhere; }
.team-row-members { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px 12px; min-width:0; }
.team-row-arrow { width:18px; height:18px; justify-self:end; color:var(--muted); }
@media(max-width:600px) {
  button.team-row { --team-portrait-size:56px; grid-template-columns:minmax(0,1fr) 20px; padding:12px; gap:8px; }
  .team-row-members { grid-column:1/-1; grid-row:2; gap:6px; }
  .team-row-arrow { grid-column:2; grid-row:1; }
}
</style>
