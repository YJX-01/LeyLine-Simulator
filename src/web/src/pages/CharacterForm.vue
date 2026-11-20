<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { resolveBuild } from '@leyline/engine';
import type { Build, CharacterDefinition } from '@leyline/schema';
import type { AccountCharacter } from '../domain/account';
import { assembleBuildSnapshot } from '../domain/build-snapshot';
import { loadAccountGameData } from '../domain/account-presentation';
import { useAccountStore } from '../stores/account';
import CatalogPicker from '../components/CatalogPicker.vue';
import GameIcon from '../components/GameIcon.vue';
import WeaponPlaceholder from '../components/WeaponPlaceholder.vue';
import LevelPicker from '../components/LevelPicker.vue';
import NumberStepper from '../components/NumberStepper.vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import CornerBadge from '../components/CornerBadge.vue';
import { talentDisplayRows } from '../domain/character-info';
import {buildRollBasis} from '../domain/effective-roll-basis';
const props = defineProps<{ character?: AccountCharacter; initialCharacterId?: string; inline?: boolean; details?: boolean; showcase?: boolean; detached?: boolean; candidate?: boolean; resolveIdentity?: boolean }>();
const emit = defineEmits<{ dirtyChange: [dirty: boolean] }>();
const store = useAccountStore();
const originalAccount = store.account;
const error = ref('');
let disposed = false;
onUnmounted(() => { disposed = true; });
const data = shallowRef<Awaited<ReturnType<typeof loadAccountGameData>>>();
const sourceBuild = computed(() => props.showcase ? props.character?.showcase?.build : props.character?.build);
const selectedDefinition=shallowRef<CharacterDefinition | undefined>(sourceBuild.value?.character);
const talentIcons=computed(()=>selectedDefinition.value?talentDisplayRows(selectedDefinition.value):[]);
const characterId = ref(sourceBuild.value?.character.id ?? props.initialCharacterId ?? '');
const weaponId = ref(sourceBuild.value?.weapon?.id ?? '');
const selectedWeapon = shallowRef<Build['weapon']>(sourceBuild.value?.weapon ?? null);
let contentReady: Promise<void>;
watch([characterId, weaponId], ([id, selectedWeaponId], _, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  const snapshot = sourceBuild.value;
  const character = selectedDefinition.value?.id === id ? selectedDefinition.value : snapshot?.character.id === id ? snapshot.character : undefined;
  const weapon = selectedWeapon.value?.id === selectedWeaponId ? selectedWeapon.value : snapshot?.weapon?.id === selectedWeaponId ? snapshot.weapon : null;
  selectedDefinition.value = character;
  selectedWeapon.value = weapon;
  contentReady = Promise.all([
    character ?? (id ? getCharacter(id) : undefined),
    weapon ?? (selectedWeaponId ? getWeapon(selectedWeaponId) : null),
  ]).then(([definition, equipment]) => {
    if (current) { selectedDefinition.value = definition; selectedWeapon.value = equipment; }
  }).catch(() => { if (current) error.value = '角色或武器资料加载失败。'; });
}, { immediate: true, flush: 'sync' });
const ascension = ref(sourceBuild.value?.ascension ?? 6);
const weaponLevel = ref(sourceBuild.value?.weapon ? sourceBuild.value.weaponLevel : 90);
const weaponAscension = ref(sourceBuild.value?.weapon ? sourceBuild.value.weaponAscension : 6);
const level = ref(sourceBuild.value?.level ?? 90);
const constellation = ref(sourceBuild.value?.constellation ?? 0);
const refinement = ref(sourceBuild.value?.refinement ?? 1);
const talents = ref({ ...(sourceBuild.value?.talents ?? { normal: 10, skill: 10, burst: 10 }) });
const talentMaximum = computed(() => [1,1,2,4,6,8,10][ascension.value] ?? 10);
const talentRows = computed(() => talentIcons.value.map(row => ({...row, bonus:row.constellations.filter(rank => rank <= constellation.value).length * 3})));
const constellationPrefix = computed(() => talentIcons.value[0]?.icon.replace(/-combat1$/, '') ?? characterId.value);
const elementStyle = computed(() => ({ '--constellation-tone': `var(--element-${character.value?.element ?? 'anemo'}-primary)`, '--constellation-light': `var(--element-${character.value?.element ?? 'anemo'}-light)`, '--constellation-ink': `var(--element-${character.value?.element ?? 'anemo'}-deep)` }));
watch(ascension, () => { for(const key of ['normal','skill','burst'] as const) talents.value[key]=Math.min(talents.value[key],talentMaximum.value); });
function setCharacterLevel(nextLevel:number, nextAscension:number) { level.value=nextLevel; ascension.value=nextAscension; }
function setWeaponLevel(nextLevel:number, nextAscension:number) { weaponLevel.value=nextLevel; weaponAscension.value=nextAscension; }
const weaponPicker=ref<InstanceType<typeof CatalogPicker>>();
const signature = () => JSON.stringify([characterId.value, level.value, ascension.value, constellation.value, talents.value,
  weaponId.value ? [weaponId.value, weaponLevel.value, weaponAscension.value, refinement.value] : null]);
