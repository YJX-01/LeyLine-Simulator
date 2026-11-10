<script setup lang="ts">
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import {computed,ref,watch} from 'vue';
import {useAccountStore} from '../stores/account';
import {useLibraryViewStore} from '../stores/library-view';
import {useLibraryScroll} from '../composables/use-library-scroll';
import CharacterSelectionDialog from '../components/CharacterSelectionDialog.vue';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import ArtifactCombinationLibrary from './ArtifactCombinationLibrary.vue';
import GameIcon from '../components/GameIcon.vue';
const combinations=ref<InstanceType<typeof ArtifactCombinationLibrary>>();
defineExpose({requestLeave:(action:()=>void)=>combinations.value?combinations.value.requestLeave(action):action(),openCombination:(id:string)=>combinations.value?.openCombination(id)});
const props=defineProps<{mode:'characters'|'artifacts'}>();
const emit=defineEmits<{edit:[characterId:string,presetId:string];detailClosed:[]}>();
const account=useAccountStore(),views=useLibraryViewStore(),characterPickerOpen=ref(false);
const view=computed(()=>views.forAccount(account.account.id));
const selectedCharacter=computed(()=>account.account.characters.find(character=>character.id===view.value.characterId));
watch(()=>account.account.id,()=>{characterPickerOpen.value=false;});
watch(selectedCharacter,current=>{if(!current && view.value.characterId){view.value.characterId='';view.value.configurationPage=1;}},{immediate:true});
function selectCharacter(id:string){view.value.characterId=id;view.value.configurationPage=1;characterPickerOpen.value=false;}
useLibraryScroll(()=>props.mode==='characters'?'configurations':'combinations');
</script>
<template>
  <section class="account-configurations panel library-page" :aria-label="mode==='characters'?'角色配置':'圣遗物组合'">
    <LibraryCornerOrnaments />
    <CharacterConfigurationList v-if="mode==='characters'" :character-id="view.characterId" @reset-role="selectCharacter('')" @select="(characterId,presetId)=>emit('edit',characterId,presetId)">
      <template #actions><button class="ui-action soft configuration-character-filter library-primary-action" aria-label="筛选配置角色" @click="characterPickerOpen=true"><GameIcon v-if="selectedCharacter" kind="characters" :id="selectedCharacter.build?.character.id" :name="selectedCharacter.name" :size="28" /><span>{{ selectedCharacter?.name ?? '全部角色' }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></template>
    </CharacterConfigurationList>
    <ArtifactCombinationLibrary v-else ref="combinations" @closed="emit('detailClosed')" />
    <CharacterSelectionDialog v-if="characterPickerOpen" allow-all :selected-id="view.characterId" @close="characterPickerOpen=false" @select="selectCharacter" />
  </section>
</template>
<style scoped>
.account-configurations { margin:0 20px; }.configuration-character-filter span { overflow:hidden; text-overflow:ellipsis; }.configuration-character-filter svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.8; }
@media(max-width:700px){.account-configurations { margin-inline:12px; }}
</style>
