<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue';
import { realBuildSchema } from '@leyline/schema';
import { useAccountStore } from './stores/account';
import { useAxisWorkspaceStore } from './stores/axis-workspace';
import { useSavedTeamsStore, type SavedTeam } from './stores/saved-teams';
import { addRealActor } from './domain/real-project';
import { removeProjectActor } from './domain/workbench-project';
import CharacterEquipmentIcons from './components/CharacterEquipmentIcons.vue';
import WorkbenchDialog from './components/WorkbenchDialog.vue';
const TeamLoadoutEditor = defineAsyncComponent(() => import('./TeamLoadoutEditor.vue'));
const emit = defineEmits<{ timeline: []; account: [] }>();
const accounts = useAccountStore();
const axis = useAxisWorkspaceStore();
const saved = useSavedTeamsStore();
const picking = ref(false);
const adding = ref(false);
const editing = ref(false);
const name = ref('');
const message = ref('');
const error = ref('');
const pendingTeam = ref<SavedTeam>();
const characters = computed(() => accounts.account.characters);
async function add(id: string) {
  if (adding.value) return;
  error.value = '';
  const account = accounts.account, project = axis.project;
  const character = account.characters.find(entry => entry.id === id);
  if (!character?.realBuild) { error.value = '该角色尚未设置真实角色与武器，请先在账号角色页补全资料。'; return; }
  try {
    adding.value = true;
    if (character.showcase && !Object.values(character.equipment).length && character.showcase.build.artifacts.length) throw new Error('该角色目前仅有展柜快照，请先在账号页匹配本地库存配装。');
    if (project.candidate.actors.length >= 4) throw new Error('队伍已有四位角色，请先移除需要替换的队员。');
    if (project.candidate.actors.some(actor => actor.realBuild?.character.id === character.realBuild!.character.id)) throw new Error('队伍已经有这位角色。');
    const artifacts = Object.values(character.equipment).map(itemId => {
      const item = account.artifacts.find(entry => entry.id === itemId);
      if (!item?.real) throw new Error('实际装备存在未补全词条的物品，请先处理。');
      if (item.mona?.setIdentityPending) throw new Error('实际装备存在套装身份待核对的物品，不能进入计算。');
      if (project.candidate.actors.some(actor => actor.realBuild?.artifacts.some(piece => piece.id === item.id && (piece.inventoryAccountId ?? actor.realBuild?.inventoryAccountId) === account.id))) throw new Error('队伍已占用这件实物，请先调整试配装备。');
      return { ...item.real, inventoryAccountId: account.id };
    });
    const data = await import('@leyline/game-data/real');
    const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => data.getRealSet(id)));
    if (axis.project !== project || accounts.account !== account) throw new Error('账号或轴已切换，请重新选择。');
    const build = realBuildSchema.parse({ ...character.realBuild, artifacts, sets, inventoryAccountId: account.id });
    axis.command(draft => { axis.actorId = addRealActor(draft, build, character.name); });
    picking.value = false;
    message.value = '已复制账号配装到当前队伍，后续试配独立保存。';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '添加失败。'; }
  finally { adding.value = false; }
}
function save() {
  try { saved.save(name.value, axis.project); message.value = `已保存队伍「${name.value}」，可用于新建多条轴。`; error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '队伍保存失败。'; }
}
function newAxis(team: SavedTeam) {
  const next = structuredClone(JSON.parse(JSON.stringify(team.project)));
  next.id = crypto.randomUUID();
  next.name = `${team.name} · 新轴`;
  next.candidate.id = `${next.id}-candidate`;
  axis.replaceProject(next);
  axis.notice = `已从「${team.name}」新建独立轴；请另存轴文件。`;
  name.value = team.name;
  pendingTeam.value = undefined;
  emit('timeline');
}
function remove(id: string) { axis.command(draft => removeProjectActor(draft, id)); }
</script>
<template>
  <section class="team-workspace panel">
    <header><span class="team-count">当前队伍 · {{ axis.project.candidate.actors.length }} / 4</span><button class="primary" @click="picking = true">＋ 从账号选择队员</button></header>
    <p v-if="message" role="status">{{ message }}</p><p v-if="error || saved.error" role="alert">{{ error || saved.error }}</p>
    <div class="team-cards"><article v-for="actor in axis.project.candidate.actors" :key="actor.id" :class="{ active: axis.actorId === actor.id }"><button class="actor-select" @click="axis.actorId = actor.id"><CharacterEquipmentIcons :build="actor.realBuild" :name="actor.name" :size="88" /><strong>{{ actor.name ?? actor.realBuild?.character.name }}</strong><small>{{ actor.realBuild?.weapon.name ?? '旧版配装' }}</small><small>{{ actor.realBuild?.artifacts.length ?? 0 }} 件试配圣遗物</small></button><button @click="axis.actorId = actor.id; editing = true">查看与修改配装</button><details><summary>移除队员</summary><p>移除该队员及其轴内记录，可撤销。</p><button @click="remove(actor.id)">确认移除</button></details></article><button v-if="axis.project.candidate.actors.length < 4" class="empty-slot" @click="picking = true">＋<br>选择队员</button></div>
    <div class="team-save"><label>队伍名称<input v-model="name" aria-label="保存队伍名称" maxlength="160" placeholder="为这套队伍与试配命名"></label><button @click="save">保存为新队伍</button><button class="primary" :disabled="!axis.project.candidate.actors.length" @click="emit('timeline')">进入当前轴 →</button></div>
    <h3>已保存的队伍</h3><p v-if="!saved.teams.length">保存后可以从同一队伍创建不同的轴。已有轴始终保留自己的配装快照。</p>
    <div class="saved-teams"><article v-for="team in saved.teams" :key="team.id"><h4>{{ team.name }}</h4><p>{{ team.project.candidate.actors.map(actor => actor.name ?? actor.realBuild?.character.name).join(' / ') }}</p><button @click="pendingTeam = team">以此队伍新建轴</button></article></div><button v-if="saved.teams.length" @click="saved.exportTeams">导出队伍备份</button>
    <WorkbenchDialog v-if="picking" title="从账号选择队员" @close="picking = false"><p>只复制当前资料，之后的试配与账号独立。</p><p v-if="error" role="alert">{{ error }}</p><div class="saved-teams"><button v-for="character in characters" :key="character.id" @click="add(character.id)"><CharacterEquipmentIcons :build="character.realBuild" :name="character.name" :size="80" /><strong>{{ character.name }}</strong><p>{{ character.realBuild?.weapon.name ?? '资料待补全' }}</p></button></div><p v-if="!characters.length">账号还没有角色资料。</p><button @click="picking = false; emit('account')">前往账号角色页</button></WorkbenchDialog>
    <WorkbenchDialog v-if="editing" title="修改所选队员配装" @close="editing = false"><TeamLoadoutEditor /></WorkbenchDialog>
    <WorkbenchDialog v-if="pendingTeam" title="从保存队伍新建轴" @close="pendingTeam = undefined"><p>当前轴不会合并到新轴。请先保存当前编辑；新轴使用「{{ pendingTeam.name }}」的队伍快照。</p><button @click="axis.saveProject()">先保存当前轴</button><button @click="newAxis(pendingTeam)">确认新建独立轴</button></WorkbenchDialog>
  </section>
