<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getRealSet, getRealWeapon, loadRealCatalog } from '@leyline/game-data/real';
import { resolveRealBuild } from '@leyline/engine';
import type { RealBuild, RealStat } from '@leyline/schema';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { useAccountStore } from './stores/account';
import { accountSlots, accountSlotLabels, type AccountArtifact, type AccountSlot } from './domain/account';
import { accountStatLabels } from './domain/account-real';
import { formatGameStat } from './domain/account-presentation';
import CatalogPicker from './components/CatalogPicker.vue';
import ArtifactBrowser from './ArtifactBrowser.vue';
const axis=useAxisWorkspaceStore(),accounts=useAccountStore();
const catalog=ref<Awaited<ReturnType<typeof loadRealCatalog>>>();
const build=computed(()=>axis.actor?.realBuild);
const panel=computed(()=>build.value?resolveRealBuild(build.value):undefined);
const weapons=computed(()=>catalog.value?.weapons.filter(item=>item.weaponType===build.value?.character.weaponType)??[]);
const slot=ref<AccountSlot>();const error=ref('');const busy=ref(false);let disposed=false;
onUnmounted(()=>{disposed=true;});
onMounted(async()=>{try{catalog.value=await loadRealCatalog();}catch{error.value='武器目录加载失败，请重新打开。';}});
function edit(change:(build:RealBuild)=>void) { axis.command(project=>{const current=project.candidate.actors.find(actor=>actor.id===axis.actorId)?.realBuild;if(current)change(current);}); }
const numeric=(event:Event)=>{const value=(event.target as HTMLInputElement).value;return value.trim()?Number(value):NaN;};
async function changeWeapon(id:string) {
  const original=build.value;busy.value=true;error.value='';
  try{const weapon=await getRealWeapon(id);if(disposed||original!==build.value)return;if(weapon.weaponType!==original?.character.weaponType)throw Error('角色与武器类型不匹配。');edit(value=>{value.weapon=weapon;value.weaponAscension=Math.min(value.weaponAscension,weapon.promotion.length-1);value.weaponLevel=Math.min(value.weaponLevel,[20,40,50,60,70,80,90][value.weaponAscension]);});}catch(cause){error.value=String(cause);}finally{busy.value=false;}
}
async function equip(item?:AccountArtifact) {
  const original=build.value,owner=accounts.account,part=slot.value;if(!original||!part)return;error.value='';busy.value=true;
  try {
    if(item&&(!item.real||item.mona?.setIdentityPending||item.slot!==part))throw Error('该实物的词条或套装身份待补全，不能用于计算。');
    if(item&&axis.project.candidate.actors.some(actor=>actor.id!==axis.actorId&&actor.realBuild?.artifacts.some(piece=>piece.id===item.id&&(piece.inventoryAccountId??actor.realBuild?.inventoryAccountId)===owner.id)))throw Error('当前队伍已使用这件实物，请先卸下其他队员的候选装备。');
    const artifacts=original.artifacts.filter(piece=>piece.slot!==part);if(item?.real)artifacts.push({...JSON.parse(JSON.stringify(item.real)),inventoryAccountId:owner.id});
    const sets=await Promise.all([...new Set(artifacts.map(piece=>piece.setId))].filter(id=>id!=='none').map(id=>getRealSet(id)));
    if(disposed||original!==build.value||owner!==accounts.account)return;
    edit(value=>{value.inventoryAccountId=owner.id;value.artifacts=artifacts;value.sets=sets;});slot.value=undefined;
  }catch(cause){error.value=String(cause);}finally{busy.value=false;}
}
</script>
<template>
  <section class="team-loadout-editor" aria-label="队员候选配装">
    <p>修改仅作用于当前轴的候选快照，不回写账号穿戴。</p><p v-if="error" role="alert">{{ error }}</p>
    <template v-if="build">
      <h3>{{ build.character.name }}</h3>
      <div class="fields"><label>角色等级<input :value="build.level" type="number" min="1" max="90" @change="edit(value=>{value.level=numeric($event);})"></label><label>突破<input :value="build.ascension" type="number" min="0" max="6" @change="edit(value=>{value.ascension=numeric($event);})"></label><label>命座<input :value="build.constellation" type="number" min="0" max="6" @change="edit(value=>{value.constellation=numeric($event);})"></label><label v-for="(name,key) in {normal:'A 天赋',skill:'E 天赋',burst:'Q 天赋'}" :key="key">{{ name }}<input :value="build.talents[key]" type="number" min="1" max="15" @change="edit(value=>{value.talents[key]=numeric($event);})"></label></div>
      <CatalogPicker inline label="武器" image-kind="weapons" :model-value="build.weapon.id" :options="weapons" :disabled="busy" @update:model-value="changeWeapon" />
      <div class="fields"><label>武器等级<input :value="build.weaponLevel" type="number" min="1" max="90" @change="edit(value=>{value.weaponLevel=numeric($event);})"></label><label>武器突破<input :value="build.weaponAscension" type="number" min="0" max="6" @change="edit(value=>{value.weaponAscension=numeric($event);})"></label><label>精炼<input :value="build.refinement" type="number" min="1" max="5" @change="edit(value=>{value.refinement=numeric($event);})"></label></div>
      <div class="equipment"><button v-for="part in accountSlots" :key="part" :disabled="busy" @click="slot=part">{{ accountSlotLabels[part] }} · {{ build.artifacts.some(piece=>piece.slot===part)?'更换':'选择' }}</button></div>
      <section v-if="slot"><h3>选择{{ accountSlotLabels[slot] }}</h3><button @click="slot=undefined">返回候选配装</button><button :disabled="busy" @click="equip()">卸下当前部位</button><ArtifactBrowser inline pick :slot="slot" @select="equip" /></section>
      <p v-for="(issue,index) in panel?.issues" :key="index">{{ issue.message }}</p><dl v-if="panel"><template v-for="(value,stat) in panel.stats" :key="stat"><dt>{{ accountStatLabels[stat as RealStat] }}</dt><dd>{{ formatGameStat(stat as RealStat,value) }}</dd></template></dl>
    </template><p v-else>请先从队伍中选择已有角色。</p>
  </section>
</template>
<style scoped>
p { font-size:12px; color:var(--muted); }[role=alert] { color:var(--element-pyro-deep); }.fields { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:16px 0; }.fields label { display:grid; gap:6px; font-size:12px; }.fields input { min-width:0; width:100%; box-sizing:border-box; }.equipment { display:flex; gap:8px; flex-wrap:wrap; margin:18px 0; }dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr) auto); gap:8px 12px; font-size:12px; }dd { margin:0; }@media(max-width:550px){.fields { grid-template-columns:repeat(2,minmax(0,1fr)); }dl { grid-template-columns:1fr auto; }}
</style>
