<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAccountStore } from './stores/account';
import { fetchEnka, enkaErrorLabel } from './platform/enka';
import { previewEnkaImport, confirmEnkaImport, type EnkaPreview } from './domain/enka-import';
import {useInventoryHistoryMerge} from './composables/use-inventory-history-merge';
import ChoiceGroup from './components/ChoiceGroup.vue';
import { cloneAccount } from './domain/account';
import { planShowcaseInventory } from './domain/showcase-inventory';
import CharacterEquipmentIcons from './components/CharacterEquipmentIcons.vue';
import LibraryToolbar from './components/LibraryToolbar.vue';
const emit = defineEmits<{ close:[]; imported:[id:string] }>();
const store=useAccountStore(); const uid=ref(store.account.uid ?? ''); const busy=ref(false); const error=ref(''); const preview=ref<EnkaPreview>(); const selected=ref<string[]>([]);
const commitMergedInventory=useInventoryHistoryMerge();
const importArtifacts=ref(true),search=ref('');let inventoryBaseline='';
const visibleRows=computed(()=>preview.value?.rows.filter(row=>row.character.name.includes(search.value.trim())) ?? []);
function selectAll(){selected.value=preview.value?.rows.map(row=>row.character.id) ?? [];}
function toggleSelection(id:string){selected.value=selected.value.includes(id)?selected.value.filter(value=>value!==id):[...selected.value,id];}
const artifactPlan=computed(()=>preview.value?planShowcaseInventory(store.account,preview.value.rows.filter(row=>selected.value.includes(row.character.id)).map(row=>row.character)):undefined);
let revision=0; let controller:AbortController|undefined;
onBeforeUnmount(()=>{revision++;controller?.abort();});
watch(uid,()=>{preview.value=undefined;selected.value=[];error.value='';});
async function query() {
  if (busy.value) return;
  const generation=++revision,owner=store.account;controller=new AbortController();busy.value=true;error.value='';preview.value=undefined;
  try {
    const identifier=uid.value.trim(); if(owner.uid && owner.uid!==identifier)throw new Error('UID 与当前账号绑定不一致，请在账号信息中修改或切换账号。'); const response=await fetchEnka(identifier,controller.signal); if (revision!==generation||owner!==store.account) return; const result=await previewEnkaImport(response,identifier,owner);
    if (revision!==generation||owner!==store.account) return;
    preview.value=result;search.value='';inventoryBaseline=JSON.stringify(owner.artifacts);importArtifacts.value=true;selected.value=result.rows.filter(row=>row.action!=='update').map(row=>row.character.id);
  } catch(cause) { if (revision===generation) error.value=enkaErrorLabel(cause); }
  finally { if (revision===generation) busy.value=false; }
}
function confirm() { try { if (!preview.value) return;if(importArtifacts.value && JSON.stringify(store.account.artifacts)!==inventoryBaseline)throw new Error('库存已变化，请重新查询后确认。');const next=cloneAccount(store.account);const count=confirmEnkaImport(next,preview.value,selected.value,importArtifacts.value);commitMergedInventory(next);store.notice=importArtifacts.value?`已导入 ${count} 位角色及所选圣遗物，当前穿戴不变。`:`已导入 ${count} 位展柜角色；本地实物库存与穿戴关系保持。`;emit('imported',selected.value[0]);emit('close'); } catch(cause) { error.value=enkaErrorLabel(cause); } }
const confirmLabel=computed(()=>`确认导入 ${selected.value.length} 位角色`);
const canConfirm=computed(()=>!!preview.value && !!selected.value.length && !busy.value);
defineExpose({confirm,confirmLabel,canConfirm,hasPreview:computed(()=>!!preview.value),busy});
</script>
<template>
  <div class="enka-import">
    <p class="explanation">读取 UID 的公开角色展柜，无需登录。请在游戏中开启“显示角色详情”；未展示角色与背包库存无法通过此接口读取。</p>
    <form @submit.prevent="query"><label>游戏 UID<input v-model="uid" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="输入你的 UID" :disabled="busy"></label><button class="ui-action" data-accent="electro" :disabled="busy || !/^\d{9,10}$/.test(uid.trim())">{{ busy?'正在查询…':'查询角色展柜' }}</button></form>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="preview">
      <div class="preview-title"><strong>{{ preview.nickname || '公开展柜' }}</strong><span>UID {{ preview.uid }}</span><strong class="selection-total">已选 {{ selected.length }} / {{ preview.rows.length }} 位</strong></div>
      <LibraryToolbar v-model="search" label="搜索展柜角色" placeholder="查找角色…" search-only><template #actions><button class="ui-action soft" data-accent="electro" data-size="md" :disabled="selected.length===preview.rows.length" @click="selectAll">全选</button><button class="ui-action soft" data-accent="electro" data-size="md" :disabled="!selected.length" @click="selected=[]">清空选择</button></template></LibraryToolbar>
      <ChoiceGroup :model-value="importArtifacts?'inventory':'snapshot'" :options="[{value:'snapshot',label:'仅保存展柜'},{value:'inventory',label:'同时导入本地库'}]" label="展柜圣遗物处理" tone="electro" @update:model-value="importArtifacts=$event==='inventory'" />
      <p v-if="importArtifacts && artifactPlan" role="status">圣遗物新增 {{ artifactPlan.added }} 件，匹配 {{ artifactPlan.matched }} 件。匹配包含副词条顺序，相同内容合并，优先保存展柜强化次数；穿戴关系保留。</p>
      <div class="showcase-choices"><button v-for="row in visibleRows" :key="row.character.id" class="import-row" :class="{selected:selected.includes(row.character.id)}" :aria-label="`导入${row.character.name}`" :aria-pressed="selected.includes(row.character.id)" @click="toggleSelection(row.character.id)"><span class="showcase-portrait"><CharacterEquipmentIcons :build="row.character.realBuild" :name="row.character.name" :size="104" /><strong>{{ row.character.name }}</strong></span><span class="selection-symbol" aria-hidden="true"><svg v-if="selected.includes(row.character.id)" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span></button></div>
      <p v-if="preview.rows.length && !visibleRows.length">没有匹配的角色。</p><p v-if="!preview.rows.length">没有可导入的角色，请核对展柜设置和以下提示。</p>
      <details v-if="preview.skipped.length" class="skipped-characters" open><summary>{{ preview.skipped.length }} 位角色暂不能导入</summary><p v-for="message in preview.skipped" :key="message" class="skip">{{ message }}</p></details>
    </template>

  </div>
