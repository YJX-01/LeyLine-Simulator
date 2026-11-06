<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { realBuildSchema, realWeaponSchema, realSetSchema, realElements, type RealBuild, type RealDamage } from '@leyline/schema';
import { resolveRealBuild } from '@leyline/engine';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { useAccountStore } from './stores/account';
import { addRealActor, addRealHits, defaultRealEnemy } from './domain/real-project';
import { localDataErrorLabel, realStatLabel, realElementLabel, realCategoryLabel, statusLabel } from './domain/workbench-labels';
const props = defineProps<{ mode: 'axis' | 'account'; accountCharacterId?: string }>();
type Catalog = Awaited<ReturnType<typeof import('@leyline/game-data/real')['loadRealCatalog']>>;
const axis = useAxisWorkspaceStore();
const accounts = useAccountStore();
const catalog = ref<Catalog>();
const characterId = ref('jean');
const weaponId = ref('favoniussword');
const search = ref('');
const error = ref('');
const notice = ref('');
const loading = ref(false);
const skillId = ref('');
const hitTime = ref(2000);
const crit = ref<RealDamage['crit']>('noncritical');
const filter = ref<'characters' | 'weapons' | 'sets'>('characters');
const accountCharacter = computed(() => accounts.account.characters.find(entry => entry.id === props.accountCharacterId));
const inventory = computed(() => accounts.account.artifacts.filter(entry => entry.real));
const build = computed(() => {
  if (props.mode === 'axis') return axis.actor?.realBuild;
  const owner = accountCharacter.value;
  if (!owner?.realBuild) return undefined;
  const unresolved = Object.values(owner.equipment).some(id => !inventory.value.some(item => item.id === id));
  const character = unresolved ? { ...owner.realBuild.character, support: { supported: false, reason: '实际装备中有物品尚未填写真实词条，请先补全或卸下。' } } : owner.realBuild.character;
  return { ...owner.realBuild, character, artifacts: Object.values(owner.equipment).flatMap(id => { const item = inventory.value.find(entry => entry.id === id); return item?.real ? [{ ...item.real, inventoryAccountId: accounts.account.id }] : []; }) };
});
const panel = computed(() => build.value ? resolveRealBuild(build.value) : undefined);
const selectedSkill = computed(() => build.value?.character.skills.find(entry => entry.id === skillId.value));
const selectedRecord = computed(() => axis.project.timeline.find(entry => entry.id === axis.selectedId));
const realPoint = computed(() => selectedRecord.value?.actor === axis.actorId ? axis.result.points.find(entry => entry.id === axis.selectedId)?.real : undefined);
const availableWeapons = computed(() => catalog.value?.weapons.filter(entry => !build.value || entry.weaponType === build.value.character.weaponType) ?? []);
const entries = computed(() => (catalog.value?.[filter.value] ?? []).filter(entry => entry.name.includes(search.value)).slice(0, 30));
watch(build, value => { if (!value?.character.skills.some(skill => skill.id === skillId.value)) skillId.value = value?.character.skills.find(skill => skill.support.supported)?.id ?? value?.character.skills[0]?.id ?? ''; }, { immediate: true });
onMounted(async () => {
  try { catalog.value = await (await import('@leyline/game-data/real')).loadRealCatalog(); }
  catch { error.value = '真实资料库加载失败，请重新打开该页面。'; }
});
function edit(change: (value: RealBuild) => void) {
  if (props.mode === 'axis') axis.command(draft => { const value = draft.candidate.actors.find(entry => entry.id === axis.actorId)?.realBuild; if (value) change(value); });
  else if (accountCharacter.value?.realBuild) change(accountCharacter.value.realBuild);
}
async function create() {
  const destination = props.mode === 'axis' ? axis.project : accountCharacter.value;
  const originalAccount = accounts.account;
  const chosenCharacter = characterId.value, chosenWeapon = weaponId.value;
  loading.value = true; error.value = '';
  try {
    const data = await import('@leyline/game-data/real');
    const [character, weapon, artifactMain] = await Promise.all([data.getRealCharacter(chosenCharacter), data.getRealWeapon(chosenWeapon), data.getArtifactMain()]);
    if (destination !== (props.mode === 'axis' ? axis.project : accountCharacter.value) || (props.mode === 'account' && originalAccount !== accounts.account)) return;
    const value = realBuildSchema.parse({ dataVersion: catalog.value!.version, character, weapon, artifactMain, sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: [20,40,50,60,70,80,90][Math.min(6,weapon.promotion.length-1)], weaponAscension: Math.min(6,weapon.promotion.length-1), refinement: 1, hpRatio: 1, artifacts: [] });
    if (value.character.weaponType !== value.weapon.weaponType) throw new Error('角色与武器类型不匹配。');
    if (props.mode === 'account') {
      if (!accountCharacter.value) throw new Error('请先创建并选择账号角色。');
      accountCharacter.value.realBuild = value;
      accountCharacter.value.name = value.character.name;
      await syncAccount();
      notice.value = '已设置账号真实配装，当前轴不变；请保存账号资料。';
    } else {
      axis.command(draft => { axis.actorId = addRealActor(draft, value); });
      notice.value = '已创建真实候选，请选择技能和明确条件，再添加独立命中。';
    }
    skillId.value = value.character.skills.find(skill => skill.support.supported)?.id ?? '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建失败。'; }
  finally { loading.value = false; }
}
function editTarget() { return props.mode === 'account' ? accountCharacter.value?.realBuild : axis.actor?.realBuild; }
async function changeWeapon(event: Event) {
  const destination = editTarget();
  const id = (event.target as HTMLSelectElement).value;
  loading.value = true;
  try { const weapon = realWeaponSchema.parse(await (await import('@leyline/game-data/real')).getRealWeapon(id)); if (destination !== editTarget()) return; edit(value => { value.weapon = weapon; value.weaponAscension = Math.min(value.weaponAscension, weapon.promotion.length-1); value.weaponLevel = Math.min(value.weaponLevel,[20,40,50,60,70,80,90][value.weaponAscension]); }); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '武器加载失败。'; }
  finally { loading.value = false; }
}
let syncRevision = 0;
async function syncAccount(): Promise<boolean> {
  const revision = ++syncRevision;
  const destination = editTarget();
  if (props.mode !== 'account' || !build.value) return false;
  try {
    const items = build.value.artifacts;
    const data = await import('@leyline/game-data/real');
    const sets = await Promise.all([...new Set(items.map(item => item.setId))].filter(id => id !== 'none').map(id => data.getRealSet(id)));
    if (revision !== syncRevision || destination !== editTarget()) return false;
    edit(value => { value.inventoryAccountId = accounts.account.id; value.artifacts = JSON.parse(JSON.stringify(items)); value.sets = sets.map(entry => realSetSchema.parse(entry)); });
    return true;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '装备数据加载失败。'; return false; }
}
watch(() => props.mode === 'account' ? JSON.stringify({ id: props.accountCharacterId, equipment: accountCharacter.value?.equipment, inventory: inventory.value.map(item => item.real) }) : '', () => { void syncAccount(); }, { immediate: true });
async function equipCandidate(slot: string, event: Event) {
  const destination = editTarget();
  const id = (event.target as HTMLSelectElement).value;
  const item = inventory.value.find(entry => entry.id === id)?.real;
  if (!build.value) return;
  try {
    if (item && axis.project.candidate.actors.some(actor => actor.id !== axis.actorId && actor.realBuild?.artifacts.some(piece => piece.id === item.id && (piece.inventoryAccountId ?? actor.realBuild?.inventoryAccountId) === accounts.account.id))) throw new Error('当前队伍已使用这件实物，不能重复占用。请先卸下其他队员的候选装备。');
    const sets = [...build.value.sets];
    if (item && item.setId !== 'none' && !sets.some(entry => entry.id === item.setId)) sets.push(realSetSchema.parse(await (await import('@leyline/game-data/real')).getRealSet(item.setId)));
    if (destination !== editTarget()) return;
    edit(value => { value.inventoryAccountId = accounts.account.id; value.artifacts = value.artifacts.filter(entry => entry.slot !== slot); if (item) value.artifacts.push({ ...JSON.parse(JSON.stringify(item)), inventoryAccountId: accounts.account.id }); value.sets = sets; });
    error.value = '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '候选装备操作失败。'; }
}
async function copyAccount() {
  const project = axis.project, destination = editTarget();
  if (!await syncAccount() || destination !== editTarget() || project !== axis.project || !build.value) return;
  try {
    if (Object.values(accountCharacter.value?.equipment ?? {}).some(id => !inventory.value.some(item => item.id === id))) throw new Error('请先补全所有实际装备的真实词条，复制未执行。');
    if (axis.project.candidate.actors.some(actor => actor.realBuild?.artifacts.some(piece => build.value!.artifacts.some(item => item.id === piece.id && (piece.inventoryAccountId ?? actor.realBuild?.inventoryAccountId) === accounts.account.id)))) throw new Error('轴内队伍已占用所选实物，复制未执行。');
    axis.command(draft => { axis.actorId = addRealActor(draft, build.value!, accountCharacter.value?.name); });
    notice.value = '已复制真实配装与数值快照到轴，后续修改互不传播。';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '复制失败。'; }
}
function addHits() {
  try { axis.command(draft => { axis.selectedId = addRealHits(draft, axis.actorId, skillId.value, hitTime.value, crit.value)[0] ?? ''; }); notice.value = '已逐段添加命中，请按实际情况调整记录时间；不自动推演命中间隔。'; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '添加命中失败。'; }
}
const n = (value: number | null | undefined) => value == null ? '待确认' : value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
const ratioStats = new Set(['hpPercent','attackPercent','defensePercent','critRate','critDamage','energyRecharge','physicalBonus','anemoBonus','geoBonus','electroBonus','hydroBonus','pyroBonus','cryoBonus','dendroBonus','healingBonus']);
const formatStat = (key: string, value: number) => ratioStats.has(key) ? `${n(value * 100)}%` : n(value);
const sourceLabel = (value: string) => value.replace(/flower|plume|sands|goblet|circlet/g, key => ({flower:'生之花',plume:'死之羽',sands:'时之沙',goblet:'空之杯',circlet:'理之冠'}[key] ?? key));
const numeric = (event: Event) => (event.target as HTMLInputElement).value.trim() ? Number((event.target as HTMLInputElement).value) : NaN;
function target(field: 'level' | 'defenseReduction' | 'defenseIgnore', event: Event) { axis.command(draft => { draft.enemy ??= defaultRealEnemy(); draft.enemy[field] = numeric(event); }); }
const partsLabels: Record<string,string> = {attack:'攻击力',multiplier:'技能倍率',bonus:'增伤乘区',crit:'暴击乘区',defense:'防御乘区',resistance:'抗性乘区'};
</script>
<template>
  <section class="real-game-panel" aria-label="真实游戏数据与配装">
    <h2>真实游戏数据与配装验算</h2>
    <p>基础目录与可计算范围分别标注。当前核验琴、凯亚、行秋零命战技；行秋保留两段。配装与采用的数值快照一同保存。</p>
    <p v-if="notice" role="status">{{ notice }}</p><div v-if="error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>
    <p v-if="!catalog">正在加载本地资料库…</p>
    <template v-else>
      <div class="real-fields"><label>游戏角色<select v-model="characterId" aria-label="游戏角色"><option v-for="entry in catalog.characters" :key="entry.id" :value="entry.id">{{ entry.name }}{{ entry.supported ? ' · 首批支持' : ' · 资料' }}</option></select></label><label>初始真实武器<select v-model="weaponId" aria-label="初始真实武器"><option v-for="entry in catalog.weapons" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label><button :disabled="loading" @click="create">{{ mode === 'account' ? '设置账号真实角色' : '添加真实角色到当前轴' }}</button></div>
      <details><summary>完整基础目录与支持范围</summary><p>角色 {{ catalog.characters.length }} 条 · 武器 {{ catalog.weapons.length }} 条 · 套装 {{ catalog.sets.length }} 条</p><div class="real-fields"><label>目录类型<select v-model="filter"><option value="characters">角色</option><option value="weapons">武器</option><option value="sets">套装</option></select></label><label>中文搜索<input v-model="search" aria-label="真实资料搜索"></label></div><ul><li v-for="entry in entries" :key="entry.id">{{ entry.name }}<span v-if="'supported' in entry"> · {{ entry.supported ? '首批可验算' : '仅资料 / 未核验机制' }}</span></li></ul><p>每次显示前 30 条，可搜索定位；未核验机制的伤害不会显示为完整结果。</p></details>
    </template>
    <template v-if="build && panel">
      <h3>{{ build.character.name }} · {{ build.weapon.name }} · {{ statusLabel(panel.status) }}</h3>
      <div class="real-fields"><label>角色等级<input type="number" min="1" max="90" aria-label="真实角色等级" :value="build.level" @change="edit(value => { value.level = numeric($event); })"></label><label>角色突破阶段<input type="number" min="0" max="6" aria-label="真实角色突破" :value="build.ascension" @change="edit(value => { value.ascension = numeric($event); })"></label><label>命座<input type="number" min="0" max="6" aria-label="真实角色命座" :value="build.constellation" @change="edit(value => { value.constellation = numeric($event); })"></label><label>战技天赋<input type="number" min="1" max="15" aria-label="真实战技天赋" :value="build.talents.skill" @change="edit(value => { value.talents.skill = numeric($event); })"></label><label>当前生命比例<input type="number" min="0" max="1" step="0.01" :value="build.hpRatio" @change="edit(value => { value.hpRatio = numeric($event); })"></label></div>
      <div class="real-fields"><label>真实候选武器<select :value="build.weapon.id" aria-label="真实候选武器" :disabled="loading" @change="changeWeapon"><option v-for="entry in availableWeapons" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label><label>武器等级<input type="number" min="1" max="90" aria-label="真实武器等级" :value="build.weaponLevel" @change="edit(value => { value.weaponLevel = numeric($event); })"></label><label>武器突破<input type="number" min="0" max="6" aria-label="真实武器突破" :value="build.weaponAscension" @change="edit(value => { value.weaponAscension = numeric($event); })"></label><label>精炼<input type="number" min="1" max="5" aria-label="真实武器精炼" :value="build.refinement" @change="edit(value => { value.refinement = numeric($event); })"></label></div>
      <button v-if="mode === 'account'" @click="copyAccount">复制真实配装到轴</button>
      <div v-else class="real-fields"><label v-for="slot in [{ id:'flower',name:'生之花' },{id:'plume',name:'死之羽'},{id:'sands',name:'时之沙'},{id:'goblet',name:'空之杯'},{id:'circlet',name:'理之冠'}]" :key="slot.id">候选{{ slot.name }}<select :aria-label="`真实候选${slot.name}`" :value="build.artifacts.find(item => item.slot === slot.id)?.id ?? ''" @change="equipCandidate(slot.id,$event)"><option value="">不装备</option><option v-for="item in inventory.filter(item => item.real?.slot === slot.id)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label></div>
      <p>面板显示游戏百分比；编辑目标条件时 0.1 表示 10%。计算与文件保留原数值精度。</p>
      <dl class="real-stats"><template v-for="(value,key) in panel.stats" :key="key"><dt>{{ realStatLabel(String(key)) }}</dt><dd :data-testid="`real-stat-${key}`">{{ formatStat(String(key),value) }}</dd></template></dl>
      <p v-for="message in panel.diagnostics" :key="message" class="real-warning">{{ message }}</p>
      <details><summary>查看属性来源明细</summary><table><thead><tr><th>来源</th><th>属性</th><th>计算值</th></tr></thead><tbody><tr v-for="(entry,index) in panel.contributions" :key="index"><td>{{ sourceLabel(entry.source) }}</td><td>{{ realStatLabel(entry.stat) }}</td><td>{{ formatStat(entry.stat,entry.value) }}</td></tr></tbody></table></details>
      <template v-if="mode === 'axis'">
        <h3>真实技能与目标条件</h3><div class="real-fields"><label>真实技能<select v-model="skillId" aria-label="真实技能"><option v-for="skill in build.character.skills" :key="skill.id" :value="skill.id">{{ skill.name }} · {{ realCategoryLabel(skill.category) }} · {{ skill.support.supported ? '首批支持' : '未核验' }}</option></select></label><label>命中时间（整数毫秒）<input v-model.number="hitTime" type="number" min="0" aria-label="真实命中时间"></label><label>新增命中暴击口径<select v-model="crit" aria-label="新增命中暴击口径"><option :value="null">未知，待确认</option><option value="noncritical">明确不暴击</option><option value="critical">明确暴击</option><option value="expected">静态暴击期望</option></select></label><button :disabled="!selectedSkill" @click="addHits">添加技能全部独立命中</button></div>
        <p v-if="selectedSkill">{{ selectedSkill.name }} · {{ selectedSkill.multipliers.length }} 段 · {{ realElementLabel(selectedSkill.element) }}伤害；{{ selectedSkill.support.reason }}</p>
        <div class="real-fields"><label>目标等级<input type="number" min="1" max="200" aria-label="真实目标等级" :value="axis.project.enemy?.level ?? 90" @change="target('level',$event)"></label><label>减防比例<input type="number" step="0.01" min="0" max="1" :value="axis.project.enemy?.defenseReduction ?? 0" @change="target('defenseReduction',$event)"></label><label>无视防御比例<input type="number" step="0.01" min="0" max="1" :value="axis.project.enemy?.defenseIgnore ?? 0" @change="target('defenseIgnore',$event)"></label><label v-for="element in realElements" :key="element">{{ realElementLabel(element) }}抗性<input type="number" step="0.01" :aria-label="`${realElementLabel(element)}抗性`" :value="axis.project.enemy?.resistances[element] ?? 0.1" @change="axis.command(draft => { draft.enemy ??= defaultRealEnemy(); draft.enemy.resistances[element] = numeric($event); })"></label></div>
        <p>目标为手动条件，默认 90 级、各抗性 10%，不是敌人阶段模拟。</p>
        <div v-if="selectedRecord?.realDamage && selectedRecord.actor === axis.actorId" class="real-fields"><label>所选命中暴击<select v-model="selectedRecord.realDamage.crit" aria-label="所选真实命中暴击"><option :value="null">未知，待确认</option><option value="noncritical">明确不暴击</option><option value="critical">明确暴击</option><option value="expected">静态暴击期望</option></select></label><label>所选命中反应<select v-model="selectedRecord.realDamage.reaction" aria-label="所选真实命中反应"><option :value="null">未知，待确认</option><option value="none">明确无反应</option></select></label></div>
        <div v-if="realPoint"><h3>所选命中的乘区与结果</h3><dl class="real-stats"><template v-for="(value,key) in realPoint.parts" :key="key"><dt>{{ partsLabels[key] }}</dt><dd>{{ n(value) }}</dd></template></dl><strong>计算伤害 {{ n(realPoint.value) }}</strong><p v-for="message in realPoint.diagnostics" :key="message">{{ message }}</p></div>
      </template>
      <details><summary>技术详情：数据版本与来源</summary><p>{{ build.dataVersion }}</p><p>{{ build.character.source.repository }} · {{ build.character.source.commit }} · {{ build.character.source.path }}</p><p>{{ build.weapon.source.repository }} · {{ build.weapon.source.commit }} · {{ build.weapon.source.path }}</p></details>
    </template>
  </section>
</template>
<style scoped>
.real-game-panel { margin:0 0 24px; border-bottom:1px solid var(--line); padding-bottom:24px; } p { font-size:12px; line-height:1.8; margin:10px 0; } h3 { margin:20px 0 10px; } .real-fields { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin:14px 0; } label { display:grid; gap:7px; font-size:12px; min-width:120px; max-width:100%; } input,select { max-width:100%; min-width:0; } .real-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px 12px; font-size:12px; margin:16px 0; } dd { margin:0; font-variant-numeric:tabular-nums; } details { margin:14px 0; font-size:12px; overflow-wrap:anywhere; } table { width:100%; font-size:12px; text-align:left; } td { padding:6px 0; } .real-warning { color:#a45d29; } @media(max-width:700px) { .real-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
