<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, toRaw } from 'vue';
import type { Project } from '@leyline/schema';
import SlotPlaceholder from '../components/SlotPlaceholder.vue';
import LibraryNavIcon from '../components/LibraryNavIcon.vue';
import CharacterConfigurationCard from '../components/CharacterConfigurationCard.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import ContextMenu from '../components/ContextMenu.vue';
import EditorActions from '../components/EditorActions.vue';
import EditorNameField from '../components/EditorNameField.vue';
import FavoriteControl from '../components/FavoriteControl.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import { accountConfigurations, hasLocalConfiguration } from '../domain/account-configurations';
import { effectiveTotal } from '../domain/artifact-combinations';
import { defaultEffectiveStats, equipmentConfigurationLabel } from '../domain/character-loadout-name';
import { buildRollBasis } from '../domain/effective-roll-basis';
import { addActorFromBuild } from '../domain/real-project';
import { matchingTeamConfiguration, prepareTeamMember, teamArtifactEntries, teamMemberName, teamSize, type TeamSlot } from '../domain/team-members';
import { createEmptyProject, removeProjectActor } from '../domain/workbench-project';
import { localDataErrorLabel } from '../domain/workbench-labels';
import { useAccountStore } from '../stores/account';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import { teamNameLimit, useSavedTeamsStore, type SavedTeam } from '../stores/saved-teams';

const CharacterCatalogBrowser = defineAsyncComponent(() => import('../components/CharacterCatalogBrowser.vue'));
const ManualCharacterImport = defineAsyncComponent(() => import('./ManualCharacterImport.vue'));
const CharacterConfigurationList = defineAsyncComponent(() => import('./CharacterConfigurationList.vue'));
const props = defineProps<{ team?: SavedTeam }>();
const emit = defineEmits<{ close: []; deleted: []; inspect: [characterId: string, presetId: string] }>();
const original = shallowRef(props.team);
const accounts = useAccountStore();
const loadouts = useCharacterLoadoutsStore();
const saved = useSavedTeamsStore();
const emptyBasis = buildRollBasis();

interface TeamDraft { project: Project; roster: (TeamSlot | null)[] }
function teamDraft(team?: SavedTeam): TeamDraft {
  const project = team ? toRaw(team.project) : createEmptyProject();
  const actors = project.candidate.actors;
  const roster = team?.slots ? toRaw(team.slots) : Array.from({ length: Math.max(teamSize, actors.length) }, (_, index) =>
    actors[index] ? { actorId: actors[index].id } : null);
  return { project, roster };
}
const savedDraft = shallowRef(teamDraft(props.team));
const draft = shallowRef(savedDraft.value);
const customName = ref(original.value?.name);
const members = computed(() => draft.value.project.candidate.actors);
const slots = computed(() => {
  const actors = new Map(members.value.map(member => [member.id, member]));
  return draft.value.roster.map(slot => {
    if (!slot) return undefined;
    const member = actors.get(slot.actorId)!;
    const name = teamMemberName(member);
    const configuration = slot.configuration;
    const build = member.build;
    const entries = teamArtifactEntries(build);
    const items = entries.flatMap(entry => entry.item ? [entry.item] : []);
    const basis = buildRollBasis(build);
    const stats = configuration ? loadouts.effectiveStats(configuration.accountId, configuration.characterId, name) : defaultEffectiveStats(name);
    const favorite = configuration?.accountId === accounts.account.id
      ? loadouts.favoriteLevel(configuration.accountId, configuration.characterId, configuration.presetId) : undefined;
    const label = build && equipmentConfigurationLabel(items, stats, build.sets, basis, build.weapon?.name ?? '未配武器', effectiveTotal(items, stats, basis) ?? 0);
    return { member, name, configuration, entries, basis, stats, label, favorite };
  });
});
type OccupiedSlot = NonNullable<typeof slots.value[number]>;
const name = computed({
  get: () => customName.value ?? members.value.map(teamMemberName).join(' / ').slice(0, teamNameLimit).trimEnd(),
  set: (value: string) => { customName.value = value; },
});
const dirty = computed(() => draft.value !== savedDraft.value || name.value !== (original.value?.name ?? ''));
const canSaveAs = computed(() => Boolean(name.value.trim()) && members.value.length > 0);
const canSave = computed(() => dirty.value && canSaveAs.value);
const { discardOpen, requestLeave, cancelDiscard, discardChanges, saveAndLeave } = useUnsavedChanges(dirty);
defineExpose({ requestLeave });

