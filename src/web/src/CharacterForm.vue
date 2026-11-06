<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getRealCharacter, getRealWeapon } from '@leyline/game-data/real';
import { resolveRealBuild } from '@leyline/engine';
import { realBuildSchema } from '@leyline/schema';
import { parseAccount, type AccountCharacter } from './domain/account';
import { loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import CatalogPicker from './components/CatalogPicker.vue';
import GameIcon from './components/GameIcon.vue';
const props = defineProps<{ character?: AccountCharacter; inline?: boolean; details?: boolean }>();
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
const levelInput=ref<HTMLInputElement>();
const weaponPicker=ref<InstanceType<typeof CatalogPicker>>();
const signature=()=>JSON.stringify([characterId.value,weaponId.value,level.value,ascension.value,constellation.value,weaponLevel.value,weaponAscension.value,refinement.value,talents.value]);
const initialValues=ref(signature());
const dirty=computed(()=>initialValues.value!==signature());
function reset() { const b=props.character?.realBuild;level.value=b?.level??90;ascension.value=b?.ascension??6;constellation.value=b?.constellation??0;weaponId.value=b?.weapon.id??'';weaponLevel.value=b?.weaponLevel??90;weaponAscension.value=b?.weaponAscension??6;refinement.value=b?.refinement??1;talents.value={...(b?.talents??{normal:10,skill:10,burst:10})};initialValues.value=signature(); }
const error = ref(''); const busy = ref(false); const preview = ref(false);
const character = computed(() => data.value?.catalog.characters.find(item => item.id === characterId.value));
const weapons = computed(() => data.value?.catalog.weapons.filter(item => item.weaponType === character.value?.weaponType) ?? []);
onMounted(async () => { try { data.value = await loadAccountGameData(); if (!characterId.value && props.character) characterId.value = data.value.catalog.characters.find(item => item.name === props.character?.name)?.id ?? ''; initialValues.value=signature(); } catch { error.value = '游戏目录加载失败。'; } });
async function apply(previewOnly = false) {
  busy.value = true; error.value = '';
  try {
    if (!data.value || !character.value || !weapons.value.some(item => item.id === weaponId.value)) throw new Error('请选择角色与适配武器。');
    const [realCharacter, weapon] = await Promise.all([getRealCharacter(characterId.value), getRealWeapon(weaponId.value)]);
    if (disposed) return;
    if (store.account !== originalAccount) throw new Error('账号已切换，请重新打开。');
    const lockedId=props.character?.realBuild?.character.id??data.value.catalog.characters.find(item=>item.name===props.character?.name)?.id;
    if(props.character && realCharacter.id!==lockedId)throw new Error('已有角色的身份不可更换。');
    const id = props.character?.id ?? crypto.randomUUID();
    if (store.account.characters.some(item => item.id !== id && (item.realBuild?.character.id === characterId.value || item.name === realCharacter.name))) throw new Error('账号已有该角色，请在原角色资料上补全或编辑。');
    if (weaponAscension.value >= weapon.promotion.length) throw new Error(`所选武器最高突破为 ${weapon.promotion.length - 1}，请调整武器突破与等级。`);
    const promotion = weaponAscension.value;
    const build = realBuildSchema.parse({ dataVersion: data.value.catalog.version, character: realCharacter, weapon, artifactMain: data.value.main, sets: [], level: level.value, ascension: ascension.value, constellation: constellation.value, talents: talents.value, weaponLevel: weaponLevel.value, weaponAscension: promotion, refinement: refinement.value, hpRatio: props.character?.realBuild?.hpRatio ?? 1, artifacts: [] });
    const invalid = resolveRealBuild(build).issues.filter(issue => issue.code === 'invalid-input');
    if (invalid.length) throw new Error(invalid.map(issue => issue.message).join('；'));
    if (previewOnly) { preview.value = true; return; }
    const next = JSON.parse(JSON.stringify(store.account));
    const entry: AccountCharacter = { id, name: realCharacter.name, attack: 0, weapon: weapon.name, equipment: { ...props.character?.equipment }, realBuild: build, ...(props.character?.showcase?.build.character.id === realCharacter.id ? { showcase: props.character.showcase } : {}) };
    const index = next.characters.findIndex((item: AccountCharacter) => item.id === id);
    if (index >= 0) next.characters[index] = entry; else next.characters.push(entry);
    store.account.characters = parseAccount(next).characters;
    initialValues.value=signature();emit('saved', id);if(!props.details)emit('close');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '角色资料保存失败。'; } finally { busy.value = false; }
}
</script>
<template>
  <div class="character-form" :class="{inline,details}">
    <template v-if="details">
      <div class="detail-portraits"><button class="portrait-control" :aria-label="`修改${props.character?.name ?? '角色'}培养`" title="修改角色培养" @click="levelInput?.focus()"><GameIcon kind="characters" :id="characterId" :name="props.character?.name" :size="96" :constellation="constellation" /></button><button class="portrait-control" aria-label="更换武器" title="更换武器" @click="weaponPicker?.show()"><GameIcon v-if="weaponId" kind="weapons" :id="weaponId" :size="72" :refinement="refinement" :rarity="weapons.find(item=>item.id===weaponId)?.rarity" /><span v-else class="weapon-empty">＋</span></button></div>
      <CatalogPicker ref="weaponPicker" inline hide-trigger label="装备武器" image-kind="weapons" v-model="weaponId" :options="weapons" :disabled="!characterId" />
      <div class="detail-fields"><label>角色等级<input ref="levelInput" v-model.number="level" type="number" min="1" max="90"></label><label>角色突破<input v-model.number="ascension" type="number" min="0" max="6"></label><label>命座<input v-model.number="constellation" type="number" min="0" max="6"></label><label>武器等级<input v-model.number="weaponLevel" type="number" min="1" max="90"></label><label>武器突破<input v-model.number="weaponAscension" type="number" min="0" max="6"></label><label>武器精炼<input v-model.number="refinement" type="number" min="1" max="5"></label><label v-for="(label,key) in {normal:'A 普通攻击',skill:'E 元素战技',burst:'Q 元素爆发'}" :key="key" class="talent-field">{{ label }}<input v-model.number="talents[key]" type="number" min="1" max="15"></label></div>
      <div v-if="dirty" class="detail-save"><span>本地培养资料有未保存修改</span><button :disabled="busy || !characterId || !weaponId" @click="apply(false)">保存修改</button><button :disabled="busy" @click="reset">还原修改</button></div>
    </template>
    <template v-else>
    <p v-if="!inline">按约定预设满级、满突破、满天赋；命座和精炼可修改，武器需自行选择。</p>
    <template v-if="!preview">
      <CatalogPicker v-if="!props.character" :inline="inline" label="游戏角色" image-kind="characters" v-model="characterId" :options="data?.catalog.characters ?? []" @update:model-value="weaponId = ''" />
      <CatalogPicker :inline="inline" label="装备武器" image-kind="weapons" v-model="weaponId" :options="weapons" :disabled="!characterId" />
      <label>角色等级<input v-model.number="level" type="number" min="1" max="90"></label>
      <label>角色突破<input v-model.number="ascension" type="number" min="0" max="6"></label>
      <label>武器等级<input v-model.number="weaponLevel" type="number" min="1" max="90"></label>
      <label>武器突破<input v-model.number="weaponAscension" type="number" min="0" max="6"></label>
      <label>命座<input v-model.number="constellation" type="number" min="0" max="6"></label>
      <label>武器精炼<input v-model.number="refinement" type="number" min="1" max="5"></label>
      <label v-for="(label,key) in {normal:'普通攻击',skill:'元素战技',burst:'元素爆发'}" :key="key">{{ label }}天赋<input v-model.number="talents[key]" type="number" min="1" max="15"></label>
      <button :disabled="busy || !characterId || !weaponId" @click="apply(inline ? false : true)">{{ inline ? '保存角色资料' : '预览角色资料' }}</button>
    </template>
    <template v-else><h3>{{ character?.name }}</h3><p>{{ level }}级 · {{ constellation }}命 · {{ weapons.find(item => item.id === weaponId)?.name }} · 精炼{{ refinement }}</p><p>角色突破{{ ascension }} · 武器{{ weaponLevel }}级 / 突破{{ weaponAscension }}</p><p>天赋 {{ talents.normal }} / {{ talents.skill }} / {{ talents.burst }}；保留当前五部位装备。</p><button @click="preview = false">返回修改</button><button :disabled="busy" @click="apply(false)">确认保存角色</button></template>
    <button :disabled="busy" @click="emit('close')">取消</button></template>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.character-form.details { display:block; padding:0; border:0; background:none; margin:0; }.detail-portraits { display:flex; justify-content:center; align-items:center; gap:28px; padding:16px 0 22px; }.portrait-control { display:flex; align-items:center; justify-content:center; padding:3px; border:0; background:none; }.portrait-control:hover { background:var(--neutral-canvas); border-radius:50%; }.weapon-empty { display:flex; width:72px; height:72px; align-items:center; justify-content:center; border:1px dashed var(--line); border-radius:50%; color:var(--muted); }.detail-fields { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; padding:16px; background:var(--neutral-canvas); border-radius:12px; }.detail-fields .talent-field { grid-column:span 2; }.detail-fields label { min-width:0; font-size:12px; }.detail-fields input { min-width:0; width:100%; min-height:34px; padding:6px 8px; }.detail-save { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:10px; margin-top:12px; font-size:12px; }.detail-save span { margin-right:auto; color:var(--muted); }@media(max-width:650px){.detail-fields { grid-template-columns:repeat(3,minmax(0,1fr)); padding:12px; gap:10px; }.detail-fields .talent-field { grid-column:span 1; }}

.inline { padding:18px; border:1px solid var(--line); border-radius:12px; background:var(--surface); margin:12px 0; }.inline .catalog-picker { grid-column:1/-1; }
.character-form { display:grid; gap:14px; color:var(--ink); } label { display:grid; gap:6px; font-size:13px; } input { width:100%; min-height:38px; box-sizing:border-box; } p { font-size:13px; line-height:1.8; } [role=alert] { color:var(--element-pyro-deep); }
.character-form { grid-template-columns:repeat(2,minmax(0,1fr)); }.character-form > p,.character-form > h3 { grid-column:1/-1; }@media(max-width:550px) { .character-form { grid-template-columns:1fr; } }
</style>