</template>
<style scoped>
.team-workspace { margin:0 30px; } header { display:flex; justify-content:space-between; align-items:center; gap:20px; } .team-count { font-size:14px; font-weight:600; } p { font-size:13px; line-height:1.8; } .team-cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin:24px 0; }.team-cards article { padding:16px; background:var(--surface); border:1px solid #d6ccb1; border-radius:12px; }.team-cards .active { border-color:#47645d; }.actor-select { display:grid; gap:12px; width:100%; border:0; text-align:left; background:transparent; }.actor-select small { font-size:12px; }.empty-slot { min-height:200px; border:1px dashed #b4ad95; background:transparent; line-height:2.5; }.team-save { display:flex; gap:12px; flex-wrap:wrap; align-items:end; margin:24px 0; } label { display:grid; gap:8px; font-size:13px; } .saved-teams { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; margin:20px 0; }.saved-teams article,.saved-teams > button { padding:16px; border:1px solid #d6ccb1; border-radius:8px; text-align:left; background:var(--surface); } details { font-size:12px; margin-top:16px; }
@media(max-width:1000px) { .team-cards { grid-template-columns:repeat(2,minmax(0,1fr)); } } @media(max-width:600px) { .team-workspace { margin:0 15px; } header { display:block; } }
.actor-select { color:var(--ink); padding:0 0 16px; }.actor-select > .character-equipment-icons { margin-inline:auto; }.team-cards article { background:linear-gradient(160deg,var(--surface),#f2f4eb); border-color:#dce3d4; box-shadow:0 4px 18px #304d3708; }.team-cards .active { box-shadow:0 0 0 2px #8ca88a33; border-color:var(--element-anemo-primary); }.empty-slot { color:#65816c; border-color:#b8cbb7; border-radius:12px; background:var(--element-anemo-light); }.saved-teams > button { color:var(--ink); display:grid; gap:10px; }.saved-teams > button .character-equipment-icons { margin:auto; }.team-workspace { margin-inline:0; }
</style>
