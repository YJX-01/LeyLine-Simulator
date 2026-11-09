<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { loadRealCatalog, getArtifactMain } from '@leyline/game-data/real';
import { useAccountStore } from './stores/account';
import { previewMonaImport, confirmMonaImport, type MonaImportPreview } from './domain/mona-import';
import { artifactMainValue, formatGameStat } from './domain/account-presentation';
import { localDataErrorLabel } from './domain/workbench-labels';
import GameIcon from './components/GameIcon.vue';
import StatLabel from './components/StatLabel.vue';
import ChoiceGroup from './components/ChoiceGroup.vue';
import LibraryPagination from './components/LibraryPagination.vue';
import LibraryEmptyState from './components/LibraryEmptyState.vue';
const props=defineProps<{automatic?:boolean}>();
const emit=defineEmits<{imported:[]}>();
const store=useAccountStore();
const content=ref(''),filename=ref(''),error=ref(''),query=ref('');
const preview=ref<MonaImportPreview>(),busy=ref(false),allowUpdates=ref(false),fileInput=ref<HTMLInputElement>();
const category=ref('add'),page=ref(1);
const main=ref<Awaited<ReturnType<typeof getArtifactMain>>>();
let revision=0;
onBeforeUnmount(()=>{revision++;});
const hasPreview=computed(()=>!!preview.value);
const canConfirm=computed(()=>{
  const result=preview.value;
  return !!result && !busy.value && (result.additions.length>0 || allowUpdates.value && result.updates.length>0)
    && (!result.conflicts.length || allowUpdates.value && result.updates.length===result.conflicts.length);
});
const confirmLabel=computed(()=>!preview.value?'确认导入':allowUpdates.value?`确认新增 ${preview.value.additions.length} 件并更新 ${preview.value.updates.length} 件五星圣遗物`:`确认导入 ${preview.value.additions.length} 件五星圣遗物`);
const confirmText=computed(()=>confirmLabel.value.replace('五星圣遗物',''));
const summary=computed(()=>preview.value?[
  {label:'新增',count:preview.value.additions.length,tone:'hydro'},
  {label:'已存在',count:preview.value.duplicates,tone:'neutral'},
  {label:'跳过',count:preview.value.skipped.length,tone:'geo'},
  {label:'冲突',count:preview.value.conflicts.length,tone:'pyro'},
]:[]);
const items=computed(()=>category.value==='update'?preview.value?.updates.map(update=>update.item) ?? []:preview.value?.additions ?? []);
const filtered=computed(()=>items.value.filter(item=>`${item.name} ${item.mona?.equippedBy ?? ''}`.includes(query.value.trim())));
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/6)));
const visible=computed(()=>filtered.value.slice((page.value-1)*6,page.value*6));
const pendingSets=computed(()=>preview.value?.additions.filter(item=>item.mona?.setIdentityPending).length ?? 0);
watch([query,category],()=>{page.value=1;});
function invalidate() {revision++;preview.value=undefined;allowUpdates.value=false;}
async function readFile(event:Event) {
  const input=event.target as HTMLInputElement,file=input.files?.[0];
  if(!file || busy.value)return;
  invalidate();error.value='';filename.value='';content.value='';busy.value=true;
  const generation=revision;
  try {

    const text=await file.text();if(generation!==revision)return;
    content.value=text;filename.value=file.name;
    busy.value=false;
    if(props.automatic)await inspect();
  }catch(cause){if(generation===revision)error.value=cause instanceof Error?cause.message:'文件读取失败，请重新选择。';}
  finally {input.value='';if(generation===revision)busy.value=false;}
}
async function inspect() {
  if(busy.value)return;
  const generation=++revision,source=content.value,owner=store.account;
  busy.value=true;error.value='';preview.value=undefined;allowUpdates.value=false;
  try {
    const [catalog,table]=await Promise.all([loadRealCatalog(),getArtifactMain()]);
    const result=await previewMonaImport(source,owner,catalog.sets,table);
    if(generation!==revision)return;
    if(source!==content.value || owner!==store.account)throw new Error('文件或账号已变更，请重新预览。');
    main.value=table;preview.value=result;category.value='add';page.value=1;query.value='';
  }catch(cause){if(generation===revision)error.value=cause instanceof Error?cause.message:'无法读取，请检查是否为莫娜圣遗物 JSON。';}
  finally {if(generation===revision)busy.value=false;}
}
function confirm() {
  if(!canConfirm.value || !preview.value)return;
  try {
    const updated=allowUpdates.value?preview.value.updates.length:0;
    const added=confirmMonaImport(store.account,preview.value,allowUpdates.value);
    store.notice=`已新增 ${added} 件${updated?`，更新 ${updated} 件`:''}圣遗物。当前装备未变更，请保存账号文件。`;
    preview.value=undefined;content.value='';error.value='';emit('imported');
  }catch(cause){error.value=cause instanceof Error?cause.message:'导入失败，请重新预览后重试。';}
}
defineExpose({hasPreview,canConfirm,confirmLabel,confirmText,confirm,busy});
</script>
<template>
  <section class="mona-import import-flow" data-import-tone="hydro" aria-label="莫娜圣遗物导入">
    <p class="import-intro">导入莫娜社区版的圣遗物 JSON，核对后再加入库存。</p>
    <div class="file-entry import-entry"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8M8 17h5"/></svg><div class="file-description"><strong>{{ filename || '选择圣遗物文件' }}</strong><span>{{ filename?'可更换文件，或重新预览。':'选择莫娜导出的 JSON 文件。' }}</span></div><button class="ui-action soft" data-accent="hydro" :disabled="busy" @click="fileInput?.click()">{{ filename?'更换文件':'选择莫娜文件' }}</button></div>
    <input ref="fileInput" type="file" accept=".json,application/json" aria-label="导入莫娜圣遗物文件" :disabled="busy" hidden @change="readFile">

    <label class="paste-input import-field">粘贴 JSON<textarea v-model="content" aria-label="莫娜圣遗物 JSON" rows="5" :disabled="busy" spellcheck="false" placeholder="粘贴莫娜导出的 JSON…" @input="filename='';invalidate()"></textarea></label>
    <div v-if="content.trim()" class="input-tools"><button v-if="content.trim()" class="ui-action soft" data-accent="hydro" :disabled="busy" @click="inspect">{{ busy?'检查中…':'预览莫娜导入' }}</button></div>
    <p v-if="busy" role="status">正在检查文件…</p>
    <div v-if="error" class="import-error" role="alert"><p>{{ localDataErrorLabel(error) }}</p><details><summary>查看原因</summary><p>{{ error }}</p></details></div>
    <div v-if="preview" class="import-preview" aria-label="莫娜导入预览">
      <div class="preview-counts" role="status"><div v-for="item in summary" :key="item.label" :data-tone="item.count?item.tone:'neutral'"><strong>{{ item.label }} {{ item.count }} 件</strong></div></div>
      <p class="import-note">穿戴备注会保留，当前装备不变。</p>
      <p v-if="pendingSets" class="import-warning">{{ pendingSets }} 件套装待核对，导入后暂不能用于计算。</p>
      <details v-if="preview.conflicts.length" class="import-issues" open><summary>{{ preview.conflicts.length }} 处冲突需要核对</summary><p v-for="(message,index) in preview.conflicts" :key="index">{{ message }}</p></details>
      <section v-if="preview.updates.length" class="update-choice"><h3>已有物品</h3><ChoiceGroup :model-value="allowUpdates?'update':'keep'" :options="[{value:'keep',label:'保留现有'},{value:'update',label:`更新 ${preview.updates.length} 件`}]" label="同来源物品处理" tone="hydro" @update:model-value="allowUpdates=$event==='update'" /><p>更新会保留物品名称和装备归属。</p></section>
      <p v-if="preview.conflicts.length>preview.updates.length" class="import-warning">有冲突无法直接更新，请修改源文件后重新预览。</p>
      <details v-if="preview.skipped.length" class="import-issues"><summary>{{ preview.skipped.length }} 件未导入</summary><p v-for="(message,index) in preview.skipped" :key="index">{{ message }}</p></details>
      <div class="preview-toolbar"><h3>物品预览</h3><ChoiceGroup v-if="preview.updates.length" v-model="category" small joined tone="hydro" :options="[{value:'add',label:'新增'},{value:'update',label:'待更新'}]" label="预览物品类型" /><input v-if="items.length" v-model="query" class="ui-control" aria-label="搜索待导入圣遗物" placeholder="查找套装或穿戴备注…" autocomplete="off"></div>
      <div v-if="visible.length" class="preview-items"><article v-for="item in visible" :key="item.id" class="preview-item"><GameIcon kind="artifacts" :id="item.real && !item.mona?.setIdentityPending?`${item.real.setId}-${item.slot}`:undefined" :size="40" /><div class="preview-item-name"><strong>{{ item.name }}</strong><span>{{ item.mona?.equippedBy?`穿戴备注：${item.mona.equippedBy}`:'无穿戴备注' }}{{ item.mona?.omit?' · 原文件标记忽略':'' }}</span></div><span v-if="item.real" class="preview-main"><StatLabel :stat="item.real.mainStat" short /><b>{{ formatGameStat(item.real.mainStat,artifactMainValue(item,main),false) }}</b></span><b class="preview-level">+{{ item.real?.level ?? '?' }}</b></article></div>
      <LibraryEmptyState v-else :title="query?'没有匹配的物品':category==='update'?'没有待更新物品':'没有新增物品'" :description="!query && preview.duplicates?'这些物品已在库存中。':undefined" :action="query?'清除搜索':'重新选择文件'" @action="query?query='':fileInput?.click()" />
      <LibraryPagination v-model:page="page" :pages="pages" />
      <details class="import-help"><summary>导入范围</summary><p>仅导入五星圣遗物。相同属性的不同实物分别保留；穿戴备注不用于推断角色等级、武器或天赋。</p><p>套装名按莫娜 7.2.02 核对。旧物品的套装身份可以在重新导入后确认更新，手动修改不会自动覆盖。</p></details>
    </div>
    <p v-else-if="!busy" class="import-note">确认导入前，库存不会改变。</p>
  </section>
