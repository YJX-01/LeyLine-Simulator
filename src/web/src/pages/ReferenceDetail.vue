<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ArtifactReferenceTarget } from '../domain/artifact-references';
import { useAccountStore } from '../stores/account';
import { useArtifactCombinationsStore } from '../stores/artifact-combinations';
import AccountLibrary from './AccountLibrary.vue';
import ArtifactCombinationEditor from './ArtifactCombinationEditor.vue';

const props = defineProps<{ target: ArtifactReferenceTarget }>();
const emit = defineEmits<{ close: []; accountChanged: [] }>();
const account = useAccountStore();
const combinations = useArtifactCombinationsStore();
const library = ref<InstanceType<typeof AccountLibrary>>();
const target = props.target;
const combination = target.kind === 'combination'
  ? combinations.combinations.find(item => item.id === target.id && item.accountId === account.account.id)
  : undefined;
onMounted(() => {
  if (target.kind === 'combination') {
    if (!combination) emit('close');
  } else if (!library.value?.openConfiguration(target.characterId, target.kind === 'configuration' ? target.presetId : '')) {
    emit('close');
  }
});
watch(() => account.account.id, () => emit('accountChanged'));
</script>

<template>
  <ArtifactCombinationEditor v-if="combination" :combination="combination" @close="emit('close')" @saved="emit('close')" />
  <AccountLibrary v-else-if="target.kind !== 'combination'" ref="library" page="characters" configuration-detail @detail-closed="emit('close')" />
</template>
