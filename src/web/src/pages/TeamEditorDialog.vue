<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, shallowRef, useId } from 'vue';
import { projectSchema, type Build } from '@leyline/schema';
import CharacterEquipmentIcons from '../components/CharacterEquipmentIcons.vue';
import EditorActions from '../components/EditorActions.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import { addActorFromBuild } from '../domain/real-project';
import { prepareTeamMember, teamMemberName, teamSize } from '../domain/team-members';
import { createEmptyProject, removeProjectActor } from '../domain/workbench-project';
import { localDataErrorLabel } from '../domain/workbench-labels';
import { useAccountStore } from '../stores/account';
import { useSavedTeamsStore, type SavedTeam } from '../stores/saved-teams';

const CharacterSelectionDialog = defineAsyncComponent(() => import('../components/CharacterSelectionDialog.vue'));
const TeamLoadoutEditor = defineAsyncComponent(() => import('./TeamLoadoutEditor.vue'));
const props = defineProps<{ team?: SavedTeam }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const original = props.team;
const title = original ? '编辑队伍' : '新建队伍';
const formId = useId();
const initialProject = original ? projectSchema.parse(original.project) : createEmptyProject();
const draft = shallowRef(initialProject);
const name = ref(original?.name ?? '');
const members = computed(() => draft.value.candidate.actors);
const slots = computed(() => Array.from({ length: Math.max(teamSize, members.value.length) }, (_, index) => members.value[index]));
const dirty = computed(() => draft.value !== initialProject || name.value !== (original?.name ?? ''));
const canSave = computed(() => dirty.value && Boolean(name.value.trim()) && members.value.length > 0);
const { discardOpen, requestLeave, cancelDiscard, discardChanges, saveAndLeave } = useUnsavedChanges(dirty);
const accounts = useAccountStore();
const saved = useSavedTeamsStore();
const form = ref<HTMLFormElement>();
const picking = ref(false);
const adding = ref(false);
const pickError = ref('');
const error = ref('');
const editMember = ref<string>();
const loadout = ref<InstanceType<typeof import('./TeamLoadoutEditor.vue')['default']>>();
let selection = 0;
onBeforeUnmount(() => { selection++; });

function leave(action: () => void) {
  if (loadout.value) {
    loadout.value.requestLeave(() => {
      editMember.value = undefined;
      requestLeave(action);
    });
  } else {
    requestLeave(action);
  }
}
defineExpose({ requestLeave: leave });

function openPicker() {
  pickError.value = '';
  picking.value = true;
}
function closePicker() {
  picking.value = false;
  selection++;
}
function focusRoster() {
  nextTick(() => {
    const target = form.value?.querySelector<HTMLElement>('.team-add-slot')
      ?? form.value?.querySelector<HTMLElement>('.team-member-edit:not(:disabled)')
      ?? form.value?.querySelector('input');
    target?.focus({ preventScroll: true });
  });
}
async function addMember(id: string) {
  if (!picking.value || adding.value) return;
  const request = selection;
  const project = draft.value;
  const account = accounts.account;
  adding.value = true;
  pickError.value = '';
  try {
    const member = await prepareTeamMember(project, account, id);
    if (selection !== request) return;
    if (accounts.account !== account || draft.value !== project) throw new Error('资料已变化，请重新选择队员。');
    const next = structuredClone(project);
    addActorFromBuild(next, member.build, member.name);
    draft.value = next;
    closePicker();
    focusRoster();
  } catch (cause) {
    if (selection === request) pickError.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '队员未能添加，请重试。';
  } finally {
    adding.value = false;
  }
}
function removeMember(id: string) {
  const next = structuredClone(draft.value);
  removeProjectActor(next, id);
  if (!initialProject.candidate.actors.some(actor => actor.id === id)) {
    next.definitions = next.definitions.filter(definition => !definition.id.startsWith(`${id}-`));
  }
  draft.value = next;
  focusRoster();
}
function applyBuild(id: string, build: Build) {
  const project = draft.value;
  const actors = project.candidate.actors.map(actor => actor.id === id ? { ...actor, build } : actor);
  draft.value = { ...project, candidate: { ...project.candidate, actors } };
}
function closeLoadout() {
  const close = () => { editMember.value = undefined; };
  if (loadout.value) loadout.value.requestLeave(close);
  else close();
}
function persist(): SavedTeam | undefined {
  error.value = '';
  try {
    return saved.save(name.value, draft.value, original);
  } catch (cause) {
    error.value = cause instanceof Error ? localDataErrorLabel(cause.message) : '队伍未能保存，请重试。';
    return undefined;
  }
}
function submit() {
  if (!canSave.value) return;
  const team = persist();
  if (team) emit('saved', team.id);
}
</script>