const form = ref<HTMLFormElement>();
type MemberSource = 'local' | 'catalog';
const picker = shallowRef<{ index: number; characterId?: string }>();
const memberSource = ref<MemberSource>();
const catalogCharacter = shallowRef<{ id: string; name: string }>();
const sourceChoices = [{ value: 'local', label: '本地' }, { value: 'catalog', label: '全部角色' }];
const adding = ref(false);
const pickError = ref('');
const error = ref('');
const deleting = ref(false);
const menu = ref<{ index: number; x: number; y: number }>();
const inspecting = shallowRef<OccupiedSlot>();
const pickedSlot = computed(() => picker.value && slots.value[picker.value.index]);

function matchingCharacterId(slot: OccupiedSlot) {
  const account = accounts.account;
  const reference = slot.configuration ?? slot.member.accountSnapshot;
  if (reference?.accountId === account.id && account.characters.some(character => character.id === reference.characterId)) return reference.characterId;
  const character = slot.member.build?.character;
  if (!character) return undefined;
  return accountConfigurations(account, loadouts.loadouts).find(configuration => {
    const candidate = configuration.character.build?.character;
    return candidate?.id === character.id && candidate.namespace === character.namespace;
  })?.character.id;
}
function openMemberBrowser() {
  const account = accounts.account;
  const local = account.characters.some(hasLocalConfiguration) || loadouts.loadouts.some(entry => entry.accountId === account.id);
  pickError.value = '';
  memberSource.value = local ? 'local' : 'catalog';
}
function openPicker(index: number) {
  const slot = slots.value[index];
  pickError.value = '';
  picker.value = { index, characterId: slot && matchingCharacterId(slot) };
  if (!slot) openMemberBrowser();
}
function changeSource(source: unknown) {
  if (!picker.value || (source !== 'local' && source !== 'catalog')) return;
  pickError.value = '';
  memberSource.value = source;
}
function configureCharacter(entry: { id: string; name: string }) {
  const selection = picker.value;
  if (!selection) return;
  if (slots.value.some((slot, index) => index !== selection.index && slot?.member.build?.character.id === entry.id)) {
    pickError.value = '队伍已经有这位角色。';
    return;
  }
  pickError.value = '';
  catalogCharacter.value = entry;
}
function closePicker() {
  catalogCharacter.value = undefined;
  memberSource.value = undefined;
  picker.value = undefined;
}
function closeMemberBrowser() {
  memberSource.value = undefined;
  pickError.value = '';
  if (!pickedSlot.value) closePicker();
}
function focusSlot(index: number) {
  void nextTick(() => requestAnimationFrame(() => {
    const target = form.value?.querySelector<HTMLButtonElement>(`.team-slot[data-slot="${index + 1}"] :is(.team-add-slot, .replace-portrait)`);
    // Nested native dialogs finish restoring focus before the edited slot takes it back.
    if (target && target.closest('dialog') === Array.from(document.querySelectorAll('dialog[open]')).at(-1)) {
      target.focus({ preventScroll: true });
    }
  }));
}
function projectWithoutSlot(current: TeamDraft, index: number) {
  const project = structuredClone(current.project);
  const slot = current.roster[index];
  if (slot) {
    const id = slot.actorId;
    removeProjectActor(project, id);
    if (slot.configuration) {
      const generated = new Set([`${id}-character`, `${id}-weapon`, `${id}-real-damage`]);
      project.definitions = project.definitions.filter(definition => !generated.has(definition.id));
    }
  }
  return project;
}
async function selectMember(characterId: string, presetId = '') {
  const selection = picker.value;
  const sourceAtSelection = memberSource.value;
  if (!selection || adding.value) return;
  const current = draft.value;
  const account = accounts.account;
  const preset = presetId ? loadouts.loadouts.find(item => item.id === presetId && item.accountId === account.id && item.characterId === characterId) : undefined;
  adding.value = true;
  pickError.value = '';
  try {
    if (presetId && !preset) throw new Error('配置已变化，请重新选择。');
    const source = preset?.snapshot ?? account;
    const character = source.characters.find(entry => entry.id === characterId);
    if (character && !character.build) {
      emit('inspect', characterId, presetId);
      return;
    }
    const project = projectWithoutSlot(current, selection.index);
    const member = await prepareTeamMember(project, account, characterId, source);
    if (picker.value !== selection || memberSource.value !== sourceAtSelection) return;
    if (accounts.account !== account || draft.value !== current || (preset && !loadouts.loadouts.includes(preset))) throw new Error('资料已变化，请重新选择队员。');
    const actorId = addActorFromBuild(project, member.build, member.name);
    const roster = [...current.roster];
    roster[selection.index] = { actorId, configuration: { accountId: account.id, characterId, presetId } };
    const actors = new Map(project.candidate.actors.map(actor => [actor.id, actor]));
    project.candidate.actors = roster.flatMap(slot => slot ? [actors.get(slot.actorId)!] : []);
    draft.value = { project, roster };
    closePicker();
    focusSlot(selection.index);
  } catch (cause) {
    if (picker.value === selection && memberSource.value === sourceAtSelection) pickError.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '队员未能添加，请重试。';
  } finally {
    adding.value = false;
  }
}
function clearSlot(index: number) {
  const current = draft.value;
  const roster = [...current.roster];
  roster[index] = null;
  draft.value = { project: projectWithoutSlot(current, index), roster };
  closePicker();
  focusSlot(index);
}
function openMenu(event: MouseEvent | KeyboardEvent, index: number) {
  const trigger = (event.target as HTMLElement).closest('button') ?? (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('.configuration-open');
  if (!trigger) return;
  event.preventDefault();
  trigger.focus({ preventScroll: true });
  const bounds = trigger.getBoundingClientRect();
  menu.value = { index, x: 'clientX' in event ? event.clientX : bounds.left + 12, y: 'clientY' in event ? event.clientY : bounds.top + 12 };
}
function menuKey(event: KeyboardEvent, index: number) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event, index);
}
async function menuAction(action: string) {
  const index = menu.value?.index;
  menu.value = undefined;
  if (index === undefined) return;
  await nextTick();
  if (action === 'replace') {
    openPicker(index);
    return;
  }
  inspectSlot(index);
}
function inspectSlot(index: number) {
  const slot = slots.value[index];
  if (!slot) return;
  const account = accounts.account;
  const reference = slot.configuration ?? matchingTeamConfiguration(slot.member.build, accountConfigurations(account, loadouts.loadouts));
  const character = reference?.accountId === account.id && account.characters.find(item => item.id === reference.characterId);
  if (character && reference && (reference.presetId
    ? loadouts.loadouts.some(item => item.id === reference.presetId && item.accountId === account.id && item.characterId === character.id)
    : hasLocalConfiguration(character))) {
    emit('inspect', reference.characterId, reference.presetId);
  } else {
    inspecting.value = slot;
  }
}
function restore() {
  draft.value = savedDraft.value;
  customName.value = original.value?.name;
  error.value = '';
}
function save(asCopy = false) {
  error.value = '';
  try {
    const team = saved.save(name.value, draft.value.project, asCopy ? undefined : original.value, draft.value.roster);
    original.value = team;
    savedDraft.value = teamDraft(team);
    restore();
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '队伍未能保存，请重试。';
    return false;
  }
}
function setFavorite(level: number) {
  if (!original.value) return;
  try {
    original.value = saved.setFavorite(original.value, level);
    error.value = '';
  } catch (cause) {
    error.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '收藏未保存。';
  }
}
function removeTeam() {
  if (!original.value) return;
  deleting.value = false;
  try {
    saved.remove(original.value);
    emit('deleted');
  } catch (cause) {
    error.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '队伍未能删除，请重试。';
  }
}
</script>

