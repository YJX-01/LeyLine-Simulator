<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { realArtifactSchema, type RealStat } from '@leyline/schema';
import { accountSlots, accountSlotLabels, type AccountArtifact } from './domain/account';
import { accountMainStats, accountSubstats, accountStatLabels, ratioStat, validateAccountArtifact } from './domain/account-real';
import { applyAccountArtifact, loadAccountGameData } from './domain/account-presentation';
import { useAccountStore } from './stores/account';
import CatalogPicker from './components/CatalogPicker.vue';
import ArtifactSummary from './ArtifactSummary.vue';
const props = defineProps<{ item?: AccountArtifact }>();
const emit = defineEmits<{ close: [] }>();
const store = useAccountStore();
const originalAccount = store.account;
const draft = ref<AccountArtifact>(props.item ? JSON.parse(JSON.stringify(props.item)) : { id: crypto.randomUUID(), name: '', slot: 'flower', attack: 0, real: { id: '', setId: '', slot: 'flower', rarity: 5, level: 20, mainStat: 'hp', substats: [] } });
if (!draft.value.real) draft.value.real = { id: draft.value.id, setId: '', slot: draft.value.slot, rarity: 5, level: 20, mainStat: accountMainStats[draft.value.slot][0], substats: [] };
const sets = ref<{ id: string; name: string }[]>([]);
const error = ref('');
const preview = ref(false);
const available = computed(() => accountMainStats[draft.value.slot]);
onMounted(async () => { try { sets.value = (await loadAccountGameData()).catalog.sets; } catch { error.value = '套装目录加载失败，请重新打开。'; } });
function changeSlot() { if (draft.value.real) { draft.value.real.slot = draft.value.slot; draft.value.real.mainStat = available.value[0]; } }
function addSub() { const real = draft.value.real; const stat = accountSubstats.find(stat => stat !== real?.mainStat && !real?.substats.some(sub => sub.stat === stat)); if (real && stat) real.substats.push({ stat, value: NaN }); }
function value(index: number, event: Event) { const sub = draft.value.real!.substats[index]; const raw = (event.target as HTMLInputElement).value; sub.value = raw.trim() ? Number(raw) / (ratioStat(sub.stat) ? 100 : 1) : NaN; }
function check() {
  try {
    if (!draft.value.name.trim()) throw new Error('请填写圣遗物名称。');
    if (!draft.value.real?.setId) throw new Error('请选择实物套装。');
    draft.value.real.id = draft.value.id;
    draft.value.real = realArtifactSchema.parse(draft.value.real);
    validateAccountArtifact(draft.value.real);
    error.value = ''; preview.value = true;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '请核对输入。'; }
}
function apply() { try { if (store.account !== originalAccount) throw new Error('账号已切换，请重新打开。'); applyAccountArtifact(store.account, draft.value, props.item?.id); emit('close'); } catch (cause) { error.value = String(cause); } }
</script>
<template>
  <div class="artifact-form">
    <p>录入五星实物词条；比例数值使用百分数。确认前不会改变库存。</p>
    <template v-if="!preview && draft.real">
      <label>圣遗物名称<input v-model="draft.name" maxlength="160"></label>
      <label>部位<select v-model="draft.slot" :disabled="!!item" @change="changeSlot"><option v-for="slot in accountSlots" :key="slot" :value="slot">{{ accountSlotLabels[slot] }}</option></select></label>
      <CatalogPicker label="套装" image-kind="artifacts" v-model="draft.real.setId" :options="sets" :disabled="!!item?.mona?.setIdentityPending" />
      <p v-if="item?.mona?.setIdentityPending">原始套装 {{ item.mona.sourceSetName }} 尚待核对，暂不匹配图片或更改身份。</p>
      <label>强化等级<input v-model.number="draft.real.level" aria-label="强化等级" type="number" min="0" max="20" step="1"></label>
      <label>主词条<select v-model="draft.real.mainStat"><option v-for="stat in available" :key="stat" :value="stat">{{ accountStatLabels[stat] }}</option></select></label>
      <div v-for="(sub,index) in draft.real.substats" :key="index" class="sub-row">
        <label>副词条 {{ index + 1 }}<select :aria-label="`副词条 ${index + 1}`" v-model="sub.stat" @change="sub.value = NaN"><option v-for="stat in accountSubstats.filter(stat => stat !== draft.real?.mainStat)" :key="stat" :value="stat">{{ accountStatLabels[stat as RealStat] }}</option></select></label>
        <label>数值{{ ratioStat(sub.stat) ? '（%）' : '' }}<input type="number" step="any" :value="Number.isFinite(sub.value) ? sub.value * (ratioStat(sub.stat) ? 100 : 1) : ''" @input="value(index,$event)"></label><button @click="draft.real.substats.splice(index,1)">移除</button>
      </div>
      <button :disabled="draft.real.substats.length >= 4" @click="addSub">添加副词条</button>
      <button @click="check">预览词条</button>
    </template>
    <template v-else-if="preview"><ArtifactSummary :item="draft" /><button @click="preview = false">返回修改</button><button @click="apply">{{ item ? '应用修改' : '确认入库' }}</button></template>
    <p v-if="error" role="alert">{{ error }}</p><button @click="emit('close')">取消</button>
  </div>
</template>
<style scoped>
.artifact-form { display:grid; gap:14px; color:var(--ink); } label { display:grid; gap:6px; font-size:13px; } input,select { width:100%; box-sizing:border-box; min-height:38px; }.sub-row { display:grid; grid-template-columns:1fr 1fr auto; gap:8px; align-items:end; } p { font-size:13px; line-height:1.7; } [role=alert] { color:var(--element-pyro-deep); }
</style>