const initialValues=ref(signature());
const dirty=computed(()=>initialValues.value!==signature());
watch(dirty, value => emit('dirtyChange', value), { immediate:true });
function reset() { const b=sourceBuild.value;level.value=b?.level??90;ascension.value=b?.ascension??6;constellation.value=b?.constellation??0;weaponId.value=b?.weapon?.id??'';weaponLevel.value=b?.weapon?b.weaponLevel:90;weaponAscension.value=b?.weapon?b.weaponAscension:6;refinement.value=b?.refinement??1;talents.value={...(b?.talents??{normal:10,skill:10,burst:10})};initialValues.value=signature(); }
const capturedCharacter = computed(() => sourceBuild.value?.character.id === characterId.value ? sourceBuild.value.character : undefined);
const catalogCharacter = computed(() => data.value?.catalog.characters.find(item => item.id === characterId.value));
// Source IDs are used only for presentation; calculation continues to read the carried snapshot.
const referenceCharacter = computed(() => catalogCharacter.value ?? data.value?.catalog.characters.find(item => capturedCharacter.value?.derivedFrom?.id===item.id));
const character = computed(() => capturedCharacter.value ? {id:capturedCharacter.value.id,...capturedCharacter.value.identity} : catalogCharacter.value);
const weapons = computed(() => data.value?.catalog.weapons.filter(item => item.weaponType === character.value?.weaponType) ?? []);
onMounted(async () => {
  try {
    data.value = await loadAccountGameData();
    if (!characterId.value && props.character) {
      characterId.value = data.value.catalog.characters.find(item => item.name === props.character?.name)?.id ?? '';
      initialValues.value = signature();
    }
  } catch { error.value = '游戏目录加载失败。'; }
});
const draftBuild = computed<Build | undefined>(() => {
  const snapshot = sourceBuild.value, catalog = data.value;
  const definition = selectedDefinition.value, weapon = selectedWeapon.value;
  if (!definition || (weaponId.value && !weapon) || (!snapshot && !catalog)) return;
  return assembleBuildSnapshot({
    dataVersion: snapshot?.dataVersion ?? catalog!.catalog.version,
    artifactMain: snapshot?.artifactMain ?? catalog!.main,
    character: definition, weapon, level: level.value, ascension: ascension.value, constellation: constellation.value,
    talents: { ...talents.value }, weaponLevel: weapon ? weaponLevel.value : 1, weaponAscension: weapon ? weaponAscension.value : 0, refinement: weapon ? refinement.value : 1,
    artifacts: props.candidate ? snapshot?.artifacts ?? [] : [], sets: props.candidate ? snapshot?.sets ?? [] : [],
  }, snapshot ?? catalog!);
});
const canSave = computed(() => !!draftBuild.value);
async function prepare(): Promise<AccountCharacter | undefined> {
  if (props.showcase) return;
  error.value = '';
  try {
    await contentReady;
    if (disposed) return;
    if (store.account !== originalAccount) throw new Error('账号已切换，请重新打开。');
    const build = draftBuild.value;
    if (!build) throw new Error('请选择角色并等候目录加载。');
    const { character: definition, weapon } = build;
    const lockedId = props.character?.build?.character.id ?? data.value?.catalog.characters.find(item => item.name === props.character?.name)?.id;
    if (props.character && definition.id !== lockedId && !(props.detached && props.resolveIdentity && !lockedId && !props.character.build)) throw new Error('已有角色的身份不可更换。');
    const id = props.character?.id ?? crypto.randomUUID();
    if (!props.candidate && store.account.characters.some(item => item.id !== id && (item.build?.character.id === definition.id || item.name === definition.identity.name))) throw new Error('账号已有该角色，请在原角色资料上补全或编辑。');
    if (weapon && build.weaponAscension >= weapon.promotion.length) throw new Error(`所选武器最高突破为 ${weapon.promotion.length - 1}，请调整武器突破与等级。`);
    const invalid = resolveBuild(build).issues.filter(issue => issue.code === 'invalid-input');
    if (invalid.length) throw new Error(invalid.map(issue => issue.message).join('；'));
    return { id, name: definition.identity.name, attack: 0, weapon: weapon?.name ?? '', equipment: { ...props.character?.equipment }, build,
      ...(props.character?.showcase?.build.character.id === definition.id ? { showcase: props.character.showcase } : {}) };
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '角色资料保存失败。'; return undefined; }
}
const rollBasis = computed(() => buildRollBasis(draftBuild.value));
async function getRollBasis() { await contentReady; return rollBasis.value; }
defineExpose({ prepare, reset, canSave, draftBuild, rollBasis, getRollBasis });
</script>
<template>
  <div class="character-form" :class="{inline,details:true}">
    <CatalogPicker v-if="(!props.character && !initialCharacterId) || (detached && resolveIdentity && !props.character?.build && !data?.catalog.characters.some(item => item.name === props.character?.name))" inline label="游戏角色" image-kind="characters" v-model="characterId" :options="data?.catalog.characters ?? []" @update:model-value="weaponId = ''" />
    <template v-if="characterId">
      <div class="cultivation-groups">
        <fieldset class="cultivation-group talent-group" aria-label="天赋" :disabled="showcase">
          <div v-for="row in talentRows" :key="row.key" class="talent-field" :data-talent="row.key"><span>{{ {normal:'普攻',skill:'战技',burst:'爆发'}[row.key] }}</span><GameIcon kind="skills" :id="row.icon" :size="36" /><NumberStepper v-model="talents[row.key]" :label="{normal:'普攻',skill:'战技',burst:'爆发'}[row.key]" :bonus="row.bonus" :maximum="talentMaximum" /></div>

        </fieldset>
        <fieldset class="cultivation-group character-cultivation" aria-label="角色培养" :disabled="showcase">
          <GameIcon kind="characters" :id="referenceCharacter?.id ?? characterId" :name="props.character?.name" :size="104" :constellation="constellation" :level="level" />
          <LevelPicker :level="level" :ascension="ascension" label="角色等级" :maximum="100" :disabled="showcase" @change="setCharacterLevel" />
        </fieldset>
        <fieldset class="cultivation-group weapon-cultivation" aria-label="武器培养" :disabled="showcase">
          <span class="weapon-portrait"><button class="portrait-control replace-portrait" aria-label="更换武器" :title="weapons.find(item=>item.id===weaponId)?.name ?? '更换武器'" @click="weaponPicker?.show()"><GameIcon v-if="weaponId" kind="weapons" :id="weaponId" :size="88" :replaceable="!showcase" :refinement="refinement" :level="weaponLevel" :rarity="weapons.find(item=>item.id===weaponId)?.rarity" /><WeaponPlaceholder v-else add /></button></span>
          <LevelPicker :level="weaponLevel" :ascension="weaponAscension" label="武器等级" :disabled="showcase || !weaponId" :maximum="(weapons.find(item=>item.id===weaponId)?.rarity ?? 5) < 3 ? 70 : 90" @change="setWeaponLevel" />

        </fieldset>
          <fieldset class="constellation-row" :disabled="showcase"><strong>命座</strong><div class="constellation-strip" role="group" aria-label="命座" :style="elementStyle">
            <button v-for="rank in 7" :key="rank" :disabled="showcase" :aria-label="`${rank-1}命`" :aria-pressed="constellation===rank-1" :class="{lit:rank===1 ? constellation===0 : rank-1<=constellation}" @click="constellation=rank-1"><svg v-if="rank===1" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/></svg><GameIcon v-else kind="constellations" :id="`${constellationPrefix}-c${rank-1}`" :size="32" monochrome /><CornerBadge small transparent class="constellation-number">{{ rank-1 }}</CornerBadge></button>
          </div></fieldset>
          <fieldset class="refinement-field" aria-label="武器精炼" :disabled="showcase || !weaponId"><ChoiceGroup class="refinement-options" :model-value="refinement" :options="[1,2,3,4,5].map(rank=>({value:rank,label:String(rank),accessibleLabel:`精炼${rank}阶`}))" label="武器精炼" joined tone="hydro" :disabled="showcase || !weaponId" @update:model-value="refinement=Number($event)" /></fieldset>
      </div>
      <CatalogPicker v-if="!showcase" ref="weaponPicker" hide-trigger label="装备武器" image-kind="weapons" v-model="weaponId" :options="weapons" :disabled="!characterId" />
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.character-form.details { display:block; padding:0; border:0; background:none; margin:0; }
.cultivation-groups { display:grid; grid-template-columns:minmax(0,1fr) 180px minmax(0,1fr); gap:8px 20px; align-items:start; padding-bottom:10px; border-bottom:1px solid var(--line); }
.cultivation-group { min-width:0; margin:0; padding:0; border:0; background:transparent; display:flex; flex-direction:column; gap:8px; }
.talent-group { padding:16px 0 0; align-self:start; gap:8px; width:240px; max-width:100%; box-sizing:border-box; justify-self:start; }.talent-field { display:grid; grid-template-columns:32px 36px minmax(0,1fr); align-items:center; gap:6px; font-size:var(--font-control); font-weight:700; }
.character-cultivation,.weapon-cultivation { align-items:center; justify-self:center; width:160px; max-width:100%; box-sizing:border-box; }.cultivation-group .level-picker { width:160px; max-width:100%; }
.portrait-control { display:flex; align-items:center; justify-content:center; padding:0; border:0; background:none; }.portrait-control:disabled { opacity:1; }
.weapon-portrait { position:relative; display:flex; align-items:center; justify-content:center; width:160px; max-width:100%; height:104px; }.weapon-portrait .portrait-control { width:88px; height:88px; }.cultivation-label { font-size:var(--font-control); font-weight:700; color:var(--ink); line-height:20px; }.cultivation-group > .cultivation-label { margin-bottom:-6px; }.refinement-field { grid-column:3; grid-row:2; justify-self:center; align-self:center; min-width:0; margin:0; padding:0; border:0; width:160px; max-width:100%; display:grid; gap:5px; text-align:center; }


