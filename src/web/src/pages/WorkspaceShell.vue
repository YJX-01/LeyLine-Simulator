<script setup lang="ts">
import LibraryNavIcon from '../components/LibraryNavIcon.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import { artifactReferenceNavigation, useArtifactReferenceNavigation } from '../composables/artifact-reference-navigation';
import type { ArtifactReferenceTarget } from '../domain/artifact-references';
import { computed, ref, defineAsyncComponent, onMounted, onBeforeUnmount, nextTick, watch, provide, shallowRef, type Component } from 'vue';
const ThirdPartyCredits = defineAsyncComponent(() => import('./ThirdPartyCredits.vue'));
const creditsOpen = ref(false);
function focusMainContent() { document.getElementById('workspace-main')?.focus(); }
const ThemePalette = defineAsyncComponent(() => import('./ThemePalette.vue'));
const AccountSettings = defineAsyncComponent(() => import('./AccountSettings.vue'));
const teamWorkspace=ref<{requestLeave:(action:()=>void)=>void}>();
const accountLibrary = ref<{ requestLeave: (action:()=>void)=>void }>();
const AccountConfigurations=defineAsyncComponent(()=>import('./AccountConfigurations.vue'));
const configurationEditor=ref<{requestLeave:(action:()=>void)=>void;openConfiguration:(id:string,presetId?:string)=>void}>();
const configurationEditorOpen=ref(false);
const accountConfigurations=ref<{requestLeave:(action:()=>void)=>void}>();
const pendingAccountConfiguration=ref<{characterId:string;presetId:string}>();
const AccountLibrary = defineAsyncComponent(() => import('./AccountLibrary.vue'));
const DamageCalculator = defineAsyncComponent(() => import('./DamageCalculator.vue'));
const calculator = ref<{ requestLeave: (action: () => void) => void }>();
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import { elements } from '@leyline/schema';
import { actorLabel, definitionLabel, recordLabel, effectLabel, projectLabel, realElementLabel, diagnosticLabel, statusLabel, errorLabel } from '../domain/workbench-labels';

import { getActivePinia } from 'pinia';
import type { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { defaultEnemy, removeTimelineRecord, setDamageSelected } from '../domain/axis-input';
import { getDamagePresentation } from '../domain/workbench-display';
const geoEmblem = `${import.meta.env.BASE_URL}assets/game/elements/geo.webp`;

const TimelineEditor = defineAsyncComponent(() => import('./TimelineEditor.vue'));
const TeamWorkspace = defineAsyncComponent(() => import('./TeamWorkspace.vue'));
const TeamLibrary = defineAsyncComponent(() => import('./TeamLibrary.vue'));
const pinia = getActivePinia()!;
const axisStore = shallowRef<ReturnType<typeof useAxisWorkspaceStore>>();
const axisLoadError = ref('');
// These computed fields are consumed inside the loaded axis view.
const project = computed(() => axisStore.value!.project);
const result = computed(() => axisStore.value!.result);
const selectedId = computed({ get: () => axisStore.value!.selectedId, set: id => { axisStore.value!.selectedId = id; } });
type Page = 'characters' | 'artifacts' | 'loadouts' | 'combinations' | 'team' | 'team-library' | 'timeline' | 'analysis' | 'account' | 'settings' | 'calculator';
const page = ref<Page>(window.location.hash === '#axis' ? 'timeline' : 'characters');
const { layers: referenceLayers, follow, back: closeReference, clear: clearReferences } = useArtifactReferenceNavigation();
const ReferenceDetail = shallowRef<Component>();
let referenceRequest = 0;
const visiblePage = computed<Page>(() => {
  const layer = referenceLayers.value.at(-1);
  if (!layer || layer.keepPage) return page.value;
  const kind = layer.target.kind;
  return kind === 'combination' ? 'combinations' : kind === 'configuration' ? 'loadouts' : 'characters';
});
const navPage = computed(() => visiblePage.value === 'team-library' ? 'team' : visiblePage.value);
const collapsed = ref(false);
const mobileOpen = ref(false);
const mobileQuery = window.matchMedia('(max-width: 700px)');
const narrow = ref(mobileQuery.matches);
const sidebarCompact = computed(() => collapsed.value && !narrow.value);
const sidebar = ref<HTMLElement>();
const menuButton = ref<HTMLButtonElement>();
function updateViewport(event: MediaQueryListEvent) { narrow.value = event.matches; mobileOpen.value = false; }
onMounted(() => mobileQuery.addEventListener('change', updateViewport));
onBeforeUnmount(() => mobileQuery.removeEventListener('change', updateViewport));
function closeNavigation() { mobileOpen.value = false; if (narrow.value) nextTick(() => menuButton.value?.focus()); }
function toggleSidebar() { if (narrow.value) closeNavigation(); else collapsed.value = !collapsed.value; }
function toggleNavigation() {
  mobileOpen.value = !mobileOpen.value;
  if (mobileOpen.value) nextTick(() => sidebar.value?.querySelector<HTMLButtonElement>('[aria-current="page"], .nav-group button')?.focus());
}
const targetOpen = ref(false);
function openTarget() { if (!project.value.enemy) axisStore.value!.command(draft => { draft.enemy = defaultEnemy(); }); targetOpen.value = true; }
const fileInput = ref<HTMLInputElement>();
const isAxisPage = computed(() => page.value === 'timeline' || page.value === 'analysis');
const needsAxis = computed(() => isAxisPage.value || page.value === 'team');
watch(page, current => {
  if (needsAxis.value || current === 'calculator') window.scrollTo(0, 0);
}, { flush: 'post' });
watch(page, async () => {
  if (!needsAxis.value || axisStore.value) return;
  try {
    axisLoadError.value = '';
    axisStore.value = (await import('../stores/axis-workspace')).useAxisWorkspaceStore(pinia);
  } catch { axisLoadError.value = '轴项目未能加载，请重新打开该页面。'; }
}, { immediate: true });
const activeDomain = computed(() => ['timeline', 'analysis', 'calculator'].includes(visiblePage.value) ? 'project' : visiblePage.value === 'settings' ? 'settings' : 'account');
const titles: Record<Page, string> = {
  characters: '角色', loadouts: '角色配置', artifacts: '圣遗物', combinations: '圣遗物组合', team: '队伍', 'team-library': '队伍',
  calculator: '伤害计算', analysis: '伤害分析', timeline: '时间轴', account: '账号', settings: '设置',
};
const groups: { title: string; domain: string; items: { id: Page; icon: string }[] }[] = [
  { title: '库', domain: 'account', items: [
    { id: 'characters', icon: 'person' }, { id: 'loadouts', icon: 'equipment' },
    { id: 'artifacts', icon: 'diamond' }, { id: 'combinations', icon: 'pieces' }, { id: 'team', icon: 'team' },
  ] },
  { title: '项目', domain: 'project', items: [
    { id: 'calculator', icon: 'calculator' }, { id: 'analysis', icon: 'chart' }, { id: 'timeline', icon: 'timeline' },
  ] },
];
const icons: Record<string, string> = {
  calculator: 'M5 3h14v18H5Z M8 6h8v4H8Z M8 13h2 M14 13h2 M8 17h2 M14 17h2',
  timeline: 'M3 6h18 M3 12h18 M3 18h18 M7 3v6 M16 9v6 M10 15v6',
  chart: 'M4 3v18h17 M9 17v-5 M14 17V7 M19 17v-8',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3',
  collapse: 'm14 6-6 6 6 6',
};
const sortedRecords = computed(() => [...project.value.timeline].sort((a, b) => a.timeMs - b.timeMs || a.order - b.order || a.id.localeCompare(b.id)));
const damageRecords = computed(() => sortedRecords.value.filter(r => r.kind === 'damage'));
const actions = computed(() => sortedRecords.value.filter(r => r.kind === 'action'));
const recordTimes = computed(() => new Map(project.value.timeline.map(record => [record.id, record.timeMs])));
const axisName = computed({
  get: () => project.value.name ?? '',
  set: (name: string) => { project.value.name = name.trim() ? name : undefined; },
});
const axisMenu = ref<HTMLDetailsElement>();
const selected = computed(() => project.value.timeline.find(r => r.id === selectedId.value));
const selectedResult = computed(() => result.value.points.find(p => p.id === selectedId.value));
const presentation = computed(() => getDamagePresentation(project.value, selectedId.value));
const selectedTarget = computed(() => !project.value.objective.damageIds || project.value.objective.damageIds.includes(selectedId.value));
const num = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '待确认' : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
const realPartsLabels: Record<string,string> = {attack:'攻击力',multiplier:'技能倍率',bonus:'增伤乘区',crit:'暴击乘区',defense:'防御乘区',resistance:'抗性乘区'};
const number = (event: Event) => { const value = (event.target as HTMLInputElement).value; return value.trim() ? Number(value) : NaN; };
async function openReference(target: ArtifactReferenceTarget, keepPage = false) {
  const source = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1);
  const request = ++referenceRequest;
  try {
    if (!ReferenceDetail.value) ReferenceDetail.value = (await import('./ReferenceDetail.vue')).default;
    if (request === referenceRequest && source?.isConnected && source.open) await follow(target, keepPage);
  } catch {
    // The source stays open if the linked editor fails to load.
  }
}
provide(artifactReferenceNavigation, openReference);
function inspectTeamConfiguration(characterId: string, presetId: string) {
  void openReference({ kind: 'configuration', characterId, presetId }, true);
}
function invalidateReferences() {
  referenceRequest++;
  clearReferences(true);
}
function configurationClosed(){configurationEditorOpen.value=false;pendingAccountConfiguration.value=undefined;}
function navigate(target: Page, after?: () => void) {
  const apply = () => {
    referenceRequest++;
    clearReferences();
    creditsOpen.value = false;
    configurationEditorOpen.value = false;
    pendingAccountConfiguration.value = undefined;
    page.value = target;
    mobileOpen.value = false;
    if (after) void nextTick(after);
  };
  if (configurationEditor.value && target !== page.value) configurationEditor.value.requestLeave(apply);
  else if (accountLibrary.value && target !== page.value) accountLibrary.value.requestLeave(apply);
  else if (accountConfigurations.value) accountConfigurations.value.requestLeave(apply);
  else if (teamWorkspace.value && target !== page.value) teamWorkspace.value.requestLeave(apply);
  else if (calculator.value && target !== page.value) calculator.value.requestLeave(apply);
  else apply();
}
function editAccountConfiguration(characterId:string,presetId:string) {pendingAccountConfiguration.value={characterId,presetId};configurationEditorOpen.value=true;}
watch([configurationEditor,pendingAccountConfiguration],([library,pending])=>{if(library && pending){pendingAccountConfiguration.value=undefined;library.openConfiguration(pending.characterId,pending.presetId);}},{flush:'post'});
function focusClickedControl(event: MouseEvent) {
  (event.target as Element).closest<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
function openPoint(id: string) { selectedId.value = id; navigate('timeline'); }
function updateTime(event: Event) { if (selected.value) selected.value.timeMs = number(event); }
function updateDamageSelection(id: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  axisStore.value!.command(draft => setDamageSelected(draft, id, checked));
}
function updateTarget(event: Event) { if (selected.value?.kind === 'damage') updateDamageSelection(selectedId.value, event); }
function closeAxisMenu() {
  if (!axisMenu.value?.open) return;
  axisMenu.value.open = false;
  axisMenu.value.querySelector('summary')?.focus({ preventScroll: true });
}
function newAxis() {
  closeAxisMenu();
  axisStore.value!.createProject();
  navigate('team');
}
function removeRecord(id: string) {
  axisStore.value!.command(draft => removeTimelineRecord(draft, id));
  if (selectedId.value === id) selectedId.value = project.value.timeline[0]?.id ?? '';
}
async function openProject() { if (!await axisStore.value!.openNativeProject()) fileInput.value?.click(); }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await axisStore.value!.inputFile(file);
  input.value = '';
}
</script>

