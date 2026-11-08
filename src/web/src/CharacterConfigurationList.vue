<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAccountStore } from './stores/account';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { accountConfigurations, preparePreferredConfiguration, localConfigurationComplete, type AccountConfiguration } from './domain/account-configurations';
import { accountSlots } from './domain/account';
import { characterLoadoutName } from './domain/character-loadout-name';
import { loadAccountGameData } from './domain/account-presentation';
import GameIcon from './components/GameIcon.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import SortPanel from './components/SortPanel.vue';
import FilterActions from './components/FilterActions.vue';
import LoadoutComparison from './components/LoadoutComparison.vue';
import { effectiveTotal } from './domain/artifact-combinations';
import StatusBadge from './components/StatusBadge.vue';
import EffectiveRollSummary from './components/EffectiveRollSummary.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import EquipmentStrip from './components/EquipmentStrip.vue';
import DisclosureHeading from './components/DisclosureHeading.vue';
import { useLibraryViewStore } from './stores/library-view';
import { configurationSignature } from './domain/character-loadout-name';
const props=defineProps<{characterId:string;selectable?:boolean;currentPresetId?:string;beforeAdopt?:(action:()=>void)=>void}>();
const emit=defineEmits<{select:[characterId:string,presetId:string];adopted:[]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore();
const data=ref<Awaited<ReturnType<typeof loadAccountGameData>>>(),error=ref('');
const view=useLibraryViewStore();
const popupExpanded=ref<string[]>([]);
const expanded=computed({get:()=>props.selectable?popupExpanded.value:view.forAccount(account.account.id).expandedConfigurations,set:value=>{if(props.selectable)popupExpanded.value=value;else view.forAccount(account.account.id).expandedConfigurations=value;}});
const pendingPreferred=ref<AccountConfiguration>(),transfers=ref<string[]>([]),notice=ref('');
let adoptionBaseline='';
function requestPreferred(configuration:AccountConfiguration) {
  const open=()=>{try{const prepared=preparePreferredConfiguration(account.account,configuration);adoptionBaseline=JSON.stringify(account.account);transfers.value=prepared.transfers;pendingPreferred.value=configuration;error.value='';}catch(cause){error.value=cause instanceof Error?cause.message:'配置不可采用。';}};
  if(props.beforeAdopt)props.beforeAdopt(open);else open();
}
function confirmPreferred() {
  const configuration=pendingPreferred.value;if(!configuration)return;
  try {
    if(JSON.stringify(account.account)!==adoptionBaseline)throw new Error('账号已变化，请重新核对配置。');
    const {next,current}=preparePreferredConfiguration(account.account,configuration);
    if(!loadouts.loadouts.some(item=>item.accountId===account.account.id && item.characterId===current.id && configurationSignature(item.snapshot.characters[0])===configurationSignature(current)))loadouts.save(characterLoadoutName(current,account.account,loadouts.effectiveStats(account.account.id,current.id,current.name),data.value?.catalog.sets ?? []),account.account,current);
    account.commitEdit(next);pendingPreferred.value=undefined;notice.value='已设为首选，原首选保留为备选。';emit('adopted');
  }catch(cause){error.value=cause instanceof Error?cause.message:'未更改首选。';pendingPreferred.value=undefined;}
}
onMounted(async()=>{try{data.value=await loadAccountGameData();}catch{error.value='套装目录加载失败，请重新打开。';}});
const allConfigurations=computed(()=>accountConfigurations(account.account,loadouts.loadouts).filter(item=>item.character.id===props.characterId));
const query=ref(''),filter=ref('all'),sort=ref('default'),direction=ref<'asc'|'desc'>('desc'),filterOpen=ref(false),sortOpen=ref(false),compareOpen=ref(false),compared=ref<string[]>([]);
watch(()=>props.characterId,()=>{query.value='';filter.value='all';compared.value=[];compareOpen.value=false;});
const configurations=computed(()=>allConfigurations.value.filter(item=>name(item).includes(query.value.trim()) && (filter.value==='all' || (filter.value==='preferred')===!item.presetId)).sort((a,b)=>sort.value==='default'?0:(direction.value==='asc'?1:-1)*((effectiveTotal(pieces(a),loadouts.effectiveStats(account.account.id,props.characterId,a.character.name)) ?? -1)-(effectiveTotal(pieces(b),loadouts.effectiveStats(account.account.id,props.characterId,b.character.name)) ?? -1))));
const comparedItems=computed(()=>compared.value.flatMap(id=>{const item=allConfigurations.value.find(item=>item.id===id);return item?[item]:[];}));
function toggleCompare(id:string){compared.value=compared.value.includes(id)?compared.value.filter(value=>value!==id):compared.value.length<2?[...compared.value,id]:compared.value;}
function name(configuration:AccountConfiguration) { return characterLoadoutName(configuration.character,configuration.source,loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name),data.value?.catalog.sets ?? []).split(' · ').slice(1).join('|'); }
function entries(configuration:AccountConfiguration) { return accountSlots.map(slot=>({slot,item:configuration.source.artifacts.find(item=>item.id===configuration.character.equipment[slot])})); }
function pieces(configuration:AccountConfiguration) { return entries(configuration).flatMap(entry=>entry.item?[entry.item]:[]); }
function toggle(id:string) { expanded.value=expanded.value.includes(id)?expanded.value.filter(item=>item!==id):[...expanded.value,id]; }
</script>
<template>
  <div class="character-configuration-list">
    <p v-if="error || loadouts.error" role="alert">{{ error || loadouts.error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <LibraryToolbar v-model="query" label="搜索角色配置" placeholder="查找套装或武器…" :filter-count="filter==='all'?0:1" :sorted="sort!=='default'" @filter="filterOpen=true" @sort="sortOpen=true"><template #actions><button class="ui-action soft" :disabled="comparedItems.length!==2" @click="compareOpen=true">对比 {{ comparedItems.length }}/2</button></template></LibraryToolbar>
    <p class="configuration-count" role="status">{{ configurations.length }} 套配置</p>
    <article v-for="configuration in configurations" :key="configuration.id" class="configuration-row" :class="{current:selectable && currentPresetId===configuration.presetId}" :data-preset-id="configuration.presetId">
      <div class="configuration-top"><GameIcon kind="characters" :id="configuration.character.realBuild?.character.id" :name="configuration.character.name" :size="64" :level="configuration.character.realBuild?.level" :constellation="configuration.character.realBuild?.constellation" /><div class="configuration-heading"><h3>{{ configuration.presetId?'备选配置':'首选配置' }}<span v-if="selectable && currentPresetId===configuration.presetId" class="current-label">当前</span></h3><p class="configuration-name">{{ name(configuration) }}</p><StatusBadge :label="localConfigurationComplete(configuration.source,configuration.character)?'就绪':'缺失'" :state="localConfigurationComplete(configuration.source,configuration.character)?'complete':'missing'" accessible-name="本地配置状态" description="培养资料和五部位本地实物是否齐全" /></div><div class="configuration-actions"><button class="ui-action soft" data-size="md" :aria-pressed="compared.includes(configuration.id)" :disabled="compared.length===2 && !compared.includes(configuration.id)" @click="toggleCompare(configuration.id)">{{ compared.includes(configuration.id)?'移出对比':'加入对比' }}</button><button v-if="configuration.presetId" class="ui-action soft" data-accent="anemo" data-size="md" :aria-label="`设${configuration.character.name}此配置为首选`" @click="requestPreferred(configuration)">设为首选</button><button class="ui-action" data-accent="anemo" :disabled="selectable && currentPresetId===configuration.presetId" :aria-label="`${selectable?'选择':'编辑'}${configuration.character.name}${configuration.presetId?'备选':'首选'}配置`" @click="emit('select',configuration.character.id,configuration.presetId)">{{ selectable?'选择':'编辑配置' }}</button></div></div>
      <div class="configuration-cultivation"><template v-if="configuration.character.realBuild"><span>角色 {{ configuration.character.realBuild.level }}级 · {{ configuration.character.realBuild.constellation }}命</span><span>基础天赋 {{ configuration.character.realBuild.talents.normal }} / {{ configuration.character.realBuild.talents.skill }} / {{ configuration.character.realBuild.talents.burst }}</span><span class="configuration-weapon"><GameIcon kind="weapons" :id="configuration.character.realBuild.weapon.id" :size="32" />{{ configuration.character.realBuild.weapon.name }} · {{ configuration.character.realBuild.weaponLevel }}级 · 精炼{{ configuration.character.realBuild.refinement }}</span></template><span v-else>培养资料缺失 · 未配置武器</span></div>
      <EquipmentStrip :entries="entries(configuration)" />
      <EffectiveRollSummary :items="pieces(configuration)" :selected-stats="loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name)" />
      <DisclosureHeading title="装备明细" :controls="`equipment-${configuration.id}`" :expanded="expanded.includes(configuration.id)" @toggle="toggle(configuration.id)" />
      <ArtifactEquipmentGrid v-if="expanded.includes(configuration.id)" :id="`equipment-${configuration.id}`" :entries="entries(configuration)" :account="configuration.source" readonly />
    </article>
    <ConfirmationDialog v-if="pendingPreferred" title="设为首选配置？" :danger="false" confirm-label="确认设为首选" @cancel="pendingPreferred=undefined" @confirm="confirmPreferred"><p>采用此配置，原首选保留为备选。</p><p v-for="message in transfers" :key="message">{{ message }}</p></ConfirmationDialog>
    <WorkbenchDialog v-if="filterOpen" title="筛选角色配置" size="filter" @close="filterOpen=false"><ChoiceGroup v-model="filter" label="配置类型" :options="[{value:'all',label:'全部'},{value:'preferred',label:'首选'},{value:'alternate',label:'备选'}]" /><template #footer><FilterActions flush @reset="filter='all'" @confirm="filterOpen=false" /></template></WorkbenchDialog>
    <WorkbenchDialog v-if="sortOpen" title="配置排序" size="filter" @close="sortOpen=false"><SortPanel v-model="sort" v-model:direction="direction" :options="[{value:'default',label:'首选优先'},{value:'rolls',label:'有效词条数'}]" @reset="sort='default';direction='desc'" @confirm="sortOpen=false" /></WorkbenchDialog>
    <LoadoutComparison v-if="compareOpen && comparedItems.length===2" :sides="comparedItems.map(item=>({title:(item.presetId?'备选：':'首选：')+name(item),items:pieces(item),build:item.character.realBuild,account:item.source}))" :stats="loadouts.effectiveStats(account.account.id,props.characterId,comparedItems[0].character.name)" :reference-name="comparedItems[0].character.name" @close="compareOpen=false" />
    <p v-if="!configurations.length">该角色没有可用配置，请返回角色页核对。</p>
  </div>
</template>
<style scoped>
.character-configuration-list { display:grid; gap:12px; }.configuration-count { margin:0; color:var(--muted); font-size:var(--font-body); }.configuration-row { display:grid; gap:12px; min-width:0; padding:16px; border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface); }.configuration-row.current { border-color:var(--element-anemo-primary); }.configuration-top { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; }.configuration-heading { min-width:0; }h3 { display:flex; align-items:center; gap:8px; margin:0; font-size:var(--font-control); }.current-label { color:var(--element-anemo-deep); font-size:var(--font-body); }.configuration-name { margin:6px 0; overflow-wrap:anywhere; color:var(--muted); font-size:var(--font-body); }.configuration-cultivation { display:flex; flex-wrap:wrap; align-items:center; gap:8px 20px; font-size:var(--font-body); }.configuration-weapon { display:inline-flex; align-items:center; gap:6px; }
@media(max-width:600px) { .configuration-top { grid-template-columns:auto minmax(0,1fr); }.configuration-top > .configuration-actions { grid-column:1/-1; justify-self:start; }.configuration-row { padding:12px; } }
.configuration-actions { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
</style>
