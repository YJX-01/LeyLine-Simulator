<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { getRealCharacter, getRealWeapon } from '@leyline/game-data/real';
import { resolveRealBuild } from '@leyline/engine';
import { realBuildSchema } from '@leyline/schema';
import { parseAccount, type AccountCharacter } from './domain/account';
import { loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import CatalogPicker from './components/CatalogPicker.vue';
import GameIcon from './components/GameIcon.vue';
import LevelPicker from './components/LevelPicker.vue';
import NumberStepper from './components/NumberStepper.vue';
import talentDisplay from './domain/data/character-talent-display.json';
const props = defineProps<{ character?: AccountCharacter; inline?: boolean; details?: boolean; showcase?: boolean; detached?: boolean }>();
const emit = defineEmits<{ close: []; saved: [id: string]; dirtyChange: [dirty: boolean] }>();
const store = useAccountStore();
const originalAccount = store.account;
let disposed = false;
onUnmounted(() => { disposed = true; });
const data = ref<Awaited<ReturnType<typeof loadAccountGameData>>>();
const sourceBuild = computed(() => props.showcase ? props.character?.showcase?.build : props.character?.realBuild);
const talentIcons = computed(() => (talentDisplay.characters as Record<string, { icon:string; key: 'normal' | 'skill' | 'burst'; label:string; name:string; constellations:number[] }[]>)[character.value?.name ?? props.character?.name ?? ''] ?? []);
const characterId = ref(sourceBuild.value?.character.id ?? '');
const weaponId = ref(sourceBuild.value?.weapon.id ?? '');
const ascension = ref(sourceBuild.value?.ascension ?? 6);
const weaponLevel = ref(sourceBuild.value?.weaponLevel ?? 90);
const weaponAscension = ref(sourceBuild.value?.weaponAscension ?? 6);
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
const signature=()=>JSON.stringify([characterId.value,weaponId.value,level.value,ascension.value,constellation.value,weaponLevel.value,weaponAscension.value,refinement.value,talents.value]);
const initialValues=ref(signature());
const dirty=computed(()=>initialValues.value!==signature());
watch(dirty, value => emit('dirtyChange', value), { immediate:true });
function reset() { const b=sourceBuild.value;level.value=b?.level??90;ascension.value=b?.ascension??6;constellation.value=b?.constellation??0;weaponId.value=b?.weapon.id??'';weaponLevel.value=b?.weaponLevel??90;weaponAscension.value=b?.weaponAscension??6;refinement.value=b?.refinement??1;talents.value={...(b?.talents??{normal:10,skill:10,burst:10})};initialValues.value=signature(); }
const error = ref(''); const busy = ref(false);
const character = computed(() => data.value?.catalog.characters.find(item => item.id === characterId.value));
const weapons = computed(() => data.value?.catalog.weapons.filter(item => item.weaponType === character.value?.weaponType) ?? []);
onMounted(async () => { try { data.value = await loadAccountGameData(); if (!characterId.value && props.character) characterId.value = data.value.catalog.characters.find(item => item.name === props.character?.name)?.id ?? ''; initialValues.value=signature(); } catch { error.value = '游戏目录加载失败。'; } });
async function prepare(): Promise<AccountCharacter | undefined> {
  if (props.showcase) return;
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
    const entry: AccountCharacter = { id, name: realCharacter.name, attack: 0, weapon: weapon.name, equipment: { ...props.character?.equipment }, realBuild: build, ...(props.character?.showcase?.build.character.id === realCharacter.id ? { showcase: props.character.showcase } : {}) };
    return entry;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '角色资料保存失败。'; return undefined; } finally { busy.value = false; }
}
async function apply() {
  const entry = await prepare();
  if (!entry) return;
  try {
    const next = JSON.parse(JSON.stringify(store.account));
    const index = next.characters.findIndex((item: AccountCharacter) => item.id === entry.id);
    if (index >= 0) next.characters[index] = entry; else next.characters.push(entry);
    store.commitEdit(parseAccount(next));
    initialValues.value=signature(); emit('saved', entry.id); if(!props.details)emit('close');
  } catch (cause) { error.value=cause instanceof Error?cause.message:'角色资料保存失败。'; }
}

defineExpose({ prepare, reset });