<template>
  <div class="workspace-design" :data-domain="activeDomain" :class="{ compact: sidebarCompact, 'mobile-open': mobileOpen }" @click.capture="focusClickedControl">
    <a class="skip-link" tabindex="0" href="#workspace-main" @click.prevent="focusMainContent">跳至主要内容</a>
    <button v-if="mobileOpen" class="drawer-shade" aria-label="关闭导航遮罩" @click="closeNavigation"></button>
    <nav id="workspace-navigation" ref="sidebar" class="design-sidebar" aria-label="工作台功能导航" :inert="narrow && !mobileOpen" @keydown.esc.prevent="closeNavigation">
      <div class="sidebar-top">
        <button class="sidebar-control sidebar-toggle" :aria-label="narrow ? '关闭导航' : collapsed ? '展开侧栏' : '收起侧栏'" :title="narrow ? '关闭导航' : collapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="narrow ? mobileOpen : !collapsed" aria-controls="workspace-navigation" @click="toggleSidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.collapse" /></svg><span class="nav-label">{{ narrow ? '关闭导航' : collapsed ? '展开侧栏' : '收起侧栏' }}</span></button>
      </div>
      <div class="nav-groups">
        <div v-for="group in groups" :key="group.title" class="nav-group" :data-domain="group.domain">
          <p>{{ group.title }}</p>
          <button v-for="item in group.items" :key="item.id" :class="{ active: navPage === item.id }"
            :aria-current="navPage === item.id ? 'page' : undefined" :aria-label="`导航 ${titles[item.id]}`"
            :data-testid="`workspace-nav-${item.id}`" :title="titles[item.id]" @click="navigate(item.id === 'team' ? 'team-library' : item.id)">
            <LibraryNavIcon v-if="group.domain === 'account'" :kind="item.icon" />
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons[item.icon]" /></svg>
            <span class="nav-label">{{ titles[item.id] }}</span>
          </button>
        </div>
      </div>
      <div class="nav-utilities">
        <button class="sidebar-control" :class="{ active: page === 'account' }" aria-label="导航 账号" data-testid="workspace-nav-account"
          title="账号" :aria-current="page === 'account' ? 'page' : undefined" @click="navigate('account')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21v-2a7 7 0 0 1 14 0v2"/></svg>
          <span class="nav-label">账号</span>
        </button>
        <button class="sidebar-control" :class="{ active: page === 'settings' }" aria-label="导航 设置" title="设置"
          :aria-current="page === 'settings' ? 'page' : undefined" @click="navigate('settings')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.settings" /></svg>
          <span class="nav-label">设置</span>
        </button>
      </div>
    </nav>
    <button v-if="!narrow" class="sidebar-edge-toggle" :aria-label="collapsed ? '展开侧栏（边缘按钮）' : '收起侧栏（边缘按钮）'" :title="collapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!collapsed" aria-controls="workspace-navigation" @click="toggleSidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 7 12l8 7Z" /></svg></button>

    <div id="workspace-main" class="workspace-body" role="main" tabindex="-1" :aria-label="titles[visiblePage]" :inert="narrow && mobileOpen">
      <header v-if="narrow" class="design-topbar">
        <button ref="menuButton" class="mobile-menu" aria-label="打开功能导航" :aria-expanded="mobileOpen"
          aria-controls="workspace-navigation" @click="toggleNavigation">☰</button>
        <span class="mobile-page-label">{{ titles[visiblePage] }}</span>
      </header>
      <h1 class="page-accessible-title">{{ titles[visiblePage] }}</h1>
      <p v-if="needsAxis && !axisStore && axisLoadError" class="axis-load-error" role="alert">{{ axisLoadError }}</p>

      <template v-if="axisStore || !needsAxis">
      <DamageCalculator v-if="page === 'calculator'" ref="calculator" />
      <TeamLibrary v-else-if="page === 'team-library'" ref="teamWorkspace" @inspect="inspectTeamConfiguration" />
      <TeamWorkspace v-else-if="page === 'team'" ref="teamWorkspace" @timeline="navigate('timeline')" @account="navigate('characters')" />

      <section v-else-if="axisStore && isAxisPage" :key="page" class="panel library-page axis-page" :aria-label="titles[page]">
        <LibraryCornerOrnaments />
        <header class="library-page-toolbar">
          <input v-if="page === 'timeline'" v-model="axisName" class="axis-name-input" aria-label="轴名称"
            name="axis-name" autocomplete="off" maxlength="160" placeholder="未命名轴项目">
          <h2 v-else class="axis-name">{{ projectLabel(project) }}</h2>
          <span class="library-page-status">{{ axisStore.dirty ? '未保存' : '已保存' }}</span>
          <span v-if="axisStore.runState === '计算中'" class="library-page-status" role="status">计算中…</span>
          <span v-else-if="axisStore.runState === '已取消'" class="library-page-status" role="status">计算已取消</span>
          <div class="library-page-actions">
            <button v-if="!narrow" class="ui-action soft" :disabled="!axisStore.canUndo" @click="axisStore.undo()">撤销</button>
            <button v-if="!narrow" class="ui-action soft" :disabled="!axisStore.canRedo" @click="axisStore.redo()">重做</button>
            <button v-if="axisStore.runState === '计算中'" class="ui-action soft" @click="axisStore.cancelRun()">取消计算</button>
            <button class="ui-action soft" :disabled="axisStore.busy" @click="openProject">打开轴</button>
            <button class="ui-action" :disabled="axisStore.busy" @click="axisStore.saveProject()">保存轴</button>
            <details ref="axisMenu" class="axis-menu" @keydown.esc.stop="closeAxisMenu">
              <summary>更多</summary>
              <div class="axis-menu-actions">
                <template v-if="narrow">
                  <button class="ui-action soft" data-size="md" :disabled="!axisStore.canUndo" @click="closeAxisMenu(); axisStore.undo()">撤销</button>
                  <button class="ui-action soft" data-size="md" :disabled="!axisStore.canRedo" @click="closeAxisMenu(); axisStore.redo()">重做</button>
                </template>
                <button v-if="page === 'timeline'" class="ui-action soft" data-size="md" :disabled="axisStore.busy" @click="newAxis">新建空轴</button>
                <button class="ui-action soft" data-size="md" @click="closeAxisMenu(); axisStore.run()">重新计算</button>
                <button class="ui-action soft" data-size="md" :disabled="!axisStore.recoveryAvailable" @click="closeAxisMenu(); axisStore.recover()">恢复上次编辑</button>
              </div>
            </details>
          </div>
        </header>
        <input ref="fileInput" type="file" accept=".json,application/json" aria-label="导入轴项目文件" hidden @change="importFile">
        <div v-if="axisStore.error" role="alert" class="shell-error">
          {{ errorLabel(axisStore.error) }}
          <details><summary>技术详情</summary>{{ axisStore.error }}</details>
        </div>

        <div v-if="page === 'timeline'" class="axis-timeline">
          <section class="timeline-main library-section" aria-label="时间轴记录">
            <div class="library-page-toolbar axis-tools">
              <span class="library-page-status">{{ damageRecords.length }} 个伤害点 / {{ actions.length }} 个动作</span>
              <div class="library-page-actions">
                <button v-if="!project.candidate.actors.length" class="ui-action soft" data-size="md" @click="navigate('team')">前往队伍</button>
                <button class="ui-action soft" data-size="md" @click="openTarget">目标条件</button>
              </div>
            </div>
            <WorkbenchDialog v-if="targetOpen && project.enemy" title="目标与计算条件" @close="targetOpen = false"><p>以下是手动输入条件，默认值不是游戏观测。请按实际目标核对等级、抗性与减防。</p><div class="candidate-form"><label>目标等级<input v-model.number="project.enemy.level" aria-label="目标等级" type="number" min="1" max="200"></label><label>减防比例<input v-model.number="project.enemy.defenseReduction" aria-label="减防比例" type="number" min="0" max="1" step="0.01"></label><label>无视防御比例<input v-model.number="project.enemy.defenseIgnore" aria-label="无视防御比例" type="number" min="0" max="1" step="0.01"></label><label v-for="element in elements" :key="element">{{ realElementLabel(element) }}抗性<input v-model.number="project.enemy.resistances[element]" :aria-label="`${realElementLabel(element)}抗性`" type="number" step="0.01"></label></div><p>比例 0.1 表示 10%。每个伤害点的暴击和反应在右侧检查面板确认。</p></WorkbenchDialog>
            <TimelineEditor />

            <div class="axis-summary">
              <dl class="axis-totals">
                <div><dt>全轴总伤害</dt><dd data-testid="workspace-total">{{ num(result.totalValue) }}</dd></div>
                <div><dt>所选目标伤害</dt><dd>{{ num(result.objectiveValue) }}</dd></div>
              </dl>
              <button class="ui-action soft" data-size="md" @click="navigate('analysis')">进入伤害分析</button>
            </div>
            <details v-if="sortedRecords.length" class="shell-record-list">
              <summary>记录列表（{{ sortedRecords.length }}）</summary>
              <div v-for="record in sortedRecords" :key="record.id" class="shell-record-row">
                <button class="ui-action soft" data-size="md" @click="selectedId = record.id">
                  <span>{{ recordLabel(project, record.id) }} / {{ record.kind === 'damage' ? '伤害' : '动作' }} / {{ record.timeMs }} 毫秒</span>
                </button>
                <button class="ui-action soft" data-accent="pyro" data-size="md"
                  :aria-label="`删除记录 ${recordLabel(project, record.id)}`" @click="removeRecord(record.id)">移除</button>
              </div>
            </details>
          </section>
        <aside class="record-inspector library-section" aria-label="所选记录详情"><template v-if="selected"><div class="inspector-title"><span class="section-eyebrow">记录详情</span><span class="subtle-tag">{{ selected.kind === 'damage' ? '伤害点' : '动作' }}</span></div><h2>{{ recordLabel(project, selected.id) }}</h2><p class="monospace muted">{{ definitionLabel(project, selected.definition) }}</p><div v-if="selected.kind === 'damage'" class="inspector-damage">{{ num(selectedResult?.value) }}<small>计算伤害</small></div><div class="inspector-fields"><label>命中时间（毫秒）<input aria-label="命中时间（毫秒）" type="number" min="0" step="1" :value="selected.timeMs" @input="updateTime"></label><label>同刻顺序<input type="number" min="0" step="1" :value="selected.order" @input="selected.order = number($event)"></label><label>归属角色<select v-model="selected.actor" aria-label="归属角色"><option v-for="owner in project.candidate.actors" :key="owner.id" :value="owner.id">{{ actorLabel(project, owner.id) }}</option></select></label><label v-if="!selected.damage">记录定义<select v-model="selected.definition" aria-label="记录定义"><option v-for="definition in project.definitions.filter(d => selected?.kind === 'action' || d.damage)" :key="definition.id" :value="definition.id">{{ definitionLabel(project, definition.id) }}</option></select></label><label v-if="selected.kind === 'damage'" class="checkbox-line"><input aria-label="计入当前目标" type="checkbox" :checked="selectedTarget" @change="updateTarget">计入当前目标</label></div><div v-if="selected.kind === 'damage' && !selected.damage" class="inspector-section"><h3>基础计算关系</h3><div class="formula-box"><span>{{ presentation.definitionLabel }} / {{ presentation.rootLabel }}</span><strong>{{ presentation.expression }}</strong></div><p class="muted">实际结果同时读取当前候选条件与区间效果，不推断暴击或反应。</p></div><div v-if="selected.damage" class="inspector-section"><h3>命中条件</h3><label>暴击口径<select v-model="selected.damage.crit" aria-label="所选真实命中暴击"><option :value="null">待确认</option><option value="noncritical">明确不暴击</option><option value="critical">明确暴击</option><option value="expected">静态暴击期望</option></select></label><label>反应<select v-model="selected.damage.reaction" aria-label="所选真实命中反应"><option :value="null">待确认</option><option value="none">明确无反应</option></select></label></div><div v-if="selectedResult?.real" class="inspector-section"><h3>真实伤害乘区</h3><div v-for="(value,key) in selectedResult.real.parts" :key="key" class="field-line"><span>{{ realPartsLabels[key] }}</span><strong>{{ num(value) }}</strong></div><p v-for="message in selectedResult.real.diagnostics" :key="message" class="muted">{{ message }}</p></div><div class="inspector-section"><h3>候选效果与来源</h3><div v-for="source in selectedResult?.formula.effects" :key="`${source.definition}/${source.effect}/${source.action}`" class="source-pill"><strong>{{ definitionLabel(project, source.definition) }} / {{ effectLabel(project, source.definition, source.effect) }}</strong></div><p v-if="!selectedResult?.formula.effects.length" class="muted">此记录没有读取候选区间效果。</p><details><summary>技术详情：查看节点来源</summary><code v-for="source in selectedResult?.sources" :key="source.path" class="source-path">{{ source.path }}</code></details></div><button class="ui-action soft" data-accent="pyro" @click="removeRecord(selected.id)">删除所选记录</button></template><p v-else class="muted">选择一条记录查看明细。</p></aside>
        </div>

        <template v-else>
          <section class="library-section analysis-summary" aria-label="伤害构成">
            <div class="library-page-toolbar">
              <h2>伤害构成</h2>
              <span v-if="result.points.length" class="library-page-status">{{ statusLabel(result.status) }}</span>
              <div class="library-page-actions">
                <button class="ui-action soft" data-size="md" @click="navigate('team')">调整候选配装</button>
              </div>
            </div>
            <dl class="axis-totals">
              <div><dt>全轴总伤害</dt><dd data-testid="workspace-total">{{ num(result.totalValue) }}</dd></div>
              <div><dt>目标伤害</dt><dd>{{ num(result.objectiveValue) }}</dd></div>
              <div><dt>伤害点</dt><dd>{{ result.points.length }}</dd></div>
            </dl>
          </section>
          <section class="library-section analysis-results" aria-label="逐点贡献">
            <div class="library-page-toolbar">
              <h2>逐点贡献</h2>
              <span v-if="result.points.length" class="library-page-status">勾选计入目标</span>
            </div>
            <ul v-if="result.points.length" class="analysis-list">
              <li v-for="point in result.points" :key="point.id" class="analysis-row" data-card-action="detail">
                <label class="analysis-target">
                  <input type="checkbox" :aria-label="`目标 ${recordLabel(project, point.id)}`"
                    :checked="!project.objective.damageIds || project.objective.damageIds.includes(point.id)"
                    @change="updateDamageSelection(point.id, $event)">
                </label>
                <button class="analysis-point card-action-trigger" :data-analysis-id="point.id"
                  :aria-label="`分析定位 ${recordLabel(project, point.id)}`" @click="openPoint(point.id)">
                  <span class="analysis-point-name">{{ recordLabel(project, point.id) }}
                    <small>{{ recordTimes.get(point.id) }} 毫秒</small>
                  </span>
                  <span class="analysis-track" aria-hidden="true">
                    <i :style="{ width: `${result.totalValue && point.value ? Math.max(0, Math.min(100, point.value / result.totalValue * 100)) : 0}%` }"></i>
                  </span>
                  <strong>{{ num(point.value) }}</strong>
                  <span aria-hidden="true">↗</span>
                </button>
              </li>
            </ul>
            <LibraryEmptyState v-else title="还没有伤害点" action="前往时间轴" @action="navigate('timeline')" />
          </section>
        </template>

        <section v-if="result.diagnostics.length" class="library-section shell-diagnostics">
          <h2>条件与诊断</h2>
          <ul aria-label="计算诊断">
            <li v-for="diagnostic in result.diagnostics" :key="`${diagnostic.code}/${diagnostic.path}/${diagnostic.message}`">
              <strong>{{ diagnosticLabel(diagnostic.code) }}</strong>
              <details><summary>技术详情</summary>{{ diagnostic.message }}<code>{{ diagnostic.code }} / {{ diagnostic.path }}</code></details>
            </li>
          </ul>
        </section>
        <details class="axis-technical">
          <summary>项目原始数据</summary>
          <pre>{{ JSON.stringify(project, null, 2) }}</pre>
        </details>
      </section>

      <AccountConfigurations ref="accountConfigurations" v-else-if="page==='loadouts' || page==='combinations'" :mode="page==='loadouts'?'characters':'artifacts'" @edit="editAccountConfiguration" />
      <AccountLibrary ref="accountLibrary" v-else-if="page==='characters' || page==='artifacts'" :page="page === 'characters' ? 'characters' : 'artifacts'" @settings="navigate('account')" />

      <section v-else-if="page==='account'" class="panel account-page"><AccountSettings /></section>
      <section v-else class="panel settings-page"><details class="theme-settings"><summary>界面配色 · 七元素三阶</summary><ThemePalette /></details><details class="settings-about"><summary>关于与支持范围</summary><img :src="geoEmblem" alt="" width="40" height="40" class="library-emblem"><span class="section-eyebrow">地脉工作台</span><h2>支持范围</h2><div class="settings-grid"><div><h3>当前支持</h3><p>普通伤害、候选配装重求值、明确/未知条件、区间效果、记录编辑与目标选择、账号管理、空轴创作、撤销重做、恢复、后台计算及文件保存重开；首批真实角色配装验算、莫娜圣遗物导入与 Enka UID 公开展柜预览导入；属性转换、来源修订、属性捕获、历史累计与计数。</p></div><div><h3>后续能力</h3><p>米游社／HoYoLAB 全账号导入、视频、概率和配装搜索。</p></div></div><button class="ui-action soft" data-accent="anemo" @click="creditsOpen = true">开源许可与鸣谢</button><p>原神游戏内容 © miHoYo / HoYoverse。</p></details></section>

      </template>
      <AccountLibrary v-if="configurationEditorOpen" ref="configurationEditor" page="characters" configuration-detail @detail-closed="configurationClosed" />
      <component :is="ReferenceDetail" v-for="layer in referenceLayers" :key="layer.id" :target="layer.target"
        @close="closeReference(layer.id)" @account-changed="invalidateReferences" />
      <WorkbenchDialog v-if="creditsOpen" title="开源许可与鸣谢" @close="creditsOpen = false"><ThirdPartyCredits /></WorkbenchDialog>
    </div>
  </div>
