<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getRealCharacter, getRealWeapon } from '@leyline/game-data/real';
import { resolveRealBuild } from '@leyline/engine';
import { realBuildSchema } from '@leyline/schema';
import { parseAccount, type AccountCharacter } from './domain/account';
import { loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import CatalogPicker from './components/CatalogPicker.vue';
const props = defineProps<{ character?: AccountCharacter }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const store = useAccountStore();
const originalAccount = store.account;
let disposed = false;
onUnmounted(() => { disposed = true; });
const data = ref<Awaited<ReturnType<typeof loadAccountGameData>>>();
const characterId = ref(props.character?.realBuild?.character.id ?? '');
const weaponId = ref(props.character?.realBuild?.weapon.id ?? '');
const ascension = ref(props.character?.realBuild?.ascension ?? 6);
const weaponLevel = ref(props.character?.realBuild?.weaponLevel ?? 90);
const weaponAscension = ref(props.character?.realBuild?.weaponAscension ?? 6);
const level = ref(props.character?.realBuild?.level ?? 90);
const constellation = ref(props.character?.realBuild?.constellation ?? 0);
const refinement = ref(props.character?.realBuild?.refinement ?? 1);
const talents = ref({ ...(props.character?.realBuild?.talents ?? { normal: 10, skill: 10, burst: 10 }) });
const error = ref(''); const busy = ref(false); const preview = ref(false);
const character = computed(() => data.value?.catalog.characters.find(item => item.id === characterId.value));
const weapons = computed(() => data.value?.catalog.weapons.filter(item => item.weaponType === character.value?.weaponType) ?? []);
onMounted(async () => { try { data.value = await loadAccountGameData(); if (!characterId.value && props.character) characterId.value = data.value.catalog.characters.find(item => item.name === props.character?.name)?.id ?? ''; } catch { error.value = '游戏目录加载失败。'; } });
async function apply(previewOnly = false) {
  busy.value = true; error.value = '';
  try {
    if (!data.value || !character.value || !weapons.value.some(item => item.id === weaponId.value)) throw new Error('请选择角色与适配武器。');
    const [realCharacter, weapon] = await Promise.all([getRealCharacter(characterId.value), getRealWeapon(weaponId.value)]);
    if (disposed) return;
    if (store.account !== originalAccount) throw new Error('账号已切换，请重新打开。');
    const id = props.character?.id ?? crypto.randomUUID();
    if (store.account.characters.some(item => item.id !== id && (item.realBuild?.character.id === characterId.value || item.name === realCharacter.name))) throw new Error('账号已有该角色，请在原角色资料上补全或编辑。');
    if (weaponAscension.value >= weapon.promotion.length) throw new Error(`所选武器最高突破为 ${weapon.promotion.length - 1}，请调整武器突破与等级。`);
    const promotion = weaponAscension.value;
    const build = realBuildSchema.parse({ dataVersion: data.value.catalog.version, character: realCharacter, weapon, artifactMain: data.value.main, sets: [], level: level.value, ascension: ascension.value, constellation: constellation.value, talents: talents.value, weaponLevel: weaponLevel.value, weaponAscension: promotion, refinement: refinement.value, hpRatio: props.character?.realBuild?.hpRatio ?? 1, artifacts: [] });
    const invalid = resolveRealBuild(build).issues.filter(issue => issue.code === 'invalid-input');
    if (invalid.length) throw new Error(invalid.map(issue => issue.message).join('；'));
    if (previewOnly) { preview.value = true; return; }
    const next = JSON.parse(JSON.stringify(store.account));
    const entry: AccountCharacter = { id, name: realCharacter.name, attack: 0, weapon: weapon.name, equipment: { ...props.character?.equipment }, realBuild: build };
    const index = next.characters.findIndex((item: AccountCharacter) => item.id === id);
    if (index >= 0) next.characters[index] = entry; else next.characters.push(entry);
    store.account.characters = parseAccount(next).characters;
    emit('saved', id); emit('close');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '角色资料保存失败。'; } finally { busy.value = false; }
}
</script>
<template>
  <div class="character-form">
    <p>按约定预设满级、满突破、满天赋；命座和精炼可修改，武器需自行选择。</p>
    <template v-if="!preview">
      <CatalogPicker label="游戏角色" image-kind="characters" v-model="characterId" :options="data?.catalog.characters ?? []" @update:model-value="weaponId = ''" />
      <CatalogPicker label="装备武器" image-kind="weapons" v-model="weaponId" :options="weapons" :disabled="!characterId" />
      <label>角色等级<input v-model.number="level" type="number" min="1" max="90"></label>
      <label>角色突破<input v-model.number="ascension" type="number" min="0" max="6"></label>
      <label>武器等级<input v-model.number="weaponLevel" type="number" min="1" max="90"></label>
      <label>武器突破<input v-model.number="weaponAscension" type="number" min="0" max="6"></label>
      <label>命座<input v-model.number="constellation" type="number" min="0" max="6"></label>
      <label>武器精炼<input v-model.number="refinement" type="number" min="1" max="5"></label>
      <label v-for="(label,key) in {normal:'普通攻击',skill:'元素战技',burst:'元素爆发'}" :key="key">{{ label }}天赋<input v-model.number="talents[key]" type="number" min="1" max="15"></label>
      <button :disabled="busy || !characterId || !weaponId" @click="apply(true)">预览角色资料</button>
    </template>
    <template v-else><h3>{{ character?.name }}</h3><p>{{ level }}级 · {{ constellation }}命 · {{ weapons.find(item => item.id === weaponId)?.name }} · 精炼{{ refinement }}</p><p>角色突破{{ ascension }} · 武器{{ weaponLevel }}级 / 突破{{ weaponAscension }}</p><p>天赋 {{ talents.normal }} / {{ talents.skill }} / {{ talents.burst }}；保留当前五部位装备。</p><button @click="preview = false">返回修改</button><button :disabled="busy" @click="apply(false)">确认保存角色</button></template>
    <p v-if="error" role="alert">{{ error }}</p><button :disabled="busy" @click="emit('close')">取消</button>
  </div>
</template>
<style scoped>
.character-form { display:grid; gap:14px; color:var(--ink,#283449); } label { display:grid; gap:6px; font-size:13px; } input { width:100%; min-height:38px; box-sizing:border-box; } p { font-size:13px; line-height:1.8; } [role=alert] { color:#a62c36; }
.character-form { grid-template-columns:repeat(2,minmax(0,1fr)); }.character-form > p,.character-form > h3 { grid-column:1/-1; }@media(max-width:550px) { .character-form { grid-template-columns:1fr; } }
</style>
