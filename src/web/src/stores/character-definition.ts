import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { CharacterDefinitionFile } from '@leyline/schema';

/** Session drafts survive navigation; explicit files and axis commands own persistence. */
export const useCharacterDefinitionStore = defineStore('character-definition-draft', () => {
  const draft = ref<CharacterDefinitionFile>();
  const edits = ref<Record<string, string>>({});
  const baseline = ref('');
  const dirty = computed(() => !!draft.value && (Object.keys(edits.value).length > 0 || JSON.stringify(draft.value) !== baseline.value));
  function open(file: CharacterDefinitionFile) { draft.value = file; edits.value = {}; baseline.value = JSON.stringify(file); }
  return { draft, edits, dirty, open };
});