</script>
<template>
  <div class="character-form" :class="{inline,details:true}">
    <CatalogPicker v-if="!props.character" inline label="游戏角色" image-kind="characters" v-model="characterId" :options="data?.catalog.characters ?? []" @update:model-value="weaponId = ''" />
    <template v-if="characterId">
      <div class="cultivation-groups">
        <fieldset class="cultivation-group talent-group" aria-label="天赋" :disabled="showcase">
          <div v-for="row in talentRows" :key="row.key" class="talent-field" :data-talent="row.key"><span>{{ {normal:'普攻',skill:'战技',burst:'爆发'}[row.key] }}</span><GameIcon kind="skills" :id="row.icon" :size="36" /><NumberStepper v-model="talents[row.key]" :label="{normal:'普攻',skill:'战技',burst:'爆发'}[row.key]" :bonus="row.bonus" :maximum="talentMaximum" /></div>

        </fieldset>
        <fieldset class="cultivation-group character-cultivation" aria-label="角色培养" :disabled="showcase">
          <GameIcon kind="characters" :id="characterId" :name="props.character?.name" :size="104" :constellation="constellation" :level="level" />
          <LevelPicker :level="level" :ascension="ascension" label="角色等级" :maximum="100" :disabled="showcase" @change="setCharacterLevel" />
        </fieldset>
        <fieldset class="cultivation-group weapon-cultivation" aria-label="武器培养" :disabled="showcase">
          <span class="weapon-portrait"><button class="portrait-control" aria-label="更换武器" :title="weapons.find(item=>item.id===weaponId)?.name ?? '更换武器'" @click="weaponPicker?.show()"><GameIcon v-if="weaponId" kind="weapons" :id="weaponId" :size="88" :refinement="refinement" :level="weaponLevel" :rarity="weapons.find(item=>item.id===weaponId)?.rarity" /><span v-else class="weapon-empty">＋</span></button></span>
          <LevelPicker :level="weaponLevel" :ascension="weaponAscension" label="武器等级" :disabled="showcase" :maximum="(weapons.find(item=>item.id===weaponId)?.rarity ?? 5) < 3 ? 70 : 90" @change="setWeaponLevel" />

        </fieldset>
          <fieldset class="constellation-row" :disabled="showcase"><strong>命座</strong><div class="constellation-strip" role="group" aria-label="命座" :style="elementStyle">
            <button v-for="rank in 7" :key="rank" :disabled="showcase" :aria-label="`${rank-1}命`" :aria-pressed="constellation===rank-1" :class="{lit:rank===1 ? constellation===0 : rank-1<=constellation}" @click="constellation=rank-1"><svg v-if="rank===1" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/></svg><GameIcon v-else kind="constellations" :id="`${constellationPrefix}-c${rank-1}`" :size="32" monochrome /><span class="constellation-number">{{ rank-1 }}</span></button>
          </div></fieldset>
          <fieldset class="refinement-field" aria-label="武器精炼" :disabled="showcase"><div class="refinement-options" role="group" aria-label="武器精炼"><button v-for="rank in 5" :key="rank" :aria-label="`精炼${rank}阶`" :aria-pressed="refinement===rank" @click="refinement=rank">{{ rank }}</button></div></fieldset>
      </div>
      <CatalogPicker v-if="!showcase" ref="weaponPicker" inline hide-trigger label="装备武器" image-kind="weapons" v-model="weaponId" :options="weapons" :disabled="!characterId" />
      <div v-if="(dirty || !props.character) && !showcase && !detached" class="detail-save"><button :disabled="busy || !characterId || !weaponId" @click="apply()">{{ props.character ? '保存修改' : '保存角色资料' }}</button><button v-if="props.character" :disabled="busy" @click="reset">还原修改</button></div>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.character-form.details { display:block; padding:0; border:0; background:none; margin:0; }
.cultivation-groups { display:grid; grid-template-columns:minmax(0,1fr) 180px minmax(0,1fr); gap:8px 20px; align-items:start; padding-bottom:10px; border-bottom:1px solid var(--line); }
.cultivation-group { min-width:0; margin:0; padding:0; border:0; background:transparent; display:flex; flex-direction:column; gap:8px; }
.talent-group { padding:16px 0 0; align-self:start; gap:8px; width:240px; max-width:100%; box-sizing:border-box; justify-self:start; }.talent-field { display:grid; grid-template-columns:32px 36px minmax(0,1fr); align-items:center; gap:6px; font-size:16px; font-weight:700; }
.character-cultivation,.weapon-cultivation { align-items:center; justify-self:center; width:160px; max-width:100%; box-sizing:border-box; }.cultivation-group .level-picker { width:160px; max-width:100%; }
.portrait-control { display:flex; align-items:center; justify-content:center; padding:0; border:0; background:none; }.portrait-control:disabled { opacity:1; }
.character-cultivation > .characters { width:104px !important; height:104px !important; }.weapon-portrait { position:relative; display:flex; align-items:center; justify-content:center; width:160px; max-width:100%; height:104px; }.weapon-portrait .portrait-control { width:88px; height:88px; }.weapon-portrait .game-icon { width:88px !important; height:88px !important; }.cultivation-label { font-size:16px; font-weight:700; color:var(--ink); line-height:20px; }.cultivation-group > .cultivation-label { margin-bottom:-6px; }.refinement-field { grid-column:3; grid-row:2; justify-self:center; align-self:center; min-width:0; margin:0; padding:0; border:0; width:160px; max-width:100%; display:grid; gap:5px; text-align:center; }.refinement-options { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); border:1px solid var(--line); border-radius:var(--control-radius); overflow:hidden; background:var(--surface-raised); box-sizing:border-box; height:var(--control-height); }.refinement-options button { min-width:0; height:calc(var(--control-height) - 2px); min-height:0; padding:0; border:0; border-right:1px solid var(--line); border-radius:0; background:transparent; color:var(--ink); font-size:var(--control-font-size); font-weight:700; }.refinement-options button:last-child { border-right:0; }.refinement-options button[aria-pressed=true] { background:var(--element-hydro-light); color:var(--element-hydro-deep); font-weight:700; }

