<script setup lang="ts">
import { onMounted, watch } from 'vue';
import type { ArtifactReferenceTarget } from '../domain/artifact-references';
import { useAccountStore } from '../stores/account';
import { useArtifactCombinationsStore } from '../stores/artifact-combinations';
import CharacterDetailDialog from './CharacterDetailDialog.vue';
import ArtifactCombinationEditor from './ArtifactCombinationEditor.vue';

const props = defineProps<{ target: ArtifactReferenceTarget }>();
const emit = defineEmits<{ close: []; accountChanged: [] }>();
const account = useAccountStore();
const combinations = useArtifactCombinationsStore();
const target = props.target;
const combination = target.kind === 'combination'
  ? combinations.combinations.find(item => item.id === target.id && item.accountId === account.account.id)
  : undefined;
onMounted(() => {
  if (target.kind === 'combination') {
    if (!combination) emit('close');
  } else if (!account.account.characters.some(entry => entry.id === target.characterId)) {
    emit('close');
  }
});
watch(() => account.account.id, () => emit('accountChanged'));
</script>

<template>
  <ArtifactCombinationEditor v-if="combination" :combination="combination" @close="emit('close')" @saved="emit('close')" />
  <CharacterDetailDialog v-else-if="target.kind !== 'combination'" :character-id="target.characterId"
    :configuration-detail="target.kind === 'configuration'" :preset-id="target.kind === 'configuration' ? target.presetId : undefined" @close="emit('close')" />
</template>
