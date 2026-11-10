<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { loadCatalog, getArtifactMain } from '@leyline/game-data';
import { useAccountStore } from '../stores/account';
import { previewMonaImport, confirmMonaImport, type MonaImportPreview } from '../domain/mona-import';
import { localDataErrorLabel } from '../domain/workbench-labels';
import { accountSlots, accountSlotLabels } from '../domain/account';
import ArtifactSummary from './ArtifactSummary.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import LibraryShortcuts from '../components/LibraryShortcuts.vue';
import LibraryListHeader from '../components/LibraryListHeader.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import LibraryPagination from '../components/LibraryPagination.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
const props=defineProps<{automatic?:boolean}>();
const emit=defineEmits<{imported:[]}>();
const store=useAccountStore();
const content=ref(''),filename=ref(''),error=ref(''),query=ref('');
const preview=ref<MonaImportPreview>(),busy=ref(false),allowUpdates=ref(false),fileInput=ref<HTMLInputElement>();
const category=ref('add'),page=ref(1);
const slotFilter=ref<string[]>([]);
const previewSummary=ref<HTMLElement>();
const slots=accountSlots.map(value=>({value,label:accountSlotLabels[value]}));
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
const filtered=computed(()=>items.value.filter(item=>(!slotFilter.value.length || slotFilter.value.includes(item.slot)) && `${item.name} ${item.mona?.equippedBy ?? ''}`.includes(query.value.trim())));
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/6)));
const visible=computed(()=>filtered.value.slice((page.value-1)*6,page.value*6));
const pendingSets=computed(()=>preview.value?.additions.filter(item=>item.mona?.setIdentityPending).length ?? 0);
watch([query,category,slotFilter],()=>{page.value=1;});
watch(pages,value=>{page.value=Math.min(page.value,value);});
function clearPreviewFilters(){query.value='';slotFilter.value=[];}
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
    const [catalog,table]=await Promise.all([loadCatalog(),getArtifactMain()]);
    const result=await previewMonaImport(source,owner,catalog.sets,table);
    if(generation!==revision)return;
    if(source!==content.value || owner!==store.account)throw new Error('文件或账号已变更，请重新预览。');
    preview.value=result;category.value='add';page.value=1;clearPreviewFilters();
    await nextTick();
    if(generation!==revision)return;
    previewSummary.value?.scrollIntoView({block:'start'});
    previewSummary.value?.focus({preventScroll:true});
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
      <div ref="previewSummary" class="preview-counts" role="status" tabindex="-1" aria-label="导入结果汇总"><div v-for="item in summary" :key="item.label" :data-tone="item.count?item.tone:'neutral'"><strong>{{ item.label }} {{ item.count }} 件</strong></div></div>
      <p class="import-note">穿戴备注会保留，当前装备不变。</p>
      <p v-if="pendingSets" class="import-warning">{{ pendingSets }} 件套装待核对，导入后暂不能用于计算。</p>
      <details v-if="preview.conflicts.length" class="import-issues" open><summary>{{ preview.conflicts.length }} 处冲突需要核对</summary><p v-for="(message,index) in preview.conflicts" :key="index">{{ message }}</p></details>
      <section v-if="preview.updates.length" class="update-choice"><h3>已有物品</h3><ChoiceGroup :model-value="allowUpdates?'update':'keep'" :options="[{value:'keep',label:'保留现有'},{value:'update',label:`更新 ${preview.updates.length} 件`}]" label="同来源物品处理" tone="hydro" @update:model-value="allowUpdates=$event==='update'" /><p>更新会保留物品名称和装备归属。</p></section>
      <p v-if="preview.conflicts.length>preview.updates.length" class="import-warning">有冲突无法直接更新，请修改源文件后重新预览。</p>
      <details v-if="preview.skipped.length" class="import-issues"><summary>{{ preview.skipped.length }} 件未导入</summary><p v-for="(message,index) in preview.skipped" :key="index">{{ message }}</p></details>
      <section class="preview-list" aria-label="待导入物品列表">
        <div class="preview-heading"><h3>物品预览</h3><ChoiceGroup v-if="preview.updates.length" v-model="category" small joined tone="hydro" :options="[{value:'add',label:'新增'},{value:'update',label:'待更新'}]" label="预览物品类型" /></div>
        <LibraryToolbar v-if="items.length" v-model="query" label="搜索待导入圣遗物" placeholder="查找套装或穿戴备注…" search-only />
        <LibraryShortcuts v-if="items.length" v-model="slotFilter" class="preview-slots" kind="artifactSlots" label="预览部位筛选" all-label="全部" :options="slots" :mobile-columns="3" />
        <LibraryListHeader v-model:page="page" :pages="pages" :count="filtered.length" :total="items.length" unit="件圣遗物" />
        <div v-if="visible.length" class="preview-items">
          <article v-for="item in visible" :key="item.id" class="preview-item artifact-item-card" data-passive :data-artifact-id="item.id" :data-rarity="item.real?.rarity" :aria-label="item.name">
            <h4 class="preview-item-name">{{ item.name }}</h4>
            <ArtifactSummary :item="item" :account="store.account" variant="relaxed" :wearers="[]" />
            <div class="preview-item-notes"><span>{{ item.mona?.equippedBy?`穿戴备注：${item.mona.equippedBy}`:'无穿戴备注' }}</span><span v-if="item.mona?.omit" class="preview-omitted">原文件标记忽略</span></div>
          </article>
        </div>
        <LibraryEmptyState v-else :title="query || slotFilter.length?'没有匹配的物品':category==='update'?'没有待更新物品':'没有新增物品'" :description="!query && !slotFilter.length && preview.duplicates?'这些物品已在库存中。':undefined" :action="query?'清除搜索':slotFilter.length?'清除筛选':'重新选择文件'" @action="query || slotFilter.length?clearPreviewFilters():fileInput?.click()" />
        <LibraryPagination v-model:page="page" :pages="pages" always position="底部" full />
      </section>
    </div>
    <p v-else-if="!busy" class="import-note">确认导入前，库存不会改变。</p>
  </section>
