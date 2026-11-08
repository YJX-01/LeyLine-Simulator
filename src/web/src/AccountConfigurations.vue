<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAccountStore } from './stores/account';
import { useLibraryScroll } from './composables/use-library-scroll';
import { useLibraryViewStore } from './stores/library-view';
import CharacterSelectionDialog from './components/CharacterSelectionDialog.vue';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import CharacterFavorite from './components/CharacterFavorite.vue';
import GameIcon from './components/GameIcon.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';
import ArtifactCombinationLibrary from './ArtifactCombinationLibrary.vue';
const props=defineProps<{mode:'characters'|'artifacts'}>();
const emit=defineEmits<{edit:[characterId:string,presetId:string];characters:[];artifacts:[];loadouts:[]}>();
const account=useAccountStore(),views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id));
const characterPickerOpen=ref(false);
const selectedCharacter=computed(()=>account.account.characters.find(character=>character.id===view.value.characterId));
watch(()=>account.account.id,()=>{characterPickerOpen.value=false;});
function selectCharacter(id:string){view.value.characterId=id;characterPickerOpen.value=false;}
useLibraryScroll(()=>props.mode==='characters'?'configurations':'combinations');
</script>
<template>
  <section class="account-configurations panel" :aria-label="mode==='characters'?'角色配置':'圣遗物组合'">
    <h2 class="collection-title">{{ mode==='characters'?'角色配置':'圣遗物组合' }}</h2>
    <template v-if="mode==='characters'">
      <div class="configuration-toolbar">
        <button class="ui-action soft" :aria-label="selectedCharacter?'更换配置角色':'选择配置角色'" @click="characterPickerOpen=true"><GameIcon v-if="selectedCharacter" kind="characters" :id="selectedCharacter.realBuild?.character.id" :name="selectedCharacter.name" :size="32" />{{ selectedCharacter?.name ?? '选择角色' }}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
        <CharacterFavorite v-if="selectedCharacter" :account-id="account.account.id" :character-id="selectedCharacter.id" :name="selectedCharacter.name" />
        <button class="ui-action soft toolbar-end" @click="emit('characters')">前往角色</button>
      </div>
      <CharacterConfigurationList v-if="selectedCharacter" :character-id="selectedCharacter.id" @select="(characterId,presetId)=>emit('edit',characterId,presetId)" />
      <LibraryEmptyState v-else title="选择要管理的角色" description="查看、编辑配装，或将备选设为首选。" action="选择角色" @action="characterPickerOpen=true" />
      <CharacterSelectionDialog v-if="characterPickerOpen" :selected-id="view.characterId" @close="characterPickerOpen=false" @select="selectCharacter" />
    </template>
    <ArtifactCombinationLibrary v-else />
  </section>
</template>
<style scoped>
.collection-title { margin:0 0 12px; font-size:var(--font-control); }.account-configurations { margin:0 20px; }.configuration-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; }.configuration-toolbar svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; }.toolbar-end { margin-left:auto; }
@media(max-width:700px){.account-configurations { margin-inline:12px; }}
</style>