<template>
  <WorkbenchDialog :title="original ? '队伍详情' : '新建队伍'" class="team-editor" editor center-title
    :dirty="dirty" :before-close="requestLeave" @close="emit('close')">
    <template #header-leading>
      <EditorActions :dirty="dirty" :can-save="canSave" :allow-save-as="!!original" :can-save-as="canSaveAs"
        @save="save()" @save-as="save(true)" @restore="restore" />
      <button v-if="original" type="button" class="ui-action soft" data-size="md" data-accent="pyro" @click="deleting = true">删除</button>
    </template>
    <template v-if="original" #header-trailing>
      <FavoriteControl label="设置队伍收藏" :level="original.favorite ?? 0" @change="setFavorite" />
    </template>
    <form ref="form" class="team-form" @submit.prevent="canSave && save()">
      <EditorNameField v-model="name" label="队伍名称" placeholder="输入队伍名称" :max-length="teamNameLimit" required
        :automatic="customName === undefined" :can-generate="!!members.length" @generate="customName = undefined" />
      <p v-if="error" role="alert">{{ error }}</p>
      <ol class="team-slots" aria-label="队员槽" role="list">
        <li v-for="(slot, index) in slots" :key="index" :data-slot="index + 1" class="team-slot">
          <CharacterConfigurationCard v-if="slot" class="team-configuration equipment-slot-card" data-density="compact" compact truncate-name :character-name="slot.name"
            :configuration-name="slot.label" :favorite="slot.favorite" :build="slot.member.build" :entries="slot.entries" :basis="slot.basis" :effective-stats="slot.stats"
            :open-label="`查看${slot.name}的配置详情`" :replace-label="`选择${slot.name}的角色配置`"
            @open="inspectSlot(index)" @replace="openPicker(index)" @contextmenu="openMenu($event, index)" @open-keydown="menuKey($event, index)" />
          <button v-else type="button" class="team-add-slot equipment-slot-card" data-density="compact" data-empty="true" data-card-action="select" @click="openPicker(index)">
            <SlotPlaceholder :label="'选择队员' + (index + 1)"><LibraryNavIcon kind="person" /></SlotPlaceholder>
          </button>
        </li>
        <!-- One noninteractive card sizes all rows, even when the team is empty. -->
        <li class="team-slot-size" aria-hidden="true" inert>
          <CharacterConfigurationCard class="team-configuration equipment-slot-card" data-density="compact"
            compact truncate-name character-name="角色" :entries="[]" :basis="emptyBasis" />
        </li>
      </ol>
    </form>

    <WorkbenchDialog v-if="picker && pickedSlot" class="team-configuration-picker" title="选择角色配置" center-title @close="closePicker">
      <template #header-leading>
        <button type="button" class="ui-action soft member-switch" data-size="md" data-accent="hydro" @click="openMemberBrowser">切换其他角色</button>
        <button type="button" class="ui-action soft" data-size="md" data-accent="pyro" @click="clearSlot(picker.index)">移除队员</button>
      </template>
      <p v-if="pickError && !memberSource" class="team-pick-error" role="alert">{{ pickError }}</p>
      <CharacterConfigurationList v-if="picker.characterId" :character-id="picker.characterId" selectable selection-only @select="selectMember" />
      <p v-else>当前账号没有{{ pickedSlot.name }}的配置。</p>
    </WorkbenchDialog>
    <WorkbenchDialog v-if="picker && memberSource" title="选择队员" center-title @close="closeMemberBrowser">
      <template #header-leading>
        <ChoiceGroup joined small tone="hydro" label="角色资料来源" :model-value="memberSource" :options="sourceChoices" @update:model-value="changeSource" />
      </template>
      <p v-if="pickError" class="team-pick-error" role="alert">{{ pickError }}</p>
      <KeepAlive>
        <CharacterCatalogBrowser v-if="memberSource === 'catalog'" @select="configureCharacter" />
        <CharacterConfigurationList v-else selectable selection-only @select="selectMember" />
      </KeepAlive>
      <ManualCharacterImport v-if="catalogCharacter" :initial-character="catalogCharacter" select-on-save
        @saved="selectMember" @close="catalogCharacter=undefined" />
    </WorkbenchDialog>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" label="队员操作"
      :options="[{ id: 'details', label: '查看详情' }, { id: 'replace', label: '替换' }]" @close="menu = undefined" @select="menuAction" />
    <WorkbenchDialog v-if="inspecting" :title="`${inspecting.name}的配装快照`" editor center-title @close="inspecting = undefined">
      <CharacterConfigurationCard :character-name="inspecting.name" :configuration-name="inspecting.label"
        :build="inspecting.member.build" :entries="inspecting.entries" :basis="inspecting.basis" :effective-stats="inspecting.stats" />
    </WorkbenchDialog>
    <ConfirmationDialog v-if="deleting && original" title="删除队伍？" confirm-label="删除" @cancel="deleting = false" @confirm="removeTeam">
      <p>将删除已保存的「{{ original.name }}」。</p>
      <p v-if="dirty">此队伍的编辑草稿也会一并删除。</p>
    </ConfirmationDialog>
    <UnsavedChangesDialog v-if="discardOpen" @save="saveAndLeave(save)" @continue="cancelDiscard" @discard="discardChanges" />
  </WorkbenchDialog>
