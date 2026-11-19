<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, watch } from 'vue';
import FilterActions from '../components/FilterActions.vue';
import FilterPanel from '../components/FilterPanel.vue';
import GameIcon from '../components/GameIcon.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import LibraryListHeader from '../components/LibraryListHeader.vue';
import LibraryPagination from '../components/LibraryPagination.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import SingleSelectPicker from '../components/SingleSelectPicker.vue';
import SortPanel from '../components/SortPanel.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { useLibraryScroll } from '../composables/use-library-scroll';
import { teamMemberName, teamMemberPortrait } from '../domain/team-members';
import { useAccountStore } from '../stores/account';
import { teamSortDefaults, useLibraryViewStore } from '../stores/library-view';
import { useSavedTeamsStore, type SavedTeam } from '../stores/saved-teams';

const TeamEditorDialog = defineAsyncComponent(() => import('./TeamEditorDialog.vue'));
const emit = defineEmits<{ inspect: [characterId: string, presetId: string] }>();
const library = ref<HTMLElement>();
const saved = useSavedTeamsStore();
const accounts = useAccountStore();
const views = useLibraryViewStore();
const browse = computed(() => views.forAccount(accounts.account.id));
const pageSize = 5;
const filterOpen = ref(false);
const sortOpen = ref(false);
const sortOptions = [
  { value: teamSortDefaults.key, label: '保存顺序' },
  { value: 'name', label: '队伍名称' },
];
const filterCount = computed(() => Number(!!browse.value.teamMember));
const sorted = computed(() => browse.value.teamSort !== teamSortDefaults.key || browse.value.teamDirection !== teamSortDefaults.direction);
const memberOptions = computed(() => {
  const options = new Map(saved.teams.flatMap(team => team.project.candidate.actors.map(member => {
    const name = teamMemberName(member);
    return [name, { id: name, name, icon: teamMemberPortrait(member) }] as const;
  })));
  const selected = browse.value.teamMember;
  if (selected && !options.has(selected)) options.set(selected, { id: selected, name: selected, icon: undefined });
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
});
const directionLabels = computed(() => browse.value.teamSort === 'saved'
  ? { asc: '从早到晚', desc: '从晚到早' }
  : { asc: '名称正序', desc: '名称倒序' });
