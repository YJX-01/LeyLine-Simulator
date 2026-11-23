<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import FilterActions from '../components/FilterActions.vue';
import FilterPanel from '../components/FilterPanel.vue';
import FavoriteFilter from '../components/FavoriteFilter.vue';
import TeamCard from '../components/TeamCard.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
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
import { useLibraryPreferencesStore } from '../stores/library-preferences';
import { useSavedTeamsStore, type SavedTeam } from '../stores/saved-teams';

const TeamEditorDialog = defineAsyncComponent(() => import('./TeamEditorDialog.vue'));
const props = defineProps<{ pick?: boolean; selectedId?: string }>();
const emit = defineEmits<{ inspect: [characterId: string, presetId: string]; select: [team: SavedTeam] }>();
const library = ref<HTMLElement>();
const saved = useSavedTeamsStore();
const accounts = useAccountStore();
const views = useLibraryViewStore();
const pickerView = reactive({ teamQuery: '', teamMember: '', teamFavorites: [] as string[], teamOffset: 0, teamSort: teamSortDefaults.key as string, teamDirection: teamSortDefaults.direction as 'asc' | 'desc' });
const browse = computed(() => props.pick ? pickerView : views.forAccount(accounts.account.id));
const preferences = useLibraryPreferencesStore();
const pageSize = computed(() => props.pick ? 5 : preferences.rows.teams);
const filterOpen = ref(false);
const sortOpen = ref(false);
const sortOptions = [
  { value: teamSortDefaults.key, label: '保存顺序' },
  { value: 'name', label: '队伍名称' },
  { value: 'favorite', label: '收藏等级' },
];
const filterCount = computed(() => Number(!!browse.value.teamMember) + browse.value.teamFavorites.length);
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
  : browse.value.teamSort === 'name' ? { asc: '名称正序', desc: '名称倒序' } : undefined);
const query = computed({
  get: () => browse.value.teamQuery,
  set: value => {
    browse.value.teamQuery = value;
    browse.value.teamOffset = 0;
  },
});
const matches = computed(() => {
  const term = query.value.trim().toLowerCase();
  const { teamMember, teamFavorites, teamSort, teamDirection } = browse.value;
  const filtered = saved.teams.filter(team => {
    const members = team.project.candidate.actors;
    if (teamMember && !members.some(member => teamMemberName(member) === teamMember)) return false;
    if (teamFavorites.length && !teamFavorites.includes(String(team.favorite ?? 0))) return false;
    return team.name.toLowerCase().includes(term)
      || members.some(member => teamMemberName(member).toLowerCase().includes(term));
  });
  if (teamSort === 'saved') return teamDirection === 'asc' ? filtered : filtered.reverse();
  const sign = teamDirection === 'asc' ? 1 : -1;
  if (teamSort === 'favorite') return filtered.sort((a, b) => sign * ((a.favorite ?? 0) - (b.favorite ?? 0)));
  return filtered.sort((a, b) => sign * a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
});
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / pageSize.value)));
const page = computed({
  get: () => Math.min(pages.value, Math.floor(browse.value.teamOffset / pageSize.value) + 1),
  set: value => { browse.value.teamOffset = (Math.max(1, Math.min(value, pages.value)) - 1) * pageSize.value; },
});
const visible = computed(() => matches.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
watch(() => matches.value.length, count => {
  if (browse.value.teamOffset >= count) browse.value.teamOffset = Math.max(0, count - 1);
}, { immediate: true });
watch(() => [browse.value.teamMember, browse.value.teamFavorites, browse.value.teamSort, browse.value.teamDirection], () => {
  browse.value.teamOffset = 0;
});

function resetFilters() {
  browse.value.teamMember = '';
  browse.value.teamFavorites = [];
}

function changeSort(key: string) {
  if (browse.value.teamSort === key) return;
  browse.value.teamSort = key;
  browse.value.teamDirection = key === 'favorite' ? 'desc' : teamSortDefaults.direction;
}

function resetSort() {
  browse.value.teamSort = teamSortDefaults.key;
  browse.value.teamDirection = teamSortDefaults.direction;
}

const activeTeam = shallowRef<SavedTeam | 'new'>();
const editor = ref<InstanceType<typeof import('./TeamEditorDialog.vue')['default']>>();
useLibraryScroll(() => 'teams', !props.pick);

function requestLeave(action: () => void) {
  if (editor.value) editor.value.requestLeave(action);
  else action();
}
defineExpose({ requestLeave });

function closeDeleted() {
  activeTeam.value = undefined;
  page.value = page.value;
  void nextTick(() => library.value?.querySelector<HTMLInputElement>('input[name=library-search]')?.focus({ preventScroll: true }));
}
</script>

<template>
  <section ref="library" class="team-library" :class="{ 'panel library-page': !pick }" aria-label="队伍">
    <LibraryCornerOrnaments v-if="!pick" />
    <LibraryToolbar v-model="query" label="搜索队伍" placeholder="搜索队伍名或队员名…"
      :filter-count="filterCount" :sorted="sorted" @filter="filterOpen = true" @sort="sortOpen = true" @reset="resetFilters(); resetSort()">
      <template v-if="!pick" #actions>
        <button type="button" class="ui-action library-primary-action" @click="activeTeam = 'new'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新建队伍
        </button>
      </template>
    </LibraryToolbar>
    <p v-if="saved.error" role="alert">{{ saved.error }}</p>
    <LibraryListHeader v-model:page="page" :pages="pages" :count="matches.length" :total="saved.teams.length" unit="支队伍" />
    <ul v-if="visible.length" class="team-list">
      <li v-for="team in visible" :key="team.id">
        <TeamCard :action="pick ? 'select' : 'detail'" :name="team.name" :members="team.project.candidate.actors" :favorite="team.favorite" :selected="pick && team.id === selectedId"
          :data-team-id="team.id" :aria-label="`${pick ? '选择' : '查看'}队伍 ${team.name}`"
          @click="pick ? emit('select', team) : activeTeam = team" />
      </li>
    </ul>
    <LibraryEmptyState v-else title="还没有保存的队伍" filtered-title="没有匹配的队伍" :filtered="!!saved.teams.length"
      :create-label="pick ? undefined : '新建队伍'" @create="activeTeam = 'new'" @clear="query = ''; resetFilters()" />
    <LibraryPagination v-model:page="page" class="team-pagination" :pages="pages" always position="底部" full />

    <WorkbenchDialog v-if="filterOpen" title="筛选队伍" size="filter" @close="filterOpen = false">
      <FilterPanel>
        <section>
          <h3>包含角色</h3>
          <SingleSelectPicker v-model="browse.teamMember" class="team-member-filter" label="包含角色" empty-label="全部角色"
            image-kind="characters" :options="memberOptions" allow-empty @clear="browse.teamMember = ''" />
        </section>
        <section><h3>收藏</h3><FavoriteFilter v-model="browse.teamFavorites" label="队伍收藏等级" /></section>
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
.team-library .team-pagination { margin-top:0; }
.team-member-filter :deep(.picker-menu) { position:static; margin-top:5px; min-width:0; }
</style>
