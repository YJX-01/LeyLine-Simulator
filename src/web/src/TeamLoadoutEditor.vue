<script setup lang="ts">
import { computed, ref } from 'vue';
import { getRealSet } from '@leyline/game-data/real';
import { realBuildSchema, type RealBuild, type RealStat } from '@leyline/schema';
import { resolveRealBuild } from '@leyline/engine';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { useAccountStore } from './stores/account';
import { accountSlots, accountSlotLabels, type AccountArtifact, type AccountCharacter, type AccountSlot } from './domain/account';
import { formatGameStat } from './domain/account-presentation';
import { useUnsavedChanges } from './composables/use-unsaved-changes';
import CharacterForm from './CharacterForm.vue';
import ArtifactBrowser from './ArtifactBrowser.vue';
import ArtifactEquipmentGrid from './components/ArtifactEquipmentGrid.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import DisclosureHeading from './components/DisclosureHeading.vue';
import StatLabel from './components/StatLabel.vue';
const axis=useAxisWorkspaceStore(),accounts=useAccountStore();
const actorId=axis.actorId;
const draft=ref<RealBuild>();
const form=ref<InstanceType<typeof CharacterForm>>();
const cultivationDirty=ref(false),revision=ref(0),busy=ref(false),error=ref(''),panelOpen=ref(false);
let baseline='';
function restore() { const current=axis.actor?.realBuild;baseline=JSON.stringify(current);draft.value=current?JSON.parse(baseline):undefined;cultivationDirty.value=false;revision.value++;slot.value=undefined;error.value=''; }
const slot=ref<AccountSlot>();
restore();
const dirty=computed(()=>cultivationDirty.value || JSON.stringify(draft.value)!==baseline);
const {discardOpen,requestLeave,cancelDiscard,discardChanges}=useUnsavedChanges(dirty);
const character=computed<AccountCharacter|undefined>(()=>draft.value?{id:actorId,name:draft.value.character.name,attack:0,weapon:draft.value.weapon.name,equipment:{},realBuild:draft.value}:undefined);
const panel=computed(()=>draft.value?resolveRealBuild(draft.value):undefined);
const entries=computed(()=>accountSlots.map(slot=>{const real=draft.value?.artifacts.find(item=>item.slot===slot);const original=accounts.account.artifacts.find(item=>item.id===real?.id);return {slot,item:real?{id:real.id,name:original?.name ?? `${draft.value?.sets.find(set=>set.id===real.setId)?.name ?? '圣遗物'} · ${accountSlotLabels[slot]}`,slot,attack:0,real} as AccountArtifact:undefined};}));
async function equip(item?:AccountArtifact,part=slot.value) {
  const original=draft.value,owner=accounts.account;if(!original||!part||busy.value)return;error.value='';busy.value=true;
  try {
    if(item&&(!item.real||item.mona?.setIdentityPending||item.slot!==part))throw Error('该实物的词条或套装身份待补全，不能用于计算。');
    if(item&&axis.project.candidate.actors.some(actor=>actor.id!==actorId&&actor.realBuild?.artifacts.some(piece=>piece.id===item.id&&(piece.inventoryAccountId??actor.realBuild?.inventoryAccountId)===owner.id)))throw Error('当前队伍已使用这件实物，请先卸下其他队员的候选装备。');
    const artifacts=original.artifacts.filter(piece=>piece.slot!==part);if(item?.real)artifacts.push({...JSON.parse(JSON.stringify(item.real)),inventoryAccountId:owner.id});
    const sets=await Promise.all([...new Set(artifacts.map(piece=>piece.setId))].filter(id=>id!=='none').map(id=>getRealSet(id)));
    if(original!==draft.value||owner!==accounts.account)return;
    draft.value={...original,inventoryAccountId:owner.id,artifacts,sets};slot.value=undefined;
  }catch(cause){error.value=cause instanceof Error?cause.message:'换装失败。';}finally{busy.value=false;}
}
async function save() {
  if(!draft.value||busy.value)return;
  busy.value=true;error.value='';
  try {
    if(actorId!==axis.actorId || JSON.stringify(axis.actor?.realBuild)!==baseline)throw Error('轴内配装已变化，请还原后重新核对。');
    const prepared=await form.value?.prepare();if(!prepared?.realBuild)return;
    const next=realBuildSchema.parse({...draft.value,...prepared.realBuild,artifacts:draft.value.artifacts,sets:draft.value.sets,inventoryAccountId:draft.value.inventoryAccountId});
    const issues=resolveRealBuild(next).issues.filter(issue=>issue.code==='invalid-input');if(issues.length)throw Error(issues.map(issue=>issue.message).join('；'));
    if(actorId!==axis.actorId || JSON.stringify(axis.actor?.realBuild)!==baseline)throw Error('编辑对象已变化，未保存。');
    axis.command(project=>{const actor=project.candidate.actors.find(actor=>actor.id===actorId);if(actor)actor.realBuild=next;});restore();
  }catch(cause){error.value=cause instanceof Error?cause.message:'保存失败。';}finally{busy.value=false;}
}
defineExpose({dirty,busy,save,restore,requestLeave});
</script>
<template>
  <section class="team-loadout-editor" aria-label="队员候选配装">
    <p class="editor-context">保存到当前轴配装，账号穿戴保持独立。</p><p v-if="error" role="alert">{{ error }}</p>
    <template v-if="character && draft">
      <CharacterForm ref="form" :key="revision" candidate detached details :character="character" @dirty-change="cultivationDirty=$event" />
      <section class="editor-section"><DisclosureHeading title="角色面板" label="面板" controls="team-character-panel" :expanded="panelOpen" @toggle="panelOpen=!panelOpen" /><div v-if="panelOpen" id="team-character-panel"><p v-if="cultivationDirty" class="editor-context">保存后更新培养面板。</p><template v-else><p v-for="(issue,index) in panel?.issues" :key="index">{{ issue.message }}</p><dl v-if="panel"><template v-for="(value,stat) in panel.stats" :key="stat"><dt><StatLabel :stat="stat as RealStat" /></dt><dd>{{ formatGameStat(stat as RealStat,value) }}</dd></template></dl></template></div></section>
      <section class="editor-section"><h3>圣遗物</h3><section v-if="slot"><div class="selection-toolbar"><h3>选择{{ accountSlotLabels[slot] }}</h3><button class="ui-action soft" data-accent="anemo" @click="slot=undefined">返回候选配装</button></div><ArtifactBrowser inline pick density="relaxed" :slot="slot" @select="equip" /></section><ArtifactEquipmentGrid v-else :entries="entries" :busy="busy" :wearers="[]" @change="slot=$event" @remove="equip(undefined,$event)" /></section>
    </template><p v-else>请先从队伍中选择已有角色。</p>
    <ConfirmationDialog v-if="discardOpen" title="放弃未保存的修改？" confirm-label="放弃修改并退出" cancel-label="继续编辑" @cancel="cancelDiscard" @confirm="discardChanges"><p>退出将丢弃未保存的修改。</p></ConfirmationDialog>
  </section>
</template>
<style scoped>
.editor-context { color:var(--muted); font-size:var(--font-body); margin-bottom:12px; }[role=alert] { color:var(--element-pyro-deep); margin-bottom:12px; }.editor-section { margin-top:16px; padding-top:12px; border-top:1px solid var(--line); }.editor-section > h3 { font-size:var(--font-control); margin-bottom:12px; }.selection-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr) auto); gap:8px 12px; font-size:var(--font-body); margin-top:12px; }dd { margin:0; font-weight:700; }@media(max-width:550px){dl { grid-template-columns:1fr auto; }}
</style>
