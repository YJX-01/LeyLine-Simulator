<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAccountStore } from './stores/account';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { accountSlots } from './domain/account';
import { accountConfigurations, artifactCombinations, type AccountConfiguration } from './domain/account-configurations';
import { characterLoadoutName } from './domain/character-loadout-name';
import { loadAccountGameData } from './domain/account-presentation';
import CharacterSelectionDialog from './components/CharacterSelectionDialog.vue';
import CharacterConfigurationList from './CharacterConfigurationList.vue';
import GameIcon from './components/GameIcon.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';

const props=defineProps<{mode:'characters'|'artifacts'}>();
const emit=defineEmits<{edit:[characterId:string,presetId:string];characters:[];artifacts:[];loadouts:[]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore();
const sets=ref<{id:string;name:string}[]>([]),error=ref('');
onMounted(async()=>{try{sets.value=(await loadAccountGameData()).catalog.sets;}catch{error.value='套装目录加载失败，请重新打开。';}});
const configurations=computed(()=>accountConfigurations(account.account,loadouts.loadouts));
const combinations=computed(()=>artifactCombinations(configurations.value));
const query=ref(''),page=ref(1),characterPickerOpen=ref(false),selectedCharacterId=ref('');
const selectedCharacter=computed(()=>account.account.characters.find(character=>character.id===selectedCharacterId.value));
function selectCharacter(id:string) { selectedCharacterId.value=id;characterPickerOpen.value=false; }
watch(()=>account.account.id,()=>{selectedCharacterId.value='';characterPickerOpen.value=false;});
const filteredCombinations=computed(()=>combinations.value.filter(group=>group.configurations.some(configuration=>name(configuration).includes(query.value.trim()))));
const pages=computed(()=>Math.max(1,Math.ceil((props.mode==='artifacts'?filteredCombinations.value.length:0)/12)));
const visibleCombinations=computed(()=>filteredCombinations.value.slice((page.value-1)*12,page.value*12));
watch(query,()=>{page.value=1;});watch(()=>props.mode,()=>{query.value='';page.value=1;});watch(pages,count=>{page.value=Math.min(page.value,count);});
function name(configuration:AccountConfiguration) {
  return characterLoadoutName(configuration.character,configuration.source,loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name),sets.value);
}
function entries(configuration:AccountConfiguration) {
  return accountSlots.map(slot=>({slot,item:account.account.artifacts.find(item=>item.id===configuration.character.equipment[slot])}));
}
</script>
<template>
  <section class="account-configurations panel" :aria-label="mode==='characters'?'角色配置':'圣遗物组合'">
    <header><div><h2>{{ mode==='characters'?'角色配置':'圣遗物组合' }}</h2><p>{{ mode==='characters'?'管理当前账号的首选与备选配装。':'汇总现有配装引用的本地圣遗物组合，相同五部位合并展示。' }}</p></div><button class="ui-action soft" data-accent="anemo" @click="mode==='characters'?emit('characters'):emit('artifacts')">{{ mode==='characters'?'前往角色':'前往圣遗物' }}</button></header>
    <label v-if="mode==='artifacts'" class="configuration-search">搜索圣遗物组合<input v-model="query" class="ui-control" aria-label="搜索圣遗物组合" placeholder="角色、套装或武器名称…" autocomplete="off"></label>
    <p v-if="error || loadouts.error" role="alert">{{ error || loadouts.error }}</p>
    <template v-if="mode==='characters'">
      <div class="configuration-character-picker"><button class="ui-action soft" data-accent="anemo" :aria-label="selectedCharacter?'更换配置角色':'选择配置角色'" @click="characterPickerOpen=true"><GameIcon v-if="selectedCharacter" kind="characters" :id="selectedCharacter.realBuild?.character.id" :name="selectedCharacter.name" :size="32" />{{ selectedCharacter?.name ?? '选择角色' }}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button><p v-if="!selectedCharacter">先选择角色，再查看其首选与备选配置。</p></div>
      <CharacterConfigurationList v-if="selectedCharacter" :character-id="selectedCharacter.id" @select="(characterId,presetId)=>emit('edit',characterId,presetId)" />
      <CharacterSelectionDialog v-if="characterPickerOpen" :selected-id="selectedCharacterId" @close="characterPickerOpen=false" @select="selectCharacter" />
    </template>
    <template v-else>
      <p class="collection-count" role="status">{{ combinations.length }} 组 · 引用当前账号实物，不复制库存</p>
      <div v-if="filteredCombinations.length" class="combination-list"><article v-for="combination in visibleCombinations" :key="combination.id" class="combination-row">
        <div class="combination-heading"><h3>{{ combination.configurations.map(configuration=>`${configuration.character.name} · ${configuration.presetId?'备选':'首选'}`).join('、') }}</h3><button class="ui-action soft" data-accent="anemo" @click="emit('edit',combination.configurations[0].character.id,combination.configurations[0].presetId)">编辑所属配装</button></div>
        <ArtifactEquipmentGrid :entries="entries(combination.configurations[0])" :account="account.account" readonly />
      </article></div>
      <div v-else class="configuration-empty"><p>{{ query ? '没有匹配的组合，请调整搜索。' : '还没有本地圣遗物组合。为角色装备库存中的圣遗物后，会在这里汇总。' }}</p><button class="ui-action" data-accent="anemo" @click="emit('loadouts')">前往角色配置</button></div>
    </template>
    <div v-if="pages>1" class="configuration-pagination"><button class="ui-action soft" data-accent="anemo" data-size="md" :disabled="page<=1" @click="page--">上一页</button><span>第 {{ page }} / {{ pages }} 页</span><button class="ui-action soft" data-accent="anemo" data-size="md" :disabled="page>=pages" @click="page++">下一页</button></div>
  </section>
</template>
<style scoped>
.account-configurations { margin:0 20px; }header,.combination-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }header h2 { font-size:var(--font-dialog); }header p,.collection-count { margin:16px 0; color:var(--muted); font-size:var(--font-body); }.combination-list { display:grid; gap:20px; }.combination-row { padding-top:16px; border-top:1px solid var(--line); }.combination-heading { margin-bottom:16px; }.combination-heading h3 { min-width:0; font-size:var(--font-control); overflow-wrap:anywhere; }.configuration-empty { display:grid; justify-items:start; gap:12px; padding:24px 0; color:var(--muted); }
@media(max-width:700px) { .account-configurations { margin-inline:12px; }header,.combination-heading { flex-wrap:wrap; } }
.configuration-search { display:grid; gap:8px; max-width:440px; margin-top:16px; font-size:var(--font-body); }.configuration-pagination { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:12px; margin-top:20px; font-size:var(--font-body); }
.configuration-character-picker { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:16px 0; }.configuration-character-picker p { color:var(--muted); font-size:var(--font-body); }.configuration-character-picker .ui-action { font-size:var(--font-control); }
</style>
