<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAccountStore } from './stores/account';
import { useCharacterLoadoutsStore } from './stores/character-loadouts';
import { accountConfigurations, preparePreferredConfiguration, localConfigurationComplete, type AccountConfiguration } from './domain/account-configurations';
import { accountSlots, accountSlotLabels } from './domain/account';
import { characterLoadoutName } from './domain/character-loadout-name';
import { artifactMainValue, formatGameStat, loadAccountGameData } from './domain/account-presentation';
import GameIcon from './components/GameIcon.vue';
import StatusBadge from './components/StatusBadge.vue';
import StatLabel from './components/StatLabel.vue';
import CornerBadge from './components/CornerBadge.vue';
import EffectiveRollSummary from './components/EffectiveRollSummary.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import CharacterFavorite from './components/CharacterFavorite.vue';
import { configurationSignature } from './domain/character-loadout-name';
const props=defineProps<{characterId:string;selectable?:boolean;currentPresetId?:string;beforeAdopt?:(action:()=>void)=>void}>();
const emit=defineEmits<{select:[characterId:string,presetId:string];adopted:[]}>();
const account=useAccountStore(),loadouts=useCharacterLoadoutsStore();
const data=ref<Awaited<ReturnType<typeof loadAccountGameData>>>(),error=ref('');
const expanded=ref<string[]>([]);
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
const configurations=computed(()=>accountConfigurations(account.account,loadouts.loadouts).filter(item=>item.character.id===props.characterId));
function name(configuration:AccountConfiguration) { return characterLoadoutName(configuration.character,configuration.source,loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name),data.value?.catalog.sets ?? []); }
function entries(configuration:AccountConfiguration) { return accountSlots.map(slot=>({slot,item:configuration.source.artifacts.find(item=>item.id===configuration.character.equipment[slot])})); }
function pieces(configuration:AccountConfiguration) { return entries(configuration).flatMap(entry=>entry.item?[entry.item]:[]); }
function toggle(id:string) { expanded.value=expanded.value.includes(id)?expanded.value.filter(item=>item!==id):[...expanded.value,id]; }
</script>
<template>
  <div class="character-configuration-list">
    <p v-if="error || loadouts.error" role="alert">{{ error || loadouts.error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p class="configuration-count" role="status">{{ configurations.length }} 套配置 · 首选是账号当前采用的配置</p>
    <article v-for="configuration in configurations" :key="configuration.id" class="configuration-row" :class="{current:selectable && currentPresetId===configuration.presetId}" :data-preset-id="configuration.presetId">
      <div class="configuration-top"><GameIcon kind="characters" :id="configuration.character.realBuild?.character.id" :name="configuration.character.name" :size="64" :level="configuration.character.realBuild?.level" :constellation="configuration.character.realBuild?.constellation" /><div class="configuration-heading"><h3>{{ configuration.presetId?'备选配置':'首选配置' }}<span v-if="selectable && currentPresetId===configuration.presetId" class="current-label">当前</span></h3><p class="configuration-name">{{ name(configuration) }}</p><StatusBadge :label="localConfigurationComplete(account.account,configuration.character)?'就绪':'缺失'" :state="localConfigurationComplete(account.account,configuration.character)?'complete':'missing'" accessible-name="本地配置状态" description="培养资料和五部位本地实物是否齐全" /></div><div class="configuration-actions"><CharacterFavorite :account-id="account.account.id" :character-id="configuration.character.id" :name="configuration.character.name" /><button v-if="configuration.presetId" class="ui-action soft" data-accent="anemo" data-size="md" :aria-label="`设${configuration.character.name}此配置为首选`" @click="requestPreferred(configuration)">设为首选</button><button class="ui-action" data-accent="anemo" :disabled="selectable && currentPresetId===configuration.presetId" :aria-label="`${selectable?'选择':'编辑'}${configuration.character.name}${configuration.presetId?'备选':'首选'}配置`" @click="emit('select',configuration.character.id,configuration.presetId)">{{ selectable?'选择':'编辑配置' }}</button></div></div>
      <div class="configuration-cultivation"><template v-if="configuration.character.realBuild"><span>角色 {{ configuration.character.realBuild.level }}级 · {{ configuration.character.realBuild.constellation }}命</span><span>基础天赋 {{ configuration.character.realBuild.talents.normal }} / {{ configuration.character.realBuild.talents.skill }} / {{ configuration.character.realBuild.talents.burst }}</span><span class="configuration-weapon"><GameIcon kind="weapons" :id="configuration.character.realBuild.weapon.id" :size="32" />{{ configuration.character.realBuild.weapon.name }} · {{ configuration.character.realBuild.weaponLevel }}级 · 精炼{{ configuration.character.realBuild.refinement }}</span></template><span v-else>培养资料缺失 · 未配置武器</span></div>
      <div class="configuration-artifact-strip" aria-label="五部位装备摘要"><div v-for="entry in entries(configuration)" :key="entry.slot"><span>{{ accountSlotLabels[entry.slot] }}</span><div class="configuration-artifact-icon"><GameIcon :kind="entry.item?'artifacts':'artifactSlots'" :id="entry.item?.real?`${entry.item.real.setId}-${entry.slot}`:entry.slot" :size="48" /><CornerBadge v-if="entry.item" small>{{ entry.item.real?.level ?? 0 }}</CornerBadge></div><span v-if="entry.item?.real" class="configuration-main-stat"><StatLabel :stat="entry.item.real.mainStat" icon-only /><b>{{ data?formatGameStat(entry.item.real.mainStat,artifactMainValue(entry.item,data.main),false):'—' }}</b></span><span v-else>未装备</span></div></div>
      <EffectiveRollSummary :items="pieces(configuration)" :selected-stats="loadouts.effectiveStats(account.account.id,configuration.character.id,configuration.character.name)" />
      <button class="ui-action soft" data-accent="anemo" data-size="md" :aria-expanded="expanded.includes(configuration.id)" @click="toggle(configuration.id)">{{ expanded.includes(configuration.id)?'收起装备明细':'查看装备明细' }}</button>
      <ArtifactEquipmentGrid v-if="expanded.includes(configuration.id)" :entries="entries(configuration)" :account="configuration.source" readonly />
    </article>
    <ConfirmationDialog v-if="pendingPreferred" title="设为首选配置？" :danger="false" confirm-label="确认设为首选" @cancel="pendingPreferred=undefined" @confirm="confirmPreferred"><p>采用此配置，原首选保留为备选。</p><p v-for="message in transfers" :key="message">{{ message }}</p></ConfirmationDialog>
    <p v-if="!configurations.length">该角色没有可用配置，请返回角色页核对。</p>
  </div>
</template>
<style scoped>
.character-configuration-list { display:grid; gap:12px; }.configuration-count { margin:0; color:var(--muted); font-size:var(--font-body); }.configuration-row { display:grid; gap:12px; min-width:0; padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }.configuration-row.current { border-color:var(--element-anemo-primary); }.configuration-top { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; }.configuration-heading { min-width:0; }h3 { display:flex; align-items:center; gap:8px; margin:0; font-size:var(--font-control); }.current-label { color:var(--element-anemo-deep); font-size:var(--font-body); }.configuration-name { margin:6px 0; overflow-wrap:anywhere; color:var(--muted); font-size:var(--font-body); }.configuration-cultivation { display:flex; flex-wrap:wrap; align-items:center; gap:8px 20px; font-size:var(--font-body); }.configuration-weapon { display:inline-flex; align-items:center; gap:6px; }.configuration-artifact-strip { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; font-size:var(--font-body); }.configuration-artifact-strip > div { display:grid; justify-items:center; align-content:start; gap:5px; min-width:0; padding:8px 2px; border:1px solid var(--line); border-radius:var(--control-radius); background:var(--surface-raised); }.configuration-artifact-icon { position:relative; width:48px; height:48px; }.configuration-artifact-icon .corner-badge { position:absolute; bottom:0; right:0; }.configuration-main-stat { display:flex; align-items:center; gap:3px; font-variant-numeric:tabular-nums; }.configuration-row > button { justify-self:start; }
@media(max-width:600px) { .configuration-top { grid-template-columns:auto minmax(0,1fr); }.configuration-top > .configuration-actions { grid-column:1/-1; justify-self:start; }.configuration-row { padding:12px; }.configuration-artifact-strip { grid-template-columns:repeat(3,minmax(0,1fr)); } }
.configuration-actions { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
</style>