</template>

<style scoped>
.workspace-design { display: grid; grid-template-columns: 218px minmax(0,1fr); min-height: 100vh; color: var(--ink); font-family:var(--font-ui); background: var(--surface); font-size:var(--font-body); }
.workspace-design *, .workspace-design *::before, .workspace-design *::after { box-sizing: border-box; }
.design-sidebar { display: flex; flex-direction: column; position: fixed; width: 218px; height: 100vh; inset: 0 auto 0 0; padding: 25px 15px 16px; background: var(--neutral-canvas); border-right: 1px solid var(--neutral-line); z-index: 20; }.brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; height: 40px; }.brand-symbol { background: var(--element-anemo-deep); color: var(--neutral-raised); border-radius: 8px; width: 34px; height: 34px; display: grid; place-content: center; font-size:var(--font-title); font-weight: 500; position: relative; }.brand-symbol span { position: absolute; font-size: 27px; color:var(--muted); right: 5px; bottom: 0; }.brand-copy { display: grid; gap: 4px; white-space: nowrap; }.brand-copy strong { font-size:var(--font-body); letter-spacing: 1.5px; }.brand-copy small { color:var(--element-cryo-deep); font-size:var(--font-body); letter-spacing: .5px; }.workspace-design .collapse-button { margin-left: auto; border: 0; background: transparent; color:var(--element-cryo-deep); padding: 4px; font-size: 23px; }.account-picker { margin: 29px 3px 23px; padding: 14px 10px; border: 1px solid var(--neutral-line); border-radius: 7px; background: var(--neutral-canvas); }.context-label { color: var(--neutral-muted); font-size:var(--font-body); }.account-picker label { display: flex; align-items: center; gap: 8px; margin: 10px 0 7px; }.account-avatar { background: var(--neutral-line); color: var(--neutral-muted); width: 25px; height: 25px; flex-shrink: 0; border-radius: 50%; display: grid; place-content: center; font-size:var(--font-body); }.account-picker select { border: 0; background: transparent; padding: 4px 0; font-size:var(--font-body); font-weight: 600; }.account-picker > small { color:var(--element-cryo-deep); font-size:var(--font-body); padding-left: 33px; }.nav-groups { flex: 1; overflow-y: auto; }.nav-group { margin-bottom: 24px; }.nav-group > p { color:var(--element-cryo-deep); padding: 0 14px; font-size:var(--font-body); margin: 0 0 9px; }.nav-group > button { display: flex; align-items: center; gap: 12px; width: 100%; border: 1px solid transparent; background: transparent; color: var(--neutral-muted); padding: 11px 14px; margin: 3px 0; font-size:var(--font-body); text-align: left; }.nav-group svg { width: 17px; height: 17px; flex-shrink: 0; }.nav-group > button.active { background: var(--neutral-line); color: var(--element-anemo-deep); border-color: var(--neutral-line); font-weight: 600; }.sidebar-bottom { border-top: 1px solid var(--neutral-line); padding: 13px 6px 0; }.sidebar-bottom > button { display: flex; gap: 12px; align-items: center; width: 100%; border: 0; background: transparent; color: var(--neutral-muted); font-size:var(--font-body); }.settings-symbol { font-size: 18px; }.sidebar-version { display: flex; align-items: center; gap: 8px; color:var(--element-cryo-deep); font-size:var(--font-body); padding: 17px 12px 2px; }.sidebar-version i, .design-statusbar i { width: 5px; height: 5px; background: var(--element-dendro-primary); border-radius: 50%; display: inline-block; }
.workspace-body { grid-column: 2; min-width: 0; }.design-topbar { padding: 0 30px; height: 65px; border-bottom: 1px solid var(--line); background: var(--neutral-surface); display: flex; align-items: center; justify-content: space-between; gap: 15px; }.breadcrumb-slash { color:var(--muted); }.snapshot-tag { color: var(--neutral-muted); border: 1px solid var(--neutral-line); border-radius: 4px; font-size:var(--font-body); padding: 4px 6px; white-space: nowrap; }.preview-badge { color:var(--element-dendro-deep); font-size:var(--font-body); border: 1px solid var(--neutral-line); background: var(--neutral-canvas); border-radius: 4px; padding: 5px 7px; white-space: nowrap; }.page-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 29px 30px 25px; }.section-eyebrow { font-size:var(--font-body); color: var(--neutral-muted); letter-spacing: 1.5px; font-weight: 600; }.page-heading h1 { margin-top: 8px; }.page-heading p { margin-top: 10px; color: var(--neutral-muted); font-size:var(--font-body); line-height: 1.7; }.heading-actions { display: flex; align-items: center; gap: 13px; }.save-context { color:var(--element-cryo-deep); font-size:var(--font-body); }.subtle-tag { color:var(--element-cryo-deep); font-size:var(--font-body); border: 1px solid var(--neutral-line); border-radius: 4px; padding: 5px 7px; display: inline-block; white-space: nowrap; }.muted { color:var(--element-cryo-deep); font-size:var(--font-body); line-height: 1.85; }.text-button { color: var(--green); font-size:var(--font-body); background: transparent; border: 0; padding: 6px 0; }.workspace-design .text-button { border: 0; background: transparent; font-size:var(--font-body); color: var(--neutral-muted); }.text-button span { margin-left: 8px; }
.project-context { margin: 0 30px 20px; background: var(--neutral-surface); border: 1px solid var(--line); border-radius: 7px; display: flex; align-items: center; gap: 28px; padding: 15px 20px; }.project-identity { display: flex; gap: 10px; align-items: center; }.mini-avatar { width: 32px; height: 32px; border-radius: 7px; color: var(--neutral-muted); background: var(--element-dendro-light); display: grid; place-content: center; font-size:var(--font-body); }.project-identity div { display: grid; gap: 5px; }.project-identity strong { font-size:var(--font-body); }.project-identity small { font-size:var(--font-body); color:var(--element-cryo-deep); }.context-divider { width: 1px; height: 27px; background: var(--neutral-line); }.compact-stat { display: grid; gap: 5px; }.compact-stat > span { color:var(--element-cryo-deep); font-size:var(--font-body); }.compact-stat strong { font-size:var(--font-body); font-weight: 500; }.project-context > button { margin-left: auto; }.workspace-design .timeline-main { padding: 0; overflow: hidden; }.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 15px; }.panel-heading p { color:var(--element-cryo-deep); font-size:var(--font-body); margin-top: 8px; }.panel-heading p span { margin: 0 6px; color:var(--muted); }.timeline-main > .panel-heading { padding: 20px 23px 20px; }.timeline-toolbar { border-top: 1px solid var(--element-dendro-light); border-bottom: 1px solid var(--element-dendro-light); padding: 12px 19px; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--neutral-surface); }.timeline-tools { display: flex; align-items: center; gap: 12px; font-size:var(--font-body); color:var(--element-cryo-deep); }.timeline-tools button { padding: 7px 8px; font-size:var(--font-body); }.tracks-scroller { overflow-x: auto; }.tracks { min-width: 520px; padding-right: 35px; }.ruler, .track-row { display: grid; grid-template-columns: 113px minmax(0,1fr); }.ruler { height: 49px; align-items: end; padding-bottom: 13px; }.ruler > .track-label { font-size:var(--font-body); color:var(--element-cryo-deep); padding-left: 23px; }.ruler-marks { position: relative; height: 15px; }.ruler-marks > span { position: absolute; transform: translateX(-50%); color:var(--element-dendro-deep); font-size:var(--font-body); }.ruler-marks small { font-size:var(--font-body); color:var(--element-cryo-deep); margin-left: 1px; }.track-row { min-height: 91px; border-top: 1px solid var(--element-dendro-light); transition: opacity .15s; }.track-label { padding: 18px 10px 15px 22px; position: relative; }.track-label strong { display: block; font-size:var(--font-body); font-weight: 500; }.track-label small { color:var(--element-cryo-deep); display: block; font-size:var(--font-body); margin-top: 7px; }.track-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--element-dendro-primary); display: inline-block; flex-shrink: 0; }.track-label > .track-dot { position: absolute; left: 10px; top: 21px; }.track-dot.green { background: var(--neutral-muted); }.track-dot.gold { background: var(--element-geo-primary); }.track-dot.slate { background: var(--element-cryo-primary); }.track-dot.pale { background: var(--neutral-line); }.track-content { position: relative; min-width: 0; }.track-grid { position: absolute; inset: 0; background: repeating-linear-gradient(to right, var(--element-dendro-light) 0, var(--element-dendro-light) 1px, transparent 1px, transparent 12.5%); pointer-events: none; }.empty-track, .future-track-note { position: absolute; left: 20px; top: 37px; color:var(--muted); font-size:var(--font-body); }.damage-track { min-height: 118px; }.track-row.faded { opacity: .35; }.workspace-design .hit-marker { position: absolute; top: 21px; transform: translateX(-50%); width: 88px; height: 76px; padding: 0; border: 0; background: transparent; border-radius: 0; color:var(--element-dendro-deep); }.workspace-design .hit-marker:hover { background: transparent; border: 0; }.marker-card { border: 1px solid var(--neutral-line); background: var(--neutral-canvas); padding: 9px 10px; border-radius: 6px; display: grid; text-align: left; gap: 5px; position: relative; z-index: 2; }.marker-card small { color:var(--element-cryo-deep); font-size:var(--font-body); white-space: nowrap; }.marker-card strong { font-size: 17px; font-weight: 600; }.chosen .marker-card { background: var(--element-dendro-light); border-color: var(--element-dendro-primary); box-shadow: 0 0 0 2px color-mix(in srgb,var(--neutral-line) 25.10%,transparent); }.marker-stem { position: absolute; width: 1px; background: var(--element-cryo-primary); top: -20px; bottom: -12px; left: 50%; }.marker-diamond { position: absolute; width: 7px; height: 7px; bottom: -4px; left: calc(50% - 3px); transform: rotate(45deg); background: var(--element-dendro-primary); border: 2px solid var(--element-dendro-light); z-index: 2; }.effect-bar { position: absolute; top: 27px; left: 0; width: 62.5%; border: 1px solid var(--neutral-line); background: var(--element-geo-light); color:var(--element-geo-deep); border-radius: 0 5px 5px 0; height: 32px; display: flex; align-items: center; justify-content: space-between; padding: 0 9px; font-size:var(--font-body); white-space: nowrap; }.effect-bar small { font-size:var(--font-body); color:var(--element-geo-deep); }.future-track { min-height: 83px; background: var(--neutral-surface); }.future-track .track-label strong { color:var(--element-cryo-deep); }.future-track-note { top: 32px; }.legend-diamond { width: 5px; height: 5px; transform: rotate(45deg); background: var(--element-dendro-primary); display: inline-block; }.legend-bar { width: 12px; height: 5px; background: var(--neutral-line); border-radius: 2px; }.status-dot { display: inline-block; width: 5px; height: 5px; background: var(--element-dendro-primary); border-radius: 50%; margin-right: 5px; }
.record-inspector { padding: 22px !important; }.inspector-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 21px; }.inspector-title .section-eyebrow { font-size:var(--font-body); letter-spacing: 1.1px; }.record-inspector h2 { font-size: 17px; margin-bottom: 7px; }.record-inspector > .monospace { font-size:var(--font-body); }.inspector-damage { font-size: 33px; letter-spacing: -1px; font-weight: 600; color: var(--element-dendro-deep); margin: 27px 0; }.inspector-damage small { display: block; font-weight: 400; font-size:var(--font-body); color:var(--element-cryo-deep); letter-spacing: 0; margin-top: 8px; }.inspector-fields { border-top: 1px solid var(--element-dendro-light); padding-top: 18px; }.inspector-fields label { color:var(--element-cryo-deep); font-size:var(--font-body); }.inspector-fields input[type=number] { color: var(--neutral-muted); background: var(--neutral-surface); font-size:var(--font-body); }.field-line { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin: 17px 0; font-size:var(--font-body); }.field-line > span { color:var(--element-cryo-deep); }.field-line strong, .field-line code { color: var(--neutral-muted); font-size:var(--font-body); font-weight: 400; }.workspace-design .checkbox-line { display: flex; align-items: center; gap: 8px; padding-top: 4px; font-size:var(--font-body); }.checkbox-line input { width: 13px; height: 13px; accent-color: var(--element-dendro-primary); padding: 0; }.inspector-section { border-top: 1px solid var(--element-dendro-light); margin-top: 22px; padding-top: 20px; }.inspector-section h3 { font-size:var(--font-body); color: var(--neutral-muted); margin-bottom: 13px; }.inspector-section h3 > span { color:var(--element-cryo-deep); font-size:var(--font-body); margin-left: 7px; }.formula-box { padding: 13px 12px; border-radius: 5px; background: var(--neutral-canvas); display: grid; gap: 10px; color:var(--element-dendro-deep); }.formula-box > span { font-size:var(--font-body); }.formula-box > strong { font-family:var(--font-ui); font-size:var(--font-body); font-weight: 500; color: var(--neutral-muted); }.inspector-section > .muted { margin-top: 10px; font-size:var(--font-body); }.source-pill { display: flex; align-items: center; gap: 9px; padding: 12px 10px; background: var(--neutral-canvas); border: 1px solid var(--element-geo-light); border-radius: 5px; }.source-pill div { display: grid; gap: 5px; }.source-pill strong { font-size:var(--font-body); color:var(--element-geo-deep); font-weight: 500; }.source-pill small { font-size:var(--font-body); color:var(--element-geo-deep); }.record-inspector details { margin-top: 17px; }.record-inspector summary { color:var(--element-cryo-deep); font-size:var(--font-body); cursor: pointer; }.source-path { display: block; font-size:var(--font-body); line-height: 1.8; color:var(--element-cryo-deep); margin-top: 7px; overflow-wrap: anywhere; }
.library-layout, .team-layout { display: grid; grid-template-columns: 230px minmax(0,1fr); gap: 20px; margin: 0 30px; align-items: start; }.workspace-design .roster { padding: 20px 14px; }.roster > .panel-heading { padding: 0 6px; }.library-note { margin: 16px 6px 20px !important; color:var(--element-cryo-deep); font-size:var(--font-body); }.workspace-design .roster-item { display: flex; align-items: center; gap: 10px; width: 100%; margin: 7px 0; padding: 12px 10px; border-color: transparent; background: transparent; text-align: left; }.workspace-design .roster-item.selected { background: var(--element-dendro-light); border-color: var(--neutral-line); }.role-avatar { height: 34px; width: 34px; background: var(--element-dendro-light); color:var(--element-dendro-deep); display: grid; place-content: center; border-radius: 7px; }.roster-item > span:nth-child(2) { display: grid; gap: 7px; }.roster-item strong { font-size:var(--font-body); font-weight: 500; }.roster-item small { font-size:var(--font-body); color:var(--element-cryo-deep); }.chevron { margin-left: auto; color:var(--element-cryo-deep); font-size: 18px; }.role-hero { display: flex; gap: 18px; align-items: center; margin: 8px 0 27px; }.large-avatar { width: 64px; height: 64px; border-radius: 12px; background: linear-gradient(135deg,var(--element-dendro-light),var(--neutral-line)); display: grid; place-content: center; color:var(--element-dendro-deep); font-size: 25px; flex-shrink: 0; }.role-hero h2 { margin: 8px 0; font-size: 21px; }.role-hero p { color:var(--element-cryo-deep); font-size:var(--font-body); }.role-hero > .subtle-tag { margin-left: auto; }.detail-tabs { display: flex; gap: 25px; border-bottom: 1px solid var(--element-dendro-light); margin-bottom: 22px; color:var(--element-cryo-deep); font-size:var(--font-body); }.detail-tabs > span { padding: 0 0 13px; }.detail-tabs > .active { color: var(--neutral-muted); border-bottom: 2px solid var(--element-dendro-primary); }.design-callout { padding: 17px 20px; border: 1px solid var(--neutral-line); background: var(--neutral-canvas); border-radius: 6px; color:var(--element-cryo-deep); margin-top: 20px; }.design-callout strong { font-size:var(--font-body); font-weight: 500; color:var(--element-dendro-deep); }.design-callout p { font-size:var(--font-body); line-height: 1.9; margin-top: 8px; }.equipment-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 28px 0 18px; }.equipment-heading small { font-size:var(--font-body); color:var(--element-cryo-deep); }.equipment-slots { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 10px; }.equipment-slots > div { border: 1px solid var(--element-dendro-light); border-radius: 6px; padding: 19px 7px; text-align: center; display: grid; gap: 10px; }.equipment-slots > div > span { font-size: 29px; color:var(--element-cryo-deep); }.equipment-slots strong { font-size:var(--font-body); font-weight: 500; }.equipment-slots small { color:var(--element-cryo-deep); font-size:var(--font-body); }.independent-note { display: flex; gap: 12px; color:var(--element-cryo-deep); font-size:var(--font-body); line-height: 1.9; padding: 25px 0 3px; }.independent-note > span { font-size: 21px; color:var(--muted); }
.workspace-design .artifact-library, .workspace-design .settings-page { margin: 0 30px; }.inventory-toolbar { display: flex; align-items: end; gap: 20px; padding: 20px 0; border-bottom: 1px solid var(--element-dendro-light); margin-bottom: 23px; }.inventory-toolbar label { font-size:var(--font-body); color:var(--element-cryo-deep); width: 150px; }.inventory-toolbar select { font-size:var(--font-body); }.inventory-summary { font-size:var(--font-body); color:var(--element-cryo-deep); padding-bottom: 10px; }.inventory-summary span { margin: 0 7px; }.inventory-toolbar > button { margin-left: auto; }.artifact-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 15px; }.artifact-card { border: 1px solid var(--element-dendro-light); border-radius: 7px; padding: 15px; }.artifact-top { display: flex; align-items: center; justify-content: space-between; font-size:var(--font-body); color:var(--element-cryo-deep); gap: 5px; }.artifact-top small { font-size:var(--font-body); color:var(--muted); }.artifact-art { height: 106px; display: grid; place-content: center; color:var(--element-geo-deep); font-size: 63px; background: radial-gradient(ellipse,var(--element-dendro-light),transparent 70%); }.artifact-card h3 { font-size:var(--font-body); color: var(--neutral-muted); }.artifact-card > p { font-size:var(--font-body); color:var(--element-cryo-deep); margin-top: 10px; }.artifact-lines { display: grid; gap: 8px; padding: 18px 0; }.artifact-lines > span { height: 5px; width: 78%; background: var(--element-dendro-light); border-radius: 4px; }.artifact-lines > span:nth-child(2) { width: 57%; }.artifact-lines > span:nth-child(3) { width: 67%; }.artifact-card footer { padding-top: 14px; border-top: 1px solid var(--element-dendro-light); display: grid; gap: 7px; font-size:var(--font-body); color:var(--element-cryo-deep); }.artifact-card footer code { font-size:var(--font-body); color:var(--muted); }.library-heading { display: flex; align-items: center; justify-content: space-between; margin: 5px 0 20px; }
.team-layout { grid-template-columns: minmax(0,1fr) 285px; }.team-role-card { display: flex; gap: 15px; align-items: center; margin: 26px 0; padding-bottom: 25px; border-bottom: 1px solid var(--element-dendro-light); }.team-role-card p { color:var(--element-cryo-deep); font-size:var(--font-body); margin-top: 8px; }.team-role-card > .snapshot-tag { margin-left: auto; }.candidate-form { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 20px; }.candidate-form label { font-size:var(--font-body); color:var(--element-dendro-deep); }.candidate-form input, .candidate-form select { font-size:var(--font-body); padding: 11px 12px; background: var(--neutral-surface); }.actual-calculation { margin-top: 28px; }.team-result h2 { margin-top: 12px; }.team-result > button { width: 100%; margin: 15px 0; }.team-result > .muted { font-size:var(--font-body); }.settings-page > h2 { font-size: 21px; margin: 18px 0; }.settings-page > p { font-size:var(--font-body); color:var(--element-cryo-deep); line-height: 2; max-width: 650px; }.settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 25px; margin: 30px 0; }.settings-grid > div { background: var(--neutral-canvas); border: 1px solid var(--element-dendro-light); padding: 20px; border-radius: 7px; }.settings-grid h3 { margin-bottom: 13px; color:var(--element-dendro-deep); }.settings-grid p { font-size:var(--font-body); color:var(--element-cryo-deep); line-height: 2; }.existing-link { font-size:var(--font-body); }
.design-statusbar { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 28px 30px 20px; color:var(--element-cryo-deep); font-size:var(--font-body); }.design-statusbar > span:first-child { display: flex; gap: 7px; align-items: center; }.statusbar-separator { margin: 0 8px; color:var(--muted); }.mobile-menu, .drawer-shade { display: none; }.workspace-design.compact { grid-template-columns: 76px minmax(0,1fr); }.compact .design-sidebar { width: 76px; padding-inline: 10px; }.compact .brand { padding: 0; gap: 2px; }.compact .brand-symbol { width: 32px; flex-shrink: 0; }.compact .brand-copy, .compact .account-picker, .compact .nav-group > p, .compact .nav-group > button > span, .compact .sidebar-version, .compact .sidebar-bottom > button > span:last-child { display: none; }.compact .brand .collapse-button { margin-left: 0; padding-left: 3px; }.compact .nav-groups { margin-top: 35px; }.compact .nav-group > button { justify-content: center; padding: 13px 8px; }.compact .sidebar-bottom { padding-inline: 0; }.compact .sidebar-bottom > button { justify-content: center; }
@media (min-width: 1550px) {.track-row { min-height: 108px; }.damage-track { min-height: 142px; }.future-track { min-height: 98px; }.hit-marker { top: 30px !important; }.effect-bar { top: 35px; }.empty-track { top: 46px; }.future-track-note { top: 42px; } }
@media (max-width: 1250px) { .workspace-design { grid-template-columns: 195px minmax(0,1fr); }.design-sidebar { width: 195px; padding-inline: 11px; }.brand-copy strong { font-size:var(--font-body); }.brand-copy small { font-size:var(--font-body); }.design-topbar { padding-inline: 22px; }.page-heading { padding-inline: 22px; }.project-context, .library-layout, .team-layout, .workspace-design .artifact-library, .workspace-design .settings-page { margin-inline: 22px; }.project-context { gap: 19px; }.project-context .compact-stat:last-of-type { display: none; }.heading-actions { display: grid; gap: 7px; justify-items: end; }.save-context { font-size:var(--font-body); }.timeline-tools > span { display: none; }.artifact-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }.equipment-slots { grid-template-columns: repeat(3,minmax(0,1fr)); }.library-layout { grid-template-columns: 200px minmax(0,1fr); }.design-statusbar { padding-inline: 22px; }.design-statusbar > span:last-child { display: none; } }
@media (max-width: 1020px) { .team-layout { grid-template-columns: minmax(0,1fr); }.record-inspector { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 25px; }.record-inspector > .inspector-title { grid-column: 1/-1; margin-bottom: 17px; }.record-inspector > h2 { grid-column: 1; }.record-inspector > .monospace { grid-column: 1; }.record-inspector > .inspector-damage { grid-column: 1; margin: 20px 0; }.record-inspector > .inspector-fields { grid-column: 2; grid-row: 2/5; padding-top: 0; border: 0; }.record-inspector > .inspector-section { grid-column: auto; margin-top: 13px; }.team-result .inspector-damage { margin: 20px 0; }.team-result > .primary { max-width: 200px; }.project-context { gap: 17px; }.project-context .compact-stat:nth-last-of-type(2) { display: none; }.library-layout { grid-template-columns: minmax(0,1fr); }.roster { display: none; }.page-heading { align-items: start; }.heading-actions .save-context { display: none; } }
@media (max-width: 700px) { .workspace-design, .workspace-design.compact { grid-template-columns: minmax(0,1fr); }.workspace-body { grid-column: 1; }.design-sidebar, .compact .design-sidebar { transform: translateX(-100%); width: 218px; padding-inline: 15px; transition: transform .18s; }.mobile-open .design-sidebar { transform: translateX(0); }.mobile-open .drawer-shade { display: block; position: fixed; inset: 0; background: color-mix(in srgb,var(--neutral-ink) 27.06%,transparent); z-index: 19; border: 0; border-radius: 0; }.workspace-design .mobile-menu { display: block; border: 0; background: transparent; padding: 5px 4px 5px 0; font-size: 17px; color: var(--neutral-muted); }.compact .brand-copy { display: grid; }.compact .brand .collapse-button { margin-left: auto; }.compact .account-picker { display: block; }.compact .nav-group > p, .compact .nav-group > button > span, .compact .sidebar-version, .compact .sidebar-bottom > button > span:last-child { display: initial; }.compact .nav-group > button { justify-content: start; padding: 11px 14px; }.compact .nav-groups { margin-top: 0; }.design-topbar { height: 59px; padding-inline: 16px; gap: 5px; }.snapshot-tag { display: none; }.preview-badge { font-size:var(--font-body); padding: 4px 5px; }.page-heading { padding: 20px 17px 20px; gap: 10px; }.page-heading h1 { font-size: 23px; }.page-heading p { font-size:var(--font-body); max-width: 235px; }.section-eyebrow { font-size:var(--font-body); }.heading-actions .primary { font-size:var(--font-body); padding: 9px; white-space: nowrap; }.heading-actions .primary > span { display: none; }.project-context, .library-layout, .team-layout, .workspace-design .artifact-library, .workspace-design .settings-page { margin-inline: 15px; }.project-context { padding: 13px 14px; gap: 12px; flex-wrap: wrap; }.project-identity strong { font-size:var(--font-body); }.project-identity small { font-size:var(--font-body); }.project-context .context-divider { display: none; }.project-context > .compact-stat { margin-left: auto; }.project-context > .text-button { width: 100%; text-align: left; font-size:var(--font-body); margin: 0 0 -3px 42px; }.project-context > .compact-stat > strong { max-width: 130px; font-size:var(--font-body); }.panel-heading { gap: 10px; align-items: start; }.timeline-main > .panel-heading { padding: 19px 16px; }.timeline-main .panel-heading > .subtle-tag { display: none; }.timeline-toolbar { padding: 11px 12px; }.timeline-tools button { font-size:var(--font-body); padding: 7px; }.record-inspector { display: block; }.record-inspector > .inspector-fields { padding-top: 18px; border-top: 1px solid var(--element-dendro-light); }.record-inspector > .inspector-section { margin-top: 22px; }.workspace-design .panel { padding: 18px; }.workspace-design .timeline-main { padding: 0; }.artifact-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }.artifact-card { padding: 12px; }.inventory-toolbar { gap: 12px; flex-wrap: wrap; }.inventory-summary { display: none; }.inventory-toolbar label { width: 130px; }.artifact-library > .panel-heading { display: grid; }.artifact-library > .panel-heading > .subtle-tag { justify-self: start; }.artifact-art { height: 85px; }.candidate-form { grid-template-columns: minmax(0,1fr); }.team-role-card .large-avatar { width: 45px; height: 45px; font-size:var(--font-dialog); }.team-role-card p { font-size:var(--font-body); }.role-hero { gap: 13px; }.role-hero > .subtle-tag { display: none; }.role-hero h2 { font-size: 18px; }.role-hero p { font-size:var(--font-body); line-height: 1.8; }.large-avatar { width: 49px; height: 49px; }.equipment-heading { display: grid; }.settings-grid { grid-template-columns: minmax(0,1fr); }.design-statusbar { padding: 20px 17px; font-size:var(--font-body); } }
</style>
<style scoped src="../styles/workspace-fantasy.css"></style>

<style scoped src="../styles/sidebar.css"></style>

<style scoped src="../styles/workspace-layout.css"></style>
