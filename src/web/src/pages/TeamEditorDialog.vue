<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, toRaw } from 'vue';
import type { Project } from '@leyline/schema';
import CharacterConfigurationCard from '../components/CharacterConfigurationCard.vue';
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

const CharacterSelectionDialog = defineAsyncComponent(() => import('../components/CharacterSelectionDialog.vue'));
const CharacterConfigurationList = defineAsyncComponent(() => import('./CharacterConfigurationList.vue'));
const props = defineProps<{ team?: SavedTeam }>();
const emit = defineEmits<{ close: []; deleted: []; inspect: [characterId: string, presetId: string] }>();
const original = shallowRef(props.team);
const accounts = useAccountStore();
const loadouts = useCharacterLoadoutsStore();
const saved = useSavedTeamsStore();

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
    const label = build && equipmentConfigurationLabel(items, stats, build.sets, basis, build.weapon.name, effectiveTotal(items, stats, basis) ?? 0);
    return { member, name, configuration, entries, basis, stats, label };
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
const picker = shallowRef<{ index: number; characterId?: string; characterName?: string }>();
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
function openPicker(index: number, replaceCharacter = false) {
  pickError.value = '';
  const slot = slots.value[index];
  picker.value = original.value && slot && !replaceCharacter
    ? { index, characterId: matchingCharacterId(slot), characterName: slot.name }
    : { index };
}
function closePicker() {
  picker.value = undefined;
}
function focusSlot(index: number) {
  void nextTick(() => form.value?.querySelector<HTMLButtonElement>(`.team-slot[data-slot="${index + 1}"] button`)?.focus({ preventScroll: true }));
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
  if (!selection || adding.value) return;
  const current = draft.value;
  const account = accounts.account;
  const preset = presetId ? loadouts.loadouts.find(item => item.id === presetId && item.accountId === account.id && item.characterId === characterId) : undefined;
  adding.value = true;
  pickError.value = '';
  try {
    if (presetId && !preset) throw new Error('配置已变化，请重新选择。');
    const project = projectWithoutSlot(current, selection.index);
    const member = await prepareTeamMember(project, account, characterId, preset?.snapshot ?? account);
    if (picker.value !== selection) return;
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
    if (picker.value === selection) pickError.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '队员未能添加，请重试。';
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
  const trigger = (event.currentTarget as HTMLElement).closest('.team-slot')?.querySelector<HTMLButtonElement>('.configuration-open');
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
    openPicker(index, true);
    return;
  }
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
          <CharacterConfigurationCard v-if="slot" class="team-configuration" compact :character-name="slot.name"
            :configuration-name="slot.label" :build="slot.member.build" :entries="slot.entries" :basis="slot.basis" :effective-stats="slot.stats"
            :open-label="original ? `选择${slot.name}的角色配置` : `更换队员${index + 1}`"
            @open="openPicker(index)" @contextmenu="openMenu($event, index)" @open-keydown="menuKey($event, index)" />
          <button v-else type="button" class="team-add-slot" @click="openPicker(index)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>选择队员{{ index + 1 }}
          </button>
        </li>
      </ol>
    </form>

    <CharacterSelectionDialog v-if="picker && !original" title="选择角色" :selected-id="pickedSlot?.configuration?.characterId"
      @close="closePicker" @select="selectMember($event)">
      <template v-if="pickedSlot" #header-leading>
        <button type="button" class="ui-action soft" data-size="md" data-accent="pyro" @click="clearSlot(picker.index)">移除队员</button>
      </template>
      <p v-if="pickError" class="team-pick-error" role="alert">{{ pickError }}</p>
    </CharacterSelectionDialog>
    <WorkbenchDialog v-if="picker && original" title="选择角色配置" center-title @close="closePicker">
      <template v-if="pickedSlot" #header-leading>
        <button type="button" class="ui-action soft" data-size="md" data-accent="pyro" @click="clearSlot(picker.index)">移除队员</button>
      </template>
      <p v-if="pickError" class="team-pick-error" role="alert">{{ pickError }}</p>
      <p v-if="picker.characterName && !picker.characterId">当前账号没有{{ picker.characterName }}的配置。</p>
      <CharacterConfigurationList v-else :character-id="picker.characterId" selectable selection-only @select="selectMember" />
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
.team-slots { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-auto-rows:1fr; gap:12px; margin:0; padding:0; list-style:none; }
.team-slot { display:grid; min-width:0; min-height:120px; }
.team-configuration { align-content:start; }
.team-configuration :deep(.configuration-top) { min-height:var(--control-height-md); }
.team-configuration:hover { border-top-color:var(--element-anemo-primary); }
.team-editor .team-add-slot {
  display:flex; align-items:center; justify-content:center; gap:8px; min-height:var(--control-height-lg);
  padding:12px; border:1px dashed var(--line); border-radius:10px; color:var(--element-anemo-deep);
  background:var(--element-anemo-light); font-size:var(--font-control); font-weight:700;
}
.team-add-slot svg { width:16px; height:16px; }
.team-pick-error { padding-bottom:8px; }
@media(max-width:850px) {
  .team-editor > :deep(header) { grid-template-columns:72px minmax(0,1fr) 72px; }
  .team-editor > :deep(header .dialog-trailing) { display:flex; }
}
@media(max-width:520px) {
  .team-slots { grid-template-columns:minmax(0,1fr); grid-auto-rows:auto; gap:8px; }
  .team-slot { min-height:72px; }
}
</style>
