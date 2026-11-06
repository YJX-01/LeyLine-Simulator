<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { accountSlots, accountSlotLabels, artifactOwner, equipArtifact, type AccountSlot } from './domain/account';
import { useAccountStore } from './stores/account';
import { localDataErrorLabel } from './domain/workbench-labels';
import ArtifactBrowser from './ArtifactBrowser.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import { organizeMonaWearNotes } from './domain/mona-wear-notes';
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));
const RealGamePanel = defineAsyncComponent(() => import('./RealGamePanel.vue'));

defineProps<{ page: 'characters' | 'artifacts' }>();
const store = useAccountStore();
const { account, error, notice } = storeToRefs(store);
const { selectedCharacterId: characterId, characterQuery: query } = storeToRefs(store);
const character = computed(() => account.value.characters.find(entry => entry.id === characterId.value));
const newCharacterName = ref('');
const newArtifactName = ref('');
const newSlot = ref<AccountSlot>('flower');
const artifactId = ref('');
const modal = ref<'import' | 'create' | 'equipment' | 'notes' | ''>('');
const noteNames = computed(() => [...new Set(account.value.artifacts.flatMap(item => item.mona?.equippedBy ? [item.mona.equippedBy] : []))]);
function organizeNotes() {
  try { const result = organizeMonaWearNotes(account.value); notice.value = `已根据原始穿戴备注新增 ${result.added} 位待补全角色。${result.conflicts.join('；')}请设置角色与武器，等级和天赋按用户指定的满级设定核对。`; modal.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '整理失败，现有资料保持不变。'; }
}
const visibleCharacters = computed(() => account.value.characters.filter(entry => entry.name.includes(query.value.trim())));
const pending = ref<{ characterId: string; artifactId: string; message: string }>();
function addCharacter() {
  if (!newCharacterName.value.trim()) { error.value = '请填写角色名称。'; return false; }
  const id = crypto.randomUUID();
  account.value.characters.push({ id, name: newCharacterName.value.trim(), attack: 0, weapon: '待选择武器', equipment: {} });
  characterId.value = id; newCharacterName.value = ''; error.value = '';
  return true;
}
function createAndClose() { if (addCharacter()) modal.value = ''; }
function addArtifact() {
  if (!newArtifactName.value.trim()) { error.value = '请填写圣遗物名称。'; return; }
  account.value.artifacts.push({ id: crypto.randomUUID(), name: newArtifactName.value.trim(), slot: newSlot.value, attack: 0 });
  newArtifactName.value = ''; error.value = '';
}
function equip() {
  if (!character.value || !artifactId.value) { error.value = '请选择角色和圣遗物。'; return; }
  const owner = artifactOwner(account.value, artifactId.value);
  const item = account.value.artifacts.find(entry => entry.id === artifactId.value)!;
  if (owner && owner.id !== character.value.id) {
    pending.value = { characterId: character.value.id, artifactId: item.id, message: `将「${item.name}」从「${owner.name}」卸下并转移给「${character.value.name}」，替换目标角色同部位装备（原装备保留在库存）。` };
  } else equipArtifact(account.value, character.value.id, item.id);
}
function confirmTransfer() {
  if (!pending.value) return;
  equipArtifact(account.value, pending.value.characterId, pending.value.artifactId, true); pending.value = undefined;
  notice.value = '已确认转移装备，原装备仍保留在库存。';
}
</script>

