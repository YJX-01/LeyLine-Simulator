<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { realArtifactSchema, type RealStat } from '@leyline/schema';
import { accountSlots, accountSlotLabels, type AccountArtifact, type LocalAccount } from './domain/account';
import { accountMainStats, accountSubstats, accountStatLabels, ratioStat, validateAccountArtifact } from './domain/account-real';
import { applyAccountArtifact, loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import CatalogPicker from './components/CatalogPicker.vue';
import ArtifactSummary from './ArtifactSummary.vue';
import NumberStepper from './components/NumberStepper.vue';
const props = defineProps<{ item?: AccountArtifact; inline?: boolean; targetAccount?: LocalAccount; details?: boolean }>();
const emit = defineEmits<{ close: []; dirtyChange: [dirty:boolean] }>();
const store = useAccountStore();
const originalAccount = props.targetAccount ?? store.account;
const draft = ref<AccountArtifact>(props.item ? JSON.parse(JSON.stringify(props.item)) : { id: crypto.randomUUID(), name: '', slot: 'flower', attack: 0, real: { id: '', setId: '', slot: 'flower', rarity: 5, level: 20, mainStat: 'hp', substats: [] } });
if (!draft.value.real) draft.value.real = { id: draft.value.id, setId: '', slot: draft.value.slot, rarity: 5, level: 20, mainStat: accountMainStats[draft.value.slot][0], substats: [] };
const baseline=ref(JSON.stringify(draft.value));
watch(()=>JSON.stringify(draft.value), value=>emit('dirtyChange',value!==baseline.value));
function reset() { if(props.item)draft.value=JSON.parse(JSON.stringify(props.item));baseline.value=JSON.stringify(draft.value);preview.value=false;error.value='';emit('dirtyChange',false); }
const sets = ref<{ id: string; name: string }[]>([]);
const error = ref('');
const preview = ref(false);
const available = computed(() => accountMainStats[draft.value.slot]);
onMounted(async () => { try { sets.value = (await loadAccountGameData()).catalog.sets; } catch { error.value = '套装目录加载失败，请重新打开。'; } });
function statLabel(stat:RealStat) { return accountStatLabels[stat].replace('%','（比例）') + (['hp','attack','defense'].includes(stat)?'（固定）':''); }
function changeSlot() { if (draft.value.real) { draft.value.real.slot = draft.value.slot; draft.value.real.mainStat = available.value[0]; } }
function addSub() { const real = draft.value.real; const stat = accountSubstats.find(stat => stat !== real?.mainStat && !real?.substats.some(sub => sub.stat === stat)); if (real && stat) real.substats.push({ stat, value: NaN }); }
function value(index: number, event: Event) { const sub = draft.value.real!.substats[index]; const raw = (event.target as HTMLInputElement).value; delete sub.rolls; sub.value = raw.trim() ? Number(raw) / (ratioStat(sub.stat) ? 100 : 1) : NaN; }
function prepare(): AccountArtifact | undefined {
  try {
    if (!draft.value.name.trim()) throw new Error('请填写圣遗物名称。');
    if (!draft.value.real?.setId) throw new Error('请选择实物套装。');
    if(props.item?.real?.level!==draft.value.real.level) for(const sub of draft.value.real.substats) delete sub.rolls;
    draft.value.real.id = draft.value.id;
    draft.value.real = realArtifactSchema.parse(draft.value.real);
    validateAccountArtifact(draft.value.real);
    error.value = ''; return JSON.parse(JSON.stringify(draft.value)) as AccountArtifact;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '请核对输入。'; return undefined; }
}
function check() { if(prepare())preview.value=true; }
defineExpose({prepare,reset});
function apply() { try { if (!props.targetAccount && store.account !== originalAccount) throw new Error('账号已切换，请重新打开。'); applyAccountArtifact(props.targetAccount ?? store.account, draft.value, props.item?.id); emit('close'); } catch (cause) { error.value = String(cause); } }
</script>
<template>
  <div class="artifact-form" :class="{details}">
    <p v-if="!details">录入五星实物词条；比例数值使用百分数。确认前不会改变库存。</p>
    <template v-if="!preview && draft.real">
      <label>圣遗物名称<input class="ui-control" v-model="draft.name" maxlength="160"></label>
      <label>部位<select class="ui-control" v-model="draft.slot" :disabled="!!item" @change="changeSlot"><option v-for="slot in accountSlots" :key="slot" :value="slot">{{ accountSlotLabels[slot] }}</option></select></label>
      <CatalogPicker :inline="inline" label="套装" image-kind="artifacts" v-model="draft.real.setId" :options="sets" :disabled="!!item?.mona?.setIdentityPending" />
      <p v-if="item?.mona?.setIdentityPending">原始套装 {{ item.mona.sourceSetName }} 尚待核对，暂不匹配图片或更改身份。</p>
      <label>强化等级<NumberStepper v-model="draft.real.level" label="强化等级" :minimum="0" :maximum="20" /></label>
      <label>主词条<select class="ui-control" v-model="draft.real.mainStat"><option v-for="stat in available" :key="stat" :value="stat">{{ statLabel(stat) }}</option></select></label>
      <div v-for="(sub,index) in draft.real.substats" :key="index" class="sub-row">
        <label>副词条 {{ index + 1 }}<select class="ui-control" :aria-label="`副词条 ${index + 1}`" v-model="sub.stat" @change="sub.value = NaN; delete sub.rolls"><option v-for="stat in accountSubstats.filter(stat => stat !== draft.real?.mainStat)" :key="stat" :value="stat">{{ statLabel(stat as RealStat) }}</option></select></label>
        <label>数值{{ ratioStat(sub.stat) ? '（%）' : '' }}<input class="ui-control" type="number" step="any" :value="Number.isFinite(sub.value) ? Number((sub.value * (ratioStat(sub.stat) ? 100 : 1)).toPrecision(12)) : ''" @input="value(index,$event)"></label><button class="remove-substat" :aria-label="`移除副词条 ${index+1}`" @click="draft.real.substats.splice(index,1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      </div>
      <button class="ui-action soft" data-accent="anemo" :disabled="draft.real.substats.length >= 4" @click="addSub">添加副词条</button>
      <button v-if="!details" @click="check">预览词条</button>
    </template>
    <template v-else-if="preview"><ArtifactSummary :account="props.targetAccount" variant="relaxed" :item="draft" /><button @click="preview = false">返回修改</button><button @click="apply">{{ item ? '应用修改' : '确认入库' }}</button></template>
    <p v-if="error" role="alert">{{ error }}</p><button v-if="!details" @click="emit('close')">取消</button>
  </div>
</template>
<style scoped>
.artifact-form { display:grid; gap:14px; color:var(--ink); } label { display:grid; gap:6px; font-size:13px; } input,select { width:100%; box-sizing:border-box; min-height:38px; }.sub-row { display:grid; grid-template-columns:1fr 1fr auto; gap:8px; align-items:end; } p { font-size:13px; line-height:1.7; } [role=alert] { color:var(--element-pyro-deep); }
.artifact-form.details { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.artifact-form.details .sub-row,.artifact-form.details .catalog-picker,.artifact-form.details > p { grid-column:1/-1; }.artifact-form.details > button { justify-self:start; }@media(max-width:600px) { .artifact-form.details { grid-template-columns:1fr; } }
.artifact-form input.ui-control,.artifact-form select.ui-control { height:40px; min-height:40px; padding:0 10px; line-height:normal; font-size:16px; font-weight:700; border-radius:var(--control-radius); border-color:var(--line); color:var(--ink); background:var(--surface-raised); }.artifact-form label { font-size:14px; gap:7px; min-width:0; }.artifact-form.details { gap:14px 12px; }.artifact-form .sub-row { grid-template-columns:minmax(0,1fr) minmax(90px,.85fr) 32px; gap:8px; }.remove-substat { display:flex; align-items:center; justify-content:center; width:32px; height:40px; padding:6px; border:0; background:transparent; color:var(--element-pyro-deep); }.remove-substat svg { width:18px; height:18px; stroke:currentColor; fill:none; }.artifact-form.details :deep(.catalog-picker > button) { height:56px; box-sizing:border-box; padding:7px 10px; gap:10px; border:1px solid var(--line); border-radius:var(--control-radius); background:var(--surface-raised); font-size:15px; font-weight:700; }
</style>
