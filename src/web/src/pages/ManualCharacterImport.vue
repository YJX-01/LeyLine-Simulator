<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { useAccountStore } from '../stores/account';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import CharacterForm from './CharacterForm.vue';
import CharacterCatalogBrowser from '../components/CharacterCatalogBrowser.vue';
import ImportActions from '../components/ImportActions.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
const props = defineProps<{ initialCharacter?: { id: string; name: string }; reuseLocal?: boolean; selectOnSave?: boolean }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const accounts = useAccountStore();
const original = shallowRef(accounts.account);
const selected = shallowRef(props.initialCharacter);
function choose(character: { id: string; name: string }) {
  original.value = accounts.account;
  selected.value = character;
}
const existing = computed(() => {
  const choice = selected.value;
  if (!props.reuseLocal || !choice) return;
  return original.value.characters.find(character => character.build
    ? character.build.character.id === choice.id
    : character.showcase?.build.character.id === choice.id || character.name === choice.name);
});
const dirty = ref(false), error = ref(''), busy = ref(false);
const form = ref<InstanceType<typeof CharacterForm>>();
const guard = useUnsavedChanges(dirty);
const useExisting = computed(() => props.selectOnSave && !!existing.value?.build && !dirty.value);
const confirmLabel = computed(() => props.selectOnSave ? (useExisting.value ? '选用当前配置' : '保存并选用') : '保存角色资料');
function finish(id: string) { emit('saved', id); emit('close'); }
function back() {
  guard.requestLeave(() => {
    if (props.initialCharacter) emit('close');
    else { selected.value = undefined; dirty.value = false; error.value = ''; }
  });
}
async function save(notify = true) {
  if (busy.value) return false;
  if (accounts.account !== original.value) { error.value = '账号资料已变化，请重新打开。'; return false; }
  if (!form.value?.canSave) { error.value = '请选择武器后再保存。'; return false; }
  if (useExisting.value && existing.value) {
    if (notify) finish(existing.value.id);
    return true;
  }
  busy.value = true;
  try { return await form.value.apply(notify); }
  finally { busy.value = false; }
}
</script>
<template>
  <WorkbenchDialog :title="existing ? '设置角色配置' : '手动添加角色'" sticky-footer :dirty="dirty" :before-close="guard.requestLeave" @close="emit('close')">
    <template v-if="selected" #header-leading>
      <button class="ui-action soft" data-size="md" aria-label="返回角色列表" @click="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>返回</button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="!initialCharacter" v-show="!selected">
      <CharacterCatalogBrowser :selected-id="selected?.id" @select="choose" />
    </div>
    <template v-if="selected">
      <h3 class="manual-character-name">{{ selected.name }}</h3>
      <CharacterForm ref="form" :key="selected.id" :character="existing" :initial-character-id="selected.id" detached
        @dirty-change="dirty=$event" @saved="finish" />
    </template>
    <template #footer><ImportActions :label="confirmLabel" :ready="!!form?.canSave" :show-confirm="!!selected" :busy="busy" @cancel="guard.requestLeave(()=>emit('close'))" @confirm="save()" /></template>
    <UnsavedChangesDialog v-if="guard.discardOpen.value" :busy="busy" @save="guard.saveAndLeave(()=>save(false))" @continue="guard.cancelDiscard" @discard="guard.discardChanges" />
  </WorkbenchDialog>
</template>

<style scoped>.manual-character-name { font-size:var(--font-control); margin:0 0 16px; font-weight:700; }</style>