.constellation-row { grid-column:1/span 2; grid-row:2; width:100%; min-width:0; box-sizing:border-box; margin:0; padding:0; border:0; display:grid; grid-template-columns:32px minmax(0,1fr); align-items:center; gap:6px; }
.constellation-row > strong { grid-column:1; font-size:var(--font-control); font-weight:700; line-height:20px; }
.constellation-strip { grid-column:2; display:grid; grid-template-columns:repeat(7,40px); gap:6px; }
.constellation-strip button { position:relative; display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:40px; height:40px; min-height:40px; padding:3px; border:1px solid var(--line); border-radius:50%; background:var(--neutral-canvas); color:var(--muted); transition:box-shadow .15s,border-color .15s,color .15s; }
.constellation-strip .game-icon,.constellation-strip svg { width:32px !important; height:32px !important; }.constellation-strip svg { fill:currentColor; }

.constellation-strip button:not(.lit) > .game-icon { opacity:.3; }
.constellation-strip button.lit { color:white; background:var(--constellation-ink); border:2px solid var(--constellation-tone); box-shadow:inset 0 0 5px color-mix(in srgb,var(--constellation-tone) 50%,transparent),0 0 5px color-mix(in srgb,var(--constellation-tone) 50%,transparent); }
.constellation-strip button.lit::before { content:''; position:absolute; inset:3px; border:1px solid color-mix(in srgb,var(--constellation-tone) 75%,white); border-radius:50%; pointer-events:none; }
.constellation-strip button.lit .game-icon { filter:drop-shadow(0 0 2px color-mix(in srgb,var(--constellation-tone) 35%,transparent)); }
.constellation-strip button[aria-pressed=true] { outline:2px solid var(--constellation-tone); outline-offset:3px; }

