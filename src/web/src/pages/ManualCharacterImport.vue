<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import CharacterCatalogBrowser from '../components/CharacterCatalogBrowser.vue';
import ImportActions from '../components/ImportActions.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { useAccountStore } from '../stores/account';
import CharacterDetailDialog from './CharacterDetailDialog.vue';

interface CatalogCharacter { id: string; name: string }
const props = defineProps<{ initialCharacter?: CatalogCharacter; selectOnSave?: boolean }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const accounts = useAccountStore();
const selection = shallowRef<{ character: CatalogCharacter; localId: string }>();
const editor = ref<InstanceType<typeof CharacterDetailDialog>>();

function choose(character: CatalogCharacter) {
  const existing = accounts.account.characters.find(entry => {
    const identity = entry.build?.character.id ?? entry.showcase?.build.character.id;
    return identity ? identity === character.id : entry.name === character.name;
  });
  selection.value = { character, localId: existing?.id ?? crypto.randomUUID() };
}
function back() {
  if (props.initialCharacter) emit('close');
  else selection.value = undefined;
}
function saved(id: string) { emit('saved', id); emit('close'); }
function requestLeave(action: () => void) {
  if (editor.value) editor.value.requestLeave(action);
  else action();
}
if (props.initialCharacter) choose(props.initialCharacter);
defineExpose({ requestLeave });
</script>

<template>
  <WorkbenchDialog v-if="!initialCharacter" title="手动添加角色" sticky-footer @close="emit('close')">
    <CharacterCatalogBrowser :selected-id="selection?.character.id" @select="choose" />
    <template #footer><ImportActions :show-confirm="false" @cancel="emit('close')" /></template>
  </WorkbenchDialog>
  <CharacterDetailDialog v-if="selection" ref="editor" :key="selection.localId" :character-id="selection.localId"
    :catalog-character="selection.character" :select-on-save="selectOnSave" @back="back" @close="emit('close')" @saved="saved" />
</template>
