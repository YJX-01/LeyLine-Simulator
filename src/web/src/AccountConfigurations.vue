<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAccountStore } from './stores/account';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { useLibraryScroll } from './composables/use-library-scroll';
import { useLibraryViewStore } from './stores/library-view';
import { accountSlots } from './domain/account';
import { accountConfigurations, artifactCombinations, type AccountConfiguration } from './domain/account-configurations';
import { characterLoadoutName } from './domain/character-loadout-name';
import { loadAccountGameData } from './domain/account-presentation';
import CharacterSelectionDialog from './components/CharacterSelectionDialog.vue';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import CharacterFavorite from './components/CharacterFavorite.vue';
import GameIcon from './components/GameIcon.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';
import EquipmentStrip from './components/EquipmentStrip.vue';
import DisclosureHeading from './components/DisclosureHeading.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import LibraryPagination from './components/LibraryPagination.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';

const props=defineProps<{mode:'characters'|'artifacts'}>();
const emit=defineEmits<{edit:[characterId:string,presetId:string];characters:[];artifacts:[];loadouts:[]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore(),views=useLibraryViewStore();
const view=computed(()=>views.forAccount(account.account.id));
const sets=ref<{id:string;name:string}[]>([]),error=ref('');
const characterPickerOpen=ref(false);
const selectedCharacter=computed(()=>account.account.characters.find(character=>character.id===view.value.characterId));
const query=computed({get:()=>view.value.query,set:value=>{view.value.query=value;view.value.page=1;}});
const configurations=computed(()=>accountConfigurations(account.account,loadouts.loadouts));
const combinations=computed(()=>artifactCombinations(configurations.value));
const filteredCombinations=computed(()=>combinations.value.filter(group=>group.configurations.some(configuration=>name(configuration).includes(query.value.trim()))));
const pages=computed(()=>Math.max(1,Math.ceil(filteredCombinations.value.length/12)));
const visibleCombinations=computed(()=>filteredCombinations.value.slice((view.value.page-1)*12,view.value.page*12));
watch(pages,count=>{view.value.page=Math.min(view.value.page,count);});
watch(()=>account.account.id,()=>{characterPickerOpen.value=false;});
function selectCharacter(id:string) { view.value.characterId=id;characterPickerOpen.value=false; }
function name(configuration:AccountConfiguration) {
  return characterLoadoutName(configuration.character,configuration.source,loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name),sets.value);
}
function entries(configuration:AccountConfiguration) {
  return accountSlots.map(slot=>({slot,item:account.account.artifacts.find(item=>item.id===configuration.character.equipment[slot])}));
}
function setSummary(configuration:AccountConfiguration) {
  return name(configuration).split(' · ')[2] ?? '待核对套装';
}
function toggle(id:string) {
  const expanded=view.value.expandedCombinations;
  view.value.expandedCombinations=expanded.includes(id)?expanded.filter(value=>value!==id):[...expanded,id];
}
useLibraryScroll(()=>props.mode==='characters'?'configurations':'combinations');
onMounted(async()=>{
  try { sets.value=(await loadAccountGameData()).catalog.sets; } catch { error.value='套装目录加载失败，请重新打开。'; }
});
</script>
<template>
  <section class="account-configurations panel" :aria-label="mode==='characters'?'角色配置':'圣遗物组合'">
    <h2 class="collection-title">{{ mode==='characters'?'角色配置':'圣遗物组合' }}</h2>
    <p v-if="error || loadouts.error" role="alert">{{ error || loadouts.error }}</p>
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
    <template v-else>
      <LibraryToolbar v-model="query" label="搜索圣遗物组合" placeholder="查找角色、套装或武器…" search-only><template #actions><button class="ui-action soft" @click="emit('artifacts')">前往圣遗物</button></template></LibraryToolbar>
      <div class="collection-tools"><span role="status">{{ query.trim()?`匹配 ${filteredCombinations.length} 组 / 共 ${combinations.length} 组`:`${combinations.length} 组` }}</span><button v-if="query" class="ui-muted-button" @click="query=''">清除搜索</button></div>
      <div v-if="filteredCombinations.length" class="combination-list">
        <article v-for="combination in visibleCombinations" :key="combination.id" class="combination-row">
          <div class="combination-heading"><h3>{{ setSummary(combination.configurations[0]) }}</h3><span>{{ entries(combination.configurations[0]).filter(entry=>entry.item).length }}/5 件</span></div>
          <div class="combination-references" aria-label="所属配装"><button v-for="configuration in combination.configurations" :key="configuration.id" class="ui-action soft" data-size="md" :aria-label="`编辑${configuration.character.name}${configuration.presetId?'备选':'首选'}配装 ${name(configuration)}`" @click="emit('edit',configuration.character.id,configuration.presetId)"><GameIcon kind="characters" :id="configuration.character.realBuild?.character.id" :name="configuration.character.name" :size="24" /><span>{{ configuration.character.name }} · {{ configuration.presetId?'备选':'首选' }}</span><span v-if="configuration.presetId" class="reference-name">{{ name(configuration).split(' · ').slice(1).join('|') }}</span></button></div>
          <EquipmentStrip :entries="entries(combination.configurations[0])" />
          <DisclosureHeading title="装备明细" :controls="`combination-${combination.configurations[0].id}`" :expanded="view.expandedCombinations.includes(combination.id)" @toggle="toggle(combination.id)" />
          <ArtifactEquipmentGrid v-if="view.expandedCombinations.includes(combination.id)" :id="`combination-${combination.configurations[0].id}`" :entries="entries(combination.configurations[0])" :account="account.account" readonly />
        </article>
      </div>
      <LibraryEmptyState v-else :title="query?'没有匹配的组合':'还没有本地圣遗物组合'" :description="query?'清除搜索后查看全部组合。':'为角色装备库存中的圣遗物后，会在这里汇总。'" :action="query?'清除搜索':'前往角色配置'" @action="query?query='':emit('loadouts')" />
      <LibraryPagination v-model:page="view.page" :pages="pages" />
    </template>
  </section>
</template>
<style scoped>
.collection-title { margin:0 0 12px; font-size:var(--font-control); }
.account-configurations { margin:0 20px; }.configuration-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; }.configuration-toolbar svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; }.toolbar-end { margin-left:auto; }.collection-tools { display:flex; align-items:center; gap:12px; min-height:32px; margin:12px 0 16px; color:var(--muted); font-size:var(--font-body); }.combination-list { display:grid; gap:16px; }.combination-row { display:grid; gap:12px; min-width:0; padding:16px 0; border-top:1px solid var(--line); }.combination-heading { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }.combination-heading h3 { margin:0; font-size:var(--font-control); overflow-wrap:anywhere; }.combination-heading > span { color:var(--muted); font-size:var(--font-body); }.combination-references { display:flex; flex-wrap:wrap; gap:8px; }.combination-references .ui-action { max-width:100%; height:auto; min-height:32px; white-space:normal; text-align:left; padding-block:4px; }.reference-name { overflow-wrap:anywhere; }
@media(max-width:700px) { .account-configurations { margin-inline:12px; } }
</style>
