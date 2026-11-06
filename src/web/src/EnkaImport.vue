<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useAccountStore } from './stores/account';
import { fetchEnka, enkaErrorLabel } from './platform/enka';
import { previewEnkaImport, confirmEnkaImport, type EnkaPreview } from './domain/enka-import';
import GameIcon from './components/GameIcon.vue';
const emit = defineEmits<{ close:[]; imported:[id:string] }>();
const store=useAccountStore(); const uid=ref(''); const busy=ref(false); const error=ref(''); const preview=ref<EnkaPreview>(); const selected=ref<string[]>([]);
let revision=0; let controller:AbortController|undefined;
onBeforeUnmount(()=>{revision++;controller?.abort();});
async function query() {
  if (busy.value) return;
  const generation=++revision,owner=store.account;controller=new AbortController();busy.value=true;error.value='';preview.value=undefined;
  try {
    const identifier=uid.value.trim(); const response=await fetchEnka(identifier,controller.signal); if (revision!==generation||owner!==store.account) return; const result=await previewEnkaImport(response,identifier,owner);
    if (revision!==generation||owner!==store.account) return;
    preview.value=result;selected.value=result.rows.filter(row=>row.action!=='update').map(row=>row.character.id);
  } catch(cause) { if (revision===generation) error.value=enkaErrorLabel(cause); }
  finally { if (revision===generation) busy.value=false; }
}
function confirm() { try { if (!preview.value) return;const count=confirmEnkaImport(store.account,preview.value,selected.value);store.notice=`已导入 ${count} 位展柜角色；本地实物库存与穿戴关系保持。`;emit('imported',selected.value[0]);emit('close'); } catch(cause) { error.value=enkaErrorLabel(cause); } }
</script>
<template>
  <div class="enka-import">
    <p class="explanation">读取 UID 的公开角色展柜，无需登录。请在游戏中开启“显示角色详情”；未展示角色与背包库存无法通过此接口读取。未支持的数据会逐项提示，不使用默认数值填补。</p>
    <p>当前培养范围为 1–90 级，圣遗物支持五星；未支持条目会在预览中列出原因。</p>
    <form @submit.prevent="query"><label>游戏 UID<input v-model="uid" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="输入你的 UID" :disabled="busy"></label><button class="ui-action" data-accent="hydro" :disabled="busy || !/^\d{9,10}$/.test(uid.trim())">{{ busy?'正在查询…':'查询角色展柜' }}</button></form>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="preview"><div class="preview-title"><strong>{{ preview.nickname || '公开展柜' }}</strong><span>UID {{ preview.uid }} · 可读取 {{ preview.rows.length }} 位</span></div><p>装备保存为展柜快照，不作为背包实物重复入库。补全已有角色时保留本地穿戴；已有完整资料默认不勾选，选中后才更新培养和武器。</p>
      <label v-for="row in preview.rows" :key="row.character.id" class="import-row"><input v-model="selected" type="checkbox" :value="row.character.id"><GameIcon kind="characters" :id="row.character.realBuild?.character.id" :name="row.character.name" :size="48" /><span class="import-character-info"><strong>{{ row.character.name }}</strong><small>{{ row.character.realBuild?.level }}级 · {{ row.character.realBuild?.constellation }}命 · {{ row.character.weapon }}</small></span><b>{{ row.action==='add'?'新增':row.action==='complete'?'补全资料':'更新资料' }}</b></label>
      <p v-if="!preview.rows.length">没有可导入的角色。请确认展柜已公开详情；以下未支持条目不会用默认值替代。</p><details v-if="preview.skipped.length" class="skipped-characters" open><summary>{{ preview.skipped.length }} 位角色暂不能导入</summary><p v-for="message in preview.skipped" :key="message" class="skip">{{ message }}</p></details>
      <button class="ui-action" data-accent="hydro" :disabled="!selected.length" @click="confirm">确认导入 {{ selected.length }} 位角色</button>
    </template>
    <button class="ui-muted-button" @click="emit('close')">取消</button>
  </div>
</template>
<style scoped>
.enka-import { display:grid; gap:14px; }p { color:var(--muted); font-size:12px; line-height:1.7; margin:0; }form { display:flex; align-items:end; gap:12px; margin:0; }form label { flex:1; font-size:13px; }input { min-width:0; }.preview-title { display:flex; gap:12px; align-items:center; }.preview-title span { font-size:12px; color:var(--muted); }.import-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; }.import-row input { width:16px; height:16px; }.import-row > .import-character-info { display:grid; flex:1; min-width:0; gap:6px; font-size:14px; }small,b { font-size:12px; }small { color:var(--muted); overflow-wrap:anywhere; }.import-row > b { flex-shrink:0; }.skipped-characters summary { color:var(--element-geo-deep); font-size:13px; cursor:pointer; }.skipped-characters p { margin-top:8px; }b { color:var(--element-hydro-deep); font-weight:500; }.skip { color:var(--element-geo-deep); }@media(max-width:550px){form { flex-wrap:wrap; }form label { min-width:100%; }}
</style>
