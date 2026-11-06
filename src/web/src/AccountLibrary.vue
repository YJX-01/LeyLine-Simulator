<script setup lang="ts">
import { computed, ref, shallowRef, onMounted, watch, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { accountSlots, accountSlotLabels, artifactOwner, equipArtifact, type AccountSlot } from './domain/account';
import { useAccountStore } from './stores/account';
import { localDataErrorLabel } from './domain/workbench-labels';
import { loadAccountGameData } from './domain/account-presentation';
import { showcaseArtifact } from './domain/enka-import';
import { elementPalette } from './styles/palette';
import type { RealCatalog } from '@leyline/game-data/real';
import { previewMonaSetRepairs, confirmMonaImport, type MonaImportPreview } from './domain/mona-import';
import ArtifactBrowser from './ArtifactBrowser.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
import { organizeMonaWearNotes } from './domain/mona-wear-notes';
import CharacterForm from './CharacterForm.vue';
import CharacterStats from './CharacterStats.vue';
import ArtifactForm from './ArtifactForm.vue';
import GameIcon from './components/GameIcon.vue';
import ArtifactSummary from './ArtifactSummary.vue';
const EnkaImport = defineAsyncComponent(() => import('./EnkaImport.vue'));
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));

const props = defineProps<{ page: 'characters' | 'artifacts' }>();
const emit = defineEmits<{ settings:[] }>();
const store = useAccountStore();
const { account, error, notice } = storeToRefs(store);
const { selectedCharacterId: characterId, characterQuery: query, characterElement:elementFilter, characterWeapon:weaponFilter, characterProfile:profileFilter, characterEquipment:equipmentFilter, characterSort:sort } = storeToRefs(store);
const character = computed(() => account.value.characters.find(entry => entry.id === characterId.value));
const artifactId = ref('');
const equipmentSlot = ref<AccountSlot>('flower');
const editingCharacter = ref(false);
const modal = ref<'import' | 'create' | 'equipment' | 'notes' | 'artifact' | 'repair' | 'network' | 'filters' | ''>('');
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
  try { const result = organizeMonaWearNotes(account.value); query.value = ''; resetFilters(); notice.value = `已根据原始穿戴备注新增 ${result.added} 位待补全角色。${result.conflicts.join('；')}请设置角色与武器，等级和天赋按用户指定的满级设定核对。`; modal.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '整理失败，现有资料保持不变。'; }
}
const catalog = shallowRef<RealCatalog>();
onMounted(async () => { try { catalog.value = (await loadAccountGameData()).catalog; } catch { error.value = '目录加载失败，角色资料仍保留。'; } });
const weapons = [{id:'WEAPON_SWORD_ONE_HAND',name:'单手剑'},{id:'WEAPON_CLAYMORE',name:'双手剑'},{id:'WEAPON_POLE',name:'长柄武器'},{id:'WEAPON_BOW',name:'弓'},{id:'WEAPON_CATALYST',name:'法器'}];
const profileOptions = [{id:'ready',name:'培养资料齐全'},{id:'pending',name:'待补全'}];
const equipmentOptions = [{id:'full',name:'本地装备齐全'},{id:'partial',name:'本地装备未齐'},{id:'empty',name:'尚未配置本地装备'}];
const sortOptions = [{id:'name',name:'名称'},{id:'level',name:'等级从高到低'},{id:'constellation',name:'命座从高到低'},{id:'equipment',name:'本地装备数量'}];
const metadata = (entry: typeof account.value.characters[number]) => entry.realBuild?.character ?? catalog.value?.characters.find(item => item.name === entry.name);
const visibleCharacters = computed(() => {
  const items = account.value.characters.filter(entry => {
    const meta=metadata(entry), count=Object.values(entry.equipment).length;
    return entry.name.includes(query.value.trim()) && (!elementFilter.value || (meta?.element??'physical') === elementFilter.value)
      && (!weaponFilter.value || meta?.weaponType===weaponFilter.value)
      && (!profileFilter.value || (profileFilter.value==='ready' ? !!entry.realBuild : !entry.realBuild))
      && (!equipmentFilter.value || (equipmentFilter.value==='full' ? count===5 : equipmentFilter.value==='partial' ? count>0&&count<5 : count===0));
  });
  return items.sort((a,b) => (sort.value==='level' ? (b.realBuild?.level??-1)-(a.realBuild?.level??-1) : sort.value==='constellation' ? (b.realBuild?.constellation??-1)-(a.realBuild?.constellation??-1) : sort.value==='equipment' ? Object.keys(b.equipment).length-Object.keys(a.equipment).length : 0) || a.name.localeCompare(b.name,'zh-CN'));
});
const activeFilters = computed(() => [elementFilter.value,weaponFilter.value,profileFilter.value,equipmentFilter.value,sort.value==='name'?'':sort.value].filter(Boolean).length);
function resetFilters() { elementFilter.value=''; weaponFilter.value=''; profileFilter.value=''; equipmentFilter.value=''; sort.value='name'; }
const equipmentView=ref<'local'|'showcase'>('local');
watch(()=>character.value?.id,() => { const entry=character.value; equipmentView.value=entry?.showcase&&!Object.keys(entry.equipment).length?'showcase':'local'; },{immediate:true});
function showImportedCharacter(id:string) { query.value='';resetFilters();characterId.value=id;equipmentView.value=Object.keys(account.value.characters.find(item=>item.id===id)?.equipment??{}).length?'local':'showcase';modal.value=''; }
const displayBuild=computed(()=>equipmentView.value==='showcase'?character.value?.showcase?.build:character.value?.realBuild);
function equipmentItem(slot:AccountSlot) { return equipmentView.value==='showcase'&&character.value?showcaseArtifact(character.value,slot):account.value.artifacts.find(item=>item.id===character.value?.equipment[slot]); }

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
    <header class="account-heading"><div class="account-heading-info"><button class="account-name" aria-label="账号设置" @click="emit('settings')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>{{ account.name }}</button><span class="account-count">{{ account.characters.length }} 角色<span>·</span>{{ account.artifacts.length }} 圣遗物</span></div><details v-if="notice" class="account-feedback"><summary><i></i>{{ notice.startsWith('已恢复') ? '草稿已恢复' : '操作完成' }}<span>详情⌄</span></summary><div role="status"><p>{{ notice }}</p><button class="ui-muted-button" @click="notice = ''">知道了</button><button class="ui-muted-button" @click="emit('settings')">账号与备份</button></div></details><span v-else class="local-status"><i></i>{{ store.dirty ? '本地草稿' : '文件已保存' }}</span></header>
    <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}<details><summary>技术详情</summary>{{ error }}</details></div>

    <template v-if="page === 'characters'">
      <div class="character-toolbar"><div class="character-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input v-model="query" aria-label="搜索账号角色" placeholder="查找角色"></div><button class="filter-trigger ui-muted-button" :class="{ applied:activeFilters }" @click="modal = 'filters'">筛选与排序<span v-if="activeFilters">{{ activeFilters }}</span></button><div class="character-import-actions"><button class="ui-action soft" data-accent="hydro" @click="modal = 'network'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a17 17 0 0 1 0 16 17 17 0 0 1 0-16Z"/></svg>网络导入</button><button class="ui-action soft" data-accent="electro" @click="modal = 'import'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H6V3ZM12 9v8m-3-3 3 3 3-3"/></svg>莫娜 JSON</button><button class="ui-action" data-accent="anemo" aria-label="手动添加" @click="editingCharacter = false; modal = 'create'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>手动添加</button></div></div>
      <div class="character-filter-summary"><span>{{ visibleCharacters.length }} / {{ account.characters.length }} 位角色</span><span v-if="elementFilter" class="filter-chip">{{ elementPalette.find(item=>item.id===elementFilter)?.name??'其他 / 待确认' }}元素<button aria-label="清除元素筛选" @click="elementFilter = ''">×</button></span><span v-if="weaponFilter" class="filter-chip">{{ weapons.find(item=>item.id===weaponFilter)?.name }}<button aria-label="清除武器筛选" @click="weaponFilter = ''">×</button></span><span v-if="profileFilter" class="filter-chip">{{ profileOptions.find(item=>item.id===profileFilter)?.name }}<button aria-label="清除资料筛选" @click="profileFilter = ''">×</button></span><span v-if="equipmentFilter" class="filter-chip">{{ equipmentOptions.find(item=>item.id===equipmentFilter)?.name }}<button aria-label="清除配装筛选" @click="equipmentFilter = ''">×</button></span><span v-if="sort!=='name'" class="filter-chip">{{ sortOptions.find(item=>item.id===sort)?.name }}<button aria-label="恢复默认排序" @click="sort = 'name'">×</button></span><button v-if="activeFilters" class="reset-filters" @click="resetFilters">清除筛选</button></div>
      <WorkbenchDialog v-if="modal === 'filters'" title="筛选角色" @close="modal = ''"><div class="character-filter-panel"><h3>元素</h3><div class="filter-options"><button :class="{selected:!elementFilter}" @click="elementFilter = ''">全部</button><button v-for="element in elementPalette" :key="element.id" :class="{selected:elementFilter===element.id}" :style="{ '--filter-light':element.light,'--filter-deep':element.deep }" @click="elementFilter = element.id">{{ element.name }}</button><button :class="{selected:elementFilter==='physical'}" @click="elementFilter = 'physical'">其他 / 待确认</button></div><h3>武器类型</h3><div class="filter-options"><button :class="{selected:!weaponFilter}" @click="weaponFilter = ''">全部</button><button v-for="item in weapons" :key="item.id" :class="{selected:weaponFilter===item.id}" @click="weaponFilter = item.id">{{ item.name }}</button></div><h3>培养资料</h3><div class="filter-options"><button :class="{selected:!profileFilter}" @click="profileFilter = ''">全部</button><button v-for="item in profileOptions" :key="item.id" :class="{selected:profileFilter===item.id}" @click="profileFilter = item.id">{{ item.name }}</button></div><h3>本地配装</h3><div class="filter-options"><button :class="{selected:!equipmentFilter}" @click="equipmentFilter = ''">全部</button><button v-for="item in equipmentOptions" :key="item.id" :class="{selected:equipmentFilter===item.id}" @click="equipmentFilter = item.id">{{ item.name }}</button></div><h3>排序</h3><div class="filter-options"><button v-for="item in sortOptions" :key="item.id" :class="{selected:sort===item.id}" @click="sort = item.id">{{ item.name }}</button></div><div class="filter-panel-actions"><button class="ui-muted-button" @click="resetFilters">重置筛选</button><button class="ui-action" data-accent="anemo" @click="modal = ''">查看 {{ visibleCharacters.length }} 位角色</button></div></div></WorkbenchDialog>

      <WorkbenchDialog v-if="modal === 'notes'" title="从穿戴备注整理角色" @close="modal = ''"><p>文件中有 {{ noteNames.length }} 个角色穿戴备注：{{ noteNames.join('、') }}。</p><p>仅新增尚不存在的角色资料，并按没有冲突的原始备注登记装备。已有角色与装备不覆盖；武器、命座、等级和天赋不来自此文件，角色需继续补全后才能计算。</p><button @click="organizeNotes">确认按备注整理</button></WorkbenchDialog>
      <div class="character-workspace"><aside><div class="character-cards"><button v-for="entry in visibleCharacters" :key="entry.id" :class="{ selected: characterId === entry.id }" @click="characterId = entry.id"><GameIcon class="character-avatar" kind="characters" :id="entry.realBuild?.character.id" :name="entry.name" :size="48" /><strong>{{ entry.name }}</strong><small>{{ entry.realBuild ? `${entry.realBuild.level}级 · ${entry.realBuild.constellation}命 · ${entry.realBuild.weapon.name}` : '资料待补全' }}</small><small>{{ entry.showcase && !Object.keys(entry.equipment).length ? `展柜快照 · ${entry.showcase.build.artifacts.length} 件装备` : `${Object.keys(entry.equipment).length} / 5 件本地装备` }}</small></button></div>
      <p v-if="!visibleCharacters.length" class="account-empty">没有符合条件的角色，请调整搜索。</p></aside><div class="character-detail">
      <WorkbenchDialog v-if="modal === 'create'" :title="editingCharacter ? '编辑角色资料' : '添加账号角色'" @close="modal = ''"><CharacterForm :character="editingCharacter ? character : undefined" @saved="characterId = $event" @close="modal = ''" /></WorkbenchDialog>
      <div v-if="character" class="account-editor">
        <div class="detail-heading"><div class="character-identity"><GameIcon kind="characters" :id="character.realBuild?.character.id" :name="character.name" :size="64" /><div><h2>{{ character.name }}</h2></div></div><button @click="equipmentView = 'local'; editingCharacter = true; modal = 'create'">{{ character.realBuild ? '编辑角色资料' : '补全角色资料' }}</button></div>
        <p v-if="!visibleCharacters.some(entry => entry.id === character?.id)">当前查看的角色不在搜索结果中。</p>
        <p v-if="!character.realBuild">培养资料待补全。请确认游戏角色与武器后，再到队伍页面编队计算。</p>
        <template v-else><div class="character-build-summary"><GameIcon kind="weapons" :id="displayBuild!.weapon.id" :size="64" /><div><p>{{ displayBuild!.level }}级 · {{ displayBuild!.constellation }}命 · {{ displayBuild!.weapon.name }} · 精炼{{ displayBuild!.refinement }}</p><p>天赋 {{ displayBuild!.talents.normal }} / {{ displayBuild!.talents.skill }} / {{ displayBuild!.talents.burst }}</p><p>账号配装在此管理；编队与整轴计算请进入项目的队伍页面。</p></div></div></template>
        <div v-if="character.showcase" class="equipment-view-tabs"><button :class="{active:equipmentView==='local'}" @click="equipmentView = 'local'">本地配装</button><button :class="{active:equipmentView==='showcase'}" @click="equipmentView = 'showcase'">展柜快照</button><span v-if="equipmentView==='showcase'">UID {{ character.showcase.uid }} · {{ new Date(character.showcase.fetchedAt).toLocaleDateString() }}</span></div>
        <p v-if="equipmentView==='showcase'" class="snapshot-note">以下为公开展柜快照，独立于本地实物库存。切换“本地配装”后可配置库存装备。</p>
        <CharacterStats :character="character" :showcase="equipmentView === 'showcase'" />
        <div class="equipment-list"><article v-for="slot in accountSlots" :key="slot"><h3>{{ accountSlotLabels[slot] }}</h3><ArtifactSummary v-if="equipmentItem(slot)" :item="equipmentItem(slot)!" compact /><p v-else>未装备</p><div v-if="equipmentView === 'local'" class="equipment-actions"><button @click="equipmentSlot = slot; modal = 'equipment'">{{ character.equipment[slot] ? '更换' : '装备' }}{{ accountSlotLabels[slot] }}</button><button v-if="character.equipment[slot]" @click="delete character.equipment[slot]">卸下</button></div></article></div>
        <WorkbenchDialog v-if="modal === 'equipment'" :title="`选择${accountSlotLabels[equipmentSlot]}`" @close="modal = ''"><p>为 {{ character.name }} 选择装备；替换的原装备保留在库存。</p><div v-if="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])"><h3>当前装备</h3><ArtifactSummary :item="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])!" compact /></div><h3>库存候选</h3><ArtifactBrowser pick :slot="equipmentSlot" :compare-to="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])" @select="artifactId = $event.id; equip(); modal = ''" /></WorkbenchDialog>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
      </div>
      <p v-else class="account-empty">{{ account.characters.length ? '选择一张角色卡片，查看配装与实际装备。' : '还没有角色资料。添加自己的角色后，设置实际等级、武器并从库存装备圣遗物。莫娜圣遗物文件不包含完整角色资料。' }}</p>
      </div></div>
    </template>
    <template v-else>
      <div class="account-toolbar"><button class="ui-action soft" data-accent="electro" @click="modal = 'import'">导入莫娜圣遗物</button><button class="ui-action" data-accent="anemo" @click="modal = 'artifact'">手动添加圣遗物</button><button v-if="account.artifacts.some(item => item.mona?.setIdentityPending)" :disabled="checkingSets" @click="inspectSets">核对已导入套装</button><span>先预览，再确认；保留每件实物与原始词条。</span></div>
      <WorkbenchDialog v-if="modal === 'repair' && repairPreview" title="核对已导入套装" @close="modal = ''"><p>根据莫娜 7.2.02 核实套装身份，仅补全未经手动修改的物品，不改变词条或穿戴关系。</p><p v-for="update in repairPreview.updates" :key="update.item.id">{{ update.item.mona?.sourceSetName }} → {{ update.item.name }}</p><p v-for="message in repairPreview.skipped" :key="message">{{ message }}</p><p v-if="!repairPreview.updates.length">没有可以直接补全的物品。</p><button :disabled="!repairPreview.updates.length" @click="repairSets">确认补全 {{ repairPreview.updates.length }} 件套装身份</button></WorkbenchDialog>
      <ArtifactBrowser />

      <WorkbenchDialog v-if="modal === 'artifact'" title="手动添加圣遗物" @close="modal = ''"><ArtifactForm @close="modal = ''" /></WorkbenchDialog>
    </template>
    <WorkbenchDialog v-if="modal === 'network'" title="从 Enka 展柜导入" @close="modal = ''"><EnkaImport @imported="showImportedCharacter" @close="modal = ''" /></WorkbenchDialog>
    <WorkbenchDialog v-if="modal === 'import'" :title="props.page==='characters' ? '从莫娜 JSON 添加角色' : '导入莫娜圣遗物'" @close="modal = ''"><MonaImport automatic @imported="modal = props.page==='characters' && noteNames.length ? 'notes' : ''" /><div v-if="props.page==='characters' && noteNames.length" class="existing-note-import"><p>当前库存已有 {{ noteNames.length }} 个穿戴备注，可整理为待补全角色。</p><button class="ui-action soft" data-accent="electro" @click="modal = 'notes'">从穿戴备注整理角色</button></div></WorkbenchDialog>
  </section>
