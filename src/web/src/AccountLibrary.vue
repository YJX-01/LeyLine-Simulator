<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { accountSlots, accountSlotLabels, artifactOwner, equipArtifact, type AccountSlot } from './domain/account';
import { useAccountStore } from './stores/account';
import { localDataErrorLabel } from './domain/workbench-labels';
import { loadAccountGameData } from './domain/account-presentation';
import { previewMonaSetRepairs, confirmMonaImport, type MonaImportPreview } from './domain/mona-import';
import ArtifactBrowser from './ArtifactBrowser.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import { organizeMonaWearNotes } from './domain/mona-wear-notes';
import CharacterForm from './CharacterForm.vue';
import CharacterStats from './CharacterStats.vue';
import ArtifactForm from './ArtifactForm.vue';
import GameIcon from './components/GameIcon.vue';
import ArtifactSummary from './ArtifactSummary.vue';
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));

defineProps<{ page: 'characters' | 'artifacts' }>();
const store = useAccountStore();
const { account, error, notice } = storeToRefs(store);
const { selectedCharacterId: characterId, characterQuery: query } = storeToRefs(store);
const character = computed(() => account.value.characters.find(entry => entry.id === characterId.value));
const artifactId = ref('');
const equipmentSlot = ref<AccountSlot>('flower');
const editingCharacter = ref(false);
const modal = ref<'import' | 'create' | 'equipment' | 'notes' | 'artifact' | 'repair' | ''>('');
const repairPreview = ref<MonaImportPreview>();
const checkingSets = ref(false);
async function inspectSets() {
  if (checkingSets.value) return;
  checkingSets.value = true;
  const owner = account.value;
  try { const data = await loadAccountGameData(); const preview = await previewMonaSetRepairs(owner, data.catalog.sets); if (owner !== account.value) return; repairPreview.value = preview; modal.value = 'repair'; }
  catch (cause) { error.value = String(cause); } finally { checkingSets.value = false; }
}
function repairSets() {
  if (!repairPreview.value) return;
  try { confirmMonaImport(account.value, repairPreview.value, true); notice.value = `已补全 ${repairPreview.value.updates.length} 件圣遗物的套装身份，词条和装备归属不变。`; modal.value = ''; }
  catch (cause) { error.value = String(cause); }
}
const noteNames = computed(() => [...new Set(account.value.artifacts.flatMap(item => item.mona?.equippedBy ? [item.mona.equippedBy] : []))]);
function organizeNotes() {
  try { const result = organizeMonaWearNotes(account.value); notice.value = `已根据原始穿戴备注新增 ${result.added} 位待补全角色。${result.conflicts.join('；')}请设置角色与武器，等级和天赋按用户指定的满级设定核对。`; modal.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '整理失败，现有资料保持不变。'; }
}
const visibleCharacters = computed(() => account.value.characters.filter(entry => entry.name.includes(query.value.trim())));
const pending = ref<{ accountId: string; characterId: string; artifactId: string; message: string }>();
function equip() {
  if (!character.value || !artifactId.value) { error.value = '请选择角色和圣遗物。'; return; }
  const owner = artifactOwner(account.value, artifactId.value);
  const item = account.value.artifacts.find(entry => entry.id === artifactId.value)!;
  if (owner && owner.id !== character.value.id) {
    pending.value = { accountId: account.value.id, characterId: character.value.id, artifactId: item.id, message: `将「${item.name}」从「${owner.name}」卸下并转移给「${character.value.name}」，替换目标角色同部位装备（原装备保留在库存）。` };
  } else equipArtifact(account.value, character.value.id, item.id);
}
function confirmTransfer() {
  if (!pending.value) return;
  if (pending.value.accountId !== account.value.id) { pending.value = undefined; return; }
  try { equipArtifact(account.value, pending.value.characterId, pending.value.artifactId, true); } catch (cause) { error.value = String(cause); pending.value = undefined; return; }
  pending.value = undefined;
  notice.value = '已确认转移装备，原装备仍保留在库存。';
}
</script>

