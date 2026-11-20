<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { loadCatalog, type GameCatalog } from '@leyline/game-data';
import CatalogBrowser from './CatalogBrowser.vue';

defineProps<{ selectedId?: string }>();
type CatalogCharacter = GameCatalog['characters'][number];
const emit = defineEmits<{ select: [character: CatalogCharacter] }>();
const characters = shallowRef<CatalogCharacter[]>([]);
const error = ref('');
onMounted(async () => {
  try {
    const catalog = await loadCatalog();
    characters.value = catalog.characters.filter(entry => !['aether', 'lumine', 'manekin', 'manekina'].includes(entry.id));
  } catch { error.value = '角色目录加载失败，请重新打开。'; }
});
function select(id: string) {
  const entry = characters.value.find(character => character.id === id);
  if (entry) emit('select', entry);
}
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <CatalogBrowser v-else :options="characters" kind="characters" label="游戏角色" :selected-id="selectedId" @select="select" />
</template>
