<script setup lang="ts">
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import ManualCharacterImport from './ManualCharacterImport.vue';
import CharacterSelectionDialog from '../components/CharacterSelectionDialog.vue';
import {computed,ref,watch} from 'vue';
import {useLibraryScroll} from '../composables/use-library-scroll';
import {useAccountStore} from '../stores/account';
import {useLibraryViewStore} from '../stores/library-view';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import ArtifactCombinationLibrary from './ArtifactCombinationLibrary.vue';
const combinations=ref<InstanceType<typeof ArtifactCombinationLibrary>>();
const manual = ref<InstanceType<typeof ManualCharacterImport>>();
function requestLeave(action: () => void) {
  const editor = manual.value ?? combinations.value;
  if (editor) editor.requestLeave(action);
  else action();
}
defineExpose({requestLeave});
const props=defineProps<{mode:'characters'|'artifacts'}>();
const emit=defineEmits<{edit:[characterId:string,presetId:string]}>();
const account=useAccountStore(),views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id));
const rolePickerOpen=ref(false), creatingConfiguration=ref(false);
watch([()=>account.account.id,()=>props.mode],()=>{rolePickerOpen.value=false;creatingConfiguration.value=false;});
function selectRole(id:string){
  view.value.characterId=id;
  view.value.configurationOffset=0;
  rolePickerOpen.value=false;
}
useLibraryScroll(()=>props.mode==='characters'?'configurations':'combinations');
</script>
<template>
  <section class="account-configurations panel library-page" :aria-label="mode==='characters'?'角色配置':'圣遗物组合'">
    <LibraryCornerOrnaments />
    <CharacterConfigurationList v-if="mode==='characters'" @pick-role="rolePickerOpen=true" @create="creatingConfiguration=true" @select="(characterId,presetId)=>emit('edit',characterId,presetId)" />
    <ArtifactCombinationLibrary v-else ref="combinations" />
    <ManualCharacterImport v-if="creatingConfiguration" ref="manual" @saved="id=>emit('edit',id,'')" @close="creatingConfiguration=false" />
    <CharacterSelectionDialog v-if="rolePickerOpen" allow-all :selected-id="view.characterId" @close="rolePickerOpen=false" @select="selectRole" />
  </section>
</template>
<style scoped>
.account-configurations { margin:0 20px; }
@media(max-width:700px){.account-configurations { margin-inline:12px; }}
</style>
