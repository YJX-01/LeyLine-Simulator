import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { resolveLoadout } from '@leyline/engine';
import { teamSchema, type TeamInput, type TeamSimulationResult } from '@leyline/schema';
import { TeamTask } from '../domain/team-task';
import { canonical, capacity } from '../domain/editor';
export interface RunSnapshot { input: TeamInput; result: TeamSimulationResult }
export function useTeamSimulation(source: Ref<string>, signature: Ref<string>) {
  const snapshot = shallowRef<RunSnapshot>();
  const busy = ref(false), error = ref('');
  let submitted: TeamInput;
  const task = new TeamTask(() => new Worker(new URL('../attack.worker.ts', import.meta.url), { type: 'module' }), {
    busy: value => { busy.value = value; }, error: message => { error.value = message; },
    result: result => { snapshot.value = { input: submitted, result }; },
  });
  const stale = computed(() => !!snapshot.value && canonical(snapshot.value.input) !== signature.value);
  watch(source, () => { task.cancel(); error.value = ''; }, { flush: 'sync' });
  function run() {
    task.cancel(); error.value = '';
    try {
      const input = teamSchema.parse(JSON.parse(source.value));
      for (const actor of input.actors) {
        resolveLoadout(actor);
        if (actor.initialEnergy > capacity[actor.character]) throw new Error('初始能量超过角色上限。');
      }
      for (const command of input.commands) if (command.type === 'cast') {
        const actor = input.actors.find(actor => actor.id === command.actorId)!;
        if (command.action === 'N6' && actor.character !== 'hutao') throw new Error('仅胡桃支持第六段普攻。');
        if (command.holdMs && (actor.character !== 'jean' || command.action !== 'E')) throw new Error('长按只适用于琴的元素战技。');
        if (actor.character === 'albedo' && command.action === 'Q' && input.enemy.fatalBlossomHits === undefined) throw new Error('请填写阿贝多生灭之花命中数（0—7）。');
      }
      submitted = input; task.run(input);
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '配置无法解析。'; }
  }
  function cancel() { task.cancel(); error.value = '已取消，可重新运行。'; }
  onBeforeUnmount(() => task.cancel());
  return { snapshot, busy, error, stale, run, cancel };
}