</template>

<style scoped>
.team-form { display:grid; gap:16px; min-width:0; }
.team-slots { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-auto-rows:1fr; gap:8px; margin:0; padding:0; list-style:none; }
.team-slot { display:grid; min-width:0; min-height:0; contain:size; }
.team-slot[data-slot="1"], .team-slot-size { grid-area:1 / 1; }
.team-slot-size { min-width:0; visibility:hidden; pointer-events:none; }
.team-configuration { align-content:start; }
.team-configuration :deep(.configuration-top) { min-height:var(--control-height-md); }
.team-configuration :deep(.configuration-title > span:first-child) { overflow:hidden; text-overflow:ellipsis; flex-shrink:0; max-width:100%; }
.team-configuration :deep(.configuration-name) { max-width:none; }
.team-slot .team-add-slot[data-empty] { min-height:0; }
.team-add-slot .library-nav-icon { width:40px; height:40px; }
.team-pick-error { padding-bottom:8px; }
@media(max-width:850px) {
  .team-editor > :deep(header) { grid-template-columns:72px minmax(0,1fr) 72px; }
  .team-editor > :deep(header .dialog-trailing) { display:flex; }
  .team-configuration-picker > :deep(header) {
    grid-template-columns:minmax(max-content,1fr) minmax(0,max-content) minmax(var(--control-height-md),1fr);
  }
  .team-configuration-picker > :deep(header .dialog-leading) { grid-column:1; grid-row:1; flex-wrap:nowrap; }
}
@media(max-width:480px) {
  .team-configuration-picker { width:calc(100vw - 16px); max-width:calc(100vw - 16px); }
  .team-configuration-picker > :deep(header) { grid-template-columns:max-content minmax(0,1fr) var(--control-height-md); padding:8px; gap:4px; }
  .team-configuration-picker > :deep(header .dialog-leading) { gap:4px; }
  .team-configuration-picker > :deep(header .dialog-leading button) { padding-inline:5px; }
}
@media(max-width:520px) {
  .team-slots { grid-template-columns:minmax(0,1fr); }
}
</style>
