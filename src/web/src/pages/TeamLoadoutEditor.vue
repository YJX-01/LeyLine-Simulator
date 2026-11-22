<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { getArtifactSet, loadCatalog, type GameCatalog } from '@leyline/game-data';
import { buildSchema, type Build, type Project, type StatKey } from '@leyline/schema';
import { resolveBuild } from '@leyline/engine';
import { calculationArtifact } from '../domain/build-snapshot';
import { useAccountStore } from '../stores/account';
import type { AccountArtifact, AccountCharacter, AccountSlot } from '../domain/account';
import { formatGameStat } from '../domain/account-presentation';
import { teamArtifactEntries } from '../domain/team-members';
import { useUnsavedChanges } from '../composables/use-unsaved-changes';
import CharacterForm from './CharacterForm.vue';
import ArtifactDetail from './ArtifactDetail.vue';
import ArtifactPickerDialog from '../components/ArtifactPickerDialog.vue';
import ArtifactEquipmentGrid from '../components/ArtifactEquipmentGrid.vue';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue';
import DisclosureHeading from '../components/DisclosureHeading.vue';
import StatLabel from '../components/StatLabel.vue';
const props = defineProps<{
  project: Project;
  actorId: string;
  applyBuild: (id: string, build: Build) => void;
  axisContext?: boolean;
}>();
const accounts = useAccountStore();
const actorId = props.actorId;
const projectId = props.project.id;
const actor = computed(() => props.project.candidate.actors.find(entry => entry.id === actorId));
const draft=ref<Build>();
const form=ref<InstanceType<typeof CharacterForm>>();
const cultivationDirty=ref(false),revision=ref(0),busy=ref(false),error=ref(''),panelOpen=ref(false);
let baseline='';
function restore() { const current=actor.value?.build;baseline=JSON.stringify(current);draft.value=current?JSON.parse(baseline):undefined;cultivationDirty.value=false;revision.value++;slot.value=undefined;error.value=''; }
const slot=ref<AccountSlot>();
const inspecting = ref<AccountArtifact>();
restore();
const dirty=computed(()=>cultivationDirty.value || JSON.stringify(draft.value)!==baseline);
const {discardOpen,requestLeave,cancelDiscard,discardChanges,saveAndLeave}=useUnsavedChanges(dirty);
const character=computed<AccountCharacter|undefined>(()=>draft.value?{id:actorId,name:draft.value.character.identity.name,attack:0,weapon:draft.value.weapon?.name ?? '',equipment:{},build:draft.value}:undefined);
const panel=computed(()=>form.value?.draftBuild ? resolveBuild(form.value.draftBuild) : undefined);
const entries = computed(() => teamArtifactEntries(draft.value, accounts.account));
async function equip(item?:AccountArtifact,part=slot.value) {
  const original=draft.value,owner=accounts.account;if(!original||!part||busy.value)return;error.value='';busy.value=true;
  try {
    if(item&&(!item.real||item.mona?.setIdentityPending||item.slot!==part))throw Error('该实物的词条或套装身份待补全，不能用于计算。');
    if(item&&props.project.candidate.actors.some(actor=>actor.id!==actorId&&actor.build?.artifacts.some(piece=>piece.id===item.id&&piece.inventory?.accountId===owner.id)))throw Error('当前队伍已使用这件实物，请先卸下其他队员的候选装备。');
    const artifacts=original.artifacts.filter(piece=>piece.slot!==part);if(item?.real)artifacts.push(calculationArtifact(JSON.parse(JSON.stringify(item.real)),owner.id));
    const theoreticalSetSlots = (original.theoreticalSetSlots ?? []).filter(entry => !item || entry.slot !== part);
    const sets=await Promise.all([...new Set([...artifacts, ...theoreticalSetSlots].map(piece=>piece.setId))].filter(id=>id!=='none').map(id=>getArtifactSet(id)));
    if(original!==draft.value||owner!==accounts.account)return;
    draft.value={...original,artifacts,sets,theoreticalSetSlots};slot.value=undefined;
  }catch(cause){error.value=cause instanceof Error?cause.message:'换装失败。';}finally{busy.value=false;}
}
const catalogSets = ref<GameCatalog['sets']>([]);
async function loadSets() { if (!catalogSets.value.length) catalogSets.value = (await loadCatalog()).sets; }
async function setTheoreticalSlot(part: AccountSlot, id: string) {
  const original = draft.value;
  if (!original || busy.value || original.artifacts.some(item => item.slot === part)) return;
  busy.value = true;
  try {
    const theoreticalSetSlots = (original.theoreticalSetSlots ?? []).filter(item => item.slot !== part);
    if (id) theoreticalSetSlots.push({ slot: part, setId: id });
    const ids = new Set([...original.artifacts, ...theoreticalSetSlots].map(item => item.setId).filter(id => id !== 'none'));
    const sets = await Promise.all([...ids].map(id => original.sets.find(set => set.id === id) ?? getArtifactSet(id)));
    if (draft.value === original) draft.value = { ...original, sets, theoreticalSetSlots };
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '套装选择无效。'; }
  finally { busy.value = false; }
}
function currentBuildMatches() {
  return props.project.id === projectId && props.actorId === actorId && JSON.stringify(actor.value?.build) === baseline;
}
async function save() {
  if(!draft.value||busy.value)return false;
  busy.value=true;error.value='';
  try {
    if(!currentBuildMatches())throw Error('配装已变化，请还原后重新核对。');
    const prepared=await form.value?.prepare();if(!prepared?.build)return false;
    const next=buildSchema.parse({...draft.value,...prepared.build,artifacts:draft.value.artifacts,sets:draft.value.sets,theoreticalSetSlots:draft.value.theoreticalSetSlots});
    const issues=resolveBuild(next).issues.filter(issue=>issue.code==='invalid-input');if(issues.length)throw Error(issues.map(issue=>issue.message).join('；'));
    if (!currentBuildMatches()) throw Error('编辑对象已变化，未保存。');
    props.applyBuild(actorId, next);
    await nextTick();
    restore();
    return true;
  }catch(cause){error.value=cause instanceof Error?cause.message:'保存失败。';return false;}finally{busy.value=false;}
}
defineExpose({dirty,busy,save,restore,requestLeave});
</script>
<template>
  <section class="team-loadout-editor" aria-label="队员候选配装">
    <p v-if="axisContext" class="editor-context">保存到当前轴配装，账号穿戴保持独立。</p><p v-if="error" role="alert">{{ error }}</p>
    <template v-if="character && draft">
      <CharacterForm ref="form" :key="revision" candidate detached details :character="character" @dirty-change="cultivationDirty=$event" />
      <section class="editor-section"><DisclosureHeading title="角色面板" label="面板" controls="team-character-panel" :expanded="panelOpen" @toggle="panelOpen=!panelOpen" /><div v-if="panelOpen" id="team-character-panel"><p v-for="(issue,index) in panel?.issues" :key="index">{{ issue.message }}</p><dl v-if="panel"><template v-for="(value,stat) in panel.stats" :key="stat"><dt><StatLabel :stat="stat as StatKey" /></dt><dd>{{ formatGameStat(stat as StatKey,value) }}</dd></template></dl></div></section>
      <section class="editor-section"><h3>圣遗物</h3>
        <ArtifactEquipmentGrid :entries="entries" :busy="busy" :wearers="[]" @change="slot=$event" @inspect="inspecting=entries.find(entry=>entry.slot===$event)?.item" />
        <details v-if="draft" @toggle="loadSets"><summary>空闲部位的理论套装</summary>
          <label v-for="piece in entries.filter(entry => !draft?.artifacts.some(item => item.slot === entry.slot))" :key="piece.slot">
            {{ { flower: '生之花', plume: '死之羽', sands: '时之沙', goblet: '空之杯', circlet: '理之冠' }[piece.slot] }}
            <select :value="draft.theoreticalSetSlots?.find(item => item.slot === piece.slot)?.setId ?? ''" :disabled="busy" @change="setTheoreticalSlot(piece.slot, ($event.target as HTMLSelectElement).value)">
              <option value="">未选择</option><option v-for="set in catalogSets.filter(set => set.slots.includes(piece.slot))" :key="set.id" :value="set.id">{{ set.name }}</option>
            </select>
          </label>
        </details>
        <ArtifactPickerDialog v-if="slot" :slot="slot" :account="accounts.account" :current="entries.find(entry=>entry.slot===slot)?.item"
          @select="equip" @remove="equip()" @close="slot=undefined" />
        <ArtifactDetail v-if="inspecting" :item="inspecting" readonly @close="inspecting=undefined" />
      </section>
    </template><p v-else>请先从队伍中选择已有角色。</p>
    <UnsavedChangesDialog v-if="discardOpen" :busy="busy" @save="saveAndLeave(save)" @continue="cancelDiscard" @discard="discardChanges" />
  </section>
</template>
<style scoped>
.editor-context { color:var(--muted); font-size:var(--font-body); margin-bottom:12px; }[role=alert] { color:var(--element-pyro-deep); margin-bottom:12px; }.editor-section { margin-top:16px; padding-top:12px; border-top:1px solid var(--line); }.editor-section > h3 { font-size:var(--font-control); margin-bottom:12px; }.selection-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr) auto); gap:8px 12px; font-size:var(--font-body); margin-top:12px; }dd { margin:0; font-weight:700; }@media(max-width:550px){dl { grid-template-columns:1fr auto; }}
</style>
