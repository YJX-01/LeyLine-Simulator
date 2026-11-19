<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import FilterActions from '../components/FilterActions.vue';
import FilterPanel from '../components/FilterPanel.vue';
import GameIcon from '../components/GameIcon.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import LibraryListHeader from '../components/LibraryListHeader.vue';
import LibraryPagination from '../components/LibraryPagination.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import SortPanel from '../components/SortPanel.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { useLibraryScroll } from '../composables/use-library-scroll';
import { buildRollBasis } from '../domain/effective-roll-basis';
import { teamArtifactEntries, teamMemberName, teamMemberPortrait, teamSize } from '../domain/team-members';
import { useAccountStore } from '../stores/account';
import { teamSortDefaults, useLibraryViewStore } from '../stores/library-view';
import { useSavedTeamsStore } from '../stores/saved-teams';

const CharacterConfigurationCard = defineAsyncComponent(() => import('../components/CharacterConfigurationCard.vue'));
const TeamEditorDialog = defineAsyncComponent(() => import('./TeamEditorDialog.vue'));
const saved = useSavedTeamsStore();
const accounts = useAccountStore();
const views = useLibraryViewStore();
const browse = computed(() => views.forAccount(accounts.account.id));
const pageSize = 5;
const filterOpen = ref(false);
const sortOpen = ref(false);
const memberCountOptions = [
  { value: 0, label: '不限' },
  ...Array.from({ length: teamSize }, (_, index) => ({ value: index + 1, label: `${index + 1} 人` })),
];
const sortOptions = [
  { value: teamSortDefaults.key, label: '保存顺序' },
  { value: 'name', label: '队伍名称' },
  { value: 'members', label: '队员人数' },
];
const filterCount = computed(() => Number(!!browse.value.teamMember) + Number(!!browse.value.teamMemberCount));
const sorted = computed(() => browse.value.teamSort !== teamSortDefaults.key || browse.value.teamDirection !== teamSortDefaults.direction);
const memberOptions = computed(() => {
  const names = new Set(saved.teams.flatMap(team => team.project.candidate.actors.map(teamMemberName)));
  if (browse.value.teamMember) names.add(browse.value.teamMember);
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
});
const directionLabels = computed(() => {
  if (browse.value.teamSort === 'saved') return { asc: '从早到晚', desc: '从晚到早' };
  if (browse.value.teamSort === 'name') return { asc: '名称正序', desc: '名称倒序' };
});
const query = computed({
  get: () => browse.value.teamQuery,
  set: value => {
    browse.value.teamQuery = value;
    browse.value.teamPage = 1;
  },
});
const matches = computed(() => {
  const term = query.value.trim().toLowerCase();
  const { teamMember, teamMemberCount, teamSort, teamDirection } = browse.value;
  const filtered = saved.teams.filter(team => {
    const members = team.project.candidate.actors;
    if (teamMemberCount && members.length !== teamMemberCount) return false;
    if (teamMember && !members.some(member => teamMemberName(member) === teamMember)) return false;
    return team.name.toLowerCase().includes(term)
      || members.some(member => teamMemberName(member).toLowerCase().includes(term));
  });
  if (teamSort === 'saved') return teamDirection === 'asc' ? filtered : filtered.reverse();
  const sign = teamDirection === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => sign * (teamSort === 'name'
    ? a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
    : a.project.candidate.actors.length - b.project.candidate.actors.length));
});
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / pageSize)));
const page = computed({
  get: () => Math.min(browse.value.teamPage, pages.value),
  set: value => { browse.value.teamPage = Math.max(1, Math.min(value, pages.value)); },
});
const visible = computed(() => matches.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch(() => [browse.value.teamMember, browse.value.teamMemberCount, browse.value.teamSort, browse.value.teamDirection], () => {
  browse.value.teamPage = 1;
});

function resetFilters() {
  browse.value.teamMember = '';
  browse.value.teamMemberCount = 0;
}

function changeSort(key: string) {
  if (browse.value.teamSort === key) return;
  browse.value.teamSort = key;
  browse.value.teamDirection = key === 'members' ? 'desc' : 'asc';
}

function resetSort() {
  browse.value.teamSort = teamSortDefaults.key;
  browse.value.teamDirection = teamSortDefaults.direction;
}

const selectedId = ref<string>();
const selected = computed(() => saved.teams.find(team => team.id === selectedId.value));
const editorOpen = ref(false);
const editor = ref<InstanceType<typeof import('./TeamEditorDialog.vue')['default']>>();
const selectedMembers = computed(() => selected.value?.project.candidate.actors.map(member => ({
  member, entries: teamArtifactEntries(member.build), basis: buildRollBasis(member.build),
})) ?? []);
useLibraryScroll(() => 'teams');

function requestLeave(action: () => void) {
  if (editor.value) editor.value.requestLeave(action);
  else action();
}
defineExpose({ requestLeave });

async function showSavedTeam(id: string) {
  editorOpen.value = false;
  await nextTick();
  selectedId.value = id;
}
</script>

<template>
  <section class="team-library panel library-page" aria-label="队伍">
    <LibraryCornerOrnaments />
    <LibraryToolbar v-model="query" label="搜索队伍" placeholder="搜索队伍名或队员名…"
      :filter-count="filterCount" :sorted="sorted" @filter="filterOpen = true" @sort="sortOpen = true" @reset="resetFilters(); resetSort()">
      <template #actions>
        <button type="button" class="ui-action library-primary-action" @click="editorOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新建队伍
        </button>
      </template>
    </LibraryToolbar>
    <p v-if="saved.error" role="alert">{{ saved.error }}</p>
    <LibraryListHeader v-model:page="page" :pages="pages" :count="matches.length" :total="saved.teams.length" unit="支队伍" />
    <ul v-if="visible.length" class="team-list">
      <li v-for="team in visible" :key="team.id">
        <button type="button" class="team-row" :data-team-id="team.id" :aria-label="`查看队伍 ${team.name}`"
          :aria-description="team.project.candidate.actors.map(teamMemberName).join('、')" @click="selectedId = team.id">
          <strong>{{ team.name }}</strong>
          <span class="team-row-members">
            <span v-for="member in team.project.candidate.actors" :key="member.id" class="team-row-member">
              <GameIcon kind="characters" :id="teamMemberPortrait(member)" :name="teamMemberName(member)" :size="40" />
              <span>{{ teamMemberName(member) }}</span>
            </span>
          </span>
          <svg viewBox="0 0 24 24" class="team-row-arrow" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
        </button>
      </li>
    </ul>
    <p v-else class="team-empty">{{ saved.teams.length ? '没有匹配的队伍' : '还没有保存的队伍' }}</p>
    <footer class="team-list-footer">
      <LibraryPagination v-model:page="page" :pages="pages" always position="底部" full />
      <button v-if="saved.teams.length" type="button" class="ui-action soft" data-size="md" @click="saved.exportTeams()">导出队伍备份</button>
    </footer>

    <WorkbenchDialog v-if="filterOpen" title="筛选队伍" size="filter" @close="filterOpen = false">
      <FilterPanel>
        <section>
          <h3 id="team-member-filter">包含队员</h3>
          <select v-model="browse.teamMember" class="ui-control" aria-labelledby="team-member-filter">
            <option value="">全部队员</option>
            <option v-for="member in memberOptions" :key="member" :value="member">{{ member }}</option>
          </select>
        </section>
        <section>
          <h3>队员人数</h3>
          <ChoiceGroup :model-value="browse.teamMemberCount" :options="memberCountOptions" label="队员人数"
            @update:model-value="browse.teamMemberCount = Number($event)" />
        </section>
      </FilterPanel>
      <template #footer><FilterActions flush @reset="resetFilters" @confirm="filterOpen = false" /></template>
    </WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="队伍排序" size="filter" @close="sortOpen = false">
      <SortPanel :model-value="browse.teamSort" v-model:direction="browse.teamDirection" :options="sortOptions" :direction-labels="directionLabels"
        @update:model-value="changeSort" @reset="resetSort" @confirm="sortOpen = false" />
    </WorkbenchDialog>
    <WorkbenchDialog v-if="selected" :title="selected.name" aria-label="队伍详情" editor center-title @close="selectedId = undefined">
      <template #header-leading>
        <button type="button" class="ui-action" data-size="md" @click="editorOpen = true">编辑队伍</button>
      </template>
      <div class="team-detail-cards">
        <CharacterConfigurationCard v-for="{ member, entries, basis } in selectedMembers" :key="member.id"
          :character-name="teamMemberName(member)" :configuration-name="member.build?.weapon.name"
          :build="member.build" :entries="entries" :basis="basis" />
        <p v-if="!selectedMembers.length" class="team-empty">还没有队员</p>
      </div>
    </WorkbenchDialog>
    <TeamEditorDialog v-if="editorOpen" ref="editor" :team="selected" @close="editorOpen = false" @saved="showSavedTeam" />
  </section>
</template>

<style scoped>
.team-library,.team-list { display:grid; gap:12px; min-width:0; }
.team-list { list-style:none; padding:0; margin:0; }
.team-library .team-row {
  display:grid; grid-template-columns:minmax(120px,1fr) minmax(0,2fr) 20px; align-items:center; gap:12px;
  box-sizing:border-box; width:100%; min-height:88px; padding:12px 16px; text-align:left;
  border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface);
}
.team-library .team-row:hover { border-color:var(--line); border-top-color:var(--element-anemo-primary); }
.team-row > strong { min-width:0; font-size:var(--font-control); overflow-wrap:anywhere; }
.team-row-members { display:flex; flex-wrap:wrap; align-items:start; gap:8px 16px; min-width:0; }
.team-row-member { display:grid; justify-items:center; gap:4px; width:68px; min-width:0; text-align:center; color:var(--muted); overflow-wrap:anywhere; }
.team-row-arrow { width:18px; height:18px; justify-self:end; color:var(--muted); }
.team-empty { padding:24px 12px; text-align:center; color:var(--muted); }
.team-list-footer { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:8px; }
.team-list-footer :deep(.library-pagination) { grid-column:2; margin:0; }
.team-list-footer > button { grid-column:3; justify-self:end; }
.team-detail-cards { display:grid; gap:12px; }
@media(max-width:600px) {
  .team-library .team-row { grid-template-columns:minmax(0,1fr) 20px; padding:12px; gap:8px; }
  .team-row-members { grid-column:1/-1; grid-row:2; gap:8px; }
  .team-row-arrow { grid-column:2; grid-row:1; }
  .team-list-footer { grid-template-columns:minmax(0,1fr); }
  .team-list-footer :deep(.library-pagination),.team-list-footer > button { grid-column:1; }
}
</style>
