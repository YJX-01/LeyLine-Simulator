<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { accountSlots, accountSlotLabels, artifactOwner, equipArtifact, copyAccountCharacter, type AccountSlot } from './domain/account';
import { useAccountStore } from './stores/account';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { localDataErrorLabel, definitionLabel } from './domain/workbench-labels';
import artifactFlower from './assets/genshin/artifact-flower.webp';
import artifactPlume from './assets/genshin/artifact-plume.webp';
import artifactSands from './assets/genshin/artifact-sands.webp';
import artifactGoblet from './assets/genshin/artifact-goblet.webp';
import artifactCirclet from './assets/genshin/artifact-circlet.webp';
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));
const ArtifactEditor = defineAsyncComponent(() => import('./ArtifactEditor.vue'));
const RealGamePanel = defineAsyncComponent(() => import('./RealGamePanel.vue'));
const artifactImages: Record<AccountSlot, string> = { flower: artifactFlower, plume: artifactPlume, sands: artifactSands, goblet: artifactGoblet, circlet: artifactCirclet };

defineProps<{ page: 'characters' | 'artifacts' }>();
const store = useAccountStore();
const axis = useAxisWorkspaceStore();
const { account, error, notice, dirty, busy } = storeToRefs(store);
const characterId = ref('');
const character = computed(() => account.value.characters.find(entry => entry.id === characterId.value));
const newCharacterName = ref('');
const newArtifactName = ref('');
const newSlot = ref<AccountSlot>('flower');
const artifactId = ref('');
const characterDefinition = ref('');
const weaponDefinition = ref('');
const file = ref<HTMLInputElement>();
const pending = ref<{ characterId: string; artifactId: string; message: string }>();
function addCharacter() {
  if (!newCharacterName.value.trim()) { error.value = '请填写角色名称。'; return; }
  const id = crypto.randomUUID();
  account.value.characters.push({ id, name: newCharacterName.value.trim(), attack: 1000, weapon: '自定义武器', equipment: {} });
  characterId.value = id; newCharacterName.value = ''; error.value = '';
}
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
function copyToAxis() {
  try {
    axis.actorId = copyAccountCharacter(account.value, characterId.value, axis.project, characterDefinition.value, weaponDefinition.value);
    notice.value = '已复制角色与实际装备汇总攻击到轴内候选；后续修改分别保存。'; error.value = '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '请先选择角色及当前轴中的角色、武器定义。'; }
}
async function open() { if (!await store.open()) file.value?.click(); pending.value = undefined; characterId.value = ''; }
async function importFile(event: Event) { const input = event.target as HTMLInputElement; if (input.files?.[0]) await store.inputFile(input.files[0]); input.value = ''; pending.value = undefined; characterId.value = ''; }
</script>

<template>
  <section class="account-library panel">
    <div class="account-toolbar">
      <label>账号名称<input v-model="account.name" aria-label="账号名称" maxlength="160"></label>
      <span>{{ dirty ? '账号有未保存修改' : '账号文件已保存' }}</span>
      <button :disabled="busy" @click="store.create(); characterId = ''; pending = undefined">新建账号</button>
      <button :disabled="busy" @click="open">打开账号资料</button>
      <button :disabled="busy" @click="store.save">保存账号资料</button>
      <input ref="file" class="hidden-file" type="file" accept=".json,application/json" aria-label="导入账号资料文件" @change="importFile">
    </div>
    <p role="status">{{ notice }}</p>
    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>
    <p class="account-note">实际装备只保存在本地账号。手动基础输入与真实配装分别管理；真实角色请在真实配装面板设置角色、武器与实际装备。</p>

    <template v-if="page === 'characters'">
      <div class="account-toolbar"><label>新角色名称<input v-model="newCharacterName" aria-label="新角色名称" maxlength="160" placeholder="例如：自创角色"></label><button @click="addCharacter">添加账号角色</button></div>
      <label>选择账号角色<select v-model="characterId" aria-label="选择账号角色"><option value="">请选择角色</option><option v-for="entry in account.characters" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label>
      <div v-if="character" class="account-editor">
        <label>角色名称<input v-model="character.name" aria-label="账号角色名称" maxlength="160"></label>
        <label v-if="!character.realBuild">基础攻击力<input v-model.number="character.attack" type="number" min="0" aria-label="账号基础攻击力"></label>
        <label v-if="!character.realBuild">实际武器备注<input v-model="character.weapon" aria-label="实际武器备注" maxlength="160"></label>
        <div class="equipment-list"><h3>实际圣遗物</h3><div v-for="slot in accountSlots" :key="slot"><span>{{ accountSlotLabels[slot] }}：{{ account.artifacts.find(item => item.id === character?.equipment[slot])?.name ?? '未装备' }}</span><button v-if="character.equipment[slot]" @click="delete character.equipment[slot]">卸下{{ accountSlotLabels[slot] }}</button></div></div>
        <label>库存圣遗物<select v-model="artifactId" aria-label="库存圣遗物"><option value="">请选择实物</option><option v-for="item in account.artifacts" :key="item.id" :value="item.id">{{ item.name }} · {{ accountSlotLabels[item.slot] }} · {{ artifactOwner(account, item.id)?.name ?? '未装备' }}</option></select></label>
        <button @click="equip">装备所选圣遗物</button>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
        <div v-if="!character.realBuild" class="account-copy"><h3>复制到当前轴</h3><p>先在内容定义库准备定义，再显式复制。不会关联更新已有轴。</p>
          <label>角色定义<select v-model="characterDefinition" aria-label="账号复制角色定义"><option value="">请选择</option><option v-for="entry in axis.project.definitions" :key="entry.id" :value="entry.id">{{ definitionLabel(axis.project, entry.id) }}</option></select></label>
          <label>武器定义<select v-model="weaponDefinition" aria-label="账号复制武器定义"><option value="">请选择</option><option v-for="entry in axis.project.definitions" :key="entry.id" :value="entry.id">{{ definitionLabel(axis.project, entry.id) }}</option></select></label>
          <button @click="copyToAxis">复制角色到轴内候选</button>
        </div>
        <div class="account-real-panel"><RealGamePanel mode="account" :account-character-id="characterId" /></div><details><summary>技术详情</summary><p>账号标识：{{ account.id }}</p><p>角色标识：{{ character.id }}</p></details>
      </div>
      <p v-else class="account-note">创建并选择角色后，可编辑实际装备。</p>
    </template>
    <template v-else>
      <MonaImport />
      <div class="account-toolbar"><label>圣遗物名称<input v-model="newArtifactName" aria-label="圣遗物名称" maxlength="160" placeholder="自定义实物名称"></label><label>部位<select v-model="newSlot" aria-label="新圣遗物部位"><option v-for="slot in accountSlots" :key="slot" :value="slot">{{ accountSlotLabels[slot] }}</option></select></label><button @click="addArtifact">添加实物圣遗物</button></div>
      <p>库存共 {{ account.artifacts.length }} 件。相同属性的物品保留各自身份。</p>
      <div class="account-inventory"><article v-for="item in account.artifacts" :key="item.id"><h3>{{ accountSlotLabels[item.slot] }}</h3><div class="artifact-art"><img :src="artifactImages[item.slot]" :alt="`${accountSlotLabels[item.slot]}图示`" width="96" height="96"></div><label>实物名称<input v-model="item.name" :aria-label="`实物名称 ${item.name}`" maxlength="160"></label><label v-if="!item.real">攻击力增量<input v-model.number="item.attack" type="number" min="0" :aria-label="`攻击力增量 ${item.name}`"></label><ArtifactEditor :item="item" /><p>持有角色：{{ artifactOwner(account, item.id)?.name ?? '未装备' }}</p><details><summary>技术详情</summary><p>{{ item.id }}</p><p v-if="item.real?.source">原始标识：{{ item.real.source.key }}；来源指纹：{{ item.real.source.fingerprint }}</p><p v-if="item.mona">原始主词条数值：{{ item.mona.mainValue }}；原文件标记忽略：{{ item.mona.omit ? '是' : '否' }}</p></details></article></div>
    </template>
  </section>
</template>

<style scoped>
.account-library { margin: 0 30px; color: var(--text, #394555); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size: 12px; line-height: 1.8; }
label { font-size: 12px; display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }
.account-editor { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; margin-top: 20px; }
.equipment-list, .account-copy, .transfer-confirm, .account-real-panel, details { grid-column: 1/-1; }.equipment-list > div { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 12px; }
.account-copy { border-top: 1px solid var(--line, #d8c9a8); padding-top: 16px; display: grid; gap: 12px; }
.account-note { opacity: .8; }.account-error { color: #a62c36; }.transfer-confirm { border: 1px solid #ad8b4b; padding: 16px; }.transfer-confirm button { margin-right: 12px; }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line, #d8c9a8); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size: 11px; overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
</style>