.weapon-empty { display:flex; width:88px; height:88px; align-items:center; justify-content:center; border:1px dashed var(--line); border-radius:7px; color:var(--muted); }
.constellation-row { grid-column:1/span 2; grid-row:2; width:100%; min-width:0; box-sizing:border-box; margin:0; padding:0; border:0; display:grid; grid-template-columns:32px minmax(0,1fr); align-items:center; gap:6px; }
.constellation-row > strong { grid-column:1; font-size:16px; font-weight:700; line-height:20px; }
.constellation-strip { grid-column:2; display:grid; grid-template-columns:repeat(7,40px); gap:6px; }
.constellation-strip button { position:relative; display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:40px; height:40px; min-height:40px; padding:3px; border:1px solid var(--line); border-radius:50%; background:var(--neutral-canvas); color:var(--muted); transition:box-shadow .15s,border-color .15s,color .15s; }
.constellation-strip .game-icon,.constellation-strip svg { width:32px !important; height:32px !important; }.constellation-strip svg { fill:currentColor; }
.constellation-strip button > span:last-child:not(.game-icon) { position:absolute; right:3px; bottom:2px; font-size:10px; }
.constellation-strip button:not(.lit) > .game-icon { opacity:.3; }
.constellation-strip button.lit { color:white; background:var(--constellation-ink); border:2px solid var(--constellation-tone); box-shadow:inset 0 0 5px color-mix(in srgb,var(--constellation-tone) 50%,transparent),0 0 5px color-mix(in srgb,var(--constellation-tone) 50%,transparent); }
.constellation-strip button.lit::before { content:''; position:absolute; inset:3px; border:1px solid color-mix(in srgb,var(--constellation-tone) 75%,white); border-radius:50%; pointer-events:none; }
.constellation-strip button.lit .game-icon { filter:drop-shadow(0 0 2px color-mix(in srgb,var(--constellation-tone) 35%,transparent)); }
.constellation-strip button[aria-pressed=true] { outline:2px solid var(--constellation-tone); outline-offset:3px; }

.constellation-strip .constellation-number { position:absolute; right:-1px; bottom:-2px; padding:0 2px; border-radius:3px; background:var(--surface); color:var(--ink); font-size:9px; line-height:12px; }

.constellation-strip button:disabled { opacity:1; }.detail-save { display:flex; justify-content:flex-end; gap:10px; margin-top:12px; }.detail-save button { font-size:15px; }
@media(max-width:700px) { .cultivation-groups { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }.talent-group { grid-column:1/-1; width:min(240px,100%); justify-self:start; }.talent-group { padding-top:0; }.refinement-field { grid-column:2; grid-row:3; }.constellation-row { grid-column:1/-1; grid-row:4; } }


.inline { padding:18px; border:1px solid var(--line); border-radius:12px; background:var(--surface); margin:12px 0; }.inline .catalog-picker { grid-column:1/-1; }
.character-form { display:grid; gap:14px; color:var(--ink); } label { display:grid; gap:6px; font-size:13px; } input { width:100%; min-height:38px; box-sizing:border-box; } p { font-size:13px; line-height:1.8; } [role=alert] { color:var(--element-pyro-deep); }
.character-form { grid-template-columns:repeat(2,minmax(0,1fr)); }.character-form > p,.character-form > h3 { grid-column:1/-1; }@media(max-width:550px) { .character-form { grid-template-columns:1fr; } }
@media(max-width:400px) { .constellation-strip { grid-template-columns:repeat(7,34px); gap:6px; }.constellation-strip button { width:34px; height:34px; min-height:34px; padding:2px; }.constellation-strip .game-icon,.constellation-strip svg { width:28px !important; height:28px !important; } }
</style>