</template>
<style scoped>
.enka-import { display:grid; gap:16px; }p { color:var(--muted); font-size:var(--font-control); line-height:1.7; margin:0; }.enka-import .ui-action { font-size:var(--font-control); font-weight:700; }form { display:flex; align-items:end; gap:12px; margin:0; }form label { flex:1; display:grid; gap:8px; font-weight:700; font-size:var(--font-control); }input { min-width:0; }.preview-title { display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding-top:16px; border-top:1px solid var(--line); font-size:var(--font-control); }.preview-title > span { color:var(--muted); }.selection-total { margin-left:auto; color:var(--element-electro-deep); }.showcase-choices { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }.import-row { position:relative; min-width:0; display:grid; grid-template-columns:minmax(0,1fr) 24px; align-items:center; gap:8px; padding:12px; border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; color:var(--ink); background:var(--surface); text-align:left; }.import-row:hover { border-color:var(--line); border-top-color:var(--element-electro-primary); }.import-row.selected { border-top-color:var(--element-electro-deep); background:var(--element-electro-light); }.showcase-portrait { display:grid; justify-items:center; min-width:0; gap:10px; }.showcase-portrait strong { font-size:var(--font-control); font-weight:700; }.showcase-portrait :deep(.character-equipment-icons) { gap:8px; padding:0; }.selection-symbol { width:24px; height:24px; border:1px solid var(--line); border-radius:6px; background:var(--surface); box-sizing:border-box; }.selected .selection-symbol { color:white; border-color:var(--element-electro-deep); background:var(--element-electro-deep); }.selection-symbol svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:2.5; }.explanation { color:var(--ink); }.skipped-characters { font-size:var(--font-control); color:var(--element-geo-deep); }.skipped-characters p { margin-top:8px; color:var(--element-geo-deep); }
@media(max-width:1000px){.showcase-choices { grid-template-columns:repeat(2,minmax(0,1fr)); }}
@media(max-width:620px){.showcase-choices { grid-template-columns:minmax(0,1fr); }form { flex-wrap:wrap; }form label { flex-basis:100%; }.selection-total { margin-left:0; }}
</style>