<template>
  <section class="account-library panel">
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>
    <p class="account-note"><strong>{{ account.name }}</strong><span>{{ account.characters.length }} 位角色 · {{ account.artifacts.length }} 件圣遗物</span></p>

    <template v-if="page === 'characters'">
      <div class="account-toolbar"><label>查找账号角色<input v-model="query" aria-label="搜索账号角色" placeholder="输入角色名称"></label><button @click="editingCharacter = false; modal = 'create'">添加账号角色</button><button v-if="noteNames.length" @click="modal = 'notes'">从穿戴备注整理角色</button></div>
      <WorkbenchDialog v-if="modal === 'notes'" title="从穿戴备注整理角色" @close="modal = ''"><p>文件中有 {{ noteNames.length }} 个角色穿戴备注：{{ noteNames.join('、') }}。</p><p>仅新增尚不存在的角色资料，并按没有冲突的原始备注登记装备。已有角色与装备不覆盖；武器、命座、等级和天赋不来自此文件，角色需继续补全后才能计算。</p><button @click="organizeNotes">确认按备注整理</button></WorkbenchDialog>
      <div class="character-workspace"><aside><div class="character-cards"><button v-for="entry in visibleCharacters" :key="entry.id" :class="{ selected: characterId === entry.id }" @click="characterId = entry.id"><GameIcon class="character-avatar" kind="characters" :id="entry.realBuild?.character.id" :name="entry.name" :size="48" /><strong>{{ entry.name }}</strong><small>{{ entry.realBuild ? `${entry.realBuild.level}级 · ${entry.realBuild.constellation}命 · ${entry.realBuild.weapon.name}` : '资料待补全' }}</small><small>{{ Object.keys(entry.equipment).length }} / 5 件圣遗物</small></button></div>
      <p v-if="!visibleCharacters.length" class="account-empty">没有符合条件的角色，请调整搜索。</p></aside><div class="character-detail">
      <WorkbenchDialog v-if="modal === 'create'" :title="editingCharacter ? '编辑角色资料' : '添加账号角色'" @close="modal = ''"><CharacterForm :character="editingCharacter ? character : undefined" @saved="characterId = $event" @close="modal = ''" /></WorkbenchDialog>
      <div v-if="character" class="account-editor">
        <div class="detail-heading"><div class="character-identity"><GameIcon kind="characters" :id="character.realBuild?.character.id" :name="character.name" :size="64" /><div><h2>{{ character.name }}</h2></div></div><button @click="editingCharacter = true; modal = 'create'">{{ character.realBuild ? '编辑角色资料' : '补全角色资料' }}</button></div>
        <p v-if="!visibleCharacters.some(entry => entry.id === character?.id)">当前查看的角色不在搜索结果中。</p>
        <p v-if="!character.realBuild">培养资料待补全。请确认游戏角色与武器后，再到队伍页面编队计算。</p>
        <template v-else><div class="character-build-summary"><GameIcon kind="weapons" :id="character.realBuild.weapon.id" :size="64" /><div><p>{{ character.realBuild.level }}级 · {{ character.realBuild.constellation }}命 · {{ character.realBuild.weapon.name }} · 精炼{{ character.realBuild.refinement }}</p><p>天赋 {{ character.realBuild.talents.normal }} / {{ character.realBuild.talents.skill }} / {{ character.realBuild.talents.burst }}</p><p>账号配装在此管理；编队与整轴计算请进入项目的队伍页面。</p></div></div></template>
        <CharacterStats :character="character" />
        <div class="equipment-list"><article v-for="slot in accountSlots" :key="slot"><h3>{{ accountSlotLabels[slot] }}</h3><ArtifactSummary v-if="account.artifacts.find(item => item.id === character?.equipment[slot])" :item="account.artifacts.find(item => item.id === character?.equipment[slot])!" compact /><p v-else>未装备</p><div class="equipment-actions"><button @click="equipmentSlot = slot; modal = 'equipment'">{{ character.equipment[slot] ? '更换' : '装备' }}{{ accountSlotLabels[slot] }}</button><button v-if="character.equipment[slot]" @click="delete character.equipment[slot]">卸下</button></div></article></div>
        <WorkbenchDialog v-if="modal === 'equipment'" :title="`选择${accountSlotLabels[equipmentSlot]}`" @close="modal = ''"><p>为 {{ character.name }} 选择装备；替换的原装备保留在库存。</p><div v-if="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])"><h3>当前装备</h3><ArtifactSummary :item="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])!" compact /></div><h3>库存候选</h3><ArtifactBrowser pick :slot="equipmentSlot" :compare-to="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])" @select="artifactId = $event.id; equip(); modal = ''" /></WorkbenchDialog>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
      </div>
      <p v-else class="account-empty">{{ account.characters.length ? '选择一张角色卡片，查看配装与实际装备。' : '还没有角色资料。添加自己的角色后，设置实际等级、武器并从库存装备圣遗物。莫娜圣遗物文件不包含完整角色资料。' }}</p>
      </div></div>
    </template>
    <template v-else>
      <div class="account-toolbar"><button class="primary" @click="modal = 'import'">导入莫娜圣遗物</button><button @click="modal = 'artifact'">手动添加圣遗物</button><button v-if="account.artifacts.some(item => item.mona?.setIdentityPending)" :disabled="checkingSets" @click="inspectSets">核对已导入套装</button><span>先预览，再确认；保留每件实物与原始词条。</span></div>
      <WorkbenchDialog v-if="modal === 'repair' && repairPreview" title="核对已导入套装" @close="modal = ''"><p>根据莫娜 7.2.02 核实套装身份，仅补全未经手动修改的物品，不改变词条或穿戴关系。</p><p v-for="update in repairPreview.updates" :key="update.item.id">{{ update.item.mona?.sourceSetName }} → {{ update.item.name }}</p><p v-for="message in repairPreview.skipped" :key="message">{{ message }}</p><p v-if="!repairPreview.updates.length">没有可以直接补全的物品。</p><button :disabled="!repairPreview.updates.length" @click="repairSets">确认补全 {{ repairPreview.updates.length }} 件套装身份</button></WorkbenchDialog>
      <ArtifactBrowser />
      <WorkbenchDialog v-if="modal === 'import'" title="导入莫娜圣遗物" @close="modal = ''"><MonaImport automatic @imported="modal = ''" /></WorkbenchDialog>
      <WorkbenchDialog v-if="modal === 'artifact'" title="手动添加圣遗物" @close="modal = ''"><ArtifactForm @close="modal = ''" /></WorkbenchDialog>
    </template>
  </section>
