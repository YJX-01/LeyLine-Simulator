<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue';
import type { Build } from '@leyline/schema';
import { useAccountStore } from '../stores/account';
import { useAxisWorkspaceStore } from '../stores/axis-workspace';
import { useSavedTeamsStore, type SavedTeam } from '../stores/saved-teams';
import { addActorFromBuild } from '../domain/real-project';
import { removeProjectActor } from '../domain/workbench-project';
import { prepareTeamMember } from '../domain/team-members';
import CharacterEquipmentIcons from '../components/CharacterEquipmentIcons.vue';
import LibraryCornerOrnaments from '../components/LibraryCornerOrnaments.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import WorkbenchDialog from '../components/WorkbenchDialog.vue';
import EditorActions from '../components/EditorActions.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
const teamEditor=ref<InstanceType<typeof import('./TeamLoadoutEditor.vue')['default']>>();
function requestLeave(action:()=>void) { if(teamEditor.value)teamEditor.value.requestLeave(action);else action(); }
defineExpose({requestLeave});
const pendingRemoval=ref<string>();
const TeamLoadoutEditor = defineAsyncComponent(() => import('./TeamLoadoutEditor.vue'));
const emit = defineEmits<{ timeline: []; account: [] }>();
const accounts = useAccountStore();
const axis = useAxisWorkspaceStore();
const saved = useSavedTeamsStore();
const picking = ref(false);
const adding = ref(false);
const editing = ref(false);
const name = ref('');
const error = ref('');
const pendingTeam = ref<SavedTeam>();
const characters = computed(() => accounts.account.characters);
async function add(id: string) {
  if (adding.value) return;
  error.value = '';
  const account = accounts.account, project = axis.project;
  try {
    adding.value = true;
    const member = await prepareTeamMember(project, account, id);
    if (axis.project !== project || accounts.account !== account) throw new Error('账号或轴已切换，请重新选择。');
    axis.command(draft => { axis.actorId = addActorFromBuild(draft, member.build, member.name); });
    picking.value = false;

  } catch (cause) { error.value = cause instanceof Error ? cause.message : '添加失败。'; }
  finally { adding.value = false; }
}
function save() {
  try { saved.save(name.value, axis.project);  error.value = ''; }
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
function applyBuild(id: string, build: Build) {
  axis.command(project => {
    const actor = project.candidate.actors.find(entry => entry.id === id);
    if (actor) actor.build = build;
  });
}
</script>
<template>
  <section class="team-workspace panel library-page" aria-label="队伍">
    <LibraryCornerOrnaments />
    <header class="library-page-toolbar">
      <h2>当前队伍 <span class="team-count">{{ axis.project.candidate.actors.length }} / 4</span></h2>
      <div class="library-page-actions">
        <button class="ui-action soft" :disabled="!axis.canUndo" @click="axis.undo()">撤销</button>
        <button class="ui-action soft" :disabled="!axis.canRedo" @click="axis.redo()">重做</button>
        <button class="ui-action" :disabled="axis.project.candidate.actors.length >= 4" @click="picking = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>从账号选择队员
        </button>
      </div>
    </header>
    <p v-if="error || saved.error" role="alert">{{ error || saved.error }}</p>
    <div v-if="axis.project.candidate.actors.length" class="team-cards">
      <article v-for="actor in axis.project.candidate.actors" :key="actor.id"
        class="library-section team-member" :class="{ active: axis.actorId === actor.id }">
        <button class="actor-select" :aria-pressed="axis.actorId === actor.id" @click="axis.actorId = actor.id">
          <strong>{{ actor.name ?? actor.build?.character.identity.name }}</strong>
          <CharacterEquipmentIcons :build="actor.build" :name="actor.name" :size="72" />
          <small>{{ actor.build?.weapon.name ?? '配装资料待补全' }}</small>
          <small>{{ actor.build?.artifacts.length ?? 0 }} 件试配圣遗物</small>
        </button>
        <div class="library-page-actions">
          <button class="ui-action soft" data-size="md" @click="axis.actorId = actor.id; editing = true">查看与修改配装</button>
          <button class="ui-action soft" data-accent="pyro" data-size="md" @click="pendingRemoval = actor.id">移除队员</button>
        </div>
      </article>
    </div>
    <p v-else class="team-empty">还没有队员</p>

    <div class="team-save">
      <label>队伍名称<input v-model="name" name="team-name" autocomplete="off" aria-label="保存队伍名称" maxlength="160" placeholder="输入队伍名称"></label>
      <div class="library-page-actions">
        <button class="ui-action" @click="save">保存为新队伍</button>
        <button class="ui-action soft" :disabled="!axis.project.candidate.actors.length" @click="emit('timeline')">进入时间轴</button>
      </div>
    </div>

    <section class="team-saved" aria-labelledby="saved-teams-heading">
      <header class="library-page-toolbar">
        <h2 id="saved-teams-heading">已保存的队伍</h2>
      </header>
      <div v-if="saved.teams.length" class="saved-teams">
        <article v-for="team in saved.teams" :key="team.id" class="library-section saved-team">
          <div>
            <h3>{{ team.name }}</h3>
            <p>{{ team.project.candidate.actors.map(actor => actor.name ?? actor.build?.character.identity.name).join(' / ') }}</p>
          </div>
          <button class="ui-action soft" data-size="md" @click="pendingTeam = team">以此队伍新建轴</button>
        </article>
      </div>
      <p v-else class="library-page-status">还没有保存的队伍</p>
    </section>

    <WorkbenchDialog v-if="picking" title="从账号选择队员" @close="picking = false">
      <p v-if="error" role="alert">{{ error }}</p>
      <div v-if="characters.length" class="team-cards team-picker">
        <button v-for="character in characters" :key="character.id" type="button" :disabled="adding" @click="add(character.id)">
          <strong>{{ character.name }}</strong>
          <CharacterEquipmentIcons :build="character.build" :name="character.name" :size="72" />
          <small>{{ character.build?.weapon.name ?? '资料待补全' }}</small>
        </button>
      </div>
      <LibraryEmptyState v-else title="账号还没有角色资料" action="前往角色库" @action="picking = false; emit('account')" />
      <template v-if="characters.length" #footer>
        <button class="ui-action soft" @click="picking = false; emit('account')">前往角色库</button>
      </template>
    </WorkbenchDialog>
    <WorkbenchDialog v-if="editing" editor title="修改所选队员配装" @close="requestLeave(() => editing = false)">
      <template #header-leading>
        <EditorActions :dirty="!!teamEditor?.dirty" :busy="teamEditor?.busy" @save="teamEditor?.save()" @restore="teamEditor?.restore()" />
      </template>
      <TeamLoadoutEditor ref="teamEditor" :project="axis.project" :actor-id="axis.actorId" :apply-build="applyBuild" axis-context />
    </WorkbenchDialog>
    <ConfirmationDialog v-if="pendingRemoval" title="移除队员？" confirm-label="确认移除"
      @cancel="pendingRemoval = undefined" @confirm="remove(pendingRemoval); pendingRemoval = undefined">
      <p>移除该队员及其轴内记录，可撤销。</p>
    </ConfirmationDialog>
    <ConfirmationDialog v-if="pendingTeam" title="从保存队伍新建轴" :danger="false" confirm-label="确认新建独立轴"
      @cancel="pendingTeam = undefined" @confirm="newAxis(pendingTeam)">
      <p>使用「{{ pendingTeam.name }}」新建独立轴。当前编辑请先保存。</p>
      <button class="ui-action soft" @click="axis.saveProject()">先保存当前轴</button>
    </ConfirmationDialog>
  </section>
</template>

<style scoped>
.team-workspace,.team-saved,.saved-teams { display:grid; gap:12px; }
.team-workspace h2 { font-size:var(--font-control); }
.team-count { margin-inline-start:8px; color:var(--muted); font-size:var(--font-body); font-variant-numeric:tabular-nums; }
.team-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,208px),1fr)); gap:12px; }
.team-workspace .team-member { display:grid; align-content:start; gap:12px; border-top-width:3px; }
.team-workspace .team-member.active { border-top-color:var(--element-anemo-primary); }
.actor-select,.team-picker > button {
  display:grid; justify-items:start; gap:6px; min-width:0; text-align:left; overflow-wrap:anywhere;
}
.team-member > .actor-select { padding:0; border:0; background:transparent; }
.actor-select > strong,.team-picker strong { font-size:var(--font-control); }
.actor-select > small,.team-picker small,.saved-team p { color:var(--muted); }
.team-empty { padding:24px 12px; border:1px solid var(--line); border-radius:10px; color:var(--muted); text-align:center; }
.team-save {
  display:flex; flex-wrap:wrap; align-items:end; gap:10px; padding:12px 0;
  border-block:1px solid var(--line);
}
.team-save > label { flex:1 1 200px; max-width:320px; }
.team-save > .library-page-actions { margin-inline-start:auto; }
.team-saved .saved-team { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 12px; }
.saved-team > div { min-width:0; overflow-wrap:anywhere; }
.team-picker > button { padding:12px; border-radius:10px; }
</style>
