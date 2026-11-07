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
import CharacterCardPortraits from './components/CharacterCardPortraits.vue';
import ArtifactSummary from './ArtifactSummary.vue';
import GameIcon from './components/GameIcon.vue';
import { releaseMetadata, compareReleaseNewest } from './domain/catalog-release';
const EnkaImport = defineAsyncComponent(() => import('./EnkaImport.vue'));
const MonaImport = defineAsyncComponent(() => import('./MonaImport.vue'));

const props = defineProps<{ page: 'characters' | 'artifacts' }>();
const emit = defineEmits<{ settings:[] }>();
const store = useAccountStore();
const { account, error, notice } = storeToRefs(store);
const { selectedCharacterId: characterId, characterQuery: query, characterElement:elementFilter, characterWeapon:weaponFilter, characterProfile:profileFilter, characterEquipment:equipmentFilter, characterRarity:rarityFilter, characterSort:sort } = storeToRefs(store);
const character = computed(() => account.value.characters.find(entry => entry.id === characterId.value));
const artifactId = ref('');
const equipmentSlot = ref<AccountSlot>('flower');
const editingCharacter = ref(false);
const detailOpen = ref(false);
const panelOpen=ref(false);
const detailMode=ref<'view'|'equipment'>('view');
function openCharacter(id:string) { equipmentView.value='local'; characterId.value=id; detailOpen.value=true;detailMode.value='view';panelOpen.value=false; }
function closeCharacter() { detailOpen.value=false; detailMode.value='view'; pending.value=undefined; }
watch([()=>account.value.id,()=>props.page],()=>{detailOpen.value=false;modal.value='';pending.value=undefined;});
const modal = ref<'import' | 'create' | 'equipment' | 'notes' | 'artifact' | 'repair' | 'network' | 'filters' | 'sort' | ''>('');
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
const sortOptions = [{id:'release',name:'实装版本从新到旧'},{id:'name',name:'名称'},{id:'level',name:'等级从高到低'},{id:'constellation',name:'命座从高到低'},{id:'equipment',name:'本地装备数量'}];
const metadata = (entry: typeof account.value.characters[number]) => entry.realBuild?.character ?? catalog.value?.characters.find(item => item.name === entry.name);
const characterRelease = (entry: typeof account.value.characters[number]) => releaseMetadata('characters',entry.realBuild?.character.id,entry.name);
const visibleCharacters = computed(() => {
  const items = account.value.characters.filter(entry => {
    const meta=metadata(entry), count=Object.values(entry.equipment).length;
    return entry.name.includes(query.value.trim()) && (!elementFilter.value.length || (meta && elementFilter.value.includes(meta.element)))
      && (!rarityFilter.value.length || rarityFilter.value.includes(String(characterRelease(entry)?.rarity)))
      && (!weaponFilter.value.length || (meta && weaponFilter.value.includes(meta.weaponType)))
      && (!profileFilter.value.length || profileFilter.value.includes(entry.realBuild ? 'ready' : 'pending'))
      && (!equipmentFilter.value.length || equipmentFilter.value.includes(count===5 ? 'full' : count>0 ? 'partial' : 'empty'));
  });
  return items.sort((a,b) => (sort.value==='release' ? compareReleaseNewest(characterRelease(a),characterRelease(b)) : sort.value==='level' ? (b.realBuild?.level??-1)-(a.realBuild?.level??-1) : sort.value==='constellation' ? (b.realBuild?.constellation??-1)-(a.realBuild?.constellation??-1) : sort.value==='equipment' ? Object.keys(b.equipment).length-Object.keys(a.equipment).length : 0) || a.name.localeCompare(b.name,'zh-CN'));
});
const activeFilters = computed(() => elementFilter.value.length + weaponFilter.value.length + profileFilter.value.length + equipmentFilter.value.length + rarityFilter.value.length);
function toggleFilter(selected: string[], id: string) { const index = selected.indexOf(id); if (index < 0) selected.push(id); else selected.splice(index, 1); }
function resetFilters() { elementFilter.value=[]; weaponFilter.value=[]; profileFilter.value=[]; equipmentFilter.value=[]; rarityFilter.value=[]; }
const filterGroups = computed(() => [
  { id:'elements', title:'元素', options:elementPalette.map(item => ({id:item.id,name:item.name})), selected:elementFilter.value },
  { id:'rarity', title:'星级', options:[{id:'4',name:'四星'},{id:'5',name:'五星'}], selected:rarityFilter.value },
  { id:'weapons', title:'武器类型', options:weapons, selected:weaponFilter.value },
  { id:'profiles', title:'培养资料', options:profileOptions, selected:profileFilter.value },
  { id:'equipment', title:'本地配装', options:equipmentOptions, selected:equipmentFilter.value },
]);
const equipmentView=ref<'local'|'showcase'>('local');
watch(()=>character.value?.id,() => { equipmentView.value='local'; },{immediate:true});
function showImportedCharacter(id:string) { query.value='';resetFilters();characterId.value=id;equipmentView.value='local';modal.value='';detailMode.value='view';panelOpen.value=false;detailOpen.value=true; }
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
      <div class="character-toolbar"><div class="character-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input v-model="query" aria-label="搜索账号角色" placeholder="查找角色"></div><button class="filter-trigger ui-muted-button" :class="{ applied:activeFilters }" @click="modal = 'filters'">筛选<span v-if="activeFilters">{{ activeFilters }}</span></button><button class="filter-trigger ui-muted-button" :class="{ applied:sort!=='release' }" @click="modal = 'sort'">排序</button><div class="character-import-actions"><button class="ui-action soft" data-accent="hydro" @click="modal = 'network'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a17 17 0 0 1 0 16 17 17 0 0 1 0-16Z"/></svg>网络导入</button><button class="ui-action soft" data-accent="electro" @click="modal = 'import'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H6V3ZM12 9v8m-3-3 3 3 3-3"/></svg>莫娜 JSON</button><button class="ui-action" data-accent="anemo" aria-label="手动添加" @click="editingCharacter = false; modal = 'create'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>手动添加</button></div></div>
      <div class="element-shortcuts" role="group" aria-label="按元素筛选">
        <button :aria-pressed="!elementFilter.length" @click="elementFilter = []">全部</button>
        <button v-for="element in elementPalette" :key="element.id" :aria-label="`${element.name}元素`" :aria-pressed="elementFilter.includes(element.id)" :style="{ '--filter-light':element.light,'--filter-deep':element.deep }" @click="toggleFilter(elementFilter, element.id)"><GameIcon kind="elements" :id="element.id" :size="24" /><span>{{ element.name }}</span></button>
        <button v-if="activeFilters" class="reset-filters" @click="resetFilters">清除筛选</button>
      </div>
      <WorkbenchDialog v-if="modal === 'filters'" title="筛选角色" @close="modal = ''"><div class="character-filter-panel">
        <section v-for="group in filterGroups" :key="group.id" :aria-label="group.title"><h3>{{ group.title }}</h3><div class="filter-options">
          <button :aria-pressed="!group.selected.length" :class="{selected:!group.selected.length}" @click="group.selected.splice(0)">全部</button>
          <button v-for="item in group.options" :key="item.id" :aria-pressed="group.selected.includes(item.id)" :class="{selected:group.selected.includes(item.id)}" @click="toggleFilter(group.selected,item.id)"><GameIcon v-if="group.id==='elements'" kind="elements" :id="item.id" :size="24" />{{ item.name }}</button>
        </div></section>
        <div class="filter-panel-actions"><button class="ui-muted-button" @click="resetFilters">重置筛选</button><button class="ui-action" data-accent="anemo" @click="modal = ''">完成</button></div>
      </div></WorkbenchDialog>
      <WorkbenchDialog v-if="modal === 'sort'" title="角色排序" @close="modal = ''"><div class="filter-options"><button v-for="item in sortOptions" :key="item.id" :aria-pressed="sort===item.id" :class="{selected:sort===item.id}" @click="sort=item.id;modal=''">{{ item.name }}</button></div></WorkbenchDialog>

      <WorkbenchDialog v-if="modal === 'notes'" title="从穿戴备注整理角色" @close="modal = ''"><p>文件中有 {{ noteNames.length }} 个角色穿戴备注：{{ noteNames.join('、') }}。</p><p>仅新增尚不存在的角色资料，并按没有冲突的原始备注登记装备。已有角色与装备不覆盖；武器、命座、等级和天赋不来自此文件，角色需继续补全后才能计算。</p><button @click="organizeNotes">确认按备注整理</button></WorkbenchDialog>
      <div class="character-cards">
        <button v-for="entry in visibleCharacters" :key="entry.id" class="character-card" :class="{ selected: characterId === entry.id }" :aria-label="`查看${entry.name}详情`" @click="openCharacter(entry.id)">
          <span class="character-card-header"><strong>{{ entry.name }}</strong><span class="character-card-status"><span class="character-card-state" :class="{pending:!entry.realBuild,showcase:entry.showcase && !Object.keys(entry.equipment).length}">{{ !entry.realBuild ? '待补全' : entry.showcase && !Object.keys(entry.equipment).length ? '展柜' : `配装 ${Object.keys(entry.equipment).length}/5` }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v14h14v-3M13 5h6v6m0-6-9 9"/></svg></span></span>
          <CharacterCardPortraits :build="entry.realBuild" :name="entry.name" />
        </button>
      </div>
      <p v-if="!visibleCharacters.length" class="account-empty">{{ account.characters.length ? '没有符合条件的角色，请调整搜索或筛选。' : '还没有角色。使用上方的网络导入、莫娜 JSON 或手动添加建立自己的角色资料。' }}</p>
      <WorkbenchDialog v-if="modal === 'create'" :title="editingCharacter ? '编辑角色资料' : '添加账号角色'" @close="modal = ''"><CharacterForm :character="editingCharacter ? character : undefined" @saved="openCharacter($event)" @close="modal = ''" /></WorkbenchDialog>
      <WorkbenchDialog class="character-detail-dialog" v-if="detailOpen && character" :title="character.name" @close="closeCharacter">
      <template #header-leading><div class="equipment-view-tabs"><button data-view="local" :aria-pressed="equipmentView==='local'" :class="{active:equipmentView==='local'}" @click="equipmentView = 'local'">本地配装</button><button v-if="character.showcase" data-view="showcase" :aria-pressed="equipmentView==='showcase'" :class="{active:equipmentView==='showcase'}" @click="equipmentView = 'showcase'">展柜快照</button></div></template>
      <div class="account-editor">
        <div v-if="error" class="account-error" role="alert">{{ localDataErrorLabel(error) }}</div>

        <CharacterForm details :key="`${character.id}-${equipmentView}`" :character="character" :showcase="equipmentView === 'showcase'" @saved="characterId = $event; equipmentView = 'local'" />
        <section class="detail-panel"><div class="inline-section-heading"><h3>角色面板</h3><button class="ui-muted-button" :aria-expanded="panelOpen" @click="panelOpen = !panelOpen">{{ panelOpen ? '收起面板' : '展开面板' }}</button></div><CharacterStats v-if="panelOpen" :character="character" :showcase="equipmentView === 'showcase'" /></section>
        <section class="detail-artifacts"><div class="inline-section-heading"><h3>圣遗物</h3><button v-if="detailMode==='equipment'" @click="detailMode = 'view'">返回角色配装</button></div>
        <section v-if="detailMode==='equipment'" class="inline-equipment"><h3>选择{{ accountSlotLabels[equipmentSlot] }}</h3><ArtifactBrowser inline pick :slot="equipmentSlot" :compare-to="account.artifacts.find(item => item.id === character?.equipment[equipmentSlot])" @select="artifactId = $event.id; equip(); detailMode = 'view'" /></section>
        <div v-else class="equipment-list"><article v-for="slot in accountSlots" :key="slot" class="artifact-item-card" :data-rarity="equipmentItem(slot)?.real?.rarity" :data-density="store.inventoryDensity"><ArtifactSummary v-if="equipmentItem(slot)" :item="equipmentItem(slot)!" :variant="store.inventoryDensity" :wearers="equipmentView==='showcase' ? [{name:character.name,id:character.realBuild?.character.id,label:'展柜快照'}] : undefined" /><p v-else>{{ accountSlotLabels[slot] }} · 未装备</p><div v-if="equipmentView === 'local'" class="equipment-actions"><button :aria-label="`${character.equipment[slot] ? '更换' : '装备'}${accountSlotLabels[slot]}`" @click="equipmentSlot = slot; detailMode = 'equipment'">{{ character.equipment[slot] ? '更换' : '装备' }}</button><button v-if="character.equipment[slot]" @click="delete character.equipment[slot]">卸下</button></div></article></div>
        </section>
        <div v-if="pending" class="transfer-confirm" role="alert"><p>{{ pending.message }}</p><button @click="confirmTransfer">确认转移装备</button><button @click="pending = undefined">取消转移</button></div>
      </div>
      </WorkbenchDialog>
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
.account-library .character-detail-dialog { overflow-y:auto; scrollbar-gutter:stable both-edges; width:min(1000px,calc(100vw - 32px)); }
.inline-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:16px 0; }.inline-section-heading h3 { margin:0; }
.character-card-header { position:relative; display:grid; grid-template-columns:minmax(0,1fr) 104px minmax(0,1fr); align-items:center; gap:4px; width:100%; }.character-card-header > strong { grid-column:2; text-align:center; }.character-card-status { grid-column:3; justify-self:end; }.character-card-header > strong { font-size:16px; line-height:22px; }.character-card-status { display:flex; align-items:center; gap:6px; flex-shrink:0; }.character-card-status svg { width:16px; height:16px; fill:none; stroke:var(--muted); stroke-width:1.6; }
.detail-panel { margin-top:16px; }.detail-panel :deep(.character-stats) { margin:0; padding:12px; border:1px solid var(--line); border-radius:10px; }.detail-panel :deep(.character-stats h3) { display:none; }.detail-artifacts { margin-top:18px; }
.character-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(308px,1fr)); gap:12px; margin:0; }
.character-cards .character-card { display:flex; flex-direction:column; align-items:flex-start; gap:6px; min-width:0; padding:10px 12px 12px; color:var(--ink); text-align:left; border:1px solid var(--line); border-radius:16px; background:var(--surface-raised); box-shadow:0 2px 8px #283a3605; transition:border-color .15s,box-shadow .15s,transform .15s; }
.character-cards .character-card:hover { transform:translateY(-2px); border-color:var(--element-anemo-primary); box-shadow:0 8px 24px #283a3610; }




.character-card-state { padding:1px 5px; font-size:11px; line-height:18px; border-radius:4px; background:var(--element-hydro-light); color:var(--element-hydro-deep); }
.character-card-state.showcase { background:var(--element-electro-light); color:var(--element-electro-deep); }.character-card-state.pending { background:var(--element-geo-light); color:var(--element-geo-deep); }
@media(prefers-reduced-motion:reduce){.character-cards .character-card { transition:none; }.character-cards .character-card:hover { transform:none; }}
@media(max-width:550px){.character-cards { grid-template-columns:minmax(0,1fr); }.character-cards .character-card { padding:10px 12px 12px; }}

.account-empty { padding:40px 20px; border:1px dashed var(--line); border-radius:12px; text-align:center; }.legacy-inventory { margin-top:24px; }.account-library { margin: 0 30px; color: var(--text, var(--ink)); }
.account-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.account-toolbar label { min-width: 160px; }.account-toolbar span, p { font-size: 12px; line-height: 1.8; }
label { font-size: 12px; display: grid; gap: 7px; } input, select { min-width: 0; width: 100%; box-sizing: border-box; }

.equipment-list, .account-copy, .transfer-confirm, .account-real-panel, details { grid-column: 1/-1; }.equipment-list > div { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 12px; }
.account-copy { border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 12px; }
.account-note { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:0 0 16px; }.account-note strong { font-size:14px; }.account-note span { color:var(--muted); }.account-error { color: var(--element-pyro-deep); }.transfer-confirm { border: 1px solid #ad8b4b; padding: 16px; }.transfer-confirm button { margin-right: 12px; }
.hidden-file { display: none; }.account-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin-top: 18px; }.account-inventory article { border: 1px solid var(--line); border-radius: 6px; padding: 16px; display: grid; gap: 12px; } details { font-size: 11px; overflow-wrap: anywhere; }
@media(max-width:700px) { .account-library { margin-inline:15px; }.account-editor { grid-template-columns:minmax(0,1fr); } }
.account-editor { display:block; margin:0; }h2 { margin:0; font-size:20px; }.equipment-list { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }.equipment-list article { grid-column:span 2; }h3 { font-size:13px; margin:0 0 14px; }.equipment-actions { display:flex; gap:8px; margin-top:12px; }.account-library { margin-inline:0; }
@media(max-width:800px) {  }
h2 { margin-top:7px; }.equipment-actions button { padding:8px 10px; font-size:12px; }.equipment-actions button:last-child:not(:first-child) { background:transparent; color:var(--muted); border-color:var(--line); }.account-note { padding-bottom:16px; border-bottom:1px solid var(--line); }
.account-toolbar > button:last-child:not(:first-child) { background:var(--surface); color:var(--muted); border-color:var(--line); }.account-library > [role=status] { color:#61755d; font-size:12px; padding:8px 12px; background:#eef3e8; border-radius:8px; margin-top:0; }
.account-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:32px; margin-bottom:18px; }.account-heading-info { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }.account-name { display:flex; align-items:center; gap:8px; padding:0; border:0; min-height:28px; color:var(--ink); background:transparent; font-size:14px; font-weight:600; }.account-name svg { width:18px; height:18px; stroke:var(--muted); stroke-width:1.6; fill:none; }.account-count { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--muted); }.account-count > span { opacity:.5; }.account-feedback { position:relative; flex-shrink:0; font-size:12px; }.account-feedback > summary,.local-status { display:flex; align-items:center; gap:6px; color:var(--element-anemo-deep); cursor:pointer; list-style:none; font-size:12px; }.account-feedback summary::-webkit-details-marker { display:none; }.account-feedback summary > span { margin-left:5px; color:var(--muted); font-size:11px; }.account-feedback i,.local-status i { width:6px; height:6px; border-radius:50%; background:var(--element-anemo-primary); }.account-feedback > div { position:absolute; top:28px; right:0; width:min(320px,70vw); padding:14px; background:var(--surface-raised); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px #283a3614; z-index:5; }.account-feedback p { margin:0 0 10px; }.account-feedback button { font-size:12px; padding:6px 8px; margin-right:8px; }.character-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }.character-search { position:relative; flex:1; min-width:170px; max-width:320px; }.character-search > svg { position:absolute; width:16px; height:16px; top:12px; left:12px; stroke:var(--muted); stroke-width:1.6; fill:none; }.character-search input { height:40px; min-width:0; padding:9px 12px 9px 36px; background:var(--surface-raised); border-color:var(--line); font-size:13px; }.filter-trigger { height:40px; font-size:12px; padding:8px 12px; }.filter-trigger.applied { color:var(--element-anemo-deep); border-color:var(--element-anemo-primary); background:var(--element-anemo-light); }.filter-trigger > span { padding-left:6px; }.character-import-actions { margin-left:auto; display:flex; gap:8px; }.reset-filters { padding:0; border:0; background:none; color:inherit; font-size:12px; min-height:16px; }.reset-filters { padding:3px 7px; color:var(--muted); }.character-filter-panel h3 { margin:20px 0 10px; font-size:13px; }.character-filter-panel h3:first-child { margin-top:0; }.filter-options { display:flex; flex-wrap:wrap; gap:8px; }.filter-options button { --filter-light:var(--element-anemo-light); --filter-deep:var(--element-anemo-deep); color:var(--muted); background:var(--surface); border-color:var(--line); padding:9px 15px; font-size:13px; }.filter-options button.selected { background:var(--filter-light); color:var(--filter-deep); border-color:var(--filter-deep); }.filter-panel-actions { display:flex; justify-content:space-between; margin-top:24px; }.existing-note-import { border-top:1px solid var(--line); margin-top:16px; padding-top:12px; }.equipment-view-tabs { display:flex; gap:8px; align-items:center; margin-top:16px; }.equipment-view-tabs button { color:var(--muted); background:var(--surface); border-color:var(--line); padding:7px 12px; font-size:12px; }.equipment-view-tabs button.active { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }.equipment-view-tabs span { color:var(--muted); font-size:11px; }.snapshot-note { color:var(--element-hydro-deep); }
.equipment-list article:nth-child(4) { grid-column:2/span 2; }.equipment-list article:nth-child(5) { grid-column:4/span 2; }@media(max-width:900px){.equipment-list { grid-template-columns:repeat(2,minmax(0,1fr)); }.equipment-list article,.equipment-list article:nth-child(4),.equipment-list article:nth-child(5) { grid-column:auto; }}@media(max-width:620px){.equipment-list { grid-template-columns:minmax(0,1fr); }}
@media(max-width:1000px){.character-import-actions { width:100%; margin-left:0; }.character-search { max-width:none; }}@media(max-width:550px){.account-heading { align-items:flex-start; }.account-heading-info { gap:3px; flex-direction:column; align-items:flex-start; }.account-feedback > summary > span { display:none; }.character-import-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }.character-import-actions .ui-action { padding:8px 6px; font-size:12px; gap:5px; }.character-import-actions svg { width:14px; height:14px; }.equipment-view-tabs { flex-wrap:wrap; }}
.element-shortcuts { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:10px 0 14px; }
.element-shortcuts > button { display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:4px 8px; min-height:34px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--muted); font-size:13px; }
.element-shortcuts > button[aria-pressed=true] { background:var(--filter-light,var(--element-anemo-light)); color:var(--filter-deep,var(--element-anemo-deep)); border-color:currentColor; }
.filter-options button { display:inline-flex; align-items:center; gap:6px; }
.character-filter-panel section + section { margin-top:20px; }
@media(max-width:550px) { .element-shortcuts { gap:4px; }.element-shortcuts > button { padding:4px 6px; } }
.character-detail-dialog :deep(header) { display:grid; grid-template-columns:1fr auto 1fr; padding:12px 20px; }
.character-detail-dialog :deep(header h2) { grid-column:2; grid-row:1; text-align:center; font-size:24px; }
.character-detail-dialog :deep(header > button) { grid-column:3; grid-row:1; justify-self:end; color:var(--element-pyro-deep); background:var(--element-pyro-light); border-color:transparent; font-size:15px; }
.character-detail-dialog :deep(.dialog-content) { padding:16px 20px 20px; font-size:16px; }
.character-detail-dialog .equipment-view-tabs { grid-column:1; grid-row:1; justify-content:flex-start; margin:0; gap:8px; }
.character-detail-dialog .equipment-view-tabs button { font-size:15px; padding:7px 12px; }
.character-detail-dialog .equipment-view-tabs button[data-view=local].active { color:var(--element-hydro-deep); background:var(--element-hydro-light); border-color:var(--element-hydro-primary); }
.character-detail-dialog .equipment-view-tabs button[data-view=showcase].active { color:var(--element-electro-deep); background:var(--element-electro-light); border-color:var(--element-electro-primary); }
.character-detail-dialog .detail-panel,.character-detail-dialog .detail-artifacts { padding:0; background:transparent; margin-top:14px; }.character-detail-dialog .inline-section-heading { margin:8px 0 12px; padding-bottom:10px; border-bottom:1px solid var(--line); }
.character-detail-dialog .inline-section-heading h3 { font-size:16px; font-weight:700; }
.character-detail-dialog .inline-section-heading button { font-size:15px; }

@media(max-width:550px) { .character-detail-dialog .equipment-view-tabs { grid-column:1/-1; grid-row:2; }.character-detail-dialog :deep(header) { row-gap:10px; }.character-card-header { grid-template-columns:minmax(0,1fr) 96px minmax(0,1fr); }.character-detail-dialog :deep(.dialog-content) { padding:12px; }.character-detail-dialog :deep(header) { padding:12px; }.character-detail-dialog :deep(header > button) { padding:6px; } }
</style>