const query = computed({
  get: () => browse.value.teamQuery,
  set: value => {
    browse.value.teamQuery = value;
    browse.value.teamPage = 1;
  },
});
const matches = computed(() => {
  const term = query.value.trim().toLowerCase();
  const { teamMember, teamSort, teamDirection } = browse.value;
  const filtered = saved.teams.filter(team => {
    const members = team.project.candidate.actors;
    if (teamMember && !members.some(member => teamMemberName(member) === teamMember)) return false;
    return team.name.toLowerCase().includes(term)
      || members.some(member => teamMemberName(member).toLowerCase().includes(term));
  });
  if (teamSort === 'saved') return teamDirection === 'asc' ? filtered : filtered.reverse();
  const sign = teamDirection === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => sign * a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
});
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / pageSize)));
const page = computed({
  get: () => Math.min(browse.value.teamPage, pages.value),
  set: value => { browse.value.teamPage = Math.max(1, Math.min(value, pages.value)); },
});
const visible = computed(() => matches.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch(() => [browse.value.teamMember, browse.value.teamSort, browse.value.teamDirection], () => {
  browse.value.teamPage = 1;
});

function resetFilters() {
  browse.value.teamMember = '';
}

function changeSort(key: string) {
  if (browse.value.teamSort === key) return;
  browse.value.teamSort = key;
  browse.value.teamDirection = teamSortDefaults.direction;
}

function resetSort() {
  browse.value.teamSort = teamSortDefaults.key;
  browse.value.teamDirection = teamSortDefaults.direction;
}

const activeTeam = shallowRef<SavedTeam | 'new'>();
const editor = ref<InstanceType<typeof import('./TeamEditorDialog.vue')['default']>>();
useLibraryScroll(() => 'teams');

function requestLeave(action: () => void) {
  if (editor.value) editor.value.requestLeave(action);
  else action();
}
defineExpose({ requestLeave });

function closeDeleted() {
  activeTeam.value = undefined;
  browse.value.teamPage = page.value;
  void nextTick(() => library.value?.querySelector<HTMLInputElement>('input[name=library-search]')?.focus({ preventScroll: true }));
}
</script>

<template>
  <section ref="library" class="team-library panel library-page" aria-label="队伍">
    <LibraryCornerOrnaments />
    <LibraryToolbar v-model="query" label="搜索队伍" placeholder="搜索队伍名或队员名…"
      :filter-count="filterCount" :sorted="sorted" @filter="filterOpen = true" @sort="sortOpen = true" @reset="resetFilters(); resetSort()">
      <template #actions>
        <button type="button" class="ui-action library-primary-action" @click="activeTeam = 'new'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新建队伍
        </button>
      </template>
    </LibraryToolbar>
    <p v-if="saved.error" role="alert">{{ saved.error }}</p>
    <LibraryListHeader v-model:page="page" :pages="pages" :count="matches.length" :total="saved.teams.length" unit="支队伍" />
    <ul v-if="visible.length" class="team-list">
      <li v-for="team in visible" :key="team.id">
        <button type="button" class="team-row" :data-team-id="team.id" :aria-label="`查看队伍 ${team.name}`"
          :aria-description="team.project.candidate.actors.map(teamMemberName).join('、')" @click="activeTeam = team">
          <strong>{{ team.name }}</strong>
          <span class="team-row-members">
            <GameIcon v-for="member in team.project.candidate.actors" :key="member.id" kind="characters"
              :id="teamMemberPortrait(member)" :name="teamMemberName(member)" :title="teamMemberName(member)" :size="64"
              style="width:var(--team-portrait-size);height:var(--team-portrait-size)"
              :constellation="member.build?.constellation" :level="member.build?.level" />
          </span>
          <svg viewBox="0 0 24 24" class="team-row-arrow" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
        </button>
      </li>
    </ul>
    <p v-else class="team-empty">{{ saved.teams.length ? '没有匹配的队伍' : '还没有保存的队伍' }}</p>
    <LibraryPagination v-model:page="page" class="team-pagination" :pages="pages" always position="底部" full />

    <WorkbenchDialog v-if="filterOpen" title="筛选队伍" size="filter" @close="filterOpen = false">
      <FilterPanel>
        <section>
          <h3>包含角色</h3>
          <SingleSelectPicker v-model="browse.teamMember" class="team-member-filter" label="包含角色" empty-label="全部角色"
            image-kind="characters" :options="memberOptions" allow-empty @clear="resetFilters" />
        </section>
      </FilterPanel>
      <template #footer><FilterActions flush @reset="resetFilters" @confirm="filterOpen = false" /></template>
    </WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="队伍排序" size="filter" @close="sortOpen = false">
      <SortPanel :model-value="browse.teamSort" v-model:direction="browse.teamDirection" :options="sortOptions" :direction-labels="directionLabels"
        @update:model-value="changeSort" @reset="resetSort" @confirm="sortOpen = false" />
    </WorkbenchDialog>
    <TeamEditorDialog v-if="activeTeam" ref="editor" :team="activeTeam === 'new' ? undefined : activeTeam" @close="activeTeam = undefined"
      @inspect="(characterId, presetId) => emit('inspect', characterId, presetId)" @deleted="closeDeleted" />
  </section>
</template>

<style scoped>
.team-library,.team-list { display:grid; gap:12px; min-width:0; }
.team-list { list-style:none; padding:0; margin:0; }
.team-library .team-row {
  --team-portrait-size:64px;
  display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr); align-items:center; gap:12px;
  box-sizing:border-box; width:100%; min-height:96px; padding:12px 16px; text-align:left;
  border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface);
}
.team-library .team-row:hover { border-color:var(--line); border-top-color:var(--element-anemo-primary); }
.team-row > strong { min-width:0; font-size:var(--font-control); overflow-wrap:anywhere; }
.team-row-members { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px 12px; min-width:0; }
.team-row-arrow { width:18px; height:18px; justify-self:end; color:var(--muted); }
.team-empty { padding:24px 12px; text-align:center; color:var(--muted); }
.team-library .team-pagination { margin-top:0; }
.team-member-filter :deep(.picker-menu) { position:static; margin-top:5px; min-width:0; }
@media(max-width:600px) {
  .team-library .team-row { --team-portrait-size:56px; grid-template-columns:minmax(0,1fr) 20px; padding:12px; gap:8px; }
  .team-row-members { grid-column:1/-1; grid-row:2; gap:6px; }
  .team-row-arrow { grid-column:2; grid-row:1; }
}
</style>