</template>

<style scoped>
.character-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; margin:20px 0; }.character-cards button { display:grid; gap:10px; text-align:left; padding:18px; border:1px solid #d8cfb4; border-radius:10px; background:#faf8ef; }.character-cards .selected { border-color:#46675c; box-shadow:0 0 0 2px #46675c33; }.character-avatar { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; color:#fff5d3; background:#46675c; font-size:24px; }.character-cards small { color:#617166; }.account-empty { padding:40px 20px; border:1px dashed #c7c0a7; border-radius:12px; text-align:center; }.legacy-inventory { margin-top:24px; }.account-library { margin: 0 30px; color: var(--text, #394555); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size: 12px; line-height: 1.8; }
label { font-size: 12px; display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }
.account-editor { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; margin-top: 20px; }
.equipment-list, .account-copy, .transfer-confirm, .account-real-panel, details { grid-column: 1/-1; }.equipment-list > div { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 12px; }
.account-copy { border-top: 1px solid var(--line, #d8c9a8); padding-top: 16px; display: grid; gap: 12px; }
.account-note { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:0 0 16px; }.account-note strong { font-size:14px; }.account-note span { color:#6e7a71; }.account-error { color: #a62c36; }.transfer-confirm { border: 1px solid #ad8b4b; padding: 16px; }.transfer-confirm button { margin-right: 12px; }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line, #d8c9a8); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size: 11px; overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
.character-workspace { display:grid; grid-template-columns:240px minmax(0,1fr); gap:24px; align-items:start; }.character-workspace aside { position:sticky; top:16px; max-height:calc(100vh - 180px); overflow:auto; }.character-cards { grid-template-columns:1fr; gap:8px; margin:0; }.character-cards button { color:var(--ink,#283449); padding:12px; grid-template-columns:36px 1fr; gap:6px 10px; }.character-avatar { width:36px; height:36px; font-size:20px; grid-row:span 3; }.character-cards small { grid-column:2; }.account-editor { display:block; margin:0; }.detail-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; }h2 { margin:0; font-size:20px; }.equipment-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }.equipment-list article { border:1px solid var(--line,#d8c9a8); padding:14px; border-radius:10px; background:#fffdf7; }h3 { font-size:13px; margin:0 0 14px; }.equipment-actions { display:flex; gap:8px; margin-top:12px; }.account-library { margin-inline:0; }
@media(max-width:800px) { .character-workspace { grid-template-columns:1fr; }.character-workspace aside { position:static; max-height:240px; }.character-cards { grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); } }
.character-identity { display:flex; align-items:center; gap:16px; }.detail-kicker { font-size:11px; color:#7a887e; letter-spacing:.12em; }h2 { margin-top:7px; }.character-build-summary { display:flex; align-items:center; gap:16px; border-bottom:1px solid var(--line); padding:12px 0; }.character-build-summary p { margin:4px 0; }.character-cards button { grid-template-columns:48px minmax(0,1fr); border-color:transparent; background:transparent; }.character-cards button:hover { background:#f0f4ed; }.character-cards .selected { background:#fffdf6; border-color:#b6c7b4; box-shadow:0 3px 12px #34483c0c; }.character-workspace aside { background:#edf1e9; border:1px solid #e2e7dc; padding:10px; border-radius:14px; }.character-avatar { grid-row:span 3; }.equipment-list article { background:linear-gradient(145deg,#fffefa,#f8f6ee); box-shadow:0 2px 7px #283e3006; }.detail-heading { padding-bottom:16px; }.equipment-actions button { padding:8px 10px; font-size:12px; }.equipment-actions button:last-child:not(:first-child) { background:transparent; color:#6b756b; border-color:#dce1d5; }.account-note { padding-bottom:16px; border-bottom:1px solid #e8e9df; }.character-detail { min-width:0; }
.account-toolbar > button:last-child:not(:first-child) { background:#fffdf8; color:#62765f; border-color:#cddac6; }.account-library > [role=status] { color:#61755d; font-size:12px; padding:8px 12px; background:#eef3e8; border-radius:8px; margin-top:0; }.character-cards strong { align-self:end; }.character-cards small { line-height:1.5; }
</style>