<template>
  <WorkbenchDialog :title="title" class="team-editor" editor center-title @close="leave(() => emit('close'))">
    <template #header-leading>
      <button type="submit" :form="formId" class="ui-action" data-size="md" :disabled="!canSave">保存队伍</button>
    </template>
    <form :id="formId" ref="form" class="team-form" @submit.prevent="submit">
      <label class="team-name-field">队伍名称
        <input v-model="name" name="team-name" autocomplete="off" maxlength="160" required placeholder="输入队伍名称">
      </label>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="team-roster-heading">
        <h3>队员</h3>
        <span class="library-page-status">{{ members.length }} / {{ Math.max(teamSize, members.length) }}</span>
      </div>
      <ol class="team-slots">
        <li v-for="(member, index) in slots" :key="member?.id ?? index" class="team-slot">
          <article v-if="member" class="library-section team-editor-member">
            <h4>{{ teamMemberName(member) }}</h4>
            <CharacterEquipmentIcons :build="member.build" :name="teamMemberName(member)" :size="64" />
            <p class="library-page-status">{{ member.build?.weapon.name ?? '培养与武器待补全' }}</p>
            <div class="library-page-actions">
              <button type="button" class="ui-action soft team-member-edit" data-size="md" :disabled="!member.build"
                :aria-label="`编辑${teamMemberName(member)}配装`" @click="editMember = member.id">编辑配装</button>
              <button type="button" class="ui-action soft" data-accent="pyro" data-size="md"
                :aria-label="`移除${teamMemberName(member)}`" @click="removeMember(member.id)">移除</button>
            </div>
          </article>
          <button v-else-if="index === members.length" type="button" class="team-add-slot" @click="openPicker">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>选择队员
          </button>
          <span v-else class="team-empty-slot">空位</span>
        </li>
      </ol>
    </form>

    <CharacterSelectionDialog v-if="picking" title="选择队员" @close="closePicker" @select="addMember">
      <p v-if="pickError" class="team-pick-error" role="alert">{{ pickError }}</p>
    </CharacterSelectionDialog>
    <WorkbenchDialog v-if="editMember" editor title="修改队员配装" @close="closeLoadout">
      <template #header-leading>
        <EditorActions :dirty="!!loadout?.dirty" :busy="loadout?.busy" @save="loadout?.save()" @restore="loadout?.restore()" />
      </template>
      <TeamLoadoutEditor :key="editMember" ref="loadout" :project="draft" :actor-id="editMember" :apply-build="applyBuild" />
    </WorkbenchDialog>
    <UnsavedChangesDialog v-if="discardOpen" @save="saveAndLeave(() => !!persist())"
      @continue="cancelDiscard" @discard="discardChanges" />
  </WorkbenchDialog>
</template>

<style scoped>
.team-form { display:grid; gap:12px; min-width:0; }
.team-name-field { width:min(100%,420px); }
.team-roster-heading { display:flex; align-items:baseline; gap:10px; margin-top:6px; }
.team-slots { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,176px),1fr)); gap:12px; margin:0; padding:0; list-style:none; }
.team-slot { display:grid; min-width:0; min-height:148px; }
.team-editor .team-editor-member { display:grid; align-content:start; gap:8px; overflow-wrap:anywhere; }
.team-editor-member h4 { margin:0; font-size:var(--font-control); }
.team-add-slot,.team-empty-slot {
  display:flex; align-items:center; justify-content:center; gap:8px; min-height:var(--control-height-lg);
  padding:12px; border:1px dashed var(--line); border-radius:10px; color:var(--muted);
}
.team-editor .team-add-slot { color:var(--element-anemo-deep); background:var(--element-anemo-light); font-size:var(--font-control); font-weight:700; }
.team-add-slot svg { width:16px; height:16px; }
.team-pick-error { padding-bottom:8px; }
@media(max-width:600px) {
  .team-slots { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .team-editor .team-editor-member { padding:10px; }
  .team-editor .team-editor-member :deep(.character-equipment-icons) { gap:4px; padding-inline:0; }
}
@media(max-width:374px) {
  .team-slots { grid-template-columns:minmax(0,1fr); }
}
</style>