</template>

<style scoped>
.character-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; margin:20px 0; }.character-cards button { display:grid; gap:10px; text-align:left; padding:18px; border:1px solid var(--line); border-radius:10px; background:var(--surface); }.character-cards .selected { border-color:var(--element-anemo-deep); box-shadow:0 0 0 2px #46675c33; }.character-avatar { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; color:#fff5d3; background:var(--element-anemo-deep); font-size:24px; }.character-cards small { color:var(--muted); }.account-empty { padding:40px 20px; border:1px dashed var(--line); border-radius:12px; text-align:center; }.legacy-inventory { margin-top:24px; }.account-library { margin: 0 30px; color: var(--text, var(--ink)); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size: 12px; line-height: 1.8; }
label { font-size: 12px; display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }
.account-editor { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; margin-top: 20px; }
.equipment-list, .account-copy, .transfer-confirm, .account-real-panel, details { grid-column: 1/-1; }.equipment-list > div { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 12px; }
.account-copy { border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 12px; }
.account-note { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:0 0 16px; }.account-note strong { font-size:14px; }.account-note span { color:var(--muted); }.account-error { color: var(--element-pyro-deep); }.transfer-confirm { border: 1px solid #ad8b4b; padding: 16px; }.transfer-confirm button { margin-right: 12px; }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size: 11px; overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
.character-workspace { display:grid; grid-template-columns:240px minmax(0,1fr); gap:24px; align-items:start; }.character-workspace aside { position:sticky; top:16px; max-height:calc(100vh - 180px); overflow:auto; }.character-cards { grid-template-columns:1fr; gap:8px; margin:0; }.character-cards button { color:var(--ink); padding:12px; grid-template-columns:36px 1fr; gap:6px 10px; }.character-avatar { width:36px; height:36px; font-size:20px; grid-row:span 3; }.character-cards small { grid-column:2; }.account-editor { display:block; margin:0; }.detail-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; }h2 { margin:0; font-size:20px; }.equipment-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }.equipment-list article { border:1px solid var(--line); padding:14px; border-radius:10px; background:var(--surface); }h3 { font-size:13px; margin:0 0 14px; }.equipment-actions { display:flex; gap:8px; margin-top:12px; }.account-library { margin-inline:0; }
@media(max-width:800px) { .character-workspace { grid-template-columns:1fr; }.character-workspace aside { position:static; max-height:240px; }.character-cards { grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); } }
.character-identity { display:flex; align-items:center; gap:16px; }.detail-kicker { font-size:11px; color:var(--muted); letter-spacing:.12em; }h2 { margin-top:7px; }.character-build-summary { display:flex; align-items:center; gap:16px; border-bottom:1px solid var(--line); padding:12px 0; }.character-build-summary p { margin:4px 0; }.character-cards button { grid-template-columns:48px minmax(0,1fr); border-color:transparent; background:transparent; }.character-cards button:hover { background:var(--element-anemo-light); }.character-cards .selected { background:#fffdf6; border-color:var(--element-anemo-primary); box-shadow:0 3px 12px #34483c0c; }.character-workspace aside { background:var(--element-anemo-light); border:1px solid var(--line); padding:10px; border-radius:14px; }.character-avatar { grid-row:span 3; }.equipment-list article { background:linear-gradient(145deg,var(--surface),var(--surface-subtle)); box-shadow:0 2px 7px #283e3006; }.detail-heading { padding-bottom:16px; }.equipment-actions button { padding:8px 10px; font-size:12px; }.equipment-actions button:last-child:not(:first-child) { background:transparent; color:var(--muted); border-color:var(--line); }.account-note { padding-bottom:16px; border-bottom:1px solid var(--line); }.character-detail { min-width:0; }
.account-toolbar > button:last-child:not(:first-child) { background:var(--surface); color:var(--muted); border-color:var(--line); }.account-library > [role=status] { color:#61755d; font-size:12px; padding:8px 12px; background:#eef3e8; border-radius:8px; margin-top:0; }.character-cards strong { align-self:end; }.character-cards small { line-height:1.5; }
.account-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:32px; margin-bottom:18px; }.account-heading-info { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }.account-name { display:flex; align-items:center; gap:8px; padding:0; border:0; min-height:28px; color:var(--ink); background:transparent; font-size:14px; font-weight:600; }.account-name svg { width:18px; height:18px; stroke:var(--muted); stroke-width:1.6; fill:none; }.account-count { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--muted); }.account-count > span { opacity:.5; }.account-feedback { position:relative; flex-shrink:0; font-size:12px; }.account-feedback > summary,.local-status { display:flex; align-items:center; gap:6px; color:var(--element-anemo-deep); cursor:pointer; list-style:none; font-size:12px; }.account-feedback summary::-webkit-details-marker { display:none; }.account-feedback summary > span { margin-left:5px; color:var(--muted); font-size:11px; }.account-feedback i,.local-status i { width:6px; height:6px; border-radius:50%; background:var(--element-anemo-primary); }.account-feedback > div { position:absolute; top:28px; right:0; width:min(320px,70vw); padding:14px; background:var(--surface-raised); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px #283a3614; z-index:5; }.account-feedback p { margin:0 0 10px; }.account-feedback button { font-size:12px; padding:6px 8px; margin-right:8px; }.character-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }.character-search { position:relative; flex:1; min-width:170px; max-width:320px; }.character-search > svg { position:absolute; width:16px; height:16px; top:12px; left:12px; stroke:var(--muted); stroke-width:1.6; fill:none; }.character-search input { height:40px; min-width:0; padding:9px 12px 9px 36px; background:var(--surface-raised); border-color:var(--line); font-size:13px; }.filter-trigger { height:40px; font-size:12px; padding:8px 12px; }.filter-trigger.applied { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.filter-trigger > span { padding-left:6px; }.character-import-actions { margin-left:auto; display:flex; gap:8px; }.character-filter-summary { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-height:22px; margin:10px 0 16px; font-size:11px; color:var(--muted); }.filter-chip { display:flex; align-items:center; gap:6px; padding:3px 7px; border-radius:5px; background:var(--element-anemo-light); color:var(--element-anemo-deep); }.filter-chip button,.reset-filters { padding:0; border:0; background:none; color:inherit; font-size:12px; min-height:16px; }.reset-filters { padding:3px 7px; color:var(--muted); }.character-filter-panel h3 { margin:20px 0 10px; font-size:13px; }.character-filter-panel h3:first-child { margin-top:0; }.filter-options { display:flex; flex-wrap:wrap; gap:8px; }.filter-options button { --filter-light:var(--element-anemo-light); --filter-deep:var(--element-anemo-deep); color:var(--muted); background:var(--surface); border-color:var(--line); padding:9px 15px; font-size:13px; }.filter-options button.selected { background:var(--filter-light); color:var(--filter-deep); border-color:var(--filter-deep); }.filter-panel-actions { display:flex; justify-content:space-between; margin-top:24px; }.existing-note-import { border-top:1px solid var(--line); margin-top:16px; padding-top:12px; }.equipment-view-tabs { display:flex; gap:8px; align-items:center; margin-top:16px; }.equipment-view-tabs button { color:var(--muted); background:var(--surface); border-color:var(--line); padding:7px 12px; font-size:12px; }.equipment-view-tabs button.active { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }.equipment-view-tabs span { color:var(--muted); font-size:11px; }.snapshot-note { color:var(--element-hydro-deep); }
@media(max-width:1000px){.character-import-actions { width:100%; margin-left:0; }.character-search { max-width:none; }}@media(max-width:550px){.account-heading { align-items:flex-start; }.account-heading-info { gap:3px; flex-direction:column; align-items:flex-start; }.account-feedback > summary > span { display:none; }.character-import-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }.character-import-actions .ui-action { padding:8px 6px; font-size:12px; gap:5px; }.character-import-actions svg { width:14px; height:14px; }.equipment-view-tabs { flex-wrap:wrap; }}
</style>