</template>
<style scoped>
.file-entry { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.file-entry > svg { width:32px; height:32px; color:var(--element-hydro-deep); }
.file-description { flex:1; min-width:0; display:grid; gap:6px; }
.file-description strong { font-size:var(--font-control); overflow-wrap:anywhere; }
.file-description span { color:var(--muted); font-size:var(--font-control); }
.input-tools { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.paste-input { width:100%; box-sizing:border-box; }
.paste-input textarea { width:100%; box-sizing:border-box; min-height:120px; padding:12px; font-size:var(--font-control); }
.import-preview { display:grid; gap:16px; min-width:0; }
.preview-counts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
.preview-counts > div { padding:12px 8px; border-radius:7px; background:var(--neutral-canvas); font-size:var(--font-control); text-align:center; }
.preview-counts [data-tone=hydro] { color:var(--element-hydro-deep); background:var(--element-hydro-light); }
.preview-counts [data-tone=geo] { color:var(--element-geo-deep); background:var(--element-geo-light); }
.preview-counts [data-tone=pyro] { color:var(--element-pyro-deep); background:var(--element-pyro-light); }
.import-warning,.import-issues { color:var(--element-geo-deep); }
.import-error { color:var(--element-pyro-deep); }
.import-issues,.import-error details { font-size:var(--font-control); }
.import-issues p { margin-top:8px; }
.update-choice { display:grid; gap:10px; }
.update-choice h3,.preview-heading h3 { margin:0; font-size:var(--font-control); }
.preview-list { display:grid; gap:12px; min-width:0; }
.preview-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.preview-slots { --shortcut-deep:var(--import-deep); --shortcut-light:var(--import-light); }
.preview-items { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr)); gap:12px; min-width:0; }
.preview-item { display:grid; align-content:start; gap:12px; }
.preview-item-name { margin:0; color:var(--ink); font-size:var(--font-control); font-weight:700; line-height:1.5; overflow-wrap:anywhere; }
.preview-item :deep(.artifact-summary) { grid-template-columns:max-content minmax(0,1fr); }
.preview-item :deep(.artifact-values) { width:100%; justify-self:stretch; }
.preview-item :deep(dl) { grid-template-columns:minmax(0,1fr) max-content; }
.preview-item :deep(.summary-main) { color:var(--element-geo-deep); font-size:var(--font-body); line-height:1.35; }
.preview-item :deep(.pending) { color:var(--element-geo-deep); font-size:var(--font-body); }
.preview-item-notes { display:flex; flex-wrap:wrap; gap:8px 12px; padding-top:8px; border-top:1px solid var(--line); color:var(--muted); font-size:var(--font-body); line-height:1.5; overflow-wrap:anywhere; }
.preview-omitted { color:var(--element-geo-deep); }
.preview-list > :deep(.library-pagination) { margin-top:0; }
@media(max-width:600px) {
  .preview-counts { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .file-entry > .ui-action { width:100%; }
}
</style>