<template>
  <section class="account-library panel">
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>
    <p class="account-note"><strong>{{ account.name }}</strong><span>{{ account.characters.length }} 位角色 · {{ account.artifacts.length }} 件圣遗物</span></p>

    <template v-if="page === 'characters'">
      <div class="account-toolbar"><label>查找账号角色<input v-model="query" aria-label="搜索账号角色" placeholder="输入角色名称"></label><button @click="modal = 'create'">添加账号角色</button><button v-if="noteNames.length" @click="modal = 'notes'">从穿戴备注整理角色</button></div>
      <WorkbenchDialog v-if="modal === 'notes'" title="从穿戴备注整理角色" @close="modal = ''"><p>文件中有 {{ noteNames.length }} 个角色穿戴备注：{{ noteNames.join('、') }}。</p><p>仅新增尚不存在的角色资料，并按没有冲突的原始备注登记装备。已有角色与装备不覆盖；武器、命座、等级和天赋不来自此文件，角色需继续补全后才能计算。</p><button @click="organizeNotes">确认按备注整理</button></WorkbenchDialog>
      <div class="character-cards"><button v-for="entry in visibleCharacters" :key="entry.id" :class="{ selected: characterId === entry.id }" @click="characterId = entry.id"><span class="character-avatar">{{ entry.name.slice(0, 1) }}</span><strong>{{ entry.name }}</strong><small>{{ entry.realBuild ? `${entry.realBuild.level}级 · ${entry.realBuild.constellation}命 · ${entry.realBuild.weapon.name}` : '资料待补全' }}</small><small>{{ Object.keys(entry.equipment).length }} / 5 件圣遗物</small></button></div>
      <WorkbenchDialog v-if="modal === 'create'" title="添加账号角色" @close="modal = ''"><p>按自己的实际资料填写；创建后再设置真实角色、等级与武器，不会生成游戏记录。</p><label>角色名称<input v-model="newCharacterName" aria-label="新角色名称" maxlength="160" placeholder="填写实际持有的角色名称"></label><p v-if="error" role="alert">{{ error }}</p><button @click="createAndClose">创建角色资料</button></WorkbenchDialog>
      <div v-if="character" class="account-editor">
        <label>角色名称<input v-model="character.name" aria-label="账号角色名称" maxlength="160"></label>
        <p v-if="!character.realBuild">培养资料待补全。请在下方选择真实角色与武器；旧版占位数值不作为账号面板展示或用于新队伍计算。</p>
        <div class="equipment-list"><h3>实际圣遗物</h3><div v-for="slot in accountSlots" :key="slot"><span>{{ accountSlotLabels[slot] }}：{{ account.artifacts.find(item => item.id === character?.equipment[slot])?.name ?? '未装备' }}</span><button v-if="character.equipment[slot]" @click="delete character.equipment[slot]">卸下{{ accountSlotLabels[slot] }}</button></div></div>
        <button @click="modal = 'equipment'">从库存选择圣遗物</button>
        <WorkbenchDialog v-if="modal === 'equipment'" title="选择实际装备" @close="modal = ''"><ArtifactBrowser pick @select="artifactId = $event.id; equip(); modal = ''" /></WorkbenchDialog>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
        <div class="account-real-panel"><RealGamePanel modern mode="account" :account-character-id="characterId" /></div><details><summary>技术详情</summary><p>账号标识：{{ account.id }}</p><p>角色标识：{{ character.id }}</p></details>
      </div>
      <p v-else class="account-empty">{{ account.characters.length ? '选择一张角色卡片，查看配装与实际装备。' : '还没有角色资料。添加自己的角色后，设置实际等级、武器并从库存装备圣遗物。莫娜圣遗物文件不包含完整角色资料。' }}</p>
    </template>
    <template v-else>
      <div class="account-toolbar"><button class="primary" @click="modal = 'import'">导入莫娜圣遗物</button><span>先预览，再确认；保留每件实物与原始词条。</span></div>
      <ArtifactBrowser />
      <WorkbenchDialog v-if="modal === 'import'" title="导入莫娜圣遗物" @close="modal = ''"><MonaImport automatic @imported="modal = ''" /></WorkbenchDialog>
      <details class="legacy-inventory"><summary>高级：旧版手动库存输入</summary><div class="account-toolbar"><label>圣遗物名称<input v-model="newArtifactName" aria-label="圣遗物名称" maxlength="160"></label><label>部位<select v-model="newSlot" aria-label="新圣遗物部位"><option v-for="slot in accountSlots" :key="slot" :value="slot">{{ accountSlotLabels[slot] }}</option></select></label><button @click="addArtifact">添加实物圣遗物</button></div></details>
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
</style>