</template>
<style scoped>
.file-entry { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }.file-entry > svg { width:32px; height:32px; color:var(--element-hydro-deep); }.file-description { flex:1; min-width:0; display:grid; gap:6px; }.file-description strong { font-size:var(--font-control); overflow-wrap:anywhere; }.file-description span { color:var(--muted); font-size:var(--font-control); }.input-tools { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }.paste-input { width:100%; box-sizing:border-box; }.paste-input textarea { width:100%; box-sizing:border-box; min-height:120px; padding:12px; font-size:var(--font-control); }.import-preview { display:grid; gap:16px; }.preview-counts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }.preview-counts > div { padding:12px 8px; border-radius:7px; background:var(--neutral-canvas); font-size:var(--font-control); text-align:center; }.preview-counts [data-tone=hydro] { color:var(--element-hydro-deep); background:var(--element-hydro-light); }.preview-counts [data-tone=geo] { color:var(--element-geo-deep); background:var(--element-geo-light); }.preview-counts [data-tone=pyro] { color:var(--element-pyro-deep); background:var(--element-pyro-light); }.import-warning,.import-issues { color:var(--element-geo-deep); }.import-error { color:var(--element-pyro-deep); }.import-issues,.import-help,.import-error details { font-size:var(--font-control); }.import-issues p,.import-help p { margin-top:8px; }.import-help { color:var(--muted); border-top:1px solid var(--line); padding-top:12px; }.update-choice { display:grid; gap:10px; }.update-choice h3,.preview-toolbar h3 { margin:0; font-size:var(--font-control); }.preview-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }.preview-toolbar input { margin-left:auto; width:min(100%,280px); height:32px; min-height:32px; padding:0 10px; font-size:var(--font-control); }.preview-items { display:grid; }.preview-item { display:grid; grid-template-columns:40px minmax(0,1fr) auto auto; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--line); }.preview-item-name { min-width:0; display:grid; gap:6px; }.preview-item-name strong { font-size:var(--font-control); overflow-wrap:anywhere; }.preview-item-name span { color:var(--muted); font-size:var(--font-control); }.preview-main { display:flex; align-items:center; gap:8px; font-size:var(--font-control); }.preview-main b,.preview-level { font-variant-numeric:tabular-nums; font-size:var(--font-control); }
@media(max-width:600px) { .preview-counts { grid-template-columns:repeat(2,minmax(0,1fr)); }.preview-item { grid-template-columns:40px minmax(0,1fr) auto; gap:8px; }.preview-main { grid-column:2; }.preview-level { grid-column:3; grid-row:1; }.preview-item-name { grid-column:2; }.file-entry > .ui-action { width:100%; }.preview-toolbar input { width:100%; } }
</style>