.constellation-strip .constellation-number { position:absolute; right:-1px; bottom:-2px; }

.constellation-strip button:disabled { opacity:1; }
@media(max-width:700px) { .cultivation-groups { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }.talent-group { grid-column:1/-1; width:min(240px,100%); justify-self:start; }.talent-group { padding-top:0; }.refinement-field { grid-column:2; grid-row:3; }.constellation-row { grid-column:1/-1; grid-row:4; } }


.inline { padding:18px; border:1px solid var(--line); border-radius:12px; background:var(--surface); margin:12px 0; }.inline .catalog-picker { grid-column:1/-1; }
.character-form { display:grid; gap:14px; color:var(--ink); } label { display:grid; gap:6px; font-size:var(--font-body); } input { width:100%; min-height:38px; box-sizing:border-box; } p { font-size:var(--font-body); line-height:1.8; } [role=alert] { color:var(--element-pyro-deep); }
.character-form { grid-template-columns:repeat(2,minmax(0,1fr)); }.character-form > p,.character-form > h3 { grid-column:1/-1; }@media(max-width:550px) { .character-form { grid-template-columns:1fr; } }
@media(max-width:400px) { .constellation-row { grid-template-columns:minmax(0,1fr); gap:8px; }.constellation-strip { grid-column:1; grid-template-columns:repeat(7,32px); justify-content:space-between; gap:0; }.constellation-strip button { width:32px; height:32px; min-height:32px; padding:2px; }.constellation-strip .game-icon,.constellation-strip svg { width:28px !important; height:28px !important; } }
</style>
