<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { getArtifactSet } from '@leyline/game-data';
import { buildSchema, type Build, type StatKey } from '@leyline/schema';
import ArtifactEquipmentGrid from '../components/ArtifactEquipmentGrid.vue';
import ArtifactPickerDialog from '../components/ArtifactPickerDialog.vue';
import ContextMenu from '../components/ContextMenu.vue';
import EditorActions from '../components/EditorActions.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import type { AccountArtifact, AccountCharacter, AccountSlot } from '../domain/account';
import { calculationArtifact } from '../domain/build-snapshot';
import { teamArtifactEntries } from '../domain/team-members';
import { useAccountStore } from '../stores/account';
import ArtifactDetail from './ArtifactDetail.vue';
import CharacterForm from './CharacterForm.vue';

const props = defineProps<{ character?: AccountCharacter; initialCharacterId?: string; name: string;
  equipment?: Pick<Build, 'artifacts' | 'sets'>; effectiveStats: readonly StatKey[] }>();
const emit = defineEmits<{ apply: [build: Build]; close: [] }>();
const accounts = useAccountStore();
const initial = props.equipment ?? props.character?.build ?? { artifacts: [], sets: [] };
const equipment = shallowRef<Pick<Build, 'artifacts' | 'sets'>>(initial);
const entries = computed(() => teamArtifactEntries(equipment.value, accounts.account));
const form = ref<InstanceType<typeof CharacterForm>>();
const cultivationDirty = ref(false), busy = ref(false), error = ref('');
const dirty = computed(() => cultivationDirty.value || equipment.value !== initial);
const { discardOpen, requestLeave, cancelDiscard, discardChanges, saveAndLeave } = useUnsavedChanges(dirty);
const picking = ref<AccountSlot>(), inspecting = shallowRef<AccountArtifact>();
const menu = ref<{ slot: AccountSlot; x: number; y: number }>();
const itemIn = (slot: AccountSlot) => entries.value.find(entry => entry.slot === slot)?.item;
function openMenu(slot: AccountSlot, event: MouseEvent | KeyboardEvent) {
  const trigger = event.currentTarget as HTMLElement, bounds = trigger.getBoundingClientRect();
  trigger.querySelector('button')?.focus({ preventScroll: true });
  menu.value = { slot, x: 'clientX' in event ? event.clientX : bounds.left + 12, y: 'clientY' in event ? event.clientY : bounds.top + 12 };
}
function menuAction(action: string) {
  const slot = menu.value?.slot;
  menu.value = undefined;
  if (!slot) return;
  if (action === 'details') inspecting.value = itemIn(slot);
  else if (action === 'replace') picking.value = slot;
  else void equip(slot);
}
async function equip(slot: AccountSlot, item?: AccountArtifact) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    const owner = accounts.account;
    if (item && (!item.real || item.mona?.setIdentityPending || item.slot !== slot)) throw new Error('所选实物的数值或套装身份待补全。');
    const artifacts = equipment.value.artifacts.filter(piece => piece.slot !== slot);
    if (item?.real) artifacts.push(calculationArtifact(item.real, owner.id));
    const sets = await Promise.all([...new Set(artifacts.map(piece => piece.setId))].filter(id => id !== 'none')
      .map(id => equipment.value.sets.find(set => set.id === id) ?? getArtifactSet(id)));
    if (owner !== accounts.account) throw new Error('账号已切换，请重新选择。');
    equipment.value = { artifacts, sets };
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '圣遗物未能更换。'; }
  finally { busy.value = false; picking.value = undefined; }
}
function restore() { form.value?.reset(); equipment.value = initial; error.value = ''; }
async function apply() {
  if (busy.value) return false;
  busy.value = true;
  try {
    const entry = await form.value?.prepare();
    if (!entry?.build) return false;
    emit('apply', buildSchema.parse({ ...entry.build, artifacts: equipment.value.artifacts, sets: equipment.value.sets }));
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '配装未能保存。';
    return false;
  } finally { busy.value = false; }
}
async function save() { if (await apply()) emit('close'); }
defineExpose({ requestLeave });
</script>

<template>
  <WorkbenchDialog editor center-title :title="name + ' · 角色配置'" :dirty="dirty" :before-close="requestLeave" @close="emit('close')">
    <template #header-leading><EditorActions :dirty="dirty" :busy="busy" :can-save="!!form?.canSave && (dirty || !character?.build)" @save="save" @restore="restore" /></template>
    <CharacterForm ref="form" candidate detached details resolve-identity :character="character" :initial-character-id="initialCharacterId" @dirty-change="cultivationDirty = $event" />
    <section class="editor-artifacts"><h3>圣遗物</h3>
      <ArtifactEquipmentGrid :entries="entries" :wearers="[]" :effective-stats="effectiveStats" :busy="busy"
        popup inspect-primary context-menu @change="picking = $event" @inspect="inspecting = itemIn($event)" @menu="openMenu" />
    </section>
    <p v-if="error" role="alert">{{ error }}</p>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" label="圣遗物操作" :options="[{ id:'details', label:'查看详情' }, { id:'replace', label:'替换' }, { id:'remove', label:'卸下', danger:true }]"
      @close="menu = undefined" @select="menuAction" />
    <ArtifactDetail v-if="inspecting" :item="inspecting" readonly @close="inspecting = undefined" />
    <ArtifactPickerDialog v-if="picking" :slot="picking" :current="itemIn(picking)" :account="accounts.account" :effective-stats="effectiveStats"
      @close="picking = undefined" @remove="equip(picking!)" @select="equip(picking!, $event)" />
    <UnsavedChangesDialog v-if="discardOpen" :busy="busy" @continue="cancelDiscard" @discard="discardChanges" @save="saveAndLeave(apply)" />
  </WorkbenchDialog>
</template>

<style scoped>
.editor-artifacts { margin-top:18px; }
.editor-artifacts h3 { margin:0 0 12px; font-size:var(--font-control); }
</style>
