<script setup lang="ts">
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import CharacterSelectionDialog from '../components/CharacterSelectionDialog.vue';
import {computed,ref,watch} from 'vue';
import {useLibraryScroll} from '../composables/use-library-scroll';
import {useAccountStore} from '../stores/account';
import {useLibraryViewStore} from '../stores/library-view';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import ArtifactCombinationLibrary from './ArtifactCombinationLibrary.vue';
const combinations=ref<InstanceType<typeof ArtifactCombinationLibrary>>();
defineExpose({requestLeave:(action:()=>void)=>combinations.value?combinations.value.requestLeave(action):action(),openCombination:(id:string)=>combinations.value?.openCombination(id)});
const props=defineProps<{mode:'characters'|'artifacts'}>();
const emit=defineEmits<{edit:[characterId:string,presetId:string];detailClosed:[]}>();
const account=useAccountStore(),views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id));
const rolePickerOpen=ref(false);
watch([()=>account.account.id,()=>props.mode],()=>{rolePickerOpen.value=false;});
function selectRole(id:string){
  view.value.characterId=id;
  view.value.configurationPage=1;
  rolePickerOpen.value=false;
}
useLibraryScroll(()=>props.mode==='characters'?'configurations':'combinations');
</script>
<template>
  <section class="account-configurations panel library-page" :aria-label="mode==='characters'?'角色配置':'圣遗物组合'">
    <LibraryCornerOrnaments />
    <CharacterConfigurationList v-if="mode==='characters'" @pick-role="rolePickerOpen=true" @select="(characterId,presetId)=>emit('edit',characterId,presetId)" />
    <ArtifactCombinationLibrary v-else ref="combinations" @closed="emit('detailClosed')" />
    <CharacterSelectionDialog v-if="rolePickerOpen" allow-all :selected-id="view.characterId" @close="rolePickerOpen=false" @select="selectRole" />
  </section>
</template>
<style scoped>
.account-configurations { margin:0 20px; }
@media(max-width:700px){.account-configurations { margin-inline:12px; }}
</style>
