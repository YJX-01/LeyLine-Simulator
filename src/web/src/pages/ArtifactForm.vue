<script setup lang="ts">
import {computed,onMounted,ref,watch,useId} from 'vue';
import {artifactItemSchema,type ArtifactItem,type Build,type StatKey} from '@leyline/schema';
import {accountSlots,accountSlotLabels,type AccountArtifact,type LocalAccount} from '../domain/account';
import {accountMainStats,accountSubstats,ratioStat,validateAccountArtifact} from '../domain/account-real';
import {applyAccountArtifact,loadAccountGameData,artifactMainValue,formatGameStat} from '../domain/account-presentation';
import {useAccountStore} from '../stores/account';
import CatalogPicker from '../components/CatalogPicker.vue';
import ArtifactSummary from './ArtifactSummary.vue';
import CancelButton from '../components/CancelButton.vue';
import NumberStepper from '../components/NumberStepper.vue';
import StatPicker from '../components/StatPicker.vue';
import SingleSelectPicker from '../components/SingleSelectPicker.vue';
import {preferredUpgradeCounts,persistArtifactRolls,legalUpgradeHistories,cycleUpgradeHistory} from '../domain/artifact-rolls';
const props=defineProps<{item?:AccountArtifact;inline?:boolean;targetAccount?:LocalAccount;details?:boolean}>();
const emit=defineEmits<{close:[];dirtyChange:[dirty:boolean]}>(),store=useAccountStore(),levelInputId=useId(),originalAccount=props.targetAccount ?? store.account;
const draft=ref<AccountArtifact>(props.item?JSON.parse(JSON.stringify(props.item)):{id:crypto.randomUUID(),name:'',slot:'flower',attack:0,real:{id:'',setId:'',slot:'flower',rarity:5,level:20,mainStat:'hp',substats:[]}});
if(!draft.value.real)draft.value.real={id:draft.value.id,setId:'',slot:draft.value.slot,rarity:5,level:20,mainStat:accountMainStats[draft.value.slot][0],substats:[]};
type Sub=ArtifactItem['substats'][number];
const subSlots=ref<(Sub|undefined)[]>(Array.from({length:4},(_,index)=>draft.value.real!.substats[index]));
const setPicker=ref<InstanceType<typeof CatalogPicker>>(),setInvalid=ref(false);
watch(()=>draft.value.real?.setId,value=>{if(value)setInvalid.value=false;});
const baseline=ref(JSON.stringify(draft.value)),sets=ref<{id:string;name:string;rarity:number}[]>([]),main=ref<Build['artifactMain']>(),error=ref(''),preview=ref(false);
watch(()=>JSON.stringify(draft.value),value=>emit('dirtyChange',value!==baseline.value));
const available=computed(()=>accountMainStats[draft.value.slot]),counts=computed(()=>preferredUpgradeCounts(draft.value.real!));
const histories=computed(()=>legalUpgradeHistories(draft.value.real!));
function syncSubs(){draft.value.real!.substats=subSlots.value.filter((sub):sub is Sub=>!!sub);}
let resetting=false;
function clearHistory(){for(const sub of subSlots.value)if(sub)delete sub.rolls;delete draft.value.rollSource;syncSubs();}
watch([()=>draft.value.real!.level,()=>draft.value.real!.mainStat],()=>{if(!resetting)clearHistory();},{flush:'sync'});
function selectSub(index:number,stat?:StatKey){subSlots.value[index]=stat?{stat,value:NaN}:undefined;clearHistory();}
function value(index:number,event:Event){const sub=subSlots.value[index];if(!sub)return;const raw=(event.target as HTMLInputElement).value;sub.value=raw.trim()?Number(raw)/(ratioStat(sub.stat)?100:1):NaN;clearHistory();}
function subIndex(index:number){return subSlots.value.slice(0,index).filter(Boolean).length;}
function count(index:number){return subSlots.value[index]?counts.value[subIndex(index)]?.min:undefined;}
function choices(index:number){return subSlots.value[index]?[...new Set(histories.value.map(row=>row[subIndex(index)]))].sort((a,b)=>a-b):[];}
function countTitle(index:number){const legal=choices(index);return legal.length?`合法强化次数：${legal.join('、')}；${legal.length>1?'点击切换':'当前值唯一'}`:'当前数值没有合法强化组合';}
function cycle(index:number){if(cycleUpgradeHistory(draft.value.real!,subIndex(index))){draft.value.rollSource='manual';subSlots.value=Array.from({length:4},(_,slot)=>subSlots.value[slot]);}}
function reset(){resetting=true;if(props.item)draft.value=JSON.parse(JSON.stringify(props.item));subSlots.value=Array.from({length:4},(_,index)=>draft.value.real!.substats[index]);baseline.value=JSON.stringify(draft.value);preview.value=false;error.value='';resetting=false;emit('dirtyChange',false);}
function changeSlot(){draft.value.real!.slot=draft.value.slot;draft.value.real!.mainStat=available.value[0];clearHistory();}
onMounted(async()=>{try{const data=await loadAccountGameData();sets.value=data.catalog.sets;main.value=data.main;}catch{error.value='套装目录加载失败，请重新打开。';}});
function prepare():AccountArtifact|undefined{
  try{
    syncSubs();if(!draft.value.real?.setId){setInvalid.value=true;error.value='';setPicker.value?.focus();return undefined;}if(!props.item){const set=sets.value.find(item=>item.id===draft.value.real!.setId);if(!set)throw new Error('套装目录尚未加载，请重新选择套装。');draft.value.name=`${set.name} · ${accountSlotLabels[draft.value.slot]}`;}
    if(props.item && (draft.value.name!==props.item.name || draft.value.slot!==props.item.slot || draft.value.real.setId!==props.item.real?.setId))throw new Error('名称、部位和套装属于实物身份，只能通过新建选择。');
    const alias=draft.value.alias?.trim();if(alias)draft.value.alias=alias;else delete draft.value.alias;
    draft.value.real.id=draft.value.id;validateAccountArtifact(draft.value.real);draft.value.real=artifactItemSchema.parse(draft.value.real);persistArtifactRolls(draft.value);
    subSlots.value=Array.from({length:4},(_,index)=>draft.value.real!.substats[index]);error.value='';return JSON.parse(JSON.stringify(draft.value));
  }catch(cause){error.value=cause instanceof Error && cause.name!=='ZodError'?cause.message:'请核对强化等级与词条数值。';return undefined;}
}
function check(){if(prepare())preview.value=true;}
function apply(){try{if(!props.targetAccount && store.account!==originalAccount)throw new Error('账号已切换，请重新打开。');applyAccountArtifact(props.targetAccount ?? store.account,draft.value,props.item?.id);emit('close');}catch(cause){error.value=cause instanceof Error?cause.message:'未入库，请重试。';}}
defineExpose({prepare,reset});
</script>
<template>
  <div class="artifact-form" :class="{details:details || !item}">
    <template v-if="!preview && draft.real">
      <div v-if="!item" class="artifact-identity-fields"><CatalogPicker ref="setPicker" :invalid="setInvalid" label="套装" image-kind="artifacts" v-model="draft.real.setId" :options="sets" /><div class="form-field"><span>部位</span><SingleSelectPicker  :model-value="draft.slot" label="部位" image-kind="artifactSlots" :options="accountSlots.map(slot=>({id:slot,name:accountSlotLabels[slot]}))" @update:model-value="draft.slot=$event as typeof draft.slot;changeSlot()" /></div></div>
      <p v-if="item?.mona?.setIdentityPending">套装身份尚待核对，原始资料保留。</p>
      <div class="form-field"><label :for="levelInputId">强化等级</label><NumberStepper :input-id="levelInputId" v-model="draft.real.level" label="强化等级" :minimum="0" :maximum="20" /></div>
      <div class="form-field main-field"><span>主词条</span><div class="main-editor"><StatPicker v-model="draft.real.mainStat" :options="available" label="主词条" /><output class="main-stat-value ui-control" aria-label="主词条数值" title="随强化等级自动计算">{{ formatGameStat(draft.real.mainStat,artifactMainValue(draft,main),false) }}</output></div></div>
      <div class="substats-editor" role="group" aria-label="四个副词条槽">
        <div v-for="(sub,index) in subSlots" :key="index" class="sub-row">
          <StatPicker :model-value="sub?.stat" :label="`副词条 ${index+1}`" allow-empty :options="accountSubstats.filter(stat=>stat!==draft.real?.mainStat && (stat===sub?.stat || !subSlots.some(other=>other?.stat===stat)))" @update:model-value="selectSub(index,$event)" @clear="selectSub(index)" />
          <button class="roll-count ui-control" type="button" :aria-label="`调整副词条 ${index+1} 强化次数`" :title="countTitle(index)" :disabled="!sub || choices(index).length<2" @click="cycle(index)">{{ count(index) ?? (sub?'?':'—') }}</button>
          <span class="stat-value ui-control"><input type="number" step="any" min="0" autocomplete="off" :disabled="!sub" :aria-label="`副词条 ${index+1} 数值`" :value="sub && Number.isFinite(sub.value)?Number((sub.value*(ratioStat(sub.stat)?100:1)).toPrecision(12)):''" @input="value(index,$event)"><b class="stat-unit" aria-hidden="true">{{ sub && ratioStat(sub.stat)?'%':'' }}</b></span>
        </div>
      </div>
      <label class="artifact-alias">别名<input class="ui-control" v-model="draft.alias" aria-label="圣遗物别名" placeholder="可选，不改变原名称…" maxlength="160" autocomplete="off"></label>
      <div v-if="!details" class="artifact-form-actions"><CancelButton @click="emit('close')" /><button class="ui-action" @click="check">预览词条</button></div>
    </template>
    <template v-else-if="preview"><ArtifactSummary class="artifact-preview" :account="props.targetAccount" variant="relaxed" :item="draft" /><div class="artifact-form-actions"><CancelButton @click="emit('close')" /><button class="ui-action soft" @click="preview=false">返回修改</button><button class="ui-action" @click="apply">{{ item?'应用修改':'确认入库' }}</button></div></template>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.artifact-form { display:grid; gap:16px; min-width:0; color:var(--ink); }.artifact-form label,.form-field { display:grid; gap:8px; min-width:0; font-size:var(--font-control); font-weight:700; }.artifact-form input.ui-control,.artifact-form select.ui-control { height:40px; min-height:40px; padding:0 10px; font-size:var(--font-control); font-weight:700; }.artifact-form p { font-size:var(--font-body); line-height:1.6; }.artifact-form.details { grid-template-columns:160px minmax(0,1fr); gap:16px; }.artifact-identity-fields,.artifact-form-actions,.artifact-preview { grid-column:1/-1; }.artifact-identity-fields { display:grid; grid-template-columns:minmax(0,2fr) minmax(120px,1fr); gap:16px; }.artifact-form-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; }.artifact-preview { justify-self:center; }.substats-editor,.artifact-alias,.artifact-form.details > p { grid-column:1/-1; }.substats-editor { display:grid; gap:12px; }.sub-row { display:grid; grid-template-columns:minmax(0,1fr) 32px 160px; align-items:center; gap:12px; }.main-editor { display:grid; grid-template-columns:minmax(0,1fr) 88px; gap:8px; }.main-stat-value { display:flex; align-items:center; justify-content:center; height:40px; font-size:var(--font-control); font-weight:700; }.roll-count { display:flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:0; font-size:var(--font-control); font-weight:700; color:var(--ink); background:var(--surface-raised); }.roll-count:disabled { opacity:1; color:var(--muted); }.stat-value { display:flex; align-items:center; gap:4px; height:40px; padding:0 8px; background:var(--surface-raised); }.stat-value:has(input:focus-visible) { outline:2px solid var(--focus); outline-offset:3px; }.artifact-form .stat-value input:focus-visible { outline:none; }.artifact-form .stat-value input { min-width:0; width:100%; height:38px; min-height:0; padding:0; border:0; background:transparent; text-align:center; appearance:textfield; font-size:var(--font-control); font-weight:700; }.stat-value input::-webkit-inner-spin-button,.stat-value input::-webkit-outer-spin-button { appearance:none; }.stat-value b { display:block; flex:0 0 16px; width:16px; text-align:center; font-size:var(--font-control); color:var(--muted); }.form-field :deep(.number-stepper) { width:160px; max-width:100%; }@media(max-width:600px) { .artifact-form.details { grid-template-columns:1fr; }.sub-row { grid-template-columns:minmax(0,1fr) 32px 96px; gap:8px; } }
</style>
